import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import type { UnitSystem } from "@/domain/units";
import { trackCover } from "@/data/landscape-covers";
import { printSubtitle } from "@/domain/print-design";
import { studioCoverKey } from "./studio-cover.service";
export const studioConfigKey = (trackId: string) =>
  `latse_studio_cfg_${trackId}`;
export function defaultStudioConfig(
  track: HikeTrack,
  units: UnitSystem,
): ReceiptConfig {
  return {
    template: "editorial",
    aspectRatio: "4:5",
    title: track.name,
    subtitle: printSubtitle(track, track.region),
    showElevationCurve: true,
    showRouteMiniMap: true,
    showDaylightAndPace: false,
    privacyTrimMeters: 0,
    titleTypeface: "serif",
    showBranding: true,
    showBadge: false,
    showStats: true,
    units,
  };
}
export function loadStudioConfig(
  track: HikeTrack,
  units: UnitSystem,
  storage?: Pick<Storage, "getItem">,
): ReceiptConfig {
  const config = defaultStudioConfig(track, units);
  try {
    const value = JSON.parse(
      (storage ?? localStorage).getItem(studioConfigKey(track.id)) ?? "null",
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      return config;
    if (["editorial", "topo-card", "brutalist"].includes(value.template))
      config.template = value.template;
    if (["9:16", "4:5"].includes(value.aspectRatio))
      config.aspectRatio = value.aspectRatio;
    for (const key of ["title", "subtitle", "customQuote"] as const)
      if (typeof value[key] === "string")
        config[key] = value[key].slice(0, key === "customQuote" ? 150 : 160);
    for (const key of [
      "showElevationCurve",
      "showRouteMiniMap",
      "showDaylightAndPace",
    ] as const)
      if (typeof value[key] === "boolean") config[key] = value[key];
    for (const axis of ["photoFocusX", "photoFocusY"] as const)
      if (typeof value[axis] === "number" && Number.isFinite(value[axis]))
        config[axis] = Math.max(0, Math.min(1, value[axis]));
    if (
      typeof value.storyLeadPhotoId === "string" &&
      value.storyLeadPhotoId.length > 0
    )
      config.storyLeadPhotoId = value.storyLeadPhotoId.slice(0, 180);
    if (
      typeof value.privacyTrimMeters === "number" &&
      Number.isFinite(value.privacyTrimMeters) &&
      value.privacyTrimMeters >= 0
    )
      config.privacyTrimMeters = value.privacyTrimMeters;
    if (
      value.backgroundPhotoUrl === null ||
      (typeof value.backgroundPhotoUrl === "string" &&
        (/^\/images\/[a-z0-9._-]+$/i.test(value.backgroundPhotoUrl) ||
          /^data:image\/(jpeg|png|webp);base64,[a-z0-9+/=\r\n]+$/i.test(
            value.backgroundPhotoUrl,
          )))
    )
      config.backgroundPhotoUrl = value.backgroundPhotoUrl;
    // Older editions saved the suggested cover as if it were chosen. Preserve
    // uploaded covers and explicit choices, while letting the old default adapt.
    if (
      value.coverSelection !== "explicit" &&
      config.backgroundPhotoUrl === trackCover(track)
    )
      config.backgroundPhotoUrl = undefined;
    if (value.coverPhotoId === studioCoverKey(track.id)) {
      config.coverPhotoId = value.coverPhotoId;
      config.backgroundPhotoUrl = null;
    }
    if (value.titleTypeface === "serif" || value.titleTypeface === "sans")
      config.titleTypeface = value.titleTypeface;
    for (const key of ["showBranding", "showBadge", "showStats"] as const)
      if (typeof value[key] === "boolean") config[key] = value[key];
    if (
      value.copy &&
      typeof value.copy === "object" &&
      !Array.isArray(value.copy)
    ) {
      config.copy = {};
      for (const key of [
        "signature",
        "eyebrow",
        "date",
        "badgeTitle",
        "badgeNote",
        "routeHeading",
        "profileHeading",
        "momentsHeading",
        "footer",
        "startLabel",
      ] as const)
        if (typeof value.copy[key] === "string")
          config.copy[key] = value.copy[key].slice(0, 160);
    }
  } catch {
    /* Corrupt or blocked storage uses a usable default edition. */
  }
  return config;
}
export function saveStudioConfig(
  trackId: string,
  config: ReceiptConfig,
  storage?: Pick<Storage, "setItem">,
): void {
  (storage ?? localStorage).setItem(
    studioConfigKey(trackId),
    JSON.stringify({
      ...config,
      ...(config.coverPhotoId ? { backgroundPhotoUrl: null } : {}),
      ...(config.backgroundPhotoUrl !== undefined
        ? { coverSelection: "explicit" }
        : {}),
    }),
  );
}
