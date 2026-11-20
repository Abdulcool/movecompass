import React from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { type Exercise } from "@movecompass/pose";
import { Button, Card, Copy, s } from "./ui";
import { useSession } from './session';
export function ExerciseCard({
  exercise,
}: {
  exercise: Exercise;
}) {
  const count=useSession().dailySets[exercise.id]||0;
  return (
    <Card>
      <Text style={s.eyebrow}>
        {exercise.group.replace("-", " ")} · {exercise.goal.replace("-", " ")}
      </Text>
      <Text style={s.heading}>{exercise.name}</Text>
      <Copy>{exercise.description}</Copy>
      <Copy>
        {exercise.sets} sets × {exercise.reps} reps · {exercise.minutes} min ·{" "}
        {exercise.difficulty}
        {count>=exercise.sets ? ' · Completed today' : count>0 ? ` · Set ${count} of ${exercise.sets} done` : ` · 0 of ${exercise.sets} sets done`}
      </Copy>
      <Button
        title={`Open ${exercise.name}`}
        secondary
        onPress={() =>
          router.push({
            pathname: "/exercise/[id]",
            params: { id: exercise.id },
          })
        }
      />
    </Card>
  );
}
