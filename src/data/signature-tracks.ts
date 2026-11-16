import type { HikeTrack, TrackPoint } from "@/types/trek.types";
import { haversineDistance } from "@/domain/geospatial";
import {
  calculatePaceMinPerKm,
  calculateVerticalRate,
} from "@/domain/altitude-physics";

interface SignatureDefinition {
  id: string;
  name: string;
  region: string;
  origin: [number, number];
  distance: number;
  hours: number;
  elevations: number[];
  route: [number, number][];
  notes: string[];
}

const DEFINITIONS: SignatureDefinition[] = [
  {
    id: "demo-tuxachanie",
    name: "Tuxachanie Trail",
    region: "De Soto National Forest · US",
    origin: [30.74, -89.08],
    distance: 19.3,
    hours: 6,
    elevations: [50, 95, 55, 100, 60, 105, 55, 100, 50],
    route: [
      [0, 0],
      [0.2, 0.32],
      [0.6, 0.2],
      [0.85, 0.6],
      [1.3, 0.52],
      [1.1, 1],
      [1.55, 1.35],
      [2, 1.15],
      [2.3, 1.55],
      [2.7, 1.3],
      [3.1, 1.75],
      [3.5, 1.65],
      [3.7, 2.05],
      [4.05, 1.85],
      [4.3, 2.3],
      [4.7, 2.05],
      [5.05, 2.5],
      [5.4, 2.3],
      [5.7, 2.8],
      [6.2, 2.7],
      [6.5, 3.1],
      [6.9, 2.95],
      [7.2, 3.3],
    ],
    notes: [
      "Pine needles soften the morning trail. A sandy creek crossing breaks the rhythm of the first ridge.",
      "Longleaf pines frame the rolling ridge. Rest in the shade and listen for the creek below.",
      "Late light catches the water at the final crossing. The gentlest miles are often the ones worth remembering.",
    ],
  },
  {
    id: "demo-half-dome",
    name: "Half Dome via Mist Trail",
    region: "Yosemite National Park · US",
    origin: [37.732, -119.558],
    distance: 23.8,
    hours: 11,
    elevations: [1235, 1550, 1850, 2150, 2695, 2150, 1850, 1550, 1235],
    route: [
      [0, 0],
      [0.3, 0.1],
      [0.4, 0.6],
      [0.8, 0.45],
      [0.65, 0.95],
      [1.1, 0.8],
      [0.9, 1.25],
      [1.5, 1.2],
      [1.85, 1.6],
      [2.1, 1.55],
      [2.05, 1.9],
      [2.5, 1.8],
      [2.35, 2.15],
      [2.8, 2.05],
      [2.65, 2.4],
      [3, 2.35],
      [3.2, 2.7],
      [3.08, 2.95],
      [3.4, 3.1],
      [3.105, 2.93],
      [3.225, 2.68],
      [3.025, 2.33],
      [2.675, 2.38],
      [2.8249999999999997, 2.03],
      [2.375, 2.13],
      [2.525, 1.78],
      [2.0749999999999997, 1.88],
      [2.125, 1.53],
      [1.875, 1.58],
      [1.525, 1.18],
      [0.925, 1.23],
      [1.125, 0.78],
      [0.675, 0.9299999999999999],
      [0.8250000000000001, 0.43],
      [0.42500000000000004, 0.58],
      [0.325, 0.08],
      [0, 0],
    ],
    notes: [
      "Mist drifts across the granite steps above the falls. The valley is waking up behind us.",
      "A broad granite skyline from the high point. A moment to pause before the long descent.",
      "The forest returns below the exposed rock. Water, a snack, and careful steps on tired legs.",
    ],
  },
  {
    id: "demo-mont-blanc",
    name: "Tour du Mont Blanc (Stage 1: Les Houches to Les Contamines)",
    region: "Les Houches → Les Contamines · French Alps",
    origin: [45.89, 6.798],
    distance: 16.4,
    hours: 6.5,
    elevations: [1000, 1160, 1320, 1480, 1640, 1520, 1400, 1280, 1160],
    route: [
      [0, 0],
      [-0.2, -0.3],
      [-0.65, -0.25],
      [-0.35, -0.7],
      [-0.9, -0.55],
      [-0.55, -1.05],
      [-1.1, -0.9],
      [-0.8, -1.4],
      [-1.3, -1.25],
      [-1.05, -1.7],
      [-1.55, -1.6],
      [-1.35, -2],
      [-1.65, -2.3],
      [-1.4, -2.6],
      [-1.8, -2.9],
      [-1.45, -3.2],
      [-1.9, -3.5],
      [-1.65, -3.8],
      [-2.1, -4.1],
      [-1.8, -4.4],
      [-2.25, -4.6],
      [-2, -4.9],
      [-2.4, -5.2],
      [-2.2, -5.6],
      [-2.6, -5.9],
    ],
    notes: [
      "The first climb leaves Les Houches behind. Meadows open between dark stands of spruce.",
      "The alpine pass brings a cool breeze and layered mountain views. A picnic above the valley.",
      "Follow the valley toward Les Contamines as the slopes soften into pasture and village paths.",
    ],
  },
];

