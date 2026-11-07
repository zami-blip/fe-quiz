"""第3回模試の問題データを組み立てる共通部品。"""
import json

LABELS = "アイウエオカキクケコ"
SRC = "IPA本番形式準拠・オリジナル"


def P(text):
    return {"t": "p", "text": text}


def CODE(text):
    return {"t": "code", "text": text.strip("\n")}


def LIST(*items):
    return {"t": "list", "items": list(items)}


def TABLE(header, rows, caption=None):
    b = {"t": "table", "header": header, "rows": [[str(c) for c in r] for r in rows]}
    if caption:
        b["caption"] = caption
    return b


def SVG(svg, caption, figure_text, alt=None):
    return {"t": "svg", "svg": svg.strip(), "caption": caption, "alt": alt or caption, "figure_text": figure_text}


def Q(id, subject, field, cat, topic, skill, difficulty, sec, body, choices, correct, explanation, reasons,
      header=None, explain=None):
    """choices: 文字列の並び(四択など)又は列の並び(組合せの解答群)。
    reasons: 記号 → その選択肢が生じる考え方(正解は "正解" で始める)。
    verify の値は選択肢そのものから作る(手で別に書かない)。"""
    labs = LABELS[:len(choices)]
    if header:
        ch = [{"label": l, "cols": [str(x) for x in c]} for l, c in zip(labs, choices)]
    else:
        ch = [{"label": l, "text": str(c)} for l, c in zip(labs, choices)]
    assert correct in labs, (id, correct)
    assert set(reasons) == set(labs), (id, set(labs) ^ set(reasons))
    assert reasons[correct].startswith("正解"), id
    for l in labs:
        if l != correct:
            assert not reasons[l].startswith("正解"), (id, l)
    verify = []
    for c in ch:
        verify.append({"label": c["label"], "value": c.get("cols", c.get("text")), "reason": reasons[c["label"]]})
    q = {"id": id, "subject": subject, "round": 3, "field": field, "cat": cat, "topic": topic, "skill": skill,
         "difficulty": difficulty, "expected_seconds": sec, "source_style": SRC, "body": body, "choices": ch,
         "correct": correct, "explanation": explanation, "verify": verify}
    if header:
        q["choice_header"] = header
    if explain:
        q["explain"] = explain
    return q


def num(x):
    """数値を選択肢用の文字列にする(整数は整数、小数は不要な0を付けない)。"""
    if isinstance(x, float) and x.is_integer():
        x = int(x)
    if isinstance(x, int):
        return f"{x:,}" if abs(x) >= 10000 else str(x)
    s = f"{x:.6f}".rstrip("0").rstrip(".")
    return s


def dump(path, qs):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(qs, f, ensure_ascii=False, indent=1)
        f.write("\n")


def swap_labels(q, a, b):
    """選択肢 a と b の位置を入れ替える(正解記号の分布を整えるため。判断・知識の問題だけに使う)。
    解説の中の記号は、文頭(「。」の直後・先頭)又は「、」の直後にあって「は・の・と」が続くものだけを入れ替える。"""
    import re
    assert "choice_header" not in q
    ia, ib = LABELS.index(a), LABELS.index(b)
    ch = q["choices"]
    ch[ia]["text"], ch[ib]["text"] = ch[ib]["text"], ch[ia]["text"]
    v = {x["label"]: x for x in q["verify"]}
    v[a]["value"], v[b]["value"] = v[b]["value"], v[a]["value"]
    v[a]["reason"], v[b]["reason"] = v[b]["reason"], v[a]["reason"]
    if q["correct"] == a:
        q["correct"] = b
    elif q["correct"] == b:
        q["correct"] = a
    pat = re.compile(r"(?:(?<=^)|(?<=。)|(?<=、)|(?<=）))([" + a + b + r"])(?=[はのと・])")
    n = len(pat.findall(q["explanation"]))
    q["explanation"] = pat.sub(lambda m: b if m.group(1) == a else a, q["explanation"])
    return n


KATA = "ァ-ヺー"


def swap_any(q, a, b):
    """選択肢 a と b を入れ替える(組合せの解答群にも使える)。解説の中の記号は、前後がカタカナでない1文字の
    ア～カだけを入れ替える(“ソフトウェア”などの語の中の文字は対象外)。記号の範囲(イ～オ)は使わない前提。"""
    import re
    ia, ib = LABELS.index(a), LABELS.index(b)
    ch = q["choices"]
    key = "cols" if "cols" in ch[0] else "text"
    ch[ia][key], ch[ib][key] = ch[ib][key], ch[ia][key]
    v = {x["label"]: x for x in q["verify"]}
    v[a]["value"], v[b]["value"] = v[b]["value"], v[a]["value"]
    v[a]["reason"], v[b]["reason"] = v[b]["reason"], v[a]["reason"]
    if q["correct"] == a:
        q["correct"] = b
    elif q["correct"] == b:
        q["correct"] = a
    assert not re.search(r"[アイウエオカ]～[アイウエオカ]", q["explanation"]), q["id"]
    pat = re.compile(r"(?<![" + KATA + r"])([" + a + b + r"])(?![" + KATA + r"])")
    n = len(pat.findall(q["explanation"]))
    q["explanation"] = pat.sub(lambda m: b if m.group(1) == a else a, q["explanation"])
    return n
