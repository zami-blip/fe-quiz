"""第2回模試 80問の独立検算・形式検査。
作成用の build_A.py / build_B.py は読み込まず、アプリに組み込む JSON(問題文・表・図の構造の文章・コード・選択肢)
だけから値を求め直して、正解の選択肢がちょうど1つであることを確かめる。
使い方: python3 check_r2.py ../../src/mock/r2/mockA2.json ../../src/mock/r2/mockB2.json
"""
import datetime
import ipaddress
import itertools
import json
import math
import random
import re
import sqlite3
import sys
from fractions import Fraction

import pseudo as PS

A = json.load(open(sys.argv[1], encoding="utf-8"))
B = json.load(open(sys.argv[2], encoding="utf-8"))
QA = {q["id"]: q for q in A}
QB = {q["id"]: q for q in B}
NG, OKN = [], [0]


def ok(cond, msg):
    if cond:
        OKN[0] += 1
    else:
        NG.append(msg)


def ctext(q, lab):
    c = [x for x in q["choices"] if x["label"] == lab][0]
    return c.get("cols", c.get("text"))


def labels_matching(q, pred):
    return [c["label"] for c in q["choices"] if pred(c.get("cols", c.get("text")))]


def only_correct(q, pred, what):
    m = labels_matching(q, pred)
    ok(m == [q["correct"]], f"{q['id']} {what}: 条件に合う選択肢 {m}、正解 {q['correct']}")


def codes(q):
    return [b["text"] for b in q["body"] if b["t"] == "code"]


def tables(q):
    return [b for b in q["body"] if b["t"] == "table"]


def body_text(q):
    out = []
    for b in q["body"]:
        if b["t"] in ("p", "code"):
            out.append(b["text"])
        elif b["t"] == "list":
            out += b["items"]
        elif b["t"] == "table":
            out += [" ".join(r) for r in [b["header"]] + b["rows"]]
        elif b["t"] == "svg":
            out += b["figure_text"]
    return "\n".join(out)


def fnum(s):
    return float(s.replace(",", "").replace("約", "").strip())


# ======================================================================== 形式検査
ok(len(A) == 60 and len(B) == 20, "問題数")
ids = [q["id"] for q in A + B]
ok(len(ids) == len(set(ids)), "ID の重複")
ok(sum(1 for q in A if q["field"] == "テクノロジ") == 41 and sum(1 for q in A if q["field"] == "マネジメント") == 7 and sum(1 for q in A if q["field"] == "ストラテジ") == 12, "科目Aの分野配分 41/7/12")
ok(sum(1 for q in B if q["field"] == "アルゴリズムとプログラミング") == 16 and sum(1 for q in B if q["field"] == "情報セキュリティ") == 4, "科目Bの分野配分 16/4")
for q in A + B:
    labs = [c["label"] for c in q["choices"]]
    ok(labs == list("アイウエオカキク"[:len(labs)]), f"{q['id']} 記号の並び {labs}")
    ok(q["correct"] in labs, f"{q['id']} 正解記号が選択肢にない")
    ok(len(q["explanation"]) >= 60, f"{q['id']} 解説が短い")
    ok(q["round"] == 2 and q["subject"] in ("A", "B"), f"{q['id']} round/subject")
    for k in ("id", "field", "cat", "topic", "skill", "difficulty", "expected_seconds", "source_style", "body", "choices", "correct", "explanation", "verify"):
        ok(k in q, f"{q['id']} 項目 {k} がない")
    if q["subject"] == "A":
        ok(len(labs) == 4 and "choice_header" not in q, f"{q['id']} 科目Aは四肢択一")
    else:
        ok(4 <= len(labs) <= 8, f"{q['id']} 科目Bの選択肢数 {len(labs)}")
    if "choice_header" in q:
        ok(all(len(c["cols"]) == len(q["choice_header"]) for c in q["choices"]), f"{q['id']} 組合せの列数")
    for b in q["body"]:
        if b["t"] == "svg":
            ok(len(b.get("figure_text", [])) >= 2, f"{q['id']} 図の構造の文章がない")
            ok(b["svg"].startswith("<svg") and b["svg"].endswith("</svg>") and "<script" not in b["svg"], f"{q['id']} SVG の形式")
        if b["t"] == "table":
            ok(all(len(r) == len(b["header"]) for r in b["rows"]), f"{q['id']} 表の列数")
    if q["subject"] == "B" and any(b["t"] == "code" and "○" in b["text"] and "[" in b["text"] for b in q["body"]):
        ok(re.search(r"(要素番号は.{0,8}|i は)1から", body_text(q)) is not None, f"{q['id']} 要素番号の開始の明記")
