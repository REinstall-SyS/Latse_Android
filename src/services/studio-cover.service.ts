import {
  loadMediaDocument,
  persistMediaDocument,
} from "./hike-persistence.service";
import { embeddedPhoto } from "./artifact-track";

export const studioCoverKey = (trackId: string) =>
  `latse_studio_cover_v1:${encodeURIComponent(trackId)}`;

export async function saveStudioCover(
  trackId: string,
  dataUrl: string,
): Promise<string> {
  if (!embeddedPhoto(dataUrl))
    throw new Error("Choose a supported cover photo.");
  const key = studioCoverKey(trackId);
  await persistMediaDocument(key, { id: "cover", photoDataUrl: dataUrl });
  return key;
}

export async function loadStudioCover(
  key: string,
): Promise<string | undefined> {
  const cover = await loadMediaDocument<{ photoDataUrl?: string }>(key, {});
  return embeddedPhoto(cover.photoDataUrl);
}
