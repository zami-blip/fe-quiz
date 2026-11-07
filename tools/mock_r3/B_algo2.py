"""第3回 科目B 問9～問16 の作成と作成時の検算。"""
import math

import pseudo as PS
from qlib import P, CODE, TABLE
from bcommon import AL, LOG, qb, call, run_blank, only, safe, tally, rnd

INTRO2 = "次のプログラム中の a と b に入れる正しい答えの組合せを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"

code09 = """○整数型: halve(整数型の配列: v, 整数型: f)
  整数型: c ← 0
  整数型: i
  for (i を 1 から v の要素数 まで 1 ずつ増やす)
    if (v[i] ＞ 10)
      v[i] ← v[i] ÷ f
      c ← c ＋ 1
    endif
  endfor
  f ← f ＋ 1
  return c

○整数型の配列: copyOf(整数型の配列: v)
  整数型の配列: w ← {}
  整数型: i
  for (i を 1 から v の要素数 まで 1 ずつ増やす)
    w の末尾に v[i] の値を追加する
  endfor
  return w

○main()
  整数型の配列: p ← {12, 7, 30, 15}
  整数型の配列: q ← copyOf(p)
  整数型の配列: r ← p
  整数型: f ← 2
  整数型: c1 ← halve(p, f)
  整数型: c2 ← halve(r, f)
  p と q と c1 ＋ c2 と f を出力する"""

code10 = """○整数型: fee(整数型: t)
  整数型: total ← 0
  整数型: f
  while (t ＞ 1440)
    total ← total ＋ 900
    t ← t − 1440
  endwhile
  if (   a   )
    f ← 0
  else
    f ← 100 × (   b   )
    if (f ＞ 900)
      f ← 900
    endif
  endif
  return total ＋ f"""

code11 = """○整数型: expandedLength(文字列型: s)
  整数型: total ← 0
  整数型: num ← 0
  整数型: i
  for (i を 1 から s の文字数 まで 1 ずつ増やす)
    if (isDigit(s[i]))
      num ←   a
    else
      total ←   b
      num ← 0
    endif
  endfor
  return total ＋ num"""

code12 = """○整数型: around(整数型の二次元配列: g, 整数型: r, 整数型: c)
  整数型: n ← g の行数
  整数型: m ← g の列数
  整数型: cnt ← 0
  整数型: dr, dc
  for (dr を −1 から 1 まで 1 ずつ増やす)
    for (dc を −1 から 1 まで 1 ずつ増やす)
      if ((dr ≠ 0) or (dc ≠ 0))
        if ((1 ≦ r ＋ dr) and (r ＋ dr ≦ n) and (1 ≦ c ＋ dc) and (c ＋ dc ≦ m))
          cnt ← cnt ＋ g[r ＋ dr, c ＋ dc]
        endif
      endif
    endfor
  endfor
  return cnt"""

code13 = """○整数型: reverse(整数型の配列: next, 整数型: head)
  整数型: prev ← 0
  整数型: cur ← head
  整数型: nxt
  while (cur ≠ 0)
       a
       b
    prev ← cur
       c
  endwhile
  return prev"""

code14 = """○整数型: compact(整数型の配列: a)
  整数型: n ← a の要素数
  整数型: k ← 1
  整数型: i
  for (i を 2 から n まで 1 ずつ増やす)
    if (a[i] ≠ a[k])
      k ← k ＋ 1
      a[k] ← a[i]
    endif
  endfor
  return k"""

code15 = """大域: 整数型の配列: qty
大域: 整数型の配列: cost
大域: 整数型: head
大域: 整数型: stock

○整数型: ship(整数型: x)
  整数型: total ← 0
  整数型: take
  if (x ＞ stock)
    return −1
  endif
  stock ← stock − x
  while (x ＞ 0)
    if (qty[head] ≦ x)
      take ← qty[head]
    else
      take ←   a
    endif
    total ← total ＋ take × cost[head]
    qty[head] ← qty[head] − take
    x ← x − take
    if (   b   )
      head ← head ＋ 1
    endif
  endwhile
  return total"""

code16 = """○downHeap(整数型の配列: h, 整数型: n)
  整数型: i ← 1
  整数型: c, tmp
  while (2 × i ≦ n)
    c ← 2 × i
    if ((c ＋ 1 ≦ n) and (   a   ))
      c ← c ＋ 1
    endif
    if (h[i] ≦ h[c])
      return
    endif
    tmp ← h[i]
    h[i] ← h[c]
    h[c] ← tmp
    i ←   b
  endwhile"""

# ======================================================================== M3B09 配列と整数の受け渡し
ns09 = PS.load(code09)
call(ns09, "main")
o09 = [x.py() if hasattr(x, "py") else x for x in ns09["_outs"][0]]
assert o09 == [[6, 7, 7, 7], [12, 7, 30, 15], 4, 2], o09
c09_rcopy = code09.replace("整数型の配列: r ← p", "整数型の配列: r ← copyOf(p)")
ns = PS.load(c09_rcopy)
call(ns, "main")
assert [x.py() if hasattr(x, "py") else x for x in ns["_outs"][0]] == [[6, 7, 15, 7], [12, 7, 30, 15], 6, 2]
# 整数型の引数も呼出し元の変数そのものを変えると考えた場合(f が3になってから2回目を呼ぶ)
p = [12, 7, 30, 15]
c1 = 0
for i in range(4):
    if p[i] > 10:
        p[i] //= 2
        c1 += 1
