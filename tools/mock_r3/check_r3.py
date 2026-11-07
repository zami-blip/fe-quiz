"""第3回模試 80問の独立検算・形式検査。
作成用の build_*.py / A_*.py / B_*.py は読み込まず、アプリに組み込む JSON(問題文・表・図の構造の文章・コード・選択肢)
だけから値を求め直して、条件を満たす選択肢がちょうど1つ(正解記号)であることを確かめる。
科目Bのプログラムは、問題文の〔プログラム〕の文字列そのものを pseudo.py で実行する(空欄は各選択肢を埋めて実行)。
使い方: python3 check_r3.py ../../src/mock/r3/mockA3.json ../../src/mock/r3/mockB3.json
"""
import heapq
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
LAB = "アイウエオカキクケコ"


def ok(cond, msg):
    if cond:
        OKN[0] += 1
    else:
        NG.append(msg)


def ctext(q, lab):
    c = [x for x in q["choices"] if x["label"] == lab][0]
    return c.get("cols", c.get("text"))


def only(q, pred, what):
    m = [c["label"] for c in q["choices"] if pred(c.get("cols", c.get("text")))]
    ok(m == [q["correct"]], f"{q['id']} {what}: 条件に合う選択肢 {m}、正解 {q['correct']}")


def body(q, t=None):
    return [b for b in q["body"] if t is None or b["t"] == t]


def text(q):
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


def num(s):
    return float(str(s).replace(",", "").replace("−", "-").replace("年目", "").replace("月末", ""))


def call(ns, fn, *args, limit=20000):
    ns["_steps"][0] = 0
    ns["_limit"][0] = limit
    return ns[fn](*args)


def run_ok(f):
    try:
        return f()
    except (PS.OutOfRange, PS.TooLong, IndexError, TypeError, ZeroDivisionError, RecursionError):
        return False


# ======================================================================== 形式検査
ok(len(A) == 60 and len(B) == 20, "問題数")
ids = [q["id"] for q in A + B]
ok(len(ids) == len(set(ids)) and ids == [f"M3A{i:02d}" for i in range(1, 61)] + [f"M3B{i:02d}" for i in range(1, 21)], "ID")
fa = {}
for q in A:
    fa[q["field"]] = fa.get(q["field"], 0) + 1
ok(fa == {"テクノロジ": 41, "マネジメント": 7, "ストラテジ": 12}, f"科目Aの分野 {fa}")
ok(sum(q["field"] == "情報セキュリティ" for q in B) == 4 and sum(q["field"] == "アルゴリズムとプログラミング" for q in B) == 16, "科目Bの分野")
for sub, qs, want in (("A", A, {"易": 18, "標準": 33, "難": 9}), ("B", B, {"易": 6, "標準": 11, "難": 3})):
    d = {}
    for q in qs:
        d[q["difficulty"]] = d.get(q["difficulty"], 0) + 1
    ok(d == want, f"{sub}の難度 {d}")
ok(sum(q["expected_seconds"] for q in A) <= 85 * 60 and sum(q["expected_seconds"] for q in B) <= 95 * 60, "想定時間の合計が見直しの時間を残す")
KEYS = {"id", "subject", "round", "field", "cat", "topic", "skill", "difficulty", "expected_seconds", "source_style", "body", "choices", "correct", "explanation", "verify"}
for q in A + B:
    labs = [c["label"] for c in q["choices"]]
    ok(labs == list(LAB[:len(labs)]), f"{q['id']} 記号の並び")
    ok(q["correct"] in labs, f"{q['id']} 正解記号")
    ok(KEYS <= set(q) and q["round"] == 3 and q["subject"] == q["id"][2], f"{q['id']} 項目")
    ok(len(labs) == 4 if q["subject"] == "A" else 4 <= len(labs) <= 10, f"{q['id']} 選択肢の数 {len(labs)}")
    if "choice_header" in q:
        ok(all(len(c["cols"]) == len(q["choice_header"]) for c in q["choices"]), f"{q['id']} 組合せの列数")
    else:
        ok(all(c.get("text") for c in q["choices"]), f"{q['id']} 選択肢の文字列")
    for b in q["body"] + q.get("explain", []):
        ok(b["t"] in ("p", "code", "list", "table", "svg"), f"{q['id']} ブロックの種類 {b['t']}")
        if b["t"] == "table":
            ok(all(len(r) == len(b["header"]) for r in b["rows"]), f"{q['id']} 表の列数")
        if b["t"] == "svg":
            ok(b["svg"].startswith("<svg") and b["svg"].endswith("</svg>") and b.get("figure_text"), f"{q['id']} 図と図の構造")
        if b["t"] == "p":
            ok(len(b["text"]) <= 400, f"{q['id']} 段落が長すぎる（{len(b['text'])}字）")
    ok(len(q["explanation"]) >= 60 and "if False" not in q["explanation"], f"{q['id']} 解説")
