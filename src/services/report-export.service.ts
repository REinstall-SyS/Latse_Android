import {
  formatDistance,
  formatPrivacyDistance,
  formatElevation,
  type UnitSystem,
} from "@/domain/units";
import type { HikeTrack } from "@/types/trek.types";
import { serializeGPX } from "@/domain/gpx-engine";
import { photoTimeLabel } from "@/domain/photo-time";
import compactStyles from "@/styles/storyboard.css?raw";
import reportCSS from "@/styles/photo-map.css?raw";
import { prepareStoryboardTrack } from "./artifact-track";
import leafletScript from "leaflet/dist/leaflet.js?raw";
import leafletStyles from "leaflet/dist/leaflet.css?raw";
import leafletLicense from "leaflet/LICENSE?raw";
function escapeHTML(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
function safeJSON(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/** Serialized into the standalone file. Keep every runtime dependency inside this function. */
function bootReport() {
  const L = (window as unknown as { L: typeof import("leaflet") }).L;
  const data = JSON.parse(
    document.getElementById("track-data")!.textContent!,
  ) as {
    track: HikeTrack;
    gpx: string;
    timeLabels: Record<string, string>;
    units: UnitSystem;
  };
  const distance = (km: number) =>
    (km * (data.units === "imperial" ? 0.621371 : 1)).toFixed(1) +
    (data.units === "imperial" ? " mi" : " km");
  const elevation = (m: number) =>
    Math.round(m * (data.units === "imperial" ? 3.28084 : 1)).toLocaleString(
      "en-US",
    ) + (data.units === "imperial" ? " ft" : " m");
  const track = data.track,
    hasRoute = track.points.length > 0;
  const points = hasRoute
    ? track.points
    : track.pins.map((pin) => ({ ...pin, gradePct: 0 }));
  const el = (id: string) => document.getElementById(id)!;
  const chart = el("story-progress") as unknown as SVGSVGElement;
  const photo = el("pin-photo") as HTMLImageElement;
  const map = L.map("map", {
    zoomControl: false,
    zoomAnimation: false,
    scrollWheelZoom: true,
    zoomSnap: 0.25,
  }).setView([points[0].lat, points[0].lng], 14);
  L.control.zoom({ position: "topright" }).addTo(map);
  let previousLongitude = points[0].lng;
  const latlngs = points.map((p): [number, number] => {
    previousLongitude =
      p.lng + 360 * Math.round((previousLongitude - p.lng) / 360);
    return [p.lat, previousLongitude];
  });
  const route = L.polyline(latlngs, {
    color: "#fffaf1",
    weight: 9,
    opacity: hasRoute ? 0.9 : 0,
  }).addTo(map);
  // Bound the number of layers on long GPX tracks while retaining the full route geometry.
  const stride = Math.max(1, Math.ceil(points.length / 600));
  for (let i = 1; hasRoute && i < points.length; i += stride) {
    const end = Math.min(points.length - 1, i + stride - 1);
    L.polyline(latlngs.slice(i - 1, end + 1), {
      color:
        points[i].gradePct > 12
          ? "#c65a36"
          : points[i].gradePct < -12
            ? "#417b81"
            : "#b78337",
      weight: 4,
      interactive: false,
    }).addTo(map);
  }
  const extent = L.latLngBounds([
    ...latlngs,
    ...track.pins.map(
      (pin) =>
        [
          pin.lat,
          pin.lng + 360 * Math.round((latlngs[0][1] - pin.lng) / 360),
        ] as [number, number],
    ),
  ]);
  const fit = () =>
    extent.getSouthWest().equals(extent.getNorthEast())
      ? map.setView(extent.getCenter(), 15)
      : map.fitBounds(extent, {
          padding: [32, Math.min(60, map.getSize().y * 0.16)],
          maxZoom: 16,
          animate: false,
        });
  fit();
  const cursor = L.circleMarker(latlngs[0], {
    radius: 7,
    fillColor: "#213d32",
    color: "white",
    fillOpacity: 1,
    weight: 3,
  }).addTo(map);
  if (hasRoute) {
    const start = L.circleMarker(latlngs[0], {
      radius: 5,
      fillColor: "white",
      color: "#213d32",
      fillOpacity: 1,
      weight: 2,
    }).addTo(map);
    start.bindTooltip("Start");
    L.circleMarker(latlngs[latlngs.length - 1], {
      radius: 5,
      fillColor: "#213d32",
      color: "white",
      fillOpacity: 1,
      weight: 2,
    })
      .addTo(map)
      .bindTooltip("Finish");
  }
  map.attributionControl.addAttribution("Latse photo map");
  let selected = 0,
    frame = 0,
    playing = false;
  const first = points[0].cumDistKm,
    last = points[points.length - 1].cumDistKm,
    span = Math.max(0.000001, last - first);
  const nearest = (km: number) => {
    let a = 0,
      b = points.length - 1;
    while (a < b) {
      const m = (a + b) >>> 1;
      if (points[m].cumDistKm < km) a = m + 1;
      else b = m;
    }
    return a > 0 && km - points[a - 1].cumDistKm < points[a].cumDistKm - km
      ? a - 1
      : a;
  };
  const stop = () => {
    playing = false;
    cancelAnimationFrame(frame);
    el("play").textContent = "▶ Replay walk";
  };
  let activePinId: string | undefined;
  let layoutMarkers = () => {};
  const showPin = (pin: HikeTrack["pins"][number]) => {
    activePinId = pin.id;
    layoutMarkers();
    photo.hidden = !pin.photoDataUrl;
    if (pin.photoDataUrl) {
      photo.src = pin.photoDataUrl;
      photo.alt = pin.caption || "Trail moment";
    } else photo.removeAttribute("src");
    el("pin-caption").textContent = pin.caption;
    el("pin-position").textContent = !hasRoute
      ? pin.lat.toFixed(4) + ", " + pin.lng.toFixed(4)
      : `${distance(pin.cumDistKm)} · ${elevation(pin.ele)} · ${pin.exifSource === "gps" ? "GPS matched" : pin.exifSource === "timestamp" ? "Time matched" : pin.exifSource === "live" ? "Recording fix" : "Placed on trail"}`;
    el("capture-time").textContent = data.timeLabels[pin.id] || "";
    el("moment-card").hidden = false;
    document
      .querySelectorAll<HTMLButtonElement>(".moment-button")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.pin === pin.id),
        ),
      );
  };
  const closeMoment = () => {
    el("moment-card").hidden = true;
    document
      .querySelector(".moment-button[aria-pressed=true]")
      ?.setAttribute("aria-pressed", "false");
  };
  const select = (index: number, reveal = true) => {
    selected = Math.max(0, Math.min(points.length - 1, index));
    const point = points[selected];
    cursor.setLatLng(latlngs[selected]);
    chart.setAttribute("aria-valuenow", String(selected));
    chart.setAttribute(
      "aria-valuetext",
      distance(point.cumDistKm - first) + " · " + elevation(point.ele),
    );
    const x = 4 + ((point.cumDistKm - first) / span) * 232;
    el("story-cursor").setAttribute("x1", String(x));
    el("story-cursor").setAttribute("x2", String(x));
    el("point-distance").textContent = distance(
      Math.max(0, point.cumDistKm - first),
    );
    el("point-altitude").textContent = elevation(point.ele);
    const near = track.pins.reduce<HikeTrack["pins"][number] | undefined>(
      (best, pin) =>
        Math.abs(pin.cumDistKm - point.cumDistKm) < Math.max(0.08, span / 80) &&
        (!best ||
          Math.abs(pin.cumDistKm - point.cumDistKm) <
            Math.abs(best.cumDistKm - point.cumDistKm) ||
          (Math.abs(pin.cumDistKm - point.cumDistKm) ===
            Math.abs(best.cumDistKm - point.cumDistKm) &&
            !!pin.photoDataUrl &&
            !best.photoDataUrl))
          ? pin
          : best,
      undefined,
    );
    if (near && reveal) showPin(near);
    else closeMoment();
  };
  const markers: Array<{
    marker: import("leaflet").Marker;
    at: [number, number];
    id: string;
  }> = [];
  const leaders = L.layerGroup().addTo(map);
  track.pins.forEach((pin, i) => {
    const longitude = latlngs[nearest(pin.cumDistKm)][1];
    const position: [number, number] = [
      pin.lat,
      pin.lng + 360 * Math.round((longitude - pin.lng) / 360),
    ];
    const open = () => {
      stop();
      select(nearest(pin.cumDistKm));
      showPin(pin);
      cursor.setLatLng(position);
      el("point-distance").textContent = distance(
        Math.max(0, pin.cumDistKm - first),
      );
      el("point-altitude").textContent = elevation(pin.ele);
      map.panTo(position, { animate: false });
    };
    const icon = document.createElement("div");
    icon.className = "photo-pin";
    if (pin.photoDataUrl) {
      const image = document.createElement("img");
      image.src = pin.photoDataUrl;
      image.alt = "";
      icon.append(image);
    } else icon.classList.add("note-pin");
    const number = document.createElement("span");
    number.textContent = String(i + 1).padStart(2, "0");
    icon.append(number);
    const marker = L.marker(position, {
      icon: L.divIcon({
        html: icon,
        className: "photo-marker",
        iconSize: [48, 54],
        iconAnchor: [24, 54],
      }),
      title: `Moment ${i + 1}: ${pin.caption}`,
      zIndexOffset: pin.photoDataUrl ? 100 : 0,
    })
      .addTo(map)
      .on("click", open);
    markers.push({ marker, at: position, id: pin.id });
    const button = document.createElement("button");
    button.className = "moment-button";
    button.style.order = pin.photoDataUrl ? "0" : "1";
    button.dataset.pin = pin.id;
    button.setAttribute("aria-label", `Open moment ${i + 1}: ${pin.caption}`);
    button.setAttribute("aria-pressed", "false");
    if (pin.photoDataUrl) {
      const image = document.createElement("img");
      image.src = pin.photoDataUrl;
      image.alt = "";
      button.append(image);
    }
    const label = document.createElement("span");
    label.textContent = `${String(i + 1).padStart(2, "0")} / ${pin.caption || "Field note"}`;
    button.append(label);
    button.addEventListener("click", open);
    el("notes").append(button);
  });

  layoutMarkers = () => {
    leaders.clearLayers();
    const occupied: import("leaflet").Point[] = [],
      size = map.getSize();
    [...markers]
      .sort(
        (a, b) => Number(b.id === activePinId) - Number(a.id === activePinId),
      )
      .forEach((item) => {
        const actual = map.latLngToContainerPoint(item.at);
        let screen = actual;
        if (occupied.some((p) => p.distanceTo(actual) < 55)) {
          for (let attempt = 0; attempt < 32; attempt++) {
            const angle = ((attempt % 8) * Math.PI) / 4,
              radius = 62 * (1 + Math.floor(attempt / 8));
            const candidate = L.point(
              Math.max(
                30,
                Math.min(size.x - 30, actual.x + Math.cos(angle) * radius),
              ),
              Math.max(
                65,
                Math.min(size.y - 25, actual.y + Math.sin(angle) * radius),
              ),
            );
            if (occupied.every((p) => p.distanceTo(candidate) >= 55)) {
              screen = candidate;
              break;
            }
          }
        }
        occupied.push(screen);
        const at = map.containerPointToLatLng(screen);
        item.marker
          .setLatLng(at)
          .setZIndexOffset(item.id === activePinId ? 900 : 100);
        if (screen.distanceTo(actual) > 1)
          L.polyline([item.at, at], {
            color: "#677d68",
            weight: 1,
            opacity: 0.65,
            interactive: false,
          }).addTo(leaders);
      });
  };
  map.on("moveend zoomend resize", layoutMarkers);
  layoutMarkers();
  chart.setAttribute("aria-valuemax", String(points.length - 1));
  let low = Infinity,
    high = -Infinity;
  for (const point of points) {
    low = Math.min(low, point.ele);
    high = Math.max(high, point.ele);
  }
  const profileStride = Math.max(1, Math.ceil(points.length / 600));
  el("story-elevation").setAttribute(
    "points",
    points
      .filter(
        (_, index) =>
          index % profileStride === 0 || index === points.length - 1,
      )
      .map(
        (p) =>
          `${4 + ((p.cumDistKm - first) / span) * 232},${40 - ((p.ele - low) / Math.max(1, high - low)) * 32}`,
      )
      .join(" "),
  );
  const choose = (event: PointerEvent) => {
    const box = chart.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (((event.clientX - box.left) / box.width) * 240 - 4) / 232),
    );
    stop();
    select(nearest(first + fraction * span));
  };
  chart.addEventListener("pointerdown", (event) => {
    chart.setPointerCapture(event.pointerId);
    choose(event);
  });
  chart.addEventListener("pointermove", (event) => {
    if (chart.hasPointerCapture(event.pointerId)) choose(event);
  });
  chart.addEventListener("pointerup", (event) => {
    if (chart.hasPointerCapture(event.pointerId))
      chart.releasePointerCapture(event.pointerId);
  });
  chart.addEventListener("keydown", (event) => {
    const next =
      event.key === "ArrowLeft"
        ? selected - 1
        : event.key === "ArrowRight"
          ? selected + 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? points.length - 1
              : null;
    if (next !== null) {
      event.preventDefault();
      stop();
      select(next);
    }
  });
  el("play").addEventListener("click", () => {
    if (playing) {
      stop();
      return;
    }
    if (selected >= points.length - 1) select(0);
    playing = true;
    el("play").textContent = "Ⅱ Pause replay";
    const from = points[selected].cumDistKm,
      began = performance.now();
    const tick = (now: number) => {
      if (!playing) return;
      const fraction = Math.min(1, (now - began) / 30000);
      select(nearest(from + fraction * (last - from)));
      if (fraction === 1) stop();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
  el("fit").addEventListener("click", fit);

  const styles = [
    {
      name: "Outdoor",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      zoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    {
      name: "Topo",
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      zoom: 17,
      attribution: "© OpenTopoMap (CC-BY-SA), © OpenStreetMap, SRTM",
    },
    {
      name: "Satellite",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      zoom: 19,
      attribution: "Imagery © Esri, Vantor, Earthstar Geographics",
    },
  ];
  let tiles: import("leaflet").TileLayer | undefined,
    styleIndex = 0,
    layerRevision = 0;
  const loadMapStyle = (index: number) => {
    styleIndex = index;
    const revision = ++layerRevision,
      style = styles[index];
    let loadedTiles = 0;
    if (tiles) map.removeLayer(tiles);
    const state = el("map-load-state");
    state.textContent = "Loading map…";
    state.hidden = false;
    el("basemap").textContent = style.name + " ▾";
    el("map-styles")
      .querySelectorAll("button")
      .forEach((button, i) =>
        button.setAttribute("aria-pressed", String(i === index)),
      );
    el("basemap").setAttribute("aria-label", "Map style: " + style.name);
    if (map.getZoom() > style.zoom) map.setZoom(style.zoom);
    tiles = L.tileLayer(style.url, {
      maxZoom: style.zoom,
      attribution: style.attribution,
      crossOrigin: true,
    })
      .on("tileload", () => {
        loadedTiles++;
        if (revision === layerRevision) state.hidden = true;
      })
      .on("load", () => {
        if (revision === layerRevision && loadedTiles > 0) state.hidden = true;
      })
      .on("tileerror", () => {
        if (revision !== layerRevision) return;
        state.hidden = false;
        state.textContent =
          "Background unavailable · route & photos remain available";
      })
      .addTo(map);
  };
  loadMapStyle(0);
  const layerMenu = el("map-styles");
  el("basemap").addEventListener("click", () => {
    layerMenu.hidden = !layerMenu.hidden;
    el("basemap").setAttribute("aria-expanded", String(!layerMenu.hidden));
  });
  layerMenu
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button, index) => {
      button.addEventListener("click", () => {
        loadMapStyle(index);
        layerMenu.hidden = true;
        el("basemap").setAttribute("aria-expanded", "false");
      });
    });
  el("close-photo").addEventListener("click", closeMoment);
  el("download").addEventListener("click", () => {
    const url = URL.createObjectURL(
      new Blob([data.gpx], { type: "application/gpx+xml" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${track.name.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 100) || "trail"}.gpx`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  const resize = new ResizeObserver(() => map.invalidateSize());
  resize.observe(el("map"));
  if (!hasRoute) {
    el("replay-controls").hidden = true;
    el("download").hidden = true;
  }
  select(0, false);
}
/** Portable interactive photo map. Route, photos, pan/zoom and replay work without internet. */
export function exportInteractiveHTMLReport(
  track: HikeTrack,
  privacyTrimMeters: number,
  compact = false,
  units: UnitSystem = "metric",
): string {
  const snapshot = prepareStoryboardTrack(track, privacyTrimMeters);
  const timeLabels = Object.fromEntries(
    snapshot.pins
      .filter((pin) => pin.photoDataUrl)
      .map((pin) => [
        pin.id,
        snapshot.privacyTrimmed ? "Capture time hidden" : photoTimeLabel(pin),
      ]),
  );
  if (!snapshot.points.length && !snapshot.pins.length)
    throw new Error("Place a photo on the map or add a GPS route first.");
  const s = snapshot.stats;
  const library = leafletScript
    .replace(/\/\/# sourceMappingURL=[^\r\n]*/g, "")
    .replace(/<\/script/gi, "<\\/script");
  const css = leafletStyles.replace(/url\([^)]*\)/g, "none");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(snapshot.name)} · Latse photo map</title><style>${css}\n${reportCSS}\n${compactStyles}</style></head><body${compact ? ' class="embedded-storyboard"' : ""}>
<header><div class="brand"><b>LATSE</b><span>PHOTO MAP</span></div><h1>${escapeHTML(snapshot.name)}</h1><p class="region">${escapeHTML(snapshot.region)}</p><div class="stats">${snapshot.points.length ? `<span><b>${formatDistance(s.totalDistKm, units)}</b></span><span><b>${formatElevation(s.elevationGainM, units, true)}</b> gain</span>` : "<span>Photo locations · no GPS trail recorded</span>"}<span><b>${snapshot.pins.filter((pin) => pin.photoDataUrl).length}</b> photos</span>${snapshot.elevationEstimated ? "<span>Planned route · straight-line segments · estimated elevations</span>" : ""}</div></header>
<main class="story"><section class="map-wrap" aria-label="Interactive trail photo map"><div id="map"></div><div class="map-actions"><button id="fit">${snapshot.points.length ? "Fit trail" : "Fit photos"}</button><button id="basemap" aria-label="Map style: Outdoor" aria-expanded="false" aria-controls="map-styles">Outdoor ▾</button></div><div id="map-styles" class="map-style-menu" role="group" aria-label="Map style" hidden><button>Outdoor</button><button>Topo</button><button>Satellite</button></div><span id="map-load-state" class="map-load-state" role="status">Loading map…</span><article id="moment-card" class="moment-card" aria-label="Selected moment" hidden><img id="pin-photo" hidden alt=""><div><p id="pin-caption"></p><small id="pin-position"></small><small id="capture-time"></small></div><button id="close-photo" aria-label="Close moment">×</button></article></section>
<div class="replay" id="replay-controls"><button id="play">▶ Replay walk</button><svg id="story-progress" viewBox="0 0 240 44" preserveAspectRatio="none" tabindex="0" role="slider" aria-label="Trail point" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><polyline id="story-elevation" fill="none" stroke="#9c783f" stroke-width="2" points=""/><line id="story-cursor" x1="4" x2="4" y1="3" y2="41" stroke="#345b46" stroke-width="3"/></svg><span><b id="point-distance">${formatDistance(0, units)}</b><br><small id="point-altitude"></small></span></div>
<div class="moments-label">Photos & notes</div><div id="notes" class="notes" aria-label="All field notes"></div>${!snapshot.pins.length ? '<p class="empty-moments">A quiet walk. No moments pinned yet.</p>' : ""}
${privacyTrimMeters > 0 ? `<p class="privacy">${formatPrivacyDistance(privacyTrimMeters, units)} endpoint privacy. Start/end locations, unplaced photos and exact timestamps are excluded. Metrics describe the complete hike.</p>` : ""}</main>
<footer class="foot"><div><p id="map-status">Route & photos work offline. Background tiles need internet.</p><p>Gold: gentle · Rust: steep climb · Teal: steep descent. Photo locations are matched to the route and can be manually placed.</p><p>Shared for memories. Bring a verified track for navigation.</p></div><button id="download">Download GPX Track</button></footer>
<script id="track-data" type="application/json">${safeJSON({ track: snapshot, gpx: snapshot.points.length ? serializeGPX(snapshot) : "", timeLabels, units })}</script><!-- Leaflet license:\n${leafletLicense} --><script>${library}</script><script>(${bootReport.toString()})();</script></body></html>`;
}
