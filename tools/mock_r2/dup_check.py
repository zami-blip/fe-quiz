"""既存368問(アプリ科目A196・科目B66、第1回模試80、アプリ未登録26)との重複検査。
1) 問題文・選択肢の3文字単位の一致度(Jaccard係数)の上位3件。0.30以上は要確認として表示する。
2) 3個以上の数値の並び(配列の中身・表の値など)が既存問題と同じもの。
3) 第2回の80問どうしの一致度。
使い方: python3 dup_check.py ref/bank368.json mockA2.json mockB2.json
"""
import json
import re
import sys

bank = json.load(open(sys.argv[1], encoding="utf-8"))
new = []
for p in sys.argv[2:]:
    new += json.load(open(p, encoding="utf-8"))
assert len(bank) == 368, len(bank)


def flat(x):
    if isinstance(x, list):
        return " ".join(flat(e) for e in x)
    if isinstance(x, dict):
        return " ".join(flat(v) for k, v in x.items() if k not in ("svg",))
    return str(x)


def text_bank(q):
    return flat(q.get("q") or q.get("body")) + " " + flat([c[1] for c in q["ch"]])


def text_new(q):
    return flat(q["body"]) + " " + flat([c.get("cols", c.get("text")) for c in q["choices"]])


def grams(s):
    s = re.sub(r"\s+", "", s)
    return {s[i:i + 3] for i in range(len(s) - 2)}


def numseqs(s):
    out = set()
    for m in re.finditer(r"(\d+(?:[,，、 ]+\d+){2,})", s):
        nums = tuple(re.findall(r"\d+", m.group(1)))
        if len(nums) >= 3:
            out.add(nums)
    return out


BG = [(q["id"], grams(text_bank(q)), numseqs(text_bank(q))) for q in bank]
NG_ = [(q["id"], grams(text_new(q)), numseqs(text_new(q))) for q in new]
jac = lambda a, b: len(a & b) / len(a | b) if a and b else 0.0
flag = 0
lines = []
for qid, g, ns in NG_:
    top = sorted(((jac(g, bg), bid) for bid, bg, _ in BG), reverse=True)[:3]
    num_hit = [f"{bid}{sorted(ns & bns)}" for bid, _, bns in BG if ns & bns]
    mark = "要確認" if top[0][0] >= 0.30 or num_hit else ""
    flag += bool(mark)
    lines.append(f"{qid}\t" + ", ".join(f"{b}({s:.3f})" for s, b in top) + (f"\t数値の並びが一致: {','.join(num_hit)}" if num_hit else "") + (f"\t{mark}" if mark else ""))
inner = []
for i in range(len(NG_)):
    for j in range(i + 1, len(NG_)):
        s = jac(NG_[i][1], NG_[j][1])
        if s >= 0.30:
            inner.append(f"{NG_[i][0]}–{NG_[j][0]} ({s:.3f})")
print("\n".join(lines))
print(f"\n既存368問との照合：{len(NG_)}問、一致度0.30以上又は数値の並びの一致 {flag}件")
print(f"第2回の80問どうしで一致度0.30以上：{len(inner)}件 " + "、".join(inner))