for q in B:
    if q["field"] != "情報セキュリティ":
        cs = body(q, "code")
        ok(cs and all("\n" in c["text"] for c in cs), f"{q['id']} コードの改行")
        ok(all(not re.search(r"^ {0,1}\S", ln) or ln.startswith(("○", "大域")) for c in cs for ln in c["text"].split("\n") if ln.strip()),
           f"{q['id']} 関数の本体の字下げ")

# ======================================================================== 科目A
# A01 8進数→16進数
q = QA["M3A01"]
v = int(re.search(r"8進数の (\d+)", text(q)).group(1), 8)
only(q, lambda c: c == format(v, "X"), "8進→16進")

# A02 回路(図の構造の文章から)
q = QA["M3A02"]
ft = " ".join(body(q, "svg")[0]["figure_text"])
gates = re.findall(r"(G\d) は (\w) と (\w) を入力とする NAND", ft)
ok(len(gates) == 3 and "G4 は G1、G2、G3 の出力を入力とする3入力の NAND" in ft, "M3A02 図の構造")
nand = lambda *x: 0 if all(x) else 1


def y2(env):
    g = {n: nand(env[a], env[b]) for n, a, b in gates}
    return nand(*g.values())


rows = [dict(zip("ABC", r)) for r in itertools.product((0, 1), repeat=3)]
SEM = {"全て1のときだけ": lambda e: int(all(e.values())), "1の個数が奇数": lambda e: sum(e.values()) % 2,
       "2つ以上が1": lambda e: int(sum(e.values()) >= 2), "少なくとも1つが1": lambda e: int(any(e.values()))}
only(q, lambda c: all(next(f for k, f in SEM.items() if k in c)(e) == y2(e) for e in rows), "回路の真理値表")

# A03 正規表現
q = QA["M3A03"]
pat = body(q, "code")[0]["text"].strip()
only(q, lambda c: re.fullmatch(pat, c) is not None, "正規表現")

# A05 2進で有限桁
q = QA["M3A05"]
only(q, lambda c: (Fraction(c).denominator & (Fraction(c).denominator - 1)) == 0, "2進有限小数")

# A06 経路数
q = QA["M3A06"]
t = body(q, "table")[0]
names = t["header"][1:]
adj = {r[0]: {names[i]: int(x) for i, x in enumerate(r[1:])} for r in t["rows"]}
cnt = sum(1 for a in names for b in names if adj["P"][a] and adj[a][b] and adj[b]["Q"])
only(q, lambda c: int(c) == cnt, "3回の移動の経路数")

# A07
q = QA["M3A07"]
only(q, lambda c: abs(float(c) - 0.8 * (6000 / 2000) ** 2) < 1e-9, "2乗に比例")

# A08 流れ図(図の構造の文章の処理を実行)
q = QA["M3A08"]
ft = " ".join(body(q, "svg")[0]["figure_text"])
ok("x ← x ÷ 2" in ft and "x ← 3 × x ＋ 1" in ft and "c ← c ＋ 1" in ft and "x ＞ 1" in ft, "M3A08 図の構造")
n = int(re.search(r"n に(\d+)を入力", text(q)).group(1))
x, c = n, 0
while x > 1:
    x = x // 2 if x % 2 == 0 else 3 * x + 1
    c += 1
only(q, lambda s: int(s) == c, "流れ図の出力")

# A09 再帰の定義
q = QA["M3A09"]
code = body(q, "code")[0]["text"]
ok("f(n − 1) ＋ f(n − 3)" in code and "n ≦ 3 のとき　f(n) ＝ 1" in code, "M3A09 定義")
F = {1: 1, 2: 1, 3: 1}
for k in range(4, 9):
    F[k] = F[k - 1] + F[k - 3]
only(q, lambda s: int(s) == F[8], "f(8)")

