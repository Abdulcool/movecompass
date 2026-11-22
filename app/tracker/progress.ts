export function setProgress(initialReps = 0, initialAngles: Record<string, number> = {}) {
  let reps = Number.isInteger(initialReps) && initialReps >= 0 && initialReps <= 100 ? initialReps : 0;
  let offset = reps;
  const angles = {...initialAngles};
  return {
    begin() { offset = reps; },
    update(count: number, rom: Record<string, number>) {
      reps = Math.min(100, offset + count);
      for (const [key,value] of Object.entries(rom)) if(Number.isFinite(value) && value>=0 && value<=360)angles[key]=Math.max(angles[key]||0,value);
      return {reps,angles:{...angles}};
    },
    value() {return {reps,angles:{...angles}};},
  };
}
