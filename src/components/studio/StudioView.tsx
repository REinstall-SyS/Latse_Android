import { useUnits } from "@/hooks/useUnits";
import { useStudioEdition } from "@/hooks/useStudioEdition";
import { formatPrivacyDistance } from "@/domain/units";
import { hasPhotoMap, withLocatedPhotos } from "@/domain/photo-map";
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Camera,
  ChevronDown,
  Download,
  ImagePlus,
  Map,
  Maximize2,
  MoreHorizontal,
  Share2,
  Type,
  Palette,
  Sparkles,
  MapPin,
  Route,
} from "lucide-react";
import type { HikeTrack, ReceiptConfig } from "@/types/trek.types";
import {
  renderSummitReceipt,
  renderPhotoMapPoster,
} from "@/services/receipt-canvas.service";
import { serializeGPX } from "@/domain/gpx-engine";
import { prepareArtifactTrack } from "@/services/artifact-track";
import { compressPhotoToDataUrl } from "@/domain/exif-matcher";
import { validatePhotoSelection } from "@/services/mobile-media.service";
import {
  artifactFilename,
  downloadArtifact,
} from "@/services/artifact-download.service";
import {
  ArtifactPreview,
  type PreparedArtifact,
} from "@/services/artifact-preview";
import { Dialog } from "@/components/shared/Dialog";
import { TrailLibrarySheet } from "@/components/explore/TrailLibrarySheet";
import { RouteImporterSheet } from "@/components/explore/RouteImporterSheet";
import { PhotoPinEditor } from "@/components/map/PhotoPinEditor";
import { PhotoMapPreview } from "@/components/map/PhotoMapPreview";
import { StudioOptionsSheet } from "./StudioOptionsSheet";
import { StudioTextSheet } from "./StudioTextSheet";
import { loadCanvasImage } from "@/services/canvas-image.service";
import { saveStudioCover } from "@/services/studio-cover.service";
import { StudioDesignSheet } from "./StudioDesignSheet";
import { StudioPhotoSheet } from "./StudioPhotoSheet";
import { TrailCodeSheet } from "./TrailCodeSheet";
import "@/styles/studio.css";

