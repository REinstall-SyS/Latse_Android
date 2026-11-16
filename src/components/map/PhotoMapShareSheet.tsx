import { useUnits } from "@/hooks/useUnits";
import { formatPrivacyDistance } from "@/domain/units";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PhotoMapPreview } from "./PhotoMapPreview";
import { Copy, Image as ImageIcon, Share2, ShieldCheck } from "lucide-react";
import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import { Dialog } from "@/components/shared/Dialog";
import {
  artifactFilename,
  downloadArtifact,
} from "@/services/artifact-download.service";
import { TrailCodeSheet } from "@/components/studio/TrailCodeSheet";
export function PhotoMapShareSheet({
  track,
  onClose,
}: {
  track: HikeTrack;
  onClose: () => void;
}) {
  const { units } = useUnits();
  const [privacy, setPrivacy] = useState(false),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState(false),
    [message, setMessage] = useState("");
  const alive = useRef(true);
  const config = useMemo<ReceiptConfig>(
    () => ({
      template: "editorial",
      units,
      aspectRatio: "4:5",
      title: track.name,
      subtitle: track.region,
      backgroundPhotoUrl: null,
      showElevationCurve: true,
      showRouteMiniMap: true,
      showDaylightAndPace: true,
      privacyTrimMeters: privacy ? 500 : 0,
    }),
    [track, privacy, units],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setMessage("");
  }, [track, privacy]);
  const share = async (kind: "png" | "html") => {
    setBusy(true);
    setMessage("");
    try {
      let blob: Blob;
      if (kind === "png") {
        const canvas = document.createElement("canvas");
        const { renderPhotoMapPoster } = await import(
          "@/services/receipt-canvas.service"
        );
        await renderPhotoMapPoster(canvas, track, config);
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(new Error("Could not create your storyboard.")),
            "image/png",
          ),
        );
      } else {
        const { exportInteractiveHTMLReport } = await import(
          "@/services/report-export.service"
        );
        blob = new Blob(
          [
            exportInteractiveHTMLReport(
              track,
              config.privacyTrimMeters,
              false,
              units,
            ),
          ],
          { type: "text/html" },
        );
      }
      if (!alive.current) return;
      await downloadArtifact(
        blob,
        artifactFilename(
          `${track.name}-${kind === "png" ? "storyboard" : "photo-map"}`,
          kind,
        ),
        true,
      );
      if (alive.current)
        setMessage(
          kind === "png"
            ? "Storyboard prepared for your favorite social or messaging app."
            : "Interactive storyboard ready. Open the HTML file in a browser.",
        );
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Dialog title="Let them walk your story" onClose={onClose}>
      <p className="sheet-intro">
        Tap photos to explore the hike. Share the interactive file for a
        browser, or send a PNG for a social post.
      </p>
      <div className="share-map-preview">
        <PhotoMapPreview
          track={track}
          privacyTrimMeters={config.privacyTrimMeters}
          compact
        />
      </div>
      <label className="parking-privacy">
        <ShieldCheck size={22} />
        <span>
          <strong>Hide first & last {formatPrivacyDistance(500, units)}</strong>
          <small>Also removes exact times and unplaced photos.</small>
        </span>
        <input
          type="checkbox"
          checked={privacy}
          disabled={busy}
          onChange={(e) => setPrivacy(e.target.checked)}
        />
      </label>
      <button
        className="primary-btn w-full"
        disabled={busy}
        onClick={() => void share("png")}
      >
        <Share2 size={18} />
        {busy ? "Preparing…" : "Share Storyboard PNG"}
      </button>
      <div className="storyboard-secondary-actions mt-3">
        <button disabled={busy} onClick={() => setCode(true)}>
          <Copy size={17} />
          Copy / Share Trail Code
        </button>
        <button disabled={busy} onClick={() => void share("html")}>
          <ImageIcon size={17} />
          Export Interactive Web File (.html)
        </button>
      </div>
      {message && (
        <p className="sheet-intro mt-3" role="status">
          {message}
        </p>
      )}
      {code && (
        <TrailCodeSheet
          track={track}
          privacyTrimMeters={config.privacyTrimMeters}
          onClose={() => setCode(false)}
        />
      )}
    </Dialog>
  );
}