function interpolate(values: number[], fraction: number): number {
  const position = fraction * (values.length - 1);
  const index = Math.min(values.length - 2, Math.floor(position));
  return (
    values[index] + (values[index + 1] - values[index]) * (position - index)
  );
}

function createTrack(definition: SignatureDefinition): HikeTrack {
  const createPoints = (scaleKm: number): TrackPoint[] => {
    const [latitude, longitude] = definition.origin;
    const latitudeScale = 180 / (Math.PI * 6371);
    const longitudeScale = latitudeScale / Math.cos((latitude * Math.PI) / 180);
    const points: TrackPoint[] = [];
    const eastings = definition.route.map(([x]) => x);
    const northings = definition.route.map(([, y]) => y);
    for (let index = 0; index <= 112; index++) {
      const fraction = index / 112;
      const lat =
        latitude +
        (interpolate(northings, fraction) +
          0.025 *
            Math.sin(fraction * Math.PI * 2) *
            Math.sin(fraction * Math.PI * 37)) *
          scaleKm *
          latitudeScale;
      const lng =
        longitude +
        (interpolate(eastings, fraction) +
          0.018 *
            Math.sin(fraction * Math.PI * 2) *
            Math.sin(fraction * Math.PI * 59)) *
          scaleKm *
          longitudeScale;
      const previous = points[index - 1];
      points.push({
        lat,
        lng,
        ele: interpolate(definition.elevations, fraction),
        time:
          Math.round(Date.UTC(2025, 6, 15, 7) - longitude * 240000) +
          Math.round(fraction * definition.hours * 3600000),
        cumDistKm: previous
          ? previous.cumDistKm +
            haversineDistance(previous.lat, previous.lng, lat, lng)
          : 0,
        gradePct: 0,
      });
    }
    return points;
  };
  // Fit geographic coordinates first; cumulative distances are never fabricated.
  let low = 0;
  let high = definition.distance;
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) / 2;
    if (createPoints(middle)[112].cumDistKm < definition.distance) low = middle;
    else high = middle;
  }
  const points = createPoints((low + high) / 2);
  let gain = 0;
  let loss = 0;
  points.forEach((point, index) => {
    const left = points[Math.max(0, index - 1)];
    const right = points[Math.min(112, index + 1)];
    point.gradePct = Math.max(
      -50,
      Math.min(
        50,
        (right.ele - left.ele) / ((right.cumDistKm - left.cumDistKm) * 10),
      ),
    );
    if (index > 0) {
      const delta = point.ele - points[index - 1].ele;
      gain += Math.max(0, delta);
      loss += Math.max(0, -delta);
    }
  });
  const durationSec = definition.hours * 3600;
  return {
    id: definition.id,
    name: definition.name,
    region: definition.region,
    createdAt: points[0].time!,
    source: "preset",
    points,
    pins: [22, 56, 90].map((index, scene) => ({
      id: `${definition.id}-note-${scene}`,
      lat: points[index].lat,
      lng: points[index].lng,
      ele: points[index].ele,
      cumDistKm: points[index].cumDistKm,
      timestamp: points[index].time!,
      caption: definition.notes[scene],
      exifSource: "manual",
    })),
    stats: {
      totalDistKm: points[112].cumDistKm,
      elevationGainM: gain,
      elevationLossM: loss,
      maxAltitudeM: Math.max(...points.map((point) => point.ele)),
      minAltitudeM: Math.min(...points.map((point) => point.ele)),
      maxGradePct: Math.max(...points.map((point) => Math.abs(point.gradePct))),
      durationSec,
      verticalRateMh: calculateVerticalRate(gain, durationSec),
      paceMinPerKm: calculatePaceMinPerKm(points[112].cumDistKm, durationSec),
    },
  };
}

/** Distances are geodesic; route shapes/times are illustrative rather than navigation surveys. */
export const SIGNATURE_TRACKS: HikeTrack[] = DEFINITIONS.map(createTrack);

export function signatureTracks(): HikeTrack[] {
  return SIGNATURE_TRACKS.map((track) => ({
    ...track,
    points: track.points.map((point) => ({ ...point })),
    pins: track.pins.map((pin) => ({ ...pin })),
    stats: { ...track.stats },
  }));
}
