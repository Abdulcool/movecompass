# Real-video smoke checks

## Full versus lite after downscaling

Full remains the default: **lite fails the ≤3° p95 requirement** despite matching
counts. Comparison uses identical lossless PNGs extracted from the original
bounded Y4Ms at 10 fps, 320px wide, including the five-second warm-up. Both models
use VIDEO mode, GPU, the same timestamps and the shared smoothed angle engine.
Differences include only frames where both joints are visible; they compare model
estimates, not error against anatomical ground truth. Exact frames/results remain
in `~/work/accuracy/compare-*-frames.json`; run `app/test/model-comparison.mjs`.

| Clip | True | Full | Lite | Joint | Paired frames | Median difference | p95 difference |
|---|---:|---:|---:|---|---:|---:|---:|
| Squat | 2 | 2 | 2 | Left knee | 118 | 3.23° | 47.61° |
| Squat | 2 | 2 | 2 | Right knee | 122 | 1.71° | 8.39° |
| CDC press | 1 + unfinished raise | 1 | 1 | Left shoulder | 116 | 5.06° | 7.74° |
| CDC press | 1 + unfinished raise | 1 | 1 | Right shoulder | 124 | 8.01° | 16.71° |
| CDC press | 1 + unfinished raise | 1 | 1 | Left elbow | 140 | 12.79° | 17.74° |
| CDC press | 1 + unfinished raise | 1 | 1 | Right elbow | 140 | 18.80° | 20.89° |
| Shoulder press | 2 | 2 | 2 | Left shoulder | 116 | 14.86° | 27.08° |
| Shoulder press | 2 | 2 | 2 | Right shoulder | 120 | 4.87° | 10.29° |
| Shoulder press | 2 | 2 | 2 | Left elbow | 104 | 10.17° | 15.02° |
| Shoulder press | 2 | 2 | 2 | Right elbow | 120 | 6.07° | 18.74° |

Final full-model fake-getUserMedia checks independently counted **2, 1, 2** at
320px with adaptive cadence, retaining the CDC unfinished-raise rejection. Logs:
`~/work/accuracy/final-full-{squat,press,shoulder}.log`.

Only one WASM loader/binary variant is shipped. Content-hashed immutable assets
total 24,400,538 decoded bytes, **10,791,602 Brotli bytes**. Login entry before:
1,120,910 raw bytes; after: 1,121,053 raw / **233,447 Brotli bytes**. Scene loading
is lazy, but Expo's already route-split core entry did not shrink in raw size.
Compression reduces its transfer by 79.2%; do not claim a raw entry-size win.

## Earlier reference results

Ground truth was determined by visually inspecting chronological frames, not by
using the pose counter as the reference. Chromium used fake getUserMedia with
640-pixel-wide, 20 fps YUV420P Y4M conversions. Each clip had a five-second frozen
first frame for model warm-up and a thirty-second frozen last frame. The original
movement speed was preserved. No camera frames were uploaded. Request recording
found no off-origin network requests during inference.

| Source / license | Segment and visually observed repetitions | Tracker exercise | Counted | Measured angular range |
|---|---|---|---|---|
| FitnessScape, [Squat — exercise demonstration](https://commons.wikimedia.org/wiki/File:Squat_-_exercise_demonstration_video.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Entire 7.1 s; 2 stand–squat–stand cycles | sit-to-stand | 2 | Right knee 66.2–173.7°; left (more occluded) 123.7–177.8° |
| CDC, [Muscle Strengthening at Home — Overhead Press](https://commons.wikimedia.org/wiki/File:Muscle_Strengthening_at_Home_-_Overhead_Press.webm), US government public domain | 17–26 s; 1 complete raise/lower plus an unfinished raise | wall-angels | 1 | Left shoulder 51.4–169.7°; right 52.4–170.6° |
| FitnessScape, [Shoulder press — exercise demonstration](https://commons.wikimedia.org/wiki/File:Shoulder_press_-_exercise_demonstration_video.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Entire 6.9 s; 2 top–lower–top cycles | wall-angels | **2 (both with form notes)** | Left shoulder 90.0–156.0°; right 83.0–177.3° |

The squat first counted **0/2**: the old best-side selector preferred any visible
left knee even when the other knee had substantially higher confidence. Frame
logs showed bottom-position left confidence ~0.63–0.72 vs right ~0.87–0.91.
Selecting the higher-confidence valid joint corrected this without loosening
the 105°/160° knee thresholds. A synthetic regression test covers both choices
and null-side fallback for knees/elbows.

The third clip previously counted **0/2** because asymmetry vetoed complete cycles.
The 20° threshold now produces a directional quality note, not rejection. The
arm metric uses the higher-confidence visible arm when confidence differs by
more than 0.15; otherwise it averages arms within 20° or follows the higher lift.
Both shoulder-press repetitions now count with quality `form-note` and feedback
“Left arm lower than right — try to lift evenly.” The CDC unfinished raise remains
uncounted. All form checks are advisory across exercises; genuine partial ROM,
tracking-loss interruption, and anti-jitter minimum-duration checks remain.

These are overhead presses, not actual wall slides; success on one is not
validation of the other. The clips test knee/shoulder movement paths, not all six
exercises or varied patients/cameras.

Raw sources, contact sheets, Y4M inputs and frame/result JSON are retained under
`~/work/accuracy/` in the development environment; third-party videos are not
redistributed in this repository. The harness and exact conversion filter are
in `README.md` alongside this file. Updated run logs and frame JSON use the
`asym-squat`, `asym-press`, and `asym-shoulder` prefixes. Updated overlay evidence:
`~/work/shots/asym-squat-overlay.png`, `~/work/shots/asym-press-overlay.png`, and
`~/work/shots/asym-shoulder-overlay.png`.

This is not a clinical accuracy claim. In particular, a rejected repetition or
a symmetry warning is not evidence that the patient's real movement was unsafe.
