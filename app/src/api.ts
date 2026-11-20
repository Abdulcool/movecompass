import { Platform } from "react-native";
export interface User {
  id: string;
  email: string;
  name: string;
  role: "patient" | "staff";
}
export interface Event {
  id: string;
  patientId: string | null;
  patientName: string;
  exerciseId: string;
  exerciseName: string;
  reps: number;
  completedAt: string;
  source: string;
}
export interface Device {
  deviceId: string;
  name: string;
  patientId: string;
  patientEmail: string;
  online: boolean;
  lastSeen: string | null;
}
export function baseUrl(setting: string) {
  return Platform.OS === "web"
    ? window.location.origin
    : (setting || process.env.EXPO_PUBLIC_API_URL || "").replace(/\/$/, "");
}
export async function api<T>(
  base: string,
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  if (!base) throw new Error("Set your backend URL in settings first.");
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.errors?.join(". ") || data.error || "Request failed");
  return data;
}
