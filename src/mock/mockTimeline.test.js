import { advance } from "./mockTimeline";
import { newAttempt, stepMs } from "./mockStore";
import { buildReport } from "./mockReport";
import { FIGURE_TEXT } from "./figureText";
import QA from "./mockA.json";
import QB from "./mockB.json";

const MIN = 60 * 1000;
const NOW = Date.parse("2026-10-26T15:00:00+09:00");
const qid = (sub, s) => (sub === "A" ? QA : QB)[s.current].id;
// 科目Aを開始し、A を elapsedA 分まで進めた受験データ
function atA(elapsedA) {
  const a = newAttempt(); a.phase = "A"; a.sections.A.startedAt = "2026-10-26T13:00:00+09:00";
  a.sections.A.elapsedMs = elapsedA * MIN; return a;
}

test("1: A残り10分で30分閉じていた → A自動提出・休憩10分・B10分経過", () => {
  const a = atA(80);
  const ev = advance(a, 30 * MIN, NOW, { offline: true });
  expect(ev).toEqual(["A_timeout", "break_end"]);
  expect(a.phase).toBe("B");
  expect(a.sections.A.elapsedMs).toBe(90 * MIN);
  expect(a.sections.A.submittedBy).toBe("timeout");
  expect(a.brk.elapsedMs).toBe(10 * MIN);
  expect(a.sections.B.elapsedMs).toBe(10 * MIN);
  // 切替え時刻：Aの終了は NOW の20分前、休憩終了＝B開始は NOW の10分前
  expect(Date.parse(a.sections.A.endedAt)).toBe(NOW - 20 * MIN - (NOW % 1000));
  expect(Date.parse(a.sections.B.startedAt)).toBe(NOW - 10 * MIN - (NOW % 1000));
});

test("2: A残り5分で3時間閉じていた → A・休憩・Bをすべて消化して終了（Bも時間切れ）", () => {
  const a = atA(85);
  const ev = advance(a, 180 * MIN, NOW, { offline: true });
  expect(ev).toEqual(["A_timeout", "break_end", "B_timeout"]);
  expect(a.phase).toBe("done");
  expect(a.sections.A.elapsedMs).toBe(90 * MIN);
  expect(a.brk.elapsedMs).toBe(10 * MIN);
  expect(a.sections.B.elapsedMs).toBe(100 * MIN);
  expect(a.sections.B.submittedBy).toBe("timeout");
  // 試験は A開始から 90＋10＋100＝200分で終わる（閉じていても延長されない）
  expect(Date.parse(a.finishedAt)).toBe(NOW - (180 - 115) * MIN - (NOW % 1000));
});

test("3: 休憩3分経過で20分閉じていた → 休憩終了・B13分経過", () => {
  const a = atA(90); a.phase = "break"; a.sections.A.endedAt = "x"; a.sections.A.submittedBy = "user"; a.brk.elapsedMs = 3 * MIN;
  const ev = advance(a, 20 * MIN, NOW, { offline: true });
  expect(ev).toEqual(["break_end"]);
  expect(a.phase).toBe("B");
  expect(a.brk.elapsedMs).toBe(10 * MIN);
  expect(a.sections.B.elapsedMs).toBe(13 * MIN);
  expect(a.sections.A.submittedBy).toBe("user"); // 本人が提出した記録は上書きしない
});

test("4: B残り5分で10分閉じていた → B自動提出", () => {
  const a = atA(90); a.phase = "B"; a.sections.A.endedAt = "x"; a.sections.B.elapsedMs = 95 * MIN;
  const ev = advance(a, 10 * MIN, NOW, { offline: true });
  expect(ev).toEqual(["B_timeout"]);
  expect(a.phase).toBe("done");
  expect(a.sections.B.elapsedMs).toBe(100 * MIN);
});

test("5: 段階内に収まる経過は切替えなし", () => {
  const a = atA(10);
  expect(advance(a, 5 * MIN, NOW, { offline: true })).toEqual([]);
  expect(a.phase).toBe("A"); expect(a.sections.A.elapsedMs).toBe(15 * MIN);
});

test("6: 0や負の経過は何も変えない（端末時刻を戻した場合）", () => {
  const a = atA(10);
  expect(advance(a, 0, NOW)).toEqual([]); expect(advance(a, -60 * MIN, NOW)).toEqual([]);
  expect(a.sections.A.elapsedMs).toBe(10 * MIN);
  expect(stepMs(0, -3600 * 1000)).toBe(0);
});

test("7: 画面を閉じていた時間は設問別の所要時間に入れず、閉じていた時間として記録する", () => {
  const a = atA(10);
  advance(a, 4 * MIN, NOW, { offline: true });
  expect(a.sections.A.perQ).toEqual({});
  expect(a.sections.A.offlineMs).toBe(4 * MIN);
  advance(a, 1000, NOW, { qid });
  expect(a.sections.A.perQ[QA[0].id].ms).toBe(1000);
});

test("8: 画面を開いたままの計測でも、A→休憩→Bへ超過分が繰り越される", () => {
  const a = atA(89);
  const ev = advance(a, 12 * MIN, NOW, { qid });
  expect(ev).toEqual(["A_timeout", "break_end"]);
  expect(a.sections.B.elapsedMs).toBe(1 * MIN);
  expect(a.sections.A.perQ[QA[0].id].ms).toBe(1 * MIN); // A に属する1分だけ
  expect(a.sections.B.perQ[QB[0].id].ms).toBe(1 * MIN);
});

test("9: レポートの図は構造の文章とSVGソースを含み、図中の文字をすべて含む", () => {
  const a = atA(90); a.phase = "done";
  const { text } = buildReport(a, QA, QB);
  const figs = [...QA, ...QB].filter(q => q.body.some(b => b.t === "svg"));
  expect(figs.map(q => q.id).sort()).toEqual(Object.keys(FIGURE_TEXT).sort());
  figs.forEach(q => {
    const st = FIGURE_TEXT[q.id].join("");
    q.body.filter(b => b.t === "svg").forEach(b => {
      expect(text).toContain(b.svg);
      const labels = [...b.svg.matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map(m => m[1].trim()).filter(Boolean);
      labels.forEach(l => {
        // 図の文字（例「装置A 0.9」「A 4日」）の各語が構造の文章にあること
        l.split(/\s+/).map(w => w.replace(/[:：]$/, "")).filter(Boolean).forEach(w => expect([q.id, w, st.includes(w)]).toEqual([q.id, w, true]));
      });
    });
  });
});
