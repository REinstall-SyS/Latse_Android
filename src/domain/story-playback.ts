import type { SpatialPin, TrackPoint } from "@/types/trek.types";
export interface StoryFrame {
  index: number;
  photo?: SpatialPin;
  delayMs: number;
  done: boolean;
}
/** Stateful cursor survives live point-array replacements and drains every final-point photo. */
export class StoryPlayback {
  index = 0;
  finished = false;
  private shown = new Set<string>();
  next(points: TrackPoint[], pins: SpatialPin[]): StoryFrame | null {
    if (!points.length) return null;
    const index = Math.min(this.index, points.length - 1),
      final = index === points.length - 1;
    const photo = [...pins]
      .filter((pin) => pin.photoDataUrl && !this.shown.has(pin.id))
      .sort((a, b) => a.cumDistKm - b.cumDistKm)
      .find((pin) => final || pin.cumDistKm <= points[index].cumDistKm);
    if (photo) {
      this.shown.add(photo.id);
      this.finished = false;
      return { index, photo, delayMs: 1800, done: false };
    }
    this.finished = final;
    if (!final) this.index = index + 1;
    return { index, delayMs: Math.max(50, 18000 / points.length), done: final };
  }
}
