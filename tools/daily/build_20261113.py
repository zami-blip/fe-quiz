# -*- coding: utf-8 -*-
"""2026-11-13 の「今日の学習」セット（科目A 5問・科目B 2問）を生成し、検算する。

各問題の正答・誤答選択肢は、問題文に書いた条件を入力にした独立の計算（ipaddress・sqlite3・
datetime・Fraction・疑似言語をPythonで再現したコード）から求め、解答群の値と一致することを assert で確認する。
出力:
  src/daily/data/2026-11-13.json   … アプリが読む計画とセット
  tools/daily/out/20261113_check.log … 検算ログ
  tools/daily/out/20261113_manuscript.md … 問題・解説の原稿
実行: python3 -I tools/daily/build_20261113.py （リポジトリのルートで）
"""
import ipaddress, sqlite3, json, os, random, itertools
from fractions import Fraction
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_JSON = os.path.join(ROOT, "src", "daily", "data", "2026-11-13.json")
OUT_DIR = os.path.join(ROOT, "tools", "daily", "out")
LOG = []


def log(*a):
    LOG.append(" ".join(str(x) for x in a))


def P(text):
    return {"t": "p", "text": text}


def CODE(text):
    return {"t": "code", "text": text}


def TABLE(header, rows, caption=None):
    d = {"t": "table", "header": header, "rows": rows}
    if caption:
        d["caption"] = caption
    return d


LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ"]


def common(qid, subject, field, cat, topic, skill, measures, difficulty, sec):
    return {
        "id": qid, "version": 1, "subject": subject, "field": field, "cat": cat, "topic": topic,
        "skill": skill, "measures": measures, "difficulty": difficulty, "expected_seconds": sec,
        "kind": "new", "review_of": None, "source_style": "IPA本番形式準拠・オリジナル（2026-11-13 新作）",
    }


QUESTIONS = []

# ------------------------------------------------------------------ A1 ネットワーク（CIDR）
def q_a1():
    block = ipaddress.ip_network("172.20.96.0/19")
    subs = list(block.subnets(new_prefix=22))  # 8等分 = 3ビット追加
    assert len(subs) == 8
    fifth = subs[4]
    hosts = list(fifth.hosts())
    correct = f"{hosts[0]} ～ {hosts[-1]}"
    # 誤答の再現
    with_nb = f"{fifth.network_address} ～ {fifth.broadcast_address}"            # ネットワーク・ブロードキャストを含める
    sixth = subs[5]; h6 = list(sixth.hosts())
    off1 = f"{h6[0]} ～ {h6[-1]}"                                               # 先頭を0番目と数える
    wrong_size = list(ipaddress.ip_network("172.20.96.0/16", strict=False).subnets(new_prefix=21))
    # /19 を /21（2ビット追加＝4等分）で切ったと誤り、その5番目（範囲外）を数える
    w21 = [n for n in wrong_size if int(n.network_address) >= int(block.network_address)][4]
    h21 = list(w21.hosts())
    blocksize = f"{h21[0]} ～ {h21[-1]}"
    log("A1: /19 =", block, "8等分 →", [str(s) for s in subs])
    log("A1: 5番目", fifth, "ホスト", correct, "／ホスト数", len(hosts))
    log("A1: 誤答 含めた範囲", with_nb, "／1つずれ", off1, "／/21で数えた5番目", w21, blocksize, "（元の/19の範囲外:", not w21.subnet_of(block), "）")
    assert correct == "172.20.112.1 ～ 172.20.115.254"
    assert not w21.subnet_of(block)
    choices = [with_nb, correct, off1, blocksize]
    reasons = ["ネットワークアドレスとブロードキャストアドレスも含めた", "正解", "先頭のサブネットを0番目と数えた（6番目を求めた）", "8等分を2ビット（/21）の追加と誤り、ブロックの大きさを8として数えた（元の範囲外）"]
    q = common("D1113A01", "A", "テクノロジ", "ネットワーク", "割り当てられたアドレス範囲を等分したサブネットのホスト範囲を求める", "計算", "条件の読み取り＋CIDR計算", "標準", 100)
    q["body"] = [
        P("ある拠点に、IPv4 アドレスの範囲 172.20.96.0/19 が割り当てられている。この範囲を、先頭のアドレスから順に、アドレス数の等しい8つのサブネットに分割し、先頭のサブネットから順に1番目、2番目、…、8番目と呼ぶ。"),
        P("5番目のサブネットで、ホストに割り当てることができる IP アドレスの範囲はどれか。ここで、各サブネットのネットワークアドレスとブロードキャストアドレスはホストに割り当てない。"),
    ]
    q["choices"] = [{"label": LABELS[i], "text": c} for i, c in enumerate(choices)]
    q["correct"] = "イ"
    q["explanation"] = (
        "/19 は先頭19ビットが共通なので、172.20.96.0/19 の範囲は第3オクテットが 96～127 の 8,192 個（2^13）のアドレスになる。"
        "8等分するには3ビット（2^3＝8）を加えて /22 にする。/22 の1つ分は 2^10＝1,024 個で、第3オクテットでは4ずつ進む。"
        "1番目から順に 96、100、104、108、112、116、120、124 で始まるので、5番目は 172.20.112.0/22（172.20.112.0～172.20.115.255）。"
        "先頭のネットワークアドレスと末尾のブロードキャストアドレスを除くと、ホストに割り当てられるのは 172.20.112.1～172.20.115.254。"
        "アは、除くべき2つのアドレスを含めた範囲。ウは、先頭のサブネットを0番目と数えて6番目（116 で始まる）を求めた場合。"
        "エは、8等分を /21（ブロックの大きさ8）と誤って 96、104、112、120、128 と数えた場合で、128 は元の /19 の範囲（96～127）の外にある。"
        "〔検算〕Python の ipaddress で 172.20.96.0/19 を /22 に分割し、5番目のホスト範囲が 172.20.112.1～172.20.115.254 になることを確認。"
    )
    q["explain"] = [TABLE(["番号", "サブネット", "ホストに割り当てられる範囲"],
                          [[str(i + 1), str(s), f"{list(s.hosts())[0]} ～ {list(s.hosts())[-1]}"] for i, s in enumerate(subs)],
                          "8等分したサブネット（/22）")]
    q["verify"] = [{"label": LABELS[i], "value": c, "reason": reasons[i]} for i, c in enumerate(choices)]
    return q


