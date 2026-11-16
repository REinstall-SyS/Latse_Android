import { useUnits } from "@/hooks/useUnits";
import {
  formatDistance,
  formatElevation,
  formatPace,
  formatVertRate,
} from "@/domain/units";
import React, { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Phone, Send, Share2, Sun } from "lucide-react";
import type { HikeTrack } from "@/types/trek.types";
import {
  EMERGENCY_CONTACTS,
  suggestEmergencyContact,
} from "@/data/emergency.data";
import { calculateDaylightRemaining } from "@/domain/altitude-physics";
import { formatCoordinates } from "@/domain/geospatial";
import { openSMS, shareText } from "@/services/hardware.service";

interface EmergencyViewProps {
  userLocation: [number, number] | null;
  currentAltitude: number | null;
  track: HikeTrack;
  onBack?: () => void;
  onLocate?: () => void;
}

export function EmergencyView({
  userLocation,
  currentAltitude,
  track,
  onBack,
  onLocate,
}: EmergencyViewProps) {
  const { units } = useUnits();
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const routePoint = track.points[0];
  const location =
    userLocation ?? (routePoint ? [routePoint.lat, routePoint.lng] : null);
  const suggested = location
    ? suggestEmergencyContact(location[0], location[1])
    : null;
  const contacts = [
    ...(suggested ? [suggested] : []),
    ...EMERGENCY_CONTACTS.filter(
      (contact) => contact.number !== suggested?.number,
    ),
  ];
  const coords = userLocation ? formatCoordinates(...userLocation) : null;
  const daylight = location
    ? calculateDaylightRemaining(location[0], location[1], now)
    : null;
  const mapsLink = userLocation
    ? `https://maps.google.com/?q=${userLocation[0]},${userLocation[1]}`
    : "";

  const packet = (emergency: boolean) =>
    [
      emergency
        ? "[LATSE SAR COORDINATES — ASSISTANCE REQUESTED]"
        : "[LATSE TRAIL SAFETY CHECK-IN]",
      emergency
        ? "I need assistance at my current location."
        : "Checking in from the trail. Please keep this location and route for reference.",
      `TRAIL: ${track.name}`,
      `DECIMAL: ${coords?.decimal ?? "Live GPS unavailable"}`,
      `DMS: ${coords?.dms ?? "Live GPS unavailable"}`,
      `ELEVATION: ${currentAltitude === null ? "Unknown" : `${formatElevation(currentAltitude, units)}`}`,
      `DAYLIGHT: ${daylight ? `${daylight.daylightRemainingMin} min remaining; sunset ${daylight.sunsetTimeStr}` : "Location unavailable"}`,
      `MAP: ${mapsLink || "Acquire a live GPS fix to create a location link."}`,
      `TIME: ${new Date().toISOString()}`,
    ].join("\n");

  const share = async (emergency: boolean) => {
    const success = await shareText(
      packet(emergency),
      emergency ? "Latse SAR coordinates" : "Latse trail check-in",
    );
    setNotice(
      success
        ? "Safety packet shared or copied."
        : "Sharing is unavailable. Try the SMS action.",
    );
  };

  return (
    <div className="view-page safety-view">
      {onBack && (
        <button className="text-btn safety-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back to settings
        </button>
      )}
      <p className="eyebrow">Stay connected outdoors</p>
      <h1 className="page-title">
        SOS & trailhead
        <br />
        <em>safety beacon.</em>
      </h1>
      <p className="muted">
        Share a clear location with your contact or rescue team. Calls and SMS
        require a cellular connection.
      </p>

      <section className="safety-card">
        <div className="safety-heading">
          <MapPin size={20} />
          <h2>Your trail position</h2>
        </div>
        <p className="safety-coordinate">
          {coords?.decimal ?? "Acquire your live GPS location"}
        </p>
        <p className="muted">
          {coords?.dms ??
            "The selected route is used only to suggest a regional emergency number."}
        </p>
        <dl className="safety-readout">
          <div>
            <dt>Elevation</dt>
            <dd>
              {currentAltitude === null
                ? "Unknown"
                : `${formatElevation(currentAltitude, units)}`}
            </dd>
          </div>
          <div>
            <dt>Daylight margin</dt>
            <dd>
              {daylight ? `${daylight.daylightRemainingMin} min` : "Unknown"}
            </dd>
          </div>
        </dl>
        <p className="muted safety-sunset">
          <Sun size={16} /> Sunset {daylight?.sunsetTimeStr ?? "unknown"} ·
          estimated open horizon
        </p>
        {!userLocation && (
          <button className="primary-btn w-full" onClick={onLocate}>
            Acquire GPS fix
          </button>
        )}
        {mapsLink && (
          <a
            className="secondary-btn safety-map-link"
            href={mapsLink}
            target="_blank"
            rel="noreferrer"
          >
            Open location in Maps ↗
          </a>
        )}
      </section>

      <section className="safety-card">
        <h2>One-tap safety check-in</h2>
        <p className="muted">
          Send your coordinates, elevation, daylight margin, and map link to
          someone you trust.
        </p>
        <div className="safety-actions">
          <button
            className="primary-btn"
            disabled={!userLocation}
            onClick={() => openSMS(packet(false))}
          >
            <Send size={17} /> SMS check-in
          </button>
          <button
            className="secondary-btn"
            disabled={!userLocation}
            onClick={() => void share(false)}
          >
            <Share2 size={17} /> Share check-in
          </button>
          <button
            className="secondary-btn"
            disabled={!userLocation}
            onClick={() => openSMS(packet(true))}
          >
            SMS SAR packet
          </button>
          <button
            className="secondary-btn"
            disabled={!userLocation}
            onClick={() => void share(true)}
          >
            Share SAR packet
          </button>
        </div>
        <p className="muted">
          Choose the recipient in your messaging app. This does not
          automatically contact emergency services.
        </p>
        {notice && <p role="status">{notice}</p>}
      </section>

      <section className="safety-card">
        <h2>Emergency dial shortcuts</h2>
        <p className="muted">
          {suggested
            ? `Suggested region: ${suggested.region}, from ${userLocation ? "GPS" : "the selected trail"}.`
            : "No location available. Choose your local service."}{" "}
          Offline regional estimates can cross borders; choose the correct local
          service.
        </p>
        <div className="emergency-dial-grid">
          {contacts.map((contact) => (
            <a
              key={contact.number}
              href={`tel:${contact.number}`}
              className={
                contact.number === suggested?.number
                  ? "dial-pill suggested"
                  : "dial-pill"
              }
            >
              <Phone size={18} />
              <strong>{contact.number}</strong>
              <span>{contact.region}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
