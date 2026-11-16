import type { HikeTrack, TrackPoint } from "@/types/trek.types";
import { interpolateTrackByTime, interpolateBetween } from "./gpx-engine";
import { locateOnTrail } from "./trail-navigation";

export interface PhotoMetadata {
  lat?: number;
  lng?: number;
  ele?: number;
  timestamp?: number;
  timeSource?: "exif" | "file";
}

interface IfdEntry {
  type: number;
  count: number;
  position: number;
}

/** Reads TIFF IFD values from a bounded JPEG APP1 segment. */
class ExifTiffReader {
  private view: DataView;
  private littleEndian: boolean;
  private start: number;
  private end: number;

  constructor(view: DataView, start: number, end: number) {
    this.view = view;
    this.start = start;
    this.end = end;
    const endian = this.u16(start, false);
    if (endian !== 0x4949 && endian !== 0x4d4d)
      throw new Error("Invalid EXIF byte order");
    this.littleEndian = endian === 0x4949;
    if (this.u16(start + 2) !== 42) throw new Error("Invalid TIFF header");
  }

  private check(position: number, length: number): void {
    if (position < this.start || length < 0 || position + length > this.end) {
      throw new Error("EXIF value outside APP1 segment");
    }
  }

  private u16(position: number, littleEndian = this.littleEndian): number {
    this.check(position, 2);
    return this.view.getUint16(position, littleEndian);
  }

  private u32(position: number): number {
    this.check(position, 4);
    return this.view.getUint32(position, this.littleEndian);
  }

  private bytesPerValue(type: number): number {
    if (type === 1 || type === 2 || type === 7) return 1;
    if (type === 3) return 2;
    if (type === 4 || type === 9) return 4;
    if (type === 5 || type === 10) return 8;
    return 0;
  }

  readIfd(relativeOffset: number): Map<number, IfdEntry> {
    const position = this.start + relativeOffset;
    const count = this.u16(position);
    this.check(position + 2, count * 12 + 4);
    const entries = new Map<number, IfdEntry>();
    for (let i = 0; i < count; i++) {
      const entry = position + 2 + i * 12;
      const tag = this.u16(entry);
      const type = this.u16(entry + 2);
      const valueCount = this.u32(entry + 4);
      const byteCount = valueCount * this.bytesPerValue(type);
      if (!byteCount || byteCount > this.end - this.start) continue;
      const valuePosition =
        byteCount <= 4 ? entry + 8 : this.start + this.u32(entry + 8);
      this.check(valuePosition, byteCount);
      entries.set(tag, { type, count: valueCount, position: valuePosition });
    }
    return entries;
  }

  unsigned(entry: IfdEntry | undefined): number | undefined {
    if (!entry || entry.count !== 1) return undefined;
    if (entry.type === 1) {
      this.check(entry.position, 1);
      return this.view.getUint8(entry.position);
    }
    if (entry.type === 3) return this.u16(entry.position);
    if (entry.type === 4) return this.u32(entry.position);
    return undefined;
  }

  ascii(entry: IfdEntry | undefined): string | undefined {
    if (!entry || entry.type !== 2) return undefined;
    this.check(entry.position, entry.count);
    let value = "";
    for (let i = 0; i < entry.count; i++) {
      const code = this.view.getUint8(entry.position + i);
      if (code === 0) break;
      value += String.fromCharCode(code);
    }
    return value.trim() || undefined;
  }

  rationals(
    entry: IfdEntry | undefined,
    expectedCount: number,
  ): number[] | undefined {
    if (!entry || entry.type !== 5 || entry.count !== expectedCount)
      return undefined;
    const values: number[] = [];
    for (let i = 0; i < expectedCount; i++) {
      const position = entry.position + i * 8;
      const denominator = this.u32(position + 4);
      if (!denominator) return undefined;
      values.push(this.u32(position) / denominator);
    }
    return values;
  }

  firstIfd(): Map<number, IfdEntry> {
    return this.readIfd(this.u32(this.start + 4));
  }
}

function decimalDegrees(
  values: number[] | undefined,
  reference: string | undefined,
): number | undefined {
  if (!values || !reference) return undefined;
  const degrees = values[0] + values[1] / 60 + values[2] / 3600;
  const direction = reference.toUpperCase();
  if (direction === "S" || direction === "W") return -degrees;
  if (direction === "N" || direction === "E") return degrees;
  return undefined;
}

