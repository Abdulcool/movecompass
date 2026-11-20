import type { Angles, Joint, Tracking } from "@movecompass/pose";
export function relevantJoints(id: string): Joint[] {
  switch (id) {
    case "sit-to-stand":
      return ["leftKnee", "rightKnee", "trunkLean"];
    case "seated-row":
      return ["leftElbow", "rightElbow"];
    case "wall-angels":
      return ["leftShoulder", "rightShoulder", "leftElbow", "rightElbow"];
    case "pendulum":
      return ["leftShoulder", "trunkLean"];
    case "hip-shift":
      return ["leftHip", "rightHip"];
    default:
      return ["leftAnkle", "rightAnkle"];
  }
}
export function rangeProgress(metric: number | null, tracking: Tracking) {
  if (metric === null) return 0;
  const home = tracking.exitAbove ?? tracking.exitBelow ?? 0;
  const target = tracking.enterBelow ?? tracking.enterAbove ?? 1;
  return Math.max(0, Math.min(100, (100 * (metric - home)) / (target - home)));
}
export function angleSummary() {
  const bounds: Record<string, { min: number; max: number }> = {};
  return {
    update(angles: Angles) {
      for (const [key, value] of Object.entries(angles)) {
        if (value === null || !Number.isFinite(value)) continue;
        const b = bounds[key] ?? { min: value, max: value };
        b.min = Math.min(b.min, value);
        b.max = Math.max(b.max, value);
        bounds[key] = b;
      }
    },
    value() {
      return Object.fromEntries(
        Object.entries(bounds).map(([key, b]) => [
          key,
          Math.max(0, b.max - b.min),
        ]),
      );
    },
  };
}
