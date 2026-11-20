import type { Rep } from "@movecompass/pose";
export interface PoseTrackerProps {
  exerciseId: string;
  onRep: (reps: number, lastRep?: Rep) => void;
  onComplete: (reps: number, angles: Record<string, number>) => void;
  target: number;
}
export type TrackerMessage =
  | { type: "rep"; reps: number; lastRep?: Rep }
  | { type: "complete"; reps: number; angles: Record<string, number> }
  | { type: "error"; message: string };
export function parseTrackerMessage(value: unknown): TrackerMessage | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.type === "error" && typeof v.message === "string")
    return { type: "error", message: v.message };
  if (!Number.isInteger(v.reps) || Number(v.reps) < 0 || Number(v.reps) > 10000)
    return null;
  if (v.type === "rep")
    return {
      type: "rep",
      reps: Number(v.reps),
      lastRep: v.lastRep as Rep | undefined,
    };
  if (
    v.type === "complete" &&
    v.angles &&
    typeof v.angles === "object" &&
    !Array.isArray(v.angles) &&
    Object.entries(v.angles).every(
      ([key, value]) =>
        key.length <= 200 &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 360,
    )
  )
    return {
      type: "complete",
      reps: Number(v.reps),
      angles: v.angles as Record<string, number>,
    };
  return null;
}