# ------------------------------------------------------------------ A2 データベース（外部結合・集約）
def q_a2():
    members = [("M1", "青木"), ("M2", "井上"), ("M3", "上田"), ("M4", "江藤")]
    loans = [("L1", "M1", "Y"), ("L2", "M3", "N"), ("L3", "M1", "N"), ("L4", "M3", "N"), ("L5", "M1", "N"), ("L6", "M2", "Y")]
    db = sqlite3.connect(":memory:")
    db.execute("CREATE TABLE 会員(会員番号 TEXT PRIMARY KEY, 氏名 TEXT)")
    db.execute("CREATE TABLE 貸出(貸出番号 TEXT PRIMARY KEY, 会員番号 TEXT, 返却済み TEXT)")
    db.executemany("INSERT INTO 会員 VALUES(?,?)", members)
    db.executemany("INSERT INTO 貸出 VALUES(?,?,?)", loans)
    sql = ("SELECT 会員.会員番号, COUNT(貸出.貸出番号) AS 件数\n"
           "  FROM 会員 LEFT OUTER JOIN 貸出\n"
           "    ON 会員.会員番号 = 貸出.会員番号\n"
           "   AND 貸出.返却済み = 'N'\n"
           " GROUP BY 会員.会員番号\n"
           "HAVING COUNT(貸出.貸出番号) < 2")
    run = lambda s: db.execute(s + " ORDER BY 1").fetchall() if "ORDER" not in s else db.execute(s).fetchall()
    ok = run(sql)
    v_star = run(sql.replace("COUNT(貸出.貸出番号) AS", "COUNT(*) AS").replace("HAVING COUNT(貸出.貸出番号)", "HAVING COUNT(*)"))
    v_where = run(sql.replace("\n   AND 貸出.返却済み = 'N'", "").replace(" GROUP BY", " WHERE 貸出.返却済み = 'N'\n GROUP BY"))
    log("A2: 正しいSQLの結果", ok)
    log("A2: COUNT(*) と読んだ場合", v_star)
    log("A2: 条件を WHERE と同じに扱った場合（内部結合と同じ）", v_where)
    assert ok == [("M2", 0), ("M4", 0)]
    assert v_star == [("M2", 1), ("M4", 1)]
    assert v_where == []
    # ウの再現：返却済みの条件を読み落とし、件数は貸出番号で数える
    v_noc2 = run(sql.replace("\n   AND 貸出.返却済み = 'N'", ""))
    log("A2: 返却済みの条件を読み落とした場合", v_noc2)
    assert v_noc2 == [("M2", 1), ("M4", 0)]
    fmt = lambda rows: "、".join(f"（{a}, {b}）" for a, b in rows) + f"の{len(rows)}行" if rows else "結果は0行（該当する行がない）"
    choices = [fmt(v_where), fmt(ok), fmt(v_noc2), fmt(v_star)]
    reasons = ["ON 句の返却済みの条件を WHERE 句と同じに扱い、貸出のない会員の行を除いた", "正解", "ON 句の返却済みの条件を読み落とした（L6 を M2 の件数に数えた）", "COUNT(列名) を COUNT(*) と同じに扱い、結合相手のない行も1件と数えた"]
    q = common("D1113A02", "A", "テクノロジ", "データベース", "外部結合の結合条件と集約関数の数え方から結果の行を求める", "表読解", "表とSQLの照合", "標準", 110)
    q["body"] = [
        P("図書の貸出を管理するデータベースに、表“会員”と表“貸出”がある。表“貸出”の返却済みは、返却されていれば 'Y'、貸出中であれば 'N' である。"),
        TABLE(["会員番号", "氏名"], [list(m) for m in members], "会員"),
        TABLE(["貸出番号", "会員番号", "返却済み"], [list(l) for l in loans], "貸出"),
        P("次の SQL 文を実行して得られる結果はどれか。結果の各行は（会員番号, 件数）で示す。"),
        CODE(sql),
    ]
    q["choices"] = [{"label": LABELS[i], "text": c} for i, c in enumerate(choices)]
    q["correct"] = "イ"
    q["explanation"] = (
        "左外部結合では、会員の行はすべて残り、ON 句の条件（会員番号が一致し、かつ返却済みが 'N'）を満たす貸出の行が結び付く。結び付く行がない会員は、貸出の列が NULL の1行になる。"
        "結合結果は M1－L3、M1－L5、M2－NULL、M3－L2、M3－L4、M4－NULL（L1 と L6 は返却済み 'Y' なので結び付かない）。"
        "COUNT(貸出.貸出番号) は NULL を数えないので、件数は M1＝2、M2＝0、M3＝2、M4＝0。HAVING で2未満の M2 と M4 が残る。"
        "アは、返却済みの条件を WHERE 句と同じに扱った場合で、NULL の行が除かれ M1＝2、M3＝2 だけになり、該当なし。"
        "ウは、返却済みの条件を読み落とした場合で、M2 は L6 が結び付いて1件、M4 は0件。"
        "エは、COUNT(列名) を COUNT(*) と同じに扱い、結合相手のない行も1件と数えた場合。"
        "〔検算〕sqlite3 に同じ表を作って SQL 文を実行し、（M2, 0）、（M4, 0）を確認。各誤答の読み違いを再現した SQL 文でもア・ウ・エの値になることを確認。"
    )
    q["explain"] = [TABLE(["会員番号", "結び付く貸出（返却済み 'N'）", "COUNT(貸出.貸出番号)", "COUNT(*)", "HAVING ＜ 2"],
                          [["M1", "L3, L5", "2", "2", "×"], ["M2", "なし（L6 は 'Y'）", "0", "1", "○"], ["M3", "L2, L4", "2", "2", "×"], ["M4", "なし", "0", "1", "○"]],
                          "結合と集約の結果")]
    q["verify"] = [{"label": LABELS[i], "value": c, "reason": reasons[i]} for i, c in enumerate(choices)]
    return q


