"""第2回模試の図(SVG)。色は currentColor(画面側で黒系)とし、塗りは透明度で表す。"""
import math

HEAD = '<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="14" fill="none" stroke="currentColor" stroke-width="1.6">'
ARROW = '<defs><marker id="{id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor" stroke="none"/></marker></defs>'


def T(x, y, s, size=14, bold=False, anchor="middle", halo=False):
    h = ' stroke="#fff" stroke-width="5" paint-order="stroke"' if halo else ' stroke="none"'
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}"{" font-weight=\"bold\"" if bold else ""} fill="currentColor"{h}>{s}</text>'


def venn_A_and_B_or_C():
    """3つの集合 A, B, C。網掛けは A ∩ (B ∪ C)。"""
    A, B, C = (140, 112, 72), (222, 112, 72), (181, 178, 72)
    s = [HEAD.format(w=380, h=280)]
    s.append(f'<defs><clipPath id="r2v-a"><circle cx="{A[0]}" cy="{A[1]}" r="{A[2]}"/></clipPath></defs>')
    s.append('<rect x="20" y="16" width="340" height="252" stroke-width="1.4"/>')
    s.append(T(36, 36, "U", 13, True))
    # 重なりが濃くならないよう、グループ全体に透明度をかける(網掛けは一様な濃さ)
    s.append('<g opacity="0.32" clip-path="url(#r2v-a)">')
    for c in (B, C):
        s.append(f'<circle cx="{c[0]}" cy="{c[1]}" r="{c[2]}" fill="currentColor" stroke="none"/>')
    s.append('</g>')
    for c in (A, B, C):
        s.append(f'<circle cx="{c[0]}" cy="{c[1]}" r="{c[2]}"/>')
    s.append(T(84, 58, "A", 16, True))
    s.append(T(280, 58, "B", 16, True))
    s.append(T(181, 266 - 6, "C", 16, True))
    s.append("</svg>")
    return "".join(s)


GRAPH_POS = {"A": (40, 140), "B": (160, 50), "C": (160, 230), "D": (310, 50), "E": (310, 230), "F": (430, 140)}
GRAPH_EDGES = [("A", "B", 8), ("A", "C", 3), ("B", "C", 1), ("B", "D", 2), ("C", "D", 9), ("C", "E", 7),
               ("D", "E", 1), ("D", "F", 4), ("E", "F", 6), ("B", "E", 5)]


def graph():
    s = [HEAD.format(w=470, h=280)]
    for a, b, w in GRAPH_EDGES:
        (x1, y1), (x2, y2) = GRAPH_POS[a], GRAPH_POS[b]
        s.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
    for a, b, w in GRAPH_EDGES:
        (x1, y1), (x2, y2) = GRAPH_POS[a], GRAPH_POS[b]
        t = 0.28 if {a, b} in ({"C", "D"}, {"B", "E"}) else 0.5
        x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy)
        ox, oy = -dy / L * 12, dx / L * 12
        if {a, b} == {"B", "C"}:
            ox, oy = 12, 0
        if {a, b} == {"D", "E"}:
            ox, oy = 12, 0
        s.append(T(round(x + ox), round(y + oy + 5), str(w), 14, True, halo=True))
    for n, (x, y) in GRAPH_POS.items():
        s.append(f'<circle cx="{x}" cy="{y}" r="18" fill="#fff"/>')
        s.append(T(x, y + 5, n, 15, True))
    s.append("</svg>")
    return "".join(s)


def dlist():
    """双方向リスト A ⇄ B ⇄ C と、挿入する要素 N。"""
    s = [HEAD.format(w=520, h=250), ARROW.format(id="r2l")]

    def node(x, y, name):
        s.append(f'<rect x="{x}" y="{y}" width="120" height="40"/>')
        s.append(f'<line x1="{x + 34}" y1="{y}" x2="{x + 34}" y2="{y + 40}"/>')
        s.append(f'<line x1="{x + 86}" y1="{y}" x2="{x + 86}" y2="{y + 40}"/>')
        s.append(T(x + 17, y + 25, "prev", 11))
        s.append(T(x + 60, y + 26, name, 16, True))
        s.append(T(x + 103, y + 25, "next", 11))

    xs = {"A": 20, "B": 200, "C": 380}
    for n, x in xs.items():
        node(x, 60, n)
    # next の矢印(上側)と prev の矢印(下側)
    for a, b in (("A", "B"), ("B", "C")):
        s.append(f'<path d="M{xs[a] + 103},{70} C{xs[a] + 140},{36} {xs[b] - 20},{36} {xs[b]},{70}" marker-end="url(#r2l)"/>')
        s.append(f'<path d="M{xs[b] + 17},{90} C{xs[b] - 20},{124} {xs[a] + 140},{124} {xs[a] + 120},{90}" marker-end="url(#r2l)"/>')
    node(200, 180, "N")
    s.append(T(260, 30, "P", 15, True))
    s.append(f'<line x1="260" y1="34" x2="260" y2="58" marker-end="url(#r2l)"/>')
    s.append(T(60, 172, "挿入する要素", 12, anchor="start"))
    s.append(f'<line x1="140" y1="176" x2="196" y2="196" marker-end="url(#r2l)"/>')
    s.append("</svg>")
    return "".join(s)


