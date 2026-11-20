import React, { useEffect, useState } from "react";
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
  onRep,
  onComplete,
}: PoseTrackerProps) {
  const { base } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState("");
  useEffect(() => {
    void requestPermission().catch((e) => setError(e.message));
  }, [requestPermission]);
  if (!permission?.granted)
    return (
      <Card>
        <Copy>
          {error || "Camera permission is needed for guided tracking."}
        </Copy>
        <Button
          title="Allow camera"
          onPress={() =>
            void requestPermission().catch((e) => setError(e.message))
          }
        />
      </Card>
    );
  return (
    <>
      <WebView
        style={{ height: 760, backgroundColor: "#13231F" }}
        source={{
          uri: `${base}/tracker.html?exercise=${encodeURIComponent(exerciseId)}&target=${target}&reps=${initialReps}&angles=${encodeURIComponent(JSON.stringify(initialAngles))}`,
        }}
        originWhitelist={["https://*", "http://*"]}
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onShouldStartLoadWithRequest={(request) =>
          request.url.startsWith(`${base}/tracker.html`) ||
          request.url === "about:blank"
        }
        onError={(e) => setError(e.nativeEvent.description)}
        onMessage={(e) => {
          const message = parseTrackerMessage(e.nativeEvent.data);
          if (message?.type === "rep") onRep(message.reps, message.lastRep, message.angles);
          if (message?.type === "complete" && message.reps >= target)
            onComplete(message.reps, message.angles);
          if (message?.type === "error") setError(message.message);
        }}
      />
      {!!error && <Copy>{error}</Copy>}
    </>
  );
}
