# Latse · The places we keep

Latse is a mobile hiking app with four tabs: **Trails**, **Map**, **Record**, and **Studio**. Primary screens stay inside the phone viewport. The library, editing forms, and preferences open in sheets.

## Run and verify

```sh
npm ci
npm run dev
npm run build
npx vitest run
```

Use Node.js `^22.12.0`, `^24.0.0`, or `>=26.0.0` (the supported Node ranges of the installed Vitest version). Install the isolated Chromium test browser once in PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/.artifacts/playwright-browsers"
npx playwright install chromium
npm run test:e2e
```

To check the actual production bundle after `npm run build`, set `$env:LATSE_E2E_PRODUCTION = '1'` before `npm run test:e2e`. Browser checks cover 390×844, 390×720, and 360×740 layouts, both PNG ratios, all three receipt designs, storyboard exports, private route-code round trips, the docked scrubber and ghost simulation, readable UI typography, pause-safe recording, restart, denied GPS, photo persistence across reload, storage quota/fallback failures, and standalone offline HTML replay. Screenshots and exported examples live under `.artifacts/overhaul/`. Map tiles in tests are deterministic fixtures. Native hardware still requires a device.

## Core workflow

- **Trails:** a selected journey with landscape/photo cover, direct Record and Studio actions, and a searchable library drawer with My Hikes and Inspiration. The three illustrative samples live in that drawer. Removal of a saved hike requires confirmation. Add a route by tapping 3–10 map stops, pasting a Latse code/JSON/GPX, or opening a downloaded GPX/JSON file.
- **Map:** a Leaflet map with grade-colored route, photo thumbnails, location controls, and a collapsible elevation dock. Tap a moment for Move on Map, Edit Caption, or Delete. Choose Clean Outdoor, Terrain Topo (with OSM fallback), or Satellite. Play Story pans along the route and pauses at photos; Ghost Pace remains a separately labeled reference simulation. Free Roam / Trace starts a blank map for tap or finger-drawn paths, live walking traces, and photos before a route exists. Drafts survive tab changes and reload. Saving opens the journey in Studio; switching from drawing to walking saves the sketch first and preserves any existing GPS draft.
- **Record:** active time, distance, gain, pace, vertical rate, photos, pause/resume, restart, and finish-to-Studio. Screen Wake Lock is requested while running and reacquired on visibility changes. Pocket Lock offers a dim AMOLED display, a 120px slide or 1.5-second hold to unlock, and keyboard focus trapping. A gap over three minutes and 250m during continuous recording prompts a battery-saver notice. The first accepted fix after an intentional resume is exempt. SOS uses the last recorded coordinates and altitude until a strictly newer telemetry fix arrives. One stationary fix can finish. Denied GPS still permits a timed memory with photos.
- **Studio:** Keepsake creates a printable memory. Photo Map shows the interactive route and can share a journal PNG. Edit the title, location, date, and note with the artwork visible. Design shows rendered examples of your hike. Cover works with every style and supports horizontal and vertical crop. Privacy & files includes units, endpoint privacy, HTML and GPX exports, and trail codes. Each hike's edits are saved on the device.
- **Preferences & Safety:** the header menu opens measurement settings and a link to SOS. The separate header SOS button opens location sharing and emergency information directly.

## Prints and interactive photo maps

PNG exports are 1080×1350 for posts or 1080×1920 for stories. Postcard uses a large photo on warm paper, Atlas makes the route the centerpiece, and Afterlight uses a full-bleed cover with ivory lettering. A hike without photos gets an illustrated route. The layout expands when charts or statistics are hidden or unavailable. Drawn route plans are labeled and omit estimated elevation from the print.

The photo journal gives a single photo the full width. A two- or three-photo journal uses a large lead image and smaller supporting images. The numbered photos correspond to positions on the illustrated route. Choose the lead image under Crop or edit the included photos in the album. The interactive story retains all selected photos. Endpoint privacy applies before rendering. PNG sharing uses the device share sheet when available, with browser download as a fallback.

Landscape cover art is bundled under `public/images/`, with source and photographer credits in `CREDITS.md`. DM Sans and DM Serif Display and their SIL Open Font License files live in `public/fonts/`. Covers and fonts are included in the PWA precache and Android assets.

**Trail codes** contain compact route data without photos. Another Latse user can paste the code into Add Route, open an Android `latse://route` link, or open a web-app link with a route-data query. These links require an installed app or a reachable deployment of this app; they do not publish a public photo story. Privacy trimming is applied before encoding.

