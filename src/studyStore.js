// 出題制御の永続化(localStorage)。fe_/feb_ 接頭辞のため既存のバックアップ/復元に自動で含まれる。
// 既存キー(fe_missed 等)は読むだけで、ここからは書き換えない。
import { loadLog, readForExport } from "./answerLog";
import { selectSession, computeStatuses, summarize, DEFAULT_SETTINGS } from "./studySelect";

const P = { A: "fe_", B: "feb_" };
const DEFAULT_SIZE = { A: 10, B: 3 };
const key = (sub, name) => P[sub] + name;

function rj(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
function wj(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

export function loadSettings(sub) {
  return { ...DEFAULT_SETTINGS, size: DEFAULT_SIZE[sub], ...(rj(key(sub, "study_settings_v1"), {}) || {}) };
}
export function saveSettings(sub, s) { return wj(key(sub, "study_settings_v1"), s); }

export function loadFlags(sub) { return rj(key(sub, "qstate_v1"), {}) || {}; }
// flag: "weak"(理解不足) | "hold"(保留=手動の理解済み) | null(解除)。履歴は一切消さない。
export function setFlag(sub, id, flag) {
  const f = loadFlags(sub);
  if (flag) f[id] = { flag, by: "manual", at: new Date().toISOString() }; else delete f[id];
  return wj(key(sub, "qstate_v1"), f);
}

// 旧履歴(ID付きログ導入前の復習リスト/周回履歴)の事実を加算のみで退避する。
// 復習リストをクリアしても、誤答経験の事実はここに残る。
export function loadLegacy(sub) { const l = rj(key(sub, "legacy_v1"), {}) || {}; return { wrong: l.wrong || [], correct: l.correct || [], missed: l.missed || [] }; }
export function refreshLegacy(sub) {
  try {
    const cur = loadLegacy(sub);
    const ex = readForExport(sub);
    const w = new Set(cur.wrong), c = new Set(cur.correct);
    ex.missedIds.forEach(id => w.add(id));
    ex.cycleHistory.forEach(h => { if (h.id !== undefined && h.id !== null) (h.correct ? c : w).add(h.id); });
    const m = new Set(cur.missed); ex.missedIds.forEach(id => m.add(id));
    const next = { wrong: [...w], correct: [...c], missed: [...m] };
    if (next.wrong.length !== cur.wrong.length || next.correct.length !== cur.correct.length || next.missed.length !== cur.missed.length) wj(key(sub, "legacy_v1"), next);
    return next;
  } catch (e) { return loadLegacy(sub); }
}

export function loadShown(sub) { return rj(key(sub, "shown_v1"), { last: {}, lastSession: [], plan: null }) || { last: {}, lastSession: [], plan: null }; }

export function planStudy(sub, allQuestions, cat) {
  const legacy = refreshLegacy(sub);
  const ids = allQuestions.filter(q => cat === "すべて" || !cat || q.cat === cat).map(q => q.id);
  const seed = String(Date.now());
  return selectSession({
    ids, events: loadLog(sub), legacy, flags: loadFlags(sub),
    settings: loadSettings(sub), shown: loadShown(sub), now: Date.now(), seed,
  });
}

// セッション開始時に呼ぶ。次回の「直近は後回し」と管理画面の選択理由表示に使う。
export function recordShown(sub, plan) {
  const sh = loadShown(sub);
  const now = Date.now();
  plan.picks.forEach(p => { sh.last[p.id] = now; });
  sh.lastSession = plan.picks.map(p => p.id);
  sh.plan = { at: new Date(now).toISOString(), breakdown: plan.breakdown, notes: plan.notes, picks: plan.picks.map(p => ({ id: p.id, kind: p.kind, reason: p.reason })) };
  return wj(key(sub, "shown_v1"), sh);
}

export function currentCounts(sub, allQuestions) {
  const legacy = loadLegacy(sub);
  const ids = allQuestions.map(q => q.id);
  const stt = computeStatuses({ ids, events: loadLog(sub), legacy, flags: loadFlags(sub), settings: loadSettings(sub), now: Date.now() });
  return { counts: summarize(stt), statuses: stt };
}
