import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { completionForPatient, createVirtualEsp,validDeviceKey,pairWithCode,wakeServer } from './simulate.mjs';

async function pairingServer(t,handler){
  const server=createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('wakes a healthy backend before sending one pairing POST',async t=>{
  const requests=[];
  const backendUrl=await pairingServer(t,(req,res)=>{
    requests.push(`${req.method} ${req.url}`);
    if(req.url==='/healthz'){res.end('{"ok":true}');return;}
    res.end(JSON.stringify({deviceId:'board',patientId:'patient',key:'a'.repeat(64)}));
  });
  assert.equal((await pairWithCode({backendUrl,code:'123456'})).deviceId,'board');
  assert.deepEqual(requests,['GET /healthz','POST /api/devices/pair']);
});

test('waits through a mocked 60-second cold start before consuming the code once',async t=>{
  let elapsed=0,checks=0,posts=0;
  const backendUrl=await pairingServer(t,(req,res)=>{
    assert.equal(req.method,'POST');assert.ok(elapsed>=60000);posts++;
    res.end(JSON.stringify({deviceId:'board',patientId:'patient',key:'a'.repeat(64)}));
  });
  await pairWithCode({backendUrl,code:'123456',wakeOptions:{now:()=>elapsed,wait:async ms=>{elapsed+=ms;},getStatus:async(url,{timeoutMs})=>{
    assert.equal(url.pathname,'/healthz');checks++;
    elapsed+=Math.min(timeoutMs,60000-elapsed);
    if(elapsed<60000)throw new Error('Sleeping server timed out');
    return 200;
  }}});
  assert.equal(elapsed,60000);assert.ok(checks>1);assert.equal(posts,1);
});

test('bounds unhealthy-server retries at 90 seconds without sending the code',async t=>{
  let elapsed=0,posts=0;
  const backendUrl=await pairingServer(t,(req,res)=>{posts++;res.end();});
  await assert.rejects(pairWithCode({backendUrl,code:'123456',wakeOptions:{now:()=>elapsed,wait:async ms=>{elapsed+=ms;},getStatus:async()=>503}}),/no pairing code was sent/);
  assert.equal(elapsed,90000);assert.equal(posts,0);
});

test('retries transient health errors with capped backoff',async()=>{
  let elapsed=0,calls=0;const waits=[];
  await wakeServer({backendUrl:'http://localhost',now:()=>elapsed,wait:async ms=>{waits.push(ms);elapsed+=ms;},getStatus:async()=>{calls++;if(calls===1)throw new Error('Connection refused');return calls<7?503:200;}});
  assert.deepEqual(waits,[1000,2000,4000,8000,8000,8000]);
});

test('does not retry an ambiguously failed single-use POST',async t=>{
  let posts=0;
  const backendUrl=await pairingServer(t,(req,res)=>{
    if(req.url==='/healthz'){res.end('{}');return;}
    posts++;req.socket.destroy();
  });
  await assert.rejects(pairWithCode({backendUrl,code:'123456'}));
  assert.equal(posts,1);
});

for(const [status,body] of [[400,'{}'],[200,''],[200,'{}']])test(`does not retry a rejected or invalid response (${status}, ${body||'empty'})`,async t=>{
  let posts=0;
  const backendUrl=await pairingServer(t,(req,res)=>{
    if(req.url==='/healthz'){res.end('{}');return;}
    posts++;res.statusCode=status;res.end(body);
  });
  await assert.rejects(pairWithCode({backendUrl,code:'123456'}),/Pairing failed|Invalid/);
  assert.equal(posts,1);
});

test('rejects invalid codes without contacting the backend',async()=>{
  let checks=0;
  await assert.rejects(pairWithCode({backendUrl:'http://localhost',code:'',wakeOptions:{getStatus:async()=>{checks++;return 200;}}}),/six-digit/);
  assert.equal(checks,0);
});

const event = { id: 'event-1', type: 'exercise_completed', patientId: 'jane-id', exerciseName: 'Supported sit-to-stand', reps: 6 };
const message = value => JSON.stringify({ kind: 'event', event: value });
test('accepts hex and signed credentials but rejects empty, malformed and oversized keys',()=>{
  for(const key of ['a'.repeat(64),'mc1.eyJkZXZpY2VJZCI6IjEifQ.'+'a'.repeat(43)])assert.equal(validDeviceKey(key),true);
  for(const key of ['',null,'z'.repeat(64),'mc1..'+'a'.repeat(43),'mc1.payload.bad','mc1.'+'a'.repeat(1024)+'.'+'a'.repeat(43)])assert.equal(validDeviceKey(key),false);
});
test('rejects missing configuration and unsupported backend schemes', () => {
  assert.throws(() => createVirtualEsp({}), /required/);
  assert.throws(() => createVirtualEsp({ backendUrl: 'ftp://localhost', deviceId: 'id', deviceKey: 'test', patientId: 'jane-id' }), /HTTP/);
});
test('accepts matching server completion fields and suppresses duplicates', () => {
  const seen = new Set();
  assert.deepEqual(completionForPatient(message(event), 'jane-id', seen), event);
  assert.equal(completionForPatient(message(event), 'jane-id', seen), null);
});
test('ignores other patients, null ownership, status messages and empty configuration', () => {
  for (const raw of [message({ ...event, patientId: 'other-id' }), message({ ...event, patientId: null }), '{"kind":"device","online":true}']) {
    assert.equal(completionForPatient(raw, 'jane-id'), null);
  }
  assert.equal(completionForPatient(message(event), ''), null);
});
test('ignores empty, invalid, oversized and malformed event payloads', () => {
  for (const raw of ['', '{', 'null', '[]', ' '.repeat(4097), message(null), message({}), message({ ...event, id: '' }), message({ ...event, type: 'other' }), message({ ...event, exerciseName: '' }), message({ ...event, reps: '6' }), message({ ...event, reps: -1 }), message({ ...event, reps: 10001 })]) {
    assert.equal(completionForPatient(raw, 'jane-id'), null);
  }
});
test('keeps a bounded sixteen-event deduplication window', () => {
  const seen = new Set();
  for (let i = 0; i < 17; i++) completionForPatient(message({ ...event, id: `event-${i}` }), 'jane-id', seen);
  assert.equal(seen.size, 16); assert.equal(seen.has('event-0'), false);
});