def er_student_course():
    s = [HEAD.format(w=460, h=120)]
    s.append('<rect x="20" y="40" width="110" height="44"/>')
    s.append(T(75, 67, "学生", 15, True))
    s.append('<rect x="330" y="40" width="110" height="44"/>')
    s.append(T(385, 67, "科目", 15, True))
    s.append('<line x1="130" y1="62" x2="330" y2="62"/>')
    s.append(T(150, 52, "*", 18, True))
    s.append(T(310, 52, "*", 18, True))
    s.append(T(230, 52, "履修する", 13))
    s.append(T(230, 104, "* は “多” を表す（1人の学生は複数の科目を履修し、1科目は複数の学生が履修する）", 11))
    s.append("</svg>")
    return "".join(s)


def class_diagram():
    s = [HEAD.format(w=520, h=300)]
    s.append('<defs><marker id="r2g" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12" orient="auto"><path d="M1,1 L11,6 L1,11 z" fill="#fff" stroke="currentColor"/></marker>'
             '<marker id="r2d" viewBox="0 0 16 10" refX="1" refY="5" markerWidth="16" markerHeight="10" orient="auto"><path d="M1,5 L8,1 L15,5 L8,9 z" fill="#fff" stroke="currentColor"/></marker></defs>')

    def box(x, y, w, name, italic=False):
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="40"/>')
        st = ' font-style="italic"' if italic else ""
        s.append(f'<text x="{x + w / 2}" y="{y + 25}" text-anchor="middle" font-size="15" font-weight="bold" fill="currentColor" stroke="none"{st}>{name}</text>')

    box(20, 30, 120, "図面")
    box(300, 30, 140, "図形", italic=True)
    s.append(T(370, 22, "{abstract}", 11))
    box(220, 220, 110, "円")
    box(400, 220, 110, "長方形")
    # 集約: 図面 ◇— 図形
    s.append('<line x1="140" y1="50" x2="300" y2="50" marker-start="url(#r2d)"/>')
    s.append(T(160, 42, "1", 13))
    s.append(T(276, 42, "0..*", 13))
    # 汎化
    s.append('<path d="M275,220 L275,160 L455,160 L455,220"/>')
    s.append('<line x1="370" y1="160" x2="370" y2="72" marker-end="url(#r2g)"/>')
    s.append("</svg>")
    return "".join(s)


def control_chart(values, ucl, cl, lcl):
    W, H = 520, 260
    x0, x1, y0, y1 = 60, 500, 30, 220
    lo, hi = 9.80, 10.20

    def Y(v):
        return y1 - (v - lo) / (hi - lo) * (y1 - y0)

    def X(i):
        return x0 + (i - 0.5) * (x1 - x0) / len(values)

    s = [HEAD.format(w=W, h=H)]
    s.append(f'<line x1="{x0}" y1="{y0 - 10}" x2="{x0}" y2="{y1}" stroke-width="1.2"/>')
    s.append(f'<line x1="{x0}" y1="{y1}" x2="{x1}" y2="{y1}" stroke-width="1.2"/>')
    for v, lab, dash in ((ucl, "UCL 10.15", "6 4"), (cl, "CL 10.00", ""), (lcl, "LCL 9.85", "6 4")):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        s.append(f'<line x1="{x0}" y1="{Y(v):.1f}" x2="{x1}" y2="{Y(v):.1f}" stroke-width="1.2"{d}/>')
        s.append(T(x0 - 6, round(Y(v) + 4), lab, 11, anchor="end"))
    pts = " ".join(f"{X(i + 1):.1f},{Y(v):.1f}" for i, v in enumerate(values))
    s.append(f'<polyline points="{pts}" stroke-width="1.2"/>')
    for i, v in enumerate(values):
        s.append(f'<circle cx="{X(i + 1):.1f}" cy="{Y(v):.1f}" r="3.5" fill="currentColor" stroke="none"/>')
        s.append(T(round(X(i + 1)), y1 + 16, str(i + 1), 11))
    s.append(T((x0 + x1) // 2, y1 + 34, "日（1～15）", 12))
    s.append("</svg>")
    return "".join(s)
