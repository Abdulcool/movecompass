import React, { useEffect, useRef, useState } from "react";
import { Linking,PixelRatio } from 'react-native';
import { cameraGuidance } from './camera-errors';
import { WebView } from "react-native-webview";
import { useCameraPermissions } from "expo-camera";
import { useSession } from "./session";
import { Button, Card, Copy } from "./ui";
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
  const { base } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState("");
  const [height,setHeight]=useState(790);
  const frame=useRef<WebView<{}>>(null),loaded=useRef(false);
  const seed=useRef({reps:initialReps,angles:initialAngles}),latest=useRef(seed.current);
  useEffect(() => {
    if(active)void requestPermission().catch((e) => setError(cameraGuidance(e)));
  }, [active,requestPermission]);
  useEffect(()=>{if(active&&permission?.granted&&loaded.current)frame.current?.postMessage(JSON.stringify({type:'start'}));},[active,permission?.granted]);
  if(error)return <Card><Copy>{error}</Copy><Button title="Try again" onPress={()=>{loaded.current=false;seed.current=latest.current;setError('');}}/></Card>;
  return <>
    {active&&!permission?.granted&&(
      <Card>
        <Copy>
          {error || "Camera access is off. Allow it in device settings, or complete this set manually."}
        </Copy>
        <Button
          title={permission?.canAskAgain === false ? 'Open camera settings' : 'Try again'}
          onPress={() =>
            permission?.canAskAgain === false ? void Linking.openSettings() : void requestPermission().catch((e) => setError(cameraGuidance(e)))
          }
        />
      </Card>
    )}
      <WebView<{}>
        ref={frame}
        style={{ height:active&&permission?.granted?height:1,opacity:active&&permission?.granted?1:0, backgroundColor: "#13231F" }}
        injectedJavaScript={`document.documentElement.style.fontSize='${16*PixelRatio.getFontScale()}px';true;`}
        source={{
          uri: `${base}/tracker.html?prepare=1&exercise=${encodeURIComponent(exerciseId)}&target=${target}&reps=${seed.current.reps}&angles=${encodeURIComponent(JSON.stringify(seed.current.angles))}`,
        }}
        originWhitelist={["https://*", "http://*"]}
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onLoadEnd={()=>{loaded.current=true;if(active&&permission?.granted)frame.current?.postMessage(JSON.stringify({type:'start'}));}}
        onShouldStartLoadWithRequest={(request) =>
          request.url.startsWith(`${base}/tracker.html`) ||
          request.url === "about:blank"
        }
        onError={(e) => setError(cameraGuidance(e.nativeEvent.description))}
        onMessage={(e) => {
          const message = parseTrackerMessage(e.nativeEvent.data);
          if(message?.type==='resize')setHeight(message.height+8);
          if (message?.type === "rep") {latest.current={reps:message.reps,angles:message.angles||latest.current.angles};onRep(message.reps, message.lastRep, message.angles);}
          if (message?.type === "complete" && message.reps >= target)
            onComplete(message.reps, message.angles);
          if (message?.type === "error") setError(cameraGuidance(message));
        }}
      />
      {!!error && <Copy>{error}</Copy>}
    </>;
}
