"""第3回模試 科目A(60問)を作成し、作成時の検算を行って JSON に書き出す。
使い方: python3 build_A.py ../../src/mock/r3/mockA3.json
"""
import collections
import json
import sys

import A_tech1  # noqa: F401  問1～20
import A_tech2  # noqa: F401  問21～41
import A_ms  # noqa: F401  問42～60
from acommon import QS, LOG
from qlib import dump, swap_labels

assert [q["id"] for q in QS] == [f"M3A{i:02d}" for i in range(1, 61)]

# 正解記号の偏りと連続を抑えるため、選択肢に自然な順序がない問題(知識・判断・組合せ)だけ、
# 正解の選択肢とほかの1つの位置を入れ替える(内容と正解は変えない)。数値の昇順に並べた問題は動かさない。
SWAPS = {"M3A04": ("ウ", "ア"), "M3A13": ("イ", "ア"), "M3A23": ("ア", "エ"), "M3A25": ("ア", "ウ"), "M3A26": ("ア", "イ"),
         "M3A28": ("ア", "エ"), "M3A33": ("エ", "ア"), "M3A45": ("イ", "ア"), "M3A55": ("イ", "エ")}
byid = {q["id"]: q for q in QS}
swaplog = []
for qid, (a, b) in SWAPS.items():
    q = byid[qid]
    before = {c["label"]: c["text"] for c in q["choices"]}
    n = swap_labels(q, a, b)
    after = {c["label"]: c["text"] for c in q["choices"]}
    assert before[a] == after[b] and before[b] == after[a]
    assert n >= 1, (qid, n)
    swaplog.append(f"{qid}: {a}↔{b}（解説中の記号の置換 {n}か所）→ 正解 {q['correct']}")

seq = "".join(q["correct"] for q in QS)
dist = collections.Counter(seq)
run = max(len(m) for m in __import__("re").findall(r"(ア+|イ+|ウ+|エ+)", seq))
diff = collections.Counter(q["difficulty"] for q in QS)
fields = collections.Counter(q["field"] for q in QS)
cats = collections.Counter(q["cat"] for q in QS)
assert diff == {"易": 18, "標準": 33, "難": 9}, diff
assert fields == {"テクノロジ": 41, "マネジメント": 7, "ストラテジ": 12}, fields
assert dict(cats) == {"基礎理論": 6, "アルゴリズム": 4, "コンピュータ構成": 4, "OS": 4, "システム構成": 3, "データベース": 5, "ネットワーク": 6,
                      "情報セキュリティ": 5, "開発技術": 4, "プロジェクト管理": 3, "サービス管理": 2, "システム監査": 2, "企業活動": 4,
                      "経営戦略": 2, "技術戦略": 1, "法務": 2, "システム戦略": 3}, cats
assert all(len(q["choices"]) == 4 for q in QS)
assert max(dist.values()) - min(dist.values()) <= 2 and run <= 3, (dist, run)
total_sec = sum(q["expected_seconds"] for q in QS)
fig = [q["id"] for q in QS if any(b["t"] in ("svg", "table") for b in q["body"])]

out = sys.argv[1] if len(sys.argv) > 1 else "out/mockA3.json"
dump(out, QS)
with open("out/build_A.log", "w", encoding="utf-8") as f:
    for row in LOG:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")
    f.write("入れ替え: " + " / ".join(swaplog) + "\n")
    f.write(f"正解記号の並び {seq}\n正解記号の分布 {dict(sorted(dist.items()))}　同じ記号の最長の連続 {run}\n")
    f.write(f"難度 {dict(diff)}　想定時間の合計 {total_sec}秒（{total_sec / 60:.1f}分）\n")
    f.write(f"図又は表を含む問題 {len(fig)}問: {', '.join(fig)}\n")
print(open("out/build_A.log", encoding="utf-8").read()[-900:])
