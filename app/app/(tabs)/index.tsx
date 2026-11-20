import React from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { exercises } from "@movecompass/pose";
import { useSession } from "../../src/session";
import { Button, Card, Copy, Page, Title, s } from "../../src/ui";
import { ExerciseCard } from "../../src/ExerciseCard";
export default function Home() {
  const { user, events } = useSession();
  const daily = exercises.filter((e) =>
    ["wall-angels", "pendulum", "sit-to-stand"].includes(e.id),
  );
  const today = new Date().toDateString();
  const completed = new Set(
    events
      .filter((e) => new Date(e.completedAt).toDateString() === today)
      .map((e) => e.exerciseId),
  );
  const count = daily.filter((e) => completed.has(e.id)).length;
  return (
    <Page>
      <Text style={s.eyebrow}>YOUR DAILY COMPANION</Text>
      <Title>Hello, {user?.name.split(" ")[0]}.</Title>
      <Copy>Let’s make today feel a little easier.</Copy>
      <Card>
        <Text style={s.heading}>Today’s dosage</Text>
        <Title>{Math.round((count / 3) * 100)}%</Title>
        <Copy>
          {count} of 3 planned activities completed today. Move at your own
          pace.
        </Copy>
        <Button
          title="Explore your plan"
          onPress={() => router.push("/(tabs)/plan")}
        />
      </Card>
      <Text style={s.heading}>Your next safe step</Text>
      {daily.map((e) => (
        <ExerciseCard key={e.id} exercise={e} done={completed.has(e.id)} />
      ))}
      <Copy>
        This feature is guidance, not diagnosis. Follow your CCCARE instructor’s
        advice.
      </Copy>
    </Page>
  );
}
