// GPT分析用テキストの生成(読取専用・純関数)。localStorage・画面には触れない。
// 入力は呼出し側が読み取って渡す。既存の問題ID・回答ログ・復習リスト・周回進捗は一切変更しない。

export const SCOPE_LABEL = { wrong: "誤答のみ", all: "全回答(正解を含む)" };
export const RANGE_LABEL = { session: "今回のセッション", cycle: "現在の周回", all: "保存済み全履歴" };
export const DEFAULT_PART_SIZE = 15;
export const LEGACY_WRONG_NOTE = "過去の誤答として記録あり・回答日時と選択肢は不明";

const MODE = { normal: "通常", weak: "苦手優先" };

const REQUEST_TEXT = [
  "[GPTへの依頼]",
  "以下は、基本情報技術者試験の学習アプリでの解答結果です。",
  "1. 各問題の正誤を確認し、不正解の問題について、必要な質問を私にしてください(一度に質問は1つずつ)。",
  "2. 私の説明をもとに、理解不足の箇所を特定し、分かりやすく解説して、確認問題を出してください。",
  "3. 分析が終わったら、末尾の「返却フォーマット」でまとめてください。",
].join("\n");

export const HANDOVER_TEMPLATE = [
  "=== 返却フォーマット(分析の最後に、この形式で出力してください) ===",
  "=== FE-Quiz GPT分析結果 ===",
  "分析日:",
  "対象範囲:",
  "科目:",
  "(問題ごとに繰り返す)",
  "[問題ID: A-○○ または B-○○]",
  "つまずいた箇所:",
  "理解できた内容:",
  "未解決の弱点:",
  "本人の説明(本人が述べた内容の要約):",
  "原因の確度: 本人の説明あり / GPTの推測のみ",
  "推奨する復習:",
  "類題で確認したい点(条件・形式の指定。例: 別題材で添字の更新を追う):",
  "再確認の優先度: 高 / 中 / 低",
  "=== 以上 ===",
].join("\n");

