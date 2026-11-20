import { describe, it, expect } from "vitest";
import { parseTrackerMessage } from "../src/tracker-contract";
import {cameraGuidance} from '../src/camera-errors';
import {
  angleSummary,
  rangeProgress,
  relevantJoints,
} from "../tracker/metrics";
import { exercises, type Angles } from "@movecompass/pose";
describe("camera bridge", () => {
  it('keeps the original DOMException name across both camera bridges',()=>{
    const error=parseTrackerMessage(JSON.stringify({type:'error',name:'NotAllowedError',message:'Request dismissed'}));
    expect(cameraGuidance(error)).toContain('Allow camera access in your browser or device settings');
  });
  it("accepts native JSON and web objects", () => {
    expect(parseTrackerMessage('{"type":"rep","reps":2}')).toMatchObject({
      type: "rep",
      reps: 2,
    });
    expect(
      parseTrackerMessage({
        type: "complete",
        reps: 6,
        angles: { leftKnee: 90 },
      }),
    ).toMatchObject({ angles: { leftKnee: 90 } });
    expect(
      parseTrackerMessage({ type: "error", message: "Permission denied" }),
    ).toEqual({ type: "error", message: "Permission denied" });
  });
  it("ignores malformed, empty and invalid completion messages", () => {
    for (const v of [
      null,
      "",
      {},
      "{",
      [],
      { type: "complete", reps: -1, angles: {} },
      { type: "complete", reps: 1, angles: { knee: NaN } },
      { type: "complete", reps: 1, angles: [] },
    ])
      expect(parseTrackerMessage(v)).toBeNull();
  });
  it("accumulates visible joint ROM and handles no detections", () => {
    const summary = angleSummary();
    expect(summary.value()).toEqual({});
    summary.update({ leftKnee: 170, rightKnee: null } as Angles);
    summary.update({ leftKnee: 80, rightKnee: 160 } as Angles);
    summary.update({ leftKnee: NaN, rightKnee: null } as Angles);
    expect(summary.value()).toEqual({ leftKnee: 90, rightKnee: 0 });
  });
  it("normalizes the metric bar and maps every exercise to angle joints", () => {
    for (const e of exercises) {
      expect(relevantJoints(e.id).length).toBeGreaterThan(0);
      expect(rangeProgress(null, e.tracking)).toBe(0);
      const target = e.tracking.enterBelow ?? e.tracking.enterAbove!;
      expect(rangeProgress(target, e.tracking)).toBe(100);
    }
  });
});
