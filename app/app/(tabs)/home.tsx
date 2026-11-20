import React from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { exercises } from "@movecompass/pose";
import { useSession } from "../../src/session";
import { Button, Card, Copy, Page, Title, s } from "../../src/ui";
import { ExerciseCard } from "../../src/ExerciseCard";
import {remainingExercises} from '../../src/daily-plan';
export default function Home() {
  const { user, dailySets } = useSession();
  const daily = exercises.filter((e) =>
    ["wall-angels", "pendulum", "sit-to-stand"].includes(e.id),
  );
  const count = daily.filter((e) => (dailySets[e.id]||0)>=e.sets).length;
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
      <Text style={s.heading}>{count===daily.length?'All done for today':'Your next safe step'}</Text>
      {count===daily.length && <Copy>You’ve completed all your planned sets. Rest, recover and follow your care team’s advice.</Copy>}
      {remainingExercises(daily,dailySets).map((e) => (
        <ExerciseCard key={e.id} exercise={e} />
      ))}
      <Copy>
        This feature is guidance, not diagnosis. Follow your CCCARE instructor’s
        advice.
      </Copy>
    </Page>
  );
}
