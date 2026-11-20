import React from "react";
import { View } from "react-native";
import { Button, s } from "./ui";
export const regions = [
  ["upper-back", "Upper back"],
  ["shoulders", "Shoulders"],
  ["hips", "Hips"],
  ["legs", "Legs"],
] as const;
export function BodyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (region: string) => void;
}) {
  return (
    <View style={s.row}>
      {regions.map(([id, label]) => (
        <Button
          key={id}
          title={label}
          secondary={value !== id}
          onPress={() => onChange(value === id ? "" : id)}
        />
      ))}
    </View>
  );
}