c2 = 0
for i in range(4):
    if p[i] > 10:
        p[i] //= 3
        c2 += 1
assert (p, c1 + c2) == ([6, 7, 5, 7], 4)
# 配列も複製して渡すと考えた場合(p は変わらない。c1＝c2＝3)
assert sum(1 for v in [12, 7, 30, 15] if v > 10) * 2 == 6
LOG.append(("M3B09", "trace", o09))
qb("M3B09", AL, "関数間の値受渡し", "配列の参照と整数の値渡しを含む関数呼出しの結果", "追跡", "標準", 285,
   [P("次のプログラムで、手続 main を実行したとき、最後に出力される p の内容、q の内容、c1 ＋ c2 の値の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まり、÷ は商の整数部分を求める演算である。"),
    P("このプログラムでは、次の規則で値を受け渡す。"),
    P("・配列型の引数には、呼出し元の配列そのものを渡す。呼び出された関数の中で要素を変更すると、呼出し元の配列も変わる。"),
    P("・整数型の引数には、値の写しを渡す。呼び出された関数の中で引数に代入しても、呼出し元の変数は変わらない。"),
    P("・配列型の変数への代入 r ← p では、配列は複製されず、r と p は同じ配列を指す。関数 copyOf は、受け取った配列と同じ要素をもつ新しい配列を作って返す。"),
    P("〔プログラム〕"), CODE(code09)],
   [["{6, 7, 7, 7}", "{12, 7, 30, 15}", "4"], ["{6, 7, 15, 7}", "{12, 7, 30, 15}", "6"], ["{6, 7, 5, 7}", "{12, 7, 30, 15}", "4"],
    ["{6, 7, 7, 7}", "{6, 7, 7, 7}", "4"], ["{12, 7, 30, 15}", "{12, 7, 30, 15}", "6"]], "ア",
   "q は copyOf で作った別の配列なので、p を変えても {12, 7, 30, 15} のまま。r ← p で r と p は同じ配列を指す。"
   "1回目の halve(p, f)：10を超える 12, 30, 15 を2で割って p＝{6, 7, 15, 7}、c1＝3。halve の中の f ← f＋1 は写しを変えるだけで、main の f は2のまま。"
   "2回目の halve(r, f)：r は p と同じ配列 {6, 7, 15, 7} なので、10を超える15だけを 15÷2＝7 にして、p も {6, 7, 7, 7} になり、c2＝1。c1＋c2＝4。"
   "イは、r ← p で配列が複製されると考えた場合で、2回目は元の {12, 7, 30, 15} の写しを処理して c2＝3（合計6）、p は1回目の後の {6, 7, 15, 7} のまま。"
   "ウは、整数型の f も呼出し元の変数そのものが変わると考えた場合で、2回目は 15÷3＝5 となる（c1＋c2 は4）。エは、q ← copyOf(p) でも同じ配列を指すと考えた場合。"
   "オは、配列型の引数も写しが渡されると考えた場合で、p は変わらず、c1、c2 とも3になる。"
   "〔検算〕問題文のコードを、配列は同じものを指し整数は写しを渡す規則で実行して出力を確認。イは r ← copyOf(p) に変えたコードの実行結果と一致し、ウ・オの値も、それぞれの規則で計算し直して確認。",
   {"ア": "正解", "イ": "r ← p で複製されると考える", "ウ": "整数も呼出し元が変わると考える", "エ": "q も同じ配列と考える", "オ": "配列も写しが渡されると考える"},
   header=["p", "q", "c1 ＋ c2"],
   explain=[TABLE(["時点", "p（＝r）", "q", "main の f", "c"],
                  [["copyOf と r ← p の後", "{12, 7, 30, 15}", "{12, 7, 30, 15}", "2", "－"],
                   ["halve(p, f) の後", "{6, 7, 15, 7}", "{12, 7, 30, 15}", "2", "c1＝3"],
                   ["halve(r, f) の後", "{6, 7, 7, 7}", "{12, 7, 30, 15}", "2", "c2＝1"]], caption="変数の変化")])

# ======================================================================== M3B10 駐車料金(条件分岐と繰返しの終了条件)
h10 = ["a", "b"]
A10 = ["t ≦ 30", "(total ＝ 0) and (t ≦ 30)", "(total ＝ 0) or (t ≦ 30)"]
B10 = ["(t ＋ 19) ÷ 20", "t ÷ 20 ＋ 1"]
ch10 = [[A10[0], B10[0]], [A10[2], B10[1]], [A10[1], B10[1]], [A10[2], B10[0]], [A10[1], B10[0]], [A10[0], B10[1]]]


def fee_spec(t):
    total = 0
    while t > 1440:
        total += 900
        t -= 1440
    if total == 0 and t <= 30:
        return 0
    return total + min(900, 100 * math.ceil(t / 20))


def t10(ns):
    res = []
    for t in range(0, 4400):
        res.append(safe(lambda: call(ns, "fee", t) == fee_spec(t)))
    return tally(res)


r10 = only(run_blank(code10, h10, ch10, t10), "オ")
ex10 = {}
for lab, cols in zip("アイウエオカ", ch10):
    ns = PS.load(PS.fill_blanks(code10, dict(zip(h10, cols))))
    ex10[lab] = [call(ns, "fee", t) for t in (30, 40, 1450, 1500)]
