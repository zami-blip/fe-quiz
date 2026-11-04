"""IPA 形式の疑似言語(この模試で使う範囲)を Python に変換して実行する、独立検算用の小さな処理系。

問題データ(JSON)に書かれた〔プログラム〕の文字列そのものを読み込んで実行するので、
作成時に別に書いた検算コードとは独立に、画面に表示されるコードの動作を確かめられる。
配列は要素番号1から始まり、範囲外を参照すると例外 OutOfRange を出す。
"""
import re


class OutOfRange(Exception):
    pass


class Arr:
    """要素番号1から始まる配列。範囲外の参照・代入は例外。"""

    def __init__(self, items):
        self.v = list(items)

    def _chk(self, i):
        if not isinstance(i, int) or isinstance(i, bool) or i < 1 or i > len(self.v):
            raise OutOfRange(f"index {i} / size {len(self.v)}")

    def __getitem__(self, i):
        self._chk(i)
        return self.v[i - 1]

    def __setitem__(self, i, x):
        self._chk(i)
        self.v[i - 1] = x

    def __len__(self):
        return len(self.v)

    def append(self, x):
        self.v.append(x)

    def __eq__(self, o):
        return isinstance(o, Arr) and self.v == o.v

    def py(self):
        return [x.py() if isinstance(x, Arr) else x for x in self.v]

    def __repr__(self):
        return "Arr(" + repr(self.py()) + ")"


def A(x):
    """Python の値を疑似言語の値に変換する(list → Arr、str は1文字ずつの Arr にはしない)。"""
    if isinstance(x, list):
        return Arr([A(e) for e in x])
    return x


class Str:
    """文字列。s[i] は i 文字目(1から)。"""

    def __init__(self, s):
        self.s = s

    def __getitem__(self, i):
        if not isinstance(i, int) or i < 1 or i > len(self.s):
            raise OutOfRange(f"char {i} / len {len(self.s)}")
        return self.s[i - 1]

    def __len__(self):
        return len(self.s)


TYPES = r"(?:整数型|実数型|論理型|文字型|文字列型)(?:の二次元配列|の配列)?"


def _expr(e, intdiv):
    e = e.strip()
    # 配列の初期化 {(n)個の x} / {n行m列の x}
    e = re.sub(r"\{(.+?)行(.+?)列の(.+?)\}", lambda m: f"_mat({_expr(m.group(1), intdiv)}, {_expr(m.group(2), intdiv)}, {_expr(m.group(3), intdiv)})", e)
    e = re.sub(r"\{(.+?)個の(.+?)\}", lambda m: f"_fill({_expr(m.group(1), intdiv)}, {_expr(m.group(2), intdiv)})", e)
    e = re.sub(r"(\w+(?:\[[^\]]*\])?) の要素数", r"len(\1)", e)
    e = re.sub(r"(\w+) の文字数", r"len(\1)", e)
    e = re.sub(r"(\w+) の行数", r"len(\1)", e)
    e = re.sub(r"(\w+) の列数", r"len(\1[1])", e)
    rep = [("＋", "+"), ("−", "-"), ("×", "*"), ("＝", "=="), ("≠", "!="), ("≦", "<="), ("≧", ">="),
           ("＜", "<"), ("＞", ">"), ("（", "("), ("）", ")"), (" mod ", " % "), ("true", "True"), ("false", "False"),
           ("未定義", "None")]
    for a, b in rep:
        e = e.replace(a, b)
    e = e.replace("÷", " // " if intdiv else " / ")
    e = re.sub(r"\bnot\b", " not ", e)
    # a[i, j] → a[i][j]
    def idx(m):
        parts = [p.strip() for p in m.group(2).split(",")]
        return m.group(1) + "".join(f"[{p}]" for p in parts)
    for _ in range(3):
        e = re.sub(r"(\w+)\[([^\[\]]+,[^\[\]]+)\]", idx, e)
    # 配列リテラル {..} → _A([..])
    e = e.replace("{", "_A([").replace("}", "])")
    return e


