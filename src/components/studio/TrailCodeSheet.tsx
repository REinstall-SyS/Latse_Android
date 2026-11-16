import React, { useMemo, useState } from "react";
import { Copy, Link, Share2 } from "lucide-react";
import type { HikeTrack } from "@/types/trek.types";
import { Dialog } from "@/components/shared/Dialog";
import {
  encodeLatseRoute,
  latseRouteLink,
} from "@/services/route-import.service";
import { prepareArtifactTrack } from "@/services/artifact-track";
import { shareText } from "@/services/hardware.service";
export function TrailCodeSheet({
  track,
  privacyTrimMeters,
  onClose,
}: {
  track: HikeTrack;
  privacyTrimMeters: number;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const result = useMemo(() => {
    try {
      const prepared = prepareArtifactTrack(track, privacyTrimMeters);
      return {
        code: encodeLatseRoute(prepared),
        link: latseRouteLink(prepared),
        error: "",
      };
    } catch (e) {
      return { code: "", link: "", error: (e as Error).message };
    }
  }, [track, privacyTrimMeters]);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(
        "Copied. In Latse, choose Add route → Paste route code / link.",
      );
    } catch {
      setNotice(
        "Clipboard access is unavailable. Select and copy the code below.",
      );
    }
  };
  const share = async () => {
    setBusy(true);
    const success = await shareText(result.link, `${track.name} · Latse trail`);
    setNotice(
      success
        ? "Trail link shared or copied. Open it in Latse, or paste it into Add route."
        : "Sharing is unavailable. Copy the code below instead.",
    );
    setBusy(false);
  };
  return (
    <Dialog title="Pass the trail on" onClose={onClose}>
      <p className="sheet-intro">
        A route code carries the trail and field notes. Your photos stay private
        on this device. The recipient can open the Latse link or paste the code
        into Add route.
      </p>
      {result.error ? (
        <p className="error-text" role="alert">
          {result.error}
        </p>
      ) : (
        <>
          <div className="trail-code-actions">
            <button
              className="primary-btn"
              onClick={() => void copy(result.code)}
            >
              <Copy size={17} /> Copy trail code
            </button>
            <button
              className="secondary-btn"
              disabled={busy}
              onClick={() => void share()}
            >
              <Share2 size={17} /> Share trail link
            </button>
            <button className="text-btn" onClick={() => void copy(result.link)}>
              <Link size={16} /> Copy Latse link
            </button>
          </div>
          <label className="field-label">
            Latse route code
            <textarea
              className="trail-code-text"
              value={result.code}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
          </label>
          <p className="share-file-note">
            A Latse link opens the installed app. It is not a hosted photo-story
            webpage. No account or network is needed to paste a saved route
            code.
          </p>
        </>
      )}
      {notice && (
        <p className="sheet-intro" role="status">
          {notice}
        </p>
      )}
    </Dialog>
  );
}
