import { useUnits } from "@/hooks/useUnits";
import type { UnitSystem } from "@/domain/units";
import React, { useEffect, useState } from "react";
import type { HikeTrack } from "@/types/trek.types";
export function PhotoMapPreview({
  track,
  privacyTrimMeters = 0,
  compact = false,
}: {
  track: HikeTrack;
  privacyTrimMeters?: number;
  compact?: boolean;
}) {
  const { units } = useUnits();
  const [document, setDocument] = useState<{
    track: HikeTrack;
    trim: number;
    compact: boolean;
    html: string;
    units: UnitSystem;
  }>();
  const html =
    document?.track === track &&
    document.trim === privacyTrimMeters &&
    document.compact === compact &&
    document.units === units
      ? document.html
      : "";
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setDocument(undefined);
    setError("");
    import("@/services/report-export.service")
      .then(({ exportInteractiveHTMLReport }) => {
        if (cancelled) return;
        const html = exportInteractiveHTMLReport(
          track,
          privacyTrimMeters,
          compact,
          units,
        );
        setDocument({ track, trim: privacyTrimMeters, compact, html, units });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [track, privacyTrimMeters, compact, units]);
  return error ? (
    <p className="error-text" role="alert">
      {error}
    </p>
  ) : html ? (
    <iframe
      className="photo-map-frame"
      title={
        compact
          ? "Interactive trail storyboard"
          : "Interactive photo map preview"
      }
      sandbox="allow-scripts allow-downloads"
      srcDoc={html}
    />
  ) : (
    <p className="sheet-intro">Preparing your photo map…</p>
  );
}
