// 期限の境界のブラウザテスト(第3回)。Playwright の時計を固定し、定期更新(1秒ごと)が走る前に
// 期限ちょうど・直後の操作をして、操作が適用されず時間切れの自動提出として保存されることを確かめる。
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = "http://localhost:5056";
const QA = require("/home/claude/fe-quiz/src/mock/r3/mockA3.json");
const log = [];
const ok = (c, m) => { log.push((c ? "OK  " : "NG  ") + m); if (!c) process.exitCode = 1; };
const LIMIT = 90 * 60000;

async function setup(browser, vp, remainMs) {
  const ctx = await browser.newContext({ viewport: vp });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-11-08T10:00:00+09:00") });
  await page.goto(BASE + "/mock");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("fe_mock_r2_results", "[]"); });
  await page.reload();
  await page.getByRole("button", { name: "第3回を開く" }).click();
  await page.getByRole("button", { name: "科目Aを開始する" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "開始する" }).click();
  await page.getByText("問1／60").first().waitFor();
  // 第3回の画面を閉じて(選択画面に戻し、保存処理による上書きを避ける)から、経過を「制限時間 − remainMs」にして再開する
  await page.goto(BASE + "/mock");
  await page.getByRole("button", { name: "第3回を開く" }).waitFor();
  await page.evaluate(([lim, rem]) => { const a = JSON.parse(localStorage.getItem("fe_mock_r3_attempt_A")); a.elapsedMs = lim - rem; a.lastWall = Date.now(); a.answers.M3A01 = "ア"; localStorage.setItem("fe_mock_r3_attempt_A", JSON.stringify(a)); }, [LIMIT, remainMs]);
  await page.getByRole("button", { name: "第3回を開く" }).click();
  await page.getByRole("button", { name: "続きから再開する" }).click();
  await page.getByText("問1／60").first().waitFor();
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 10);   // 以後、時計は runFor・setSystemTime でだけ進める
  await page.clock.runFor(10);
  return { ctx, page };
}
const opt = (page, lab) => page.locator(".m2-choice").filter({ hasText: new RegExp("^" + lab) });
const results = page => page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r3_results") || "[]"));

(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [["pc", { width: 1280, height: 900 }], ["ipad", { width: 820, height: 1180 }]]) {
    // 1) 期限の0.6秒前に回答・提出 → 受理、経過は操作時点まで
    let { ctx, page } = await setup(browser, vp, 2000);
    await page.clock.setSystemTime(Date.now() + 0);
    await page.evaluate(() => {});
    await page.clock.runFor(1000);                      // 定期更新1回(残り1秒)
    await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 400); // 定期更新の前に操作
    await opt(page, "イ").click();
    await page.getByRole("button", { name: "提出" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "提出する" }).click();
    await page.getByText("第3回 科目Aの結果").first().waitFor();
    let r = await results(page);
    ok(r.length === 1 && r[0].submittedBy === "user" && r[0].answers.M3A01 === "イ" && r[0].elapsedMs >= LIMIT - 650 && r[0].elapsedMs < LIMIT, `${name}: 1) 期限直前の回答・提出を受理（経過 ${r[0] && r[0].elapsedMs - LIMIT}ms）`);
    await ctx.close();
    // 2) 期限ちょうど・直後の回答の選択・取消し → 適用せず時間切れで自動提出
    for (const [lbl, after, act] of [["ちょうど・選択", 1500, "pick"], ["直後・選択", 1800, "pick"], ["直後・取消し", 1700, "clear"]]) {
      ({ ctx, page } = await setup(browser, vp, 1500));
      await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + after);
      if (act === "pick") await opt(page, "エ").click();
      else await page.getByRole("button", { name: "解答を消す" }).click();
      await page.getByText("第3回 科目Aの結果").first().waitFor({ timeout: 5000 }).catch(() => {});
      r = await results(page);
      ok(r.length === 1 && r[0].submittedBy === "timeout" && r[0].answers.M3A01 === "ア" && r[0].elapsedMs === LIMIT, `${name}: 2) 期限${lbl}の操作は適用せず自動提出（回答 ${r[0] && r[0].answers.M3A01}）`);
      await ctx.close();
    }
    // 3) 期限前に提出確認を開き、確定が期限ちょうど・直後 → 時間切れ
    for (const after of [1500, 2500]) {
      ({ ctx, page } = await setup(browser, vp, 1500));
      await page.getByRole("button", { name: "提出" }).click();
      await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + after);
      await page.getByRole("dialog").getByRole("button", { name: "提出する" }).click();
      await page.getByText("第3回 科目Aの結果").first().waitFor({ timeout: 5000 }).catch(() => {});
      r = await results(page);
      ok(r.length === 1 && r[0].submittedBy === "timeout" && r[0].elapsedMs === LIMIT, `${name}: 3) 確認画面で期限+${after - 1500}ms に確定 → 時間切れの自動提出`);
      await ctx.close();
    }
    // 4) 定期更新と操作が前後しても二重加算・重複なし
    ({ ctx, page } = await setup(browser, vp, 60000));
    const e0 = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r3_attempt_A")).elapsedMs);
    for (let i = 0; i < 5; i++) { await page.clock.runFor(1000); await opt(page, i % 2 ? "イ" : "ウ").click(); await page.getByRole("button", { name: "次へ ▶" }).click(); await page.getByRole("button", { name: "◀ 前へ" }).click(); }
    const a4 = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r3_attempt_A")));
    const per = Object.values(a4.perQ).reduce((s, x) => s + x.ms, 0);
    ok(Math.abs(a4.elapsedMs - e0 - 5000) <= 50 && per <= a4.elapsedMs, `${name}: 4) 5秒の操作で経過 +${a4.elapsedMs - e0}ms（二重加算なし）`);
    await page.clock.runFor(61000);
    await page.getByText("第3回 科目Aの結果").first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.clock.runFor(3000);
    r = await results(page);
    ok(r.length === 1 && r[0].submittedBy === "timeout", `${name}: 4) 定期更新での自動提出は1件だけ保存`);
    await ctx.close();
    // 5) 中断・画面を離れて復帰
    ({ ctx, page } = await setup(browser, vp, 10 * 60000));
    await page.getByRole("button", { name: "中断" }).click();
    await page.getByRole("button", { name: "中断してトップへ" }).click();
    await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 4 * 60000);
    await page.clock.runFor(1000);
    await page.getByRole("button", { name: "続きから再開する" }).click();
    const a5 = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_mock_r3_attempt_A")));
    ok(Math.abs((LIMIT - a5.elapsedMs) - 6 * 60000 + 1000) <= 1500, `${name}: 5) 中断中の4分を反映（残り ${Math.round((LIMIT - a5.elapsedMs) / 1000)}秒）`);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.clock.setSystemTime(await page.evaluate(() => Date.now()) + 7 * 60000); // 画面を離れて7分
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.clock.runFor(1000);
    await page.getByText("第3回 科目Aの結果").first().waitFor({ timeout: 5000 }).catch(() => {});
    r = await results(page);
    ok(r.length === 1 && r[0].submittedBy === "timeout" && r[0].elapsedMs === LIMIT, `${name}: 5) 離れていた間に期限を過ぎ、復帰時に時間切れで自動提出`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + "/out/e2e_deadline.log", log.join("\n") + "\n");
  console.log(log.join("\n"));
})().catch(e => { console.error(e); process.exit(1); });
