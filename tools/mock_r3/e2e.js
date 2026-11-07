// 第3回模試の動作テスト(Chromium)。PC 幅と iPad 幅(820×1180、縦)・iPad 横(1180×820)で表示し、
// 操作・保存・再開・時間切れ・採点・再受験・第1回/第2回への影響・表示(図・表・コード・横はみ出し)を確認する。
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5056";
const R = "/home/claude/fe-quiz/src/mock/";
const QA = require(R + "r3/mockA3.json"), QB = require(R + "r3/mockB3.json"), QA2 = require(R + "r2/mockA2.json");
const log = [];
const ok = (c, m) => { log.push((c ? "OK  " : "NG  ") + m); if (!c) process.exitCode = 1; };
const r1 = JSON.stringify([{ format: "fe-mock-attempt-v1", attemptId: "mock-r1test", createdAt: "2026-10-26T10:00:00+09:00", phase: "done", aborted: false, sections: { A: { startedAt: "2026-10-26T10:00:00+09:00", endedAt: "x", elapsedMs: 1, limitMs: 1, answers: {}, flags: {}, perQ: {}, current: 0, submittedBy: "user" }, B: { startedAt: "2026-10-26T12:00:00+09:00", endedAt: "x", elapsedMs: 1, limitMs: 1, answers: {}, flags: {}, perQ: {}, current: 0, submittedBy: "user" } }, brk: { elapsedMs: 0 } }]);
const r2 = JSON.stringify([{ format: "fe-mock-r2-attempt-v1", round: 2, subject: "A", attemptNo: 1, attemptId: "mock2-A-t", startedAt: "2026-11-07T10:00:00+09:00", endedAt: "2026-11-07T11:30:00+09:00", submittedBy: "timeout", elapsedMs: 5400000, limitMs: 5400000, offlineMs: 0, resumes: 0, flags: {}, perQ: {}, answers: Object.fromEntries(QA2.slice(0, 33).map(q => [q.id, q.correct])) }]);
const FIG_A = QA.filter(q => q.body.some(b => b.t === "svg" || b.t === "table")).map(q => q.id);

