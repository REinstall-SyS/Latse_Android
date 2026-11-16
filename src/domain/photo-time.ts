import type { TrailPhoto } from "@/types/trek.types";

export function photoTimeLabel(
  photo: Pick<TrailPhoto, "timestamp" | "timeSource">,
): string {
  const time = new Date(photo.timestamp);
  if (!photo.timeSource || !photo.timestamp || !Number.isFinite(time.getTime()))
    return "Capture time unavailable";
  const prefix =
    photo.timeSource === "exif"
      ? "Captured"
      : photo.timeSource === "camera"
        ? "Camera time (approx.)"
        : "File modified";
  return (
    prefix +
    " · " +
    time.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    })
  );
}
