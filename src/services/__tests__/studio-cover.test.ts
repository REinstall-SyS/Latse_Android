import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { loadStudioCover, saveStudioCover } from "../studio-cover.service";
import {
  loadStudioConfig,
  saveStudioConfig,
  defaultStudioConfig,
} from "../studio-edition.service";
import { signatureTracks } from "@/data/signature-tracks";
afterEach(() => vi.unstubAllGlobals());

it("restores a selected cover from the photo store without filling the settings record with image data", async () => {
  const track = signatureTracks()[0],
    url = "data:image/webp;base64,AAAA";
  const values = new Map<string, string>(),
    storage = {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => {
        values.set(k, v);
      },
    };
  vi.stubGlobal("localStorage", storage);
  const key = await saveStudioCover(track.id, url);
  saveStudioConfig(
    track.id,
    {
      ...defaultStudioConfig(track, "metric"),
      coverPhotoId: key,
      backgroundPhotoUrl: url,
    },
    storage,
  );
  expect([...values.values()].join("")).not.toContain("base64");
  const restored = loadStudioConfig(track, "metric", storage);
  expect(restored.coverPhotoId).toBe(key);
  expect(await loadStudioCover(restored.coverPhotoId!)).toBe(url);
  expect(
    loadStudioConfig(signatureTracks()[1], "metric", storage).coverPhotoId,
  ).toBeUndefined();
});
