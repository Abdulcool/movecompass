import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { getExercise } from "@movecompass/pose";
import { useSession } from "../src/session";
import { api } from "../src/api";
import { enableNotifications } from "../src/notifications";
import { Button, Card, Copy, Field, Page, Title, s } from "../src/ui";
export default function Admin() {
  const session = useSession();
  const [name, setName] = useState(""),
    [patientEmail, setPatientEmail] = useState("janedoe@gmail.com"),
    [patientName, setPatientName] = useState("Jane Doe"),
    [result, setResult] = useState<{
      deviceId: string;
      deviceKey: string;
      pairingCode: string;
      pairingExpiresAt: string;
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!session.ready)
    return (
      <Page>
        <Copy>Loading…</Copy>
      </Page>
    );
  if (!session.user) return <Redirect href="/" />;
  if (session.user.role !== "staff") return <Redirect href="/(tabs)" />;
  const patients = Array.from(
    new Set(session.events.filter((e) => e.patientId).map((e) => e.patientId)),
  ).map((id) => {
    const events = session.events.filter((e) => e.patientId === id);
    return {
      id,
      name: events[0].patientName,
      count: events.length,
      last: events[0].completedAt,
    };
  });
  async function register() {
    setBusy(true);
    setMessage("");
    setResult(null);
    try {
      setResult(
        await api(session.base, "/api/devices", session.token, {
          name,
          patientEmail,
        }),
      );
      await session.refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const host = new URL(session.base || "http://localhost:8080");
  const demoExercise = getExercise("sit-to-stand");
  const config = result
    ? `// Fill in WiFi credentials locally before flashing.\nconst char* WIFI_SSID = "YOUR_2_4_GHZ_WIFI";\nconst char* WIFI_PASS = "YOUR_WIFI_PASSWORD";\nconst char* SERVER_HOST = ${JSON.stringify(host.hostname)};\nconst int SERVER_PORT = ${host.port || (host.protocol === "https:" ? "443" : "80")};\nconst bool USE_TLS = ${host.protocol === "https:"};\nconst char* DEVICE_ID = ${JSON.stringify(result.deviceId)};\nconst char* DEVICE_KEY = ${JSON.stringify(result.deviceKey)};\nconst char* PATIENT_NAME = ${JSON.stringify(patientName)};\nconst char* EXERCISE_ID = ${JSON.stringify(demoExercise.id)};\nconst char* EXERCISE_NAME = ${JSON.stringify(demoExercise.name)};\nconst int REPS = ${demoExercise.reps};`
    : "";
  return (
    <Page>
      <Text style={s.eyebrow}>CCCARE STAFF · LIVE CARE</Text>
      <Title>Every small step, connected.</Title>
      <View style={s.row}>
        <Copy>
          {session.connected ? "● Live connection online" : "○ Reconnecting…"}
        </Copy>
        <Button
          title="Refresh"
          secondary
          onPress={() => void session.refresh()}
        />
        <Button
          title="Settings"
          secondary
          onPress={() => router.push("/settings")}
        />
        <Button
          title="Sign out"
          secondary
          onPress={() => void session.logout()}
        />
      </View>
      {!!session.error && <Text style={s.error}>{session.error}</Text>}
      <Card>
        <Text style={s.heading}>Patient progress</Text>
        <Copy>
          Based on the latest {session.events.length} recorded activities, not a
          full patient directory.
        </Copy>
        {!patients.length && (
          <Copy>Waiting for a patient’s first completion.</Copy>
        )}
        {patients.map((p) => (
          <View key={p.id}>
            <Text style={s.heading}>{p.name}</Text>
            <Copy>
              {p.count} activities · latest {new Date(p.last).toLocaleString()}
            </Copy>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={s.heading}>Notification inbox</Text>
        {!session.events.length && (
          <Copy>Waiting for your first care update.</Copy>
        )}
        {session.events.slice(0, 20).map((e) => (
          <View
            key={e.id}
            style={{
              borderBottomWidth: 1,
              borderColor: "#E4E9E4",
              paddingVertical: 12,
            }}
          >
            <Text style={s.label}>
              {e.patientName} · {e.exerciseName}
            </Text>
            <Copy>
              {e.reps} reps · {e.source} ·{" "}
              {new Date(e.completedAt).toLocaleString()}
            </Copy>
          </View>
        ))}
        <Button
          title="Enable care notifications"
          secondary
          onPress={() =>
            void enableNotifications(session.base, session.token)
              .then(setMessage)
              .catch((e) => setMessage(e.message))
          }
        />
      </Card>
      <Card>
        <Text style={s.heading}>Connected devices</Text>
        {!session.devices.length && (
          <Copy>No boards registered yet. Add your first device below.</Copy>
        )}
        {session.devices.map((d) => (
          <View key={d.deviceId}>
            <Text style={s.label}>
              {d.online ? "🟢" : "⚪"} {d.name} ·{" "}
              {d.online ? "Online" : "Offline"}
            </Text>
            <Copy>
              {d.patientEmail} · Last seen:{" "}
              {d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "Never"}
            </Copy>
            <Text selectable>{d.deviceId}</Text>
          </View>
        ))}
      </Card>
      <Card>
        <Text style={s.heading}>Register a device</Text>
        <Field label="Device name" value={name} onChangeText={setName} />
        <Field label="Patient name for firmware" value={patientName} onChangeText={setPatientName} />
        <Field
          label="Patient email"
          value={patientEmail}
          onChangeText={setPatientEmail}
          autoCapitalize="none"
        />
        <Button
          title={busy ? "Registering…" : "Register device"}
          disabled={busy}
          onPress={() => void register()}
        />
        {!!message && <Copy>{message}</Copy>}
        {result && (
          <>
            <Text style={s.heading}>Pairing code: {result.pairingCode}</Text>
            <Copy>Use this code once in the MoveCompass-Setup WiFi portal before {new Date(result.pairingExpiresAt).toLocaleTimeString()}. Pairing replaces the advanced device key below.</Copy>
            <Button title="Open USB device flasher" onPress={()=>{if(Platform.OS==='web')window.open('/flash.html','_blank','noopener');else router.push('/settings');}}/>
            <Copy>
              Save this secret now. It is shown only once and is not stored by
              this app.
            </Copy>
            <Text selectable>deviceId: {result.deviceId}</Text>
            <Text selectable>deviceKey: {result.deviceKey}</Text>
            <Text style={s.heading}>Firmware configuration</Text>
            <Text
              selectable
              style={{
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize: 13,
                lineHeight: 22,
              }}
            >
              {config}
            </Text>
            <Button
              title="Hide device secret"
              secondary
              onPress={() => setResult(null)}
            />
          </>
        )}
      </Card>
    </Page>
  );
}
