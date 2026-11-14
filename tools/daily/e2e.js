// 「今日の学習」(/daily) の動作テスト（Chromium・Playwright）。
// PC幅・iPad縦(820×1180)・iPad横(1180×820)で、開始・移動・保留・回答変更・画面非表示・再読込・提出・結果・
// 理由選択・GPT分析用テキスト・時間切れ・期限後の復帰・二重提出・再受験・既存模試への影響・横はみ出しを確認する。
// 使い方: node tools/mock_r3/serve.js $PWD/build 5057 & node tools/daily/e2e.js
const { chromium } = require("playwright");
const fs = require("fs");
const OUT = __dirname + "/shots";
fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:5057";
const plan = require("../../src/daily/data/2026-11-13.json");
const [SA, SB] = plan.sets;
const log = [];
const ok = (c, m) => { log.push((c ? "OK  " : "NG  ") + m); if (!c) process.exitCode = 1; };
const R3 = JSON.stringify([{ attemptId: "mock3-A-keep", subject: "A", round: 3, attemptNo: 1, answers: {}, perQ: {}, flags: {}, startedAt: "2026-11-08T10:00:00+09:00", elapsedMs: 1, limitMs: 1, submittedBy: "user" }]);

const ls = (page, k) => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), k);
async function setHidden(page, hidden) {
  await page.evaluate(h => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}
async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
const btn = (page, name, exact = true) => page.getByRole("button", { name, exact });
const pickOpt = async (page, q, label) => {
  if (q.choice_header) await page.locator("tr[role=radio]").nth(q.choices.findIndex(c => c.label === label)).click();
  else await page.getByRole("radio", { name: new RegExp("^" + label) }).click();
};
const near = (x, y) => Math.abs(x - y) <= 100; // 操作の実時間による数十ミリ秒の差は許容
// fe_daily_notes への保存だけを失敗させる／元に戻す
const breakNotes = page => page.evaluate(() => {
  if (!window.__origSet) window.__origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { if (k === "fe_daily_notes") throw new Error("QuotaExceededError(test)"); return window.__origSet.call(this, k, v); };
});
const fixNotes = page => page.evaluate(() => { if (window.__origSet) Storage.prototype.setItem = window.__origSet; });
const alertShown = async page => (await page.getByRole("alert").count()) > 0 && await page.getByRole("alert").first().isVisible();
const now = page => page.evaluate(() => Date.now());

(async () => {
  const browser = await chromium.launch();
  for (const [name, vp] of [["pc", { width: 1280, height: 900 }], ["ipad", { width: 820, height: 1180 }], ["ipadL", { width: 1180, height: 820 }]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: name === "pc" ? 1 : 2, hasTouch: name !== "pc" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    page.on("console", m => { if (m.type() === "error" && !/ERR_TUNNEL|fonts\.g|net::/.test(m.text())) errors.push(m.text()); });
    await page.clock.install({ time: new Date("2026-11-13T07:30:00+09:00") });
    await page.goto(BASE + "/daily");
    await page.evaluate(r3 => { localStorage.clear(); localStorage.setItem("fe_mock_r3_results", r3); localStorage.setItem("fe_alog_v1", "[\"keep\"]"); }, R3);
    await page.reload();
    await page.clock.pauseAt(await now(page) + 10);
    await page.clock.runFor(10);

    // ---- 日ごとの画面
    await page.getByRole("heading", { name: "今日の学習" }).waitFor();
    ok(await page.getByText("今日は 2026年11月13日（金）（日本時間）").isVisible(), `${name}: 日本時間の今日の日付`);
    ok(await page.getByText(plan.goal).first().isVisible(), `${name}: 今日の目標を表示`);
    ok((await page.locator(".m2-pill").allTextContents()).join(",") === "未受験,未受験", `${name}: 2セットとも未受験`);
    ok(await page.getByText("5問・制限時間 7分30秒").isVisible() && await page.getByText("2問・制限時間 10分").isVisible(), `${name}: 問題数と制限時間`);
    ok(await page.getByRole("tab", { name: /11\/14未受験/ }).isVisible(), `${name}: 翌日（作成済み）の課題を未受験と表示`);
    await page.screenshot({ path: `${OUT}/${name}_01_day.png`, fullPage: true });

    // ---- 科目A：開始前の画面 → 開始
    await page.getByRole("button", { name: "このセットに取り組む" }).first().click();
    await page.getByText("受験のしかた").waitFor();
    ok(await page.getByText(SA.goal).isVisible(), `${name}: 開始前の画面にセットの目標`);
    await page.screenshot({ path: `${OUT}/${name}_02_intro.png`, fullPage: true });
    await btn(page, "開始する").click();
    await page.getByText("問1／5").waitFor();
    ok(await page.getByText("残り 7:30").isVisible(), `${name}: 開始時の残り時間 7:30`);
    ok(!(await page.getByText("（正解）").count()), `${name}: 受験中は正解を表示しない`);
    // 問1を20秒 → 回答
    await page.clock.runFor(20000);
    await pickOpt(page, SA.questions[0], "ア"); await pickOpt(page, SA.questions[0], SA.questions[0].correct);
    // 問2へ、保留を付けて10秒
    await btn(page, "次へ ▶").click();
    await btn(page, "☆ 保留（あとで見直す）").click();
    await page.clock.runFor(10000);
    // 問4へ直接移動（表を確認）
    await page.getByRole("button", { name: /^問4/ }).click();
    ok(await noOverflow(page), `${name}: 問4（表）で横はみ出しなし`);
    await page.screenshot({ path: `${OUT}/${name}_03_examA4.png`, fullPage: true });
    await pickOpt(page, SA.questions[3], SA.questions[3].correct);
    await page.clock.runFor(15000);
    // 問2へ戻る（SQLのコード）
    await page.getByRole("button", { name: /^問2/ }).click();
    ok(await noOverflow(page), `${name}: 問2（SQL・表）で横はみ出しなし`);
    await page.screenshot({ path: `${OUT}/${name}_04_examA2.png`, fullPage: true });
    await page.clock.runFor(8000);
    await pickOpt(page, SA.questions[1], "ウ");
    // 画面非表示 60秒（設問別には加えない）
    await setHidden(page, true);
    await page.clock.runFor(60000);
    await setHidden(page, false);
    await page.clock.runFor(2000);
    let at = await ls(page, "fe_daily_attempt_" + SA.setId);
    const q1 = SA.questions[0].id, q2 = SA.questions[1].id, q4 = SA.questions[3].id;
    ok(near(at.perQ[q1].ms, 20000) && at.perQ[q1].changes === 1, `${name}: 問1 20秒・回答変更1回 (${at.perQ[q1].ms})`);
    ok(near(at.perQ[q2].firstMs, 10000) && near(at.perQ[q2].revisitMs, 10000) && at.perQ[q2].visits === 2, `${name}: 問2 初回10秒＋再訪10秒・表示2回 (${JSON.stringify(at.perQ[q2])})`);
    ok(near(at.perQ[q4].ms, 15000), `${name}: 問4 15秒`);
    ok(near(at.hiddenMs, 60000), `${name}: 非表示60秒は hiddenMs にだけ記録 (${at.hiddenMs})`);
    const sumQ = Object.values(at.perQ).reduce((s, p) => s + p.ms, 0);
    ok(sumQ + at.hiddenMs === at.elapsedMs, `${name}: 設問別合計＋非表示＝経過（二重加算なし） ${sumQ}+${at.hiddenMs}=${at.elapsedMs}`);
    ok(at.flags[q2] === true, `${name}: 保留を記録`);
    // 再読込 → 回答と残り時間を復元
    await page.clock.runFor(1000);
    const before = await page.locator(".m2-time").first().textContent();
    await page.reload();
    await page.getByRole("button", { name: "続きから再開する" }).waitFor();
    ok(await page.getByText(/回答済み 3／5/).isVisible(), `${name}: 再読込後 回答3問を復元`);
    await btn(page, "続きから再開する").click();
    const after = await page.locator(".m2-time").first().textContent();
    ok(before === after || Math.abs(parseInt(before.slice(-2)) - parseInt(after.slice(-2))) <= 1, `${name}: 再読込後の残り時間 ${before} → ${after}`);
    at = await ls(page, "fe_daily_attempt_" + SA.setId);
    ok(at.resumes === 1, `${name}: 再開回数1`);
    // 提出（二重クリック）
    await btn(page, "提出").click();
    await btn(page, "提出する").dblclick();
    await page.getByText("科目A 5問セットの結果").waitFor();
    let res = await ls(page, "fe_daily_results");
    ok(res.length === 1 && res[0].submittedBy === "user", `${name}: 二重クリックでも結果は1件`);
    ok(!(await ls(page, "fe_daily_attempt_" + SA.setId)), `${name}: 提出後は受験中データを削除`);
    ok(await page.getByText("正解 2／5").first().isVisible(), `${name}: 採点 2／5`);
    ok(await page.getByText("まず復習する1問").isVisible() && await page.getByText(/問2　誤答/).isVisible(), `${name}: 最初の誤答（問2）を優先表示`);
    // 理由の保存に失敗 → 警告。失敗したままの再試行では警告が残り、直ってからの再試行で保存されて警告が消える
    await breakNotes(page);
    await page.getByRole("button", { name: "途中の値", exact: true }).first().click();
    ok(await alertShown(page) && !(await ls(page, "fe_daily_notes")), `${name}: メモの保存失敗で警告を表示（未保存）`);
    await btn(page, "保存を再試行").click();
    ok(await alertShown(page), `${name}: 失敗したままの再試行では警告が残る`);
    await fixNotes(page);
    await btn(page, "保存を再試行").click();
    ok(!(await alertShown(page)), `${name}: 再試行が成功すると警告が消える`);
    let nsv = await ls(page, "fe_daily_notes");
    ok(nsv && Object.values(nsv).some(e => e.reasons && e.reasons[SA.questions[1].id] === "途中の値"), `${name}: 再試行で理由を保存`);
    // 解説を2問開いて30秒 → 解説の閲覧時間は記録しない（受験中の設問別時間だけを使う）
    await page.locator("button.m2-choice").filter({ hasText: "解説を開く" }).first().click();
    ok((await page.getByText("正解 ").count()) >= 2, `${name}: 解説を2問同時に開ける`);
    await page.clock.runFor(30000);
    await page.locator(".dl-strip").getByRole("button", { name: "問3" }).click();
    ok(await page.getByText(/問3　未回答/).isVisible(), `${name}: 優先問題を問3に変更`);
    await page.screenshot({ path: `${OUT}/${name}_05_resultA.png`, fullPage: true });
    ok(await noOverflow(page), `${name}: 結果画面で横はみ出しなし`);
    const notes = await ls(page, "fe_daily_notes");
    const nn = notes[res[0].attemptId];
    ok(nn.reasons[q2] === "途中の値" && nn.priority === SA.questions[2].id, `${name}: 理由と優先問題を保存`);
    ok(!JSON.stringify(notes).includes("reviewMs"), `${name}: 複数の解説を開いても閲覧時間を記録しない`);
    ok(res[0].elapsedMs === (await ls(page, "fe_daily_results"))[0].elapsedMs, `${name}: 解説を見ても受験記録は変わらない`);
    const repA = await page.locator("textarea.m2-rep").inputValue();
    ok(!repA.includes("解説を開いていた時間"), `${name}: GPT用テキストに解説の閲覧時間を出さない`);
    ok(/初回の表示 10秒、再訪 1[01]秒、表示した回数 2回/.test(repA) && /本人が付けた理由: 途中の値/.test(repA) && /問題を表示していなかった時間: 1分0[0-9]秒/.test(repA), `${name}: セットのGPT用テキストに時間・理由・非表示時間`);

    // ---- 日ごとの画面：Bは未受験
    await btn(page, "今日の学習へ戻る").click();
    ok((await page.locator(".m2-pill").allTextContents()).join(",") === "完了,未受験", `${name}: Aは完了・Bは未受験`);
    let day = await page.locator("textarea.m2-rep").inputValue();
    ok(day.includes("daily-20261113-B01（科目B 2問セット、2問・制限 10分00秒）: 未受験") && day.includes("受験済みセットの初回合計: 正解 2／5　誤答 1　未回答 2"), `${name}: 日のテキスト（Bは未受験、誤答に数えない）`);

    // ---- 科目B：中断して期限を過ぎてから戻る → 期限の時刻で自動提出
    await page.getByRole("button", { name: "このセットに取り組む" }).click();
    await btn(page, "開始する").click();
    await page.getByText("問1／2").waitFor();
    ok(await noOverflow(page), `${name}: B問1（コード）で横はみ出しなし`);
    const codeScroll = await page.locator(".m2-code").first().evaluate(e => e.scrollWidth <= e.clientWidth + 1 || getComputedStyle(e).overflowX === "auto");
    ok(codeScroll, `${name}: コードは枠内または横スクロール`);
    await page.screenshot({ path: `${OUT}/${name}_06_examB1.png`, fullPage: true });
    await pickOpt(page, SB.questions[0], SB.questions[0].correct);
    await page.clock.runFor(30000);
    await btn(page, "次へ ▶").click();
    ok(await noOverflow(page), `${name}: B問2（表・コード）で横はみ出しなし`);
    await page.screenshot({ path: `${OUT}/${name}_07_examB2.png`, fullPage: true });
    const startB = Date.parse((await ls(page, "fe_daily_attempt_" + SB.setId)).startedAt);
    await btn(page, "中断").click(); await btn(page, "中断して戻る").click();
    await page.clock.runFor(1000);
    // 受験中のセットがある状態で日のメモの保存に失敗 → 受験データの保存（毎秒）が成功しても、メモの警告は消えない
    await breakNotes(page);
    await page.locator("#dl-memo").fill("失敗テスト");
    await page.clock.runFor(3000);
    ok(await alertShown(page), `${name}: 受験データの保存が成功してもメモの警告は残る`);
    await fixNotes(page);
    await btn(page, "保存を再試行").click();
    ok(!(await alertShown(page)) && (await ls(page, "fe_daily_notes"))["day:2026-11-13"].memo === "失敗テスト", `${name}: 再試行で日のメモを保存し警告が消える`);
    await page.clock.setSystemTime(await now(page) + 20 * 60000);   // 20分後に戻る
    await page.reload();
    await page.getByRole("heading", { name: "今日の学習" }).waitFor();
    await page.clock.runFor(1000);
    res = await ls(page, "fe_daily_results");
    const rb = res.find(r => r.setId === SB.setId);
    ok(rb && rb.submittedBy === "timeout" && rb.elapsedMs === 600000, `${name}: 期限後の復帰で自動提出（経過10分）`);
    ok(rb && Math.abs(Date.parse(rb.endedAt) - (startB + 600000)) < 1000, `${name}: 提出時刻は期限の時刻`);
    ok(rb && rb.answers[SB.questions[0].id] === SB.questions[0].correct && !rb.answers[SB.questions[1].id], `${name}: 未回答も記録`);
    ok((await page.locator(".m2-pill").allTextContents()).join(",") === "完了,完了", `${name}: 両セット完了`);

    // ---- 受験画面のまま時間切れ（再受験A）
    await page.getByRole("button", { name: "再受験" }).first().click();
    ok(await page.getByText("（2回目・再受験）").isVisible(), `${name}: 再受験の開始前表示`);
    await btn(page, "開始する").click();
    await page.getByText("問1／5").waitFor();
    await pickOpt(page, SA.questions[0], SA.questions[0].correct);
    await page.clock.runFor(451000);
    await page.getByText("科目A 5問セットの結果").waitFor();
    res = await ls(page, "fe_daily_results");
    const ra2 = res.filter(r => r.setId === SA.setId);
    ok(ra2.length === 2 && ra2[1].isRetake && ra2[1].attemptNo === 2 && ra2[1].submittedBy === "timeout", `${name}: 再受験を2回目として記録・時間切れで自動提出`);
    ok(await page.getByText("制限時間で自動提出").first().isVisible(), `${name}: 結果に自動提出と表示`);
    await btn(page, "今日の学習へ戻る").click();
    day = await page.locator("textarea.m2-rep").inputValue();
    ok(day.includes("2回目（再受験：同じ問題のため") && day.includes("同じ設問の再受験") && day.includes("新作（初見）"), `${name}: 日のテキストで初回と再受験を区別`);
    await page.locator("#dl-memo").fill("朝7分・夜10分");
    day = await page.locator("textarea.m2-rep").inputValue();
    ok(day.includes("本人のメモ（使えた時間など）: 朝7分・夜10分"), `${name}: メモを出力に反映`);
    fs.writeFileSync(`${OUT}/${name}_day_report.txt`, day);
    await page.screenshot({ path: `${OUT}/${name}_08_day_done.png`, fullPage: true });

    // ---- 既存データ・既存模試への影響
    ok(await page.evaluate(() => localStorage.getItem("fe_alog_v1")) === "[\"keep\"]", `${name}: 通常学習のデータを変更しない`);
    ok(JSON.stringify(await ls(page, "fe_mock_r3_results")) === R3, `${name}: 第3回模試の記録を変更しない`);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    ok(keys.filter(k => !["fe_alog_v1", "fe_mock_r3_results"].includes(k)).every(k => k.startsWith("fe_daily_")), `${name}: 追加したキーは fe_daily_ のみ (${keys.join(",")})`);
    await page.goto(BASE + "/mock");
    await page.getByRole("button", { name: "第3回を開く" }).click();
    await page.getByText("本番形式に準拠したオリジナル模擬試験　第3回").first().waitFor();
    ok(await page.getByText("受験済み").first().isVisible(), `${name}: 第3回模試の画面と受験記録を表示`);
    await page.goto(BASE + "/");
    ok(await page.getByRole("link", { name: "今日の学習 →" }).isVisible(), `${name}: 通常学習画面に「今日の学習」の導線`);
    // 過去の日付として開ける（翌日に開いた想定）
    await page.clock.setSystemTime(Date.parse("2026-11-16T08:00:00+09:00"));
    await page.goto(BASE + "/daily");
    await page.getByRole("heading", { name: "今日の学習" }).waitFor();
    ok(await page.getByText("この日の課題は作成されていません").isVisible(), `${name}: 課題のない日（11/16）に開くと未作成`);
    await page.getByRole("tab", { name: /11\/13/ }).click();
    ok(await page.getByText("（過去の課題）").isVisible() && (await page.locator(".m2-pill").allTextContents()).join(",") === "完了,完了", `${name}: 過去の課題と結果を開ける`);
    ok(errors.length === 0, `${name}: コンソールエラーなし ${errors.join(" / ")}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(__dirname + "/out/e2e.log", log.join("\n") + "\n");
  console.log(log.join("\n"));
})();
