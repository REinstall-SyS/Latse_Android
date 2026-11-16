import { useScreenWakeLock } from "./useScreenWakeLock";
import { shouldWarnGPSGap } from "@/domain/geospatial";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  HikeTrack,
  SpatialPin,
  TrackPoint,
  TrailPhoto,
} from "@/types/trek.types";
import {
  watchPosition,
  requestLocationPermission,
} from "@/services/location.service";
import { shouldAcceptGPSFix } from "@/domain/geospatial";
import { positionTrailPhoto } from "@/services/mobile-media.service";
import { parseGPX } from "@/domain/gpx-engine";
import {
  loadMediaDocument,
  persistMediaDocument,
  removeMediaDocument,
} from "@/services/hike-persistence.service";
import {
  isStoredPoint,
  isStoredPin,
  isStoredPhoto,
} from "@/services/track-validation";
import {
  calculatePaceMinPerKm,
  calculateVerticalRate,
} from "@/domain/altitude-physics";

const KEY = "latse_recording_draft_v1";
interface Draft {
  points: TrackPoint[];
  pins: SpatialPin[];
  elapsed: number;
  name: string;
  startMs?: number;
  unplacedPhotos?: TrailPhoto[];
}
const emptyDraft = (): Draft => ({
  points: [],
  pins: [],
  elapsed: 0,
  name: "My field log",
});

function restoreDraft(value: unknown): Draft {
  try {
    const saved = value as Draft | null;
    if (
      saved &&
      Array.isArray(saved.points) &&
      saved.points.every(isStoredPoint) &&
      saved.points.every(
        (point: TrackPoint) =>
          Number.isFinite(point.time) &&
          Math.abs(point.time!) < 8640000000000000,
      ) &&
      Array.isArray(saved.pins) &&
      saved.pins.every(isStoredPin) &&
      (saved.unplacedPhotos === undefined ||
        (Array.isArray(saved.unplacedPhotos) &&
          saved.unplacedPhotos.every(isStoredPhoto))) &&
      Number.isFinite(saved.elapsed) &&
      saved.elapsed >= 0 &&
      typeof saved.name === "string"
    ) {
      return {
        ...saved,
        startMs: Number.isFinite(saved.startMs)
          ? saved.startMs
          : saved.points[0]?.time,
      };
    }
  } catch {
    /* Start a fresh draft when storage is unavailable. */
  }
  return emptyDraft();
}

