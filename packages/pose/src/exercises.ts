import { type Angles, type Confidence, type Landmark, visibleInFrame as visible } from './angles';
export interface FormCheck { test: (a: Angles) => boolean; message: string }
export interface Tracking {
  metric: (a: Angles, p: Landmark[], width: number, height: number, confidence?: Confidence) => number | null;
  side: 'best' | 'both' | 'left' | 'right';
  enterBelow?: number; enterAbove?: number; exitAbove?: number; exitBelow?: number;
  minRepMs: number; targetRangeLabel: string; formChecks: FormCheck[];
  mode?: 'swing' | 'baseline';
}
export interface Exercise {
  id: string; name: string; group: 'upper-back' | 'shoulders' | 'hips' | 'legs';
  goal: 'stretch' | 'pain-relief' | 'strength'; minutes: number; sets: number; reps: number;
  difficulty: 'Gentle' | 'Steady'; description: string; steps: [string, string, string];
  safety: string; target: string; gif: string; angleGuide: {label: string; target: string}[]; tracking: Tracking;
}
const best = (a: number | null, b: number | null, left = 0, right = 0) => a === null ? b : b === null ? a : right > left ? b : a;
const armLift = (a: Angles, c?: Confidence) => {
  const left = a.leftShoulder, right = a.rightShoulder;
  if (left === null || right === null || Math.abs((c?.leftShoulder ?? 0) - (c?.rightShoulder ?? 0)) > .15) return best(left, right, c?.leftShoulder, c?.rightShoulder);
  return Math.abs(left - right) > 20 ? Math.max(left, right) : (left + right) / 2;
};
const ratio = (p: Landmark[], ids: number[], compute: () => [number, number]) => {
  if (!ids.every(i => visible(p[i]))) return null;
  const [n, d] = compute(); return d > 1e-8 && Number.isFinite(n / d) ? n / d : null;
};
const chest: FormCheck = { test: a => a.trunkLean !== null && a.trunkLean > 45, message: 'Keep chest up' };
export const exercises: Exercise[] = [
  {
    id: 'wall-angels', name: 'Wall angels', group: 'upper-back', goal: 'stretch', minutes: 5, sets: 2, reps: 8, difficulty: 'Gentle',
    description: 'Open the chest and wake up the upper back with a supported range of motion.',
    steps: ['Stand with your back near a wall and feet hip-width apart.', 'Keep your ribs relaxed as your arms make a slow ‘W’ shape.', 'Slide your hands upward only as far as feels comfortable, then return.'],
    safety: 'Keep your neck relaxed. Stop if you feel sharp pain, dizziness, or tingling.', target: 'Upper back + chest', gif: 'wall-angels.gif',
    angleGuide: [{label: 'Arm lift', target: 'Above 150°, return below 90°'}, {label: 'Elbows', target: 'Keep above 70°'}],
    tracking: { side: 'both', metric: (a, _p, _w, _h, c) => armLift(a, c), enterAbove: 150, exitBelow: 90, minRepMs: 800, targetRangeLabel: 'Raise both arms, then lower slowly', formChecks: [
      {test: a => [a.leftElbow, a.rightElbow].some(v => v !== null && v <= 70), message: 'Open your elbows'},
      {test: a => a.leftShoulder !== null && a.rightShoulder !== null && a.rightShoulder - a.leftShoulder > 20, message: 'Left arm lower than right — try to lift evenly'},
      {test: a => a.leftShoulder !== null && a.rightShoulder !== null && a.leftShoulder - a.rightShoulder > 20, message: 'Right arm lower than left — try to lift evenly'},
    ] },
  },
  {
    id: 'seated-row', name: 'Seated band row', group: 'upper-back', goal: 'strength', minutes: 6, sets: 2, reps: 10, difficulty: 'Steady',
    description: 'Build supported pulling strength for posture and everyday reaching.',
    steps: ['Sit tall with the band looped safely around a sturdy anchor.', 'Pull elbows back toward your ribs without shrugging.', 'Pause, breathe out, and slowly return the band.'],
    safety: 'Use a light band. Keep both feet grounded and avoid holding your breath.', target: 'Mid-back', gif: 'seated-row.gif',
    angleGuide: [{label: 'Elbow bend', target: 'Pull below 95°, return above 150°'}, {label: 'Shoulders', target: 'Level and relaxed'}],
    tracking: {side: 'best', metric: (a, _p, _w, _h, c) => best(a.leftElbow, a.rightElbow, c?.leftElbow, c?.rightElbow), enterBelow: 95, exitAbove: 150, minRepMs: 800, targetRangeLabel: 'Pull, pause, then extend your arms', formChecks: []},
  },
  {
    id: 'pendulum', name: 'Shoulder pendulum', group: 'shoulders', goal: 'pain-relief', minutes: 4, sets: 2, reps: 8, difficulty: 'Gentle',
    description: 'A small, supported movement to ease shoulder stiffness without forcing range.',
    steps: ['Support one hand on a table and let the other arm relax.', 'Make small circles with the relaxed arm, using your body, not your shoulder, to guide.', 'Switch directions, then repeat on the other side.'],
    safety: 'Keep circles small and comfortable. Pause if pain increases instead of easing.', target: 'Shoulder joint', gif: 'pendulum.gif',
    angleGuide: [{label: 'Arm swing', target: 'Small comfortable range'}, {label: 'Trunk', target: 'Lean forward above 30°'}],
    tracking: {side: 'left', metric: (_a, p, w, h) => ratio(p, [11, 12, 15], () => [(p[15].x - p[11].x) * w, Math.hypot((p[11].x - p[12].x) * w, (p[11].y - p[12].y) * h)]), mode: 'swing', enterAbove: 0.25, exitBelow: -0.25, minRepMs: 800, targetRangeLabel: 'Swing gently from side to side', formChecks: [{test: a => a.trunkLean !== null && a.trunkLean <= 30, message: 'Lean forward with support'}]},
  },
  {
    id: 'sit-to-stand', name: 'Supported sit-to-stand', group: 'legs', goal: 'strength', minutes: 7, sets: 2, reps: 6, difficulty: 'Steady',
    description: 'Practice leg strength for getting up from a chair with a steady support nearby.',
    steps: ['Choose a firm chair and place it near a counter or rail.', 'Scoot forward, lean your chest slightly over your toes, and press through your feet.', 'Stand tall, then lower slowly with control.'],
    safety: 'Use your support as needed. Have someone nearby if you feel unsteady.', target: 'Thighs + glutes', gif: 'sit-to-stand.gif',
    angleGuide: [{label: 'Knee bend', target: 'Below 105°'}, {label: 'Standing finish', target: 'Above 160°'}],
    tracking: {side: 'best', metric: (a, _p, _w, _h, c) => best(a.leftKnee, a.rightKnee, c?.leftKnee, c?.rightKnee), enterBelow: 105, exitAbove: 160, minRepMs: 800, targetRangeLabel: 'Sit with control, then stand tall', formChecks: [chest]},
  },
  {
    id: 'hip-shift', name: 'Counter hip shift', group: 'hips', goal: 'stretch', minutes: 5, sets: 2, reps: 8, difficulty: 'Gentle',
    description: 'A standing side-to-side shift to keep hips moving with confidence.',
    steps: ['Stand facing a counter with fingertips resting lightly on the surface.', 'Shift your weight toward one foot without leaning your shoulders.', 'Return to center and repeat on the other side.'],
    safety: 'Move in a small range. Keep your knees soft and stop if balance feels uncertain.', target: 'Hips + side body', gif: 'hip-shift.gif',
    angleGuide: [{label: 'Hip shift', target: 'Small and controlled'}, {label: 'Shoulders', target: 'Stay level'}],
    tracking: {side: 'both', metric: (_a, p, w, h) => ratio(p, [23, 24, 27, 28], () => [Math.abs((p[23].x + p[24].x - p[27].x - p[28].x) / 2) * w, Math.hypot((p[23].x - p[24].x) * w, (p[23].y - p[24].y) * h)]), enterAbove: 0.35, exitBelow: 0.1, minRepMs: 800, targetRangeLabel: 'Shift to either side, then return to center', formChecks: [chest]},
  },
  {
    id: 'calf-raise', name: 'Counter calf raise', group: 'legs', goal: 'strength', minutes: 5, sets: 2, reps: 10, difficulty: 'Steady',
    description: 'Build ankle and calf strength with a steady surface for balance.',
    steps: ['Stand behind a counter with hands resting gently on it.', 'Lift your heels slowly while keeping your weight even across both feet.', 'Lower with control and pause before the next repetition.'],
    safety: 'Keep the movement smooth. Sit and rest if you feel light-headed.', target: 'Calves + ankles', gif: 'calf-raise.gif',
    angleGuide: [{label: 'Ankle lift', target: 'Smooth rise'}, {label: 'Knees', target: 'Soft, not locked'}],
    tracking: {side: 'both', metric: (_a, p, w, h) => ratio(p, [25, 26, 27, 28, 31, 32], () => [(p[31].y + p[32].y - p[27].y - p[28].y) / 2 * h, (Math.hypot((p[25].x - p[27].x) * w, (p[25].y - p[27].y) * h) + Math.hypot((p[26].x - p[28].x) * w, (p[26].y - p[28].y) * h)) / 2]), mode: 'baseline', enterAbove: 0.06, exitBelow: 0.02, minRepMs: 800, targetRangeLabel: 'Raise your heels, then lower with control', formChecks: [chest]},
  },
];
export function getExercise(id: string): Exercise {
  const exercise = exercises.find(e => e.id === id);
  if (!exercise) throw new Error(`Unknown exercise: ${id}`);
  return exercise;
}
