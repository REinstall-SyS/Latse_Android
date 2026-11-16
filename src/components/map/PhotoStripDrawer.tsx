import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import type { HikeTrack, SpatialPin, TrailPhoto } from "@/types/trek.types";
import { MobileMediaButtons } from "@/components/shared/MobileMediaButtons";
import {
  createPhotoPreview,
  MAX_TRAIL_PHOTOS,
  photoMatchDescription,
  prepareTrailPhoto,
  validatePhotoSelection,
} from "@/services/mobile-media.service";

import { PhotoPlacementMap } from "./PhotoPlacementMap";
import { createFieldNote, placeUnmatchedBatch } from "@/domain/photo-placement";
import { photoTimeLabel } from "@/domain/photo-time";

interface PendingPhoto {
  id: string;
  name: string;
  url: string;
  error?: string;
}
interface Props {
  track: HikeTrack;
  pins: SpatialPin[];
  onChange: (pins: SpatialPin[]) => void;
  initialIndex?: number;
  focusPin?: string;
  onBusyChange?: (busy: boolean) => void;
  reservedPhotoCount?: number;
  onUnplaced: (photo: TrailPhoto) => void;
  liveRecording?: boolean;
  placementCenter?: [number, number];
}

export function PhotoStripDrawer({
  track,
  pins,
  onChange,
  initialIndex,
  focusPin,
  onBusyChange,
  reservedPhotoCount = 0,
  onUnplaced,
  liveRecording = false,
  placementCenter,
}: Props) {
  const { units } = useUnits();
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (focusPin) setSelected(focusPin);
  }, [focusPin]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const generation = useRef(0);
  const previews = useRef(new Map<string, () => void>());
  const latest = useRef({ track, pins, onChange, onBusyChange });
  latest.current = { track, pins, onChange, onBusyChange };

  useEffect(
    () => () => {
      generation.current++;
      previews.current.forEach((release) => release());
      previews.current.clear();
    },
    [],
  );

  const commit = (next: SpatialPin[]) => {
    latest.current.pins = next;
    latest.current.onChange(next);
  };
  const discardPending = (id: string) => {
    previews.current.get(id)?.();
    previews.current.delete(id);
    setPending((items) => items.filter((item) => item.id !== id));
  };
  const receivePhotos = async (files: File[], source: "camera" | "gallery") => {
    if (inFlight.current) return;
    setError("");
    try {
      validatePhotoSelection(
        files,
        MAX_TRAIL_PHOTOS -
          reservedPhotoCount -
          latest.current.pins.filter((pin) => pin.photoDataUrl).length,
      );
    } catch (error) {
      setError((error as Error).message);
      return;
    }
    const batch = generation.current;
    inFlight.current = true;
    setBusy(true);
    latest.current.onBusyChange?.(true);
    const incoming: Array<PendingPhoto & { file: File }> = [];
    try {
      for (const file of files) {
        const preview = createPhotoPreview(file);
        const entry = {
          id: crypto.randomUUID(),
          name: file.name || "Trail photo",
          url: preview.url,
          file,
        };
        previews.current.set(entry.id, preview.release);
        incoming.push(entry);
      }
      setPending((items) => [...items, ...incoming]);
      const prepared: SpatialPin[] = [];
      for (const entry of incoming) {
        if (batch !== generation.current) break;
        try {
          const pin = await prepareTrailPhoto(
            entry.file,
            latest.current.track,
            initialIndex,
            source,
            liveRecording,
            placementCenter,
          );
          if (batch !== generation.current) break;
          prepared.push(pin);
          discardPending(entry.id);
        } catch (error) {
          if (batch !== generation.current) break;
          setPending((items) =>
            items.map((item) =>
              item.id === entry.id
                ? { ...item, error: (error as Error).message }
                : item,
            ),
          );
        }
      }
      if (batch === generation.current && prepared.length) {
        const placed = placeUnmatchedBatch(
          prepared,
          latest.current.track,
          initialIndex,
        );
        commit([...latest.current.pins, ...placed]);
        setSelected(placed[0].id);
      }
    } catch (error) {
      if (batch === generation.current) {
        incoming.forEach((entry) => discardPending(entry.id));
        setError((error as Error).message);
      }
    } finally {
      inFlight.current = false;
      if (batch === generation.current) {
        setBusy(false);
        latest.current.onBusyChange?.(false);
      }
    }
  };

  const active =
    pins.find((pin) => pin.id === selected) ?? pins[pins.length - 1];
  const updateActive = (updated: SpatialPin) =>
    commit(
      latest.current.pins.map((pin) => (pin.id === updated.id ? updated : pin)),
    );
  const addNote = () => {
    const pin = createFieldNote(
      { ...track, pins: latest.current.pins },
      initialIndex,
      placementCenter,
    );
    commit([...latest.current.pins, pin]);
    setSelected(pin.id);
  };

  return (
    <section
      className="photo-strip-drawer"
      aria-label="Trail photo and note editor"
      aria-busy={busy}
    >
      <MobileMediaButtons
        onFiles={(files, source) => void receivePhotos(files, source)}
        disabled={
          busy ||
          pins.filter((pin) => pin.photoDataUrl).length + reservedPhotoCount >=
            MAX_TRAIL_PHOTOS
        }
      />
      <div className="photo-strip-heading">
        <p className="eyebrow">Your pinned moments · {pins.length}</p>
        <button
          type="button"
          className="text-btn"
          disabled={busy}
          onClick={addNote}
        >
          <Plus size={16} /> Add field note
        </button>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {pending.length > 0 && (
        <div className="pending-photo-strip" aria-live="polite">
          {pending.map((item) => (
            <div className="pending-photo" key={item.id}>
              <img src={item.url} alt={`Preview of ${item.name}`} />
              <span>{item.error ? "Could not match" : "Matching photo…"}</span>
              {item.error && (
                <>
                  <p role="alert">{item.error}</p>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove failed ${item.name}`}
                    onClick={() => discardPending(item.id)}
                  >
                    <X size={18} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {pins.length > 0 ? (
        <>
          <div
            className="photo-strip-thumbnails"
            aria-label="Select a moment to edit"
          >
            {pins.map((pin, index) => (
              <button
                type="button"
                key={pin.id}
                aria-pressed={active?.id === pin.id}
                aria-label={`Edit moment ${index + 1}: ${pin.caption}`}
                className={active?.id === pin.id ? "selected" : ""}
                onClick={() => setSelected(pin.id)}
              >
                {pin.photoDataUrl ? (
                  <img src={pin.photoDataUrl} alt="" />
                ) : (
                  <MapPin size={24} />
                )}
                <span>{formatDistance(pin.cumDistKm, units)}</span>
              </button>
            ))}
          </div>
          {active && (
            <div className="photo-strip-editor">
              <PhotoPlacementMap
                track={track}
                active={active}
                pins={pins}
                onChange={updateActive}
                center={
                  placementCenter ??
                  (!track.points.length ? [active.lat, active.lng] : undefined)
                }
                onSelect={setSelected}
              />

              {active.photoDataUrl && (
                <img
                  className="selected-trail-photo"
                  src={active.photoDataUrl}
                  alt={active.caption || "Selected trail photo"}
                />
              )}
              <p
                className={`photo-match-badge match-${active.exifSource || "manual"}`}
              >
                {photoMatchDescription(active, units)}
              </p>
              {active.photoDataUrl && (
                <p className="photo-log-time">{photoTimeLabel(active)}</p>
              )}
              <label className="field-label">
                {active.photoDataUrl ? "Photo caption" : "Field note"}
                <textarea
                  aria-label={
                    active.photoDataUrl ? "Photo caption" : "Field note"
                  }
                  value={active.caption}
                  maxLength={1500}
                  onChange={(event) =>
                    updateActive({ ...active, caption: event.target.value })
                  }
                  placeholder="What will you remember?"
                />
              </label>
              <button
                type="button"
                className="text-btn remove-moment"
                disabled={busy}
                onClick={() =>
                  commit(
                    latest.current.pins.filter((pin) => pin.id !== active.id),
                  )
                }
              >
                <Trash2 size={16} /> Remove this moment
              </button>
            </div>
          )}
        </>
      ) : (
        !busy && (
          <div className="photo-strip-empty">
            <ImagesHint />
            <p>Snap a photo, pick your favorites, or write a field note.</p>
            <small>
              GPS matches first, then capture time. You can move every pin.
            </small>
          </div>
        )
      )}
    </section>
  );
}

function ImagesHint() {
  return (
    <div aria-hidden="true" className="photo-strip-empty-icon">
      ＋
    </div>
  );
}
