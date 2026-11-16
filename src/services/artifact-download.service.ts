import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export function isShareCancelled(error: unknown): boolean {
  const value = error as { name?: string; message?: string };
  return (
    value?.name === "AbortError" || /cancel|dismiss/i.test(value?.message ?? "")
  );
}

async function shareNativeArtifact(
  blob: Blob,
  filename: string,
): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const folder = "latse-exports";
  // A receiver may read the URI after its share sheet closes. Keep fresh files;
  // prune only our own older cache files on a subsequent export.
  try {
    const entries = await Filesystem.readdir({
      path: folder,
      directory: Directory.Cache,
    });
    await Promise.allSettled(
      entries.files
        .filter(
          (file) => file.type === "file" && file.mtime < Date.now() - 86400000,
        )
        .map((file) =>
          Filesystem.deleteFile({
            path: `${folder}/${file.name}`,
            directory: Directory.Cache,
          }),
        ),
    );
  } catch {
    /* A fresh installation has no export cache yet. */
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192)
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  const safeName =
    filename.replace(/[^a-z0-9._-]/gi, "-").slice(0, 140) || "latse-artifact";
  const { uri } = await Filesystem.writeFile({
    path: `${folder}/${crypto.randomUUID()}-${safeName}`,
    directory: Directory.Cache,
    recursive: true,
    data: btoa(binary),
  });
  await Share.share({
    title: "Latse field log",
    dialogTitle: "Share to Instagram / Messages",
    files: [uri],
  });
}

export async function downloadArtifact(
  blob: Blob,
  filename: string,
  preferShare = false,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await shareNativeArtifact(blob, filename);
      return;
    } catch (error) {
      if (isShareCancelled(error)) return;
      throw new Error(
        "The Android share sheet could not open. Your hike is still saved. Try sharing again or check available storage.",
      );
    }
  }
  const file = new File([blob], filename, { type: blob.type });
  if (preferShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Latse field log" });
      return;
    } catch (error) {
      if (isShareCancelled(error)) return;
    }
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function artifactFilename(name: string, extension: string) {
  return `${name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 90) || "latse-field-log"}.${extension}`;
}
