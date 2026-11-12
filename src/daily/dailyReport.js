// 「今日の学習」の GPT 分析用テキスト。採点は提出後にだけ使う。
import { blocksText, choiceText } from "../mock/qText";
import { judgeSet, setResults, setStatus, defaultPriority, STATUS, dateLabel } from "./dailyStore";

export const BY = { user: "本人が提出", timeout: "制限時間で自動提出" };
export const mmss = ms => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`; };
export const secText = s => (s >= 60 ? `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒` : `${s}秒`);

function kindText(meta, isRetake) {
  if (isRetake) return "同じ設問の再受験";
  if (meta && meta.review_of) return `新しい類題（元問題 ${meta.review_of}）`;
  return "新作（初見）";
}

export function attemptLines(plan, set, a, notes) {
  const S = judgeSet(set, a);
  const n = (notes && notes[a.attemptId]) || {};
  const pri = n.priority || defaultPriority(S);
  const L = [];
  L.push(`### ${set.setId}　${set.title}　${a.attemptNo}回目${a.isRetake ? "（再受験：同じ問題のため、問題を覚えた影響を含む）" : "（初回）"}`);
  L.push(`受験ID: ${a.attemptId}　計画ID: ${a.planId}`);
  L.push(`開始: ${a.startedAt}　終了: ${a.endedAt || "-"}　提出: ${BY[a.submittedBy] || "-"}`);
  L.push(`経過: ${mmss(a.elapsedMs)}／制限 ${mmss(a.limitMs)}（${set.limitNote || ""}）`);
  L.push(`問題を表示していなかった時間: ${mmss(a.hiddenMs)}（画面非表示・中断・再読込の間。セットの経過時間には含み、設問別の時間には含まない）　再開: ${a.resumes || 0}回　計測の途切れ: ${a.interruptions || 0}回`);
  L.push(`正解 ${S.correct}／${S.total}　誤答 ${S.wrong}　未回答 ${S.blank}${a.submittedBy === "timeout" && S.blank ? "（時間切れによる未回答を含む）" : ""}`);
  L.push(`復習で最初に見る問題: ${pri || "-"}${n.priority ? "（本人が選択）" : "（自動選択）"}`);
  L.push("");
  S.rows.forEach(r => {
    const q = r.q;
    const meta = (a.questions || []).find(x => x.id === q.id);
    const reason = n.reasons && n.reasons[q.id];
    const rv = n.reviewMs && n.reviewMs[q.id];
    L.push(`#### 問${r.i + 1}. ${q.id}（版 ${q.version || 1}）【${r.status}】`);
    L.push(`区分: ${kindText(meta, a.isRetake)}　分野: ${q.field}／${q.cat}　測定する技能: ${q.measures || q.skill}　想定所要時間（作問上の見積り）: ${q.expected_seconds}秒`);
    L.push(`設問別滞在時間: 合計 ${r.sec}秒（初回の表示 ${r.firstSec}秒、再訪 ${r.revisitSec}秒、表示した回数 ${r.visits}回）　回答の変更: ${r.changes}回${r.history.length ? "（" + r.history.map(h => `${Math.round(h.t / 1000)}秒時点で${h.v || "取消し"}`).join("→") + "）" : ""}　保留: ${r.flagged ? "あり" : "なし"}`);
    L.push(`本人の解答: ${r.ans || "未回答"}　正解: ${q.correct}${reason ? "　本人が付けた理由: " + reason : ""}${rv ? "　提出後に解説を開いていた時間: " + secText(Math.round(rv / 1000)) : ""}`);
    L.push("問題文:"); L.push(blocksText(q.body));
    L.push("解答群:"); L.push(choiceText(q));
    L.push("解説: " + q.explanation);
    if (q.explain) L.push(blocksText(q.explain));
    L.push("");
  });
  return L;
}

// 日ごとのテキスト。両セットの完了前でも作れる。未受験のセットは未受験と書き、誤答数に加えない。
export function buildDayReport(plan, attempts, results, notes) {
  const L = [];
  L.push(`# FE「今日の学習」結果（GPT分析用）　${dateLabel(plan.date)}`);
  L.push(`計画ID: ${plan.planId}　試験予定日: ${plan.examDate || "-"}`);
  L.push(`今日の目標: ${plan.goal}`);
  if (plan.note) L.push(`計画の注記: ${plan.note}`);
  L.push("注意: 設問別滞在時間は、受験画面でその設問を表示していた時間の近似（画面を表示したまま席を離れた時間は区別できない）。制限時間は本番の1問平均から決めたセット全体の配分の基準で、個々の問題の速さや合格を判定する基準ではない。正誤と時間だけで誤答の原因を断定しないこと。");
  const dn = (notes && notes["day:" + plan.date]) || {};
  if (dn.memo) L.push(`本人のメモ（使えた時間など）: ${dn.memo}`);
  L.push("");
  L.push("## 受験状況");
  plan.sets.forEach(set => {
    const st = setStatus(set.setId, attempts, results);
    const list = setResults(results, set.setId);
    const first = list[0];
    const s = first ? judgeSet(set, first) : null;
    L.push(`・${set.setId}（${set.title}、${set.questions.length}問・制限 ${mmss(set.limitSec * 1000)}）: ${st}${s ? `　初回 正解 ${s.correct}／${s.total}（経過 ${mmss(first.elapsedMs)}、${BY[first.submittedBy] || ""}）` : ""}${list.length > 1 ? `　受験回数 ${list.length}回` : ""}`);
    L.push(`　目標: ${set.goal}`);
  });
  const done = plan.sets.flatMap(set => setResults(results, set.setId).filter(a => !a.isRetake).map(a => judgeSet(set, a)));
  if (done.length) {
    const t = done.reduce((o, s) => ({ c: o.c + s.correct, w: o.w + s.wrong, b: o.b + s.blank, n: o.n + s.total }), { c: 0, w: 0, b: 0, n: 0 });
    L.push(`受験済みセットの初回合計: 正解 ${t.c}／${t.n}　誤答 ${t.w}　未回答 ${t.b}（未受験のセットは含めない）`);
  }
  L.push("");
  plan.sets.forEach(set => {
    const list = setResults(results, set.setId);
    L.push(`## ${set.setId}　${set.title}`);
    if (!list.length) {
      L.push(attempts[set.setId] ? "受験中（未提出）。この出力には含めない。" : "未受験");
      L.push("");
      return;
    }
    list.forEach(a => { attemptLines(plan, set, a, notes).forEach(x => L.push(x)); });
  });
  L.push("## 次回の計画への引継ぎ");
  const rest = plan.sets.flatMap(set => {
    const f = setResults(results, set.setId)[0];
    return f ? judgeSet(set, f).rows.filter(r => r.status !== STATUS.ok).map(r => `${r.q.id}（${r.status}・${r.q.topic}）`) : [];
  });
  L.push("初回の誤答・未回答: " + (rest.length ? rest.join("、") : "なし"));
  L.push("※ 当日の課題は追加していない。残った誤答は次回の分析対象として記録する。同じ設問の再受験と新しい類題の初回の結果は区別して判断すること。");
  return L.join("\n");
}

export function buildAttemptReport(plan, set, a, notes) {
  return [`# FE「今日の学習」セット結果（GPT分析用）　${dateLabel(plan.date)}`, `今日の目標: ${plan.goal}`, `セットの目標: ${set.goal}`, "",
    ...attemptLines(plan, set, a, notes)].join("\n");
}
