"""既出問題との重複検査(第3回)。照合対象は ref/bank_current.json(extract_bank.js で現在のリポジトリから取得)。
1) 問題文・選択肢の3文字単位の一致度(Jaccard 係数)の上位3件。0.30以上は要確認。
2) 3個以上の数値の並び(配列の中身・表の値など)が既存問題と同じもの。
3) 科目Bのコードどうしの一致度(空白を除いた3文字単位)。0.40以上は要確認。
4) 第3回の80問どうしの一致度。
使い方: python3 dup_check.py ref/bank_current.json mockA3.json mockB3.json
"""
import json
import re
import sys
from collections import Counter

bank = json.load(open(sys.argv[1], encoding="utf-8"))
new = []
for p in sys.argv[2:]:
    new += json.load(open(p, encoding="utf-8"))


def flat(x):
    if isinstance(x, list):
        return " ".join(flat(e) for e in x)
    if isinstance(x, dict):
        return " ".join(flat(v) for k, v in x.items() if k not in ("svg", "t"))
    return str(x)


def text_bank(q):
    return flat(q.get("q") or q.get("body") or "") + " " + flat(q.get("code", "")) + " " + flat([c[1] for c in q["ch"]])


def code_bank(q):
    s = flat(q.get("code", ""))
    if isinstance(q.get("body"), list):
        s += " ".join(b["text"] for b in q["body"] if isinstance(b, dict) and b.get("t") == "code")
    if isinstance(q.get("q"), str) and "○" in q["q"]:
        s += q["q"]
    return s


def text_new(q):
    return flat(q["body"]) + " " + flat([c.get("cols", c.get("text")) for c in q["choices"]])


def code_new(q):
    return " ".join(b["text"] for b in q["body"] if b["t"] == "code")


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


jac = lambda a, b: len(a & b) / len(a | b) if a and b else 0.0
BG = [(q["id"], q["set"], grams(text_bank(q)), numseqs(text_bank(q)), grams(code_bank(q))) for q in bank]
NG_ = [(q["id"], grams(text_new(q)), numseqs(text_new(q)), grams(code_new(q))) for q in new]
cnt = Counter(q["set"] for q in bank)
flag = 0
lines = []
for qid, g, ns, cg in NG_:
    top = sorted(((jac(g, bg), bid) for bid, _, bg, _, _ in BG), reverse=True)[:3]
    num_hit = [f"{bid}{sorted(ns & bns)}" for bid, _, _, bns, _ in BG if ns & bns]
    ctop = sorted(((jac(cg, bcg), bid) for bid, _, _, _, bcg in BG if bcg), reverse=True)[:1] if cg else []
    mark = "要確認" if top[0][0] >= 0.30 or num_hit or (ctop and ctop[0][0] >= 0.40) else ""
    flag += bool(mark)
    lines.append(f"{qid}\t" + ", ".join(f"{b}({s:.3f})" for s, b in top)
                 + (f"\tコード最大 {ctop[0][1]}({ctop[0][0]:.3f})" if ctop else "")
                 + (f"\t数値の並びが一致: {','.join(num_hit)}" if num_hit else "") + (f"\t{mark}" if mark else ""))
inner = []
for i in range(len(NG_)):
    for j in range(i + 1, len(NG_)):
        s = jac(NG_[i][1], NG_[j][1])
        if s >= 0.30:
            inner.append(f"{NG_[i][0]}–{NG_[j][0]} ({s:.3f})")
mx = max(sorted(((jac(g, bg), qid, bid) for qid, g, _, _ in NG_ for bid, _, bg, _, _ in BG), reverse=True)[:1])
print("\n".join(lines))
print(f"\n照合対象 {len(bank)}問 {dict(cnt)}")
print(f"第3回 {len(NG_)}問のうち、一致度0.30以上・数値の並びの一致・コードの一致度0.40以上のいずれか {flag}件")
print(f"既存問題との一致度の最大 {mx[0]:.3f}（{mx[1]} と {mx[2]}）")
print(f"第3回の80問どうしで一致度0.30以上：{len(inner)}件 " + "、".join(inner))
