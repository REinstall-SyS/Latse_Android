import { embeddedPhoto } from "./artifact-track";
import {
  mediaVault,
  type MediaVault,
  type MediaWrite,
} from "./media-vault.service";
export const SAVED_TRACKS_KEY = "latse_saved_tracks_v1";
export class MediaPersistenceError extends Error {
  metadataSaved = true;
  constructor() {
    super(
      "The route and metrics are saved. Photo storage is full or unavailable; keep this draft open and export your photos before closing.",
    );
    this.name = "MediaPersistenceError";
  }
}
interface EncodedDocument {
  metadata: unknown;
  media: MediaWrite[];
  retained: Set<string>;
}
/** IDs are scoped to their document and hike, so imported copies cannot replace another photo. */
function encodeDocument(key: string, value: unknown): EncodedDocument {
  const media: MediaWrite[] = [],
    retained = new Set<string>();
  const walk = (item: unknown, owner = "draft"): unknown => {
    if (Array.isArray(item)) return item.map((child) => walk(child, owner));
    if (!item || typeof item !== "object") return item;
    const source = item as Record<string, unknown>;
    if (Array.isArray(source.points) && typeof source.id === "string")
      owner = source.id;
    const result = Object.fromEntries(
      Object.entries(source)
        .filter(([name]) => name !== "photoDataUrl" && name !== "photoRef")
        .map(([name, child]) => [name, walk(child, owner)]),
    );
    const photo =
      typeof source.photoDataUrl === "string"
        ? embeddedPhoto(source.photoDataUrl)
        : undefined;
    if (photo) {
      const id = `${key}/${encodeURIComponent(owner)}/${encodeURIComponent(String(source.id))}`;
      result.photoRef = id;
      media.push({ id, dataUrl: photo });
      retained.add(id);
    } else if (typeof source.photoRef === "string") {
      result.photoRef = source.photoRef;
      retained.add(source.photoRef);
    }
    return result;
  };
  return { metadata: walk(value), media, retained };
}
async function hydrate<T>(value: T, vault: MediaVault): Promise<T> {
  const walk = async (item: unknown): Promise<unknown> => {
    if (Array.isArray(item)) return Promise.all(item.map(walk));
    if (!item || typeof item !== "object") return item;
    const source = item as Record<string, unknown>;
    const result = Object.fromEntries(
      await Promise.all(
        Object.entries(source).map(async ([name, child]) => [
          name,
          await walk(child),
        ]),
      ),
    );
    if (
      typeof source.photoRef === "string" &&
      !embeddedPhoto(
        typeof source.photoDataUrl === "string"
          ? source.photoDataUrl
          : undefined,
      )
    ) {
      const photo = await vault.load(source.photoRef);
      if (photo) result.photoDataUrl = photo;
    }
    return result;
  };
  return (await walk(value)) as T;
}
interface DocumentEnvelope {
  format: "latse-media-doc-v1";
  revision: number;
  value: unknown;
}
interface LocalPointer {
  revision: number;
  location: "indexeddb" | "localStorage";
}
const pointerKey = (key: string) => key + ":vault-state";
function envelope(value: unknown): DocumentEnvelope | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as DocumentEnvelope;
  return record.format === "latse-media-doc-v1" &&
    Number.isFinite(record.revision)
    ? record
    : undefined;
}
function localPointer(key: string): LocalPointer | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(pointerKey(key)) || "null");
    return value &&
      Number.isFinite(value.revision) &&
      ["indexeddb", "localStorage"].includes(value.location)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
/** A newer fallback must win over an older IndexedDB snapshot after a failed transaction. */
export async function loadMediaDocument<T>(
  key: string,
  fallback: T,
  vault = mediaVault,
): Promise<T> {
  const durable = await vault.read<unknown>(key),
    record = envelope(durable),
    pointer = localPointer(key);
  const localIsNewer =
    pointer?.location === "localStorage" &&
    pointer.revision > (record?.revision ?? 0);
  if (durable !== undefined && !localIsNewer)
    return hydrate((record ? record.value : durable) as T, vault);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return hydrate(JSON.parse(raw) as T, vault);
  } catch {
    /* Try the last durable snapshot. */
  }
  return durable !== undefined
    ? hydrate((record ? record.value : durable) as T, vault)
    : fallback;
}
export async function persistMediaDocument<T>(
  key: string,
  value: T,
  vault = mediaVault,
): Promise<"indexeddb" | "localStorage"> {
  const previous = envelope(await vault.read<unknown>(key));
  const revision =
    Math.max(
      Date.now(),
      previous?.revision ?? 0,
      localPointer(key)?.revision ?? 0,
    ) + 1;
  const encoded = encodeDocument(key, value);
  const stored: DocumentEnvelope = {
    format: "latse-media-doc-v1",
    revision,
    value: encoded.metadata,
  };
  if (await vault.commit(key, stored, encoded.media, encoded.retained)) {
    try {
      localStorage.setItem(key, JSON.stringify(encoded.metadata));
      localStorage.setItem(
        pointerKey(key),
        JSON.stringify({ revision, location: "indexeddb" }),
      );
    } catch {
      /* IndexedDB is the newer, complete durable copy. */
    }
    return "indexeddb";
  }
  let inlineSaved = false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    inlineSaved = true;
    localStorage.setItem(
      pointerKey(key),
      JSON.stringify({ revision, location: "localStorage" }),
    );
    return "localStorage";
  } catch {
    if (inlineSaved)
      throw new Error(
        "A local backup was written, but its storage index could not be updated. Keep this draft open and export a copy before closing.",
      );
    try {
      localStorage.setItem(key, JSON.stringify(encoded.metadata));
      localStorage.setItem(
        pointerKey(key),
        JSON.stringify({ revision, location: "localStorage" }),
      );
    } catch {
      throw new Error(
        "Device storage is unavailable. Keep this draft open and export a copy before closing.",
      );
    }
    if (encoded.media.length || encoded.retained.size)
      throw new MediaPersistenceError();
    return "localStorage";
  }
}
export async function removeMediaDocument(
  key: string,
  vault = mediaVault,
): Promise<void> {
  await vault.remove(key);
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(pointerKey(key));
  } catch {
    throw new Error("Could not remove this draft from device storage.");
  }
}
