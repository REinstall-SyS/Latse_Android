import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { signatureTracks } from "@/data/signature-tracks";
import type { HikeTrack } from "@/types/trek.types";
import { MediaVault } from "../media-vault.service";
import {
  loadMediaDocument,
  persistMediaDocument,
  removeMediaDocument,
  MediaPersistenceError,
  SAVED_TRACKS_KEY,
} from "../hike-persistence.service";
import { safeGetItem } from "../storage.service";
let entries: Map<string, string>;
let limit: number;
beforeEach(() => {
  entries = new Map();
  limit = Infinity;
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > limit)
        throw new DOMException("Full", "QuotaExceededError");
      entries.set(key, value);
    },
    removeItem: (key: string) => entries.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
function photoHike(): HikeTrack {
  const hike = signatureTracks()[0];
  return {
    ...hike,
    pins: [
      {
        ...hike.pins[0],
        photoDataUrl: `data:image/jpeg;base64,${"A".repeat(3 * 1024 * 1024)}`,
      },
      {
        ...hike.pins[1],
        photoDataUrl: `data:image/jpeg;base64,${"B".repeat(3 * 1024 * 1024)}`,
      },
    ],
  };
}
describe("IndexedDB Photo Vault persistence", () => {
  it("offloads more than 5MB of photos, retains a small index, and hydrates a fresh session", async () => {
    limit = 20000;
    const factory = new IDBFactory(),
      vault = new MediaVault(() => factory),
      hike = photoHike();
    expect(await persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault)).toBe(
      "indexeddb",
    );
    const index = entries.get(SAVED_TRACKS_KEY)!;
    expect(index.length).toBeLessThan(20000);
    expect(index).not.toContain("photoDataUrl");
    expect(JSON.parse(index)[0].pins[0].photoRef).toContain(hike.pins[0].id);
    const loaded = await loadMediaDocument<HikeTrack[]>(
      SAVED_TRACKS_KEY,
      [],
      new MediaVault(() => factory),
    );
    expect(loaded[0].pins.map((pin) => pin.photoDataUrl)).toEqual(
      hike.pins.map((pin) => pin.photoDataUrl),
    );
    expect(loaded[0].points).toEqual(hike.points);
    expect(loaded[0].stats).toEqual(hike.stats);
  });
  it("saves a full hike even if localStorage rejects its metadata index", async () => {
    const factory = new IDBFactory(),
      vault = new MediaVault(() => factory);
    entries.set(SAVED_TRACKS_KEY, "[]");
    limit = 0;
    const hike = photoHike();
    await expect(
      persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault),
    ).resolves.toBe("indexeddb");
    const restored = await loadMediaDocument<HikeTrack[]>(
      SAVED_TRACKS_KEY,
      [],
      new MediaVault(() => factory),
    );
    expect(restored[0].points).toEqual(hike.points);
    expect(restored[0].pins[1].photoDataUrl).toBe(hike.pins[1].photoDataUrl);
  });
  it("migrates legacy inline photos without changing GPS fixes or capture times", async () => {
    const hike = photoHike();
    hike.points[1].wallTime = 1234567;
    entries.set(SAVED_TRACKS_KEY, JSON.stringify([hike]));
    const factory = new IDBFactory(),
      vault = new MediaVault(() => factory);
    const legacy = await loadMediaDocument<HikeTrack[]>(
      SAVED_TRACKS_KEY,
      [],
      vault,
    );
    await persistMediaDocument(SAVED_TRACKS_KEY, legacy, vault);
    const result = await loadMediaDocument<HikeTrack[]>(
      SAVED_TRACKS_KEY,
      [],
      new MediaVault(() => factory),
    );
    expect(result[0].points[1].wallTime).toBe(1234567);
    expect(result[0].pins[0].photoDataUrl).toBe(hike.pins[0].photoDataUrl);
  });
  it("garbage-collects only removed media in its own document namespace", async () => {
    const factory = new IDBFactory(),
      vault = new MediaVault(() => factory),
      hike = photoHike();
    await persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault);
    await persistMediaDocument("draft", hike, vault);
    const stored = await vault.read<{ value: HikeTrack[] }>(SAVED_TRACKS_KEY),
      ref = stored!.value[0].pins[0].photoRef!;
    await persistMediaDocument(SAVED_TRACKS_KEY, [], vault);
    expect(await new MediaVault(() => factory).load(ref)).toBeUndefined();
    expect(
      (
        await loadMediaDocument<HikeTrack>(
          "draft",
          hike,
          new MediaVault(() => factory),
        )
      ).pins[0].photoDataUrl,
    ).toBe(hike.pins[0].photoDataUrl);
    await removeMediaDocument("draft", vault);
    expect(await vault.read("draft")).toBeUndefined();
  });
  it("falls back to complete inline localStorage records when IndexedDB is absent", async () => {
    const vault = new MediaVault(() => undefined),
      hike = signatureTracks()[0];
    hike.pins[0].photoDataUrl = "data:image/jpeg;base64,AAAA";
    expect(await persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault)).toBe(
      "localStorage",
    );
    expect(
      JSON.parse(entries.get(SAVED_TRACKS_KEY)!)[0].pins[0].photoDataUrl,
    ).toBe(hike.pins[0].photoDataUrl);
    expect(
      (await loadMediaDocument<HikeTrack[]>(SAVED_TRACKS_KEY, [], vault))[0]
        .stats,
    ).toEqual(hike.stats);
  });
  it("retains GPS metadata and open-session photo data if both media stores cannot accept photos", async () => {
    limit = 20000;
    const vault = new MediaVault(() => undefined),
      hike = photoHike();
    await expect(
      persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault),
    ).rejects.toBeInstanceOf(MediaPersistenceError);
    const index = JSON.parse(entries.get(SAVED_TRACKS_KEY)!);
    expect(index[0].points).toEqual(hike.points);
    expect(vault.get(index[0].pins[0].photoRef)).toBe(
      hike.pins[0].photoDataUrl,
    );
    expect(hike.pins[0].photoDataUrl!.length).toBeGreaterThan(3 * 1024 * 1024);
  });
  it("reports completely unwritable storage instead of claiming a durable save", async () => {
    limit = 0;
    await expect(
      persistMediaDocument(
        "draft",
        signatureTracks()[0],
        new MediaVault(() => undefined),
      ),
    ).rejects.toThrow("Keep this draft open");
  });
  it("still reads existing cached settings when a schema-marker write exceeds quota", () => {
    entries.set("weather", '{"ok":true}');
    limit = 0;
    expect(safeGetItem("weather", {})).toEqual({ ok: true });
  });
});

