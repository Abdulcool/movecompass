#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <WiFiManager.h>
#include <LittleFS.h>
#include <Ticker.h>
#if __has_include("config.h")
#include "config.h"
#else
#include "config.h.example"
#endif

WebSocketsClient socketClient;
Ticker portalLed;
String backendUrl, backendHost, deviceId, deviceKey, patientId, wifiSsid, wifiPassword;
uint16_t backendPort = 80;
bool backendTls = false;
bool wifiConnected = false, wifiAttempt = false, backendConnected = false;
bool alerting = false, buttonRaw = false, buttonStable = false;
uint32_t wifiStarted = 0, wifiRetryAt = 0, wifiBackoff = 1000;
uint32_t socketBackoff = 1000, alertStarted = 0, buttonChanged = 0;
String recentEvents[16];
uint8_t recentIndex = 0;
struct PendingAlert { String id; uint64_t seq; };
PendingAlert alerts[16];
uint8_t alertHead = 0, alertCount = 0;
String activeId;
uint64_t activeSeq = 0, lastSeq = 0;
bool hasCursor = false;
bool credentialsReady = false;
uint32_t credentialRetryAt = 0, credentialBackoff = 1000;

bool due(uint32_t now, uint32_t deadline) {
  return static_cast<int32_t>(now - deadline) >= 0;
}

void outputs(bool led, bool buzzer) {
  digitalWrite(LED_PIN, led ? LOW : HIGH);
  if (BUZZER_PIN >= 0) digitalWrite(BUZZER_PIN, buzzer ? HIGH : LOW);
}

bool parseBackend() {
  backendUrl.trim();
  while (backendUrl.endsWith("/")) backendUrl.remove(backendUrl.length() - 1);
  backendTls = backendUrl.startsWith("https://");
  if (!backendTls && !backendUrl.startsWith("http://")) return false;
  String host = backendUrl.substring(backendTls ? 8 : 7);
  if (!host.length() || host.length() > 180 || host.indexOf('/') >= 0 || host.indexOf('@') >= 0 || host.indexOf('?') >= 0 || host.indexOf('#') >= 0) return false;
  const int colon = host.indexOf(':');
  backendPort = backendTls ? 443 : 80;
  if (colon >= 0) {
    String port = host.substring(colon + 1);
    if (!port.length() || port.length() > 5) return false;
    for (unsigned int i = 0; i < port.length(); i++) if (!isDigit(port[i])) return false;
    const long value = port.toInt(); if (value < 1 || value > 65535) return false;
    backendPort = value; host = host.substring(0, colon);
  }
  if (!host.length()) return false;
  for (unsigned int i = 0; i < host.length(); i++) if (!isalnum(host[i]) && host[i] != '.' && host[i] != '-') return false;
  backendHost = host; return true;
}

bool validDeviceKey(const String &key) {
  if (key.length() == 64) {
    for (unsigned int i = 0; i < key.length(); i++) if (!isxdigit(key[i])) return false;
    return true;
  }
  if (!key.startsWith("mc1.") || key.length() > 1024) return false;
  const int separator = key.indexOf('.', 4);
  if (separator <= 4 || key.length() - separator - 1 != 43) return false;
  for (unsigned int i = 4; i < key.length(); i++) if (i != static_cast<unsigned int>(separator) && !isalnum(key[i]) && key[i] != '_' && key[i] != '-') return false;
  return true;
}

bool loadConfig() {
  File file = LittleFS.open("/config.json", "r");
  if (!file || file.size() > 2048) return false;
  JsonDocument doc;
  if (deserializeJson(doc, file)) return false;
  backendUrl = doc["backend"] | DEFAULT_BACKEND_URL;
  deviceId = doc["deviceId"] | ""; deviceKey = doc["key"] | ""; patientId = doc["patientId"] | "";
  wifiSsid = doc["ssid"] | ""; wifiPassword = doc["password"] | "";
  return parseBackend() && deviceId.length() && validDeviceKey(deviceKey) && patientId.length() && wifiSsid.length();
}

