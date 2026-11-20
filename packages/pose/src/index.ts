import { extractAngles, flatten, visible, type Landmark, type PoseFrame } from './angles';
import { OneEuroFilter } from './filter';
import { getExercise } from './exercises';
import { RepCounter } from './counter';
export * from './angles';
export * from './math';
export * from './filter';
export * from './exercises';
export * from './counter';

export function createTracker(exerciseId: string) {
  const exercise = getExercise(exerciseId);
  let counter = new RepCounter(exercise.tracking);
  const filters = new Map<string, OneEuroFilter>();
  let time = -Infinity, validTime = -Infinity;
  let baseline: number | null = null;
  let calibration: {time: number; value: number}[] = [];
  const smooth = (points: Landmark[], prefix: string, timestamp: number) => points.map((p, i) => {
    if (!visible(p)) { for (const axis of ['x', 'y', 'z']) filters.delete(`${prefix}${i}${axis}`); return p; }
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
  let output = { ...empty(), metric: null as number | null, reps: 0, phase: counter.phase, feedback: counter.feedback, lastRep: counter.lastRep };
  return {
    update(frame: PoseFrame) {
      if (!Number.isFinite(frame.timestampMs) || frame.timestampMs <= time) return output;
      if (frame.timestampMs - time > 500) filters.clear();
      time = frame.timestampMs;
      const p = smooth(flatten(frame.landmarks), 'i', time);
      const world = smooth(flatten(frame.worldLandmarks), 'w', time);
      const result = extractAngles({...frame, landmarks: p, worldLandmarks: world});
      let metric = frame.width > 0 && frame.height > 0 ? exercise.tracking.metric(result.angles, p, frame.width, frame.height) : null;
      let calibrating = false;
      if (exercise.tracking.mode === 'baseline' && metric !== null) {
        if (baseline === null) {
          if (time - validTime > 500) calibration = [];
          calibration.push({time, value: metric});
          if (time - calibration[0].time >= 1000) {
            const values = calibration.map(s => s.value).sort((a, b) => a - b);
            baseline = values.length % 2 ? values[Math.floor(values.length / 2)] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
          }
          calibrating = baseline === null;
        }
        metric = baseline === null ? null : metric - baseline;
      }
      if (exercise.tracking.metric(result.angles, p, frame.width, frame.height) !== null) validTime = time;
      const form = exercise.tracking.formChecks.find(check => check.test(result.angles))?.message ?? '';
      counter.update(metric, time, form);
      output = {...result, metric, reps: counter.reps, phase: counter.phase, feedback: calibrating ? 'Stand still for one second to calibrate' : counter.feedback, lastRep: counter.lastRep};
      return output;
    },
    reset() { counter = new RepCounter(exercise.tracking); filters.clear(); time = validTime = -Infinity; baseline = null; calibration = []; output = {...empty(), metric: null, reps: 0, phase: counter.phase, feedback: counter.feedback, lastRep: null}; },
  };
}
