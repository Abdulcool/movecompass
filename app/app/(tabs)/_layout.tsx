import React from "react";
import { Text } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSession } from "../../src/session";
import { colors, Copy, Page } from "../../src/ui";
export default function Layout() {
  const { user, ready } = useSession();
  if (!ready)
    return (
      <Page>
        <Copy>Loading…</Copy>
      </Page>
    );
  if (!user) return <Redirect href="/" />;
  if (user.role === "staff") return <Redirect href="/admin" />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.green,
        headerStyle: { backgroundColor: colors.paper },
        tabBarStyle: { backgroundColor: "white" },
        headerTitle: "MoveCompass",
        tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>●</Text>,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