bool saveConfig() {
  JsonDocument doc;
  doc["backend"] = backendUrl; doc["deviceId"] = deviceId; doc["key"] = deviceKey; doc["patientId"] = patientId;
  doc["ssid"] = wifiSsid; doc["password"] = wifiPassword;
  File file = LittleFS.open("/config.tmp", "w"); if (!file) return false;
  const size_t expected = measureJson(doc), written = serializeJson(doc, file); file.flush(); file.close();
  return written == expected && LittleFS.rename("/config.tmp", "/config.json");
}

int credentialRequest(const char *path, const String &body) {
  if (!parseBackend()) return -1;
  WiFiClient plain; BearSSL::WiFiClientSecure secure;
  secure.setInsecure();
  WiFiClient &client = backendTls ? static_cast<WiFiClient &>(secure) : plain;
  HTTPClient http; http.setTimeout(12000);
  if (!http.begin(client, backendUrl + path)) return -1;
  http.addHeader("Content-Type", "application/json");
  const int status = http.POST(body);
  if (status != 200) { http.end(); return status; }
  const String response = http.getString(); http.end();
  if (response.length() > 2048) return -1;
  JsonDocument doc;
  if (deserializeJson(doc, response)) return -1;
  const String nextId = doc["deviceId"] | "", nextKey = doc["key"] | "", nextPatient = doc["patientId"] | "";
  if (!nextId.length() || !validDeviceKey(nextKey) || !nextPatient.length()) return -1;
  if (patientId.length() && patientId != nextPatient) {
    lastSeq = 0; hasCursor = false; alerting = false; alertCount = 0; alertHead = 0; activeId = ""; activeSeq = 0;
    for (String &id : recentEvents) id = "";
    LittleFS.remove("/cursor.json"); outputs(false, false);
  }
  deviceId = nextId; deviceKey = nextKey; patientId = nextPatient;
  return 200;
}

bool pairDevice(const String &code) {
  if (code.length() != 6) return false;
  for (unsigned int i = 0; i < code.length(); i++) if (!isDigit(code[i])) return false;
  JsonDocument request; request["code"] = code; String body; serializeJson(request, body);
  return credentialRequest("/api/devices/pair", body) == 200;
}

bool setupButtonHeld() {
  if (SETUP_BUTTON_PIN < 0) return false;
  pinMode(SETUP_BUTTON_PIN, INPUT_PULLUP);
  const uint32_t opened = millis();
  while (millis() - opened < 2000) {
    if (digitalRead(SETUP_BUTTON_PIN) == LOW) {
      const uint32_t pressed = millis();
      while (digitalRead(SETUP_BUTTON_PIN) == LOW) {
        if (millis() - pressed >= 5000) return true;
        outputs(millis() % 400 < 200, false); delay(10);
      }
    }
    delay(10);
  }
  return false;
}

