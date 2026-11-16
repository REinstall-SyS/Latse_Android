import { afterEach, describe, expect, it, vi } from "vitest";
import {
  compressPhotoToDataUrl,
  extractPhotoMetadata,
  matchPhotoToTrack,
} from "../exif-matcher";
import { jpegExif } from "./helpers/jpeg-exif";
import { point, START_MS, trackWith } from "./helpers/tracks";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const LAST_MODIFIED = Date.UTC(2025, 0, 1);
function photo(buffer: ArrayBuffer, type = "image/jpeg"): File {
  return new File([buffer], "field-photo", {
    type,
    lastModified: LAST_MODIFIED,
  });
}

describe("extractPhotoMetadata", () => {
  it("uses the camera's UTC offset when the importer is in a different time zone", async () => {
    const result = await extractPhotoMetadata(
      photo(jpegExif({ offset: "+05:45" })),
    );
    expect(result.timestamp).toBe(Date.parse("2024-01-02T03:04:05+05:45"));
    expect(result.timeSource).toBe("exif");
  });
  it.each([true, false])(
    "reads GPS and local capture time with littleEndian=%s",
    async (littleEndian) => {
      const result = await extractPhotoMetadata(
        photo(jpegExif({ littleEndian })),
      );
      expect(result.lat).toBeCloseTo(27 + 59 / 60 + 17 / 3600, 10);
      expect(result.lng).toBeCloseTo(86.925, 10);
      expect(result.ele).toBe(345.5);
      expect(result.timestamp).toBe(new Date(2024, 0, 2, 3, 4, 5).getTime());
    },
  );

  it("applies southern, western and below-sea-level references", async () => {
    const result = await extractPhotoMetadata(
      photo(
        jpegExif({
          littleEndian: false,
          latRef: "S",
          lngRef: "W",
          belowSeaLevel: true,
        }),
      ),
    );
    expect(result.lat).toBeLessThan(0);
    expect(result.lng).toBeCloseTo(-86.925, 10);
    expect(result.ele).toBe(-345.5);
  });

  it("preserves valid zero coordinates and the fallback time for GPS-only photos", async () => {
    const result = await extractPhotoMetadata(
      photo(jpegExif({ zeroCoordinates: true, date: null })),
    );
    expect(result).toEqual({
      lat: 0,
      lng: 0,
      ele: 345.5,
      timeSource: "file",
      timestamp: LAST_MODIFIED,
    });
  });

  it("extracts capture time when the GPS IFD is absent", async () => {
    expect(await extractPhotoMetadata(photo(jpegExif({ gps: false })))).toEqual(
      {
        timeSource: "exif",
        timestamp: new Date(2024, 0, 2, 3, 4, 5).getTime(),
      },
    );
  });

  it("falls back from invalid EXIF dates without losing valid coordinates", async () => {
    const result = await extractPhotoMetadata(
      photo(jpegExif({ date: "2024:02:30 03:04:05" })),
    );
    expect(result.timestamp).toBe(LAST_MODIFIED);
    expect(result.lat).toBeDefined();
  });

  it("skips unrelated APP1 segments before the EXIF segment", async () => {
    const exif = new Uint8Array(jpegExif());
    const unrelated = new Uint8Array([0xff, 0xe1, 0, 8, 88, 77, 80, 0, 0, 0]);
    const bytes = new Uint8Array(exif.length + unrelated.length);
    bytes.set(exif.slice(0, 2));
    bytes.set(unrelated, 2);
    bytes.set(exif.slice(2), 2 + unrelated.length);
    expect((await extractPhotoMetadata(photo(bytes.buffer))).ele).toBe(345.5);
  });

  it.each([
    { name: "PNG", bytes: [0x89, 0x50, 0x4e, 0x47] },
    { name: "WebP", bytes: [82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80] },
    { name: "JPEG without EXIF", bytes: [0xff, 0xd8, 0xff, 0xd9] },
    { name: "truncated APP1", bytes: [0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff] },
  ])("uses lastModified for $name", async ({ bytes }) => {
    expect(
      await extractPhotoMetadata(photo(new Uint8Array(bytes).buffer)),
    ).toEqual({ timeSource: "file", timestamp: LAST_MODIFIED });
  });

  it("contains invalid TIFF offsets and failed file reads", async () => {
    expect(
      await extractPhotoMetadata(photo(jpegExif({ corruptOffset: true }))),
    ).toEqual({ timeSource: "file", timestamp: LAST_MODIFIED });
    const file = {
      lastModified: LAST_MODIFIED,
      slice: () => {
        throw new Error("Read failed");
      },
    } as unknown as File;
    expect(await extractPhotoMetadata(file)).toEqual({
      timeSource: "file",
      timestamp: LAST_MODIFIED,
    });
  });

  it("limits metadata reads to the first 128 KB", async () => {
    const bytes = new Uint8Array(200000);
    bytes.set(new Uint8Array(jpegExif()));
    const file = photo(bytes.buffer);
    const slice = vi.spyOn(file, "slice");
    expect((await extractPhotoMetadata(file)).ele).toBe(345.5);
    expect(slice).toHaveBeenCalledOnce();
    expect(slice).toHaveBeenCalledWith(0, 131072);
  });
});

