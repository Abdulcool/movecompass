# MoveCompass NodeMCU ESP8266

This companion receives exercise completions and alerts the registered patient's
care partner. It does not perform pose inference. Supported build: **ESP8266
Arduino core 3.1.2**, **WebSockets by Markus Sattler (links2004) 2.7.2**,
**ArduinoJson by Benoit Blanchon 7.4.2**. No native app changes are required.

## Wiring

| Function | NodeMCU pin | Connection |
|---|---|---|
| Onboard LED | D4 / GPIO2 | Already fitted on typical NodeMCU boards; active LOW |
| Optional acknowledge button | D3 / GPIO0 | Momentary switch between D3 and GND; set `ACK_BUTTON_PIN = 0` |
| Optional active buzzer | e.g. D5 / GPIO14 | Set `BUZZER_PIN = 14`; HIGH means sound |

Use a 3.3 V-compatible active buzzer module with a logic input, or a suitable
transistor driver and shared GND for higher-current buzzers. Do not power a
high-current buzzer directly from a GPIO, or apply 5 V to ESP8266 pins. A passive
piezo requires a tone driver and is not supported by this HIGH/LOW sketch.
Defaults disable the buzzer and button (`-1`); the onboard LED needs no wiring.
Choose different pins for each function and avoid boot-strapping pins for a buzzer.
**GPIO0 must be HIGH at reset**: do not hold the acknowledge button while powering
on/resetting, unless intentionally entering the serial bootloader. GPIO2 must also
be HIGH at boot; do not add a load that pulls it LOW.

## Register and configure

