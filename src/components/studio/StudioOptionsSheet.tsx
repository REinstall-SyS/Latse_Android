import { UnitToggle, useUnits } from "@/hooks/useUnits";
import { formatPrivacyDistance } from "@/domain/units";
import React from "react";
import { Download, FileCode2, ShieldCheck, Link } from "lucide-react";
import type { ReceiptConfig } from "@/types/trek.types";
import type { PreparedArtifact } from "@/services/artifact-preview";
import { Dialog } from "@/components/shared/Dialog";
interface Props {
  config: ReceiptConfig;
  busy: boolean;
  prepared?: PreparedArtifact;
  onChange: <K extends keyof ReceiptConfig>(
    key: K,
    value: ReceiptConfig[K],
  ) => void;
  onExport: (kind: "html" | "gpx") => void;
  onPreviewMap?: () => void;
  onCode?: () => void;
  onClose: () => void;
}
export function StudioOptionsSheet({
  config,
  busy,
  prepared,
  onChange,
  onExport,
  onPreviewMap,
  onCode,
  onClose,
}: Props) {
  const { units } = useUnits();
  return (
    <Dialog title="Privacy & files" onClose={onClose}>
      <div className="studio-toggle units-preference-bar">
        <span>Units (Receipts & Storyboards)</span>
        <UnitToggle />
      </div>
      <label className="parking-privacy">
        <ShieldCheck size={23} />
        <span>
          <strong>
            Hide First/Last{" "}
            {formatPrivacyDistance(config.privacyTrimMeters || 500, units)}
          </strong>
          <small>
            Keep the start and end of your trail private in new exports.
          </small>
        </span>
        <input
          type="checkbox"
          checked={config.privacyTrimMeters > 0}
          disabled={busy}
          onChange={(event) =>
            onChange("privacyTrimMeters", event.target.checked ? 500 : 0)
          }
        />
      </label>
      <details className="studio-details">
        <summary>Route & interactive files</summary>
        <p className="sheet-intro">
          Pictures work in messages and social apps. These files are for
          exploring or using the route in another app.
        </p>
        <div className="sheet-export-actions">
          {onCode && (
            <button className="secondary-btn" disabled={busy} onClick={onCode}>
              <Link size={17} />
              Copy / Share Trail Code
            </button>
          )}
          {onPreviewMap && (
            <button
              className="secondary-btn"
              disabled={busy}
              onClick={onPreviewMap}
            >
              <FileCode2 size={17} />
              Open interactive map
            </button>
          )}
          <button
            className="secondary-btn"
            disabled={busy}
            onClick={() => onExport("html")}
          >
            <FileCode2 size={17} />
            Export Interactive Web File (.html)
          </button>
          <button
            className="secondary-btn"
            disabled={busy}
            onClick={() => onExport("gpx")}
          >
            <Download size={17} />
            Export GPX Route
          </button>
        </div>
      </details>
      {prepared && (
        <div className="prepared-artifact">
          <small>LATEST EXPORT</small>
          <a href={prepared.url} download={prepared.filename}>
            Save a copy · {prepared.filename}
          </a>
        </div>
      )}
    </Dialog>
  );
}
