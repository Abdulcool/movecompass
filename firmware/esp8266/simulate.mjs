import WebSocket from 'ws';
import { EventEmitter } from 'node:events';
import { pathToFileURL } from 'node:url';

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
  if (insecureTls) log('WARNING: TLS certificate verification disabled for demo');
  const events = new EventEmitter(), seen = new Set();
  let socket, stopped = false, reconnectTimer, backoff = 1000, timers = [], activeEvent;
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
      cancelAlert(); log('LED OFF; alert finished'); events.emit('finished', event);
    }, 4000));
    events.emit('alert', event);
  }
  function connect() {
    log('Connecting backend; status LED slow blink');
    socket = new WebSocket(url, { rejectUnauthorized: !insecureTls, maxPayload: 32768, handshakeTimeout: 10000 });
    socket.on('open', () => { backoff = 1000; log('Backend connected; idle LED off'); events.emit('connected'); });
    socket.on('message', raw => {
      const event = completionForPatient(raw, patientId, seen);
      if (event) alert(event); else events.emit('ignored', raw);
    });
    socket.on('error', () => log('WebSocket error; check network, host, TLS and credentials'));
    socket.on('close', () => {
      if (stopped) return;
      log(`Backend disconnected; status LED slow blink; retry in ${backoff}ms`);
      events.emit('disconnected');
      reconnectTimer = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000);
    });
  }
  connect();
  return {
    events,
    acknowledge() {
      if (!activeEvent) return;
      cancelAlert(); log('ACK: LED OFF; buzzer OFF (local only)'); events.emit('acknowledged');
    },
    stop() { stopped = true; clearTimeout(reconnectTimer); cancelAlert(); socket.terminate(); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const sim = createVirtualEsp({
      backendUrl: process.env.BACKEND_URL || 'http://127.0.0.1:8080',
      deviceId: process.env.DEVICE_ID, deviceKey: process.env.DEVICE_KEY,
      patientId: process.env.PATIENT_ID, insecureTls: process.env.INSECURE_TLS === 'true',
    });
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', text => { if (text.trim().toLowerCase() === 'ack') sim.acknowledge(); });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { sim.stop(); process.stdin.pause(); });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
