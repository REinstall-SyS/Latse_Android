import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createCanvas, GlobalFonts, Image } from "@napi-rs/canvas";
import { signatureTracks } from "@/data/signature-tracks";
import { projectRoute } from "@/domain/cartography";
import { formatDistance, formatElevation } from "@/domain/units";
import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import {
  keepsakeFacts,
  renderPhotoMapPoster,
  renderSummitReceipt,
} from "../receipt-canvas.service";
import { textBlock } from "../print-art.service";

const colors = ["#365DA8", "#C17840", "#76945F", "#9E5281"];
const config: ReceiptConfig = {
  template: "editorial",
  aspectRatio: "4:5",
  title: "Somewhere quiet",
  subtitle: "The western hills",
  backgroundPhotoUrl: null,
  showRouteMiniMap: true,
  showElevationCurve: true,
  showDaylightAndPace: false,
  privacyTrimMeters: 0,
};

beforeAll(() => {
  GlobalFonts.registerFromPath("public/fonts/dm-sans-latin.woff2", "DM Sans");
  GlobalFonts.registerFromPath(
    "public/fonts/dm-serif-display-latin.woff2",
    "DM Serif Display",
  );
});
beforeEach(() => vi.stubGlobal("Image", Image));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function surface() {
  const canvas = createCanvas(1, 1);
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    ctx: canvas.getContext("2d"),
  };
}

function colorPhoto(color: string, right?: string) {
  const tile = createCanvas(100, 40);
  const ctx = tile.getContext("2d");
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 100, 40);
  if (right) {
    ctx.fillStyle = right;
    ctx.fillRect(50, 0, 50, 40);
  }
  return tile.toDataURL("image/png");
}

function trailWithPhotos(count = 3): HikeTrack {
  const trail = signatureTracks()[1];
  const points = [0, 1.3, 3.6, 8.2, 10].map((cumDistKm, i) => ({
    lat: 37 + [0, 0.012, 0.025, 0.013, 0.015][i],
    lng: -122 + i * 0.012,
    ele: [100, 140, 300, 210, 180][i],
    gradePct: [2, 2, 6, -12, -2][i],
    cumDistKm,
    wallTime: trail.createdAt + i * 600000,
  }));
  return {
    ...trail,
    source: "recorded",
    points,
    stats: {
      ...trail.stats,
      totalDistKm: 10,
      elevationGainM: 200,
      maxAltitudeM: 300,
      minAltitudeM: 100,
      maxGradePct: 12,
      durationSec: 7200,
      paceMinPerKm: "12:00 /km",
      verticalRateMh: 100,
    },
    pins: points.slice(0, count).map((point, i) => ({
      ...point,
      lat: point.lat + (i === 2 ? 0.008 : 0),
      offTrail: i === 2,
      id: `photo-${i}`,
      caption: [
        "The first light",
        "At the crossing",
        "Still water",
        "A last look",
      ][i],
      timestamp: point.wallTime,
      photoDataUrl: colorPhoto(colors[i]),
    })),
  };
}

