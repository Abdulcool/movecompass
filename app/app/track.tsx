import React, { useEffect, useRef, useState } from "react";
import { randomUUID } from 'expo-crypto';
import { Text, TextInput } from "react-native";
import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { exercises } from "@movecompass/pose";
import { PoseTracker } from "../src/PoseTracker";
import { gifs } from "../src/assets";
import { useSession } from "../src/session";
import { draftKey, loadDraft, storeDraft, removeDraft } from '../src/drafts';
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
  const [manualCount, setManualCount] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [angles, setAngles] = useState<Record<string,number>>({});
  const [draftReady, setDraftReady] = useState(false), [hasDraft, setHasDraft] = useState(false);
  const clientId = useRef(randomUUID());
  const key = session.user && e ? draftKey(session.base,session.user.id,e.id) : '';
  useEffect(()=>{
    let active=true;setDraftReady(false);
    if(key)void loadDraft(key).then(d=>{
      if(!active)return;
      if(d){setReps(d.reps);setAngles(d.angles);clientId.current=d.clientId;setHasDraft(true);}
      setDraftReady(true);
    }).catch(()=>{if(active)setMessage("This device couldn't restore the unfinished set.");});
    return()=>{active=false;};
  },[key]);
  useEffect(()=>{
    if(key && e && draftReady && !saved && reps>0)void storeDraft(key,{exerciseId:e.id,clientId:clientId.current,reps,angles}).catch(()=>setMessage("This device couldn't keep your progress. Please save before leaving."));
  },[key,draftReady,reps,angles,saved]);
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
    if (!Number.isInteger(count) || count < 1 || count > 100) { setMessage('Complete at least one rep before saving.'); return; }
    saving.current = true;
    setBusy(true);
    try {
      await session.complete(exercise, count, source, angles);
      if(key)await removeDraft(key);
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
      {hasDraft && !saved && <Card><Text style={s.heading}>Resume or save the {reps} reps</Text><Copy>Your unfinished set and range of motion are saved on this device.</Copy><Button title="Resume this set" onPress={()=>{setHasDraft(false);setMessage('Review the camera consent below to resume.');}}/><Button title={`Save the ${reps} reps`} disabled={busy} onPress={()=>void save(reps,'camera',angles)}/></Card>}
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
            disabled={busy || saved || reps < 1}
            onPress={() => void save(reps, "camera")}
          />
        </>
      )}
      <Button
        title="Complete manually without camera"
        disabled={busy || saved}
        secondary
        onPress={() => { if(reps>0)void save(reps, "manual");else {setManualCount(String(exercise.reps));setManualOpen(true);} }}
      />
      {manualOpen && !saved && <Card><Copy>How many reps did you complete?</Copy><TextInput accessibilityLabel="Reps completed" keyboardType="number-pad" value={manualCount} onChangeText={setManualCount} style={s.input}/><Button title={`Save ${manualCount || '0'} reps manually`} disabled={busy || !/^\d+$/.test(manualCount) || Number(manualCount)<1 || Number(manualCount)>100} onPress={()=>void save(Number(manualCount),'manual')}/></Card>}
      {!!message && <Copy>{message}</Copy>}
    </Page>
  );
}
