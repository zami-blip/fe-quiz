import { selectSession, computeStatuses } from "./studySelect";
import { planStudy, recordShown, setFlag, loadFlags, refreshLegacy, loadLegacy, loadShown } from "./studyStore";
import { logAnswer, startLogSession, loadLog, readForExport } from "./answerLog";
import { buildReport } from "./gptExport";

const NOW = Date.parse("2026-10-18T12:00:00+09:00");
const day = n => new Date(NOW - n * 86400000).toISOString();
let eid = 0;
const ev = (id, ok, at) => ({ event_id: "e" + (eid++), subject: "B", question_id: id, answered_at: at, is_correct: ok, mode: "weak", session_id: "s" });
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const run = (o, size) => selectSession({ ids: range(1, 40), events: [], legacy: {}, flags: {}, settings: { size, recheckDays: 2 }, shown: {}, now: NOW, seed: "t", ...o });
const kinds = r => r.breakdown;

// 回答履歴の作成: id1-20 は誤答(単発)、他は未回答
const manyWrong = range(1, 20).map(i => ev(i, false, day(5)));

beforeEach(() => { localStorage.clear(); });

test("1: B3 → 復習2/未回答1", () => { const r = run({ events: manyWrong }, 3); expect(kinds(r)).toEqual({ 復習: 2, 未回答: 1, 再確認: 0 }); });
test("2: A10 → 復習7/未回答3", () => { const r = run({ events: manyWrong }, 10); expect(kinds(r)).toEqual({ 復習: 7, 未回答: 3, 再確認: 0 }); });
test("3: 連続誤答2回以上が最優先", () => {
  const evs = [...manyWrong, ev(30, false, day(4)), ev(30, false, day(3)), ev(31, true, day(9)), ev(31, false, day(8))];
  const r = selectSession({ ids: range(1, 40), events: evs, legacy: {}, flags: {}, settings: { size: 3 }, shown: {}, now: NOW, seed: "x" });
  const rev = r.picks.filter(p => p.kind === "復習");
  expect(rev.map(p => p.id)).toContain(30);
  expect(rev.find(p => p.id === 30).tier).toBe(1);
  // 優先度1 → 2 → 3 の順に枠を使う(復習2枠: 30(1), 31(2))
  expect(rev.map(p => p.id).sort()).toEqual([30, 31]);
});
test("4: 誤答→最新正解は即時リピートしない(再確認待ち)", () => {
  const evs = [ev(1, false, day(3)), ev(1, true, day(0.5))];
  const st = computeStatuses({ ids: [1], events: evs, legacy: {}, flags: {}, settings: { recheckDays: 2 }, now: NOW });
  expect(st.get(1).state).toBe("waiting");
  const r = run({ ids: [1, 2, 3, 4], events: evs }, 3);
  expect(r.picks.filter(p => p.id === 1 && p.kind === "復習")).toHaveLength(0);
  // 2日経過で再確認期、最新が誤答に戻れば復習候補
  const st2 = computeStatuses({ ids: [1], events: [ev(1, false, day(4)), ev(1, true, day(2.1))], legacy: {}, flags: {}, settings: { recheckDays: 2 }, now: NOW });
  expect(st2.get(1).state).toBe("due");
  const st3 = computeStatuses({ ids: [1], events: [...evs, ev(1, false, day(0.1))], legacy: {}, flags: {}, settings: {}, now: NOW });
  expect(st3.get(1).state).toBe("review");
});
test("5: 正解後の誤答は優先度2", () => {
  const st = computeStatuses({ ids: [1], events: [ev(1, true, day(5)), ev(1, false, day(1))], legacy: {}, flags: {}, settings: {}, now: NOW });
  expect(st.get(1)).toMatchObject({ state: "review", tier: 2 });
});
test("5b: 日時欠損・同値でも最新回答は配列順で安全に決まる", () => {
  const e1 = ev(1, true, "invalid"), e2 = ev(1, false, "invalid");
  const st = computeStatuses({ ids: [1], events: [e1, e2], legacy: {}, flags: {}, settings: {}, now: NOW });
  expect(st.get(1).state).toBe("review");
  const same = day(1);
  const st2 = computeStatuses({ ids: [1], events: [ev(1, false, same), ev(1, true, same)], legacy: {}, flags: {}, settings: {}, now: NOW });
  expect(st2.get(1).state).not.toBe("review");
});
test("6: 未回答ゼロ・誤答ゼロ・候補不足でクラッシュしない", () => {
  const allAns = range(1, 40).map(i => ev(i, true, day(10)));
  expect(() => run({ events: allAns }, 3)).not.toThrow();
  expect(run({ events: allAns }, 3).picks).toHaveLength(3); // 要再確認から補充
  const noWrong = run({}, 10); expect(kinds(noWrong)).toEqual({ 復習: 0, 未回答: 10, 再確認: 0 });
  const few = run({ ids: [1, 2], events: [] }, 3);
  expect(few.picks).toHaveLength(2); expect(few.shortage).toBe(1); expect(few.notes.length).toBeGreaterThan(0);
  expect(run({ ids: [] }, 3).picks).toHaveLength(0);
});
test("7: 同一セッション内の重複なし", () => {
  for (let s = 0; s < 30; s++) {
    const r = run({ events: manyWrong, seed: "s" + s }, 10);
    expect(new Set(r.picks.map(p => p.id)).size).toBe(r.picks.length);
  }
});
test("8: 直後のセッションで直前の問題を不必要に再提示しない", () => {
  const r1 = run({ events: manyWrong }, 10);
  const r2 = run({ events: manyWrong, shown: { last: Object.fromEntries(r1.picks.map(p => [p.id, NOW])), lastSession: r1.picks.map(p => p.id) }, seed: "n" }, 10);
  const a = new Set(r1.picks.map(p => p.id));
  expect(r2.picks.filter(p => a.has(p.id))).toHaveLength(0);
  // 候補が少なければ再提示を許し、その旨を表示
  const r3 = run({ ids: range(1, 4), events: [], shown: { lastSession: [1, 2, 3, 4] } }, 3);
  expect(r3.picks).toHaveLength(3); expect(r3.notes.join()).toMatch(/直前/);
});
test("9: AとBは混ざらない(別キー・別ログ)", () => {
  startLogSession("A"); startLogSession("B");
  logAnswer("A", { question_id: 5, selected_choice: "ア", is_correct: false, mode: "weak" });
  expect(loadLog("B")).toHaveLength(0); expect(loadLog("A")).toHaveLength(1);
  setFlag("A", 5, "hold"); expect(loadFlags("B")).toEqual({});
  const qs = range(1, 10).map(id => ({ id, cat: "x" }));
  const pa = planStudy("A", qs, "すべて"), pb = planStudy("B", qs, "すべて");
  expect(pa.picks.some(p => p.id === 5)).toBe(false); // Aで保留
  expect(pb.counts.hold).toBe(0); expect(pa.counts.hold).toBe(1);
});
test("10: 再読み込み後も状態が残る(localStorage経由)", () => {
  const qs = range(1, 10).map(id => ({ id, cat: "x" }));
  startLogSession("B");
  logAnswer("B", { question_id: 2, selected_choice: "ア", is_correct: false, mode: "weak" });
  setFlag("B", 3, "weak");
  const plan = planStudy("B", qs, "すべて"); recordShown("B", plan);
  const snap = { ...localStorage };
  const restored = JSON.parse(JSON.stringify(snap));
  localStorage.clear(); Object.entries(restored).forEach(([k, v]) => localStorage.setItem(k, v));
  expect(loadLog("B")).toHaveLength(1); expect(loadFlags("B")[3].flag).toBe("weak");
  expect(loadShown("B").lastSession).toEqual(plan.picks.map(p => p.id));
});
test("11: 復習リストをクリアしても履歴と誤答経験が残る", () => {
  localStorage.setItem("feb_missed", JSON.stringify([{ id: 7 }]));
  localStorage.setItem("feb_cycle", JSON.stringify({ history: [{ id: 8, correct: true }, { id: 9, correct: false }] }));
  refreshLegacy("B");
  localStorage.setItem("feb_missed", "[]"); // clearMissed と同じ操作
  const l = loadLegacy("B");
  expect(l.wrong).toEqual(expect.arrayContaining([7, 9])); expect(l.correct).toContain(8);
  expect(readForExport("B").missedIds).toContain(7); // GPTレポート入力にも残る
  const st = computeStatuses({ ids: [7, 8, 9], events: [], legacy: l, flags: {}, settings: {}, now: NOW });
  expect(st.get(7).state).toBe("review"); expect(st.get(8).state).toBe("settled");
});
test("13: GPT分析レポートが生成できる", () => {
  const q = [{ id: 1, cat: "c", topic: "t", q: "?", choices: [{ label: "ア", text: "a" }], correct: "ア", hint: "h" }];
  const log = [{ ...ev(1, false, day(1)), mode: "normal", cycle_id: "c1", selected_choice: "ア" }];
  const rep = buildReport({ subject: "B", questions: q, log, cycleHistory: [], missedIds: [1], currentCycleId: "c1", scope: "wrong", range: "all" });
  expect(JSON.stringify(rep).length).toBeGreaterThan(50);
});
test("手動の保留は出題から除外され、解除で戻る(履歴は残る)", () => {
  const qs = [{ id: 1, cat: "x" }, { id: 2, cat: "x" }];
  setFlag("B", 1, "hold");
  expect(planStudy("B", qs, "すべて").picks.map(p => p.id)).toEqual([2]);
  setFlag("B", 1, null);
  expect(planStudy("B", qs, "すべて").picks).toHaveLength(2);
});
