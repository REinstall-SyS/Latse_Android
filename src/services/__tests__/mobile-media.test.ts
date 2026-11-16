import { afterEach, describe, expect, it, vi } from "vitest";
import { point, START_MS, trackWith } from "@/domain/__tests__/helpers/tracks";
import {
  compressPhotoToDataUrl,
  extractPhotoMetadata,
} from "@/domain/exif-matcher";
import {
  createPhotoPreview,
  movePinToPoint,
  openMobileMediaPicker,
  photoMatchLabel,
  positionTrailPhoto,
  prepareTrailPhoto,
  validatePhotoSelection,
} from "../mobile-media.service";

vi.mock("@/domain/exif-matcher", async (original) => ({
  ...(await original<typeof import("@/domain/exif-matcher")>()),
  compressPhotoToDataUrl: vi.fn(),
  extractPhotoMetadata: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("phone camera/gallery input contract", () => {
  it("uses the rear camera and removes capture when switching to a multi-photo gallery", () => {
    const attributes = new Map<string, string>();
    const input = {
      type: "",
      accept: "",
      multiple: true,
      value: "previous-file",
      setAttribute: (key: string, value: string) => attributes.set(key, value),
      removeAttribute: (key: string) => attributes.delete(key),
      click: vi.fn(),
    };
    openMobileMediaPicker(input as unknown as HTMLInputElement, "camera");
    expect(attributes.get("capture")).toBe("environment");
    expect(input.multiple).toBe(false);
    expect(input.value).toBe("");
    openMobileMediaPicker(input as unknown as HTMLInputElement, "gallery");
    expect(attributes.has("capture")).toBe(false);
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe("image/*");
    expect(input.click).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized, empty, non-photo, and over-limit selections before decoding", () => {
    const file = new File(["photo"], "trail.jpg", { type: "image/jpeg" });
    expect(() => validatePhotoSelection(Array(11).fill(file))).toThrow("10");
    expect(() => validatePhotoSelection([file], 0)).toThrow("0 more");
    expect(() => validatePhotoSelection([new File([], "empty.jpg")])).toThrow(
      "empty",
    );
    expect(() =>
      validatePhotoSelection([
        new File(["text"], "note.txt", { type: "text/plain" }),
      ]),
    ).toThrow("not a photo");
    expect(() =>
      validatePhotoSelection([
        {
          ...file,
          name: "large.jpg",
          size: 41 * 1024 * 1024,
          type: "image/jpeg",
        } as File,
      ]),
    ).toThrow("40 MB");
  });

  it("releases an instant-preview object URL exactly once", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const preview = createPhotoPreview(new File(["photo"], "trail.jpg"));
    expect(preview.url).toBe("blob:preview");
    preview.release();
    preview.release();
    expect(revoke).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:preview");
  });
});

describe("photo preparation and manual nudging", () => {
  const track = trackWith([
    point(0, 0, 100),
    point(1, 60, 200),
    point(2, 120, 150),
  ]);
  const file = new File(["photo"], "Creek crossing.jpg", {
    type: "image/jpeg",
  });

  it("compresses to 800px, prefers GPS matching, and supplies the snap badge", async () => {
    vi.mocked(extractPhotoMetadata).mockResolvedValue({
      lat: 0,
      lng: 0.01,
      timestamp: START_MS,
    });
    vi.mocked(compressPhotoToDataUrl).mockResolvedValue(
      "data:image/webp;base64,AAAA",
    );
    const pin = await prepareTrailPhoto(file, track, 0);
    expect(pin).toMatchObject({
      cumDistKm: 1,
      ele: 200,
      exifSource: "gps",
      caption: "Creek crossing",
    });
    expect(compressPhotoToDataUrl).toHaveBeenCalledWith(file, 800, 0.78);
    expect(photoMatchLabel(pin)).toContain("Placed from photo GPS · 200 m");
  });

  it("matches by timestamp and uses the current live point only for a manual fallback", async () => {
    vi.mocked(compressPhotoToDataUrl).mockResolvedValue(
      "data:image/webp;base64,AAAA",
    );
    vi.mocked(extractPhotoMetadata).mockResolvedValue({
      timeSource: "exif",
      timestamp: START_MS + 120000,
    });
    const timed = await prepareTrailPhoto(file, track, 0);
    expect(timed).toMatchObject({ cumDistKm: 2, exifSource: "timestamp" });
    expect(photoMatchLabel(timed)).toContain("Matched by time");
    vi.mocked(extractPhotoMetadata).mockResolvedValue({ timestamp: 0 });
    expect(await prepareTrailPhoto(file, track, 2)).toMatchObject({
      cumDistKm: 2,
      exifSource: "manual",
      timestamp: 0,
    });
    expect(await prepareTrailPhoto(file, track)).toMatchObject({
      cumDistKm: 1,
      exifSource: "manual",
    });
  });

  it("places a fresh camera shot on a recent recording fix and leaves stale or gallery positions manual", () => {
    const photo = {
      id: "shot",
      caption: "Ridge",
      timestamp: START_MS + 125000,
      timeSource: "camera" as const,
    };
    expect(positionTrailPhoto(photo, track, undefined, true)).toMatchObject({
      exifSource: "live",
      cumDistKm: 2,
    });
    expect(
      positionTrailPhoto(
        { ...photo, timestamp: START_MS + 600000 },
        track,
        undefined,
        true,
      ).exifSource,
    ).toBe("manual");
    expect(
      positionTrailPhoto(
        { ...photo, timeSource: "file" },
        track,
        undefined,
        true,
      ).exifSource,
    ).toBe("manual");
  });

  it("moves a pin without losing the photo or caption and never mutates the original", async () => {
    vi.mocked(extractPhotoMetadata).mockResolvedValue({ timestamp: 0 });
    vi.mocked(compressPhotoToDataUrl).mockResolvedValue(
      "data:image/webp;base64,AAAA",
    );
    const pin = await prepareTrailPhoto(file, track);
    const moved = movePinToPoint(pin, track, 999);
    expect(moved).toMatchObject({
      cumDistKm: 2,
      ele: 150,
      exifSource: "manual",
      caption: pin.caption,
      photoDataUrl: pin.photoDataUrl,
    });
    expect(pin.cumDistKm).toBe(1);
    expect(movePinToPoint(pin, track, -1).cumDistKm).toBe(0);
  });
});
