"""第3回模試の図(SVG)。線と文字は currentColor(画面側で黒系)、背景は白。
図ごとに、図の構造を文章にした figure_text を問題データに付ける(読上げ・GPT用テキスト・独立検算に使う)。"""
import math

HEAD = '<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="14" fill="none" stroke="currentColor" stroke-width="1.6">'


def ARROW(id):
    return (f'<defs><marker id="{id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            'orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" stroke="none"/></marker></defs>')


def T(x, y, s, size=14, bold=False, anchor="middle", halo=False):
    h = ' stroke="#fff" stroke-width="5" paint-order="stroke"' if halo else ' stroke="none"'
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}"'
            f'{" font-weight=\"bold\"" if bold else ""} fill="currentColor"{h}>{s}</text>')


def line(x1, y1, x2, y2, extra=""):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"{extra}/>'


def poly(pts, extra=""):
    return f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}"{extra}/>'


def dot(x, y, r=3.6):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="currentColor" stroke="none"/>'


# ---------------------------------------------------------------- 論理回路(NAND 4個)
def nand(x, y, h=22, w=34):
    """左端 x、中心 y の NAND 素子。出力端の x 座標を返す。"""
    s = f'<path d="M{x},{y - h} L{x + w},{y - h} A{h},{h} 0 0 1 {x + w},{y + h} L{x},{y + h} Z" fill="#fff"/>'
    s += f'<circle cx="{x + w + h + 5}" cy="{y}" r="5" fill="#fff"/>'
    return s, x + w + h + 10


def circuit_nand_majority():
    W, H = 640, 310
    s = [HEAD.format(w=W, h=H)]
    bus = {"A": 60, "B": 95, "C": 130}
    for k, x in bus.items():
        s.append(T(x, 22, k, 16, True))
        s.append(line(x, 30, x, 262))
    gates = [("G1", 70, ("A", "B")), ("G2", 150, ("B", "C")), ("G3", 230, ("C", "A"))]
    gx = 210
    outs = {}
    for name, cy, (i1, i2) in gates:
        y1, y2 = cy - 11, cy + 11
        s.append(line(bus[i1], y1, gx, y1))
        s.append(dot(bus[i1], y1))
        s.append(line(bus[i2], y2, gx, y2))
        s.append(dot(bus[i2], y2))
        g, ox = nand(gx, cy)
        s.append(g)
        s.append(T(gx + 22, cy + 5, name, 12))
        outs[name] = (ox, cy)
    g4x, g4y = 380, 150
    s.append(poly([outs["G1"], (330, 70), (330, 128), (g4x, 128)]))
    s.append(line(outs["G2"][0], 150, g4x, 150))
    s.append(poly([outs["G3"], (330, 230), (330, 172), (g4x, 172)]))
    g, ox = nand(g4x, g4y, h=30, w=40)
    s.append(g)
    s.append(T(g4x + 25, g4y + 5, "G4", 12))
    s.append(line(ox, g4y, ox + 50, g4y))
    s.append(T(ox + 62, g4y + 6, "Y", 16, True))
    # 凡例
    lg, _ = nand(330, 268, h=11, w=17)
    s.append(lg.replace('r="5"', 'r="3"'))
    s.append(T(380, 273, "：NAND素子（否定論理積）", 13, anchor="start"))
    s.append(dot(338, 292, 3.6))
    s.append(T(350, 297, "：線の接続点（●のない交差は接続しない）", 13, anchor="start"))
    s.append("</svg>")
    return "".join(s)


CIRCUIT_TEXT = ["入力は A、B、C の3本。",
                "G1 は A と B を入力とする NAND 素子、G2 は B と C を入力とする NAND 素子、G3 は C と A を入力とする NAND 素子。",
                "G4 は G1、G2、G3 の出力を入力とする3入力の NAND 素子で、その出力が Y。",
                "線が交差しているだけの所（●がない所）は接続していない。"]


