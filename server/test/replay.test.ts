import { it,expect } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackend } from '../src/backend';
it('replays every missed set in sequence, scoped to the device, one per delivery ACK',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mc-replay-')),b=createBackend({dataDir:dir,seedDemo:true,sendPush:async()=>{}}),sockets:WebSocket[]=[];
  await new Promise<void>(r=>b.server.listen(0,'127.0.0.1',r));
  const base=`ws://127.0.0.1:${(b.server.address() as any).port}`;
  try {
    const login=async(role:string,email:string)=>(await request(b.app).post('/api/auth/login').send({role,email,password:'123'})).body.token;
    const staff=await login('staff','staff@cccare.ca'),patient=await login('patient','janedoe@gmail.com');
    const d=(await request(b.app).post('/api/devices').auth(staff,{type:'bearer'}).send({name:'Board',patientEmail:'janedoe@gmail.com'})).body;
    const first=new WebSocket(`${base}/ws?ack=1&deviceId=${d.deviceId}&key=${d.deviceKey}`);sockets.push(first);
    const ready=new Promise<number>(r=>first.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.kind==='ready')r(m.seq);}));
    const since=await ready;first.close();await once(first,'close');
    const ids=[];for(let i=0;i<2;i++){const r=await request(b.app).post('/api/completions').auth(patient,{type:'bearer'}).send({exerciseId:'sit-to-stand',reps:6,source:'camera'});ids.push(r.body.event.id);expect(r.body.event.seq).toBeGreaterThan(since);}
    const second=new WebSocket(`${base}/ws?ack=1&since=${since}&deviceId=${d.deviceId}&key=${d.deviceKey}`);sockets.push(second);
    const events:any[]=[];
    await new Promise<void>(resolve=>second.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.kind==='event'){events.push(m.event);second.send(JSON.stringify({kind:'ack',seq:m.event.seq}));}if(m.kind==='ready'&&events.length===2)resolve();}));
    expect(events.map(e=>e.id)).toEqual(ids);expect(events[1].seq).toBeGreaterThan(events[0].seq);
  } finally {for(const s of sockets)s.terminate();await b.close();rmSync(dir,{recursive:true});}
},10000);
