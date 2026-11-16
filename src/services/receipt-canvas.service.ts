import {
  coverCredit,
  printCopy,
  printCover,
  printProvenance,
  printSubtitle,
} from "@/domain/print-design";
import { withLocatedPhotos } from "@/domain/photo-map";
import { formatTrailTime } from "@/domain/trail-navigation";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
  type UnitSystem,
} from "@/domain/units";
import type {
  HikeTrack,
  PrintCopy,
  ReceiptConfig,
  SpatialPin,
} from "@/types/trek.types";
import { prepareArtifactTrack, prepareStoryboardTrack } from "./artifact-track";
import { loadCanvasImage } from "./canvas-image.service";
import {
  drawHeightProfile,
  drawPrintPhoto,
  drawRoutePlate,
  fill,
  label,
  line,
  printFont,
  shade,
  textBlock,
  typeset,
  type PrintBox,
  type PrintContext,
} from "./print-art.service";

export const STORYBOARD_PHOTO_LIMIT = 3;
const W = 1080;
const revisions = new WeakMap<HTMLCanvasElement, number>();

const paper = {
  bg: "#F5EDDC",
  ink: "#253D32",
  muted: "#506455",
  accent: "#A44730",
  rule: "#B5AA93",
  profile: "#56735F24",
};
const atlas = {
  bg: "#E6ECE0",
  ink: "#19372E",
  muted: "#476255",
  accent: "#A1412B",
  rule: "#ACBBA8",
  profile: "#4C7A6026",
};
const night = {
  bg: "#11282B",
  ink: "#FBF0D9",
  muted: "#C5D7C1",
  accent: "#FFC18A",
  rule: "#C5D7C18C",
  profile: "#F9AC7438",
};
const journal = { ...paper, bg: "#F1E8D8", ink: "#293B34", accent: "#9C462F" };
type Palette = typeof paper;

function hasElevation(track: HikeTrack) {
  return (
    !track.elevationEstimated && track.points.some((point) => point.ele !== 0)
  );
}

export function keepsakeFacts(
  track: HikeTrack,
  units: UnitSystem,
  effort: boolean,
) {
  const { stats } = track;
  const facts: { label: string; value: string }[] = [];
  if (track.points.length > 1 && stats.totalDistKm > 0)
    facts.push({
      label: track.source === "planned" ? "Route length" : "Distance",
      value: formatDistance(stats.totalDistKm, units),
    });
  if (hasElevation(track) && stats.elevationGainM > 0)
    facts.push({
      label: "Elevation gain",
      value: formatElevation(stats.elevationGainM, units, true),
    });
  if (effort && hasElevation(track) && stats.verticalRateMh > 0)
    facts.push({
      label: "Vertical rate",
      value: formatVertRate(stats.verticalRateMh, units),
    });
  if (
    effort &&
    track.points.length > 1 &&
    stats.totalDistKm > 0 &&
    /^\d+:\d{2}/.test(stats.paceMinPerKm)
  )
    facts.push({ label: "Pace", value: formatPace(stats.paceMinPerKm, units) });
  else if (stats.durationSec !== null && stats.durationSec > 0)
    facts.push({
      label: track.timedSession ? "Time outside" : "Duration",
      value:
        stats.durationSec < 60
          ? `${Math.round(stats.durationSec)} sec`
          : formatTrailTime(stats.durationSec),
    });
  else if (hasElevation(track))
    facts.push({
      label: "High point",
      value: formatElevation(stats.maxAltitudeM, units),
    });
  return facts;
}

function receiptSnapshot(track: HikeTrack, trim: number) {
  const located = withLocatedPhotos(track);
  return prepareArtifactTrack(
    {
      ...located,
      timedSession: track.timedSession || (!located.points.length && !trim),
      pins: located.pins.filter((pin) => !pin.storyboardHidden),
    },
    trim,
  );
}

