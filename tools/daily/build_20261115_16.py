# -*- coding: utf-8 -*-
"""2026-11-15・2026-11-16 の「今日の学習」セット（各日 科目A 5問・科目B 2問）を生成し、検算する。

部品（P・CODE・TABLE・finish・check_question・原稿出力）は build_20261114.py のものを使う。
正答・誤答選択肢は、問題文の条件を入力にした独立の計算（sqlite3・時刻の重なり・Fraction・
バックアップの模擬・疑似言語をPythonで再現したコード）から求め、解答群の値と一致することを assert で確認する。
出力:
  src/daily/data/2026-11-15.json、2026-11-16.json
  tools/daily/out/20261115_check.log、20261116_check.log、各 _manuscript.md
実行: python3 -I tools/daily/build_20261115_16.py （リポジトリのルートで）
"""
import os, sys, json, random, sqlite3
from fractions import Fraction
from collections import deque
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_20261114 as lib  # noqa: E402
from build_20261114 import P, CODE, TABLE, LABELS, finish, check_question  # noqa: E402

ROOT = lib.ROOT
OUT_DIR = lib.OUT_DIR
log = lib.log


def common(date, qid, subject, field, cat, topic, skill, measures, sec, review_of=None, related_to=None):
    return {
        "id": qid, "version": 1, "subject": subject, "field": field, "cat": cat, "topic": topic,
        "skill": skill, "measures": measures, "difficulty": "標準", "expected_seconds": sec,
        "kind": "similar" if review_of else "new", "review_of": review_of, "related_to": related_to,
        "source_style": f"IPA本番形式準拠・オリジナル（{date} 新作）",
    }


def neg(x):
    """負の数を全角のマイナス記号で書く"""
    return f"−{-x}" if x < 0 else str(x)


def r2(fr):
    """正の有理数（％）を小数第2位までに四捨五入した文字列"""
    v = fr * 100
    n = int(v)
    if v - n >= Fraction(1, 2):
        n += 1
    return f"{n // 100}.{n % 100:02d}"


