"""第3回 科目A の作成用の共通部品。"""
from qlib import Q

TE, MA, ST = "テクノロジ", "マネジメント", "ストラテジ"
QS = []
LOG = []


def qa(id, field, cat, topic, skill, diff, sec, body, choices, correct, expl, reasons, header=None, explain=None):
    QS.append(Q(id, "A", field, cat, topic, skill, diff, sec, body, choices, correct, expl, reasons, header=header, explain=explain))


def pick(choices, value, fmt=str):
    """数値の選択肢のうち、値が value のものの記号を返す(ちょうど1つであることを確かめる)。"""
    labs = [l for l, c in zip("アイウエ", choices) if c == fmt(value)]
    assert len(labs) == 1, (choices, value, labs)
    return labs[0]
