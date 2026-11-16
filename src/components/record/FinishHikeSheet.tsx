import React, { useState } from "react";
import { Check, Image, Map, Bookmark } from "lucide-react";
import type { HikeTrack, SaveDestination } from "@/types/trek.types";
import { Dialog } from "@/components/shared/Dialog";
import { formatDistance } from "@/domain/units";
import { useUnits } from "@/hooks/useUnits";
export function FinishHikeSheet({
  track,
  busy,
  error,
  onSave,
  onClose,
}: {
  track: HikeTrack;
  busy: boolean;
  error: string;
  onSave: (destination: SaveDestination, name: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const { units } = useUnits();
  const [name, setName] = useState(track.name),
    [destination, setDestination] = useState<SaveDestination>("receipt");
  return (
    <Dialog
      title="How would you like to keep it?"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="sheet-intro">
        {track.points.length
          ? formatDistance(track.stats.totalDistKm, units) + " outdoors. "
          : "Your time and photos are ready. "}
        Your full hike is saved in My Hikes with every choice.
      </p>
      <label className="field-label">
        Hike name
        <input
          value={name}
          maxLength={100}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div
        className="finish-choices"
        role="group"
        aria-label="How to save this hike"
      >
        {(
          [
            [
              "receipt",
              "Make a keepsake",
              "A personal print with your words and photos.",
              Image,
            ],
            [
              "map",
              "Create a photo map",
              "An interactive map and a picture to share.",
              Map,
            ],
            [
              "library",
              "Just save my hike",
              "Keep the route and photos. Create something later.",
              Bookmark,
            ],
          ] as const
        ).map(([id, title, detail, Icon]) => (
          <button
            key={id}
            className="finish-choice"
            disabled={busy}
            aria-pressed={destination === id}
            onClick={() => setDestination(id)}
          >
            <Icon size={22} />
            <span>
              <strong>{title}</strong>
              <small>{detail}</small>
            </span>
            <span className="choice-check">
              {destination === id && <Check size={16} />}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-btn w-full"
        disabled={busy}
        onClick={() => void onSave(destination, name.trim() || "My hike")}
      >
        {busy
          ? "Saving…"
          : destination === "library"
            ? "Save to My Hikes"
            : "Save & customize"}
      </button>
      <button
        className="text-btn w-full mt-3"
        disabled={busy}
        onClick={onClose}
      >
        Back to my hike
      </button>
    </Dialog>
  );
}
