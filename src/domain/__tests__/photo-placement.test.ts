import { describe, it, expect } from "vitest";
import { point, trackWith } from "./helpers/tracks";
import type { SpatialPin } from "@/types/trek.types";
import {
  placePhotoAtCoordinate,
  placeUnmatchedBatch,
} from "../photo-placement";
const track = trackWith([
  point(0, 0, 100),
  point(1, 60, 110),
  point(2, 120, 120),
  point(3, 180, 130),
  point(4, 240, 140),
  point(5, 300, 150),
]);
const pin: SpatialPin = {
  id: "photo",
  lat: 0,
  lng: 0,
  ele: 100,
  cumDistKm: 0,
  timestamp: 123,
  caption: "A creek",
  photoDataUrl: "data:image/jpeg;base64,AAAA",
  exifSource: "manual",
};
describe("map photo placement", () => {
  it("snaps nearby taps to a known trail fix and retains original capture time", () => {
    const result = placePhotoAtCoordinate(pin, track, 0.0001, 0.0101);
    expect(result).toMatchObject({
      lat: 0,
      lng: 0.01,
      cumDistKm: 1,
      ele: 110,
      timestamp: 123,
      photoDataUrl: pin.photoDataUrl,
      offTrail: false,
    });
    expect(pin.lng).toBe(0);
  });
  it("allows a distant exact coordinate and offers an explicit snap override", () => {
    expect(placePhotoAtCoordinate(pin, track, 0.02, 0.01)).toMatchObject({
      lat: 0.02,
      lng: 0.01,
      offTrail: true,
    });
    expect(placePhotoAtCoordinate(pin, track, 0.02, 0.01, true)).toMatchObject({
      lat: 0,
      lng: 0.01,
      offTrail: false,
    });
  });
  it("keeps free roam coordinates exact even near the trail", () => {
    expect(
      placePhotoAtCoordinate(pin, { ...track, freeRoam: true }, 0.0001, 0.0101),
    ).toMatchObject({ lat: 0.0001, lng: 0.0101, offTrail: true });
  });
  it("can pin before a route exists and rejects invalid coordinates", () => {
    expect(
      placePhotoAtCoordinate(
        pin,
        { ...track, freeRoam: true, points: [] },
        45,
        -120,
      ),
    ).toMatchObject({ lat: 45, lng: -120, cumDistKm: 0 });
    expect(() => placePhotoAtCoordinate(pin, track, 91, 0)).toThrow("valid");
  });
  it("uses the scrubbed point for a single unmatched photo", () => {
    expect(placeUnmatchedBatch([pin], track, 3)[0].cumDistKm).toBe(3);
  });
  it("spaces four unmatched photos in capture order and preserves matched photos", () => {
    const photos = [4, 1, 3, 2].map((n) => ({
      ...pin,
      id: String(n),
      timestamp: n,
    }));
    const placed = placeUnmatchedBatch(photos, track);
    expect(placed.map((p) => p.cumDistKm)).toEqual([4, 1, 3, 2]);
    const gps = { ...pin, exifSource: "gps" as const, cumDistKm: 2.3 };
    expect(placeUnmatchedBatch([gps, ...photos], track)[0]).toEqual(gps);
  });
});

it("preserves an off-trail Free-Roam import at its exact camera/map coordinate", () => {
  const roam = {
    ...track,
    freeRoam: true,
    id: "roam-test",
    source: "planned" as const,
  };
  const offTrail = { ...pin, lat: 37.005, lng: -122.02, offTrail: true };
  const result = placeUnmatchedBatch([offTrail], roam, 0)[0];
  expect(result).toEqual(offTrail);
  expect([result.lat, result.lng]).toEqual([37.005, -122.02]);
  expect([result.lat, result.lng]).not.toEqual([
    track.points[0].lat,
    track.points[0].lng,
  ]);
});
it("preserves map-selected pins on planned routes but distributes marked import fallbacks", () => {
  const planned = { ...track, source: "planned" as const };
  const chosen = {
    ...pin,
    lat: 37.005,
    lng: -122.02,
    placementSource: "map" as const,
  };
  expect(placeUnmatchedBatch([chosen], planned, 0)[0]).toEqual(chosen);
  const fallback = { ...pin, placementSource: "fallback" as const };
  expect(placeUnmatchedBatch([fallback], planned, 3)[0].cumDistKm).toBe(3);
});
