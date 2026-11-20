import React, { useRef, useState } from "react";
import { randomUUID } from 'expo-crypto';
import { Text } from "react-native";
import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { exercises } from "@movecompass/pose";
import { useSession } from "../../src/session";
import { illustrations } from "../../src/assets";
import { Button, Card, Copy, Page, Title, s } from "../../src/ui";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const exercise = exercises.find((e) => e.id === id);
  const session = useSession();
  const clientId=useRef(randomUUID());
  const [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  if (!session.ready)
    return (
      <Page>
        <Copy>Loading…</Copy>
      </Page>
    );
  if (!session.user) return <Redirect href="/" />;
  if (!exercise)
    return (
      <Page>
        <Title>Exercise not found</Title>
        <Button
          title="Back to plan"
          onPress={() => router.replace("/(tabs)/plan")}
        />
      </Page>
    );
  const e = exercise;
  async function complete() {
    setBusy(true);
    try {
      const result=await session.complete(e, e.reps, "manual",{},clientId.current);
      setSaved(true);
      setStatus('queued' in result ? 'Saved on this device — will sync when back online' : "Activity saved. Your care team has been notified.");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <Text style={s.eyebrow}>
        {e.group.replace("-", " ")} · {e.difficulty}
      </Text>
      <Title>{e.name}</Title>
      <Copy>{e.description}</Copy>
      <Card>
        <Image
          source={illustrations[e.id]}
          style={{ height: 280, width: "100%", borderRadius: 16 }}
          contentFit="contain"
          accessibilityLabel={`Illustration: ${e.name}`}
        />
        <Copy>Illustration · Follow the supported movement below. No weights are needed.</Copy>
        <Text style={s.heading}>{e.target}</Text>
        <Copy>
          {e.minutes} minutes · {e.sets} sets × {e.reps} reps
        </Copy>
        {e.steps.map((step, i) => (
          <Copy key={step}>
            {i + 1}. {step}
          </Copy>
        ))}
        <Copy>{(session.dailySets[e.id]||0)>=e.sets ? 'Completed today' : `Set ${session.dailySets[e.id]||0} of ${e.sets} done`}</Copy>
      </Card>
      <Card>
        <Text style={s.heading}>Move safely</Text>
        <Copy>{e.safety}</Copy>
        {e.angleGuide.map((a) => (
          <Copy key={a.label}>
            {a.label}: {a.target}
          </Copy>
        ))}
        <Copy>This feature is guidance, not diagnosis.</Copy>
      </Card>
      <Button
        title="Start guided tracking"
        onPress={() =>
          router.push({ pathname: "/track", params: { id: e.id } })
        }
      />
      <Button
        title={saved ? "Completed" : busy ? "Saving…" : "Mark complete"}
        disabled={busy || saved}
        secondary
        onPress={() => void complete()}
      />
      {!!status && <Copy>{status}</Copy>}
      {saved && (session.dailySets[e.id]||0)<e.sets && <Button title="Record another set" onPress={()=>{clientId.current=randomUUID();setSaved(false);setStatus('Rest as advised by your care team before your next set.');}}/>}
    </Page>
  );
}