function pad(n, w = 2) { return String(n).padStart(w, "0"); }
function isoWithTz(d) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}(${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)})`;
}
function fmtTime(s) {
  if (!s || typeof s !== "string" || s.length < 16) return "日時不明";
  const tz = s.length >= 29 ? s.slice(23) : "";
  return `${s.slice(0, 10)} ${s.slice(11, 16)}${tz ? "(" + tz + ")" : ""}`;
}
function ordinal(n) { return n === 1 ? "初回" : `${n}回目`; }
function resultText(ok) { return ok ? "正解" : "不正解"; }

function choiceText(q, label) {
  const c = (q.choices || []).find(x => x.label === label);
  return c ? c.text : null;
}

// 引数:
//  subject: "A" | "B"
//  questions: ALL_QUESTIONS(現在の問題データ)
//  log: 回答ログ(追記専用ログの配列)
//  cycleHistory: fe_cycle / feb_cycle の history([{id, correct}...])。無ければ []
//  missedIds: 復習リストにある問題id(重複可)
//  currentCycleId: 現在の周回ID(不明なら null)
//  scope: "wrong" | "all" / range: "session" | "cycle" | "all"
export function buildReport({ subject, questions, log, cycleHistory = [], missedIds = [], currentCycleId = null, scope, range, now = new Date(), partSize = DEFAULT_PART_SIZE }) {
  const qById = new Map((questions || []).map(q => [q.id, q]));
  const valid = (Array.isArray(log) ? log : []).filter(e => e && e.question_id !== undefined);
  // 「今回のセッション・現在の周回」は追記順の最後の記録で決める(端末の時計や時差の影響を受けない)。表示は時刻順。
  const last = valid.length ? valid[valid.length - 1] : null;
  const events = valid.slice().sort((a, b) => String(a.answered_at).localeCompare(String(b.answered_at)));
  const sessionId = last ? last.session_id : null;
  const cycleId = currentCycleId || (last ? last.cycle_id : null);

  const inRange = (e) => range === "session" ? (sessionId !== null && e.session_id === sessionId)
    : range === "cycle" ? (cycleId !== null && e.cycle_id === cycleId)
    : true;

  const evById = new Map();
  events.forEach(e => { if (!evById.has(e.question_id)) evById.set(e.question_id, []); evById.get(e.question_id).push(e); });

  // ログ導入前の周回成績(正誤のみ)。苦手優先は周回成績に入らないので、通常モードの記録件数を引く。
  const legacyCycle = new Map();
  if (range === "cycle" || range === "all") {
    const histById = new Map();
    (Array.isArray(cycleHistory) ? cycleHistory : []).forEach(h => {
      if (!h || h.id === undefined) return;
      if (!histById.has(h.id)) histById.set(h.id, []);
      histById.get(h.id).push(!!h.correct);
    });
    histById.forEach((arr, id) => {
      const logged = (evById.get(id) || []).filter(e => e.mode === "normal" && cycleId !== null && e.cycle_id === cycleId).length;
      const legacyN = Math.max(0, arr.length - logged);
      if (legacyN > 0) legacyCycle.set(id, arr.slice(0, legacyN));
    });
  }
  // 復習リストに残る旧誤答(回答ログに誤答がないもの)。全履歴のみ。
  const legacyMissed = new Set();
  if (range === "all") {
    new Set(missedIds || []).forEach(id => {
      const evs = evById.get(id) || [];
      if (!evs.some(e => !e.is_correct)) legacyMissed.add(id);
    });
  }

  // 出力する問題
  const ids = new Set();
  evById.forEach((evs, id) => { if (evs.some(inRange)) ids.add(id); });
  legacyCycle.forEach((_, id) => ids.add(id));
  legacyMissed.forEach(id => ids.add(id));

  const hasWrong = (id) => {
    if ((evById.get(id) || []).some(e => inRange(e) && !e.is_correct)) return true;
    if ((legacyCycle.get(id) || []).some(c => !c)) return true;
    if (legacyMissed.has(id)) return true;
    return false;
  };
  const selected = Array.from(ids).filter(id => scope === "all" ? true : hasWrong(id));

  const firstInRangeTime = (id) => {
    const e = (evById.get(id) || []).find(inRange);
    return e ? String(e.answered_at) : null;
  };
  selected.sort((a, b) => {
    const ta = firstInRangeTime(a), tb = firstInRangeTime(b);
    if (ta && tb) return ta.localeCompare(tb);
    if (ta) return -1;
    if (tb) return 1;
    return Number(a) - Number(b);
  });

  let eventCount = 0;
  let mismatchCount = 0;
  let missingQuestions = 0;
  const blocks = selected.map((id, idx) => {
    const q = qById.get(id);
    const evs = evById.get(id) || [];
    const inEvs = evs.filter(inRange);
    const cur = inEvs.length ? inEvs[inEvs.length - 1] : null;
    eventCount += inEvs.length;
    const label = `科目${subject}`;
    const lines = [];
    lines.push(`--- 問題 ${idx + 1}/${selected.length} ---`);
    if (q) lines.push(`${label} / 問題ID:${subject}-${id} / 分野:${q.cat} / 題材:${q.topic}`);
    else { missingQuestions++; lines.push(`${label} / 問題ID:${subject}-${id} / 現在の問題データに見つかりません(削除・差替えの可能性)`); }

    if (cur) {
      lines.push(`結果: ${resultText(cur.is_correct)}(${MODE[cur.mode] || cur.mode}モード・解答日時 ${fmtTime(cur.answered_at)})`);
      const sel = q ? choiceText(q, cur.selected_choice) : null;
      lines.push(`あなたの回答: ${cur.selected_choice}${sel ? " " + sel : ""}`);
    } else {
      lines.push(`結果: ${LEGACY_WRONG_NOTE}`);
      lines.push("あなたの回答: 不明(回答ログ導入前の記録のため)");
    }
    if (q) {
      const cc = choiceText(q, q.correct);
      lines.push(`正解: ${q.correct}${cc ? " " + cc : ""}`);
      lines.push("問題文・疑似言語:");
      lines.push(String(q.q));
      if (q.image) lines.push("[図あり: 画像はテキストに出力できません。アプリで確認してください]");
      lines.push("選択肢:");
      (q.choices || []).forEach(c => {
        const marks = [];
        if (cur && c.label === cur.selected_choice) marks.push("あなたの回答");
        if (c.label === q.correct) marks.push("正解");
        lines.push(`  ${c.label} ${c.text}${marks.length ? " ← " + marks.join("・") : ""}`);
      });
      lines.push(`既存の解説: ${q.hint}`);
    }

    // 解答履歴(取得できる範囲。古い順)
    const hist = [];
    const lc = legacyCycle.get(id) || [];
    lc.forEach(ok => hist.push({ text: ok ? "正解(正誤のみ記録・回答日時と選択肢は不明)" : `不正解(${LEGACY_WRONG_NOTE})`, ok, legacy: true }));
    if (legacyMissed.has(id) && !lc.some(c => !c)) hist.push({ text: `不正解(復習リストに残る旧誤答。${LEGACY_WRONG_NOTE})`, ok: false, legacy: true });
    evs.forEach(e => {
      const sel = q ? choiceText(q, e.selected_choice) : null;
      hist.push({
        text: `${fmtTime(e.answered_at)} ${MODE[e.mode] || e.mode} ${e.selected_choice}${sel ? " " + sel : ""} ${resultText(e.is_correct)}${inRange(e) ? " [範囲内]" : ""}`,
        ok: !!e.is_correct, legacy: false, ev: e,
      });
      if (q && ((e.selected_choice === q.correct) !== !!e.is_correct)) mismatchCount++;
    });
    if (hist.length > 0) {
      lines.push("解答の流れ: " + hist.map((h, i) => `${ordinal(i + 1)}${h.legacy ? "(旧記録)" : ""}${h.ok ? "正解" : "不正解"}`).join("、"));
      lines.push("解答履歴(古い順・取得できた範囲):");
      hist.forEach((h, i) => lines.push(`  ${i + 1}. ${h.text}`));
    }
    const mism = q ? evs.filter(e => (e.selected_choice === q.correct) !== !!e.is_correct) : [];
    if (mism.length) lines.push(`注意: 記録された正誤と現在の正解が食い違う回答が${mism.length}件あります(問題内容が変更された可能性)。`);
    return lines.join("\n");
  });

  const legacyRowCount = Array.from(legacyCycle.values()).reduce((s, a) => s + a.length, 0);
  const first = events.length ? events[0] : null;
  const header = [
    "=== FE-Quiz GPT分析用レポート ===",
    `作成: ${isoWithTz(now)}`,
    `科目: ${subject === "A" ? "科目A" : "科目B"} / 範囲: ${RANGE_LABEL[range]} / 対象: ${SCOPE_LABEL[scope]}`,
    `問題数: ${selected.length}問 / 範囲内の回答ログ: ${eventCount}件${legacyRowCount ? ` / ログ導入前の周回成績: ${legacyRowCount}件(正誤のみ)` : ""}`,
    `問題ID付き回答ログの開始: ${first ? fmtTime(first.answered_at) : "ログなし"}`,
  ].join("\n");

  const notes = [
    "[データの注意]",
    "- 選択肢の本文は現在の問題データから表示しています(過去に表示された本文は保存されていません)。",
    "- 問題IDが不明な過去の履歴(セッション履歴・累計成績)は、問題単位に復元できないため出力していません。",
    "- 復習リストにない旧誤答は復元できません。「記録あり」と書かれた問題だけが対象です。",
    "- 問題文の修正は記録されていません。正誤の食い違いがある場合のみ「変更の可能性」と表示します。",
    ...(missingQuestions ? [`- ${missingQuestions}問は現在の問題データに存在しないため、問題文を出力できません。`] : []),
    ...(mismatchCount ? [`- 正誤の食い違いのある回答が${mismatchCount}件あります。`] : []),
  ].join("\n");

  const total = Math.max(1, Math.ceil(blocks.length / Math.max(1, partSize)));
  const parts = [];
  if (blocks.length === 0) {
    parts.push([header, "", "該当する記録はありません。", "", notes].join("\n"));
  } else {
    for (let p = 0; p < total; p++) {
      const chunk = blocks.slice(p * partSize, (p + 1) * partSize).join("\n\n");
      const out = [];
      if (total > 1) out.push(`【パート ${p + 1}/${total}】`);
      if (p === 0) {
        out.push(header, "", REQUEST_TEXT);
        if (total > 1) out.push(`※全${total}パートに分けて貼り付けます。最後のパートを貼り終えるまで分析は始めず、「受け取りました」とだけ返してください。`);
        out.push("");
      }
      out.push(chunk);
      if (p === total - 1) out.push("", notes, "", HANDOVER_TEMPLATE);
      parts.push(out.join("\n"));
    }
  }
  const full = parts.join("\n\n");
  return { parts, full, stats: { questions: selected.length, events: eventCount, legacyRows: legacyRowCount, chars: full.length, mismatches: mismatchCount, partCount: parts.length } };
}