describe("matchPhotoToTrack", () => {
  it("projects GPS and camera time between fixes and rejects a file modification time", () => {
    const route = trackWith([point(0, 0, 100), point(2, 120, 200)]);
    const gps = matchPhotoToTrack({ lat: 0, lng: 0.005 }, route);
    expect(gps.cumDistKm).toBeCloseTo(0.5);
    expect(gps.ele).toBeCloseTo(125);
    expect(
      matchPhotoToTrack(
        { timestamp: START_MS + 90000, timeSource: "exif" },
        route,
      ),
    ).toMatchObject({ cumDistKm: 1.5, exifSource: "timestamp" });
    expect(
      matchPhotoToTrack(
        { timestamp: START_MS + 90000, timeSource: "file" },
        route,
      ).exifSource,
    ).toBe("manual");
  });
  const track = trackWith([
    point(0, 0, 100),
    point(1, 60, 250),
    point(2, 120, 150),
  ]);
  it("prioritizes nearby GPS, including zero coordinates, over conflicting timestamps", () => {
    expect(
      matchPhotoToTrack(
        { lat: 0, lng: 0, timestamp: START_MS + 120000, ele: 9999 },
        track,
      ),
    ).toEqual({ lat: 0, lng: 0, ele: 100, cumDistKm: 0, exifSource: "gps" });
  });

  it.each([
    { lat: 10, lng: 10 },
    { lat: NaN, lng: 0 },
    { lat: 91, lng: 0 },
  ])("uses capture time when GPS is distant or invalid: %o", (gps) => {
    expect(
      matchPhotoToTrack({ ...gps, timestamp: START_MS + 60000 }, track),
    ).toMatchObject({ cumDistKm: 1, ele: 250, exifSource: "timestamp" });
  });

  it("accepts GPS inside 2 km and defaults to manual positioning outside it", () => {
    expect(
      matchPhotoToTrack({ lat: 1990 / 111194.92664455874, lng: 0 }, track)
        .exifSource,
    ).toBe("gps");
    expect(
      matchPhotoToTrack({ lat: 2010 / 111194.92664455874, lng: 0 }, track)
        .exifSource,
    ).toBe("manual");
  });

  it.each([{}, { timestamp: START_MS - 1 }, { timestamp: START_MS + 120001 }])(
    "defaults to the actual summit for unmatched metadata: %o",
    (metadata) => {
      expect(matchPhotoToTrack(metadata, track)).toMatchObject({
        cumDistKm: 1,
        ele: 250,
        exifSource: "manual",
      });
    },
  );

  it("rejects an empty track", () => {
    expect(() => matchPhotoToTrack({}, trackWith([]))).toThrow("empty track");
  });
});

describe("compressPhotoToDataUrl", () => {
  function imageEnvironment(
    width: number,
    height: number,
    format: "webp" | "png" | "throw" = "webp",
    failLoad = false,
  ) {
    class TestImage {
      naturalWidth = width;
      naturalHeight = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) {
        queueMicrotask(() => (failLoad ? this.onerror?.() : this.onload?.()));
      }
    }
    const context = { drawImage: vi.fn() };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn((type: string) => {
        if (type === "image/webp" && format === "throw")
          throw new Error("WebP unavailable");
        return `data:${type === "image/webp" && format === "png" ? "image/png" : type};base64,AAAA`;
      }),
    };
    vi.stubGlobal("Image", TestImage);
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    return { canvas, context };
  }
  it.each([
    { width: 4000, height: 2000, w: 900, h: 450 },
    { width: 2000, height: 4000, w: 450, h: 900 },
    { width: 200, height: 100, w: 200, h: 100 },
  ])(
    "preserves the aspect ratio for $width × $height",
    async ({ width, height, w, h }) => {
      const { canvas, context } = imageEnvironment(width, height);
      expect(await compressPhotoToDataUrl(photo(jpegExif()))).toMatch(
        /^data:image\/webp;/,
      );
      expect(canvas.width).toBe(w);
      expect(canvas.height).toBe(h);
      expect(context.drawImage).toHaveBeenCalledWith(
        expect.anything(),
        0,
        0,
        w,
        h,
      );
      expect(canvas.toDataURL).toHaveBeenCalledWith("image/webp", 0.78);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
    },
  );

  it.each(["png", "throw"] as const)(
    "falls back to JPEG when WebP encoding returns %s",
    async (format) => {
      const { canvas } = imageEnvironment(1600, 800, format);
      expect(await compressPhotoToDataUrl(photo(jpegExif()), 800, 0.7)).toBe(
        "data:image/jpeg;base64,AAAA",
      );
      expect(canvas.toDataURL).toHaveBeenLastCalledWith("image/jpeg", 0.7);
    },
  );

  it("rejects unreadable photos and releases their object URLs", async () => {
    imageEnvironment(100, 100, "webp", true);
    await expect(compressPhotoToDataUrl(photo(jpegExif()))).rejects.toThrow(
      "Could not load photo",
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  });
});
