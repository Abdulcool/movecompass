import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createHash, createHmac, randomInt, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join,extname } from 'node:path';
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import { getExercise, exercises } from '../../packages/pose/src/exercises';

type Role = 'patient' | 'staff';
interface User { id: string; email: string; name: string; role: Role; password_hash: string }
interface Identity { id: string; role: Role; exp: number; jti: string }
interface Device { id: string; name: string; patient_id: string; key_hash: string; last_seen: string | null }
interface Client {user?:Identity;device?:Device;alive:boolean;cursor:number;ack?:boolean;pending?:number;replaying?:boolean;waiting?:boolean}
export interface CompletionEvent {
  id: string; type: 'exercise_completed'; patientId: string | null; patientName: string;
  exerciseId: string; exerciseName: string; reps: number; deviceId: string;
  completedAt: string; transport: 'wifi' | 'app' | 'camera'; source: 'manual' | 'camera' | 'device';
  angles: Record<string, number>;
  setNumber?: number; totalSets?: number;
  seq?: number;
}
interface Options {
  seedDemo?: boolean;
  devicePairingSecret?:string;
  trustProxy?:number;
  dataDir?: string; webDist?: string; jwtSecret?: string; allowUnregisteredDevices?: boolean;
  sendPush?: (messages: ExpoPushMessage[]) => Promise<void>;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 200;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const email = (v: unknown): v is string => text(v) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const repsValid = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 100;
const knownExercise = (id: unknown) => exercises.find(e => e.id === id);
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
  const pairingSecret=options.devicePairingSecret??process.env.DEVICE_PAIRING_SECRET;
  if(pairingSecret&&pairingSecret.length<32)throw new Error('DEVICE_PAIRING_SECRET must be at least 32 characters');
  const allowLegacy = options.allowUnregisteredDevices ?? process.env.ALLOW_UNREGISTERED_DEVICES === 'true';
  const db = new Database(join(dataDir, 'movecompass.sqlite'));
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT REFERENCES users(id), payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_patient ON events(patient_id, id);
    CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, name TEXT NOT NULL, patient_id TEXT NOT NULL REFERENCES users(id), key_hash TEXT NOT NULL, last_seen TEXT);
    CREATE TABLE IF NOT EXISTS push_tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revoked_tokens (jti TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS submission_keys (owner TEXT NOT NULL, key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner, key));
    CREATE TABLE IF NOT EXISTS patient_timezones (user_id TEXT PRIMARY KEY REFERENCES users(id), zone TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS pairing_codes (code_hash TEXT PRIMARY KEY, device_id TEXT NOT NULL UNIQUE REFERENCES devices(id), expires INTEGER NOT NULL);
  `);
  const byEmail = (value: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(value.toLowerCase()) as User | undefined;
  const byId = (value: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(value) as User | undefined;
  const publicPasswords = [process.env.DEMO_PATIENT_PASSWORD, process.env.DEMO_STAFF_PASSWORD];
  const publicSeed = publicPasswords.some(Boolean);
  if (publicSeed && publicPasswords.some(p => !p || Buffer.byteLength(p) < 8 || Buffer.byteLength(p) > 72)) throw new Error('Both demo passwords must contain 8–72 bytes');
  if ((options.seedDemo ?? process.env.SEED_DEMO === '1') || publicSeed) {
    for (const [i, [address, name, role]] of ([['janedoe@gmail.com', 'Jane Doe', 'patient'], ['staff@cccare.ca', 'CCCARE Staff', 'staff']] as const).entries()) {
      const password = publicSeed ? publicPasswords[i]! : '123';
      const existing = byEmail(address);
      if (!existing) db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(randomUUID(), address, name, role, bcrypt.hashSync(password, 10));
      else if (publicSeed && !bcrypt.compareSync(password, existing.password_hash)) db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), existing.id);
    }
  }
  const deviceById = (id: string) => db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Device | undefined;
  const deviceCredential=(id:string,patientEmail:string)=>{
    if(!pairingSecret)return randomBytes(32).toString('hex');
    const payload=Buffer.from(JSON.stringify({deviceId:id,patientEmail,nonce:randomBytes(16).toString('hex')})).toString('base64url');
    return `mc1.${payload}.${createHmac('sha256',pairingSecret).update(payload).digest('base64url')}`;
  };
  const recoverDevice=(id:string,key:unknown):Device|undefined=>{
    const existing=deviceById(id);
    if(existing)return keyMatches(key,existing.key_hash)?existing:undefined;
    if(!pairingSecret||typeof key!=='string'||key.length>1024)return;
    try{
      const [version,payload,signature,extra]=key.split('.');if(version!=='mc1'||!payload||!signature||extra)return;
      const expected=createHmac('sha256',pairingSecret).update(payload).digest('base64url');
      if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return;
      const proof=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
      if(proof.deviceId!==id||!email(proof.patientEmail))return;
      const owner=byEmail(proof.patientEmail);if(!owner||owner.role!=='patient')return;
      db.prepare('INSERT INTO devices(id,name,patient_id,key_hash) VALUES (?, ?, ?, ?)').run(id,'Recovered board',owner.id,hash(key));
      return deviceById(id);
    }catch{return;}
  };
  const codeHash = (code:string) => createHmac('sha256',secret).update(code).digest('hex');
  const pairingCode = (deviceId:string) => {
    db.prepare('DELETE FROM pairing_codes WHERE expires <= ? OR device_id = ?').run(Date.now(),deviceId);
    let code: string;
    do {code=String(randomInt(1000000)).padStart(6,'0');}while(db.prepare('SELECT 1 FROM pairing_codes WHERE code_hash = ?').get(codeHash(code)));
    const expires=Date.now()+15*60000;
    db.prepare('INSERT INTO pairing_codes VALUES (?, ?, ?)').run(codeHash(code),deviceId,expires);
    return {pairingCode:code,pairingExpiresAt:new Date(expires).toISOString()};
  };
  const tokenFor = (u: User, role: Role) => jwt.sign({role}, secret, {subject: u.id, jwtid: randomUUID(), expiresIn: '7d', issuer: 'movecompass', audience: 'movecompass-app'});
  const verify = (token: string): Identity | null => {
    try {
      const p = jwt.verify(token, secret, {algorithms: ['HS256'], issuer: 'movecompass', audience: 'movecompass-app'});
      if (typeof p === 'string' || !p.sub || !p.exp || typeof p.jti !== 'string' || !['patient', 'staff'].includes(p.role) || db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(p.jti)) return null;
      const user = byId(p.sub);
      if (!user || p.role !== user.role) return null;
      return { id: p.sub, role: p.role, exp: p.exp, jti: p.jti };
    } catch { return null; }
  };
  const app = express(); app.disable('x-powered-by'); app.use(cors()); app.use(express.json({limit: '32kb'}));
  const proxyHops=options.trustProxy??Number(process.env.TRUST_PROXY??1);
  if(!Number.isSafeInteger(proxyHops)||proxyHops<0)throw new Error('TRUST_PROXY must be a nonnegative number of trusted proxy hops');
  app.set('trust proxy',proxyHops);
  const attempts = new Map<string, {count: number; expires: number}>();
  const throttle = (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    const key = `${req.originalUrl.split('?')[0].toLowerCase().replace(/\/+$/, '')}:${req.ip}`;
    const bucket = attempts.get(key) ?? {count: 0, expires: now + 60000};
    attempts.set(key, bucket);
    if (++bucket.count > 10) { res.set('Retry-After', String(Math.ceil((bucket.expires - now) / 1000))).status(429).json({error: 'Too many attempts. Please wait a minute and try again.'}); return; }
    next();
  };
  app.use(['/api/auth/login', '/api/auth/register', '/api/devices/pair', '/api/devices/recover'], throttle);
  const server = createServer(app);
  const wss = new WebSocketServer({noServer: true, maxPayload: 32768});
  const clients = new Map<WebSocket, Client>();
  const latestSeq=()=> (db.prepare('SELECT coalesce(max(id),0) seq FROM events').get() as {seq:number}).seq;
  const decode=(row:{id:number;payload:string}):CompletionEvent=>({...JSON.parse(row.payload),seq:row.id});
  const identity = (res: Response) => res.locals.identity as Identity;
  const zoneFor = (id:string) => (db.prepare('SELECT zone FROM patient_timezones WHERE user_id = ?').get(id) as {zone:string}|undefined)?.zone || 'UTC';
  const localDay = (timestamp:string,zone:string) => new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
  const dailyCounts = (id:string,at=new Date().toISOString()) => {
    const zone=zoneFor(id),day=localDay(at,zone),time=Date.parse(at),counts:Record<string,number>={};
    const rows=db.prepare("SELECT payload FROM events WHERE patient_id = ? AND julianday(json_extract(payload, '$.completedAt')) BETWEEN julianday(?) AND julianday(?)").all(id,new Date(time-2*86400000).toISOString(),new Date(time+2*86400000).toISOString()) as {payload:string}[];
    for(const row of rows){const e=JSON.parse(row.payload) as CompletionEvent;if(localDay(e.completedAt,zone)===day)counts[e.exerciseId]=(counts[e.exerciseId]||0)+1;}
    return counts;
  };
  const auth = (req: Request, res: Response, next: NextFunction) => {
    const user = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    if (!user) { res.status(401).json({error: 'Authentication required'}); return; }
    const zone=req.get('X-Time-Zone');
    if(zone && zone.length<=80 && zone!==zoneFor(user.id)) {try {new Intl.DateTimeFormat('en',{timeZone:zone});db.prepare('INSERT INTO patient_timezones VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET zone=excluded.zone').run(user.id,zone);}catch {}}
    res.locals.identity = user; next();
  };
  const staff = (_req: Request, res: Response, next: NextFunction) => {
    if (identity(res).role !== 'staff') { res.status(403).json({error: 'Staff access required'}); return; } next();
  };
  const send = (socket: WebSocket, data: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  const nextRow=(client:Client,through:number)=>{
    const patient=client.device?.patient_id ?? (client.user?.role==='staff'?undefined:client.user?.id);
    return (patient ? db.prepare('SELECT id,payload FROM events WHERE id > ? AND id <= ? AND patient_id = ? ORDER BY id LIMIT 1').get(client.cursor,through,patient) : db.prepare('SELECT id,payload FROM events WHERE id > ? AND id <= ? ORDER BY id LIMIT 1').get(client.cursor,through)) as {id:number;payload:string}|undefined;
  };
  const pumpDevice=(ws:WebSocket,client:Client)=>{
    if(client.pending!==undefined || client.waiting || ws.readyState!==WebSocket.OPEN)return;
    const through=latestSeq(),row=nextRow(client,through);
    if(!row){send(ws,{kind:'ready',seq:through});return;}
    client.pending=row.id;send(ws,{kind:'event',event:decode(row)});
  };
  const pumpReplay=(ws:WebSocket,client:Client)=>{
    if(!clients.has(ws)||ws.readyState!==WebSocket.OPEN)return;
    const through=latestSeq(),row=nextRow(client,through);
    if(!row){client.replaying=false;send(ws,{kind:'ready',seq:through});return;}
    client.cursor=row.id;
    ws.send(JSON.stringify({kind:'event',event:decode(row)}),error=>{if(!error)pumpReplay(ws,client);});
  };
  const broadcast = (message: unknown, patientId: string | null) => {
    for (const [socket, client] of clients) {
      if (client.user && client.user.exp * 1000 <= Date.now()) { socket.close(1008, 'Session expired'); continue; }
      if ((client.device && client.device.patient_id === patientId) || client.user?.role === 'staff' || client.user?.id === patientId) {
        if(object(message)&&message.kind==='event') {
          if(client.waiting || client.replaying)continue;
          if(client.device&&client.ack){pumpDevice(socket,client);continue;}
        }
        send(socket,message);
      }
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
  const persist = (event: CompletionEvent, submission?: {owner: string; key: string}) => {
    if (submission) {
      const previous=db.prepare('SELECT payload FROM submission_keys WHERE owner = ? AND key = ?').get(submission.owner,submission.key) as {payload:string}|undefined;
      if(previous)return JSON.parse(previous.payload) as CompletionEvent;
    }
    db.transaction(()=>{
      if(event.patientId){event.setNumber=(dailyCounts(event.patientId,event.completedAt)[event.exerciseId]||0)+1;event.totalSets=knownExercise(event.exerciseId)?.sets;}
      const inserted=db.prepare('INSERT INTO events(patient_id, payload) VALUES (?, ?)').run(event.patientId, JSON.stringify(event));
      event.seq=Number(inserted.lastInsertRowid);
      db.prepare('UPDATE events SET payload = ? WHERE id = ?').run(JSON.stringify(event),event.seq);
      if(submission)db.prepare('INSERT INTO submission_keys VALUES (?, ?, ?)').run(submission.owner,submission.key,JSON.stringify(event));
    })();
    broadcast({kind: 'event', event}, event.patientId);
    const tokens = db.prepare("SELECT token FROM push_tokens WHERE role = 'staff'").all() as {token: string}[];
    if (tokens.length) {
      const messages: ExpoPushMessage[] = tokens.map(({token}) => ({to: token, sound: 'default', title: 'MoveCompass care update', body: `${event.patientName} completed ${event.exerciseName}: ${event.reps} reps · set ${event.setNumber}/${event.totalSets}.`, data: {event}}));
      const pending = Promise.resolve().then(() => (options.sendPush ?? defaultPush)(messages)).catch(() => { console.warn('Expo push delivery failed'); });
      pendingPush.add(pending); void pending.finally(() => pendingPush.delete(pending));
    }
    return event;
  };
  const touch = (id: string) => db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').run(new Date().toISOString(), id);
  app.get('/healthz', (_req, res) => { db.prepare('SELECT 1').get(); res.json({ok: true}); });
  app.post('/api/auth/register', async (req, res) => {
    const b = req.body;
    if (!object(b) || !email(b.email) || !text(b.name) || typeof b.password !== 'string' || Array.from(b.password).length < 8 || Buffer.byteLength(b.password) > 72 || (b.role !== undefined && b.role !== 'patient')) {
      res.status(400).json({errors: ['Enter your name and a valid email. Choose a password with at least 8 characters. Staff accounts are provided by your care team.']}); return;
    }
    if (byEmail(b.email)) { res.status(409).json({error: 'Email already registered'}); return; }
    const passwordHash = await bcrypt.hash(b.password, 10);
    if (byEmail(b.email)) { res.status(409).json({error: 'Email already registered'}); return; }
    const user: User = {id: randomUUID(), email: b.email.toLowerCase(), name: b.name.trim(), role: 'patient', password_hash: passwordHash};
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(user.id, user.email, user.name, user.role, user.password_hash);
    res.status(201).json({token: tokenFor(user, user.role), user: publicUser(user)});
  });
  app.post('/api/auth/login', async (req, res) => {
    const b = req.body;
    if (!object(b) || !email(b.email) || typeof b.password !== 'string' || typeof b.role !== 'string' || !['patient', 'staff'].includes(b.role)) { res.status(400).json({errors: ['Enter your email and password, and choose Patient or CCCARE staff']}); return; }
    const user = byEmail(b.email);
    if (!user || !(await bcrypt.compare(b.password, user.password_hash))) { res.status(401).json({error: "Email or password isn't right. Please try again."}); return; }
    if (user.role !== b.role) { res.status(401).json({error: b.role === 'staff' ? "This account isn't a staff account." : 'This is a staff account. Choose CCCARE staff.'}); return; }
    const role = b.role as Role; res.json({token: tokenFor(user, role), user: publicUser(user, role)});
  });
  app.get('/api/me', auth, (_req, res) => { const u = identity(res); res.json({user: publicUser(byId(u.id)!, u.role)}); });
  app.post('/api/devices/pair', (req,res)=>{
    if(!object(req.body) || typeof req.body.code!=='string' || !/^\d{6}$/.test(req.body.code)){res.status(400).json({error:'Enter the six-digit pairing code from your care team.'});return;}
    const paired=db.transaction(()=>{
      const row=db.prepare('SELECT device_id FROM pairing_codes WHERE code_hash = ? AND expires > ?').get(codeHash(req.body.code),Date.now()) as {device_id:string}|undefined;
      if(!row)return null;
      const device=deviceById(row.device_id);if(!device)return null;
      const key=deviceCredential(device.id,byId(device.patient_id)!.email);
      db.prepare('UPDATE devices SET key_hash = ? WHERE id = ?').run(hash(key),device.id);
      db.prepare('DELETE FROM pairing_codes WHERE device_id = ?').run(device.id);
      for(const [socket,client] of clients)if(client.device?.id===device.id)socket.close(1008,'Device paired again');
      return {deviceId:device.id,key,patientId:device.patient_id};
    })();
    if(!paired){res.status(400).json({error:'Pairing code is invalid, expired or already used. Ask your care team for a new code.'});return;}
    res.json(paired);
  });
  app.post('/api/devices/recover',(req,res)=>{
    const b=req.body;
    const device=object(b)&&text(b.deviceId)?recoverDevice(b.deviceId,b.key):undefined;
    if(!device){res.status(401).json({error:'Pair again after your care team has recreated the patient account.'});return;}
    touch(device.id);res.json({deviceId:device.id,key:b.key,patientId:device.patient_id});
  });
  app.post('/api/auth/logout', auth, (_req, res) => {
    const u = identity(res);
    db.prepare('DELETE FROM revoked_tokens WHERE expires < ?').run(Math.floor(Date.now()/1000));
    db.prepare('INSERT OR IGNORE INTO revoked_tokens VALUES (?, ?)').run(u.jti, u.exp);
    for (const [ws, client] of clients) if (client.user?.jti === u.jti) ws.close(1008, 'Signed out');
    res.json({ok: true});
  });
  app.post('/api/completions', auth, (req, res) => {
    const b = req.body; const errors: string[] = [];
    if (!object(b)) { res.status(400).json({errors: ['JSON object required']}); return; }
    if (!knownExercise(b.exerciseId)) errors.push('Choose an exercise from your plan');
    if (!repsValid(b.reps)) errors.push('Reps must be a whole number from 1 to 100');
    if (typeof b.source !== 'string' || !['manual', 'camera'].includes(b.source)) errors.push('source must be manual or camera');
    if (b.clientId !== undefined && (typeof b.clientId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.clientId))) errors.push('A valid set identifier is required');
    if (b.completedAt !== undefined && (typeof b.completedAt !== 'string' || !Number.isFinite(Date.parse(b.completedAt)) || Date.parse(b.completedAt)>Date.now()+300000))errors.push('Check the completion date and device clock');
    if (b.angles !== undefined && (!object(b.angles) || Object.entries(b.angles).some(([k, v]) => !text(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 360))) errors.push('angles must map joint names to finite ROM values from 0 to 360');
    if (errors.length) { res.status(400).json({errors}); return; }
    const user = byId(identity(res).id)!;
    const event = persist({id: randomUUID(), type: 'exercise_completed', patientId: user.id, patientName: user.name, exerciseId: b.exerciseId as string, exerciseName: knownExercise(b.exerciseId)!.name, reps: b.reps as number, source: b.source as 'manual' | 'camera', transport: b.source === 'camera' ? 'camera' : 'app', deviceId: b.source === 'camera' ? 'movecompass-camera' : 'movecompass-patient-app', completedAt: b.completedAt ? new Date(b.completedAt as string).toISOString() : new Date().toISOString(), angles: (b.angles ?? {}) as Record<string, number>}, typeof b.clientId === 'string' ? {owner:`user:${user.id}`,key:b.clientId}:undefined);
    res.status(201).json({event});
  });
  app.post('/api/esp32/notify', (req, res) => {
    const b = req.body; const errors: string[] = [];
    if (!object(b)) { res.status(400).json({errors: ['JSON object required']}); return; }
    if (b.type !== 'exercise_completed') errors.push('type must be exercise_completed');
    for (const key of ['deviceId', 'patientName']) if (!text(b[key])) errors.push(`${key} required`);
    if (!knownExercise(b.exerciseId)) errors.push('Choose an exercise from your plan');
    if (!repsValid(b.reps)) errors.push('Reps must be a whole number from 1 to 100');
    if (!timestampValid(b.completedAt)) errors.push('completedAt must be an ISO8601 timestamp with timezone');
    const submissionKey=req.get('Idempotency-Key')??b.idempotencyKey;
    if(submissionKey!==undefined&&!text(submissionKey))errors.push('A non-empty idempotency key up to 200 characters is required');
    if (typeof b.transport !== 'string' || !['wifi', 'app', 'camera'].includes(b.transport)) errors.push('transport must be wifi, app or camera');
    if (errors.length) { res.status(400).json({errors}); return; }
    const device = deviceById(b.deviceId as string);
    if ((device && !keyMatches(req.get('X-Device-Key'), device.key_hash)) || (!device && !allowLegacy)) { res.status(401).json({error: 'Invalid device credentials'}); return; }
    const owner = device ? byId(device.patient_id) : undefined;
    const event = persist({id: randomUUID(), type: 'exercise_completed', deviceId: b.deviceId as string, patientId: owner?.id ?? null, patientName: owner?.name ?? b.patientName as string, exerciseId: b.exerciseId as string, exerciseName: knownExercise(b.exerciseId)!.name, reps: b.reps as number, completedAt: b.completedAt as string, transport: b.transport as CompletionEvent['transport'], source: 'device', angles: {}},typeof submissionKey==='string'?{owner:`device:${b.deviceId}`,key:submissionKey}:undefined);
    if (device) touch(device.id);
    res.status(202).json({event});
  });
  app.get('/api/esp32/latest', (req, res) => {
    const user = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const device = deviceById(req.get('X-Device-Id') ?? '');
    const validDevice = device && keyMatches(req.get('X-Device-Key'), device.key_hash);
    if (user?.role !== 'staff' && !validDevice) { res.status(user ? 403 : 401).json({error: 'Staff or device authentication required'}); return; }
    const row = (user?.role === 'staff' ? db.prepare('SELECT id,payload FROM events ORDER BY id DESC LIMIT 1').get() : db.prepare('SELECT id,payload FROM events WHERE patient_id = ? ORDER BY id DESC LIMIT 1').get(device!.patient_id)) as {id:number;payload: string} | undefined;
    res.json({event: row ? decode(row) : null});
  });
  app.get('/api/events', auth, (req, res) => {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) { res.status(400).json({errors: ['limit must be an integer from 1 to 200']}); return; }
    const before=req.query.before===undefined?Number.MAX_SAFE_INTEGER:Number(req.query.before);
    if(!Number.isSafeInteger(before)||before<1){res.status(400).json({error:'Invalid history cursor'});return;}
    const u = identity(res);
    const rows = (u.role === 'staff' ? db.prepare('SELECT id,payload FROM events WHERE id < ? ORDER BY id DESC LIMIT ?').all(before,limit) : db.prepare('SELECT id,payload FROM events WHERE patient_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(u.id,before,limit)) as {id:number;payload: string}[];
    const counts = db.prepare(`SELECT count(*) AS total, coalesce(sum(CASE WHEN julianday(json_extract(payload, '$.completedAt')) >= julianday(?) THEN 1 ELSE 0 END), 0) AS weeklyTotal FROM events ${u.role === 'staff' ? '' : 'WHERE patient_id = ?'}`).get(new Date(Date.now()-7*86400000).toISOString(), ...(u.role === 'staff' ? [] : [u.id])) as {total: number; weeklyTotal: number};
    res.json({events: rows.map(decode), ...counts, dailySets:dailyCounts(u.id),snapshotSeq:latestSeq(), nextBefore:rows.length===limit?rows[rows.length-1].id:null});
  });
  app.post('/api/devices', auth, staff, (req, res) => {
    const b = req.body;
    if (!object(b) || !text(b.name) || !email(b.patientEmail)) { res.status(400).json({errors: ['name and patientEmail required']}); return; }
    const patient = byEmail(b.patientEmail);
    if (!patient || patient.role !== 'patient') { res.status(400).json({errors: ['Patient account not found']}); return; }
    const deviceId = `esp8266-${randomUUID()}`, deviceKey = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO devices VALUES (?, ?, ?, ?, NULL)').run(deviceId, b.name, patient.id, hash(deviceKey));
    res.status(201).json({deviceId, deviceKey, ...pairingCode(deviceId)});
  });
  app.post('/api/devices/:id/pair-code', auth, staff, (req,res)=>{
    if(!deviceById(String(req.params.id))){res.status(404).json({error:'Device not found'});return;}
    res.json(pairingCode(String(req.params.id)));
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
  app.delete('/api/push/register', auth, (req, res) => {
    if (!object(req.body) || typeof req.body.token !== 'string' || !Expo.isExpoPushToken(req.body.token)) { res.status(400).json({error: 'A valid push token is required'}); return; }
    db.prepare('DELETE FROM push_tokens WHERE token = ? AND user_id = ?').run(req.body.token, identity(res).id);
    res.json({ok: true});
  });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const user = verify(url.searchParams.get('token') ?? '');
    const device = recoverDevice(url.searchParams.get('deviceId') ?? '',url.searchParams.get('key'));
    if (url.pathname !== '/ws' || (!user && (!device || !keyMatches(url.searchParams.get('key'), device.key_hash)))) { socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return; }
    const rawSince=url.searchParams.get('since'),since=rawSince===null?undefined:Number(rawSince);
    if(since!==undefined && (!Number.isSafeInteger(since)||since<0)){socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');return;}
    wss.handleUpgrade(req, socket, head, ws => {
      const client:Client = {user: user ?? undefined, device: user ? undefined : device, alive: true,cursor:Math.min(since??latestSeq(),latestSeq()),ack:!user&&url.searchParams.get('ack')==='1',waiting:!user&&url.searchParams.get('resume')==='1'};
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
          if(object(b)&&b.kind==='resume'&&client.ack){
            if(b.since!==undefined&&(!Number.isSafeInteger(b.since)||Number(b.since)<0))throw new Error('Invalid cursor');
            client.cursor=Math.min(Number(b.since??latestSeq()),latestSeq());client.pending=undefined;client.waiting=false;pumpDevice(ws,client);return;
          }
          if(object(b)&&b.kind==='ack'&&client.ack){
            if(b.seq===client.pending){client.cursor=Number(b.seq);client.pending=undefined;pumpDevice(ws,client);}return;
          }
          if (!object(b) || b.kind !== 'button' || (b.exerciseId !== undefined && !text(b.exerciseId)) || (b.reps !== undefined && !repsValid(b.reps))) throw new Error('Invalid button payload');
          const exercise = getExercise(b.exerciseId as string ?? 'sit-to-stand');
          const owner = byId(client.device.patient_id)!; touch(client.device.id);
          persist({id: randomUUID(), type: 'exercise_completed', patientId: owner.id, patientName: owner.name, deviceId: client.device.id, exerciseId: exercise.id, exerciseName: exercise.name, reps: b.reps as number ?? exercise.reps, completedAt: new Date().toISOString(), transport: 'wifi', source: 'device', angles: {}});
        } catch { send(ws, {kind: 'error', error: 'Invalid button payload or exerciseId'}); }
      });
      if(!client.waiting){if(client.device&&client.ack)pumpDevice(ws,client);else if(since!==undefined){client.replaying=true;pumpReplay(ws,client);}else send(ws,{kind:'ready',seq:latestSeq()});}
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
  app.get([/^\/tracker\/assets\/[a-f0-9]{16}\/[A-Za-z0-9_.-]+$/,/^\/_expo\/static\/js\/web\/[A-Za-z0-9_-]+\.js$/],(req,res,next)=>{
    const path=resolve(webDist,`.${req.path}`),encoding=req.acceptsEncodings('br','gzip','identity'),suffix=encoding==='br'?'.br':encoding==='gzip'?'.gz':'';
    res.vary('Accept-Encoding');
    if(suffix&&existsSync(path+suffix)){res.set({'Content-Encoding':encoding as string,'Cache-Control':'public, max-age=31536000, immutable'}).type(extname(path)).sendFile(path+suffix);return;}
    next();
  });
  app.use(express.static(webDist,{setHeaders:(res,path)=>{if(/\/tracker\/(?:assets\/[a-f0-9]{16}\/|main-[a-f0-9]{16}\.js$)/.test(path))res.setHeader('Cache-Control','public, max-age=31536000, immutable');}}));
  app.use((req, res) => {
    if (req.method === 'GET' && !req.path.includes('.') && existsSync(join(webDist, 'index.html'))) { res.sendFile(join(webDist, 'index.html')); return; }
    res.status(404).json({error: 'Not found'});
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = object(error) && typeof error.status === 'number' && error.status >= 400 && error.status < 500 ? error.status : 500;
    res.status(status).json({errors: [status === 413 ? 'Request too large' : status === 500 ? 'Internal server error' : 'Invalid JSON request']});
  });
  return {app, server, db, async close() {
    clearInterval(heartbeat);
    for (const ws of clients.keys()) ws.terminate();
    await new Promise<void>(done => wss.close(() => done()));
    await new Promise<void>((done, reject) => server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : done()));
    await Promise.all(pendingPush); db.close();
  }};
}
