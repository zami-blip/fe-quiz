"""第3回 科目B 問1～問8 の作成と作成時の検算。"""
import itertools

import pseudo as PS
from qlib import P, CODE, TABLE
from bcommon import AL, LOG, qb, call, run_blank, only, safe, tally, rnd

INTRO2 = "次のプログラム中の a と b に入れる正しい答えの組合せを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"

# ======================================================================== M3B01 順位から生徒番号への対応表
code01 = """○整数型の配列: makeOrder(整数型の配列: rank)
  整数型: n ← rank の要素数
  整数型の配列: order ← {n個の 0}
  整数型: i
  for (i を 1 から n まで 1 ずつ増やす)
       a
  endfor
  return order

○整数型: topSum(整数型の配列: score, 整数型の配列: rank, 整数型: k)
  整数型の配列: order ← makeOrder(rank)
  整数型: s ← 0
  整数型: r
  for (r を 1 から k まで 1 ずつ増やす)
    s ← s ＋   b
  endfor
  return s"""
h01 = ["a", "b"]
ch01 = [["order[i] ← rank[i]", "score[order[r]]"],
        ["order[rank[i]] ← i", "score[rank[r]]"],
        ["order[rank[i]] ← i", "score[order[r]]"],
        ["order[i] ← rank[i]", "score[r]"],
        ["order[rank[i]] ← i", "score[r]"],
        ["order[i] ← rank[i]", "score[rank[r]]"]]


def t01(ns):
    R = rnd(101)
    res = []
    for n in range(1, 8):
        for _ in range(40):
            sc = R.sample(range(10, 100), n)
            srt = sorted(range(n), key=lambda i: -sc[i])
            rank = [0] * n
            for pos, i in enumerate(srt):
                rank[i] = pos + 1
            for k in range(1, n + 1):
                want = sum(sorted(sc, reverse=True)[:k])
                res.append(safe(lambda: call(ns, "topSum", PS.A(sc), PS.A(rank), k) == want))
    return tally(res)


r01 = only(run_blank(code01, h01, ch01, t01), "ウ")
ex01 = {}
for lab, cols in zip("アイウエオ", ch01[:5]):
    ns = PS.load(PS.fill_blanks(code01, dict(zip(h01, cols))))
    ex01[lab] = (call(ns, "makeOrder", PS.A([3, 2, 4, 1])).py(), call(ns, "topSum", PS.A([70, 85, 60, 92]), PS.A([3, 2, 4, 1]), 2))
assert ex01 == {"ア": ([3, 2, 4, 1], 145), "イ": ([4, 2, 1, 3], 145), "ウ": ([4, 2, 1, 3], 177),
                "エ": ([3, 2, 4, 1], 155), "オ": ([4, 2, 1, 3], 155)}, ex01
LOG.append(("M3B01", r01))
qb("M3B01", AL, "配列の添字(対応表)", "順位の表から順位→生徒番号の対応表を作る", "仕様読解", "易", 240,
   [P(INTRO2),
    P("生徒番号1～n の n 人（n ≧ 1）の得点が、整数型の配列 score に格納されている。score[i] は生徒番号 i の得点で、同じ得点はない。整数型の配列 rank には、各生徒の順位（得点の高い順に1, 2, …, n）が格納されており、rank[i] は生徒番号 i の順位である。"),
    P("関数 makeOrder は、rank を受け取り、順位から生徒番号を引く配列 order を作って返す。order[r] は順位 r の生徒の生徒番号である。"),
    P("関数 topSum は、score、rank と整数 k（1 ≦ k ≦ n）を受け取り、順位1位から k 位までの生徒の得点の合計を返す。"),
    P("例えば、score が {70, 85, 60, 92}、rank が {3, 2, 4, 1} のとき、makeOrder(rank) は {4, 2, 1, 3} を返し、topSum(score, rank, 2) は 92＋85＝177 を返す。"),
    P("〔プログラム〕"), CODE(code01)],
   ch01, "ウ",
   "a：rank[i] は“生徒番号 i の順位”なので、順位 rank[i] の欄に生徒番号 i を書き込む order[rank[i]] ← i で、order[r] が“順位 r の生徒番号”になる。例では i＝1 で order[3]←1、i＝2 で order[2]←2、i＝3 で order[4]←3、i＝4 で order[1]←4 となり {4, 2, 1, 3}。"
   "b：順位 r の生徒の得点は、まず order[r] で生徒番号を求め、その番号で score を引く score[order[r]]。例では score[4]＋score[2]＝92＋85＝177。"
   "アは、a で rank をそのまま写すので order が {3, 2, 4, 1} になり、b の score[order[r]] は score[3]＋score[2]＝60＋85＝145 になる。イは、b の score[rank[r]] が“生徒番号 r の順位”を生徒番号として使っており、145 になる。"
   "エは、order が rank の写しで、b の score[r] が生徒番号1、2の得点の合計 70＋85＝155 になる。オは、order は正しいが b で order を使っていないので、同じく155。カは a・b とも順位と生徒番号を取り違えており、145 になる。"
   f"〔検算〕人数1～7、得点をばらばらに変えた{r01['ウ'][1]}件（全ての k）で、上位 k 人の得点の合計を返すのはウだけ。",
   {"ア": "rank を写すだけ(order＝rank)", "イ": "b で rank を生徒番号として使う", "ウ": "正解", "エ": "rank を写し、b も生徒番号順",
    "オ": "b で order を使わない", "カ": "a・b とも順位と生徒番号を取り違え"}, header=h01)

