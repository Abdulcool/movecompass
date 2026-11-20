import React from "react";
import { useIsFocused } from "expo-router";
import {
  Pressable,
  Platform,
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
export const textSize=(size:number)=>(Platform.OS==='web'?`${size/16}rem`:size) as number;
export function Page({ children,scrollRef }: React.PropsWithChildren<{scrollRef?:React.RefObject<React.ComponentRef<typeof ScrollView>|null>}>) {
  const focused = useIsFocused();
  if (!focused) return null;
  return (
    <ScrollView role="main" ref={scrollRef} style={s.page} contentContainerStyle={s.content}>
      {children}
    </ScrollView>
  );
}
export function Title({ children,level=1 }: React.PropsWithChildren<{level?:1|2|3}>) {
  return (
    <Text accessibilityRole="header" aria-level={level} style={s.title}>
      {children}
    </Text>
  );
}
export function Copy({ children,live=false }: React.PropsWithChildren<{live?:boolean}>) {
  return <Text role={live?'status':undefined} accessibilityLiveRegion={live?'polite':undefined} style={s.copy}>{children}</Text>;
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
          fontSize: textSize(16),
          flexShrink:1,
          textAlign:'center',
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
    fontSize: Platform.OS==='web'?'clamp(1.35rem, 4vw, 2rem)' as unknown as number:textSize(32),
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.8,
  },
  copy: { fontSize: textSize(16), lineHeight: textSize(25), color: colors.muted },
  card: {
    backgroundColor: "white",
    borderRadius: 22,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  button: {
    maxWidth:'100%',
    flexShrink:1,
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
    fontSize: textSize(16),
    backgroundColor: "white",
    color: colors.ink,
  },
  label: { fontSize: textSize(14), fontWeight: "600", color: colors.ink },
  row: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },
  eyebrow: {
    fontSize: textSize(12),
    fontWeight: "700",
    letterSpacing: 2,
    color: colors.green,
  },
  error: { color: "#A03728", fontSize: textSize(15) },
  heading: { fontSize: textSize(21), fontWeight: "600", color: colors.ink },
});