void configurePortal() {
  portalLed.attach_ms(100, []() { digitalWrite(LED_PIN, !digitalRead(LED_PIN)); });
  for (;;) {
    const String previousBackend = backendUrl;
    WiFiManager manager; manager.setDebugOutput(false); manager.setTitle("MoveCompass setup");
    manager.setBreakAfterConfig(true); manager.setConnectTimeout(25);
    WiFiManagerParameter server("backend", "MoveCompass server address", backendUrl.length() ? backendUrl.c_str() : DEFAULT_BACKEND_URL, 199);
    WiFiManagerParameter code("code", "Six-digit pairing code (blank to keep current pairing)", "", 7, "inputmode='numeric' pattern='[0-9]{6}' maxlength='6'");
    WiFiManagerParameter info("<p>Use your home 2.4 GHz WiFi. Copy the server address and pairing code from your care team. Codes last 15 minutes. Demo TLS does not verify certificates.</p>");
    manager.addParameter(&server); manager.addParameter(&code); manager.addParameter(&info);
    Serial.println("Setup WiFi: MoveCompass-Setup; open http://192.168.4.1");
    if (!manager.startConfigPortal("MoveCompass-Setup") || WiFi.status() != WL_CONNECTED) continue;
    backendUrl = server.getValue();
    const String pairing = code.getValue();
    const bool keep = !pairing.length() && validDeviceKey(deviceKey) && previousBackend == backendUrl;
    if (!parseBackend() || (!keep && !pairDevice(pairing))) { Serial.println("Pairing failed: check server address and request a fresh code"); continue; }
    wifiSsid = WiFi.SSID(); wifiPassword = WiFi.psk();
    if (!saveConfig()) { Serial.println("Could not save setup; request a fresh pairing code and try again"); continue; }
    Serial.println("Setup saved; connecting to care team"); break;
  }
  portalLed.detach(); outputs(false, false);
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

void saveCursor() {
  JsonDocument doc; doc["deviceId"] = deviceId; doc["seq"] = lastSeq;
  File file = LittleFS.open("/cursor.tmp", "w"); if (!file) return;
  serializeJson(doc, file); file.flush(); file.close(); LittleFS.rename("/cursor.tmp", "/cursor.json");
}

void deliveryAck(uint64_t seq) {
  if (!seq) return;
  lastSeq = max(lastSeq, seq); hasCursor = true; saveCursor();
  if (backendConnected) { JsonDocument doc; doc["kind"] = "ack"; doc["seq"] = seq; String message; serializeJson(doc, message); socketClient.sendTXT(message); }
}

void nextAlert() {
  if (alerting || !alertCount) return;
  activeId = alerts[alertHead].id; activeSeq = alerts[alertHead].seq;
  alerts[alertHead].id = ""; alertHead = (alertHead + 1) % 16; alertCount--;
  Serial.println("FLASH: 5 x (100ms ON / 100ms OFF), then ON 3000ms");
  alertStarted = millis(); alerting = true;
}

void finishAlert() {
  alerting = false;
  recentEvents[recentIndex] = activeId; recentIndex = (recentIndex + 1) % 16;
  deliveryAck(activeSeq); activeId = ""; activeSeq = 0;
  outputs(false, false); nextAlert();
}

void completion(uint8_t *payload, size_t length) {
  if (length > 4096) { Serial.println("Ignored oversized message"); return; }
  JsonDocument document;
  if (deserializeJson(document, payload, length)) { Serial.println("Ignored invalid JSON"); return; }
  if (document["kind"] == "ready" && document["seq"].is<uint64_t>() && !alerting && !alertCount) { lastSeq = document["seq"].as<uint64_t>(); hasCursor = true; saveCursor(); return; }
  if (document["kind"] != "event") return;
  JsonObject event = document["event"].as<JsonObject>();
  const char *id = event["id"] | "";
  const char *patient = event["patientId"] | "";
  const char *exercise = event["exerciseName"] | "";
  if (event["type"] != "exercise_completed" || !*id || !*patient || !*exercise ||
      !event["reps"].is<int>() || event["reps"].as<int>() < 1 || event["reps"].as<int>() > 100) return;
  if (patientId != patient) return;
  const uint64_t seq = event["seq"] | static_cast<uint64_t>(0);
  if (hasCursor && seq && seq <= lastSeq) { deliveryAck(seq); return; }
  if (activeId == id) return;
  for (uint8_t i = 0; i < alertCount; i++) if (alerts[(alertHead + i) % 16].id == id) return;
  for (const String &seen : recentEvents) if (seen == id) { deliveryAck(seq); return; }
  if (alertCount >= 16) { socketClient.disconnect(); return; }
  alerts[(alertHead + alertCount) % 16] = {String(id), seq}; alertCount++;
  Serial.print("EVENT "); serializeJson(event, Serial); Serial.println();
  nextAlert();
}

void socketEvent(WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      backendConnected = true; socketBackoff = 1000;
      socketClient.setReconnectInterval(socketBackoff);
      Serial.println("Backend connected; idle LED off");
      { JsonDocument doc; doc["kind"] = "resume"; if (hasCursor) doc["since"] = lastSeq; String message; serializeJson(doc, message); socketClient.sendTXT(message); }
      break;
    case WStype_DISCONNECTED:
      backendConnected = false;
      credentialsReady = false; credentialRetryAt = millis() + socketBackoff;
      socketClient.setReconnectInterval(socketBackoff);
      Serial.printf("Backend disconnected; retry in %lu ms\n", static_cast<unsigned long>(socketBackoff));
      socketBackoff = min(socketBackoff * 2, static_cast<uint32_t>(60000));
      break;
    case WStype_TEXT: completion(payload, length); break;
    default: break;
  }
}

