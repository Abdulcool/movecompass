import React from "react";
import {Text,View} from 'react-native';
import '../src/global.css';
import { Stack } from "expo-router";
import { SessionProvider } from "../src/session";
import { colors } from "../src/ui";
export default function Layout() {
  return (
    <SessionProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerTitle: ()=><View role="banner"><Text accessibilityRole="header" aria-level={2} style={{fontSize:18,fontWeight:'600',color:colors.ink}}>MoveCompass</Text></View>,
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="exercise/[id]"
          options={{ title: "Your exercise" }}
        />
        <Stack.Screen name="track" options={{ title: "Guided tracking" }} />
        <Stack.Screen name="history" options={{ title: "Your activity history" }} />
        <Stack.Screen name="admin" options={{ title: "CCCARE staff" }} />
        <Stack.Screen
          name="settings"
          options={{ title: "Device & backend settings" }}
        />
      </Stack>
    </SessionProvider>
  );
}
