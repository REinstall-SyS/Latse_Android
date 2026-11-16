import React from "react";
import { ImagePlus } from "lucide-react";
import { MobileMediaButtons } from "@/components/shared/MobileMediaButtons";
import { landscapeCovers } from "@/data/landscape-covers";
import {
  STORYBOARD_PHOTO_LIMIT,
  storyboardPhotoChoices,
  studioCoverPreview,
} from "@/services/receipt-canvas.service";
import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import { StudioEditor } from "./StudioEditor";

export function StudioPhotoSheet({
  track,
  config,
  mode,
  busy,
  error,
  onChange,
  onFiles,
  onMoments,
  onClose,
}: {
  track: HikeTrack;
  config: ReceiptConfig;
  mode: "receipt" | "map";
  busy: boolean;
  error: string;
  onChange: <K extends keyof ReceiptConfig>(
    key: K,
    value: ReceiptConfig[K],
  ) => void;
  onFiles: (files: File[]) => void;
  onMoments: () => void;
  onClose: () => void;
}) {
  const isKeepsake = mode === "receipt";
  const cover = isKeepsake ? studioCoverPreview(track, config) : null;
  const album = [...track.pins, ...(track.unplacedPhotos ?? [])].filter(
    (photo) => photo.photoDataUrl,
  );
  const moments = isKeepsake ? [] : storyboardPhotoChoices(track);
  const lead =
    moments.find((photo) => photo.id === config.storyLeadPhotoId) ?? moments[0];
  const showCrop = isKeepsake ? Boolean(cover) : Boolean(lead);

  return (
    <StudioEditor
      title={isKeepsake ? "Cover photo & crop" : "Photo crop"}
      onClose={onClose}
    >
      {isKeepsake ? (
        <>
          {cover && (
            <img
              className="studio-cover-proof"
              src={cover}
              alt="Selected cover photo"
              style={{
                objectPosition: `${(config.photoFocusX ?? 0.5) * 100}% ${(config.photoFocusY ?? 0.5) * 100}%`,
              }}
            />
          )}
          <MobileMediaButtons
            multiple={false}
            disabled={busy}
            onFiles={onFiles}
          />
          {album.length > 0 && (
            <div
              className="studio-photo-choices"
              role="group"
              aria-label="Hike photos"
            >
              {album.map((photo) => (
                <button
                  key={photo.id}
                  disabled={busy}
                  aria-label={`Photo backdrop: ${photo.caption}`}
                  aria-pressed={cover === photo.photoDataUrl}
                  onClick={() =>
                    onChange("backgroundPhotoUrl", photo.photoDataUrl)
                  }
                >
                  <img src={photo.photoDataUrl} alt="" />
                </button>
              ))}
            </div>
          )}
          <div className="studio-cover-actions">
            {config.backgroundPhotoUrl !== undefined && (
              <button
                className="text-btn"
                disabled={busy}
                onClick={() => onChange("backgroundPhotoUrl", undefined)}
              >
                Use my hike photos
              </button>
            )}
            {config.backgroundPhotoUrl !== null && (
              <button
                className="text-btn"
                disabled={busy}
                onClick={() => onChange("backgroundPhotoUrl", null)}
              >
                Use a route illustration instead
              </button>
            )}
          </div>
        </>
      ) : moments.length > 0 ? (
        <>
          <p className="sheet-intro">
            {moments.length > STORYBOARD_PHOTO_LIMIT
              ? `The print uses up to ${STORYBOARD_PHOTO_LIMIT} photos. `
              : ""}
            Choose the lead photo.
          </p>
          <div
            className="studio-photo-choices"
            role="group"
            aria-label="Lead photo"
          >
            {moments.map((photo, index) => (
              <button
                key={photo.id}
                aria-pressed={lead.id === photo.id}
                aria-label={`Lead photo: ${photo.caption || `Photo ${index + 1}`}`}
                onClick={() => onChange("storyLeadPhotoId", photo.id)}
              >
                <img src={photo.photoDataUrl} alt="" />
              </button>
            ))}
          </div>
        </>
      ) : (
        <button className="secondary-btn w-full" onClick={onMoments}>
          <ImagePlus size={17} /> Add photos
        </button>
      )}
      {showCrop && (
        <div className="studio-crop-controls">
          {(
            [
              ["photoFocusY", "Vertical crop", ["Top", "Center", "Bottom"]],
              ["photoFocusX", "Horizontal crop", ["Left", "Center", "Right"]],
            ] as const
          ).map(([key, title, names]) => (
            <div
              key={key}
              className="crop-focus"
              role="group"
              aria-label={title}
            >
              <span>{title}</span>
              {names.map((name, index) => (
                <button
                  key={name}
                  aria-pressed={(config[key] ?? 0.5) === index / 2}
                  onClick={() => onChange(key, index / 2)}
                >
                  {name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      {isKeepsake && (
        <details className="studio-details">
          <summary>Landscape covers</summary>
          <div className="landscape-cover-grid">
            {landscapeCovers.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                aria-label={`${item.name} cover`}
                aria-pressed={cover === item.url}
                onClick={() => onChange("backgroundPhotoUrl", item.url)}
              >
                <img src={item.url} alt="" />
                <strong>{item.name}</strong>
                <small>{item.credit}</small>
              </button>
            ))}
          </div>
        </details>
      )}
      {busy && (
        <p role="status" className="sheet-intro">
          Opening your cover…
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </StudioEditor>
  );
}
