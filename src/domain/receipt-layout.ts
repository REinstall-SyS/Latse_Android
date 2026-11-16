import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import { formatElevation } from "./units";
export function photoCropRect(
  imageWidth: number,
  imageHeight: number,
  box: { x: number; y: number; w: number; h: number },
  focusY = 0.5,
  focusX = 0.5,
) {
  const scale = Math.max(box.w / imageWidth, box.h / imageHeight);
  const focus = (value: number) =>
    Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  return {
    x: box.x + (box.w - imageWidth * scale) * focus(focusX),
    y: box.y + (box.h - imageHeight * scale) * focus(focusY),
    w: imageWidth * scale,
    h: imageHeight * scale,
  };
}
export function fieldLogStamp(track: HikeTrack, config: ReceiptConfig): string {
  if (config.customQuote?.trim()) return config.customQuote.trim();
  const firstTimed = track.points.find(
    (p) => p.wallTime !== undefined || p.time !== undefined,
  );
  const date = new Date(
    firstTimed?.wallTime ?? firstTimed?.time ?? track.createdAt ?? 0,
  );
  const day =
    date.getTime() > 0
      ? date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Field log";
  return track.points.length
    ? `${day} · Summit ${formatElevation(track.stats.maxAltitudeM, config.units ?? "metric")}`
    : day;
}