def translate(code, intdiv=True):
    out = []
    ind = 0
    glob = set()
    funcs = []
    pad = lambda: "    " * ind
    for raw in code.split("\n"):
        line = raw.strip()
        if not line:
            continue
        m = re.match(r"^大域:\s*(" + TYPES + r"):\s*(\w+)(?:\s*←\s*(.+))?$", line)
        if m:
            glob.add(m.group(2))
            out.append(f"{m.group(2)} = {_expr(m.group(3), intdiv) if m.group(3) else 'None'}")
            continue
        m = re.match(r"^○(?:" + TYPES + r":\s*)?(\w+)\((.*)\)$", line)
        if m:
            ind = 0
            params = [p.split(":")[-1].strip() for p in m.group(2).split(",") if p.strip()]
            funcs.append(m.group(1))
            out.append(f"def {m.group(1)}({', '.join(params)}):")
            ind = 1
            if glob:
                out.append(pad() + "global " + ", ".join(sorted(glob)))
            continue
        if line in ("endif", "endfor", "endwhile"):
            ind -= 1
            continue
        if line == "else":
            ind -= 1
            out.append(pad() + "else:")
            ind += 1
            continue
        m = re.match(r"^elseif\s*\((.*)\)$", line)
        if m:
            ind -= 1
            out.append(pad() + f"elif {_expr(m.group(1), intdiv)}:")
            ind += 1
            continue
        m = re.match(r"^if\s*\((.*)\)$", line)
        if m:
            out.append(pad() + f"if {_expr(m.group(1), intdiv)}:")
            ind += 1
            continue
        m = re.match(r"^while\s*\((.*)\)$", line)
        if m:
            out.append(pad() + f"while {_expr(m.group(1), intdiv)}:")
            ind += 1
            continue
        m = re.match(r"^for\s*\((\w+) を (.+) から (.+) まで (.+) ずつ(増やす|減らす)\)$", line)
        if m:
            v, a, b, s, d = m.groups()
            a, b, s = _expr(a, intdiv), _expr(b, intdiv), _expr(s, intdiv)
            if d == "増やす":
                out.append(pad() + f"for {v} in range({a}, ({b}) + 1, {s}):")
            else:
                out.append(pad() + f"for {v} in range({a}, ({b}) - 1, -({s})):")
            ind += 1
            continue
        m = re.match(r"^(" + TYPES + r"):\s*(.+)$", line)
        if m:
            decl = m.group(2)
            m2 = re.match(r"^(\w+)\s*←\s*(.+)$", decl)
            if m2:
                out.append(pad() + f"{m2.group(1)} = {_expr(m2.group(2), intdiv)}")
            else:
                for nm in decl.split(","):
                    out.append(pad() + f"{nm.strip()} = None")
            continue
        m = re.match(r"^return(?:\s+(.+))?$", line)
        if m:
            out.append(pad() + ("return " + _expr(m.group(1), intdiv) if m.group(1) else "return"))
            continue
        m = re.match(r"^(\w+) の末尾に (.+) の値を追加する$", line)
        if m:
            out.append(pad() + f"{m.group(1)}.append({_expr(m.group(2), intdiv)})")
            continue
        m = re.match(r"^(.+) を出力する$", line)
        if m:
            parts = [_expr(p, intdiv) for p in m.group(1).split(" と ")]
            out.append(pad() + f"_out(({', '.join(parts)},))")
            continue
        m = re.match(r"^(.+?)\s*←\s*(.+)$", line)
        if m:
            out.append(pad() + f"{_expr(m.group(1), intdiv)} = {_expr(m.group(2), intdiv)}")
            continue
        # 手続の呼出し
        out.append(pad() + _expr(line, intdiv))
    return "\n".join(out), funcs


def load(code, intdiv=True, extra=None):
    """コードを実行可能な名前空間にして返す。ns['_outs'] に出力が入る。"""
    py, funcs = translate(code, intdiv)
    ns = {"_A": A, "Arr": Arr, "_outs": []}
    ns["_out"] = lambda t: ns["_outs"].append(t)
    ns["_fill"] = lambda n, x: Arr([x] * n)
    ns["_mat"] = lambda r, c, x: Arr([Arr([x] * c) for _ in range(r)])
    if extra:
        ns.update(extra)
    try:
        exec(py, ns)
    except SyntaxError as e:
        raise SyntaxError(f"{e}\n--- translated ---\n{py}")
    ns["_py"] = py
    return ns


def fill_blanks(code, values):
    """コード中の空欄(半角空白で囲んだ a, b, c …)を、選択肢の文字列で置き換える。"""
    out = code
    for k, v in values.items():
        out, n = re.subn(r"(?<=[ (\[\n]) {2,}" + k + r"(?: {2,}|(?=\n)|$)", lambda m: " " + v + " ", out)
        if n == 0:
            raise ValueError(f"blank {k} not found")
    return out