# A12 ダイレクトマップ
q = QA["M3A12"]
tx = text(q)
size = int(re.search(r"\((\d,?\d+)バイト\)|（(\d,?\d+)バイト）", tx).group(2).replace(",", ""))
line = int(re.search(r"大きさが(\d+)バイト", tx).group(1))
base = int(re.search(r"アドレス (\w+)（16進数）のデータ", tx).group(1), 16)
nl = size // line
only(q, lambda s: (int(s, 16) // line) % nl == (base // line) % nl, "同じライン")

# A14 パイプライン
q = QA["M3A14"]
tx = text(q)
st_ = int(re.search(r"(\d+)段のパイプライン", tx).group(1))
ni = int(re.search(r"動的な命令数）は合計(\d+)", tx).group(1))
ok("分岐による空き以外に、パイプラインの待ちや空きは生じない" in tx, "M3A14 前提の明示")
nb = int(re.search(r"分岐が(\d+)回", tx).group(1))
pen = int(re.search(r"(\d+)サイクルの空き", tx).group(1))
only(q, lambda s: int(s) == st_ + ni - 1 + nb * pen, "サイクル数")

# A15 FIFO
q = QA["M3A15"]
refs = [int(x) for x in body(q, "code")[0]["text"].split(",")]


def fifo(k):
    fr, f = [], 0
    for p in refs:
        if p not in fr:
            f += 1
            if len(fr) == k:
                fr.pop(0)
            fr.append(p)
    return f


only(q, lambda cs: [int(x) for x in cs] == [fifo(3), fifo(4)], "FIFO のフォールト回数")

# A16 クラスタ
q = QA["M3A16"]
tx = text(q)
cl = int(re.search(r"([\d,]+)バイトのクラスタ", tx).group(1).replace(",", ""))
sizes = [int(s.replace(",", "")) for s in re.findall(r"([\d,]+)バイト", tx.split("大きさが")[1].split("の4つ")[0])]
ok(len(sizes) == 4, "M3A16 ファイルの数")
only(q, lambda s: num(s) == sum(math.ceil(z / cl) for z in sizes) * cl, "割り当てる領域")

# A17 ベストフィット
q = QA["M3A17"]
t1, t2 = body(q, "table")
blocks = [(h, int(re.sub(r"\D", "", v))) for h, v in zip(t1["header"][1:], t1["rows"][0][1:])]
reqs = [(h, int(re.sub(r"\D", "", v))) for h, v in zip(t2["header"][1:], t2["rows"][0][1:])]
free = dict(blocks)
where = None
for r, z in reqs:
    cands = [b for b, _ in blocks if free[b] >= z]
    where = min(cands, key=lambda k: free[k]) if cands else None
    if where:
        free[where] -= z
only(q, lambda s: s == (where or "どの空き領域にも割り当てられない"), "R5 の割当て先")

# A19 3台中2台
q = QA["M3A19"]
r = 0.9
only(q, lambda s: abs(float(s) - (r ** 3 + 3 * r * r * (1 - r))) < 5e-4, "2/3 の稼働率")

# A21 RPO/RTO
q = QA["M3A21"]
t = body(q, "table")[0]
good = [row[0] for row in t["rows"] if num(row[1].replace("時間ごと", "")) <= 4 and 0.5 + num(row[2].replace("時間", "")) <= 2]
only(q, lambda s: [s] == good, "RPO・RTO")

# A22 SQL(表と SQL 文を SQLite で実行)
q = QA["M3A22"]
tc, to = body(q, "table")
db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE 顧客(顧客ID, 地域)")
db.execute("CREATE TABLE 注文(注文ID, 顧客ID, 金額)")
db.executemany("INSERT INTO 顧客 VALUES (?,?)", tc["rows"])
db.executemany("INSERT INTO 注文 VALUES (?,?,?)", [(a, b, int(c.replace(",", ""))) for a, b, c in to["rows"]])
res = {r_[0]: r_[1:] for r_ in db.execute(body(q, "code")[0]["text"].replace("＝", "="))}
only(q, lambda cs: [int(x) for x in cs] == [res["東"][0], res["東"][1], res["西"][0], res["西"][1]], "SQL の結果")

# A23 候補キー
q = QA["M3A23"]
fds = [(set(re.sub(r"[{}, ]", "", l)), set(r_.strip())) for l, r_ in (ln.split("→") for ln in body(q, "code")[0]["text"].split("\n"))]
attrs = set("ABCDE")


def clo(xs):
    c_ = set(xs)
    while True:
        add = set().union(*[r_ for l, r_ in fds if l <= c_]) - c_
        if not add:
            return c_
        c_ |= add


supers = [set(k) for n in range(1, 6) for k in itertools.combinations("ABCDE", n) if clo(k) == attrs]
cands = [k for k in supers if not any(o < k for o in supers)]
only(q, lambda s: set(re.sub(r"[{}, ]", "", s)) in cands, "候補キー")

# A24 更新の消失
q = QA["M3A24"]
only(q, lambda cs: "更新の消失" in cs[0] and int(cs[1]) == 100 - 50, "更新の消失")

# A27 サブネット
q = QA["M3A27"]
net = ipaddress.ip_network(re.search(r"(\d+\.\d+\.\d+\.\d+/\d+)", text(q)).group(1))
pl = int(re.search(r"/(\d+) のサブネット", text(q)).group(1))
subs = list(net.subnets(new_prefix=pl))
only(q, lambda cs: [int(x) for x in cs] == [len(subs), subs[0].num_addresses - 2], "サブネット")

# A28 VLAN(図の構造の文章から)
q = QA["M3A28"]
ft = " ".join(body(q, "svg")[0]["figure_text"])
pcs = dict((m[0], (m[1], m[2])) for m in re.findall(r"PC (\w)（(VLAN\d+)、([\d./]+)）", ft))
routed = set(re.findall(r"(VLAN\d+) に [\d.]+/24", ft))
ok(len(pcs) == 4 and routed == {"VLAN10", "VLAN20"}, f"M3A28 図の構造 {pcs} {routed}")


def can(a, b):
    if pcs[a][0] == pcs[b][0]:
        return ipaddress.ip_interface(pcs[a][1]).network == ipaddress.ip_interface(pcs[b][1]).network
    return pcs[a][0] in routed and pcs[b][0] in routed


pairs = {frozenset(p) for p in itertools.combinations(sorted(pcs), 2) if can(*p)}
only(q, lambda s: "全て" not in s and "だけ" not in s and {frozenset(re.findall(r"[A-D]", x)) for x in s.split("、")} == pairs
     or ("だけ" in s and {frozenset(re.findall(r"[A-D]", s))} == pairs), "通信できる組")

# A30 遅延
q = QA["M3A30"]
only(q, lambda s: abs(float(s) - 2 * (1500 * 8 / 100e6 * 1000 + 1000 / 200000 * 1000)) < 1e-9, "伝送・伝搬遅延")

# A32 MAC 学習
q = QA["M3A32"]
t1, t2 = body(q, "table")
port = {pc: int(p) for p, pc in zip(t1["header"][1:], t1["rows"][0][1:])}
tbl, outs = {}, []
for _, s, d in t2["rows"]:
    tbl[s] = port[s]
    outs.append([tbl[d]] if d in tbl else [p for p in sorted(port.values()) if p != port[s]])
only(q, lambda cs: [[int(x) for x in c_.split(",")] for c_ in cs] == outs[3:5], "転送先ポート")

# A38 図の数値と SVG の点の位置の照合
q = QA["M3A38"]
svg = body(q, "svg")[0]["svg"]
ft = body(q, "svg")[0]["figure_text"]
X_ = [int(v) for v in re.findall(r"\d+", ft[1].split("それぞれ")[1])]
Y_ = [int(v) for v in re.findall(r"\d+", ft[2].split("それぞれ")[1])]
cx = [(float(a), float(b)) for a, b in re.findall(r'<circle cx="([\d.]+)" cy="([\d.]+)" r="4"', svg)]
ok([round((300 - y) * 60 / 250) for _, y in cx[:9]] == X_, "M3A38 図の点(X)と構造の文章")
ry = [(float(a) + 4, float(b) + 4) for a, b in re.findall(r'<rect x="([\d.]+)" y="([\d.]+)" width="8" height="8"', svg)][:9]
ok([round((300 - y) * 60 / 250) for _, y in ry] == Y_, "M3A38 図の点(Y)と構造の文章")
ok(X_[-1] - X_[-3] <= 1 and len(set(b - a for a, b in zip(Y_[-4:], Y_[-3:]))) == 1, "M3A38 X は収束、Y は一定の増加")

# A39 状態遷移
q = QA["M3A39"]
ft = " ".join(body(q, "svg")[0]["figure_text"])
TR = {(a, e): b for a, b, e in re.findall(r"(\w+) → (\w+)（イベント：(\w+)", ft)}
ok(len(TR) == 5, f"M3A39 遷移 {TR}")


def acc(seq):
    s = "受付済"
    for e in seq:
        if (s, e) not in TR:
            return False
        s = TR[(s, e)]
    return True


only(q, lambda s: acc([x.strip() for x in s.split("→")]), "受け付けられるイベント列")

# A41 ベロシティ
q = QA["M3A41"]
vs = [int(x) for x in re.search(r"(\d+)、(\d+)、(\d+) であった", text(q)).groups()]
only(q, lambda s: int(s) == math.ceil(130 / (sum(vs) / 3)), "スプリント数")

# A42 三点見積り
only(QA["M3A42"], lambda s: int(s) == (6 + 4 * 9 + 18) / 6, "三点見積り")

# A43 EVM
q = QA["M3A43"]
vals = {r_[0][r_[0].index("（") + 1:-1]: num(r_[1]) for r_ in body(q, "table")[0]["rows"]}
only(q, lambda s: num(s) == vals["BAC"] / (vals["EV"] / vals["AC"]), "EAC")

# A44 山崩し(表から全探索)
q = QA["M3A44"]
T_ = {r_[0]: (int(r_[1][:-1]), int(r_[2][:-1]), [] if r_[3] == "なし" else r_[3].split("、")) for r_ in body(q, "table")[0]["rows"]}
order = list(T_)
es = {}
for t in order:
    es[t] = max([es[p] + T_[p][0] for p in T_[t][2]], default=0)
L = max(es[t] + T_[t][0] for t in order)
bestp = None
for combo in itertools.product(*[range(0, L - T_[t][0] + 1) for t in order]):
    st = dict(zip(order, combo))
    if all(st[t] >= max([st[p] + T_[p][0] for p in T_[t][2]], default=0) for t in order):
        load = [0] * L
        for t in order:
            for k in range(st[t], st[t] + T_[t][0]):
                load[k] += T_[t][1]
        bestp = max(load) if bestp is None else min(bestp, max(load))
ok(L == 7, "M3A44 最短の日数")
load_es = [0] * L
for t in order:
    for k in range(es[t], es[t] + T_[t][0]):
        load_es[k] += T_[t][1]
ok(max(load_es) == 6 and [i + 1 for i, v in enumerate(load_es) if v == 6] == [3] and load_es[3] == 5, f"M3A44 最早開始の日別人数 {load_es}")
ok("6人になるのは3日目" in q["explanation"] and "4日目は B3＋C2 の5人" in q["explanation"], "M3A44 解説の日別人数")
only(q, lambda s: int(s) == bestp, "山崩しの最大人数")

# A46 キャパシティ
q = QA["M3A46"]
us = [int(x) for x in body(q, "table")[0]["rows"][0][1:]]
avg = (us[-1] - us[0]) / (len(us) - 1)
k = math.floor((800 - us[-1]) / avg) + 1
mon = ["8月", "9月", "10月", "11月", "12月", "翌年1月", "翌年2月", "翌年3月", "翌年4月", "翌年5月"][k - 1]
only(q, lambda s: s == mon + "末", "しきい値を超える月")

# A49 指数平滑
f7 = 500 + 0.3 * (560 - 500)
only(QA["M3A49"], lambda s: abs(float(s) - (f7 + 0.3 * (540 - f7))) < 1e-9, "指数平滑")

# A50 製品の撤退
q = QA["M3A50"]
rows = {r_[0]: [num(x) for x in r_[1:]] for r_ in body(q, "table")[0]["rows"]}
common = sum(rows["共通固定費の配賦額"])
after = sum(rows["売上高"][i] - rows["変動費"][i] - rows["個別固定費"][i] for i in (0, 2)) - common
only(q, lambda s: num(s) == after, "撤退後の営業利益")

# A51 高低点法
q = QA["M3A51"]
d51 = [(num(r_[1]), num(r_[2])) for r_ in body(q, "table")[0]["rows"]]
hi, lo = max(d51), min(d51)
rate = (hi[1] - lo[1]) / (hi[0] - lo[0])
only(q, lambda s: num(s) == hi[1] - rate * hi[0], "固定費")

# A52 定期発注
only(QA["M3A52"], lambda s: int(s) == (7 + 3) * 40 + 60 - 250 - 30, "発注量")

# A58 TCO
q = QA["M3A58"]
rows = body(q, "table")[0]["rows"]
on0, cl0 = num(rows[0][1]), num(rows[0][2])
ony, cly = num(rows[1][1]), num(rows[1][2])
ren = num(rows[2][1])
yr = next(n for n in range(1, 40) if on0 + ony * n + (ren if n >= 5 else 0) < cl0 + cly * n)
only(q, lambda s: num(s) == yr, "累計の逆転")

# A60 スイムレーン(図の構造の文章から活動の担当部門を確認)
q = QA["M3A60"]
ft = " ".join(body(q, "svg")[0]["figure_text"])
lane = {act: dep for dep, act in re.findall(r"(顧客|営業部|倉庫|経理部)「([^」]+)」", ft)}
ok(lane.get("在庫を確認する") == "営業部" and lane.get("請求書を発行する") == "経理部" and lane.get("納期を回答する") == "営業部", f"M3A60 {lane}")
ok("［在庫なし］：営業部「納期を回答する」" in ft and "倉庫「出荷する」→ 経理部「請求書を発行する」" in ft, "M3A60 流れ")

# ======================================================================== 科目B
R = random.Random(2026)


def blank_check(q, test, extra=None, n_header=None):
    """各選択肢で空欄を埋めて test(ns) を実行し、全て成功するのが正解だけであることを確かめる。"""
    code = body(q, "code")[0]["text"]
    passed = []
    for c in q["choices"]:
        ns = PS.load(PS.fill_blanks(code, dict(zip(q["choice_header"], c["cols"]))), extra=extra)
        if run_ok(lambda: test(ns)):
            passed.append(c["label"])
    ok(passed == [q["correct"]], f"{q['id']} 空欄: 仕様どおりの選択肢 {passed}、正解 {q['correct']}")


def all_true(gen):
    for g in gen:
        if not g:
            return False
    return True


# B01
def t_b01(ns):
    def cases():
        for n in range(1, 7):
            for _ in range(25):
                sc = R.sample(range(10, 99), n)
                rank = [sorted(sc, reverse=True).index(v) + 1 for v in sc]
                for k in range(1, n + 1):
                    yield call(ns, "topSum", PS.A(sc), PS.A(rank), k) == sum(sorted(sc, reverse=True)[:k])
    return all_true(cases())


blank_check(QB["M3B01"], t_b01)


# B02(追跡)
q = QB["M3B02"]
code = body(q, "code")[0]["text"].replace("  return best", "  return {best, buy, sell}")
price = [int(x) for x in re.findall(r"\d+", [b["text"] for b in body(q, "p") if b["text"].startswith("price ＝")][0])]
got = call(PS.load(code), "bestGain", PS.A(price)).py()
only(q, lambda cs: [int(x) for x in cs] == got, "戻り値・buy・sell")

# B03
q = QB["M3B03"]
ns = PS.load(body(q, "code")[0]["text"])
call(ns, "power", 2, 13)
outs = ns["_outs"]
only(q, lambda cs: [int(x) for x in cs[0].split(",")] == [o[0] for o in outs] and int(cs[1]) == outs[2][1], "出力の順と3行目")


# B04
def t_b04(ns):
    return all_true(call(ns, "isqrt", n) == math.isqrt(n) for n in list(range(0, 300)) + [10 ** 6, 99999])


blank_check(QB["M3B04"], t_b04)


# B05
def t_b05(ns):
    def cases():
        for _ in range(600):
            x = sorted(R.randint(0, 9) for _ in range(R.randint(0, 5)))
            y = sorted(R.randint(0, 9) for _ in range(R.randint(0, 5)))
            yield call(ns, "merge", PS.A(x), PS.A(y)).py() == sorted(x + y)
    return all_true(cases())


blank_check(QB["M3B05"], t_b05)

# B06
q = QB["M3B06"]
code = body(q, "code")[0]["text"]
arr = [int(x) for x in re.findall(r"−?\d+", [b["text"] for b in body(q, "p") if b["text"].startswith("a ＝")][0])]
mx = [0]
code_m = code.replace("    st[top] ← i\n", "    st[top] ← i\n    if (top ＞ mx)\n      mx ← top\n    endif\n").replace("  整数型: i\n", "  整数型: i\n  整数型: mx ← 0\n").replace("  return ans", "  return {ans, mx}")
ans, m6 = call(PS.load(code_m), "nextGreater", PS.A(arr)).py()
want = [next((v for v in arr[i + 1:] if v > arr[i]), -1) for i in range(len(arr))]
ok(ans == want, "M3B06 プログラムの戻り値が仕様と一致")
only(q, lambda cs: [int(x.replace("−", "-")) for x in re.findall(r"−?\d+", cs[0])] == ans and int(cs[1]) == m6, "戻り値と top の最大")

# B07
q = QB["M3B07"]
code = body(q, "code")[0]["text"].replace("  return res", "  return {res, head}")
r7 = call(PS.load(code), "windowSums", PS.A([4, 7, 1, 8, 2, 6]), 3).py()
ok(r7[0] == [sum([4, 7, 1, 8, 2, 6][i:i + 3]) for i in range(4)], "M3B07 仕様と一致")
only(q, lambda cs: [int(x) for x in re.findall(r"\d+", cs[0])] == r7[0] and int(cs[1]) == r7[1], "res と head")


# B08
def t_b08(ns):
    def cases():
        for _ in range(800):
            a = [R.randint(1, 6) for _ in range(R.randint(1, 7))]
            s_ = R.randint(1, 12)
            yield call(ns, "countSegments", PS.A(a), s_) == sum(1 for i in range(len(a)) for j in range(i, len(a)) if sum(a[i:j + 1]) == s_)
    return all_true(cases())


blank_check(QB["M3B08"], t_b08)

# B09
q = QB["M3B09"]
ns = PS.load(body(q, "code")[0]["text"])
call(ns, "main")
o = ns["_outs"][0]
only(q, lambda cs: [int(x) for x in re.findall(r"\d+", cs[0])] == o[0].py() and [int(x) for x in re.findall(r"\d+", cs[1])] == o[1].py() and int(cs[2]) == o[2], "p・q・c1＋c2")


# B10
def fee(t):
    tot = 0
    while t > 1440:
        tot += 900
        t -= 1440
    if tot == 0 and t <= 30:
        return 0
    return tot + min(900, 100 * math.ceil(t / 20))


blank_check(QB["M3B10"], lambda ns: all_true(call(ns, "fee", t) == fee(t) for t in range(0, 3000)))


# B11
def t_b11(ns):
    def cases():
        for _ in range(500):
            parts = [(R.choice("abc"), R.randint(1, 130)) for _ in range(R.randint(1, 4))]
            yield call(ns, "expandedLength", PS.Str("".join(ch + str(n) for ch, n in parts))) == sum(n for _, n in parts)
    return all_true(cases())


blank_check(QB["M3B11"], t_b11, extra={"isDigit": lambda c: c.isdigit(), "digitValue": lambda c: int(c)})

# B12
q = QB["M3B12"]
g = [[int(x) for x in r_[1:]] for r_ in body(q, "table")[0]["rows"]]
ns = PS.load(body(q, "code")[0]["text"])
pos = [tuple(int(x) for x in m) for m in re.findall(r"around\(g, (\d), (\d)\)", [b["text"] for b in body(q, "p") if "戻り値の組合せ" in b["text"]][0])]


def around(r_, c_):
    return sum(g[rr - 1][cc - 1] for rr in range(r_ - 1, r_ + 2) for cc in range(c_ - 1, c_ + 2)
               if (rr, cc) != (r_, c_) and 1 <= rr <= len(g) and 1 <= cc <= len(g[0]))


vals = [call(ns, "around", PS.A(g), *p) for p in pos]
ok(vals == [around(*p) for p in pos] and len(pos) == 3, "M3B12 仕様と一致")
only(q, lambda cs: [int(x) for x in cs] == vals, "around の値")


# B13
def t_b13(ns):
    def cases():
        for _ in range(500):
            size = R.randint(1, 8)
            k = R.randint(0, size)
            nodes = R.sample(range(1, size + 1), k)
            nx = [R.randint(0, size) for _ in range(size)]
            for i, v in enumerate(nodes):
                nx[v - 1] = nodes[i + 1] if i + 1 < len(nodes) else 0
            arr = PS.A(list(nx))
            h = call(ns, "reverse", arr, nodes[0] if nodes else 0)
            seq, c_ = [], h
            while c_ != 0 and len(seq) < 20:
                seq.append(c_)
                c_ = arr.py()[c_ - 1]
            yield seq == nodes[::-1]
    return all_true(cases())


blank_check(QB["M3B13"], t_b13)

# B14(元のプログラムが誤る入力と、修正の効果を実行で確かめる)
q = QB["M3B14"]
code = body(q, "code")[0]["text"]


def wrong(c_, a):
    arr = PS.A(list(a))
    try:
        k = call(PS.load(c_), "compact", arr)
    except PS.OutOfRange:
        return True
    u = sorted(set(a))
    return not (k == len(u) and arr.py()[:k] == u)


FIX = {"k の初期値を0にする": code.replace("整数型: k ← 1", "整数型: k ← 0"),
       "for 文の前に、n が0なら0を返す処理を追加する": code.replace("  整数型: i\n", "  整数型: i\n  if (n ＝ 0)\n    return 0\n  endif\n", 1)}
INP = {"{}（要素数0）": [], "{7}（要素数1）": [7], "{2, 2, 2}": [2, 2, 2]}
tests = [[]] + [sorted(R.randint(0, 4) for _ in range(R.randint(1, 7))) for _ in range(800)]
only(q, lambda cs: wrong(code, INP[cs[0]]) and not any(wrong(FIX[cs[1]], a) for a in tests), "誤る入力と修正")


# B15
def t_b15(ns):
    def cases():
        for _ in range(400):
            lots = [(R.randint(1, 9), R.randint(90, 130)) for _ in range(R.randint(1, 5))]
            ships = [R.randint(1, 12) for _ in range(R.randint(1, 5))]
            ns["qty"], ns["cost"], ns["head"], ns["stock"] = PS.A([a for a, _ in lots]), PS.A([b for _, b in lots]), 1, sum(a for a, _ in lots)
            rem = [list(l) for l in lots]
            stock = sum(a for a, _ in lots)
            want = []
            for x in ships:
                if x > stock:
                    want.append(-1)
                    continue
                stock -= x
                tot = 0
                for l in rem:
                    t = min(l[0], x)
                    tot += t * l[1]
                    l[0] -= t
                    x -= t
                want.append(tot)
            yield [call(ns, "ship", x) for x in ships] == want
    return all_true(cases())


blank_check(QB["M3B15"], t_b15)


# B16
def t_b16(ns):
    def cases():
        for _ in range(800):
            n = R.randint(1, 14)
            h = [R.randint(1, 30) for _ in range(n)]
            heapq.heapify(h)
            h[0] = R.randint(1, 40)
            arr = PS.A(list(h))
            call(ns, "downHeap", arr, n)
            v = arr.py()
            yield all(v[(i - 1) // 2] <= v[i] for i in range(1, n)) and sorted(v) == sorted(h)
    return all_true(cases())


blank_check(QB["M3B16"], t_b16)

ok("x が false のとき y は評価しない" in text(QB["M3B16"]), "M3B16 and の評価の明記")
ok("改ざんされていない" not in json.dumps(QB["M3B19"], ensure_ascii=False) and "署名の対象としたヘッダと本文" in QB["M3B19"]["explanation"], "M3B19 DKIM の範囲")
ok("端末から出ない" not in json.dumps(QA["M3A33"], ensure_ascii=False) and "認証先の Web サービスに送らない" in ctext(QA["M3A33"], QA["M3A33"]["correct"]), "M3A33 秘密鍵の記述")
ok("可能性が高い" not in QA["M3A34"]["explanation"] and "許可したファイルの一覧" in ctext(QA["M3A34"], QA["M3A34"]["correct"])[1], "M3A34 試行と読出しの区別・許可リスト")
ok("30日後" in ctext(QA["M3A57"], "ウ") and "できる限り短い期間内" in QA["M3A57"]["explanation"] and "支払える最も早い日は、成果物を受領した日から30日後" in text(QA["M3A57"]), "M3A57 支払期日(最も早い支払日を本文に明記)")

# B17 認証ログの事実
q = QB["M3B17"]
log = body(q, "table")[0]["rows"]
fails = [r_ for r_ in log if r_[4] == "失敗"]
succ = [r_[1] for r_ in log if r_[4] == "成功" and r_[3] == "国外"]
ok(len({r_[1] for r_ in fails}) == len(fails) >= 5 and len({r_[2] for r_ in fails}) == 1 and succ == ["u07"], "M3B17 ログ：IDごとに1回ずつ・同じ送信元・成功は u07")
only(q, lambda cs: "多数の利用者ID" in cs[0] and "u07" in cs[1] and "全社員" not in cs[1] and "ファイアウォール" not in cs[1], "判断と措置")

# B18 受信ルール
q = QB["M3B18"]
rules = body(q, "table")[0]["rows"]
hq = ipaddress.ip_network(re.search(r"範囲 ([\d./]+) からだけ", text(q)).group(1))


def viol(r_):
    _, sg, pt, src = r_
    if pt == "TCP 443":
        return sg != "SG-web" or src not in ("0.0.0.0/0", "::/0")
    if sg == "SG-web" and pt == "TCP 22":
        return not ipaddress.ip_network(src).subnet_of(hq)
    if sg == "SG-db" and pt == "TCP 5432":
        return src != "SG-web"
    if sg == "SG-db" and pt == "TCP 22":
        return src != "SG-bastion"
    return True


bad = [r_[0] for r_ in rules if viol(r_)]
only(q, lambda s: s.split("、") == bad, "要件を満たさないルール")

# B19 ヘッダ
q = QB["M3B19"]
hd = [r_[0] for r_ in body(q, "table")[0]["rows"]]
frm = re.search(r"@([\w.-]+)>", hd[0]).group(1)
legit = re.search(r"ドメイン ([\w.-]+)（", text(q)).group(1)
ok(frm != legit and frm.replace("1", "l") == legit and "pass" in hd[4] and "pass" in hd[6] and frm not in hd[1], "M3B19 似たドメインで認証は pass、Reply-To は別ドメイン")
only(q, lambda cs: "異なる" in cs[0] and "取り決めた電話番号" in cs[1], "判断と対応")

# B20 版の範囲
q = QB["M3B20"]
ver = lambda s: tuple(int(x) for x in s.split("."))
aff = [r_[0] for r_ in body(q, "table")[0]["rows"] if ver("2.0.0") <= ver(r_[2]) < ver("2.3.4") and r_[3] == "有効"]
only(q, lambda s: s.split("、") == aff, "影響を受けるシステム")

# ======================================================================== 結果
cnt = {}
for q in A:
    cnt[q["correct"]] = cnt.get(q["correct"], 0) + 1
cb = {}
for q in B:
    cb[q["correct"]] = cb.get(q["correct"], 0) + 1
print(f"独立検算・形式検査：{OKN[0] + len(NG)}項目、NG {len(NG)}")
for m in NG:
    print("NG", m)
print(f"正解記号の分布 科目A: {dict(sorted(cnt.items()))}  科目B: {dict(sorted(cb.items()))}")
print(f"想定時間の合計 科目A {sum(q['expected_seconds'] for q in A)}秒（{sum(q['expected_seconds'] for q in A) / 60:.1f}分）、科目B {sum(q['expected_seconds'] for q in B)}秒（{sum(q['expected_seconds'] for q in B) / 60:.1f}分）")
sys.exit(1 if NG else 0)