sec_a = sum(q["expected_seconds"] for q in A)
sec_b = sum(q["expected_seconds"] for q in B)
ok(sec_a <= 90 * 60 and sec_b <= 100 * 60, f"想定時間の合計 A {sec_a}秒・B {sec_b}秒")

# ======================================================================== 科目A 独立検算
q = QA["M2A01"]
bits = codes(q)[0].replace(" ", "")
s, e, m = int(bits[0]), int(bits[1:5], 2), bits[5:]
v = (-1) ** s * (1 + sum(int(c) / 2 ** (i + 1) for i, c in enumerate(m))) * 2 ** (e - 7)
only_correct(q, lambda t: abs(fnum(t) - v) < 1e-9, "浮動小数点数の値")

q = QA["M2A02"]
x = 0b00010111
def a02(t):
    sh = [int(n) for n in re.findall(r"左に(\d)ビット", t)]
    val = sum(x << n for n in sh) + (x if "と、x を加える" in t else 0)
    res = re.search(r"結果は ([01]{8})", t).group(1)
    return val == 10 * x and int(res, 2) == 10 * x
only_correct(q, a02, "10倍の手順と結果")

q = QA["M2A04"]
d = [int(t) for t in re.search(r"データ ([\d, ]+) がある", body_text(q)).group(1).split(",")]
y = [2 * t + 3 for t in d]
my = sum(y) / len(y)
vy = sum((t - my) ** 2 for t in y) / len(y)
only_correct(q, lambda t: abs(fnum(re.search(r"分散 ([\d.]+)", t).group(1)) - vy) < 1e-9 and abs(fnum(re.search(r"標準偏差 (約)?([\d.]+)", t).group(2)) - math.sqrt(vy)) < 0.01, "分散と標準偏差")

q = QA["M2A05"]
gram = codes(q)[0]
def derives(sx):
    # BNF を正規表現の再帰の代わりに、文法から生成した有限集合で判定する(長さ8以下)
    expr, term, fac = set(), set(), set()
    for _ in range(8):
        fac |= {"a", "b"} | {"(" + w + ")" for w in expr if len(w) <= 6}
        term |= fac | {t + "*" + f for t in term for f in fac if len(t) + len(f) < 8}
        expr |= term | {e_ + "+" + t for e_ in expr for t in term if len(e_) + len(t) < 8}
    return sx in expr
ok("<式>   ::= <項> | <式> + <項>" in gram, "M2A05 文法の表記")
only_correct(q, derives, "BNF で生成できる文字列")

q = QA["M2A07"]
edges = [re.match(r"(\w) ─ (\w)：距離 (\d+)", t) for t in [b for b in q["body"] if b["t"] == "svg"][0]["figure_text"]]
edges = [(m_.group(1), m_.group(2), int(m_.group(3))) for m_ in edges if m_]
ok(len(edges) == 10, "M2A07 辺の数")
for a_, b_, w_ in edges:
    ok(re.search(rf">{w_}</text>", [b for b in q["body"] if b["t"] == "svg"][0]["svg"]) is not None, f"M2A07 図に距離 {w_} がない")
dist = {n: math.inf for n in "ABCDEF"}
dist["A"] = 0
todo = set("ABCDEF")
while todo:
    u = min(todo, key=lambda n: dist[n])
    todo.remove(u)
    for a_, b_, w_ in edges:
        for p_, r_ in ((a_, b_), (b_, a_)):
            if p_ == u and dist[u] + w_ < dist[r_]:
                dist[r_] = dist[u] + w_
