import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import postcss from "postcss";
import { signatureTracks } from "@/data/signature-tracks";
import { photoMatchDescription } from "../mobile-media.service";
import {
  createFieldNote,
  placePhotoAtCoordinate,
  placeUnmatchedBatch,
} from "@/domain/photo-placement";
import { createRoam, updateRoamPath } from "@/domain/free-roam";
import { StoryPlayback } from "@/domain/story-playback";
import { shouldWarnGPSGap } from "@/domain/geospatial";
import { formatPrivacyDistance } from "@/domain/units";
import { KEEPSAKE_STYLES } from "@/domain/print-design";
import {
  loadStudioConfig,
  saveStudioConfig,
  studioConfigKey,
} from "../studio-edition.service";
import type { HikeTrack, ReceiptConfig, SpatialPin } from "@/types/trek.types";
import { TestDOMParser } from "@/domain/__tests__/helpers/xml-parser";
const read = (file: string) => fs.readFileSync(file, "utf8");
const sourceFiles = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? sourceFiles(path.join(root, entry.name))
        : [path.join(root, entry.name)],
    );
afterEach(() => vi.unstubAllGlobals());
const config: ReceiptConfig = {
  template: "editorial",
  aspectRatio: "4:5",
  title: "An honest field log",
  subtitle: "A real walk",
  backgroundPhotoUrl: null,
  showRouteMiniMap: true,
  showElevationCurve: true,
  showDaylightAndPace: true,
  privacyTrimMeters: 0,
  units: "imperial",
};
function photoTrack(): HikeTrack {
  const track = signatureTracks()[1];
  return {
    ...track,
    source: "recorded",
    pins: [20, 40, 60, 80].map((index, i) => ({
      ...track.points[index],
      id: String(i),
      caption: "Moment " + i,
      timestamp: 123,
      photoDataUrl: "data:image/jpeg;base64,AAAA",
    })),
  };
}
describe("minimalist shell and print assets", () => {
  it("removes every secondary tool and both handwriting font faces", () => {
    const font = "Cav" + "eat";
    const removed = [
      "src/components/dashboard/HydrationTracker.tsx",
      "src/components/readiness/ReadinessView.tsx",
      "src/components/tools/CompassTool.tsx",
      "src/components/tools/PaceCalculatorTool.tsx",
      "src/components/tools/RestTimerTool.tsx",
      "src/components/tools/TrekJournalTool.tsx",
      "src/components/tools/ToolsGridView.tsx",
      "src/components/weather/WeatherView.tsx",
      "src/data/checklist.data.ts",
      "public/fonts/" + font.toLowerCase() + "-latin.woff2",
      "public/fonts/" + font.toLowerCase() + "-latin-ext.woff2",
      "public/fonts/" + font + "-OFL.txt",
    ];
    expect(removed.filter((file) => fs.existsSync(file))).toEqual([]);
    const lingering = sourceFiles("src")
      .filter((file) => /\.(tsx?|css|html)$/.test(file))
      .filter((file) => read(file).toLowerCase().includes(font.toLowerCase()));
    expect(lingering).toEqual([]);
    expect(read("src/styles/index.css")).not.toContain(".handwritten");
    expect(fs.existsSync("src/components/safety/EmergencyView.tsx")).toBe(true);
  });

  it("routes the four core views and keeps units inside preferences", () => {
    const app = read("src/App.tsx");
    const header = app.match(
      /<header className="app-header">[\s\S]*?<\/header>/,
    )?.[0];
    expect(header).toBeTruthy();
    expect(header).toContain("<Mountain");
    expect(header).toContain("<span>LATSE</span>");
    expect(header).toMatch(
      /recorder\.running\s*&&\s*\([\s\S]*?recording-badge/,
    );
    expect(header).toContain('aria-label="Settings"');
    expect(header).not.toContain("<UnitToggle");
    expect(
      [...app.matchAll(/view === "(\w+)"/g)].map((match) => match[1]).sort(),
    ).toEqual(["explore", "map", "record", "studio"]);
    expect(app).toMatch(
      /title="Preferences & Safety"[\s\S]*?<UnitToggle\s*\/>/,
    );
    expect(app).toMatch(/title="SOS Beacon"[\s\S]*?<EmergencyView/);
    expect(app).not.toMatch(/ToolsGridView|toolSubview|latse_journal/);
    const units = read("src/hooks/useUnits.tsx");
    expect(units).toContain("MI / FT");
    expect(units).toContain("KM / M");
  });

  it("wires the three editions and live artwork proofs into Studio", () => {
    const studio = read("src/components/studio/StudioView.tsx");
    expect(KEEPSAKE_STYLES.map(({ id, name }) => [id, name])).toEqual([
      ["editorial", "Postcard"],
      ["topo-card", "Atlas"],
      ["brutalist", "Afterlight"],
    ]);
    expect(studio).toMatch(
      /<StudioDesignSheet\s+config=\{config\}\s+track=\{track\}/,
    );
    expect(studio).toContain('aria-label="Full preview"');
    const design = read("src/components/studio/StudioDesignSheet.tsx");
    expect(design).toContain('onChange("template", id)');
    expect(design).toContain("renderSummitReceipt(target, track");
    const canvas = read("src/services/receipt-canvas.service.ts");
    expect(canvas).toContain("STORYBOARD_PHOTO_LIMIT = 3");
  });
});

describe("readable, consolidated application typography", () => {
  it("keeps every explicit pixel font size at least ten pixels", () => {
    const css = postcss.parse(
        read("src/styles/index.css") + read("src/styles/studio.css"),
      ),
      tiny: string[] = [];
    css.walkDecls((declaration) => {
      if (!["font", "font-size"].includes(declaration.prop)) return;
      for (const size of declaration.value.matchAll(/([\d.]+)px/g))
        if (Number(size[1]) < 10) tiny.push(declaration.toString());
    });
    expect(tiny).toEqual([]);
  });
  it("has no repeated root selector blocks or hidden obsolete photo profile", () => {
    const source = read("src/styles/index.css"),
      css = postcss.parse(source),
      seen = new Set<string>(),
      repeated: string[] = [];
    css.nodes.forEach((node) => {
      if (node.type !== "rule") return;
      if (seen.has(node.selector)) repeated.push(node.selector);
      seen.add(node.selector);
    });
    expect(repeated).toEqual([]);
    expect(source).not.toContain(".photo-strip-profile");
    expect(fs.existsSync("src/components/layout/SplashScreen.tsx")).toBe(false);
  });
});
describe("release guardrails — units and range-free interaction", () => {
  it("has zero range inputs across every component, including expression attributes", () => {
    const found: string[] = [];
    for (const file of sourceFiles("src/components").filter((file) =>
      file.endsWith(".tsx"),
    )) {
      const source = read(file),
        tree = ts.createSourceFile(
          file,
          source,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          node.name.getText(tree) === "type" &&
          node.initializer
        ) {
          const value = ts.isStringLiteral(node.initializer)
            ? node.initializer.text
            : ts.isJsxExpression(node.initializer) &&
                node.initializer.expression &&
                ts.isStringLiteral(node.initializer.expression)
              ? node.initializer.expression.text
              : null;
          if (value === "range") found.push(file);
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
      expect(source).not.toMatch(/type\s*=\s*["']range["']/);
    }
    expect(found).toEqual([]);
    expect(read("src/styles/index.css")).not.toContain('[type="range"]');
    const chart = read("src/components/map/ElevationScrubber.tsx");
    for (const token of [
      "tabIndex={0}",
      "onKeyDown",
      '"ArrowLeft"',
      '"ArrowRight"',
    ])
      expect(chart).toContain(token);
  });
  it("formats every photo match and horizontal privacy label with the active units", () => {
    const pin = photoTrack().pins[0];
    for (const exifSource of ["gps", "timestamp", "manual", "live"] as const) {
      const text = photoMatchDescription({ ...pin, exifSource }, "imperial");
      expect(text).toContain(" ft");
      expect(text).not.toMatch(/\d[\d,.]* m\b/);
    }
    expect(formatPrivacyDistance(500, "imperial")).toBe("0.3 mi");
    expect(formatPrivacyDistance(500, "metric")).toBe("0.5 km");
    for (const file of [
      "src/components/studio/StudioView.tsx",
      "src/components/studio/StudioOptionsSheet.tsx",
      "src/services/report-export.service.ts",
    ])
      expect(read(file)).toContain("formatPrivacyDistance");
  });
});
describe("release guardrails — pin and recorder safety", () => {
  it("preserves exact off-trail free-roam coordinates through batch import", () => {
    const track = {
      ...signatureTracks()[0],
      ...{ freeRoam: true, id: "roam-audit", source: "planned" as const },
    };
    const pin: SpatialPin = {
      id: "off",
      lat: 37.005,
      lng: -122.02,
      ele: 0,
      cumDistKm: 0,
      timestamp: 123,
      caption: "Park",
      exifSource: "manual",
      offTrail: true,
    };
    expect(placeUnmatchedBatch([pin], track, 0)[0]).toEqual(pin);
    expect(
      placeUnmatchedBatch([pin, { ...pin, id: "second" }], track)[0],
    ).toEqual(pin);
    expect(read("src/components/map/PhotoStripDrawer.tsx")).toContain(
      "placeUnmatchedBatch(",
    );
  });
  it("never redistributes a deliberate map coordinate or GPS/time match", () => {
    const track = signatureTracks()[0],
      pin = photoTrack().pins[0];
    for (const value of [
      {
        ...pin,
        placementSource: "map" as const,
        exifSource: "manual" as const,
      },
      { ...pin, offTrail: true, exifSource: "manual" as const },
      { ...pin, exifSource: "gps" as const },
      { ...pin, exifSource: "timestamp" as const },
    ])
      expect(placeUnmatchedBatch([value], track, 0)[0]).toEqual(value);
    const exact = placePhotoAtCoordinate(
      { ...pin, exifSource: "manual" },
      track,
      track.points[0].lat + 0.0001,
      track.points[0].lng,
      false,
    );
    expect(exact.lat).toBe(track.points[0].lat + 0.0001);
  });
  it("adds a field note safely to a completely blank free roam", () => {
    const roam = createRoam();
    expect(() => createFieldNote(roam, 0, [37.005, -122.02])).not.toThrow();
    expect(createFieldNote(roam, 0, [37.005, -122.02])).toMatchObject({
      lat: 37.005,
      lng: -122.02,
      ele: 0,
      cumDistKm: 0,
      offTrail: true,
    });
    expect(createFieldNote(roam)).toMatchObject({ lat: 37.732, lng: -119.558 });
    expect(
      createFieldNote({
        ...roam,
        pins: [createFieldNote(roam, 0, [35, -120])],
      }),
    ).toMatchObject({ lat: 37.732, lng: -119.558 });
    const drawer = read("src/components/map/PhotoStripDrawer.tsx");
    expect(drawer).toContain("createFieldNote(");
    expect(drawer).toMatch(
      /center=\{\s*placementCenter \?\?[\s\S]*?!track\.points\.length/,
    );
    expect(drawer).not.toContain("lat: point.lat");
    const picker = read("src/components/map/PhotoPlacementMap.tsx");
    for (const token of [
      "onSelect(pin.id)",
      '"dragend"',
      "center ??",
      "placement-readout",
    ])
      expect(picker).toContain(token);
    expect(read("src/styles/index.css")).toMatch(
      /\.photo-placement-map\s*\{[^}]*height: 240px/s,
    );
  });
  it("suppresses the first accepted resume fix, but warns on an uninterrupted five-minute / 300m jump", () => {
    const previous = { lat: 37, lng: -122, wallTime: 1000 },
      fix = { lat: 37.003, lng: -122, timestamp: 301001 };
    expect(shouldWarnGPSGap(previous, fix, true)).toBe(false);
    expect(shouldWarnGPSGap(previous, fix, false)).toBe(true);
    const recorder = read("src/hooks/useHikeRecorder.ts");
    expect(recorder).toContain("resumedFromPauseRef = useRef(false)");
    expect(recorder).toMatch(
      /resumedFromPauseRef.current = latest.current.points.length > 0/,
    );
    expect(recorder.indexOf("if (!check.accept)")).toBeLessThan(
      recorder.indexOf("shouldWarnGPSGap(previous"),
    );
    expect(recorder.slice(recorder.indexOf("clear: async"))).toContain(
      'setGapNotice("")',
    );
  });
  it("prioritizes recorded coordinates until a strictly newer telemetry fix exists", () => {
    const app = read("src/App.tsx"),
      telemetry = read("src/hooks/useTrekTelemetry.ts");
    expect(app).toMatch(
      /telemetryFixTimestamp >\s*\(lastRecorded\?\.wallTime \?\? lastRecorded\?\.time \?\? 0\)/,
    );
    expect(app).toContain("lastRecorded && !telemetryIsNewer");
    expect(telemetry).toContain("setTelemetryFixTimestamp(fix.timestamp)");
    expect(telemetry).not.toContain("fix.altitude ?? previous.alt");
  });
  it("retains slide, hold, and keyboard focus protection in Pocket Lock", () => {
    const source = read("src/components/record/PocketLock.tsx");
    for (const token of [
      "distance >= 120",
      "setTimeout(finish, 1500)",
      'event.key === "Tab"',
      '"focusin"',
      "onPointerMove",
      "setPointerCapture",
    ])
      expect(source).toContain(token);
    expect(read("src/styles/index.css")).toContain("background: #050605");
  });
});
describe("release guardrails — playback, posters, durable editions and PWA", () => {
  it("advances the existing tour cursor after a live point-array replacement and drains all finish photos", () => {
    const track = signatureTracks()[0],
      points = track.points.slice(0, 3),
      player = new StoryPlayback();
    expect(player.next(points, [])?.index).toBe(0);
    expect(player.next([...points, track.points[3]], [])?.index).toBe(1);
    const pins = [1, 2, 3].map((i) => ({
      ...track.pins[0],
      id: "finish" + i,
      cumDistKm: points[2].cumDistKm,
      photoDataUrl: "data:image/jpeg;base64,AAAA",
    }));
    const end = player.next(points, pins)!;
    expect(end.photo?.id).toBe("finish1");
    expect(end.delayMs).toBe(1800);
    expect(player.next(points, pins)?.photo?.id).toBe("finish2");
    expect(player.next(points, pins)?.photo?.id).toBe("finish3");
    expect(player.next(points, pins)?.done).toBe(true);
    const source = read("src/components/map/MapView.tsx");
    expect(source).toContain("Stop Story");
    expect(source).toContain('className="map-story-pill"');
    expect(source).toContain("[tour, track.id]");
    expect(source).not.toContain("[tour, points]");
    expect(source).toMatch(/setPhotoCenter\(undefined\)/);
  });
  it("reprojects on-trail pins after Undo while retaining exact off-trail pins", () => {
    vi.stubGlobal("DOMParser", TestDOMParser);
    const track = signatureTracks()[0],
      roam = {
        ...track,
        freeRoam: true,
        pins: [
          { ...track.pins[2], id: "on", offTrail: false },
          { ...track.pins[2], id: "off", offTrail: true },
        ],
      };
    const shortened = updateRoamPath(roam, track.points.slice(0, 15));
    expect(shortened.pins[0].cumDistKm).toBeLessThanOrEqual(
      shortened.stats.totalDistKm,
    );
    expect(shortened.pins[1]).toEqual(roam.pins[1]);
    expect(updateRoamPath(roam, []).pins[0].cumDistKm).toBe(0);
  });
  it("persists the entire Studio edition separately per track and validates restored settings", () => {
    const values = new Map<string, string>(),
      storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      };
    const [first, second] = signatureTracks(),
      edition = {
        ...config,
        template: "brutalist" as const,
        title: "Our first summit",
        customQuote: "At last",
        photoFocusY: 0,
        privacyTrimMeters: 500,
      };
    saveStudioConfig(first.id, edition, storage);
    expect(values.has(studioConfigKey(first.id))).toBe(true);
    expect(loadStudioConfig(first, "imperial", storage)).toMatchObject(edition);
    expect(loadStudioConfig(second, "metric", storage).title).toBe(second.name);
    expect(loadStudioConfig(first, "metric", storage)).toMatchObject({
      title: edition.title,
      units: "metric",
    });
    storage.setItem(studioConfigKey(first.id), "{bad");
    expect(loadStudioConfig(first, "metric", storage).template).toBe(
      "editorial",
    );
    expect(read("src/components/studio/StudioView.tsx")).toMatch(
      /useStudioEdition\(\s*track,\s*units,?\s*\)/,
    );
    expect(read("src/services/studio-edition.service.ts")).toContain(
      "latse_studio_cfg_",
    );
  });
  it("enables immediate worker activation, client claiming, cache cleanup, and controlled-page refresh", () => {
    const vite = read("vite.config.ts");
    for (const token of [
      'registerType: "autoUpdate"',
      "skipWaiting: true",
      "clientsClaim: true",
      "cleanupOutdatedCaches: true",
    ])
      expect(vite).toContain(token);
    expect(read("src/main.tsx")).toContain("registerAppWorker");
    const updater = read("src/services/pwa-update.service.ts");
    for (const token of [
      'updateViaCache: "none"',
      '"controllerchange"',
      "window.location.reload()",
      '"SKIP_WAITING"',
    ])
      expect(updater).toContain(token);
  });
});