void startBackend() {
  socketBackoff = 1000;
  String path = "/ws?ack=1&resume=1&deviceId=" + queryValue(deviceId.c_str()) + "&key=" + queryValue(deviceKey.c_str());
  if (backendTls) {
    socketClient.beginSSL(backendHost.c_str(), backendPort, path.c_str());
  } else socketClient.begin(backendHost.c_str(), backendPort, path.c_str());
  socketClient.setReconnectInterval(1000);
  socketClient.enableHeartbeat(25000, 5000, 2);
}

void updateWifi(uint32_t now) {
  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnected) {
      wifiConnected = true; wifiAttempt = false; wifiBackoff = 1000;
      Serial.print("WiFi connected: "); Serial.println(WiFi.localIP());
      credentialsReady = false; credentialRetryAt = now;
    }
    if (!credentialsReady) {
      if (!due(now, credentialRetryAt)) return;
      JsonDocument request; request["deviceId"] = deviceId; request["key"] = deviceKey; String body; serializeJson(request, body);
      const int status = credentialRequest("/api/devices/recover", body);
      if (status == 200) { saveConfig(); credentialsReady = true; credentialBackoff = 1000; startBackend(); }
      else if (status == 401 || status == 403) { Serial.println("Pairing lost: ask staff to recreate the account, then pair again"); configurePortal(); credentialRetryAt = millis(); }
      else { credentialRetryAt = millis() + credentialBackoff; credentialBackoff = min(credentialBackoff * 2, static_cast<uint32_t>(60000)); Serial.println("Server sleeping or unavailable; will keep retrying"); }
      return;
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
    WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str()); wifiStarted = now; wifiAttempt = true;
  } else if (wifiAttempt && now - wifiStarted >= 15000) {
    WiFi.disconnect(); wifiAttempt = false; wifiRetryAt = now + wifiBackoff;
    Serial.printf("WiFi timeout; retry in %lu ms\n", static_cast<unsigned long>(wifiBackoff));
    wifiBackoff = min(wifiBackoff * 2, static_cast<uint32_t>(60000));
  }
}

void updateAlert(uint32_t now) {
  if (ACK_BUTTON_PIN >= 0) {
    const bool pressed = digitalRead(ACK_BUTTON_PIN) == LOW;
    if (pressed != buttonRaw) { buttonRaw = pressed; buttonChanged = now; }
    if (now - buttonChanged >= 40 && buttonStable != buttonRaw) {
      buttonStable = buttonRaw;
      if (buttonStable && alerting) {
        Serial.println("ACK: alert silenced; delivery acknowledged, no completion created"); finishAlert();
      }
    }
  }
  if (alerting) {
    const uint32_t elapsed = now - alertStarted;
    if (elapsed < 4000) {
      const bool on = elapsed >= 1000 || elapsed % 200 < 100;
      outputs(on, on); return;
    }
    Serial.println("Alert finished"); finishAlert();
    if (alerting) return;
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
  if (!LittleFS.begin()) { Serial.println("Storage unavailable; erase flash and reinstall"); while (true) { outputs(millis() % 200 < 100, false); delay(50); } }
  const bool force = setupButtonHeld();
  if (!loadConfig() || force) configurePortal();
  { File file = LittleFS.open("/cursor.json", "r"); if (file && file.size() < 512) { JsonDocument doc; if (!deserializeJson(doc, file) && doc["deviceId"] == deviceId && doc["seq"].is<uint64_t>()) { lastSeq = doc["seq"].as<uint64_t>(); hasCursor = true; } } }
  if (backendTls) Serial.println("WARNING: demo HTTPS/WSS uses TLS without certificate verification");
}

void loop() {
  const uint32_t now = millis();
  updateWifi(now); updateAlert(millis()); yield();
}