(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [["pc", { width: 1280, height: 900 }], ["ipad", { width: 820, height: 1180 }], ["ipadL", { width: 1180, height: 820 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: name === "pc" ? 1 : 2, hasTouch: name !== "pc" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|fonts\.g/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE + "/mock");
    await page.evaluate(([a, b]) => { localStorage.clear(); localStorage.setItem("fe_mock_v1_results", a); localStorage.setItem("fe_mock_r2_results", b); localStorage.setItem("fe_alog_v1", "[\"keep\"]"); }, [r1, r2]);
    await page.reload();
    await page.getByRole("button", { name: "第3回を開く" }).click();
    await page.getByText("本番形式に準拠したオリジナル模擬試験　第3回").first().waitFor();
    ok(await page.getByText("この端末の第2回の初回 33／60").first().isVisible(), `${name}: 第2回の記録(33/60)を読み取って表示`);
    const home = await page.content();
    ok(!QA.some(q => home.includes(q.explanation.slice(0, 30))), `${name}: 受験前の画面に解説・正解を表示しない`);
    await page.screenshot({ path: `${OUT}/${name}_01_home.png`, fullPage: true });
    // 科目A
    await page.getByRole("button", { name: "科目Aを開始する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
    await page.getByText("問1／60").first().waitFor();
    const opt = lab => page.locator(".m2-choice").filter({ hasText: new RegExp("^" + lab) });
    await opt(QA[0].correct).click();
    await page.getByRole("button", { name: "次へ ▶" }).click();
    const wrong2 = ["ア", "イ", "ウ", "エ"].find(l => l !== QA[1].correct);
    await opt(wrong2).click();
    await page.getByRole("button", { name: "次へ ▶" }).click();
    await page.getByRole("button", { name: "☆ 見直しフラグ" }).click();
    // 図・表のある問題を表示して保存、横はみ出しを確認
    for (const id of FIG_A) {
      const i = QA.findIndex(q => q.id === id);
      await page.getByRole("button", { name: "設問一覧" }).click();
      await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^問${i + 1} `) }).click();
      await page.getByText(`問${i + 1}／60`).first().waitFor();
      const q = QA[i];
      const nsvg = q.body.filter(b => b.t === "svg").length, ntab = q.body.filter(b => b.t === "table").length;
      const m = await page.evaluate(() => ({ svg: document.querySelectorAll(".m2-card .m2-fig svg").length, tab: document.querySelectorAll(".m2-card .m2-table:not(.m2-ct)").length, h: document.documentElement.scrollWidth > window.innerWidth,
        svgW: [...document.querySelectorAll(".m2-fig svg")].map(s => s.getBoundingClientRect().width) }));
      ok(m.svg === nsvg && m.tab >= ntab && !m.h && m.svgW.every(w => w >= 300), `${name}: ${id} 図${nsvg}・表${ntab}を表示、横はみ出しなし（図の幅 ${m.svgW.map(Math.round).join(",")}）`);
      if (name !== "ipadL") await page.screenshot({ path: `${OUT}/${name}_A_${id}.png`, fullPage: true });
    }
    // 文字の大きさ(本文・選択肢・コード)
    const fs_ = await page.evaluate(() => ({ p: parseFloat(getComputedStyle(document.querySelector(".m2-q p")).fontSize), c: parseFloat(getComputedStyle(document.querySelector(".m2-choice")).fontSize) }));
    ok(fs_.p >= 16 && fs_.c >= 16, `${name}: 本文 ${fs_.p}px・選択肢 ${fs_.c}px`);
    // 再読込み → 再開
    await page.waitForTimeout(1200);
    await page.reload();
    ok(await page.getByText("科目Aの受験途中の記録があります").first().isVisible(), `${name}: 選択画面に第3回の受験途中を表示`);
    await page.getByRole("button", { name: "第3回を開く" }).click();
    await page.getByRole("button", { name: "続きから再開する" }).click();
    const att = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r3_attempt_A")));
    ok(att.resumes === 1 && att.answers[QA[0].id] === QA[0].correct && att.answers[QA[1].id] === wrong2 && att.flags[QA[2].id] && att.round === 3, `${name}: 解答・見直し・再開回数を保存`);
    // 中断 → 100分経過で時間切れ
    await page.getByRole("button", { name: "中断" }).click();
    await page.getByRole("button", { name: "中断してトップへ" }).click();
    await page.addInitScript(() => {
      if (sessionStorage.getItem("shifted")) return;
      const a = JSON.parse(localStorage.getItem("fe_mock_r3_attempt_A") || "null");
      if (a) { a.lastWall -= 100 * 60 * 1000; localStorage.setItem("fe_mock_r3_attempt_A", JSON.stringify(a)); sessionStorage.setItem("shifted", "1"); }
    });
    await page.reload();
    await page.getByRole("button", { name: "第3回を開く" }).click();
    await page.getByRole("button", { name: "初回の結果" }).click();
    const res = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r3_results") || "[]"));
    ok(res.length === 1 && res[0].submittedBy === "timeout" && res[0].elapsedMs === 90 * 60000, `${name}: 時間切れで自動提出（経過90分）`);
    ok((await page.locator(".m2-big").innerText()) === "正解 1／60", `${name}: 採点（正解1・誤答1）`);
    ok(await page.getByText("33／60（55.0％）").first().isVisible(), `${name}: 第2回(33/60)との比較`);
    const txt = await page.locator("textarea.m2-rep").inputValue();
    ok(txt.includes("模試回次: 第3回") && txt.includes("時間切れで自動提出") && txt.includes("中断して再開した回数: 1回") && txt.includes("第2回 33／60") && txt.includes("〔図：") && txt.includes("```"), `${name}: GPT分析用テキスト（回次・時間切れ・再開・比較・図の構造・コード）`);
    // 解説の追跡表(M3A08)を開く
    await page.locator("button.m2-choice").filter({ hasText: QA[7].topic }).click();
    ok(await page.getByText("追跡表").first().isVisible(), `${name}: 結果画面に解説の追跡表を表示`);
    await page.screenshot({ path: `${OUT}/${name}_02_resultA.png`, fullPage: true });
    await page.getByRole("button", { name: "第3回のトップへ" }).click();
    // 再受験
    await page.getByRole("button", { name: "再受験する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
    await opt(QA[0].correct).click();
    await page.getByRole("button", { name: "提出" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "提出する" }).click();
    await page.getByText("2回目（再受験）").first().waitFor();
    ok(await page.getByText(/第3回の初回：1／60/).first().isVisible(), `${name}: 再受験で初回が残る`);
    await page.getByRole("button", { name: "第3回のトップへ" }).click();
    // 科目B：全問表示、10問正解
    await page.getByRole("button", { name: "科目Bを開始する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
    for (let i = 0; i < QB.length; i++) {
      const q = QB[i];
      if (i > 0) { await page.getByRole("button", { name: "次へ ▶" }).click(); await page.getByText(`問${i + 1}／20`).first().waitFor(); }
      const m = await page.evaluate(() => ({ h: document.documentElement.scrollWidth > window.innerWidth,
        pre: [...document.querySelectorAll(".m2-code pre")].map(p => ({ lines: p.textContent.split("\n").length, fs: parseFloat(getComputedStyle(p).fontSize), ws: getComputedStyle(p).whiteSpace })),
        ct: document.querySelectorAll(".m2-ct tbody tr").length, ch: document.querySelectorAll(".m2-choice").length }));
      const codeLines = q.body.filter(b => b.t === "code").map(b => b.text.split("\n").length);
      ok(!m.h && JSON.stringify(m.pre.map(p => p.lines)) === JSON.stringify(codeLines) && m.pre.every(p => p.fs >= 14 && p.ws === "pre") && (m.ct + m.ch) === q.choices.length,
        `${name}: ${q.id} コード${codeLines.length}個の改行を保持・解答群${q.choices.length}件・横はみ出しなし`);
      if (name !== "ipadL") await page.screenshot({ path: `${OUT}/${name}_B_${q.id}.png`, fullPage: true });
      if (i < 10) {
        if (q.choice_header) await page.locator(".m2-ct tbody tr").nth(q.choices.findIndex(c => c.label === q.correct)).click();
        else await opt(q.correct).click();
      }
    }
    await page.getByRole("button", { name: "提出" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "提出する" }).click();
    await page.getByText("第3回 科目Bの結果").first().waitFor();
    ok((await page.locator(".m2-big").innerText()) === "正解 10／20", `${name}: 科目Bの採点（10問正解）`);
    await page.screenshot({ path: `${OUT}/${name}_03_resultB.png`, fullPage: true });
    // 第1回・第2回・通常学習のデータは変わらない、第2回・第1回の画面が開く
    const after = await page.evaluate(() => ({ r1: localStorage.getItem("fe_mock_v1_results"), r2: localStorage.getItem("fe_mock_r2_results"), alog: localStorage.getItem("fe_alog_v1"), keys: Object.keys(localStorage) }));
    ok(after.r1 === r1 && after.r2 === r2 && after.alog === "[\"keep\"]", `${name}: 第1回・第2回・通常学習のデータは変更なし`);
    ok(after.keys.every(k => ["fe_mock_v1_results", "fe_mock_r2_results", "fe_alog_v1"].includes(k) || k.startsWith("fe_mock_r3_")), `${name}: 第3回が書き込んだキーは fe_mock_r3_ だけ`);
    await page.goto(BASE + "/mock");
    await page.getByRole("button", { name: "第2回を開く" }).click();
    await page.getByText("本番形式に準拠したオリジナル模擬試験　第2回").first().waitFor({ timeout: 8000 }).catch(() => {});
    ok(await page.getByText("本番形式に準拠したオリジナル模擬試験　第2回").first().isVisible() && await page.getByText(/33／60/).first().isVisible(), `${name}: 第2回の画面と受験記録が従来どおり`);
    await page.screenshot({ path: `${OUT}/${name}_04_round2.png`, fullPage: true });
    await page.goto(BASE + "/mock");
    await page.getByRole("button", { name: "第1回を開く" }).click();
    await page.getByRole("button", { name: "科目Aを開始する" }).waitFor({ timeout: 8000 }).catch(() => {});
    ok(await page.getByRole("button", { name: "科目Aを開始する" }).isVisible(), `${name}: 第1回の画面が開く`);
    await page.screenshot({ path: `${OUT}/${name}_04_round1.png` });
    ok(errors.length === 0, `${name}: コンソールエラーなし ${errors.slice(0, 3).join(" / ")}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + "/out/e2e.log", log.join("\n") + "\n");
  console.log(log.filter(l => l.startsWith("NG")).join("\n") || "all OK", log.length);
})().catch(e => { console.error(e); process.exit(1); });
