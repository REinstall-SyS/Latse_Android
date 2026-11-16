import type {
  HikeTrack,
  PrintCopy,
  PrintTypeface,
  ReceiptConfig,
} from "@/types/trek.types";
import { landscapeCovers, trackCover } from "@/data/landscape-covers";
import { fieldLogStamp } from "./receipt-layout";
export const KEEPSAKE_STYLES = [
  { id: "editorial", name: "Postcard", description: "Photo & paper" },
  { id: "topo-card", name: "Atlas", description: "Illustrated route" },
  { id: "brutalist", name: "Afterlight", description: "Full-bleed" },
] as const;

export function printProvenance(track: HikeTrack): string {
  if (track.source === "planned") return "Route plan";
  if (track.source === "preset") return "Sample route";
  return "";
}

export function printSubtitle(track: HikeTrack, subtitle: string): string {
  const generated = [
    "Quick route · straight-line plan",
    "A path of your own",
    "Shared trail",
  ];
  return subtitle === track.region && generated.includes(subtitle)
    ? ""
    : subtitle.trim();
}

export function printCover(track: HikeTrack, config: ReceiptConfig) {
  if (config.backgroundPhotoUrl !== undefined) return config.backgroundPhotoUrl;
  const photo = [...track.pins, ...(track.unplacedPhotos ?? [])].find(
    (moment) => moment.photoDataUrl && !moment.storyboardHidden,
  );
  return (
    photo?.photoDataUrl ??
    (track.source === "preset" ? trackCover(track) : null)
  );
}

export function coverCredit(url: string | null) {
  return landscapeCovers.find((cover) => cover.url === url)?.location;
}

export const PRINT_FONTS: Record<PrintTypeface, string> = {
  serif: '"DM Serif Display", Georgia, serif',
  sans: '"DM Sans", Arial, sans-serif',
};
export function printCopy(track: HikeTrack, config: ReceiptConfig): PrintCopy {
  return {
    signature: "LATSE",
    eyebrow: "",
    date: fieldLogStamp(track, { ...config, customQuote: "" }).split(
      " · Summit",
    )[0],
    badgeTitle: "",
    badgeNote: "",
    routeHeading: "Route",
    profileHeading: "Elevation",
    momentsHeading: "",
    footer: "",
    startLabel: "",
    ...config.copy,
  };
}