interface Props {
  track: HikeTrack;
  tracks?: HikeTrack[];
  onTrack?: (id: string) => void;
  onSave?: (track: HikeTrack) => void | Promise<void>;
  userLocation?: [number, number] | null;
}
export function StudioView({
  track,
  tracks,
  onTrack,
  onSave,
  userLocation,
}: Props) {
  const { units } = useUnits();
  const { config, setConfig, editionError, coverError, coverLoading } =
    useStudioEdition(track, units);
  const [mode, setMode] = useState<"receipt" | "map">(
    track.preferredPresentation ?? "receipt",
  );
  const [mapFormat, setMapFormat] = useState<"interactive" | "print">(
    "interactive",
  );
  const interactive = mode === "map" && mapFormat === "interactive";
  const [sheet, setSheet] = useState<
    | "options"
    | "text"
    | "design"
    | "cover"
    | "moments"
    | "library"
    | "code"
    | "archive"
    | "route"
  >();
  const [largePreview, setLargePreview] = useState<string>();
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [prepared, setPrepared] = useState<PreparedArtifact>();
  const canvas = useRef<HTMLCanvasElement>(null),
    preview = useRef(new ArtifactPreview()),
    mounted = useRef(true),
    coverJob = useRef(0);
  const exportTrack = useMemo(
    () => ({
      ...track,
      name: config.title.trim() || track.name,
      region: config.subtitle,
    }),
    [track, config.title, config.subtitle],
  );
  const mapTrack = useMemo(() => withLocatedPhotos(exportTrack), [exportTrack]);
  const mapAvailable = hasPhotoMap(mapTrack);
  const invalidate = () => {
    preview.current.invalidate();
    setPrepared(undefined);
    setNotice("");
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      coverJob.current++;
      preview.current.invalidate();
    };
  }, []);
  useLayoutEffect(() => {
    invalidate();
  }, [track, config, mode, interactive]);
  useLayoutEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    if (
      !canvas.current ||
      (mode === "receipt" && coverLoading) ||
      (mode === "map" && !mapAvailable)
    )
      return;
    (mode === "receipt" ? renderSummitReceipt : renderPhotoMapPoster)(
      canvas.current,
      mode === "map" ? mapTrack : track,
      config,
    )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [track, mapTrack, mapAvailable, config, mode, coverLoading]);
  const change = <K extends keyof ReceiptConfig>(
    key: K,
    value: ReceiptConfig[K],
  ) => {
    invalidate();
    if (key === "aspectRatio" && mode === "map") setMapFormat("print");
    setReady(false);
    setError("");
    if (key === "backgroundPhotoUrl") coverJob.current++;
    setConfig((current) => ({
      ...current,
      [key]: value,
      ...(key === "backgroundPhotoUrl" ? { coverPhotoId: undefined } : {}),
    }));
    if (
      key === "backgroundPhotoUrl" &&
      typeof value === "string" &&
      value.startsWith("data:")
    ) {
      const job = coverJob.current;
      void saveStudioCover(track.id, value)
        .then((id) => {
          if (mounted.current && coverJob.current === job)
            setConfig((current) =>
              current.backgroundPhotoUrl === value
                ? { ...current, coverPhotoId: id }
                : current,
            );
        })
        .catch(() => {
          if (mounted.current && coverJob.current === job)
            setError(
              "The cover is visible, but device storage could not save it.",
            );
        });
    }
  };
  const exportFile = async (kind: "png" | "html" | "gpx", share = false) => {
    invalidate();
    const revision = preview.current.revision;
    setBusy(true);
    setError("");
    try {
      let blob: Blob;
      if (kind === "png") {
        if (!ready || !canvas.current)
          throw Error(
            "Your picture is still getting ready. Try again in a moment.",
          );
        blob = await new Promise<Blob>((resolve, reject) =>
          canvas.current!.toBlob(
            (value) =>
              value
                ? resolve(value)
                : reject(Error("Could not create this picture.")),
            "image/png",
          ),
        );
      } else if (kind === "gpx") {
        if (!track.points.length)
          throw Error(
            "No GPS trail was recorded. You can still keep your photos and make a keepsake.",
          );
        blob = new Blob(
          [
            serializeGPX(
              prepareArtifactTrack(exportTrack, config.privacyTrimMeters),
            ),
          ],
          { type: "application/gpx+xml" },
        );
      } else {
        const { exportInteractiveHTMLReport } = await import(
          "@/services/report-export.service"
        );
        blob = new Blob(
          [
            exportInteractiveHTMLReport(
              mapTrack,
              config.privacyTrimMeters,
              false,
              units,
            ),
          ],
          { type: "text/html" },
        );
      }
      if (!mounted.current) return;
      const filename = artifactFilename(
        (config.title || track.name) +
          (kind === "html"
            ? "-photo-map"
            : kind === "png" && mode === "map"
              ? "-storyboard"
              : ""),
        kind,
      );
      const file = preview.current.publish(blob, filename, revision);
      if (!file) return;
      setPrepared(file);
      await downloadArtifact(blob, filename, share);
      if (mounted.current && preview.current.revision === revision)
        setNotice(
          kind === "html"
            ? "Your interactive file is ready. Open it in a browser."
            : "Your picture is ready.",
        );
    } catch (error) {
      if (mounted.current && preview.current.revision === revision)
        setError((error as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const loadPhoto = async (files: File[]) => {
    const job = ++coverJob.current;
    invalidate();
    setBusy(true);
    setError("");
    try {
      validatePhotoSelection(files, 1);
      const photo = await compressPhotoToDataUrl(files[0], 1600, 0.86);
      await loadCanvasImage(photo);
      if (!mounted.current || coverJob.current !== job) return;
      setConfig((current) => ({
        ...current,
        backgroundPhotoUrl: photo,
        coverPhotoId: undefined,
      }));
      // Photo selection has its own cancellation token. Export/link invalidation must not discard it.
      try {
        const key = await saveStudioCover(track.id, photo);
        if (mounted.current && coverJob.current === job)
          setConfig((current) =>
            current.backgroundPhotoUrl === photo
              ? { ...current, coverPhotoId: key }
              : current,
          );
      } catch {
        if (mounted.current && coverJob.current === job)
          setError(
            "Your cover is visible, but could not be saved on this device. Keep Studio open and save your picture.",
          );
      }
    } catch (error) {
      if (mounted.current && coverJob.current === job)
        setError((error as Error).message);
    } finally {
      if (mounted.current && coverJob.current === job) setBusy(false);
    }
  };
  const emptyMap = mode === "map" && !mapAvailable;
  const editing = sheet === "text" || sheet === "design" || sheet === "cover";
  const openEditor = (value: "text" | "design" | "cover") => {
    if (mode === "map") setMapFormat("print");
    setSheet(value);
  };
  const stageNotice =
    error || editionError || (mode === "receipt" && coverError) || notice;
  const firstPin = mapTrack.pins[0];
  return (
    <section
      className={`studio-screen studio-workspace ${editing ? "is-editing" : ""}`}
      aria-label="Hike Studio"
    >
      <div className="studio-context-row">
        <button
          disabled={!onTrack || busy}
          onClick={() => setSheet("library")}
          title={track.name}
          aria-label={`Selected hike: ${track.name}`}
        >
          <span>{track.name}</span>
          <ChevronDown size={15} />
        </button>
        {mode === "map" && mapAvailable && (
          <button
            className="studio-preview-toggle"
            onClick={() => setMapFormat(interactive ? "print" : "interactive")}
          >
            {interactive ? <ImagePlus size={16} /> : <Map size={16} />}
            {interactive ? "Picture preview" : "Explore map"}
          </button>
        )}
        <button
          className="studio-more-button"
          aria-label="Studio options"
          onClick={() => {
            setSheet("options");
          }}
        >
          <MoreHorizontal size={22} />
        </button>
      </div>
      <div className="studio-mode-tabs" aria-label="Studio format">
        <button
          aria-pressed={mode === "receipt"}
          className={mode === "receipt" ? "selected" : ""}
          onClick={() => {
            invalidate();
            setMode("receipt");
          }}
        >
          <Sparkles size={17} />
          Keepsake
        </button>
        <button
          aria-pressed={mode === "map"}
          className={mode === "map" ? "selected" : ""}
          onClick={() => {
            invalidate();
            setMapFormat(editing ? "print" : "interactive");
            setMode("map");
          }}
        >
          <Map size={17} />
          Photo map
        </button>
      </div>
      <div
        className={`studio-canvas-stage ${interactive && !emptyMap ? "studio-live-stage" : ""}`}
        aria-busy={!emptyMap && !interactive && !ready}
      >
        {emptyMap ? (
          <div className="studio-map-empty">
            <div className="empty-map-art" aria-hidden="true">
              <MapPin size={32} />
            </div>
            <h2>Your photos belong on a map.</h2>
            <p>
              No GPS trail was recorded for this hike. Place your photos on the
              map, or add a route you already have.
            </p>
            <button className="primary-btn" onClick={() => setSheet("moments")}>
              <Camera size={18} />
              Place photos on map
            </button>
            <button className="text-btn" onClick={() => setSheet("route")}>
              <Route size={17} />
              Add a route
            </button>
          </div>
        ) : (
          <>
            {interactive && (
              <PhotoMapPreview
                track={mapTrack}
                privacyTrimMeters={config.privacyTrimMeters}
                compact
              />
            )}
            {!ready && !error && !interactive && (
              <span className="studio-render-status">
                Preparing your picture…
              </span>
            )}
          </>
        )}
        <canvas
          ref={canvas}
          className={
            interactive || emptyMap
              ? "studio-hidden-canvas"
              : !ready
                ? "studio-canvas-pending"
                : ""
          }
          aria-hidden={interactive || emptyMap}
          aria-label={
            mode === "receipt"
              ? "Keepsake print preview"
              : "Photo map print preview"
          }
        />
        {!interactive && !emptyMap && ready && (
          <button
            className="studio-enlarge"
            aria-label="Full preview"
            onClick={() => {
              if (canvas.current)
                setLargePreview(canvas.current.toDataURL("image/png"));
            }}
          >
            <Maximize2 size={16} />
          </button>
        )}
        {stageNotice && (
          <p
            className={`studio-stage-notice ${error ? "error" : ""}`}
            role={error || coverError ? "alert" : "status"}
          >
            {stageNotice}
          </p>
        )}
        {config.privacyTrimMeters > 0 && (
          <span className="studio-privacy-badge">
            {formatPrivacyDistance(config.privacyTrimMeters, units)} endpoint
            privacy
          </span>
        )}
      </div>
      {!editing && (
        <div className="studio-control-dock">
          <div className="studio-edit-actions">
            <button
              disabled={busy}
              aria-label="Edit text"
              onClick={() => openEditor("text")}
            >
              <Type size={18} />
              Text
            </button>
            <button disabled={busy} onClick={() => openEditor("design")}>
              <Palette size={18} />
              Design
            </button>
            <button
              disabled={busy}
              aria-label={mode === "map" ? "Photo crop" : "Cover photo & crop"}
              onClick={() => openEditor("cover")}
            >
              <ImagePlus size={18} />
              {mode === "map" ? "Crop" : "Cover"}
            </button>
            <button
              disabled={busy || !onSave}
              onClick={() => setSheet("moments")}
            >
              <Camera size={18} />
              Photos
            </button>
          </div>
          <div className="studio-primary-actions">
            <button
              className="primary-btn"
              disabled={busy || !ready}
              onClick={() => void exportFile("png", true)}
            >
              <Share2 size={18} />
              {busy
                ? "Preparing…"
                : mode === "receipt"
                  ? "Share keepsake"
                  : "Share photo map"}
            </button>
            <button
              className="studio-download-button"
              disabled={busy || !ready}
              aria-label={
                mode === "receipt" ? "Save PNG" : "Save storyboard PNG"
              }
              onClick={() => void exportFile("png")}
            >
              <Download size={20} />
            </button>
          </div>
        </div>
      )}
      {sheet === "text" && (
        <StudioTextSheet
          track={track}
          config={config}
          mode={mode}
          onChange={change}
          onPhotos={() => setSheet("moments")}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === "design" && (
        <StudioDesignSheet
          config={config}
          track={track}
          mode={mode}
          onChange={change}
          onCover={() => openEditor("cover")}
          onClose={() => setSheet(undefined)}
        />
      )}
      {largePreview && (
        <Dialog
          title={mode === "receipt" ? "Keepsake preview" : "Photo map preview"}
          onClose={() => setLargePreview(undefined)}
        >
          <img
            className="studio-zoom-art"
            src={largePreview}
            alt={`Print of ${config.title.trim() || track.name}`}
          />
        </Dialog>
      )}
      {sheet === "options" && (
        <StudioOptionsSheet
          config={config}
          busy={busy}
          prepared={prepared}
          onChange={change}
          onExport={(kind) => void exportFile(kind)}
          onCode={track.points.length ? () => setSheet("code") : undefined}
          onPreviewMap={mapAvailable ? () => setSheet("archive") : undefined}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === "code" && (
        <TrailCodeSheet
          track={exportTrack}
          privacyTrimMeters={config.privacyTrimMeters}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === "archive" && (
        <Dialog
          title="Interactive photo map"
          onClose={() => setSheet(undefined)}
        >
          <p className="sheet-intro">
            Explore here, or save the interactive file for a web browser. Use
            Share photo map for a picture.
          </p>
          <div className="share-map-preview">
            <PhotoMapPreview
              track={mapTrack}
              privacyTrimMeters={config.privacyTrimMeters}
            />
          </div>
          <button
            className="secondary-btn w-full"
            onClick={() => void exportFile("html")}
          >
            Export Interactive Web File (.html)
          </button>
        </Dialog>
      )}
      {sheet === "library" && tracks && onTrack && (
        <TrailLibrarySheet
          track={track}
          tracks={tracks}
          onSelect={onTrack}
          onClose={() => setSheet(undefined)}
        />
      )}
      {sheet === "route" && (
        <RouteImporterSheet
          reference={tracks?.find((value) => value.points.length) ?? track}
          onClose={() => setSheet(undefined)}
          onImport={async (route) => {
            if (!onSave) throw Error("This hike cannot be edited here.");
            await onSave({
              ...route,
              id: track.id,
              name: track.name,
              pins: [...mapTrack.pins, ...route.pins],
              unplacedPhotos: mapTrack.unplacedPhotos,
              preferredPresentation: "map",
            });
          }}
        />
      )}
      {sheet === "moments" && onSave && (
        <PhotoPinEditor
          track={{
            ...(mode === "map" ? mapTrack : track),
            freeRoam: !track.points.length || track.freeRoam,
          }}
          placementCenter={
            userLocation ??
            (firstPin ? [firstPin.lat, firstPin.lng] : undefined)
          }
          initialPins={mode === "map" ? mapTrack.pins : track.pins}
          initialPhotos={
            mode === "map" ? mapTrack.unplacedPhotos : track.unplacedPhotos
          }
          onClose={() => setSheet(undefined)}
          onSave={async (pins, unplacedPhotos) => {
            invalidate();
            await onSave({ ...track, pins, unplacedPhotos });
          }}
        />
      )}
      {sheet === "cover" && (
        <StudioPhotoSheet
          track={track}
          config={config}
          mode={mode}
          busy={busy}
          error={error}
          onChange={change}
          onFiles={(files) => void loadPhoto(files)}
          onMoments={() => setSheet("moments")}
          onClose={() => setSheet(undefined)}
        />
      )}
    </section>
  );
}
