#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "config.h"

WebSocketsClient socketClient;
bool wifiConnected = false, wifiAttempt = false, backendConnected = false;
bool alerting = false, buttonRaw = false, buttonStable = false;
uint32_t wifiStarted = 0, wifiRetryAt = 0, wifiBackoff = 1000;
uint32_t socketBackoff = 1000, alertStarted = 0, buttonChanged = 0;
String recentEvents[16];
uint8_t recentIndex = 0;

bool due(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}

void outputs(bool led, bool buzzer) {
  digitalWrite(LED_PIN, led ? LOW : HIGH);
  if (BUZZER_PIN >= 0) digitalWrite(BUZZER_PIN, buzzer ? HIGH : LOW);
}

String queryValue(const char *value) {
  const char hex[] = "0123456789ABCDEF";
  String result;
  for (const uint8_t *p = reinterpret_cast<const uint8_t *>(value); *p; p++) {
    if (isalnum(*p) || *p == '-' || *p == '_' || *p == '.' || *p == '~') result += static_cast<char>(*p);
    else { result += '%'; result += hex[*p >> 4]; result += hex[*p & 15]; }
  }
  return result;
}

void completion(uint8_t *payload, size_t length) {
  if (length > 4096) { Serial.println("Ignored oversized message"); return; }
  JsonDocument document;
  if (deserializeJson(document, payload, length)) { Serial.println("Ignored invalid JSON"); return; }
  if (document["kind"] != "event") return;
  JsonObject event = document["event"].as<JsonObject>();
  const char *id = event["id"] | "";
  const char *patient = event["patientId"] | "";
  const char *exercise = event["exerciseName"] | "";
  if (event["type"] != "exercise_completed" || !*id || !*patient || !*exercise ||
      !event["reps"].is<int>() || event["reps"].as<int>() < 0 || event["reps"].as<int>() > 10000) return;
  if (strcmp(patient, PATIENT_ID) != 0) return;
  for (const String &seen : recentEvents) if (seen == id) return;
  recentEvents[recentIndex] = id;
  recentIndex = (recentIndex + 1) % 16;
  Serial.print("EVENT "); serializeJson(event, Serial); Serial.println();
  Serial.println("FLASH: 5 x (100ms ON / 100ms OFF), then ON 3000ms");
  alertStarted = millis(); alerting = true;
}

void socketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      backendConnected = true; socketBackoff = 1000;
      socketClient.setReconnectInterval(socketBackoff);
      Serial.println("Backend connected; idle LED off");
      break;
    case WStype_DISCONNECTED:
      backendConnected = false;
      socketClient.setReconnectInterval(socketBackoff);
      Serial.printf("Backend disconnected; retry in %lu ms\n", static_cast<unsigned long>(socketBackoff));
      socketBackoff = min(socketBackoff * 2, static_cast<uint32_t>(30000));
      break;
    case WStype_TEXT: completion(payload, length); break;
    default: break;
  }
}

void startBackend() {
  socketBackoff = 1000;
  String path = "/ws?deviceId=" + queryValue(DEVICE_ID) + "&key=" + queryValue(DEVICE_KEY);
  if (BACKEND_TLS) {
    socketClient.beginSSL(BACKEND_HOST, BACKEND_PORT, path.c_str());
  } else socketClient.begin(BACKEND_HOST, BACKEND_PORT, path.c_str());
  socketClient.setReconnectInterval(1000);
  socketClient.enableHeartbeat(25000, 5000, 2);
}

void updateWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnected) {
      wifiConnected = true; wifiAttempt = false; wifiBackoff = 1000;
      Serial.print("WiFi connected: "); Serial.println(WiFi.localIP());
      startBackend();
    }
    socketClient.loop();
    return;
  }
  if (wifiConnected) {
    wifiConnected = false; backendConnected = false; socketClient.disconnect();
    wifiAttempt = false; wifiRetryAt = now;
    Serial.println("WiFi lost");
  }
  if (!wifiAttempt && due(now, wifiRetryAt)) {
    Serial.println("Connecting WiFi");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD); wifiStarted = now; wifiAttempt = true;
  } else if (wifiAttempt && now - wifiStarted >= 15000) {
    WiFi.disconnect(); wifiAttempt = false; wifiRetryAt = now + wifiBackoff;
    Serial.printf("WiFi timeout; retry in %lu ms\n", static_cast<unsigned long>(wifiBackoff));
    wifiBackoff = min(wifiBackoff * 2, static_cast<uint32_t>(30000));
  }
}

void updateAlert(uint32_t now) {
  if (ACK_BUTTON_PIN >= 0) {
    const bool pressed = digitalRead(ACK_BUTTON_PIN) == LOW;
    if (pressed != buttonRaw) { buttonRaw = pressed; buttonChanged = now; }
    if (now - buttonChanged >= 40 && buttonStable != buttonRaw) {
      buttonStable = buttonRaw;
      if (buttonStable && alerting) {
        alerting = false; Serial.println("ACK: alert silenced locally");
      }
    }
  }
  if (alerting) {
    const uint32_t elapsed = now - alertStarted;
    if (elapsed < 4000) {
      const bool on = elapsed >= 1000 || elapsed % 200 < 100;
      outputs(on, on); return;
    }
    alerting = false; Serial.println("Alert finished");
  }
  outputs(!backendConnected && now % 2000 < 1000, false);
}

void setup() {
  pinMode(LED_PIN, OUTPUT); outputs(false, false);
  if (BUZZER_PIN >= 0) { pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); }
  if (ACK_BUTTON_PIN >= 0) pinMode(ACK_BUTTON_PIN, INPUT_PULLUP);
  Serial.begin(115200); Serial.println(); Serial.println("MoveCompass ESP8266");
  WiFi.persistent(false); WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(false);
  socketClient.onEvent(socketEvent);
  if (BACKEND_TLS) Serial.println("WARNING: demo WSS uses TLS without certificate verification");
}

void loop() {
  const uint32_t now = millis();
  updateWifi(now); updateAlert(millis()); yield();
}
