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
  await assert.rejects(pairWithCode({backendUrl,code:'123456',wakeOptions:{now:()=>elapsed,wait:async ms=>{elapsed+=ms;},getStatus:async()=>503}}),/no pairing code was sent\. Health HTTP=503/);
  assert.equal(elapsed,90000);assert.equal(posts,0);
});

test('retries transient health errors with capped backoff',async()=>{
  let elapsed=0,calls=0;const waits=[];
  await wakeServer({backendUrl:'http://localhost',now:()=>elapsed,wait:async ms=>{waits.push(ms);elapsed+=ms;},getStatus:async()=>{calls++;if(calls===1)throw new Error('Connection refused');return calls<7?503:200;}});
  assert.deepEqual(waits,[1000,2000,4000,8000,8000,8000]);
});

test('preserves the last transport error code without exposing its message',async()=>{
  let elapsed=0;
  await assert.rejects(wakeServer({backendUrl:'http://localhost',now:()=>elapsed,wait:async ms=>{elapsed+=ms;},getStatus:async()=>{
    throw Object.assign(new Error('sensitive connection details'),{code:'ECONNRESET'});
  }}),error=>{assert.match(error.message,/ECONNRESET/);assert.doesNotMatch(error.message,/sensitive/);return true;});
});

test('does not start a zero-timeout request when the wake deadline has passed',async()=>{
  let reads=0,calls=0;
  await assert.rejects(wakeServer({backendUrl:'http://localhost',now:()=>reads++===0?0:90000,getStatus:async()=>{calls++;return 200;}}),/90 seconds/);
  assert.equal(calls,0);
});

for(const status of [301,302,307,308])test(`upgrades same-host HTTP ${status} to HTTPS before sending one code`,async()=>{
  const checks=[];let posts=0;
  const paired=await pairWithCode({backendUrl:'http://example.com',code:'123456',wakeOptions:{getStatus:async url=>{
    checks.push(url.href);
    return checks.length===1?{status,location:'https://EXAMPLE.com:443/healthz'}:200;
  }},post:async(url,body)=>{
    assert.deepEqual(checks,['http://example.com/healthz','https://example.com/healthz']);
    assert.equal(url.href,'https://example.com/api/devices/pair');assert.equal(JSON.parse(body).code,'123456');posts++;
    return {deviceId:'board',patientId:'patient',key:'a'.repeat(64)};
  }});
  assert.equal(posts,1);assert.equal(paired.backendUrl,'https://example.com');
});

for(const [backendUrl,location] of [
  ['http://example.com','https://other.example/healthz'],
  ['http://example.com','https://user@example.com/healthz'],
  ['http://example.com','https://example.com:8443/healthz'],
  ['http://example.com','http://example.com/healthz'],
  ['http://example.com','/healthz'],
  ['http://example.com',''],
  ['http://192.168.1.2','https://192.168.1.2/healthz'],
  ['http://localhost','https://localhost/healthz'],
  ['http://device.local','https://device.local/healthz'],
  ['http://device.lan','https://device.lan/healthz'],
  ['https://example.com','https://example.com/healthz'],
])test(`does not follow unsafe/local redirect ${backendUrl} → ${location||'empty'}`,async()=>{
  let elapsed=0,posts=0,checks=0;
  await assert.rejects(pairWithCode({backendUrl,code:'123456',wakeOptions:{now:()=>elapsed,wait:async()=>{elapsed=90000;},getStatus:async url=>{
    checks++;assert.equal(url.origin,backendUrl);return {status:308,location};
  }},post:async()=>{posts++;}}),/HTTP=308 redirect; use https:\/\//);
  assert.equal(checks,1);assert.equal(posts,0);
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
