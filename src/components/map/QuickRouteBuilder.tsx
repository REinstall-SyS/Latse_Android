import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Undo2, X } from "lucide-react";
import type { HikeTrack } from "@/types/trek.types";
import { buildQuickRoute, type QuickRouteStop } from "@/domain/route-builder";
import { snapToTrack } from "@/domain/gpx-engine";
import { TrackGraphic } from "@/components/shared/TrackGraphic";

interface Props {
  reference: HikeTrack;
  onCreate: (track: HikeTrack) => void;
}

export function QuickRouteBuilder({ reference, onCreate }: Props) {
  const { units } = useUnits();
  const heightFactor = units === "imperial" ? 3.28084 : 1;
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>();
  const layer = useRef<L.LayerGroup>();
  const latestReference = useRef(reference);
  latestReference.current = reference;
  const [stops, setStops] = useState<QuickRouteStop[]>([]);
  const [name, setName] = useState("My quick route");
  const [error, setError] = useState("");
  const [tileError, setTileError] = useState(false);

  const addStop = (lat: number, lng: number) => {
    const wrapped = L.latLng(lat, lng).wrap();
    lat = wrapped.lat;
    lng = wrapped.lng;
    const nearest = snapToTrack(lat, lng, latestReference.current.points);
    setStops((items) =>
      items.length >= 10
        ? items
        : [
            ...items,
            {
              lat,
              lng,
              ele: nearest.offTrackMeters <= 2000 ? nearest.point.ele : null,
            },
          ],
    );
    setError("");
  };

  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current, {
      zoomControl: true,
      zoomAnimation: false,
      doubleClickZoom: false,
    });
    map.current = instance;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    })
      .on("tileerror", () => setTileError(true))
      .addTo(instance);
    const route = L.polyline(
      reference.points.map((point) => [point.lat, point.lng]),
      { color: "#8C927F", opacity: 0.5, weight: 3 },
    ).addTo(instance);
    instance.fitBounds(route.getBounds(), { padding: [24, 24], maxZoom: 14 });
    layer.current = L.layerGroup().addTo(instance);
    instance.on("click", (event: L.LeafletMouseEvent) =>
      addStop(event.latlng.lat, event.latlng.lng),
    );
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(element.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    if (stops.length > 1)
      L.polyline(
        stops.map((stop) => [stop.lat, stop.lng]),
        { color: "#C96E0C", weight: 4, dashArray: "7 5" },
      ).addTo(group);
    stops.forEach((stop, index) => {
      L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          className: "quick-route-marker",
          html: `<span>${index + 1}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
        keyboard: false,
      }).addTo(group);
    });
  }, [stops]);

  const preview = useMemo(() => {
    if (stops.length < 3) return null;
    try {
      return buildQuickRoute(stops, name);
    } catch {
      return null;
    }
  }, [stops, name]);
  const missingHeights = stops.filter((stop) => stop.ele === null).length;

  return (
    <section className="quick-route-builder" aria-label="Draw a quick route">
      <p className="muted">
        Tap 3–10 stops: trailhead, ridge, viewpoint, and return. Drag the map to
        explore, then tap the next stop.
      </p>
      <label className="field-label">
        Route name
        <input
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="quick-route-map-wrap">
        <div
          ref={element}
          className="quick-route-map"
          aria-label="Tap the map to add route stops"
        />
        <span className="quick-route-count">{stops.length} / 10 stops</span>
      </div>
      {tileError && (
        <p className="muted" role="status">
          Background tiles are unavailable. Cached tiles and the reference route
          remain usable.
        </p>
      )}
      <div className="quick-route-map-actions">
        <button
          type="button"
          className="secondary-btn"
          disabled={stops.length >= 10}
          onClick={() => {
            const center = map.current?.getCenter();
            if (center) addStop(center.lat, center.lng);
          }}
        >
          <MapPin size={16} /> Add map center
        </button>
        <button
          type="button"
          className="secondary-btn"
          disabled={!stops.length}
          onClick={() => setStops((items) => items.slice(0, -1))}
        >
          <Undo2 size={16} /> Undo
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Clear route stops"
          disabled={!stops.length}
          onClick={() => setStops([])}
        >
          <X size={18} />
        </button>
      </div>
      {stops.length > 0 && (
        <ol className="quick-route-stops">
          {stops.map((stop, index) => (
            <li key={index}>
              <span>{index + 1}</span>
              <div>
                <strong>
                  {index === 0
                    ? "Trailhead"
                    : index === stops.length - 1
                      ? "Latest stop"
                      : "Trail stop"}
                </strong>
                <small>
                  {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                </small>
              </div>
              <label>
                Height ({units === "imperial" ? "ft" : "m"})
                <input
                  type="number"
                  inputMode="decimal"
                  value={
                    stop.ele === null ? "" : Math.round(stop.ele * heightFactor)
                  }
                  placeholder="Unknown"
                  min={-500 * heightFactor}
                  max={9000 * heightFactor}
                  aria-label={`Estimated height at stop ${index + 1}`}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStops((items) =>
                      items.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              ele:
                                value === "" || !Number.isFinite(+value)
                                  ? null
                                  : +value / heightFactor,
                            }
                          : item,
                      ),
                    );
                  }}
                />
              </label>
            </li>
          ))}
        </ol>
      )}
      {preview && (
        <div className="quick-route-preview">
          <TrackGraphic points={preview.points} />
          <strong>
            {formatDistance(preview.stats.totalDistKm, units)} · +
            {formatElevation(preview.stats.elevationGainM, units)} estimated
          </strong>
        </div>
      )}
      <p className="route-estimate-note">
        This plan connects your stops with straight lines. Heights near the
        selected trail use its elevation; other heights are interpolated
        {missingHeights === stops.length && stops.length > 0
          ? " or shown flat until you add a height"
          : ""}
        . Check actual paths, access, and terrain before hiking.
      </p>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="primary-btn w-full"
        disabled={stops.length < 3}
        onClick={() => {
          try {
            onCreate(buildQuickRoute(stops, name));
          } catch (error) {
            setError((error as Error).message);
          }
        }}
      >
        Use this quick route
      </button>
    </section>
  );
}
