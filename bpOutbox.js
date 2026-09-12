// Durable BP-reading outbox (Android).
//
// Ports the iOS outbox drain logic (rpm-ios-app/outbox.js) to Android. iOS persists the
// reading in native (ObjC) the instant it's parsed; Android parses in the Kotlin bridge and
// hands the reading to JS, so we persist JS-side in SQLite here (reusing react-native-sqlite-
// storage, already used by Oxygen). A reading is enqueued the moment it's captured and removed
// ONLY on a confirmed server success — a timeout / 4xx / 5xx / offline keeps the row for the
// next drain. Trade-off vs iOS: a crash in the ~millisecond between the native parse event and
// this INSERT could drop one reading; accepted for the large code reuse (see ANDROID_LAUNCH_PLAN).
//
// Server idempotency keys on (user_id, dev_type, data.timestamp); timestamp is baked ONCE at
// capture (below), so every retry of a reading carries the same key — over-retry is free (the
// server dedups), premature delete would lose a reading. Hence: delete only on explicit success.
import axios from 'axios';
import SQLite from 'react-native-sqlite-storage';
import { DEV_DATA_BASE } from './apiConfig';

const DEV_TYPE = 'bp';

const db = SQLite.openDatabase(
  { name: 'bp_outbox.db', location: 'default' },
  () => {},
  (e) => console.error('[bpOutbox] SQLite open error', e)
);

// Promisified single-statement helper (mirrors Oxygen's db.transaction/executeSql style).
function exec(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, err) => {
          reject(err);
          return true; // roll back the tx on error
        }
      );
    });
  });
}

let initialized = false;
async function init() {
  if (initialized) return;
  await exec(
    `CREATE TABLE IF NOT EXISTS bp_outbox (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       payload TEXT NOT NULL,
       enqueued_at INTEGER NOT NULL
     )`
  );
  initialized = true;
}

// measured_at (epoch SECONDS) = the reading's MEASUREMENT time, baked once at capture. The live
// BP2 frame carries no device clock, so we use the phone capture time (rec.measuredAt, set at
// enqueue), never the drain time — a reading that drains late still dates to when it was taken.
function measuredAtEpoch(rec) {
  if (Number.isFinite(rec.measuredAt) && rec.measuredAt > 0) return Math.floor(rec.measuredAt);
  const t = Date.parse(rec.timestamp);
  if (!Number.isNaN(t)) return Math.floor(t / 1000);
  return Math.floor(Date.now() / 1000);
}

function buildBody(rec) {
  const d = new Date(rec.timestamp);
  const valid = !isNaN(d.getTime());
  return {
    devId: rec.devId || 'bp_device_001',
    devType: DEV_TYPE,
    data: {
      systolic: rec.systolic,
      diastolic: rec.diastolic,
      pulse: rec.pulse,
      mean: rec.mean,
      timestamp: rec.timestamp, // baked at capture — the dedup key
      measured_at: measuredAtEpoch(rec), // epoch s — measurement time, not receipt
      date: valid ? d.toLocaleDateString() : rec.date,
      time: valid ? d.toLocaleTimeString() : rec.time,
      deviceInfo:
        rec.deviceInfo || {
          name: rec.devName || 'Blood Pressure Monitor',
          id: rec.devId || 'unknown_device_id',
          type: 'viatom',
        },
    },
  };
}

// Delete only on a confirmed success: 2xx AND { success: true }. The API returns 201 on store
// AND on an idempotent duplicate, so a deduped reading is correctly treated as delivered.
function isConfirmedSuccess(res) {
  return res && res.status >= 200 && res.status < 300 && res.data && res.data.success === true;
}

// Enqueue a reading the instant it's captured. rec carries timestamp (ISO) + measuredAt (epoch s),
// both the capture time, so a late drain still dates to measurement.
export async function enqueueReading(rec) {
  await init();
  await exec('INSERT INTO bp_outbox (payload, enqueued_at) VALUES (?, ?)', [
    JSON.stringify(rec),
    Date.now(),
  ]);
}

let draining = false;
// Drain the outbox. Safe to call from anywhere, any number of times (overlapping calls no-op).
export async function drainOutbox() {
  if (draining) return { skipped: true };
  draining = true;
  let sent = 0;
  let kept = 0;
  try {
    await init();
    const rs = await exec('SELECT id, payload FROM bp_outbox ORDER BY id ASC');
    const rows = rs.rows;
    const n = rows ? rows.length : 0;
    if (n === 0) return { sent: 0, kept: 0 };
    console.log(`[bpOutbox] draining ${n} queued reading(s)`);
    for (let i = 0; i < n; i++) {
      const row = rows.item(i);
      let rec;
      try {
        rec = JSON.parse(row.payload);
      } catch (e) {
        // Unparseable row can never deliver — drop it rather than block the queue forever.
        await exec('DELETE FROM bp_outbox WHERE id = ?', [row.id]);
        continue;
      }
      try {
        const res = await axios.post(`${DEV_DATA_BASE}/devices/data`, buildBody(rec), {
          withCredentials: true,
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000,
        });
        if (isConfirmedSuccess(res)) {
          await exec('DELETE FROM bp_outbox WHERE id = ?', [row.id]);
          sent += 1;
        } else {
          kept += 1;
          console.warn('[bpOutbox] ambiguous response, keeping row', row.id, res && res.status);
        }
      } catch (e) {
        kept += 1;
        console.warn('[bpOutbox] delivery failed, keeping row', row.id, e?.response?.status || e?.message);
      }
    }
  } catch (e) {
    console.warn('[bpOutbox] drain error', e?.message);
  } finally {
    draining = false;
  }
  return { sent, kept };
}
