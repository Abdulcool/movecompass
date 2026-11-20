import {createDetector} from './detector';
import { createTracker, getExercise, joints, visibleInFrame as visible } from "@movecompass/pose";
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
if(window.parent===window&&!window.ReactNativeWebView){
  el('tracker').setAttribute('role','main');
  const title=document.createElement('h1');title.id='name';title.textContent=el('name').textContent;el('name').replaceWith(title);
}
declare const __TRACKER_ASSETS__:{base:string;sizes:Record<string,number>};
declare const __TRACKER_WORKER__:string;
const params = new URLSearchParams(location.search);
let seedAngles: Record<string,number> = {};
try { const seed=JSON.parse(params.get('angles')||'{}');if(seed && typeof seed==='object' && !Array.isArray(seed) && Object.values(seed).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=360))seedAngles=seed; } catch {}
const progress = setProgress(Number(params.get('reps')||0),seedAngles);
let lastEmit = 0;
let pose: ReturnType<typeof createDetector> | undefined,
  stream: MediaStream | undefined,
  raf = 0,
  videoFrame = 0,
  stopped = false,
  completed = false;
let generation = 0,
  lastTime = -1,
  lastReps = progress.value().reps;
let preparing:Promise<void>|undefined;
function prepare(){
  if(!preparing){
    pose=createDetector(__TRACKER_WORKER__,__TRACKER_ASSETS__,({phase,percent})=>{
      el('download').textContent=phase;el('phase').textContent=phase;el('download-progress').setAttribute('value',String(percent));
    },timings=>window.dispatchEvent(new CustomEvent('movecompass:init',{detail:timings})));
    preparing=pose.ready.catch(error=>{preparing=undefined;throw error;});
  }
  return preparing;
}
function emit(message: unknown) {
  const serialized = JSON.stringify(message);
  if (window.ReactNativeWebView)
    window.ReactNativeWebView.postMessage(serialized);
  else if (window.parent !== window)
    window.parent.postMessage(message, location.origin);
}
new ResizeObserver(()=>emit({type:'resize',height:el('tracker').scrollHeight+32})).observe(el('tracker'));
function stop(release=true) {
  stopped = true;
  generation++;
  cancelAnimationFrame(raf);
  if(video.cancelVideoFrameCallback)video.cancelVideoFrameCallback(videoFrame);
  stream?.getTracks().forEach((track) => track.stop());
  stream = undefined;
  if(release){pose?.close();pose=undefined;preparing=undefined;}
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
  emit({ type: "error",name:error&&typeof error==='object'&&'name'in error?String(error.name):'', message:error&&typeof error==='object'&&'message'in error?String(error.message):message });
}
el("stop").onclick = () => {
  stop();
  el("phase").textContent = "Camera stopped";
  el("retry").hidden = false;
};
el("retry").onclick = () => void start();
window.addEventListener("pagehide",()=>stop());
document.addEventListener("visibilitychange", () => {
  if (document.hidden&&stream) {
    stop();
    el("phase").textContent = "Camera paused";
    el("retry").hidden = false;
  }
});
async function start() {
  stop(false);
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
    const prepared=prepare();
    void prepared.catch(()=>{});
    el('download').hidden=false;el('download-progress').hidden=false;
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
    await prepared;
    if (run !== generation)return;
    el('download').textContent='Starting first camera frame…';
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
    let nextInferenceAt=0,averageCost=0,lastDrawing='';
    function schedule(){
      if(video.requestVideoFrameCallback)videoFrame=video.requestVideoFrameCallback(()=>void frame());
      else raf=requestAnimationFrame(()=>void frame());
    }
    async function frame() {
      if (stopped || run !== generation || !pose) return;
      try {
        if (video.readyState >= 2 && video.currentTime !== lastTime && performance.now()>=nextInferenceAt) {
          lastTime = video.currentTime;
          const timestampMs = performance.now();
          const inputWidth=Math.min(320,video.videoWidth),inputHeight=Math.round(video.videoHeight*inputWidth/video.videoWidth);
          if(input.width!==inputWidth||input.height!==inputHeight){input.width=inputWidth;input.height=inputHeight;}
          inputContext.drawImage(video,0,0,inputWidth,inputHeight);
          const pixels=inputContext.getImageData(0,0,inputWidth,inputHeight),lighting=enhanceDimFrame(pixels.data);
          const result = await pose.detect(pixels, timestampMs);
          if(stopped||run!==generation)return;
          el('download-progress').setAttribute('value','100');el('download').hidden=true;el('download-progress').hidden=true;
          currentPeople=result.landmarks;
          const selected=selector.update(result.landmarks),index=selected.index;
          el('selection').hidden=!selected.needsSelection;
          const choices=el('people');if(selected.needsSelection||choices.hasChildNodes())choices.replaceChildren();
          if(selected.needsSelection)for(const person of selected.people){
            const button=document.createElement('button');button.textContent=`Person ${person.index+1}`;
            button.onclick=()=>{selector.choose(currentPeople,person);tracker.reset();progress.begin();};choices.append(button);
          }
          const inferenceMs=performance.now()-timestampMs;
          averageCost=averageCost?averageCost*.8+inferenceMs*.2:inferenceMs;
          nextInferenceAt=timestampMs+Math.max(1000/30,averageCost);
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
          const drawing=JSON.stringify([canvas.width,canvas.height,points.map(p=>visible(p)?[Math.round(p.x*canvas.width),Math.round(p.y*canvas.height)]:null),keys.map(key=>output.angles[key]===null?null:Math.round(output.angles[key]!))]);
          if(drawing!==lastDrawing){
          lastDrawing=drawing;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#9FD8BE";
          ctx.fillStyle = "#E78367";
          ctx.beginPath();
          for (const { start, end } of pose!.connections) {
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
          }
          const countLabel=`${current.reps} / ${target}`;
          if(el('counter').textContent!==countLabel)el('counter').textContent=countLabel;
          if(el('phase').textContent!==output.phase)el('phase').textContent=output.phase;
          const feedback=output.missing.length?'':output.feedback;
          if(el('feedback').textContent!==feedback)el('feedback').textContent=feedback;
          el('visibility').textContent=output.missing.length?output.feedback:'';
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
        schedule();
      } catch (error) {
        if(run===generation)fail(error);
      }
    }
    schedule();
  } catch (error) {
    if (run === generation) fail(error);
  }
}
let requested=false;
function requestStart(){if(!requested){requested=true;void start();}}
window.addEventListener('message',event=>{
  if(event.source===window.parent&&event.origin===location.origin&&event.data?.type==='start')requestStart();
  if(window.ReactNativeWebView)try{if(JSON.parse(event.data).type==='start')requestStart();}catch{}
});
document.addEventListener('message',event=>{if(window.ReactNativeWebView)try{if(JSON.parse((event as MessageEvent).data).type==='start')requestStart();}catch{}});
if(params.get('prepare')==='1')void prepare().catch(fail);else void start();
