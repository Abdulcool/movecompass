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
import { enqueueSet, flushSets, outboxKey,queuedSetCounts } from './outbox';
import { AppState,Pressable,Text,View } from "react-native";
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import { api, ApiError, baseUrl, type User, type Event, type Device } from "./api";
import { notify } from "./notifications";
import { clearSession } from './logout';
import {retryPushUnregisters} from './push-subscription';
import { colors } from "./ui";
import { mergeEvents } from './event-history';
import { wakeRetry } from './wake';
import {replayFrom,markToastShown} from './unread-toasts';
function useLive(
  url: string,
  token: string,
  cursorKey: string,
  onMessage: (data: any) => void,
  onReconnect: () => void,
  shownKey='',
) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const reconnect = useRef(onReconnect);
  reconnect.current = onReconnect;
  const [connected, setConnected] = useState(false);
  const currentToken=useRef(token);currentToken.current=token;
  useEffect(() => {
    if (!token || !url || !cursorKey) return;
    let stopped = false;
    let socket: WebSocket|undefined;
    let timer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let cursor:number|undefined;
    let writes:Promise<unknown>=Promise.resolve();
    const remember=(seq:number)=>{cursor=seq;writes=writes.catch(()=>{}).then(()=>AsyncStorage.setItem(cursorKey,String(seq)));};
    function connect() {
      if(stopped || socket?.readyState===WebSocket.OPEN || socket?.readyState===WebSocket.CONNECTING)return;
      clearTimeout(timer);
      const connection = new WebSocket(
        url.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(token)+(cursor===undefined?'':`&since=${cursor}`),
      );
      socket=connection;
      connection.onopen = () => {
        if(stopped||socket!==connection)return;
        attempt = 0;
        setConnected(true);
        reconnect.current();
      };
      connection.onmessage = (e) => {
        if(stopped||socket!==connection||currentToken.current!==token)return;
        try {
          const data=JSON.parse(e.data);
          if(data.kind==='ready'&&Number.isSafeInteger(data.seq)) {if(cursor!==undefined&&data.seq<cursor)handler.current({kind:'reset'});remember(data.seq);return;}
          if(data.kind==='event'&&Number.isSafeInteger(data.event?.seq)) {if(cursor!==undefined&&data.event.seq<=cursor)return;remember(data.event.seq);}
          handler.current(data);
        } catch {}
      };
      connection.onerror = () => connection.close();
      connection.onclose = () => {
        if(socket!==connection)return;
        setConnected(false);
        if (!stopped)
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
      };
    }
    void Promise.all([AsyncStorage.getItem(cursorKey),shownKey?AsyncStorage.getItem(shownKey):Promise.resolve(null)]).then(([raw,shown])=>{if(shownKey)cursor=replayFrom(raw,shown);else if(raw!==null && Number.isSafeInteger(Number(raw))&&Number(raw)>=0)cursor=Number(raw);if(!stopped)connect();}).catch(()=>{if(shownKey)cursor=0;if(!stopped)connect();});
    const online=()=>{attempt=0;clearTimeout(timer);const old=socket;socket=undefined;old?.close();connect();};
    const foreground=AppState.addEventListener('change',state=>{if(state==='active')online();});
    if(typeof window!=='undefined')window.addEventListener('online',online);
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
      setConnected(false);
      if(typeof window!=='undefined')window.removeEventListener('online',online);
      foreground.remove();
    };
  }, [url, token,cursorKey,shownKey]);
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
    [toasts, setToasts] = useState<{id:string;message:string;seq?:number}[]>([]),
    [error, setError] = useState("");
  const [authStatus,setAuthStatus]=useState('');
  const base = baseUrl(setting);
  const shownKey=user?.role==='staff'?`mc-last-shown:${base}:${user.id}`:'';
  const [foreground,setForeground]=useState(true);
  useEffect(()=>{
    const update=()=>setForeground((typeof document==='undefined'||document.visibilityState==='visible')&&(!AppState.currentState||AppState.currentState==='active'));
    update();const listener=AppState.addEventListener('change',update);
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',update);
    return()=>{listener.remove();if(typeof document!=='undefined')document.removeEventListener('visibilitychange',update);};
  },[]);
  const authoritativeDaily=useRef<Record<string,number>>({});
  async function updateDailySets(counts?:Record<string,number>,fresh=true){
    if(counts)authoritativeDaily.current=fresh?counts:Object.fromEntries(Array.from(new Set([...Object.keys(authoritativeDaily.current),...Object.keys(counts)])).map(id=>[id,Math.max(authoritativeDaily.current[id]||0,counts[id]||0)]));
    const pending=user?await queuedSetCounts(outboxKey(base,user.id)):{};
    const next={...authoritativeDaily.current};for(const [id,count]of Object.entries(pending))next[id]=(next[id]||0)+count;
    setDailySets(next);
  }
  const toast=toasts[0]?.message||'',toastId=toasts[0]?.id;
  const setToast=useCallback((message:string)=>setToasts(items=>message?[...items,{id:randomUUID(),message}]:items.slice(1)),[]);
  useEffect(()=>{if(!toastId||!foreground)return;const timer=setTimeout(()=>setToasts(items=>items[0]?.id===toastId?items.slice(1):items),8000);return()=>clearTimeout(timer);},[toastId,foreground]);
  const shownSeq=toasts[0]?.seq;
  useEffect(()=>{if(shownKey&&shownSeq!==undefined&&foreground)void markToastShown(shownKey,shownSeq).catch(()=>{});},[shownKey,shownSeq,toastId,foreground]);
  const activeToken=useRef(token),knownEvents=useRef(new Set<string>()),snapshotSeq=useRef(0),refreshVersion=useRef(0);
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
    const version=++refreshVersion.current;
    try {
      const data = await api<{ events: Event[]; total: number; weeklyTotal: number; dailySets:Record<string,number>;snapshotSeq:number }>(
        base,
        "/api/events?limit=200",
        token,
      );
      if(activeToken.current!==token||version!==refreshVersion.current)return;
      const fresh=data.snapshotSeq>=snapshotSeq.current;
      for(const e of data.events){knownEvents.current.add(e.id);snapshotSeq.current=Math.max(snapshotSeq.current,e.seq||0);}
      setEvents(current=>mergeEvents(data.events,current));
      setTotal(t=>fresh?data.total:Math.max(t,data.total)); setWeeklyTotal(t=>fresh?data.weeklyTotal:Math.max(t,data.weeklyTotal));
      await updateDailySets(data.dailySets,fresh);
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
      await updateDailySets();
      if(result.rejected.length)setToast(`${result.rejected.length} saved set(s) couldn't sync. They are kept on this device for review. Please contact your care team.`);
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
        snapshotSeq.current=Math.max(snapshotSeq.current,data.event.seq||0);
        void refresh();
        setEvents(current=>mergeEvents(current,[data.event]));
        const message = `${data.event.patientName} completed ${data.event.exerciseName} · ${data.event.reps} reps · set ${data.event.setNumber || 1}/${data.event.totalSets || 2}`;
        setToasts(items=>items.some(item=>item.id===data.event.id)?items:[...items,{id:data.event.id,message,seq:data.event.seq}]);
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
    shownKey,
  );
  async function authenticate(
    email: string,
    password: string,
    role: User["role"],
    name?: string,
  ) {
    let result:{token:string;user:User};
    try{result=await wakeRetry(timeout=>api<{ token: string; user: User }>(
      base,
      name ? "/api/auth/register" : "/api/auth/login",
      undefined,
      { email, password, role, ...(name ? { name } : {}) },
      'POST',timeout,
    ),()=>setAuthStatus('Waking the server…'));}finally{setAuthStatus('');}
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
    try { await clearSession(base,token); }
    catch { setError("Can't sign out safely while offline. Please reconnect and try again."); return false; }
    setToken("");
    setUser(null);
    setDailySets({});
    setTotal(0); setWeeklyTotal(0);
    setEvents([]);
    setDevices([]);
    setToasts([]);
    setQueuedCount(0);
    setError('');setOffline(false);
    return true;
  }
  async function saveBackend(url: string) {
    if (url && !/^https?:\/\/[^\s]+$/.test(url))
      throw new Error("Enter a full http:// or https:// URL.");
    if (url !== setting && token && !(await logout())) throw new Error("Reconnect before changing the backend.");
    await AsyncStorage.setItem("mc-backend", url.replace(/\/$/, ""));
    setSetting(url.replace(/\/$/, ""));
  }
  async function complete(
    exercise: { id: string; name: string;sets:number },
    reps: number,
    source: "manual" | "camera",
    angles: Record<string, number> = {},
    clientId = randomUUID(),
  ) {
    if(!user)throw new Error('Please sign in to save this set.');
    if((dailySets[exercise.id]||0)>=exercise.sets)throw new Error('All sets done today');
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
    await updateDailySets();
    const result=await flushSets(key,item=>api<{event:Event}>(base,'/api/completions',token,item));
    setQueuedCount(result.pending);
    if(result.rejected.some(item=>item.clientId===clientId)){void refresh();throw new Error("This set couldn't sync. All sets may already be done today. It is kept on this device for review.");}
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
    authStatus,
    toast,
    toastCount:toasts.length,
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
  const insets=useSafeAreaInsets();
  useEffect(()=>{
    const retry=()=>{void retryPushUnregisters().catch(()=>{});};
    retry();const timer=setInterval(retry,15000);
    const active=AppState.addEventListener('change',state=>{if(state==='active')retry();});
    if(typeof window!=='undefined')window.addEventListener('online',retry);
    return()=>{clearInterval(timer);active.remove();if(typeof window!=='undefined')window.removeEventListener('online',retry);};
  },[]);
  useEffect(()=>{if(typeof navigator!=='undefined' && 'serviceWorker' in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);
  return (
    <Context.Provider value={state}>
      {children}
      {((!state.ready && !!state.error)||state.offline||state.queuedCount>0) && <View accessibilityRole="alert" style={{position:"absolute",bottom:80,left:16,right:16,padding:12,backgroundColor:colors.paper,zIndex:101}}><Text>{!state.ready ? state.error : state.queuedCount>0 ? 'Saved on this device — will sync when back online' : 'Offline — reconnecting to your care team.'}</Text></View>}
      {!!state.toast && (
        <View
          accessibilityRole="alert"
          style={{
            position: "absolute",
            top: Math.max(insets.top,12)+52,
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
          <Pressable accessibilityRole="button" onPress={()=>state.setToast('')}><Text style={{ color: "white", fontSize: 12, marginTop: 6 }}>
            Dismiss current update · {state.toastCount} {state.toastCount===1?'update':'updates'} waiting
          </Text></Pressable>
        </View>
      )}
    </Context.Provider>
  );
}
export function useSession() {
  const state = useContext(Context);
  if (!state) throw new Error("Missing SessionProvider");
  return state;
}