# ------------------------------------------------------------------ A3 情報セキュリティ（成立条件と対策）
def q_a3():
    # 成立条件の確認：仕様の有無の全組合せで、攻撃者が利用者のログイン後セッションを使えるかを模擬する
    def attack(accept_url_sid, keep_id_after_login, secure_cookie, httponly=False):
        # 攻撃者が取得したID S をURLで渡す。サイトが受け付けなければ利用者は別IDになる
        user_sid = "S" if accept_url_sid else "U"
        after_login = user_sid if keep_id_after_login else "NEW"
        # 攻撃者が知っているのは S。ログイン後のIDが S なら成立。Secure/HttpOnly は結果に影響しない
        return after_login == "S"
    table = []
    for a, b, c in itertools.product([True, False], repeat=3):
        r = attack(a, b, c)
        table.append((a, b, c, r))
        log(f"A3: (a)={a} (b)={b} (c)={c} → 成立={r}")
    need = [x for x in table if x[3]]
    assert all(x[0] and x[1] for x in need) and any(not x[2] for x in need)
    assert attack(True, True, True, httponly=True)  # HttpOnly を付けても成立
    assert not attack(True, False, True)           # ログイン時にIDを再発行すれば不成立
    q = common("D1113A03", "A", "テクノロジ", "情報セキュリティ", "Webサイトの仕様から、なりすましが成立する条件と対策を判断する", "事例判断", "事例の条件と攻撃手順の照合", "標準", 80)
    q["body"] = [
        P("会員制の Web サイトは、利用者を識別するためにセッション ID を使っている。サイトの仕様は次の (a)～(c) である。"),
        {"t": "list", "items": [
            "(a) セッション ID は Cookie で受け渡すが、URL のパラメータ sid で指定されたセッション ID も受け付ける。",
            "(b) ログイン前の閲覧時にセッション ID を発行し、ログインに成功した後も同じセッション ID を使い続ける。",
            "(c) 通信はすべて HTTPS で行い、Cookie には Secure 属性を付けている。",
        ]},
        P("攻撃者は、自分でこのサイトにアクセスしてセッション ID を取得し、その ID を sid に指定した URL をメールで利用者に送った。利用者がその URL からサイトにアクセスしてログインした後、攻撃者は同じセッション ID を使い、利用者としてサイトを操作した。"),
        P("この攻撃が成立するために必要な仕様の組合せと、この攻撃への対策として最も有効なものの組合せはどれか。"),
    ]
    q["choice_header"] = ["成立に必要な仕様", "最も有効な対策"]
    rows = [
        ("(a)と(b)", "ログインに成功した時点でセッション ID を新しく発行し直す", "正解"),
        ("(a)と(b)", "セッション ID を格納する Cookie に HttpOnly 属性を付ける", "HttpOnly は スクリプトによる Cookie の読出しを防ぐ対策。攻撃者は ID をすでに知っているので防げない"),
        ("(a)だけ", "ログインに成功した時点でセッション ID を新しく発行し直す", "(b) がなければ、ログイン後の ID は攻撃者の知らない値になるので (a) だけでは成立しない"),
        ("(a)、(b)、(c)のすべて", "通信を HTTPS に限定する", "(c) は盗聴への対策で成立には不要。すでに HTTPS なので対策にもならない"),
    ]
    q["choices"] = [{"label": LABELS[i], "cols": [r[0], r[1]]} for i, r in enumerate(rows)]
    q["correct"] = "ア"
    q["explanation"] = (
        "この攻撃はセッション固定（セッションフィクセーション）攻撃。攻撃者があらかじめ知っている ID を利用者に使わせ、利用者のログイン後もその ID が有効なままであることを利用する。"
        "成立には、外部から ID を指定させられること（(a)）と、ログイン後も同じ ID が使われ続けること（(b)）の両方が必要。(c) の HTTPS・Secure 属性は通信の盗聴を防ぐもので、この攻撃の成否に関係しない。"
        "対策は、ログインに成功した時点で ID を発行し直すこと。攻撃者の知っている ID はログイン前のものになり、ログイン後の操作に使えなくなる（URL パラメータの ID を受け付けないことも併せて有効）。"
        "イの HttpOnly 属性は、スクリプトから Cookie を読み出されることを防ぐ（主にクロスサイトスクリプティングによる ID の盗用への対策）。この攻撃では攻撃者が ID を最初から知っているので防げない。"
        "ウは、(b) がない場合にはログイン後の ID が新しくなり攻撃が成立しないことを見落としている。エは、成立に関係しない (c) を含め、対策も既に満たしている HTTPS を挙げている。"
        "〔検算〕仕様 (a)(b)(c) の有無の8通りで、攻撃者の知っている ID がログイン後の ID と一致するかを確認し、成立は (a)(b) がともにある場合だけ（(c) の有無に関係しない）であることを確認。"
    )
    q["verify"] = [{"label": LABELS[i], "value": [r[0], r[1]], "reason": r[2]} for i, r in enumerate(rows)]
    return q


