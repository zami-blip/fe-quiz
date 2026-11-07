// 照合用の既存問題を現在のリポジトリから取り出す(アプリ科目A・科目B、第1回・第2回模試)。
// アプリ未登録の候補26問は、第2回作成時に取得した ref の bank368.json から引き継ぐ(登録済みでないことを再確認する)。
const fs = require("fs");
const root = __dirname + "/../..";
function arr(file) {
  const s = fs.readFileSync(root + "/" + file, "utf8");
  const m = s.match(/const ALL_QUESTIONS = (\[[\s\S]*?\n\]);/);
  return JSON.parse(m[1]);
}
const A = arr("src/App.jsx"), B = arr("src/AppB.jsx");
const out = [];
const norm = (set, pre, q) => ({ set, id: pre + q.id, cat: q.cat, topic: q.topic || "", q: q.q || q.question || q.body || "", ch: (q.ch || q.choices || []).map((c, i) => Array.isArray(c) ? c : ["アイウエオカキク"[i], c.text || c]), ans: q.ans, exp: q.exp || "", code: q.code || "" });
A.forEach(q => out.push(norm("app_A", "A-", q)));
B.forEach(q => out.push(norm("app_B", "B-", q)));
for (const [f, set] of [["src/mock/mockA.json", "mock1"], ["src/mock/mockB.json", "mock1"], ["src/mock/r2/mockA2.json", "mock2"], ["src/mock/r2/mockB2.json", "mock2"]]) {
  JSON.parse(fs.readFileSync(root + "/" + f, "utf8")).forEach(q => out.push({ set, id: q.id, cat: q.cat, topic: q.topic || "", body: q.body || q.q, ch: (q.choices || []).map(c => [c.label, c.cols ? c.cols.join(" / ") : c.text]), ans: q.correct, exp: q.explanation || "" }));
}
const old = JSON.parse(fs.readFileSync(root + "/tools/mock_r2/ref/bank368.json", "utf8"));
old.filter(q => /^(A改|B改|旧A|旧B)/.test(q.id)).forEach(q => out.push({ ...q, set: "unregistered" }));
const cnt = {}; out.forEach(q => cnt[q.set] = (cnt[q.set] || 0) + 1);
fs.writeFileSync(__dirname + "/ref/bank_current.json", JSON.stringify(out));
console.log(new Date().toISOString(), "total", out.length, JSON.stringify(cnt));
console.log("A keys", Object.keys(A[0]).join(","), "B keys", Object.keys(B[0]).join(","));
