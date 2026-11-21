# Real-video smoke checks

## Final 27-clip deterministic replay

Measured pose/harness code: **`19e69b7`** (C3), following C6 `4da5d74` and the
uncropped harness fix `d6acd8f`. The following release commit changes this report
only. No parameters were changed after this run.

All 27 **after** rows are fresh inference, not a merge of earlier results:
full model, GPU delegate, VIDEO mode, `numPoses: 3`, detection/presence/tracking
confidence 0.5, uncropped lossless frames scaled to 640px wide, deterministic
15 fps timestamps, and a three-second first-frame lead-in. The **baseline** is
frozen `984cd4c`, with one pose and no later lighting/pose fixes, using the same
corrected framing/timestamps. Its 24 supplied rows reproduce the tester's counts
exactly; the three legacy references reproduce 2/1/2.

Run: `MODE=after DELEGATE=GPU FPS=15 WORKERS=3 node app/test/accuracy2.mjs`, with
`ACCURACY_WORK=~/work/accuracy2/final-19e69b7` for isolated outputs (clips and
frame-cache directories are symlinks into the existing workspace). Retained
artifacts: `after-uncropped-640-v1-15-summary.json`, per-clip raw selected pose
traces, and `comparison.csv` there; console log `~/work/accuracy2/final-27-gpu.log`.
Verification: 27/27 results, 10,363 updates including lead-ins; largest timestamp
delta error from 1000/15 ms was 4.85e-12 ms. The run took **73.5 minutes** on this
machine. Native-rate runs were **not completed** in this pass; these results must
not be represented as native-frame-rate or real-time camera validation.

### Per clip, 15 fps

For pendulum, **true/baseline/after compare anatomical left-arm endpoint
traversals**, not full round trips. The total column includes either moving arm.
MOC and Abelson are left-only controls: their right-arm totals are reported, but
are not errors against the zero left-arm reference. Other exercises use total
counts. `—` means the separate pendulum total column does not apply.

| Clip | True | Baseline | After (pendulum: left) | Pendulum total |
|---|---:|---:|---:|---:|
| wall-angels/rehab-front.mp4 | 4 | 0 | 1 | — |
| wall-angels/insync-limited-rom.mp4 | 0 | 0 | 0 | — |
| wall-angels/saunders-oblique.mp4 | 4 | 4 | 4 | — |
| wall-angels/rehab-front-derived-dim.mp4 | 4 | 0 | 2 | — |
| seated-row/opex-side.mp4 | 4 | 0 | 3 | — |
| seated-row/vive-front.mp4 | 3 | 0 | 3 | — |
| seated-row/crossfit-oblique.mp4 | 6 | 1 | 4 | — |
| seated-row/vive-front-derived-dim.mp4 | 3 | 0 | 3 | — |
| pendulum/nhs-older-left.mp4 | 11 | 1 | 3 | 3 |
| pendulum/moc-right-arm.mp4 | 0 | 0 | 0 | 2 |
| pendulum/abelson-oblique.mp4 | 0 | 0 | 0 | 12 |
| pendulum/nhs-older-derived-crop.mp4 | 11 | 0 | 1 | 1 |
| sit-to-stand/nhs-front.mp4 | 2 | 2 | 2 | — |
| sit-to-stand/bob-brad-older.mp4 | 2 | 2 | 3 | — |
| sit-to-stand/nia-group.mp4 | 7 | 0 | 1 | — |
| sit-to-stand/bob-brad-derived-crop.mp4 | 2 | 1 | 1 | — |
| hip-shift/mission-front.mp4 | 2 | 2 | 1 | — |
| hip-shift/tutorial-front-leg-lift.mp4 | 4 | 3 | 2 | — |
| hip-shift/weiss-oblique.mp4 | 2 | 6 | 1 | — |
| hip-shift/mission-front-derived-dim.mp4 | 2 | 0 | 1 | — |
| calf-raise/mgh-side.mp4 | 4 | 0 | 4 | — |
| calf-raise/tsaog-cropped.mp4 | 2 | 0 | 0 | — |
| calf-raise/mayo-side.mp4 | 1 | 0 | 0 | — |
| calf-raise/mgh-derived-crop.mp4 | 4 | 0 | 1 | — |
| legacy/squat.webm | 2 | 2 | 2 | — |
| legacy/press.webm | 1 | 1 | 1 | — |
| legacy/shoulder.webm | 2 | 2 | 2 | — |

### Per exercise, including derived variants

Legacy clips are separated rather than double-counted in their assigned
exercise. Pendulum uses the left-arm scoring column, excluding control right-arm
totals from error. Absolute error is summed per clip, not calculated from the
aggregate signed difference; derived variants are not independent observations.

| Exercise | True | Baseline | After | Baseline absolute error | After absolute error |
|---|---:|---:|---:|---:|---:|
| Wall angels | 12 | 4 | 7 | 8 | 5 |
| Seated row | 16 | 1 | 13 | 15 | 3 |
| Pendulum (left; total after 18) | 22 | 1 | 4 | 21 | 18 |
| Sit-to-stand | 13 | 5 | 7 | 8 | 8 |
| Hip shift | 10 | 11 | 5 | 7 | 5 |
| Calf raise | 11 | 0 | 5 | 11 | 6 |
| Legacy | 5 | 5 | 5 | 0 | 0 |
| Total, scored columns | 89 | 27 | 46 | 70 | 45 |