# ---------------------------------------------------------------- 流れ図
def flowchart():
    W, H = 560, 660
    s = [HEAD.format(w=W, h=H), ARROW("r3fc")]
    A = ' marker-end="url(#r3fc)"'
    cx = 230

    def term(y, txt):
        return f'<rect x="{cx - 60}" y="{y - 18}" width="120" height="36" rx="18" fill="#fff"/>' + T(cx, y + 5, txt)

    def proc(x, y, txt, w=160):
        return f'<rect x="{x - w / 2}" y="{y - 20}" width="{w}" height="40" fill="#fff"/>' + T(x, y + 5, txt)

    def io(y, txt):
        return (f'<path d="M{cx - 70},{y + 20} L{cx - 50},{y - 20} L{cx + 80},{y - 20} L{cx + 60},{y + 20} Z" fill="#fff"/>'
                + T(cx + 5, y + 5, txt))

    def dia(x, y, txt, w=150, h=56):
        return (f'<path d="M{x},{y - h / 2} L{x + w / 2},{y} L{x},{y + h / 2} L{x - w / 2},{y} Z" fill="#fff"/>'
                + T(x, y + 5, txt))

    s.append(term(30, "開始"))
    s.append(line(cx, 48, cx, 70, A))
    s.append(io(90, "n を入力"))
    s.append(line(cx, 110, cx, 132, A))
    s.append(proc(cx, 152, "x ← n、c ← 0"))
    s.append(line(cx, 172, cx, 212, A))
    s.append(dia(cx, 240, "x ＞ 1"))
    # Yes 下へ
    s.append(line(cx, 268, cx, 302, A))
    s.append(T(cx + 12, 290, "Yes", 13, anchor="start"))
    s.append(dia(cx, 330, "x mod 2 ＝ 0"))
    s.append(line(cx - 75, 330, 110, 330))
    s.append(line(110, 330, 110, 378, A))
    s.append(T(130, 322, "Yes", 13))
    s.append(proc(110, 398, "x ← x ÷ 2", 120))
    s.append(line(cx + 75, 330, 365, 330))
    s.append(line(365, 330, 365, 378, A))
    s.append(T(344, 322, "No", 13))
    s.append(proc(365, 398, "x ← 3 × x ＋ 1", 150))
    s.append(poly([(110, 418), (110, 450), (cx, 450)]))
    s.append(poly([(365, 418), (365, 450), (cx, 450)]))
    s.append(dot(cx, 450, 3))
    s.append(line(cx, 450, cx, 476, A))
    s.append(proc(cx, 496, "c ← c ＋ 1"))
    s.append(poly([(cx, 516), (cx, 540), (24, 540), (24, 196), (cx - 2, 196)], A))
    # No 右へ
    s.append(line(cx + 75, 240, 470, 240))
    s.append(T(cx + 92, 232, "No", 13))
    s.append(line(470, 240, 470, 562, A))
    s.append(f'<path d="M{410},{602} L{430},{562} L{530},{562} L{510},{602} Z" fill="#fff"/>')
    s.append(T(470, 587, "c を出力"))
    s.append(line(470, 602, 470, 622, A))
    s.append(f'<rect x="{420}" y="{622}" width="100" height="32" rx="16" fill="#fff"/>')
    s.append(T(470, 643, "終了"))
    s.append("</svg>")
    return "".join(s)


FLOW_TEXT = ["開始 → n を入力 → 処理「x ← n、c ← 0」。",
             "判断「x ＞ 1」：No なら「c を出力」して終了。Yes なら次の判断へ。",
             "判断「x mod 2 ＝ 0」：Yes なら処理「x ← x ÷ 2」、No なら処理「x ← 3 × x ＋ 1」。",
             "どちらの後も処理「c ← c ＋ 1」を行い、判断「x ＞ 1」に戻る。"]


