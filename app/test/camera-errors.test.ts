import { it, expect } from 'vitest';
import { cameraGuidance } from '../src/camera-errors';
it('explains camera permission, missing hardware, contention and unknown failures',()=>{
  expect(cameraGuidance({name:'NotAllowedError'})).toContain('settings');
  expect(cameraGuidance({name:'NotFoundError'})).toContain('No camera was found');
  expect(cameraGuidance({name:'NotReadableError'})).toContain('Another app');
  expect(cameraGuidance('HTTPS is required')).toContain('secure HTTPS');
  expect(cameraGuidance(null)).toContain('manually');
});
