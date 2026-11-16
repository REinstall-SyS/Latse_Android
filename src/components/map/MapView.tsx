import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import { useFreeRoam } from "@/hooks/useFreeRoam";
import {
  attachMapLayer,
  MAP_LAYERS,
  type MapLayer,
} from "@/services/map-layers.service";
import { createRoam, updateRoamPath } from "@/domain/free-roam";
import { StoryPlayback } from "@/domain/story-playback";
import { placePhotoAtCoordinate } from "@/domain/photo-placement";
import { snapToTrack } from "@/domain/gpx-engine";
import { MapPin, Layers, Pencil, Trash2, Save, Footprints } from "lucide-react";
import { photoTimeLabel } from "@/domain/photo-time";
import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  LocateFixed,
  Maximize,
  Mountain,
  Navigation,
  Pause,
  Play,
  Share2,
  X,
  Zap,
} from "lucide-react";
import type {
  HikeTrack,
  LocationStatus,
  SpatialPin,
  SaveDestination,
} from "@/types/trek.types";
import { FinishHikeSheet } from "@/components/record/FinishHikeSheet";
import type { useHikeRecorder } from "@/hooks/useHikeRecorder";
import {
  locateOnTrail,
  trailIndexAtDistance,
  formatGhostPace,
} from "@/domain/trail-navigation";
import { interpolateBetween } from "@/domain/gpx-engine";
import { calculateGhostDelta } from "@/domain/gpx-engine";
import { Dialog } from "@/components/shared/Dialog";
import { TrailLibrarySheet } from "@/components/explore/TrailLibrarySheet";
import { ElevationScrubber } from "./ElevationScrubber";
import { PhotoPinEditor } from "./PhotoPinEditor";
import { PhotoMapShareSheet } from "./PhotoMapShareSheet";
interface Props {
  roam: ReturnType<typeof useFreeRoam>;
  onStudio: (destination?: SaveDestination) => void;
  track: HikeTrack;
  tracks: HikeTrack[];
  onTrack: (id: string) => void;
  onSave: (track: HikeTrack) => void | Promise<void>;
  userLocation: [number, number] | null;
  onLocate: () => void;
  locationStatus: LocationStatus;
  recorder: ReturnType<typeof useHikeRecorder>;
}
export function MapView({
  track: selectedTrack,
  roam,
  onStudio,
  tracks,
  onTrack,
  onSave,
  userLocation,
  onLocate,
  locationStatus,
  recorder,
}: Props) {
  const { units } = useUnits();
  const [walkPrompt, setWalkPrompt] = useState(false);
  const [finishRoam, setFinishRoam] = useState(false);
  const [traceMode, setTraceMode] = useState<"tap" | "draw" | null>(null);
  const [layerKind, setLayerKind] = useState<MapLayer>("outdoor"),
    [layerPicker, setLayerPicker] = useState(false);
  const [moving, setMoving] = useState<string>(),
    [editFocus, setEditFocus] = useState<string>(),
    [saveError, setSaveError] = useState(""),
    [saving, setSaving] = useState(false),
    [tour, setTour] = useState(false);
  const centerRef = useRef<[number, number]>(userLocation ?? [37.75, -119.58]);
  const [photoCenter, setPhotoCenter] = useState<[number, number]>();
  const walking = roam.active && roam.track?.source === "recorded";
  const track =
    roam.active && roam.track
      ? walking && recorder.track
        ? {
            ...recorder.track,
            points: recorder.track.points.length
              ? recorder.track.points
              : roam.track.points,
            id: roam.track.id,
            name: roam.track.name,
            freeRoam: true,
          }
        : roam.track
      : selectedTrack;
  const latest = useRef({ track, roam, traceMode, moving });
  latest.current = { track, roam, traceMode, moving };
  const savingRef = useRef(false);
  const saveTrack = async (value: HikeTrack) => {
    if (walking)
      await recorder.replaceMoments(value.pins, value.unplacedPhotos ?? []);
    if (roam.active)
      await roam.update(
        value.points.length || !value.pins.length
          ? value
          : updateRoamPath(value, [
              {
                lat: value.pins[0].lat,
                lng: value.pins[0].lng,
                ele: value.pins[0].ele,
                cumDistKm: 0,
                gradePct: 0,
              },
            ]),
        true,
      );
    else await onSave(value);
  };
  const completeRoam = async (destination: SaveDestination, name: string) => {
    setSaving(true);
    savingRef.current = true;
    setTraceMode(null);
    try {
      const elapsed = walking ? recorder.setRunning(false) : null;
      await roam.flush();
      await onSave({
        ...track,
        name,
        preferredPresentation: destination === "map" ? "map" : "receipt",
        stats: {
          ...track.stats,
          ...(elapsed === null ? {} : { durationSec: Math.round(elapsed) }),
        },
      });
      if (walking) await recorder.clear();
      await roam.clear();
      setFinishRoam(false);
      onStudio(destination);
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };
  const beginWalk = async () => {
    setWalkPrompt(false);
    setSaving(true);
    savingRef.current = true;
    setTraceMode(null);
    try {
      const existing =
        recorder.draft.points.length > 0 ||
        recorder.draft.elapsed > 0 ||
        recorder.draft.pins.length > 0 ||
        (recorder.draft.unplacedPhotos?.length ?? 0) > 0;
      const keepSketch =
        !walking &&
        (track.points.length > 1 ||
          (existing && (track.points.length > 0 || track.pins.length > 0)));
      if (keepSketch) await onSave(track);
      // An existing recording is resumed; never clear a separate, unsaved GPS draft.
      if (!existing && !keepSketch)
        await recorder.replaceMoments(track.pins, track.unplacedPhotos ?? []);
      const base = existing
        ? recorder.track!
        : keepSketch
          ? createRoam()
          : track;
      await roam.update(
        {
          ...base,
          id: walking
            ? track.id
            : existing || keepSketch
              ? crypto.randomUUID()
              : track.id,
          freeRoam: true,
          source: "recorded",
          elevationEstimated: false,
        },
        true,
      );
      recorder.setRunning(true);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };
  useEffect(() => {
    if (walking && recorder.track && roam.track)
      void roam
        .update({
          ...recorder.track,
          id: roam.track.id,
          name: roam.track.name,
          freeRoam: true,
        })
        .catch(() => undefined);
  }, [
    walking,
    recorder.track?.points,
    recorder.track?.pins,
    recorder.track?.unplacedPhotos,
  ]);

  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map>(),
    group = useRef<L.LayerGroup>(),
    liveGroup = useRef<L.LayerGroup>();
  const cursor = useRef<L.CircleMarker>(),
    ghostMarker = useRef<L.CircleMarker>(),
    fit = useRef<() => void>(() => {}),
    awaitingLocation = useRef(false),
    previousDistance = useRef<number>();
  const [index, setIndex] = useState(0),
    [selectedId, setSelectedId] = useState<string>(),
    [expanded, setExpanded] = useState(true);
  const [sheet, setSheet] = useState<
    "library" | "details" | "photos" | "share"
  >();
  const [tileError, setTileError] = useState(false),
    [ghostEnabled, setGhostEnabled] = useState(false),
    [simulating, setSimulating] = useState(false),
    [simulationElapsed, setSimulationElapsed] = useState(0),
    [following, setFollowing] = useState(true);
  const points = track.points,
    point = points[Math.min(index, points.length - 1)],
    selected = track.pins.find((pin) => pin.id === selectedId);
  const liveFix = recorder.running
    ? recorder.track?.points[recorder.draft.points.length - 1]
    : undefined;
  const position: [number, number] | null = liveFix
    ? [liveFix.lat, liveFix.lng]
    : userLocation;
  useEffect(() => {
    setPhotoCenter(undefined);
  }, [
    liveFix?.wallTime,
    liveFix?.time,
    liveFix?.lat,
    liveFix?.lng,
    userLocation?.[0],
    userLocation?.[1],
  ]);
  const location = useMemo(
    () =>
      position && points.length
        ? locateOnTrail(
            position[0],
            position[1],
            points,
            previousDistance.current,
          )
        : null,
    [position?.[0], position?.[1], points],
  );
  useEffect(() => {
    previousDistance.current = location?.distanceKm;
  }, [location]);
  const duration = useMemo(() => {
    const timed = points.filter((p) => p.time !== undefined);
    return timed.length > 1
      ? Math.max(0, (timed[timed.length - 1].time! - timed[0].time!) / 1000)
      : 0;
  }, [points]);
  const hasGhost =
    duration > 0 && calculateGhostDelta(0, 0, track).ghostPoint !== null;
  const simulated =
    !recorder.running && simulationElapsed > 0
      ? calculateGhostDelta(0, simulationElapsed * 1.08, track).ghostPoint
      : null;
  const userDistance =
    recorder.running &&
    location?.offTrackMeters !== undefined &&
    location.offTrackMeters < 100
      ? location.distanceKm
      : simulated?.cumDistKm;
  const ghostResult =
    hasGhost && ghostEnabled
      ? calculateGhostDelta(
          userDistance ?? points[0]?.cumDistKm ?? 0,
          recorder.running ? recorder.draft.elapsed : simulationElapsed,
          track,
        )
      : null;
  const delta =
    recorder.running && (!location || location.offTrackMeters >= 100)
      ? null
      : (ghostResult?.deltaSec ?? null);
  const nearPin = (nextIndex: number) => {
    const p = points[nextIndex];
    if (!p) return undefined;
    return track.pins
      .filter(
        (pin) =>
          Math.abs(pin.cumDistKm - p.cumDistKm) <=
          Math.max(0.08, track.stats.totalDistKm / 120),
      )
      .sort(
        (a, b) =>
          Number(Boolean(b.photoDataUrl)) - Number(Boolean(a.photoDataUrl)) ||
          Math.abs(a.cumDistKm - p.cumDistKm) -
            Math.abs(b.cumDistKm - p.cumDistKm),
      )[0];
  };
  const scrub = (next: number) => {
    setFollowing(false);
    setSimulating(false);
    setIndex(next);
    setSelectedId(nearPin(next)?.id);
  };
  useEffect(() => {
    if (!following || userDistance === undefined || !points.length) return;
    const next = trailIndexAtDistance(points, userDistance);
    setIndex(next);
    setSelectedId(nearPin(next)?.id);
  }, [following, userDistance, points]);
  useEffect(() => {
    if (recorder.running) {
      setSimulating(false);
      setSimulationElapsed(0);
    }
  }, [recorder.running]);
  useEffect(() => {
    if (!simulating || recorder.running || !hasGhost) return;
    const began = performance.now(),
      offset = simulationElapsed;
    const timer = setInterval(() => {
      const next = Math.min(
        duration,
        offset + ((performance.now() - began) / 30000) * duration,
      );
      setSimulationElapsed(next);
      if (next >= duration) setSimulating(false);
    }, 100);
    return () => clearInterval(timer);
  }, [simulating, recorder.running, duration, hasGhost]);
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, {
      zoomControl: false,
      zoomAnimation: false,
      zoomSnap: 0.25,
    }).setView(
      points[0] ? [points[0].lat, points[0].lng] : centerRef.current,
      13,
    );
    map.current = instance;

    L.control.zoom({ position: "bottomright" }).addTo(instance);
    group.current = L.layerGroup().addTo(instance);
    liveGroup.current = L.layerGroup().addTo(instance);
    cursor.current = L.circleMarker(
      [
        points[0]?.lat ?? centerRef.current[0],
        points[0]?.lng ?? centerRef.current[1],
      ],
      {
        radius: 7,
        color: "white",
        weight: 3,
        fillColor: "#C96E0C",
        fillOpacity: 1,
      },
    ).addTo(instance);
    ghostMarker.current = L.circleMarker(
      [
        points[0]?.lat ?? centerRef.current[0],
        points[0]?.lng ?? centerRef.current[1],
      ],
      {
        radius: 7,
        color: "white",
        weight: 3,
        fillColor: "#6f60a4",
        fillOpacity: 0,
        opacity: 0,
      },
    ).addTo(instance);
    const click = (event: L.LeafletMouseEvent) => {
      const value = latest.current;
      if (value.moving) {
        const pin = value.track.pins.find((p) => p.id === value.moving);
        if (pin)
          void commitRef
            .current({
              ...value.track,
              pins: value.track.pins.map((p) =>
                p.id === pin.id
                  ? placePhotoAtCoordinate(
                      pin,
                      value.track,
                      event.latlng.lat,
                      event.latlng.lng,
                      false,
                    )
                  : p,
              ),
            })
            .then(() => setMoving(undefined))
            .catch((e) => setSaveError(e.message));
      } else if (value.roam.active && value.traceMode === "tap")
        appendTrace(event.latlng.lat, event.latlng.lng);
      else if (value.roam.active)
        setPhotoCenter([event.latlng.lat, event.latlng.lng]);
    };
    instance.on("click", click);
    let drawing = false,
      lastDraw = 0;
    const down = (event: PointerEvent) => {
      if (latest.current.traceMode !== "draw") return;
      drawing = true;
      lastDraw = 0;
      host.current?.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!drawing || performance.now() - lastDraw < 120) return;
      lastDraw = performance.now();
      const at = instance.containerPointToLatLng(
        instance.mouseEventToContainerPoint(event),
      );
      appendTrace(at.lat, at.lng);
      event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      if (drawing) move(event);
      drawing = false;
    };
    const container = host.current;
    container.addEventListener("pointerdown", down);
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerup", up);
    container.addEventListener("pointercancel", up);
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => {
      const center = instance.getCenter();
      centerRef.current = [center.lat, center.lng];
      resize.disconnect();
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerup", up);
      container.removeEventListener("pointercancel", up);
      instance.remove();
      map.current = undefined;
    };
  }, [track.id]);
  useEffect(() => {
    const instance = map.current,
      layer = group.current;
    if (!instance || !layer) return;
    layer.clearLayers();
    const coords = points.map((p) => [p.lat, p.lng] as [number, number]);
    const line = L.polyline(coords, {
      color: "#fffdf4",
      weight: 9,
      opacity: 0.9,
    }).addTo(layer);
    const stride = Math.max(1, Math.ceil(points.length / 600));
    for (let i = 1; i < points.length; i += stride)
      L.polyline(coords.slice(i - 1, Math.min(points.length, i + stride)), {
        color:
          points[i].gradePct > 12
            ? "#c65a36"
            : points[i].gradePct < -12
              ? "#417b81"
              : "#b78337",
        weight: 4,
        interactive: false,
      }).addTo(layer);
    coords
      .filter((_, i) => i === 0 || i === coords.length - 1)
      .forEach((coord, i) =>
        L.circleMarker(coord, {
          radius: 5,
          color: "#315941",
          fillColor: i ? "#315941" : "white",
          fillOpacity: 1,
          weight: 2,
        })
          .addTo(layer)
          .bindTooltip(i ? "Finish" : "Start"),
      );
    track.pins.forEach((pin, i) => {
      const icon = document.createElement("div");
      icon.className = `trail-photo-pin ${pin.photoDataUrl ? "" : "is-note"}`;
      if (pin.photoDataUrl) {
        const img = document.createElement("img");
        img.src = pin.photoDataUrl;
        img.alt = "";
        icon.append(img);
      }
      const n = document.createElement("span");
      n.textContent = String(i + 1).padStart(2, "0");
      icon.append(n);
      L.marker([pin.lat, pin.lng], {
        title: `Moment ${i + 1}: ${pin.caption}`,
        icon: L.divIcon({
          html: icon,
          className: "trail-photo-marker",
          iconSize: [48, 59],
          iconAnchor: [24, 59],
        }),
        zIndexOffset: pin.photoDataUrl ? 100 : 0,
      })
        .addTo(layer)
        .on("click", () => {
          setFollowing(false);
          setSimulating(false);
          setSelectedId(pin.id);
          setIndex(trailIndexAtDistance(points, pin.cumDistKm));
        });
    });
    if (!points.length) {
      fit.current = () => instance.setView(centerRef.current, 14);
      return;
    }
    fit.current = () =>
      points.length === 1
        ? instance.setView(coords[0], 15)
        : instance.fitBounds(line.getBounds(), {
            paddingTopLeft: [48, 160],
            paddingBottomRight: [48, 65],
            maxZoom: 16,
            animate: false,
          });
    if (!track.freeRoam) fit.current();
  }, [track]);
  useEffect(() => {
    if (point) cursor.current?.setLatLng([point.lat, point.lng]);
  }, [point]);
  useEffect(() => {
    const p = ghostResult?.ghostPoint;
    ghostMarker.current?.setStyle({
      opacity: p ? 1 : 0,
      fillOpacity: p ? 1 : 0,
    });
    if (p) ghostMarker.current?.setLatLng([p.lat, p.lng]);
  }, [ghostResult?.ghostPoint]);
  useEffect(() => {
    if (awaitingLocation.current && position) {
      map.current?.setView(position, 15, { animate: false });
      awaitingLocation.current = false;
    }
    if (locationStatus === "denied" || locationStatus === "unavailable")
      awaitingLocation.current = false;
  }, [position?.[0], position?.[1], locationStatus]);
  useEffect(() => {
    const layer = liveGroup.current;
    if (!layer) return;
    layer.clearLayers();
    if (recorder.running && recorder.draft.points.length)
      L.polyline(
        recorder.draft.points.map((p) => [p.lat, p.lng]),
        { color: "#3477b9", weight: 4, dashArray: "5 7" },
      ).addTo(layer);
    const shown: [number, number] | null = simulated
      ? [simulated.lat, simulated.lng]
      : position;
    if (shown)
      L.circleMarker(shown, {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "#3477b9",
        fillOpacity: 1,
      })
        .addTo(layer)
        .bindTooltip(simulated ? "Simulated hiker" : "Your latest location");
  }, [
    position?.[0],
    position?.[1],
    recorder.draft.points,
    recorder.running,
    simulated,
  ]);
  const commitRef = useRef(saveTrack);
  commitRef.current = saveTrack;
  function appendTrace(lat: number, lng: number) {
    const value = latest.current;
    if (
      savingRef.current ||
      !value.roam.active ||
      value.track.source === "recorded" ||
      value.track.points.length >= 25000
    )
      return;
    const last = value.track.points[value.track.points.length - 1];
    if (last && Math.abs(last.lat - lat) + Math.abs(last.lng - lng) < 0.00004)
      return;
    const reference = selectedTrack.points.length
      ? locateOnTrail(lat, lng, selectedTrack.points)
      : null;
    const start = reference
      ? selectedTrack.points[reference.segmentStart]
      : null;
    const ele =
      reference && reference.offTrackMeters < 2000 && start
        ? reference.fraction
          ? interpolateBetween(
              start,
              selectedTrack.points[reference.segmentStart + 1],
              reference.fraction,
            ).ele
          : start.ele
        : (last?.ele ?? 0);
    const next = updateRoamPath(value.track, [
      ...value.track.points,
      { lat, lng, ele, cumDistKm: 0, gradePct: 0 },
    ]);
    latest.current.track = next;
    void value.roam.update(next).catch((e) => setSaveError(e.message));
  }
  useEffect(() => {
    if (map.current) {
      if (traceMode === "draw") map.current.dragging.disable();
      else map.current.dragging.enable();
    }
  }, [traceMode, track.id]);
  useEffect(() => {
    setTileError(false);
    if (!map.current) return;
    return attachMapLayer(map.current, layerKind, () => setTileError(true));
  }, [layerKind, track.id]);
  const playback = useRef({ trackId: track.id, player: new StoryPlayback() });
  useEffect(() => {
    if (playback.current.trackId !== track.id)
      playback.current = { trackId: track.id, player: new StoryPlayback() };
    if (!tour) return;
    if (playback.current.player.finished)
      playback.current.player = new StoryPlayback();
    setFollowing(false);
    setSimulating(false);
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (stopped) return;
      const current = latest.current.track;
      const frame = playback.current.player.next(current.points, current.pins);
      if (!frame) {
        setTour(false);
        return;
      }
      const p = current.points[frame.index];
      setIndex(frame.index);
      map.current?.panTo([p.lat, p.lng], { animate: true, duration: 0.3 });
      if (frame.photo) setSelectedId(frame.photo.id);
      else if (!frame.done) setSelectedId(undefined);
      if (frame.done) {
        setTour(false);
        return;
      }
      timer = setTimeout(tick, frame.delayMs);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [tour, track.id]);
  const choose = (pin: SpatialPin) => {
    scrub(trailIndexAtDistance(points, pin.cumDistKm));
    setSelectedId(pin.id);
    map.current?.panTo([pin.lat, pin.lng], { animate: false });
  };
  return (
    <section
      className={`photo-navigation-screen ${roam.active ? "is-roaming" : ""}`}
      aria-label="Trail map"
    >
      {points.length || roam.active ? (
        <>
          <div className="photo-navigation-stage">
            <div
              ref={host}
              className="navigation-leaflet"
              aria-label="Interactive trail map"
            />
            <button
              className="map-roam-toggle"
              onClick={() => {
                setTour(false);
                setMoving(undefined);
                if (roam.active) roam.leave();
                else {
                  const at = map.current?.getCenter();
                  if (at) centerRef.current = [at.lat, at.lng];
                  roam.enter();
                }
              }}
            >
              {roam.active ? "Exit Roam" : "🧭 Free Roam / Trace"}
            </button>
            <button
              className="map-trail-switch"
              aria-label={`Route details: ${track.name}`}
              onClick={() => setSheet("details")}
            >
              <span>
                <small>
                  {track.source === "preset"
                    ? "ILLUSTRATIVE ROUTE"
                    : "YOUR TRAIL"}
                </small>
                <strong>{track.name}</strong>
              </span>
              <ChevronDown size={17} />
            </button>
            <div className="map-overlay-stack">
              {points.length > 1 && (
                <button
                  className="map-story-pill"
                  aria-pressed={tour}
                  onClick={() => setTour(!tour)}
                >
                  {tour ? <Pause size={16} /> : <Play size={16} />}
                  {tour ? "Stop Story" : "Play Story"}
                </button>
              )}
              <div className="map-ghost-controls" data-expanded={ghostEnabled}>
                <button
                  className="ghost-toggle"
                  aria-label="Ghost Pace"
                  aria-pressed={ghostEnabled}
                  disabled={!hasGhost}
                  onClick={() => {
                    setGhostEnabled((v) => !v);
                    setSimulating(false);
                  }}
                >
                  <Zap size={16} /> Ghost Pace{" "}
                  <span>{ghostEnabled && hasGhost ? "On" : "Off"}</span>
                </button>
                {ghostEnabled && (
                  <button
                    className="icon-btn"
                    aria-label={
                      simulating ? "Pause ghost preview" : "Simulate Ghost Race"
                    }
                    disabled={recorder.running || !hasGhost || !ghostEnabled}
                    onClick={() => {
                      if (simulationElapsed >= duration)
                        setSimulationElapsed(0);
                      setFollowing(true);
                      setSimulating((v) => !v);
                    }}
                  >
                    {simulating ? <Pause size={17} /> : <Play size={17} />}
                  </button>
                )}
                {ghostEnabled && (
                  <p
                    className={`ghost-comparison ${delta !== null && delta < 0 ? "ahead" : ""}`}
                    role="status"
                  >
                    {!hasGhost
                      ? "No reference timestamps"
                      : recorder.running || simulationElapsed > 0
                        ? formatGhostPace(delta)
                        : "Replay the reference pace"}
                    {simulationElapsed > 0 && !recorder.running && (
                      <small>Simulated preview</small>
                    )}
                  </p>
                )}
              </div>
              {(locationStatus === "requesting" ||
                locationStatus === "denied" ||
                locationStatus === "unavailable" ||
                tileError ||
                (location && location.offTrackMeters > 100)) && (
                <p className="map-status-chip" role="status">
                  {locationStatus === "requesting"
                    ? "Finding your location…"
                    : locationStatus === "denied"
                      ? "Location is blocked. Enable it in device settings."
                      : locationStatus === "unavailable"
                        ? "Location unavailable. Try a clearer sky view."
                        : tileError
                          ? "Tiles unavailable · route remains visible"
                          : `Off route · ${formatElevation(location!.offTrackMeters, units)}`}
                </p>
              )}
            </div>
            {roam.active && (
              <div className="roam-toolbar">
                <div className="roam-tools">
                  <button
                    disabled={walking || saving}
                    aria-pressed={traceMode === "tap"}
                    onClick={() => {
                      setTraceMode(traceMode === "tap" ? null : "tap");
                    }}
                  >
                    <MapPin size={16} />
                    Tap trace
                  </button>
                  <button
                    disabled={walking || saving}
                    aria-pressed={traceMode === "draw"}
                    onClick={() =>
                      setTraceMode(traceMode === "draw" ? null : "draw")
                    }
                  >
                    <Pencil size={16} />
                    Draw
                  </button>
                  <button
                    aria-pressed={walking && recorder.running}
                    disabled={saving || recorder.loading}
                    onClick={() => {
                      setTraceMode(null);
                      if (walking && recorder.running)
                        recorder.setRunning(false);
                      else if (
                        !walking &&
                        (points.length > 1 || recorder.draft.points.length > 0)
                      )
                        setWalkPrompt(true);
                      else void beginWalk();
                    }}
                  >
                    <Footprints size={16} />
                    {walking && recorder.running ? "Pause walk" : "Walk trace"}
                  </button>
                  <button
                    onClick={() => {
                      setPhotoCenter(
                        photoCenter ??
                          position ?? [
                            map.current!.getCenter().lat,
                            map.current!.getCenter().lng,
                          ],
                      );
                      setSheet("photos");
                    }}
                  >
                    <Camera size={16} />
                    Photo
                  </button>
                </div>
                <p>
                  {traceMode === "draw"
                    ? "Draw on the map with your finger."
                    : traceMode === "tap"
                      ? "Tap the map to trace your path."
                      : "Roam freely. Tap a spot before dropping a photo."}{" "}
                  · Heights estimated
                </p>
                <div className="roam-tools">
                  <button
                    disabled={saving || (!points.length && !track.pins.length)}
                    onClick={() => setFinishRoam(true)}
                  >
                    <Save size={16} />
                    {saving ? "Saving…" : "Finish roam"}
                  </button>
                  <button
                    disabled={walking || !points.length}
                    onClick={() => {
                      const next = updateRoamPath(track, points.slice(0, -1));
                      void roam.update(next).catch(() => undefined);
                    }}
                  >
                    Undo point
                  </button>
                </div>
              </div>
            )}
            <div className="map-side-actions">
              <button
                className="icon-btn"
                aria-label="Map layers"
                onClick={() => setLayerPicker(true)}
              >
                <Layers size={19} />
              </button>
              <button
                className="icon-btn"
                aria-label="Fit trail"
                onClick={() => fit.current()}
              >
                <Maximize size={19} />
              </button>
              <button
                className="icon-btn"
                aria-label="Locate Me"
                onClick={() => {
                  awaitingLocation.current = !position;
                  onLocate();
                  setFollowing(true);
                  if (position)
                    map.current?.setView(position, 15, { animate: false });
                }}
              >
                <LocateFixed size={21} />
              </button>
              <button
                className="icon-btn"
                aria-label="Share photo map"
                onClick={() => setSheet("share")}
              >
                <Share2 size={19} />
              </button>
            </div>
            {moving && (
              <button
                className="map-move-notice"
                onClick={() => setMoving(undefined)}
              >
                Tap a new photo location · Cancel
              </button>
            )}
            {(saveError || roam.error) && (
              <button
                className="map-move-notice error-text"
                onClick={() => setSaveError("")}
              >
                {saveError || roam.error}
              </button>
            )}
            {selected && (
              <article className="map-moment-card">
                {selected.photoDataUrl && (
                  <img src={selected.photoDataUrl} alt={selected.caption} />
                )}
                <div>
                  <small>
                    MOMENT /{" "}
                    {String(track.pins.indexOf(selected) + 1).padStart(2, "0")}
                  </small>
                  <h2>{selected.caption}</h2>
                  <div className="moment-quick-actions">
                    <button
                      onClick={() => {
                        setMoving(selected.id);
                        setTour(false);
                      }}
                    >
                      Move on Map
                    </button>
                    <button
                      onClick={() => {
                        setEditFocus(selected.id);
                        setSheet("photos");
                      }}
                    >
                      Edit Caption
                    </button>
                    <button
                      onClick={() => {
                        void saveTrack({
                          ...track,
                          pins: track.pins.filter((p) => p.id !== selected.id),
                        })
                          .then(() => setSelectedId(undefined))
                          .catch((e) => setSaveError(e.message));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                  {selected.photoDataUrl && <p>{photoTimeLabel(selected)}</p>}
                  <p>
                    {formatDistance(selected.cumDistKm, units)} ·{" "}
                    {formatElevation(selected.ele, units)}
                  </p>
                </div>
                <button
                  className="icon-btn"
                  aria-label="Close moment"
                  onClick={() => setSelectedId(undefined)}
                >
                  <X size={17} />
                </button>
              </article>
            )}
            <div className="map-grade-key">
              <span>
                <i /> Gentle
              </span>
              <span>
                <i /> Climb
              </span>
              <span>
                <i /> Descent
              </span>
            </div>
          </div>
          {points.length ? (
            expanded ? (
              <ElevationScrubber
                track={track}
                index={index}
                onSelect={scrub}
                onPin={() => setSheet("photos")}
                selectedPin={selected}
                userDistanceKm={userDistance}
                ghostDistanceKm={ghostResult?.ghostPoint?.cumDistKm}
                onCollapse={() => setExpanded(false)}
              />
            ) : (
              <div className="map-collapsed-dock">
                <button
                  className="dock-summary"
                  aria-label="Route details & elevation"
                  onClick={() => setSheet("details")}
                >
                  <strong>
                    {formatDistance(track.stats.totalDistKm, units)}
                  </strong>
                  <small>
                    {formatElevation(track.stats.elevationGainM, units, true)}
                  </small>
                </button>
                <div className="map-moment-strip" aria-label="Trail moments">
                  {track.pins.map((pin, i) => (
                    <button
                      key={pin.id}
                      aria-label={`Open moment ${i + 1}: ${pin.caption}`}
                      aria-pressed={selectedId === pin.id}
                      onClick={() => choose(pin)}
                    >
                      {pin.photoDataUrl ? (
                        <img src={pin.photoDataUrl} alt="" />
                      ) : (
                        <span>{String(i + 1).padStart(2, "0")}</span>
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="dock-pin"
                  aria-label="Add trail moments"
                  onClick={() => setSheet("photos")}
                >
                  <Camera size={19} />
                </button>
                <button
                  className="dock-collapse"
                  aria-label="Expand elevation scrubber"
                  onClick={() => setExpanded(true)}
                >
                  Expand <ChevronUp size={14} />
                </button>
              </div>
            )
          ) : null}
        </>
      ) : (
        <div className="no-route-memory">
          <Camera size={36} />
          <h1>A memory without a map.</h1>
          <p>
            This session saved your time and photos. No GPS route was recorded.
          </p>
          <button className="secondary-btn" onClick={() => roam.enter()}>
            🧭 Free Roam / Trace
          </button>
          <button className="primary-btn" onClick={() => setSheet("library")}>
            Choose a trail
          </button>
        </div>
      )}
      {layerPicker && (
        <Dialog title="Map layers" onClose={() => setLayerPicker(false)}>
          <p className="sheet-intro">
            Map backgrounds need internet. Your route and photos stay available
            offline.
          </p>
          {MAP_LAYERS.map((layer) => (
            <button
              className="secondary-btn w-full mt-3"
              key={layer.id}
              aria-pressed={layerKind === layer.id}
              onClick={() => {
                setLayerKind(layer.id);
                setLayerPicker(false);
              }}
            >
              {layer.label}
            </button>
          ))}
        </Dialog>
      )}
      {finishRoam && (
        <FinishHikeSheet
          track={track}
          busy={saving}
          error={saveError}
          onSave={completeRoam}
          onClose={() => setFinishRoam(false)}
        />
      )}
      {walkPrompt && (
        <Dialog
          title="Start a walking trace"
          onClose={() => setWalkPrompt(false)}
        >
          <p className="sheet-intro">
            {points.length > 0
              ? "Your drawing and its photos will be saved to My Hikes before GPS tracing begins. "
              : ""}
            {recorder.draft.points.length > 0
              ? "Your existing GPS recording will resume with its route and photos intact."
              : "Your phone’s GPS will draw the next path as you walk."}
          </p>
          <button
            className="primary-btn w-full"
            onClick={() => void beginWalk()}
          >
            {points.length > 0 ? "Save drawing & walk" : "Resume GPS trace"}
          </button>
          <button
            className="text-btn w-full mt-3"
            onClick={() => setWalkPrompt(false)}
          >
            Keep exploring
          </button>
        </Dialog>
      )}
      {sheet === "library" && (
        <TrailLibrarySheet
          track={track}
          tracks={tracks}
          onSelect={onTrack}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === "photos" && (
        <PhotoPinEditor
          track={track}
          initialIndex={index}
          focusPin={editFocus}
          placementCenter={photoCenter ?? position ?? centerRef.current}
          initialPins={track.pins}
          initialPhotos={track.unplacedPhotos}
          onSave={async (pins, unplacedPhotos) => {
            await saveTrack({ ...track, pins, unplacedPhotos });
            setPhotoCenter(undefined);
          }}
          onClose={() => {
            setPhotoCenter(undefined);
            setSheet(undefined);
          }}
        />
      )}
      {sheet === "share" && (
        <PhotoMapShareSheet track={track} onClose={() => setSheet(undefined)} />
      )}
      {sheet === "details" && point && (
        <Dialog title="Read the trail" onClose={() => setSheet(undefined)}>
          <h3 className="section-title">{track.name}</h3>
          <p className="sheet-intro">
            {track.region}.{" "}
            {track.elevationEstimated
              ? "Planned straight-line segments with estimated heights."
              : track.source === "preset"
                ? "Illustrative route; bring a verified track for navigation."
                : "Heights come from your recorded or imported track."}
          </p>
          <div className="route-detail-metrics">
            <div>
              <small>ASCENT</small>
              <strong>
                {formatElevation(track.stats.elevationGainM, units, true)}
              </strong>
            </div>
            <div>
              <small>DESCENT</small>
              <strong>
                {formatElevation(-track.stats.elevationLossM, units)}
              </strong>
            </div>
            <div>
              <small>HIGH POINT</small>
              <strong>
                {formatElevation(track.stats.maxAltitudeM, units)}
              </strong>
            </div>
          </div>
          <button
            className="secondary-btn w-full"
            onClick={() => {
              const peak = points.reduce(
                (best, p, i) => (p.ele > points[best].ele ? i : best),
                0,
              );
              scrub(peak);
              map.current?.panTo([points[peak].lat, points[peak].lng], {
                animate: false,
              });
              setSheet(undefined);
            }}
          >
            Find the high point <Mountain size={17} />
          </button>
          <button
            className="text-btn w-full"
            onClick={() => setSheet("library")}
          >
            Switch trail <ChevronDown size={17} />
          </button>
        </Dialog>
      )}
    </section>
  );
}
