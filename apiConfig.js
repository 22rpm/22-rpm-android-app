// apiConfig.js
//
// SINGLE SOURCE OF TRUTH for backend hosts. Before this, the base URL was hardcoded inline in
// ~7 screens — the exact trap that let a LAN IP sit in a working tree and nearly ship (cf. the
// iOS apiConfig ENV='local'-the-night-before-archive near-miss). One host, one switch, here.
//
// SAFER THAN A HAND-SET CONSTANT: the environment follows the BUILD TYPE via React Native's
// __DEV__ flag. A release/archive build has __DEV__ === false, so it resolves to PROD *no matter
// what is committed* — you cannot accidentally ship a local host. USE_LOCAL only takes effect in
// a dev build, and even then only when explicitly flipped true (never committed true).
const USE_LOCAL = false; // dev convenience: set true locally to hit the LAN backend in a DEV build
const ENV = __DEV__ && USE_LOCAL ? "local" : "prod";

const HOSTS = {
  // Prod backend is served under /rpm-be; the local dev server serves at the root.
  prod: "https://api.twentytwohealth.com",
  local: "http://192.168.1.15:4000", // dev: your Mac's LAN IP, phone on the same wifi
};

export const ORIGIN = HOSTS[ENV];
export const API_BASE = ENV === "prod" ? `${ORIGIN}/rpm-be` : ORIGIN;

// Derived bases used across the app — build every URL from these, never a literal host.
export const AUTH_BASE = `${API_BASE}/api/auth`;
export const DEV_DATA_BASE = `${API_BASE}/api/dev-data`;
export const MESSAGES_BASE = `${API_BASE}/api/messages`;
export const SOCKET_BASE = ORIGIN; // socket.io connects to the bare origin
export const PRIVACY_URL = `${ORIGIN}/privacy`;

export const CONFIG = { ENV, ORIGIN, API_BASE };
export default API_BASE;
