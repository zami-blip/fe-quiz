import { PLANS, planOf, findSet } from "./plans";
import {
  newAttempt, addTime, stepOnline, syncHidden, operate, goTo, markVisit, pick, clearAnswer, toggleFlag, submitAt, remainingMs,
  appendResult, loadResults, saveAttempt, loadAttempt, loadAllAttempts, judgeSet, defaultPriority, setStatus, jstDate, addDays,
  ONLINE_CAP_MS, STATUS,
} from "./dailyStore";
import { buildDayReport } from "./dailyReport";
import QA3 from "../mock/r3/mockA3.json";
import QB3 from "../mock/r3/mockB3.json";
import QA2 from "../mock/r2/mockA2.json";
import QB2 from "../mock/r2/mockB2.json";
import QA1 from "../mock/mockA.json";
import QB1 from "../mock/mockB.json";

const T0 = Date.parse("2026-11-13T07:30:00+09:00");
const plan = planOf("2026-11-13");
const setA = plan.sets[0], setB = plan.sets[1];
beforeEach(() => localStorage.clear());

test("11/13の計画：A5問450秒・B2問600秒、IDの重複なし、模試のIDと重ならない、選択肢と検算値が一致", () => {
  expect(PLANS.map(p => p.date)).toContain("2026-11-13");
  expect(setA.setId).toBe("daily-20261113-A01");
  expect(setB.setId).toBe("daily-20261113-B01");
  expect(setA.questions).toHaveLength(5); expect(setA.limitSec).toBe(450);
  expect(setB.questions).toHaveLength(2); expect(setB.limitSec).toBe(600);
  const all = [...setA.questions, ...setB.questions];
  expect(new Set(all.map(q => q.id)).size).toBe(7);
  const old = new Set([...QA1, ...QB1, ...QA2, ...QB2, ...QA3, ...QB3].map(q => q.id));
  all.forEach(q => {
    expect(old.has(q.id)).toBe(false);
    expect(q.choices.map(c => c.label)).toContain(q.correct);
    expect(q.verify.filter(v => v.reason === "正解").map(v => v.label)).toEqual([q.correct]);
    q.choices.forEach((c, i) => expect(c.cols || c.text).toEqual(q.verify[i].value));
    expect(q.explanation).toMatch(/〔検算〕/);
    ["measures", "expected_seconds", "version", "field", "cat"].forEach(k => expect(q[k]).toBeTruthy());
  });
  setA.questions.forEach(q => expect(q.choices).toHaveLength(4));
  setB.questions.forEach(q => { expect(q.explain && q.explain.some(b => b.t === "table")).toBe(true); });
  expect(findSet("daily-20261113-B01").set).toBe(setB);
});

test("科目Bの題名・本文に解法のヒント語を付けていない", () => {
  setB.questions.forEach(q => {
    const head = q.body[0].text;
    expect(head).not.toMatch(/再帰|キュー問題|return ?の確認/);
  });
});

test("設問別の時間：初回と再訪を分けて積算し、表示していない設問には加えない", () => {
  const a = newAttempt(plan, setA, 1, T0);
  const ids = setA.questions.map(q => q.id);
  for (let s = 1; s <= 30; s++) stepOnline(a, T0 + s * 1000, ids[0]);           // 問1を30秒
  operate(a, T0 + 30000, ids[0], x => { goTo(x, 1, 5); markVisit(x, ids[1]); }); // 問2へ
  for (let s = 31; s <= 50; s++) stepOnline(a, T0 + s * 1000, ids[1]);          // 問2を20秒
  operate(a, T0 + 50000, ids[1], x => { goTo(x, 0, 5); markVisit(x, ids[0]); }); // 問1へ戻る（再訪）
  for (let s = 51; s <= 60; s++) stepOnline(a, T0 + s * 1000, ids[0]);          // 問1を10秒
  expect(a.perQ[ids[0]]).toMatchObject({ ms: 40000, firstMs: 30000, revisitMs: 10000, visits: 2 });
  expect(a.perQ[ids[1]]).toMatchObject({ ms: 20000, firstMs: 20000, revisitMs: 0, visits: 1 });
  expect(a.perQ[ids[2]]).toBeUndefined();
  expect(a.elapsedMs).toBe(60000); expect(a.hiddenMs).toBe(0);
});

