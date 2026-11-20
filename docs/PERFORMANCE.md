# Tracker preparation and login bundle

## Full-model preparation (G1/G2)

The full model remains the default. A dedicated worker streams compilation while
the assets download, reuses the compiled module for instantiation, and initializes
the detector during the consent screen. Camera permission is requested only after
Start. Download progress occupies 0–80%; compilation/model creation remain visible
as preparation phases, and 100% is reached only after the first detection.

GPU creation and the first GPU detection each have a seven-second deadline. A
stalled worker is terminated before trying CPU. Browsers without OffscreenCanvas
retain a compatible main-thread CPU path; synchronous initialization on those older
browsers cannot be preempted. There is no model downgrade. Inference follows decoded
video frames, with one request in flight; unchanged screen-pixel skeletons are not
redrawn. This does not skip pose processing based on movement or joint angles.

A localhost Chromium/SwiftShader probe, while five other accuracy jobs were running,
using the real full model and the legacy press clip as a virtual camera, measured:

| Phase | Time |
|---|---:|
| Asset reads (local, cached/loopback) | 188.2 ms |
| Streaming WASM compilation, overlapping download | 151.6 ms |
| WASM instantiation | 4.6 ms |
| GPU context creation | 5.1 ms |
| GPU `createFromOptions`, including instantiation and graph/delegate setup | 240.3 ms |
| Total preparation | 433.7 ms |
| First detection, including lazy GPU work | 3631.0 ms |

Phases overlap; do not sum the rows. MediaPipe does not expose a separate TFLite
GPU-delegate-only timer, so it is included in `createFromOptions`. This is not a
phone, cold-network, or public-server benchmark, nor a reproduction of the tester's
28-second delay. Per-run timings are exposed through `movecompass:init` events.

## Login entry audit (G3)

The production entry source map contains framework bootstrap, React DOM, React Native
Web, Expo Router, navigation, and its route context. It contains no Three.js,
MediaPipe, pose engine, body scene, or application-screen implementation. Those are
already separate route/asset chunks. The React DOM source is the largest framework
module; navigation/list/animation infrastructure accounts for much of the remainder.
Further splitting would require framework/bundler changes rather than a cheap,
application-local lazy import, so no speculative build-configuration change was made.

| Entry | Raw bytes | Brotli bytes |
|---|---:|---:|
| Previously deployed | 1,121,277 | 233,630 |
| Audit export, including source-map URL | 1,121,414 | 233,712 |

There is **no claimed entry-size reduction**. Route chunks, including the roughly
495 KB tab-navigation/icon chunk, are not part of that entry. Source maps used for
the audit are local diagnostic artifacts, not required for deployment.
