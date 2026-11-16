import React, { useRef } from "react";
import { Camera, Images } from "lucide-react";
import { openMobileMediaPicker } from "@/services/mobile-media.service";

interface Props {
  onFiles: (files: File[], source: "camera" | "gallery") => void;
  disabled?: boolean;
  multiple?: boolean;
}

export function MobileMediaButtons({
  onFiles,
  disabled = false,
  multiple = true,
}: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const receive = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length)
      onFiles(
        files,
        event.currentTarget === camera.current ? "camera" : "gallery",
      );
  };
  return (
    <div className="mobile-media-actions">
      <button
        type="button"
        className="media-action camera-action"
        disabled={disabled}
        onClick={() =>
          camera.current &&
          openMobileMediaPicker(camera.current, "camera", false)
        }
      >
        <Camera size={24} />
        <span>
          <strong>Snap Trail Photo</strong>
          <small>Capture this moment</small>
        </span>
      </button>
      <button
        type="button"
        className="media-action"
        disabled={disabled}
        onClick={() =>
          gallery.current &&
          openMobileMediaPicker(gallery.current, "gallery", multiple)
        }
      >
        <Images size={24} />
        <span>
          <strong>Pick from Gallery</strong>
          <small>
            {multiple ? "Choose up to 10 photos" : "Choose a photo"}
          </small>
        </span>
      </button>
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={receive}
        aria-label="Capture trail photo"
      />
      <input
        ref={gallery}
        hidden
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={receive}
        aria-label="Choose trail photos"
      />
    </div>
  );
}
