// 第3回模試の採点・第2回との比較・GPT分析用テキスト。採点は提出後にだけ使う。
// 第2回の記録(fe_mock_r2_results)と問題データは読むだけで、変更しない。
import QA2 from "../r2/mockA2.json";
import QB2 from "../r2/mockB2.json";
import { score as score2 } from "../r2/mock2Report";
import { loadResults as loadR2Results, firstResult as firstR2 } from "../r2/mock2Store";

export const SUBJ = { A: "科目A", B: "科目B" };
export const pct = x => (x * 100).toFixed(1) + "％";
export const mmss = ms => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`; };
export const BY = { user: "本人が提出", timeout: "時間切れで自動提出", abort: "中止で打切り" };
export const LIMIT_NOTE = "第2回と第3回は別の問題であり、分野と難度の配分は同じ方針で作成したが、問題の難しさは統計的にそろえていない。差がそのまま実力の変化を表すとは限らない。";

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

// 第2回の成績：この端末の第2回の初回の記録を、第2回の問題で採点する。記録がなければ手入力の値(合計のみ)。
export function round2Summary(manual) {
  let list = [];
  try { list = loadR2Results(); } catch (e) { list = []; }
  const out = { source: null, A: null, B: null };
  const Q2 = { A: QA2, B: QB2 };
  ["A", "B"].forEach(k => {
    const f = firstR2(list, k);
    if (f) {
      const S = score2(Q2[k], f);
      out[k] = { correct: S.correct, total: S.total, rate: S.rate, byField: S.byField, byCat: S.byCat, source: "device", startedAt: f.startedAt, aborted: f.submittedBy === "abort" };
    } else if (manual && manual[k] != null) {
      const t = k === "A" ? 60 : 20;
      out[k] = { correct: manual[k], total: t, rate: manual[k] / t, byField: null, byCat: null, source: "manual" };
    }
  });
  return out.A || out.B ? out : null;
}

export function compareRows(sub, s3, r2) {
  const one = r2 && r2[sub];
  const rows = [{ label: "合計", r2: one ? { ok: one.correct, total: one.total } : null, r3: { ok: s3.correct, total: s3.total } }];
  Object.entries(s3.byField).forEach(([f, v]) => {
    const p = one && one.byField && one.byField[f];
    rows.push({ label: f, r2: p ? { ok: p.ok, total: p.total } : null, r3: v });
  });
  Object.entries(s3.byCat).forEach(([c, v]) => {
    const p = one && one.byCat && one.byCat[c];
    rows.push({ label: c, r2: p ? { ok: p.ok, total: p.total } : null, r3: v, cat: true });
  });
  return rows.map(r => ({
    label: r.label, cat: !!r.cat,
    r2: r.r2 ? `${r.r2.ok}／${r.r2.total}（${pct(r.r2.ok / r.r2.total)}）` : "－",
    r3: `${r.r3.ok}／${r.r3.total}（${pct(r.r3.ok / r.r3.total)}）`,
    diff: r.r2 ? (r.r3.ok / r.r3.total - r.r2.ok / r.r2.total) : null,
  }));
}

export { blocksText, bodyText, choiceText } from "../qText";
import { blocksText, bodyText, choiceText } from "../qText";

export function buildReport3(a, qs, r2, first) {
  const S = score(qs, a);
  const L = [];
  L.push(`# FE本番形式準拠オリジナル模擬試験 第3回 ${SUBJ[a.subject]} 結果レポート（GPT分析用）`);
  L.push(`模試回次: 第3回　科目: ${SUBJ[a.subject]}　受験回: ${a.attemptNo}回目${a.attemptNo === 1 ? "（初回）" : "（再受験）"}　受験ID: ${a.attemptId}`);
  L.push("注意: 正答率×1000 は模試独自の参考換算値であり、IPAのIRT評価点ではない。合否判定・合格確率・本番の得点は示さない。");
  L.push("理解度の分類は 自力正解／誤答／未回答 の3つ。時間のフラグ（想定の2倍超／1/3未満）は正誤とは独立の補助情報。誤答の原因（用語・読解・更新漏れ等）は記録していないので、推測で断定しないこと。");
  L.push("");
  L.push(`開始: ${a.startedAt || "-"}　終了: ${a.endedAt || "-"}　経過: ${mmss(a.elapsedMs)}（制限 ${mmss(a.limitMs)}）　提出: ${BY[a.submittedBy] || "-"}`);
  L.push(`中断して再開した回数: ${a.resumes || 0}回　画面を閉じていた間に経過した時間: ${mmss(a.offlineMs || 0)}（試験時間に含む）`);
  L.push(`正解 ${S.correct}／${S.total}（正答率 ${pct(S.rate)}、参考換算値 ${Math.round(S.rate * 1000)}）　誤答 ${S.wrong}　未回答 ${S.blank}${a.submittedBy === "timeout" && S.blank ? "（時間切れによる未回答を含む）" : ""}`);
  L.push("分野別: " + Object.entries(S.byField).map(([f, v]) => `${f} ${v.ok}/${v.total}`).join("、"));
  L.push("細分類別: " + Object.entries(S.byCat).map(([c, v]) => `${c} ${v.ok}/${v.total}`).join("、"));
  L.push("");
  L.push("## 第2回との比較");
  if (r2 && r2[a.subject]) {
    const o = r2[a.subject];
    L.push(`第2回の記録: ${o.source === "device" ? "この端末の第2回の初回（" + String(o.startedAt || "").slice(0, 16) + (o.aborted ? "・中止" : "") + "）" : "手入力の値（分野別なし）"}`);
    compareRows(a.subject, S, r2).forEach(r => L.push(`${r.label}: 第2回 ${r.r2} → 第3回 ${r.r3}${r.diff == null ? "" : `（${r.diff >= 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}ポイント）`}`));
    L.push("※ " + LIMIT_NOTE + " 細分類は1～数問のものが多く、1問の正誤で大きく変わる。");
  } else L.push("第2回の記録なし");
  if (first && first.attemptId !== a.attemptId) {
    const F = score(qs, first);
    L.push(`第3回の初回（${String(first.startedAt || "").slice(0, 16)}）: 正解 ${F.correct}／${F.total}　→ 今回（${a.attemptNo}回目）: 正解 ${S.correct}／${S.total}。同じ問題の再受験のため、正答数の増加には問題を覚えた影響が含まれる。`);
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
    if (q.explain) L.push(blocksText(q.explain));
    L.push("");
  });
  L.push("## 通常学習へ追加する候補（自動登録はしていない）");
  const c = S.rows.filter(r => r.status !== "自力正解").map(r => `${r.q.id}(${r.q.topic})`);
  L.push(c.length ? c.join("、") : "なし");
  return { text: L.join("\n"), S };
}
