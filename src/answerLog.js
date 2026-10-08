// 追記専用の回答ログ(問題ID単位)とバックアップ。
// 既存の fe_* / feb_* / feterm_* キーは一切変更・削除しない。新規キーだけを使う。
const SUBJ = {
  A: { log: "fe_alog_v1", cycle: "fe_alog_cycle" },
  B: { log: "feb_alog_v1", cycle: "feb_alog_cycle" },
};
const CLIENT_KEY = "fe_client_id";
const SNAP_KEY = "fe_snapshot_pre_alog";
const BEFORE_RESTORE_KEY = "fe_backup_before_restore";
const PREFIXES = ["fe_", "feb_", "feterm_"];
const LOG_KEYS = [SUBJ.A.log, SUBJ.B.log];
const INTERNAL_KEYS = [SNAP_KEY, BEFORE_RESTORE_KEY];

let lastError = "";
const sessionIds = { A: null, B: null };
const seen = new Set();

function uid() {
  try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) {}
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
// タイムゾーン付きISO(例 2026-10-09T08:15:30.123+09:00)
export function isoWithTz(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function readJson(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
export function getLastError() { return lastError; }
export function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) { id = "c-" + uid(); localStorage.setItem(CLIENT_KEY, id); }
    return id;
  } catch (e) { return "c-unknown"; }
}
// 初回だけ、既存データの写しを別キーに保存する(新機能の導入前の安全網)。既存キーは変更しない。
export function ensureSnapshot() {
  try {
    if (localStorage.getItem(SNAP_KEY)) return;
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !PREFIXES.some(p => k.startsWith(p))) continue;
      if (LOG_KEYS.includes(k) || INTERNAL_KEYS.includes(k) || k === CLIENT_KEY || k.endsWith("_alog_cycle")) continue;
      data[k] = localStorage.getItem(k);
    }
    localStorage.setItem(SNAP_KEY, JSON.stringify({ taken_at: isoWithTz(), data }));
  } catch (e) { lastError = "スナップショット保存に失敗: " + (e && e.message ? e.message : e); }
}
export function cycleId(subject) {
  try {
    let id = localStorage.getItem(SUBJ[subject].cycle);
    if (!id) { id = "cy-" + isoWithTz().slice(0, 19).replace(/[-:T]/g, ""); localStorage.setItem(SUBJ[subject].cycle, id); }
    return id;
  } catch (e) { return "cy-unknown"; }
}
export function newCycleId(subject) {
  try { const id = "cy-" + isoWithTz().slice(0, 19).replace(/[-:T]/g, ""); localStorage.setItem(SUBJ[subject].cycle, id); return id; } catch (e) { return "cy-unknown"; }
}
export function startLogSession(subject) { sessionIds[subject] = "s-" + uid(); return sessionIds[subject]; }
export function loadLog(subject) { return readJson(SUBJ[subject].log, []); }
// 回答を確定した時点で1件追記する。失敗は握りつぶさず {ok:false,error} で返す。
export function logAnswer(subject, { question_id, selected_choice, is_correct, mode, question_version = null }) {
  try {
    if (!sessionIds[subject]) sessionIds[subject] = "s-" + uid();
    const session_id = sessionIds[subject];
    const dupKey = `${subject}:${session_id}:${question_id}`;
    if (seen.has(dupKey)) return { ok: true, duplicate: true };
    const log = loadLog(subject);
    const last = log[log.length - 1];
    if (last && last.session_id === session_id && last.question_id === question_id) { seen.add(dupKey); return { ok: true, duplicate: true }; }
    const ev = {
      event_id: "e-" + uid(), subject, question_id,
      answered_at: isoWithTz(), selected_choice, is_correct: !!is_correct,
      mode, cycle_id: cycleId(subject), session_id, question_version, client_id: getClientId(),
    };
    log.push(ev);
    localStorage.setItem(SUBJ[subject].log, JSON.stringify(log));
    seen.add(dupKey);
    lastError = "";
    return { ok: true };
  } catch (e) {
    lastError = e && e.message ? e.message : String(e);
    return { ok: false, error: lastError };
  }
}
export function logStats(subject) {
  const log = loadLog(subject);
  const weak = log.filter(e => e.mode === "weak").length;
  return { total: log.length, weak, normal: log.length - weak, last: log.length ? log[log.length - 1].answered_at : null };
}
// 全キーのバックアップ(JSONテキスト)
export function buildBackup() {
  const keys = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && PREFIXES.some(p => k.startsWith(p))) keys[k] = localStorage.getItem(k);
  }
  return JSON.stringify({ format: "fe-quiz-backup-v1", taken_at: isoWithTz(), keys }, null, 1);
}
export function downloadBackup() {
  const text = buildBackup();
  const d = new Date();
  const name = `fe-quiz-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return name;
}
// 復元: 復元前の状態を別キーに退避し、バックアップのキーを書き戻す。ログはevent_idで統合する(削除しない)。
export function restoreBackup(text) {
  const obj = JSON.parse(text);
  if (!obj || obj.format !== "fe-quiz-backup-v1" || !obj.keys) throw new Error("このバックアップ形式には対応していません");
  try { localStorage.setItem(BEFORE_RESTORE_KEY, buildBackup()); } catch (e) { throw new Error("復元前の退避に失敗したため中止しました"); }
  let n = 0;
  Object.entries(obj.keys).forEach(([k, v]) => {
    if (!PREFIXES.some(p => k.startsWith(p)) || INTERNAL_KEYS.includes(k) || typeof v !== "string") return;
    if (LOG_KEYS.includes(k)) {
      let merged = [];
      try {
        const cur = readJson(k, []); const inc = JSON.parse(v);
        const ids = new Set(cur.map(e => e.event_id));
        merged = cur.concat(inc.filter(e => e && !ids.has(e.event_id)));
        merged.sort((a, b) => String(a.answered_at).localeCompare(String(b.answered_at)));
      } catch (e) { return; }
      localStorage.setItem(k, JSON.stringify(merged));
    } else { localStorage.setItem(k, v); }
    n++;
  });
  return n;
}
