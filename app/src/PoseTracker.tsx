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
  initialReps=0,
  initialAngles={},
  onManual,
  onRep,
  onComplete,
}: PoseTrackerProps) {
  const { base } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState("");
  const [height,setHeight]=useState(790);
  const seed=useRef({reps:initialReps,angles:initialAngles}),latest=useRef(seed.current);
  useEffect(() => {
    void requestPermission().catch((e) => setError(cameraGuidance(e)));
  }, [requestPermission]);
  if (!permission?.granted)
    return (
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
        {onManual && <Button title="Complete manually" secondary onPress={onManual}/>}
      </Card>
    );
  if(error)return <Card><Copy>{error}</Copy><Button title="Try again" onPress={()=>{seed.current=latest.current;setError('');}}/>{onManual && <Button title="Complete manually" secondary onPress={onManual}/>}</Card>;
  return (
    <>
      <WebView
        style={{ height, backgroundColor: "#13231F" }}
        injectedJavaScript={`document.documentElement.style.fontSize='${16*PixelRatio.getFontScale()}px';true;`}
        source={{
          uri: `${base}/tracker.html?exercise=${encodeURIComponent(exerciseId)}&target=${target}&reps=${seed.current.reps}&angles=${encodeURIComponent(JSON.stringify(seed.current.angles))}`,
        }}
        originWhitelist={["https://*", "http://*"]}
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
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
          if (message?.type === "error") setError(cameraGuidance(message.message));
        }}
      />
      {!!error && <Copy>{error}</Copy>}
    </>
  );
}