export function studioCoverPreview(track: HikeTrack, config: ReceiptConfig) {
  if (!config.privacyTrimMeters) return printCover(track, config);
  try {
    return printCover(receiptSnapshot(track, config.privacyTrimMeters), config);
  } catch {
    return config.backgroundPhotoUrl ?? null;
  }
}

export function storyboardPhotoChoices(track: HikeTrack) {
  return withLocatedPhotos(track)
    .pins.filter((pin) => pin.photoDataUrl && !pin.storyboardHidden)
    .sort((a, b) => a.cumDistKm - b.cumDistKm || a.timestamp - b.timestamp);
}

function printBounds(H: number) {
  const story = H > 1350;
  const x = story ? 76 : 62;
  return {
    x,
    w: W - 2 * x,
    top: story ? 132 : 68,
    bottom: H - (story ? 146 : 62),
    H,
    story,
  };
}
type Bounds = ReturnType<typeof printBounds>;

function drawSignature(
  ctx: PrintContext,
  bounds: Bounds,
  track: HikeTrack,
  config: ReceiptConfig,
  copy: PrintCopy,
  colors: Palette,
) {
  const left = [
    config.showBranding !== false ? copy.signature : "",
    printProvenance(track),
    copy.eyebrow,
  ]
    .filter(Boolean)
    .join("   /   ");
  const date = copy.date.trim();
  if (!left && !date) return 0;
  label(
    ctx,
    left.toUpperCase(),
    bounds.x,
    bounds.top,
    date ? bounds.w * 0.62 : bounds.w,
    colors.ink,
    26,
    { weight: 750, tracking: 3 },
  );
  label(
    ctx,
    date,
    bounds.x + bounds.w,
    bounds.top,
    left ? bounds.w * 0.35 : bounds.w,
    colors.muted,
    28,
    { align: "right", weight: 550 },
  );
  line(
    ctx,
    bounds.x,
    bounds.top + 43,
    bounds.x + bounds.w,
    bounds.top + 43,
    colors.rule,
  );
  return 67;
}

function headline(
  ctx: PrintContext,
  track: HikeTrack,
  config: ReceiptConfig,
  bounds: Bounds,
  colors: Palette,
  size: number,
) {
  const title = textBlock(ctx, config.title.trim() || track.name, bounds.w, {
    size,
    min: 60,
    lines: 2,
    face: config.titleTypeface ?? "serif",
    weight: config.titleTypeface === "sans" ? 750 : 400,
    spacing: 1.02,
  });
  const location = textBlock(
    ctx,
    printSubtitle(track, config.subtitle),
    bounds.w,
    {
      size: 30,
      min: 26,
      lines: 1,
      face: "sans",
      weight: 550,
    },
  );
  const note = textBlock(ctx, config.customQuote ?? "", bounds.w - 28, {
    size: 38,
    min: 29,
    lines: 2,
    spacing: 1.16,
  });
  return {
    height:
      title.height +
      (location.height ? location.height + 12 : 0) +
      (note.height ? note.height + 22 : 0),
    draw(y: number) {
      typeset(ctx, title, bounds.x, y, colors.ink);
      y += title.height;
      if (location.height) {
        y += 12;
        typeset(ctx, location, bounds.x, y, colors.muted);
        y += location.height;
      }
      if (note.height) {
        y += 22;
        line(
          ctx,
          bounds.x,
          y + 5,
          bounds.x,
          y + note.height - 3,
          colors.accent,
          3,
        );
        typeset(ctx, note, bounds.x + 20, y, colors.ink);
      }
    },
  };
}

