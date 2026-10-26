// 採点とレポート。採点は両科目の提出後にだけ呼ぶ。
import { FIGURE_TEXT } from "./figureText";
export const SUBJ_NAME = { A: "科目A", B: "科目B" };

export function judge(q, sec) {
  const ans = sec.answers[q.id] || null;
  const pq = sec.perQ[q.id] || { ms: 0, changes: 0, history: [] };
  const status = !ans ? "未回答" : ans === q.correct ? "自力正解" : "誤答";
  const sec_ = Math.round(pq.ms / 1000);
  const flags = [];
  if (ans && sec_ > q.expected_seconds * 2) flags.push("想定時間の2倍超");
  if (ans && sec_ < q.expected_seconds / 3) flags.push("想定時間の1/3未満");
  return { ans, status, seconds: sec_, changes: pq.changes || 0, history: pq.history || [], flags, flagged: !!sec.flags[q.id] };
}

export function scoreSection(qs, sec) {
  const rows = qs.map(q => ({ q, ...judge(q, sec) }));
  const correct = rows.filter(r => r.status === "自力正解").length;
  const wrong = rows.filter(r => r.status === "誤答").length;
  const blank = rows.filter(r => r.status === "未回答").length;
  const byCat = {};
  rows.forEach(r => {
    const k = r.q.field + "／" + r.q.cat;
    byCat[k] = byCat[k] || { ok: 0, total: 0 };
    byCat[k].total++; if (r.status === "自力正解") byCat[k].ok++;
  });
  const byField = {};
  rows.forEach(r => {
    byField[r.q.field] = byField[r.q.field] || { ok: 0, total: 0 };
    byField[r.q.field].total++; if (r.status === "自力正解") byField[r.q.field].ok++;
  });
  return { rows, correct, wrong, blank, total: qs.length, rate: qs.length ? correct / qs.length : 0, byCat, byField };
}

const pct = x => (x * 100).toFixed(1) + "％";
const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`; };
export { pct, mmss };

// 図は、接続・数値を文章で表した構造と、図のSVGソースをそのまま載せる（説明文だけに置き換えない）
function figureText(q, b) {
  const lines = ["〔図：" + (b.caption || "") + "〕"];
  const st = FIGURE_TEXT[q.id];
  if (st) { lines.push("図の構造："); st.forEach(x => lines.push("・" + x)); }
  else if (b.alt) lines.push("図の内容：" + b.alt);
  lines.push("図のSVGソース：", "```svg", b.svg, "```");
  return lines.join("\n");
}
function bodyText(q) {
  return q.body.map(b => {
    if (b.t === "p") return b.text;
    if (b.t === "code") return "```\n" + b.text + "\n```";
    if (b.t === "list") return b.items.map(x => "・" + x).join("\n");
    if (b.t === "table") return (b.caption ? "〔" + b.caption + "〕\n" : "") + [b.header, ...b.rows].map(r => "| " + r.join(" | ") + " |").join("\n");
    if (b.t === "svg") return figureText(q, b);
    return "";
  }).join("\n");
}
function choiceText(q) {
  if (q.choice_header) return "　 | " + q.choice_header.join(" | ") + "\n" + q.choices.map(c => c.label + " | " + c.cols.join(" | ")).join("\n");
  return q.choices.map(c => c.label + "　" + c.text).join("\n");
}

export function buildReport(attempt, QA, QB) {
  const S = { A: scoreSection(QA, attempt.sections.A), B: scoreSection(QB, attempt.sections.B) };
  const L = [];
  L.push("# FE本番形式準拠オリジナル模擬試験 結果レポート（GPT分析用）");
  L.push("受験ID: " + attempt.attemptId);
  L.push("注意: 正答率×1000 は模試独自の参考換算値であり、IPAのIRT評価点ではない。合否判定・合格確率は示さない。");
  L.push("理解度の分類は 自力正解／誤答／未回答 の3つ。時間のフラグ（想定の2倍超／1/3未満）は正誤とは独立の補助情報で、理解度の判定には使わない。");
  L.push("");
  ["A", "B"].forEach(k => {
    const sec = attempt.sections[k]; const s = S[k];
    L.push(`## ${SUBJ_NAME[k]}`);
    L.push(`開始: ${sec.startedAt || "-"}　終了: ${sec.endedAt || "-"}　所要: ${mmss(sec.elapsedMs)}（制限 ${mmss(sec.limitMs)}）　提出: ${sec.submittedBy === "timeout" ? "時間切れによる自動提出" : "本人が提出"}`);
    L.push(`正解 ${s.correct}／${s.total}（正答率 ${pct(s.rate)}、参考換算値 ${Math.round(s.rate * 1000)}）　誤答 ${s.wrong}　未回答 ${s.blank}`);
    L.push("分野別: " + Object.entries(s.byField).map(([f, v]) => `${f} ${v.ok}/${v.total}`).join("、"));
    L.push("細分類別: " + Object.entries(s.byCat).map(([c, v]) => `${c} ${v.ok}/${v.total}`).join("、"));
    L.push("");
  });
  if (attempt.brk) L.push(`休憩: ${attempt.brk.skipped ? "取らずに科目Bを開始" : mmss(attempt.brk.elapsedMs)}`);
  L.push("");
  ["A", "B"].forEach(k => {
    L.push(`## ${SUBJ_NAME[k]} 設問別`);
    S[k].rows.forEach((r, i) => {
      const q = r.q;
      L.push(`### ${i + 1}. ${q.id}【${r.status}】`);
      L.push(`タグ: ${q.field}／${q.cat}／topic=${q.topic}／skill=${q.skill}／difficulty=${q.difficulty}／expected_seconds=${q.expected_seconds}／source_style=${q.source_style}`);
      L.push(`所要時間: ${r.seconds}秒　回答の変更: ${r.changes}回${r.history.length ? "（" + r.history.map(h => `${Math.round(h.t / 1000)}秒時点で${h.v || "取消し"}`).join("→") + "）" : ""}　見直しフラグ: ${r.flagged ? "あり" : "なし"}${r.flags.length ? "　時間フラグ: " + r.flags.join("、") : ""}`);
      L.push("問題文:"); L.push(bodyText(q));
      L.push("選択肢:"); L.push(choiceText(q));
      L.push(`本人の解答: ${r.ans || "未回答"}　正解: ${q.correct}`);
      L.push("解説: " + q.explanation);
      L.push("");
    });
  });
  L.push("## 通常学習へ追加する候補（自動登録はしていない）");
  ["A", "B"].forEach(k => {
    const c = S[k].rows.filter(r => r.status !== "自力正解").map(r => r.q.id + "(" + r.q.topic + ")");
    L.push(`${SUBJ_NAME[k]}: ${c.length ? c.join("、") : "なし"}`);
  });
  return { text: L.join("\n"), S };
}