def overlap_minutes(s, e, open_h, close_h):
    """停止 s～e のうち、毎日 open_h:00～close_h:00（close_h=24 は 24:00）に重なる分数"""
    m = 0
    d = s.replace(hour=0, minute=0)
    while d < e:
        a, b = max(s, d + timedelta(hours=open_h)), min(e, d + timedelta(hours=close_h))
        if b > a:
            m += int((b - a).total_seconds() // 60)
        d += timedelta(days=1)
    return m


def simulate_backup(kind, names, steps, trials=2000, seed=1115):
    """kind: 'diff' or 'inc'。names: 日の並び（先頭がフル）。steps に対し、復旧に使うバックアップ名の組合せごとに、
    目標時点（最後の日）の状態に一致した割合を返す"""
    rnd = random.Random(seed)
    result = {k: 0 for k in steps}
    for _ in range(trials):
        files = {f"f{i}": 0 for i in range(10)}
        backups, since_full, since_last = {}, set(), set()
        for i, d in enumerate(names):
            if i > 0:
                for f in rnd.sample(list(files), rnd.randint(0, 4)):
                    files[f] += 1
                    since_full.add(f); since_last.add(f)
            if i == 0:
                backups[d] = dict(files); since_full, since_last = set(), set()
            else:
                rec = since_full if kind == "diff" else since_last
                backups[d] = {f: files[f] for f in rec}
                since_last = set()
        target = dict(files)
        for k, combo in steps.items():
            st = {}
            for nm in combo:
                st.update(backups[nm])
            if st == target:
                result[k] += 1
    return result


# ================================================================== 11/15
D15 = "2026-11-15"


def a15_1():
    names = ["1日:フル", "2日:差分", "3日:差分", "4日:差分", "5日:差分"]
    steps = {
        "ok": ["1日:フル", "5日:差分"],
        "all": ["1日:フル", "2日:差分", "3日:差分", "4日:差分", "5日:差分"],
        "diffonly": ["5日:差分"],
        "last2": ["4日:差分", "5日:差分"],
    }
    r = simulate_backup("diff", names, steps)
    log("15-A1: 差分方式 2,000通りで目標時点に一致した回数", r)
    assert r["ok"] == 2000 and r["all"] == 2000 and r["diffonly"] < 50 and r["last2"] < 50
    items = [
        ("1日のフルバックアップと5日の差分バックアップ", "正解"),
        ("1日のフルバックアップと2日・3日・4日・5日の差分バックアップ", "増分方式の手順と取り違えた。5日の差分に2日以降の変更がすべて入っているので、2～4日の差分は不要（最小限ではない）"),
        ("5日の差分バックアップだけ", "差分には1日以降に変更されたファイルしかないので、変更されていないファイルが戻らない"),
        ("4日と5日の差分バックアップ", "差分どうしを組み合わせても、1日以降に変更されていないファイルは戻らない"),
    ]
    q = common(D15, "D1115A01", "A", "テクノロジ", "システム構成（バックアップ）", "差分バックアップの運用で、指定した時点への復旧に必要な最小の組合せを選ぶ", "知識・事例", "事例の条件の読み取り", 70, review_of="D1114A02")
    q["body"] = [
        P("あるシステムでは、毎月1日の 2:00 にフルバックアップを取得し、2日以降は毎日 2:00 に差分バックアップを取得している。差分バックアップには、直前のフルバックアップの取得以降に変更されたファイルを記録する。"),
        P("5日の 15:00 に障害が発生し、5日の 2:00 の時点の状態にファイルを復旧する。復旧に使うバックアップの組合せとして、必要最小限のものはどれか。"),
    ]
    finish(q, items, lambda v: {"text": v})
    q["explanation"] = (
        "差分バックアップには、直前のフルバックアップ（1日）以降に変更されたファイルがすべて入っている。1日のフルバックアップを戻した後に5日の差分を戻せば、5日 2:00 の状態になる。"
        "イは、前回のバックアップ以降の変更だけを記録する増分方式の手順。差分方式では5日の差分に2～4日の変更も入っているので、2～4日の差分は不要（最小限ではない）。"
        "ウ・エのように差分だけで復旧すると、1日以降に一度も変更されていないファイルは差分に入っていないので戻らない（障害で失われたまま、または壊れたままになる）。フルバックアップは必ず最初に戻す。"
        "〔検算〕ファイルの変更パターンを2,000通り作って模擬し、1日フル＋5日差分（アの2つ）で5日の状態にすべて一致すること、ウ・エは変更されていないファイルが戻らずほとんど一致しないことを確認。"
    )
    q["explain"] = [TABLE(["戻すもの", "戻るファイル", "5日 2:00 の状態になるか"], [
        ["1日フル＋5日差分", "全ファイル（1日時点）＋1日以降に変更されたもの", "なる（最小限）"],
        ["1日フル＋2～5日差分", "同上（2～4日の差分は5日の差分に含まれる）", "なるが最小限ではない"],
        ["5日差分だけ／4日・5日差分", "1日以降に変更されたものだけ", "ならない（変更されていないファイルが戻らない）"]], "組合せごとの復旧結果")]
    return q


def a15_2():
    items = [
        ("経理担当者の公開鍵", "経理担当者あての内容を暗号化するときの鍵で、取引先の署名の検証には使えない"),
        ("経理担当者の秘密鍵", "経理担当者あての暗号文を復号するときの鍵で、署名の検証には使わない"),
        ("取引先の公開鍵", "正解"),
        ("取引先の秘密鍵", "署名の作成に使う鍵。取引先しか持っていない"),
    ]
    pairs = {"取引先": ("取引先の秘密鍵", "取引先の公開鍵")}
    verifiable = [v for v, _ in items if (pairs["取引先"][0], v) == pairs["取引先"]]
    log("15-A2: 取引先の秘密鍵で作った署名を検証できる鍵", verifiable)
    assert verifiable == ["取引先の公開鍵"]
    q = common(D15, "D1115A02", "A", "テクノロジ", "情報セキュリティ", "受け取った文書のデジタル署名を検証するときの鍵を選ぶ", "知識", "短い事例の読み取り", 35, review_of="D1114A05")
    q["body"] = [
        P("経理担当者は、取引先からデジタル署名付きの請求書ファイルを受け取った。請求書が取引先によって作成され、途中で改ざんされていないことを確かめるために、経理担当者が使う鍵はどれか。"),
    ]
    finish(q, items, lambda v: {"text": v})
    q["explanation"] = (
        "デジタル署名は、作成者（取引先）が自分の秘密鍵で作る。受け取った側は作成者の公開鍵で検証する。したがって使うのは取引先の公開鍵。"
        "エの取引先の秘密鍵は署名の作成に使う鍵で、取引先しか持っていない。ア・イの経理担当者の鍵の組は、経理担当者あての内容を暗号化（公開鍵）・復号（秘密鍵）するときに使う。"
        "〔検算〕秘密鍵と公開鍵の対応を模擬し、取引先の秘密鍵で作った署名を検証できるのは取引先の公開鍵だけであることを確認。"
    )
    q["explain"] = [TABLE(["目的", "作る側・送る側が使う鍵", "受け取る側が使う鍵"], [
        ["デジタル署名", "作成者の秘密鍵", "作成者の公開鍵"], ["暗号化", "受信者の公開鍵", "受信者の秘密鍵"]], "鍵の使い分け")]
    return q


def a15_3():
    F, cm, P_ = 1200, Fraction(6, 10), 300
    vr = 1 - cm
    ok = (F + P_) / cm
    w_bep = F / cm
    w_add = w_bep + P_
    w_vr = (F + P_) / vr
    log("15-A3: 正解", ok, "／損益分岐点", w_bep, "／損益分岐点＋目標利益", w_add, "／変動費率で割る", w_vr)
    assert ok - ok * vr - F == P_
    assert (ok, w_bep, w_add, w_vr) == (2500, 2000, 2300, 3750)
    items = sorted([(w_bep, "目標利益を加えずに損益分岐点売上高を求めた"),
                    (w_add, "損益分岐点売上高に目標利益をそのまま足した（目標利益も限界利益率で割る必要がある）"),
                    (ok, "正解"), (w_vr, "限界利益率ではなく変動費率（40％）で割った")])
    q = common(D15, "D1115A03", "A", "ストラテジ", "企業活動（会計・財務）", "固定費・限界利益率・目標利益から必要な売上高を求める", "計算", "公式の適用（目標利益を含む）", 75, review_of="D1114A03")
    q["body"] = [P("C社の固定費は年間 1,200万円、限界利益率は 60％（変動費率は 40％）である。年間の営業利益を 300万円にするために必要な売上高は何万円か。")]
    finish(q, items, lambda v: {"text": f"{int(v):,}"})
    q["explanation"] = (
        "必要な売上高は（固定費＋目標利益）÷限界利益率＝（1,200＋300）÷0.6＝2,500万円。"
        "（確かめ：2,500×0.6＝1,500 の限界利益から固定費 1,200 を引くと 300。）"
        "アの 2,000 は、目標利益を加えずに損益分岐点売上高（1,200÷0.6）を求めた場合。"
        "イの 2,300 は、損益分岐点売上高に目標利益 300 をそのまま足した場合。売上高が1万円増えても利益は 0.6万円しか増えないので、300万円の利益には 300÷0.6＝500万円の売上高が要る（2,000＋500＝2,500）。"
        "エの 3,750 は、変動費率 0.4 で割った場合。"
        "〔検算〕Fraction で計算し、求めた売上高から営業利益を逆算して 300万円になることを確認。"
    )
    q["explain"] = [TABLE(["考え方", "式", "値"], [
        ["損益分岐点売上高", "1,200÷0.6", "2,000"], ["目標利益の分", "300÷0.6", "500"], ["必要な売上高", "（1,200＋300）÷0.6", "2,500"],
        ["誤り：そのまま足す", "2,000＋300", "2,300"]], "目標利益の分も限界利益率で割る")]
    return q


def a15_4():
    base = datetime(2000, 1, 1)
    T = lambda d, h, m: base + timedelta(days=d, hours=h, minutes=m)
    events = [
        ("9日", T(9, 6, 40), T(9, 7, 25), "障害", False),
        ("12日", T(12, 21, 50), T(13, 0, 30), "障害（翌日 0:30 に復旧）", False),
        ("18日", T(18, 14, 0), T(18, 14, 40), "計画停止（事前に合意済み）", True),
        ("23日", T(23, 10, 5), T(23, 10, 20), "障害", False),
    ]
    cnt = {d: (0 if agreed else overlap_minutes(s, e, 7, 22)) for d, s, e, k, agreed in events}
    raw = {d: int((e - s).total_seconds() // 60) for d, s, e, k, agreed in events}
    ok = sum(cnt.values())
    w_morning = ok - cnt["9日"] + raw["9日"]
    w_planned = ok + overlap_minutes(events[2][1], events[2][2], 7, 22)
    w_midnight = ok - cnt["12日"] + raw["12日"]
    for d, s, e, k, agreed in events:
        log(f"15-A4: {d} {s:%H:%M}-{e:%H:%M} {k} → {cnt[d]}分（停止全体 {raw[d]}分）")
    log("15-A4: 合計", ok, "／朝を区切らない", w_morning, "／計画停止を含める", w_planned, "／日付またぎを区切らない", w_midnight)
    assert (ok, w_morning, w_planned, w_midnight) == (50, 70, 90, 200)
    items = sorted([(ok, "正解"), (w_morning, "9日の障害を提供開始の 7:00 で区切らず、6:40 からの45分を数えた"),
                    (w_planned, "合意済みの計画停止（40分）も停止時間に含めた"), (w_midnight, "12日の障害を 22:00 で区切らず、翌日 0:30 までの160分を数えた")])
    q = common(D15, "D1115A04", "A", "マネジメント", "サービスマネジメント", "提供時間・日付・計画停止の条件を同じ表で読み、停止時間の合計を求める", "計算", "複数条件の同時読み取り＋時刻の重なり", 120, review_of="D1114A04")
    q["body"] = [
        P("ある社内システムの SLA では、サービス提供時間を毎日 7:00～22:00 と合意している。停止時間には、サービス提供時間内に停止していた時間だけを数える。ただし、事前に合意した計画停止の時間は停止時間に含めない。"),
        P("ある月に発生した停止を表に示す。この月の停止時間の合計は何分か。"),
        TABLE(["日", "停止した時刻", "種別"], [[d, f"{s.hour}:{s:%M}～{e.hour}:{e:%M}", k] for d, s, e, k, _ in events], "この月の停止"),
    ]
    finish(q, items, lambda v: {"text": f"{v}分"})
    q["explanation"] = (
        "9日は提供開始の 7:00 から 7:25 までの25分。12日は 21:50 から提供終了の 22:00 までの10分で、22:00 から翌日 0:30 までは提供時間外。18日は合意済みの計画停止なので数えない。23日は15分。合計は 25＋10＋15＝50分。"
        "イの70分は、9日の障害を 7:00 で区切らずに45分数えた場合。ウの90分は、合意済みの計画停止40分も含めた場合。エの200分は、12日の障害を 22:00 で区切らずに160分数えた場合。"
        "〔検算〕停止ごとに各日の 7:00～22:00 との重なりを時刻の計算で求め（日をまたぐ停止は日ごとに分ける）、合計50分を確認。各誤答の数え方でも同じ計算をしてイ・ウ・エの値を確認。"
    )
    q["explain"] = [TABLE(["日", "停止", "数える分数", "理由"], [
        ["9日", "6:40～7:25", "25", "7:00 より前は提供時間外"],
        ["12日", "21:50～翌0:30", "10", "22:00 以降は提供時間外"],
        ["18日", "14:00～14:40", "0", "合意済みの計画停止"],
        ["23日", "10:05～10:20", "15", "全部提供時間内"],
        ["合計", "", "50", ""]], "停止時間の数え方")]
    return q


def a15_5():
    cust = [("C1",), ("C2",), ("C3",)]
    orders = [("O1", "C1"), ("O2", "C3"), ("O3", "C1")]
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE 顧客(顧客番号 TEXT PRIMARY KEY)")
    db.execute("CREATE TABLE 注文(注文番号 TEXT PRIMARY KEY, 顧客番号 TEXT)")
    db.executemany("INSERT INTO 顧客 VALUES(?)", cust)
    db.executemany("INSERT INTO 注文 VALUES(?,?)", orders)
    sql = ("SELECT 顧客.顧客番号, COUNT(注文.注文番号) AS 件数\n"
           "  FROM 顧客 LEFT OUTER JOIN 注文\n"
           "    ON 顧客.顧客番号 = 注文.顧客番号\n"
           " GROUP BY 顧客.顧客番号")
    run = lambda s: db.execute(s + "\n ORDER BY 1").fetchall()
    ok = run(sql)
    v_inner = run(sql.replace("LEFT OUTER JOIN", "INNER JOIN"))
    v_star = run(sql.replace("COUNT(注文.注文番号)", "COUNT(*)"))
    log("15-A5: 結果", ok, "／内部結合", v_inner, "／COUNT(*)", v_star)
    assert ok == [("C1", 2), ("C2", 0), ("C3", 1)] and v_inner == [("C1", 2), ("C3", 1)] and v_star == [("C1", 2), ("C2", 1), ("C3", 1)]
    v_null = [("C1", 2), ("C2", "NULL"), ("C3", 1)]
    fmt = lambda rows: {"text": "、".join(f"（{a}, {b}）" for a, b in rows)}
    items = [(v_inner, "内部結合と同じに考え、注文のない C2 の行を除いた"), (ok, "正解"),
             (v_null, "結合相手がない行の COUNT(列名) を NULL と考えた（COUNT は NULL を数えず 0 を返す）"),
             (v_star, "COUNT(列名) を COUNT(*) と同じに扱い、NULL の行も1件と数えた")]
    q = common(D15, "D1115A05", "A", "テクノロジ", "データベース", "左外部結合で結合相手がない行の件数を確かめる", "表読解", "外部結合とCOUNT(列名)の確認", 45, review_of="D1114A01")
    q["body"] = [
        P("表“顧客”と表“注文”に対して次の SQL 文を実行した。結果の各行を（顧客番号, 件数）で示したものはどれか。"),
        TABLE(["顧客番号"], [list(c) for c in cust], "顧客"),
        TABLE(["注文番号", "顧客番号"], [list(o) for o in orders], "注文"),
        CODE(sql),
    ]
    finish(q, items, fmt)
    q["explanation"] = (
        "左外部結合なので顧客の3行はすべて残る。注文のない C2 は、注文の列が NULL の1行になる。COUNT(注文.注文番号) は NULL を数えないので、C2 の件数は0。結果は（C1, 2）、（C2, 0）、（C3, 1）。"
        "アは、内部結合と同じに考えて C2 を除いた場合。ウは、件数を NULL と考えた場合で、COUNT は該当がなければ 0 を返す。エは、COUNT(*) と同じに扱い、C2 の NULL の行も1件と数えた場合。"
        "〔検算〕sqlite3 に同じ表を作って SQL 文を実行し結果を確認。内部結合・COUNT(*) に置き換えた SQL 文でもア・エの結果になることを確認。"
    )
    q["explain"] = [TABLE(["顧客番号", "結合後の行", "COUNT(注文.注文番号)", "COUNT(*)"], [
        ["C1", "O1, O3", "2", "2"], ["C2", "NULL の1行", "0", "1"], ["C3", "O2", "1", "1"]], "結合後の行と件数")]
    return q


# ---------------------------------------------------------------- 11/15 B1 キュー
B15_1_CODE = """○process(整数型: k)
  整数型: i, x
  for (i を 1 から k まで 1 ずつ増やす)
    x ← que.dequeue()
    if (x ＞ 3)
      que.enqueue(x − 3)
    endif
  endfor"""


def b15_1_sim(init, k, *, mode="ok", trace=None):
    q = deque(init)
    for i in range(1, k + 1):
        x = q.popleft()
        cond = x >= 3 if mode == "ge" else x > 3
        if cond:
            nx = x if mode == "nosub" else x - 3
            if mode == "front":
                q.appendleft(nx)
            else:
                q.append(nx)
        if trace is not None:
            trace.append((i, x, ("末尾へ " + str(x - 3)) if cond else "加工終了", list(q)))
    return list(q)


def b15_1():
    init, k = [5, 3, 8, 2], 4
    tr = []
    ok = b15_1_sim(init, k, trace=tr)
    for t in tr:
        log("15-B1: 追跡 (回, 取り出した値, 処理, 処理後のキュー) =", t)
    # 別手順：各部品の取出し回数 ceil(x/3) と取り出す順を手で数える代わりに、残り時間の列を1ステップずつ別実装で計算
    q2 = list(init)
    for _ in range(k):
        x, q2 = q2[0], q2[1:]
        q2 = q2 + ([x - 3] if x - 3 > 0 else [])
    assert q2 == ok == [2, 5]
    v3 = b15_1_sim(init, 3)
    v_ge = b15_1_sim(init, k, mode="ge")
    v_front = b15_1_sim(init, k, mode="front")
    log("15-B1: 正解", ok, "／3回目の直後", v3, "／＞を≧と読む", v_ge, "／戻す値を先頭へ", v_front)
    assert v3 == [2, 2, 5] and v_ge == [2, 0, 5] and v_front == [5, 2]
    items_raw = [(v3, "3回目の処理の直後の状態を答えた（1回分少ない）"), (ok, "正解"), (v_ge, "x ＞ 3 を ≧ と読み、3 の部品を 0 にして末尾へ戻した"), (v_front, "戻す値をキューの先頭に入れると考えた")]
    assert len({json.dumps(v) for v, _ in items_raw}) == 4
    fmt = lambda v: {"text": "{" + ", ".join(map(str, v)) + "}" if v else "{}（空）"}
    q = common(D15, "D1115B01", "B", "アルゴリズムとプログラミング", "キュー", "加工待ちの部品を取り出し、残りがあれば並び直させる処理の途中の状態を求める", "追跡", "取出し・末尾への追加の追跡（指定回の直後の状態）", 150, review_of="D1114B02")
    q["body"] = [
        P("ある工場では、加工待ちの部品の残り加工時間（分）を、待ち行列 que に並んだ順に格納している。加工機は、待ち行列の先頭の部品を取り出して最大3分加工する。残り加工時間が3分より長い部品は、残り加工時間を3分減らして待ち行列の末尾に並べ直す。3分以下の部品は加工を終える。"),
        P("待ち行列は Queue型 で表し、次の操作を使う。キューの中身は { } の中に先頭から末尾の順に書く。例えば {5, 3} は、先頭が 5、末尾が 3 である。手続 process を呼び出すときに que が空になることはない。"),
        TABLE(["操作", "説明"], [
            ["que.enqueue(x)", "x をキューの末尾に追加する。"],
            ["que.dequeue()", "キューの先頭の値をキューから取り除き、その値を返す。"],
        ], "Queue型の操作"),
        P("que が {5, 3, 8, 2} のときに process(4) を呼び出した。4回目の繰返しの処理を終えた直後の que の中身はどれか。"),
        P("〔プログラム〕"),
        CODE(B15_1_CODE),
    ]
    finish(q, items_raw, fmt)
    q["explanation"] = (
        "1回目は先頭の 5 を取り出し、3 より大きいので 5 − 3 ＝ 2 を末尾へ（{3, 8, 2, 2}）。2回目は 3 を取り出し、3 ＞ 3 ではないので加工を終える（{8, 2, 2}）。"
        "3回目は 8 を取り出し、5 を末尾へ（{2, 2, 5}）。4回目は 2 を取り出して加工を終える（{2, 5}）。"
        "アは、3回目の直後の状態。ウは、x ＞ 3 を ≧ と読み、2回目に 3 − 3 ＝ 0 を末尾へ戻した場合（{8, 2, 2, 0} → {2, 2, 0, 5} → {2, 0, 5}）。エは、戻す値を先頭に入れると考え、先頭の部品を続けて加工した場合。"
        "〔検算〕疑似言語を Python で再現して {2, 5} を確認。キューを配列の切出しで表した別の実装でも同じ結果。各誤答の読み違いを再現したコードでもア・ウ・エの値になることを確認。"
    )
    q["explain"] = [TABLE(["回", "取り出した値", "処理", "処理後の que（先頭→末尾）"],
                          [[str(i), str(x), h, "{" + ", ".join(map(str, qq)) + "}"] for i, x, h, qq in tr], "追跡表")]
    return q


# ---------------------------------------------------------------- 11/15 B2 配列の折返し
B15_2_CODE = """○patrol(整数型の配列: val, 整数型: start, 整数型: step, 整数型: m)
  整数型: n ← val の要素数
  整数型: p ← start
  整数型: i, x
  for (i を 1 から m まで 1 ずつ増やす)
    x ← val[p]
    p ← p ＋ step
    if (p ＞ n)
      p ← p − n
    endif
  endfor"""


def patrol(val, start, step, m, *, mode="ok"):
    n = len(val)
    p = start
    reads = []
    for i in range(1, m + 1):
        reads.append((i, p, val[p - 1]))
        p += step
        if p > n:
            p = p - n + 1 if mode == "plus1" else p - n
    return reads


def b15_2():
    val = [12, 7, 19, 4, 15, 9, 6]
    start, step = 5, 3
    reads = patrol(val, start, step, 5)
    for r in reads:
        log("15-B2: 追跡 (回, 添字, 値) =", r)
    ok = reads[3][1:]
    # 別手順：i 回目の添字は ((start − 1 ＋ (i − 1)×step) mod n) ＋ 1（step ＜ n のとき）
    n = len(val)
    for i, p, v in reads:
        assert p == ((start - 1 + (i - 1) * step) % n) + 1
    assert ok == (7, 6)
    v5 = reads[4][1:]
    v3 = reads[2][1:]
    vp1 = patrol(val, start, step, 4, mode="plus1")[3][1:]
    log("15-B2: 4回目", ok, "／5回目", v5, "／3回目", v3, "／折返しで1つずれる", vp1)
    assert (v5, v3, vp1) == ((3, 19), (4, 4), (2, 7))
    items = sorted([(ok, "正解"), (v5, "1回目を数えずに数え始め、5回目に読む要素を答えた"), (v3, "3回目に読む要素を答えた（1回分少ない）"),
                    (vp1, "折返しで p ← p − n ＋ 1 と1つずらし、2回目から要素2、5、2…を読むと考えた")])
    fmt = lambda v: {"cols": [str(v[0]), str(v[1])]}
    q = common(D15, "D1115B02", "B", "アルゴリズムとプログラミング", "配列の探索", "円周上の区画を一定間隔で巡回して値を読む", "追跡", "添字の折返しの追跡（指定回の添字と値）", 150, review_of="D1114B01")
    q["body"] = [
        P("円形の通路に沿って n 個の区画があり、区画番号は1から n までである。区画 n の次は区画1である。点検ロボットは、区画 start から始めて、step 区画ずつ進みながら、各区画のセンサの値を読む。配列 val の要素 val[i] には区画 i のセンサの値が格納されている。配列の要素番号は1から始まる。ここで、1 ≦ start ≦ n、1 ≦ step ＜ n とする。"),
        P("val ＝ {12, 7, 19, 4, 15, 9, 6}、start ＝ 5、step ＝ 3、m ＝ 5 として手続 patrol を呼び出した。4回目の繰返しで読む要素の要素番号 p と、読んだ値 x の組合せとして正しいものはどれか。"),
        P("〔プログラム〕"),
        CODE(B15_2_CODE),
    ]
    q["choice_header"] = ["要素番号 p", "読んだ値 x"]
    finish(q, items, fmt)
    pos = {v: LABELS[i] for i, (v, _) in enumerate(items)}
    q["explanation"] = (
        "n＝7。1回目は p＝5 で x＝15、p は 8 になり 7 を超えるので 8 − 7 ＝ 1。2回目は p＝1 で x＝12、p は 4。3回目は p＝4 で x＝4、p は 7（7 は n を超えないので折り返さない）。"
        "4回目は p＝7 で x＝6。正解は（7, 6）。"
        f"{pos[(2, 7)]}の（2, 7）は、折返しで p − n ＋ 1 と1つずらした場合。{pos[(3, 19)]}の（3, 19）は、5回目に読む要素。{pos[(4, 4)]}の（4, 4）は、3回目に読む要素。"
        "〔検算〕疑似言語を Python で再現して（7, 6）を確認。別の手順として、i 回目の要素番号が ((start − 1 ＋ (i − 1)×step) mod n) ＋ 1 になることを5回分すべて照合。各誤答の数え方でも解答群の値になることを確認。"
    )
    q["explain"] = [TABLE(["回 i", "読む要素番号 p", "読んだ値 x", "次の p（折返し後）"],
                          [[str(i), str(p), str(v), str(reads[i][1]) if i < len(reads) else "－"] for i, p, v in reads], "追跡表（5回目まで）")]
    return q


# ================================================================== 11/16
D16 = "2026-11-16"


def a16_1():
    names = ["日:フル", "月:増分", "火:増分", "水:増分", "木:増分"]
    steps = {
        "ok": ["日:フル", "月:増分", "火:増分", "水:増分", "木:増分"],
        "lastonly": ["日:フル", "木:増分"],
        "inconly": ["月:増分", "火:増分", "水:増分", "木:増分"],
        "last2": ["日:フル", "水:増分", "木:増分"],
    }
    r = simulate_backup("inc", names, steps, seed=1116)
    log("16-A1: 増分方式 2,000通りで目標時点に一致した回数", r)
    assert r["ok"] == 2000 and r["lastonly"] < 100 and r["inconly"] < 50 and r["last2"] < 400
    items = [
        ("日曜日のフルバックアップと木曜日の増分バックアップ", "差分方式の手順と取り違えた。木曜日の増分には水曜日以降の変更しかなく、月～水曜日の変更が戻らない"),
        ("日曜日のフルバックアップと月曜日・火曜日・水曜日・木曜日の増分バックアップ", "正解"),
        ("月曜日・火曜日・水曜日・木曜日の増分バックアップ", "フルバックアップを戻さないと、日曜日以降に変更されていないファイルが戻らない"),
        ("日曜日のフルバックアップと水曜日・木曜日の増分バックアップ", "月曜日・火曜日の増分を抜かしたので、その日だけに変更されたファイルが戻らない"),
    ]
    q = common(D16, "D1116A01", "A", "テクノロジ", "システム構成（バックアップ）", "増分バックアップの運用で、指定した時点への復旧に必要な組合せを選ぶ", "知識・事例", "事例の条件の読み取り（差分と増分の区別）", 70, related_to="D1115A01")
    q["body"] = [
        P("あるシステムでは、毎週日曜日の 1:00 にフルバックアップを取得し、月曜日から土曜日までは毎日 1:00 に増分バックアップを取得している。増分バックアップには、直前のバックアップ（フルバックアップ又は増分バックアップ）の取得以降に変更されたファイルだけを記録する。"),
        P("木曜日の 14:00 に障害が発生し、木曜日の 1:00 の時点の状態にファイルを復旧する。復旧に使うバックアップの組合せとして、必要最小限のものはどれか。"),
    ]
    finish(q, items, lambda v: {"text": v})
    q["explanation"] = (
        "増分バックアップには、直前のバックアップ以降の変更だけが入っている。月曜日の増分には日曜日 1:00～月曜日 1:00 の変更、火曜日の増分には月曜日 1:00～火曜日 1:00 の変更…と、1日分ずつしか入っていない。"
        "そのため、日曜日のフルバックアップを戻した後、月・火・水・木曜日の増分を古い順にすべて戻す必要がある。"
        "アは、直前のフル以降の変更をすべて記録する差分方式の手順で、増分方式では月～水曜日の変更が戻らない。ウは、フルバックアップがないので変更されていないファイルが戻らない。エは、月・火曜日だけに変更されたファイルが戻らない。"
        "〔検算〕ファイルの変更パターンを2,000通り作って増分方式を模擬し、イの組合せで木曜日の状態にすべて一致すること、ア・ウ・エでは一致しない場合があることを確認。"
    )
    q["explain"] = [TABLE(["方式", "毎日のバックアップに記録するもの", "木曜日 1:00 の状態への復旧に使うもの"], [
        ["差分", "直前のフルバックアップ以降の変更すべて", "日曜フル＋木曜差分"],
        ["増分（この問題）", "直前のバックアップ（フル又は増分）以降の変更", "日曜フル＋月・火・水・木の増分"]], "差分と増分の違い")]
    return q


def a16_2():
    items = [
        ("全社員それぞれの公開鍵で通知を暗号化して送る", "内容を秘匿する方法。この通知は公開してよく、発信元と改ざんの有無の確認にはならない"),
        ("総務部の秘密鍵で通知にデジタル署名を付けて送る", "正解"),
        ("総務部の公開鍵で通知を暗号化して送る", "総務部の秘密鍵を持つ総務部しか復号できず、社員が読めない"),
        ("共通鍵で通知を暗号化し、鍵は別のメールで送る", "内容の秘匿が目的の方法で、発信元の確認にはならない"),
    ]
    purpose = {"署名": {"発信元の確認", "改ざんの検知"}, "暗号化": {"内容の秘匿"}}
    need = {"発信元の確認", "改ざんの検知"}
    assert need <= purpose["署名"] and not (need & purpose["暗号化"])
    log("16-A2: 要件", need, "→ 署名で満たし、暗号化では満たさない")
    q = common(D16, "D1116A02", "A", "テクノロジ", "情報セキュリティ", "事例の目的から、デジタル署名と暗号化のどちらを使うかを判断する", "知識", "事例の目的の読み取り", 40, related_to="D1115A02")
    q["body"] = [
        P("総務部は、社内規程の改定を全社員に電子メールで知らせる。通知の内容は誰に読まれてもよいが、社員が受け取ったときに、総務部が送ったものであり、途中で書き換えられていないことを確かめられるようにしたい。最も適切な方法はどれか。"),
    ]
    finish(q, items, lambda v: {"text": v})
    q["explanation"] = (
        "求められているのは、発信元の確認と改ざんの検知で、内容を隠す必要はない。これはデジタル署名の目的である。総務部が自分の秘密鍵で署名を付け、社員は総務部の公開鍵で検証する。"
        "ア・エの暗号化は内容を第三者に読まれないようにする方法で、発信元の確認にはならない。ウは、総務部の公開鍵で暗号化すると総務部の秘密鍵でしか復号できないので、社員が読めない。"
        "〔検算〕要件（発信元の確認・改ざんの検知）と、署名・暗号化それぞれの目的を対応させ、要件を満たすのが署名だけであることを確認。"
    )
    q["explain"] = [TABLE(["方法", "目的", "この事例の要件を満たすか"], [
        ["デジタル署名", "発信元の確認・改ざんの検知", "満たす"], ["暗号化", "内容の秘匿", "満たさない（秘匿は不要）"]], "目的の対応")]
    return q


def a16_3():
    base = datetime(2000, 1, 1)
    T = lambda d, h, m: base + timedelta(days=d, hours=h, minutes=m)
    total, allow = 28800, Fraction(432, 10)
    events = [
        ("6日", T(6, 7, 20), T(6, 8, 35), "障害", False),
        ("14日", T(14, 0, 30), T(14, 2, 0), "障害", False),
        ("20日", T(20, 15, 0), T(20, 15, 30), "計画停止（事前に合意済み）", True),
    ]
    cnt = {d: (0 if ag else overlap_minutes(s, e, 8, 24)) for d, s, e, k, ag in events}
    raw = {d: int((e - s).total_seconds() // 60) for d, s, e, k, ag in events}
    ok = sum(cnt.values())
    assert total == 30 * 16 * 60 and allow == total * Fraction(15, 10000)
    w_morning = ok - cnt["6日"] + raw["6日"]
    w_planned = ok + raw["20日"]
    w_night = ok + raw["14日"]
    for d, s, e, k, ag in events:
        log(f"16-A3: {d} {s:%H:%M}-{e:%H:%M} {k} → {cnt[d]}分（停止全体 {raw[d]}分）")
    log("16-A3: 合計", ok, "許容", float(allow), "稼働率", r2(Fraction(total - ok, total) * 100), "％／朝を区切らない", w_morning, "／計画停止を含める", w_planned, "／深夜を含める", w_night)
    assert (ok, w_morning, w_planned, w_night) == (35, 75, 65, 125)
    judge = lambda m: "達成" if m <= allow else "未達成"
    items = sorted([(ok, "正解"), (w_planned, "合意済みの計画停止30分も含めた"), (w_morning, "6日の障害を提供開始の 8:00 で区切らず75分数えた"),
                    (w_night, "提供時間外の深夜（0:30～2:00）の障害90分も含めた")])
    q = common(D16, "D1116A03", "A", "マネジメント", "サービスマネジメント", "停止の表から提供時間内の停止時間を合計し、許容停止時間と比べて目標達成を判断する", "計算", "複数条件の同時読み取り＋許容値との比較", 100, related_to="D1115A04")
    q["body"] = [
        P("あるWebサービスの SLA では、サービス提供時間を毎日 8:00～24:00、稼働率の目標を 99.85％以上と合意している。停止時間にはサービス提供時間内の停止だけを数え、事前に合意した計画停止は含めない。"),
        P("ある30日間の月のサービス提供時間の合計は 28,800分で、目標を達成するために許される停止時間は 43.2分である。この月の停止を表に示す。停止時間の合計と目標の達成状況の組合せとして正しいものはどれか。"),
        TABLE(["日", "停止した時刻", "種別"], [[d, f"{s.hour}:{s:%M}～{e.hour}:{e:%M}", k] for d, s, e, k, _ in events], "この月の停止"),
    ]
    q["choice_header"] = ["停止時間の合計", "目標"]
    finish(q, items, lambda m: {"cols": [f"{m}分", judge(m)]})
    pos = {v: LABELS[i] for i, (v, _) in enumerate(items)}
    q["explanation"] = (
        "6日の障害は、提供開始の 8:00 から 8:35 までの35分だけ数える（7:20～8:00 は提供時間外）。14日の 0:30～2:00 は提供時間外なので数えない。20日は合意済みの計画停止なので数えない。"
        "停止時間の合計は35分で、許される 43.2分以内なので目標は達成。"
        "（稼働率で確かめると（28,800－35）÷28,800＝0.99878…で 99.88％、目標の 99.85％以上。許容停止 43.2分は 28,800×0.0015 で求めた値。）"
        f"{pos[w_planned]}は計画停止30分も含めた場合（65分）、{pos[w_morning]}は6日の障害を 8:00 で区切らなかった場合（75分）、{pos[w_night]}は深夜の障害90分も含めた場合（125分）。いずれも 43.2分を超えるので未達成と判断してしまう。"
        "〔検算〕停止ごとに各日の 8:00～24:00 との重なりを時刻の計算で求めて合計35分を確認し、許容停止 43.2分（28,800×0.15％）と比べた。各誤答の数え方でも同じ計算をした。"
    )
    q["explain"] = [TABLE(["日", "停止", "数える分数", "理由"], [
        ["6日", "7:20～8:35", "35", "8:00 より前は提供時間外"],
        ["14日", "0:30～2:00", "0", "提供時間外（深夜）"],
        ["20日", "15:00～15:30", "0", "合意済みの計画停止"],
        ["合計", "", "35", "許容 43.2分以内 → 達成"]], "停止時間の数え方")]
    return q


def a16_4():
    sales = 6000
    var = {"材料費": 1500, "外注加工費": 900}
    fix = {"人件費": 2000, "地代家賃": 600, "その他の固定費": 400}
    profit = sales - sum(var.values()) - sum(fix.values())
    assert profit == 600
    vr = Fraction(sum(var.values()), sales); cm = 1 - vr
    F, target = sum(fix.values()), 900
    ok = (F + target) / cm
    w_bep = F / cm; w_add = w_bep + target; w_vr = (F + target) / vr
    log("16-A4: 変動費率", vr, "限界利益率", cm, "固定費", F, "／正解", ok, "／損益分岐点", w_bep, "／そのまま足す", w_add, "／変動費率で割る", w_vr)
    assert ok - ok * vr - F == target
    assert (ok, w_bep, w_add, w_vr) == (6500, 5000, 5900, 9750)
    items = sorted([(w_bep, "目標利益を加えずに損益分岐点売上高を求めた"), (w_add, "損益分岐点売上高に目標利益をそのまま足した"),
                    (ok, "正解"), (w_vr, "限界利益率ではなく変動費率（0.4）で割った")])
    q = common(D16, "D1116A04", "A", "ストラテジ", "企業活動（会計・財務）", "損益の表から変動費率と限界利益率を求め、目標利益を達成する売上高を求める", "計算", "表から必要な値を選んで立式（限界利益率も自力で求める）", 100, related_to="D1115A03")
    q["body"] = [
        P("D社の今期の損益を表に示す。来期も、売上高に対する変動費の割合（変動費率）と固定費は今期と変わらないものとする。来期に営業利益 900万円を達成するために必要な売上高は何万円か。"),
        TABLE(["項目", "金額（万円）", "区分"], [["売上高", f"{sales:,}", "－"]] + [[k, f"{v:,}", "変動費"] for k, v in var.items()]
              + [[k, f"{v:,}", "固定費"] for k, v in fix.items()] + [["営業利益", f"{profit:,}", "－"]], "今期の損益"),
    ]
    finish(q, items, lambda v: {"text": f"{int(v):,}"})
    pos = {v: LABELS[i] for i, (v, _) in enumerate(items)}
    q["explanation"] = (
        "変動費は 1,500＋900＝2,400万円で、変動費率は 2,400÷6,000＝0.4、限界利益率は 1－0.4＝0.6。固定費は 2,000＋600＋400＝3,000万円。"
        "必要な売上高は（3,000＋900）÷0.6＝6,500万円。（確かめ：6,500×0.6－3,000＝900。）"
        f"{pos[w_bep]}の 5,000 は損益分岐点売上高（3,000÷0.6）。{pos[w_add]}の 5,900 は、それに目標利益 900 をそのまま足した場合（目標利益の分も 900÷0.6＝1,500 が必要）。{pos[w_vr]}の 9,750 は、変動費率 0.4 で割った場合。"
        "〔検算〕Fraction で変動費率・限界利益率を求めて計算し、求めた売上高から営業利益を逆算して 900万円になることを確認。"
    )
    q["explain"] = [TABLE(["手順", "式", "値"], [
        ["変動費率", "（1,500＋900）÷6,000", "0.4"], ["限界利益率", "1－0.4", "0.6"], ["固定費", "2,000＋600＋400", "3,000万円"],
        ["必要な売上高", "（3,000＋900）÷0.6", "6,500万円"]], "計算の手順")]
    return q


def a16_5():
    defs = {
        "インシデント管理": "発生した障害などからサービスをできるだけ早く通常の状態に戻す",
        "変更管理": "変更を評価・承認し、計画的に実施する",
        "問題管理": "インシデントの根本原因を突き止め、再発を防ぐ恒久的な対策を検討する",
        "構成管理": "構成品目の情報を正確に記録・維持する",
    }
    case_keywords = ["根本原因", "再発"]
    match = [k for k, v in defs.items() if all(w in v for w in case_keywords)]
    log("16-A5: 事例の要点", case_keywords, "→", match)
    assert match == ["問題管理"]
    items = [("インシデント管理", "利用者のサービスを早く復旧させる活動で、根本原因の調査は目的ではない"), ("変更管理", "変更の評価・承認の活動で、原因の調査ではない"),
             ("問題管理", "正解"), ("構成管理", "構成品目の情報を管理する活動")]
    q = common(D16, "D1116A05", "A", "マネジメント", "サービスマネジメント", "事例の活動内容から、該当するサービスマネジメントのプロセスを選ぶ", "知識", "短い事例の読み取り", 40)
    q["body"] = [
        P("ある業務システムで、同じ症状の障害が月に何度も発生している。発生のたびに再起動で業務は再開できているが、運用チームは過去の障害記録を分析して根本原因を突き止め、再発を防ぐための恒久的な対策を検討することにした。この活動に該当するプロセスはどれか。"),
    ]
    finish(q, items, lambda v: {"text": v})
    q["explanation"] = (
        "障害の根本原因を突き止め、再発防止の恒久対策を検討するのは問題管理の活動。"
        "アのインシデント管理は、再起動のように、発生した障害からサービスをできるだけ早く回復させる活動。イの変更管理は、恒久対策を実施するときの変更を評価・承認する活動。エの構成管理は、構成品目の情報を記録・維持する活動。"
        "〔検算〕事例の要点（根本原因・再発防止）を各プロセスの目的と照合し、該当するのが問題管理だけであることを確認。"
    )
    q["explain"] = [TABLE(["プロセス", "目的"], [[k, v] for k, v in defs.items()], "各プロセスの目的")]
    return q


# ---------------------------------------------------------------- 11/16 B1 キュー
B16_1_CODE = """○adjust(整数型: k)
  整数型: i, x
  for (i を 1 から k まで 1 ずつ増やす)
    x ← que.dequeue()
    if (x ≦ 2)
      passed の末尾に x を追加する
    else
      que.enqueue(x ÷ 2)
    endif
  endfor"""


def b16_1_sim(init, k, *, mode="ok", trace=None):
    q = deque(init); passed = []
    for i in range(1, k + 1):
        x = q.popleft()
        ok = x < 2 if mode == "lt" else x <= 2
        if ok:
            passed.append(x); h = "合格"
        else:
            nx = (x + 1) // 2 if mode == "ceil" else x // 2
            if mode == "front":
                q.appendleft(nx)
            else:
                q.append(nx)
            h = f"調整して {nx} を末尾へ" if mode != "front" else f"{nx} を先頭へ"
        if trace is not None:
            trace.append((i, x, h, list(q), list(passed)))
    return list(q)


def b16_1():
    init, k = [9, 1, 4, 6], 5
    tr = []
    ok = b16_1_sim(init, k, trace=tr)
    for t in tr:
        log("16-B1: 追跡 (回, 取り出した値, 処理, 処理後のキュー, passed) =", t)
    # 別実装（配列の切出し）でも確認
    q2 = list(init)
    for _ in range(k):
        x, q2 = q2[0], q2[1:]
        if x > 2:
            q2.append(x // 2)
    assert q2 == ok == [2, 3, 2]
    v4 = b16_1_sim(init, 4)
    v_lt = b16_1_sim(init, k, mode="lt")
    v_ceil = b16_1_sim(init, k, mode="ceil")
    v_front = b16_1_sim(init, k, mode="front")
    log("16-B1: 正解", ok, "／4回目の直後", v4, "／≦を＜と読む", v_lt, "／÷を切上げ", v_ceil, "／先頭へ戻す", v_front)
    assert v4 == [4, 2, 3] and v_lt == ok and v_ceil == [2, 3, 3] and v_front == [2, 6]  # ≦/＜ の読み違いはこの入力では同じ結果になるので選択肢にしない
    cand = [(v4, "4回目の処理の直後の状態を答えた（1回分少ない）"), (ok, "正解"), (v_ceil, "÷ を小数点以下切上げと読み、9 ÷ 2 を 5 とした"),
            (v_front, "調整した値をキューの先頭に入れると考えた")]
    assert len({json.dumps(v) for v, _ in cand}) == 4, cand
    fmt = lambda v: {"text": "{" + ", ".join(map(str, v)) + "}" if v else "{}（空）"}
    q = common(D16, "D1116B01", "B", "アルゴリズムとプログラミング", "キュー", "寸法のずれが大きい部品を調整して検査の列に並び直させる処理の途中の状態を求める", "追跡", "取出し・条件による末尾への追加の追跡（指定回の直後の状態）", 160, related_to="D1115B01")
    q["body"] = [
        P("ある検査工程では、部品の寸法のずれ（単位は 0.01mm、0以上の整数）を、検査を待つ順に待ち行列 que に格納している。検査では先頭の部品を取り出し、ずれが2以下なら合格として配列 passed の末尾に追加する。ずれが2より大きい部品は、調整してずれを半分（÷ は整数の除算で、小数点以下を切り捨てる）にし、待ち行列の末尾に並べ直す。"),
        P("待ち行列は Queue型 で表し、次の操作を使う。キューの中身は { } の中に先頭から末尾の順に書く。例えば {9, 1} は、先頭が 9、末尾が 1 である。手続 adjust を呼び出すときに que が空になることはない。"),
        TABLE(["操作", "説明"], [
            ["que.enqueue(x)", "x をキューの末尾に追加する。"],
            ["que.dequeue()", "キューの先頭の値をキューから取り除き、その値を返す。"],
        ], "Queue型の操作"),
        P("que が {9, 1, 4, 6}、passed が {}（要素なし）のときに adjust(5) を呼び出した。5回目の繰返しの処理を終えた直後の que の中身はどれか。"),
        P("〔プログラム〕"),
        CODE(B16_1_CODE),
    ]
    finish(q, cand, fmt)
    q["explanation"] = (
        "1回目は 9 を取り出し、9 ÷ 2 ＝ 4 を末尾へ（{1, 4, 6, 4}）。2回目は 1 を取り出して合格（{4, 6, 4}）。3回目は 4 を取り出し、2 を末尾へ（{6, 4, 2}）。"
        "4回目は 6 を取り出し、3 を末尾へ（{4, 2, 3}）。5回目は 4 を取り出し、2 を末尾へ（{2, 3, 2}）。"
        "アは4回目の直後の状態。ウは、÷ を切上げと読んだ場合（9 → 5、6 → 3、5 → 3 となり {2, 3, 3}）。エは、調整した値を先頭に入れると考え、同じ部品を続けて調整した場合。"
        "〔検算〕疑似言語を Python で再現して {2, 3, 2} を確認。キューを配列の切出しで表した別の実装でも同じ結果。各誤答の読み違いを再現したコードでもア・ウ・エの値になることを確認。"
    )
    q["explain"] = [TABLE(["回", "取り出した値", "処理", "処理後の que（先頭→末尾）", "passed"],
                          [[str(i), str(x), h, "{" + ", ".join(map(str, qq)) + "}", "{" + ", ".join(map(str, pp)) + "}"] for i, x, h, qq, pp in tr], "追跡表")]
    return q


# ---------------------------------------------------------------- 11/16 B2 配列の折返し（逆向き）
B16_2_CODE = """○整数型: pickAt(整数型の配列: card, 整数型: start, 整数型: step, 整数型: m)
  整数型: n ← card の要素数
  整数型: p ← start
  整数型: i
  for (i を 1 から m − 1 まで 1 ずつ増やす)
    p ← p − step
    if (p ＜ 1)
      p ← p ＋ n
    endif
  endfor
  return card[p]"""


def pick_at(card, start, step, m, *, mode="ok", trace=None):
    n = len(card); p = start
    if trace is not None:
        trace.append((1, p, card[p - 1]))
    last = m - 1 if mode != "m" else m
    for i in range(1, last + 1):
        p = p + step if mode == "fwd" else p - step
        if mode == "fwd":
            if p > n:
                p -= n
        elif p < 1:
            p = p + n - 1 if mode == "minus1" else p + n
        if trace is not None:
            trace.append((i + 1, p, card[p - 1]))
    return p, card[p - 1]


def b16_2():
    card = [31, 18, 42, 27, 55, 13, 60, 24, 36]
    start, step, m = 3, 4, 4
    tr = []
    ok = pick_at(card, start, step, m, trace=tr)
    for t in tr:
        log("16-B2: 追跡 (何番目に読む, p, card[p]) =", t)
    n = len(card)
    for k, p, v in tr:
        assert p == ((start - 1 - (k - 1) * step) % n) + 1
    assert ok == (9, 36)
    v_m = pick_at(card, start, step, m, mode="m")
    v_fwd = pick_at(card, start, step, m, mode="fwd")
    v_m1 = pick_at(card, start, step, m, mode="minus1")
    log("16-B2: 正解", ok, "／m 回移動", v_m, "／前向きに進む", v_fwd, "／折返しを p＋n−1", v_m1)
    assert v_m == (5, 55) and v_fwd == (6, 13) and v_m1 == (7, 60)
    cand = {ok: "正解", v_m: "繰返しを m 回と数え、6番目に読む要素を答えた", v_fwd: "p ← p − step を前向き（＋）に進むと読んだ", v_m1: "折返しで p ← p ＋ n − 1 と1つずらした"}
    assert len(cand) == 4, cand
    items = sorted(cand.items())
    fmt = lambda v: {"cols": [str(v[0]), str(v[1])]}
    q = common(D16, "D1116B02", "B", "アルゴリズムとプログラミング", "配列の探索", "環状に並べたカードを逆向きに一定間隔で数え、指定番目のカードを求める", "追跡", "逆向きの添字と先頭からの折返しの追跡", 160, related_to="D1115B02")
    q["body"] = [
        P("n 枚のカードを環状に並べ、位置に1から n までの番号を付ける。位置1の前は位置 n である。配列 card の要素 card[i] には、位置 i のカードに書かれた数が格納されている。配列の要素番号は1から始まる。"),
        P("関数 pickAt は、位置 start のカードを1番目に読み、そこから step 枚ずつ番号の小さい方向（位置1の次は位置 n）へ進みながら読むとき、m 番目に読むカードの数を返す。ここで、1 ≦ start ≦ n、1 ≦ step ＜ n、m ≧ 1 とする。"),
        P("card ＝ {31, 18, 42, 27, 55, 13, 60, 24, 36}、start ＝ 3、step ＝ 4、m ＝ 4 として pickAt を呼び出したとき、return の直前の p の値と戻り値の組合せとして正しいものはどれか。"),
        P("〔プログラム〕"),
        CODE(B16_2_CODE),
    ]
    q["choice_header"] = ["p", "戻り値"]
    finish(q, items, fmt)
    pos = {v: LABELS[i] for i, (v, _) in enumerate(items)}
    q["explanation"] = (
        f"n＝{n}。1番目に読むのは p＝{start}。繰返しは i＝1～{m - 1} の{m - 1}回（m − 1 回）。"
        + "".join(f"i＝{k - 1}：p＝{tr[k - 2][1]} − {step}＝{neg(tr[k - 2][1] - step)}" + (f"、1 未満なので {neg(tr[k - 2][1] - step)} ＋ {n}＝{p}。" if tr[k - 2][1] - step < 1 else "。") for k, p, v in tr[1:])
        + f"したがって{m}番目に読むのは位置{ok[0]}で、戻り値は card[{ok[0]}]＝{ok[1]}。"
        f"{pos[v_m]}の（{v_m[0]}, {v_m[1]}）は、繰返しを m 回と数えて{m + 1}番目まで進めた場合。{pos[v_m1]}の（{v_m1[0]}, {v_m1[1]}）は、折返しで p ＋ n − 1 と1つずらした場合。"
        f"{pos[v_fwd]}の（{v_fwd[0]}, {v_fwd[1]}）は、番号の大きい方向（＋）へ進むと読んだ場合。"
        f"〔検算〕疑似言語を Python で再現して（{ok[0]}, {ok[1]}）を確認。別の手順として、k 番目に読む位置が ((start − 1 − (k − 1)×step) mod n) ＋ 1 になることを{m}番目まで照合。"
        "各誤答の読み違いを再現したコードでも解答群の値になることを確認。"
    )
    q["explain"] = [TABLE(["何番目に読むか", "p", "card[p]", "求め方"],
                          [[str(k), str(p), str(v), "start" if k == 1 else (f"−{step}、折返し（＋{n}）" if p > tr[k - 2][1] else f"−{step}")] for k, p, v in tr], "追跡表（i＝k−1 回目の繰返しの後の p）")]
    return q


def build_day(date, plan_id, goal, note, qa, qb, ref_note):
    for q in qa + qb:
        check_question(q)
    log(f"{date} 正解の位置:", " ".join(f"{q['id']}={q['correct']}" for q in qa + qb), "／A想定合計", sum(q["expected_seconds"] for q in qa), "秒")
    return {
        "format": "fe-daily-plan-v1", "date": date, "planId": plan_id, "examDate": "2026-11-23",
        "author": "GPTの計画に沿ってClaudeが作問・検算", "goal": goal, "note": note,
        "sets": [
            {"setId": f"daily-{date.replace('-', '')}-A01", "subject": "A", "title": "科目A 5問セット",
             "goal": "5問すべてを制限時間内に一度表示する。手順が立たない計算問題は保留して先へ進み、残り時間で戻る。",
             "advice": "計算問題で1分ほど考えても式や手順が立たなければ、いったん保留して次へ。5問目まで見たら、残り時間で保留に戻る。",
             "detail": ref_note[0], "limitSec": 450, "limitNote": "科目A本番の平均 90分÷60問＝1問90秒 × 5問", "questions": qa},
            {"setId": f"daily-{date.replace('-', '')}-B01", "subject": "B", "title": "科目B 2問セット",
             "goal": "2問とも解く時間を確保する。取り出した値・添字・処理後の状態を、1回ずつ書きながら追う。",
             "advice": "残り5分で問1の答えが出ていなければ、保留して問2へ。問2を解き終えたら保留に戻る。",
             "detail": ref_note[1], "limitSec": 600, "limitNote": "科目B本番の平均 100分÷20問＝1問300秒 × 2問（既存の日次セットと同じ設定）", "questions": qb},
        ],
    }


def write(plan):
    path = os.path.join(ROOT, "src", "daily", "data", plan["date"] + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = json.load(f)
        assert old.get("planId") == plan["planId"], f"{path} に別の計画が登録済み（上書きしない）"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
        f.write("\n")
    lib.DATE = plan["date"]
    lib.write_manuscript(plan)


def main():
    lib.LOG.clear()
    p15 = build_day(D15, "plan-20261115-v1",
                    "前回つまずいた手順（差分バックアップの復旧、目標利益の計算、SLAの停止時間の数え方、キューと添字の追跡）を、短い問題で1つずつ確認する。科目Aは5問すべてを制限時間内に一度表示する。",
                    "前回の論点を短い新作問題で確認します。2つのセットは別々の空き時間に受験できます。解説・復習の時間は受験時間に含みません。",
                    [a15_1(), a15_2(), a15_3(), a15_4(), a15_5()], [b15_1(), b15_2()],
                    ("システム構成・情報セキュリティ・会計・サービスマネジメント・データベースの各1問（新作。短問2問を含む）。", "キューと配列の添字の追跡の2問（新作の短い問題）。"))
    log15 = list(lib.LOG); lib.LOG.clear()
    p16 = build_day(D16, "plan-20261116-v1",
                    "新しい題材で、差分と増分の区別、署名と暗号化の使い分け、SLAの達成判定、目標利益の表問題、キューと配列の折返しを自力で追えるかを確認する。科目Aは5問すべてを制限時間内に一度表示する。",
                    "前日の論点を、題材と問い方を変えた新作問題で確認します。2つのセットは別々の空き時間に受験できます。解説・復習の時間は受験時間に含みません。",
                    [a16_1(), a16_2(), a16_3(), a16_4(), a16_5()], [b16_1(), b16_2()],
                    ("システム構成・情報セキュリティ・サービスマネジメント・会計の新作5問（短問2問を含む）。", "キューと配列の折返しの新作2問。"))
    log16 = list(lib.LOG)
    for plan, lg in [(p15, log15), (p16, log16)]:
        write(plan)
        with open(os.path.join(OUT_DIR, plan["date"].replace("-", "") + "_check.log"), "w", encoding="utf-8") as f:
            f.write("\n".join(lg) + "\n")
    print("\n".join(log15 + log16))


if __name__ == "__main__":
    main()