function footer(
  ctx: PrintContext,
  track: HikeTrack,
  snapshot: HikeTrack,
  config: ReceiptConfig,
  copy: PrintCopy,
  bounds: Bounds,
  colors: Palette,
  useEffort: boolean,
) {
  const units = config.units ?? "metric";
  const available =
    config.showStats !== false
      ? keepsakeFacts(track, units, useEffort && config.showDaylightAndPace)
      : [];
  const low = snapshot.points.reduce(
    (n, point) => Math.min(n, point.ele),
    Infinity,
  );
  const high = snapshot.points.reduce(
    (n, point) => Math.max(n, point.ele),
    -Infinity,
  );
  const profile =
    config.showElevationCurve &&
    hasElevation(track) &&
    high - low >= 1 &&
    snapshot.points.length > 1;
  const footerText = [
    copy.footer,
    ...(config.showBadge ? [copy.badgeTitle, copy.badgeNote] : []),
  ]
    .filter((part) => part.trim())
    .join(" · ");
  const footerBlock = textBlock(ctx, footerText, bounds.w, {
    size: 26,
    min: 23,
    lines: 2,
    face: "sans",
    spacing: 1.2,
  });
  const hasData = available.length > 0 || profile;
  const dataHeight = hasData ? 112 : 0;
  const height =
    dataHeight +
    (footerBlock.height ? footerBlock.height + (hasData ? 17 : 26) : 0);
  const y = bounds.bottom - height;

  return {
    top: y,
    draw() {
      if (!height) return;
      line(ctx, bounds.x, y, bounds.x + bounds.w, y, colors.rule);
      const chartW = profile
        ? available.length
          ? bounds.w * 0.3
          : bounds.w
        : 0;
      const factsW = bounds.w - chartW - (profile && available.length ? 32 : 0);
      const col = factsW / Math.max(1, available.length);
      available.forEach((fact, index) => {
        const x = bounds.x + col * index;
        if (index > 0)
          line(ctx, x - 14, y + 24, x - 14, y + 104, colors.rule, 1);
        label(ctx, fact.label, x, y + 20, col - 24, colors.muted, 27, {
          weight: 650,
        });
        typeset(
          ctx,
          textBlock(ctx, fact.value, col - 24, {
            size: 55,
            min: 32,
            lines: 1,
            face: "sans",
            weight: 700,
          }),
          x,
          y + 51,
          colors.ink,
        );
      });
      if (profile) {
        const x = bounds.x + bounds.w - chartW;
        const heading = copy.profileHeading.trim();
        label(ctx, heading, x, y + 20, chartW - 8, colors.muted, 27, {
          weight: 650,
        });
        const chart = {
          x,
          y: y + (heading ? 57 : 23),
          w: chartW,
          h: heading ? 49 : 83,
        };
        drawHeightProfile(
          ctx,
          chart,
          snapshot.points,
          colors.accent,
          colors.profile,
        );
      }
      if (footerBlock.height)
        typeset(ctx, footerBlock, bounds.x, y + dataHeight + 15, colors.muted);
    },
  };
}

type Cover = { photo: HTMLImageElement; credit?: string };

function creditLine(ctx: PrintContext, credit: string, box: PrintBox) {
  shade(ctx, { x: box.x, w: box.w, y: box.y + box.h - 70, h: 70 }, [
    [0, "#071a1900"],
    [1, "#071a19cf"],
  ]);
  label(
    ctx,
    `Cover: ${credit}`,
    box.x + 20,
    box.y + box.h - 41,
    box.w - 40,
    "#FCF1DE",
    22,
  );
}

function coverArt(
  ctx: PrintContext,
  cover: Cover | undefined,
  box: PrintBox,
  snapshot: HikeTrack,
  config: ReceiptConfig,
  copy: PrintCopy,
  dark = false,
) {
  const points = config.showRouteMiniMap ? snapshot.points : [];
  if (cover) {
    drawPrintPhoto(
      ctx,
      cover.photo,
      box,
      config.photoFocusX,
      config.photoFocusY,
    );
    if (cover.credit) creditLine(ctx, cover.credit, box);
    if (points.length) {
      const w = Math.round(box.w * 0.32);
      const h = Math.round(Math.min(box.h * 0.42, w * 0.61));
      const stamp = {
        x: box.x + box.w - w - 22,
        y: box.y + box.h - h - 22,
        w,
        h,
      };
      fill(
        ctx,
        { x: stamp.x - 4, y: stamp.y - 4, w: stamp.w + 8, h: stamp.h + 8 },
        dark ? "#FBE6C8" : "#F5EDDC",
      );
      drawRoutePlate(ctx, stamp, points, { dark, compact: true });
    }
  } else {
    drawRoutePlate(ctx, box, points, {
      dark,
      heading: copy.routeHeading,
      start: copy.startLabel,
    });
  }
}

