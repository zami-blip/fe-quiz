// 標準モードの出題制御(問題ID単位)。副作用なしの純関数のみ。A/Bは呼び出し側で別々の入力を渡す。
//
// 安全規則(仕様):
//  - 回答時系列は answered_at で並べる。日時が欠損/不正のイベントは配列上で直前の有効時刻を引き継ぐ。
//    同時刻は配列順(追記順)。最新回答＝並べ替え後の末尾。
//  - 未回答＝当該科目で回答ログにも旧履歴(旧復習リスト・旧周回履歴)にも一度も現れないID。
//  - 旧履歴(ID付き時系列がないもの)は「誤答あり／正解あり」の事実だけを使い、
//    ログが無いIDの最新回答は「誤答」とみなす(旧復習リストは誤答でのみ追加されるため)。
//    ただし旧履歴に正解もある場合も順序不明なので「その他の誤答」扱い。
//  - 保留(手動の理解済み)は出題から除外。理解不足フラグは優先度4の復習候補。

export const DEFAULT_SETTINGS = { size: 10, unansweredSlots: null, recheckDays: 2 };
export const DAY_MS = 86400000;

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 問題IDごとの回答時系列(正規化済み)。
export function buildTimelines(events) {
  const by = new Map();
  let lastValid = 0;
  (events || []).forEach((e, idx) => {
    if (!e || e.question_id === undefined || e.question_id === null) return;
    let t = Date.parse(e.answered_at);
    if (Number.isNaN(t)) t = lastValid; else lastValid = t;
    if (!by.has(e.question_id)) by.set(e.question_id, []);
    by.get(e.question_id).push({ t, idx, ok: !!e.is_correct, valid: !Number.isNaN(Date.parse(e.answered_at)) });
  });
  by.forEach(list => list.sort((a, b) => a.t - b.t || a.idx - b.idx));
  return by;
}

// 状態: unanswered / review(tier1-4) / waiting(再確認待ち) / due(再確認期) / settled(正解のみ) / hold
export function computeStatuses({ ids, events, legacy, flags, settings, now }) {
  const st = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const tl = buildTimelines(events);
  const lw = new Set((legacy && legacy.wrong) || []);
  const lc = new Set((legacy && legacy.correct) || []);
  const fl = flags || {};
  const out = new Map();
  ids.forEach(id => {
    const list = tl.get(id) || [];
    const n = list.length;
    const latest = n ? list[n - 1] : null;
    let streak = 0;
    for (let i = n - 1; i >= 0 && !list[i].ok; i--) streak++;
    const hadCorrectBefore = lc.has(id) || list.slice(0, Math.max(0, n - 1)).some(x => x.ok);
    const everWrong = lw.has(id) || list.some(x => !x.ok);
    const hasHistory = n > 0 || lw.has(id) || lc.has(id);
    const flag = fl[id] && fl[id].flag ? fl[id].flag : null;
    let latestWrong, latestCorrect;
    if (n) { latestWrong = !latest.ok; latestCorrect = latest.ok; }
    else { latestWrong = lw.has(id); latestCorrect = !lw.has(id) && lc.has(id); }
    const lastAt = latest ? latest.t : 0;
    let state, tier = null;
    if (flag === "hold") state = "hold";
    else if (latestWrong) {
      state = "review";
      tier = streak >= 2 ? 1 : (n && hadCorrectBefore ? 2 : 3);
    } else if (flag === "weak") { state = "review"; tier = 4; }
    else if (!hasHistory) state = "unanswered";
    else if (everWrong && latestCorrect) {
      const dueAt = latest && latest.valid ? latest.t + st.recheckDays * DAY_MS : 0;
      state = now >= dueAt ? "due" : "waiting";
    } else state = "settled";
    out.set(id, { id, state, tier, answers: n, streak, hadCorrectBefore, everWrong, lastAt, flag, legacyOnly: n === 0 && hasHistory });
  });
  return out;
}

export function summarize(statuses) {
  const c = { total: 0, unanswered: 0, review: 0, waiting: 0, due: 0, hold: 0, settled: 0, weakFlag: 0 };
  statuses.forEach(s => {
    c.total++; c[s.state]++;
    if (s.flag === "weak") c.weakFlag++;
  });
  return c;
}

function seededOrder(arr, seed) {
  return arr.slice().sort((a, b) => hashStr(seed + ":" + a.id) - hashStr(seed + ":" + b.id));
}

function fmt(ms) { return ms ? new Date(ms).toISOString().slice(0, 10) : "なし"; }

