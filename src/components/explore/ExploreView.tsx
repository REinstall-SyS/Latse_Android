import { useUnits } from "@/hooks/useUnits";
import { formatDistance, formatElevation } from "@/domain/units";
import { formatTrailTime } from "@/domain/trail-navigation";
import { printSubtitle } from "@/domain/print-design";
import React, { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Camera,
  ChevronDown,
  Footprints,
  Plus,
  Sparkles,
} from "lucide-react";
import type { HikeTrack, ViewId } from "@/types/trek.types";
import { RouteGraphic } from "@/components/shared/RouteGraphic";
import { trackCover, trackKind } from "@/data/landscape-covers";
import { RouteImporterSheet } from "./RouteImporterSheet";
import { TrailLibrarySheet } from "./TrailLibrarySheet";
interface Props {
  track: HikeTrack;
  tracks: HikeTrack[];
  savedIds: string[];
  onSelect: (id: string) => void;
  onSave: (track: HikeTrack) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
  onNavigate: (view: ViewId) => void;
}
export function ExploreView({
  track,
  tracks,
  savedIds,
  onSelect,
  onSave,
  onRemove,
  onNavigate,
}: Props) {
  const { units } = useUnits();
  const [library, setLibrary] = useState(false);
  const [importer, setImporter] = useState(false);
  const moments =
    track.pins.filter((pin) => pin.photoDataUrl).length +
    (track.unplacedPhotos?.length ?? 0);
  const cover =
    track.source === "preset" || moments > 0 ? trackCover(track) : null;
  const location = printSubtitle(track, track.region);
  const elevation = !track.elevationEstimated && track.stats.elevationGainM > 0;
  return (
    <section className="home-screen" aria-label="Trails">
      <div className="home-heading">
        <div>
          <p className="eyebrow">YOUR TRAILS</p>
          <h1>
            A little further<span>.</span>
          </h1>
        </div>
        <button
          className="icon-btn"
          aria-label="Open trail library"
          onClick={() => setLibrary(true)}
        >
          <BookOpen size={22} />
        </button>
      </div>
      <article className={`journey-hero ${cover ? "" : "journey-illustrated"}`}>
        {cover ? (
          <img className="journey-cover" src={cover} alt="" />
        ) : (
          <div className="journey-route">
            <RouteGraphic points={track.points} />
          </div>
        )}
        <div className="journey-shade" />
        <div className="journey-topline">
          <span>{trackKind(track)}</span>
          <button onClick={() => setLibrary(true)}>
            Switch trail <ChevronDown size={14} />
          </button>
        </div>
        <div className="journey-title">
          <h2>{track.name}</h2>
          {location && <p>{location}</p>}
          <div className="journey-stats">
            <span>
              {track.timedSession
                ? formatTrailTime(track.stats.durationSec)
                : formatDistance(track.stats.totalDistKm, units)}
            </span>
            {elevation && (
              <>
                <i />
                <span>
                  {formatElevation(track.stats.elevationGainM, units, true)}
                </span>
              </>
            )}
            {moments > 0 && (
              <>
                <i />
                <span>
                  <Camera size={13} /> {moments}{" "}
                  {moments === 1 ? "photo" : "photos"}
                </span>
              </>
            )}
          </div>
        </div>
      </article>
      <div className="home-primary-row">
        <button
          className="primary-btn"
          onClick={() => onNavigate(track.timedSession ? "studio" : "map")}
        >
          {track.timedSession ? "Open your memory" : "Explore this trail"}
          <ArrowUpRight size={18} />
        </button>
        <button className="secondary-btn" onClick={() => setImporter(true)}>
          <Plus size={18} /> Add route
        </button>
      </div>
      <div className="home-destinations">
        <button onClick={() => onNavigate("record")}>
          <span className="destination-icon">
            <Footprints size={21} />
          </span>
          <div>
            <strong>Record a walk</strong>
            <p>Keep your route and photos together.</p>
          </div>
          <ArrowUpRight size={18} />
        </button>
        <button onClick={() => onNavigate("studio")}>
          <span className="destination-icon studio-icon">
            <Sparkles size={21} />
          </span>
          <div>
            <strong>Create a keepsake</strong>
            <p>A photograph, a route, your own words.</p>
          </div>
          <ArrowUpRight size={18} />
        </button>
      </div>
      <button className="home-library-link" onClick={() => setLibrary(true)}>
        <BookOpen size={17} />
        <span>
          Your library{" "}
          <small>{savedIds.length} saved · 3 inspiration routes</small>
        </span>
        <ArrowUpRight size={17} />
      </button>
      {library && (
        <TrailLibrarySheet
          track={track}
          tracks={tracks}
          savedIds={savedIds}
          onSelect={onSelect}
          onRemove={onRemove}
          onClose={() => setLibrary(false)}
        />
      )}
      {importer && (
        <RouteImporterSheet
          reference={
            track.points.length
              ? track
              : tracks.find((item) => item.points.length)!
          }
          onImport={onSave}
          onClose={() => setImporter(false)}
        />
      )}
    </section>
  );
}
