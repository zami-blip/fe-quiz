// 第2回模試の動作テスト(Chromium)。PC 幅と iPad 幅で表示し、操作・保存・再開・時間切れ・採点・再受験・第1回への影響を確認する。
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5055";
const QA = require("/home/claude/fe-quiz/src/mock/r2/mockA2.json");
const QB = require("/home/claude/fe-quiz/src/mock/r2/mockB2.json");
const QA1 = require("/home/claude/fe-quiz/src/mock/mockA.json");
const QB1 = require("/home/claude/fe-quiz/src/mock/mockB.json");
const log = [];
const ok = (c, m) => { log.push((c ? "OK  " : "NG  ") + m); if (!c) process.exitCode = 1; };

// 第1回の受験記録(34/60・8/20)を事前に入れておき、第2回の操作で変わらないことを確かめる
const r1 = {
  format: "fe-mock-attempt-v1", attemptId: "mock-r1test", createdAt: "2026-10-26T10:00:00+09:00", phase: "done", aborted: false,
  sections: {
    A: { startedAt: "2026-10-26T10:00:00+09:00", endedAt: "x", elapsedMs: 1, limitMs: 1, answers: Object.fromEntries(QA1.slice(0, 34).map(q => [q.id, q.correct])), flags: {}, perQ: {}, current: 0, submittedBy: "user" },
    B: { startedAt: "2026-10-26T12:00:00+09:00", endedAt: "x", elapsedMs: 1, limitMs: 1, answers: Object.fromEntries(QB1.slice(0, 8).map(q => [q.id, q.correct])), flags: {}, perQ: {}, current: 0, submittedBy: "user" },
  },
  brk: { elapsedMs: 0 },
};
const R1JSON = JSON.stringify([r1]);

