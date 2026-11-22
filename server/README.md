# Backend contract

HTTP and `/ws` share `PORT` (default 8080). JSON requests; errors return
`{error:string}` or validation `{errors:string[]}`. CORS enabled.
Bearer auth is `Authorization: Bearer <token>`. Tokens expire after seven days.

## Accounts

No accounts are seeded by default. Set `SEED_DEMO=1` only for a private preview:
Jane Doe `janedoe@gmail.com` / `123` (patient) and `staff@cccare.ca` / `123` (staff).
Jane cannot select the staff role. For public deploys, set both
`DEMO_PATIENT_PASSWORD` and `DEMO_STAFF_PASSWORD` to independent random secrets
(8–72 bytes). Render generates these values and does not set `SEED_DEMO`.
These secrets replace existing demo-account passwords when configured.
Other users cannot select a role not assigned to their account. Public registration
only creates patients; it cannot create staff. This is a deliberate security boundary.

| Method | Path | Auth | JSON body / query | Success |
|---|---|---|---|---|
| POST | `/api/auth/register` | Public | `{email,name,password,role?:"patient"}`; password 8–72 bytes | 201 `{token,user}` |
| POST | `/api/auth/login` | Public | `{email,password,role:"patient"\|"staff"}` | 200 `{token,user}` |
| GET | `/api/me` | Bearer | — | `{user}` |
| POST | `/api/completions` | Bearer | `{exerciseId,exerciseName,reps,source:"manual"\|"camera",angles?:{joint:number}}` | 201 `{event}` |
| POST | `/api/esp32/notify` | Registered device: `X-Device-Key`; legacy optional | `{type:"exercise_completed",deviceId,patientName,exerciseId,exerciseName,reps,completedAt,transport:"wifi"\|"app"\|"camera"}` | 202 `{event}` |
| GET | `/api/esp32/latest` | Public (legacy compatibility) | — | `{event:null\|event}` |
| GET | `/api/events?limit=50` | Bearer | limit 1–200; newest first, patients own events, staff all | `{events:[]}` |
| POST | `/api/devices` | Staff Bearer | `{name,patientEmail}` | 201 `{deviceId,deviceKey}`; key shown once |
| GET | `/api/devices` | Staff Bearer | — | `{devices:[{deviceId,name,patientId,patientEmail,lastSeen,online}]}` |
| POST | `/api/push/register` | Bearer | `{token}`; valid Expo push token | 201 `{ok:true}` |
| GET | `/healthz` | Public | — | `{ok:true}` |

User shape: `{id,email,name,role}`. Counts must be integers 0–10000; zero allows
saving a tracking session with no counted repetitions. Angles are finite ROM values
0–360. Event timestamps use ISO8601 with a timezone. Required strings cannot be
blank and are limited to 200 characters. Invalid payloads return 400 with errors;
missing/incorrect device credentials return 401. Unknown API routes return 404.

Event shape:
```
{ id, type:"exercise_completed", patientId:string|null, patientName,
  exerciseId, exerciseName, reps, deviceId, completedAt,
  transport:"wifi"|"app"|"camera", source:"manual"|"camera"|"device",
  angles:{joint:number} }
```

The server derives app event ownership from the JWT, and registered device ownership
from registration (ignoring a spoofed patientName). Legacy unregistered devices match
an existing patient name if possible; unmatched legacy events have `patientId:null`.
Every accepted event is durably stored before live broadcast. The latest endpoint
uses insertion order, not the device-supplied timestamp. It intentionally retains
the PDF's public legacy interface; disable/restrict that path for real patient data.

## WebSocket

- App: `/ws?token=<jwt>`; device: `/ws?deviceId=<id>&key=<key>`.
- Invalid credentials reject the HTTP upgrade with 401; expired app sessions close.
- Every completion: `{kind:"event",event}` to staff, owning patient, **all devices**.
- Device changes: `{kind:"device",deviceId,online}` to staff, owner, all devices.
- Device send: `{kind:"button",exerciseId?,reps?}`; defaults to sit-to-stand / its
  prescribed reps. Supplied exerciseId must be one of the shared six exercises.
- Invalid or unauthorized WS messages receive `{kind:"error",error}`.
- Ping every 25 seconds; absent pong terminates connection. Clients should reconnect.
- Staff Expo tokens receive completion pushes. Failures do not roll back events;
  sends are attempted asynchronously, without a durable retry queue. Dead tokens
  reported in immediate Expo tickets are removed. Native delivery requires real Expo credentials.

## Environment and persistence

- `DATA_DIR`: defaults to `./data` relative to working directory (`server/data`
  under npm workspace scripts). SQLite WAL stores users, events, devices and tokens.
- `JWT_SECRET`: at least 32 characters; otherwise generated once in DATA_DIR with
  mode 0600 and reused after restart. Never commit the directory or secret.
- `ALLOW_UNREGISTERED_DEVICES`: defaults `true` for PDF demo; set `false` to require
  registered keys on every notify request. WS always requires registered credentials.
- `WEB_DIST`: defaults `../app/dist` relative to working directory. Static files plus
  extensionless SPA route fallback; absent app build returns 404 (API unaffected).
- `PORT`: defaults `8080`. Graceful SIGINT/SIGTERM closes sockets and SQLite.

Device keys are random, SHA-256 hashed at rest, and never returned by the list API.
Use HTTPS/WSS in deployment; query-string credentials must be redacted from proxy logs.
Broadcasting all patient completions to all boards is intentional demo behavior,
not an appropriate production multi-patient privacy boundary.
