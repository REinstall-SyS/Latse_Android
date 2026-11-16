import { describe, expect, it } from "vitest";
import { signatureTracks } from "@/data/signature-tracks";
import { isStoredHike, isStoredPoint } from "../track-validation";
import { prepareArtifactTrack } from "../artifact-track";
import { exportInteractiveHTMLReport } from "../report-export.service";

describe("stored hikes and GPS-free memories", () => {
  it("accepts existing presets and a truthful timed memory with embedded photos", () => {
    const memory = {
      ...signatureTracks()[0],
      id: "memory",
      source: "recorded" as const,
      points: [],
      pins: [],
      timedSession: true,
      unplacedPhotos: [
        {
          id: "photo",
          caption: "A pause",
          timestamp: 1234,
          photoDataUrl: "data:image/jpeg;base64,AAAA",
        },
      ],
    };
    expect(signatureTracks().every(isStoredHike)).toBe(true);
    expect(isStoredHike(memory)).toBe(true);
    const snapshot = prepareArtifactTrack(memory, 0);
    expect(snapshot.points).toEqual([]);
    expect(snapshot.unplacedPhotos).toHaveLength(1);
    expect(() => exportInteractiveHTMLReport(memory, 0)).toThrow(
      "Place a photo",
    );
  });
  it("rejects corrupt coordinates, missing metrics, and unordered route geometry", () => {
    const hike = signatureTracks()[0];
    expect(isStoredHike({ ...hike, stats: {} })).toBe(false);
    expect(isStoredHike({ ...hike, points: [] })).toBe(false);
    expect(
      isStoredHike({ ...hike, points: [{ ...hike.points[0], lat: 91 }] }),
    ).toBe(false);
    expect(isStoredHike({ ...hike, points: [...hike.points].reverse() })).toBe(
      false,
    );
    expect(isStoredPoint({ ...hike.points[0], ele: Infinity })).toBe(false);
  });
  it("does not trust executable or remote persisted photo URLs", () => {
    const hike = signatureTracks()[0];
    expect(
      isStoredHike({
        ...hike,
        unplacedPhotos: [
          {
            id: "x",
            caption: "x",
            timestamp: 1,
            photoDataUrl: "javascript:alert(1)",
          },
        ],
      }),
    ).toBe(false);
    expect(
      isStoredHike({
        ...hike,
        pins: [
          { ...hike.pins[0], photoDataUrl: "https://remote.example/photo.jpg" },
        ],
      }),
    ).toBe(false);
  });
  it("excludes unplaced photos when privacy trim cannot verify their locations", () => {
    const hike = {
      ...signatureTracks()[0],
      unplacedPhotos: [
        {
          id: "photo",
          caption: "Home",
          timestamp: 1234,
          photoDataUrl: "data:image/jpeg;base64,AAAA",
        },
      ],
    };
    const snapshot = prepareArtifactTrack(hike, 500);
    expect(snapshot.unplacedPhotos).toEqual([]);
    expect(hike.unplacedPhotos).toHaveLength(1);
  });
});
