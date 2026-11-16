import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useEffect, useRef, useState } from "react";
import { MapPin, Trash2 } from "lucide-react";
import type { HikeTrack, SpatialPin, TrailPhoto } from "@/types/trek.types";
import { Dialog } from "@/components/shared/Dialog";
import { MobileMediaButtons } from "@/components/shared/MobileMediaButtons";
import { photoTimeLabel } from "@/domain/photo-time";
import {
  readTrailPhoto,
  positionTrailPhoto,
  validatePhotoSelection,
} from "@/services/mobile-media.service";
import { PhotoStripDrawer } from "./PhotoStripDrawer";
import { withLocatedPhotos } from "@/domain/photo-map";
import { placePhotoAtCoordinate } from "@/domain/photo-placement";

interface Props {
  track: HikeTrack;
  initialIndex?: number;
  focusPin?: string;
  liveRecording?: boolean;
  placementCenter?: [number, number];
  initialPins?: SpatialPin[];
  importedRoute?: boolean;
  initialPhotos?: TrailPhoto[];
  onSave: (pins: SpatialPin[], photos: TrailPhoto[]) => void | Promise<void>;
  onClose: () => void;
}

export function PhotoPinEditor({
  track,
  initialIndex = 0,
  focusPin: initialFocusPin,
  liveRecording = false,
  placementCenter,
  initialPins = [],
  importedRoute = false,
  initialPhotos = [],
  onSave,
  onClose,
}: Props) {
  const { units } = useUnits();
  const [located] = useState(() =>
    track.freeRoam
      ? withLocatedPhotos({
          ...track,
          pins: initialPins,
          unplacedPhotos: initialPhotos,
        })
      : { ...track, pins: initialPins, unplacedPhotos: initialPhotos },
  );
  const [pins, setPins] = useState(located.pins);
  const [focusPin, setFocusPin] = useState<string | undefined>(initialFocusPin);
  const [photos, setPhotos] = useState(located.unplacedPhotos ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const receive = async (files: File[], source: "camera" | "gallery") => {
    setBusy(true);
    setError("");
    try {
      validatePhotoSelection(files, 10 - photos.length);
      const incoming: TrailPhoto[] = [];
      for (const file of files)
        incoming.push(await readTrailPhoto(file, source));
      if (alive.current) setPhotos((current) => [...current, ...incoming]);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const place = (photo: TrailPhoto) => {
    const point = track.points[Math.min(initialIndex, track.points.length - 1)];
    if (!point && !track.freeRoam) return;
    const center = placementCenter ?? [
      pins[pins.length - 1]?.lat ?? 37.732,
      pins[pins.length - 1]?.lng ?? -119.558,
    ];
    const pin = point
      ? positionTrailPhoto(photo, track, initialIndex)
      : placePhotoAtCoordinate(
          {
            ...photo,
            lat: center[0],
            lng: center[1],
            ele: 0,
            cumDistKm: 0,
            exifSource: "manual",
          },
          track,
          photo.captureLocation?.lat ?? center[0],
          photo.captureLocation?.lng ?? center[1],
          false,
        );
    setPins((current) => [...current, pin]);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    setFocusPin(photo.id);
  };
  const mappedPhotos = pins.filter((pin) => pin.photoDataUrl);
  return (
    <Dialog
      title={importedRoute ? "Your hike, your moments" : "Your trail moments"}
      onClose={onClose}
    >
      <p className="sheet-intro">
        {track.points.length
          ? "Photos find their place by GPS or capture time. Add a caption and adjust the location if needed."
          : track.freeRoam
            ? "Tap the map to place your photos. No recorded trail is needed."
            : "No GPS fix yet? Keep the photo anyway. It stays in your hike album until you place it on a route."}
      </p>
      <fieldset className="moment-editor-fields" disabled={busy}>
        {track.points.length > 0 || track.freeRoam ? (
          <PhotoStripDrawer
            track={track}
            initialIndex={initialIndex}
            focusPin={focusPin}
            liveRecording={liveRecording}
            placementCenter={placementCenter}
            onUnplaced={(photo) => setPhotos((items) => [...items, photo])}
            pins={pins}
            reservedPhotoCount={photos.length}
            onChange={setPins}
            onBusyChange={setBusy}
          />
        ) : (
          <MobileMediaButtons
            onFiles={(files, source) => void receive(files, source)}
            disabled={busy || photos.length >= 10}
          />
        )}
        {mappedPhotos.length > 0 && (
          <details className="story-photo-picker">
            <summary>
              Storyboard photos ·{" "}
              {mappedPhotos.filter((pin) => !pin.storyboardHidden).length} of{" "}
              {mappedPhotos.length}
            </summary>
            <p>Choose the photos to overlay on your shared route.</p>
            {mappedPhotos.map((pin) => (
              <label key={pin.id}>
                <img src={pin.photoDataUrl} alt="" />
                <span>
                  {pin.caption}
                  <small>
                    {formatDistance(pin.cumDistKm, units)} ·{" "}
                    {photoTimeLabel(pin)}
                  </small>
                </span>
                <input
                  type="checkbox"
                  aria-label={`Include ${pin.caption} in storyboard`}
                  checked={!pin.storyboardHidden}
                  onChange={(e) => {
                    const hidden = !e.target.checked;
                    setPins((items) =>
                      items.map((item) =>
                        item.id === pin.id
                          ? { ...item, storyboardHidden: hidden }
                          : item,
                      ),
                    );
                  }}
                />
              </label>
            ))}
          </details>
        )}
        {photos.length > 0 && (
          <div className="unplaced-photos">
            <p className="eyebrow">ALBUM · LOCATION NOT SET</p>
            <p className="sheet-intro">
              {track.points.length
                ? "These photos have no matching route fix. Choose Place on trail to set a position yourself."
                : track.freeRoam
                  ? "Choose Place on map, then tap where the photo was taken."
                  : "These photos stay in your album while you wait for a route."}
            </p>
            {photos.map((photo) => (
              <article key={photo.id}>
                <img src={photo.photoDataUrl} alt={photo.caption} />
                <div>
                  <label className="field-label">
                    {photoTimeLabel(photo)}
                    <br />
                    Caption
                    <input
                      value={photo.caption}
                      maxLength={1500}
                      onChange={(e) =>
                        setPhotos((items) =>
                          items.map((item) =>
                            item.id === photo.id
                              ? { ...item, caption: e.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="inline-actions">
                    {(track.points.length > 0 || track.freeRoam) && (
                      <button className="text-btn" onClick={() => place(photo)}>
                        <MapPin size={16} />{" "}
                        {track.freeRoam ? "Place on map" : "Place on trail"}
                      </button>
                    )}
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${photo.caption}`}
                      onClick={() =>
                        setPhotos((items) =>
                          items.filter((item) => item.id !== photo.id),
                        )
                      }
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button
        className="primary-btn w-full mt-5"
        disabled={
          busy ||
          (!importedRoute &&
            !pins.length &&
            !photos.length &&
            !initialPins.length &&
            !initialPhotos.length)
        }
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onSave(
              pins.map((pin) => ({
                ...pin,
                caption: pin.caption.trim(),
              })),
              photos,
            );
            onClose();
          } catch (e) {
            if (alive.current) setError((e as Error).message);
          } finally {
            if (alive.current) setBusy(false);
          }
        }}
      >
        {busy
          ? "Preparing photos…"
          : importedRoute
            ? "Create receipt"
            : "Save moments"}
      </button>
    </Dialog>
  );
}
