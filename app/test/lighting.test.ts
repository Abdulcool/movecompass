import {it,expect} from 'vitest';
import {enhanceDimFrame} from '../tracker/lighting';
it('boosts dim inference pixels without changing alpha',()=>{
  const pixels=new Uint8ClampedArray([20,30,40,255]);
  expect(enhanceDimFrame(pixels).enhanced).toBe(true);expect(pixels[0]).toBeGreaterThan(20);expect(pixels[3]).toBe(255);
});
it('leaves normal light unchanged and handles invalid/empty frames',()=>{
  const pixels=new Uint8ClampedArray([120,140,160,255]),before=[...pixels];
  expect(enhanceDimFrame(pixels).enhanced).toBe(false);expect([...pixels]).toEqual(before);
  expect(enhanceDimFrame(new Uint8ClampedArray()).enhanced).toBe(false);
  expect(enhanceDimFrame(new Uint8ClampedArray(3)).enhanced).toBe(false);
});