function drawKeepsake(
  ctx: PrintContext,
  track: HikeTrack,
  snapshot: HikeTrack,
  config: ReceiptConfig,
  bounds: Bounds,
  cover?: Cover,
) {
  const { x, w, H, top, story } = bounds;
  const full = { x: 0, y: 0, w: W, h: H };
  const dark = config.template === "brutalist";
  const isAtlas = config.template === "topo-card";
  const colors = dark ? night : isAtlas ? atlas : paper;
  const copy = printCopy(track, config);
  const notes = headline(ctx, track, config, bounds, colors, story ? 116 : 104);
  const facts = footer(
    ctx,
    track,
    snapshot,
    config,
    copy,
    bounds,
    colors,
    true,
  );

  fill(ctx, full, colors.bg);
  if (dark) {
    if (cover) {
      drawPrintPhoto(
        ctx,
        cover.photo,
        full,
        config.photoFocusX,
        config.photoFocusY,
      );
      const bottomStart = facts.top - notes.height - 120;
      shade(ctx, { x: 0, y: 0, w: W, h: top + 237 }, [
        [0, "#071b1bea"],
        [0.5, "#0b1f21bb"],
        [1, "#0b1f2100"],
      ]);
      shade(
        ctx,
        { x: 0, y: bottomStart - 220, w: W, h: H - bottomStart + 220 },
        [
          [0, "#10252800"],
          [0.39, "#102528db"],
          [0.7, "#102528"],
          [1, "#102528"],
        ],
      );
      const plateBottom = facts.top - notes.height - 74;
      if (config.showRouteMiniMap && snapshot.points.length) {
        const stamp = { x: x + w - 340, y: plateBottom - 206, w: 340, h: 206 };
        drawRoutePlate(ctx, stamp, snapshot.points, {
          dark: true,
          compact: true,
        });
        ctx.strokeStyle = "#FFC18A9C";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(stamp.x, stamp.y, stamp.w, stamp.h);
      }
      if (cover.credit)
        label(
          ctx,
          `Cover: ${cover.credit}`,
          x,
          plateBottom - 7,
          w - 380,
          colors.muted,
          22,
        );
      drawSignature(ctx, bounds, track, config, copy, colors);
    } else {
      const artTop =
        top + drawSignature(ctx, bounds, track, config, copy, colors);
      const end = facts.top - notes.height - 70;
      coverArt(
        ctx,
        undefined,
        { x, y: artTop, w, h: end - artTop },
        snapshot,
        config,
        copy,
        true,
      );
      line(ctx, x, end, x + w, end, "#EDC29182");
    }
    notes.draw(facts.top - notes.height - 34);
  } else if (isAtlas) {
    const intro = top + drawSignature(ctx, bounds, track, config, copy, colors);
    notes.draw(intro);
    const box = {
      x,
      w,
      y: intro + notes.height + 31,
      h: facts.top - intro - notes.height - 59,
    };
    if (cover && config.showRouteMiniMap && snapshot.points.length) {
      const photoH = Math.round(box.h * 0.42);
      const imageBox = { ...box, h: photoH };
      drawPrintPhoto(
        ctx,
        cover.photo,
        imageBox,
        config.photoFocusX,
        config.photoFocusY,
      );
      if (cover.credit) creditLine(ctx, cover.credit, imageBox);
      drawRoutePlate(
        ctx,
        { ...box, y: box.y + photoH + 10, h: box.h - photoH - 10 },
        snapshot.points,
        { heading: copy.routeHeading, start: copy.startLabel },
      );
    } else coverArt(ctx, cover, box, snapshot, config, copy);
  } else {
    const y = top + drawSignature(ctx, bounds, track, config, copy, colors);
    const artEnd = facts.top - notes.height - 67;
    coverArt(ctx, cover, { x, y, w, h: artEnd - y }, snapshot, config, copy);
    notes.draw(artEnd + 33);
  }
  facts.draw();
}

