import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useState } from "react";
import { Check, Search, Trash2 } from "lucide-react";
import type { HikeTrack } from "@/types/trek.types";
import { Dialog } from "@/components/shared/Dialog";
import { RouteGraphic } from "@/components/shared/RouteGraphic";
import { trackKind } from "@/data/landscape-covers";

interface Props {
  track: HikeTrack;
  tracks: HikeTrack[];
  savedIds?: string[];
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void | Promise<void>;
  onClose: () => void;
}
export function TrailLibrarySheet({
  track,
  tracks,
  savedIds = [],
  onSelect,
  onRemove,
  onClose,
}: Props) {
  const { units } = useUnits();
  const [filter, setFilter] = useState<"mine" | "inspiration">(
    tracks.some((item) => item.source !== "preset") ? "mine" : "inspiration",
  );
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const items = tracks.filter(
    (item) =>
      (filter === "inspiration"
        ? item.source === "preset"
        : item.source !== "preset" || savedIds.includes(item.id)) &&
      `${item.name} ${item.region}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <Dialog title="Your trail library" onClose={onClose}>
      <div className="library-search">
        <Search size={18} />
        <input
          aria-label="Search trails"
          placeholder="Find a trail or a memory"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="segmented-control library-tabs">
        {(
          [
            ["mine", "My hikes"],
            ["inspiration", "Inspiration"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={filter === id ? "selected" : ""}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="sheet-intro">
        {filter === "inspiration"
          ? "Three sample journeys to explore the Studio. Use a verified route for navigation."
          : "Your recorded walks, imports, and route plans. Stored on this device."}
      </p>
      <div className="library-roster">
        {items.map((item) => (
          <article key={item.id}>
            <button
              className="library-select"
              aria-pressed={item.id === track.id}
              onClick={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              <RouteGraphic points={item.points} />
              <div>
                <small>{trackKind(item)}</small>
                <h2>{item.name}</h2>
                <p>{item.region}</p>
                <b>
                  {item.timedSession
                    ? `${Math.round((item.stats.durationSec ?? 0) / 60)} min outdoors`
                    : `${formatDistance(item.stats.totalDistKm, units)} · +${formatElevation(item.stats.elevationGainM, units)}`}
                </b>
              </div>
              {item.id === track.id && <Check size={18} />}
            </button>
            {onRemove && savedIds.includes(item.id) && (
              <button
                className="icon-btn"
                aria-label={`Delete saved ${item.name}`}
                onClick={() => setRemoving(item.id)}
              >
                <Trash2 size={17} />
              </button>
            )}
            {removing === item.id && (
              <div className="library-delete-confirm">
                <p>Remove this saved hike and its photos from this device?</p>
                <button
                  className="secondary-btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onRemove?.(item.id);
                      setRemoving(undefined);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Remove hike
                </button>
                <button
                  className="text-btn"
                  onClick={() => setRemoving(undefined)}
                >
                  Keep it
                </button>
              </div>
            )}
          </article>
        ))}
        {!items.length && (
          <div className="empty-library">
            <strong>Your next walk belongs here.</strong>
            <p>Add a route or record a hike to begin your collection.</p>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </Dialog>
  );
}