# ------------------------------------------------------------------ A4 サービスマネジメント（SLA）
def q_a4():
    days = 20
    open_min = 12 * 60  # 9:00～21:00
    total = days * open_min
    base = datetime(2000, 1, 1)
    def mins(d, s, e, svc_day, planned):
        if not svc_day or planned:
            return 0
        s0, e0 = base + timedelta(hours=9), base + timedelta(hours=21)
        a = max(s, s0); b = min(e, e0)
        return max(0, int((b - a).total_seconds() // 60))
    T = lambda h, m: base + timedelta(hours=h, minutes=m)
    events = [
        ("4日（水）", T(20, 30), T(21, 30), True, False, "障害"),
        ("8日（日）", T(10, 0), T(12, 0), False, False, "障害"),
        ("12日（木）", T(8, 0), T(9, 40), True, True, "計画停止（事前に合意済み）"),
        ("19日（木）", T(14, 10), T(14, 55), True, False, "障害"),
    ]
    stop = sum(mins(d, s, e, sv, pl) for d, s, e, sv, pl, _ in events)
    def rate(m):
        return (Fraction(total - m, total) * 100)
    def r2(fr):  # 小数第3位を四捨五入（正の値）
        v = fr * 100
        n = int(v); rest = v - n
        if rest >= Fraction(1, 2):
            n += 1
        return f"{n // 100}.{n % 100:02d}"
    ok = r2(rate(stop))
    v_noclip = stop - 30 + 60                 # 21:00 以降も含めた
    v_planned = stop + 40                     # 計画停止のサービス時間内40分を含めた
    v_miss = stop - 30                         # サービス時間外にまたがる障害を全部除いた
    log("A4: サービス時間（分）", total, "許容停止（分）", total * Fraction(5, 1000))
    for d, s, e, sv, pl, k in events:
        log(f"A4: {d} {s:%H:%M}-{e:%H:%M} {k} → 停止に数える分数 {mins(d, s, e, sv, pl)}")
    log("A4: 停止合計", stop, "稼働率", float(rate(stop)), "→", ok)
    for nm, m in [("時間外を切り捨てない", v_noclip), ("計画停止を含める", v_planned), ("時間外にまたがる障害を全部除く", v_miss)]:
        log(f"A4: 誤答 {nm}: 停止 {m} 分 → {r2(rate(m))}％ 目標{'達成' if rate(m) >= Fraction(995, 10) else '未達'}")
    assert stop == 75 and ok == "99.48" and rate(stop) < Fraction(995, 10)
    data = sorted([
        (rate(v_planned), "未達成", "計画停止のうちサービス時間内の40分も停止時間に含めた"),
        (rate(v_noclip), "未達成", "4日の障害の 21:00 以降（サービス時間外）の30分も含めた"),
        (rate(stop), "未達成", "正解"),
        (rate(v_miss), "達成", "サービス時間外にまたがる4日の障害を、時間内の30分も含めてすべて除いた"),
    ])
    for fr, verdict, _ in data:
        assert (fr >= Fraction(995, 10)) == (verdict == "達成")
    q = common("D1113A04", "A", "マネジメント", "サービスマネジメント", "SLAの合意条件に沿って停止時間を数え、稼働率と目標の達成を判断する", "計算", "条件の読み取り＋計算", "標準", 110)
    q["body"] = [
        P("あるITサービスの SLA では、サービス提供時間を平日の 9:00～21:00、稼働率の目標を 99.5％以上と合意している。稼働率は次の式で求め、事前に合意した計画停止の時間は停止時間に含めない。また、サービス提供時間外の停止は停止時間に含めない。"),
        P("稼働率 ＝（サービス提供時間 － 停止時間）÷ サービス提供時間"),
        P("ある月のサービス提供日は20日である。この月に発生した停止を表に示す。この月の稼働率（％、小数第3位を四捨五入）と、目標の達成状況の組合せとして正しいものはどれか。"),
        TABLE(["日（曜日）", "停止した時刻", "種別"], [[d, f"{s.hour}:{s:%M}～{e.hour}:{e:%M}", k] for d, s, e, _, _, k in events], "この月の停止"),
    ]
    q["choice_header"] = ["稼働率", "目標"]
    q["choices"] = [{"label": LABELS[i], "cols": [r2(fr) + "％", v]} for i, (fr, v, _) in enumerate(data)]
    q["correct"] = LABELS[[i for i, d in enumerate(data) if d[2] == "正解"][0]]
    q["explanation"] = (
        f"サービス提供時間は 12時間×20日＝240時間＝14,400分。"
        "4日（水）の障害は 20:30～21:30 のうち 21:00 までの30分だけ数える。8日（日）はサービス提供日ではないので数えない。12日（木）は事前に合意した計画停止なので数えない。19日（木）の 14:10～14:55 の45分は数える。"
        "停止時間は 30＋45＝75分で、稼働率は（14,400－75）÷14,400＝0.994791…、小数第3位を四捨五入して 99.48％。目標の 99.5％に届かないので未達成。"
        "（目標の 99.5％で許される停止は 14,400×0.005＝72分なので、75分は3分超えている。）"
        "アの 99.20％は、計画停止のうちサービス時間内の 9:00～9:40 の40分も含めた場合（115分）。イの 99.27％は、4日の障害を1時間全部数えた場合（105分）。"
        "エの 99.69％は、時間外にまたがる4日の障害をすべて除いた場合（45分）で、目標を達成していると誤って判断する。"
        "〔検算〕停止ごとに、サービス時間 9:00～21:00 との重なりを時刻の計算で求め、分数の合計75分から有理数で稼働率を計算して 99.48％ を確認。各誤答の数え方でも同じ計算をしてア・イ・エの値を確認。"
    )
    q["explain"] = [TABLE(["日", "停止", "数える分数", "理由"], [
        ["4日（水）", "20:30～21:30", "30", "21:00 以降はサービス時間外"],
        ["8日（日）", "10:00～12:00", "0", "サービス提供日ではない"],
        ["12日（木）", "8:00～9:40", "0", "合意済みの計画停止"],
        ["19日（木）", "14:10～14:55", "45", "全部サービス時間内"],
        ["合計", "", "75", "許容は72分"]], "停止時間の数え方")]
    q["verify"] = [{"label": LABELS[i], "value": [r2(fr) + "％", v], "reason": why} for i, (fr, v, why) in enumerate(data)]
    return q


# ------------------------------------------------------------------ A5 ストラテジ（目標利益と限界利益率）
def q_a5():
    sales = 5000
    var = {"材料費": 2200, "外注加工費": 800}
    fix = {"人件費": 900, "減価償却費": 400, "その他の固定費": 200}
    profit = sales - sum(var.values()) - sum(fix.values())
    assert profit == 500
    vr = Fraction(sum(var.values()), sales)
    cm = 1 - vr
    fixed_next = sum(fix.values()) + 300
    target = 600
    ok = Fraction(fixed_next + target) / cm
    w_nofix = Fraction(sum(fix.values()) + target) / cm
    w_bep = Fraction(fixed_next) / cm
    w_vr = Fraction(fixed_next + target) / vr
    log("A5: 変動費率", vr, "限界利益率", cm, "来期固定費", fixed_next)
    log("A5: 正解 (1800+600)/0.4 =", ok, "／固定費増を無視", w_nofix, "／目標利益なし(損益分岐点)", w_bep, "／変動費率で割る", w_vr)
    # 別手順の検算：求めた売上高で実際に利益を計算する
    s = ok
    assert s - s * vr - fixed_next == target
    assert ok == 6000 and w_nofix == 5250 and w_bep == 4500 and w_vr == 4000
    vals = sorted([(w_vr, "変動費率（0.6）で割った"), (w_bep, "目標利益を加えずに損益分岐点売上高を求めた"), (w_nofix, "来期の固定費の増加（300万円）を反映しなかった"), (ok, "正解")])
    q = common("D1113A05", "A", "ストラテジ", "企業活動（会計・財務）", "損益計算の表から変動費と固定費を選び、目標利益を達成する売上高を求める", "計算", "表から必要な値を選んで立式", "標準", 90)
    q["body"] = [
        P("A社の今期の損益の実績を表に示す。来期は、人件費が今期より 300万円増える見込みである。売上高に対する変動費の割合（変動費率）とほかの固定費は今期と変わらないものとすると、来期に営業利益 600万円を達成するために必要な売上高は何万円か。"),
        TABLE(["項目", "金額（万円）", "区分"], [["売上高", f"{sales:,}", "－"]] + [[k, f"{v:,}", "変動費"] for k, v in var.items()] + [[k, f"{v:,}", "固定費"] for k, v in fix.items()] + [["営業利益", f"{profit:,}", "－"]], "今期の実績"),
    ]
    q["choices"] = [{"label": LABELS[i], "text": f"{int(v):,}"} for i, (v, _) in enumerate(vals)]
    q["correct"] = LABELS[[i for i, v in enumerate(vals) if v[1] == "正解"][0]]
    q["explanation"] = (
        "変動費は材料費と外注加工費の合計 3,000万円で、変動費率は 3,000÷5,000＝0.6、限界利益率は 1－0.6＝0.4。"
        "来期の固定費は 900＋300＋400＋200＝1,800万円。必要な売上高は（固定費＋目標利益）÷限界利益率＝（1,800＋600）÷0.4＝6,000万円。"
        "（確かめ：6,000－6,000×0.6－1,800＝600。）"
        "アの 4,000 は、限界利益率ではなく変動費率 0.6 で割った場合。イの 4,500 は、目標利益を加えずに損益分岐点売上高（1,800÷0.4）を求めた場合。ウの 5,250 は、固定費の増加を反映せず（1,500＋600）÷0.4 とした場合。"
        "〔検算〕Fraction で変動費率・限界利益率を求めて計算し、求めた売上高から営業利益を逆算して 600万円になることを確認。"
    )
    q["verify"] = [{"label": LABELS[i], "value": f"{int(v):,}", "reason": why} for i, (v, why) in enumerate(vals)]
    return q


# ------------------------------------------------------------------ B1 配列の探索（円形・早期return）
B1_CODE = """○整数型: findSeats(整数型の配列: seat, 整数型: k)
  整数型: n ← seat の要素数
  整数型: run ← 0
  整数型: i, p
  for (i を 1 から n ＋ k − 1 まで 1 ずつ増やす)
    p ← ((i − 1) mod n) ＋ 1
    if (seat[p] が 0 と等しい)
      run ← run ＋ 1
      if (run が k と等しい)
        return i − k ＋ 1
      endif
    else
      run ← 0
    endif
  endfor
  return −1"""


def find_seats(seat, k, *, wrap=True, reset=True, ret="start", trace=None):
    n = len(seat)
    run = 0
    last = n + k - 1 if wrap else n
    for i in range(1, last + 1):
        p = ((i - 1) % n) + 1
        if seat[p - 1] == 0:
            run += 1
            if trace is not None:
                trace.append((i, p, seat[p - 1], run))
            if run == k:
                if ret == "start":
                    return i - k + 1
                if ret == "end":
                    return p
                if ret == "p":
                    return p - k + 1
                if ret == "ik":
                    return i - k
        else:
            if reset:
                run = 0
            if trace is not None:
                trace.append((i, p, seat[p - 1], run))
    return -1


def brute_seats(seat, k):
    """説明文どおりの意味（席1から順に調べ、空席がk席続いた時点の先頭）を、別の方法で求める"""
    n = len(seat)
    seq = [(j % n) + 1 for j in range(n + k - 1)]
    for end in range(k - 1, len(seq)):
        win = seq[end - k + 1:end + 1]
        if all(seat[x - 1] == 0 for x in win) and len(set(win)) == k:
            return win[0]
    return -1


def q_b1():
    A = [0, 0, 1, 0, 0, 0, 1, 0, 0]
    ok = (find_seats(A, 3), find_seats(A, 4))
    log("B1: A =", A, "findSeats(A,3), findSeats(A,4) =", ok)
    assert ok == (4, 8)
    assert (brute_seats(A, 3), brute_seats(A, 4)) == ok
    # 全入力（n=1..8、k=1..n）で、疑似言語の再現と説明文の意味が一致することを確認
    cnt = 0
    for n in range(1, 9):
        for bits in itertools.product([0, 1], repeat=n):
            for k in range(1, n + 1):
                assert find_seats(list(bits), k) == brute_seats(list(bits), k), (bits, k)
                cnt += 1
    log("B1: 要素数1～8の全配列・全k（", cnt, "通り）で、プログラムと説明文の意味が一致")
    variants = {
        "nowrap": (find_seats(A, 3, wrap=False), find_seats(A, 4, wrap=False)),
        "end": (find_seats(A, 3, ret="end"), find_seats(A, 4, ret="end")),
        "noreset": (find_seats(A, 3, reset=False), find_seats(A, 4, reset=False)),
        "ik": (find_seats(A, 3, ret="ik"), find_seats(A, 4, ret="ik")),
    }
    for k_, v in variants.items():
        log("B1: 誤答の再現", k_, v)
    assert variants == {"nowrap": (4, -1), "end": (6, 2), "noreset": (2, 2), "ik": (3, 7)}
    items = sorted([
        (variants["noreset"], "席が使用中のときに run を0に戻す処理（else）を読み落とした"),
        (variants["ik"], "先頭の席番号を i − k と1つ少なく数えた"),
        (variants["nowrap"], "席 n の後に席1へ戻って調べることを読み落とし、繰返しを n 回で終えた"),
        (ok, "正解"),
        (variants["end"], "k 席の先頭ではなく最後の席（変数 p の値）を戻り値とした"),
    ])
    fmtv = lambda v: "−1" if v == -1 else str(v)
    tr3, tr4 = [], []
    find_seats(A, 3, trace=tr3); find_seats(A, 4, trace=tr4)
    q = common("D1113B01", "B", "アルゴリズムとプログラミング", "配列の探索", "円形に並んだ席から連続した空席を探す", "追跡", "説明と疑似言語の対応付け・添字の折返し・早期return", "標準", 270)
    q["body"] = [
        P("あるレストランには、円形のテーブルに n 席が並んでいる。席には1から n までの席番号が付いていて、席 i（i ＜ n）の隣は席 i ＋ 1、席 n の隣は席1である。配列 seat の要素 seat[i] には、席 i が空いていれば0、使用中であれば1が格納されている。配列の要素番号は1から始まる。"),
        P("関数 findSeats は、席1から席番号の順に席を調べ、空席が k 席続いたところで、その k 席のうち最初に調べた席の席番号を返す。席 n を調べた後は席1に戻って調べ続け、調べた回数が n ＋ k − 1 回になっても k 席続く空席が見つからなければ −1 を返す。ここで、1 ≦ k ≦ n とする。また、x mod y は、x を y で割った余り（x が0以上のとき、0以上 y 未満の値）を表す。"),
        P("配列 A を次のとおりとするとき、findSeats(A, 3) と findSeats(A, 4) の戻り値の組合せとして正しいものを、解答群の中から選べ。"),
        P("A ＝ {0, 0, 1, 0, 0, 0, 1, 0, 0}"),
        P("〔プログラム〕"),
        CODE(B1_CODE),
    ]
    q["choice_header"] = ["findSeats(A, 3)", "findSeats(A, 4)"]
    q["choices"] = [{"label": LABELS[i], "cols": [fmtv(v[0]), fmtv(v[1])]} for i, (v, _) in enumerate(items)]
    q["correct"] = LABELS[[i for i, it in enumerate(items) if it[1] == "正解"][0]]
    q["explanation"] = (
        "A は要素数9なので n＝9。p は i を 1～9 の席番号に折り返した値で、i＝10 のとき p＝1、i＝11 のとき p＝2 になる。run は続いている空席の数で、使用中の席で0に戻る。"
        "findSeats(A, 3)：繰返しは i＝1～11。席1、2 で run＝2、席3 は使用中で run＝0。席4、5、6 で run＝3 になった i＝6 で return i − k ＋ 1 ＝ 6 − 3 ＋ 1 ＝ 4。"
        "findSeats(A, 4)：繰返しは i＝1～12。席4～6 の run＝3 は席7（使用中）で0に戻る。席8、9 で run＝2、i＝10（席1）で3、i＝11（席2）で4 になり、return 11 − 4 ＋ 1 ＝ 8（席8、9、1、2 の4席）。"
        "（4,−1）は、席 n の後に席1へ戻ることを読み落とし、i＝9 で繰返しを終えた場合。（6, 2）は、先頭ではなく最後に調べた席 p を返すと考えた場合。"
        "（2, 2）は、else の run ← 0 を読み落とし、使用中の席をはさんでも空席を数え続けた場合。（3, 7）は、先頭の席番号を i − k と数えた場合。"
        "〔検算〕疑似言語を Python で再現して (4, 8) を確認。要素数1～8のすべての0/1の配列とすべての k で、プログラムの戻り値が問題文の説明（席1から順に調べて空席が k 席続いた時点の先頭）を別の方法で求めた値と一致することを確認。各誤答の読み違いを再現したコードでも解答群の値になることを確認。"
    )
    def trace_rows(tr, k):
        rows = []
        for i, p, v, run in tr:
            note = "使用中→run を0に" if v == 1 else ("run ＝ k → return " + str(i - k + 1) if run == k else "")
            rows.append([str(i), str(p), str(v), str(run), note])
        return rows
    q["explain"] = [
        TABLE(["i", "p", "seat[p]", "run", "このiで起きたこと"], trace_rows(tr3, 3), "追跡表1　findSeats(A, 3)（run は if 文の処理の後の値）"),
        TABLE(["i", "p", "seat[p]", "run", "このiで起きたこと"], trace_rows(tr4, 4), "追跡表2　findSeats(A, 4)（i＝10 以降は席1に戻って調べる）"),
    ]
    q["verify"] = [{"label": LABELS[i], "value": [fmtv(v[0]), fmtv(v[1])], "reason": why} for i, (v, why) in enumerate(items)]
    return q


# ------------------------------------------------------------------ B2 キュー（取出しと再投入）
B2_CODE = """大域: 整数型: turns ← 0

○文字列型の配列: printJobs(文字列型の配列: name, 整数型の配列: pages, 整数型: q)
  文字列型の配列: done ← {}
  Queue型: que ← 空のキュー
  整数型: i, j
  for (i を 1 から name の要素数 まで 1 ずつ増やす)
    que.enqueue(i)
  endfor
  while (que.isEmpty() が false と等しい)
    j ← que.dequeue()
    turns ← turns ＋ 1
    if (pages[j] ≦ q)
      pages[j] ← 0
      done の末尾に name[j] を追加する
    else
      pages[j] ← pages[j] − q
      que.enqueue(j)
    endif
  endwhile
  return done"""


def print_jobs(name, pages, q, *, cmp="le", mode="queue", count="turn", trace=None):
    from collections import deque
    pages = list(pages)
    done, turns, checks = [], 0, 0
    con = deque(range(len(name)))
    while True:
        checks += 1
        if not con:
            break
        j = con.popleft() if mode in ("queue", "front") else con.pop()
        turns += 1
        before = pages[j]
        fin = pages[j] <= q if cmp == "le" else pages[j] < q
        if fin:
            pages[j] = 0
            done.append(name[j])
        else:
            pages[j] -= q
            if mode == "front":
                con.appendleft(j)
            else:
                con.append(j)
        if trace is not None:
            trace.append((turns, name[j], before, pages[j], fin, [name[x] for x in con], list(done)))
    return done, (turns if count == "turn" else checks)


def q_b2():
    name, pages, qv = ["A", "B", "C", "D"], [5, 2, 7, 3], 3
    tr = []
    ok = print_jobs(name, pages, qv, trace=tr)
    log("B2: 正解", ok)
    for t in tr:
        log("B2: 追跡", t)
    assert ok == (["B", "D", "A", "C"], 7)
    # 別手順の検算：残りページから各ジョブの取出し回数 ceil(p/q) を求め、合計が turns に等しいこと
    assert sum(-(-p // qv) for p in pages) == ok[1]
    # ランダムな入力で、完了順の性質（取出し回数が少ないジョブほど先、同じなら要素番号順）と turns を確認
    rnd = random.Random(20261113)
    for _ in range(3000):
        m = rnd.randint(1, 6); qq = rnd.randint(1, 5)
        pg = [rnd.randint(1, 12) for _ in range(m)]
        nm = [chr(65 + x) for x in range(m)]
        d, t = print_jobs(nm, pg, qq)
        rounds = [-(-p // qq) for p in pg]
        assert d == [nm[x] for x in sorted(range(m), key=lambda x: (rounds[x], x))]
        assert t == sum(rounds)
    log("B2: ランダム入力3,000件で、完了順＝（取出し回数, 要素番号）の順、turns＝各ジョブの取出し回数の合計 を確認")
    v_lt = print_jobs(name, pages, qv, cmp="lt")
    v_front = print_jobs(name, pages, qv, mode="front")
    v_stack = print_jobs(name, pages, qv, mode="stack")
    v_checks = print_jobs(name, pages, qv, count="checks")
    for k_, v in [("≦を＜と読む", v_lt), ("再投入を先頭に（続けて処理）", v_front), ("後入れ先出し（スタック）", v_stack), ("繰返し条件の判定回数", v_checks)]:
        log("B2: 誤答の再現", k_, v)
    assert v_lt == (["B", "A", "D", "C"], 8) and v_front == (["A", "B", "C", "D"], 7)
    assert v_stack == (["D", "C", "B", "A"], 7) and v_checks == (["B", "D", "A", "C"], 8)
    items = [
        (v_front, "再投入したジョブがキューの先頭に入ると考え、同じジョブを終わるまで続けて処理した"),
        (v_lt, "pages[j] ≦ q を ＜ と読み、残り3ページの D を印刷し終わったと扱わなかった（D は残り0で並び直す）"),
        (ok, "正解"),
        (v_checks, "turns を、while の繰返し条件を判定した回数（最後の判定を含む）と数えた"),
        (v_stack, "キューを後入れ先出し（スタック）として扱った"),
    ]
    fmt = lambda d: "{" + ", ".join(f'"{x}"' for x in d) + "}"
    q = common("D1113B02", "B", "アルゴリズムとプログラミング", "キュー", "印刷ジョブを少しずつ印刷し、終わらないジョブを並び直させる", "追跡", "取出し・再投入・繰返し回数と途中状態の追跡", "標準", 300)
    q["body"] = [
        P("ある事務所では、複数の印刷ジョブを1台のプリンタで印刷する。1つのジョブを続けて長く印刷すると後のジョブが待たされるので、待ち行列の先頭のジョブを取り出して最大 q ページだけ印刷し、印刷し終わっていないジョブは待ち行列の末尾に並び直させる。"),
        P("関数 printJobs は、ジョブ名を格納した配列 name、各ジョブの印刷するページ数を格納した配列 pages、1回に印刷する最大ページ数 q を受け取り、印刷し終わったジョブのジョブ名を、終わった順に格納した配列を返す。大域変数 turns は、ジョブを取り出して印刷した回数を数える。配列の要素番号は1から始まる。"),
        P("待ち行列は Queue型 で表す。Queue型: que ← 空のキュー によって要素のないキューを生成し、次の操作を使う。空のキューに対して dequeue を行うことはない。"),
        TABLE(["操作", "説明"], [
            ["que.enqueue(x)", "x をキューの末尾に追加する。"],
            ["que.dequeue()", "キューの先頭の値をキューから取り除き、その値を返す。"],
            ["que.isEmpty()", "キューが空であれば true を、そうでなければ false を返す。"],
        ], "Queue型の操作"),
        P("関数 printJobs を、name ＝ {\"A\", \"B\", \"C\", \"D\"}、pages ＝ {5, 2, 7, 3}、q ＝ 3 として呼び出したとき、戻り値と、関数の処理が終わった時点の turns の値の組合せとして正しいものを、解答群の中から選べ。ここで、呼び出す前の turns は0である。"),
        P("〔プログラム〕"),
        CODE(B2_CODE),
    ]
    q["choice_header"] = ["戻り値", "turns"]
    q["choices"] = [{"label": LABELS[i], "cols": [fmt(v[0]), str(v[1])]} for i, (v, _) in enumerate(items)]
    q["correct"] = LABELS[[i for i, it in enumerate(items) if it[1] == "正解"][0]]
    q["explanation"] = (
        "キューには最初に要素番号 1、2、3、4（A、B、C、D）が並ぶ。取り出したジョブは、残りが q＝3 ページ以下なら印刷し終わって done に加わり、3ページより多ければ3ページ減らしてキューの末尾に並び直す。"
        "1回目 A（5→2、並び直す）、2回目 B（2、終了）、3回目 C（7→4、並び直す）、4回目 D（3、3 ≦ 3 なので終了）、5回目 A（2、終了）、6回目 C（4→1、並び直す）、7回目 C（1、終了）でキューが空になる。"
        "戻り値は {\"B\", \"D\", \"A\", \"C\"}、turns は7。"
        "アは、並び直したジョブがすぐ先頭に入ると考え、各ジョブを終わるまで続けて処理した場合。イは、≦ を ＜ と読んで D（ちょうど3ページ）を終わったと扱わず、残り0で並び直させた場合（取出しが1回増えて8）。"
        "エは、turns を while の条件を判定した回数（最後に空と判定した1回を含めて8回）と数えた場合。オは、キューを後から入れた要素を先に取り出すスタックとして扱った場合。"
        "〔検算〕疑似言語を Python で再現して ({\"B\", \"D\", \"A\", \"C\"}, 7) を確認。別の手順として、各ジョブの取出し回数（ページ数÷3 の切上げ：A 2、B 1、C 3、D 1）の合計が7になることを確認。各誤答の読み違いを再現したコードでも解答群の値になることを確認。"
    )
    q["explain"] = [TABLE(
        ["turns", "取り出したジョブ", "印刷前の残り", "印刷後の残り", "結果", "処理後のキュー（先頭→末尾）", "done"],
        [[str(t), nm, str(b), str(a), "終了" if f else "並び直す", "、".join(qq) if qq else "（空）", "{" + ", ".join(dd) + "}"] for t, nm, b, a, f, qq, dd in tr],
        "追跡表（各行は1回の繰返しの終わりの状態）")]
    q["verify"] = [{"label": LABELS[i], "value": [fmt(v[0]), str(v[1])], "reason": why} for i, (v, why) in enumerate(items)]
    return q


def check_question(q):
    labels = [c["label"] for c in q["choices"]]
    assert labels == LABELS[:len(labels)], q["id"]
    assert q["correct"] in labels
    vals = [json.dumps(c.get("cols", c.get("text")), ensure_ascii=False) for c in q["choices"]]
    assert len(set(vals)) == len(vals), (q["id"], "選択肢の重複")
    vr = [v for v in q["verify"] if v["reason"] == "正解"]
    assert len(vr) == 1 and vr[0]["label"] == q["correct"], q["id"]
    for c, v in zip(q["choices"], q["verify"]):
        assert c["label"] == v["label"]
        assert (c.get("cols") or c.get("text")) == v["value"], (q["id"], c, v)
    if q["subject"] == "A":
        assert len(q["choices"]) == 4
    for b in q["body"]:
        if b["t"] == "code":
            assert "\n  " in b["text"] or q["subject"] == "A"
    log(f"{q['id']}: 選択肢{len(labels)}個・正解 {q['correct']}・解答群と検算値が一致")


def main():
    qs = [q_a1(), q_a2(), q_a3(), q_a4(), q_a5(), q_b1(), q_b2()]
    for q in qs:
        check_question(q)
    log("正解の位置:", " ".join(f"{q['id']}={q['correct']}" for q in qs))
    plan = {
        "format": "fe-daily-plan-v1",
        "date": "2026-11-13",
        "planId": "plan-20261113-v1",
        "examDate": "2026-11-23",
        "author": "GPTの計画に沿ってClaudeが作問・検算",
        "goal": "分野の異なる科目Aを時間内に一巡して保留と再訪を含む解き方を計測し、科目Bでは初見の説明と疑似言語を対応付けて、変化する値と終了条件を追う。",
        "note": "初日の暫定計画（観察用）。2つのセットは別々の空き時間に受験できます。解説・復習の時間は受験時間に含みません。5問・2問の結果だけで科目全体の到達度は判定しません。",
        "sets": [
            {
                "setId": "daily-20261113-A01", "subject": "A", "title": "科目A 5問セット",
                "goal": "分野の異なる問題を時間内に一巡し、保留と再訪を含む解き方を計測する。",
                "detail": "ネットワーク計算・データベース・情報セキュリティ・サービスマネジメント・ストラテジの各1問（新作）。知識・読解・計算の時間差を確認する。",
                "limitSec": 450, "limitNote": "科目A本番の平均 90分÷60問＝1問90秒 × 5問",
                "questions": qs[:5],
            },
            {
                "setId": "daily-20261113-B01", "subject": "B", "title": "科目B 2問セット",
                "goal": "初見の説明と疑似言語を対応付け、変化する値と終了条件を追う。",
                "detail": "アルゴリズムとプログラミングの2問（新作）。科目B全体の構成比を表すセットではない。",
                "limitSec": 600, "limitNote": "科目B本番の平均 100分÷20問＝1問300秒 × 2問",
                "questions": qs[5:],
            },
        ],
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "20261113_check.log"), "w", encoding="utf-8") as f:
        f.write("\n".join(LOG) + "\n")
    write_manuscript(plan)
    print("\n".join(LOG))


def blocks_md(blocks):
    out = []
    for b in blocks:
        if b["t"] == "p":
            out.append(b["text"])
        elif b["t"] == "code":
            out.append("```\n" + b["text"] + "\n```")
        elif b["t"] == "list":
            out.extend(b["items"])
        elif b["t"] == "table":
            if b.get("caption"):
                out.append(f"〔{b['caption']}〕")
            out.append("| " + " | ".join(b["header"]) + " |")
            out.append("|" + "---|" * len(b["header"]))
            out.extend("| " + " | ".join(r) + " |" for r in b["rows"])
        out.append("")
    return "\n".join(out)


def write_manuscript(plan):
    L = [f"# 今日の学習 {plan['date']} 問題原稿", "", f"計画ID: {plan['planId']}", "", plan["goal"], ""]
    for s in plan["sets"]:
        L += [f"## {s['setId']}（{s['title']}、制限 {s['limitSec']}秒）", "", s["goal"], ""]
        for i, q in enumerate(s["questions"]):
            L += [f"### 問{i + 1} {q['id']}　{q['field']}／{q['cat']}", "", f"測定する技能: {q['measures']}（skill={q['skill']}）　想定所要時間: {q['expected_seconds']}秒（作問上の見積り）", "", blocks_md(q["body"])]
            if q.get("choice_header"):
                L.append("| 解答群 | " + " | ".join(q["choice_header"]) + " |")
                L.append("|" + "---|" * (len(q["choice_header"]) + 1))
                L += ["| " + c["label"] + " | " + " | ".join(c["cols"]) + " |" for c in q["choices"]]
            else:
                L += [f"{c['label']}　{c['text']}" for c in q["choices"]]
            L += ["", f"**正解 {q['correct']}**", "", q["explanation"], "", blocks_md(q.get("explain", [])), "誤答選択肢の理由:"]
            L += [f"- {v['label']}: {v['reason']}" for v in q["verify"]]
            L.append("")
    with open(os.path.join(OUT_DIR, "20261113_manuscript.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))


if __name__ == "__main__":
    main()