assert ex10["オ"] == [0, 200, 1000, 1200], ex10
assert ex10 == {"ア": [0, 200, 900, 1200], "イ": [0, 0, 900, 1300], "ウ": [0, 300, 1000, 1300], "エ": [0, 0, 900, 1200],
                "オ": [0, 200, 1000, 1200], "カ": [0, 300, 900, 1300]}, ex10
LOG.append(("M3B10", r10))
qb("M3B10", AL, "条件分岐・終了条件", "日をまたぐ駐車料金の計算(上限と無料時間)", "仕様読解", "標準", 300,
   [P(INTRO2.replace("ここで、配列の要素番号は1から始まる。", "ここで、÷ は商の整数部分を求める演算である。")),
    P("ある駐車場の料金は、入庫から出庫までの時間 t 分（t は0以上の整数）によって、次の規則で決まる。"),
    P("（1）t が1440分を超える場合は、先頭から1440分ずつを1日分とし、1日分ごとに900円とする。残りの時間（1440分以下）の料金を（2）で求めて加える。"),
    P("（2）残りの時間の料金は、20分ごとに100円とする。20分に満たない端数は20分として数える。ただし、残りの時間の料金は900円を上限とする。"),
    P("（3）t が30分以下（1日分の料金がない場合）は無料とする。1日分の料金がある場合、残りの時間が30分以下でも（2）のとおり料金がかかる。"),
    P("例えば、t が40のとき200円、t が1450のとき 900＋100＝1000円である。"),
    P("関数 fee は、t を受け取り、料金を返す。"),
    P("〔プログラム〕"), CODE(code10)],
   ch10, "オ",
   "while の繰返しの後、total には1日分の料金の合計が入り、t は残りの時間（1440以下）になる。"
   "a：無料になるのは“1日分の料金がなく、かつ t が30以下”のときなので (total ＝ 0) and (t ≦ 30)。t ≦ 30 だけでは、t＝1450 のように1日分の後の10分が無料になり900円になってしまう。"
   "or で結ぶと、1日分の料金がない場合は t に関係なく無料になる（t＝40 で0円）。"
   "b：20分に満たない端数を20分と数えるには、t に19を足してから20で割る (t ＋ 19) ÷ 20。t ÷ 20 ＋ 1 は、t が20の倍数のときに1つ多くなる（t＝40 で3×100＝300円）。"
   "各選択肢で t＝40、1450、1500 の料金は、ア：200, 900, 1200、イ：0, 900, 1300、ウ：300, 1000, 1300、エ：0, 900, 1200、オ：200, 1000, 1200、カ：300, 900, 1300。規則どおりはオ（t＝1500 は 900＋100×3＝1200）。"
   f"〔検算〕t＝0～4399 の{r10['オ'][1]}件で、規則から直接求めた料金と一致するのはオだけ。",
   {"ア": "1日分の後の30分以内も無料にする", "イ": "or で結び、端数の切上げも誤る", "ウ": "20の倍数で1つ多い", "エ": "or で結び、1日目が全て無料",
    "オ": "正解", "カ": "無料の条件と切上げの両方を誤る"}, header=h10)

# ======================================================================== M3B11 圧縮表現を展開した長さ(文字列)
h11 = ["a", "b"]
A11 = ["num × 10 ＋ digitValue(s[i])", "num ＋ digitValue(s[i])", "digitValue(s[i])"]
B11 = ["total ＋ num", "num"]
ch11 = [[A11[1], B11[0]], [A11[2], B11[1]], [A11[0], B11[1]], [A11[0], B11[0]], [A11[2], B11[0]], [A11[1], B11[1]]]
EX11 = {"isDigit": lambda c: c.isdigit(), "digitValue": lambda c: int(c)}


def t11(ns):
    R = rnd(111)
    res = []
    for _ in range(2000):
        parts = [(R.choice("abcxyz"), R.choice([R.randint(1, 9), R.randint(10, 99), R.randint(100, 120)])) for _ in range(R.randint(1, 5))]
        s = "".join(ch + str(n) for ch, n in parts)
        res.append(safe(lambda: call(ns, "expandedLength", PS.Str(s)) == sum(n for _, n in parts)))
    return tally(res)


r11 = only(run_blank(code11, h11, ch11, t11, extra=EX11), "エ")
ex11 = {}
for lab, cols in zip("アイウエオカ", ch11):
    ns = PS.load(PS.fill_blanks(code11, dict(zip(h11, cols))), extra=EX11)
    ex11[lab] = call(ns, "expandedLength", PS.Str("a12b3c10"))
