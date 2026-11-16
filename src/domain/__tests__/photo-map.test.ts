import { describe, it, expect } from "vitest";
import { signatureTracks } from "@/data/signature-tracks";
import { withLocatedPhotos, hasPhotoMap } from "../photo-map";
import {
  loadStudioConfig,
  saveStudioConfig,
} from "@/services/studio-edition.service";
describe("photo locations without invented trail geometry", () => {
  it("promotes only photographs with valid original GPS and leaves the recording untouched", () => {
    const track = {
      ...signatureTracks()[0],
      points: [],
      pins: [],
      timedSession: true,
      unplacedPhotos: [
        {
          id: "gps",
          caption: "By the lake",
          timestamp: 123,
          photoDataUrl: "data:image/jpeg;base64,AAAA",
          captureLocation: { lat: 37.005, lng: -122.02 },
        },
        {
          id: "unknown",
          caption: "With friends",
          timestamp: 456,
          photoDataUrl: "data:image/jpeg;base64,AAAA",
        },
      ],
    };
    const before = JSON.stringify(track),
      located = withLocatedPhotos(track);
    expect(located.points).toEqual([]);
    expect(located.pins).toHaveLength(1);
    expect(located.pins[0]).toMatchObject({
      id: "gps",
      lat: 37.005,
      lng: -122.02,
      offTrail: true,
      exifSource: "gps",
    });
    expect(located.unplacedPhotos?.map((photo) => photo.id)).toEqual([
      "unknown",
    ]);
    expect(hasPhotoMap(track)).toBe(true);
    expect(JSON.stringify(track)).toBe(before);
    expect(withLocatedPhotos(located).pins).toHaveLength(1);
  });
  it("offers placement rather than inventing a location for a photograph without GPS", () => {
    const track = {
      ...signatureTracks()[0],
      points: [],
      pins: [],
      timedSession: true,
      unplacedPhotos: [
        {
          id: "missing",
          caption: "A day out",
          timestamp: 0,
          photoDataUrl: "data:image/jpeg;base64,AAAA",
          captureLocation: { lat: 91, lng: 0 },
        },
      ],
    };
    expect(withLocatedPhotos(track).pins).toEqual([]);
    expect(hasPhotoMap(track)).toBe(false);
  });
  it("restores custom print wording and visual choices, including intentionally blank lines", () => {
    const values = new Map<string, string>(),
      storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      };
    const track = signatureTracks()[0],
      config = loadStudioConfig(track, "imperial", storage);
    saveStudioConfig(
      track.id,
      {
        ...config,
        title: "A shared sunrise",
        subtitle: "",
        titleTypeface: "sans",
        showBadge: true,
        showBranding: false,
        showStats: false,
        customQuote: "My words, my day",
        copy: {
          signature: "ANKIT",
          eyebrow: "",
          date: "",
          footer: "With my favorite people",
          badgeTitle: "Our trail",
          badgeNote: "Together",
        },
      },
      storage,
    );
    expect(loadStudioConfig(track, "imperial", storage)).toMatchObject({
      title: "A shared sunrise",
      subtitle: "",
      titleTypeface: "sans",
      showBadge: true,
      showBranding: false,
      showStats: false,
      customQuote: "My words, my day",
      copy: {
        signature: "ANKIT",
        eyebrow: "",
        date: "",
        footer: "With my favorite people",
        badgeTitle: "Our trail",
        badgeNote: "Together",
      },
    });
  });
});
