import type { UnitSystem } from "@/domain/units";

export interface Telemetry {
  alt: number | null;
  distanceWalkedKm: string;
}

export interface DaylightStatus {
  /** UTC is explicit because a route may be in a different time zone from the device. */
  sunsetTimeStr: string;
  daylightRemainingMin: number;
  isAfterSunset: boolean;
}

export interface TrailEffortMetrics {
  verticalRateMh: number;
  paceMinPerKm: string;
}

export interface BreadcrumbState {
  fixes: Array<{ lat: number; lng: number; ts: number }>;
  totalKm: number;
}

export interface TrackPoint {
  lat: number;
  lng: number;
  ele: number;
  time?: number;
  /** Original GPS capture time, independent of the pause-safe moving timeline. */
  wallTime?: number;
  cumDistKm: number;
  gradePct: number;
}

export interface PhotoLog {
  /** Original camera coordinates, kept separately from the point on the route. */
  captureLocation?: { lat: number; lng: number };
  timeSource?: "exif" | "camera" | "file";
  storyboardHidden?: boolean;
}

export interface SpatialPin extends PhotoLog {
  /** Distinguishes a real map choice from an unmatched import fallback. */
  placementSource?: "map" | "fallback";
  offTrail?: boolean;
  id: string;
  lat: number;
  lng: number;
  ele: number;
  cumDistKm: number;
  timestamp: number;
  caption: string;
  photoDataUrl?: string;
  /** Internal media-vault reference, resolved before rendering or export. */
  photoRef?: string;
  exifSource?: "gps" | "timestamp" | "live" | "manual";
}

/** A saved photo without an invented GPS location. Can be placed on a trail later. */
export interface TrailPhoto extends PhotoLog {
  id: string;
  caption: string;
  timestamp: number;
  photoDataUrl?: string;
  photoRef?: string;
}

export type SaveDestination = "library" | "receipt" | "map";
export type PrintTypeface = "serif" | "sans";
export interface PrintCopy {
  signature: string;
  eyebrow: string;
  date: string;
  badgeTitle: string;
  badgeNote: string;
  routeHeading: string;
  profileHeading: string;
  momentsHeading: string;
  footer: string;
  startLabel: string;
}
export interface HikeTrack {
  preferredPresentation?: "receipt" | "map";
  id: string;
  name: string;
  region: string;
  createdAt: number;
  source: "recorded" | "imported" | "preset" | "planned";
  /** Drawn plans use straight segments and estimated stop elevations. */
  elevationEstimated?: boolean;
  freeRoam?: boolean;
  points: TrackPoint[];
  pins: SpatialPin[];
  unplacedPhotos?: TrailPhoto[];
  /** A timer/photo memory saved when GPS was unavailable. No geometry is fabricated. */
  timedSession?: boolean;
  stats: TrailEffortMetrics & {
    totalDistKm: number;
    elevationGainM: number;
    elevationLossM: number;
    maxAltitudeM: number;
    minAltitudeM: number;
    maxGradePct: number;
    durationSec: number | null;
  };
  privacyTrimmed?: boolean;
}

export type ReceiptTemplate = "editorial" | "topo-card" | "brutalist";
export interface ReceiptConfig {
  titleTypeface?: PrintTypeface;
  showBranding?: boolean;
  showBadge?: boolean;
  showStats?: boolean;
  copy?: Partial<PrintCopy>;
  units?: UnitSystem;
  customQuote?: string;
  photoFocusX?: number;
  photoFocusY?: number;
  storyLeadPhotoId?: string;
  template: ReceiptTemplate;
  aspectRatio: "9:16" | "4:5";
  title: string;
  subtitle: string;
  /** Undefined selects a hike photo automatically. Null uses an illustration. */
  backgroundPhotoUrl?: string | null;
  coverPhotoId?: string;
  showElevationCurve: boolean;
  showRouteMiniMap: boolean;
  showDaylightAndPace: boolean;
  privacyTrimMeters: number;
}

export type ViewId = "explore" | "map" | "record" | "studio";
export type LocationStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";
