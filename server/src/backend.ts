import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { getExercise } from '../../packages/pose/src/exercises';

type Role = 'patient' | 'staff';
interface User { id: string; email: string; name: string; role: Role; password_hash: string }
interface Identity { id: string; role: Role; exp: number }
interface Device { id: string; name: string; patient_id: string; key_hash: string; last_seen: string | null }
export interface CompletionEvent {
  id: string; type: 'exercise_completed'; patientId: string | null; patientName: string;
  exerciseId: string; exerciseName: string; reps: number; deviceId: string;
  completedAt: string; transport: 'wifi' | 'app' | 'camera'; source: 'manual' | 'camera' | 'device';
  angles: Record<string, number>;
}
interface Options {
  dataDir?: string; webDist?: string; jwtSecret?: string; allowUnregisteredDevices?: boolean;
  sendPush?: (messages: ExpoPushMessage[]) => Promise<void>;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const email = (v: unknown): v is string => text(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const repsValid = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0 && Number(v) <= 10000;
const timestampValid = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v) || !Number.isFinite(Date.parse(v))) return false;
  const [year, month, day] = v.slice(0, 10).split('-').map(Number);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
};
const hash = (key: string) => createHash('sha256').update(key).digest('hex');
const keyMatches = (key: unknown, expected: string) => typeof key === 'string' && timingSafeEqual(Buffer.from(hash(key)), Buffer.from(expected));
const publicUser = (u: User, role = u.role) => ({ id: u.id, email: u.email, name: u.name, role });

