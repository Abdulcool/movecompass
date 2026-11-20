import { Platform } from "react-native";
import Constants from "expo-constants";
import { api } from "./api";
export async function enableNotifications(base: string, token: string) {
  if (Platform.OS === "web") {
    if (!("Notification" in window))
      throw new Error("Browser notifications are not supported here.");
    if ((await Notification.requestPermission()) !== "granted")
      throw new Error("Notification permission was not granted.");
    return "Browser notifications enabled while this tab is open.";
  }
  const Notifications = await import("expo-notifications");
  await Notifications.setNotificationChannelAsync("care-events", {
    name: "Care events",
    importance: Notifications.AndroidImportance.HIGH,
  });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error("Notification permission was not granted.");
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId)
    return "Local notifications enabled. Remote push needs an EAS project ID and a development build.";
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api(base, "/api/push/register", token, { token: data });
  return "Local notifications and remote push enabled.";
}
export async function notify(body: string) {
  if (Platform.OS === "web") {
    if ("Notification" in window && Notification.permission === "granted")
      new Notification("MoveCompass care update", { body });
    return;
  }
  const N = await import("expo-notifications");
  if ((await N.getPermissionsAsync()).granted)
    await N.scheduleNotificationAsync({
      content: { title: "MoveCompass care update", body },
      trigger: null,
    });
}