# ======================================================================== M3B02 最大の値上がり幅(複数変数の更新)
code02 = """○整数型: bestGain(整数型の配列: price)
  整数型: minP ← price[1]
  整数型: minDay ← 1
  整数型: best ← 0
  整数型: buy ← 0
  整数型: sell ← 0
  整数型: d
  for (d を 2 から price の要素数 まで 1 ずつ増やす)
    if (price[d] − minP ＞ best)
      best ← price[d] − minP
      buy ← minDay
      sell ← d
    endif
    if (price[d] ＜ minP)
      minP ← price[d]
      minDay ← d
    endif
  endfor
  return best"""
price02 = [6, 4, 7, 9, 4, 8, 9, 3]
code02r = code02.replace("  return best", "  return {best, buy, sell}")


def run02(code):
    return call(PS.load(code), "bestGain", PS.A(price02)).py()


v02 = run02(code02r)
v02_ge = run02(code02r.replace("price[d] − minP ＞ best", "price[d] − minP ≧ best"))
v02_gele = run02(code02r.replace("price[d] − minP ＞ best", "price[d] − minP ≧ best").replace("price[d] ＜ minP", "price[d] ≦ minP"))
v02_adj = run02(code02r.replace("    if (price[d] − minP ＞ best)\n      best ← price[d] − minP\n      buy ← minDay",
                                "    if (price[d] − price[d − 1] ＞ best)\n      best ← price[d] − price[d − 1]\n      buy ← d − 1"))
v02_nomin = run02(code02r.replace("    if (price[d] ＜ minP)\n      minP ← price[d]\n      minDay ← d\n    endif\n", ""))
assert (v02, v02_ge, v02_gele, v02_adj, v02_nomin) == ([5, 2, 4], [5, 2, 7], [5, 5, 7], [4, 5, 6], [3, 1, 4]), (v02, v02_ge, v02_gele, v02_adj, v02_nomin)
# 仕様どおりか(最初に見つかった最大の値上がり幅の組)
R = rnd(102)
f02 = PS.load(code02r)
for _ in range(3000):
    p = [R.randint(1, 9) for _ in range(R.randint(1, 9))]
    best, bb, ss = 0, 0, 0
    for s in range(1, len(p)):
        for b in range(s):
            g = p[s] - p[b]
            if g > best or (g == best and g > 0 and (s < ss or (s == ss and b < bb))):
                best, bb, ss = g, b, s
    got = call(f02, "bestGain", PS.A(p)).py()
    assert got[0] == best, (p, got, best)
# 追跡表
tr02 = []
minP, minDay, best, buy, sell = price02[0], 1, 0, 0, 0
for d in range(2, len(price02) + 1):
    pr = price02[d - 1]
    note = []
    if pr - minP > best:
        best, buy, sell = pr - minP, minDay, d
        note.append("best を更新")
    if pr < minP:
        minP, minDay = pr, d
        note.append("最安値を更新")
    tr02.append([d, pr, None, minP, minDay, best, buy, sell, "・".join(note) or "－"])
# 差の列は更新前の minP で計算した値を入れ直す
minP_b = price02[0]
for row in tr02:
    d, pr = row[0], row[1]
    row[2] = pr - minP_b
    if pr < minP_b:
        minP_b = pr
