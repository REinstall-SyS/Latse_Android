import type { HikeTrack } from "@/types/trek.types";

export const landscapeCovers = [
  {
    id: "alpine",
    name: "Alpenglow",
    url: "/images/alpine.jpg",
    credit: "Daniel Mirlea / Unsplash",
    location: "Dolomites",
  },
  {
    id: "valley",
    name: "Blue hour",
    url: "/images/valley.jpg",
    credit: "jms / Unsplash",
    location: "Yosemite Valley",
  },
  {
    id: "woodland",
    name: "Forest light",
    url: "/images/woodland.jpg",
    credit: "Mike Tilley / Unsplash",
    location: "Misty woodland",
  },
] as const;
export function trackCover(track: HikeTrack): string {
  return (
    track.pins.find((pin) => pin.photoDataUrl)?.photoDataUrl ||
    track.unplacedPhotos?.[0]?.photoDataUrl ||
    landscapeCovers[
      track.id.includes("half-dome")
        ? 1
        : track.stats.maxAltitudeM > 700
          ? 0
          : 2
    ].url
  );
}
export function trackKind(track: HikeTrack): string {
  return track.timedSession
    ? "Timed memory"
    : track.source === "preset"
      ? "Illustrative route"
      : track.source === "planned"
        ? "Route plan"
        : "Your field log";
}
