import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export async function pairWithCode({backendUrl,code,insecureTls=false}) {
  if(!/^\d{6}$/.test(code||''))throw new Error('Enter a six-digit pairing code');
  const url=new URL('/api/devices/pair',backendUrl);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Use an HTTP(S) backend address');
  const body=JSON.stringify({code});
  const data=await new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{method:'POST',rejectUnauthorized:!insecureTls,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
      let text='';res.on('data',chunk=>{text+=chunk;if(text.length>8192)req.destroy(new Error('Pairing response too large'));});
      res.on('end',()=>{if(res.statusCode!==200){reject(new Error(`Pairing failed (HTTP ${res.statusCode}); request a fresh code`));return;}try{resolve(JSON.parse(text));}catch{reject(new Error('Invalid pairing response'));}});
    });req.on('error',reject);req.setTimeout(12000,()=>req.destroy(new Error('Pairing timed out')));req.end(body);
  });
  if(typeof data.deviceId!=='string'||!data.deviceId||typeof data.patientId!=='string'||!data.patientId||!validDeviceKey(data.key))throw new Error('Invalid device credentials');
  return {deviceId:data.deviceId,deviceKey:data.key,patientId:data.patientId};
}

export function validDeviceKey(key) {
  return typeof key==='string'&&key.length<=1024&&(/^[a-f\d]{64}$/i.test(key)||/^mc1\.[A-Za-z\d_-]+\.[A-Za-z\d_-]{43}$/.test(key));
}

export function completionForPatient(raw, patientId, seen = new Set()) {
  if (!patientId || Buffer.byteLength(raw) > 4096) return null;
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return null; }
  const event = message?.event;
  if (message?.kind !== 'event' || event?.type !== 'exercise_completed' ||
      typeof event.id !== 'string' || !event.id || event.patientId !== patientId ||
      typeof event.exerciseName !== 'string' || !event.exerciseName ||
      !Number.isInteger(event.reps) || event.reps < 1 || event.reps > 100 || seen.has(event.id)) return null;
  seen.add(event.id);
  if (seen.size > 16) seen.delete(seen.values().next().value);
  return event;
}

export function createVirtualEsp({ backendUrl, deviceId, deviceKey, patientId, insecureTls = false, log = console.log }) {
  if (!deviceId || !deviceKey || !patientId) throw new Error('DEVICE_ID, DEVICE_KEY and PATIENT_ID are required');
  const url = new URL('/ws', backendUrl);
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) throw new Error('Use an HTTP(S) or WS(S) backend URL');
  url.protocol = ['https:', 'wss:'].includes(url.protocol) ? 'wss:' : 'ws:';
  url.searchParams.set('deviceId', deviceId); url.searchParams.set('key', deviceKey);
  url.searchParams.set('ack','1');
  if (insecureTls) log('WARNING: TLS certificate verification disabled for demo');
  const events = new EventEmitter(), seen = new Set();
  let socket, stopped = false, paused=false, cursor, reconnectTimer, backoff = 1000, timers = [], activeEvent;
  const queue=[];
  function acknowledgeDelivery(event){if(!Number.isSafeInteger(event?.seq))return;cursor=Math.max(cursor||0,event.seq);if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({kind:'ack',seq:event.seq}));}
  function nextAlert(){if(!activeEvent&&queue.length)alert(queue.shift());}
  function cancelAlert() { for (const timer of timers) clearTimeout(timer); timers = []; activeEvent = undefined; }
  function alert(event) {
    cancelAlert(); activeEvent = event;
    log(`EVENT ${JSON.stringify(event)}`);
    log('FLASH GPIO2 active-low: 5 x (100ms ON / 100ms OFF), then ON 3000ms; buzzer follows if fitted');
    for (let i = 0; i < 5; i++) {
      timers.push(setTimeout(() => log(`LED ON (flash ${i + 1}/5)`), i * 200));
      timers.push(setTimeout(() => log('LED OFF'), i * 200 + 100));
    }
    timers.push(setTimeout(() => log('LED ON (hold 3000ms)'), 1000));
    timers.push(setTimeout(() => {
      cancelAlert(); acknowledgeDelivery(event); log('LED OFF; alert finished'); events.emit('finished', event);nextAlert();
    }, 4000));
    events.emit('alert', event);
  }
  function connect() {
    if(stopped||paused)return;
    if(cursor!==undefined)url.searchParams.set('since',String(cursor));
    log('Connecting backend; status LED slow blink');
    socket = new WebSocket(url, { rejectUnauthorized: !insecureTls, maxPayload: 32768, handshakeTimeout: 10000 });
    socket.on('open', () => { backoff = 1000; log('Backend connected; idle LED off'); events.emit('connected'); });
    socket.on('message', raw => {
      let data;try{data=JSON.parse(raw.toString());}catch{}
      if(data?.kind==='ready'&&Number.isSafeInteger(data.seq)){if(!activeEvent&&!queue.length)cursor=data.seq;return;}
      if(Number.isSafeInteger(data?.event?.seq)&&cursor!==undefined&&data.event.seq<=cursor){acknowledgeDelivery(data.event);return;}
      const event = completionForPatient(raw, patientId, seen);
      if (event) {queue.push(event);nextAlert();} else events.emit('ignored', raw);
    });
    socket.on('error', () => log('WebSocket error; check network, host, TLS and credentials'));
    socket.on('close', () => {
      if (stopped) return;
      log(`Backend disconnected; status LED slow blink; retry in ${backoff}ms`);
      events.emit('disconnected');
      if(!paused)reconnectTimer = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 60000);
    });
  }
  connect();
  return {
    events,
    pause(){paused=true;clearTimeout(reconnectTimer);socket.terminate();},
    resume(){paused=false;connect();},
    acknowledge() {
      if (!activeEvent) return;
      const event=activeEvent;cancelAlert();acknowledgeDelivery(event);log('ACK: LED OFF; buzzer OFF (no completion created)');events.emit('acknowledged');nextAlert();
    },
    stop() { stopped = true; clearTimeout(reconnectTimer); cancelAlert(); socket.terminate(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const backendUrl=process.env.BACKEND_URL || 'http://127.0.0.1:8080';
    const credentials=process.env.PAIRING_CODE ? await pairWithCode({backendUrl,code:process.env.PAIRING_CODE,insecureTls:process.env.INSECURE_TLS==='true'}) : {deviceId:process.env.DEVICE_ID,deviceKey:process.env.DEVICE_KEY,patientId:process.env.PATIENT_ID};
    const sim = createVirtualEsp({
      backendUrl, ...credentials, insecureTls: process.env.INSECURE_TLS === 'true',
    });
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', text => { if (text.trim().toLowerCase() === 'ack') sim.acknowledge(); });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { sim.stop(); process.stdin.pause(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