export function useHikeRecorder() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const restored = useRef<Promise<Draft>>();
  const persistence = useRef<Promise<unknown>>(Promise.resolve());
  const generation = useRef(0);
  const clearing = useRef(false);
  const latest = useRef(draft);
  const [running, setRunningState] = useState(false);
  const wakeLockStatus = useScreenWakeLock(running);
  const [gapNotice, setGapNotice] = useState("");
  const resumedFromPauseRef = useRef(false);
  const active = useRef(false);
  const clock = useRef({ elapsed: draft.elapsed, resumedAt: 0 });
  const [error, setError] = useState("");

  // performance.now is monotonic; wall-clock corrections and pauses do not skew pace.
  const elapsedNow = useCallback(
    () =>
      clock.current.elapsed +
      (active.current
        ? Math.max(0, performance.now() - clock.current.resumedAt) / 1000
        : 0),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    restored.current ??= loadMediaDocument<unknown>(KEY, null).then(
      restoreDraft,
    );
    restored.current.then((value) => {
      if (cancelled) return;
      latest.current = value;
      setDraft(value);
      clock.current = { elapsed: value.elapsed, resumedAt: 0 };
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const persist = useCallback((value: Draft): Promise<void> => {
    if (clearing.current) return Promise.resolve();
    const revision = generation.current;
    const task = persistence.current.then(async () => {
      if (revision !== generation.current) return;
      try {
        await persistMediaDocument(KEY, value);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      }
    });
    persistence.current = task.catch(() => undefined);
    return task;
  }, []);
  const update = useCallback(
    (change: (value: Draft) => Draft, save = false) => {
      const next = change(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setDraft(next);
      if (save) void persist(next).catch(() => undefined);
    },
    [persist],
  );
  const setRunning = useCallback(
    (next: boolean) => {
      const elapsed = elapsedNow();
      if (next === active.current) return elapsed;
      if (next) resumedFromPauseRef.current = latest.current.points.length > 0;
      clock.current = { elapsed, resumedAt: performance.now() };
      active.current = next;
      update(
        (value) => ({
          ...value,
          elapsed,
          startMs: value.startMs ?? value.points[0]?.time ?? Date.now(),
        }),
        !next,
      );
      if (next) setError("");
      setRunningState(next);
      return elapsed;
    },
    [elapsedNow, update],
  );

  useEffect(() => {
    // Flush once when the page leaves, including a sub-second final interval.
    const flush = () => {
      void persist({ ...latest.current, elapsed: elapsedNow() }).catch(
        () => undefined,
      );
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [persist, elapsedNow]);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      update((value) => ({ ...value, elapsed: elapsedNow() }));
    }, 1000);
    let stop: (() => void) | undefined;
    let cancelled = false;
    requestLocationPermission()
      .then((permission) => {
        if (cancelled || !active.current) return;
        if (permission === "denied") {
          setError(
            "Timer is running without GPS. Enable location in device settings to record a route.",
          );
          return;
        }
        stop = watchPosition(
          (fix) => {
            if (cancelled || !active.current) return;
            setError(
              fix.altitude === null
                ? "GPS altitude is unavailable; elevation uses the last known height."
                : "",
            );
            update((value) => {
              const previous = value.points[value.points.length - 1];
              const check = shouldAcceptGPSFix(
                fix.lat,
                fix.lng,
                previous?.lat ?? null,
                previous?.lng ?? null,
                fix.accuracy,
              );
              if (!check.accept) return value;
              if (shouldWarnGPSGap(previous, fix, resumedFromPauseRef.current))
                setGapNotice(
                  "GPS was briefly paused by your phone’s battery saver — use Pocket Lock to keep tracking continuous.",
                );
              // Suppress only the first accepted fix of an intentional resume.
              resumedFromPauseRef.current = false;
              const elapsed = elapsedNow();
              const startMs = value.startMs ?? Date.now() - elapsed * 1000;
              const point: TrackPoint = {
                lat: fix.lat,
                lng: fix.lng,
                ele: fix.altitude ?? previous?.ele ?? 0,
                // The route timeline counts active recording time, excluding every pause.
                time: startMs + elapsed * 1000,
                wallTime: fix.timestamp || Date.now(),
                cumDistKm: (previous?.cumDistKm ?? 0) + check.distanceKm,
                gradePct: 0,
              };
              return {
                ...value,
                startMs,
                elapsed,
                points: [...value.points, point],
              };
            }, true);
          },
          (status) => {
            if (cancelled) return;
            setError(
              status === "denied"
                ? "Timer is running without GPS. Location permission is denied."
                : "Timer is running. Waiting for a GPS fix…",
            );
          },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Timer is running without GPS. Could not start location recording.",
          );
        }
      });
    return () => {
      cancelled = true;
      clearInterval(tick);
      stop?.();
    };
  }, [running, update, elapsedNow, setRunning]);

  // Expensive route geometry changes only with accepted fixes or photo/name edits.
  const geometry = useMemo<HikeTrack | null>(() => {
    if (!draft.points.length)
      return {
        id: "recording-draft",
        name: draft.name,
        region: "A moment outdoors",
        createdAt: draft.startMs ?? Date.now(),
        source: "recorded",
        points: [],
        pins: draft.pins,
        unplacedPhotos: draft.unplacedPhotos ?? [],
        timedSession: true,
        stats: {
          totalDistKm: 0,
          elevationGainM: 0,
          elevationLossM: 0,
          maxAltitudeM: 0,
          minAltitudeM: 0,
          maxGradePct: 0,
          durationSec: 0,
          verticalRateMh: 0,
          paceMinPerKm: "— /km",
        },
      };
    const xml = `<gpx><trk><trkseg>${draft.points
      .map(
        (point) =>
          `<trkpt lat="${point.lat}" lon="${point.lng}"><ele>${point.ele}</ele><time>${new Date(point.time!).toISOString()}</time></trkpt>`,
      )
      .join("")}</trkseg></trk></gpx>`;
    const result = parseGPX(xml);
    const route: HikeTrack = {
      ...result,
      points: result.points.map((point, index) => ({
        ...point,
        wallTime: draft.points[index].wallTime,
      })),
      id: "recording-draft",
      name: draft.name,
      region: "Recorded in the field",
      source: "recorded",
      pins: draft.pins,
      unplacedPhotos: draft.unplacedPhotos ?? [],
    };
    // Photos saved before the first fix may match once more of the hike is recorded.
    const pins = [...route.pins];
    const unplacedPhotos: TrailPhoto[] = [];
    for (const photo of route.unplacedPhotos ?? []) {
      const pin = positionTrailPhoto(photo, route);
      if (pin.exifSource === "manual") unplacedPhotos.push(photo);
      else pins.push(pin);
    }
    return { ...route, pins, unplacedPhotos };
  }, [draft.points, draft.pins, draft.name, draft.unplacedPhotos]);
  const track = useMemo<HikeTrack | null>(
    () =>
      geometry && {
        ...geometry,
        stats: {
          ...geometry.stats,
          durationSec: Math.round(draft.elapsed),
          verticalRateMh: calculateVerticalRate(
            geometry.stats.elevationGainM,
            draft.elapsed,
          ),
          paceMinPerKm: calculatePaceMinPerKm(
            geometry.stats.totalDistKm,
            draft.elapsed,
          ),
        },
      },
    [geometry, draft.elapsed],
  );

  return {
    draft,
    wakeLockStatus,
    gapNotice,
    dismissGapNotice: () => setGapNotice(""),
    loading,
    running,
    error,
    track,
    setRunning,
    setName: (name: string) => update((value) => ({ ...value, name }), true),
    addUnplacedPhotos: (photos: TrailPhoto[]) =>
      update(
        (value) => ({
          ...value,
          unplacedPhotos: [...(value.unplacedPhotos ?? []), ...photos],
        }),
        true,
      ),
    replaceMoments: async (pins: SpatialPin[], photos: TrailPhoto[]) => {
      update((value) => ({
        ...value,
        pins,
        unplacedPhotos: photos,
        elapsed: elapsedNow(),
      }));
      await persist(latest.current);
    },
    addPin: (pin: SpatialPin) =>
      update(
        (value) => ({
          ...value,
          elapsed: elapsedNow(),
          pins: [...value.pins, pin],
        }),
        true,
      ),
    clear: async () => {
      clearing.current = true;
      resumedFromPauseRef.current = false;
      setGapNotice("");
      clock.current = { elapsed: elapsedNow(), resumedAt: 0 };
      active.current = false;
      setRunningState(false);
      generation.current++;
      try {
        await persistence.current;
        await removeMediaDocument(KEY);
        clock.current = { elapsed: 0, resumedAt: 0 };
        latest.current = emptyDraft();
        setDraft(latest.current);
        setError("");
      } finally {
        clearing.current = false;
      }
    },
  };
}
