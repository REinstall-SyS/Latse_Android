import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import { PocketLock } from "./PocketLock";
import React, { useRef, useState } from "react";
import {
  Camera,
  Check,
  FileUp,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Lock,
} from "lucide-react";
import type { HikeTrack, SaveDestination } from "@/types/trek.types";
import { FinishHikeSheet } from "./FinishHikeSheet";
import type { useHikeRecorder } from "@/hooks/useHikeRecorder";
import {
  calculatePaceMinPerKm,
  calculateVerticalRate,
} from "@/domain/altitude-physics";
import { calculateGhostDelta } from "@/domain/gpx-engine";
import { formatGhostPace, locateOnTrail } from "@/domain/trail-navigation";
import { TrackGraphic } from "@/components/shared/TrackGraphic";
import { PhotoPinEditor } from "@/components/map/PhotoPinEditor";
import { RouteImporterSheet } from "@/components/explore/RouteImporterSheet";
import { Dialog } from "@/components/shared/Dialog";

export function elapsedLabel(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

interface Props {
  recorder: ReturnType<typeof useHikeRecorder>;
  reference: HikeTrack;
  onSave: (
    track: HikeTrack,
    destination?: SaveDestination,
  ) => void | Promise<void>;
}

export function RecordView({ recorder, reference, onSave }: Props) {
  const { units } = useUnits();
  const [pocket, setPocket] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [importer, setImporter] = useState(false);
  const [imported, setImported] = useState<HikeTrack>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const finishedId = useRef(crypto.randomUUID());
  const [confirm, setConfirm] = useState<"restart" | "finish">();
  const hasSession =
    recorder.draft.elapsed > 0 ||
    recorder.draft.points.length > 0 ||
    recorder.draft.pins.length > 0 ||
    (recorder.draft.unplacedPhotos?.length ?? 0) > 0;
  const hasStarted =
    recorder.draft.startMs !== undefined ||
    recorder.draft.elapsed > 0 ||
    recorder.draft.points.length > 0;
  const last = recorder.track?.points[recorder.track.points.length - 1];
  const location = last
    ? locateOnTrail(last.lat, last.lng, reference.points)
    : null;
  const delta =
    location && location.offTrackMeters < 100
      ? calculateGhostDelta(
          location.distanceKm,
          recorder.draft.elapsed,
          reference,
        ).deltaSec
      : null;
  const status = recorder.running
    ? last
      ? "Recording active"
      : "Finding GPS"
    : hasStarted
      ? "Paused"
      : "Ready for GPS";
  const finish = async (
    destination: SaveDestination = "receipt",
    name = recorder.draft.name,
  ) => {
    if (!recorder.track) return;
    setSaving(true);
    setError("");
    const elapsed = recorder.setRunning(false);
    try {
      await onSave(
        {
          ...recorder.track,
          id: finishedId.current,
          name: name.trim() || "My hike",
          preferredPresentation: destination === "map" ? "map" : "receipt",
          createdAt: Date.now(),
          stats: {
            ...recorder.track.stats,
            durationSec: Math.round(elapsed),
            verticalRateMh: calculateVerticalRate(
              recorder.track.stats.elevationGainM,
              elapsed,
            ),
            paceMinPerKm: calculatePaceMinPerKm(
              recorder.track.stats.totalDistKm,
              elapsed,
            ),
          },
        },
        destination,
      );
      await recorder.clear();
      setConfirm(undefined);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="record-screen" aria-label="Hike recorder">
      <div className="recorder-heading">
        <button
          className="record-restart icon-btn"
          aria-label="Restart hike"
          onClick={() =>
            hasSession
              ? setConfirm("restart")
              : void recorder.clear().catch((e) => setError(e.message))
          }
        >
          <RotateCcw size={19} />
        </button>
        <span className={`recorder-status ${recorder.running ? "live" : ""}`}>
          <Radio size={13} />
          {status}
        </span>
        <label className="sr-only" htmlFor="recording-name">
          Hike title
        </label>
        <input
          id="recording-name"
          value={recorder.draft.name}
          maxLength={100}
          onChange={(event) => recorder.setName(event.target.value)}
          aria-label="Hike title"
        />
      </div>
      <div className="recorder-computer">
        <p className="eyebrow">TIME WELL SPENT</p>
        <strong className="record-chronometer" aria-label="Active hike time">
          {elapsedLabel(recorder.draft.elapsed)}
        </strong>
        <p className="record-time-caption">
          {recorder.running
            ? "One step at a time."
            : last
              ? "Take your time. Your trail is here."
              : "A new field story starts here."}
        </p>
        <div className="recorder-metric-grid">
          {[
            [
              "Distance",
              formatDistance(recorder.track?.stats.totalDistKm ?? 0, units),
              "",
            ],
            [
              "Elev gain",
              formatElevation(
                recorder.track?.stats.elevationGainM ?? 0,
                units,
                true,
              ),
              "",
            ],
            [
              "Active pace",
              formatPace(recorder.track?.stats.paceMinPerKm ?? "—", units),
              "",
            ],
            [
              "Vert rate",
              formatVertRate(recorder.track?.stats.verticalRateMh ?? 0, units),
              "",
            ],
          ].map(([label, value, unit]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>
                {value}
                <span>{unit}</span>
              </strong>
            </div>
          ))}
        </div>
        <div className="recorder-profile">
          {recorder.track?.points.length ? (
            <TrackGraphic points={recorder.track.points} />
          ) : (
            <div className="empty-recording-line" />
          )}
          <span>
            {recorder.draft.points.length
              ? `${recorder.draft.points.length} GPS fixes · ${formatElevation(last?.ele ?? 0, units)} elevation`
              : "Your elevation story will appear here"}
          </span>
        </div>
        {delta !== null && (
          <p className="recorder-ghost" role="status">
            {formatGhostPace(delta)}
          </p>
        )}
        {(error || recorder.error) && (
          <p className="recorder-error" role="status">
            {error || recorder.error}
          </p>
        )}
      </div>
      <div className="recorder-control-dock">
        <div className="record-main-actions">
          <button
            className="record-photo-button"
            onClick={() => setPinning(true)}
          >
            <Camera size={20} />
            <span>Pin Photo</span>
          </button>
          <button
            className={`primary-btn record-start-button ${recorder.running ? "is-recording" : ""}`}
            onClick={() => recorder.setRunning(!recorder.running)}
          >
            {recorder.running ? <Pause size={21} /> : <Play size={21} />}
            {recorder.running ? "Pause" : hasStarted ? "Resume" : "Start Hike"}
          </button>
        </div>
        <button
          className="record-finish-button"
          disabled={!hasSession && !recorder.running}
          onClick={() => {
            recorder.setRunning(false);
            setConfirm("finish");
          }}
        >
          <Check size={17} /> Finish hike
        </button>
        <button
          className="record-import-link"
          onClick={() => setImporter(true)}
        >
          <FileUp size={14} />
          <span>Already hiked with Garmin/Strava? Import GPX + Photos</span>
        </button>
      </div>
      {recorder.gapNotice && (
        <button className="gps-gap-notice" onClick={recorder.dismissGapNotice}>
          {recorder.gapNotice}
        </button>
      )}
      {recorder.running && (
        <button className="pocket-lock-button" onClick={() => setPocket(true)}>
          <Lock size={16} /> Pocket Lock / Battery Saver
        </button>
      )}
      {pocket && recorder.running && (
        <PocketLock
          distanceKm={recorder.track?.stats.totalDistKm ?? 0}
          elevation={last?.ele ?? null}
          onUnlock={() => setPocket(false)}
        />
      )}
      {pinning && recorder.track && (
        <PhotoPinEditor
          track={recorder.track}
          liveRecording={recorder.running}
          initialIndex={Math.max(0, recorder.track.points.length - 1)}
          onClose={() => setPinning(false)}
          initialPins={recorder.track.pins}
          initialPhotos={recorder.track.unplacedPhotos}
          onSave={recorder.replaceMoments}
        />
      )}
      {confirm === "finish" && recorder.track && (
        <FinishHikeSheet
          track={recorder.track}
          busy={saving}
          error={error}
          onSave={finish}
          onClose={() => setConfirm(undefined)}
        />
      )}
      {confirm === "restart" && (
        <Dialog title="Start fresh?" onClose={() => setConfirm(undefined)}>
          <p className="sheet-intro">
            This resets the timer, route, and unsaved moments. Saved hikes stay
            in your library.
          </p>
          <button
            className="primary-btn w-full"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await recorder.clear();
                setConfirm(undefined);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Resetting…" : "Reset recording"}
          </button>
          {error && (
            <p role="alert" className="error-text mt-3">
              {error}
            </p>
          )}
          <button
            className="text-btn w-full"
            onClick={() => setConfirm(undefined)}
          >
            Keep editing
          </button>
        </Dialog>
      )}
      {importer && (
        <RouteImporterSheet
          reference={reference}
          onImport={(track) => {
            setImported(track);
            setError("");
          }}
          onClose={() => setImporter(false)}
        />
      )}
      {imported && !importer && (
        <PhotoPinEditor
          importedRoute
          track={imported}
          initialPins={imported.pins}
          initialPhotos={imported.unplacedPhotos}
          onClose={() => setImported(undefined)}
          onSave={(pins, unplacedPhotos) =>
            onSave({ ...imported, pins, unplacedPhotos })
          }
        />
      )}
    </section>
  );
}