(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [["pc", { width: 1280, height: 900 }], ["ipad", { width: 820, height: 1180 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text())) errors.push(m.text()); });
    await page.goto(BASE + "/mock");
    await page.evaluate(v => { localStorage.clear(); localStorage.setItem("fe_mock_v1_results", v); localStorage.setItem("fe_alog_v1", "[\"keep\"]"); }, R1JSON);
    await page.reload();
    await page.getByRole("button", { name: "第2回を開く" }).click();
    await page.getByText("本番形式に準拠したオリジナル模擬試験　第2回").first().waitFor();
    ok(await page.getByText("この端末の第1回の記録").first().isVisible(), `${name}: 第1回の記録を読み取って表示`);
    await page.screenshot({ path: `${OUT}/${name}_01_home.png`, fullPage: true });

    // 科目Aを開始
    await page.getByRole("button", { name: "科目Aを開始する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
    await page.getByText("問1／60").first().waitFor();
    const opt = (lab) => page.locator(".m2-choice").filter({ hasText: new RegExp("^" + lab) });
    await opt(QA[0].correct).click();
    await page.getByRole("button", { name: "次へ ▶" }).click();
    const wrong2 = ["ア", "イ", "ウ", "エ"].find(l => l !== QA[1].correct);
    await opt(wrong2).click();
    await page.getByRole("button", { name: "次へ ▶" }).click();
    await page.getByRole("button", { name: "☆ 見直しフラグ" }).click();
    ok(await page.locator(".m2-fig svg").count() === 1, `${name}: 問3(M2A03)の図を表示`);
    await page.screenshot({ path: `${OUT}/${name}_02_A03_figure.png`, fullPage: true });
    // 図・表のある問題を表示して保存
    for (const id of ["M2A07", "M2A08", "M2A15", "M2A22", "M2A23", "M2A38", "M2A39", "M2M03", "M2S04"]) {
      const i = QA.findIndex(q => q.id === id);
      await page.getByRole("button", { name: "設問一覧" }).click();
      await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^問${i + 1} `) }).click();
      await page.getByText(`問${i + 1}／60`).first().waitFor();
      await page.screenshot({ path: `${OUT}/${name}_A_${id}.png`, fullPage: true });
    }
    // 設問一覧の見直しフィルタ
    await page.getByRole("button", { name: "設問一覧" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "見直し", exact: true }).click();
    ok(await page.locator(".m2-cell").count() === 1, `${name}: 見直しフラグの絞込み(1問)`);
    await page.screenshot({ path: `${OUT}/${name}_03_list.png` });
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();

    // 再読込み → 続きから再開
    await page.waitForTimeout(1200);
    await page.reload();
    ok(await page.getByText("科目Aの受験途中の記録があります").first().isVisible(), `${name}: 選択画面に受験途中を表示`);
    await page.getByRole("button", { name: "第2回を開く" }).click();
    await page.locator(".m2-pill.run").waitFor();
    ok(await page.locator(".m2-pill.run").innerText() === "受験中", `${name}: 科目Aが受験中`);
    await page.getByRole("button", { name: "続きから再開する" }).click();
    await page.getByRole("button", { name: "設問一覧" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^問1 / }).click();
    ok(await page.locator(".m2-choice.sel").innerText().then(t => t.startsWith(QA[0].correct)), `${name}: 再読込み後も問1の解答が残る`);
    const att = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r2_attempt_A")));
    ok(att.resumes === 1 && att.answers[QA[1].id] === wrong2 && att.flags[QA[2].id], `${name}: 解答・見直し・再開回数を保存`);

    // 中断してトップへ → 閉じている間に100分経過したことにして再読込み → 時間切れで自動提出
    await page.getByRole("button", { name: "中断" }).click();
    await page.getByRole("button", { name: "中断してトップへ" }).click();
    // 再読込みの直前に画面側が lastWall を保存するので、読込み時(アプリの実行前)に100分前へずらす
    await page.addInitScript(() => {
      if (sessionStorage.getItem("shifted")) return;
      const a = JSON.parse(localStorage.getItem("fe_mock_r2_attempt_A") || "null");
      if (a) { a.lastWall -= 100 * 60 * 1000; localStorage.setItem("fe_mock_r2_attempt_A", JSON.stringify(a)); sessionStorage.setItem("shifted", "1"); }
    });
    await page.reload();
    await page.getByRole("button", { name: "第2回を開く" }).click();
    await page.getByRole("button", { name: "初回の結果" }).waitFor();
    const res = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r2_results") || "[]"));
    ok(res.length === 1 && res[0].submittedBy === "timeout" && res[0].elapsedMs === 90 * 60000, `${name}: 閉じている間に時間切れ→自動提出（経過90分）`);
    ok(await page.evaluate(() => localStorage.getItem("fe_mock_r2_attempt_A")) === null, `${name}: 提出後は受験中のデータを消す`);
    await page.getByRole("button", { name: "初回の結果" }).click();
    ok((await page.locator(".m2-big").innerText()) === "正解 1／60", `${name}: 採点（正解1・誤答1）`);
    ok(await page.getByText("34／60").first().isVisible(), `${name}: 第1回(34/60)との比較を表示`);
    const txt = await page.locator("textarea.m2-rep").inputValue();
    ok(txt.includes("模試回次: 第2回") && txt.includes("時間切れで自動提出") && txt.includes("中断して再開した回数: 1回") && txt.includes("第1回 34／60"), `${name}: GPT分析用テキストに回次・時間切れ・再開・比較`);
    await page.locator("button.m2-choice").filter({ hasText: QA[1].topic }).click();
    await page.screenshot({ path: `${OUT}/${name}_04_resultA.png`, fullPage: true });
    await page.getByRole("button", { name: "第2回のトップへ" }).click();

    // 再受験 → すぐ提出 → 2回目の記録。初回の記録は残る
    await page.getByRole("button", { name: "再受験する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
    await opt(QA[0].correct).click();
    await page.getByRole("button", { name: "提出" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "提出する" }).click();
    await page.getByText("2回目（再受験）").first().waitFor();
    ok(await page.getByText(/第2回の初回：1／60/).first().isVisible(), `${name}: 再受験の結果に初回との比較`);
    await page.getByRole("button", { name: "第2回のトップへ" }).click();
    ok(await page.getByText("最新（2回目）：1／60").first().isVisible() && await page.getByText(/初回：1／60/).first().isVisible(), `${name}: 初回と最新の両方を表示`);

    // 科目B：組合せの解答群を選んで提出
    await page.getByRole("button", { name: "科目Bを開始する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
    await page.getByText("問1／20").first().waitFor();
    for (let i = 0; i < QB.length; i++) {
      const q = QB[i];
      if (i > 0) { await page.getByRole("button", { name: "次へ ▶" }).click(); await page.getByText(`問${i + 1}／20`).first().waitFor(); }
      await page.screenshot({ path: `${OUT}/${name}_B_${q.id}.png`, fullPage: true });
      if (i < 10) {
        if (q.choice_header) await page.locator(".m2-ct tbody tr").nth(q.choices.findIndex(c => c.label === q.correct)).click();
        else await opt(q.correct).click();
      }
    }
    await page.getByRole("button", { name: "提出" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "提出する" }).click();
    await page.getByText("第2回 科目Bの結果").first().waitFor();
    ok((await page.locator(".m2-big").innerText()) === "正解 10／20", `${name}: 科目Bの採点（10問正解）`);
    ok(await page.getByText("8／20").first().isVisible(), `${name}: 科目Bの第1回(8/20)との比較`);
    await page.screenshot({ path: `${OUT}/${name}_05_resultB.png`, fullPage: true });

    // 第1回・通常学習のデータが変わっていない／第1回の画面が開ける
    const after = await page.evaluate(() => ({ r1: localStorage.getItem("fe_mock_v1_results"), a1: localStorage.getItem("fe_mock_v1_attempt"), alog: localStorage.getItem("fe_alog_v1"), keys: Object.keys(localStorage) }));
    ok(after.r1 === R1JSON && after.a1 === null && after.alog === "[\"keep\"]", `${name}: 第1回の記録・通常学習のデータは変更なし`);
    ok(after.keys.every(k => ["fe_mock_v1_results", "fe_alog_v1"].includes(k) || k.startsWith("fe_mock_r2_")), `${name}: 第2回が書き込んだキーは fe_mock_r2_ だけ (${after.keys.join(",")})`);
    await page.goto(BASE + "/mock");
    await page.getByRole("button", { name: "第1回を開く" }).click();
    await page.getByRole("button", { name: "科目Aを開始する" }).waitFor();
    ok(await page.getByText("本番形式に準拠したオリジナル模擬試験").first().isVisible() && await page.getByRole("button", { name: "科目Aを開始する" }).isVisible(), `${name}: 第1回の画面が従来どおり開く`);
    ok(await page.getByText("これまでの受験結果").first().isVisible(), `${name}: 第1回の受験結果一覧が残る`);
    await page.screenshot({ path: `${OUT}/${name}_06_round1.png`, fullPage: true });
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    ok(!hscroll, `${name}: 横スクロールなし`);
    ok(errors.length === 0, `${name}: コンソールエラーなし ${errors.slice(0, 3).join(" / ")}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + "/e2e.log", log.join("\n") + "\n");
  console.log(log.join("\n"));
})().catch(e => { console.error(e); process.exit(1); });
