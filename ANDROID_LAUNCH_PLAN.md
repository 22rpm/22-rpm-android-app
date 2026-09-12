# Android launch plan (22RPM)

**Framing:** this is a **launch, not a patch**. Nobody is using the Android app because it isn't
usable in the field yet, so there is **no installed base to protect** and no live-user urgency —
we sequence it properly instead of hotfixing. **Package ID target: `com.twentytwohealth.rpm`**
(close to the iOS bundle `com.twentyhealth.rpm`, and ours).

**Repos:** the Android app lives at `22-rpm-android-app` (React Native 0.80, currently branded
`com.infuzamed` / "infuzamed"). The iOS app is a **separate** repo (`rpm-ios-app`, v1.0.50) — the
two do NOT share a codebase, and crucially not the native BLE layer (see "Native app is
mandatory").

---

## PARALLEL TRACK (start this week — NOT a sequence step)

**Register the Google Play developer account as an ORGANIZATION (Twenty Two Health LLC) now.**
This runs alongside all engineering and gates the store launch on **calendar time, not code**.

Why it's a parallel track and why now:
- The **closed-testing gate** — Google's official page (verified 2026-09-11,
  support.google.com/googleplay/android-developer/answer/14151465) requires **12 testers opted
  in continuously for at least 14 days** before you can apply for production. It was 20; it's now
  12. **The page scopes it to "personal developer accounts created after November 13, 2023."** An
  organization account created now falls **outside that stated scope**.
  - **Honesty caveat:** the page defines the requirement as personal-only by *scope*; it does
    **not** contain an explicit "organization accounts are exempt" sentence. The exemption is by
    omission, not an explicit clause. Before betting the whole schedule on it, get it in writing —
    the Play Console community threads where Google specialists answer the org question render
    client-side (open them in a real browser), or ask Google support. The policy scoping supports
    the org route; just don't treat "exempt" as a quoted guarantee.
  - Everyone still runs *some* internal/closed test before production — orgs only skip the
    specific **12-tester / 14-day** production-access gate.
- The long pole is the **D-U-N-S number**, which Google requires to verify an organization. It is
  **free from Dun & Bradstreet but can take up to ~30 days to issue** (expedite options exist,
  sometimes a few days). If Twenty Two Health LLC doesn't already have one, **request it today** —
  everything else waits on it.

What Google requires for **organization verification** (start assembling today):
1. **D-U-N-S number** for Twenty Two Health LLC — **mandatory** for org accounts (verified
   verbatim on Google's "required registration info" page; individual accounts don't need one).
   The long pole — request first.
2. **Legal business name + registered address + a public website**, all matching the D-U-N-S
   record (Google verifies name/address against it).
3. **Organization contact email + phone** (may be shown publicly as the developer contact).
4. **Owner / primary-contact identity** — a government photo ID for the individual, and
   confirmation you're authorized to represent the org.
