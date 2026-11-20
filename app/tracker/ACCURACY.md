# Real-video smoke checks

Ground truth was determined by visually inspecting chronological frames, not by
using the pose counter as the reference. Chromium used fake getUserMedia with
640-pixel-wide, 20 fps YUV420P Y4M conversions. Each clip had a five-second frozen
first frame for model warm-up and a thirty-second frozen last frame. The original
movement speed was preserved. No camera frames were uploaded. Request recording
found no off-origin network requests during inference.

| Source / license | Segment and visually observed repetitions | Tracker exercise | Counted | Measured angular range |
|---|---|---|---|---|
| FitnessScape, [Squat — exercise demonstration](https://commons.wikimedia.org/wiki/File:Squat_-_exercise_demonstration_video.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Entire 7.1 s; 2 stand–squat–stand cycles | sit-to-stand | 2 | Right knee 67.5–173.3°; left (more occluded) 120.3–178.3° |
| CDC, [Muscle Strengthening at Home — Overhead Press](https://commons.wikimedia.org/wiki/File:Muscle_Strengthening_at_Home_-_Overhead_Press.webm), US government public domain | 17–26 s; 1 complete raise/lower plus an unfinished raise | wall-angels | 1 | Left shoulder 51.7–169.1°; right 52.9–168.0° |
| FitnessScape, [Shoulder press — exercise demonstration](https://commons.wikimedia.org/wiki/File:Shoulder_press_-_exercise_demonstration_video.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Entire 6.9 s; 2 top–lower–top cycles | wall-angels | **0 (2 partial attempts)** | Left shoulder 76.6–155.5°; right 79.5–176.6° |

The squat first counted **0/2**: the old best-side selector preferred any visible
left knee even when the other knee had substantially higher confidence. Frame
logs showed bottom-position left confidence ~0.63–0.72 vs right ~0.87–0.91.
Selecting the higher-confidence valid joint corrected this without loosening
the 105°/160° knee thresholds. A synthetic regression test covers both choices
and null-side fallback for knees/elbows.

**The third clip remains a false-negative limitation.** The 3D shoulder estimates
disagreed by up to ~23.9°, beyond the current 20° symmetry gate. Both attempted
cycles reached the range thresholds but were marked partial with “Move both
arms evenly.” The stricter check was retained rather than widened merely to fit
one camera angle. These are overhead presses, not actual wall slides; success
on one is not validation of the other. The clips test knee/shoulder movement
paths, not all six exercises or varied patients/cameras.

Raw sources, contact sheets, Y4M inputs and frame/result JSON are retained under
`~/work/accuracy/` in the development environment; third-party videos are not
redistributed in this repository. The harness and exact conversion filter are
in `README.md` alongside this file. Overlay evidence: `~/work/shots/squat-overlay.png`
and `~/work/shots/press-overlay.png`.

This is not a clinical accuracy claim. In particular, a rejected repetition or
a symmetry warning is not evidence that the patient's real movement was unsafe.
