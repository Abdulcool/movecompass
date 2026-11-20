import React from "react";
import { useIsFocused } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
export const colors = {
  paper: "#F7F6F1",
  ink: "#13231F",
  muted: "#66736E",
  green: "#2D765A",
  wash: "#E5F3EB",
  coral: "#E78367",
  line: "#E4E9E4",
};
export function Page({ children,scrollRef }: React.PropsWithChildren<{scrollRef?:React.RefObject<ScrollView|null>}>) {
  const focused = useIsFocused();
  if (!focused) return null;
  return (
    <ScrollView ref={scrollRef} style={s.page} contentContainerStyle={s.content}>
      {children}
    </ScrollView>
  );
}
export function Title({ children }: React.PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={s.title}>
      {children}
    </Text>
  );
}
export function Copy({ children }: React.PropsWithChildren) {
  return <Text style={s.copy}>{children}</Text>;
}
export function Card({ children }: React.PropsWithChildren) {
  return <View style={s.card}>{children}</View>;
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}
    >
      <Text
        style={{
          color: secondary ? colors.green : "white",
          fontSize: 16,
          fontWeight: "600",
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field(props: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        placeholderTextColor={colors.muted}
        {...props}
        style={s.input}
      />
    </View>
  );
}
export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  content: {
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    padding: 24,
    gap: 20,
    paddingBottom: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.8,
  },
  copy: { fontSize: 16, lineHeight: 25, color: colors.muted },
  card: {
    backgroundColor: "white",
    borderRadius: 22,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: colors.wash },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 15,
    fontSize: 16,
    backgroundColor: "white",
    color: colors.ink,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  row: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: colors.green,
  },
  error: { color: "#A03728", fontSize: 15 },
  heading: { fontSize: 21, fontWeight: "600", color: colors.ink },
});
