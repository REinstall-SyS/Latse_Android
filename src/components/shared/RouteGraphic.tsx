import React, { useMemo } from "react";
import { projectRoute } from "@/domain/cartography";
import type { TrackPoint } from "@/types/trek.types";

export function RouteGraphic({
  points,
  className = "",
}: {
  points: TrackPoint[];
  className?: string;
}) {
  const route = useMemo(() => projectRoute(points, 200, 140, 18), [points]);
  if (!route.length) return null;
  return (
    <svg
      viewBox="0 0 200 140"
      className={`route-graphic ${className}`}
      aria-hidden="true"
    >
      <path
        d={route
          .map(
            (point, index) =>
              `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`,
          )
          .join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={route[0].x} cy={route[0].y} r="4" fill="currentColor" />
      <circle
        cx={route[route.length - 1].x}
        cy={route[route.length - 1].y}
        r="4"
        fill="var(--surface)"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
