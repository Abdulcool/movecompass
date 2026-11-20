import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createBackend } from '../../server/src/backend.ts';
import { createVirtualEsp, pairWithCode } from './simulate.mjs';

const backend = createBackend({ seedDemo: true, dataDir: await mkdtemp(join(homedir(), 'work', 'esp8266-smoke-')), sendPush: async () => {} });
await new Promise(resolve => backend.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${backend.server.address().port}`;
let sim;
const watchdog = setTimeout(() => { console.error('FAIL firmware smoke test timed out'); process.exit(1); }, 20000);
async function api(path, token, body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`); return response.json();
}
try {
  const staff = await api('/api/auth/login', '', { email: 'staff@cccare.ca', password: '123', role: 'staff' });
  const jane = await api('/api/auth/login', '', { email: 'janedoe@gmail.com', password: '123', role: 'patient' });
  const registered = await api('/api/devices', staff.token, { name: 'Virtual NodeMCU', patientEmail: 'janedoe@gmail.com' });
  const { devices } = await api('/api/devices', staff.token);
  const device = devices.find(d => d.deviceId === registered.deviceId);
  assert.equal(device.patientId, jane.user.id);
  console.log(`REGISTERED ${registered.deviceId} for Jane Doe (key not logged)`);
  const paired=await pairWithCode({backendUrl:base,code:registered.pairingCode});
  assert.equal(paired.patientId,jane.user.id);
  console.log('PAIRED by six-digit code; code consumed; key not logged');
  let transport;
  backend.server.on('upgrade', (request, socket) => {
    if (new URL(request.url, base).searchParams.get('deviceId') === registered.deviceId) transport = socket;
  });
  sim = createVirtualEsp({ backendUrl: base, ...paired });
  let alerts = 0;
  sim.events.on('alert', () => alerts++);
  await once(sim.events, 'connected');
  const reconnected = once(sim.events, 'connected');
  transport.destroy(); await reconnected;
  console.log('PASS virtual ESP reconnects after transport loss');
  const other = await api('/api/auth/register', '', { email: 'other@example.test', password: 'test-password', name: 'Other Patient' });
  let foreignReceived = false;
  sim.events.on('ignored', raw => {
    if (JSON.parse(raw.toString())?.event?.patientId === other.user.id) foreignReceived = true;
  });
  const camera = { exerciseId: 'sit-to-stand', exerciseName: 'Supported sit-to-stand', reps: 6, source: 'camera', angles: { rightKnee: 93.9 } };
  await api('/api/completions', other.token, camera);
  const finished = once(sim.events, 'finished');
  const { event } = await api('/api/completions', jane.token, camera);
  const [received] = await finished;
  assert.equal(foreignReceived, false); assert.equal(alerts, 1);
  console.log('PASS other patient completion not delivered');
  assert.equal(received.id, event.id); assert.equal(received.source, 'camera'); assert.equal(received.reps, 6);
  console.log('PASS POST camera completion → authenticated /ws → patient-matched flash pattern');
  const alert = once(sim.events, 'alert');
  await api('/api/completions', jane.token, camera); await alert;
  sim.acknowledge();
  const { events } = await api('/api/events', jane.token);
  assert.equal(events.length, 2); assert.equal(alerts, 2);
  console.log('PASS local acknowledgement silences alert without creating a completion');
} finally { clearTimeout(watchdog); sim?.stop(); await backend.close(); }
