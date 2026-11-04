"""変異テスト: 正しいデータをわざと壊し、choice_consistency.py と check_r2.py が検出することを確かめる。"""
import copy
import json
import subprocess
import sys

A0 = json.load(open(sys.argv[1], encoding="utf-8"))
B0 = json.load(open(sys.argv[2], encoding="utf-8"))


def find(qs, qid):
    return [q for q in qs if q["id"] == qid][0]


def m1(A, B):
    v = find(A, "M2A13")["verify"][0]
    v["value"] = "1.1764705882352942"


def m2(A, B):
    q = find(A, "M2A13")
    q["explanation"] = q["explanation"].replace("1.25", "（値）")


def m3(A, B):
    q = find(A, "M2A07")
    q["choices"][1]["text"] = "10"
    q["verify"][1]["value"] = "10"


def m4(A, B):
    find(B, "M2B02")["correct"] = "イ"


def m5(A, B):
    q = find(B, "M2B09")
    q["verify"] = [v for v in q["verify"] if v["label"] != "カ"]


def m6(A, B):
    q = find(B, "M2B13")
    for b in q["body"]:
        if b["t"] == "code":
            b["text"] = b["text"].replace("      return false", "      return true")


def m7(A, B):
    q = find(A, "M2A22")
    tb = [b for b in q["body"] if b["t"] == "table"][1]
    tb["rows"][5][2] = "2026-09-29"


def m8(A, B):
    q = find(B, "M2B16")
    tb = [b for b in q["body"] if b["t"] == "table"][0]
    tb["rows"][2][2] = "0"


def m9(A, B):
    find(B, "M2B01")["correct"] = "ア"


def m10(A, B):
    q = find(A, "M2M03")
    svg = [b for b in q["body"] if b["t"] == "svg"][0]
    svg["figure_text"][1] = svg["figure_text"][1].replace("4日目 10.18", "4日目 10.12")


MUTS = [(m1, "M2A13 誤答アの検算記録を段階1の指摘と同じ値にする"), (m2, "M2A13 解説から誤答アの値1.25を消す"),
        (m3, "M2A07 誤答イを正解と同じ10にする"), (m4, "M2B02 正解記号をイに変える"), (m5, "M2B09 選択肢カの検算記録を消す"),
        (m6, "M2B13 プログラムの return false を return true にする"), (m7, "M2A22 表“貸出”の6行目(会員105)の貸出日を9月29日に変える"),
        (m8, "M2B16 表の要素番号3の left を0にする"), (m9, "M2B01 正解記号だけをアに変える(解説はそのまま)"),
        (m10, "M2M03 図の構造の文章の4日目の値を限界線の内側に変える")]

ok_all = True
for f, desc in MUTS:
    A, B = copy.deepcopy(A0), copy.deepcopy(B0)
    f(A, B)
    json.dump(A, open("out/_mutA.json", "w", encoding="utf-8"), ensure_ascii=False)
    json.dump(B, open("out/_mutB.json", "w", encoding="utf-8"), ensure_ascii=False)
    r1 = subprocess.run([sys.executable, "choice_consistency.py", "out/_mutA.json", "out/_mutB.json"], capture_output=True, text=True)
    r2 = subprocess.run([sys.executable, "check_r2.py", "out/_mutA.json", "out/_mutB.json"], capture_output=True, text=True)
    det1 = [l.split()[0] for l in r1.stdout.splitlines()[1:]]
    det2 = [l for l in r2.stdout.splitlines() if l.startswith("NG")]
    hit = bool(det1) or bool(det2)
    ok_all &= hit
    print(f"{f.__name__}: {desc} → {'検出' if hit else '見逃し'}（choice_consistency: {','.join(sorted(set(det1))) or 'なし'}／check_r2: NG {len(det2)}件{'：' + det2[0][4:] if det2 else ''}）")
print("全件検出" if ok_all else "見逃しあり")
sys.exit(0 if ok_all else 1)