assert ex11 == {"ア": 7, "イ": 3, "ウ": 13, "エ": 25, "オ": 5, "カ": 4}, ex11
LOG.append(("M3B11", r11))
qb("M3B11", AL, "文字列", "繰返し回数付きの圧縮表現を展開した長さを求める", "仕様読解", "標準", 270,
   [P(INTRO2.replace("ここで、配列の要素番号は1から始まる。", "ここで、文字列の文字の位置は1から始まり、s[i] は文字列 s の i 文字目を表す。")),
    P("文字列を圧縮して、“英小文字1文字と、その文字を繰り返す回数を表す1桁以上の10進数字”の並びで表す。例えば \"a12b3c10\" は、a を12個、b を3個、c を10個並べた文字列を表す。繰返しの回数は1以上で、先頭の文字は英小文字である。"),
    P("関数 expandedLength は、圧縮した文字列 s を受け取り、展開したときの文字数を返す。例の \"a12b3c10\" では 12＋3＋10＝25 を返す。"),
    P("関数 isDigit(c) は、文字 c が数字のとき true を返し、そうでなければ false を返す。関数 digitValue(c) は、数字の文字 c が表す整数（0～9）を返す。"),
    P("〔プログラム〕"), CODE(code11)],
   ch11, "エ",
   "a：回数は複数桁になり得るので、数字を読むたびにそれまでの値を10倍して桁を加える（\"12\" は 1 → 1×10＋2＝12）。num × 10 ＋ digitValue(s[i])。"
   "b：英小文字を読んだ時点で、直前の文字の回数 num が確定しているので、それを total に加える（total ＋ num）。先頭の英小文字では num は0なので何も加わらない。最後の文字の回数は繰返しの後で total ＋ num として加える。"
   "例の \"a12b3c10\" での戻り値は、ア7（各桁を足して 3＋3＋1）、イ3（最後の桁だけを使い、さらに total を上書きして最後の0に c の前の3を足す）、ウ13（total を上書きするので、最後の c の前の3と10だけ）、エ25、オ5（最後の桁だけを足して 2＋3＋0）、カ4（各桁を足し、total を上書きして 3＋1）。"
   f"〔検算〕回数が1桁・2桁・3桁の文字列2,000件で、展開した長さと一致するのはエだけ。例の各値も、それぞれのコードを実行して確認。",
   {"ア": "各桁を足すだけ", "イ": "最後の桁だけ使い、total も上書き", "ウ": "total を上書き", "エ": "正解", "オ": "最後の桁だけ使う", "カ": "各桁を足し、total も上書き"},
   header=h11)

# ======================================================================== M3B12 二次元配列で周囲8マスの値を数える
g12 = [[1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 0, 0, 1], [0, 1, 1, 1, 0]]
ns12 = PS.load(code12)
v12 = [call(ns12, "around", PS.A(g12), r, c) for r, c in ((1, 1), (2, 3), (4, 5))]
assert v12 == [1, 4, 2], v12
v12_self = [v12[i] + g12[r - 1][c - 1] for i, (r, c) in enumerate(((1, 1), (2, 3), (4, 5)))]
ns = PS.load(code12.replace("if ((dr ≠ 0) or (dc ≠ 0))", "if ((dr ≠ 0) and (dc ≠ 0))"))
v12_diag = [call(ns, "around", PS.A(g12), r, c) for r, c in ((1, 1), (2, 3), (4, 5))]
ns = PS.load(code12.replace("if ((dr ≠ 0) or (dc ≠ 0))", "if ((dr ＝ 0) or (dc ＝ 0))"))
v12_cross_self = [call(ns, "around", PS.A(g12), r, c) for r, c in ((1, 1), (2, 3), (4, 5))]
ns = PS.load(code12.replace("if ((dr ≠ 0) or (dc ≠ 0))", "if ((dr ＝ 0) ≠ (dc ＝ 0))"))
v12_cross = [call(ns, "around", PS.A(g12), r, c) for r, c in ((1, 1), (2, 3), (4, 5))]
assert (v12_self, v12_diag, v12_cross_self, v12_cross) == ([2, 5, 2], [1, 2, 0], [1, 3, 2], [0, 2, 2]), (v12_self, v12_diag, v12_cross_self, v12_cross)
R = rnd(112)
for _ in range(500):
    n, m = R.randint(1, 5), R.randint(1, 5)
    g = [[R.randint(0, 1) for _ in range(m)] for _ in range(n)]
    for r in range(1, n + 1):
        for c in range(1, m + 1):
            want = sum(g[rr - 1][cc - 1] for rr in range(r - 1, r + 2) for cc in range(c - 1, c + 2)
                       if (rr, cc) != (r, c) and 1 <= rr <= n and 1 <= cc <= m)
            assert call(ns12, "around", PS.A(g), r, c) == want
LOG.append(("M3B12", "trace", v12))
qb("M3B12", AL, "二次元配列", "二次元配列で周囲8マスの値の合計を求める(端の扱い)", "追跡", "標準", 270,
   [P("関数 around は、0か1が格納された二次元配列 g と、行番号 r、列番号 c を受け取り、g[r, c] の周囲8マス（上下左右と斜め）のうち、配列の範囲内にあるマスの値の合計を返す。g の行数は n、列数は m で、g[r, c] は r 行 c 列の要素を表す。"),
    P("〔プログラム〕"), CODE(code12),
    P("g が次の表の内容のとき、around(g, 1, 1)、around(g, 2, 3)、around(g, 4, 5) の戻り値の組合せとして正しいものを、解答群の中から選べ。ここで、行番号・列番号は1から始まる。"),
    TABLE(["", "1列", "2列", "3列", "4列", "5列"], [[f"{i + 1}行"] + [str(v) for v in row] for i, row in enumerate(g12)], caption="二次元配列 g の内容")],
   [["2", "5", "2"], ["1", "3", "2"], ["1", "4", "2"], ["0", "2", "2"], ["1", "2", "0"]], "ウ",
   "dr、dc がともに0の組（自分自身）だけを if ((dr ≠ 0) or (dc ≠ 0)) で除き、範囲外の行・列は2つ目の if で除く。"
   "around(g, 1, 1)：範囲内の周囲は (1, 2)＝0、(2, 1)＝0、(2, 2)＝1 の3マスで合計1。"
   "around(g, 2, 3)：周囲8マスは (1, 2)＝0、(1, 3)＝1、(1, 4)＝1、(2, 2)＝1、(2, 4)＝0、(3, 2)＝1、(3, 3)＝0、(3, 4)＝0 で合計4。"
   "around(g, 4, 5)：範囲内の周囲は (3, 4)＝0、(3, 5)＝1、(4, 4)＝1 の3マスで合計2。"
   "アは、自分自身のマスも加えた場合（(1, 1) と (2, 3) は値が1なので1ずつ増える）。イは、上下左右と自分自身だけを数えた場合。エは、上下左右の4マスだけを数えた場合。オは、(dr ≠ 0) and (dc ≠ 0) と読み、斜めの4マスだけを数えた場合。"
   "〔検算〕問題文のコードと、各読み違いを再現したコードを実行して確認。1～5行・1～5列のランダムな配列500個の全てのマスで、周囲8マスの合計を直接数えた値と一致する。",
   {"ア": "自分自身も加える", "イ": "上下左右と自分自身だけ", "ウ": "正解", "エ": "上下左右だけ", "オ": "斜めだけ"},
   header=["around(g, 1, 1)", "around(g, 2, 3)", "around(g, 4, 5)"])

