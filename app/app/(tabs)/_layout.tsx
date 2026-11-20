import React from "react";
import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';
import { BottomTabBar } from 'expo-router/layouts/Tabs';
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
      tabBar={props=><View role="navigation" aria-label="Primary navigation"><BottomTabBar {...props}/></View>}
      screenOptions={({route})=>({
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor:colors.muted,
        headerStyle: { backgroundColor: colors.paper },
        tabBarStyle: { backgroundColor: "white",height:84,paddingBottom:16,paddingTop:8 },
        tabBarLabelStyle:{fontSize:14,fontWeight:'600'},
        headerTitle: "MoveCompass",
        tabBarIcon: ({ color }) => <Ionicons color={typeof color==='string'?color:colors.muted} size={25} name={route.name==='home'?'home-outline':route.name==='plan'?'list-outline':'person-circle-outline'}/>,
      })}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="plan" options={{ title: "Plan" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
