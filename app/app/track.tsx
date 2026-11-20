import React, { useRef, useState } from "react";
import { Text } from "react-native";
import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { exercises } from "@movecompass/pose";
import { PoseTracker } from "../src/PoseTracker";
import { gifs } from "../src/assets";
import { useSession } from "../src/session";
import { Button, Card, Copy, Page, Title, s } from "../src/ui";
export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = exercises.find((e) => e.id === id);
  const session = useSession();
  const [consent, setConsent] = useState(false),
    [started, setStarted] = useState(false),
    [reps, setReps] = useState(0),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false);
  const saving = useRef(false);
  if (!session.ready)
    return (
      <Page>
        <Copy>Loading…</Copy>
      </Page>
    );
  if (!session.user) return <Redirect href="/" />;
  if (!e)
    return (
      <Page>
        <Title>Choose an exercise from your plan first.</Title>
        <Button title="Back to Plan" onPress={()=>router.replace('/(tabs)/plan')} />
      </Page>
    );
  const exercise = e;
  async function save(
    count: number,
    source: "manual" | "camera",
    angles: Record<string, number> = {},
  ) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await session.complete(exercise, count, source, angles);
      setSaved(true);
      setMessage("Session saved. Your care team has been notified.");
    } catch (error) {
      saving.current = false;
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function onRep(count: number) {
    setReps(count);
  }
  return (
    <Page>
      <Text style={s.eyebrow}>GUIDED TRACKING</Text>
      <Title>{exercise.name}</Title>
      <Image
        source={gifs[exercise.id]}
        style={{ height: 220, width: "100%" }}
        contentFit="contain"
      />
      {!started ? (
        <Card>
          <Text style={s.heading}>Before camera tracking</Text>
          <Copy>{exercise.safety}</Copy>
          <Copy>
            Use stable support or a care partner where recommended. This feature
            is guidance, not diagnosis.
          </Copy>
          <Copy>
            Camera tracking is a prototype. Allow camera access after you
            consent. Frames are processed on this device and are not uploaded.
          </Copy>
          <Button
            title={`${consent ? "✓ " : ""}I understand and consent to the tracking prototype`}
            secondary={!consent}
            onPress={() => setConsent(!consent)}
          />
          <Button
            title="Start live pose tracking"
            disabled={!consent}
            onPress={() => setStarted(true)}
          />
        </Card>
      ) : (
        <>
          <Title>
            {reps} / {exercise.reps} reps
          </Title>
          {!saved && (
            <PoseTracker
              exerciseId={exercise.id}
              target={exercise.reps}
              onRep={onRep}
              onComplete={(count, angles) => void save(count, "camera", angles)}
            />
          )}
          <Button
            title={saved ? "Session saved" : "Finish and save"}
            disabled={busy || saved}
            onPress={() => void save(reps, "camera")}
          />
        </>
      )}
      <Button
        title="Complete manually without camera"
        disabled={busy || saved}
        secondary
        onPress={() => void save(exercise.reps, "manual")}
      />
      {!!message && <Copy>{message}</Copy>}
    </Page>
  );
}
