import React, { lazy, Suspense, useCallback, useState } from "react";
import { ArrowUpRight, MoreHorizontal, Mountain } from "lucide-react";
import type { ViewId } from "@/types/trek.types";
import { useTrekTelemetry } from "@/hooks/useTrekTelemetry";
import { useAndroidBackButton } from "@/hooks/useAndroidBackButton";
import { useHikeLibrary } from "@/hooks/useHikeLibrary";
import { useFreeRoam } from "@/hooks/useFreeRoam";
import { useHikeRecorder } from "@/hooks/useHikeRecorder";
import { useRouteLinks } from "@/hooks/useRouteLinks";
import { UnitsProvider, UnitToggle } from "@/hooks/useUnits";
import { BottomNav } from "@/components/layout/BottomNav";
import { Dialog } from "@/components/shared/Dialog";

const ExploreView = lazy(() =>
  import("@/components/explore/ExploreView").then((module) => ({
    default: module.ExploreView,
  })),
);
const MapView = lazy(() =>
  import("@/components/map/MapView").then((module) => ({
    default: module.MapView,
  })),
);
const StudioView = lazy(() =>
  import("@/components/studio/StudioView").then((module) => ({
    default: module.StudioView,
  })),
);
const RecordView = lazy(() =>
  import("@/components/record/RecordView").then((module) => ({
    default: module.RecordView,
  })),
);
const EmergencyView = lazy(() =>
  import("@/components/safety/EmergencyView").then((module) => ({
    default: module.EmergencyView,
  })),
);

export const App: React.FC = () => (
  <UnitsProvider>
    <AppShell />
  </UnitsProvider>
);
function AppShell() {
  const [view, setView] = useState<ViewId>("explore");
  const [sheet, setSheet] = useState<
    "settings" | "sos" | "sos-from-settings" | null
  >(null);
  const library = useHikeLibrary();
  const recorder = useHikeRecorder();
  const roam = useFreeRoam();
  const { activeTrack: track } = library;
  const {
    telemetry,
    telemetryFixTimestamp,
    userLocation,
    locationStatus,
    requestLocation,
  } = useTrekTelemetry(recorder.running);
  const navigate = useCallback((target: ViewId) => setView(target), []);
  const routeLink = useRouteLinks(library.save, navigate);
  const closeSheet = useCallback(() => setSheet(null), []);
  useAndroidBackButton({
    currentView: view,
    setView,
    hasModalOpen: sheet !== null,
    closeModal: closeSheet,
  });
  const lastRecorded = recorder.track?.points[recorder.track.points.length - 1];
  const telemetryIsNewer =
    telemetryFixTimestamp > (lastRecorded?.wallTime ?? lastRecorded?.time ?? 0);
  const altitude =
    lastRecorded && !telemetryIsNewer
      ? lastRecorded.ele
      : (telemetry.alt ?? lastRecorded?.ele ?? null);
  const liveLocation: [number, number] | null =
    lastRecorded && (!telemetryIsNewer || !userLocation)
      ? [lastRecorded.lat, lastRecorded.lng]
      : userLocation;
  return (
    <div className="latse-app">
      <header className="app-header">
        <button
          className="wordmark"
          aria-label="Latse Trails"
          onClick={() => navigate("explore")}
        >
          <Mountain size={22} />
          <span>LATSE</span>
        </button>
        <div className="header-actions">
          {recorder.running && (
            <button
              className="recording-badge"
              aria-label="Open active recording"
              onClick={() => navigate("record")}
            >
              <i /> REC
            </button>
          )}
          <button className="sos-button" onClick={() => setSheet("sos")}>
            SOS
          </button>
          <button
            className="settings-menu-button"
            aria-label="Settings"
            onClick={() => setSheet("settings")}
          >
            <MoreHorizontal size={22} />
          </button>
        </div>
      </header>
      {library.warning && (
        <p className="storage-notice" role="alert">
          {library.warning}
        </p>
      )}
      {routeLink.message && (
        <button
          className="route-link-notice"
          onClick={routeLink.dismiss}
          aria-label="Dismiss route link status"
        >
          {routeLink.message} · Dismiss
        </button>
      )}
      <main className={`app-main tab-${view}`} key={view}>
        <Suspense
          fallback={
            <div className="app-loading" role="status">
              Opening your field view…
            </div>
          }
        >
          {library.loading || recorder.loading ? (
            <div className="app-loading" role="status">
              <Mountain size={28} />
              <span>Opening your field collection…</span>
            </div>
          ) : (
            <>
              {view === "explore" && (
                <ExploreView
                  track={track}
                  tracks={library.tracks}
                  savedIds={library.savedIds}
                  onSelect={library.select}
                  onSave={library.save}
                  onRemove={library.remove}
                  onNavigate={navigate}
                />
              )}
              {view === "map" && (
                <MapView
                  recorder={recorder}
                  roam={roam}
                  onStudio={(destination) =>
                    navigate(destination === "library" ? "explore" : "studio")
                  }
                  track={track}
                  tracks={library.tracks}
                  onTrack={library.select}
                  onSave={library.save}
                  userLocation={liveLocation}
                  onLocate={requestLocation}
                  locationStatus={locationStatus}
                />
              )}
              {view === "record" && (
                <RecordView
                  recorder={recorder}
                  reference={
                    track.points.length
                      ? track
                      : library.tracks.find((item) => item.points.length)!
                  }
                  onSave={async (hike, destination = "receipt") => {
                    await library.save(hike);
                    navigate(destination === "library" ? "explore" : "studio");
                  }}
                />
              )}
              {view === "studio" && (
                <StudioView
                  key={track.id}
                  track={track}
                  userLocation={liveLocation}
                  tracks={library.tracks}
                  onTrack={library.select}
                  onSave={library.save}
                />
              )}
            </>
          )}
        </Suspense>
      </main>
      <BottomNav
        activeView={view}
        onNavigate={navigate}
        recording={recorder.running}
      />
      {sheet === "settings" && (
        <Dialog title="Preferences & Safety" onClose={closeSheet}>
          <div className="settings-preferences">
            <div className="units-preference-bar">
              <span>Measurement units</span>
              <UnitToggle />
            </div>
            <button
              className="settings-sos-link"
              onClick={() => setSheet("sos-from-settings")}
            >
              SOS & location sharing <ArrowUpRight size={17} />
            </button>
          </div>
        </Dialog>
      )}
      {(sheet === "sos" || sheet === "sos-from-settings") && (
        <Dialog title="SOS Beacon" onClose={closeSheet}>
          <Suspense
            fallback={
              <p className="sheet-intro" role="status">
                Opening SOS…
              </p>
            }
          >
            <EmergencyView
              track={track}
              currentAltitude={altitude}
              userLocation={liveLocation}
              onLocate={requestLocation}
              onBack={
                sheet === "sos-from-settings"
                  ? () => setSheet("settings")
                  : undefined
              }
            />
          </Suspense>
        </Dialog>
      )}
    </div>
  );
}
export default App;