# ---------------------------------------------------------------- ネットワーク(VLAN と L3スイッチ)
def vlan_network():
    W, H = 600, 330
    s = [HEAD.format(w=W, h=H)]
    s.append('<rect x="210" y="20" width="180" height="56" rx="6" fill="#fff"/>')
    s.append(T(300, 44, "L3スイッチ", 15, True))
    s.append(T(300, 64, "ルーティング：有効", 12))
    s.append(T(400, 30, "VLAN10：192.168.10.1/24", 12, anchor="start"))
    s.append(T(400, 48, "VLAN20：192.168.20.1/24", 12, anchor="start"))
    s.append(T(400, 66, "VLAN30：IPアドレスなし", 12, anchor="start"))
    s.append(line(300, 76, 300, 140, ' stroke-width="4"'))
    s.append(T(310, 112, "トランク（VLAN10・20・30 のタグ付き）", 12, anchor="start"))
    s.append('<rect x="160" y="140" width="280" height="44" rx="6" fill="#fff"/>')
    s.append(T(300, 167, "L2スイッチ", 15, True))
    pcs = [("A", 90, "VLAN10", "192.168.10.11/24"), ("B", 230, "VLAN20", "192.168.20.12/24"),
           ("C", 370, "VLAN30", "192.168.30.13/24"), ("D", 510, "VLAN30", "192.168.30.14/24")]
    for name, x, vl, ip in pcs:
        if 160 <= x <= 440:
            s.append(line(x, 184, x, 250))
            s.append(T(x + 8, 222, vl, 12, anchor="start"))
        else:
            sx_ = 185 if x < 300 else 415
            s.append(poly([(sx_, 184), (sx_, 210), (x, 210), (x, 250)]))
            s.append(T(x + (8 if x < 300 else -8), 232, vl, 12, anchor="start" if x < 300 else "end"))
        s.append(f'<rect x="{x - 40}" y="250" width="80" height="34" rx="4" fill="#fff"/>')
        s.append(T(x, 272, "PC " + name, 14, True))
        s.append(T(x, 302, ip, 11))
    s.append(T(300, 324, "各PCのデフォルトゲートウェイは、同じVLANのL3スイッチのアドレス（ない場合は未設定）", 11))
    s.append("</svg>")
    return "".join(s)


VLAN_TEXT = ["L3スイッチはルーティングが有効で、VLAN10 に 192.168.10.1/24、VLAN20 に 192.168.20.1/24 のIPアドレスをもつ。VLAN30 にはIPアドレスをもたない。",
             "L3スイッチと L2スイッチは、VLAN10・20・30 のタグ付きフレームを通すトランクで接続している。",
             "L2スイッチのポートに、PC A（VLAN10、192.168.10.11/24）、PC B（VLAN20、192.168.20.12/24）、PC C（VLAN30、192.168.30.13/24）、PC D（VLAN30、192.168.30.14/24）を接続している。",
             "各PCのデフォルトゲートウェイは、同じVLANのL3スイッチのアドレス（VLAN30 のPCは未設定）。"]


# ---------------------------------------------------------------- 信頼度成長曲線
CURVE_X = [(0, 0), (50, 14), (100, 26), (150, 35), (200, 41), (250, 45), (300, 47), (350, 48), (400, 48)]
CURVE_Y = [(0, 0), (50, 4), (100, 9), (150, 15), (200, 22), (250, 30), (300, 38), (350, 46), (400, 54)]