# ======================================================================== M3B13 単方向リストを逆順につなぎ替える
h13 = ["a", "b", "c"]
ch13 = [["next[cur] ← prev", "nxt ← next[cur]", "cur ← nxt"],
        ["nxt ← next[cur]", "next[cur] ← prev", "cur ← next[cur]"],
        ["nxt ← next[cur]", "next[nxt] ← cur", "cur ← nxt"],
        ["nxt ← next[cur]", "next[cur] ← nxt", "cur ← nxt"],
        ["nxt ← next[cur]", "next[cur] ← prev", "cur ← nxt"],
        ["nxt ← next[cur]", "next[cur] ← prev", "cur ← prev"]]


def walk(nx, h, lim=50):
    out, c = [], h
    while c != 0 and len(out) < lim:
        out.append(c)
        c = nx[c - 1]
    return out


def t13(ns):
    R = rnd(113)
    res = []
    for _ in range(1500):
        size = R.randint(1, 9)
        k = R.randint(0, size)
        nodes = R.sample(range(1, size + 1), k)
        nx = [R.randint(0, size) for _ in range(size)]
        for i, v in enumerate(nodes):
            nx[v - 1] = nodes[i + 1] if i + 1 < len(nodes) else 0
        head = nodes[0] if nodes else 0

        def one():
            arr = PS.A(list(nx))
            h = call(ns, "reverse", arr, head)
            return walk(arr.py(), h) == nodes[::-1]
        res.append(safe(one))
    return tally(res)


r13 = only(run_blank(code13, h13, ch13, t13), "オ")
nx13 = [5, 0, 2, 0, 3]
ex13 = {}
for lab, cols in zip("アイウエオカ", ch13):
    ns = PS.load(PS.fill_blanks(code13, dict(zip(h13, cols))))
    arr = PS.A(list(nx13))
    try:
        h = call(ns, "reverse", arr, 1)
        ex13[lab] = (h, arr.py())
    except PS.TooLong:
        ex13[lab] = "停止しない"
assert ex13 == {"ア": (1, [0, 0, 2, 0, 3]), "イ": (1, [0, 0, 2, 0, 3]), "ウ": "停止しない", "エ": (2, [5, 0, 2, 0, 3]),
                "オ": (2, [0, 3, 5, 0, 1]), "カ": "停止しない"}, ex13
tr13 = []
nx = list(nx13)
prev, cur = 0, 1
while cur != 0:
    nxt = nx[cur - 1]
    nx[cur - 1] = prev
    prev = cur
    cur = nxt
    tr13.append([str(nxt), str(prev), str(cur), "{" + ", ".join(map(str, nx)) + "}"])
