import type { HikeTrack, SpatialPin, TrackPoint } from "@/types/trek.types";
import { trackFromRoutePoints } from "./route-builder";
import { snapToTrack } from "./gpx-engine";
export function createRoam(): HikeTrack {
  return {
    id: crypto.randomUUID(),
    name: "My free roam",
    region: "A path of your own",
    source: "planned",
    createdAt: Date.now(),
    freeRoam: true,
    timedSession: true,
    elevationEstimated: true,
    points: [],
    pins: [],
    stats: {
      totalDistKm: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      maxAltitudeM: 0,
      minAltitudeM: 0,
      maxGradePct: 0,
      durationSec: null,
      paceMinPerKm: "— /km",
      verticalRateMh: 0,
    },
  };
}
export function updateRoamPath(
  roam: HikeTrack,
  points: TrackPoint[],
  pins: SpatialPin[] = roam.pins,
): HikeTrack {
  const reproject = (path: TrackPoint[]) =>
    pins.map((pin) => {
      if (pin.offTrail) return pin;
      if (!path.length) return { ...pin, cumDistKm: 0, offTrail: true };
      const nearest = snapToTrack(pin.lat, pin.lng, path).point;
      return {
        ...pin,
        lat: nearest.lat,
        lng: nearest.lng,
        ele: nearest.ele,
        cumDistKm: nearest.cumDistKm,
      };
    });
  if (points.length < 2)
    return {
      ...roam,
      points,
      pins: reproject(points),
      timedSession: true,
      stats: {
        ...roam.stats,
        totalDistKm: 0,
        elevationGainM: 0,
        elevationLossM: 0,
        minAltitudeM: points[0]?.ele ?? 0,
        maxAltitudeM: points[0]?.ele ?? 0,
        maxGradePct: 0,
        durationSec: null,
        paceMinPerKm: "— /km",
        verticalRateMh: 0,
      },
    };
  const route = trackFromRoutePoints(points, roam.name, roam.region);
  return {
    ...route,
    id: roam.id,
    createdAt: roam.createdAt,
    freeRoam: true,
    source: "planned",
    elevationEstimated: true,
    pins: reproject(route.points),
    unplacedPhotos: roam.unplacedPhotos,
  };
}
