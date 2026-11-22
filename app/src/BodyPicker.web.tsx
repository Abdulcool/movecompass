import React,{lazy,Suspense} from "react";
import { View } from "react-native";
import type { BodyPickerProps } from "../body/regions";
import { RegionChips } from "./RegionChips";
import { Copy } from "./ui";
export { regions } from "../body/regions";
const BodyScene=lazy(()=>import('../body/BodyScene').then(module=>({default:module.BodyScene})));
export function BodyPicker(props: BodyPickerProps) {
  return <View><Suspense fallback={<Copy>Loading 3D body…</Copy>}><BodyScene {...props} /></Suspense>
    <Copy>Drag to rotate · scroll or pinch to zoom. Or choose a body area below.</Copy>
    <RegionChips {...props} />
  </View>;
}
