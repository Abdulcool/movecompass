import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from 'expo-crypto';
import { enqueueSet, flushSets, outboxKey } from './outbox';
import { Pressable, Text, View } from "react-native";
import { api, ApiError, baseUrl, type User, type Event, type Device } from "./api";
import { notify, unregisterNotifications } from "./notifications";
import { colors } from "./ui";
import { mergeEvents } from './event-history';
function useLive(
  url: string,
  token: string,
  cursorKey: string,
  onMessage: (data: any) => void,
  onReconnect: () => void,
) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const reconnect = useRef(onReconnect);
  reconnect.current = onReconnect;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!token || !url || !cursorKey) return;
    let stopped = false;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let cursor:number|undefined;
    let writes:Promise<unknown>=Promise.resolve();
    const remember=(seq:number)=>{cursor=seq;writes=writes.catch(()=>{}).then(()=>AsyncStorage.setItem(cursorKey,String(seq)));};
    function connect() {
      if(stopped || socket?.readyState===WebSocket.OPEN || socket?.readyState===WebSocket.CONNECTING)return;
      clearTimeout(timer);
      socket = new WebSocket(
        url.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(token)+(cursor===undefined?'':`&since=${cursor}`),
      );
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
        reconnect.current();
      };
      socket.onmessage = (e) => {
        try {
          const data=JSON.parse(e.data);
          if(data.kind==='ready'&&Number.isSafeInteger(data.seq)) {if(cursor!==undefined&&data.seq<cursor)handler.current({kind:'reset'});remember(data.seq);return;}
          if(data.kind==='event'&&Number.isSafeInteger(data.event?.seq)) {if(cursor!==undefined&&data.event.seq<=cursor)return;remember(data.event.seq);}
          handler.current(data);
        } catch {}
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        setConnected(false);
        if (!stopped)
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
      };
    }
    void AsyncStorage.getItem(cursorKey).then(raw=>{if(raw!==null && Number.isSafeInteger(Number(raw))&&Number(raw)>=0)cursor=Number(raw);if(!stopped)connect();}).catch(()=>{if(!stopped)connect();});
    const online=()=>{attempt=0;connect();};
    if(typeof window!=='undefined')window.addEventListener('online',online);
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
      setConnected(false);
      if(typeof window!=='undefined')window.removeEventListener('online',online);
    };
  }, [url, token,cursorKey]);
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
    [dailySets, setDailySets] = useState<Record<string,number>>({}),
    [queuedCount, setQueuedCount] = useState(0),
    [offline, setOffline] = useState(false),
    [devices, setDevices] = useState<Device[]>([]),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const base = baseUrl(setting);
  const activeToken=useRef(token),knownEvents=useRef(new Set<string>()),snapshotSeq=useRef(0);
  activeToken.current=token;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function restore() {
      try {
        const [stored, url] = await Promise.all([
          AsyncStorage.getItem("mc-token"),
          AsyncStorage.getItem("mc-backend"),
        ]);
        if (!active) return;
        setSetting(url || "");
        setToken(stored || "");
        if (stored) {
          const cached=await AsyncStorage.getItem('mc-user');
          if(cached && active){try{setUser(JSON.parse(cached));setReady(true);}catch{}}
          const data = await api<{ user: User }>(
            baseUrl(url || ""),
            "/api/me",
            stored,
          );
          if (active) {
            setUser(data.user);
            setToken(stored);
            await AsyncStorage.setItem('mc-user',JSON.stringify(data.user));
          }
        }
        if (active) { setReady(true); setError(""); }
      } catch (e) {
        if (!active) return;
        if (e instanceof ApiError && e.status === 401) {
          await AsyncStorage.multiRemove(["mc-token","mc-user"]);setToken("");setUser(null);setReady(true);
        } else {
          setError("Can't reach MoveCompass — retrying.");timer=setTimeout(restore,5000);
          setOffline(true);
        }
      }
    }
    void restore();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api<{ events: Event[]; total: number; weeklyTotal: number; dailySets:Record<string,number> }>(
        base,
        "/api/events?limit=200",
        token,
      );
      if(activeToken.current!==token)return;
      for(const e of data.events){knownEvents.current.add(e.id);snapshotSeq.current=Math.max(snapshotSeq.current,e.seq||0);}
      setEvents(current=>mergeEvents(data.events,current));
      setTotal(t=>Math.max(t,data.total)); setWeeklyTotal(t=>Math.max(t,data.weeklyTotal));
      setDailySets(current=>Object.fromEntries(Array.from(new Set([...Object.keys(current),...Object.keys(data.dailySets)])).map(id=>[id,Math.max(current[id]||0,data.dailySets[id]||0)])));
      if (user?.role === "staff")
        setDevices(
          (await api<{ devices: Device[] }>(base, "/api/devices", token))
            .devices,
        );
      setError("");
      setOffline(false);
    } catch (e) {
      setError((e as Error).message);
      if(e instanceof ApiError && (e.status===0 || e.status>=500))setOffline(true);
    }
  }, [base, token, user?.role]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const syncQueued=useCallback(async()=>{
    if(!user || !token)return;
    try {
      const result=await flushSets(outboxKey(base,user.id),item=>api<{event:Event}>(base,'/api/completions',token,item));
      setQueuedCount(result.pending);
      if(result.sent.length){setEvents(es=>[...result.sent,...es.filter(e=>!result.sent.some(s=>s.id===e.id))]);void refresh();}
      if(result.error){setOffline(result.error.status===0 || result.error.status>=500);setError(result.error.message);}
    }catch {setError("This device couldn't read your saved sets. Please contact your care team before clearing app data.");}
  },[base,token,user?.id,refresh]);
  useEffect(()=>{
    void syncQueued();const timer=setInterval(()=>void syncQueued(),15000);
    const online=()=>{void syncQueued();void refresh();};
    if(typeof window!=='undefined')window.addEventListener('online',online);
    return()=>{clearInterval(timer);if(typeof window!=='undefined')window.removeEventListener('online',online);};
  },[syncQueued,refresh]);
  const connected = useLive(
    base,
    token,
    user?`mc-cursor:${base}:${user.id}`:'',
    (data) => {
      if(data.kind==='reset'){knownEvents.current.clear();snapshotSeq.current=0;setEvents([]);setTotal(0);setWeeklyTotal(0);setDailySets({});void refresh();return;}
      if (data.kind === "event") {
        if(!knownEvents.current.has(data.event.id) && data.event.seq>snapshotSeq.current){setTotal(t=>t+1);if(Date.now()-Date.parse(data.event.completedAt)<7*86400000)setWeeklyTotal(t=>t+1);}
        knownEvents.current.add(data.event.id);
        void refresh();
        setEvents(current=>mergeEvents(current,[data.event]));
        const message = `${data.event.patientName} completed ${data.event.exerciseName} · ${data.event.reps} reps · set ${data.event.setNumber || 1}/${data.event.totalSets || 2}`;
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
      void syncQueued();
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
    await AsyncStorage.setItem('mc-user',JSON.stringify(result.user));
    setUser(result.user);
    setToken(result.token);
    setEvents([]);
    knownEvents.current.clear();snapshotSeq.current=0;
    setTotal(0); setWeeklyTotal(0);
    setDailySets({});
    setDevices([]);
    setError("");
  }
  async function logout() {
    try { await unregisterNotifications(base, token); await api(base, "/api/auth/logout", token, {}); }
    catch { setError("Can't sign out safely while offline. Please reconnect and try again."); return false; }
    await AsyncStorage.multiRemove(["mc-token","mc-user"]);
    setToken("");
    setUser(null);
    setDailySets({});
    setTotal(0); setWeeklyTotal(0);
    setEvents([]);
    setDevices([]);
    setToast("");
    setQueuedCount(0);
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
    clientId = randomUUID(),
  ) {
    if(!user)throw new Error('Please sign in to save this set.');
    const key=outboxKey(base,user.id);
    await enqueueSet(key,{
        clientId,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        reps,
        source,
        angles,
        completedAt:new Date().toISOString(),
    });
    const result=await flushSets(key,item=>api<{event:Event}>(base,'/api/completions',token,item));
    setQueuedCount(result.pending);
    const event=result.sent.find(e=>e.exerciseId===exercise.id);
    if(!event){setOffline(!result.error || result.error.status===0 || result.error.status>=500);return {queued:true as const};}
    setEvents((es) => [event, ...es.filter((e) => e.id !== event.id)]);
    void refresh();
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
    dailySets,
    offline,
    queuedCount,
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
  useEffect(()=>{if(typeof navigator!=='undefined' && 'serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);
  return (
    <Context.Provider value={state}>
      {children}
      {((!state.ready && !!state.error)||state.offline||state.queuedCount>0) && <View accessibilityRole="alert" style={{position:"absolute",bottom:80,left:16,right:16,padding:12,backgroundColor:colors.paper,zIndex:101}}><Text>{!state.ready ? state.error : state.queuedCount>0 ? 'Saved on this device — will sync when back online' : 'Offline — reconnecting to your care team.'}</Text></View>}
      {!!state.toast && (
        <Pressable
          accessibilityRole="alert"
          onPress={() => state.setToast("")}
          style={{
            position: "absolute",
            bottom: 92,
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