only_correct(q, lambda t: fnum(t) == dist["F"], "最短距離")

q = QA["M2A08"]
def a08(t):
    st = {"A": [None, "B"], "B": ["A", "C"], "C": ["B", None], "N": [None, None]}
    P_ = "B"
    for op in t.split("→"):
        if op == "①":
            st["N"][1] = st[P_][1]
        elif op == "②":
            st["N"][0] = P_
        elif op == "③":
            st[st[P_][1]][0] = "N"
        elif op == "④":
            st[P_][1] = "N"
    return st == {"A": [None, "B"], "B": ["A", "N"], "C": ["N", None], "N": ["B", "C"]}
only_correct(q, a08, "双方向リストの挿入順")

q = QA["M2A09"]
c9 = "○整数型: f(整数型: n)\n  整数型: cnt ← 0\n" + codes(q)[0].replace("処理X", "cnt ← cnt ＋ 1") + "\n  return cnt"
n9 = PS.load(c9)["f"](10)
only_correct(q, lambda t: fnum(t) == n9, "二重ループの回数")

q = QA["M2A10"]
ops = codes(q)[0].split("、")
s1, s2, out = [], [], []
for op in ops:
    if op.startswith("enq"):
        s1.append(op.split()[1])
    else:
        if not s2:
            while s1:
                s2.append(s1.pop())
        out.append(s2.pop())
only_correct(q, lambda t: t == f"取り出した値の順：{', '.join(out)}　S1 の要素数：{len(s1)}", "2スタックのキュー")

q = QA["M2A12"]
w_, h_, bp = [int(t.replace(",", "")) for t in re.search(r"横([\d,]+)画素、縦([\d,]+)画素の画像を、1画素当たり(\d+)ビット", body_text(q)).groups()]
only_correct(q, lambda t: abs(fnum(t) - w_ * h_ * bp / 8 / 1e6) < 1e-9, "画像の容量")

q = QA["M2A13"]
pp, nn = 0.8, 4
only_correct(q, lambda t: abs(fnum(t) - 1 / ((1 - pp) + pp / nn)) < 1e-9, "アムダールの法則")

q = QA["M2A15"]
rows = tables(q)[0]["rows"]
pr = [(r[0], int(r[1]), int(r[2]), int(r[3])) for r in rows]
rem = {p[0]: p[2] for p in pr}
fin, t_, cur = {}, 0, None
while len(fin) < len(pr):
    ready = [p for p in pr if p[1] <= t_ and p[0] not in fin]
    if ready:
        best = min(ready, key=lambda p: (p[3], p[1] if p[0] != cur else -1))
        if cur in [p[0] for p in ready]:
            curp = [p for p in pr if p[0] == cur][0]
            if best[3] < curp[3]:
                cur = best[0]
        else:
            cur = best[0]
        rem[cur] -= 1
        if rem[cur] == 0:
            fin[cur] = t_ + 1
            cur = None
    t_ += 1
tat = sum(fin[p[0]] - p[1] for p in pr) / len(pr)
only_correct(q, lambda t: abs(fnum(t) - tat) < 1e-9, "平均ターンアラウンドタイム")

q = QA["M2A16"]
evs = re.findall(r"(\w)が([PV])操作", codes(q)[0])
S, wait = 2, []
for p_, op in evs:
    if op == "P":
        S -= 1
        if S < 0:
            wait.append(p_)
    else:
        S += 1
        if S <= 0:
            wait.pop(0)
only_correct(q, lambda t: t == f"S の値 {str(S).replace('-', '−')}、待ち状態のプロセス {'、'.join(wait) if wait else 'なし'}", "セマフォ")

q = QA["M2A22"]
db = sqlite3.connect(":memory:")
for tb in tables(q):
    name = tb["caption"].split()[-1]
    db.execute(f"CREATE TABLE {name}({', '.join(tb['header'])})")
    db.executemany(f"INSERT INTO {name} VALUES({', '.join('?' * len(tb['header']))})", [[int(c) if c.isdigit() else c for c in r] for r in tb["rows"]])
