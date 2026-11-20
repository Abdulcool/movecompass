import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { parseRegionMessage, type BodyPickerProps } from "../body/regions";
import { useSession } from "./session";
import { Copy } from "./ui";
import { RegionChips } from "./RegionChips";
export { regions } from "../body/regions";
export function BodyPicker({ value, onChange }: BodyPickerProps) {
  const { base } = useSession(), frame = useRef<WebView<object>>(null);
  const sync = () => frame.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent('body:selection', {detail:${JSON.stringify(value)}}));true;`);
  useEffect(sync, [value]);
  return <View>
    <WebView<object> ref={frame} style={{ height: 490, backgroundColor: "#EEF0E9" }}
      source={{ uri: `${base}/body.html` }} scrollEnabled={false} bounces={false}
      originWhitelist={["http://*", "https://*"]}
      onShouldStartLoadWithRequest={request => request.url.startsWith(`${base}/body.html`) || request.url === "about:blank"}
      onLoadEnd={sync}
      onMessage={e => {
        if (e.nativeEvent.data === '{"type":"ready"}') sync();
        const id = parseRegionMessage(e.nativeEvent.data); if (id) onChange(id);
      }} />
    <Copy>Drag to rotate · pinch to zoom. Or choose a body area below.</Copy>
    <RegionChips value={value} onChange={onChange} />
  </View>;
}
