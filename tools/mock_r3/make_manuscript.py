"""GPTレビュー用の問題原稿(全80問)と配分表を、アプリの JSON から作る。"""
import json
import sys

A = json.load(open(sys.argv[1], encoding="utf-8"))
B = json.load(open(sys.argv[2], encoding="utf-8"))


def blocks(bs):
    out = []
    for b in bs:
        if b["t"] == "p":
            out.append(b["text"])
        elif b["t"] == "code":
            out.append("```\n" + b["text"] + "\n```")
        elif b["t"] == "list":
            out.append("\n".join("- " + x for x in b["items"]))
        elif b["t"] == "table":
            t = (f"〔{b['caption']}〕\n\n" if b.get("caption") else "") + "| " + " | ".join(b["header"]) + " |\n|" + "---|" * len(b["header"]) + "\n"
            t += "\n".join("| " + " | ".join(r) + " |" for r in b["rows"])
            out.append(t)
        elif b["t"] == "svg":
            out.append(f"〔図：{b['caption']}〕（アプリではSVGで描画）図の構造：\n" + "\n".join("- " + x for x in b["figure_text"]))
    return "\n\n".join(out)


L = ["# FE 第3回模試 問題原稿 全80問（GPTレビュー用・正解と解説を含む）", "",
     "※ 受験前のユーザーには見せないでください。アプリのデータ src/mock/r3/mockA3.json・mockB3.json から自動生成。", ""]
for q in A + B:
    L.append(f"## {q['id']}　{q['field']}／{q['cat']}／{q['topic']}")
    L.append(f"skill={q['skill']}　難度={q['difficulty']}　想定{q['expected_seconds']}秒")
    L.append("")
    L.append(blocks(q["body"]))
    L.append("")
    if q.get("choice_header"):
        L.append("| 解答群 | " + " | ".join(q["choice_header"]) + " |\n|" + "---|" * (len(q["choice_header"]) + 1))
        L += ["| " + c["label"] + " | " + " | ".join(c["cols"]) + " |" for c in q["choices"]]
    else:
        L += [f"- {c['label']}　{c['text']}" for c in q["choices"]]
    L.append("")
    L.append(f"**正解 {q['correct']}**")
    L.append("")
    L.append("解説：" + q["explanation"])
    if q.get("explain"):
        L.append("")
        L.append(blocks(q["explain"]))
    L.append("")
    L.append("選択肢ごとの検算記録：" + "／".join(f"{v['label']}：{v['reason']}" for v in q["verify"]))
    L.append("")
open("out/manuscript.md", "w", encoding="utf-8").write("\n".join(L))
T = ["| ID | 分野 | 細分類 | 測定対象(topic) | 形式(skill) | 難度 | 想定秒 | 図表 |", "|---|---|---|---|---|---|---|---|"]
for q in A + B:
    fig = "図" if any(b["t"] == "svg" for b in q["body"]) else ("表" if any(b["t"] == "table" for b in q["body"]) else "")
    T.append(f"| {q['id']} | {q['field']} | {q['cat']} | {q['topic']} | {q['skill']} | {q['difficulty']} | {q['expected_seconds']} | {fig} |")
T.append(f"| 計 | 科目A 60問 | | | | 易18・標準33・難9 | {sum(q['expected_seconds'] for q in A)}（{sum(q['expected_seconds'] for q in A)/60:.1f}分） | |")
T.append(f"| 計 | 科目B 20問 | | | | 易6・標準11・難3 | {sum(q['expected_seconds'] for q in B)}（{sum(q['expected_seconds'] for q in B)/60:.1f}分） | |")
open("out/allocation.md", "w", encoding="utf-8").write("\n".join(T))
print(len(L), len(T))
