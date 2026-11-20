export const regions = [
  ["upper-back", "Upper back"], ["shoulders", "Shoulders"],
  ["hips", "Hips"], ["legs", "Legs"],
] as const;
export type Region = typeof regions[number][0];
export type BodyPickerProps = { value: string; onChange: (region: string) => void };
export const isRegion = (id: unknown): id is Region => regions.some(([key]) => key === id);
const bands = [
  { id: "shoulders", minY: .70, maxY: .87, minX: .10, maxX: 1 },
  { id: "upper-back", minY: .60, maxY: .80, minX: 0, maxX: .10 },
  { id: "hips", minY: .48, maxY: .60, minX: 0, maxX: .23 },
  { id: "legs", minY: 0, maxY: .48, minX: 0, maxX: .23 },
] as const;
export function regionAt(point: { x: number; y: number }) {
  const x = Math.abs(point.x / 2), y = point.y / 2;
  return bands.find(b => y >= b.minY && y < b.maxY && x >= b.minX && x < b.maxX)?.id ?? null;
}
export const regionNumber = (id: string) => regions.findIndex(([key]) => key === id) + 1;
export const regionShader = `float bodyRegion(vec3 p) {
  float x = abs(p.x / 2.0); float y = p.y / 2.0;
  ${bands.map(b => `if (y >= ${b.minY.toFixed(2)} && y < ${b.maxY.toFixed(2)} && x >= ${b.minX.toFixed(2)} && x < ${b.maxX.toFixed(2)}) return ${regionNumber(b.id)}.0;`).join("\n")}
  return 0.0;
}`;
export function parseRegionMessage(data: unknown): Region | null {
  try {
    const value = typeof data === "string" ? JSON.parse(data) : data;
    return value?.type === "region" && isRegion(value.id) ? value.id : null;
  } catch { return null; }
}
