import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useId, useMemo, useRef } from "react";
import { Camera, ChevronDown, Navigation } from "lucide-react";
import type { HikeTrack, SpatialPin } from "@/types/trek.types";
import { elevationGeometry } from "@/components/shared/TrackGraphic";
import {
  formatTrailTime,
  ghostArrivalSeconds,
  trailIndexAtDistance,
} from "@/domain/trail-navigation";
interface Props {
  track: HikeTrack;
  index: number;
  onSelect: (index: number) => void;
  onPin: () => void;
  selectedPin?: SpatialPin;
  userDistanceKm?: number;
  ghostDistanceKm?: number;
  following?: boolean;
  onFollow?: () => void;
  onCollapse?: () => void;
}
export function ElevationScrubber({
  track,
  index,
  onSelect,
  onPin,
  selectedPin,
  userDistanceKm,
  ghostDistanceKm,
  following,
  onFollow,
  onCollapse,
}: Props) {
  const { units } = useUnits();
  const svg = useRef<SVGSVGElement>(null),
    id = useId().replace(/:/g, "");
  const geometry = useMemo(
    () => elevationGeometry(track.points, 600, 150),
    [track.points],
  );
  const point =
    track.points[Math.max(0, Math.min(index, track.points.length - 1))];
  if (!point) return null;
  const choose = (clientX: number) => {
    const bounds = svg.current!.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (((clientX - bounds.left) / bounds.width) * 600 - 6) / 588),
    );
    onSelect(
      trailIndexAtDistance(
        track.points,
        track.points[0].cumDistKm +
          fraction *
            (track.points[track.points.length - 1].cumDistKm -
              track.points[0].cumDistKm),
      ),
    );
  };
  const marker = (distance: number | undefined, color: string) => {
    if (distance === undefined) return null;
    const p = track.points[trailIndexAtDistance(track.points, distance)];
    return (
      <circle
        cx={geometry.x(distance)}
        cy={geometry.y(p.ele)}
        r="6"
        fill={color}
        stroke="white"
        strokeWidth="2"
      />
    );
  };
  return (
    <section className="elevation-dock" aria-label="Elevation scrubber">
      <div className="elevation-dock-header">
        <div className="scrub-point-metrics">
          <strong>{formatElevation(point.ele, units)}</strong>
          <span>{formatDistance(point.cumDistKm, units)}</span>
          <span>
            {point.gradePct > 0 ? "+" : ""}
            {point.gradePct.toFixed(0)}%
          </span>
        </div>
        <div className="elevation-dock-actions">
          {onFollow && (
            <button
              className={following ? "dock-follow selected" : "dock-follow"}
              aria-label={
                following ? "Following your position" : "Follow your position"
              }
              onClick={onFollow}
            >
              <Navigation size={16} />
            </button>
          )}
          <button
            className="dock-pin"
            aria-label="Add trail moments"
            onClick={onPin}
          >
            <Camera size={18} />
          </button>
          {onCollapse && (
            <button
              className="dock-collapse"
              onClick={onCollapse}
              aria-label="Collapse elevation scrubber"
            >
              Collapse <ChevronDown size={14} />
            </button>
          )}
        </div>
      </div>
      <svg
        ref={svg}
        className="elevation-touch-chart"
        viewBox="0 0 600 150"
        preserveAspectRatio="none"
        aria-label="Interactive elevation profile"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={track.points.length - 1}
        aria-valuenow={Math.max(0, Math.min(index, track.points.length - 1))}
        aria-valuetext={`${formatDistance(point.cumDistKm, units)} · ${formatElevation(point.ele, units)}`}
        onKeyDown={(event) => {
          const offset = event.shiftKey ? 10 : 1;
          const next =
            event.key === "ArrowLeft"
              ? index - offset
              : event.key === "ArrowRight"
                ? index + offset
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? track.points.length - 1
                    : null;
          if (next !== null) {
            event.preventDefault();
            onSelect(Math.max(0, Math.min(track.points.length - 1, next)));
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          choose(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) choose(e.clientX);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#C96E0C" stopOpacity=".28" />
            <stop offset="1" stopColor="#C96E0C" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geometry.area} fill={`url(#${id})`} />
        <path d={geometry.line} fill="none" stroke="#C96E0C" strokeWidth="3" />
        {track.pins.map((pin) => (
          <circle
            key={pin.id}
            cx={geometry.x(pin.cumDistKm)}
            cy={geometry.y(pin.ele)}
            r={selectedPin?.id === pin.id ? 8 : 5}
            fill={selectedPin?.id === pin.id ? "#C96E0C" : "#F5F2EB"}
            stroke="#554F45"
            strokeWidth="2"
          />
        ))}
        <line
          x1={geometry.x(point.cumDistKm)}
          x2={geometry.x(point.cumDistKm)}
          y1="0"
          y2="150"
          stroke="#C96E0C"
          opacity=".7"
        />
        <circle
          cx={geometry.x(point.cumDistKm)}
          cy={geometry.y(point.ele)}
          r="6"
          fill="#C96E0C"
          stroke="white"
          strokeWidth="2"
        />
        {marker(ghostDistanceKm, "#6F60A4")}
        {marker(userDistanceKm, "#3477B9")}
      </svg>
      <div className="elevation-dock-footer">
        <span>{formatDistance(track.points[0].cumDistKm, units)}</span>
        <span>
          {selectedPin
            ? `Moment / ${selectedPin.caption}`
            : `Ghost arrival · ${formatTrailTime(ghostArrivalSeconds(point.cumDistKm, track))}`}
        </span>
        <span>{formatDistance(track.stats.totalDistKm, units)}</span>
      </div>
    </section>
  );
}
