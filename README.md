# MoveCompass

Your next safe step. Cross-platform (iOS, Android, web) exercise companion with camera-based joint-angle tracking.

Use Node 20 (`nvm use`), then `npm install`.
Run `npm test -w packages/pose` and `npm run typecheck`.

`packages/pose` is a DOM-free TypeScript tracking engine shared by future camera
surfaces. No backend, app, or firmware is implemented yet.

`createTracker(id).update(frame)` accepts one MediaPipe pose (flat or nested arrays),
timestamps in milliseconds and image dimensions. World-space angles are preferred;
image fallback corrects aspect ratio. Missing visibility or invalid joints produce
null. Mirror only the selfie overlay, not the input coordinates.

Only full-range, sufficiently slow, form-correct cycles increment reps. Incomplete
returns and too-fast cycles produce a partial `lastRep` with metric ROM and feedback.
Pendulums count one amplitude-qualified side-to-side swing using the left arm;
hip shifts count excursion-to-center on either side. Sit-to-stand counts on returning
to standing (starting seated is supported). Calf raises require one second of still
standing to calibrate a median baseline. Tracking gaps over 500 ms discard in-flight
movement to avoid phantom reps. Call `reset()` for a new session or participant.

Exercise instructions and dosage preserve the original copy; angle guides use the
new design thresholds. Thresholds and synthetic tests are not clinical validation.
