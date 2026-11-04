// 第2回模試の採点・第1回との比較・GPT分析用テキスト。採点は提出後にだけ使う。
import QA1 from "../mockA.json";
import QB1 from "../mockB.json";
import { scoreSection } from "../mockReport";
import { loadResults as loadR1Results } from "../mockStore";

export const SUBJ = { A: "科目A", B: "科目B" };
export const pct = x => (x * 100).toFixed(1) + "％";
export const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`; };
export const BY = { user: "本人が提出", timeout: "時間切れで自動提出", abort: "中止で打切り" };

export function judge(q, a) {
  const ans = a.answers[q.id] || null;
  const pq = a.perQ[q.id] || { ms: 0, changes: 0, history: [] };
  const status = !ans ? "未回答" : ans === q.correct ? "自力正解" : "誤答";
  const seconds = Math.round(pq.ms / 1000);
  const tflags = [];
  if (ans && seconds > q.expected_seconds * 2) tflags.push("想定時間の2倍超");
  if (ans && seconds < q.expected_seconds / 3) tflags.push("想定時間の1/3未満");
  return { ans, status, seconds, changes: pq.changes || 0, history: pq.history || [], tflags, flagged: !!a.flags[q.id] };
}

export function score(qs, a) {
  const rows = qs.map(q => ({ q, ...judge(q, a) }));
  const correct = rows.filter(r => r.status === "自力正解").length;
  const wrong = rows.filter(r => r.status === "誤答").length;
  const blank = rows.filter(r => r.status === "未回答").length;
  const byField = {}, byCat = {};
  rows.forEach(r => {
    const f = r.q.field, c = r.q.field + "／" + r.q.cat;
    byField[f] = byField[f] || { ok: 0, total: 0 }; byField[f].total++;
    byCat[c] = byCat[c] || { ok: 0, total: 0 }; byCat[c].total++;
    if (r.status === "自力正解") { byField[f].ok++; byCat[c].ok++; }
  });
  return { rows, correct, wrong, blank, total: qs.length, rate: qs.length ? correct / qs.length : 0, byField, byCat };
}

// 第1回の成績(この端末の記録を読むだけ。第1回のデータは変更しない)。
// 中止していない最初の受験を使う。端末に記録がなく、手入力の値があればそれを使う(分野別はなし)。
export function round1Summary(manual) {
  let list = [];
  try { list = loadR1Results(); } catch (e) { list = []; }
  const done = list.filter(r => !r.aborted).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
  const r = done[0] || list[0];
  if (r) {
    const S = { A: scoreSection(QA1, r.sections.A), B: scoreSection(QB1, r.sections.B) };
    const pick = k => ({ correct: S[k].correct, total: S[k].total, rate: S[k].rate, byField: S[k].byField, taken: !!r.sections[k].startedAt });
    return { source: "device", createdAt: r.createdAt, aborted: !!r.aborted, A: pick("A"), B: pick("B") };
  }
  if (manual && (manual.A != null || manual.B != null)) {
    const mk = (n, t) => (n == null ? null : { correct: n, total: t, rate: n / t, byField: null, taken: true });
    return { source: "manual", A: mk(manual.A, 60), B: mk(manual.B, 20) };
  }
  return null;
}

export function compareRows(sub, s2, r1) {
  const rows = [];
  const one = r1 && r1[sub];
  rows.push({ label: "合計", r1: one ? one : null, r2: { ok: s2.correct, total: s2.total } });
  Object.entries(s2.byField).forEach(([f, v]) => {
    const p = one && one.byField && one.byField[f];
    rows.push({ label: f, r1: p ? { correct: p.ok, total: p.total } : null, r2: v });
  });
  return rows.map(r => ({
    label: r.label,
    r1: r.r1 ? `${r.r1.correct}／${r.r1.total}（${pct(r.r1.correct / r.r1.total)}）` : "－",
    r2: `${r.r2.ok}／${r.r2.total}（${pct(r.r2.ok / r.r2.total)}）`,
    diff: r.r1 ? (r.r2.ok / r.r2.total - r.r1.correct / r.r1.total) : null,
  }));
}

function figureText(b) {
  const L = ["〔図：" + (b.caption || "") + "〕", "図の構造："];
  (b.figure_text || []).forEach(x => L.push("・" + x));
  return L.join("\n");
}
export function bodyText(q) {
  return q.body.map(b => {
    if (b.t === "p") return b.text;
    if (b.t === "code") return "```\n" + b.text + "\n```";
    if (b.t === "list") return b.items.map(x => "・" + x).join("\n");
    if (b.t === "table") return (b.caption ? "〔" + b.caption + "〕\n" : "") + [b.header, ...b.rows].map(r => "| " + r.join(" | ") + " |").join("\n");
    if (b.t === "svg") return figureText(b);
    return "";
  }).join("\n");
}
export function choiceText(q) {
  if (q.choice_header) return "　 | " + q.choice_header.join(" | ") + "\n" + q.choices.map(c => c.label + " | " + c.cols.join(" | ")).join("\n");
  return q.choices.map(c => c.label + "　" + c.text).join("\n");
}

export function buildReport2(a, qs, r1, first) {
  const S = score(qs, a);
  const L = [];
  L.push(`# FE本番形式準拠オリジナル模擬試験 第2回 ${SUBJ[a.subject]} 結果レポート（GPT分析用）`);
  L.push(`模試回次: 第2回　科目: ${SUBJ[a.subject]}　受験回: ${a.attemptNo}回目${a.attemptNo === 1 ? "（初回）" : "（再受験）"}　受験ID: ${a.attemptId}`);
  L.push("注意: 正答率×1000 は模試独自の参考換算値であり、IPAのIRT評価点ではない。合否判定・合格確率は示さない。");
  L.push("理解度の分類は 自力正解／誤答／未回答 の3つ。時間のフラグ（想定の2倍超／1/3未満）は正誤とは独立の補助情報。");
  L.push("");
  L.push(`開始: ${a.startedAt || "-"}　終了: ${a.endedAt || "-"}　経過: ${mmss(a.elapsedMs)}（制限 ${mmss(a.limitMs)}）　提出: ${BY[a.submittedBy] || "-"}`);
  L.push(`中断して再開した回数: ${a.resumes || 0}回　画面を閉じていた間に経過した時間: ${mmss(a.offlineMs || 0)}（試験時間に含む）`);
  L.push(`正解 ${S.correct}／${S.total}（正答率 ${pct(S.rate)}、参考換算値 ${Math.round(S.rate * 1000)}）　誤答 ${S.wrong}　未回答 ${S.blank}${a.submittedBy === "timeout" && S.blank ? "（時間切れによる未回答を含む）" : ""}`);
  L.push("分野別: " + Object.entries(S.byField).map(([f, v]) => `${f} ${v.ok}/${v.total}`).join("、"));
  L.push("細分類別: " + Object.entries(S.byCat).map(([c, v]) => `${c} ${v.ok}/${v.total}`).join("、"));
  L.push("");
  L.push("## 第1回との比較");
  if (r1 && r1[a.subject]) {
    L.push(`第1回の記録: ${r1.source === "device" ? "この端末の受験記録（" + String(r1.createdAt || "").slice(0, 16) + "）" : "手入力の値（分野別なし）"}`);
    compareRows(a.subject, S, r1).forEach(r => L.push(`${r.label}: 第1回 ${r.r1} → 第2回 ${r.r2}${r.diff == null ? "" : `（${r.diff >= 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}ポイント）`}`));
    L.push("※ 第1回と第2回は別の問題であり、難易度・分野の配分は同じ方針で作成したが、正答率の差がそのまま実力の変化を表すとは限らない。");
  } else L.push("第1回の記録なし");
  if (first && first.attemptId !== a.attemptId) {
    const F = score(qs, first);
    L.push(`第2回の初回（${String(first.startedAt || "").slice(0, 16)}）: 正解 ${F.correct}／${F.total}　→ 今回（${a.attemptNo}回目）: 正解 ${S.correct}／${S.total}。同じ問題の再受験のため、正答数の増加には問題を覚えた影響が含まれる。`);
  }
  L.push("");
  L.push("## 設問別");
  S.rows.forEach((r, i) => {
    const q = r.q;
    L.push(`### ${i + 1}. ${q.id}【${r.status}】`);
    L.push(`タグ: ${q.field}／${q.cat}／topic=${q.topic}／skill=${q.skill}／difficulty=${q.difficulty}／expected_seconds=${q.expected_seconds}`);
    L.push(`所要時間: ${r.seconds}秒　回答の変更: ${r.changes}回${r.history.length ? "（" + r.history.map(h => `${Math.round(h.t / 1000)}秒時点で${h.v || "取消し"}`).join("→") + "）" : ""}　見直しフラグ: ${r.flagged ? "あり" : "なし"}${r.tflags.length ? "　時間フラグ: " + r.tflags.join("、") : ""}`);
    L.push("問題文:"); L.push(bodyText(q));
    L.push("選択肢:"); L.push(choiceText(q));
    L.push(`本人の解答: ${r.ans || "未回答"}　正解: ${q.correct}`);
    L.push("解説: " + q.explanation);
    L.push("");
  });
  L.push("## 通常学習へ追加する候補（自動登録はしていない）");
  const c = S.rows.filter(r => r.status !== "自力正解").map(r => `${r.q.id}(${r.q.topic})`);
  L.push(c.length ? c.join("、") : "なし");
  return { text: L.join("\n"), S };
}
