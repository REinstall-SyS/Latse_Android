import React from "react";
import { StudioEditor } from "./StudioEditor";
import { printCopy } from "@/domain/print-design";
import type { HikeTrack, PrintCopy, ReceiptConfig } from "@/types/trek.types";
export function StudioTextSheet({
  track,
  config,
  mode = "receipt",
  onChange,
  onPhotos,
  onClose,
}: {
  track: HikeTrack;
  config: ReceiptConfig;
  mode?: "receipt" | "map";
  onChange: <K extends keyof ReceiptConfig>(
    key: K,
    value: ReceiptConfig[K],
  ) => void;
  onPhotos: () => void;
  onClose: () => void;
}) {
  const copy = printCopy(track, config);
  const changeCopy = (key: keyof PrintCopy, value: string) =>
    onChange("copy", { ...config.copy, [key]: value });
  return (
    <StudioEditor title="Make the words yours" onClose={onClose}>
      <label className="field-label">
        Title
        <input
          value={config.title}
          maxLength={110}
          onChange={(e) => onChange("title", e.target.value)}
        />
      </label>
      <label className="field-label">
        Location or subtitle
        <input
          value={config.subtitle}
          maxLength={120}
          onChange={(e) => onChange("subtitle", e.target.value)}
        />
      </label>
      <label className="field-label">
        Personal note
        <textarea
          aria-label="Personal note"
          value={config.customQuote ?? ""}
          maxLength={150}
          rows={2}
          placeholder="What made this day yours?"
          onChange={(e) => onChange("customQuote", e.target.value)}
        />
      </label>
      <label className="field-label">
        Date line
        <input
          value={copy.date}
          maxLength={160}
          onChange={(e) => changeCopy("date", e.target.value)}
        />
      </label>
      <button className="secondary-btn w-full mt-3" onClick={onPhotos}>
        Edit photo captions
      </button>
      <details className="studio-details">
        <summary>Small labels & signature</summary>
        {(
          [
            ["eyebrow", "Small heading"],
            ["routeHeading", "Route heading"],
            ["profileHeading", "Elevation heading"],
            ["momentsHeading", "Photo section heading"],
            ["footer", "Footer note"],
            ["signature", "Signature"],
            ["badgeTitle", "Footer detail title"],
            ["badgeNote", "Footer detail note"],
            ["startLabel", "Trailhead label"],
          ] as const
        )
          .filter(
            ([key]) =>
              mode === "receipt" || !["badgeTitle", "badgeNote"].includes(key),
          )
          .map(([key, label]) => (
            <label className="field-label" key={key}>
              {label}
              <input
                value={copy[key]}
                maxLength={160}
                onChange={(e) => changeCopy(key, e.target.value)}
              />
            </label>
          ))}
      </details>
    </StudioEditor>
  );
}
