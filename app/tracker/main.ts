import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { createTracker, getExercise, joints, visible } from "@movecompass/pose";
import { angleSummary, relevantJoints, rangeProgress } from "./metrics";
import { setProgress } from './progress';
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}
const video = document.querySelector<HTMLVideoElement>("#video")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const ctx = canvas.getContext("2d")!;
const el = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
let seedAngles: Record<string,number> = {};
try { const seed=JSON.parse(params.get('angles')||'{}');if(seed && typeof seed==='object' && !Array.isArray(seed) && Object.values(seed).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=360))seedAngles=seed; } catch {}
const progress = setProgress(Number(params.get('reps')||0),seedAngles);
let lastEmit = 0;
let pose: PoseLandmarker | undefined,
  stream: MediaStream | undefined,
  raf = 0,
  stopped = false,
  completed = false;
let generation = 0,
  lastTime = -1,
  lastReps = progress.value().reps;
  progress.begin();
function emit(message: unknown) {
  const serialized = JSON.stringify(message);
  if (window.ReactNativeWebView)
    window.ReactNativeWebView.postMessage(serialized);
  else if (window.parent !== window)
    window.parent.postMessage(message, location.origin);
}
function stop() {
  stopped = true;
  generation++;
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  pose?.close();
  pose = undefined;
  video.srcObject = null;
}
function fail(error: unknown) {
  stop();
  const message = error instanceof Error ? error.message : String(error);
  el("error").textContent = message;
  el("error").hidden = false;
  el("retry").hidden = false;
  el("phase").textContent = "Camera unavailable";
  emit({ type: "error", message });
}
el("stop").onclick = () => {
  stop();
  el("phase").textContent = "Camera stopped";
  el("retry").hidden = false;
};
el("retry").onclick = () => void start();
window.addEventListener("pagehide", stop);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
    el("phase").textContent = "Camera paused";
    el("retry").hidden = false;
  }
});
async function start() {
  stop();
  const run = ++generation;
  stopped = false;
  completed = false;
  lastTime = -1;
  lastReps = 0;
  el("error").hidden = true;
  el("retry").hidden = true;
  try {
    const exercise = getExercise(params.get("exercise") || "sit-to-stand");
    const rawTarget = params.get("target");
    const target = rawTarget === null ? exercise.reps : Number(rawTarget);
    if (!Number.isInteger(target) || target < 1 || target > 100)
      throw new Error("Choose a target between 1 and 100 reps.");
    el("name").textContent = exercise.name;
    el("counter").textContent = `${lastReps} / ${target}`;
    emit({ type: "rep", ...progress.value() });
    el("phase").textContent = "Loading local pose model…";
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error("Camera access needs HTTPS (or localhost).");
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (run !== generation) {
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = media;
    video.srcObject = media;
    await video.play();
    const files = await FilesetResolver.forVisionTasks("/tracker/wasm");
    const options = {
      baseOptions: {
        modelAssetPath: "/tracker/pose_landmarker_full.task",
        delegate: "GPU" as "GPU" | "CPU",
      },
      runningMode: "VIDEO" as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    let detector: PoseLandmarker;
    try {
      detector = await PoseLandmarker.createFromOptions(files, options);
    } catch {
      detector = await PoseLandmarker.createFromOptions(files, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: "CPU" },
      });
    }
    if (run !== generation) {
      detector.close();
      return;
    }
    pose = detector;
    const tracker = createTracker(exercise.id),
      summary = angleSummary(),
      keys = relevantJoints(exercise.id);
    function frame() {
      if (stopped || run !== generation || !pose) return;
      try {
        if (video.readyState >= 2 && video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          const timestampMs = performance.now();
          const result = pose.detectForVideo(video, timestampMs);
          const output = tracker.update({
            landmarks: result.landmarks,
            worldLandmarks: result.worldLandmarks,
            timestampMs,
            width: video.videoWidth,
            height: video.videoHeight,
          });
          const points = result.landmarks[0] || [];
          summary.update(output.angles);
          const current = progress.update(output.reps,summary.value());
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const x = (n: number) => (1 - n) * canvas.width,
            y = (n: number) => n * canvas.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#9FD8BE";
          ctx.fillStyle = "#E78367";
          for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
            const a = points[start],
              b = points[end];
            if (visible(a) && visible(b)) {
              ctx.beginPath();
              ctx.moveTo(x(a.x), y(a.y));
              ctx.lineTo(x(b.x), y(b.y));
              ctx.stroke();
            }
          }
          for (const p of points) {
            if (visible(p)) {
              ctx.beginPath();
              ctx.arc(x(p.x), y(p.y), 4, 0, 2 * Math.PI);
              ctx.fill();
            }
          }
          ctx.font = `bold ${Math.max(14, canvas.width / 60)}px system-ui`;
          const labels: {left:number;top:number;width:number}[] = [];
          for (const key of keys) {
            const angle = output.angles[key];
            const joint = key === "trunkLean" ? 23 : joints[key][1];
            const p = points[joint];
            if (angle !== null && visible(p)) {
              const label = `${key.replace("left", "L ").replace("right", "R ")} ${Math.round(angle)}°`;
              const width = ctx.measureText(label).width;
              const left = Math.max(
                0,
                Math.min(canvas.width - width - 8, x(p.x) + 8),
              );
              const anchor = Math.max(26, Math.min(canvas.height - 4, y(p.y)));
              let top = anchor;
              for (let step = 0; step <= keys.length * 2; step++) {
                const offset = Math.ceil(step / 2) * 32 * (step % 2 ? 1 : -1);
                const candidate = Math.max(26, Math.min(canvas.height - 4, anchor + offset));
                if (!labels.some(box => left < box.left + box.width + 6 && left + width + 6 > box.left && Math.abs(candidate - box.top) < 30)) {top = candidate;break;}
              }
              labels.push({left, top, width});
              ctx.fillStyle = "#13231Fee";
              ctx.fillRect(left - 3, top - 23, width + 6, 28);
              ctx.fillStyle = "white";
              ctx.fillText(label, left, top);
            }
          }
          const low =
            output.metric === null ||
            keys.some((key) => output.angles[key] === null);
          el("counter").textContent = `${current.reps} / ${target}`;
          el("phase").textContent = output.phase;
          el("feedback").textContent = output.feedback;
          el("visibility").textContent = low
            ? "Low visibility — step back so your whole body is in view"
            : "";
          const progress = rangeProgress(output.metric, exercise.tracking);
          el("progress").style.width = `${progress}%`;
          document
            .querySelector(".bar")!
            .setAttribute("aria-valuenow", String(Math.round(progress)));
          el("range").textContent =
            `${exercise.tracking.targetRangeLabel} · metric ${output.metric === null ? "—" : output.metric.toFixed(2)}`;
          el("rom").textContent = output.lastRep
            ? `Last rep: ${output.lastRep.quality} · ROM ${output.lastRep.rom.toFixed(1)} · ${Math.round(output.lastRep.durationMs)} ms`
            : "Complete a controlled movement to see your range of motion.";
          window.dispatchEvent(
            new CustomEvent("movecompass:frame", {
              detail: { timestampMs, ...output, reps:current.reps },
            }),
          );
          if (current.reps !== lastReps || timestampMs-lastEmit>=500) {
            lastReps = current.reps;lastEmit=timestampMs;
            emit({ type: "rep", ...current, lastRep: output.lastRep });
          }
          if (current.reps >= target && !completed) {
            completed = true;
            emit({
              type: "complete",
              ...current,
            });
            el("feedback").textContent = "Target reached. Well done!";
            stop();
            return;
          }
        }
        raf = requestAnimationFrame(frame);
      } catch (error) {
        fail(error);
      }
    }
    raf = requestAnimationFrame(frame);
  } catch (error) {
    if (run === generation) fail(error);
  }
}
void start();
