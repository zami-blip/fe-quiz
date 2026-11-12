// 問題文・解答群・図の構造を、GPT分析用のテキストにする（第3回模試と「今日の学習」で共用）。
function figureText(b) {
  const L = ["〔図：" + (b.caption || "") + "〕", "図の構造："];
  (b.figure_text || []).forEach(x => L.push("・" + x));
  return L.join("\n");
}
export function blocksText(blocks) {
  return (blocks || []).map(b => {
    if (b.t === "p") return b.text;
    if (b.t === "code") return "```\n" + b.text + "\n```";
    if (b.t === "list") return b.items.map(x => "・" + x.replace(/^・/, "")).join("\n");
    if (b.t === "table") return (b.caption ? "〔" + b.caption + "〕\n" : "") + [b.header, ...b.rows].map(r => "| " + r.join(" | ") + " |").join("\n");
    if (b.t === "svg") return figureText(b);
    return "";
  }).join("\n");
}
export const bodyText = q => blocksText(q.body);
export function choiceText(q) {
  if (q.choice_header) return "解答群 | " + q.choice_header.join(" | ") + "\n" + q.choices.map(c => c.label + " | " + c.cols.join(" | ")).join("\n");
  return q.choices.map(c => c.label + "　" + c.text).join("\n");
}

