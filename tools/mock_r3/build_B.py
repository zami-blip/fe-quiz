"""第3回模試 科目B(20問)を作成し、作成時の検算を行って JSON に書き出す。
使い方: python3 build_B.py ../../src/mock/r3/mockB3.json
"""
import collections
import json
import sys

import B_algo1  # noqa: F401  問1～8
import B_algo2  # noqa: F401  問9～16
import B_sec  # noqa: F401  問17～20
from bcommon import QS, LOG
from qlib import dump, swap_any

assert [q["id"] for q in QS] == [f"M3B{i:02d}" for i in range(1, 21)], [q["id"] for q in QS]

# 正解記号の偏りを抑えるため、正解の選択肢とほかの1つの位置を入れ替える(選択肢の内容・正解は変えない)。
SWAPS = {"M3B03": ("エ", "オ"), "M3B05": ("オ", "ア"), "M3B07": ("イ", "エ"), "M3B10": ("オ", "カ"),
         "M3B13": ("オ", "カ"), "M3B19": ("エ", "ア")}
byid = {q["id"]: q for q in QS}
swaplog = []
for qid, (a, b) in SWAPS.items():
    q = byid[qid]
    before = {c["label"]: c.get("cols", c.get("text")) for c in q["choices"]}
    n = swap_any(q, a, b)
    after = {c["label"]: c.get("cols", c.get("text")) for c in q["choices"]}
    assert before[a] == after[b] and before[b] == after[a]
    swaplog.append(f"{qid}: {a}↔{b}（解説中の記号の置換 {n}か所）→ 正解 {q['correct']}")

dist = collections.Counter(q["correct"] for q in QS)
by_n = collections.defaultdict(collections.Counter)
for q in QS:
    by_n[len(q["choices"])][q["correct"]] += 1
diff = collections.Counter(q["difficulty"] for q in QS)
assert diff == {"易": 6, "標準": 11, "難": 3}, diff
assert sum(1 for q in QS if q["field"] == "情報セキュリティ") == 4
total_sec = sum(q["expected_seconds"] for q in QS)

out = sys.argv[1] if len(sys.argv) > 1 else "out/mockB3.json"
dump(out, QS)
with open("out/build_B.log", "w", encoding="utf-8") as f:
    for row in LOG:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    f.write("入れ替え: " + " / ".join(swaplog) + "\n")
    f.write(f"正解記号の分布 {dict(sorted(dist.items()))}　選択肢数別 {{{', '.join(f'{k}択: {dict(v)}' for k, v in sorted(by_n.items()))}}}\n")
    f.write(f"難度 {dict(diff)}　想定時間の合計 {total_sec}秒（{total_sec / 60:.1f}分）\n")
print(open("out/build_B.log", encoding="utf-8").read()[-600:])
