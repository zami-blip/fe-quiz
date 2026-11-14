// 11月14日分の表示確認：/daily の11/14でA5問・B2問・制限時間・進め方を表示し、全問を横はみ出しなく表示できること（PC・iPad縦横）
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots"; fs.mkdirSync(OUT, { recursive: true });
const plan = require("../../src/daily/data/2026-11-14.json");
const log = []; const ok = (c, m) => { log.push((c ? "OK  " : "NG  ") + m); if (!c) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [["pc", { width: 1280, height: 900 }], ["ipad", { width: 820, height: 1180 }], ["ipadL", { width: 1180, height: 820 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: name === "pc" ? 1 : 2, hasTouch: name !== "pc" });
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.clock.install({ time: new Date("2026-11-14T16:00:00+09:00") });
    await page.goto("http://localhost:5057/daily");
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.getByText("今日は 2026年11月14日（土）（日本時間）").waitFor();
    ok(await page.getByText(plan.goal).first().isVisible(), `${name}: 11/14 を今日として開き、目標を表示`);
    ok(await page.getByText("5問・制限時間 7分30秒").isVisible() && await page.getByText("2問・制限時間 10分").isVisible(), `${name}: A5問7分30秒・B2問10分`);
    ok(await page.getByText("daily-20261114-A01", { exact: true }).isVisible() && await page.getByText("daily-20261114-B01", { exact: true }).isVisible(), `${name}: セットID`);
    for (const [si, set] of plan.sets.entries()) {
      await page.getByRole("button", { name: "このセットに取り組む" }).nth(0).click();
      ok(await page.getByText(set.advice).isVisible(), `${name}: ${set.setId} 開始前に進め方を表示`);
      if (name === "ipad") await page.screenshot({ path: `${OUT}/1114_${name}_intro_${set.subject}.png`, fullPage: true });
      await page.getByRole("button", { name: "開始する", exact: true }).click();
      for (let i = 0; i < set.questions.length; i++) {
        await page.getByText(`問${i + 1}／${set.questions.length}`).first().waitFor();
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: ${set.questions[i].id} 横はみ出しなし`);
        ok(!(await page.getByText("（正解）").count()), `${name}: ${set.questions[i].id} 受験中は正解を出さない`);
        if (name === "ipad") await page.screenshot({ path: `${OUT}/1114_${name}_${set.questions[i].id}.png`, fullPage: true });
        if (i < set.questions.length - 1) await page.getByRole("button", { name: "次へ ▶" }).click();
      }
      await page.getByRole("button", { name: "中断", exact: true }).click();
      await page.getByRole("button", { name: "中断して戻る" }).click();
      await page.evaluate(k => localStorage.removeItem(k), "fe_daily_attempt_" + set.setId);
      await page.reload();
    }
    ok(errors.length === 0, `${name}: エラーなし ${errors.join(" / ")}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + "/out/check_20261114.log", log.join("\n") + "\n");
  console.log(log.join("\n"));
})();
