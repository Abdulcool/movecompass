import { extractAngles, flatten, visible,visibleInFrame, type Landmark, type PoseFrame } from './angles';
import {missingBodyParts} from './visibility';
import { OneEuroFilter } from './filter';
import { getExercise } from './exercises';
import { RepCounter } from './counter';
import {visibleLeg,calfLift,type Leg} from './calf';
import {createRowMetric} from './row';
import {createHipShift} from './hip';
export * from './angles';
export * from './math';
export * from './filter';
export * from './exercises';
export * from './counter';
export * from './visibility';

export function createTracker(exerciseId: string) {
  const exercise = getExercise(exerciseId);
  const counterConfig=exercise.tracking.relative?{...exercise.tracking,enterAbove:exercise.tracking.relative.flexion,exitBelow:exercise.tracking.relative.returnWithin,enterBelow:undefined,exitAbove:undefined}:exercise.tracking;
  let counter = new RepCounter(counterConfig),rowMetric=createRowMetric();
  let hip=exerciseId==='hip-shift'?createHipShift(exercise.tracking):null;
  const filters = new Map<string, OneEuroFilter>();
  let time = -Infinity, validTime = -Infinity;
  let baseline: number | null = null;
  let calibration: {time: number; value: number}[] = [];
  let leg:Leg|null=null;
  const smooth = (points: Landmark[], prefix: string, timestamp: number) => points.map((p, i) => {
    if (!(prefix==='i'?visibleInFrame(p):visible(p))) { for (const axis of ['x', 'y', 'z']) filters.delete(`${prefix}${i}${axis}`); return p; }
    const out = {...p};
    for (const axis of ['x', 'y', 'z'] as const) {
      if (p[axis] === undefined) continue;
      const key = `${prefix}${i}${axis}`;
      if (!filters.has(key)) filters.set(key, new OneEuroFilter());
      out[axis] = filters.get(key)!.filter(p[axis]!, timestamp);
    }
    return out;
  });
  const empty = () => extractAngles({landmarks: [], timestampMs: 0, width: 1, height: 1});
  let output = { ...empty(), missing:[] as string[],metric: null as number | null, reps: 0, phase: counter.phase, feedback: counter.feedback, lastRep: counter.lastRep };
  return {
    update(frame: PoseFrame) {
      if (!Number.isFinite(frame.timestampMs) || frame.timestampMs <= time) return output;
      if (frame.timestampMs - time > 500) filters.clear();
      time = frame.timestampMs;
      const p = smooth(flatten(frame.landmarks), 'i', time);
      const world = smooth(flatten(frame.worldLandmarks), 'w', time);
      const result = extractAngles({...frame, landmarks: p, worldLandmarks: world});
      let metric = frame.width > 0 && frame.height > 0 ? exercise.tracking.metric(result.angles, p, frame.width, frame.height, result.confidence) : null;
      if(hip){
        const missing=missingBodyParts(exerciseId,p);
        const form=metric===null||missing.length?'':exercise.tracking.formChecks.find(check=>check.test(result.angles))?.message??'';
        const state=hip.update(metric,p,frame.width,frame.height,time,form);
        output={...result,missing,...state,feedback:missing.length?`Can't see your ${missing.join(' and ')} — adjust the camera.`:state.feedback};
        return output;
      }
      if(exerciseId==='calf-raise'){
        const selected=visibleLeg(p,leg);
        if(selected&&selected!==leg){baseline=null;calibration=[];counter.interrupt();leg=selected;}
        metric=calfLift(p,frame.width,frame.height,selected);
      }
      if(exercise.tracking.relative&&frame.width>0&&frame.height>0)metric=rowMetric(result.angles,result.confidence,time,counter.phase==='ready');
      let calibrating = false;
      if (exercise.tracking.mode === 'baseline' && metric !== null) {
        if (baseline === null) {
          if (time - validTime > 500) calibration = [];
          const raw = extractAngles(frame);
          const value = exerciseId==='calf-raise'?calfLift(flatten(frame.landmarks),frame.width,frame.height,leg):exercise.tracking.metric(raw.angles, flatten(frame.landmarks), frame.width, frame.height, raw.confidence);
          calibration = calibration.filter(s => time - s.time <= 1200);
          if (value !== null) calibration.push({time, value});
          const mean = calibration.reduce((sum,s)=>sum+s.value,0)/calibration.length;
          const variance = calibration.reduce((sum,s)=>sum+(s.value-mean)**2,0)/calibration.length;
          if (calibration.length >= 10 && time - calibration[0].time >= 1000 && variance <= .000025) {
            const values = calibration.map(s => s.value).sort((a, b) => a - b);
            baseline = values.length % 2 ? values[Math.floor(values.length / 2)] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
          }
          calibrating = baseline === null;
        }
        metric = baseline === null ? null : metric - baseline;
      }
      if (exercise.tracking.metric(result.angles, p, frame.width, frame.height, result.confidence) !== null) validTime = time;
      const missing=missingBodyParts(exerciseId,p);
      const form = metric===null||missing.length?'':exercise.tracking.formChecks.find(check => check.test(result.angles))?.message ?? '';
      counter.update(metric, time, form);
      output = {...result,missing, metric, reps: counter.reps, phase: counter.phase, feedback: missing.length?`Can't see your ${missing.join(' and ')} — adjust the camera.`:calibrating ? 'Stand still for one second to calibrate' : counter.feedback, lastRep: counter.lastRep};
      return output;
    },
    reset() { counter = new RepCounter(counterConfig);rowMetric=createRowMetric();hip=exerciseId==='hip-shift'?createHipShift(exercise.tracking):null; filters.clear(); time = validTime = -Infinity; baseline = null; calibration = []; leg=null;output = {...empty(),missing:[], metric: null, reps: 0, phase: counter.phase, feedback: counter.feedback, lastRep: null}; },
  };
}
