import React from "react";
import type { TrackPoint } from "@/types/trek.types";
import { smoothCurve } from "@/domain/cartography";
export function elevationGeometry(
  points: TrackPoint[],
  width = 600,
  height = 150,
) {
  let min = Infinity,
    max = -Infinity;
  for (const p of points) {
    min = Math.min(min, p.ele);
    max = Math.max(max, p.ele);
  }
  const first = points[0]?.cumDistKm || 0,
    span = Math.max(0.001, (points[points.length - 1]?.cumDistKm || 0) - first);
  const x = (distance: number) =>
    6 + ((distance - first) / span) * (width - 12);
  const y = (ele: number) =>
    max === min
      ? height / 2
      : height - 12 - ((ele - min) / (max - min)) * (height - 24);
  const stride = Math.max(1, Math.ceil(points.length / 600));
  const samples = points.filter(
    (_, i) => i % stride === 0 || i === points.length - 1,
  );
  const chart = samples.map((point) => ({
    x: x(point.cumDistKm),
    y: y(point.ele),
  }));
  const line = chart.length
    ? `M${chart[0].x.toFixed(2)},${chart[0].y.toFixed(2)} ` +
      smoothCurve(chart)
        .map(
          (point) =>
            `C${point.c1x.toFixed(2)},${point.c1y.toFixed(2)} ${point.c2x.toFixed(2)},${point.c2y.toFixed(2)} ${point.x.toFixed(2)},${point.y.toFixed(2)}`,
        )
        .join(" ")
    : "";
  return { line, area: `${line} L${width - 6},${height} L6,${height} Z`, x, y };
}
export function TrackGraphic({
  points,
  large = false,
}: {
  points: TrackPoint[];
  large?: boolean;
}) {
  const geometry = elevationGeometry(points);
  return (
    <svg
      viewBox="0 0 600 150"
      aria-hidden="true"
      className={large ? "track-graphic large" : "track-graphic"}
    >
      <path d={geometry.area} fill="currentColor" opacity=".12" />
      <path
        d={geometry.line}
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
    </svg>
  );
}