LOG.append(("M3B13", r13))
qb("M3B13", AL, "木・リスト", "配列で表した単方向リストを逆順につなぎ替える", "仕様読解", "難", 345,
   [P("次のプログラム中の a ～ c に入れる正しい答えの組合せを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。"),
    P("単方向リストを、整数型の配列 next で表す。リストの要素は要素番号で表し、next[p] は要素 p の次の要素の要素番号である。次の要素がない場合は0を格納する。先頭の要素の要素番号を head とし、リストが空のときは head は0である。リストに含まれない要素番号の next の値は使わない。"),
    P("関数 reverse は、next と head を受け取り、next の値を書き換えてリストの順序を逆にし、新しい先頭の要素番号を返す。変数 prev は既に逆向きにつなぎ替えた部分の先頭、cur はこれからつなぎ替える要素を表す。"),
    P("例えば、next が {5, 0, 2, 0, 3}、head が1のとき、リストは 1 → 5 → 3 → 2 の順である。reverse を呼び出すと、next は {0, 3, 5, 0, 1} に変わり、2 → 3 → 5 → 1 の順になって、2を返す。"),
    P("〔プログラム〕"), CODE(code13)],
   ch13, "オ",
   "要素 cur の next を前の要素 prev に向け直すと、元の次の要素がわからなくなる。そこで、先に nxt ← next[cur] で次の要素を覚え（a）、next[cur] ← prev で向きを変え（b）、prev ← cur の後、覚えておいた nxt に進む（c：cur ← nxt）。下の表は例の追跡。"
   "アは、先に next[cur] を prev に書き換えてから nxt を読むので、nxt が prev（最初は0）になり、1回で終わる（1を返し、リストは1だけになる）。"
   "イは、c で next[cur] を読むが、その値は b で prev に書き換えた後なので、cur が prev（最初は0）に戻って1回で終わる。"
   "ウは、b で次の要素 nxt の next を cur に向けるため、1 → 5 → 1 の循環ができて停止しない。エは、b で next[cur] に元の値を入れ直すだけで向きが変わらず、最後の要素2を返すがリストは 2 だけになる。"
   "カは、c で cur ← prev（直前に cur を代入した値）とするので cur が変わらず、停止しない。"
   f"〔検算〕空のリストを含む長さ0～9のリスト1,500件（リストに含まれない要素番号の next には任意の値）で、繰返しの回数に上限を付けて実行し、返した先頭からたどった順序が元の逆になるのはオだけ。",
   {"ア": "next を書き換えてから次を読む", "イ": "書き換えた next で進む", "ウ": "次の要素の向きを変えて循環", "エ": "向きを変えない", "オ": "正解", "カ": "cur が進まない"},
   header=h13,
   explain=[TABLE(["繰返し", "nxt", "prev", "cur", "next の内容"], [[str(i + 1)] + r for i, r in enumerate(tr13)], caption="追跡表（例の next＝{5, 0, 2, 0, 3}、head＝1。各行は繰返しの終わり）")])

# ======================================================================== M3B14 不具合の特定(重複の除去)
FIX_OK = "  if (n ＝ 0)\n    return 0\n  endif\n"
fixes14 = {"k の初期値を0にする": lambda c: c.replace("  整数型: k ← 1", "  整数型: k ← 0"),
           "for 文の前に、n が0なら0を返す処理を追加する": lambda c: c.replace("  整数型: i\n", "  整数型: i\n" + FIX_OK, 1)}
inputs14 = {"{}（要素数0）": [], "{7}（要素数1）": [7], "{2, 2, 2}": [2, 2, 2]}


def spec14(a):
    u = sorted(set(a))
    return len(u), u


def wrong_on(code, a):
    arr = PS.A(list(a))
    try:
        k = call(PS.load(code), "compact", arr)
    except PS.OutOfRange:
        return True
    n, u = spec14(a)
    return not (k == n and arr.py()[:k] == u)


bad_inputs = [lab for lab, a in inputs14.items() if wrong_on(code14, a)]
assert bad_inputs == ["{}（要素数0）"], bad_inputs
R = rnd(114)
tests14 = [[]] + [sorted(R.randint(0, 5) for _ in range(R.randint(1, 8))) for _ in range(2000)]
fix_ok = [lab for lab, f in fixes14.items() if not any(wrong_on(f(code14), a) for a in tests14)]
assert fix_ok == ["for 文の前に、n が0なら0を返す処理を追加する"], fix_ok
# 元のプログラムが誤るのは要素数0のときだけ
assert [a for a in tests14 if wrong_on(code14, a)] == [[]]
ch14 = []
for inp in inputs14:
    for fx in fixes14:
        ch14.append([inp, fx])
order14 = [3, 1, 0, 4, 5, 2]
ch14 = [ch14[i] for i in order14]
assert ch14[1] == ["{}（要素数0）", "for 文の前に、n が0なら0を返す処理を追加する"], ch14
LOG.append(("M3B14", {"誤る入力": bad_inputs, "正しい修正": fix_ok, "件数": len(tests14)}))
qb("M3B14", AL, "不具合の特定", "整列済み配列から重複を除く処理の境界値の誤り", "判断", "易", 225,
   [P("関数 compact は、昇順に整列済みの整数型の配列 a（要素数 n ≧ 0）を受け取り、同じ値が続く部分を1つにまとめて a の先頭から詰め、まとめた後の要素数を返す。例えば、a が {1, 1, 3, 4, 4, 4} のとき、a の先頭3個を {1, 3, 4} にして3を返す（4番目以降の要素の値は問わない）。"),
    P("〔プログラム〕"), CODE(code14),
    P("このプログラムには、ある入力に対して誤った値を返す不具合がある。誤った値を返す入力と、不具合の修正方法の組合せとして正しいものを、解答群の中から選べ。ここで、配列の要素番号は1から始まる。for 文で開始値が終了値より大きい場合、繰返しの処理は1回も実行しない。")],
   ch14, "イ",
   "n＝0 のとき、for 文は1回も実行されず、k の初期値1がそのまま返る。要素がないので、正しくは0を返さなければならない。{7} は1、{2, 2, 2} は1を返し、どちらも正しい。"
   "修正：for 文の前で n＝0 なら0を返せば、n ≧ 1 の場合はこれまでどおりの処理になる。k の初期値を0にすると、n ≧ 2 のとき最初の比較で存在しない a[0] を参照し、n＝1 のときは0を返してしまう。"
   "ア・カ・エ・オは、誤った値を返す入力を {7} 又は {2, 2, 2} とした組合せで、これらの入力では元のプログラムは正しい値を返す。ウは、入力は正しいが、修正方法が k の初期値を0にするもので、別の誤りを生む。"
   "〔検算〕要素数0と、要素数1～8・同じ値を含む整列済みの配列2,000件で実行し、元のプログラムが誤るのは要素数0のときだけ。2つの修正をそれぞれ適用して同じ2,001件で実行し、全て正しくなるのは“n が0なら0を返す処理を追加する”方だけ（k を0にした方は範囲外の参照が起きる）。",
   {"ア": "誤る入力を {7} とする", "イ": "正解", "ウ": "修正で a[0] を参照する", "エ": "誤る入力を {2, 2, 2} とし、修正も誤る",
    "オ": "誤る入力を {2, 2, 2} とする", "カ": "誤る入力を {7} とし、修正も誤る"},
   header=["誤った値を返す入力", "修正方法"])

