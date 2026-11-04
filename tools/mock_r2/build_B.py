"""第2回模試 科目B(20問)の作成と、作成時の検算。
プログラムの問題は、問題文に載せるコードの文字列を pseudo.py で実行して確かめる(空欄は選択肢を埋めて実行)。"""
import itertools
import random

import pseudo as PS
from qlib import P, CODE, LIST, TABLE, Q, num

AL, SEC = "アルゴリズムとプログラミング", "情報セキュリティ"
QS = []
LOG = []
INTRO_BLANK = "次のプログラム中の a と b に入れる正しい答えの組合せを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"


def qb(id, field, cat, topic, skill, diff, sec, body, choices, correct, expl, reasons, header=None):
    QS.append(Q(id, "B", field, cat, topic, skill, diff, sec, body, choices, correct, expl, reasons, header=header))


def blank_results(code, header, choices, test, extra=None, intdiv=True):
    """空欄の各選択肢を埋めたプログラムを、test(ns) で検査する。test は (正しく動いた件数, 全件数, 範囲外参照の件数) を返す。"""
    out = {}
    for lab, cols in zip("アイウエオカキク", choices):
        filled = PS.fill_blanks(code, dict(zip(header, cols)))
        ns = PS.load(filled, intdiv=intdiv, extra=extra)
        out[lab] = test(ns)
    return out


def only(res, lab):
    oks = [k for k, (good, total, oor) in res.items() if good == total]
    assert oks == [lab], res
    return res


# ================================================================ M2B01 累積和
code01 = """○整数型の配列: makePrefix(整数型の配列: data)
  整数型の配列: s ← {0}
  整数型: k
  for (k を 1 から data の要素数 まで 1 ずつ増やす)
    s の末尾に   a   の値を追加する
  endfor
  return s

○整数型: rangeSum(整数型の配列: s, 整数型: l, 整数型: r)
  return   b"""
h01 = ["a", "b"]
ch01 = [["s[k] ＋ data[k]", "s[r ＋ 1] − s[l]"], ["s[k] ＋ data[k]", "s[r] − s[l]"], ["s[k] ＋ data[k]", "s[r ＋ 1] − s[l − 1]"],
        ["data[k]", "s[r ＋ 1] − s[l]"], ["s[k ＋ 1] ＋ data[k]", "s[r ＋ 1] − s[l]"], ["s[k] ＋ data[k]", "s[r] − s[l − 1]"]]


def t01(ns):
    rnd = random.Random(1)
    good = total = oor = 0
    for n in range(1, 8):
        for _ in range(30):
            d = [rnd.randint(-5, 9) for _ in range(n)]
            for l in range(1, n + 1):
                for r in range(l, n + 1):
                    total += 1
                    try:
                        s = ns["makePrefix"](PS.A(d))
                        if ns["rangeSum"](s, l, r) == sum(d[l - 1:r]):
                            good += 1
                    except PS.OutOfRange:
                        oor += 1
    return good, total, oor


r01 = only(blank_results(code01, h01, ch01, t01), "ア")
ex01 = {}
for lab, cols in zip("アイウエカ", [ch01[0], ch01[1], ch01[2], ch01[3], ch01[5]]):
    ns = PS.load(PS.fill_blanks(code01, dict(zip(h01, cols))))
    s_ = ns["makePrefix"](PS.A([3, 1, 4, 1, 5]))
    ex01[lab] = (s_.py(), ns["rangeSum"](s_, 2, 4))
assert ex01 == {"ア": ([0, 3, 4, 8, 9, 14], 6), "イ": ([0, 3, 4, 8, 9, 14], 5), "ウ": ([0, 3, 4, 8, 9, 14], 9),
                "エ": ([0, 3, 1, 4, 1, 5], -2), "カ": ([0, 3, 4, 8, 9, 14], 8)}, ex01
LOG.append(("M2B01", r01))
qb("M2B01", AL, "配列・添字", "累積和の配列で区間の和を求める", "仕様読解", "易", 240,
   [P(INTRO_BLANK),
    P("関数 makePrefix は、整数型の配列 data（要素数 n、n ≧ 1）を受け取り、要素数 n＋1 の配列 s を作って返す。s[1] は0で、s[k＋1]（k＝1, 2, …, n）は data[1] から data[k] までの和である。"),
    P("関数 rangeSum は、makePrefix で作った配列 s と、1 ≦ l ≦ r ≦ n を満たす整数 l、r を受け取り、data[l] から data[r] までの和を返す。rangeSum では、繰返しを使わずに、s の2つの要素の差だけで和を求める。"),
    P("例えば、data が {3, 1, 4, 1, 5} のとき、makePrefix は {0, 3, 4, 8, 9, 14} を返し、rangeSum(s, 2, 4) は 1＋4＋1＝6 を返す。"),
    P("〔プログラム〕"), CODE(code01)],
   ch01, "ア",
   "a：s の末尾に追加するのは s[k＋1] の値で、これは s[k]（data[1] から data[k−1] までの和）に data[k] を加えた値。追加する時点で s の要素数は k なので、s[k] は直前に追加した要素を指す。"
   "b：data[l] から data[r] までの和は、data[1]～data[r] の和 s[r＋1] から、data[1]～data[l−1] の和 s[l] を引いた値。例では s[5]－s[2]＝9－3＝6。"
   "イは、b が s[r]－s[l] で data[l]～data[r−1] の和になる（例で 8－3＝5）。ウは、b が s[r＋1]－s[l－1] で、l≧2 のとき data[l−1] も加わり（例で 9－0＝9）、l＝1 では s[0] を参照する。"
   "エは、a で data[k] だけを追加するので、s が累積和にならない（例で s＝{0, 3, 1, 4, 1, 5}、結果 1－3＝−2）。"
   "オは、a の s[k＋1] がまだ存在しない要素なので、最初の追加で参照の誤りになる。カは、b が s[r]－s[l－1] で、l≧2 のとき data[l−1]～data[r−1] の和になる（例で 8－0＝8）。"
   f"〔検算〕要素数1～7の配列で、全ての l、r の組を試した{r01['ア'][1]}件で、正しい和を返すのはアだけ。",
   {"ア": "正解", "イ": "s[r]−s[l] で1つずれる", "ウ": "s[l−1] で前の要素まで加える", "エ": "累積しない",
    "オ": "未作成の要素を参照", "カ": "両方を1つずつずらす"}, header=h01)

# ================================================================ M2B02 2番目に大きい値(段階1サンプル)
code02 = """○整数型: secondLargest(整数型の配列: data)
  整数型: first ← −1
  整数型: second ← −1
  整数型: upd ← 0
  整数型: i
  for (i を 1 から data の要素数 まで 1 ずつ増やす)
    if (data[i] ＞ first)
      second ← first
      first ← data[i]
      upd ← upd ＋ 1
    elseif ((data[i] ＞ second) and (data[i] ≠ first))
      second ← data[i]
      upd ← upd ＋ 1
    endif
  endfor
  return second"""
data02 = [7, 12, 12, 5, 9, 15, 11, 15]
code02u = code02.replace("  return second", "  return {second, upd}")
r02 = PS.load(code02u)["secondLargest"](PS.A(data02)).py()
assert r02 == [12, 4]
# 読み違いの再現
r02_noeq = PS.load(code02u.replace(" and (data[i] ≠ first)", ""))["secondLargest"](PS.A(data02)).py()
r02_nomove = PS.load(code02u.replace("      second ← first\n", ""))["secondLargest"](PS.A(data02)).py()
r02_elseupd = PS.load(code02u.replace("      second ← data[i]\n      upd ← upd ＋ 1", "      second ← data[i]"))["secondLargest"](PS.A(data02)).py()
assert (r02_noeq, r02_nomove, r02_elseupd) == ([15, 5], [11, 6], [12, 3])
# 仕様どおりか(2番目に大きい異なる値)
rnd = random.Random(2)
f02 = PS.load(code02)["secondLargest"]
for _ in range(3000):
    d = [rnd.randint(0, 9) for _ in range(rnd.randint(0, 8))]
    u = sorted(set(d), reverse=True)
    assert f02(PS.A(d)) == (u[1] if len(u) >= 2 else -1)
