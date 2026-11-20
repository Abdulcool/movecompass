import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { useSession } from "../src/session";
import { Button, Card, Copy, Field, Page, Title, s } from "../src/ui";
import { FreeDemoBanner } from '../src/FreeDemoBanner';
export default function Login() {
  const session = useSession();
  const [role, setRole] = useState<"patient" | "staff">("patient"),
    [create, setCreate] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!session.ready)
    return (
      <Page>
        <Copy>Opening MoveCompass…</Copy>
      </Page>
    );
  if (session.user)
    return (
      <Redirect href={session.user.role === "staff" ? "/admin" : "/(tabs)/home"} />
    );
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (create && !name.trim()) throw new Error("Please enter your name.");
      await session.authenticate(
        email.trim(),
        password,
        role,
        create ? name.trim() : undefined,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page>
      <View
        style={{
          maxWidth: 560,
          width: "100%",
          alignSelf: "center",
          gap: 24,
          paddingTop: 28,
        }}
      >
        <Image
          source={require("../assets/icon.png")}
          style={{ width: 76, height: 76, borderRadius: 22 }}
        />
        <Text style={s.eyebrow}>MOVECOMPASS · CCCARE COMPANION</Text>
        <Title>Your next safe step.</Title>
        <FreeDemoBanner/>
        {!!session.authStatus && <Copy>{session.authStatus}</Copy>}
        <Copy>
          A little movement. A little encouragement. Care that stays connected.
        </Copy>
        <Card>
          <View style={s.row}>
            <Button
              title="Log in"
              secondary={create}
              onPress={() => setCreate(false)}
            />
            <Button
              title="Create account"
              secondary={!create}
              onPress={() => {
                setCreate(true);
                setRole("patient");
              }}
            />
          </View>
          <Copy>I’m here as a</Copy>
          <View style={s.row}>
            <Button
              title="Patient"
              secondary={role !== "patient"}
              onPress={() => setRole("patient")}
            />
            <Button
              title="CCCARE staff"
              disabled={create}
              secondary={role !== "staff"}
              onPress={() => setRole("staff")}
            />
          </View>
          {create && (
            <Field label="Full name" value={name} onChangeText={setName} />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {create && (
            <Copy>
              Choose a password with at least 8 characters for your new patient account.
            </Copy>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          <Button
            title={
              busy
                ? "Please wait…"
                : create
                  ? "Create patient account"
                  : "Continue"
            }
            disabled={busy}
            onPress={() => void submit()}
          />
        </Card>
        <Button
          title="Backend settings"
          secondary
          onPress={() => router.push("/settings")}
        />
      </View>
    </Page>
  );
}