type Moment = { pin: SpatialPin; photo: HTMLImageElement };

function printCaption(caption: string) {
  const text = caption.trim();
  // Camera filenames still help identify an image in the editor.
  return /^(?:trail photo|(?:img|dscn?|pxl|dji|mvimg|image|screenshot)[\s_-]*\d[\w -]*)$/i.test(
    text,
  )
    ? ""
    : text;
}

function drawMoment(
  ctx: PrintContext,
  moment: Moment,
  box: PrintBox,
  index: number,
  usePins: boolean,
  config: ReceiptConfig,
) {
  drawPrintPhoto(
    ctx,
    moment.photo,
    box,
    config.photoFocusX,
    config.photoFocusY,
  );
  if (usePins) {
    fill(ctx, { x: box.x + 16, y: box.y + 16, w: 53, h: 43 }, "#F5EDDC");
    label(
      ctx,
      String(index + 1).padStart(2, "0"),
      box.x + 42.5,
      box.y + 23,
      47,
      "#253D32",
      23,
      { align: "center", weight: 750 },
    );
  }
  const caption = printCaption(moment.pin.caption);
  if (caption) {
    shade(ctx, { x: box.x, y: box.y + box.h - 80, w: box.w, h: 80 }, [
      [0, "#06181900"],
      [1, "#061819e8"],
    ]);
    label(
      ctx,
      caption,
      box.x + 18,
      box.y + box.h - 42,
      box.w - 36,
      "#FFF4DE",
      25,
      { weight: 550 },
    );
  }
}

function drawJournal(
  ctx: PrintContext,
  track: HikeTrack,
  snapshot: HikeTrack,
  config: ReceiptConfig,
  bounds: Bounds,
  moments: Moment[],
) {
  const { x, w, H } = bounds;
  const copy = printCopy(track, config);
  const colors = journal;
  fill(ctx, { x: 0, y: 0, w: W, h: H }, colors.bg);
  const y =
    bounds.top + drawSignature(ctx, bounds, track, config, copy, colors);
  const notes = headline(
    ctx,
    track,
    config,
    bounds,
    colors,
    bounds.story ? 108 : 94,
  );
  notes.draw(y);
  const facts = footer(
    ctx,
    track,
    snapshot,
    config,
    copy,
    bounds,
    colors,
    false,
  );
  const artY = y + notes.height + 30;
  const artH = facts.top - artY - 28;
  const mapped =
    config.showRouteMiniMap &&
    (snapshot.points.length > 0 || moments.length > 0);
  const pins = moments.map((item) => item.pin);
  const gap = 12;
  const mapH =
    mapped && moments.length
      ? Math.round(artH * (bounds.story ? 0.33 : 0.36))
      : artH;
  const photoH = mapped ? artH - mapH - gap : artH;
  const photoY = artY + (moments.length && copy.momentsHeading.trim() ? 34 : 0);
  const availablePhotoH = photoH - (photoY - artY);

  if (moments.length) {
    label(ctx, copy.momentsHeading, x, artY, w, colors.muted, 22, {
      weight: 650,
    });
    const mainWidth = moments.length === 1 ? w : Math.round(w * 0.59);
    drawMoment(
      ctx,
      moments[0],
      { x, y: photoY, w: mainWidth, h: availablePhotoH },
      0,
      mapped,
      config,
    );
    const sideH =
      (availablePhotoH - (moments.length === 3 ? gap : 0)) /
      Math.max(1, moments.length - 1);
    moments.slice(1).forEach((moment, index) => {
      drawMoment(
        ctx,
        moment,
        {
          x: x + mainWidth + gap,
          y: photoY + index * (sideH + gap),
          w: w - mainWidth - gap,
          h: sideH,
        },
        index + 1,
        mapped,
        config,
      );
    });
  }
  if (mapped)
    drawRoutePlate(
      ctx,
      { x, y: artY + artH - mapH, w, h: mapH },
      snapshot.points,
      {
        pins,
        heading: snapshot.points.length ? copy.routeHeading : "Photo locations",
        start: copy.startLabel,
      },
    );
  if (!mapped && !moments.length)
    drawRoutePlate(ctx, { x, y: artY, w, h: artH }, []);
  facts.draw();
}