tr02 = [[str(x).replace("-", "−") for x in r] for r in tr02]
assert tr02[-1][5:8] == ["5", "2", "4"]
LOG.append(("M3B02", "trace", v02))
qb("M3B02", AL, "複数変数の更新", "最安値と最大の値上がり幅を同時に更新する", "追跡", "標準", 285,
   [P("次のプログラムにおいて、関数 bestGain を、price を次の配列として呼び出したとき、関数の戻り値と、関数の処理が終わった時点の変数 buy と sell の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("price ＝ {6, 4, 7, 9, 4, 8, 9, 3}"),
    P("配列 price には、ある商品の1日目から順に、日ごとの価格が格納されている。関数 bestGain は、ある日に買って、それより後の日に売るときの差（売値－買値）の最大値を返す。差が正になる組がなければ0を返す。変数 buy と sell には、最大値になる買う日と売る日を記録する。"),
    P("〔プログラム〕"), CODE(code02)],
   [["5", "2", "4"], ["5", "2", "7"], ["5", "5", "7"], ["4", "5", "6"], ["3", "1", "4"]], "ア",
   "d＝2 から順に、更新前の minP との差を求めて best と比べ、その後で minP を更新する。d＝2：差 4−6＝−2、最安値が4（2日目）になる。d＝3：差 7−4＝3＞0 で best＝3、buy＝2、sell＝3。d＝4：差 9−4＝5＞3 で best＝5、buy＝2、sell＝4。"
   "d＝5：差0。価格4は minP の4と等しく、条件は price[d] ＜ minP なので最安値の日は2日目のまま。d＝6：差4は5以下。d＝7：差 9−4＝5 で best と等しく、条件 ＞ を満たさないので更新しない。d＝8：差 −1、最安値が3（8日目）になるが、その後に売る日はない。戻り値は5、buy＝2、sell＝4。"
   "イ（5, 2, 7）は、best の比較を ≧ と読み、d＝7 で同じ差5のときにも更新した場合。ウ（5, 5, 7）は、さらに最安値の比較も ≦ と読み、d＝5 で最安値の日を5日目に移した場合。"
   "エ（4, 5, 6）は、最安値ではなく前日の価格との差だけを比べた場合（5日目の4から6日目の8への4が最大）。オ（3, 1, 4）は、2つ目の if を読み落とし、最安値を1日目の6のままにした場合（9−6＝3）。"
   "〔検算〕本文の入力と各読み違いを再現したコードを実行し、上の値を確認。要素数1～9の価格3,000件で、戻り値が“買う日＜売る日の差の最大値（なければ0）”と一致する。",
   {"ア": "正解", "イ": "best の比較を ≧ と読む", "ウ": "比較を ≧ と ≦ に読む", "エ": "前日との差だけ比べる", "オ": "最安値を更新しない"},
   header=["戻り値", "buy", "sell"],
   explain=[TABLE(["d", "price[d]", "差(更新前の minP)", "minP", "minDay", "best", "buy", "sell", "このdで起きたこと"], tr02,
                  caption="追跡表（各行は d の繰返しの終わりの値）")])

# ======================================================================== M3B03 再帰によるべき乗(戻り値と出力の順序)
code03 = """○整数型: power(整数型: x, 整数型: n)
  整数型: h, r
  if (n ＝ 0)
    return 1
  endif
  h ← power(x, n ÷ 2)
  if (n mod 2 ＝ 0)
    r ← h × h
  else
    r ← h × h × x
  endif
  n と r を出力する
  return r"""
ns03 = PS.load(code03)
assert call(ns03, "power", 2, 13) == 8192
o03 = list(ns03["_outs"])
assert o03 == [(1, 2), (3, 8), (6, 64), (13, 8192)], o03
ns03b = PS.load(code03.replace("    return 1\n", "    n と 1 を出力する\n    return 1\n"))
call(ns03b, "power", 2, 13)
assert [t[0] for t in ns03b["_outs"]] == [0, 1, 3, 6, 13] and ns03b["_outs"][2] == (3, 8)
ns03c = PS.load(code03.replace("  n と r を出力する", "  n と h を出力する"))
call(ns03c, "power", 2, 13)
assert ns03c["_outs"][2] == (6, 8)
# 呼出しの順(出力の順と逆)
calls = []
n = 13
while n > 0:
    calls.append(n)
    n //= 2
assert calls == [13, 6, 3, 1] and 8 * 8 * 2 == 128
for x in range(0, 6):
    for n in range(0, 25):
        assert call(PS.load(code03), "power", x, n) == x ** n
tr03 = [["power(2, 13)", "1回目", "power(2, 6)", "h＝64、13は奇数 → r＝64×64×2＝8192", "4行目：13 と 8192"],
        ["power(2, 6)", "2回目", "power(2, 3)", "h＝8、6は偶数 → r＝8×8＝64", "3行目：6 と 64"],
        ["power(2, 3)", "3回目", "power(2, 1)", "h＝2、3は奇数 → r＝2×2×2＝8", "2行目：3 と 8"],
        ["power(2, 1)", "4回目", "power(2, 0)", "h＝1、1は奇数 → r＝1×1×2＝2", "1行目：1 と 2"],
        ["power(2, 0)", "5回目", "（呼ばない）", "n＝0 なので1を返す（出力しない）", "－"]]
LOG.append(("M3B03", "trace", o03))
qb("M3B03", AL, "再帰・戻り値", "再帰によるべき乗の計算で出力される値の順序", "追跡", "標準", 270,
   [P("関数 power は、整数 x と0以上の整数 n を受け取り、x の n 乗を返す。n を2で割った商で自分自身を呼び出し、その戻り値 h を使って計算する。ここで、÷ は商の整数部分を求める演算であり、文「n と r を出力する」は、n と r の値をこの順に1行に出力する。"),
    P("〔プログラム〕"), CODE(code03),
    P("power(2, 13) を呼び出したとき、出力される行の n の値を出力される順に並べたものと、3行目に出力される r の値の組合せとして正しいものを、解答群の中から選べ。")],
   [["1, 3, 6, 13", "8"], ["13, 6, 3, 1", "8"], ["0, 1, 3, 6, 13", "8"], ["1, 3, 6, 13", "64"], ["1, 3, 6, 13", "128"]], "エ",
   "出力は、自分が呼び出した power から戻ってきた後に行う。power(2, 13) は power(2, 6)、power(2, 3)、power(2, 1)、power(2, 0) の順に呼び出し、power(2, 0) は出力せずに1を返す。"
   "その後、深い呼出しから順に戻りながら出力するので、n は 1, 3, 6, 13 の順になる（下の表）。1行目は n＝1：h＝1、1は奇数で r＝1×1×2＝2。2行目は n＝3：h＝2、r＝2×2×2＝8。3行目は n＝6：h＝8、6は偶数で r＝8×8＝64。4行目は n＝13：r＝64×64×2＝8192。"
   "アの8は、3行目に出力される r を、その呼出しの中の h（power(2, 3) の戻り値8）と取り違えた場合。イは、出力が呼び出す前に行われると考えて n を 13, 6, 3, 1 の順とし、3行目を n＝3 の行とした場合（r＝8）。"
   "ウは、power(2, 0) も出力すると考えた場合で、n が 0, 1, 3, 6, 13 となり、3行目が n＝3 の行（r＝8）になる。オの128は、n＝6 を奇数として 8×8×2 を計算した場合。"
   "〔検算〕問題文のコードを実行して出力を確認。x＝0～5、n＝0～24 の全ての組で戻り値が x の n 乗に一致する。誤答の値は、出力の位置・出力する変数を変えたコードの実行結果と一致。",
   {"ア": "r と h を取り違える", "イ": "呼び出す前に出力すると考える", "ウ": "n＝0 でも出力すると考える", "エ": "正解", "オ": "n＝6 を奇数として計算"},
   header=["n の並び", "3行目の r"],
   explain=[TABLE(["呼出し", "呼ばれた順", "その中で呼ぶもの", "戻ってきた後の計算", "出力"], tr03, caption="呼出しと出力の関係")])

# ======================================================================== M3B04 二分探索による整数の平方根(範囲の初期値と終了条件)
code04 = """○整数型: isqrt(整数型: n)
  整数型: lo ← 0
  整数型: hi ←   b
  整数型: mid
  while (   a   )
    mid ← (lo ＋ hi) ÷ 2
    if (mid × mid ≦ n)
      lo ← mid
    else
      hi ← mid
    endif
  endwhile
  return lo"""
h04 = ["a", "b"]
A04 = ["lo ＜ hi", "hi − lo ＞ 1", "lo × lo ＜ n"]
B04 = ["n ＋ 1", "n", "n ÷ 2"]
ch04 = [[A04[0], B04[0]], [A04[1], B04[0]], [A04[2], B04[1]], [A04[1], B04[1]], [A04[0], B04[2]],
        [A04[2], B04[0]], [A04[1], B04[2]], [A04[0], B04[1]], [A04[2], B04[2]]]


def t04(ns):
    res = []
    for n in list(range(0, 401)) + [999, 1000, 1024, 4095, 4096, 99999, 10 ** 6]:
        res.append(safe(lambda: call(ns, "isqrt", n) == math.isqrt(n)))
    return tally(res)


import math
r04 = only(run_blank(code04, h04, ch04, t04), "イ")
first04 = {}
for lab, cols in zip("アイウエオカキクケ", ch04):
    ns = PS.load(PS.fill_blanks(code04, dict(zip(h04, cols))))
    for n in range(0, 50):
        try:
            v = call(ns, "isqrt", n)
            if v != math.isqrt(n):
                first04[lab] = (n, "誤り", v)
                break
        except PS.TooLong:
            first04[lab] = (n, "停止しない")
            break
assert first04 == {"ア": (0, "停止しない"), "ウ": (1, "停止しない"), "エ": (1, "誤り", 0), "オ": (1, "誤り", 0), "カ": (2, "停止しない"),
                   "キ": (1, "誤り", 0), "ク": (1, "停止しない"), "ケ": (1, "停止しない")}, first04
# hi ← n が誤るのは n＝1 のときだけ
ns = PS.load(PS.fill_blanks(code04, dict(zip(h04, ch04[3]))))
assert [n for n in range(0, 401) if call(ns, "isqrt", n) != math.isqrt(n)] == [1]
LOG.append(("M3B04", r04, first04))
qb("M3B04", AL, "探索", "二分探索で整数の平方根(切捨て)を求める範囲の初期値と終了条件", "仕様読解", "標準", 285,
   [P(INTRO2.replace("ここで、配列の要素番号は1から始まる。", "ここで、÷ は商の整数部分を求める演算である。")),
    P("関数 isqrt は、0以上の整数 n を受け取り、x × x ≦ n を満たす最大の整数 x を返す（例：isqrt(10) は3、isqrt(16) は4、isqrt(0) は0）。"),
    P("答えの候補の範囲を lo と hi で表す。繰返しの間、常に lo × lo ≦ n と n ＜ hi × hi の両方が成り立つように、範囲を半分ずつ狭める。lo と hi の間にほかの整数がなくなったら、lo が答えである。"),
    P("〔プログラム〕"), CODE(code04)],
   ch04, "イ",
   "b：最初に n ＜ hi × hi が成り立っていなければならない。hi ← n ＋ 1 なら、(n＋1)×(n＋1) ＞ n が全ての n ≧ 0 で成り立つ（lo＝0 で lo×lo ≦ n も成り立つ）。"
   "a：lo と hi の間にほかの整数がなくなるのは hi − lo ＝ 1 のときなので、繰返しの条件は hi − lo ＞ 1。"
   "例：n＝10 では (lo, hi)＝(0, 11) → mid 5、25＞10 で (0, 5) → mid 2 で (2, 5) → mid 3、9≦10 で (3, 5) → mid 4、16＞10 で (3, 4)。hi−lo＝1 で終わり3を返す。"
   "a を lo ＜ hi とすると、hi＝lo＋1 になっても繰り返し、mid＝lo のまま lo ← mid を続けて停止しない（アは n＝0、クは n＝1 から）。オは n＝1 で hi が0になり、繰返しに入らずに0を返す。"
   "a を lo × lo ＜ n とすると、範囲が縮まらなくなって停止しない（ウ・ケは n＝1、カは n＝2）。"
   "エは、hi ← n で n≧2 なら n×n ＞ n なので正しいが、n＝1 のときだけ 1 ＜ 1×1 が成り立たず、0を返す。キは hi ← n ÷ 2 で範囲が狭すぎ、n＝1 で0を返す。"
   f"〔検算〕n＝0～400 と大きな値7件の計{r04['イ'][1]}件で、繰返しの回数に上限を付けて実行し、全てで正しい値を返して停止するのはイだけ。エが誤るのは n＝1 だけであることも確認。",
   {"ア": "lo＜hi で停止しない", "イ": "正解", "ウ": "停止しない", "エ": "n＝1 で初期の範囲が崩れる", "オ": "初期の範囲が狭すぎる",
    "カ": "平方数でないと停止しない", "キ": "初期の範囲が狭すぎる", "ク": "停止しない", "ケ": "停止しない"}, header=h04)

# ======================================================================== M3B05 整列済みの2つの配列の併合
code05 = """○整数型の配列: merge(整数型の配列: x, 整数型の配列: y)
  整数型の配列: z ← {}
  整数型: i ← 1
  整数型: j ← 1
  while (   a   )
    if (x[i] ≦ y[j])
      z の末尾に x[i] の値を追加する
      i ← i ＋ 1
    else
      z の末尾に y[j] の値を追加する
      j ← j ＋ 1
    endif
  endwhile
  while (   b   )
    z の末尾に x[i] の値を追加する
    i ← i ＋ 1
  endwhile
  while (j ≦ y の要素数)
    z の末尾に y[j] の値を追加する
    j ← j ＋ 1
  endwhile
  return z"""
h05 = ["a", "b"]
AND = "(i ≦ x の要素数) and (j ≦ y の要素数)"
OR = "(i ≦ x の要素数) or (j ≦ y の要素数)"
ch05 = [[OR, "i ≦ x の要素数"], [AND, "i ＜ x の要素数"], [AND, "j ≦ y の要素数"],
        [OR, "i ＜ x の要素数"], [AND, "i ≦ x の要素数"], [OR, "j ≦ y の要素数"]]


def t05(ns):
    R = rnd(105)
    res = []
    for _ in range(1500):
        x = sorted(R.randint(0, 9) for _ in range(R.randint(0, 6)))
        y = sorted(R.randint(0, 9) for _ in range(R.randint(0, 6)))
        res.append(safe(lambda: call(ns, "merge", PS.A(x), PS.A(y)).py() == sorted(x + y)))
    for x, y in (([], []), ([1], []), ([], [1]), ([5], [5])):
        res.append(safe(lambda: call(ns, "merge", PS.A(x), PS.A(y)).py() == sorted(x + y)))
    return tally(res)


r05 = only(run_blank(code05, h05, ch05, t05), "オ")
e05 = {}
for lab, cols in zip("イウ", [ch05[1], ch05[2]]):
    ns = PS.load(PS.fill_blanks(code05, dict(zip(h05, cols))))
    try:
        e05[lab] = call(ns, "merge", PS.A([2, 6, 9]), PS.A([3, 4])).py()
    except PS.OutOfRange:
        e05[lab] = "範囲外"
ns = PS.load(PS.fill_blanks(code05, dict(zip(h05, ch05[4]))))
assert call(ns, "merge", PS.A([2, 6, 9]), PS.A([3, 4])).py() == [2, 3, 4, 6, 9]
assert e05 == {"イ": [2, 3, 4, 6], "ウ": [2, 3, 4]}, e05
ns = PS.load(PS.fill_blanks(code05, dict(zip(h05, ch05[2]))))
try:
    call(ns, "merge", PS.A([2]), PS.A([3, 4]))
    raise AssertionError
except PS.OutOfRange:
    pass
LOG.append(("M3B05", r05))
qb("M3B05", AL, "整列", "整列済みの2つの配列を1つに併合する", "仕様読解", "易", 225,
   [P(INTRO2),
    P("関数 merge は、昇順に整列済みの整数型の配列 x と y（どちらも要素数0以上）を受け取り、x と y の全ての要素を昇順に並べた新しい配列を返す。最初の繰返しで x と y の先頭から小さい方を1つずつ取り出し、片方を全て取り出した後は、残っている側の要素を順に末尾に追加する。"),
    P("例えば、x が {2, 6, 9}、y が {3, 4} のとき、{2, 3, 4, 6, 9} を返す。"),
    P("〔プログラム〕"), CODE(code05)],
   ch05, "オ",
   "a：最初の繰返しでは x[i] と y[j] を比べるので、両方にまだ要素が残っている間だけ続ける。条件は and で結ぶ。"
   "b：最初の繰返しが終わった後、x に残っている要素（要素番号 i から x の要素数まで）を全て追加するので、条件は i ≦ x の要素数。例では、最初の繰返しで 2, 3, 4 を取り出し y が空になって終わり（i＝2）、b の繰返しで 6, 9 を追加する。"
   "ア・エ・カは、a を or で結んだため、片方を取り出し終えた後も比べ続け、存在しない要素（例では y[3]）を参照する。"
   "イは、b が i ＜ x の要素数 で、x の最後の要素を追加しない（例で {2, 3, 4, 6}）。"
   "ウは、b の条件に j を使っている。y が先に空になった場合は x の残りを追加せず（例で {2, 3, 4}）、x が先に空になった場合は存在しない x[i] を参照する（例：x＝{2}、y＝{3, 4}）。"
   f"〔検算〕要素数0～6の配列の組1,500件と、空の配列を含む4件の計{r05['オ'][1]}件で、範囲外の参照を検出する配列を使って実行し、正しく併合するのはオだけ。",
   {"ア": "or で範囲外参照", "イ": "x の最後の要素を落とす", "ウ": "条件の変数を取り違える", "エ": "or で範囲外参照", "オ": "正解", "カ": "or で範囲外参照"},
   header=h05)

# ======================================================================== M3B06 スタックで「右側で最初に大きい値」を求める
code06 = """○整数型の配列: nextGreater(整数型の配列: a)
  整数型: n ← a の要素数
  整数型の配列: ans ← {n個の −1}
  整数型の配列: st ← {n個の 0}
  整数型: top ← 0
  整数型: i
  for (i を 1 から n まで 1 ずつ増やす)
    while ((top ＞ 0) and (a[st[top]] ＜ a[i]))
      ans[st[top]] ← a[i]
      top ← top − 1
    endwhile
    top ← top ＋ 1
    st[top] ← i
  endfor
  return ans"""
a06 = [5, 3, 3, 8, 2, 6, 6, 1]
code06m = code06.replace("  整数型: i\n", "  整数型: i\n  整数型: mx ← 0\n").replace(
    "    st[top] ← i\n", "    st[top] ← i\n    if (top ＞ mx)\n      mx ← top\n    endif\n").replace("  return ans", "  return {ans, mx}")


def run06(code):
    return call(PS.load(code), "nextGreater", PS.A(a06)).py()


v06 = run06(code06m)
v06_le = run06(code06m.replace("a[st[top]] ＜ a[i]", "a[st[top]] ≦ a[i]"))
v06_if = run06(code06m.replace("    while ((top ＞ 0) and (a[st[top]] ＜ a[i]))", "    if ((top ＞ 0) and (a[st[top]] ＜ a[i]))").replace("      top ← top − 1\n    endwhile", "      top ← top − 1\n    endif"))
v06_idx = run06(code06m.replace("ans[st[top]] ← a[i]", "ans[st[top]] ← i"))
# 積む前の top だけを数えた場合の最大値
v06_before = run06(code06m.replace("    top ← top ＋ 1\n    st[top] ← i\n    if (top ＞ mx)\n      mx ← top\n    endif\n", "    if (top ＞ mx)\n      mx ← top\n    endif\n    top ← top ＋ 1\n    st[top] ← i\n"))
assert v06 == [[8, 8, 8, -1, 6, -1, -1, -1], 4], v06
assert v06_le == [[8, 3, 8, -1, 6, 6, -1, -1], 3], v06_le
assert v06_if == [[-1, -1, 8, -1, 6, -1, -1, -1], 6], v06_if
assert v06_idx == [[4, 4, 4, -1, 6, -1, -1, -1], 4], v06_idx
assert v06_before == [[8, 8, 8, -1, 6, -1, -1, -1], 3], v06_before
R = rnd(106)
f06 = PS.load(code06)
for _ in range(3000):
    a = [R.randint(1, 9) for _ in range(R.randint(1, 10))]
    want = []
    for i in range(len(a)):
        nxt = [v for v in a[i + 1:] if v > a[i]]
        want.append(nxt[0] if nxt else -1)
    assert call(f06, "nextGreater", PS.A(a)).py() == want
# 追跡表(繰返しごとのスタックの中身)
tr06 = []
st, ans = [], [-1] * len(a06)
for i, v in enumerate(a06, 1):
    popped = []
    while st and a06[st[-1] - 1] < v:
        j = st.pop()
        ans[j - 1] = v
        popped.append(f"{j}")
    st.append(i)
    tr06.append([str(i), str(v), ("取り出す " + "・".join(popped) + f"（ans を{v}に決める）") if popped else "－",
                 "{" + ", ".join(str(x) for x in st) + "}", str(len(st))])
assert [r[4] for r in tr06] == ["1", "2", "3", "1", "2", "2", "3", "4"], tr06
LOG.append(("M3B06", "trace", v06))
qb("M3B06", AL, "スタック", "スタックを使って右側で最初に現れる大きい値を求める", "追跡", "難", 360,
   [P("関数 nextGreater は、整数型の配列 a（要素数 n ≧ 1）を受け取り、要素ごとに“それより右側にあって、それより大きい値のうち、最も左にある値”を求めた配列 ans を返す。そのような値がない要素の ans の値は −1 とする。"),
    P("配列 st をスタックとして使い、まだ答えが決まっていない要素の要素番号を st[1] から順に積む。top はスタックに積まれている要素番号の個数で、st[top] が一番上の要素番号である。条件式 x and y では、x が false のとき y は評価しない。"),
    P("〔プログラム〕"), CODE(code06),
    P("a を次の配列として nextGreater を呼び出したとき、戻り値の配列と、処理の間に top がとる最大の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("a ＝ {5, 3, 3, 8, 2, 6, 6, 1}")],
   [["{8, 3, 8, −1, 6, 6, −1, −1}", "3"], ["{8, 8, 8, −1, 6, −1, −1, −1}", "4"], ["{4, 4, 4, −1, 6, −1, −1, −1}", "4"],
    ["{−1, −1, 8, −1, 6, −1, −1, −1}", "6"], ["{8, 8, 8, −1, 6, −1, −1, −1}", "3"]], "イ",
   "新しい値 a[i] が、スタックの一番上の要素番号の値より大きい間、その要素番号を取り出して答えを a[i] に決める。その後 i を積む（下の表）。"
   "i＝1～3：5, 3, 3 は一番上の値より大きくないので積むだけ（top＝3）。i＝4：8 は 3, 3, 5 のいずれより大きいので、要素番号3, 2, 1 の順に取り出して ans を8に決め、4を積む（top＝1）。"
   "i＝5：2 を積む（top＝2）。i＝6：6＞2 なので要素番号5を取り出して ans[5]＝6、次の一番上の a[4]＝8 は6より大きいので止め、6を積む（top＝2）。"
   "i＝7：6 は一番上の a[6]＝6 と等しく、＜ を満たさないので取り出さずに積む（top＝3）。i＝8：1 も取り出さずに積むので top＝4。最後までスタックに残った要素番号4, 6, 7, 8 の ans は −1 のまま。戻り値は {8, 8, 8, −1, 6, −1, −1, −1}、top の最大値は4。"
   "アは、比較を ≦ と読んだ場合で、i＝3 で等しい3が要素番号2を取り出して ans[2]＝3、i＝7 で ans[6]＝6 となり、top の最大は3。"
   "ウは、ans に値 a[i] ではなく要素番号 i を記録したと読んだ場合（ans[1]～ans[3] が4、ans[5] が6）。"
   "エは、while を1回だけ判定する if と読んだ場合で、i＝4 で要素番号3だけを取り出すため、ans[1]、ans[2] が −1 のまま残り、top の最大は6になる。"
   "オは、戻り値は正しいが、top の最大を“積む前の top”だけで数えた場合（i＝8 で積む前は3）。"
   "〔検算〕問題文のコードと、各読み違いを再現したコードを実行して確認。要素数1～10・同じ値を含む3,000件で、戻り値が仕様（右側で最初に現れる、より大きい値）と一致する。",
   {"ア": "＜ を ≦ と読む", "イ": "正解", "ウ": "値でなく要素番号を記録", "エ": "while を if と読む", "オ": "積む前の top だけ数える"},
   header=["戻り値", "top の最大値"],
   explain=[TABLE(["i", "a[i]", "取り出し", "繰返しの後の st", "top"], tr06, caption="追跡表（st には要素番号を積む）")])

# ======================================================================== M3B07 キューで直近 k 個の和を求める
code07 = """○整数型の配列: windowSums(整数型の配列: data, 整数型: k)
  整数型の配列: q ← {}
  整数型の配列: res ← {}
  整数型: head ← 1
  整数型: s ← 0
  整数型: i
  for (i を 1 から data の要素数 まで 1 ずつ増やす)
    q の末尾に data[i] の値を追加する
    s ← s ＋ data[i]
    if (q の要素数 − head ＋ 1 ＞ k)
      s ← s − q[head]
      head ← head ＋ 1
    endif
    if (i ≧ k)
      res の末尾に s の値を追加する
    endif
  endfor
  return res"""
d07 = [4, 7, 1, 8, 2, 6]
code07h = code07.replace("  return res", "  return {res, head}")


def run07(c):
    return call(PS.load(c), "windowSums", PS.A(d07), 3).py()


v07 = run07(code07h)
v07_ge = run07(code07h.replace("＋ 1 ＞ k)", "＋ 1 ≧ k)"))
v07_gt = run07(code07h.replace("if (i ≧ k)", "if (i ＞ k)"))
v07_swap = run07(code07h.replace("      s ← s − q[head]\n      head ← head ＋ 1", "      head ← head ＋ 1\n      s ← s − q[head]"))
v07_nodeq = run07(code07h.replace("      s ← s − q[head]\n      head ← head ＋ 1\n", "      s ← s − q[head]\n"))
assert v07 == [[12, 16, 11, 16], 4], v07
assert v07_ge == [[8, 9, 10, 8], 5], v07_ge
assert v07_gt == [[16, 11, 16], 4], v07_gt
assert v07_swap == [[12, 13, 14, 12], 4], v07_swap
assert v07_nodeq == [[12, 16, 14, 16], 1], v07_nodeq
R = rnd(107)
f07 = PS.load(code07)
for _ in range(2000):
    d = [R.randint(0, 9) for _ in range(R.randint(1, 9))]
    k = R.randint(1, len(d))
    assert call(f07, "windowSums", PS.A(d), k).py() == [sum(d[i - k + 1:i + 1]) for i in range(k - 1, len(d))]
tr07 = []
q, head, s = [], 1, 0
for i, v in enumerate(d07, 1):
    q.append(v)
    s += v
    out = ""
    if len(q) - head + 1 > 3:
        s -= q[head - 1]
        out = f"q[{head}]＝{q[head - 1]} を取り出す"
        head += 1
    tr07.append([str(i), str(v), out or "－", "{" + ", ".join(str(x) for x in q[head - 1:]) + "}", str(head), str(s), str(s) if i >= 3 else "－"])
LOG.append(("M3B07", "trace", v07))
qb("M3B07", AL, "キュー", "キューを使って直近 k 個の値の和を順に求める", "追跡", "易", 240,
   [P("関数 windowSums は、整数型の配列 data と整数 k（1 ≦ k ≦ data の要素数）を受け取り、data の連続する k 個の値の和を、先頭の k 個から1つずつずらして順に求め、その並びを配列で返す。"),
    P("配列 q をキューとして使う。q の末尾に追加することをキューへの格納とし、q[head] がキューの先頭（最も古い値）である。head を1増やすことを、キューからの取出しとする。キューに入っている値の個数は q の要素数 − head ＋ 1 である。変数 s には、キューに入っている値の和を保持する。"),
    P("〔プログラム〕"), CODE(code07),
    P("windowSums({4, 7, 1, 8, 2, 6}, 3) を呼び出したとき、戻り値の配列と、処理が終わった時点の head の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。")],
   [["{8, 9, 10, 8}", "5"], ["{12, 16, 11, 16}", "4"], ["{16, 11, 16}", "4"], ["{12, 13, 14, 12}", "4"], ["{12, 16, 14, 16}", "1"]], "イ",
   "値を1つ格納するたびに s に加え、キューの中が k＝3 個を超えたら、先頭の値を s から引いて取り出す。i が3以上になったら s を res に追加する（下の表）。"
   "i＝3 で 4＋7＋1＝12。i＝4 で8を加えると4個になるので、先頭の q[1]＝4 を引いて取り出し 7＋1＋8＝16（head＝2）。i＝5 で 1＋8＋2＝11（head＝3）、i＝6 で 8＋2＋6＝16（head＝4）。戻り値は {12, 16, 11, 16}、head は4。"
   "アは、取り出す条件を ≧ k と読んだ場合で、キューに2個しか残らないため2個ずつの和 {8, 9, 10, 8} になり、head は5。ウは、res に追加する条件を i ＞ k と読み、最初の和12を落とした場合。"
   "エは、head を先に1増やしてから s から q[head] を引いた場合で、先頭ではなく2番目の値を引く。i＝4 で 20−q[2]＝13、i＝5 で 15−q[3]＝14、i＝6 で 20−q[4]＝12 となる。"
   "オは、head ← head＋1 を読み落とした場合で、毎回 q[1]＝4 を引くため、i＝5 で 16＋2−4＝14、i＝6 で 14＋6−4＝16 となり、head は1のまま。"
   "〔検算〕問題文のコードと、各読み違いを再現したコードを実行して確認。要素数1～9・k をいろいろに変えた2,000件で、戻り値が連続する k 個の和の並びと一致する。",
   {"ア": "取り出す条件を ≧ と読む", "イ": "正解", "ウ": "res への追加条件を ＞ と読む", "エ": "取り出す前に head を進める", "オ": "head を進めない"},
   header=["戻り値", "head"],
   explain=[TABLE(["i", "data[i]", "取出し", "キューの中身", "head", "s", "res に追加"], tr07, caption="追跡表（各行は繰返しの終わり）")])

# ======================================================================== M3B08 和が s になる連続した区間を数える
code08 = """○整数型: countSegments(整数型の配列: a, 整数型: s)
  整数型: n ← a の要素数
  整数型: cnt ← 0
  整数型: i, j, total
  for (i を 1 から n まで 1 ずつ増やす)
    total ← 0
    for (j を   a   から n まで 1 ずつ増やす)
      total ← total ＋ a[j]
      if (   b   )
        cnt ← cnt ＋ 1
      endif
    endfor
  endfor
  return cnt"""
h08 = ["a", "b"]
ch08 = [["i ＋ 1", "total ＝ s"], ["1", "total ＝ s"], ["i", "total ＝ s"], ["i", "total ≧ s"], ["i ＋ 1", "total ≧ s"], ["1", "total ≧ s"]]


def t08(ns):
    R = rnd(108)
    res = []
    for _ in range(2500):
        a = [R.randint(1, 6) for _ in range(R.randint(1, 8))]
        s = R.randint(1, 12)
        want = sum(1 for i in range(len(a)) for j in range(i, len(a)) if sum(a[i:j + 1]) == s)
        res.append(safe(lambda: call(ns, "countSegments", PS.A(a), s) == want))
    return tally(res)


r08 = only(run_blank(code08, h08, ch08, t08), "ウ")
ex08 = {}
for lab, cols in zip("アイウエオカ", ch08):
    ns = PS.load(PS.fill_blanks(code08, dict(zip(h08, cols))))
    ex08[lab] = call(ns, "countSegments", PS.A([2, 2, 1, 3, 1]), 4)
assert ex08 == {"ア": 2, "イ": 5, "ウ": 3, "エ": 9, "オ": 5, "カ": 20}, ex08
LOG.append(("M3B08", r08))
qb("M3B08", AL, "二重ループ", "和が指定の値になる連続した区間を数える", "仕様読解", "易", 210,
   [P(INTRO2),
    P("関数 countSegments は、正の整数が格納された配列 a（要素数 n ≧ 1）と正の整数 s を受け取り、a の連続した区間 a[i], a[i＋1], …, a[j]（1 ≦ i ≦ j ≦ n）のうち、要素の和がちょうど s になる区間の個数を返す。"),
    P("例えば、a が {2, 2, 1, 3, 1}、s が4のとき、和が4になる区間は a[1]～a[2]（2＋2）、a[3]～a[4]（1＋3）、a[4]～a[5]（3＋1）の3つなので、3を返す。"),
    P("〔プログラム〕"), CODE(code08)],
   ch08, "ウ",
   "外側の i が区間の始まり、内側の j が区間の終わりを表す。区間は a[i] から始まるので、j は i から始め（a）、total に a[j] を加えるたびに a[i]～a[j] の和になる。和がちょうど s のときだけ数える（b：total ＝ s）。total は区間の始まりが変わるたびに0に戻している。"
   "例の値で、アは j を i＋1 から始めるので a[i] を含まない区間を数え、始まりが1の区間を数えられない（2）。イは j を1から始めるので、i に関係なく a[1]～a[j] の和を n 回数える（和が4になる a[1]～a[2] を5回で5）。"
   "エは和が s 以上の区間を全て数える（9）。オは j を i＋1 から始め、和が s 以上の区間を数える（5）。カは j を1から始め、和が s 以上の a[1]～a[j]（4通り）を5回数える（20）。"
   f"〔検算〕要素数1～8、s＝1～12 の2,500件で、全ての区間を直接調べた個数と一致するのはウだけ。例の値での各選択肢の戻り値も、それぞれのコードを実行して確認。",
   {"ア": "j を i＋1 から始める", "イ": "j を1から始める", "ウ": "正解", "エ": "s 以上を数える", "オ": "i＋1 から始め、s 以上を数える", "カ": "1から始め、s 以上を数える"},
   header=h08)