1. Run the backend on a LAN-accessible address (not just the computer's loopback).
   For the existing local demo, start `npm run dev -w server`; its default port is
   8080. Allow this port through the host firewall. ESP8266 supports 2.4 GHz WiFi,
   not 5 GHz-only networks or typical captive portals.
2. Log into the app as CCCARE staff (`staff@cccare.ca` / `123` for the local demo).
   In the staff dashboard's **Register a device** section, enter a device name and
   the patient's email, e.g. `janedoe@gmail.com`. Click **Register device**.
   Copy the one-time `deviceId` and `deviceKey` before hiding them; only a key hash
   is stored by the backend. Register a new device if a key is lost.
3. Obtain this device's **patientId** from the authenticated `GET /api/devices`
   response. In browser developer tools → Network, click the dashboard's Refresh
   button and inspect that response. Find the entry with your deviceId and copy
   `patientId` (not patientEmail or patientName). The existing generated app config
   includes a patient name, but this firmware deliberately requires the unique ID.
4. Copy `config.h.example` to `config.h` beside `esp8266.ino`. Fill WiFi credentials,
   backend host **without** scheme/path, port, TLS flag, device credentials, and
   `PATIENT_ID`. For local HTTP use the computer's LAN IP and port 8080, TLS false.
   `localhost`/`127.0.0.1` on the board means the board itself, not the computer.
   For a public HTTPS backend use its DNS hostname, port 443, TLS true.
5. Never commit `config.h` (locally ignored), paste keys into tickets, or publish
   firmware binaries containing real credentials. A changed/recreated backend
   database requires new registration and a matching patient ID.

## Arduino IDE flashing

1. Install Arduino IDE 2.x. Add this URL in Preferences → Additional boards manager
   URLs: `https://arduino.esp8266.com/stable/package_esp8266com_index.json`.
2. In Boards Manager install **esp8266 by ESP8266 Community**, version 3.1.2.
3. In Library Manager install the WebSockets and ArduinoJson versions listed above.
4. Open `esp8266.ino`; select **NodeMCU 1.0 (ESP-12E Module)**, your USB serial port,
   and 115200 upload speed. Verify, then Upload. Use a data-capable USB cable and
   install your board's CH340/CP210x serial driver if needed. Most boards auto-reset;
   use FLASH/RESET if uploading cannot enter the bootloader.
5. Open Serial Monitor at **115200 baud**. Expect WiFi and backend connected messages.
   GPIO2 stays off once idle/connected. The board should become Online in staff UI.

### Reproducible CLI compile

With `arduino-cli` installed, from the repository root:

```sh
arduino-cli core update-index --additional-urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli core install esp8266:esp8266@3.1.2 --additional-urls https://arduino.esp8266.com/stable/package_esp8266com_index.json
arduino-cli lib install 'WebSockets@2.7.2' 'ArduinoJson@7.4.2'
cp firmware/esp8266/config.h.example firmware/esp8266/config.h
# Edit config.h for real hardware, or leave placeholder values for compile-only.
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 firmware/esp8266
arduino-cli upload --fqbn esp8266:esp8266:nodemcuv2 --port /dev/ttyUSB0 firmware/esp8266
```

## Protocol and behavior

The URL is `/ws?deviceId=<URL-encoded ID>&key=<URL-encoded key>`. Field names were
checked against `server/src/backend.ts`: the outer message has `kind: "event"`,
and `event` includes `id`, `type: "exercise_completed"`, `patientId`, `patientName`,
`exerciseId`, `exerciseName`, `reps`, `source`, `transport`, `completedAt`, `deviceId`,
and `angles`. **event.deviceId is the event's source**, e.g. `movecompass-camera`,
not necessarily this board. Only `event.patientId === PATIENT_ID` selects alerts.

The current demo server broadcasts every completion to ALL connected devices.
Local filtering avoids wrong-patient alerts, but is not a privacy boundary: all
devices still receive other patients' data. Production deployments need backend
authorization/filtering changes; this firmware does not change that contract.

- A matching completion prints the event JSON to Serial, flashes GPIO2 five times
  (100 ms on, 100 ms off), holds it on for 3 seconds, then returns to idle. The
  optional active buzzer follows all ON periods, including the 3-second hold.
- A new distinct completion restarts the pattern. The last 16 event IDs are
  remembered in RAM to suppress duplicate alerts; reboot clears that window.
- The button debounces for 40 ms and silences locally. **It sends no `{kind:"button"}`
  message**: the server interprets that message as a NEW exercise completion, not
  an acknowledgement. It does not mark an exercise completed or notify staff.
- While WiFi/backend connects, the LED blinks one second on/one second off, without
  buzzer. An active completion alert takes precedence over connection status.
- WiFi attempts have a 15-second timeout and 1/2/4/8/16/30-second retry delays.
  WebSocket retry delays use the same bounded backoff, reset after connection.
  Ping/pong heartbeats detect dead links. Pattern and button timing use `millis()`;
  there are no alert `delay()` calls, though synchronous network/TLS handshakes
  can temporarily delay servicing the loop.
- Invalid JSON, messages over 4096 bytes, missing fields, null/foreign patient IDs,
  and device-status messages are ignored. There is no offline event replay; a
  completion emitted while the device is disconnected is not recovered on reconnect.

### WSS security

With the pinned links2004 library on ESP8266/BearSSL, `beginSSL` with no fingerprint
uses **setInsecure() internally**. This supports public HTTPS/WSS without clock/CA
configuration, but does **not** authenticate the server certificate: an attacker
on the network could intercept the device key and patient data. It is a demo
convenience, not production TLS. Use a pinned fingerprint or `beginSslWithCA` plus
appropriate time/CA provisioning before patient deployment. Plain WS also sends
the key/data without encryption; restrict it to trusted local testing. Avoid
WebSockets debug logging and proxy query-string access logs containing the key.

## Virtual ESP and local loop verification

Use the repository's Node 22 environment and install workspace dependencies with
`npm ci`. The simulator uses the existing `ws` dependency, answers server pings,
filters/deduplicates the same fields, reconnects with bounded exponential backoff,
and logs the actual timed LED pattern. It does not drive physical GPIOs.

```sh
export BACKEND_URL=http://127.0.0.1:8080
export DEVICE_ID='your-registered-id'
export DEVICE_KEY='your-key' # prefer your shell's secure input rather than history
export PATIENT_ID='the-device-patient-id'
node firmware/esp8266/simulate.mjs
# Type ack + Enter to silence locally; Ctrl-C stops.
```

For WSS use `BACKEND_URL=https://your-host`; certificate verification is ON by
default in Node. Set `INSECURE_TLS=true` only to reproduce the board's demo TLS mode.

```sh
node --test firmware/esp8266/simulate.test.mjs
node --import tsx firmware/esp8266/smoke.mjs
```

The smoke script starts the real backend on a loopback ephemeral port with an
isolated persistent `~/work/esp8266-smoke-*` SQLite directory. It registers a device,
connects the virtual ESP, forces a reconnect, rejects another patient's completion,
POSTs Jane's camera completion, waits for the full flash pattern, and checks local
acknowledgement creates no extra completion. Credentials stay in memory and are
not printed. Push sending is stubbed for this local check only.

## Troubleshooting

- **Never connects to WiFi:** check 2.4 GHz SSID/password, signal and captive portals.
- **WiFi works, backend stays offline:** check host/port/TLS, firewall, proxy WebSocket
  upgrades at `/ws`, and device key. TLS needs extra heap. The HTTP upgrade rejects
  incorrect credentials with 401; the board retries without printing its secret URL.
- **Online but no alert:** verify `PATIENT_ID` matches the registered device's entry,
  and complete an exercise as that patient. Patient names/emails and device source
  IDs are not identity matches. Invalid/oversized payloads do not trigger alerts.
- **Slow blinking vs five flashes:** slow means disconnected; quick flashes and a
  long hold mean a matching completion. An acknowledge press cancels only the latter.
- **LED polarity differs:** this sketch assumes GPIO2 active LOW as requested; some
  board clones have a different LED. Verify your board before changing pin/polarity.
- **Board won't boot:** release D3/GPIO0; remove external loads on GPIO0/GPIO2 and
  check the buzzer driver and power supply. Upload/Serial ports may need user permissions.
- **Missed alerts:** offline replay and persistent deduplication are not implemented.
  Compiling and simulation do not verify physical LED, buzzer, WiFi radio or WSS
  behavior on hardware; those require a powered board and a reachable backend.
