"""第3回 科目B の作成用の共通部品。"""
import random

import pseudo as PS
from qlib import Q

AL, SEC = "アルゴリズムとプログラミング", "情報セキュリティ"
LAB = "アイウエオカキクケコ"
QS = []
LOG = []


def qb(id, field, cat, topic, skill, diff, sec, body, choices, correct, expl, reasons, header=None, explain=None):
    QS.append(Q(id, "B", field, cat, topic, skill, diff, sec, body, choices, correct, expl, reasons, header=header, explain=explain))


def call(ns, fn, *args, limit=20000):
    """関数を呼ぶ(繰返し回数の上限は呼出しごとに数え直す。この模試の入力では数百回で終わる)。"""
    ns["_steps"][0] = 0
    ns["_limit"][0] = limit
    return ns[fn](*args)


def run_blank(code, header, choices, test, extra=None, intdiv=True):
    """空欄の各選択肢を埋めたプログラムを test(ns) で検査する。
    test は (仕様どおりの件数, 全件数, 範囲外参照・停止しない等の例外の件数) を返す。"""
    out = {}
    for lab, cols in zip(LAB, choices):
        filled = PS.fill_blanks(code, dict(zip(header, cols)))
        ns = PS.load(filled, intdiv=intdiv, extra=extra)
        out[lab] = test(ns)
    return out


def only(res, lab):
    oks = [k for k, (good, total, exc) in res.items() if good == total]
    assert oks == [lab], res
    for k, (good, total, exc) in res.items():
        assert total > 0
    return res


def safe(f):
    """test 用: 1件の実行。仕様どおりなら 1、違えば 0、例外なら 'exc'。"""
    try:
        return 1 if f() else 0
    except (PS.OutOfRange, PS.TooLong, IndexError, TypeError, ZeroDivisionError, RecursionError):
        return "exc"


def tally(results):
    good = sum(1 for r in results if r == 1)
    exc = sum(1 for r in results if r == "exc")
    return good, len(results), exc


def rnd(seed):
    return random.Random(seed)
