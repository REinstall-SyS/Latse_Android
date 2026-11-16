import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactPreview } from "../artifact-preview";

afterEach(() => vi.restoreAllMocks());
describe("artifact privacy invalidation", () => {
  it("revokes the previous link immediately and rejects late exports from old settings", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:old");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const preview = new ArtifactPreview();
    const revision = preview.revision;
    preview.publish(new Blob(["private endpoints"]), "untrimmed.gpx", revision);
    preview.invalidate();
    expect(revoke).toHaveBeenCalledWith("blob:old");
    expect(preview.current).toBeUndefined();
    expect(
      preview.publish(new Blob(["late untrimmed export"]), "old.gpx", revision),
    ).toBeUndefined();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
});
