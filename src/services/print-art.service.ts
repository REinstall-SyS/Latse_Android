import {
  contourPaths,
  projectRoute,
  routeContourField,
  smoothCurve,
  type ChartPoint,
} from "@/domain/cartography";
import { PRINT_FONTS } from "@/domain/print-design";
import { photoCropRect } from "@/domain/receipt-layout";
import type { SpatialPin, TrackPoint } from "@/types/trek.types";

export type PrintContext = CanvasRenderingContext2D;
export type PrintBox = { x: number; y: number; w: number; h: number };
type Paint = string | CanvasGradient;

export function fill(ctx: PrintContext, box: PrintBox, color: Paint) {
  ctx.fillStyle = color;
  ctx.fillRect(box.x, box.y, box.w, box.h);
}

export function line(
  ctx: PrintContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 1.5,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function dot(
  ctx: PrintContext,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

export function shade(
  ctx: PrintContext,
  box: PrintBox,
  stops: ReadonlyArray<readonly [number, string]>,
) {
  const gradient = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
  for (const [stop, color] of stops) gradient.addColorStop(stop, color);
  fill(ctx, box, gradient);
}

export function drawPrintPhoto(
  ctx: PrintContext,
  image: HTMLImageElement,
  box: PrintBox,
  focusX?: number,
  focusY?: number,
) {
  const crop = photoCropRect(
    image.naturalWidth,
    image.naturalHeight,
    box,
    focusY,
    focusX,
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h);
  ctx.restore();
}

type Face = keyof typeof PRINT_FONTS;
export function printFont(face: Face, size: number, weight = 400) {
  return `${weight} ${size}px ${PRINT_FONTS[face]}`;
}

export function label(
  ctx: PrintContext,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  color: string,
  size = 27,
  options: { align?: CanvasTextAlign; weight?: number; tracking?: number } = {},
) {
  if (!value.trim() || maxWidth <= 0) return;
  ctx.save();
  ctx.font = printFont("sans", size, options.weight ?? 600);
  ctx.letterSpacing = `${options.tracking ?? 0}px`;
  ctx.textBaseline = "top";
  ctx.textAlign = options.align ?? "left";
  ctx.fillStyle = color;
  ctx.fillText(ellipsize(ctx, value, maxWidth), x, y);
  ctx.restore();
}

function ellipsize(ctx: PrintContext, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  const chars = [...text];
  while (chars.length && ctx.measureText(chars.join("") + "…").width > width)
    chars.pop();
  return chars.join("").trimEnd() + "…";
}

type TextBlock = {
  lines: string[];
  font: string;
  leading: number;
  height: number;
};

/** Fit useful type first, then wrap at words. Very long single words still respect the column. */
export function textBlock(
  ctx: PrintContext,
  text: string,
  width: number,
  {
    size,
    min = size,
    lines: maximum = 2,
    face = "serif",
    weight = 400,
    spacing = 1.03,
  }: {
    size: number;
    min?: number;
    lines?: number;
    face?: Face;
    weight?: number;
    spacing?: number;
  },
): TextBlock {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let font: string;
  let lines: string[];
  for (;;) {
    font = printFont(face, size, weight);
    ctx.font = font;
    lines = [];
    let current = "";
    for (const word of words) {
      const combined = current ? `${current} ${word}` : word;
      if (ctx.measureText(combined).width <= width) current = combined;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    if (
      (lines.length <= maximum &&
        lines.every((item) => ctx.measureText(item).width <= width)) ||
      size <= min
    )
      break;
    size = Math.max(min, size - 4);
  }
  if (lines.length > maximum)
    lines = [
      ...lines.slice(0, maximum - 1),
      lines.slice(maximum - 1).join(" "),
    ];
  if (maximum === 2 && lines.length === 2) {
    let balance = Infinity;
    for (let split = 1; split < words.length; split++) {
      const left = words.slice(0, split).join(" ");
      const right = words.slice(split).join(" ");
      const a = ctx.measureText(left).width;
      const b = ctx.measureText(right).width;
      if (Math.max(a, b) > width) continue;
      const gap = Math.abs(a - b);
      if (gap < balance) {
        balance = gap;
        lines = [left, right];
      }
    }
  }
  lines = lines.map((value) => ellipsize(ctx, value, width));
  const leading = Math.ceil(size * spacing);
  return { lines, font, leading, height: lines.length * leading };
}

export function typeset(
  ctx: PrintContext,
  block: TextBlock,
  x: number,
  y: number,
  ink: string,
) {
  ctx.save();
  ctx.font = block.font;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  block.lines.forEach((value, index) =>
    ctx.fillText(value, x, y + index * block.leading),
  );
  ctx.restore();
}

function beginPath(ctx: PrintContext, points: ChartPoint[]) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
}

/** A quiet ink pattern on the plates, deterministic at every preview size. */
function grain(ctx: PrintContext, w: number, h: number, ink: string) {
  ctx.fillStyle = ink;
  let seed = 1701;
  for (let i = 0; i < (w * h) / 190; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = (seed / 4294967296) * w;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    ctx.fillRect(x, (seed / 4294967296) * h, 1.3, 1.3);
  }
}

function drawTimeRings(ctx: PrintContext, w: number, h: number, dark: boolean) {
  const size = Math.min(w, h);
  const center = { x: w * 0.46, y: h * 0.52 };
  dot(ctx, center.x, center.y, size * 0.121, dark ? "#DDA777" : "#B86240");
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.ellipse(
      center.x,
      center.y,
      size * (0.16 + i * 0.034),
      size * (0.105 + i * 0.032),
      -0.48,
      0,
      Math.PI * 2,
    );
    ctx.strokeStyle = dark ? "#D1DEB74D" : "#53715A52";
    ctx.lineWidth = i % 4 === 0 ? 2 : 1;
    ctx.stroke();
  }
}

function printPins(
  ctx: PrintContext,
  locations: ChartPoint[],
  box: PrintBox,
  dark: boolean,
) {
  const used: ChartPoint[] = [];
  const ink = dark ? "#FFDDAD" : "#243F35";
  locations.forEach((anchor, index) => {
    const offsets = [
      [0, 0],
      [0, -54],
      [54, 0],
      [-54, 0],
      [0, 54],
      [39, -39],
      [-39, -39],
      [39, 39],
      [-39, 39],
      [0, -105],
    ];
    const badge =
      offsets
        .map(([dx, dy]) => ({ x: anchor.x + dx, y: anchor.y + dy }))
        .find(
          (point) =>
            point.x > 22 &&
            point.x < box.w - 22 &&
            point.y > 22 &&
            point.y < box.h - 22 &&
            used.every(
              (prior) => Math.hypot(prior.x - point.x, prior.y - point.y) >= 48,
            ),
        ) ?? anchor;
    used.push(badge);
    if (badge.x !== anchor.x || badge.y !== anchor.y) {
      line(ctx, anchor.x, anchor.y, badge.x, badge.y, ink, 2);
      dot(ctx, anchor.x, anchor.y, 5, ink);
    }
    dot(ctx, badge.x, badge.y, 21, dark ? "#102728" : "#FCF3DD");
    dot(ctx, badge.x, badge.y, 18, ink);
    label(
      ctx,
      String(index + 1).padStart(2, "0"),
      badge.x,
      badge.y - 12,
      33,
      dark ? "#102728" : "#FCF3DD",
      20,
      { align: "center", weight: 800 },
    );
  });
}

export function drawRoutePlate(
  ctx: PrintContext,
  box: PrintBox,
  points: TrackPoint[],
  {
    pins = [],
    dark = false,
    compact = false,
    heading = "",
    start = "",
  }: {
    pins?: SpatialPin[];
    dark?: boolean;
    compact?: boolean;
    heading?: string;
    start?: string;
  } = {},
) {
  const { w, h } = box;
  const hasGeometry = points.length > 0 || pins.length > 0;
  ctx.save();
  ctx.translate(box.x, box.y);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();

  const wash = ctx.createLinearGradient(0, 0, w, h);
  wash.addColorStop(0, dark ? "#10282E" : "#EEE7CB");
  wash.addColorStop(0.62, dark ? "#24474A" : "#CEDCC2");
  wash.addColorStop(1, dark ? "#315957" : "#C0CCAD");
  fill(ctx, { x: 0, y: 0, w, h }, wash);
  if (!compact) grain(ctx, w, h, dark ? "#FCE4B225" : "#3D52382C");

  if (!hasGeometry) {
    drawTimeRings(ctx, w, h, dark);
    ctx.restore();
    return;
  }

  const shortSide = Math.min(w, h);
  const padding = Math.round(shortSide * (compact ? 0.21 : 0.15));
  const projection = projectRoute(points, w, h, padding, pins);
  const path = projection.slice(0, points.length);
  const ink = dark ? "#DBEBCC" : "#314D3F";
  const accent = dark ? "#FFC18A" : "#A6482D";

  if (!compact) {
    for (let x = 38; x < w; x += 64)
      for (let y = 38; y < h; y += 64)
        dot(ctx, x, y, 1.5, dark ? "#CFE3B945" : "#4C65524A");
  }

  const spine = path.length ? path : projection;
  const field = routeContourField(spine, w, h, [
    points[0]?.ele ?? 0,
    points[Math.floor(points.length / 2)]?.ele ?? 0,
  ]);
  const rings = compact ? 7 : 15;
  for (let ring = 1; ring <= rings; ring++) {
    const contours = contourPaths(
      field,
      ring * (shortSide / (compact ? 37 : 52)),
    );
    for (const segment of contours) {
      beginPath(ctx, segment);
      ctx.lineWidth = ring % 4 === 0 ? 1.7 : 1.1;
      ctx.strokeStyle = dark
        ? ring % 4 === 0
          ? "#CEE2BC61"
          : "#CEE2BC38"
        : ring % 4 === 0
          ? "#49665066"
          : "#49665040";
      ctx.stroke();
    }
  }

  if (path.length) {
    const stride = Math.max(1, Math.ceil(path.length / 1500));
    const route = path.filter(
      (_, index) => index % stride === 0 || index === path.length - 1,
    );
    beginPath(ctx, route);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = dark ? "#12282B" : "#FDF2D5";
    ctx.lineWidth = compact ? 10 : 17;
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.lineWidth = compact ? 5 : 8;
    ctx.stroke();
    const startPoint = path[0];
    const endPoint = path[path.length - 1];
    dot(ctx, endPoint.x, endPoint.y, compact ? 6 : 10, accent);
    dot(
      ctx,
      startPoint.x,
      startPoint.y,
      compact ? 5 : 9,
      dark ? "#EFF4D5" : "#FBF4DF",
    );
    dot(ctx, startPoint.x, startPoint.y, compact ? 2.5 : 4, accent);
    if (start && !compact)
      label(
        ctx,
        start,
        Math.min(w - 150, startPoint.x + 15),
        startPoint.y + 15,
        110,
        ink,
        20,
      );
  }

  printPins(ctx, projection.slice(points.length), box, dark);
  if (!compact) {
    if (heading)
      label(ctx, heading.toUpperCase(), 26, 24, w - 104, ink, 24, {
        tracking: 2,
        weight: 750,
      });
    const northX = w - 40;
    ctx.beginPath();
    ctx.moveTo(northX, 50);
    ctx.lineTo(northX - 8, 71);
    ctx.lineTo(northX, 67);
    ctx.lineTo(northX + 8, 71);
    ctx.closePath();
    ctx.fillStyle = ink;
    ctx.fill();
    label(ctx, "N", northX, 22, 25, ink, 19, { align: "center", weight: 800 });
    line(ctx, 22, h - 25, 54, h - 25, ink);
    line(ctx, 22, h - 25, 22, h - 57, ink);
  }
  ctx.restore();
}

export function drawHeightProfile(
  ctx: PrintContext,
  box: PrintBox,
  points: TrackPoint[],
  color: string,
  tint: string,
) {
  const low = points.reduce(
    (value, point) => Math.min(value, point.ele),
    Infinity,
  );
  const high = points.reduce(
    (value, point) => Math.max(value, point.ele),
    -Infinity,
  );
  const length = points[points.length - 1].cumDistKm - points[0].cumDistKm;
  if (length <= 0 || high - low < 1) return;
  const step = Math.max(1, Math.ceil(points.length / 300));
  const ridge = points.flatMap((point, index) =>
    index % step === 0 || index === points.length - 1
      ? [
          {
            x:
              box.x +
              ((point.cumDistKm - points[0].cumDistKm) / length) * box.w,
            y: box.y + 5 + ((high - point.ele) / (high - low)) * (box.h - 10),
          },
        ]
      : [],
  );
  const curve = smoothCurve(ridge);
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(ridge[0].x, ridge[0].y);
    for (const point of curve)
      ctx.bezierCurveTo(
        point.c1x,
        point.c1y,
        point.c2x,
        point.c2y,
        point.x,
        point.y,
      );
  };
  outline();
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.closePath();
  ctx.fillStyle = tint;
  ctx.fill();
  outline();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
}
