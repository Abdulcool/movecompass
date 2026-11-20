import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { ExpoPushMessage } from 'expo-server-sdk';
import { createBackend } from '../src/backend';

let backend: ReturnType<typeof createBackend>;
let dir: string;
let push: ExpoPushMessage[][];
let sockets: WebSocket[];
const payload = {type:'exercise_completed', deviceId:'legacy-board', patientName:'Jane Doe', exerciseId:'sit-to-stand', exerciseName:'Supported sit-to-stand', reps:6, completedAt:'2026-11-20T19:30:00Z', transport:'wifi'};
const completion = {exerciseId:'sit-to-stand', exerciseName:'Supported sit-to-stand', reps:6, source:'camera', angles:{leftKnee:72}};
const login = async (role = 'patient', email = 'janedoe@gmail.com') => {
  const response = await request(backend.app).post('/api/auth/login').send({email, password:'123', role});
  expect(response.status).toBe(200); return response.body.token as string;
};
const device = async (token: string, patientEmail='janedoe@gmail.com') => {
  const response = await request(backend.app).post('/api/devices').auth(token,{type:'bearer'}).send({name:'Demo board',patientEmail});
  expect(response.status).toBe(201); return response.body as {deviceId:string;deviceKey:string};
};
async function connect(query: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${(backend.server.address() as AddressInfo).port}/ws?${query}`);
  sockets.push(socket); await once(socket,'open'); return socket;
}
function message(socket: WebSocket, kind: string): Promise<any> {
  return new Promise((resolve,reject) => {
    const timeout=setTimeout(()=>{socket.off('message',listener);reject(new Error(`Timed out waiting for ${kind}`));},2000);
    const listener=(raw: Buffer)=>{const value=JSON.parse(raw.toString());if(value.kind===kind){clearTimeout(timeout);socket.off('message',listener);resolve(value);}};
    socket.on('message',listener);
  });
}
beforeEach(async () => {
  dir=mkdtempSync(join(tmpdir(),'movecompass-test-')); push=[]; sockets=[];
  backend=createBackend({dataDir:dir, sendPush:async messages=>{push.push(messages);}});
  backend.server.listen(0,'127.0.0.1'); await once(backend.server,'listening');
});
afterEach(async()=>{for(const s of sockets)s.terminate();await backend.close();rmSync(dir,{recursive:true,force:true});});

describe('auth and isolation',()=>{
  it('seeds Jane patient/staff and staff account, protects me and hashes passwords',async()=>{
    expect((await request(backend.app).get('/api/me')).status).toBe(401);
    for(const [role,email] of [['patient','janedoe@gmail.com'],['staff','janedoe@gmail.com'],['staff','staff@cccare.ca']]) {
      const token=await login(role,email);
      const me=await request(backend.app).get('/api/me').auth(token,{type:'bearer'});
      expect(me.body.user.role).toBe(role); expect(me.body.user.password_hash).toBeUndefined();
    }
    expect((backend.db.prepare('SELECT password_hash FROM users LIMIT 1').get() as any).password_hash).toMatch(/^\$2/);
    expect((await request(backend.app).post('/api/auth/login').send({email:'janedoe@gmail.com',password:'wrong',role:'staff'})).status).toBe(401);
    expect((await request(backend.app).post('/api/auth/login').send({email:'staff@cccare.ca',password:'123',role:'patient'})).status).toBe(401);
    expect((await request(backend.app).post('/api/auth/login').send({})).status).toBe(400);
    expect((await request(backend.app).post('/api/auth/login').send({email:'janedoe@gmail.com',password:'123',role:['staff']})).status).toBe(400);
  });
  it('registers patients, rejects duplicate or staff registration, scopes events',async()=>{
    const body={email:'other@example.com',name:'Other Patient',password:'password123'};
    expect((await request(backend.app).post('/api/auth/register').send({...body,role:'staff'})).status).toBe(400);
    const registration=await request(backend.app).post('/api/auth/register').send(body);
    expect(registration.status).toBe(201);
    expect((await request(backend.app).post('/api/auth/register').send(body)).status).toBe(409);
    expect((await request(backend.app).post('/api/auth/register').send({})).status).toBe(400);
    const jane=await login(); const staff=await login('staff');
    await request(backend.app).post('/api/completions').auth(jane,{type:'bearer'}).send(completion).expect(201);
    expect((await request(backend.app).get('/api/events').auth(registration.body.token,{type:'bearer'})).body.events).toEqual([]);
    expect((await request(backend.app).get('/api/events').auth(staff,{type:'bearer'})).body.events).toHaveLength(1);
    expect((await request(backend.app).get('/api/events?limit=-1').auth(jane,{type:'bearer'})).status).toBe(400);
    expect((await request(backend.app).post('/api/devices').auth(jane,{type:'bearer'}).send({name:'x',patientEmail:body.email})).status).toBe(403);
  });
});
describe('completion contract and storage',()=>{
  it('validates missing/wrong fields with 400 and accepts legacy PDF event with 202',async()=>{
    expect((await request(backend.app).get('/api/esp32/latest')).body).toEqual({event:null});
    const invalid=await request(backend.app).post('/api/esp32/notify').send({});
    expect(invalid.status).toBe(400);expect(invalid.body.errors).toHaveLength(8);
    for(const [key,value] of [['reps',-1],['reps',1.5],['reps','6'],['completedAt','yesterday'],['completedAt','2026-02-31T19:30:00Z'],['transport','bluetooth'],['exerciseId',''],['type','other'],['patientName',12]]) {
      expect((await request(backend.app).post('/api/esp32/notify').send({...payload,[key as string]:value})).status).toBe(400);
    }
    const accepted=await request(backend.app).post('/api/esp32/notify').send(payload);
    expect((await request(backend.app).post('/api/esp32/notify').send({...payload,transport:['wifi']})).status).toBe(400);
    expect(accepted.status).toBe(202);expect(accepted.body.event.reps).toBe(6);
    expect((await request(backend.app).get('/api/esp32/latest')).body.event.id).toBe(accepted.body.event.id);
  });
  it('persists events, users, push tokens, device keys and signing secret across restarts',async()=>{
    const token=await login('staff'); const d=await device(token);
    await request(backend.app).post('/api/esp32/notify').set('X-Device-Key',d.deviceKey).send({...payload,deviceId:d.deviceId}).expect(202);
    await request(backend.app).post('/api/push/register').auth(token,{type:'bearer'}).send({token:'ExponentPushToken[test-token]'}).expect(201);
    await backend.close(); backend=createBackend({dataDir:dir,sendPush:async()=>{}});
    backend.server.listen(0,'127.0.0.1');await once(backend.server,'listening');
    expect((await request(backend.app).get('/api/me').auth(token,{type:'bearer'})).status).toBe(200);
    expect((await request(backend.app).get('/api/events').auth(token,{type:'bearer'})).body.events).toHaveLength(1);
    expect((await request(backend.app).get('/api/devices').auth(token,{type:'bearer'})).body.devices[0].deviceKey).toBeUndefined();
    expect((backend.db.prepare('SELECT count(*) AS n FROM push_tokens').get() as any).n).toBe(1);
    await request(backend.app).post('/api/esp32/notify').set('X-Device-Key',d.deviceKey).send({...payload,deviceId:d.deviceId}).expect(202);
  });
  it('rejects missing/bad registered keys and disabled legacy events',async()=>{
    const token=await login('staff');const d=await device(token);
    for(const key of ['', 'bad-key']) expect((await request(backend.app).post('/api/esp32/notify').set('X-Device-Key',key).send({...payload,deviceId:d.deviceId})).status).toBe(401);
    await backend.close();backend=createBackend({dataDir:dir,allowUnregisteredDevices:false});
    expect((await request(backend.app).post('/api/esp32/notify').send(payload)).status).toBe(401);
  });
  it('validates app completion fields, push tokens and authentication',async()=>{
    const token=await login();
    expect((await request(backend.app).post('/api/completions').send(completion)).status).toBe(401);
    expect((await request(backend.app).post('/api/completions').auth(token,{type:'bearer'}).send({})).body.errors.length).toBeGreaterThan(0);
    expect((await request(backend.app).post('/api/completions').auth(token,{type:'bearer'}).send({...completion,angles:{knee:'bad'}})).status).toBe(400);
    expect((await request(backend.app).post('/api/completions').auth(token,{type:'bearer'}).send({...completion,source:['camera']})).status).toBe(400);
    expect((await request(backend.app).post('/api/push/register').auth(token,{type:'bearer'}).send({token:'bad'})).status).toBe(400);
  });
});
describe('real websocket transport',()=>{
  it('delivers app completion to staff, patient, ALL devices, and staff push tokens',async()=>{
    const staff=await login('staff'), patient=await login();
    await request(backend.app).post('/api/auth/register').send({email:'board-owner@example.com',name:'Board Owner',password:'password123'}).expect(201);
    const first=await device(staff),second=await device(staff,'board-owner@example.com');
    const staffWs=await connect(`token=${staff}`),patientWs=await connect(`token=${patient}`);
    const deviceWs=await connect(`deviceId=${first.deviceId}&key=${first.deviceKey}`);
    const otherDeviceWs=await connect(`deviceId=${second.deviceId}&key=${second.deviceKey}`);
    await request(backend.app).post('/api/push/register').auth(staff,{type:'bearer'}).send({token:'ExponentPushToken[test-staff]'}).expect(201);
    const received=[staffWs,patientWs,deviceWs,otherDeviceWs].map(ws=>message(ws,'event'));
    const response=await request(backend.app).post('/api/completions').auth(patient,{type:'bearer'}).send(completion);
    expect(response.status).toBe(201);
    for(const msg of await Promise.all(received))expect(msg.event.id).toBe(response.body.event.id);
    expect(push[0][0].data).toMatchObject({event:{reps:6}});
    const list=await request(backend.app).get('/api/devices').auth(staff,{type:'bearer'});
    expect(list.body.devices.every((d:any)=>d.online&&d.lastSeen)).toBe(true);
  });
  it('supports button events and online/offline notifications; rejects malformed messages',async()=>{
    const staff=await login('staff');const d=await device(staff);const watcher=await connect(`token=${staff}`);
    const online=message(watcher,'device');const esp=await connect(`deviceId=${d.deviceId}&key=${d.deviceKey}`);
    expect((await online).online).toBe(true);
    const event=message(watcher,'event');esp.send(JSON.stringify({kind:'button'}));
    expect((await event).event).toMatchObject({exerciseId:'sit-to-stand',reps:6,transport:'wifi',deviceId:d.deviceId});
    const error=message(esp,'error');esp.send('invalid json');expect((await error).error).toContain('Invalid button');
    const offline=message(watcher,'device');esp.close();expect((await offline).online).toBe(false);
  });
  it('rejects invalid device and app credentials before upgrade',async()=>{
    const staff=await login('staff'),d=await device(staff);
    for(const query of [`deviceId=${d.deviceId}&key=wrong`,'token=invalid']) {
      const s=new WebSocket(`ws://127.0.0.1:${(backend.server.address() as AddressInfo).port}/ws?${query}`);sockets.push(s);
      const error=await new Promise<Error>(resolve=>s.once('error',resolve));expect(error.message).toContain('401');
    }
  });
});
it('serves health, static files, SPA routes and JSON API errors',async()=>{
  const web=join(dir,'web');mkdirSync(web);writeFileSync(join(web,'index.html'),'<h1>MoveCompass</h1>');writeFileSync(join(web,'tracker.html'),'tracker');
  await backend.close();backend=createBackend({dataDir:dir,webDist:web});
  expect((await request(backend.app).get('/healthz')).body).toEqual({ok:true});
  expect((await request(backend.app).get('/plan')).text).toContain('MoveCompass');
  expect((await request(backend.app).get('/tracker.html')).text).toBe('tracker');
  expect((await request(backend.app).get('/missing.js')).status).toBe(404);
  expect((await request(backend.app).get('/api/missing')).body.error).toBe('API endpoint not found');
  expect((await request(backend.app).post('/api/esp32/notify').set('Content-Type','application/json').send('{bad')).status).toBe(400);
});
