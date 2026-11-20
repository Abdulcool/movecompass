import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Pressable, Text, View } from "react-native";
import { api, baseUrl, type User, type Event, type Device } from "./api";
import { notify, unregisterNotifications } from "./notifications";
import { colors } from "./ui";
function useLive(
  url: string,
  token: string,
  onMessage: (data: any) => void,
  onReconnect: () => void,
) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const reconnect = useRef(onReconnect);
  reconnect.current = onReconnect;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!token || !url) return;
    let stopped = false;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    function connect() {
      socket = new WebSocket(
        url.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(token),
      );
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        reconnect.current();
      };
      socket.onmessage = (e) => {
        try {
          handler.current(JSON.parse(e.data));
        } catch {}
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        setConnected(false);
        if (!stopped)
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
      };
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
      setConnected(false);
    };
  }, [url, token]);
  return connected;
}
function useSessionState() {
  const [token, setToken] = useState(""),
    [user, setUser] = useState<User | null>(null),
    [setting, setSetting] = useState(""),
    [ready, setReady] = useState(false),
    [events, setEvents] = useState<Event[]>([]),
    [total, setTotal] = useState(0),
    [weeklyTotal, setWeeklyTotal] = useState(0),
    [devices, setDevices] = useState<Device[]>([]),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const base = baseUrl(setting);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [stored, url] = await Promise.all([
          AsyncStorage.getItem("mc-token"),
          AsyncStorage.getItem("mc-backend"),
        ]);
        if (!active) return;
        setSetting(url || "");
        if (stored) {
          const data = await api<{ user: User }>(
            baseUrl(url || ""),
            "/api/me",
            stored,
          );
          if (active) {
            setUser(data.user);
            setToken(stored);
          }
        }
      } catch (e) {
        if (active) setError(String(e));
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api<{ events: Event[]; total: number; weeklyTotal: number }>(
        base,
        "/api/events?limit=200",
        token,
      );
      setEvents(data.events);
      setTotal(data.total); setWeeklyTotal(data.weeklyTotal);
      if (user?.role === "staff")
        setDevices(
          (await api<{ devices: Device[] }>(base, "/api/devices", token))
            .devices,
        );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [base, token, user?.role]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const connected = useLive(
    base,
    token,
    (data) => {
      if (data.kind === "event") {
        void refresh();
        setEvents((current) =>
          [data.event, ...current.filter((e) => e.id !== data.event.id)].slice(
            0,
            200,
          ),
        );
        const message = `${data.event.patientName} completed ${data.event.exerciseName} · ${data.event.reps} reps`;
        setToast(message);
        void notify(message).catch(() => {});
      }
      if (data.kind === "device")
        setDevices((ds) =>
          ds.map((d) =>
            d.deviceId === data.deviceId
              ? {
                  ...d,
                  online: data.online,
                  lastSeen: new Date().toISOString(),
                }
              : d,
          ),
        );
    },
    () => {
      void refresh();
    },
  );
  async function authenticate(
    email: string,
    password: string,
    role: User["role"],
    name?: string,
  ) {
    const result = await api<{ token: string; user: User }>(
      base,
      name ? "/api/auth/register" : "/api/auth/login",
      undefined,
      { email, password, role, ...(name ? { name } : {}) },
    );
    await AsyncStorage.setItem("mc-token", result.token);
    setUser(result.user);
    setToken(result.token);
    setEvents([]);
    setTotal(0); setWeeklyTotal(0);
    setDevices([]);
    setError("");
  }
  async function logout() {
    try { await unregisterNotifications(base, token); }
    catch { setError("Can't sign out safely while offline. Please reconnect and try again."); return false; }
    await AsyncStorage.removeItem("mc-token");
    setToken("");
    setUser(null);
    setTotal(0); setWeeklyTotal(0);
    setEvents([]);
    setDevices([]);
    setToast("");
    return true;
  }
  async function saveBackend(url: string) {
    if (url && !/^https?:\/\/[^\s]+$/.test(url))
      throw new Error("Enter a full http:// or https:// URL.");
    await AsyncStorage.setItem("mc-backend", url.replace(/\/$/, ""));
    if (url !== setting && !(await logout())) throw new Error("Reconnect before changing the backend.");
    setSetting(url.replace(/\/$/, ""));
  }
  async function complete(
    exercise: { id: string; name: string },
    reps: number,
    source: "manual" | "camera",
    angles: Record<string, number> = {},
  ) {
    const { event } = await api<{ event: Event }>(
      base,
      "/api/completions",
      token,
      {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        reps,
        source,
        angles,
      },
    );
    setEvents((es) => [event, ...es.filter((e) => e.id !== event.id)]);
    await refresh();
    return event;
  }
  return {
    token,
    user,
    base,
    setting,
    ready,
    events,
    total,
    weeklyTotal,
    devices,
    error,
    toast,
    setToast,
    connected,
    refresh,
    authenticate,
    logout,
    saveBackend,
    complete,
  };
}
const Context = createContext<ReturnType<typeof useSessionState> | null>(null);
export function SessionProvider({ children }: React.PropsWithChildren) {
  const state = useSessionState();
  return (
    <Context.Provider value={state}>
      {children}
      {!!state.toast && (
        <Pressable
          accessibilityRole="alert"
          onPress={() => state.setToast("")}
          style={{
            position: "absolute",
            top: 48,
            right: 20,
            left: 20,
            alignSelf: "center",
            backgroundColor: colors.green,
            padding: 20,
            borderRadius: 16,
            zIndex: 100,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            {state.toast}
          </Text>
          <Text style={{ color: "white", fontSize: 12, marginTop: 6 }}>
            Tap to dismiss
          </Text>
        </Pressable>
      )}
    </Context.Provider>
  );
}
export function useSession() {
  const state = useContext(Context);
  if (!state) throw new Error("Missing SessionProvider");
  return state;
}
