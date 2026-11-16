// 日付ごとの表示確認（node tools/daily/check_date.js YYYY-MM-DD）：/daily のその日でA5問・B2問・制限時間・進め方を表示し、全問を横はみ出しなく表示できること（PC・iPad縦横）
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots"; fs.mkdirSync(OUT, { recursive: true });
const DATE = process.argv[2]; const plan = require(`../../src/daily/data/${DATE}.json`);
const log = []; const ok = (c, m) => { log.push((c ? "OK  " : "NG  ") + m); if (!c) process.exitCode = 1; };
(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [["pc", { width: 1280, height: 900 }], ["ipad", { width: 820, height: 1180 }], ["ipadL", { width: 1180, height: 820 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: name === "pc" ? 1 : 2, hasTouch: name !== "pc" });
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await page.clock.install({ time: new Date(`${DATE}T16:00:00+09:00`) });
    await page.goto("http://localhost:5057/daily");
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 1000); await page.clock.runFor(1000);
    await page.getByText(/^今日は .*（日本時間）$/).waitFor();
    ok(await page.getByText(plan.goal).first().isVisible(), `${name}: ${DATE} を今日として開き、目標を表示`);
    ok(await page.getByText("5問・制限時間 7分30秒").isVisible() && await page.getByText("2問・制限時間 10分").isVisible(), `${name}: A5問7分30秒・B2問10分`);
    ok(await page.getByText(plan.sets[0].setId, { exact: true }).isVisible() && await page.getByText(plan.sets[1].setId, { exact: true }).isVisible(), `${name}: セットID`);
    for (const [si, set] of plan.sets.entries()) {
      await page.getByRole("button", { name: "このセットに取り組む" }).nth(0).click();
      await page.clock.runFor(10);
      ok(await page.getByText(set.advice).isVisible(), `${name}: ${set.setId} 開始前に進め方を表示`);
      if (name === "ipad") await page.screenshot({ path: `${OUT}/${DATE}_${name}_intro_${set.subject}.png`, fullPage: true });
      await page.getByRole("button", { name: "開始する", exact: true }).click();
      ok(await page.getByText(`残り ${set.limitSec === 450 ? "7:30" : "10:00"}`).isVisible(), `${name}: ${set.setId} タイマー開始 ${set.limitSec}秒`);
      for (let i = 0; i < set.questions.length; i++) {
        await page.getByText(`問${i + 1}／${set.questions.length}`).first().waitFor();
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: ${set.questions[i].id} 横はみ出しなし`);
        ok(!(await page.getByText("（正解）").count()), `${name}: ${set.questions[i].id} 受験中は正解を出さない`);
        if (name === "ipad") await page.screenshot({ path: `${OUT}/${DATE}_${name}_${set.questions[i].id}.png`, fullPage: true });
        // 正解を選ぶ（表形式の解答群は行、それ以外は選択肢ボタン）
        const q = set.questions[i];
        if (q.choice_header) await page.locator("tr[role=radio]").nth(q.choices.findIndex(c => c.label === q.correct)).click();
        else await page.getByRole("radio", { name: new RegExp("^" + q.correct) }).click();
        await page.clock.runFor(2000);
        if (i < set.questions.length - 1) await page.getByRole("button", { name: "次へ ▶" }).click();
      }
      // 提出 → 採点と保存
      await page.getByRole("button", { name: "提出", exact: true }).click();
      await page.getByRole("button", { name: "提出する" }).click();
      await page.getByText(`${set.title}の結果`).waitFor();
      ok(await page.getByText(`正解 ${set.questions.length}／${set.questions.length}`).first().isVisible(), `${name}: ${set.setId} 全問正解で採点 ${set.questions.length}／${set.questions.length}`);
      const res = await page.evaluate(() => JSON.parse(localStorage.getItem("fe_daily_results") || "[]"));
      const r = res.find(x => x.setId === set.setId);
      ok(r && r.planId === plan.planId && r.date === DATE && Object.keys(r.answers).length === set.questions.length && Object.values(r.perQ).every(x => x.ms > 0), `${name}: ${set.setId} 結果を保存（計画ID・日付・回答・設問別時間）`);
      await page.getByRole("button", { name: "今日の学習へ戻る" }).click();
    }
    ok((await page.locator(".m2-pill").allTextContents()).join(",") === "完了,完了", `${name}: 両セット完了`);
    const day = await page.locator("textarea.m2-rep").inputValue();
    ok(day.includes(plan.planId) && plan.sets.every(s => s.questions.every(q => day.includes(q.id))), `${name}: GPT分析用テキストに全問を出力`);
    for (const d of ["11/15", "11/16"]) ok(await page.getByRole("tab", { name: new RegExp(d.replace("/", "\\/")) }).isVisible(), `${name}: 日付 ${d} を選択できる`);
    ok(errors.length === 0, `${name}: エラーなし ${errors.join(" / ")}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + `/out/check_${DATE}.log`, log.join("\n") + "\n");
  console.log(log.join("\n"));
})();