def growth_curve():
    W, H = 560, 360
    x0, y0, xw, yh = 70, 300, 420, 250
    sx = lambda v: x0 + v * xw / 400
    sy = lambda v: y0 - v * yh / 60
    s = [HEAD.format(w=W, h=H)]
    for v in range(0, 61, 10):
        s.append(line(x0, sy(v), x0 + xw, sy(v), ' stroke-width="0.6" stroke-dasharray="3 4"'))
        s.append(T(x0 - 8, sy(v) + 5, str(v), 12, anchor="end"))
    for v in range(0, 401, 50):
        s.append(line(sx(v), y0, sx(v), y0 + 5))
        s.append(T(sx(v), y0 + 20, str(v), 12))
    s.append(line(x0, y0, x0 + xw, y0))
    s.append(line(x0, y0, x0, y0 - yh))
    s.append(T(x0 + xw / 2, y0 + 44, "消化したテスト項目数", 13))
    s.append(f'<text x="22" y="{y0 - yh / 2}" transform="rotate(-90 22 {y0 - yh / 2})" text-anchor="middle" font-size="13" fill="currentColor" stroke="none">累積の不具合検出数（件）</text>')
    s.append(poly([(sx(a), sy(b)) for a, b in CURVE_X], ' stroke-width="2.4"'))
    for a, b in CURVE_X:
        s.append(f'<circle cx="{sx(a)}" cy="{sy(b)}" r="4" fill="currentColor" stroke="none"/>')
    s.append(poly([(sx(a), sy(b)) for a, b in CURVE_Y], ' stroke-width="2.4" stroke-dasharray="8 5"'))
    for a, b in CURVE_Y:
        s.append(f'<rect x="{sx(a) - 4}" y="{sy(b) - 4}" width="8" height="8" fill="#fff" stroke-width="1.8"/>')
    s.append(line(110, 30, 150, 30, ' stroke-width="2.4"'))
    s.append(f'<circle cx="130" cy="30" r="4" fill="currentColor" stroke="none"/>')
    s.append(T(158, 35, "サブシステムX", 13, anchor="start"))
    s.append(line(290, 30, 330, 30, ' stroke-width="2.4" stroke-dasharray="8 5"'))
    s.append('<rect x="306" y="26" width="8" height="8" fill="#fff" stroke-width="1.8"/>')
    s.append(T(338, 35, "サブシステムY", 13, anchor="start"))
    s.append("</svg>")
    return "".join(s)


GROWTH_TEXT = ["横軸は消化したテスト項目数（0～400、各サブシステムとも全400項目）、縦軸は累積の不具合検出数。",
               "サブシステムX（実線・●）：0, 50, 100, 150, 200, 250, 300, 350, 400 項目の時点でそれぞれ " + ", ".join(str(b) for _, b in CURVE_X) + " 件。",
               "サブシステムY（破線・□）：同じ時点でそれぞれ " + ", ".join(str(b) for _, b in CURVE_Y) + " 件。"]


# ---------------------------------------------------------------- 状態遷移図
def state_diagram():
    W, H = 600, 300
    s = [HEAD.format(w=W, h=H), ARROW("r3sd")]
    A = ' marker-end="url(#r3sd)"'
    st = {"受付済": (120, 80), "支払済": (300, 80), "出荷済": (480, 80), "完了": (480, 230), "取消": (210, 230)}
    for name, (x, y) in st.items():
        s.append(f'<rect x="{x - 55}" y="{y - 22}" width="110" height="44" rx="14" fill="#fff"/>')
        s.append(T(x, y + 5, name, 15, True))
    s.append('<circle cx="30" cy="80" r="9" fill="currentColor" stroke="none"/>')
    s.append(line(39, 80, 63, 80, A))
    s.append(line(175, 80, 243, 80, A))
    s.append(T(209, 72, "支払", 13))
    s.append(line(355, 80, 423, 80, A))
    s.append(T(389, 72, "出荷", 13))
    s.append(line(480, 102, 480, 206, A))
    s.append(T(490, 158, "受取", 13, anchor="start"))
    s.append(line(135, 102, 190, 206, A))
    s.append(T(140, 162, "取消", 13, anchor="end"))
    s.append(line(285, 102, 230, 206, A))
    s.append(T(275, 162, "取消［返金］", 13, anchor="start"))
    # 終了状態
    s.append(line(535, 230, 560, 230, A))
    s.append('<circle cx="574" cy="230" r="11"/><circle cx="574" cy="230" r="6" fill="currentColor" stroke="none"/>')
    s.append(line(210, 252, 210, 272, A))
    s.append('<circle cx="210" cy="285" r="11"/><circle cx="210" cy="285" r="6" fill="currentColor" stroke="none"/>')
    s.append(T(20, 24, "●：開始　◎：終了　矢印に添えた文字：イベント［そのときの動作］", 12, anchor="start"))
    s.append("</svg>")
    return "".join(s)


