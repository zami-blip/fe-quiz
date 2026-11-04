import QA from "./mockA2.json";
import QB from "./mockB2.json";
import QA1 from "../mockA.json";
import QB1 from "../mockB.json";
import {
  newAttempt, advance, syncOffline, stepOnline, remainingMs, finish, appendResult, loadResults, nextAttemptNo,
  firstResult, saveAttempt, loadAttempt, KEY_RESULTS, LIMIT_MS,
} from "./mock2Store";
import { buildReport2, round1Summary, score, compareRows } from "./mock2Report";

const MIN = 60 * 1000;
const T0 = Date.parse("2026-11-05T10:00:00+09:00");

beforeEach(() => localStorage.clear());

test("問題データ：科目A60問・科目B20問、IDの重複なし、正解記号が選択肢にある", () => {
  expect(QA).toHaveLength(60);
  expect(QB).toHaveLength(20);
  const ids = [...QA, ...QB].map(q => q.id);
  expect(new Set(ids).size).toBe(80);
  [...QA, ...QB].forEach(q => {
    expect(q.choices.map(c => c.label)).toContain(q.correct);
    expect(q.round).toBe(2);
    expect(q.explanation.length).toBeGreaterThan(50);
  });
  QA.forEach(q => expect(q.choices).toHaveLength(4));
  // 第1回の問題IDと重ならない
  const r1 = new Set([...QA1, ...QB1].map(q => q.id));
  ids.forEach(id => expect(r1.has(id)).toBe(false));
});

test("閉じていた時間も経過する：科目Aを30分解いて、2時間閉じたら時間切れで自動提出", () => {
  const a = newAttempt("A", 1, T0);
  advance(a, 30 * MIN, T0 + 30 * MIN, { qid: "M2A01" });
  a.lastWall = T0 + 30 * MIN;
  expect(remainingMs(a, T0 + 30 * MIN)).toBe(60 * MIN);
  const done = syncOffline(a, T0 + 30 * MIN + 120 * MIN);
  expect(done).toBe(true);
  expect(a.elapsedMs).toBe(LIMIT_MS.A);
  expect(a.submittedBy).toBe("timeout");
  // 自動提出の時刻は、開始から90分の時点
  expect(Date.parse(a.endedAt)).toBe(T0 + 90 * MIN);
  expect(a.offlineMs).toBe(60 * MIN);
  expect(a.perQ.M2A01.ms).toBe(30 * MIN);
});

test("閉じていた時間が残り時間より短ければ、その分だけ減って再開できる", () => {
  const a = newAttempt("B", 1, T0);
  const done = syncOffline(a, T0 + 25 * MIN);
  expect(done).toBe(false);
  expect(a.elapsedMs).toBe(25 * MIN);
  expect(remainingMs(a, T0 + 25 * MIN)).toBe(75 * MIN);
  expect(a.endedAt).toBeNull();
});

test("端末の時計が戻っても残り時間は増えない", () => {
  const a = newAttempt("A", 1, T0);
  syncOffline(a, T0 + 10 * MIN);
  syncOffline(a, T0 + 5 * MIN);
  expect(a.elapsedMs).toBe(10 * MIN);
});

test("画面を開いている間の経過は、表示中の設問の所要時間に加える", () => {
  const a = newAttempt("A", 1, T0);
  stepOnline(a, 1000, T0 + 1000, "M2A05");
  stepOnline(a, 1000, T0 + 2000, "M2A05");
  expect(a.perQ.M2A05.ms).toBe(2000);
  expect(a.elapsedMs).toBe(2000);
});

