import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HikeTrack } from "@/types/trek.types";
import {
  calculatePaceMinPerKm,
  calculateVerticalRate,
} from "@/domain/altitude-physics";
import { signatureTracks } from "@/data/signature-tracks";
import { isStoredHike } from "@/services/track-validation";
import {
  loadMediaDocument,
  persistMediaDocument,
  MediaPersistenceError,
  SAVED_TRACKS_KEY,
} from "@/services/hike-persistence.service";
export { SAVED_TRACKS_KEY } from "@/services/hike-persistence.service";
function normalizeTracks(value: unknown, presets: HikeTrack[]): HikeTrack[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isStoredHike)
    .filter(
      (t) => !(t.source === "preset" && !presets.some((p) => p.id === t.id)),
    )
    .map((t) => {
      const preset =
        t.source === "preset" ? presets.find((p) => p.id === t.id) : undefined;
      const sameGeometry =
        preset &&
        t.points.length === preset.points.length &&
        t.points.every(
          (p, i) =>
            p.lat === preset.points[i].lat &&
            p.lng === preset.points[i].lng &&
            p.cumDistKm === preset.points[i].cumDistKm,
        );
      const hike = preset
        ? {
            ...t,
            ...preset,
            unplacedPhotos: t.unplacedPhotos,
            pins: sameGeometry
              ? t.pins
              : [
                  ...preset.pins,
                  ...t.pins
                    .filter((pin) => !pin.id.startsWith(`${preset.id}-note-`))
                    .map((pin) => {
                      if (sameGeometry) return pin;
                      const point = preset.points.reduce((best, p) =>
                        Math.abs(p.cumDistKm - pin.cumDistKm) <
                        Math.abs(best.cumDistKm - pin.cumDistKm)
                          ? p
                          : best,
                      );
                      return {
                        ...pin,
                        lat: point.lat,
                        lng: point.lng,
                        ele: point.ele,
                        cumDistKm: point.cumDistKm,
                      };
                    }),
                ],
          }
        : t;
      return {
        ...hike,
        stats: {
          ...hike.stats,
          verticalRateMh: calculateVerticalRate(
            hike.stats.elevationGainM,
            hike.stats.durationSec ?? 0,
          ),
          paceMinPerKm: calculatePaceMinPerKm(
            hike.stats.totalDistKm,
            hike.stats.durationSec ?? 0,
          ),
        },
      };
    });
}
export function useHikeLibrary() {
  const presets = useMemo(signatureTracks, []),
    [saved, setSaved] = useState<HikeTrack[]>([]),
    savedRef = useRef(saved);
  const [loading, setLoading] = useState(true),
    [warning, setWarning] = useState("");
  const ready = useRef<Promise<HikeTrack[]>>(),
    operations = useRef<Promise<unknown>>(Promise.resolve());
  const [selected, setSelected] = useState(() => {
    try {
      return localStorage.getItem("latse_active_track_v1") || presets[0].id;
    } catch {
      return presets[0].id;
    }
  });
  useEffect(() => {
    let cancelled = false;
    ready.current ??= loadMediaDocument<unknown>(SAVED_TRACKS_KEY, []).then(
      async (value) => {
        const loaded = normalizeTracks(value, presets);
        const missingPhotos = loaded.some(
          (track) =>
            track.pins.some((pin) => pin.photoRef && !pin.photoDataUrl) ||
            track.unplacedPhotos?.some(
              (photo) => photo.photoRef && !photo.photoDataUrl,
            ),
        );
        if (missingPhotos)
          setWarning(
            "Your routes are ready, but some photos are unavailable. Reopen Latse when device photo storage is available.",
          );
        if (loaded.length && !missingPhotos)
          try {
            await persistMediaDocument(SAVED_TRACKS_KEY, loaded);
          } catch (e) {
            setWarning((e as Error).message);
          }
        savedRef.current = loaded;
        return loaded;
      },
    );
    ready.current
      .then((loaded) => {
        if (cancelled) return;
        savedRef.current = loaded;
        setSaved(loaded);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoading(false);
          setWarning((e as Error).message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [presets]);
  const select = useCallback((id: string) => {
    setSelected(id);
    try {
      localStorage.setItem("latse_active_track_v1", id);
    } catch {
      /* Selection remains available in memory. */
    }
  }, []);
  const save = useCallback(
    (track: HikeTrack): Promise<void> => {
      const task = operations.current.then(async () => {
        await ready.current;
        const next = [
          track,
          ...savedRef.current.filter((t) => t.id !== track.id),
        ];
        try {
          await persistMediaDocument(SAVED_TRACKS_KEY, next);
        } catch (e) {
          if (e instanceof MediaPersistenceError) {
            savedRef.current = next;
            setSaved(next);
          }
          setWarning((e as Error).message);
          throw e;
        }
        savedRef.current = next;
        setSaved(next);
        setWarning("");
        select(track.id);
      });
      operations.current = task.catch(() => undefined);
      return task;
    },
    [select],
  );
  const remove = useCallback(
    (id: string): Promise<void> => {
      const task = operations.current.then(async () => {
        await ready.current;
        const next = savedRef.current.filter((track) => track.id !== id);
        await persistMediaDocument(SAVED_TRACKS_KEY, next);
        savedRef.current = next;
        setSaved(next);
        setSelected((current) => (current === id ? presets[0].id : current));
      });
      operations.current = task.catch(() => undefined);
      return task;
    },
    [presets],
  );
  const tracks = useMemo(
    () => [
      ...saved,
      ...presets.filter((p) => !saved.some((s) => s.id === p.id)),
    ],
    [saved, presets],
  );
  return {
    tracks,
    activeTrack: tracks.find((t) => t.id === selected) || tracks[0],
    select,
    save,
    remove,
    loading,
    warning,
    savedIds: saved.map((track) => track.id),
  };
}
