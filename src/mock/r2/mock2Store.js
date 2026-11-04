// 第2回模試の保存と時間計算。第1回のキー(fe_mock_v1_*)と通常学習のキーには書き込まない。
// キーは fe_ で始まるので、既存のバックアップ(fe_/feb_/feterm_)に自動で含まれる。
import { stepMs, isoWithTz } from "../mockStore";

export const KEY_ATTEMPT = { A: "fe_mock_r2_attempt_A", B: "fe_mock_r2_attempt_B" };
export const KEY_RESULTS = "fe_mock_r2_results";
export const KEY_R1_MANUAL = "fe_mock_r2_r1manual";
export const LIMIT_MS = { A: 90 * 60 * 1000, B: 100 * 60 * 1000 };
// 1回の計算で加える時間の上限(端末を長期間閉じていても、試験時間を超えた分は意味がないため)
const MAX_GAP_MS = 7 * 24 * 60 * 60 * 1000;

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
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function loadResults() { const r = read(KEY_RESULTS, []); return Array.isArray(r) ? r : []; }
export function loadAttempt(sub) { return read(KEY_ATTEMPT[sub], null); }
export function saveAttempt(a) { return write(KEY_ATTEMPT[a.subject], a); }
export function clearAttempt(sub) { try { localStorage.removeItem(KEY_ATTEMPT[sub]); } catch (e) {} }
export function appendResult(a) {
  const list = loadResults();
  if (list.some(x => x.attemptId === a.attemptId)) return true;
  list.push(a);
  return write(KEY_RESULTS, list);
}
export function loadR1Manual() { return read(KEY_R1_MANUAL, null); }
export function saveR1Manual(v) { return v ? write(KEY_R1_MANUAL, v) : (() => { try { localStorage.removeItem(KEY_R1_MANUAL); } catch (e) {} return true; })(); }

// 科目ごとの受験回数(結果に記録済みのものを数える)。次の受験は回数＋1回目になる
export function nextAttemptNo(results, sub) { return results.filter(r => r.subject === sub).length + 1; }
export function firstResult(results, sub) {
  return results.filter(r => r.subject === sub).sort((x, y) => (x.attemptNo || 0) - (y.attemptNo || 0))[0] || null;
}

export function newAttempt(sub, attemptNo, now = Date.now()) {
  return {
    format: "fe-mock-r2-attempt-v1", round: 2, subject: sub, attemptNo,
    attemptId: `mock2-${sub}-${uid()}`, createdAt: isoWithTz(new Date(now)), startedAt: isoWithTz(new Date(now)),
    endedAt: null, submittedBy: null, elapsedMs: 0, limitMs: LIMIT_MS[sub], offlineMs: 0, resumes: 0,
    answers: {}, flags: {}, perQ: {}, current: 0, lastWall: now,
  };
}

// 経過時間を加える。制限時間に達したら、その時点で自動提出の状態にする(戻り値 true)。
// opt.qid: 画面に表示中の設問ID(設問別の所要時間に加える)。opt.offline: 画面を開いていなかった時間として扱う。
export function advance(a, d, nowMs, opt = {}) {
  if (!a || a.endedAt) return false;
  const use = Math.min(Math.max(0, d || 0), Math.max(0, a.limitMs - a.elapsedMs));
  a.elapsedMs += use;
  if (opt.offline) a.offlineMs = (a.offlineMs || 0) + use;
  else if (opt.qid && use > 0) {
    const pq = a.perQ[opt.qid] || { ms: 0, changes: 0, history: [] };
    pq.ms += use; a.perQ[opt.qid] = pq;
  }
  if (a.elapsedMs >= a.limitMs) {
    a.elapsedMs = a.limitMs;
    const over = Math.max(0, d - use);
    a.endedAt = isoWithTz(new Date(nowMs - over));
    a.submittedBy = "timeout";
    return true;
  }
  return false;
}

// 最後に保存した時刻から今までの、画面を開いていなかった時間(壁時計)。時計が戻った場合は0
export function wallGap(a, now = Date.now()) {
  if (!a || !a.lastWall) return 0;
  const w = now - a.lastWall;
  return w > 0 ? Math.min(w, MAX_GAP_MS) : 0;
}

// 画面を開いていない間の経過を反映する(ホーム画面・再読込み時)
export function syncOffline(a, now = Date.now()) {
  const done = advance(a, wallGap(a, now), now, { offline: true });
  a.lastWall = now;
  return done;
}

// 画面を開いている間の1回分の経過。端末の時刻変更の影響を受けにくい performance の差分を基本にし、
// 画面が止まっていた(スリープなど)ときは壁時計の差分を使う(第1回と同じ考え方)。
export function stepOnline(a, perfDelta, now = Date.now(), qid = null) {
  const d = stepMs(perfDelta, now - (a.lastWall || now));
  const done = advance(a, d, now, { qid });
  a.lastWall = now;
  return done;
}

export function finish(a, by, now = Date.now()) {
  if (!a.endedAt) { a.endedAt = isoWithTz(new Date(now)); a.submittedBy = by; }
  return a;
}

export function remainingMs(a, now = Date.now()) {
  if (!a) return 0;
  if (a.endedAt) return 0;
  return Math.max(0, a.limitMs - a.elapsedMs - wallGap(a, now));
}
