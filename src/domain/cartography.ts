import type { TrackPoint } from "@/types/trek.types";

export interface ChartPoint {
  x: number;
  y: number;
}

/** Catmull–Rom converted to cubic Béziers, including switchbacks and vertical runs. */
export function routeCurves(points: ChartPoint[]) {
  return points.slice(1).map((end, index) => {
    const start = points[index],
      before = points[Math.max(0, index - 1)],
      after = points[Math.min(points.length - 1, index + 2)];
    return {
      start,
      end,
      c1: {
        x: start.x + (end.x - before.x) / 6,
        y: start.y + (end.y - before.y) / 6,
      },
      c2: {
        x: end.x - (after.x - start.x) / 6,
        y: end.y - (after.y - start.y) / 6,
      },
    };
  });
}

/** Monotone cubic controls keep hills smooth without inventing higher peaks. */
export function smoothCurve(
  points: ChartPoint[],
): Array<ChartPoint & { c1x: number; c1y: number; c2x: number; c2y: number }> {
  if (points.length < 2) return [];
  const slopes = points.slice(1).map((point, index) => {
    const dx = point.x - points[index].x;
    return dx > 0 ? (point.y - points[index].y) / dx : 0;
  });
  const tangents = points.map((_, index) => {
    if (index === 0) return slopes[0];
    if (index === points.length - 1) return slopes[slopes.length - 1];
    const left = slopes[index - 1],
      right = slopes[index];
    return left * right <= 0 ? 0 : (2 * left * right) / (left + right);
  });
  return points.slice(1).map((point, index) => {
    const previous = points[index],
      third = Math.max(0, point.x - previous.x) / 3;
    return {
      ...point,
      c1x: previous.x + third,
      c1y: previous.y + tangents[index] * third,
      c2x: point.x - third,
      c2y: point.y - tangents[index + 1] * third,
    };
  });
}

/** Aspect-preserving local projection, including routes that cross the date line. */
export function projectRoute(
  points: TrackPoint[],
  width: number,
  height: number,
  padding = 12,
  locations: ReadonlyArray<Pick<TrackPoint, "lat" | "lng">> = [],
): ChartPoint[] {
  const origin = points[0] ?? locations[0];
  if (!origin) return [];
  const cosine = Math.max(0.001, Math.cos((origin.lat * Math.PI) / 180));
  let longitude = origin.lng;
  const coordinates = points.map((point, index) => {
    if (index)
      longitude += ((point.lng - points[index - 1].lng + 540) % 360) - 180;
    return { x: (longitude - origin.lng) * cosine, y: -point.lat };
  });
  const centerLongitude = (origin.lng + longitude) / 2;
  for (const location of locations) {
    const lng =
      location.lng + 360 * Math.round((centerLongitude - location.lng) / 360);
    coordinates.push({ x: (lng - origin.lng) * cosine, y: -location.lat });
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of coordinates) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const usableWidth = Math.max(0, width - padding * 2),
    usableHeight = Math.max(0, height - padding * 2);
  const scale = Math.min(
    usableWidth / Math.max(maxX - minX, 1e-9),
    usableHeight / Math.max(maxY - minY, 1e-9),
  );
  return coordinates.map((point) => ({
    x: width / 2 + (point.x - (minX + maxX) / 2) * scale,
    y: height / 2 + (point.y - (minY + maxY) / 2) * scale,
  }));
}

interface ContourField {
  columns: number;
  rows: number;
  dx: number;
  dy: number;
  values: Float64Array;
}

