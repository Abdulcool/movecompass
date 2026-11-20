import React from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { type Exercise } from "@movecompass/pose";
import { Button, Card, Copy, s } from "./ui";
export function ExerciseCard({
  exercise,
  done = false,
}: {
  exercise: Exercise;
  done?: boolean;
}) {
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
        {done ? " · Completed today" : ""}
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
