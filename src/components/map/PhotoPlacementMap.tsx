import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HikeTrack, SpatialPin } from "@/types/trek.types";
import { placePhotoAtCoordinate } from "@/domain/photo-placement";
import { formatDistance, formatElevation } from "@/domain/units";
import { useUnits } from "@/hooks/useUnits";
import { attachMapLayer } from "@/services/map-layers.service";

export function PhotoPlacementMap({
  track,
  active,
  pins,
  onChange,
  onSelect,
  center,
}: {
  track: HikeTrack;
  active: SpatialPin;
  pins: SpatialPin[];
  onChange: (pin: SpatialPin) => void;
  onSelect: (id: string) => void;
  center?: [number, number];
}) {
  const { units } = useUnits();
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map>();
  const latest = useRef({ track, active, onChange, onSelect });
  latest.current = { track, active, onChange, onSelect };
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [snap, setSnap] = useState(false),
    snapRef = useRef(snap);
  snapRef.current = snap;
  const place = (lat: number, lng: number) => {
    const value = latest.current;
    const updated = placePhotoAtCoordinate(
      value.active,
      value.track,
      lat,
      lng,
      snapRef.current,
    );
    value.onChange(updated);
    map.current?.panTo([updated.lat, updated.lng], {
      animate: true,
      duration: 0.25,
    });
  };
  const placeRef = useRef(place);
  placeRef.current = place;
  useEffect(() => {
    if (!host.current) return;
    const initial: [number, number] = track.points.length
      ? [active.lat, active.lng]
      : (center ?? [active.lat, active.lng]);
    const instance = L.map(host.current, {
      zoomControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView(initial, 14);
    map.current = instance;
    const remove = attachMapLayer(instance, "outdoor");
    if (track.points.length > 1) {
      const route = L.polyline(
        track.points.map((p) => [p.lat, p.lng]),
        { color: "#C96E0C", weight: 4 },
      ).addTo(instance);
      instance.fitBounds(route.getBounds(), {
        padding: [25, 25],
        maxZoom: 16,
        animate: false,
      });
    }
    instance.on("click", (event: L.LeafletMouseEvent) =>
      placeRef.current(event.latlng.lat, event.latlng.lng),
    );
    instance.on("zoomend", () => setLayoutRevision((value) => value + 1));
    let removed = false;
    const observer = new ResizeObserver(() => {
      if (!removed) instance.invalidateSize({ animate: false });
    });
    observer.observe(host.current);
    return () => {
      removed = true;
      observer.disconnect();
      instance.stop();
      remove();
      instance.remove();
      map.current = undefined;
    };
  }, [track.id]);
  useEffect(() => {
    const instance = map.current;
    if (instance && !instance.getBounds().contains([active.lat, active.lng]))
      instance.panTo([active.lat, active.lng], {
        animate: true,
        duration: 0.25,
      });
  }, [active.id]);
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const group = L.layerGroup().addTo(instance);
    const occupied: L.Point[] = [];
    // Separate overlapping badges on screen; leader lines retain their exact map locations.
    [...pins]
      .sort((a, b) => Number(b.id === active.id) - Number(a.id === active.id))
      .forEach((pin) => {
        const index = pins.indexOf(pin),
          selected = pin.id === active.id;
        const actual = instance.latLngToContainerPoint([pin.lat, pin.lng]);
        let display = actual;
        if (!selected && occupied.some((p) => p.distanceTo(actual) < 48)) {
          const size = instance.getSize();
          for (let attempt = 0; attempt < 32; attempt++) {
            const angle = ((attempt % 8) * Math.PI) / 4,
              radius = 60 * (1 + Math.floor(attempt / 8));
            const candidate = L.point(
              Math.max(
                24,
                Math.min(size.x - 24, actual.x + Math.cos(angle) * radius),
              ),
              Math.max(
                24,
                Math.min(size.y - 24, actual.y + Math.sin(angle) * radius),
              ),
            );
            if (occupied.every((p) => p.distanceTo(candidate) >= 48)) {
              display = candidate;
              break;
            }
          }
        }
        occupied.push(display);
        const position = instance.containerPointToLatLng(display);
        if (display.distanceTo(actual) > 1)
          L.polyline([[pin.lat, pin.lng], position], {
            color: "#b58d49",
            weight: 1.5,
            dashArray: "3 3",
            interactive: false,
          }).addTo(group);
        const marker = L.marker(position, {
          draggable: selected,
          keyboard: true,
          bubblingMouseEvents: false,
          title: `Select moment ${index + 1}: ${pin.caption}`,
          icon: L.divIcon({
            className: selected ? "placement-pin" : "placement-other-pin",
            html: `<span>${String(index + 1).padStart(2, "0")}</span>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
        }).addTo(group);
        marker.on("click", (event: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(event.originalEvent);
          latest.current.onSelect(pin.id);
        });
        if (selected)
          marker.on("dragend", () => {
            const at = marker.getLatLng();
            placeRef.current(at.lat, at.lng);
          });
      });
    return () => {
      group.remove();
    };
  }, [active.id, active.lat, active.lng, pins, track.id, layoutRevision]);
  return (
    <div className="photo-placement">
      <p className="photo-placement-instruction" role="status">
        {active.exifSource === "gps"
          ? "📍 Placed from photo GPS · Tap anywhere on map or drag pin to move"
          : active.exifSource === "timestamp"
            ? "🕒 Placed along trail by photo time · Tap map or drag pin to adjust"
            : "👆 Tap the map where you took this photo (or drag the pin)"}
      </p>
      <div
        className="photo-placement-map"
        ref={host}
        role="application"
        aria-label="Tap map to position photo"
      />
      <output className="placement-readout" aria-live="polite">
        {active.lat.toFixed(5)}, {active.lng.toFixed(5)} ·{" "}
        {formatElevation(active.ele, units)} ·{" "}
        {formatDistance(active.cumDistKm, units)}
        {active.offTrail ? " · Off trail" : ""}
      </output>
      <div className="placement-actions">
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(event) => setSnap(event.target.checked)}
          />{" "}
          Snap to Trail
        </label>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            const at = map.current?.getCenter();
            if (at) placeRef.current(at.lat, at.lng);
          }}
        >
          Place at map center
        </button>
      </div>
    </div>
  );
}
