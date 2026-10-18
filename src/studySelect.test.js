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

// ---- 追加改修(再確認期の予約枠・旧履歴遷移) ----
const dueEvents = ids => ids.flatMap((id, i) => [ev(id, false, day(10 + i * 0.01)), ev(id, true, day(6 - i * 0.01))]); // 全て再確認期
const R_ = (n) => (n)
test("R1: 未回答が十分あっても再確認期が復習枠から選ばれる(B3/A10)", () => {
  const evs = [...range(1, 20).map(i => ev(i, false, day(5))), ...dueEvents(range(21, 30))];
  const b3 = run({ events: evs }, 3), a10 = run({ events: evs }, 10);
  expect(kinds(b3)).toEqual({ 復習: 1, 未回答: 1, 再確認: 1 });
  expect(a10.breakdown["未回答"]).toBe(3); expect(a10.breakdown["再確認"]).toBe(1); expect(a10.breakdown["復習"]).toBe(6);
});
test("R2: 誤答の優先順位は維持(最優先の連続誤答は再確認より先)", () => {
  const evs = [ev(1, false, day(3)), ev(1, false, day(2)), ...range(2, 10).map(i => ev(i, false, day(5))), ...dueEvents(range(21, 30))];
  const r = run({ events: evs }, 3);
  expect(r.picks.find(p => p.id === 1).tier).toBe(1);
});
test("R3: 再確認期が多数でも固定されず、順番に巡回する(永久に後回しにしない)", () => {
  const evs = [...range(1, 20).map(i => ev(i, false, day(5))), ...dueEvents(range(21, 30))];
  const seen = new Set(); let shown = { last: {}, lastSession: [] };
  for (let s = 0; s < 12; s++) {
    const r = run({ events: evs, shown, seed: "k" + s }, 3);
    r.picks.forEach(p => { if (p.kind === "再確認") seen.add(p.id); shown.last[p.id] = NOW + s; });
    shown = { last: shown.last, lastSession: r.picks.map(p => p.id) };
  }
  expect(seen.size).toBeGreaterThanOrEqual(10);
});
test("R4: 再確認待ち(間隔内)は出さない / 未回答枠は維持 / 直前セッション抑制を維持", () => {
  const waiting = range(21, 30).flatMap(id => [ev(id, false, day(2)), ev(id, true, day(0.3))]);
  const evs = [...range(1, 20).map(i => ev(i, false, day(5))), ...waiting];
  const r = run({ events: evs }, 10);
  expect(r.picks.filter(p => p.id >= 21 && p.id <= 30)).toHaveLength(0);
  expect(r.breakdown["未回答"]).toBe(3);
  const d = dueEvents(range(21, 30));
  const r1 = run({ events: [...range(1, 20).map(i => ev(i, false, day(5))), ...d] }, 3);
  const r2 = run({ events: [...range(1, 20).map(i => ev(i, false, day(5))), ...d], shown: { lastSession: r1.picks.map(p => p.id), last: {} }, seed: "z" }, 3);
  expect(r2.picks.filter(p => r1.picks.some(q => q.id === p.id))).toHaveLength(0);
  expect(new Set(r2.picks.map(p => p.id)).size).toBe(r2.picks.length);
});
test("L1: 旧履歴のみ → 新しい回答で最新回答に基づく状態へ移行(正解/誤答/待ち/期/保留)", () => {
  const st = (events, legacy, flags = {}) => computeStatuses({ ids: [1], events, legacy, flags, settings: { recheckDays: 2 }, now: NOW }).get(1);
  const lw = { wrong: [1], correct: [] }, lc = { wrong: [], correct: [1] }, lwc = { wrong: [1], correct: [1] };
  expect(st([], lw).state).toBe("review");                                   // 旧誤答のみ
  expect(st([ev(1, true, day(0.5))], lw).state).toBe("waiting");              // 旧誤答 + 新正解(間隔内)
  expect(st([ev(1, true, day(3))], lw).state).toBe("due");                    // 旧誤答 + 新正解(2日経過)
  expect(st([ev(1, false, day(0.5))], lw)).toMatchObject({ state: "review", tier: 3 }); // 旧誤答 + 新誤答
  expect(st([ev(1, false, day(0.5))], lc)).toMatchObject({ state: "review", tier: 2 }); // 旧正解 + 新誤答 = 正解後の誤答
  expect(st([ev(1, true, day(0.5))], lc).state).toBe("settled");              // 旧正解 + 新正解
  expect(st([ev(1, true, day(0.5))], lwc).state).toBe("waiting");             // 旧誤答/正解 + 新正解
  expect(st([ev(1, false, day(2)), ev(1, false, day(1))], lc)).toMatchObject({ state: "review", tier: 1 });
  expect(st([ev(1, true, day(0.5))], lw, { 1: { flag: "hold" } }).state).toBe("hold"); // 手動保留
  expect(st([ev(1, true, day(0.5))], lw, {}).state).not.toBe("hold");        // 保留解除で戻る
});
test("L2: 状態計算・選出は履歴を改変しない", () => {
  startLogSession("B");
  logAnswer("B", { question_id: 1, selected_choice: "ア", is_correct: false, mode: "weak" });
  localStorage.setItem("feb_missed", JSON.stringify([{ id: 2 }]));
  const before = JSON.stringify({ l: loadLog("B"), m: localStorage.getItem("feb_missed") });
  const qs = range(1, 5).map(id => ({ id, cat: "x" }));
  recordShown("B", planStudy("B", qs, "すべて"));
  expect(JSON.stringify({ l: loadLog("B"), m: localStorage.getItem("feb_missed") })).toBe(before);
});