res = "、".join(r[0] for r in db.execute(codes(q)[0]))
only_correct(q, lambda t: t == res, "SQL の結果")

q = QA["M2A25"]
def tpl(t):
    held, shrink = set(), False
    for op in t.split(", "):
        k, it = op.split("(")[0], op.split("(")[1][:-1]
        if k == "lock":
            if shrink:
                return False
            held.add(it)
        elif k == "unlock":
            shrink = True
            held.discard(it)
        elif it not in held:
            return False
    return True
only_correct(q, tpl, "2相ロック")

q = QA["M2A28"]
only_correct(q, lambda t: ipaddress.ip_address(t).is_private, "プライベートアドレス")

q = QA["M2A31"]
only_correct(q, lambda t: abs(fnum(t) - 1e6 * 600 * 2e-7) < 1e-6, "誤りビット数")

q = QA["M2A39"]
rules = tables(q)[0]["rows"]
cond = [r[1:] for r in rules[:3]]
act = {"送料を無料にする": "無料", "送料を500円にする": "500円", "送料を1,000円にする": "1,000円"}
def decide(island, member, big):
    vals = [island, member, big]
    for j in range(4):
        if all(cond[i][j] == "－" or (cond[i][j] == "Y") == vals[i] for i in range(3)):
            hits = [act[r[0].replace("動作：", "")] for r in rules[3:] if r[j + 1] == "X"]
            return hits[0]
cases = [it for it in q["body"] if it["t"] == "list"][0]["items"]
exp = []
for c in cases:
    member = "会員でない" not in c
    amt = int(re.search(r"購入金額([\d,]+)円", c).group(1).replace(",", ""))
    island = "離島でない" not in c
    exp.append(decide(island, member, amt >= 5000))
only_correct(q, lambda t: t == "　".join(f"({i + 1}) {v}" for i, v in enumerate(exp)), "決定表の期待結果")

q = QA["M2M01"]
tb = tables(q)[0]
ufp = sum(int(r[1]) * int(r[2]) for r in tb["rows"])
only_correct(q, lambda t: abs(fnum(t) - ufp * (0.65 + 0.01 * 45)) < 1e-9, "ファンクションポイント")

