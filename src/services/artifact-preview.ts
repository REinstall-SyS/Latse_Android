export interface PreparedArtifact {
  url: string;
  filename: string;
  blob: Blob;
}

/** A generation prevents an asynchronous old export from restoring an invalid link. */
export class ArtifactPreview {
  revision = 0;
  current?: PreparedArtifact;

  invalidate(): void {
    this.revision++;
    if (this.current) URL.revokeObjectURL(this.current.url);
    this.current = undefined;
  }

  publish(
    blob: Blob,
    filename: string,
    revision: number,
  ): PreparedArtifact | undefined {
    if (revision !== this.revision) return undefined;
    if (this.current) URL.revokeObjectURL(this.current.url);
    this.current = { blob, filename, url: URL.createObjectURL(blob) };
    return this.current;
  }
}
