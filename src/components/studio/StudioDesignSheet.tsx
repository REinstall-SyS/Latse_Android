import React, { useEffect, useRef, useState } from "react";
import { KEEPSAKE_STYLES } from "@/domain/print-design";
import { renderSummitReceipt } from "@/services/receipt-canvas.service";
import { StudioEditor } from "./StudioEditor";
import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";

function DesignProof({
  track,
  config,
  template,
}: {
  track: HikeTrack;
  config: ReceiptConfig;
  template: ReceiptConfig["template"];
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const target = canvas.current;
    let active = true;
    if (!target) return;
    const wait = window.setTimeout(() => {
      void renderSummitReceipt(target, track, { ...config, template }, 180)
        .then(() => {
          if (active) setReady(true);
        })
        .catch(() => {
          if (active) setReady(false);
        });
    }, 80);
    return () => {
      active = false;
      window.clearTimeout(wait);
    };
  }, [track, config, template]);
  return (
    <div className="studio-style-proof">
      <canvas
        ref={canvas}
        width={180}
        height={config.aspectRatio === "4:5" ? 225 : 320}
        data-ready={ready}
        aria-hidden="true"
      />
    </div>
  );
}

export function StudioDesignSheet({
  config,
  track,
  mode = "receipt",
  onChange,
  onCover,
  onClose,
}: {
  config: ReceiptConfig;
  track: HikeTrack;
  mode?: "receipt" | "map";
  onChange: <K extends keyof ReceiptConfig>(
    key: K,
    value: ReceiptConfig[K],
  ) => void;
  onCover: () => void;
  onClose: () => void;
}) {
  const isKeepsake = mode === "receipt";
  const toggles = [
    ["showStats", "Hike statistics", config.showStats !== false],
    ["showRouteMiniMap", "Route illustration", config.showRouteMiniMap],
    ["showElevationCurve", "Elevation profile", config.showElevationCurve],
    ["showBranding", "Signature", config.showBranding !== false],
  ] as const;
  return (
    <StudioEditor
      title={isKeepsake ? "Design your keepsake" : "Design your photo map"}
      className="studio-style-editor"
      onClose={onClose}
    >
      {isKeepsake && (
        <div
          className="studio-design-layouts"
          role="group"
          aria-label="Keepsake layout"
        >
          {KEEPSAKE_STYLES.map(({ id, name, description }) => (
            <button
              key={id}
              aria-label={name}
              aria-pressed={config.template === id}
              onClick={() => onChange("template", id)}
              className="design-layout"
            >
              <DesignProof track={track} config={config} template={id} />
              <strong>{name}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
      )}
      <div
        className="studio-choice-row studio-print-sizes"
        role="group"
        aria-label="Picture size"
      >
        {(["4:5", "9:16"] as const).map((ratio) => (
          <button
            key={ratio}
            aria-pressed={config.aspectRatio === ratio}
            onClick={() => onChange("aspectRatio", ratio)}
          >
            {ratio === "9:16" ? "Story · 9:16" : "Post · 4:5"}
          </button>
        ))}
      </div>
      <details className="studio-details">
        <summary>Print details</summary>
        <p className="field-label">Title lettering</p>
        <div className="studio-choice-row">
          {(
            [
              ["serif", "Classic"],
              ["sans", "Modern"],
            ] as const
          ).map(([id, name]) => (
            <button
              key={id}
              aria-pressed={(config.titleTypeface ?? "serif") === id}
              onClick={() => onChange("titleTypeface", id)}
            >
              {name}
            </button>
          ))}
        </div>
        {toggles.map(([key, label, value]) => (
          <label className="studio-toggle" key={key}>
            <span>{label}</span>
            <input
              type="checkbox"
              checked={value}
              onChange={(event) => onChange(key, event.target.checked)}
            />
          </label>
        ))}
        {isKeepsake && (
          <label className="studio-toggle">
            <span>Pace & vertical rate</span>
            <input
              type="checkbox"
              checked={config.showDaylightAndPace}
              onChange={(event) =>
                onChange("showDaylightAndPace", event.target.checked)
              }
            />
          </label>
        )}
        {isKeepsake && (
          <label className="studio-toggle">
            <span>Footer detail</span>
            <input
              type="checkbox"
              checked={config.showBadge === true}
              onChange={(event) => onChange("showBadge", event.target.checked)}
            />
          </label>
        )}
      </details>
      <button className="text-btn studio-editor-link" onClick={onCover}>
        {isKeepsake ? "Cover photo & crop" : "Photo crop"}
      </button>
    </StudioEditor>
  );
}