### C3/C6 settings, selection and limitations

- C3 uses fixed wrist x relative to the same-side shoulder, divided by image-space
  shoulder width (aspect-corrected Euclidean shoulder span). There is **no rolling
  centre**. Global peak-to-peak minimum: **0.25 shoulder widths**; reversal
  hysteresis: **0.05**; minimum half-period: **800 ms**. A settled endpoint held
  within 0.01 widths for 800 ms can also confirm the traversal, so a demonstrated
  one-way traversal ending in a hold is not lost. The existing monotonic
  −0.3→+0.3 test is unchanged. Recent four-second per-arm peak-to-peak motion
  selects the moving arm with switching hysteresis; only its confirmed traversals
  increment that arm's tally. Both tallies and their sum are exposed; the tracker
  displays anatomical left/right tallies **for the current camera run**, not
  historical per-arm data. Missing wrists/shoulders suppress updates; >500 ms
  gaps interrupt excursions without erasing already counted repetitions.
- C3 still undercounts NHS badly: **3/11**, crop **1/11**. The new design is not
  an accuracy success on those clips. No further tuning was performed.
- C6's single permitted candidate, 250 ms still neutral and 0.10 hip-widths
  actual pelvis travel, was replayed on retained full-model GPU hip traces:
  Mission **1**, tutorial **2**, Weiss **1**, dim **1**. It failed the required
  Mission≥2/tutorial≥3 gates and was rejected. Retained settings are **350 ms**
  neutral, **0.15 hip-widths** travel, **800 ms** minimum repetition duration,
  neutral re-arming after every rep, and visible hips. Fresh final inference gives
  the same 1/2/1/1. This reduces Weiss false positives but remains more conservative
  than baseline on Mission/tutorial; it is not a claim of meeting those gates.
- NIA selection hint **(0.21, 0.43)** targets the woman in pink, not the instructor;
  Abelson hint **(0.34, 0.53)** targets the patient, not the coach. These hints only
  initialize the normal nearest-centroid selector; they do not change thresholds.
  First/middle/last selected-landmark evidence:
  `~/work/accuracy2/nia-selection-check-640.png` and
  `~/work/accuracy2/abelson-patient-selection-final.png`. The latter was checked
  against the final run. NIA still counts only **1/7** despite correct selection.
- Cropped calf views, Mayo side view, rehab wall angels and some rows still
  undercount; Bob/Brad has one extra count. These findings are not resolved by
  this release. This is a small supplied demonstration set, not clinical
  validation, an anatomical angle reference, or a real-time/phone benchmark.

### Supplied sources and licensing uncertainty

The tester supplied trimmed clips, annotations and derived dim/crop variants.
Source URLs below are transcribed from `clips.csv`; **licences and permission to
redistribute these 18 YouTube sources have not been verified**. No open licence
is inferred from availability. License URL: **unknown/not supplied** for each.
Derived variants inherit the same unresolved provenance. Source videos remain
outside the repository; no supplied clips are redistributed here. Legacy source
and licence URLs are documented in the original smoke-check section below.

| Source clip | Source URL |
|---|---|
| wall-angels/rehab-front | https://www.youtube.com/watch?v=cvx06snMQ3A |
| wall-angels/insync-limited-rom | https://www.youtube.com/watch?v=kcca7_JGsVk |
| wall-angels/saunders-oblique | https://www.youtube.com/watch?v=y2ZUHmx-IFY |
| seated-row/opex-side | https://www.youtube.com/watch?v=Jy-WCFAofBY |
| seated-row/vive-front | https://www.youtube.com/watch?v=ovn27-bSHj4 |
| seated-row/crossfit-oblique | https://www.youtube.com/watch?v=Y5_-YHKiXd4 |
| pendulum/nhs-older-left | https://www.youtube.com/watch?v=ykxG-EQx3dc |
| pendulum/moc-right-arm | https://www.youtube.com/watch?v=3Mjy6_yVI94 |
| pendulum/abelson-oblique | https://www.youtube.com/watch?v=vJ-hm8bzOsk |
| sit-to-stand/nhs-front | https://www.youtube.com/watch?v=jAkKklZh4aQ |
| sit-to-stand/bob-brad-older | https://www.youtube.com/watch?v=pIAzucMjibQ |
| sit-to-stand/nia-group | https://www.youtube.com/watch?v=Ev6yE55kYGw |
| hip-shift/mission-front | https://www.youtube.com/watch?v=rqYZJjVllfQ |
| hip-shift/tutorial-front-leg-lift | https://www.youtube.com/watch?v=VF99BeCbnHI |
| hip-shift/weiss-oblique | https://www.youtube.com/watch?v=fJTFzhpHulA |
| calf-raise/mgh-side | https://www.youtube.com/watch?v=nnPGrBLNlaw |
| calf-raise/tsaog-cropped | https://www.youtube.com/watch?v=dV4Yjv-gsyY |
| calf-raise/mayo-side | https://www.youtube.com/watch?v=Jh6Yl2eG8V8 |

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
