import QA from "./mockA3.json";
import QB from "./mockB3.json";
import QA1 from "../mockA.json";
import QB1 from "../mockB.json";
import QA2 from "../r2/mockA2.json";
import QB2 from "../r2/mockB2.json";
import {
  newAttempt, advance, syncOffline, stepOnline, operate, submitAt, remainingMs, finish, appendResult, loadResults, nextAttemptNo,
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

// ---- 期限の境界（GPTレビュー指摘1） --------------------------------------------------
// 制限時間の1秒前の状態(最後の定期更新の時刻 T1)を作る
function nearLimit(sub = "A") {
  const a = newAttempt(sub, 1, T0);
  const T1 = T0 + LIMIT_MS[sub] - 1000;
  advance(a, LIMIT_MS[sub] - 1000, T1, { qid: "M3A01" });
  a.lastWall = T1;
  return { a, T1 };
}
const pick = lab => a => { a.answers.M3A01 = lab; };

test("1) 期限直前の回答と提出は受理され、操作時点までの経過が記録される", () => {
  const { a, T1 } = nearLimit();
  expect(operate(a, 400, T1 + 400, "M3A01", pick("イ"))).toBe("ok");
  expect(a.answers.M3A01).toBe("イ");
  expect(a.elapsedMs).toBe(LIMIT_MS.A - 600);
  expect(submitAt(a, 500, T1 + 900, "M3A01", "user")).toBe("user");
  expect(a.submittedBy).toBe("user");
  expect(a.elapsedMs).toBe(LIMIT_MS.A - 100);
  expect(a.perQ.M3A01.ms).toBe(LIMIT_MS.A - 100);
  expect(Date.parse(a.endedAt)).toBe(Math.floor((T1 + 900) / 1000) * 1000); // 終了時刻は秒単位で記録
});

test("2) 期限ちょうど・直後の回答の選択や取消しは適用せず、直前までの回答で自動提出", () => {
  for (const after of [1000, 1001, 60000]) {
    const { a, T1 } = nearLimit();
    a.answers.M3A01 = "ア";
    expect(operate(a, after, T1 + after, "M3A01", pick("ウ"))).toBe("timeout");
    expect(a.answers.M3A01).toBe("ア");
    expect(a.submittedBy).toBe("timeout");
    expect(a.elapsedMs).toBe(LIMIT_MS.A);
    expect(Date.parse(a.endedAt)).toBe(T1 + 1000);   // 期限の時刻で確定
    const { a: b } = nearLimit();
    b.answers.M3A01 = "ア";
    expect(operate(b, after, T1 + after, "M3A01", x => { delete x.answers.M3A01; })).toBe("timeout");
    expect(b.answers.M3A01).toBe("ア");
    expect(operate(b, 10, T1 + after + 10, "M3A01", pick("エ"))).toBe("ended");
  }
});

test("3) 提出確認を期限前に開いても、確定が期限ちょうど・直後なら時間切れの自動提出", () => {
  for (const after of [1000, 1500]) {
    const { a, T1 } = nearLimit("B");
    expect(submitAt(a, after, T1 + after, "M3B01", "user")).toBe("timeout");
    expect(a.submittedBy).toBe("timeout");
    expect(a.elapsedMs).toBe(LIMIT_MS.B);
    expect(Date.parse(a.endedAt)).toBe(T1 + 1000);
  }
  const { a, T1 } = nearLimit("B");
  expect(submitAt(a, 999, T1 + 999, "M3B01", "abort")).toBe("abort");
});

test("4) 定期更新と操作が前後しても二重に加算せず、結果も重複しない", () => {
  const a = newAttempt("A", 1, T0);
  stepOnline(a, 1000, T0 + 1000, "M3A01");          // 定期更新
  operate(a, 300, T0 + 1300, "M3A01", pick("ア"));  // 操作(定期更新からの差分だけ)
  stepOnline(a, 700, T0 + 2000, "M3A01");           // 次の定期更新
  operate(a, 0, T0 + 2000, "M3A01", a => { a.current = 1; }); // 同時刻の操作は0
  expect(a.elapsedMs).toBe(2000);
  expect(a.perQ.M3A01.ms).toBe(2000);
  // 移動の後は移動先の設問に加える
  stepOnline(a, 500, T0 + 2500, "M3A02");
  expect(a.perQ.M3A02.ms).toBe(500);
  submitAt(a, 0, T0 + 2500, "M3A02", "user");
  expect(appendResult(a)).toBe(true);
  expect(appendResult(a)).toBe(true);
  expect(loadResults().filter(r => r.attemptId === a.attemptId)).toHaveLength(1);
  expect(submitAt(a, 100, T0 + 2600, "M3A02", "user")).toBe("ended");
});

test("5) 中断・再読込み・画面を離れた後：閉じていた時間を反映し、残り時間と自動提出が整合する", () => {
  const a = newAttempt("A", 1, T0);
  stepOnline(a, 10 * MIN, T0 + 10 * MIN, "M3A01");
  saveAttempt(a);
  // 30分後に再読込み
  const b = loadAttempt("A");
  syncOffline(b, T0 + 40 * MIN);
  expect(remainingMs(b, T0 + 40 * MIN)).toBe(50 * MIN);
  expect(operate(b, 0, T0 + 40 * MIN, "M3A01", pick("イ"))).toBe("ok");
  // さらに画面を離れて60分後に戻り、操作する → 期限(開始から90分)で自動提出、操作は適用しない
  syncOffline(b, T0 + 100 * MIN);
  expect(b.submittedBy).toBe("timeout");
  expect(Date.parse(b.endedAt)).toBe(T0 + 90 * MIN);
  expect(operate(b, 0, T0 + 100 * MIN, "M3A01", pick("ウ"))).toBe("ended");
  expect(b.answers.M3A01).toBe("イ");
});
