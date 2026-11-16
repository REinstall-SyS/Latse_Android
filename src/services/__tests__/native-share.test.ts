import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({
  share: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: {
    readdir: native.read,
    writeFile: native.write,
    deleteFile: native.remove,
  },
}));
import { downloadArtifact } from "../artifact-download.service";
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("native artifact file sharing", () => {
  it("reports a native failure instead of silently using an unsupported WebView download", async () => {
    native.read.mockRejectedValue(new Error("No cache"));
    native.write.mockRejectedValue(new Error("Disk full"));
    const browserDownload = vi.fn();
    vi.stubGlobal("document", { createElement: browserDownload });
    await expect(
      downloadArtifact(new Blob(["image"]), "hike.png", true),
    ).rejects.toThrow("Android share sheet could not open");
    expect(browserDownload).not.toHaveBeenCalled();
  });
  it("writes UTF-8/binary data into the shareable cache and opens a file share sheet", async () => {
    native.read.mockRejectedValue(new Error("No cache yet"));
    native.write.mockResolvedValue({ uri: "file:///cache/story.png" });
    native.share.mockResolvedValue({ activityType: "Messages" });
    await downloadArtifact(
      new Blob(["Trail 🏔️"], { type: "image/png" }),
      "summit.png",
      true,
    );
    const write = native.write.mock.calls[0][0];
    expect(write.directory).toBe("CACHE");
    expect(write.path).toMatch(/^latse-exports\/.+-summit\.png$/);
    expect(
      new TextDecoder().decode(
        Uint8Array.from(atob(write.data), (c) => c.charCodeAt(0)),
      ),
    ).toBe("Trail 🏔️");
    expect(native.share).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["file:///cache/story.png"] }),
    );
  });
  it("prunes only expired files and preserves a cancelled share without triggering a download", async () => {
    native.read.mockResolvedValue({
      files: [
        { name: "old.png", type: "file", mtime: Date.now() - 172800000 },
        { name: "fresh.png", type: "file", mtime: Date.now() },
      ],
    });
    native.write.mockResolvedValue({ uri: "file:///cache/new.png" });
    native.share.mockRejectedValue(new Error("User cancelled sharing"));
    const browserDownload = vi.fn();
    vi.stubGlobal("document", { createElement: browserDownload });
    await downloadArtifact(new Blob(["image"]), "new.png", true);
    expect(native.remove).toHaveBeenCalledOnce();
    expect(native.remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: "latse-exports/old.png" }),
    );
    expect(browserDownload).not.toHaveBeenCalled();
  });
});