test("画面非表示の時間はセットの経過に含め、設問別には加えない（二重加算しない）", () => {
  const a = newAttempt(plan, setA, 1, T0);
  const q1 = setA.questions[0].id;
  stepOnline(a, T0 + 10000, q1);        // 10秒表示（間隔が上限を超えた分は非表示扱い）
  syncHidden(a, T0 + 70000);            // 60秒非表示
  syncHidden(a, T0 + 70000);            // 同じ時刻でもう一度（加算されない）
  stepOnline(a, T0 + 71000, q1);        // 1秒表示
  expect(a.elapsedMs).toBe(71000);
  expect(a.hiddenMs).toBe(60000 + (10000 - ONLINE_CAP_MS));
  expect(a.perQ[q1].ms).toBe(ONLINE_CAP_MS + 1000);
  expect(a.perQ[q1].ms + a.hiddenMs).toBe(a.elapsedMs);
  expect(a.interruptions).toBe(1);
});

test("制限時間で自動提出。期限後に戻ったら期限の時刻で提出し、未回答も記録する", () => {
  const a = newAttempt(plan, setA, 1, T0);
  pick(a, setA.questions[0].id, "イ");
  saveAttempt(a);
  const b = loadAttempt(setA.setId);                   // 再読込
  expect(remainingMs(b, T0 + 100000)).toBe(350000);
  expect(syncHidden(b, T0 + 3600000)).toBe(true);       // 1時間後に戻る
  expect(b.submittedBy).toBe("timeout");
  expect(b.elapsedMs).toBe(450000);
  expect(Date.parse(b.endedAt)).toBe(T0 + 450000);
  const S = judgeSet(setA, b);
  expect(S.correct).toBe(1); expect(S.blank).toBe(4);
  expect(operate(b, T0 + 3600001, setA.questions[0].id, x => pick(x, setA.questions[1].id, "ア"))).toBe("ended");
  expect(b.answers[setA.questions[1].id]).toBeUndefined();
});

test("期限ちょうどの操作は適用せず時間切れ。提出の重複保存はしない", () => {
  const a = newAttempt(plan, setB, 1, T0);
  for (let s = 1; s <= 599; s++) stepOnline(a, T0 + s * 1000, setB.questions[0].id);
  expect(operate(a, T0 + 600000, setB.questions[0].id, x => pick(x, setB.questions[0].id, "エ"))).toBe("timeout");
  expect(a.answers[setB.questions[0].id]).toBeUndefined();
  expect(submitAt(a, T0 + 600500, setB.questions[0].id)).toBe("ended");
  expect(appendResult(a)).toBe(true); expect(appendResult(a)).toBe(true);
  expect(loadResults()).toHaveLength(1);
});

test("回答の変更回数・取消し・保留、復習の優先問題、セットの状態", () => {
  const a = newAttempt(plan, setA, 1, T0);
  const [q1, q2] = setA.questions;
  pick(a, q1.id, "ア"); pick(a, q1.id, q1.correct); clearAnswer(a, q2.id); toggleFlag(a, q2.id);
  expect(a.perQ[q1.id].changes).toBe(1);
  expect(setStatus(setA.setId, { [setA.setId]: a }, [])).toBe("受験中");
  submitAt(a, T0 + 5000, q1.id);
  appendResult(a);
  expect(setStatus(setA.setId, {}, loadResults())).toBe("完了");
  expect(setStatus(setB.setId, {}, loadResults())).toBe("未受験");
  const S = judgeSet(setA, a);
  expect(S.rows[0].status).toBe(STATUS.ok);
  expect(defaultPriority(S)).toBe(q2.id);
});