test("再受験：初回の記録は残り、回数が増える。比較には初回を使う", () => {
  const a1 = newAttempt("A", nextAttemptNo(loadResults(), "A"), T0);
  a1.answers = { M2A01: "ウ" };
  finish(a1, "user", T0 + 10 * MIN);
  expect(appendResult(a1)).toBe(true);
  const a2 = newAttempt("A", nextAttemptNo(loadResults(), "A"), T0 + 60 * MIN);
  expect(a2.attemptNo).toBe(2);
  a2.answers = { M2A01: "ウ", M2A02: "ア" };
  finish(a2, "user", T0 + 70 * MIN);
  appendResult(a2);
  const list = loadResults();
  expect(list).toHaveLength(2);
  expect(firstResult(list, "A").attemptId).toBe(a1.attemptId);
  expect(nextAttemptNo(list, "B")).toBe(1);
  const { text } = buildReport2(a2, QA, null, firstResult(list, "A"));
  expect(text).toContain("2回目（再受験）");
  expect(text).toContain("第2回の初回");
});

test("第2回の操作は第1回・通常学習のキーに書き込まない", () => {
  localStorage.setItem("fe_mock_v1_results", JSON.stringify([]));
  const before = { ...localStorage };
  const a = newAttempt("B", 1, T0);
  saveAttempt(a);
  finish(a, "user", T0 + MIN);
  appendResult(a);
  const keys = Object.keys(localStorage).filter(k => !(k in before));
  keys.forEach(k => expect(k.startsWith("fe_mock_r2_")).toBe(true));
  expect(localStorage.getItem("fe_mock_v1_results")).toBe("[]");
  expect(loadAttempt("B").subject).toBe("B");
});

test("第1回の記録がこの端末にあれば、第1回の問題で採点して比較する", () => {
  const r1 = {
    attemptId: "mock-x", createdAt: "2026-10-26T10:00:00+09:00", aborted: false,
    sections: {
      A: { startedAt: "x", answers: Object.fromEntries(QA1.slice(0, 34).map(q => [q.id, q.correct])), flags: {}, perQ: {} },
      B: { startedAt: "x", answers: Object.fromEntries(QB1.slice(0, 8).map(q => [q.id, q.correct])), flags: {}, perQ: {} },
    },
  };
  localStorage.setItem("fe_mock_v1_results", JSON.stringify([r1]));
  const s1 = round1Summary(null);
  expect(s1.A.correct).toBe(34);
  expect(s1.B.correct).toBe(8);
  const a = newAttempt("A", 1, T0);
  a.answers = Object.fromEntries(QA.slice(0, 40).map(q => [q.id, q.correct]));
  finish(a, "user", T0 + MIN);
  const rows = compareRows("A", score(QA, a), s1);
  expect(rows[0].r1).toContain("34／60");
  expect(rows[0].r2).toContain("40／60");
  expect(rows.map(r => r.label)).toEqual(expect.arrayContaining(["合計", "テクノロジ", "マネジメント", "ストラテジ"]));
});

test("第1回の記録がない場合は手入力の値で合計だけ比較する", () => {
  expect(round1Summary(null)).toBeNull();
  const s = round1Summary({ A: 34, B: null });
  expect(s.source).toBe("manual");
  expect(s.A.correct).toBe(34);
  expect(s.B).toBeNull();
});

test("GPT分析用テキスト：時間切れ・未回答・中断再開・回次を区別して出力する", () => {
  const a = newAttempt("B", 1, T0);
  a.answers = { [QB[0].id]: QB[0].correct, [QB[1].id]: "ア" === QB[1].correct ? "イ" : "ア" };
  a.resumes = 2;
  syncOffline(a, T0 + 200 * MIN);
  const { text, S } = buildReport2(a, QB, null, a);
  expect(S.correct).toBe(1);
  expect(S.wrong).toBe(1);
  expect(S.blank).toBe(18);
  expect(text).toContain("模試回次: 第2回");
  expect(text).toContain("時間切れで自動提出");
  expect(text).toContain("中断して再開した回数: 2回");
  expect(text).toContain("時間切れによる未回答を含む");
  expect(text).toContain("【未回答】");
  // 図は構造の文章で出力する(SVG のソースは出さない)
  const { text: ta } = buildReport2(newAttempt("A", 1, T0), QA, null, null);
  expect(ta).toContain("図の構造：");
  expect(ta).not.toContain("<svg");
});
