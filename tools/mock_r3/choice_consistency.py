"""選択肢・検算記録(verify)・解説の一致を調べる自動テスト(第2回と同じ検査を第3回の80問に適用)。
C1 検算記録がない選択肢がある
C2 検算記録の値と選択肢の文字列が違う
C3 正解の記録が“正解”でない、又は誤答が“正解”と記録されている(正答記号の取り違え)
C4 計算・追跡の問題で、誤答の数値が解説に書かれていない
C5 正解と同じ内容の選択肢がある(正解が複数)
C6 解説が誤答の記号に触れていない(誤答の理由がない)
C7 解説の“正解”の記号の言及が正答記号と食い違う(例：「…なのはウだけ」で正解がア)
使い方: python3 choice_consistency.py mockA3.json mockB3.json
"""
import json
import re
import sys

KATA = "ァ-ヺー"
TOK = lambda lab: re.compile(r"(?<![" + KATA + r"])" + lab + r"(?![" + KATA + r"])")


def check(qs):
    out = []
    for q in qs:
        qid = q["id"]
        ch = {c["label"]: c.get("cols", c.get("text")) for c in q["choices"]}
        ver = {v["label"]: v for v in q.get("verify", [])}
        for lab in ch:
            if lab not in ver:
                out.append(("C1", qid, lab, "検算記録がない"))
                continue
            if ver[lab]["value"] != ch[lab]:
                out.append(("C2", qid, lab, f"記録 {ver[lab]['value']} ≠ 選択肢 {ch[lab]}"))
            is_ok = ver[lab]["reason"].startswith("正解")
            if is_ok != (lab == q["correct"]):
                out.append(("C3", qid, lab, "正解の記録と正答記号が一致しない"))
        vals = [json.dumps(v, ensure_ascii=False) for v in ch.values()]
        if len(set(vals)) != len(vals):
            out.append(("C5", qid, "", "同じ内容の選択肢がある"))
        ex = q["explanation"]
        for lab, v in ch.items():
            if lab == q["correct"]:
                continue
            if not TOK(lab).search(ex):
                out.append(("C6", qid, lab, "解説に誤答の記号がない"))
            if q["skill"] in ("計算", "追跡"):
                parts = v if isinstance(v, list) else [v]
                for p in parts:
                    nums = re.findall(r"−?\d[\d,.]*", p)
                    for n in nums:
                        if n not in ex and n.replace(",", "") not in ex.replace(",", ""):
                            out.append(("C4", qid, lab, f"誤答の値 {n} が解説にない"))
        m = re.search(r"のは([アイウエオカ])だけ", ex)
        if m and m.group(1) != q["correct"]:
            out.append(("C7", qid, m.group(1), f"解説では{m.group(1)}だけとしているが、正解は{q['correct']}"))
    return out


if __name__ == "__main__":
    qs = []
    for p in sys.argv[1:]:
        qs += json.load(open(p, encoding="utf-8"))
    res = check(qs)
    print(f"対象 {len(qs)}問、検出 {len(res)}件")
    for r in res:
        print(*r)
    sys.exit(1 if res else 0)