STATE_TEXT = ["開始 → 受付済。",
              "受付済 → 支払済（イベント：支払）。支払済 → 出荷済（イベント：出荷）。出荷済 → 完了（イベント：受取）。",
              "受付済 → 取消（イベント：取消）。支払済 → 取消（イベント：取消、動作：返金）。出荷済からの取消の矢印はない。",
              "完了と取消から終了へ。図にない状態とイベントの組合せでは、イベントは受け付けられない（状態は変わらない）。"]


# ---------------------------------------------------------------- 業務の流れ(スイムレーン)
def swimlane():
    W, H = 640, 470
    lanes = ["顧客", "営業部", "倉庫", "経理部"]
    lw = W / 4
    s = [HEAD.format(w=W, h=H), ARROW("r3sw")]
    A = ' marker-end="url(#r3sw)"'
    for i, nm in enumerate(lanes):
        s.append(f'<rect x="{i * lw + 1}" y="1" width="{lw - 2}" height="{H - 2}" stroke-width="1"/>')
        s.append(f'<rect x="{i * lw + 1}" y="1" width="{lw - 2}" height="32" fill="currentColor" fill-opacity="0.08" stroke-width="1"/>')
        s.append(T(i * lw + lw / 2, 23, nm, 15, True))
    cx = [lw * i + lw / 2 for i in range(4)]

    def act(x, y, txt, w=130):
        return f'<rect x="{x - w / 2}" y="{y - 20}" width="{w}" height="40" rx="12" fill="#fff"/>' + T(x, y + 5, txt, 13)

    s.append('<circle cx="{}" cy="62" r="9" fill="currentColor" stroke="none"/>'.format(cx[0]))
    s.append(line(cx[0], 71, cx[0], 92, A))
    s.append(act(cx[0], 112, "注文する"))
    s.append(poly([(cx[0] + 65, 112), (cx[1], 112), (cx[1], 140)], A))
    s.append(act(cx[1], 160, "受注を登録する"))
    s.append(line(cx[1], 180, cx[1], 200, A))
    s.append(act(cx[1], 220, "在庫を確認する"))
    s.append(line(cx[1], 240, cx[1], 262, A))
    s.append(f'<path d="M{cx[1]},{262} L{cx[1] + 26},{282} L{cx[1]},{302} L{cx[1] - 26},{282} Z" fill="#fff"/>')
    s.append(poly([(cx[1] + 26, 282), (cx[2], 282), (cx[2], 312)], A))
    s.append(T(cx[1] + 60, 274, "［在庫あり］", 12, anchor="start"))
    s.append(act(cx[2], 332, "出荷する"))
    s.append(poly([(cx[2] + 65, 332), (cx[3], 332), (cx[3], 362)], A))
    s.append(act(cx[3], 382, "請求書を発行する", 140))
    s.append(line(cx[3], 402, cx[3], 424, A))
    s.append(f'<circle cx="{cx[3]}" cy="436" r="11"/><circle cx="{cx[3]}" cy="436" r="6" fill="currentColor" stroke="none"/>')
    s.append(line(cx[1], 302, cx[1], 362, A))
    s.append(T(cx[1] + 6, 330, "［在庫なし］", 12, anchor="start"))
    s.append(act(cx[1], 382, "納期を回答する"))
    s.append(poly([(cx[1] - 65, 382), (cx[0], 382), (cx[0], 352)], A))
    s.append(act(cx[0], 332, "納期を確認する"))
    s.append(line(cx[0], 312, cx[0], 286, A))
    s.append(f'<circle cx="{cx[0]}" cy="274" r="11"/><circle cx="{cx[0]}" cy="274" r="6" fill="currentColor" stroke="none"/>')
    s.append("</svg>")
    return "".join(s)


SWIM_TEXT = ["列（レーン）は左から 顧客、営業部、倉庫、経理部。",
             "顧客「注文する」→ 営業部「受注を登録する」→ 営業部「在庫を確認する」→ 分岐。",
             "［在庫あり］：倉庫「出荷する」→ 経理部「請求書を発行する」→ 終了。",
             "［在庫なし］：営業部「納期を回答する」→ 顧客「納期を確認する」→ 終了。"]