export function createBackend(options: Options = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.DATA_DIR ?? './data');
  mkdirSync(dataDir, { recursive: true });
  const secretFile = join(dataDir, 'jwt-secret');
  let secret = options.jwtSecret ?? process.env.JWT_SECRET;
  if (!secret) {
    if (!existsSync(secretFile)) {
      try { writeFileSync(secretFile, randomBytes(48).toString('hex'), {mode: 0o600, flag: 'wx'}); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }
    secret = readFileSync(secretFile, 'utf8').trim();
  }
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  const allowLegacy = options.allowUnregisteredDevices ?? (process.env.ALLOW_UNREGISTERED_DEVICES ?? 'true') === 'true';
  const db = new Database(join(dataDir, 'movecompass.sqlite'));
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT REFERENCES users(id), payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_patient ON events(patient_id, id);
    CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES users(id), key_hash TEXT NOT NULL, last_seen TEXT);
    CREATE TABLE IF NOT EXISTS push_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL);
  `);
  const byEmail = (value: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(value.toLowerCase()) as User | undefined;
  const byId = (value: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(value) as User | undefined;
  for (const [address, name, role] of [['janedoe@gmail.com', 'Jane Doe', 'patient'], ['staff@cccare.ca', 'CCCARE Staff', 'staff']] as const) {
    if (!byEmail(address)) db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(randomUUID(), address, name, role, bcrypt.hashSync('123', 10));
  }
  const deviceById = (id: string) => db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined;
  const tokenFor = (u: User, role: Role) => jwt.sign({role}, secret, {subject: u.id, expiresIn: '7d', issuer: 'movecompass', audience: 'movecompass-app'});
  const verify = (token: string): Identity | null => {
    try {
      const p = jwt.verify(token, secret, {algorithms: ['HS256'], issuer: 'movecompass', audience: 'movecompass-app'});
      if (typeof p === 'string' || !p.sub || !p.exp || !['patient', 'staff'].includes(p.role)) return null;
      const user = byId(p.sub);
      if (!user || p.role !== user.role) return null;
      return { id: p.sub, role: p.role, exp: p.exp };
    } catch { return null; }
  };
  const app = express(); app.disable('x-powered-by'); app.use(cors()); app.use(express.json({limit: '32kb'}));
  const server = createServer(app);
  const wss = new WebSocketServer({noServer: true, maxPayload: 32768});
  const clients = new Map<WebSocket, {user?: Identity; device?: Device; alive: boolean}>();
  const identity = (res: Response) => res.locals.identity as Identity;
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const user = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!user) { res.status(401).json({error: 'Authentication required'}); return; }
    res.locals.identity = user; next();
  };
  const staff = (_req: Request, res: Response, next: NextFunction) => {
    if (identity(res).role !== 'staff') { res.status(403).json({error: 'Staff access required'}); return; } next();
  };
  const send = (socket: WebSocket, data: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  const broadcast = (message: unknown, patientId: string | null) => {
    for (const [socket, client] of clients) {
      if (client.user && client.user.exp * 1000 <= Date.now()) { socket.close(1008, 'Session expired'); continue; }
      if ((client.device && client.device.patient_id === patientId) || client.user?.role === 'staff' || client.user?.id === patientId) send(socket, message);
    }
  };
  const expo = new Expo();
  const defaultPush = async (messages: ExpoPushMessage[]) => {
    for (const chunk of expo.chunkPushNotifications(messages)) {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') db.prepare('DELETE FROM push_tokens WHERE token = ?').run(chunk[i].to);
      });
    }
  };
  const pendingPush = new Set<Promise<void>>();
  const persist = (event: CompletionEvent) => {
    db.prepare('INSERT INTO events(patient_id, payload) VALUES (?, ?)').run(event.patientId, JSON.stringify(event));
    broadcast({kind: 'event', event}, event.patientId);
    const tokens = db.prepare("SELECT token FROM push_tokens WHERE role = 'staff'").all() as {token: string}[];
    if (tokens.length) {
      const messages: ExpoPushMessage[] = tokens.map(({token}) => ({to: token, sound: 'default', title: 'MoveCompass care update', body: `${event.patientName} completed ${event.exerciseName}: ${event.reps} reps.`, data: {event}}));
      const pending = Promise.resolve().then(() => (options.sendPush ?? defaultPush)(messages)).catch(() => { console.warn('Expo push delivery failed'); });
      pendingPush.add(pending); void pending.finally(() => pendingPush.delete(pending));
    }
    return event;
  };
  const touch = (id: string) => db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), id);
  app.get('/healthz', (_req, res) => { db.prepare('SELECT 1').get(); res.json({ok: true}); });
  app.post('/api/auth/register', async (req, res) => {
    const b = req.body;
    if (!object(b) || !email(b.email) || !text(b.name) || typeof b.password !== 'string' || Buffer.byteLength(b.password) < 8 || Buffer.byteLength(b.password) > 72 || (b.role !== undefined && b.role !== 'patient')) {
      res.status(400).json({errors: ['Valid email, name, password (8–72 bytes), and patient role required']}); return;
    }
    const passwordHash = await bcrypt.hash(b.password, 10);
    if (byEmail(b.email)) { res.status(409).json({error: 'Email already registered'}); return; }
    const user: User = {id: randomUUID(), email: b.email.toLowerCase(), name: b.name.trim(), role: 'patient', password_hash: passwordHash};
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(user.id, user.email, user.name, user.role, user.password_hash);
    res.status(201).json({token: tokenFor(user, user.role), user: publicUser(user)});
  });
  app.post('/api/auth/login', async (req, res) => {
    const b = req.body;
    if (!object(b) || !email(b.email) || typeof b.password !== 'string' || typeof b.role !== 'string' || !['patient', 'staff'].includes(b.role)) { res.status(400).json({errors: ['email, password and role (patient|staff) required']}); return; }
    const user = byEmail(b.email);
    if (!user || user.role !== b.role || !(await bcrypt.compare(b.password, user.password_hash))) { res.status(401).json({error: 'Invalid credentials or role'}); return; }
    const role = b.role as Role; res.json({token: tokenFor(user, role), user: publicUser(user, role)});
  });
  app.get('/api/me', auth, (_req, res) => { const u = identity(res); res.json({user: publicUser(byId(u.id)!, u.role)}); });
  app.post('/api/completions', auth, (req, res) => {
    const b = req.body; const errors: string[] = [];
    if (!object(b)) { res.status(400).json({errors: ['JSON object required']}); return; }
    if (!text(b.exerciseId)) errors.push('exerciseId required');
    if (!text(b.exerciseName)) errors.push('exerciseName required');
    if (!repsValid(b.reps)) errors.push('reps must be an integer from 0 to 10000');
    if (typeof b.source !== 'string' || !['manual', 'camera'].includes(b.source)) errors.push('source must be manual or camera');
    if (b.angles !== undefined && (!object(b.angles) || Object.entries(b.angles).some(([k, v]) => !text(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 360))) errors.push('angles must map joint names to finite ROM values from 0 to 360');
    if (errors.length) { res.status(400).json({errors}); return; }
    const user = byId(identity(res).id)!;
    const event = persist({id: randomUUID(), type: 'exercise_completed', patientId: user.id, patientName: user.name, exerciseId: b.exerciseId as string, exerciseName: b.exerciseName as string, reps: b.reps as number, source: b.source as 'manual' | 'camera', transport: b.source === 'camera' ? 'camera' : 'app', deviceId: b.source === 'camera' ? 'movecompass-camera' : 'movecompass-patient-app', completedAt: new Date().toISOString(), angles: (b.angles ?? {}) as Record<string, number>});
    res.status(201).json({event});
  });
  app.post('/api/esp32/notify', (req, res) => {
    const b = req.body; const errors: string[] = [];
    if (!object(b)) { res.status(400).json({errors: ['JSON object required']}); return; }
    if (b.type !== 'exercise_completed') errors.push('type must be exercise_completed');
    for (const key of ['deviceId', 'patientName', 'exerciseId', 'exerciseName']) if (!text(b[key])) errors.push(`${key} required`);
    if (!repsValid(b.reps)) errors.push('reps must be an integer from 0 to 10000');
    if (!timestampValid(b.completedAt)) errors.push('completedAt must be an ISO8601 timestamp with timezone');
    if (typeof b.transport !== 'string' || !['wifi', 'app', 'camera'].includes(b.transport)) errors.push('transport must be wifi, app or camera');
    if (errors.length) { res.status(400).json({errors}); return; }
    const device = deviceById(b.deviceId as string);
    if ((device && !keyMatches(req.get('X-Device-Key'), device.key_hash)) || (!device && !allowLegacy)) { res.status(401).json({error: 'Invalid device credentials'}); return; }
    const owner = device ? byId(device.patient_id) : (db.prepare("SELECT * FROM users WHERE lower(name) = lower(?) AND role = 'patient' ORDER BY id LIMIT 1").get(b.patientName) as User | undefined);
    const event = persist({id: randomUUID(), type: 'exercise_completed', deviceId: b.deviceId as string, patientId: owner?.id ?? null, patientName: owner?.name ?? b.patientName as string, exerciseId: b.exerciseId as string, exerciseName: b.exerciseName as string, reps: b.reps as number, completedAt: b.completedAt as string, transport: b.transport as CompletionEvent['transport'], source: 'device', angles: {}});
    if (device) touch(device.id);
    res.status(202).json({event});
  });
  app.get('/api/esp32/latest', (req, res) => {
    const user = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const device = deviceById(req.get('X-Device-Id') ?? '');
    const validDevice = device && keyMatches(req.get('X-Device-Key'), device.key_hash);
    if (user?.role !== 'staff' && !validDevice) { res.status(user ? 403 : 401).json({error: 'Staff or device authentication required'}); return; }
    const row = (user?.role === 'staff' ? db.prepare('SELECT payload FROM events ORDER BY id DESC LIMIT 1').get() : db.prepare('SELECT payload FROM events WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(device!.patient_id)) as {payload: string} | undefined;
    res.json({event: row ? JSON.parse(row.payload) : null});
  });
  app.get('/api/events', auth, (req, res) => {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) { res.status(400).json({errors: ['limit must be an integer from 1 to 200']}); return; }
    const u = identity(res);
    const rows = (u.role === 'staff' ? db.prepare('SELECT payload FROM events ORDER BY id DESC LIMIT ?').all(limit) : db.prepare('SELECT payload FROM events WHERE patient_id = ? ORDER BY id DESC LIMIT ?').all(u.id, limit)) as {payload: string}[];
    res.json({events: rows.map(r => JSON.parse(r.payload))});
  });
  app.post('/api/devices', auth, staff, (req, res) => {
    const b = req.body;
    if (!object(b) || !text(b.name) || !email(b.patientEmail)) { res.status(400).json({errors: ['name and patientEmail required']}); return; }
    const patient = byEmail(b.patientEmail);
    if (!patient || patient.role !== 'patient') { res.status(400).json({errors: ['Patient account not found']}); return; }
    const deviceId = `esp8266-${randomUUID()}`, deviceKey = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?, NULL)').run(deviceId, b.name, patient.id, hash(deviceKey));
    res.status(201).json({deviceId, deviceKey});
  });
  app.get('/api/devices', auth, staff, (_req, res) => {
    const rows = db.prepare('SELECT d.*, u.email AS patientEmail FROM devices d JOIN users u ON u.id = d.patient_id ORDER BY d.rowid DESC').all() as (Device & {patientEmail: string})[];
    res.json({devices: rows.map(d => ({deviceId: d.id, name: d.name, patientId: d.patient_id, patientEmail: d.patientEmail, lastSeen: d.last_seen, online: [...clients.values()].some(c => c.device?.id === d.id)}))});
  });
  app.post('/api/push/register', auth, (req, res) => {
    if (!object(req.body) || typeof req.body.token !== 'string' || !Expo.isExpoPushToken(req.body.token)) { res.status(400).json({errors: ['Valid Expo push token required']}); return; }
    const u = identity(res);
    db.prepare('INSERT INTO push_tokens VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id, role=excluded.role').run(req.body.token, u.id, u.role);
    res.status(201).json({ok: true});
  });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const user = verify(url.searchParams.get('token') ?? '');
    const device = deviceById(url.searchParams.get('deviceId') ?? '');
    if (url.pathname !== '/ws' || (!user && (!device || !keyMatches(url.searchParams.get('key'), device.key_hash)))) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      const client = {user: user ?? undefined, device: user ? undefined : device, alive: true};
      clients.set(ws, client);
      if (client.device) { touch(client.device.id); broadcast({kind: 'device', deviceId: client.device.id, online: true}, client.device.patient_id); }
      ws.on('error', () => {});
      ws.on('pong', () => { client.alive = true; if (client.device) touch(client.device.id); });
      ws.on('close', () => {
        clients.delete(ws);
        if (client.device) {
          touch(client.device.id);
          const online = [...clients.values()].some(c => c.device?.id === client.device!.id);
          broadcast({kind: 'device', deviceId: client.device.id, online}, client.device.patient_id);
        }
      });
      ws.on('message', raw => {
        if (!client.device) { send(ws, {kind: 'error', error: 'Only devices may submit button events'}); return; }
        try {
          const b: unknown = JSON.parse(raw.toString());
          if (!object(b) || b.kind !== 'button' || (b.exerciseId !== undefined && !text(b.exerciseId)) || (b.reps !== undefined && !repsValid(b.reps))) throw new Error('Invalid button payload');
          const exercise = getExercise(b.exerciseId as string ?? 'sit-to-stand');
          const owner = byId(client.device.patient_id)!; touch(client.device.id);
          persist({id: randomUUID(), type: 'exercise_completed', patientId: owner.id, patientName: owner.name, deviceId: client.device.id, exerciseId: exercise.id, exerciseName: exercise.name, reps: b.reps as number ?? exercise.reps, completedAt: new Date().toISOString(), transport: 'wifi', source: 'device', angles: {}});
        } catch { send(ws, {kind: 'error', error: 'Invalid button payload or exerciseId'}); }
      });
    });
  });
  const heartbeat = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.alive || (client.user && client.user.exp * 1000 <= Date.now())) { ws.terminate(); continue; }
      client.alive = false; ws.ping();
    }
  }, 25000); heartbeat.unref();
  const webDist = resolve(options.webDist ?? process.env.WEB_DIST ?? '../app/dist');
  app.use('/api', (_req, res) => { res.status(404).json({error: 'API endpoint not found'}); });
  app.use(express.static(webDist));
  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.includes('.') && existsSync(join(webDist, 'index.html'))) { res.sendFile(join(webDist, 'index.html')); return; }
    res.status(404).json({error: 'Not found'});
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = object(error) && typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({errors: [status === 500 ? 'Internal server error' : 'Invalid JSON request']});
  });
  return {app, server, db, async close() {
    clearInterval(heartbeat);
    for (const ws of clients.keys()) ws.terminate();
    await new Promise<void>(done => wss.close(() => done()));
    await new Promise<void>((done, reject) => server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : done()));
    await Promise.all(pendingPush); db.close();
  }};
}
