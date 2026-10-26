// 模擬試験専用の保存処理。通常学習のキー(fe_alog_v1, fe_qstate_v1, fe_used_ids 等)には一切書き込まない。
// キーは fe_ 接頭辞なので、既存のバックアップ機能(fe_/feb_/feterm_)に自動で含まれる。
export const KEY_ATTEMPT = "fe_mock_v1_attempt";
export const KEY_RESULTS = "fe_mock_v1_results";

export const LIMIT_MS = { A: 90 * 60 * 1000, B: 100 * 60 * 1000 };
export const BREAK_MS = 10 * 60 * 1000;
// 1回の計測で加算する上限。端末を長時間スリープさせた場合なども、ここまでは経過として扱う
const MAX_STEP_MS = 6 * 60 * 60 * 1000;

let lastError = "";
export function getStoreError() { return lastError; }

function read(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { lastError = "読込みに失敗: " + (e && e.message ? e.message : e); return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); lastError = ""; return true; }
  catch (e) { lastError = "保存に失敗: " + (e && e.message ? e.message : e); return false; }
}

function uid() {
  try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
  return "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
export function isoWithTz(d = new Date()) {
  const off = -d.getTimezoneOffset(); const sign = off >= 0 ? "+" : "-"; const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

function emptySection(sub) {
  return { startedAt: null, endedAt: null, elapsedMs: 0, limitMs: LIMIT_MS[sub], answers: {}, flags: {}, perQ: {}, current: 0, submittedBy: null };
}
export function newAttempt() {
  return {
    format: "fe-mock-attempt-v1", attemptId: "mock-" + uid(), createdAt: isoWithTz(),
    phase: "intro", sections: { A: emptySection("A"), B: emptySection("B") },
    brk: { startedAt: null, endedAt: null, elapsedMs: 0, limitMs: BREAK_MS, skipped: false },
    lastWall: null,
  };
}
export function loadAttempt() { return read(KEY_ATTEMPT, null); }
export function saveAttempt(a) { return write(KEY_ATTEMPT, a); }
export function clearAttempt() { try { localStorage.removeItem(KEY_ATTEMPT); } catch (e) {} }
export function loadResults() { const r = read(KEY_RESULTS, []); return Array.isArray(r) ? r : []; }
export function appendResult(a) {
  const list = loadResults();
  if (list.some(x => x.attemptId === a.attemptId)) return true;
  list.push(a);
  return write(KEY_RESULTS, list);
}

// 経過時間の計算。performance.now() の差分(端末時刻の変更の影響を受けない)を基本とし、
// 壁時計の差分が正でより大きい場合(画面が止まっていた・再読込みした間)はそちらを使う。
// 壁時計が戻った(負の差分)場合は加算しないので、時刻を戻しても残り時間は増えない。
export function stepMs(perfDelta, wallDelta) {
  const p = Math.max(0, perfDelta || 0);
  const w = wallDelta > 0 ? Math.min(wallDelta, MAX_STEP_MS) : 0;
  return Math.min(Math.max(p, w), MAX_STEP_MS);
}
// 再読込み後の復元: 最後の保存時刻からの壁時計の経過を、本番と同様に経過時間として扱う
export function resumeGap(a) {
  if (!a || !a.lastWall) return 0;
  const w = Date.now() - a.lastWall;
  return w > 0 ? Math.min(w, MAX_STEP_MS) : 0;
}