// 1セッション分の選出。重複IDは出さない。候補不足時は shortage に不足数を入れ、重複選出はしない。
//  shown: { last:{id:ms}, lastSession:[id,...] }
export function selectSession({ ids, events, legacy, flags, settings, shown, now, seed }) {
  const st = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const size = Math.max(1, Math.floor(st.size));
  const statuses = computeStatuses({ ids, events, legacy, flags, settings: st, now });
  const sh = shown || {};
  const lastShown = id => Math.max((sh.last && sh.last[id]) || 0, (statuses.get(id) || {}).lastAt || 0);
  const recent = new Set(sh.lastSession || []);
  const all = ids.map(id => statuses.get(id));
  const by = state => all.filter(s => s.state === state);
  const ord = (list, tierFirst) => list.slice().sort((a, b) =>
    (tierFirst ? (a.tier - b.tier) : 0) || (lastShown(a.id) - lastShown(b.id)) || (hashStr(seed + ":" + a.id) - hashStr(seed + ":" + b.id)));

  const R = ord(by("review"), true);
  const U = seededOrder(by("unanswered"), seed);
  const D = ord(by("due"), false);
  const X = ord([...by("settled"), ...by("waiting")], false);

  let nU = st.unansweredSlots != null ? Math.max(0, Math.floor(st.unansweredSlots)) : Math.round(size / 3);
  if (U.length > 0 && size >= 3) nU = Math.max(1, nU);
  nU = Math.min(nU, size);
  const nR = size - nU;

  const picks = [];
  const taken = new Set();
  const take = (pool, n, kind, allowRecent, label) => {
    for (const s of pool) {
      if (n <= 0) break;
      if (taken.has(s.id)) continue;
      if (!allowRecent && recent.has(s.id)) continue;
      taken.add(s.id); n--;
      picks.push({
        id: s.id, kind, tier: s.tier, state: s.state, recentFallback: allowRecent && recent.has(s.id),
        lastShown: lastShown(s.id),
        reason: label(s),
      });
    }
  };
  const lblR = s => `復習(優先度${s.tier}: ${["", "連続誤答" + s.streak + "回", "正解後の誤答", "最新が誤答", "理解不足登録"][s.tier]})・最終出題 ${fmt(lastShown(s.id))}`;
  const lblU = () => "未回答";
  const lblD = s => `再確認(正解から${st.recheckDays}日経過)・最終出題 ${fmt(lastShown(s.id))}`;
  const lblX = s => `再確認(${s.state === "waiting" ? "間隔内・不足補充" : "正解済み・不足補充"})・最終出題 ${fmt(lastShown(s.id))}`;

  for (const allowRecent of [false, true]) {
    const base = picks.length;
    // 枠の配分: 未回答の最低枠 → 復習枠 → 互いの不足補充 → 再確認 → 正解済み
    const needU = Math.max(0, nU - picks.filter(p => p.kind === "未回答").length);
    const needR = Math.max(0, nR - picks.filter(p => p.kind === "復習" || p.kind === "再確認").length);
    take(U, needU, "未回答", allowRecent, lblU);
    // 再確認期の予約枠: 復習枠(nR)の一部を再確認期に確保する。誤答(R)の優先順位は変えず、
    // 残りの枠をRが使う。Dは最終出題が古い順なので、選ばれた問題は後ろへ回り、固定的に選ばれ続けない。
    const needD = !allowRecent && needR >= 2 ? Math.min(D.length, Math.max(1, Math.floor(needR / 4))) : 0;
    const beforeD = picks.length;
    take(D, needD, "再確認", allowRecent, lblD);
    const gotD = picks.length - beforeD;
    take(R, needR - gotD, "復習", allowRecent, lblR);
    const rest = () => size - picks.length;
    if (rest() > 0) take(U, rest(), "未回答", allowRecent, lblU);
    if (rest() > 0) take(R, rest(), "復習", allowRecent, lblR);
    if (rest() > 0) take(D, rest(), "再確認", allowRecent, lblD);
    if (rest() > 0) take(X, rest(), "再確認", allowRecent, lblX);
    if (size - picks.length <= 0 || (allowRecent && picks.length === base)) break;
  }

  // 表示順: 復習/未回答/再確認を交ぜる(選出枠は変えない)
  const mixed = seededOrder(picks, seed + "mix");
  const breakdown = { 復習: 0, 未回答: 0, 再確認: 0 };
  picks.forEach(p => { breakdown[p.kind]++; });
  const shortage = size - picks.length;
  const notes = [];
  if (shortage > 0) notes.push(`出題できる候補が足りないため、今回は${picks.length}問です(同じ問題の重複出題はしません)。`);
  if (picks.some(p => p.recentFallback)) notes.push("候補不足のため、直前のセッションで出した問題を含みます。");
  return { picks: mixed, breakdown, shortage, notes, size, nU, nR, counts: summarize(statuses) };
}
