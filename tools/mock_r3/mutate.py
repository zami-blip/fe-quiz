"""変異テスト: 正しいデータをわざと壊し、choice_consistency.py と check_r3.py が検出することを確かめる。
使い方: python3 mutate.py mockA3.json mockB3.json"""
import copy
import json
import subprocess
import sys

A0 = json.load(open(sys.argv[1], encoding="utf-8"))
B0 = json.load(open(sys.argv[2], encoding="utf-8"))
F = lambda qs, i: [q for q in qs if q["id"] == i][0]


def setc(q, lab, val):
    for c in q["choices"]:
        if c["label"] == lab:
            c["text"] = val
    for v in q["verify"]:
        if v["label"] == lab:
            v["value"] = val


MUT = {
    "正解記号の取り違え(A43)": lambda A, B: F(A, "M3A43").__setitem__("correct", "ウ"),
    "検算記録と選択肢の不一致(A07)": lambda A, B: F(A, "M3A07")["verify"][0].__setitem__("value", "2.5"),
    "誤答を正解と同じ値に(A14)": lambda A, B: setc(F(A, "M3A14"), "ア", "124"),
    "解説から誤答の値を削除(A49)": lambda A, B: F(A, "M3A49").__setitem__("explanation", F(A, "M3A49")["explanation"].replace("533.4", "（値）")),
    "表の値を改変(A51 5月の総費用)": lambda A, B: F(A, "M3A51")["body"][1]["rows"][1].__setitem__(2, "3,120"),
    "図の構造の改変(A28 VLAN30 にアドレス)": lambda A, B: F(A, "M3A28")["body"][1]["figure_text"].__setitem__(0, F(A, "M3A28")["body"][1]["figure_text"][0].replace("VLAN30 にはIPアドレスをもたない", "VLAN30 に 192.168.30.1/24")),
    "プログラムの改変(B02 ＞ を ≧)": lambda A, B: F(B, "M3B02")["body"][-1].__setitem__("text", F(B, "M3B02")["body"][-1]["text"].replace("minP ＞ best", "minP ≧ best")),
    "空欄の正解を誤答と入替え(B15)": lambda A, B: F(B, "M3B15").__setitem__("correct", "ア"),
    "検算記録の欠落(B13)": lambda A, B: F(B, "M3B13").__setitem__("verify", F(B, "M3B13")["verify"][:-1]),
    "受信ルールの改変(B18 (5)を SG-web に)": lambda A, B: F(B, "M3B18")["body"][5]["rows"][4].__setitem__(3, "SG-web"),
    "版の改変(B20 S2 を 2.3.3)": lambda A, B: F(B, "M3B20")["body"][4]["rows"][1].__setitem__(2, "2.3.3"),
    "コードの改行を削除(B05)": lambda A, B: [b.__setitem__("text", b["text"].replace("\n", " ")) for b in F(B, "M3B05")["body"] if b["t"] == "code"],
}
det = 0
for name, fn in MUT.items():
    A, B = copy.deepcopy(A0), copy.deepcopy(B0)
    fn(A, B)
    json.dump(A, open("/tmp/mA.json", "w"), ensure_ascii=False)
    json.dump(B, open("/tmp/mB.json", "w"), ensure_ascii=False)
    r1 = subprocess.run(["python3", "choice_consistency.py", "/tmp/mA.json", "/tmp/mB.json"], capture_output=True, text=True)
    r2 = subprocess.run(["python3", "check_r3.py", "/tmp/mA.json", "/tmp/mB.json"], capture_output=True, text=True)
    hit = r1.returncode != 0 or r2.returncode != 0
    det += hit
    why = [l for l in (r1.stdout + r2.stdout).splitlines() if l.startswith(("NG", "C"))][:2]
    print(("検出 " if hit else "見逃し ") + name + "　" + " / ".join(why))
print(f"{det}/{len(MUT)} 件を検出")
sys.exit(0 if det == len(MUT) else 1)