# ======================================================================== M3B15 先入先出法による在庫の引当て(初見の仕様)
h15 = ["a", "b"]
A15 = ["x", "qty[head] − x", "qty[head]"]
B15 = ["qty[head] ＝ 0", "x ＝ 0", "take ＝ x"]
ch15 = [[A15[2], B15[1]], [A15[1], B15[0]], [A15[0], B15[2]], [A15[2], B15[0]], [A15[0], B15[0]],
        [A15[1], B15[2]], [A15[0], B15[1]], [A15[2], B15[2]], [A15[1], B15[1]]]


def fifo_spec(lots, ships):
    lots = [list(l) for l in lots]
    stock = sum(q for q, _ in lots)
    out = []
    for x in ships:
        if x > stock:
            out.append(-1)
            continue
        stock -= x
        tot = 0
        for l in lots:
            t = min(l[0], x)
            tot += t * l[1]
            l[0] -= t
            x -= t
        out.append(tot)
    return out


def t15(ns):
    R = rnd(115)
    res = []
    for _ in range(800):
        lots = [(R.randint(1, 9), R.randint(90, 130)) for _ in range(R.randint(1, 5))]
        ships = [R.randint(1, 12) for _ in range(R.randint(1, 5))]

        def one():
            ns["qty"] = PS.A([q for q, _ in lots])
            ns["cost"] = PS.A([c for _, c in lots])
            ns["head"] = 1
            ns["stock"] = sum(q for q, _ in lots)
            return [call(ns, "ship", x) for x in ships] == fifo_spec(lots, ships)
        res.append(safe(one))
    return tally(res)


r15 = only(run_blank(code15, h15, ch15, t15), "オ")
ns = PS.load(PS.fill_blanks(code15, dict(zip(h15, ch15[4]))))
ns["qty"], ns["cost"], ns["head"], ns["stock"] = PS.A([10, 5, 8]), PS.A([100, 120, 110]), 1, 23
v15 = [call(ns, "ship", x) for x in (12, 4, 9)]
assert v15 == [1240, 470, -1] and ns["head"] == 3 and ns["qty"].py() == [0, 0, 7] and ns["stock"] == 7, (v15, ns["head"])
tr15 = [["1", "10", "10×100＝1000", "{0, 5, 8}", "2", "2"],
        ["2", "2", "2×120＝240", "{0, 3, 8}", "0", "2"]]
LOG.append(("M3B15", r15))
qb("M3B15", AL, "初見の仕様", "先入先出法で在庫を引き当てて原価を求める", "仕様読解", "難", 375,
   [P(INTRO2),
    P("ある倉庫では、商品を入荷するたびに、入荷した数量と1個当たりの原価を1つのロットとして記録する。出荷するときは、先に入荷したロットから順に数量を引き当てる（先入先出法）。1つのロットで足りなければ、次に古いロットから残りを引き当てる。"),
    P("大域変数の配列 qty と cost には、入荷の古い順に各ロットの残りの数量と1個当たりの原価が格納されている。head は、残りの数量が1以上あるロットのうち最も古いものの要素番号であり、stock は全ロットの残りの数量の合計である。"),
    P("関数 ship は、出荷する数量 x（x ≧ 1）を受け取り、引き当てた原価の合計を返す。stock が x より少ない場合は、引き当てをせずに −1 を返す。引き当てたロットの残りの数量を減らし、残りが0になったロットは使い終わったものとして head を次のロットに進める。"),
    P("例えば、qty が {10, 5, 8}、cost が {100, 120, 110}、head が1、stock が23 のとき、ship(12) は 10×100＋2×120＝1240 を返し、qty は {0, 3, 8}、head は2になる。続けて ship(4) は 3×120＋1×110＝470 を返し、head は3になる。"),
    P("〔プログラム〕"), CODE(code15)],
   ch15, "オ",
   "a：if の条件が成り立たない（ロットの残り qty[head] が x より多い）ときは、x 個だけを引き当てるので take ← x。"
   "b：引き当てた後、ロットの残りが0になったときだけ次のロットに進むので、qty[head] ＝ 0。例の ship(12) では、1回目にロット1の10個を全て引き当てて残り0になり head を2に進め、2回目にロット2から残りの2個を引き当てる（下の表）。"
   "b を x ＝ 0（ア・キ・ケ）とすると、ロットを使い切ってもまだ x が残る場合に head が進まず、残り0のロットから0個ずつ引き当て続けて停止しない（例の ship(12) の2回目）。"
   "b を take ＝ x（ウ・カ・ク）とすると、x ← x − take の後の比較なので、ロットを使い切って x が残る場合も同じく進まず、停止しない。"
   "a を qty[head] − x（イ）とすると、ロットの残りと x の差を引き当ててしまう。例の ship(12) では、2回目にロット2の5個から 5−2＝3個を引き当てて x が −1 になり、1000＋360＝1360 を返す。"
   "a を qty[head]（エ）とすると、x より多いロットでも残りを全て引き当て、x が負になって終わる（例の ship(12) で 10×100＋5×120＝1600）。"
   f"〔検算〕ロット数1～5、出荷の回数1～5の800通り（在庫不足を含む）で、仕様から直接求めた原価の列と一致するのはオだけ。停止しない場合は繰返しの回数の上限で検出した。例の値も実行して確認（ship(12)＝1240、続けて ship(4)＝470）。",
   {"ア": "残りを全部引き当て、進む条件も誤る", "イ": "差を引き当てる", "ウ": "進む条件が take＝x", "エ": "x より多くても全部引き当てる",
    "オ": "正解", "カ": "差を引き当て、進む条件も誤る", "キ": "進む条件が x＝0", "ク": "全部引き当て、進む条件も誤る", "ケ": "差を引き当て、進む条件も誤る"},
   header=h15,
   explain=[TABLE(["繰返し", "take", "原価の加算", "繰返しの後の qty", "x", "head"], tr15, caption="例の ship(12) の追跡（qty＝{10, 5, 8}、head＝1 から）")])

