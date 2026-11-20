import React, { useEffect, useRef, useState } from "react";
import { Copy } from "./ui";
import { parseTrackerMessage, type PoseTrackerProps } from "./tracker-contract";
export type { PoseTrackerProps } from "./tracker-contract";
export function PoseTracker({
  exerciseId,
  target,
  onRep,
  onComplete,
}: PoseTrackerProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = parseTrackerMessage(event.data);
      if (message?.type === "rep") onRep(message.reps, message.lastRep);
      if (message?.type === "complete" && message.reps >= target)
        onComplete(message.reps, message.angles);
      if (message?.type === "error") setError(message.message);
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onRep, onComplete]);
  return (
    <>
      <iframe
        ref={frame}
        title="Live pose tracking"
        src={`/tracker.html?exercise=${encodeURIComponent(exerciseId)}&target=${target}`}
        allow="camera"
        style={{ width: "100%", height: 790, border: 0, borderRadius: 20 }}
      />
      {!!error && <Copy>{error}</Copy>}
    </>
  );
}
