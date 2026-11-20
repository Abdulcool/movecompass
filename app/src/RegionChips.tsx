import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { regions, type BodyPickerProps } from "../body/regions";
import { colors, s } from "./ui";
export function RegionChips({ value, onChange }: BodyPickerProps) {
  return <View style={s.row}>{regions.map(([id, label]) =>
    <Pressable key={id} accessibilityRole="button" accessibilityLabel={label}
      {...(Platform.OS === "web" ? { "aria-pressed": value === id } : { accessibilityState: { selected: value === id } })}
      style={[s.button, value !== id && s.secondary]}
      onPress={() => onChange(value === id ? "" : id)}>
      <Text style={{ color: value === id ? "white" : colors.green, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>)}
  </View>;
}