# ======================================================================== M3B16 配列で表したヒープの下方向への調整
h16 = ["a", "b"]
ch16 = [["h[c ＋ 1] ＞ h[c]", "c"], ["h[c ＋ 1] ＜ h[c]", "2 × i"], ["h[c ＋ 1] ＜ h[c]", "i ＋ 1"],
        ["h[c ＋ 1] ＞ h[c]", "2 × i"], ["h[c ＋ 1] ＜ h[c]", "c"], ["h[c ＋ 1] ＞ h[c]", "i ＋ 1"]]


def is_heap(h):
    return all(h[(i - 1) // 2] <= h[i] for i in range(1, len(h)))


def t16(ns):
    import heapq
    R = rnd(116)
    res = []
    for _ in range(2500):
        n = R.randint(1, 15)
        base = [R.randint(1, 30) for _ in range(n)]
        heapq.heapify(base)
        base[0] = R.randint(1, 40)

        def one():
            arr = PS.A(list(base))
            call(ns, "downHeap", arr, n)
            return is_heap(arr.py()) and sorted(arr.py()) == sorted(base)
        res.append(safe(one))
    return tally(res)


r16 = only(run_blank(code16, h16, ch16, t16), "オ")
ex16 = {}
for lab, cols in zip("アイウエオカ", ch16):
    ns = PS.load(PS.fill_blanks(code16, dict(zip(h16, cols))))
    arr = PS.A([9, 3, 4, 5, 7, 6, 8])
    call(ns, "downHeap", arr, 7)
    ex16[lab] = arr.py()
assert ex16["オ"] == [3, 5, 4, 9, 7, 6, 8], ex16
LOG.append(("M3B16", r16, ex16))
qb("M3B16", AL, "木構造", "配列で表した最小ヒープの根を正しい位置まで下ろす", "仕様読解", "標準", 285,
   [P(INTRO2),
    P("配列 h の要素番号1～n に、二分木を次のように格納する。要素番号 i の節の子は、要素番号 2×i（左の子）と 2×i＋1（右の子）の節である（n を超える要素番号の子はない）。"),
    P("全ての節で“親の値 ≦ 子の値”が成り立つ木を最小ヒープという。手続 downHeap は、根 h[1] 以外は最小ヒープの条件を満たしている h を受け取り、根の値を子と入れ替えながら下ろして、全体を最小ヒープにする。入れ替える相手は、2つの子のうち値の小さい方とする（子が1つならその子）。"),
    P("例えば、h が {9, 3, 4, 5, 7, 6, 8}、n が7のとき、9を子の小さい方の3と入れ替え、次に子の5・7のうち小さい5と入れ替えて、h は {3, 5, 4, 9, 7, 6, 8} になる。"),
    P("〔プログラム〕"), CODE(code16)],
   ch16, "オ",
   "a：c は左の子の要素番号。右の子があり、右の子の値の方が小さければ右の子を選ぶので、h[c ＋ 1] ＜ h[c]。"
   "b：入れ替えた値は要素番号 c に移ったので、次はそこから調べる（i ← c）。"
   "a を h[c＋1] ＞ h[c]（ア・エ・カ）とすると、大きい方の子と入れ替えるので、入れ替えた後の親がもう一方の子より大きくなり、条件が崩れる（例で9と4を入れ替えると、親の4が左の子3より大きい）。"
   "b を 2 × i（イ）とすると、右の子と入れ替えた場合にも左の子の位置に進んでしまい、下ろした値を追いかけられない。b を i ＋ 1（ウ）とすると、子ではなく隣の節に進む。"
   f"〔検算〕要素数1～15の最小ヒープの根をランダムな値に置き換えた2,500件で、処理後に最小ヒープの条件を満たし、値の集まりが変わらないのはオだけ。",
   {"ア": "大きい方の子と入れ替える", "イ": "常に左の子の位置へ進む", "ウ": "隣の節へ進む", "エ": "大きい方の子・左の位置へ進む", "オ": "正解", "カ": "大きい方の子・隣の節へ進む"},
   header=h16)
