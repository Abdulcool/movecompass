# MoveCompass

Your next safe step. Cross-platform (iOS, Android, web) exercise companion with camera-based joint-angle tracking.

Use Node 22 (`nvm use`), then `npm install` (Expo SDK 58 requires Node 22.13+).
Run `npm test -w packages/pose` and `npm run typecheck`.

`packages/pose` is a DOM-free TypeScript tracking engine shared by future camera
surfaces. The backend is in `server`; the Expo app is in `app`. Camera tracking
uses a local MediaPipe page. The Plan includes a realistic CC0 human body selector;
firmware is not implemented yet.

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