/** A stylized distance field around the route, modulated by its elevation samples. */
export function routeContourField(
  path: ChartPoint[],
  width: number,
  height: number,
  elevations: [number, number],
): ContourField {
  const columns = Math.ceil(width / 8) + 1;
  const rows = Math.ceil(height / 8) + 1;
  const dx = width / (columns - 1);
  const dy = height / (rows - 1);
  const values = new Float64Array(columns * rows);
  const step = Math.max(1, Math.ceil((path.length - 1) / 160));
  const spine = path.filter((_, i) => i % step === 0 || i === path.length - 1);
  const segments = spine.slice(1).map((b, i) => {
    const a = spine[i];
    const x = b.x - a.x;
    const y = b.y - a.y;
    return { a, x, y, square: x * x + y * y || 1 };
  });
  const phaseX = elevations[0] * 0.009;
  const phaseY = elevations[1] * 0.013;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = column * dx;
      const y = row * dy;
      let nearest = Infinity;
      for (const segment of segments) {
        const offsetX = x - segment.a.x;
        const offsetY = y - segment.a.y;
        const along = Math.max(
          0,
          Math.min(
            1,
            (offsetX * segment.x + offsetY * segment.y) / segment.square,
          ),
        );
        const east = offsetX - along * segment.x;
        const north = offsetY - along * segment.y;
        nearest = Math.min(nearest, east * east + north * north);
      }
      if (!segments.length)
        nearest = (x - spine[0].x) ** 2 + (y - spine[0].y) ** 2;
      const modulation =
        1 +
        0.19 * Math.sin(x / 81 + y / 157 + phaseX) +
        0.12 * Math.sin(x / 137 - y / 69 + phaseY) +
        0.06 * Math.cos(x / 46 + y / 83 + phaseX + phaseY);
      values[row * columns + column] = Math.sqrt(nearest) * modulation;
    }
  }
  return { columns, rows, dx, dy, values };
}

/** Trace the level crossings through shared grid edges so contours join cleanly. */
export function contourPaths(
  field: ContourField,
  level: number,
): ChartPoint[][] {
  const { columns, rows, dx, dy, values } = field;
  const neighbors = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    const from = neighbors.get(a) ?? [];
    const to = neighbors.get(b) ?? [];
    from.push(b);
    to.push(a);
    neighbors.set(a, from);
    neighbors.set(b, to);
  };
  for (let row = 0; row < rows - 1; row++) {
    for (let column = 0; column < columns - 1; column++) {
      const tl = row * columns + column;
      const corners = [
        values[tl],
        values[tl + 1],
        values[tl + columns + 1],
        values[tl + columns],
      ];
      const edges = [tl * 2, (tl + 1) * 2 + 1, (tl + columns) * 2, tl * 2 + 1];
      const crossings = edges.filter(
        (_, i) => corners[i] < level !== corners[(i + 1) % 4] < level,
      );
      if (crossings.length === 2) link(crossings[0], crossings[1]);
      else if (crossings.length === 4) {
        const center = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
        if (center < level === corners[0] < level) {
          link(edges[0], edges[1]);
          link(edges[2], edges[3]);
        } else {
          link(edges[0], edges[3]);
          link(edges[1], edges[2]);
        }
      }
    }
  }
  const pointAt = (edge: number): ChartPoint => {
    const index = Math.floor(edge / 2);
    const vertical = edge % 2 === 1;
    const a = values[index];
    const b = values[index + (vertical ? columns : 1)];
    const fraction = (level - a) / (b - a);
    return {
      x: ((index % columns) + (vertical ? 0 : fraction)) * dx,
      y: (Math.floor(index / columns) + (vertical ? fraction : 0)) * dy,
    };
  };
  const paths: ChartPoint[][] = [];
  const visited = new Set<number>();
  const trace = (start: number) => {
    if (visited.has(start)) return;
    const path: ChartPoint[] = [];
    let previous: number | undefined;
    let edge: number | undefined = start;
    while (edge !== undefined && !visited.has(edge)) {
      visited.add(edge);
      path.push(pointAt(edge));
      const next: number | undefined = neighbors
        .get(edge)
        ?.find((id) => id !== previous);
      previous = edge;
      edge = next;
    }
    if (edge === start) path.push(path[0]);
    if (path.length > 1) paths.push(path);
  };
  for (const [edge, connected] of neighbors)
    if (connected.length === 1) trace(edge);
  for (const edge of neighbors.keys()) trace(edge);
  return paths;
}
