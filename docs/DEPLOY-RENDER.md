# Deploy MoveCompass on Render Free

This is a disposable demonstration, not a production patient record. Render Free
sleeps after about 15 minutes idle. The first request can take around one minute.
The filesystem is ephemeral: a restart, redeploy or instance replacement can erase
accounts, plans, history and registrations. Do not enter real patient information.

## Exact setup steps

1. Open **https://dashboard.render.com/blueprint/new** and sign in to Render.
2. Connect your **GitHub** account and grant access to the repository.
3. Pick **Abdulcool/movecompass**.
4. Pick branch **devin/1763669000-movecompass-v2**.
5. Click **Apply**. The checked-in `render.yaml` creates a Docker **Web Service**
   on the **Free** plan, with automatic deploys and **no persistent disk**.
6. Wait for the deploy to finish. Open the service's HTTPS URL and check `/healthz`.
7. Open the service's **Environment** tab to reveal the generated
   `DEMO_PATIENT_PASSWORD` and `DEMO_STAFF_PASSWORD` values. Keep them private.
   Sign in as patient `janedoe@gmail.com` or staff `staff@cccare.ca`, using the
   corresponding generated password. **The public passwords are not `123`.**
8. Open staff Device settings → USB device flasher. Use the Render HTTPS URL in
   the board's MoveCompass-Setup WiFi portal and enter its fresh pairing code.
9. On a phone, open Device & backend settings and save the Render HTTPS URL.
   The camera tracker and 3D body are loaded from that same backend.

After merging, change the service's deployment branch to **main** in Render's
Settings and update `render.yaml` on main. Automatic deployment stays enabled.

## Generated secrets and data resets

`JWT_SECRET`, `DEVICE_PAIRING_SECRET`, `DEMO_PATIENT_PASSWORD` and
`DEMO_STAFF_PASSWORD` use `generateValue: true`. Keep them in Render's Environment
tab; never put their values in Git. **Do not add `SEED_DEMO`** to a public service:
that variable is reserved for the private local preview with weak demo passwords.

On each fresh start the two demo accounts are re-seeded from the generated
password variables. Non-demo accounts lost in a reset must be created again.
`DATA_DIR=/tmp/movecompass-data` is intentionally disposable.

The backend trusts one reverse-proxy hop by default so rate limits use Render's
forwarded client IP. Set `TRUST_PROXY=0` when serving directly; use an explicit
nonnegative hop count for a different proxy topology. Only expose the backend
through that trusted proxy when proxy trust is enabled.

A paired board stores a signed credential binding its device ID to the patient's
email. Keeping `DEVICE_PAIRING_SECRET` unchanged lets the backend recreate that
registration after a wipe. On reconnect the board refreshes its patient ID. If a
non-demo patient account was erased, staff must recreate the account first; the
board opens setup so it can be paired again. Changing the pairing secret requires
new pairing codes. Rotated/revoked credentials cannot be remembered across a
complete database reset; this is another reason this free deployment is demo-only.

Login shows “Waking the server…” and retries network/502/503/504 errors for up to
90 seconds. Wrong passwords and role errors are shown immediately. The board
continues reconnecting with backoff capped at 60 seconds. Fast LED blink means
setup, slow blink means connecting, and LED off means connected and idle.

No paid instance or persistent disk is required. For durable clinical use, migrate
to persistent storage, backups, verified TLS on devices and an appropriate privacy
and access-control review before collecting patient data.
