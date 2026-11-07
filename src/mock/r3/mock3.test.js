import QA from "./mockA3.json";
import QB from "./mockB3.json";
import QA1 from "../mockA.json";
import QB1 from "../mockB.json";
import QA2 from "../r2/mockA2.json";
import QB2 from "../r2/mockB2.json";
import {
  newAttempt, advance, syncOffline, remainingMs, finish, appendResult, loadResults, nextAttemptNo,
  firstResult, saveAttempt, loadAttempt, LIMIT_MS,
} from "./mock3Store";
import { buildReport3, round2Summary, score, compareRows } from "./mock3Report";

const MIN = 60 * 1000;
const T0 = Date.parse("2026-11-08T10:00:00+09:00");
beforeEach(() => localStorage.clear());

test("問題データ：科目A60問・科目B20問、IDの重複なし、第1回・第2回のIDと重ならない", () => {
  expect(QA).toHaveLength(60);
  expect(QB).toHaveLength(20);
  const ids = [...QA, ...QB].map(q => q.id);
  expect(new Set(ids).size).toBe(80);
  [...QA, ...QB].forEach(q => {
    expect(q.choices.map(c => c.label)).toContain(q.correct);
    expect(q.round).toBe(3);
  });
  QA.forEach(q => expect(q.choices).toHaveLength(4));
  const old = new Set([...QA1, ...QB1, ...QA2, ...QB2].map(q => q.id));
  ids.forEach(id => expect(old.has(id)).toBe(false));
});

test("科目Bのコードは改行と字下げを保持している", () => {
  QB.filter(q => q.field !== "情報セキュリティ").forEach(q => {
    const code = q.body.filter(b => b.t === "code").map(b => b.text).join("\n");
    expect(code).toMatch(/\n {2,}\S/);
  });
});

test("閉じていた時間も経過し、制限時間で自動提出", () => {
  const a = newAttempt("A", 1, T0);
  advance(a, 30 * MIN, T0 + 30 * MIN, { qid: "M3A01" });
  a.lastWall = T0 + 30 * MIN;
  expect(syncOffline(a, T0 + 180 * MIN)).toBe(true);
  expect(a.elapsedMs).toBe(LIMIT_MS.A);
  expect(a.submittedBy).toBe("timeout");
  expect(a.round).toBe(3);
  expect(a.attemptId.startsWith("mock3-A-")).toBe(true);
});

test("保存キーは fe_mock_r3_ だけ。第1回・第2回の記録は変更しない", () => {
  localStorage.setItem("fe_mock_v1_results", "[\"r1\"]");
  localStorage.setItem("fe_mock_r2_results", "[]");
  const a = newAttempt("B", 1, T0);
  a.answers[QB[0].id] = QB[0].correct;
  saveAttempt(a);
  expect(loadAttempt("B").answers[QB[0].id]).toBe(QB[0].correct);
  finish(a, "user", T0 + MIN);
  expect(appendResult(a)).toBe(true);
  expect(localStorage.getItem("fe_mock_v1_results")).toBe("[\"r1\"]");
  expect(localStorage.getItem("fe_mock_r2_results")).toBe("[]");
  Object.keys(localStorage).forEach(k => expect(["fe_mock_v1_results", "fe_mock_r2_results"].includes(k) || k.startsWith("fe_mock_r3_")).toBe(true));
  expect(nextAttemptNo(loadResults(), "B")).toBe(2);
  expect(firstResult(loadResults(), "B").attemptId).toBe(a.attemptId);
});

test("採点と第2回(この端末の初回)との比較、レポートに比較の限界を記載", () => {
  const r2a = { format: "fe-mock-r2-attempt-v1", round: 2, subject: "A", attemptNo: 1, attemptId: "mock2-A-x", startedAt: "2026-11-07T10:00:00+09:00",
    endedAt: "x", submittedBy: "timeout", elapsedMs: 1, limitMs: 1, offlineMs: 0, resumes: 0, flags: {}, perQ: {},
    answers: Object.fromEntries(QA2.slice(0, 33).map(q => [q.id, q.correct])) };
  localStorage.setItem("fe_mock_r2_results", JSON.stringify([r2a]));
  const r2 = round2Summary(null);
  expect(r2.A.correct).toBe(33);
  expect(r2.B).toBeNull();
  const a = newAttempt("A", 1, T0);
  QA.slice(0, 40).forEach(q => { a.answers[q.id] = q.correct; });
  a.answers[QA[45].id] = QA[45].correct === "ア" ? "イ" : "ア";
  finish(a, "user", T0 + 80 * MIN);
  const S = score(QA, a);
  expect([S.correct, S.wrong, S.blank]).toEqual([40, 1, 19]);
  const rows = compareRows("A", S, r2);
  expect(rows[0].r2).toBe("33／60（55.0％）");
  const { text } = buildReport3(a, QA, r2, a);
  expect(text).toContain("模試回次: 第3回");
  expect(text).toContain("IRT評価点ではない");
  expect(text).toContain("統計的にそろえていない");
  expect(text).toContain("第2回 33／60");
});

test("手入力の第2回の値でも合計を比較できる", () => {
  const r2 = round2Summary({ A: null, B: 8 });
  expect(r2.B.correct).toBe(8);
  expect(r2.B.byField).toBeNull();
});
