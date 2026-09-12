# Android vs iOS 1.0.50 — parity audit

**Date:** 2026-09-11. **Method:** direct code audit of both repos (`22-rpm-android-app` and
`rpm-ios-app`), not assumed parity. **Forward plan:** see [ANDROID_LAUNCH_PLAN.md](ANDROID_LAUNCH_PLAN.md).

The two apps do **not** share a codebase. Android is `com.infuzamed` ("infuzamed"), RN 0.80,
**version 1.0.39** (versionCode 40); iOS is a separate repo at **1.0.50** (build 53). Crucially
they don't share the native BLE layer (see §"different SDK").

## Correction to the first-pass finding (important)
The initial sweep flagged a **release-blocking dev-IP login** (`Login.js` → `http://192.168.1.15:4000`).
On closer check that was an **uncommitted local edit on the `test/local-backend` branch** — a local
testing setup, not shipped code. On `origin/main`, `Login.js` already points at prod
(`https://api.twentytwohealth.com/rpm-be`). **So login is not broken in committed code.** The audit
had read a dirty working tree. (The genuine issue was that the base URL was hardcoded inline in 8
screens — since centralized in `apiConfig.js`, `feature/api-config-centralize`.)

## The seven questions

1. **What Android has that iOS 1.0.50 has:** BP capture, SpO2 capture, biometric/OTP/password
   login, a redesigned Home. **Lacks:** durable outbox, `measured_at`, working device-history sync,
   medications, education, a global readings tab. **Partial/broken:** ECG (captures, never uploads),
   Home (real data only for BP; the rest are hardcoded).
2. **Lacks entirely:** Medications, Education, durable outbox, `measured_at`, a global readings tab.
3. **Durable outbox? NO — fire-and-forget.** BP retries in-memory 3× then `throw`s → an Alert → the
   reading is **dropped**, never persisted (`BloodPressure.js`). Oxygen has no retry. iOS persists to
   `bp_outbox.json` and drains on reconnect. **This is the highest-impact gap.**
4. **`measured_at`? ABSENT.** BP `timestamp` is `new Date()` at POST (receipt), not measurement.
   Impact is *smaller* than it was on iOS **because there's no outbox** to create a measure-vs-receipt
   gap — but it becomes **mandatory the moment an outbox is added** (queued readings then sync later).
   The two are coupled.
5. **Device-history sync? NO (non-functional stub).** `getFileList`/`readFile` are wired but
   `handleReadFileComplete` is an **empty function** — downloaded history is never parsed or uploaded.
   iOS ships its version **disabled** anyway, so this isn't even a parity gap worth closing.
6. **Host/auth:** data screens post to `https://api.twentytwohealth.com/rpm-be` — **confirmed**, and
   why Android was unaffected by the `rmtrpm.duckdns.org` cert outage (iOS's host). Auth is
   cookie + token mirrored to AsyncStorage.
7. **Version 1.0.39, branding still "infuzamed."** Whether it's live on Google Play **can't be
   determined from the repo** — a Play Console check.

## HAVE / LACK / PARTIAL

| Capability | iOS 1.0.50 | Android 1.0.39 |
|---|---|---|
| BP cuff capture (live) | ✅ VTMProductLib (ObjC) | ✅ **Lepu "blepro" SDK (Kotlin)** — different native module, same BP2 device |
| SpO2 | ✅ | ✅ (Oxyfit) |
| ECG | ✅ | ⚠️ captures but **never uploads** |
| Durable outbox | ✅ native `bp_outbox.json` | ❌ fire-and-forget (reading lost on failed POST) |
| `measured_at` | ✅ live path | ❌ absent (POST-time stamp) |
| Device-history backfill | ✅ built, flag-OFF | ⚠️ dead stub (`handleReadFileComplete` empty) |
| Readings/history tab | ✅ global | ⚠️ per-device only |
| Medications | ✅ | ❌ |
| Education | ✅ | ❌ |
| Redesigned Home | ✅ real data | ⚠️ **fabricated vitals** for every card except BP |
| Biometric / OTP / password login | ✅ (Keychain) | ✅ **but creds plaintext in AsyncStorage** |
| Backend host | rmtrpm.duckdns.org | api.twentytwohealth.com |

## Risks / surprises worth recording
- **Fabricated vitals on Home** — hardcoded glucose `98`, weight `190.2`, etc. for devices Android
  can't capture. Patient-facing; must be removed before onboarding ("won't ship fabricated vitals").
- **Plaintext credentials at rest** — biometric login stores email + password in AsyncStorage and
  replays them. iOS uses the Keychain. Move to Android Keystore.
- **Different native SDK** — Android uses Lepu `blepro` (Kotlin); iOS uses VTMProductLib (ObjC). Porting
  an iOS fix (outbox, `measured_at`) means porting the **JS logic**, not the native module.
- **ECG data loss** — captures but never POSTs.
- **Branding** — still "infuzamed"; `applicationId com.infuzamed`. Target `com.twentytwohealth.rpm`
  (must be final before any Play upload — immutable once published).

## Is anyone actually using it?
Two signals (neither queryable from here):
- **The login misconfig on the test branch is a tell for build hygiene**, not usage per se — but if a
  *shipped* build ever carried that dev IP, no one off that LAN could log in. Confirm the live build's
  login host via the Play Console.
- **Server-side usage split** — `dev_data` has no platform column, so split nginx access logs by
  User-Agent (RN Android = `okhttp`, iOS = `CFNetwork`):
  `sudo zgrep -hoiE "okhttp|CFNetwork|Dalvik" $(ls -t /var/log/nginx/*access*.log*) | sort | uniq -c`.
  If `okhttp` ingest is ~0 over the retained window, nobody is transmitting from Android today —
  which is consistent with "nobody's using it because it isn't field-usable yet."

**Decision on record (2026-09-11):** Android stays and gets a proper launch (there are Android clients
to target); no installed base to protect, so it's sequenced as a launch, not hotfixed. Plan +
estimates + Play-Store notes: [ANDROID_LAUNCH_PLAN.md](ANDROID_LAUNCH_PLAN.md).
