import { angle2, angle3, type Point } from './math';
export interface Landmark extends Point { visibility?: number; presence?:number }
export type LandmarkSet = Landmark[] | Landmark[][];
export interface PoseFrame { landmarks: LandmarkSet; worldLandmarks?: LandmarkSet; timestampMs: number; width: number; height: number }
export const joints = {
  leftElbow: [11, 13, 15], rightElbow: [12, 14, 16],
  leftShoulder: [23, 11, 13], rightShoulder: [24, 12, 14],
  leftHip: [11, 23, 25], rightHip: [12, 24, 26],
  leftKnee: [23, 25, 27], rightKnee: [24, 26, 28],
  leftAnkle: [25, 27, 31], rightAnkle: [26, 28, 32],
} as const;
export type Joint = keyof typeof joints | 'trunkLean';
export type Angles = Record<Joint, number | null>;
export type Confidence = Record<Joint, number>;
export function flatten(set: LandmarkSet = []): Landmark[] { return Array.isArray(set[0]) ? set[0] as Landmark[] : set as Landmark[]; }
export function visible(p?: Landmark): p is Landmark {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.z === undefined || Number.isFinite(p.z)) && Number.isFinite(p.visibility) && p.visibility! >= 0.5 && (p.presence===undefined || Number.isFinite(p.presence)&&p.presence>=.5);
}
export function visibleInFrame(p?:Landmark):p is Landmark{return visible(p)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;}
export function extractAngles(frame: PoseFrame): { angles: Angles; confidence: Confidence } {
  const image = flatten(frame.landmarks), world = flatten(frame.worldLandmarks);
  const angles = {} as Angles, confidence = {} as Confidence;
  for (const key of Object.keys(joints) as (keyof typeof joints)[]) {
    const ids = joints[key];
    if((key==='leftShoulder'||key==='rightShoulder')&&!visibleInFrame(image[ids[0]])&&visibleInFrame(image[ids[1]])&&visibleInFrame(image[ids[2]])){
      const shoulder=image[ids[1]];
      angles[key]=angle2({x:shoulder.x,y:shoulder.y+1},shoulder,image[ids[2]],frame.width,frame.height);
      confidence[key]=angles[key]===null?0:Math.min(image[ids[1]].visibility!,image[ids[2]].visibility!);
      continue;
    }
    const valid = ids.every(i => visibleInFrame(image[i]));
    const useWorld = ids.every(i => visible(world[i]) && Number.isFinite(world[i].z));
    const source = useWorld ? world : image;
    angles[key] = valid ? (useWorld ? angle3(source[ids[0]], source[ids[1]], source[ids[2]]) : angle2(source[ids[0]], source[ids[1]], source[ids[2]], frame.width, frame.height)) : null;
    confidence[key] = angles[key] === null ? 0 : Math.min(...ids.map(i => Math.min(image[i].visibility!, useWorld ? world[i].visibility! : 1)));
  }
  const ids = [11, 12, 23, 24];
  const mid = (a: number, b: number) => ({ x: (image[a].x + image[b].x) / 2, y: (image[a].y + image[b].y) / 2 });
  if (ids.every(i => visibleInFrame(image[i]))) {
    const shoulder = mid(11, 12), hip = mid(23, 24);
    angles.trunkLean = angle2(shoulder, hip, { x: hip.x, y: hip.y - 1 }, frame.width, frame.height);
  } else angles.trunkLean = null;
  confidence.trunkLean = angles.trunkLean === null ? 0 : Math.min(...ids.map(i => image[i].visibility!));
  return { angles, confidence };
}
