import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  FileUp,
  Map,
  ClipboardPaste,
  Mountain,
} from "lucide-react";
import type { HikeTrack } from "@/types/trek.types";
import { signatureTracks } from "@/data/signature-tracks";
import { Dialog } from "@/components/shared/Dialog";
import { TrackGraphic } from "@/components/shared/TrackGraphic";
import { RouteGraphic } from "@/components/shared/RouteGraphic";
import { QuickRouteBuilder } from "@/components/map/QuickRouteBuilder";
import {
  encodeLatseRoute,
  importRouteFile,
  latseRouteLink,
  parseTrailInput,
} from "@/services/route-import.service";

interface Props {
  reference: HikeTrack;
  onImport: (track: HikeTrack) => void | Promise<void>;
  onClose: () => void;
}
type ImportMode = "menu" | "draw" | "paste";

export function RouteImporterSheet({ reference, onImport, onClose }: Props) {
  const { units } = useUnits();
  const [mode, setMode] = useState<ImportMode>("menu");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<HikeTrack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const files = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [presets] = useState(signatureTracks);

  const loadFile = async (file: File) => {
    setError("");
    setBusy(true);
    try {
      const track = await importRouteFile(file);
      if (mounted.current) setPreview(track);
    } catch (error) {
      if (mounted.current) setError((error as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const useTrack = async (track: HikeTrack) => {
    setBusy(true);
    try {
      await onImport(track);
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Dialog title="Choose your next trail" onClose={onClose}>
      {mode !== "menu" && (
        <button
          type="button"
          className="text-btn route-sheet-back"
          onClick={() => {
            setMode("menu");
            setPreview(null);
            setError("");
          }}
        >
          <ArrowLeft size={16} /> All trail options
        </button>
      )}
      {preview ? (
        <section className="route-import-preview">
          <p className="eyebrow">Ready for your field log</p>
          <h3>{preview.name}</h3>
          <p className="muted">{preview.region}</p>
          <TrackGraphic points={preview.points} large />
          <div className="route-preview-metrics">
            <strong>
              {formatDistance(preview.stats.totalDistKm, units)}
              <small>distance</small>
            </strong>
            <strong>
              {formatElevation(preview.stats.elevationGainM, units, true)}
              <small>gain</small>
            </strong>
            <strong>
              {preview.pins.length}
              <small>field notes</small>
            </strong>
          </div>
          {preview.source === "preset" && (
            <p className="route-estimate-note">
              Illustrative featured route with simulated times and original
              scenic artwork.
            </p>
          )}
          {preview.elevationEstimated && (
            <p className="route-estimate-note">
              Planned straight-line route with estimated elevations.
            </p>
          )}
          <button
            type="button"
            className="primary-btn w-full"
            disabled={busy}
            onClick={() => void useTrack(preview)}
          >
            Use this trail <ArrowUpRight size={18} />
          </button>
          <button
            type="button"
            className="secondary-btn w-full mt-3"
            onClick={async () => {
              try {
                const link = latseRouteLink(preview);
                try {
                  await navigator.clipboard.writeText(link);
                  if (mounted.current)
                    setNotice(
                      "Latse route link copied. Paste it into the importer on another device.",
                    );
                } catch {
                  if (mounted.current) {
                    setText(link);
                    setMode("paste");
                    setPreview(null);
                    setNotice("Select and copy the route link below.");
                  }
                }
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            Copy Latse route link
          </button>
          <button
            type="button"
            className="text-btn route-sheet-back"
            onClick={() => setPreview(null)}
          >
            Choose another route
          </button>
        </section>
      ) : mode === "draw" ? (
        <QuickRouteBuilder
          reference={reference}
          onCreate={(track) => setPreview(track)}
        />
      ) : mode === "paste" ? (
        <section className="paste-route-panel">
          <p className="muted">
            Paste a Latse trail link or route code, route JSON, or the contents
            of a GPX file. Links to Garmin or Strava pages need their GPX
            export.
          </p>
          <label className="field-label">
            Trail link or route data
            <textarea
              rows={7}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={4 * 1024 * 1024}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="latse://route?data=LATSE1:…"
            />
          </label>
          <button
            type="button"
            className="primary-btn w-full"
            disabled={!text.trim()}
            onClick={() => {
              setError("");
              try {
                setPreview(parseTrailInput(text));
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            Preview pasted trail
          </button>
          <button
            type="button"
            className="text-btn route-sheet-back"
            onClick={() => {
              setError("");
              try {
                setText(encodeLatseRoute(reference));
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            Try the selected trail’s route code
          </button>
          <p className="muted">
            Latse codes carry the route and field notes. Photos stay on this
            device.
          </p>
          <FeaturedRoutes
            presets={presets}
            onSelect={setPreview}
            disabled={busy}
          />
        </section>
      ) : (
        <>
          <p className="muted mb-5">
            Plan something new, bring a route from your watch, or start with a
            featured trail.
          </p>
          <div className="route-import-options">
            <button
              type="button"
              className="route-import-option"
              disabled={busy}
              onClick={() => {
                setMode("draw");
                setError("");
              }}
            >
              <Map size={25} />
              <span>
                <strong>Draw / Tap Quick Route on Map</strong>
                <small>Tap 3–10 stops. No route file needed.</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
            <button
              type="button"
              className="route-import-option"
              disabled={busy}
              onClick={() => {
                setMode("paste");
                setError("");
              }}
            >
              <ClipboardPaste size={25} />
              <span>
                <strong>Paste Trail Link / GPX Text</strong>
                <small>Latse codes, route JSON & sample library</small>
              </span>
              <ArrowUpRight size={18} />
            </button>
            <button
              type="button"
              className="route-import-option"
              disabled={busy}
              onClick={() => files.current?.click()}
            >
              <FileUp size={25} />
              <span>
                <strong>Import from Garmin / Strava / Files</strong>
                <small>
                  {busy
                    ? "Reading your route…"
                    : "Open a downloaded .gpx, .xml, or .json"}
                </small>
              </span>
              <ArrowUpRight size={18} />
            </button>
          </div>
          <FeaturedRoutes
            presets={presets}
            onSelect={setPreview}
            disabled={busy}
          />
        </>
      )}
      <input
        ref={files}
        type="file"
        hidden
        accept=".gpx,.xml,.json,application/gpx+xml,text/xml,application/json"
        aria-label="Open downloaded route"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void loadFile(file);
        }}
      />
      {busy && (
        <p role="status" className="muted">
          Reading your trail…
        </p>
      )}
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}

function FeaturedRoutes({
  presets,
  onSelect,
  disabled = false,
}: {
  presets: HikeTrack[];
  onSelect: (track: HikeTrack) => void;
  disabled?: boolean;
}) {
  const { units } = useUnits();
  return (
    <section className="featured-route-picker">
      <p className="eyebrow">Featured global trails</p>
      {presets.map((track) => (
        <button
          type="button"
          disabled={disabled}
          key={track.id}
          className="featured-route-option"
          onClick={() => onSelect(track)}
        >
          <RouteGraphic points={track.points} />
          <span>
            <strong>{track.name}</strong>
            <small>
              {formatDistance(track.stats.totalDistKm, units)} · +
              {formatElevation(track.stats.elevationGainM, units)}
            </small>
          </span>
          <Mountain size={18} />
        </button>
      ))}
    </section>
  );
}