// ---- 独立レビュー指摘への対応 ----
const settledEv = id => ev(id, true, day(20));                                       // 正解のみ(誤答歴なし)=settled
const waitingEv = (id, d = 0.5) => [ev(id, false, day(d + 3)), ev(id, true, day(d))]; // 誤答歴+最新正解が間隔内=waiting
const waitingIds = r => r.picks.filter(p => p.state === "waiting").map(p => p.id);

test("W1: 補充は settled を優先し、waiting は出さない", () => {
  const evs = [...[1, 2, 3].map(settledEv), ...[4, 5, 6].flatMap(id => waitingEv(id))];
  // settled は最近出題済み(最終出題が waiting より新しい)でも、waiting より先に補充される
  const r = run({ ids: range(1, 6), events: evs, shown: { last: { 1: NOW, 2: NOW, 3: NOW }, lastSession: [] } }, 3);
  expect(r.picks.map(p => p.id).sort()).toEqual([1, 2, 3]);
  expect(waitingIds(r)).toHaveLength(0);
});
test("W2: 直前セッションに出した settled でも、waiting より先に再提示される", () => {
  const evs = [...[1, 2, 3].map(settledEv), ...[4, 5, 6].flatMap(id => waitingEv(id))];
  const r = run({ ids: range(1, 6), events: evs, shown: { lastSession: [1, 2, 3], last: {} } }, 3);
  expect(r.picks.map(p => p.id).sort()).toEqual([1, 2, 3]);
});
test("W3: 他に候補が無いときだけ waiting を最後の補充にし、理由と注意を明示、重複なし", () => {
  const evs = [settledEv(1), ...[2, 3, 4].flatMap(id => waitingEv(id))];
  const r = run({ ids: range(1, 4), events: evs }, 3);
  expect(r.picks).toHaveLength(3);
  expect(new Set(r.picks.map(p => p.id)).size).toBe(3);
  expect(r.picks.find(p => p.id === 1).state).toBe("settled");
  const w = r.picks.filter(p => p.state === "waiting");
  expect(w).toHaveLength(2);
  w.forEach(p => expect(p.reason).toMatch(/再確認期間内/));
  expect(r.notes.join()).toMatch(/再確認期間内/);
});
test("W4: waiting を含まない通常の選出では注意表示が出ない", () => {
  const r = run({ events: manyWrong }, 10);
  expect(r.notes.join()).not.toMatch(/再確認期間内/);
});

// 優先順位(階層)と予約枠(再確認期)は別の仕組みとして検証する。選出内容は picks の kind/tier で判定し、表示順(ランダム)には依存しない。
const tierEv = (id, t) => t === 1 ? [ev(id, false, day(6)), ev(id, false, day(5))]
  : t === 2 ? [ev(id, true, day(6)), ev(id, false, day(5))] : [ev(id, false, day(5))];
const mixedEvents = () => [
  ...[1, 2].flatMap(id => tierEv(id, 1)), ...[3, 4].flatMap(id => tierEv(id, 2)), ...range(5, 14).flatMap(id => tierEv(id, 3)),
  ...dueEvents([21, 22, 23]),
];
test("P1: 階層優先(1>2>3)は復習枠の中で守られる(A10: 復習6=階層1×2,階層2×2,階層3×2)", () => {
  for (const seed of ["a", "b", "c", "d", "e"]) { // 表示順(seed依存)が変わっても選出内容は同じ
    const r = run({ events: mixedEvents(), seed }, 10);
    const rev = r.picks.filter(p => p.kind === "復習");
    const byTier = t => rev.filter(p => p.tier === t).length;
    expect([byTier(1), byTier(2), byTier(3)]).toEqual([2, 2, 2]);
    expect(rev.filter(p => p.tier === 1).map(p => p.id).sort()).toEqual([1, 2]);
    expect(rev.filter(p => p.tier === 2).map(p => p.id).sort()).toEqual([3, 4]);
  }
});
test("P2: 予約枠は階層とは別枠(A10: 再確認1・未回答3・復習6、合計10)", () => {
  const r = run({ events: mixedEvents() }, 10);
  expect(r.breakdown).toEqual({ 復習: 6, 未回答: 3, 再確認: 1 });
  expect(r.picks.filter(p => p.kind === "再確認").every(p => [21, 22, 23].includes(p.id))).toBe(true);
});
test("P3: B3(復習枠2) = 階層1の1問 + 再確認1問 + 未回答1問。階層2・3は予約枠に負けて出ない", () => {
  const r = run({ events: mixedEvents() }, 3);
  expect(r.breakdown).toEqual({ 復習: 1, 未回答: 1, 再確認: 1 });
  const rev = r.picks.find(p => p.kind === "復習");
  expect(rev.tier).toBe(1);
});
test("P4: 再確認期が無ければ予約枠は使われず、復習枠は全て階層順で埋まる", () => {
  const evs = mixedEvents().filter(e => e.question_id < 21);
  const r = run({ events: evs }, 10);
  expect(r.breakdown).toEqual({ 復習: 7, 未回答: 3, 再確認: 0 });
  expect(r.picks.filter(p => p.kind === "復習" && p.tier <= 2)).toHaveLength(4);
});
test("P5: 未回答の最低枠は階層・予約枠より優先して確保される", () => {
  const r = run({ events: mixedEvents() }, 3);
  expect(r.breakdown["未回答"]).toBe(1);
});
