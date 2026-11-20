import React from "react";
import { Card, Copy } from "./ui";
export interface PoseTrackerProps {
  exerciseId: string;
  onRep: (reps: number) => void;
  onComplete: (reps: number) => void;
  target: number;
}
export function PoseTracker(_props: PoseTrackerProps) {
  return (
    <Card>
      <Copy>
        Camera tracking is coming in the next step. No camera is active and no
        repetitions are being detected.
      </Copy>
      <Copy>You can still finish this session manually below.</Copy>
    </Card>
  );
}
