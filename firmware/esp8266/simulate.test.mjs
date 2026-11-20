import test from 'node:test';
import assert from 'node:assert/strict';
import { completionForPatient, createVirtualEsp } from './simulate.mjs';

const event = { id: 'event-1', type: 'exercise_completed', patientId: 'jane-id', exerciseName: 'Supported sit-to-stand', reps: 6 };
const message = value => JSON.stringify({ kind: 'event', event: value });
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
