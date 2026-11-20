import React, { useEffect, useState } from "react";
import { Linking, Platform, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession } from "../src/session";
import { Button, Card, Copy, Field, Page, Title, s } from "../src/ui";
export default function Settings() {
  const session = useSession();
  const [url, setUrl] = useState(session.setting),
    [deviceId, setDeviceId] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    void AsyncStorage.getItem("mc-pairing").then((v) => setDeviceId(v || ""));
  }, []);
  async function save() {
    try {
      await session.saveBackend(url.trim());
      await AsyncStorage.setItem("mc-pairing", deviceId.trim());
      setMessage("Settings saved. Sign in again if the backend changed.");
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  return (
    <Page>
      <Text style={s.eyebrow}>DEVICE SETUP</Text>
      <Title>Device & backend settings</Title>
      <Card>
        <Copy>
          {Platform.OS === "web"
            ? "Web uses the same origin as this app. The URL below is for native app connections."
            : "Use your server’s reachable HTTPS URL, not localhost on another device."}
        </Copy>
        <Field
          label="Backend URL"
          autoCapitalize="none"
          placeholder="https://your-server.example"
          value={url}
          onChangeText={setUrl}
        />
        <Copy>Current API: {session.base || "Not configured"}</Copy>
        <Field
          label="Paired device ID"
          autoCapitalize="none"
          value={deviceId}
          onChangeText={setDeviceId}
        />
        <Copy>
          Pairing info is a local reference only. A staff member registers the
          board and supplies a six-digit pairing code. ESP8266 uses WiFi, not
          Bluetooth.
        </Copy>
        <Copy>Do not enter WiFi passwords or device secret keys here.</Copy>
        {session.user?.role==='staff' && <><Button title="Open USB device flasher" onPress={()=>void Linking.openURL(`${session.base}/flash.html`)}/><Button title="Register or pair a device" secondary onPress={()=>void Linking.openURL(`${session.base}/admin`)}/><Copy>Use Chrome or Edge on a desktop computer and a USB data cable. The flasher walks you through home WiFi and the MoveCompass-Setup portal.</Copy></>}
        <Button title="Save settings" onPress={() => void save()} />
        {!!message && <Copy>{message}</Copy>}
      </Card>
    </Page>
  );
}