5. **$25 one-time** registration fee (one-time, vs Apple's $99/year).
6. Likely a **verification email/phone** step to the org's domain.

Kick off the **closed test track** early regardless (even exempt orgs benefit from real-device
coverage), so it isn't sequential with the engineering.

---

## BLOCKING — can't onboard anyone without these

### 1. Login prod URL → centralize the API base  (~2–3h)
**Status correction (2026-09-11):** login is **already prod on `main`** — `Login.js` there
hardcodes `https://api.twentytwohealth.com/rpm-be` inline. The `192.168.1.15:4000` the audit saw
was an **uncommitted local edit on the `test/local-backend` branch**, not shipped code. So there
is no release-blocking login bug in the committed app.

The *real* work, and why it's still worth doing: the base URL is **hardcoded inline in ~6 screens**
(`Home.js`, `BloodPressure.js`, `Oxygen.js`, `Connection.js`, `Profile.js`, `Settings.js`, plus
`Login.js`). That scatter is exactly what let a LAN IP sit in a working tree and what would let one
**ship by accident**. Fix = **one central config** (mirror iOS's `apiConfig.js`): a single
`API_BASE` (prod default; local override via an env/`__DEV__` switch, never a hand-edited constant),
consumed everywhere. Do it on a **branch cut from `main`** (not `test/local-backend`, which holds
the local test edits). Delivers the plan's "env-based config, no stray dev host" intent and closes
the footgun; the literal "point login at prod" is already true.

**DONE (2026-09-11, this branch):** added `apiConfig.js` and wired all 8 screens (Login, Home,
BloodPressure, Oxygen, Profile, Settings, Connection, PrivacySecurityScreen). **Improved on the
iOS pattern that bit us:** the env follows React Native's `__DEV__` build flag, so a
release/archive build resolves to PROD *regardless of what's committed* — a committed
`USE_LOCAL = true` only affects dev builds. You cannot accidentally ship a local host.

### 2. Durable outbox + `measured_at` (coupled)  (~16–28h) — HOLD until the package rename
Highest-impact item. Today reading upload is **fire-and-forget**: BP retries in-memory 3× then
`throw`s → an Alert → **the reading is dropped**, never persisted (`BloodPressure.js`); Oxygen has
no retry. For an RPM app whose purpose is capturing readings, silent loss on a flaky network is the
worst failure.
- **Outbox:** mirror iOS's JS drain pattern — persist on capture (reuse the SQLite Oxygen already
  has, or AsyncStorage), drain on app-start / screen-focus, **delete only on a confirmed 2xx**. The
  server's `(user_id, dev_type, timestamp)` idempotency already makes retries safe.
- **`measured_at`:** stamp it at **capture time** (in `handleRealTimeData`), not POST time, and
  carry it through the queue — this is what makes a delayed/queued send bucket correctly. Absent
  today (`measured_at` appears nowhere); BP `timestamp` is `new Date()` at POST.
- **Coupling:** while there's no outbox, receipt ≈ measurement (seconds), so `measured_at` barely
  matters. The instant the outbox can delay a send, `measured_at` becomes **mandatory** — hence
  built together.
- **Native note:** Android's capture is the **Lepu `blepro` SDK (Kotlin)**, not iOS's VTMProductLib
  — you port the **JS/outbox logic**, not the native module.
- **HOLD** until the package rename (#8's id part) lands, so the outbox isn't built twice.

### 3. Remove the fake Home data  (~4–8h)
The Home summary cards render **hardcoded vitals** (glucose `98`, weight `190.2`, etc.) for devices
Android can't capture (`Home.js`). **We won't ship fabricated vitals.** Real data isn't possible
for those metrics (no devices), so this is mostly **removing** the fake cards/mini-charts, leaving
the **real BP card** plus honest empty states.

### 4. Plaintext creds → Android Keystore  (~6–10h)
Biometric login stores the **email + password in plaintext in AsyncStorage** (`Login.js`) and
replays them. Move to `react-native-keychain` (already an iOS dep; its Android side uses Keystore /
EncryptedSharedPreferences) or EncryptedSharedPreferences directly. No install base = **no
migration needed**, a launch advantage.

**Also in the blocking window (do early):** **lock `applicationId` to `com.twentytwohealth.rpm`**
and rename the package. `applicationId` is **immutable once published** (even to a closed test), so
it must be final before the first Play upload. The visible rebrand (#8) can follow, but the id must
be decided now.

**Blocking subtotal: ~28–50h engineering.**

---

## THEN — to be a real product

| # | Item | Est. | Notes |
|---|---|---|---|
| 5 | **Medications** | 20–40h | Port the iOS feature (list/entry/confirm + API). iOS has native label OCR; Android would need ML Kit or ship **without OCR** first (manual entry) — low end assumes no-OCR v1. |
| 6 | **Education** | 8–16h | Mostly JS + in-app browser + MedlinePlus content; little native surface. |
| 7 | **Readings tab** | 8–16h | A global history tab (Android has only per-device today). |
| 8 | **Rebrand infuzamed → 22RPM** | 6–12h | App name, icons, splash, strings. The `applicationId` part is done in the blocking window; this is the visible identity. |
| 9 | **Play Store submission** | 8–16h eng | + store calendar (see the parallel track). AAB build, Play App Signing, Data Safety form, permissions declaration, listing assets. |

**THEN subtotal: ~50–100h engineering**, plus the store's calendar time (front-loaded by the
parallel track).

---

## Native app is mandatory for BLE (not a choice)

Could a webview cover this? Not for the cuff:
1. **iOS webviews can't do BLE at all** — Web Bluetooth is unimplemented in WebKit, so every iOS
   browser and `WKWebView` lacks it. Since we keep iOS, a webview can't serve capture there.
2. **The cuff speaks a proprietary protocol** — the Lepu/Viatom BP2 uses vendor GATT
   characteristics and frame formats the native SDK parses (reconnection, bonding, file protocol).
   Even where Web Bluetooth exists (Android Chrome — and **not** reliably in an embedded Android
   `WebView`), you'd reimplement the whole protocol in JS without the vendor SDK.

**Where a webview is a legitimate choice:** the non-BLE content — Education, medication forms,
history views — could be webviews sharing dashboard code. Recommendation: **stay fully native.** A
hybrid adds a second render path and an offline-sync seam for marginal savings on content screens.
The native app is required for capture; webview for content is an option we decline.

---

## Play Store vs App Store — differences that surprise an iOS-only developer

1. **New-account closed-testing gate** (≥12 testers / 14 days) — **personal accounts only**;
   **org accounts are exempt** (why we register as an org). No Apple equivalent.
2. **Data Safety form** — Google's analog to Apple's privacy nutrition labels, but a separate,
   detailed questionnaire (collection, sharing, encryption-in-transit, deletion). Scrutinized for a
   PHI app.
3. **BLE/location permission justification** — `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT` (API 31+), and
   historically location for scanning, trigger a **sensitive-permissions declaration**. Use the
   `neverForLocation` scan flag to avoid the location permission and its review question.
4. **Medical-device question — yes, here too.** Google's Health apps policy applies; the same
   framing that held on iOS (data display/transport, no diagnostic claims) is the argument. Review
   is generally less aggressive than Apple's, but the policy exists.
5. **Technical gates Apple lacks:** ship an **AAB** (not APK), **Play App Signing** (Google holds
   the key), and a minimum **`targetSdkVersion`** (currently API 34+ — hard rejection if below). RN
   0.80 should satisfy this; verify.

Cheaper in one place: the developer account is **$25 once** vs Apple's **$99/year**.

---

## Sequencing summary
- **This week (parallel):** org Play account + D-U-N-S request; start a closed test track early.
- **Blocking:** (1) centralize API config → (lock `com.twentytwohealth.rpm` + rename) → (2) outbox
  + `measured_at` → (3) remove fake Home data → (4) creds to Keystore.
- **Then:** medications, education, readings tab, visible rebrand, store submission.
</content>