function exifDateToTimestamp(
  value: string | undefined,
  offset?: string,
): number | undefined {
  const match = value?.match(
    /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return undefined;
  // EXIF DateTimeOriginal has no timezone. Interpret it in the device's local timezone.
  const [, year, month, day, hour, minute, second] = match;
  if (
    +year < 100 ||
    +month < 1 ||
    +month > 12 ||
    +day < 1 ||
    +day > 31 ||
    +hour > 23 ||
    +minute > 59 ||
    +second > 59
  )
    return undefined;
  if (offset && /^[+-](?:[01]\d|2[0-3]):[0-5]\d$/.test(offset)) {
    const utc = new Date(
      Date.UTC(+year, +month - 1, +day, +hour, +minute, +second),
    );
    if (utc.getUTCDate() !== +day) return undefined;
    return Date.parse(
      `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`,
    );
  }
  const date = new Date(+year, +month - 1, +day, +hour, +minute, +second);
  if (
    date.getFullYear() !== +year ||
    date.getMonth() !== +month - 1 ||
    date.getDate() !== +day
  ) {
    return undefined;
  }
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function parseExifSegment(
  view: DataView,
  start: number,
  end: number,
): PhotoMetadata {
  if (end - start < 14) return {};
  const signature = [0x45, 0x78, 0x69, 0x66, 0, 0];
  if (!signature.every((byte, index) => view.getUint8(start + index) === byte))
    return {};

  const reader = new ExifTiffReader(view, start + 6, end);
  const root = reader.firstIfd();
  const metadata: PhotoMetadata = {};

  const gpsOffset = reader.unsigned(root.get(0x8825));
  if (gpsOffset !== undefined) {
    const gps = reader.readIfd(gpsOffset);
    const lat = decimalDegrees(
      reader.rationals(gps.get(0x0002), 3),
      reader.ascii(gps.get(0x0001)),
    );
    const lng = decimalDegrees(
      reader.rationals(gps.get(0x0004), 3),
      reader.ascii(gps.get(0x0003)),
    );
    if (lat !== undefined && Math.abs(lat) <= 90) metadata.lat = lat;
    if (lng !== undefined && Math.abs(lng) <= 180) metadata.lng = lng;
    const altitude = reader.rationals(gps.get(0x0006), 1)?.[0];
    if (altitude !== undefined)
      metadata.ele =
        reader.unsigned(gps.get(0x0005)) === 1 ? -altitude : altitude;
  }

  const exifOffset = reader.unsigned(root.get(0x8769));
  if (exifOffset !== undefined) {
    const exif = reader.readIfd(exifOffset);
    const timestamp = exifDateToTimestamp(
      reader.ascii(exif.get(0x9003)),
      reader.ascii(exif.get(0x9011)),
    );
    if (timestamp !== undefined) {
      metadata.timestamp = timestamp;
      metadata.timeSource = "exif";
    }
  }
  return metadata;
}

function parseJpegExif(buffer: ArrayBuffer): PhotoMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return {};
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;
    while (offset < view.byteLength && view.getUint8(offset) === 0xff) offset++;
    if (offset >= view.byteLength) break;
    const marker = view.getUint8(offset++);
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > view.byteLength) break;
    const segmentLength = view.getUint16(offset, false);
    if (segmentLength < 2 || offset + segmentLength > view.byteLength) break;
    if (marker === 0xe1) {
      const metadata = parseExifSegment(
        view,
        offset + 2,
        offset + segmentLength,
      );
      if (Object.keys(metadata).length) return metadata;
    }
    offset += segmentLength;
  }
  return {};
}

/** Read only the first 128 KB; corrupt or unsupported images use lastModified. */
export async function extractPhotoMetadata(file: File): Promise<PhotoMetadata> {
  const fallback: PhotoMetadata = Number.isFinite(file.lastModified)
    ? { timestamp: file.lastModified, timeSource: "file" }
    : {};
  try {
    const buffer = await file.slice(0, 131072).arrayBuffer();
    return { ...fallback, ...parseJpegExif(buffer) };
  } catch {
    return fallback;
  }
}

/** Scale a local image without stretching it, then prefer WebP with JPEG fallback. */
export async function compressPhotoToDataUrl(
  file: File,
  maxDimension = 900,
  quality = 0.78,
): Promise<string> {
  if (!Number.isFinite(maxDimension) || maxDimension <= 0)
    throw new Error("Invalid image dimension");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const source = new Image();
      const timeout = setTimeout(() => {
        source.onload = source.onerror = null;
        reject(
          new Error(
            "This photo took too long to open. Try a smaller JPEG or PNG.",
          ),
        );
      }, 15000);
      source.onload = () => {
        clearTimeout(timeout);
        resolve(source);
      };
      source.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error("Could not load photo. Choose a JPEG, PNG, or WebP image."),
        );
      };
      source.src = objectUrl;
    });
    const scale = Math.min(
      1,
      maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    try {
      const webp = canvas.toDataURL("image/webp", quality);
      if (webp.startsWith("data:image/webp;")) return webp;
    } catch {
      // Some WebViews cannot encode WebP; JPEG remains available.
    }
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface PhotoMatch {
  lat: number;
  lng: number;
  ele: number;
  cumDistKm: number;
  exifSource: "gps" | "timestamp" | "manual";
}

function positionOf(
  point: TrackPoint,
  exifSource: PhotoMatch["exifSource"],
): PhotoMatch {
  return {
    lat: point.lat,
    lng: point.lng,
    ele: point.ele,
    cumDistKm: point.cumDistKm,
    exifSource,
  };
}

/** GPS within 2 km wins; then capture time; then the track's highest point. */
export function matchPhotoToTrack(
  meta: PhotoMetadata,
  track: HikeTrack,
): PhotoMatch {
  if (!track.points.length)
    throw new Error("Cannot pin a photo to an empty track");

  const timed =
    meta.timestamp !== undefined && meta.timeSource !== "file"
      ? interpolateTrackByTime(meta.timestamp, track.points)
      : null;
  if (
    meta.lat !== undefined &&
    meta.lng !== undefined &&
    Number.isFinite(meta.lat) &&
    Number.isFinite(meta.lng) &&
    Math.abs(meta.lat) <= 90 &&
    Math.abs(meta.lng) <= 180
  ) {
    const match = locateOnTrail(
      meta.lat,
      meta.lng,
      track.points,
      timed?.cumDistKm,
    );
    if (match.offTrackMeters <= 2000) {
      const start = track.points[match.segmentStart];
      const point =
        match.fraction === 0
          ? start
          : interpolateBetween(
              start,
              track.points[match.segmentStart + 1],
              match.fraction,
            );
      return positionOf(point, "gps");
    }
  }

  if (timed) return positionOf(timed, "timestamp");

  const summit = track.points.reduce((highest, point) =>
    point.ele > highest.ele ? point : highest,
  );
  return positionOf(summit, "manual");
}
