import React, { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { useSession } from "../../src/session";
import { enableNotifications } from "../../src/notifications";
import { Button, Card, Copy, Page, Title, s } from "../../src/ui";
export default function Profile() {
  const session = useSession();
  const [message, setMessage] = useState("");
  const weekly = session.events.filter(
    (e) => Date.now() - Date.parse(e.completedAt) < 7 * 86400000,
  );
  return (
    <Page>
      <Text style={s.eyebrow}>YOUR CCCARE COMPANION</Text>
      <Title>{session.user?.name}</Title>
      <Copy>Graduated-care program · Private account</Copy>
      <Card>
        <Text style={s.heading}>Your activity</Text>
        <Copy>
          {session.events.length} recorded activities · {weekly.length} in the
          last 7 days
        </Copy>
        <Copy>
          {session.connected
            ? "● Live care connection online"
            : "○ Reconnecting to your care team…"}
        </Copy>
        {!!session.error && <Text style={s.error}>{session.error}</Text>}
        <Button
          title="Refresh activity"
          secondary
          onPress={() => void session.refresh()}
        />
      </Card>
      <Card>
        <Text style={s.heading}>Stay connected</Text>
        <Copy>
          Receive a notification when a completion arrives. Browser
          notifications work while the tab is open.
        </Copy>
        <Button
          title="Enable notifications"
          onPress={() => {
            void enableNotifications(session.base, session.token)
              .then(setMessage)
              .catch((e) => setMessage(e.message));
          }}
        />
        {!!message && <Copy>{message}</Copy>}
        <Button
          title="Device & backend settings"
          secondary
          onPress={() => router.push("/settings")}
        />
      </Card>
      <Button
        title="Sign out"
        secondary
        onPress={() => void session.logout()}
      />
    </Page>
  );
}
