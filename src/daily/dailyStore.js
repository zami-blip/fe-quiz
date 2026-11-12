// 「今日の学習」の保存と時間計測。模試（fe_mock_*）と通常学習のキーには書き込まない。
// キーは fe_daily_ で始まるので、既存のバックアップ（fe_ で始まるキー）に自動で含まれる。
//
// 時間の考え方
// ・セットの時計は開始から提出まで連続して進む（中断・画面非表示・スリープ・再読込の間も進む）。
// ・設問別の滞在時間は、受験画面でその設問を表示していた時間だけを積算する（再訪した時間も加算）。
// ・画面を表示していなかった時間は hiddenMs として別に記録し、設問別には加えない（二重に数えない）。
// ・表示中でも、1回の計測の間隔が ONLINE_CAP_MS を超えた分（端末の停止など）は表示していなかった時間として扱う。
import { isoWithTz } from "../mock/mockStore";

export const KEY_ATTEMPT_PREFIX = "fe_daily_attempt_";
export const KEY_RESULTS = "fe_daily_results";
export const KEY_NOTES = "fe_daily_notes";
export const ONLINE_CAP_MS = 5000;
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

// ---------------------------------------------------------------- 日付（日本時間）
export function jstDate(ms = Date.now()) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }
export function addDays(date, n) {
  const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
const WD = ["日", "月", "火", "水", "木", "金", "土"];
export function dateLabel(date) {
  const d = new Date(date + "T00:00:00Z");
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WD[d.getUTCDay()]}）`;
}

// ---------------------------------------------------------------- 保存
export const attemptKey = setId => KEY_ATTEMPT_PREFIX + setId;
export function loadResults() { const r = read(KEY_RESULTS, []); return Array.isArray(r) ? r : []; }
export function loadAttempt(setId) { return read(attemptKey(setId), null); }
export function saveAttempt(a) { return write(attemptKey(a.setId), a); }
export function clearAttempt(setId) { try { localStorage.removeItem(attemptKey(setId)); } catch (e) {} }
export function loadAllAttempts() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(KEY_ATTEMPT_PREFIX)) { const a = read(k, null); if (a && a.setId) out[a.setId] = a; }
    }
  } catch (e) {}
  return out;
}
// 同じ受験IDの結果は一度だけ保存する（期限直前の操作・二重クリック・再読込による二重提出を防ぐ）
export function appendResult(a) {
  const list = loadResults();
  if (list.some(x => x.attemptId === a.attemptId)) return true;
  list.push(a);
  return write(KEY_RESULTS, list);
}
export function loadNotes() { const n = read(KEY_NOTES, {}); return n && typeof n === "object" ? n : {}; }
export function saveNotes(n) { return write(KEY_NOTES, n); }

export function setResults(results, setId) {
  return results.filter(r => r.setId === setId).sort((x, y) => (x.attemptNo || 0) - (y.attemptNo || 0));
}
export function nextAttemptNo(results, setId) { return setResults(results, setId).length + 1; }

// ---------------------------------------------------------------- 受験データ
export function newAttempt(plan, set, attemptNo, now = Date.now()) {
  const q0 = set.questions[0];
  const a = {
    format: "fe-daily-attempt-v1", date: plan.date, planId: plan.planId, setId: set.setId, subject: set.subject,
    attemptNo, isRetake: attemptNo > 1, attemptId: `daily-${set.setId}-${uid()}`,
    questions: set.questions.map(q => ({ id: q.id, version: q.version || 1, kind: q.kind || "new", review_of: q.review_of || null })),
    startedAt: isoWithTz(new Date(now)), endedAt: null, submittedBy: null,
    limitMs: set.limitSec * 1000, elapsedMs: 0, hiddenMs: 0, resumes: 0, interruptions: 0,
    answers: {}, flags: {}, perQ: {}, current: 0, lastWall: now,
  };
  touch(a, q0.id).visits = 1;
  return a;
}

function touch(a, qid) {
  if (!a.perQ[qid]) a.perQ[qid] = { ms: 0, firstMs: 0, revisitMs: 0, visits: 0, changes: 0, history: [] };
  return a.perQ[qid];
}

// 経過時間を加える。online なら表示中の設問の滞在時間にも加え、そうでなければ非表示時間に加える。
// 制限時間に達したら、達した時刻で自動提出の状態にして true を返す。
export function addTime(a, d, nowMs, opt = {}) {
  if (!a || a.endedAt) return false;
  const want = Math.max(0, d || 0);
  const use = Math.min(want, Math.max(0, a.limitMs - a.elapsedMs));
  a.elapsedMs += use;
  if (opt.online && opt.qid) {
    const pq = touch(a, opt.qid);
    pq.ms += use;
    if (pq.visits > 1) pq.revisitMs += use; else pq.firstMs += use;
  } else a.hiddenMs += use;
  if (a.elapsedMs >= a.limitMs) {
    a.elapsedMs = a.limitMs;
    a.endedAt = isoWithTz(new Date(nowMs - (want - use)));
    a.submittedBy = "timeout";
    return true;
  }
  return false;
}

export function wallGap(a, now = Date.now()) {
  if (!a || !a.lastWall) return 0;
  const w = now - a.lastWall;
  return w > 0 ? Math.min(w, MAX_GAP_MS) : 0;
}

// 表示していなかった間の経過を反映する（ホーム・結果画面・画面非表示・再読込のとき）
export function syncHidden(a, now = Date.now()) {
  const done = addTime(a, wallGap(a, now), now, { online: false });
  a.lastWall = now;
  return done;
}

// 受験画面を表示している間の1回分。間隔が ONLINE_CAP_MS を超えた分は表示していなかった時間（中断）として扱う。
export function stepOnline(a, now, qid) {
  if (!a || a.endedAt) return false;
  const w = wallGap(a, now);
  const on = Math.min(w, ONLINE_CAP_MS);
  let done = addTime(a, on, now - (w - on), { online: true, qid });
  if (!done && w > on) { a.interruptions = (a.interruptions || 0) + 1; done = addTime(a, w - on, now, { online: false }); }
  a.lastWall = now;
  return done;
}

// 回答・移動・保留などの操作の前に、その時点までの経過を反映する。期限を過ぎていれば操作せず "timeout"。
export function operate(a, now, qid, fn) {
  if (!a || a.endedAt) return "ended";
  stepOnline(a, now, qid);
  if (a.endedAt) return "timeout";
  fn(a);
  return "ok";
}

export function goTo(a, i, n) {
  const j = Math.max(0, Math.min(n - 1, i));
  if (j === a.current) return;
  a.current = j;
}
// 設問の表示を開始したときに訪問回数を数える（2回目以降の表示は再訪として時間を分ける）
export function markVisit(a, qid) { touch(a, qid).visits += 1; }

export function pick(a, qid, label) {
  if (a.answers[qid] === label) return;
  const pq = touch(a, qid);
  if (pq.history.length) pq.changes += 1;
  a.answers[qid] = label;
  pq.history.push({ t: Math.round(a.elapsedMs), v: label });
}
export function clearAnswer(a, qid) {
  if (!a.answers[qid]) return;
  const pq = touch(a, qid);
  delete a.answers[qid];
  pq.changes += 1; pq.history.push({ t: Math.round(a.elapsedMs), v: null });
}
export function toggleFlag(a, qid) { if (a.flags[qid]) delete a.flags[qid]; else a.flags[qid] = true; }

export function submitAt(a, now, qid, by = "user") {
  if (!a || a.endedAt) return "ended";
  stepOnline(a, now, qid);
  if (a.endedAt) return "timeout";
  a.endedAt = isoWithTz(new Date(now)); a.submittedBy = by;
  return by;
}

export function remainingMs(a, now = Date.now()) {
  if (!a || a.endedAt) return 0;
  return Math.max(0, a.limitMs - a.elapsedMs - wallGap(a, now));
}

// ---------------------------------------------------------------- 採点（提出後だけ使う）
export const STATUS = { ok: "正解", ng: "誤答", na: "未回答" };
export function judgeSet(set, a) {
  const rows = set.questions.map((q, i) => {
    const ans = a.answers[q.id] || null;
    const pq = a.perQ[q.id] || { ms: 0, firstMs: 0, revisitMs: 0, visits: 0, changes: 0, history: [] };
    const status = !ans ? STATUS.na : ans === q.correct ? STATUS.ok : STATUS.ng;
    return {
      q, i, ans, status, sec: Math.round(pq.ms / 1000), firstSec: Math.round((pq.firstMs || 0) / 1000), revisitSec: Math.round((pq.revisitMs || 0) / 1000),
      visits: pq.visits || 0, changes: pq.changes || 0, history: pq.history || [], flagged: !!a.flags[q.id], ratio: q.expected_seconds ? pq.ms / 1000 / q.expected_seconds : 0,
    };
  });
  const correct = rows.filter(r => r.status === STATUS.ok).length;
  return { rows, correct, wrong: rows.filter(r => r.status === STATUS.ng).length, blank: rows.filter(r => r.status === STATUS.na).length, total: rows.length };
}

// 復習で最初に見る1問：誤答・未回答があれば先頭のもの、なければ想定時間に対して最も時間を使った正解
export function defaultPriority(S) {
  const miss = S.rows.find(r => r.status !== STATUS.ok);
  if (miss) return miss.q.id;
  const byTime = S.rows.slice().sort((x, y) => y.ratio - x.ratio)[0];
  return byTime ? byTime.q.id : null;
}

export const REASONS = ["知識・式", "問題文", "途中の値", "終了位置", "時間不足", "まだ不明"];

// セットの状態：未受験・受験中・完了
export function setStatus(setId, attempts, results) {
  if (attempts[setId] && !attempts[setId].endedAt) return "受験中";
  if (setResults(results, setId).length) return "完了";
  if (attempts[setId]) return "受験中"; // 提出済みだが結果の保存待ち
  return "未受験";
}
