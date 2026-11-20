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
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(
  base: string,
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  if (!base) throw new Error("Set your backend URL in settings first.");
  let response: Response;
  try { response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }); } catch { throw new ApiError("Can't reach MoveCompass — retrying.", 0); }
  const data = await response.json().catch(() => ({}));
  if (response.status === 413) throw new ApiError("Request too large", 413);
  if (!response.ok)
    throw new ApiError(data.errors?.join(". ") || data.error || "Please try again in a moment.", response.status);
  return data;
}
