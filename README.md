# MoveCompass

Your next safe step. Cross-platform (iOS, Android, web) exercise companion with camera-based joint-angle tracking.

## Quick start: no-code board setup

1. Open MoveCompass in Chrome or Edge on a desktop and sign in with your care team's staff account.
2. In Device settings, register a NodeMCU ESP8266 for the patient's email. Keep the six-digit pairing code (valid once, for 15 minutes).
3. Open **USB device flasher** (`/flash.html`), connect the board with a USB data cable, choose its port and install.
4. Join **MoveCompass-Setup** WiFi on your phone, then open `http://192.168.4.1` if the portal does not open itself.
5. Select home 2.4 GHz WiFi; enter its password, the MoveCompass server address shown by the flasher and the pairing code. Save. The LED turns off when connected.
6. Complete a set as the patient. Their board flashes five times and holds for three seconds.

No source edits, WiFi passwords in code or patient-ID copying are needed.
See [board setup and advanced development](firmware/esp8266/README.md) for drivers,
wiring, recovery and local compilation. Hardware operation still needs verification on a physical board.

## Advanced development

Use Node 22 (`nvm use`), then `npm install` (Expo SDK 58 requires Node 22.13+).
Run `npm test -w packages/pose` and `npm run typecheck`.

`packages/pose` is a DOM-free TypeScript tracking engine shared by future camera
surfaces. The backend is in `server`; the Expo app is in `app`. Camera tracking
uses a local MediaPipe page. The Plan includes a realistic CC0 human body selector.
[NodeMCU ESP8266 firmware and virtual device](firmware/esp8266/README.md) provide
patient-matched LED/buzzer completion alerts.

`createTracker(id).update(frame)` accepts one MediaPipe pose (flat or nested arrays),
timestamps in milliseconds and image dimensions. World-space angles are preferred;
image fallback corrects aspect ratio. Missing visibility or invalid joints produce
null. Mirror only the selfie overlay, not the input coordinates.

Full-range, sufficiently slow cycles increment reps even when form needs attention.
Form warnings produce a counted `lastRep` with quality `form-note` and coaching
feedback. Incomplete returns and too-fast cycles produce an uncounted `partial`
rep; the minimum duration is retained as an anti-jitter debounce. Wall angels use
the better-tracked arm when confidence differs materially, otherwise averaging
even arms or using the higher lift when uneven. The 20° symmetry threshold is a
directional form note, never a completion veto.
Pendulums count one amplitude-qualified side-to-side swing using the left arm;
hip shifts count excursion-to-center on either side. Sit-to-stand counts on returning
to standing (starting seated is supported). Calf raises require one second of still
standing to calibrate a median baseline. Tracking gaps over 500 ms discard in-flight
movement to avoid phantom reps. Call `reset()` for a new session or participant.

Exercise instructions and dosage preserve the original copy; angle guides use the
new design thresholds. Thresholds and synthetic tests are not clinical validation.

## Backend

`npm run dev -w server` starts HTTP + WebSocket on port 8080.
`npm run build -w server && npm start -w server` runs the compiled server.
Run `npm test -w server` for isolated SQLite + real WebSocket integration tests.
See [server/README.md](server/README.md) for the API contract and configuration.

`docker build -t movecompass .` builds the server and exports the Expo web app
when `app/package.json` exists. Render's blueprint mounts a persistent disk at `/var/data`.
This is demo infrastructure: rotate seed passwords, disable unregistered devices,
and add deployment-specific abuse controls before handling real patient data.

## App shell (Expo SDK 58)

`npm run build:web -w app` exports `app/dist`. Start the server with an absolute
`WEB_DIST` pointing to that directory, then open port 8080. Web uses same-origin
HTTP and WebSocket requests. Native uses `EXPO_PUBLIC_API_URL` or the URL saved in
Settings; use a reachable HTTPS host, not your phone's localhost.
`npm start -w app` starts Expo for native development. Auth uses AsyncStorage
(localStorage on web); device keys are only shown after registration, not persisted.

Profile (or the staff dashboard) enables notifications on explicit request.
Remote native push requires a real device, an EAS project ID under
`expo.extra.eas.projectId`, and an appropriate development/production build.
Without that ID, local native notifications still work after permission is granted.
`BodyPicker` uses a shared R3F scene directly on web and in `/body.html` on native
through WebView (no native GL module). Drag to rotate; pinch/scroll to zoom. Chips
remain available when WebGL is unavailable. The GLB is bundled locally; see
[asset credits](docs/CREDITS.md). `PoseTracker` embeds the locally bundled
MediaPipe page in a web iframe or a permission-gated native WebView. Manual
completion remains available. See [camera setup and reproduction](app/tracker/README.md)
and [measured accuracy limitations](app/tracker/ACCURACY.md) before patient use.

Run `npm test -w app` for API client tests. With the exported app served by the
backend, run `APP_URL=http://127.0.0.1:8080 npm run test:e2e -w app` for the real
two-session browser check. It writes screenshots to `~/work/shots` by default.
Use a fresh demo database: the test expects an empty inbox and records activities.
