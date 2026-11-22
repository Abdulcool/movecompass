export interface Point { x: number; y: number; z?: number }

export function angle3(a: Point, b: Point, c: Point): number | null {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const length = Math.hypot(...u) * Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-12) return null;
  return Math.acos(Math.max(-1, Math.min(1, u.reduce((s, n, i) => s + n * v[i], 0) / length))) * 180 / Math.PI;
}

export function angle2(a: Point, b: Point, c: Point, width: number, height: number): number | null {
  if (!(width > 0 && height > 0)) return null;
  const pixel = (p: Point) => ({ x: p.x * width, y: p.y * height, z: 0 });
  return angle3(pixel(a), pixel(b), pixel(c));
}