type RasterContext = ReturnType<typeof surface>["ctx"];
function pixel(ctx: RasterContext, x: number, y: number) {
  return `#${[...ctx.getImageData(x, y, 1, 1).data]
    .slice(0, 3)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

describe.each([
  ["editorial", renderSummitReceipt],
  ["topo-card", renderSummitReceipt],
  ["brutalist", renderSummitReceipt],
  ["editorial", renderPhotoMapPoster],
] as const)("%s artwork", (template, render) => {
  it.each([
    ["4:5", "metric", 1350],
    ["9:16", "metric", 1920],
    ["4:5", "imperial", 1350],
    ["9:16", "imperial", 1920],
  ] as const)(
    "draws %s in %s with readable data and editable copy",
    async (aspectRatio, units, height) => {
      const track = trailWithPhotos();
      const { canvas, ctx } = surface();
      const draw = vi.spyOn(ctx, "fillText");
      await render(canvas, track, {
        ...config,
        aspectRatio,
        template,
        units,
        backgroundPhotoUrl: colorPhoto(colors[0]),
        customQuote: "One more mile together.",
        copy: { date: "September 18" },
      });
      const printed = draw.mock.calls.map(([value]) => value);
      expect([canvas.width, canvas.height]).toEqual([1080, height]);
      expect(printed).toContain(config.title);
      expect(printed).toContain("September 18");
      expect(printed).toContain("One more mile together.");
      expect(printed).toContain(formatDistance(track.stats.totalDistKm, units));
      expect(printed).toContain(
        formatElevation(track.stats.elevationGainM, units, true),
      );
      expect(printed).toContain("2h 00m");
      expect(ctx.getImageData(535, 550, 1, 1).data[3]).toBe(255);
    },
  );
});

it.each(["editorial", "topo-card", "brutalist"] as const)(
  "keeps the same cover visible when switching to %s",
  async (template) => {
    const { canvas, ctx } = surface();
    await renderSummitReceipt(canvas, trailWithPhotos(0), {
      ...config,
      template,
      backgroundPhotoUrl: colorPhoto(colors[1]),
    });
    expect(pixel(ctx, 350, template === "topo-card" ? 420 : 490)).toBe(
      colors[1],
    );
  },
);

it("crops to both sides of a wide photo and reuses the full composition for thumbnails", async () => {
  const { canvas, ctx } = surface();
  const track = trailWithPhotos(0);
  const cover = colorPhoto(colors[0], colors[1]);
  await renderSummitReceipt(
    canvas,
    track,
    { ...config, backgroundPhotoUrl: cover, photoFocusX: 0 },
    216,
  );
  expect([canvas.width, canvas.height]).toEqual([216, 270]);
  expect(pixel(ctx, 92, 93)).toBe(colors[0]);
  await renderSummitReceipt(
    canvas,
    track,
    { ...config, backgroundPhotoUrl: cover, photoFocusX: 1 },
    216,
  );
  expect(pixel(ctx, 92, 93)).toBe(colors[1]);
});

it("uses the full photo width for a single moment and fills the lower page with geography", async () => {
  const { canvas, ctx } = surface();
  await renderPhotoMapPoster(canvas, trailWithPhotos(1), config);
  expect(pixel(ctx, 160, 512)).toBe(colors[0]);
  expect(pixel(ctx, 868, 512)).toBe(colors[0]);
  expect(pixel(ctx, 225, 1047)).not.toBe("#F1E8D8");
});

it("makes the selected lead image large and numbers only the printed photos", async () => {
  const { canvas, ctx } = surface();
  const draw = vi.spyOn(ctx, "fillText");
  await renderPhotoMapPoster(canvas, trailWithPhotos(4), {
    ...config,
    storyLeadPhotoId: "photo-3",
  });
  expect(pixel(ctx, 250, 512)).toBe(colors[3]);
  expect(pixel(ctx, 788, 370)).toBe(colors[0]);
  expect(pixel(ctx, 788, 682)).toBe(colors[1]);
  const painted = draw.mock.calls.map(([value]) => value);
  expect(painted.filter((value) => value === "01")).toHaveLength(2);
  expect(painted.filter((value) => value === "03")).toHaveLength(2);
  expect(painted).not.toContain("04");
  expect(painted).not.toContain("Still water");
});

it("puts the map mark at the off-trail photo's projected coordinate", async () => {
  const { canvas, ctx } = surface();
  const calls = vi.spyOn(ctx, "arc");
  const rect = vi.spyOn(ctx, "rect");
  const track = trailWithPhotos();
  await renderPhotoMapPoster(canvas, track, config);
  const [, , w, h] = rect.mock.calls[rect.mock.calls.length - 1];
  const projected = projectRoute(
    track.points,
    w,
    h,
    Math.round(Math.min(w, h) * 0.15),
    track.pins,
  );
  const expected = projected[projected.length - 1];
  expect(
    calls.mock.calls.some(
      ([x, y, r]) =>
        r === 18 &&
        Math.abs(expected.x - x) < 0.01 &&
        Math.abs(expected.y - y) < 0.01,
    ),
  ).toBe(true);
});

it.each(["editorial", "topo-card", "brutalist"] as const)(
  "reflows %s on the sparse, chart-free route from the user report",
  async (template) => {
    const { canvas, ctx } = surface();
    const copy = vi.spyOn(ctx, "fillText");
    const track = {
      ...trailWithPhotos(0),
      name: "My quick route",
      source: "planned" as const,
      elevationEstimated: true,
      points: trailWithPhotos(0).points.slice(0, 3),
    };
    await renderSummitReceipt(canvas, track, {
      ...config,
      template,
      title: track.name,
      subtitle: "",
      aspectRatio: "9:16",
      showStats: false,
      showElevationCurve: false,
    });
    expect(pixel(ctx, 350, 1330)).not.toBe(pixel(ctx, 12, 12));
    const labels = copy.mock.calls.map(([value]) => value);
    expect(labels).toContain("LATSE   /   ROUTE PLAN");
    expect(labels).not.toContain("Elevation gain");
    expect(labels).not.toContain("Elevation");
  },
);

it("uses a timed memory's duration and an actual album photo without making up a route", async () => {
  const { canvas, ctx } = surface();
  const trail = trailWithPhotos(0);
  const track = {
    ...trail,
    points: [],
    timedSession: true,
    unplacedPhotos: [
      {
        id: "one",
        caption: "The view",
        timestamp: trail.createdAt,
        photoDataUrl: colorPhoto(colors[1]),
      },
    ],
  };
  await renderSummitReceipt(canvas, track, {
    ...config,
    backgroundPhotoUrl: undefined,
  });
  expect(pixel(ctx, 250, 500)).toBe(colors[1]);
  expect(keepsakeFacts(track, "metric", true)).toEqual([
    { label: "Time outside", value: "2h 00m" },
  ]);
});

it("does not use endpoint photos as an automatic cover when privacy is enabled", async () => {
  const { canvas, ctx } = surface();
  const track = trailWithPhotos(2);
  await renderSummitReceipt(canvas, track, {
    ...config,
    privacyTrimMeters: 500,
    backgroundPhotoUrl: undefined,
  });
  expect(pixel(ctx, 250, 500)).toBe(colors[1]);
});

it("fits long titles into the print's type area without dropping to microtype", () => {
  const { ctx } = surface();
  const block = textBlock(
    ctx as unknown as CanvasRenderingContext2D,
    "Tour du Mont Blanc (Stage 1: Les Houches to Les Contamines) with the long way home",
    920,
    { size: 104, min: 60, lines: 2 },
  );
  expect(block.lines.length).toBe(2);
  expect(block.leading).toBeGreaterThanOrEqual(60);
  expect(block.lines.every((line) => ctx.measureText(line).width <= 920)).toBe(
    true,
  );
});