test("日ごとのGPT分析用テキスト：未受験のセットは未受験と書き、誤答数に加えない", () => {
  const a = newAttempt(plan, setA, 1, T0);
  setA.questions.forEach(q => pick(a, q.id, q.correct));
  pick(a, setA.questions[4].id, "ア");
  submitAt(a, T0 + 300000, setA.questions[0].id);
  appendResult(a);
  const notes = { [a.attemptId]: { reasons: { [setA.questions[4].id]: "知識・式" } }, "day:2026-11-13": { memo: "朝10分" } };
  const t = buildDayReport(plan, {}, loadResults(), notes);
  expect(t).toMatch("daily-20261113-B01（科目B 2問セット、2問・制限 10分00秒）: 未受験");
  expect(t).toMatch("受験済みセットの初回合計: 正解 4／5　誤答 1　未回答 0");
  expect(t).toMatch("本人が付けた理由: 知識・式");
  expect(t).not.toMatch("解説を開いていた時間");
  expect(t).toMatch("本人のメモ（使えた時間など）: 朝10分");
  expect(t).toMatch("初回の表示");
  expect(t).toMatch("```");                       // コード（SQL）を含む
  expect(t).toMatch("解答群 | 成立に必要な仕様");  // 表形式の解答群
});

test("保存キーは fe_daily_ だけ。模試・通常学習のキーは変更しない", () => {
  localStorage.setItem("fe_mock_r3_results", "[\"r3\"]");
  localStorage.setItem("fe_alog_v1", "[\"keep\"]");
  const a = newAttempt(plan, setA, 1, T0); saveAttempt(a); submitAt(a, T0 + 1000, setA.questions[0].id); appendResult(a);
  expect(Object.keys(loadAllAttempts())).toEqual([setA.setId]);
  const keys = Object.keys(localStorage).filter(k => !["fe_mock_r3_results", "fe_alog_v1"].includes(k));
  keys.forEach(k => expect(k.startsWith("fe_daily_")).toBe(true));
  expect(localStorage.getItem("fe_mock_r3_results")).toBe("[\"r3\"]");
  expect(localStorage.getItem("fe_alog_v1")).toBe("[\"keep\"]");
});

test("日本時間の日付", () => {
  expect(jstDate(Date.parse("2026-11-12T15:00:00Z"))).toBe("2026-11-13");
  expect(jstDate(Date.parse("2026-11-12T14:59:59Z"))).toBe("2026-11-12");
  expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
});

test("11/14の計画：A5問450秒・B2問600秒、固有ID、元設問の参照、進め方、全日付でIDが重ならない", () => {
  const p = planOf("2026-11-14");
  const [a, b] = p.sets;
  expect(a.setId).toBe("daily-20261114-A01"); expect(a.limitSec).toBe(450); expect(a.questions).toHaveLength(5);
  expect(b.setId).toBe("daily-20261114-B01"); expect(b.limitSec).toBe(600); expect(b.questions).toHaveLength(2);
  expect(a.advice).toMatch("1分"); expect(b.advice).toMatch("残り5分");
  const all = PLANS.flatMap(x => x.sets.flatMap(s => s.questions));
  expect(new Set(all.map(q => q.id)).size).toBe(all.length);
  const ids13 = new Set(planOf("2026-11-13").sets.flatMap(s => s.questions.map(q => q.id)));
  const refs = Object.fromEntries([...a.questions, ...b.questions].map(q => [q.id, q.review_of || q.related_to || null]));
  expect(refs).toEqual({ D1114A01: "D1113A02", D1114A02: null, D1114A03: "D1113A05", D1114A04: "D1113A04", D1114A05: null, D1114B01: "D1113B01", D1114B02: "D1113B02" });
  Object.values(refs).filter(Boolean).forEach(r => expect(ids13.has(r)).toBe(true));
  [...a.questions, ...b.questions].forEach(q => {
    expect(q.choices.map(c => c.label)).toContain(q.correct);
    q.choices.forEach((c, i) => expect(c.cols || c.text).toEqual(q.verify[i].value));
    expect(q.verify.filter(v => v.reason === "正解").map(v => v.label)).toEqual([q.correct]);
    expect(q.explanation).toMatch(/〔検算〕/);
    expect(q.explain && q.explain.some(t => t.t === "table")).toBe(true);
  });
  b.questions.forEach(q => expect(q.body[0].text).not.toMatch(/再帰|キュー問題|return ?の確認|折返し/));
});