qb("M2B02", AL, "複数変数の更新", "最大値と2番目に大きい値を同時に更新する", "追跡", "標準", 270,
   [P("次のプログラムにおいて、関数 secondLargest を、data を次の配列として呼び出したとき、関数の戻り値と、関数の処理が終わった時点の変数 upd の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("　data ＝ {7, 12, 12, 5, 9, 15, 11, 15}"),
    P("関数 secondLargest は、0以上の整数が格納された配列 data について、異なる値のうち2番目に大きい値を返す。異なる値が2種類未満の場合は −1 を返す。条件式 x and y では、x が false のとき y は評価しない。"),
    P("〔プログラム〕"), CODE(code02)],
   [["12", "4"], ["12", "3"], ["15", "4"], ["15", "5"], ["11", "6"]], "ア",
   "first・second・upd を1行ずつ追う。i＝1：7＞−1 で second＝−1、first＝7、upd＝1。i＝2：12＞7 で second＝7、first＝12、upd＝2。i＝3：12 は first と等しいので更新なし。"
   "i＝4：5 は second の7以下で更新なし。i＝5：9＞7 かつ 9≠12 で second＝9、upd＝3。i＝6：15＞12 で second＝12、first＝15、upd＝4。i＝7：11 は second の12以下で更新なし。"
   "i＝8：15 は first と等しいので更新なし。戻り値は second の12、upd は4。"
   "イの戻り値12・upd 3は、elseif の側の upd ← upd＋1 を読み落とし、first を更新した回数（i＝1、2、6 の3回）だけを数えた場合。ウの戻り値15・upd 4は、戻り値に first の値15を答えた場合。"
   "エの戻り値15・upd 5は、条件の data[i] ≠ first を読み落とした場合（i＝3 で second が12、i＝8 で second が15になる）。"
   "オの戻り値11・upd 6は、first を更新するときに second ← first を行わなかった場合（i＝6 で second が9のまま残り、その後 i＝7 の11で更新される）。"
   "〔検算〕要素数0～8・同じ値を含む3,000件で、戻り値が“異なる値のうち2番目に大きい値”と一致することを確認。本文の入力の追跡、および誤答の値（イ・エ・オ）は、それぞれの読み違いを再現したコードの実行結果と一致。",
   {"ア": "正解", "イ": "elseif 側の upd 更新を読み落とす", "ウ": "first を答える", "エ": "≠ first を読み落とす", "オ": "second ← first を行わない"},
   header=["戻り値", "upd の値"])

# ================================================================ M2B03 ハノイの塔
code03 = """○hanoi(整数型: n, 文字型: src, 文字型: dst, 文字型: tmp)
  if (n ≧ 1)
    hanoi(n − 1, src, tmp, dst)
    n と src と dst を出力する
    hanoi(n − 1, tmp, dst, src)
  endif"""


def run03(code):
    ns = PS.load(code)
    ns["hanoi"](4, "A", "C", "B")
    return ns["_outs"]


o03 = run03(code03)
assert len(o03) == 15 and o03[9] == (2, "B", "A")
o03_sw1 = run03(code03.replace("hanoi(n − 1, src, tmp, dst)", "hanoi(n − 1, src, dst, tmp)"))
o03_sw2 = run03(code03.replace("hanoi(n − 1, tmp, dst, src)", "hanoi(n − 1, dst, tmp, src)"))
fmt03 = lambda t: [str(t[0]), t[1], t[2]]
ch03 = [fmt03(o03[9]), fmt03(o03[8]), fmt03(o03[10]), fmt03(o03_sw1[9]), fmt03(o03_sw2[9])]
assert len({tuple(c) for c in ch03}) == 5, ch03
qb("M2B03", AL, "再帰・戻り値", "ハノイの塔で k 回目に出力される移動", "追跡", "難", 300,
   [P("次の記述中の空欄に入れる正しい答えを、解答群の中から選べ。"),
    P("手続 hanoi は、3本の棒 A、B、C のうち、棒 src に積まれた n 枚の円盤（上から順に1, 2, …, n の番号が付いている）を、棒 tmp を作業用に使って棒 dst へ移す手順を出力する。円盤を1枚動かすたびに、動かす円盤の番号、移動元の棒、移動先の棒をこの順に1行で出力する。"),
    P("〔プログラム〕"), CODE(code03),
    P("hanoi(4, \"A\", \"C\", \"B\") を実行したとき、全部で15行が出力される。このうち10行目に出力される内容は、　　　 である。")],
   ch03, "ア",
   "hanoi(n, src, dst, tmp) は、①上の n−1 枚を tmp へ移す、②円盤 n を dst へ移す、③tmp の n−1 枚を dst へ移す、の順に出力する。"
   "hanoi(4, A, C, B) では、1～7行目が上の3枚を A から B へ移す出力、8行目が“4 A C”、9～15行目が hanoi(3, B, C, A)（3枚を B から C へ）の出力になる。"
   "hanoi(3, B, C, A) の出力は、hanoi(2, B, A, C) の3行（1 B C、2 B A、1 C A）、“3 B C”、hanoi(2, A, C, B) の3行の順なので、10行目は全体の8行に続く2行目の“2 B A”。"
   f"イの“{' '.join(ch03[1])}”は9行目、ウの“{' '.join(ch03[2])}”は11行目の出力。"
   f"エの“{' '.join(ch03[3])}”は、1回目の再帰呼出しの dst と tmp の実引数を入れ替えて読んだ場合の10行目。"
   f"オの“{' '.join(ch03[4])}”は、2回目の再帰呼出しの dst と tmp の実引数を入れ替えて読んだ場合の10行目。"
   "〔検算〕問題文のプログラムをそのまま実行し、15行の出力と10行目を確認した。エ・オは、それぞれの読み違いを再現したプログラムの10行目と一致。",
   {"ア": "正解 10行目", "イ": "9行目", "ウ": "11行目", "エ": "1回目の呼出しの実引数の取違え", "オ": "2回目の呼出しの実引数の取違え"},
   header=["円盤", "移動元", "移動先"])

# ================================================================ M2B04 番兵(段階1サンプル)
code04 = """○整数型: search(整数型の配列: data, 整数型: n, 整数型: x)
  整数型: i ← 1
     a
  while (data[i] ≠ x)
    i ← i ＋ 1
  endwhile
  if (   b   )
    return i
  else
    return 0
  endif"""
ch04 = [["data[n ＋ 1] ← x", "i ≦ n"], ["data[n ＋ 1] ← x", "i ＜ n"], ["data[n ＋ 1] ← x", "i ＝ n ＋ 1"],
        ["data[n] ← x", "i ≦ n"], ["data[n] ← x", "i ＜ n"], ["data[n] ← x", "i ＝ n ＋ 1"]]


def t04(ns):
    good = total = oor = 0
    for n in range(0, 5):
        for vals in itertools.product(range(1, 4), repeat=n):
            for x in range(0, 5):
                total += 1
                d = list(vals) + [0]
                arr = PS.A(d)
                want = (vals.index(x) + 1) if x in vals else 0
                try:
                    got = ns["search"](arr, n, x)
                    if got == want and arr.py()[:n] == list(vals):
                        good += 1
                except PS.OutOfRange:
                    oor += 1
    return good, total, oor


r04 = only(blank_results(code04, ["a", "b"], ch04, t04), "ア")
LOG.append(("M2B04", r04))
qb("M2B04", AL, "探索", "番兵を使った線形探索", "仕様読解", "標準", 255,
   [P(INTRO_BLANK),
    P("関数 search は、整数型の配列 data の要素番号1～n に格納された n 個の値（n ≧ 0）の中から、値 x と等しい要素を先頭から順に探し、最初に見つかった要素の要素番号を返す。見つからない場合は0を返す。data の要素数は n＋1 であり、要素番号 n＋1 の要素は探索のための作業領域として使ってよい。要素番号1～n の要素の値は変更してはならない。"),
    P("繰返しのたびに要素番号が n を超えていないかを調べる手間を省くため、探す値 x を作業領域に格納してから探索する（番兵法）。"),
    P("〔プログラム〕"), CODE(code04)],
   ch04, "ア",
   "a：作業領域の要素番号は n＋1 なので data[n＋1] ← x。これで while 文は必ず止まる。b：止まった位置 i が n 以下なら本来のデータの中で見つかったので i を返し、i が n＋1 なら作業領域の番兵で止まったので見つからなかったと判断して0を返す。"
   "イは、要素番号 n で見つかった場合に0を返してしまう（例：{4, 7, 2} で x＝2 のとき）。ウは、見つかった場合と見つからなかった場合の判定が逆になる。"
   "エ・オ・カは要素番号 n の値を x で上書きするので、本来のデータを変更してしまう（例：{4, 7, 2} で x＝9 のとき、エは3を返す）。また n＝0 のときは存在しない要素 data[0] に書き込む。"
   f"〔検算〕要素数 n＝0～4、x が先頭・末尾・途中・存在しない場合を含む{r04['ア'][1]}件を、範囲外参照を検出する配列で実行し、仕様どおりの値を返し、かつ要素番号1～n を変更しないのはアだけ。",
   {"ア": "正解", "イ": "末尾で見つかった場合を除く", "ウ": "判定が逆", "エ": "data[n] を上書き", "オ": "data[n] を上書き・判定も誤り", "カ": "data[n] を上書き・判定が逆"},
   header=["a", "b"])

# ================================================================ M2B05 計数ソート
code05 = """○整数型の配列: countSort(整数型の配列: data, 整数型: m)
  整数型の配列: cnt ← {(m ＋ 1)個の0}
  整数型の配列: out ← {}
  整数型: i, v, k
  for (i を 1 から data の要素数 まで 1 ずつ増やす)
    cnt[  a  ] ← cnt[  a  ] ＋ 1
  endfor
  for (v を 0 から m まで 1 ずつ増やす)
    for (k を 1 から   b   まで 1 ずつ増やす)
      out の末尾に v の値を追加する
    endfor
  endfor
  return out"""
h05 = ["a", "b"]
ch05 = [["data[i] ＋ 1", "cnt[v ＋ 1]"], ["data[i] ＋ 1", "cnt[v]"], ["data[i]", "cnt[v ＋ 1]"],
        ["data[i]", "cnt[v]"], ["i", "cnt[v ＋ 1]"], ["data[i] ＋ 1", "v"]]


def fill05(cols):
    c = code05
    c = c.replace("cnt[  a  ] ← cnt[  a  ] ＋ 1", f"cnt[{cols[0]}] ← cnt[{cols[0]}] ＋ 1")
    return PS.fill_blanks(c, {"b": cols[1]})


def t05(cols):
    ns = PS.load(fill05(cols))
    rnd = random.Random(5)
    good = total = oor = 0
    for m in range(0, 6):
        for _ in range(80):
            d = [rnd.randint(0, m) for _ in range(rnd.randint(0, 8))]
            total += 1
            try:
                if ns["countSort"](PS.A(d), m).py() == sorted(d):
                    good += 1
            except PS.OutOfRange:
                oor += 1
    return good, total, oor


r05 = {lab: t05(c) for lab, c in zip("アイウエオカ", ch05)}
only(r05, "ア")
LOG.append(("M2B05", r05))
ex05 = PS.load(fill05(ch05[0]))["countSort"](PS.A([3, 0, 2, 3, 1, 0, 3]), 3).py()
assert ex05 == [0, 0, 1, 2, 3, 3, 3]
ex05i = PS.load(fill05(ch05[1]))
try:
    ex05i["countSort"](PS.A([3, 0, 2, 3, 1, 0, 3]), 3)
    raise AssertionError
except PS.OutOfRange:
    pass
ex05k = PS.load(fill05(ch05[5]))["countSort"](PS.A([3, 0, 2, 3, 1, 0, 3]), 3).py()
assert ex05k == [1, 2, 2, 3, 3, 3]
qb("M2B05", AL, "整列", "計数ソート(度数を数えて並べる)", "仕様読解", "標準", 270,
   [P(INTRO_BLANK),
    P("関数 countSort は、0以上 m 以下の整数が格納された配列 data を受け取り、その値を昇順に並べた配列を返す。値どうしを比較する代わりに、0～m の各値が data に幾つあるかを数え（度数）、小さい値から順に、度数の回数だけ出力の配列に追加する。"),
    P("配列 cnt の要素番号は1から始まるので、値 v の度数は cnt[v＋1] に格納する。例えば、data が {3, 0, 2, 3, 1, 0, 3}、m が3のとき、cnt は {2, 1, 1, 3} となり、countSort は {0, 0, 1, 2, 3, 3, 3} を返す。なお、for 文で、繰返しの終わりの値が始めの値より小さいときは、一度も繰り返さない。"),
    P("〔プログラム〕"), CODE(code05)],
   ch05, "ア",
   "a：値 data[i] の度数は cnt[data[i]＋1] に数えるので、a は data[i]＋1。b：値 v を、v の度数 cnt[v＋1] の回数だけ追加するので、b は cnt[v＋1]。"
   "イは、b が cnt[v] で、v＝0 のとき存在しない cnt[0] を参照する。ウは、a が data[i] で、値0を数えるときに cnt[0] を参照する。エも同じく cnt[0] を参照する。"
   "オは、a が i で、値ではなく要素の位置を数えてしまう（data の要素数が m＋1 を超えると範囲外になる）。"
   f"カは、b が v で、値 v を v 回追加するので、度数と関係のない結果になる（例では {{{', '.join(map(str, ex05k))}}}）。"
   f"〔検算〕m＝0～5、要素数0～8 の配列{r05['ア'][1]}件で、昇順に並べた結果を返すのはアだけ。",
   {"ア": "正解", "イ": "cnt[0] を参照", "ウ": "値0で cnt[0] を参照", "エ": "cnt[0] を参照", "オ": "位置を数える", "カ": "v 回追加する"},
   header=h05)

# ================================================================ M2B06 括弧の対応
code06 = """○整数型: check(文字列型: s)
  文字型の配列: st ← {(s の文字数)個の" "}
  整数型: top ← 0
  整数型: i
  for (i を 1 から s の文字数 まで 1 ずつ増やす)
    if ((s[i] ＝ "(") or (s[i] ＝ "["))
      top ← top ＋ 1
      st[top] ← s[i]
    elseif ((s[i] ＝ ")") or (s[i] ＝ "]"))
      if (top ＝ 0)
        return i
      endif
      if (((s[i] ＝ ")") and (st[top] ≠ "(")) or ((s[i] ＝ "]") and (st[top] ≠ "[")))
        return i
      endif
      top ← top − 1
    endif
  endfor
  if (top ＞ 0)
    return −1
  endif
  return 0"""
ns06 = PS.load(code06)
S06 = {"X": "([()])()", "Y": "(()]", "Z": "(()[]"}
r06 = {k: ns06["check"](PS.Str(v)) for k, v in S06.items()}
assert r06 == {"X": 0, "Y": 4, "Z": -1}, r06


def check_ref(s, mode="ok"):
    st = []
    for i, c in enumerate(s, 1):
        if c in "([":
            st.append(c)
        elif c in ")]":
            if not st:
                return i
            if mode != "kind" and (c == ")" and st[-1] != "(" or c == "]" and st[-1] != "["):
                return i
            st.pop()
    if st:
        return 0 if mode == "noend" else -1
    return 0


assert {k: check_ref(v) for k, v in S06.items()} == r06
w06_kind = {k: check_ref(v, "kind") for k, v in S06.items()}
w06_noend = {k: check_ref(v, "noend") for k, v in S06.items()}
assert w06_kind == {"X": 0, "Y": 0, "Z": -1} and w06_noend == {"X": 0, "Y": 4, "Z": 0}
fmt06 = lambda r: [num(r["X"]), num(r["Y"]), num(r["Z"])]
ch06 = [fmt06(r06), fmt06(w06_kind), fmt06(w06_noend), ["0", "3", "−1"], ["0", "4", "5"]]
ch06 = [[c.replace("-", "−") for c in row] for row in ch06]
assert len({tuple(c) for c in ch06}) == 5
qb("M2B06", AL, "スタック", "スタックによる括弧の対応の検査", "追跡", "易", 255,
   [P("次のプログラムにおいて、関数 check を、文字列 X、Y、Z を引数としてそれぞれ呼び出したときの戻り値の組合せとして正しいものを、解答群の中から選べ。ここで、文字列の i 文字目を s[i] で表し、配列と文字列の要素番号は1から始まる。"),
    P("関数 check は、丸括弧“(”“)”と角括弧“[”“]”からなる文字列 s の括弧の対応を、配列 st をスタックとして使って調べる。対応が正しければ0を、閉じ括弧に対応する開き括弧がない又は種類が違う場合はその文字の位置を、最後まで調べて閉じられていない開き括弧が残っている場合は −1 を返す。"),
    LIST(f"X ＝ \"{S06['X']}\"", f"Y ＝ \"{S06['Y']}\"", f"Z ＝ \"{S06['Z']}\""),
    P("〔プログラム〕"), CODE(code06)],
   ch06, "ア",
   "X：(、[、( を積み、) で ( を、] で [ を、) で ( を取り出し、続く ( ) も対応するので、最後に top＝0 で0を返す。"
   "Y：(、( を積み、3文字目の ) で ( を取り出す。4文字目の ] は、スタックの先頭が ( で種類が違うので、4を返す。"
   "Z：(、( を積み、) で1つ取り出し、[ を積み ] で取り出す。最後まで調べると ( が1つ残り、top＝1 なので −1 を返す。"
   "イの Y が0は、括弧の種類を比べずに数だけで判断した場合（4文字目の ] で ( を取り出し、全て対応したと判断する）。ウの Z が0は、最後の top ＞ 0 の判定を読み落とした場合。"
   "エの Y が3は、取り出した後の位置を返すと考えた場合。オの Z が5は、閉じられていない開き括弧があるときに最後の文字の位置を返すと考えた場合。",
   {"ア": "正解", "イ": "種類を比べない", "ウ": "最後の判定を読み落とす", "エ": "位置の取違え", "オ": "−1 の条件の取違え"},
   header=["X", "Y", "Z"])

# ================================================================ M2B07 待ち行列のシミュレーション
code07 = """○整数型: totalWait(整数型の配列: arrive, 整数型の配列: service)
  整数型: free ← 0
  整数型: total ← 0
  整数型: start, i
  for (i を 1 から arrive の要素数 まで 1 ずつ増やす)
    if (arrive[i] ≧ free)
      start ← arrive[i]
    else
      start ← free
    endif
    total ← total ＋ (start − arrive[i])
    free ← start ＋ service[i]
  endfor
  return total"""
arr07 = [0, 2, 3, 11, 12]
svc07 = [4, 3, 2, 3, 1]
code07r = code07.replace("  return total", "  return {total, free}")
r07 = PS.load(code07r)["totalWait"](PS.A(arr07), PS.A(svc07)).py()
assert r07 == [8, 15], r07
v07 = {
    "arrive": code07r.replace("free ← start ＋ service[i]", "free ← arrive[i] ＋ service[i]"),
    "stay": code07r.replace("total ← total ＋ (start − arrive[i])", "total ← total ＋ (start − arrive[i]) ＋ service[i]"),
    "always": code07r.replace("    if (arrive[i] ≧ free)\n      start ← arrive[i]\n    else\n      start ← free\n    endif", "    start ← free"),
    "noserv": code07r.replace("free ← start ＋ service[i]", "free ← start"),
}
w07 = {k: PS.load(c)["totalWait"](PS.A(arr07), PS.A(svc07)).py() for k, c in v07.items()}
assert w07 == {"arrive": [6, 13], "stay": [21, 15], "always": [4, 13], "noserv": [0, 12]}, w07
ch07 = [[num(a), num(b)] for a, b in (r07, w07["arrive"], w07["stay"], w07["always"], w07["noserv"])]
qb("M2B07", AL, "キュー", "窓口の待ち行列シミュレーション(待ち時間の合計)", "追跡", "標準", 285,
   [P("次のプログラムにおいて、関数 totalWait を、表の到着時刻と処理時間を格納した配列 arrive、service を引数として呼び出したとき、関数の戻り値と、関数の処理が終わった時点の変数 free の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("窓口は1つで、客は到着順に1人ずつ処理を受ける。窓口が空いていれば到着した時刻に処理を始め、ほかの客の処理中であれば、その処理が終わるまで待つ。関数 totalWait は、全ての客の待ち時間（処理の開始時刻－到着時刻）の合計を返す。変数 free は、窓口が次に空く時刻を表す。"),
    TABLE(["客", "1", "2", "3", "4", "5"], [["到着時刻（分）"] + arr07, ["処理時間（分）"] + svc07], "表　客の到着時刻と処理時間"),
    P("〔プログラム〕"), CODE(code07)],
   ch07, "ア",
   "客1：到着0≧free 0 なので開始0、待ち0、free＝4。客2：到着2＜4 なので開始4、待ち2、free＝7。客3：到着3＜7 なので開始7、待ち4、free＝9。"
   "客4：到着11≧9 なので開始11（窓口は9～11が空き）、待ち0、free＝14。客5：到着12＜14 なので開始14、待ち2、free＝15。待ち時間の合計は 0＋2＋4＋0＋2＝8、free は15。"
   f"イの戻り値{ch07[1][0]}・free {ch07[1][1]}は、free を“開始時刻＋処理時間”ではなく“到着時刻＋処理時間”で更新した場合。"
   f"ウの{ch07[2][0]}・{ch07[2][1]}は、待ち時間に処理時間も加えた（滞在時間の合計を求めた）場合。"
   f"エの{ch07[3][0]}・{ch07[3][1]}は、窓口が空いていても常に free の時刻に開始するとした場合で、客4の待ちが −2 になる。"
   f"オの{ch07[4][0]}・{ch07[4][1]}は、free に処理時間を加えず、開始時刻のままにした場合。"
   "〔検算〕問題文のプログラムを実行して戻り値8・free 15 を確認し、誤答の値は、それぞれの読み違いを再現したプログラムの実行結果と一致。",
   {"ア": "正解", "イ": "free を到着時刻から計算", "ウ": "処理時間も加える", "エ": "常に free から開始", "オ": "free に処理時間を加えない"},
   header=["戻り値", "free の値"])

# ================================================================ M2B08 エラトステネスのふるい
code08 = """○整数型の配列: primes(整数型: n)
  論理型の配列: isP ← {n 個の true}
  整数型の配列: res ← {}
  整数型: i, j
  isP[1] ← false
  for (i を 2 から n まで 1 ずつ増やす)
    if (isP[i])
      j ←   a
      while (j ≦ n)
        isP[j] ← false
        j ←   b
      endwhile
    endif
  endfor
  for (i を 1 から n まで 1 ずつ増やす)
    if (isP[i])
      res の末尾に i の値を追加する
    endif
  endfor
  return res"""
h08 = ["a", "b"]
ch08 = [["i × i", "j ＋ i"], ["i × i", "j ＋ 1"], ["i", "j ＋ i"], ["i × i", "j × i"], ["i ＋ 1", "j ＋ i"]]


def isprime(k):
    return k >= 2 and all(k % d for d in range(2, int(k ** 0.5) + 1))


def t08(ns):
    good = total = oor = 0
    for n in range(2, 80):
        total += 1
        try:
            if ns["primes"](n).py() == [k for k in range(2, n + 1) if isprime(k)]:
                good += 1
        except PS.OutOfRange:
            oor += 1
    return good, total, oor


r08 = only(blank_results(code08, h08, ch08, t08), "ア")
LOG.append(("M2B08", r08))
ex08 = {lab: PS.load(PS.fill_blanks(code08, dict(zip(h08, c))))["primes"](30).py() for lab, c in zip("アイウエオ", ch08)}
assert ex08["ア"] == [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
assert ex08["イ"] == [2, 3] and ex08["ウ"] == [] and ex08["オ"] == list(range(2, 31, 2))
assert 6 in ex08["エ"]
qb("M2B08", AL, "二重ループ", "エラトステネスのふるい", "仕様読解", "易", 270,
   [P(INTRO_BLANK),
    P("関数 primes は、2以上の整数 n を受け取り、n 以下の素数を小さい順に格納した配列を返す。配列 isP の要素 isP[k] は、k が素数の候補として残っているかどうかを表す。2から順に、候補として残っている数 i について、i の倍数のうち i×i 以上のものを候補から外す（i×i より小さい倍数は、i より小さい素数の倍数として既に外されている）。"),
    P("〔プログラム〕"), CODE(code08)],
   ch08, "ア",
   "a：i の倍数のうち i×i 以上のものを外すので、最初に外すのは i×i。b：次の倍数へ進むので、j に i を加える。"
   f"イは、j を1ずつ増やすので、i×i 以上の全ての数を外してしまう（n＝30 で 2, 3 だけが残る）。"
   f"ウは、i 自身から外すので、素数も全て候補から外れる（n＝30 で空の配列）。"
   f"エは、j に i を掛けるので、i^2, i^3, … だけを外し、6 や 10 などが残る。"
   f"オは、i＋1 から i おきに外すので、i＝2 で 3, 5, 7, … の奇数が外れ、n＝30 では 2, 4, 6, …, 30 の偶数だけが残る。"
   f"〔検算〕n＝2～79 の{r08['ア'][1]}通りで、n 以下の素数の一覧と一致するのはアだけ。",
   {"ア": "正解", "イ": "1ずつ増やす", "ウ": "i 自身を外す", "エ": "べき乗だけ外す", "オ": "i+1 から外す"},
   header=h08)

# ================================================================ M2B09 配列を引数に受け取る関数(段階1サンプル)
code09 = """○整数型: adjust(整数型の配列: a, 整数型: k)
  整数型: c ← 0
  整数型: i
  for (i を 1 から a の要素数 まで 1 ずつ増やす)
    if (a[i] ＜ k)
      a[i] ← k
      c ← c ＋ 1
    endif
  endfor
  k ← k ＋ c
  return c

○main()
  整数型の配列: p ← {4, 9, 2, 7, 5}
  整数型: t ← 6
  整数型: r
  r ← adjust(p, t)
  r ← r ＋ adjust(p, t ＋ 2)"""
main09 = code09.replace("  r ← r ＋ adjust(p, t ＋ 2)", "  r ← r ＋ adjust(p, t ＋ 2)\n  return {p, r}")
r09 = PS.load(main09)["main"]().py()
assert r09 == [[8, 9, 8, 8, 8], 7]
qb("M2B09", AL, "関数間の値受渡し", "配列を引数に受け取る関数の呼出し後の状態と戻り値", "追跡", "難", 300,
   [P("次のプログラムにおいて、手続 main を実行し終えた時点の配列 p の内容と変数 r の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("このプログラムでは、引数の受け渡しは次のとおりとする。"),
    LIST("配列を引数として渡すと、呼び出された関数は呼出し元の配列そのものを扱う。呼び出された関数の中で要素の値を変更すると、呼出し元の配列の要素も変更される。",
         "整数型の値を引数として渡すと、呼び出された関数は値の写しを受け取る。呼び出された関数の中で引数の値を変更しても、呼出し元の変数の値は変わらない。"),
    P("〔プログラム〕"), CODE(code09)],
   [["{8, 9, 8, 8, 8}", "7"], ["{4, 9, 2, 7, 5}", "7"], ["{11, 11, 11, 11, 11}", "8"], ["{6, 9, 6, 7, 6}", "3"], ["{8, 9, 8, 8, 8}", "4"], ["{6, 9, 6, 7, 6}", "7"]], "ア",
   "1回目の呼出し adjust(p, 6)：6未満の要素 4、2、5 を6にするので、p は {6, 9, 6, 7, 6}、戻り値は3。関数の中の k ← k＋c は写しの k を変えるだけで、t は6のまま。r＝3。"
   "2回目の呼出し adjust(p, 8)：1回目で変更された p に対して、8未満の要素 6、7、6、6 を8にするので、p は {8, 9, 8, 8, 8}、戻り値は4。r＝3＋4＝7。"
   "イの p＝{4, 9, 2, 7, 5}・r＝7は、配列も写しが渡されると考えた場合（p は元のまま。1回目は3個、2回目は元の配列で8未満の4個を数え、r＝3＋4＝7）。"
   "ウの p＝{11, 11, 11, 11, 11}・r＝8は、k ← k＋c で t も変わる（t＝9）と考えた場合（2回目は k＝11 で全要素を変更し、r＝3＋5＝8）。"
   "エの p＝{6, 9, 6, 7, 6}・r＝3は、2回目も t と同じ6を渡すと読んだ場合（2回目は変更なし、r＝3＋0＝3）。"
   "オの p＝{8, 9, 8, 8, 8}・r＝4は、r ← r＋… の加算を読み落とし、2回目の戻り値だけを r とした場合。"
   "カの p＝{6, 9, 6, 7, 6}・r＝7は、2回目の呼出しで配列を変更しないと考えた場合。"
   "〔検算〕問題文のプログラムを実行し、p＝{8, 9, 8, 8, 8}、r＝7 を確認した。誤答の値は、それぞれの受け渡しの解釈で実行した結果と一致。",
   {"ア": "正解", "イ": "配列も写しと考える", "ウ": "t も変わると考える", "エ": "2回目も6と読む", "オ": "加算を読み落とす", "カ": "2回目で配列を変更しない"},
   header=["配列 p", "r の値"])

# ================================================================ M2B10 翌日を求める
code10 = """○整数型の配列: nextDay(整数型: y, 整数型: m, 整数型: d)
  if (d ＜ days(y, m))
    return {y, m, d ＋ 1}
  elseif (   a   )
    return {y, m ＋ 1, 1}
  else
    return {   b   }
  endif"""
h10 = ["a", "b"]
ch10 = [["m ＜ 12", "y ＋ 1, 1, 1"], ["m ≦ 12", "y ＋ 1, 1, 1"], ["m ＜ 12", "y ＋ 1, m, 1"],
        ["m ＜ 12", "y, 1, 1"], ["d ＝ days(y, m)", "y ＋ 1, 1, 1"], ["m ＞ 1", "y ＋ 1, 1, 1"]]
import datetime


def days_py(y, m):
    nxt = datetime.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - datetime.date(y, m, 1)).days


def t10(ns):
    good = total = oor = 0
    for y in (1999, 2000, 2023, 2024, 2100):
        d0 = datetime.date(y, 1, 1)
        while d0.year == y:
            total += 1
            n_ = d0 + datetime.timedelta(days=1)
            if ns["nextDay"](d0.year, d0.month, d0.day).py() == [n_.year, n_.month, n_.day]:
                good += 1
            d0 = n_
    return good, total, oor


r10 = only(blank_results(code10, h10, ch10, t10, extra={"days": days_py}), "ア")
LOG.append(("M2B10", r10))
ex10 = {lab: PS.load(PS.fill_blanks(code10, dict(zip(h10, c))), extra={"days": days_py})["nextDay"](2026, 12, 31).py() for lab, c in zip("アイウエオカ", ch10)}
ex10b = {lab: PS.load(PS.fill_blanks(code10, dict(zip(h10, c))), extra={"days": days_py})["nextDay"](2026, 4, 30).py() for lab, c in zip("アイウエオカ", ch10)}
assert ex10 == {"ア": [2027, 1, 1], "イ": [2026, 13, 1], "ウ": [2027, 12, 1], "エ": [2026, 1, 1], "オ": [2026, 13, 1], "カ": [2026, 13, 1]}, ex10
assert ex10b["カ"] == [2026, 5, 1] and PS.load(PS.fill_blanks(code10, dict(zip(h10, ch10[5]))), extra={"days": days_py})["nextDay"](2026, 1, 31).py() == [2027, 1, 1]
qb("M2B10", AL, "条件分岐・終了条件", "日付の翌日を求める処理(月末・年末)", "仕様読解", "標準", 270,
   [P("次のプログラム中の a と b に入れる正しい答えの組合せを、解答群の中から選べ。"),
    P("関数 nextDay は、西暦 y 年 m 月 d 日（実在する日付）を受け取り、その翌日の年・月・日を、要素数3の配列 {年, 月, 日} で返す。関数 days(y, m) は、y 年 m 月の日数（28～31。うるう年も正しく扱う）を返す。"),
    P("〔プログラム〕"), CODE(code10)],
   ch10, "ア",
   "d が月の日数より小さければ同じ月の翌日。d が月末で、12月より前の月なら翌月の1日。12月31日なら翌年の1月1日になる。したがって、a は m ＜ 12、b は y＋1, 1, 1。"
   "イは、a が m ≦ 12 で常に成り立つので、12月31日の翌日が {y, 13, 1} になる。ウは、12月31日の翌日が {y＋1, 12, 1} になる。エは、12月31日の翌日が年の変わらない {y, 1, 1} になる。"
   "オは、elseif に進むのは d が月の日数と等しいときだけなので a が常に成り立ち、12月31日の翌日が {y, 13, 1} になる。"
   "カは、a が m ＞ 1 で、12月31日の翌日が {y, 13, 1} になり、1月31日の翌日が翌年の1月1日になる。"
   f"〔検算〕うるう年を含む5年分（1999、2000、2023、2024、2100年）の全ての日付{r10['ア'][1]}件で、正しい翌日を返すのはアだけ。",
   {"ア": "正解", "イ": "m ≦ 12", "ウ": "月を戻さない", "エ": "年を進めない", "オ": "常に成り立つ条件", "カ": "m ＞ 1"},
   header=h10)

# ================================================================ M2B11 単語を数える
code11 = """○整数型: countWords(文字列型: s)
  整数型: cnt ← 0
  論理型: inWord ← false
  整数型: i
  for (i を 1 から s の文字数 まで 1 ずつ増やす)
    if (s[i] ＝ "␣")
      inWord ← false
    elseif (not inWord)
      inWord ← true
      cnt ← cnt ＋ 1
    endif
  endfor
  return cnt"""
s11 = "␣␣data␣␣base␣is␣␣␣fun␣"
r11 = PS.load(code11)["countWords"](PS.Str(s11))
assert r11 == 4
runs11 = len([g for g in s11.split("␣") if g == ""]) and sum(1 for i, c in enumerate(s11) if c == "␣" and (i == 0 or s11[i - 1] != "␣"))
sp11 = s11.count("␣")
assert (runs11, sp11) == (5, 9)
# inWord を false に戻す処理を読み落とすと、最初の単語だけを数える
r11_noreset = PS.load(code11.replace('      inWord ← false\n', '      inWord ← inWord\n'))["countWords"](PS.Str(s11))
assert r11_noreset == 1
qb("M2B11", AL, "文字列", "連続する空白を区切りとして単語を数える", "追跡", "易", 225,
   [P("次のプログラムにおいて、関数 countWords を、引数 s に次の文字列を与えて呼び出したときの戻り値として正しいものを、解答群の中から選べ。ここで、“␣”は空白1文字を表し、文字列の i 文字目を s[i] で表す（i は1から始まる）。"),
    CODE(f"\"{s11}\""),
    P("関数 countWords は、文字列 s の中の単語の数を返す。単語は、空白以外の文字が1文字以上連続した部分であり、単語と単語の間には1文字以上の空白がある。文字列の先頭と末尾にも空白があってよい。"),
    P("〔プログラム〕"), CODE(code11)],
   ["1", "4", "5", "9"], "イ",
   "inWord は、直前の文字が単語の中かどうかを表す。空白で false になり、空白以外の文字が来たときに inWord が false なら（単語の先頭なので）cnt を1増やして true にする。"
   "data、base、is、fun の先頭でそれぞれ cnt が増え、戻り値は4。連続する空白や、先頭・末尾の空白では cnt は増えない。"
   "アの1は、空白で inWord を false に戻す処理を読み落とした場合（最初の単語の先頭だけを数える）。ウの5は、連続した空白のまとまり（先頭、data の後、base の後、is の後、fun の後の5か所）を数えた場合。エの9は、空白の文字数を数えた場合。",
   {"ア": "false に戻す処理を読み落とす", "イ": "正解", "ウ": "空白のまとまりの数", "エ": "空白の文字数"})

# ================================================================ M2B12 行列の積
code12 = """○整数型の二次元配列: mul(整数型の二次元配列: A, 整数型の二次元配列: B, 整数型: n)
  整数型の二次元配列: C ← {n行n列の0}
  整数型: i, j, k
  for (i を 1 から n まで 1 ずつ増やす)
    for (j を 1 から n まで 1 ずつ増やす)
      for (k を 1 から n まで 1 ずつ増やす)
        C[i, j] ← C[i, j] ＋   a
      endfor
    endfor
  endfor
  return C"""
ch12 = ["A[i, k] × B[k, j]", "A[i, k] × B[j, k]", "A[k, i] × B[k, j]", "A[i, j] × B[i, j]", "A[k, j] × B[i, k]"]


def t12(lab, a):
    ns = PS.load(PS.fill_blanks(code12, {"a": a}))
    rnd = random.Random(12)
    good = total = 0
    for n in range(1, 5):
        for _ in range(40):
            X = [[rnd.randint(-3, 3) for _ in range(n)] for _ in range(n)]
            Y = [[rnd.randint(-3, 3) for _ in range(n)] for _ in range(n)]
            want = [[sum(X[i][k] * Y[k][j] for k in range(n)) for j in range(n)] for i in range(n)]
            total += 1
            good += ns["mul"](PS.A(X), PS.A(Y), n).py() == want
    return good, total, 0


r12 = {lab: t12(lab, a) for lab, a in zip("アイウエオ", ch12)}
only(r12, "ア")
LOG.append(("M2B12", r12))
X12, Y12 = [[1, 2], [3, 4]], [[5, 6], [7, 8]]
ex12 = {lab: PS.load(PS.fill_blanks(code12, {"a": a}))["mul"](PS.A(X12), PS.A(Y12), 2).py() for lab, a in zip("アイウエオ", ch12)}
assert ex12["ア"] == [[19, 22], [43, 50]], ex12
qb("M2B12", AL, "二次元配列", "行列の積の空欄補完", "仕様読解", "易", 270,
   [P("次のプログラム中の a に入れる正しい答えを、解答群の中から選べ。ここで、二次元配列の要素番号は行・列とも1から始まり、X の i 行 j 列の要素を X[i, j] で表す。"),
    P("関数 mul は、n 行 n 列の行列 A と B を受け取り、行列の積 C＝AB を返す。C の i 行 j 列の要素は、A の i 行目の要素と B の j 列目の要素を順に掛けて合計した値、すなわち A[i, 1]×B[1, j]＋A[i, 2]×B[2, j]＋…＋A[i, n]×B[n, j] である。"),
    P("例えば、A の1行目が {1, 2}、2行目が {3, 4}、B の1行目が {5, 6}、2行目が {7, 8} のとき、C の1行目は {19, 22}、2行目は {43, 50} になる。"),
    P("〔プログラム〕"), CODE(code12)],
   ch12, "ア",
   "C[i, j] は、k を1から n まで変えながら A[i, k]×B[k, j] を加えた合計なので、a は A[i, k]×B[k, j]。例では C[1, 1]＝1×5＋2×7＝19、C[1, 2]＝1×6＋2×8＝22。"
   f"イは、B を転置して掛けた積になる（例で1行目が {{{', '.join(map(str, ex12['イ'][0]))}}}）。ウは、A を転置して掛けた積になる（例で1行目が {{{', '.join(map(str, ex12['ウ'][0]))}}}）。"
   f"エは、同じ位置の要素の積を n 回加えたもので、行列の積ではない（例で1行目が {{{', '.join(map(str, ex12['エ'][0]))}}}）。"
   f"オは、積 BA の要素になる（例で1行目が {{{', '.join(map(str, ex12['オ'][0]))}}}）。"
   f"〔検算〕n＝1～4 のランダムな行列{r12['ア'][1]}組で、正しい積を返すのはアだけ。",
   {"ア": "正解", "イ": "B を転置", "ウ": "A を転置", "エ": "要素ごとの積", "オ": "BA を求める"})

# ================================================================ M2B13 会議室予約の重なり
code13 = """○論理型: canReserve(整数型の配列: st, 整数型の配列: en, 整数型: s, 整数型: e)
  整数型: i
  for (i を 1 から st の要素数 まで 1 ずつ増やす)
    if (   a   )
      return false
    endif
  endfor
  return true"""
ch13 = ["(s ＜ en[i]) and (st[i] ＜ e)", "(s ≦ en[i]) and (st[i] ≦ e)", "(st[i] ≦ s) and (e ≦ en[i])",
        "((st[i] ≦ s) and (s ＜ en[i])) or ((st[i] ＜ e) and (e ≦ en[i]))", "(s ＜ en[i]) or (st[i] ＜ e)", "(s ≦ st[i]) and (en[i] ≦ e)"]


def t13(ns):
    good = total = 0
    rng = range(0, 7)
    for nres in range(0, 3):
        for res in itertools.product([(a, b) for a in rng for b in rng if a < b], repeat=nres):
            for s in rng:
                for e in rng:
                    if s >= e:
                        continue
                    total += 1
                    want = all(not (s < b and a < e) for a, b in res)
                    got = ns["canReserve"](PS.A([a for a, _ in res]), PS.A([b for _, b in res]), s, e)
                    good += (got == want)
    return good, total, 0


r13 = {lab: t13(PS.load(PS.fill_blanks(code13, {"a": a}))) for lab, a in zip("アイウエオカ", ch13)}
only(r13, "ア")
LOG.append(("M2B13", r13))
res13 = [(600, 660), (720, 810), (840, 900)]


def can_ex(a, s, e):
    return PS.load(PS.fill_blanks(code13, {"a": a}))["canReserve"](PS.A([x for x, _ in res13]), PS.A([y for _, y in res13]), s, e)


ex13 = {lab: (can_ex(a, 660, 720), can_ex(a, 690, 870)) for lab, a in zip("アイウエオカ", ch13)}
assert ex13["ア"] == (True, False) and ex13["イ"] == (False, False) and ex13["エ"] == (True, False)
assert ex13["ウ"] == (True, True) and ex13["カ"] == (True, False) and ex13["オ"] == (False, False)
# エ と カ が誤りになる入力
assert can_ex(ch13[0], 590, 670) is False and can_ex(ch13[3], 590, 670) is True
assert can_ex(ch13[0], 630, 700) is False and can_ex(ch13[5], 630, 700) is True
assert PS.load(PS.fill_blanks(code13, {"a": ch13[3]}))["canReserve"](PS.A([630]), PS.A([650]), 600, 700) is True
assert PS.load(PS.fill_blanks(code13, {"a": ch13[5]}))["canReserve"](PS.A([600]), PS.A([700]), 630, 650) is True
qb("M2B13", AL, "初見の仕様", "会議室予約の時間帯の重なり判定", "仕様読解", "難", 315,
   [P("次のプログラム中の a に入れる正しい答えを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("ある会議室の予約を管理する。時刻は、その日の0時0分からの経過分（例：10時0分は600）で表す。予約は開始時刻と終了時刻の組で表し、開始時刻から終了時刻の直前までの時間帯を使う。このため、ある予約の終了時刻と、別の予約の開始時刻が同じでも、時間帯は重ならない。"),
    P("関数 canReserve は、既に受け付けた予約の開始時刻と終了時刻を格納した配列 st、en（i 番目の予約は st[i]～en[i]、st[i] ＜ en[i]）と、新しい予約の開始時刻 s・終了時刻 e（s ＜ e）を受け取り、新しい予約が既存のどの予約とも時間帯が重ならなければ true を、一つでも重なれば false を返す。"),
    TABLE(["予約", "開始時刻", "終了時刻"], [[f"{i + 1}", f"{a}（{a // 60}時{a % 60:02d}分）", f"{b}（{b // 60}時{b % 60:02d}分）"] for i, (a, b) in enumerate(res13)], "表　既存の予約の例"),
    P("表の予約がある場合、新しい予約 660～720（11時00分～12時00分）は受け付けられ（true）、690～870（11時30分～14時30分）は、予約2と予約3に重なるので受け付けられない（false）。"),
    P("〔プログラム〕"), CODE(code13)],
   ch13, "ア",
   "二つの時間帯 [s, e) と [st[i], en[i]) が重なるのは、新しい予約が既存の予約の終了前に始まり（s ＜ en[i]）、かつ既存の予約が新しい予約の終了前に始まる（st[i] ＜ e）ときである。"
   "イは、終了時刻と開始時刻が同じ場合も重なりとするので、660～720 が予約1・予約2と接するだけで false になる。"
   "ウは、新しい予約が既存の予約の中に完全に含まれる場合だけを重なりとするので、690～870 を true にしてしまう。"
   "エは、新しい予約の開始時刻又は終了時刻が既存の予約の中にある場合だけを調べるので、新しい予約が既存の予約を完全に含む場合を見落とす（例：表の予約で 590～670 は予約1を含むが true になる）。"
   "オは、二つの条件のどちらか一方で重なりとするので、ほとんどの場合に false になり、660～720 も受け付けない。"
   "カは、新しい予約が既存の予約を完全に含む場合だけを重なりとするので、一部だけ重なる場合や、既存の予約に含まれる場合を見落とす（例：表の予約で 630～700 は予約1と重なるが true になる）。"
   f"〔検算〕0～6 の時刻で、既存の予約0～2件の全ての組合せと新しい予約の全ての組（{r13['ア'][1]}件）を調べ、重なりを正しく判定するのはアだけ。",
   {"ア": "正解", "イ": "接する場合も重なりとする", "ウ": "含まれる場合だけ", "エ": "端点が中にある場合だけ", "オ": "or でつなぐ", "カ": "含む場合だけ"})

# ================================================================ M2B14 チェックディジットの不具合
code14 = """○整数型: checkDigit(整数型の配列: d)
  整数型: total ← 0
  整数型: i
  for (i を 1 から 12 まで 1 ずつ増やす)
    if (i mod 2 ＝ 0)
      total ← total ＋ d[i] × 3
    else
      total ← total ＋ d[i]
    endif
  endfor
  return 10 − (total mod 10)"""


def jan(ds):
    t = sum(x * (3 if (i + 1) % 2 == 0 else 1) for i, x in enumerate(ds))
    return (10 - t % 10) % 10


tests14 = ["456995111617", "490123456789", "451234567892"]
ns14 = PS.load(code14)
tab14 = []
for t in tests14:
    ds = [int(c) for c in t]
    tab14.append((t, jan(ds), ns14["checkDigit"](PS.A(ds))))
assert [(e, a) for _, e, a in tab14] == [(9, 9), (4, 4), (0, 10)], tab14
fix14 = {"ア": code14.replace("  return 10 − (total mod 10)", "  return (10 − (total mod 10)) mod 10"),
         "イ": code14.replace("if (i mod 2 ＝ 0)", "if (i mod 2 ＝ 1)"),
         "ウ": code14.replace("  return 10 − (total mod 10)", "  return total mod 10"),
         "エ": code14.replace("12 まで", "13 まで"),
         "オ": code14.replace("  return 10 − (total mod 10)", "  return 9 − (total mod 10)")}
rnd = random.Random(14)
samples14 = [[rnd.randint(0, 9) for _ in range(12)] for _ in range(2000)] + [[int(c) for c in t] for t in tests14]
res14 = {}
for lab, c in fix14.items():
    ns = PS.load(c)
    good = oor = 0
    for ds in samples14:
        try:
            good += ns["checkDigit"](PS.A(ds)) == jan(ds)
        except PS.OutOfRange:
            oor += 1
    res14[lab] = (good, len(samples14), oor)
only(res14, "ア")
LOG.append(("M2B14", res14))
qb("M2B14", AL, "不具合の特定", "チェックディジット(モジュラス10・重み)計算の誤り", "仕様読解", "標準", 285,
   [P("次の記述を読んで、設問に答えよ。ここで、配列の要素番号は1から始まる。"),
    P("13桁の商品コードの13桁目は、誤入力を検出するためのチェックディジットである。チェックディジットは、先頭から12桁の数字 d[1]～d[12] から、次の手順で求める。"),
    LIST("① 奇数番目の桁（d[1], d[3], …, d[11]）の数字はそのまま、偶数番目の桁（d[2], d[4], …, d[12]）の数字は3倍して、全てを合計する。",
         "② 合計を10で割った余りを求め、10からその余りを引く。ただし、余りが0のときは、チェックディジットを0とする。"),
    P("この手順を実装した関数 checkDigit をテストしたところ、表の結果になった。期待値は、手順に従って手計算で求めた値である。"),
    P("〔プログラム〕"), CODE(code14),
    TABLE(["テスト", "先頭12桁", "期待値", "実行結果"], [[i + 1, t, e, a] for i, (t, e, a) in enumerate(tab14)], "表　テストの結果"),
    P("設問　表のテスト3が期待値と異なった原因を取り除くための修正として、適切なものを解答群の中から選べ。")],
   ["最後の return 文を、return (10 − (total mod 10)) mod 10 にする。",
    "if 文の条件を、i mod 2 ＝ 1 にする。",
    "最後の return 文を、return total mod 10 にする。",
    "for 文の繰返しの終わりの値を、12 から 13 にする。",
    "最後の return 文を、return 9 − (total mod 10) にする。"], "ア",
   "テスト3は、先頭12桁から求めた合計が10で割り切れる（余りが0）ので、手順②のただし書きにより期待値は0だが、プログラムは 10－0＝10 を返している。"
   "余りが0のときだけ0にする処理がないことが原因なので、10からの差をもう一度10で割った余りにすればよい（余りが1～9のときは結果が変わらない）。"
   "イは、3倍する桁が逆になり、テスト1・2も期待値と異なるようになる。ウは、10から引く処理がなくなり、余りが0以外のときの結果が変わる。"
   "エは、存在しない13番目の要素 d[13] を参照するうえ、テスト3の原因（余りが0のときの処理）は直らない。オは、余りが0のとき9を返し、それ以外のときも1小さい値になる。"
   f"〔検算〕表の3件と、ランダムな12桁の数字列2,000件の計{res14['ア'][1]}件で、手順どおりのチェックディジットを返すのは、アの修正をしたプログラムだけ。",
   {"ア": "正解", "イ": "重みの位置が逆", "ウ": "10から引かない", "エ": "原因と無関係・範囲外", "オ": "1小さい値になる"})

# ================================================================ M2B15 最頻の文字
code15 = """○整数型: mostFrequent(文字列型: s)
  整数型の配列: cnt ← {5個の0}
  整数型: i, k, best
  for (i を 1 から s の文字数 まで 1 ずつ増やす)
    cnt[idx(s[i])] ← cnt[idx(s[i])] ＋ 1
  endfor
  best ← 1
  for (k を 2 から 5 まで 1 ずつ増やす)
    if (cnt[k] ＞ cnt[best])
      best ← k
    endif
  endfor
  return best"""
idx15 = lambda c: "abcde".index(c) + 1
s15 = "dbcadbecbd"
ns15 = PS.load(code15.replace("  return best", "  return {cnt, best}"), extra={"idx": idx15})
c15, b15 = ns15["mostFrequent"](PS.Str(s15)).py()
assert (c15, b15) == ([1, 3, 2, 3, 1], 2)
b15_ge = PS.load(code15.replace("cnt[k] ＞ cnt[best]", "cnt[k] ≧ cnt[best]"), extra={"idx": idx15})["mostFrequent"](PS.Str(s15))
b15_cmpidx = PS.load(code15.replace("cnt[k] ＞ cnt[best]", "cnt[k] ＞ best"), extra={"idx": idx15})["mostFrequent"](PS.Str(s15))
assert (b15_ge, b15_cmpidx) == (4, 4)
cs15 = "{" + ", ".join(map(str, c15)) + "}"
qb("M2B15", AL, "配列の添字(対応表)", "文字の出現回数を数えて最頻の文字を求める", "追跡", "易", 240,
   [P("次のプログラムにおいて、関数 mostFrequent を、引数 s に文字列 \"" + s15 + "\" を与えて呼び出したとき、2つ目の for 文の直前の配列 cnt の内容と、関数の戻り値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まり、文字列の i 文字目を s[i] で表す。"),
    P("文字列 s は、英小文字 a～e だけからなる。関数 idx(c) は、文字 c が a なら1、b なら2、c なら3、d なら4、e なら5 を返す。関数 mostFrequent は、s の中で最も多く現れる文字の番号（idx の値）を返す。最も多く現れる文字が複数ある場合は、そのうち番号が最も小さい文字の番号を返す。"),
    P("〔プログラム〕"), CODE(code15)],
   [[cs15, str(b15)], [cs15, str(b15_ge)], [cs15, "3"], ["{3, 1, 2, 1, 3}", "1"]], "ア",
   f"s の文字を数えると a 1回、b 3回、c 2回、d 3回、e 1回なので、cnt は {cs15}。2つ目の for 文では、cnt[k] が cnt[best] より大きいときだけ best を更新する。"
   "k＝2 で 3＞1 なので best＝2、k＝3 は 2＞3 が偽、k＝4 は 3＞3 が偽（同じ回数では更新しない）、k＝5 は 1＞3 が偽。戻り値は2（文字 b）。"
   f"イの戻り値{b15_ge}は、条件を ≧ と読み、同じ回数のときも更新した場合（文字 d）。ウの戻り値3は、最も多い出現回数（3回）を戻り値と取り違えた場合。"
   "エの cnt＝{3, 1, 2, 1, 3}・戻り値1は、文字の番号を逆（a が5、e が1）に数えた場合。",
   {"ア": "正解", "イ": "≧ と読む", "ウ": "回数を返すと考える", "エ": "番号を逆に数える"},
   header=["配列 cnt", "戻り値"])

# ================================================================ M2B16 配列で表した二分探索木への挿入
code16 = """大域: 整数型の配列: val ← {10個の0}
大域: 整数型の配列: left ← {10個の0}
大域: 整数型の配列: right ← {10個の0}
大域: 整数型: n ← 0
○insert(整数型: x)
  整数型: p
  n ← n ＋ 1
  val[n] ← x
  left[n] ← 0
  right[n] ← 0
  if (n ＝ 1)
    return
  endif
  p ← 1
  while (true)
    if (x ＜ val[p])
      if (left[p] ＝ 0)
        left[p] ← n
        return
      endif
      p ← left[p]
    else
      if (right[p] ＝ 0)
        right[p] ← n
        return
      endif
      p ← right[p]
    endif
  endwhile"""


def run16(code, order):
    ns = PS.load(code)
    for x in [50, 30, 70, 20, 40, 60]:
        ns["insert"](x)
    init = [(i, ns["val"][i], ns["left"][i], ns["right"][i]) for i in range(1, 7)]
    for x in order:
        ns["insert"](x)
    return init, (ns["left"][5], ns["right"][6], ns["left"][3])


init16, r16 = run16(code16, [35, 65])
assert init16 == [(1, 50, 2, 3), (2, 30, 4, 5), (3, 70, 6, 0), (4, 20, 0, 0), (5, 40, 0, 0), (6, 60, 0, 0)]
assert r16 == (7, 8, 6)


def run16_mod(code_mod, order):
    """表の状態(正しい規則で作る)から、読み違えた規則で insert を行う。"""
    ns = PS.load(code16)
    for x in [50, 30, 70, 20, 40, 60]:
        ns["insert"](x)
    ns2 = PS.load(code_mod)
    for k in ("val", "left", "right", "n"):
        ns2[k] = ns[k]
    for x in order:
        ns2["insert"](x)
    return (ns2["left"][5], ns2["right"][6], ns2["left"][3])


r16_val = run16_mod(code16.replace("left[p] ← n", "left[p] ← x").replace("right[p] ← n", "right[p] ← x"), [35, 65])
r16_rev = run16_mod(code16, [65, 35])
r16_cmp = run16_mod(code16.replace("if (x ＜ val[p])", "if (x ＞ val[p])"), [35, 65])
assert r16_val == (35, 65, 6) and r16_rev == (8, 7, 6) and r16_cmp == (0, 0, 6), (r16_val, r16_rev, r16_cmp)
fmt16 = lambda r: [str(x) for x in r]
qb("M2B16", AL, "木構造", "配列で表した二分探索木への挿入", "追跡", "難", 315,
   [P("次のプログラムにおいて、表の状態から insert(35) を実行し、続けて insert(65) を実行した後の left[5]、right[6]、left[3] の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("二分探索木の各節点を、大域の配列 val、left、right の同じ要素番号で表す。val[i] は節点 i の値、left[i] と right[i] は左の子と右の子の節点の要素番号（子がないときは0）である。節点は追加した順に要素番号1, 2, … を使い、要素番号1の節点を根とする。大域変数 n は、追加した節点の数である。"),
    P("手続 insert(x) は、値 x の節点を追加し、根から順に、x が節点の値より小さければ左の子へ、そうでなければ右の子へ進み、子がない位置につなぐ。"),
    TABLE(["要素番号", "val", "left", "right"], [list(r) for r in init16], "表　50, 30, 70, 20, 40, 60 の順に insert を実行した後の状態（n＝6）"),
    P("〔プログラム〕"), CODE(code16)],
   [fmt16(r16), fmt16(r16_val), fmt16(r16_rev), fmt16(r16_cmp)], "ア",
   "insert(35)：n＝7、val[7]＝35。根 50 より小さいので left[1]＝2 へ、30 以上なので right[2]＝5 へ、40 より小さく left[5]＝0 なので left[5]＝7 とする。"
   "insert(65)：n＝8、val[8]＝65。50 以上なので right[1]＝3 へ、70 より小さいので left[3]＝6 へ、60 以上で right[6]＝0 なので right[6]＝8 とする。"
   "left[3] は元の6のまま。よって left[5]＝7、right[6]＝8、left[3]＝6。"
   "イの 35・65・6 は、子の要素番号ではなく、追加する値 x を格納すると考えた場合。ウの 8・7・6 は、65 を先に、35 を後に挿入した場合（要素番号が入れ替わる）。"
   "エの 0・0・6 は、比較の向きを逆にして、x が節点の値より大きいときに左へ進めた場合（35 も 65 も節点70の右の子以下につながり、left[5]・right[6] は0のまま）。"
   "〔検算〕問題文のプログラムを実行し、50, 30, 70, 20, 40, 60 の順の挿入で表の状態になること、続く挿入の結果を確認した。誤答の値は、それぞれの読み違いを再現したプログラムの結果と一致。",
   {"ア": "正解", "イ": "値を格納すると考える", "ウ": "挿入順を逆にする", "エ": "比較の向きが逆"},
   header=["left[5]", "right[6]", "left[3]"])

# ================================================================ M2B17 初動対応(段階1サンプル)
acts17 = ["LANケーブルを抜き、無線LANを無効にした。", "画面に表示された警告をメモし、PCの電源は入れたままで情報システム部に電話で報告した。",
          "ウイルス対策ソフトで検知されたファイルを自分の判断で削除し、PCを再起動して業務を再開した。",
          "不審な添付ファイルが付いていた電子メールを、ほかの社員が誤って開かないように、受信箱から削除した。",
          "情報システム部から指示があるまで、PCに触れずにそのままにしておいた。"]
viol17 = {1: [], 2: [], 3: [2, 3, 4], 4: [3], 5: []}
ans17 = [k for k, v in viol17.items() if v]
assert ans17 == [3, 4]
qb("M2B17", SEC, "インシデント対応", "マルウェア感染が疑われるPCへの初動対応", "判断", "標準", 330,
   [P("E社は、従業員約300名の住宅設備メーカーである。E社では、マルウェアへの感染が疑われる場合に従業員が行う初動対応を、図1の手順で定めている。"),
    LIST("手順1　直ちにネットワークから切り離す。", "手順2　電源を切らず、再起動もしない。", "手順3　PC上のファイル・電子メールを削除・変更しない。",
         "手順4　情報システム部に報告し、指示があるまで駆除などの対処をしない。"),
    P("図1　マルウェア感染が疑われる場合の初動対応の手順"),
    P("営業部のFさんのPCで、取引先を装った電子メールの添付ファイルを開いた直後に、ウイルス対策ソフトが警告を表示した。表1は、Fさんがその後に行った行動である。"),
    TABLE(["項番", "Fさんの行動"], [[i + 1, a] for i, a in enumerate(acts17)], "表1　Fさんの行動"),
    P("設問　表1の項番のうち、図1の手順に反する行動だけを全て挙げた組合せを、解答群の中から選べ。")],
   ["3", "4", "3, 4", "2, 3, 4", "3, 4, 5", "1, 3, 4"], "ウ",
   "項番3は、自分の判断でファイルを削除し（手順3・手順4に反する）、PCを再起動している（手順2に反する）。感染の範囲や原因を調べるための証拠が失われ、メモリ上の情報も消える。"
   "項番4は、受信した電子メールを削除しており手順3に反する。どの電子メールから感染したかを調べる手掛かりが失われる。項番1は手順1、項番2は手順2と手順4、項番5は手順4のとおりで、手順に反しない。"
   "アは項番4を、イは項番3を見落としている。エは項番2を、オは項番5を、カは項番1を手順に反するとしているが、いずれも手順どおりの行動である。"
   "〔検算〕各行動が反する手順を表にし（項番3：手順2・3・4、項番4：手順3、ほかはなし）、反する手順がある項番が3と4だけであることを確認した。",
   {"ア": "項番4の見落とし", "イ": "項番3の見落とし", "ウ": "正解", "エ": "項番2を誤りとする", "オ": "項番5を誤りとする", "カ": "項番1を誤りとする"})

# ================================================================ M2B18 クラウドストレージの設定
rules18 = ["“公開”の設定は、用途が“一般公開用”のバケットだけに許可する。", "個人情報を含むバケットは、保存時の暗号化を“有効”にする。",
           "個人情報を含むバケットは、アクセスログの取得を“有効”にする。"]
bk18 = [("B1", "一般公開用（Webサイトの画像）", "なし", "公開", "無効", "無効"),
        ("B2", "社内共有（営業資料）", "なし", "公開", "有効", "無効"),
        ("B3", "顧客管理", "あり", "非公開", "有効", "無効"),
        ("B4", "顧客管理のバックアップ", "あり", "非公開", "無効", "有効"),
        ("B5", "社内共有（就業規則）", "なし", "非公開", "無効", "無効")]


def viol18(b, skip=()):
    v = []
    if 1 not in skip and b[3] == "公開" and not b[1].startswith("一般公開用"):
        v.append(1)
    if 2 not in skip and b[2] == "あり" and b[4] != "有効":
        v.append(2)
    if 3 not in skip and b[2] == "あり" and b[5] != "有効":
        v.append(3)
    return v


ok18 = [b[0] for b in bk18 if viol18(b)]
assert ok18 == ["B2", "B3", "B4"]
assert [b[0] for b in bk18 if viol18(b, skip=(3,))] == ["B2", "B4"]
assert [b[0] for b in bk18 if viol18(b, skip=(2, 3))] == ["B2"]
qb("M2B18", SEC, "クラウド設定", "ストレージの公開設定の誤りと責任分担", "判断", "標準", 330,
   [P("G社は、クラウド事業者が提供するオブジェクトストレージサービスを利用して、ファイルを保管している。ファイルは“バケット”と呼ぶ単位で管理し、バケットごとに、公開・非公開、保存時の暗号化、アクセスログの取得を、利用者が管理画面から設定する。サービスの利用規約では、クラウド事業者はストレージの設備・基盤の運用に責任を負い、利用者は自らが行うバケットの設定とデータの管理に責任を負うと定めている。"),
    P("G社は、バケットの設定について表1の規則を定めている。情報システム部のHさんが全てのバケットを点検した結果を表2に示す。"),
    TABLE(["規則", "内容"], [[f"規則{i + 1}", r] for i, r in enumerate(rules18)], "表1　バケットの設定の規則"),
    TABLE(["バケット", "用途", "個人情報", "公開設定", "保存時の暗号化", "アクセスログ"], bk18, "表2　点検の結果"),
    P("設問　次の記述中の a、b に入れる正しい答えの組合せを、解答群の中から選べ。"),
    P("表2のうち、表1の規則に違反しているバケットは a である。これらの設定の修正に責任をもつのは b である。"),
    P("aに関する解答群　①B2 だけ　②B2、B4　③B2、B3、B4"),
    P("bに関する解答群　①G社　②クラウド事業者")],
   [["①B2 だけ", "①G社"], ["①B2 だけ", "②クラウド事業者"], ["②B2、B4", "①G社"], ["②B2、B4", "②クラウド事業者"], ["③B2、B3、B4", "①G社"], ["③B2、B3、B4", "②クラウド事業者"]], "オ",
   "a：B2 は用途が社内共有なのに公開されており規則1に違反する。B3 は個人情報を含むのにアクセスログが無効で規則3に違反する。B4 は個人情報を含むのに保存時の暗号化が無効で規則2に違反する。"
   "B1 は一般公開用なので公開してよく、個人情報を含まないので暗号化・ログの規則は適用されない。B5 は非公開で個人情報を含まない。よって B2、B3、B4。"
   "b：利用規約で、バケットの設定は利用者の責任と定めているので、修正に責任をもつのはG社である。クラウド事業者は設備・基盤に責任を負うが、利用者が行った設定の誤りは利用者が直す（責任共有モデル）。"
   "ア・イは、個人情報に関する規則2・3を見落としている。ウ・エは、規則3（アクセスログ）を見落としている。イ・エ・カは、設定の責任をクラウド事業者にあるとしている。",
   {"ア": "規則2・3の見落とし", "イ": "規則2・3の見落とし・責任の取違え", "ウ": "規則3の見落とし", "エ": "規則3の見落とし・責任の取違え",
    "オ": "正解", "カ": "責任の取違え"}, header=["a", "b"])

# ================================================================ M2B19 送信ドメイン認証
mails19 = [(1, "sales@example.jp", "pass", "example.jp", "なし", "－"),
           (2, "info@example.jp", "pass", "mail.other.test", "pass", "example.jp"),
           (3, "info@example.jp", "pass", "bulk.mailer.test", "pass", "bulk.mailer.test"),
           (4, "support@example.jp", "fail", "example.jp", "pass", "example.jp"),
           (5, "support@example.jp", "fail", "example.jp", "fail", "example.jp")]


def dmarc(m, mode="ok"):
    dom = m[1].split("@")[1]
    spf_al = m[2] == "pass" and m[3] == dom
    dkim_al = m[4] == "pass" and m[5] == dom
    if mode == "ok":
        return spf_al or dkim_al
    if mode == "noalign":
        return m[2] == "pass" or m[4] == "pass"
    if mode == "spfonly":
        return spf_al
    if mode == "dkimonly":
        return dkim_al
    if mode == "both":
        return spf_al and dkim_al


rej = {mode: [m[0] for m in mails19 if not dmarc(m, mode)] for mode in ("ok", "noalign", "spfonly", "dkimonly", "both")}
assert rej == {"ok": [3, 5], "noalign": [5], "spfonly": [2, 3, 4, 5], "dkimonly": [1, 3, 5], "both": [1, 2, 3, 4, 5]}, rej
fm19 = lambda r: "、".join(map(str, r))
qb("M2B19", SEC, "メールの認証", "送信ドメイン認証(SPF・DKIM・DMARC)の判定結果の解釈", "判断", "標準", 330,
   [P("H社のメールサーバは、受信した電子メールについて、送信ドメイン認証の結果に基づき、次の規則で DMARC の判定を行う。H社の取引先の example.jp は、DMARC の方針として“判定が不合格のメールは受信を拒否する”と宣言している。"),
    LIST("SPF の結果が pass で、かつ SPF で検証したドメインが、メールの From ヘッダのアドレスのドメインと一致する場合、SPF について合格とする。",
         "DKIM の結果が pass で、かつ DKIM 署名のドメイン（d＝の値）が、From ヘッダのアドレスのドメインと一致する場合、DKIM について合格とする。",
         "SPF と DKIM の少なくとも一方が合格であれば DMARC の判定は合格、どちらも合格でなければ不合格とする。"),
    P("ある日に受信した、From ヘッダのドメインが example.jp のメール5通の認証結果を表に示す。"),
    TABLE(["メール", "From ヘッダのアドレス", "SPF の結果", "SPF で検証したドメイン", "DKIM の結果", "DKIM 署名のドメイン"], mails19, "表　認証の結果"),
    P("設問　表のメールのうち、受信を拒否されるものだけを全て挙げた組合せを、解答群の中から選べ。")],
   [fm19(rej["noalign"]), fm19(rej["ok"]), fm19(rej["dkimonly"]), fm19(rej["spfonly"]), fm19(rej["both"])], "イ",
   "メール1は SPF が pass で検証ドメインが example.jp と一致するので合格。メール2は SPF の検証ドメインが一致しないが、DKIM が pass で d＝example.jp が一致するので合格。"
   "メール3は SPF・DKIM とも pass だが、どちらのドメインも example.jp と一致しないので不合格。メール4は SPF が fail だが DKIM が合格なので合格。メール5は両方 fail で不合格。"
   "拒否されるのは 3 と 5。メール3のように、送信者が自分のドメインで SPF・DKIM を通しても、From のドメインと一致しなければ合格にならないのが DMARC の特徴である。"
   "アは、ドメインの一致を確認せず、SPF か DKIM が pass なら合格とした場合（5 だけ）。ウは、DKIM だけで判定した場合（1、3、5）。エは、SPF だけで判定した場合（2、3、4、5）。"
   "オは、SPF と DKIM の両方の合格を必要とした場合（全て）。",
   {"ア": "ドメインの一致を確認しない", "イ": "正解", "ウ": "DKIM だけで判定", "エ": "SPF だけで判定", "オ": "両方の合格を必要とする"})

# ================================================================ M2B20 脆弱性対応の優先順位
vul20 = [("V1", "Webサーバ", "インターネットから到達できる", 7.5, "あり"),
         ("V2", "社内ファイルサーバ", "社内ネットワークからだけ", 9.8, "なし"),
         ("V3", "VPN装置", "インターネットから到達できる", 9.1, "なし"),
         ("V4", "社内の業務用PC", "社内ネットワークからだけ", 8.1, "あり"),
         ("V5", "会議室予約システム", "社内ネットワークからだけ", 5.3, "なし"),
         ("V6", "メールサーバ", "インターネットから到達できる", 6.5, "あり")]


def pri20(v, mode="ok"):
    net = v[2].startswith("インターネット")
    ex = v[4] == "あり"
    cv = v[3]
    if mode == "ok":
        if ex and net:
            return "A"
        if cv >= 9.0 or ex:
            return "B"
    elif mode == "nonet":           # 到達できるかを考えない
        if ex:
            return "A"
        if cv >= 9.0:
            return "B"
    elif mode == "cvss":            # CVSS 9.0以上を最優先にする
        if cv >= 9.0:
            return "A"
        if ex:
            return "B"
    elif mode == "noex_b":          # 優先度Bの“又は悪用が確認されている”を読み落とす
        if ex and net:
            return "A"
        if cv >= 9.0:
            return "B"
    elif mode == "net_cvss":        # インターネットから到達でき CVSS 9.0以上を A とする
        if net and cv >= 9.0:
            return "A"
        if cv >= 9.0 or ex:
            return "B"
    return "C" if cv >= 7.0 else "D"


def grp20(mode):
    a = [v[0] for v in vul20 if pri20(v, mode) == "A"]
    b = [v[0] for v in vul20 if pri20(v, mode) == "B"]
    return ["、".join(a), "、".join(b)]


g20 = {m: grp20(m) for m in ("ok", "nonet", "cvss", "noex_b", "net_cvss")}
assert g20["ok"] == ["V1、V6", "V2、V3、V4"], g20
assert len({tuple(v) for v in g20.values()}) == 5, g20
qb("M2B20", SEC, "脆弱性管理", "脆弱性情報(CVSS・悪用状況)に基づくパッチ適用の優先順位", "判断", "標準", 330,
   [P("J社では、機器の脆弱性が公表されたときに、修正プログラム（パッチ）を適用する期限を、表1の規則で決めている。規則は上から順に調べ、最初に当てはまった優先度とする。"),
    TABLE(["優先度", "条件", "適用の期限"],
          [["A", "悪用が確認されている、かつ、インターネットから到達できる機器の脆弱性", "24時間以内"],
           ["B", "CVSS 基本値が9.0以上、又は、悪用が確認されている脆弱性", "7日以内"],
           ["C", "CVSS 基本値が7.0以上の脆弱性", "30日以内"],
           ["D", "上記のいずれにも当てはまらない脆弱性", "次回の定期保守"]], "表1　パッチを適用する期限の規則"),
    P("ある週に公表された脆弱性のうち、J社の機器に該当するものを表2に示す。"),
    TABLE(["脆弱性", "機器", "到達できる範囲", "CVSS 基本値", "悪用の確認"], vul20, "表2　J社の機器に該当する脆弱性"),
    P("設問　表2の脆弱性のうち、優先度Aになるものと、優先度Bになるものの組合せとして正しいものを、解答群の中から選べ。")],
   [g20["ok"], g20["nonet"], g20["net_cvss"], g20["noex_b"], g20["cvss"]], "ア",
   "優先度A：悪用が確認され、かつインターネットから到達できるのは V1（Webサーバ）と V6（メールサーバ）。V6 は CVSS が6.5と低いが、悪用が確認され外部から攻撃できるので最優先になる。"
   "優先度B：A に当てはまらないもののうち、CVSS 9.0以上の V2（9.8）・V3（9.1）と、悪用が確認されている V4 が当てはまる。V5 は C にも当てはまらず D。"
   f"イ（A：{g20['nonet'][0]}、B：{g20['nonet'][1]}）は、到達できる範囲を考えず、悪用の確認だけで A とした場合。"
   f"ウ（A：{g20['net_cvss'][0]}、B：{g20['net_cvss'][1]}）は、A の条件を“インターネットから到達でき、CVSS 9.0以上”と読み違えた場合。"
   f"エ（A：{g20['noex_b'][0]}、B：{g20['noex_b'][1]}）は、B の条件の“又は、悪用が確認されている”を読み落とした場合で、V4 が C になる。"
   f"オ（A：{g20['cvss'][0]}、B：{g20['cvss'][1]}）は、CVSS 9.0以上を A、悪用の確認を B と、条件を入れ替えた場合。",
   {"ア": "正解", "イ": "到達範囲を考えない", "ウ": "A の条件の読み違え", "エ": "B の“又は”を読み落とす", "オ": "条件の入替え"},
   header=["優先度A", "優先度B"])


# ---------------------------------------------------------------- 正解記号の分布の調整
# 段階1で承認されたサンプル(M2B02・M2B04・M2B09・M2B17)と、選択肢に自然な順序がある問題(M2B11・M2B18)は動かさない。
from qlib import swap_any
BAL = {"M2B01": "ウ", "M2B03": "イ", "M2B05": "エ", "M2B06": "ウ", "M2B07": "オ", "M2B08": "ウ", "M2B10": "イ",
       "M2B12": "エ", "M2B13": "イ", "M2B14": "ウ", "M2B15": "エ", "M2B16": "ウ", "M2B20": "エ"}
SWAPLOG = []
for q in QS:
    if q["id"] in BAL:
        old = q["correct"]
        n = swap_any(q, old, BAL[q["id"]])
        SWAPLOG.append(f"{q['id']} {old}→{BAL[q['id']]}（解説の記号の置換 {n}か所）")

if __name__ == "__main__":
    from qlib import dump
    import collections
    assert len(QS) == 20, len(QS)
    dump("out/mockB2.json", QS)
    with open("out/build_B.log", "w", encoding="utf-8") as f:
        for k, v in LOG:
            f.write(f"{k} 選択肢ごとの(正しく動いた件数, 全件数, 範囲外参照の件数): {v}\n")
        f.write("正解記号の位置の調整: " + "／".join(SWAPLOG) + "\n")
    print("B", len(QS), collections.Counter(q["correct"] for q in QS))