q = QA["M2M02"]
only_correct(q, lambda t: fnum(t) == 8 * 7 // 2 - 5 * 4 // 2, "経路の増加数")

q = QA["M2M03"]
ft = [b for b in q["body"] if b["t"] == "svg"][0]["figure_text"]
vals = [float(v) for v in re.findall(r"日目 ([\d.]+)", ft[1])]
ok(len(vals) == 15, "M2M03 測定値の数")
svg = [b for b in q["body"] if b["t"] == "svg"][0]["svg"]
ok(len(re.findall(r'<circle cx="[\d.]+" cy="[\d.]+" r="3.5"', svg)) == 15, "M2M03 図の点の数")
cys = [float(m_) for m_ in re.findall(r'<circle cx="[\d.]+" cy="([\d.]+)" r="3.5"', svg)]
ok(all(abs((220 - cy) / 190 * 0.40 + 9.80 - v_) < 0.002 for cy, v_ in zip(cys, vals)), "M2M03 図の点の位置と測定値")
abn = [i + 1 for i, v_ in enumerate(vals) if v_ > 10.15 or v_ < 9.85]
for i in range(len(vals) - 6):
    if all(v_ > 10.0 for v_ in vals[i:i + 7]) or all(v_ < 10.0 for v_ in vals[i:i + 7]):
        abn.append(i + 7)
abn = sorted(set(abn))
only_correct(q, lambda t: t == {(4,): "4日目だけ", (15,): "15日目だけ", (4, 15): "4日目と15日目"}.get(tuple(abn)), "管理図の異常")

q = QA["M2M04"]
tb = tables(q)[0]
mat = {r[0]: dict(zip(tb["header"][1:], map(int, r[1:]))) for r in tb["rows"]}
incs = [re.match(r"(\w)：影響度 (\S)、緊急度 (\S)", it) for it in [b for b in q["body"] if b["t"] == "list"][0]["items"]]
order = sorted(incs, key=lambda m_: mat[m_.group(2)][m_.group(3)])
only_correct(q, lambda t: t == "、".join(m_.group(1) for m_ in order), "インシデントの優先順位")

q = QA["M2S01"]
only_correct(q, lambda t: fnum(t) == 1_200_000 - 1_200_000 // 5 * 3, "帳簿価額")
q = QA["M2S02"]
only_correct(q, lambda t: fnum(t) == 50 * 4 + 30, "発注点")
q = QA["M2S04"]
tb = tables(q)[0]
pay = {r[0]: [int(c) for c in r[1:]] for r in tb["rows"]}
mm = max(pay, key=lambda k: min(pay[k]))
only_correct(q, lambda t: t == mm, "マクシミン")

# ======================================================================== 科目B 独立検算
def prog(q):
    return [b["text"] for b in q["body"] if b["t"] == "code"][-1]


def fill(q, lab):
    return PS.fill_blanks(prog(q), dict(zip(q["choice_header"], ctext(q, lab))))


def run_blank(q, test, extra=None, header=None):
    good = []
    for c in q["choices"]:
        vals = c.get("cols") or [c["text"]]
        hdr = q.get("choice_header") or ["a"]
        try:
            ns = PS.load(PS.fill_blanks(prog(q), dict(zip(hdr, vals))), extra=extra)
            if test(ns):
                good.append(c["label"])
        except (PS.OutOfRange, TypeError, IndexError):
            pass
    ok(good == [q["correct"]], f"{q['id']} 空欄: 仕様どおりの選択肢 {good}、正解 {q['correct']}")


rnd = random.Random(99)

def t_b01(ns):
    for _ in range(300):
        d = [rnd.randint(-9, 9) for _ in range(rnd.randint(1, 7))]
        s_ = ns["makePrefix"](PS.A(d))
        l_ = rnd.randint(1, len(d)); r_ = rnd.randint(l_, len(d))
        if ns["rangeSum"](s_, l_, r_) != sum(d[l_ - 1:r_]):
            return False
    return True
run_blank(QB["M2B01"], t_b01)

q = QB["M2B02"]
arr = [int(t) for t in re.search(r"data ＝ \{([\d, ]+)\}", body_text(q)).group(1).split(",")]
r02 = PS.load(prog(q).replace("  return second", "  return {second, upd}"))["secondLargest"](PS.A(arr)).py()
only_correct(q, lambda c: c == [str(r02[0]), str(r02[1])], "戻り値と upd")

q = QB["M2B03"]
ns = PS.load(prog(q))
ns["hanoi"](4, "A", "C", "B")
o = ns["_outs"][9]
only_correct(q, lambda c: c == [str(o[0]), o[1], o[2]], "10行目の出力")

def t_b04(ns):
    for _ in range(500):
        vals = [rnd.randint(1, 4) for _ in range(rnd.randint(0, 5))]
        x_ = rnd.randint(0, 5)
        a_ = PS.A(vals + [0])
        want = vals.index(x_) + 1 if x_ in vals else 0
        if ns["search"](a_, len(vals), x_) != want or a_.py()[:len(vals)] != vals:
            return False
    return True
run_blank(QB["M2B04"], t_b04)

def t_b05(ns):
    for _ in range(300):
        m_ = rnd.randint(0, 6)
        d = [rnd.randint(0, m_) for _ in range(rnd.randint(0, 9))]
        if ns["countSort"](PS.A(d), m_).py() != sorted(d):
            return False
    return True
q = QB["M2B05"]
good = []
for c in q["choices"]:
    a_, b_ = c["cols"]
    code = prog(q).replace("cnt[  a  ] ← cnt[  a  ] ＋ 1", f"cnt[{a_}] ← cnt[{a_}] ＋ 1")
    try:
        if t_b05(PS.load(PS.fill_blanks(code, {"b": b_}))):
            good.append(c["label"])
    except PS.OutOfRange:
        pass
ok(good == [q["correct"]], f"M2B05 空欄 {good}")

q = QB["M2B06"]
strs = dict(re.findall(r"(\w) ＝ \"([^\"]+)\"", body_text(q)))
ns = PS.load(prog(q))
def ref06(s_):
    st = []
    for i, ch in enumerate(s_, 1):
        if ch in "([":
            st.append(ch)
        elif ch in ")]":
            if not st or st[-1] != {")": "(", "]": "["}[ch]:
                return i
            st.pop()
    return -1 if st else 0
for k_, s_ in strs.items():
    ok(ns["check"](PS.Str(s_)) == ref06(s_), f"M2B06 {k_} の結果がコードと参照実装で一致しない")
only_correct(q, lambda c: c == [str(ref06(strs[k])).replace("-", "−") for k in ("X", "Y", "Z")], "括弧の検査")

q = QB["M2B07"]
tb = tables(q)[0]
arr_ = [int(t) for t in tb["rows"][0][1:]]
svc_ = [int(t) for t in tb["rows"][1][1:]]
free = total = 0
for a_, s_ in zip(arr_, svc_):
    st_ = max(a_, free)
    total += st_ - a_
    free = st_ + s_
ok(PS.load(prog(q))["totalWait"](PS.A(arr_), PS.A(svc_)) == total, "M2B07 コードと参照実装")
only_correct(q, lambda c: c == [str(total), str(free)], "待ち時間の合計")

def isprime(k):
    return k >= 2 and all(k % d for d in range(2, int(k ** 0.5) + 1))
run_blank(QB["M2B08"], lambda ns: all(ns["primes"](n).py() == [k for k in range(2, n + 1) if isprime(k)] for n in range(2, 60)))

q = QB["M2B09"]
r = PS.load(prog(q) + "\n  return {p, r}")["main"]().py()
only_correct(q, lambda c: c == ["{" + ", ".join(map(str, r[0])) + "}", str(r[1])], "配列 p と r")

def days(y, m):
    return [31, 29 if (y % 4 == 0 and y % 100 != 0) or y % 400 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
def t_b10(ns):
    for y in (1900, 2000, 2024, 2025):
        dd = datetime.date(y, 1, 1)
        while dd.year == y:
            nx = dd + datetime.timedelta(days=1)
            if ns["nextDay"](dd.year, dd.month, dd.day).py() != [nx.year, nx.month, nx.day]:
                return False
            dd = nx
    return True
run_blank(QB["M2B10"], t_b10, extra={"days": days})

q = QB["M2B11"]
s11 = codes(q)[0].strip('"')
words = len([w for w in s11.split("␣") if w])
ok(PS.load(prog(q))["countWords"](PS.Str(s11)) == words, "M2B11 コードと参照実装")
only_correct(q, lambda t: fnum(t) == words, "単語数")

def t_b12(ns):
    for _ in range(100):
        n = rnd.randint(1, 4)
        X = [[rnd.randint(-4, 4) for _ in range(n)] for _ in range(n)]
        Y = [[rnd.randint(-4, 4) for _ in range(n)] for _ in range(n)]
        if ns["mul"](PS.A(X), PS.A(Y), n).py() != [[sum(X[i][k] * Y[k][j] for k in range(n)) for j in range(n)] for i in range(n)]:
            return False
    return True
run_blank(QB["M2B12"], t_b12)

def t_b13(ns):
    for _ in range(2000):
        res_ = []
        for _ in range(rnd.randint(0, 3)):
            a_ = rnd.randint(0, 9); res_.append((a_, rnd.randint(a_ + 1, 10)))
        s_ = rnd.randint(0, 9); e_ = rnd.randint(s_ + 1, 10)
        want = all(e_ <= a_ or b_ <= s_ for a_, b_ in res_)
        if ns["canReserve"](PS.A([a_ for a_, _ in res_]), PS.A([b_ for _, b_ in res_]), s_, e_) != want:
            return False
    return True
run_blank(QB["M2B13"], t_b13)

q = QB["M2B14"]
def jan(ds):
    return (10 - sum(x_ * (1 if i % 2 == 0 else 3) for i, x_ in enumerate(ds)) % 10) % 10
ns = PS.load(prog(q))
for r_ in tables(q)[0]["rows"]:
    ds = [int(c) for c in r_[1]]
    ok(int(r_[2]) == jan(ds) and int(r_[3]) == ns["checkDigit"](PS.A(ds)), f"M2B14 表の値 {r_}")
fixed = prog(q).replace("  return 10 − (total mod 10)", "  return (10 − (total mod 10)) mod 10")
ns2 = PS.load(fixed)
ok(all(ns2["checkDigit"](PS.A(ds)) == jan(ds) for ds in [[rnd.randint(0, 9) for _ in range(12)] for _ in range(500)]), "M2B14 修正後")
only_correct(q, lambda t: "return (10 − (total mod 10)) mod 10" in t, "修正方法")

q = QB["M2B15"]
s15 = re.search(r"文字列 \"(\w+)\"", body_text(q)).group(1)
cnt = [s15.count(ch) for ch in "abcde"]
best = cnt.index(max(cnt)) + 1
ok(PS.load(prog(q), extra={"idx": lambda c: "abcde".index(c) + 1})["mostFrequent"](PS.Str(s15)) == best, "M2B15 コードと参照実装")
only_correct(q, lambda c: c == ["{" + ", ".join(map(str, cnt)) + "}", str(best)], "最頻の文字")

q = QB["M2B16"]
ns = PS.load(prog(q))
for x_ in (50, 30, 70, 20, 40, 60):
    ns["insert"](x_)
for r_ in tables(q)[0]["rows"]:
    i = int(r_[0])
    ok([ns["val"][i], ns["left"][i], ns["right"][i]] == [int(c) for c in r_[1:]], f"M2B16 表の行 {r_}")
for x_ in (35, 65):
    ns["insert"](x_)
only_correct(q, lambda c: c == [str(ns["left"][5]), str(ns["right"][6]), str(ns["left"][3])], "挿入後の値")

q = QB["M2B18"]
tb = tables(q)[1]
bad = []
for r_ in tb["rows"]:
    v_ = (r_[3] == "公開" and not r_[1].startswith("一般公開用")) or (r_[2] == "あり" and (r_[4] != "有効" or r_[5] != "有効"))
    if v_:
        bad.append(r_[0])
only_correct(q, lambda c: c[0].endswith("、".join(bad)) and c[1].endswith("G社"), "違反のバケットと責任")

q = QB["M2B19"]
rej = []
for r_ in tables(q)[0]["rows"]:
    dom = r_[1].split("@")[1]
    if not ((r_[2] == "pass" and r_[3] == dom) or (r_[4] == "pass" and r_[5] == dom)):
        rej.append(r_[0])
only_correct(q, lambda t: t == "、".join(rej), "DMARC で拒否されるメール")

q = QB["M2B20"]
A_, B_ = [], []
for r_ in tables(q)[1]["rows"]:
    net = r_[2].startswith("インターネット"); ex = r_[4] == "あり"; cv = float(r_[3])
    if ex and net:
        A_.append(r_[0])
    elif cv >= 9.0 or ex:
        B_.append(r_[0])
only_correct(q, lambda c: c == ["、".join(A_), "、".join(B_)], "優先度A・B")

q = QB["M2B17"]
only_correct(q, lambda t: t == "3, 4", "手順に反する行動")

# ======================================================================== 正解記号の分布
from collections import Counter
dist_a = Counter(q["correct"] for q in A)
dist_b = Counter(q["correct"] for q in B)
calc_ids = sorted(q["id"] for q in A + B if q["skill"] in ("計算", "追跡", "仕様読解", "図表読解"))
print(f"独立検算・形式検査：{OKN[0] + len(NG)}項目、NG {len(NG)}")
print("正解記号の分布 科目A:", dict(sorted(dist_a.items())), " 科目B:", dict(sorted(dist_b.items())))
print(f"想定時間の合計 科目A {sec_a}秒（{sec_a / 60:.1f}分）、科目B {sec_b}秒（{sec_b / 60:.1f}分）")
for m_ in NG:
    print("NG:", m_)
sys.exit(1 if NG else 0)