it("uses a newer local fallback if an existing IndexedDB document rejects its next transaction", async () => {
  const factory = new IDBFactory(),
    vault = new MediaVault(() => factory),
    hike = signatureTracks()[0];
  hike.pins[0].photoDataUrl = "data:image/jpeg;base64,AAAA";
  await persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault);
  const hydrated = await loadMediaDocument<HikeTrack[]>(
    SAVED_TRACKS_KEY,
    [],
    vault,
  );
  const changed = {
    ...hydrated[0],
    name: "The newer local backup",
    pins: hydrated[0].pins.map((pin, i) =>
      i === 0 ? { ...pin, photoDataUrl: "data:image/jpeg;base64,BBBB" } : pin,
    ),
  };
  vi.spyOn(vault, "commit").mockResolvedValue(false);
  expect(await persistMediaDocument(SAVED_TRACKS_KEY, [changed], vault)).toBe(
    "localStorage",
  );
  const restored = await loadMediaDocument<HikeTrack[]>(
    SAVED_TRACKS_KEY,
    [],
    new MediaVault(() => factory),
  );
  expect(restored[0].name).toBe("The newer local backup");
  expect(restored[0].pins[0].photoDataUrl).toBe("data:image/jpeg;base64,BBBB");
});

it("rolls back earlier photo writes when a later photo in the same transaction exceeds quota", async () => {
  const factory = new IDBFactory(),
    vault = new MediaVault(() => factory),
    hike = signatureTracks()[0];
  hike.pins[0].photoDataUrl = "data:image/jpeg;base64,AAAA";
  hike.pins[1].photoDataUrl = "data:image/jpeg;base64,CCCC";
  await persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault);
  const stored = await vault.read<{ value: HikeTrack[] }>(SAVED_TRACKS_KEY);
  const changed = {
    ...hike,
    pins: hike.pins.map((pin, i) =>
      i < 2
        ? {
            ...pin,
            photoDataUrl: `data:image/jpeg;base64,${i ? "DDDD" : "BBBB"}`,
          }
        : pin,
    ),
  };
  const original = IDBObjectStore.prototype.put;
  let attempted = 0;
  const write = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementation(function (this: IDBObjectStore, value, key) {
      if (++attempted === 2)
        throw new DOMException("Media store is full", "QuotaExceededError");
      return original.call(this, value, key);
    });
  try {
    expect(await persistMediaDocument(SAVED_TRACKS_KEY, [changed], vault)).toBe(
      "localStorage",
    );
  } finally {
    write.mockRestore();
  }
  const fresh = new MediaVault(() => factory);
  expect(await fresh.load(stored!.value[0].pins[0].photoRef!)).toBe(
    "data:image/jpeg;base64,AAAA",
  );
  expect(await fresh.load(stored!.value[0].pins[1].photoRef!)).toBe(
    "data:image/jpeg;base64,CCCC",
  );
});

it("retries a changed photo after a rejected media write instead of treating its memory cache as durable", async () => {
  const factory = new IDBFactory(),
    vault = new MediaVault(() => factory),
    hike = signatureTracks()[0];
  hike.pins[0].photoDataUrl = "data:image/jpeg;base64,AAAA";
  await persistMediaDocument(SAVED_TRACKS_KEY, [hike], vault);
  const changed = {
    ...hike,
    pins: hike.pins.map((pin, i) =>
      i === 0 ? { ...pin, photoDataUrl: "data:image/jpeg;base64,BBBB" } : pin,
    ),
  };
  const write = vi
    .spyOn(IDBObjectStore.prototype, "put")
    .mockImplementationOnce(() => {
      throw new DOMException("Media store is full", "QuotaExceededError");
    });
  try {
    expect(await persistMediaDocument(SAVED_TRACKS_KEY, [changed], vault)).toBe(
      "localStorage",
    );
  } finally {
    write.mockRestore();
  }
  expect(await persistMediaDocument(SAVED_TRACKS_KEY, [changed], vault)).toBe(
    "indexeddb",
  );
  const restored = await loadMediaDocument<HikeTrack[]>(
    SAVED_TRACKS_KEY,
    [],
    new MediaVault(() => factory),
  );
  expect(restored[0].pins[0].photoDataUrl).toBe("data:image/jpeg;base64,BBBB");
});
