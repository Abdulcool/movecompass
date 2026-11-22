import React, { useEffect, useRef, useState } from "react";
import { Button, Card, Copy } from "./ui";
import { cameraGuidance } from './camera-errors';
import { parseTrackerMessage, type PoseTrackerProps } from "./tracker-contract";
export type { PoseTrackerProps } from "./tracker-contract";
export function PoseTracker({
  exerciseId,
  target,
  active=true,
  initialReps=0,
  initialAngles={},
  onRep,
  onComplete,
}: PoseTrackerProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded=useRef(false);
  useEffect(()=>{if(active&&loaded.current)frame.current?.contentWindow?.postMessage({type:'start'},location.origin);},[active]);
  const [error, setError] = useState("");
  const [height,setHeight]=useState(790);
  const seed=useRef({reps:initialReps,angles:initialAngles}),latest=useRef(seed.current);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = parseTrackerMessage(event.data);
      if(message?.type==='resize')setHeight(message.height+8);
      if (message?.type === "rep") {latest.current={reps:message.reps,angles:message.angles||latest.current.angles};onRep(message.reps, message.lastRep, message.angles);}
      if (message?.type === "complete" && message.reps >= target)
        onComplete(message.reps, message.angles);
      if (message?.type === "error") setError(cameraGuidance(message));
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onRep, onComplete]);
  if(error)return <Card><Copy>{error}</Copy><Button title="Try again" onPress={()=>{seed.current=latest.current;setError('');}}/></Card>;
  return (
    <>
      <iframe
        ref={frame}
        title="Live pose tracking"
        src={`/tracker.html?prepare=1&exercise=${encodeURIComponent(exerciseId)}&target=${target}&reps=${seed.current.reps}&angles=${encodeURIComponent(JSON.stringify(seed.current.angles))}`}
        tabIndex={active?0:-1}
        onLoad={()=>{loaded.current=true;if(active)frame.current?.contentWindow?.postMessage({type:'start'},location.origin);}}
        allow="camera"
        style={{ width: "100%", height, border: 0, borderRadius: 20 }}
      />
      {!!error && <Copy>{error}</Copy>}
    </>
  );
}