let fonts: Promise<unknown> | undefined;
function loadFonts() {
  if (typeof document === "undefined" || !document.fonts)
    return Promise.resolve();
  return (fonts ??= Promise.allSettled([
    document.fonts.load(printFont("sans", 28, 700)),
    document.fonts.load(printFont("serif", 100)),
  ]));
}

function startDrawing(
  canvas: HTMLCanvasElement,
  config: ReceiptConfig,
  width: number,
) {
  const bounds = printBounds(config.aspectRatio === "9:16" ? 1920 : 1350);
  canvas.width = width;
  canvas.height = Math.round((bounds.H * width) / W);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device could not draw your picture.");
  ctx.scale(canvas.width / W, canvas.height / bounds.H);
  return { ctx, bounds };
}

export async function renderSummitReceipt(
  canvas: HTMLCanvasElement,
  track: HikeTrack,
  config: ReceiptConfig,
  previewWidth = W,
) {
  const revision = (revisions.get(canvas) ?? 0) + 1;
  revisions.set(canvas, revision);
  const snapshot = receiptSnapshot(track, config.privacyTrimMeters);
  const photoUrl = printCover(snapshot, config);
  const [photo] = await Promise.all([
    photoUrl ? loadCanvasImage(photoUrl) : undefined,
    loadFonts(),
  ]);
  if (revisions.get(canvas) !== revision) return;
  const { ctx, bounds } = startDrawing(canvas, config, previewWidth);
  drawKeepsake(
    ctx,
    track,
    snapshot,
    config,
    bounds,
    photo ? { photo, credit: coverCredit(photoUrl) } : undefined,
  );
}

export async function renderPhotoMapPoster(
  canvas: HTMLCanvasElement,
  track: HikeTrack,
  config: ReceiptConfig,
) {
  const revision = (revisions.get(canvas) ?? 0) + 1;
  revisions.set(canvas, revision);
  const choices = storyboardPhotoChoices(track);
  if (config.storyLeadPhotoId)
    choices.sort(
      (a, b) =>
        Number(b.id === config.storyLeadPhotoId) -
        Number(a.id === config.storyLeadPhotoId),
    );
  const snapshot = prepareStoryboardTrack(
    { ...track, pins: choices },
    config.privacyTrimMeters,
  );
  const candidates = snapshot.pins.filter((pin) => pin.photoDataUrl);
  const moments: Moment[] = [];
  const fontsReady = loadFonts();
  // A bad photo can be skipped without leaving a hole or renumbering the map independently.
  let offset = 0;
  while (
    offset < candidates.length &&
    moments.length < STORYBOARD_PHOTO_LIMIT
  ) {
    const batch = candidates.slice(
      offset,
      offset + STORYBOARD_PHOTO_LIMIT - moments.length,
    );
    offset += batch.length;
    const decoded = await Promise.allSettled(
      batch.map(async (pin) => ({
        pin,
        photo: await loadCanvasImage(pin.photoDataUrl!),
      })),
    );
    if (revisions.get(canvas) !== revision) return;
    for (const result of decoded)
      if (result.status === "fulfilled") moments.push(result.value);
  }
  await fontsReady;
  if (revisions.get(canvas) !== revision) return;
  if (!snapshot.points.length && !moments.length)
    throw new Error("Place a photo on the map or add a route first.");
  const { ctx, bounds } = startDrawing(canvas, config, W);
  drawJournal(ctx, track, snapshot, config, bounds, moments);
}
