import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadArtifact } from "../artifact-download.service";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("artifact downloads", () => {
  function browser() {
    vi.useFakeTimers();
    const click = vi.fn();
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { canShare: () => true, share });
    vi.stubGlobal("document", {
      createElement: () => ({ click, remove: vi.fn() }),
      body: { appendChild: vi.fn() },
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    return { click, share };
  }
  it("downloads exports even when the device can share files", async () => {
    const { click, share } = browser();
    await downloadArtifact(
      new Blob(["report"], { type: "text/html" }),
      "hike.html",
    );
    expect(click).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
  it("opens sharing only for an explicit share action", async () => {
    const { click, share } = browser();
    await downloadArtifact(
      new Blob(["receipt"], { type: "image/png" }),
      "hike.png",
      true,
    );
    expect(share).toHaveBeenCalledOnce();
    expect(click).not.toHaveBeenCalled();
  });
  it("respects a cancelled share sheet", async () => {
    const { click, share } = browser();
    share.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await downloadArtifact(new Blob(["receipt"]), "hike.png", true);
    expect(click).not.toHaveBeenCalled();
  });
});