**Share interactive storyboard** creates a portable HTML file. The file embeds Leaflet, the route, matched photos, note captions, a keyboard- and touch-accessible elevation chart, replay controls and a GPX download. It works offline without installing Latse; optional OpenStreetMap tiles need internet. Recipients open the HTML in a browser. Messaging apps may block HTML attachments or show only a static preview. Hosted public photo stories would require a publishing backend, which this repository does not contain.

Gallery import accepts up to ten photos per hike. Latse reads JPEG EXIF GPS and capture time before compressing images. It projects nearby GPS onto the route and uses the camera time to distinguish repeated legs. It uses wall-clock GPS fixes for time matches and honors the camera’s EXIF UTC offset when available. Without an offset, it interprets the camera clock in the device’s local time zone. A recent recording fix can locate a new camera shot. Gallery file modification times are labeled separately. A single unmatched photo starts at the scrubbed route point; unmatched batches are spread by capture order along cumulative distance. A 240px map lets users tap or drag exact positions; Snap to Trail is an explicit choice. Numbered markers select moments, and overlapping badges separate with leader lines without changing the underlying coordinates. Free-roam and distant off-trail positions remain exact. Photos added without a route outside free roam stay in the album. Raw camera coordinates stay on the device. The shared storyboard includes the selected route positions and omits exact times with endpoint privacy enabled.

## Data and platform notes

The Tuxachanie (19.3 km), Half Dome (23.8 km), and Mont Blanc Stage 1 (16.4 km) samples each have 113 meander/switchback points, Haversine-checked GPX round-trip distances, and field-note pins. Geometry, elevation, times and notes are illustrative; bring a verified track for navigation. Quick routes and hand-drawn traces connect input coordinates directly. Trace heights interpolate from a nearby selected reference route when available, otherwise retaining the prior height or zero; they are explicitly estimated, without a DEM lookup. Arbitrary provider pages are not scraped.

MI / FT and KM / M live in Preferences & Safety and Studio’s Privacy & files sheet. They are global preferences, shared by screens and exports and persisted as `latse_units_v1`. An en-US device defaults to imperial. Other languages default to metric. Domain geometry stays in kilometers and meters. npm's `package-lock.json` is the only package-manager lockfile.

Recording works while Latse is open; this is not a native background location service. Wake Lock is best effort and may be unavailable or released by the OS; Pocket Lock does not override a hardware screen lock or background suspension. Clock ticks stay in memory; GPS fixes, moment/name edits, pauses and page exit queue draft persistence. Point `time` counts active recording time; `wallTime` retains GPS capture time for photo matching. Pace uses active time including stationary intervals and excludes explicit pauses. Draft and library data are validated on restore; malformed entries are ignored rather than crashing a view.

Photos live in the `latse_media_v1` IndexedDB vault, backed by a synchronous in-memory cache. A single transaction commits media and its route document; localStorage keeps a small route index. Existing inline-photo library and draft records migrate on restore. Revision metadata chooses the newer durable copy after a failed IndexedDB write rather than resurrecting an older photo/route snapshot. When IndexedDB is unavailable, complete localStorage records provide a fallback. If both media stores exceed quota, Latse attempts to retain route/metric metadata, keeps the open draft/photos in memory, and reports that photos are not durably saved. If neither store accepts any writes, no durable save is claimed. Finish and photo-editor actions await persistence before closing. Export important hikes before clearing browser/app data; an abrupt OS termination can interrupt a queued write.

The 500m endpoint trim removes coordinates, endpoint pins and exact timestamps from exported geometry/data. Unplaced photos are excluded when trim is active because their locations cannot be verified. Short routes refuse a trim they cannot apply. Metrics describe the whole hike. Photo covers, captions and already shared copies can still reveal places; inspect the preview before sharing.

Camera and gallery decoding, torch, notifications, and Web Share availability vary by device. Solar estimates assume an open horizon.

Android sharing uses Capacitor Filesystem cache files plus Share; failures are shown without claiming a WebView download succeeded. Native export files older than 24 hours are pruned on a later export. Browser sharing falls back to download. GPS, sensors, camera/torch, notification permission and receiving-app behavior need physical-device verification.

The production manifest/service worker is generated by `vite-plugin-pwa` with automatic updates, immediate activation/client claiming, and obsolete Workbox cache cleanup. Registration bypasses the worker script’s HTTP cache, checks on foreground return, and refreshes controlled pages when an update takes over; the privacy policy is at `/privacy_policy.html`. From a fresh checkout, generate Android's web assets and plugin configuration after `npm ci`.

```sh
npm run build
npx cap sync android
```

The four primary screens and the SOS sheet load as separate chunks. Android asset synchronization and a debug build verify packaging. Native GPS, camera, and sharing require physical-device testing.
