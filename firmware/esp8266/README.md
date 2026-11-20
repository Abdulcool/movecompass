# MoveCompass board: no-code setup

You need a **NodeMCU ESP8266**, a USB **data** cable and home **2.4 GHz WiFi**.
The onboard LED needs no extra wiring. Use demo data only until device TLS,
privacy and the complete system have been reviewed for patient use.

## Quick start

1. Open MoveCompass in **Chrome or Edge on a desktop computer**. Sign in as staff.
2. In **Device settings**, register the board for the patient's email. Keep its
   **six-digit pairing code**, valid once for **15 minutes**.
3. Open **USB device flasher** (`/flash.html`), plug in the board, click **Connect
   and install**, pick its USB port and install. Erase for a fresh setup.
4. If no serial port appears, try another USB data cable or install the appropriate
   [CH340 driver](https://www.wch-ic.com/downloads/CH341SER_EXE.html) or
   [CP2102 driver](https://www.silabs.com/developer-tools/usb-to-uart-bridge-vcp-drivers).
5. The LED blinks quickly. Join **MoveCompass-Setup** WiFi on your phone. Stay
   connected even if it says “No internet”. Open **http://192.168.4.1** if needed.
6. Choose home WiFi, enter its password, paste the server URL shown by the flasher
   (e.g. `https://your-service.onrender.com`) and enter the pairing code. Save.
   No code editing, patient-ID copying or secret-key copying is needed.
7. Slow LED blink means connecting; LED off means connected. Staff sees Online.
   Complete one set as the patient: five quick flashes, then a three-second hold.

WiFi/pairing are remembered in LittleFS. To change setup, tap RESET, release it,
then **immediately hold FLASH for five seconds**. Do not hold FLASH during reset:
GPIO0 also selects the serial bootloader. Configure the open setup AP in a trusted
place. WiFi passwords and device credentials are not in the shipped binary.

## Optional wiring

| Function | NodeMCU pin | Connection |
|---|---|---|
| Onboard LED | D4 / GPIO2 | Already fitted; active LOW |
| Acknowledge/setup | D3 / GPIO0 | Built-in FLASH, or momentary switch to GND |
| Active buzzer | e.g. D5 / GPIO14 | Set `BUZZER_PIN = 14`; HIGH means sound |

Use a 3.3 V-compatible active buzzer module with a logic input, or a transistor
driver and shared GND. Do not drive high-current loads directly or apply 5 V to
GPIO. Passive piezos need a tone driver and are unsupported. The default buzzer
pin is `-1` (disabled). GPIO0 and GPIO2 must be HIGH at reset; avoid extra loads.

## Advanced: Arduino IDE / CLI

Supported versions: **ESP8266 core 3.1.2**, **WebSockets by Markus Sattler
(links2004) 2.7.2**, **ArduinoJson 7.4.2**, **tzapu WiFiManager 2.0.17**.
LittleFS, BearSSL, HTTPClient and Ticker are included in the core.

In Arduino IDE 2.x, add
`https://arduino.esp8266.com/stable/package_esp8266com_index.json` to Preferences →
Additional boards manager URLs. Install the core in Boards Manager and the three
libraries in Library Manager. Copy `config.h.example` to ignored `config.h`:
it contains **only the default backend URL and pins**, not credentials.
Open the sketch, choose **NodeMCU 1.0 (ESP-12E Module)** and your USB serial port,
then Verify/Upload. Serial Monitor uses **115200 baud**. Never publish private
configuration or enable secret-bearing WebSocket/proxy query-string debug logs.

```sh
arduino-cli core update-index --additional-urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli core install esp8266:esp8266@3.1.2 --additional-urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli lib install 'WebSockets@2.7.2' 'ArduinoJson@7.4.2' 'WiFiManager@2.0.17'
node firmware/esp8266/build.mjs
```

Set `ARDUINO_CLI` if it is not on PATH. The build script stages defaults under
`~/.movecompass-build`, compiles **esp8266:esp8266:nodemcuv2**, verifies eboot and
application headers at offsets 0/4096, and writes the merged image and manifest
to `app/public/firmware`. ESP Web Tools flashes the `.bin` at offset **0**.
Rebuild the web app after updating that committed binary. The installer and all
dependencies are bundled locally, not fetched from a CDN.

## Protocol and alerts

The board connects to `/ws?ack=1&resume=1&deviceId=…&key=…`, then sends
`{kind:"resume",since:lastSeq}` (without `since` for the first connection).
The server scopes events to the registered patient; the board also checks
`event.patientId`. The event's `deviceId` identifies its source, not its recipient.

The envelope is `{kind:"event",event:{id,seq,type:"exercise_completed",patientId,
patientName,exerciseId,exerciseName,reps,source,transport,completedAt,deviceId,
angles,setNumber,totalSets}}`. Each matching set is logged to Serial and flashes
GPIO2 **5 × (100 ms on / 100 ms off)**, then holds ON **3 seconds**. A buzzer
follows all ON periods. Network/TLS handshakes can briefly delay LED/button timing.

Missed sets replay in sequence. The server holds one unacknowledged set per board;
the board queues alerts and sends `{kind:"ack",seq}` only after the full pattern
or a local silence press. The cursor is persisted in LittleFS. Pressing FLASH
while alerting silences just that set. It never sends `{kind:"button"}`, which
would create a new completion. Sudden power loss between display and saving the
acknowledgement can repeat an alert: this is at-least-once notification, not a
clinical delivery guarantee.

WiFi attempts time out after 15 seconds. WiFi, HTTP recovery and WS use backoff
capped at **60 seconds** and keep retrying. Ping/pong detects dead links. At boot,
and after a WebSocket disconnection even if WiFi stays connected,
`POST /api/devices/recover` refreshes the patient ID. With `DEVICE_PAIRING_SECRET`,
the signed device credential recreates registration after a demo DB wipe. If a
non-demo patient was erased, staff recreates the account and the board returns
to setup to re-pair. Rotating the secret also requires re-pairing. See
[Render Free setup](../../docs/DEPLOY-RENDER.md).

### TLS limitation

Demo HTTPS uses BearSSL **setInsecure()**. The pinned WebSockets library's
`beginSSL` without a fingerprint also skips certificate verification for WSS.
Encryption is **not server authentication**: an attacker could intercept device
credentials and patient data. Provision a CA/fingerprint and clock, use
`beginSslWithCA` and review durable authorization before real patient use.
Plain HTTP/WS is for trusted LAN tests only.

## Simulator and verification

```sh
npm ci
node --test firmware/esp8266/simulate.test.mjs
node --import tsx firmware/esp8266/smoke.mjs
```

The smoke test starts an isolated backend, registers and pairs by code, verifies
patient isolation, flashes a camera completion and checks local silence. Then it
disconnects, records two sets, reconnects with its cursor and waits for **two
separate queued flashes**. Keys stay in memory and are not printed. Push sending
is stubbed. Manual simulation takes `BACKEND_URL`, `DEVICE_ID`, `DEVICE_KEY` and
`PATIENT_ID` from the process environment. Node verifies TLS by default;
`INSECURE_TLS=true` reproduces only the board's demo behavior.

## Troubleshooting

- **No USB port:** close serial apps, use a data cable and install the right driver.
- **No setup page:** join MoveCompass-Setup and open 192.168.4.1.
- **Pairing fails:** check the URL and ask staff for a fresh 15-minute code.
- **WiFi fails:** use 2.4 GHz and avoid WiFi networks requiring browser login.
- **Slow blink:** wait about one minute for a sleeping server. Check DNS, firewall,
  port, HTTPS settings and `/ws` proxy upgrades if it persists.
- **Online but no flash:** complete a set as the registered patient. Names and
  source-device IDs are not identity matches; other patients are not delivered.
- **Will not boot:** release FLASH/GPIO0 and remove GPIO0/GPIO2 loads at reset.
- Compilation and simulation do not prove physical USB flashing, LED/buzzer,
  WiFi radio or public WSS behavior. Those require a powered board.
