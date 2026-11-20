import { PoseLandmarker } from "@mediapipe/tasks-vision";
import { createTracker, getExercise, joints, visible } from "@movecompass/pose";
import { angleSummary, relevantJoints, rangeProgress } from "./metrics";
import { setProgress } from './progress';
import { cameraGuidance } from '../src/camera-errors';
import {createPersonSelector} from './person';
import {enhanceDimFrame} from './lighting';
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}
const video = document.querySelector<HTMLVideoElement>("#video")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const ctx = canvas.getContext("2d")!;
const el = (id: string) => document.getElementById(id)!;
declare const __TRACKER_ASSETS__:{base:string;sizes:Record<string,number>};
async function loadAssets(){
  const received:Record<string,number>={},total=Object.values(__TRACKER_ASSETS__.sizes).reduce((a,b)=>a+b,0);
  const result=await Promise.all(Object.keys(__TRACKER_ASSETS__.sizes).map(async name=>{
    const response=await fetch(`${__TRACKER_ASSETS__.base}/${name}`);if(!response.ok)throw new Error('Tracker download failed. Please try again.');
    const reader=response.body?.getReader(),chunks:Uint8Array[]=[];received[name]=0;
    if(!reader){const buffer=await response.arrayBuffer();return [name,name.endsWith('.task')?new Uint8Array(buffer):undefined] as const;}
    while(true){const {done,value}=await reader.read();if(done)break;received[name]+=value.length;if(name.endsWith('.task'))chunks.push(value);
      const percent=Math.min(100,Math.round(Object.values(received).reduce((a,b)=>a+b,0)/total*100));el('download').textContent=`Preparing local tracker · ${percent}%`;el('download-progress').setAttribute('value',String(percent));}
    if(!name.endsWith('.task'))return [name,undefined] as const;
    const model=new Uint8Array(received[name]);let offset=0;for(const chunk of chunks){model.set(chunk,offset);offset+=chunk.length;}return [name,model] as const;
  }));
  return result.find(([name])=>name.endsWith('.task'))![1]!;
}
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
function emit(message: unknown) {
  const serialized = JSON.stringify(message);
  if (window.ReactNativeWebView)
    window.ReactNativeWebView.postMessage(serialized);
  else if (window.parent !== window)
    window.parent.postMessage(message, location.origin);
}
new ResizeObserver(()=>emit({type:'resize',height:document.querySelector('main')!.scrollHeight+32})).observe(document.querySelector('main')!);
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
  const message = cameraGuidance(error);
  el('feedback').textContent='';el('visibility').textContent='';el('range').textContent='';
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
  progress.begin();lastReps = progress.value().reps;
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
    el('download').hidden=false;el('download-progress').hidden=false;
    const modelAssetBuffer=await loadAssets();
    const files={wasmLoaderPath:`${__TRACKER_ASSETS__.base}/vision_wasm_internal.js`,wasmBinaryPath:`${__TRACKER_ASSETS__.base}/vision_wasm_internal.wasm`};
    const options = {
      baseOptions: {
        modelAssetBuffer,
        delegate: "GPU" as "GPU" | "CPU",
      },
      runningMode: "VIDEO" as const,
      numPoses: 3,
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
    el('download').hidden=true;el('download-progress').hidden=true;
    const tracker = createTracker(exercise.id),
      summary = angleSummary(),
      keys = relevantJoints(exercise.id);
    const hint=params.get('person')?.split(',').map(Number);
    const selector=createPersonSelector(hint?.length===2&&hint.every(Number.isFinite)?{x:hint[0],y:hint[1]}:params.get('person')==='auto'?'largest':undefined);
    let currentPeople:Parameters<typeof selector.update>[0]=[];
    canvas.onclick=event=>{
      const rect=canvas.getBoundingClientRect(),scale=Math.min(rect.width/canvas.width,rect.height/canvas.height);
      const width=canvas.width*scale,height=canvas.height*scale;
      const x=1-(event.clientX-rect.left-(rect.width-width)/2)/width,y=(event.clientY-rect.top-(rect.height-height)/2)/height;
      if(x>=0&&x<=1&&y>=0&&y<=1&&selector.choose(currentPeople,{x,y})){tracker.reset();progress.begin();}
    };
    const input=document.createElement('canvas'),inputContext=input.getContext('2d',{alpha:false,willReadFrequently:true})!;
    let nextInferenceAt=0,averageCost=0;
    function frame() {
      if (stopped || run !== generation || !pose) return;
      try {
        if (video.readyState >= 2 && video.currentTime !== lastTime && performance.now()>=nextInferenceAt) {
          lastTime = video.currentTime;
          const timestampMs = performance.now();
          const inputWidth=Math.min(320,video.videoWidth),inputHeight=Math.round(video.videoHeight*inputWidth/video.videoWidth);
          if(input.width!==inputWidth||input.height!==inputHeight){input.width=inputWidth;input.height=inputHeight;}
          inputContext.drawImage(video,0,0,inputWidth,inputHeight);
          const pixels=inputContext.getImageData(0,0,inputWidth,inputHeight),lighting=enhanceDimFrame(pixels.data);
          if(lighting.enhanced)inputContext.putImageData(pixels,0,0);
          const result = pose.detectForVideo(input, timestampMs);
          currentPeople=result.landmarks;
          const selected=selector.update(result.landmarks),index=selected.index;
          el('selection').hidden=!selected.needsSelection;
          const choices=el('people');choices.replaceChildren();
          if(selected.needsSelection)for(const person of selected.people){
            const button=document.createElement('button');button.textContent=`Person ${person.index+1}`;
            button.onclick=()=>{selector.choose(currentPeople,person);tracker.reset();progress.begin();};choices.append(button);
          }
          const inferenceMs=performance.now()-timestampMs;
          averageCost=averageCost?averageCost*.8+inferenceMs*.2:inferenceMs;
          nextInferenceAt=performance.now()+Math.max(16,Math.min(60,averageCost*.2));
          const output = tracker.update({
            landmarks: index===null?[]:result.landmarks[index],
            worldLandmarks: index===null?[]:result.worldLandmarks[index],
            timestampMs,
            width: video.videoWidth,
            height: video.videoHeight,
          });
          const points = index===null?[]:result.landmarks[index] || [];
          summary.update(output.angles);
          const current = progress.update(output.reps,summary.value());
          const scale=Math.min(1,640/Math.max(video.videoWidth,video.videoHeight));
          const overlayWidth=Math.round(video.videoWidth*scale),overlayHeight=Math.round(video.videoHeight*scale);
          if(canvas.width!==overlayWidth||canvas.height!==overlayHeight){canvas.width=overlayWidth;canvas.height=overlayHeight;}
          const x = (n: number) => (1 - n) * canvas.width,
            y = (n: number) => n * canvas.height;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#9FD8BE";
          ctx.fillStyle = "#E78367";
          ctx.beginPath();
          for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
            const a = points[start],
              b = points[end];
            if (visible(a) && visible(b)) {
              ctx.moveTo(x(a.x), y(a.y));
              ctx.lineTo(x(b.x), y(b.y));
            }
          }
          ctx.stroke();ctx.beginPath();
          for (const p of points) {
            if (visible(p)) {
              ctx.moveTo(x(p.x)+4,y(p.y));
              ctx.arc(x(p.x), y(p.y), 4, 0, 2 * Math.PI);
            }
          }
          ctx.fill();
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
          const countLabel=`${current.reps} / ${target}`;
          if(el('counter').textContent!==countLabel)el('counter').textContent=countLabel;
          if(el('phase').textContent!==output.phase)el('phase').textContent=output.phase;
          if(el('feedback').textContent!==output.feedback)el('feedback').textContent=output.feedback;
          el("visibility").textContent = low
            ? "Low visibility — step back so your whole body is in view"
            : "";
          const range = rangeProgress(output.metric, exercise.tracking);
          el("progress").style.width = `${range}%`;
          document
            .querySelector(".bar")!
            .setAttribute("aria-valuenow", String(Math.round(range)));
          el("range").textContent =
            `${exercise.tracking.targetRangeLabel} · metric ${output.metric === null ? "—" : output.metric.toFixed(2)}`;
          el("rom").textContent = output.lastRep
            ? `Last rep: ${output.lastRep.quality} · ROM ${output.lastRep.rom.toFixed(1)} · ${Math.round(output.lastRep.durationMs)} ms`
            : "Complete a controlled movement to see your range of motion.";
          window.dispatchEvent(
            new CustomEvent("movecompass:frame", {
              detail: { timestampMs,inferenceMs,inputWidth,inputHeight,lighting, ...output, reps:current.reps },
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
