interface ExifOptions {
  littleEndian?: boolean;
  latRef?: "N" | "S";
  lngRef?: "E" | "W";
  zeroCoordinates?: boolean;
  belowSeaLevel?: boolean;
  gps?: boolean;
  date?: string | null;
  offset?: string;
  corruptOffset?: boolean;
}

/** Small JPEG APP1/TIFF fixture with GPS rationals and DateTimeOriginal. */
export function jpegExif(options: ExifOptions = {}): ArrayBuffer {
  const little = options.littleEndian ?? true;
  const buffer = new ArrayBuffer(options.offset ? 241 : 222);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  view.setUint16(0, 0xffd8);
  view.setUint16(2, 0xffe1);
  view.setUint16(4, buffer.byteLength - 4);
  bytes.set([69, 120, 105, 102, 0, 0], 6);
  bytes.set(little ? [73, 73] : [77, 77], 12);
  view.setUint16(14, 42, little);
  view.setUint32(16, 8, little);
  const entry = (
    offset: number,
    tag: number,
    type: number,
    count: number,
    value: number,
  ) => {
    view.setUint16(offset, tag, little);
    view.setUint16(offset + 2, type, little);
    view.setUint32(offset + 4, count, little);
    view.setUint32(offset + 8, value, little);
  };
  const asciiRef = (offset: number, tag: number, value: string) => {
    entry(offset, tag, 2, 2, 0);
    bytes[offset + 8] = value.charCodeAt(0);
  };
  const rational = (offset: number, numerator: number, denominator = 1) => {
    view.setUint32(offset, numerator, little);
    view.setUint32(offset + 4, denominator, little);
  };
  view.setUint16(20, 2, little);
  if (options.gps !== false)
    entry(22, 0x8825, 4, 1, options.corruptOffset ? 0xfffff : 38);
  else entry(22, 0x010e, 2, 1, 0);
  if (options.date !== null) entry(34, 0x8769, 4, 1, 172);
  else entry(34, 0x010f, 2, 1, 0);
  view.setUint16(50, 6, little);
  asciiRef(52, 1, options.latRef ?? "N");
  entry(64, 2, 5, 3, 116);
  asciiRef(76, 3, options.lngRef ?? "E");
  entry(88, 4, 5, 3, 140);
  entry(100, 5, 1, 1, 0);
  bytes[108] = options.belowSeaLevel ? 1 : 0;
  entry(112, 6, 5, 1, 164);
  const lat = options.zeroCoordinates ? [0, 0, 0] : [27, 59, 17];
  const lng = options.zeroCoordinates ? [0, 0, 0] : [86, 55, 30];
  lat.forEach((value, index) => rational(128 + index * 8, value));
  lng.forEach((value, index) => rational(152 + index * 8, value));
  rational(176, 691, 2);
  const datePosition = options.offset ? 214 : 202;
  view.setUint16(184, options.offset ? 2 : 1, little);
  entry(186, 0x9003, 2, 20, datePosition - 12);
  if (options.offset) {
    entry(198, 0x9011, 2, 7, 222);
    bytes.set(new TextEncoder().encode(options.offset + "\0"), 234);
  }
  bytes.set(
    new TextEncoder().encode(
      (options.date ?? "2024:01:02 03:04:05").slice(0, 19) + "\0",
    ),
    datePosition,
  );
  return buffer;
}
