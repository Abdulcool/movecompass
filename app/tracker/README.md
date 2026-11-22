# Local camera tracker

`npm run build:web -w app` exports Expo and then bundles this tracker to
`app/dist/tracker.html` and `app/dist/tracker/`. The backend's existing static
serving exposes it at `/tracker.html`; no new API endpoint is needed.
`npm run build:tracker -w app` rebuilds just this page while developing.

All inference files are served locally: JS and WASM from the pinned npm
`@mediapipe/tasks-vision` dependency (Apache-2.0), plus Google's full float16 pose
model from https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task .
Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker .
No runtime CDN, camera uploads, or remote inference. HTTPS is required outside
localhost. A single person should be fully visible, with a stationary camera.
GPU initialization falls back to CPU. Stop, backgrounding, completion, and
unmount release the camera. Retry starts a new repetition session.

The page accepts `?exercise=sit-to-stand&target=6`. Messages are JSON strings on
the native WebView bridge, objects to a same-origin parent iframe on web:
`{type:'rep',reps,lastRep}`, `{type:'complete',reps,angles}`, or
`{type:'error',message}`. Completion is emitted once. `angles` maps each visible
joint to its observed max-minus-min angular ROM in degrees for the session.
The app waits for this complete message (not the preceding rep message), so
the camera completion POST includes ROM. Finish early can save counted reps
without a full-session angle summary. Manual completion remains independent.

Native requires expo-camera permission and react-native-webview; camera is not
mounted before consent. Expo camera's config plugin adds native permission text.
Native camera/WebView behavior still needs testing on actual iOS/Android hardware.

## Accuracy reproduction

Download licensed clips listed in `ACCURACY.md`, then create fake-camera input:

```
ffmpeg -i input.webm -vf 'scale=640:-2,fps=20,tpad=start_duration=5:stop_duration=30:start_mode=clone:stop_mode=clone' -pix_fmt yuv420p output.y4m
APP_URL=http://127.0.0.1:8080 node app/test/accuracy.mjs /absolute/output.y4m sit-to-stand 14 squat
```

The five-second initial freeze lets the local model load; the thirty-second end
freeze prevents wraparound while Chrome finishes rendering and collecting results.
Stop before the fake device loops. The harness launches real headless Chromium with fake media flags,
records frame-level angles/reps (not camera pixels), checks for external requests,
and saves the overlay screenshot and JSON under `~/work/`.
For the real auto-save/live-toast test, concatenate the two-squat source three
times (`ffmpeg -stream_loop 2 -i ...` with the same filter), then run
`node app/test/camera-flow.mjs /absolute/squat-six.y4m` against the served app.

These are smoke tests, not a clinical accuracy benchmark. Camera angle,
occlusion, perspective and MediaPipe confidence affect the result; rejected
repetitions must not be interpreted as proof of unsafe patient movement.
