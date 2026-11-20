import React from "react";
import { View } from "react-native";
import { BodyScene } from "../body/BodyScene";
import type { BodyPickerProps } from "../body/regions";
import { RegionChips } from "./RegionChips";
import { Copy } from "./ui";
export { regions } from "../body/regions";
export function BodyPicker(props: BodyPickerProps) {
  return <View><BodyScene {...props} />
    <Copy>Drag to rotate · scroll or pinch to zoom. Or choose a body area below.</Copy>
    <RegionChips {...props} />
  </View>;
}
