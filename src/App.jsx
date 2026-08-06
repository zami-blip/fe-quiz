import React, { useState, useCallback, useEffect } from "react";

const GAS_URL = "https://script.google.com/macros/s/AKfycbw1-3SNT86OTpdm5h5WefvGMbXW1hV_37PEsE49SNEj7SIBFZ-kEPkCXZm3smmPe25P/exec";

const gas = {
  async post(data){
    try{
      const res = await fetch(GAS_URL, {
        method:"POST",
        body: JSON.stringify(data),
      });
      return res.ok ? await res.json() : {ok:false};
    }catch(e){ return {ok:false, error:String(e)}; }
  },
  async get(params){
    try{
      const qs = Object.entries(params).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join("&");
      const res = await fetch(`${GAS_URL}?${qs}`);
      return res.ok ? await res.json() : {ok:false};
    }catch(e){ return {ok:false, error:String(e)}; }
  },
};
const LS_KEY = "fe_used_ids";
const store = {
  saveIds(ids){ try{ localStorage.setItem(LS_KEY,JSON.stringify(ids)); }catch(e){} gas.post({type:"progress",usedIds:ids}); },
  loadIds(){ try{ const v=localStorage.getItem(LS_KEY); return v?JSON.parse(v):[]; }catch(e){ return []; } },
};


const CATS = [
  "すべて","基礎理論","コンピュータシステム","ネットワーク","情報セキュリティ",
  "データベース","アルゴリズム・プログラミング","ソフトウェア・HI",
  "システム開発","プロジェクトマネジメント","サービスマネジメント・監査","経営・戦略・法務",
];

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "ビット演算のAND", "q": "16進数の0xAFと0x0Fのビット論理積（AND）の結果として正しいものはどれか。", "choices": [{"label": "ア", "text": "0xAF"}, {"label": "イ", "text": "0x0F"}, {"label": "ウ", "text": "0xA0"}, {"label": "エ", "text": "0xFF"}], "correct": "イ", "hint": "0xAF=10101111、0x0F=00001111。AND=00001111=0x0F。下位4ビットのみ残る。"}, {"id": 2, "cat": "基礎理論", "topic": "符号付き整数の最大値", "q": "16ビット符号付き整数（2の補数）で表現できる最大値はどれか。", "choices": [{"label": "ア", "text": "32767"}, {"label": "イ", "text": "32768"}, {"label": "ウ", "text": "65535"}, {"label": "エ", "text": "65536"}], "correct": "ア", "hint": "16ビット符号付きは-32768〜32767。最大は2^15-1=32767。"}, {"id": 3, "cat": "基礎理論", "topic": "XORの性質", "q": "XOR演算の性質として正しいものはどれか。", "choices": [{"label": "ア", "text": "A XOR A = A"}, {"label": "イ", "text": "A XOR 0 = 0"}, {"label": "ウ", "text": "A XOR A = 0"}, {"label": "エ", "text": "A XOR 1 = A"}], "correct": "ウ", "hint": "XOR：同じ値同士は0。A XOR 0=A、A XOR 1=¬A、A XOR A=0。"}, {"id": 4, "cat": "基礎理論", "topic": "2進数の乗算", "q": "2進数の1011に2進数の10を乗じた結果として正しいものはどれか。", "choices": [{"label": "ア", "text": "10110"}, {"label": "イ", "text": "11010"}, {"label": "ウ", "text": "10100"}, {"label": "エ", "text": "11110"}], "correct": "ア", "hint": "×2は左シフト1ビット。1011→10110。10進では11×2=22=10110(2)。"}, {"id": 5, "cat": "基礎理論", "topic": "浮動小数点の誤差", "q": "0.1+0.2が0.3にならない理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "CPUの演算回路に欠陥がある"}, {"label": "イ", "text": "0.1や0.2は2進数で正確に表現できないため丸め誤差が生じる"}, {"label": "ウ", "text": "加算より減算の方が精度が高いため"}, {"label": "エ", "text": "整数演算では発生しない問題でソフトウェアのバグである"}], "correct": "イ", "hint": "0.1は2進数で無限循環小数。IEEE754では近似値を格納するため誤差が生じる。"}, {"id": 6, "cat": "基礎理論", "topic": "NOR回路の出力", "q": "NOR回路で入力A=0、B=1のとき出力はどれか。", "choices": [{"label": "ア", "text": "0"}, {"label": "イ", "text": "1"}, {"label": "ウ", "text": "不定"}, {"label": "エ", "text": "入力Aと同じ値"}], "correct": "ア", "hint": "NOR=NOT OR。OR(0,1)=1、NOT 1=0。全入力が0のときのみ出力1。"}, {"id": 7, "cat": "基礎理論", "topic": "2の補数を使う理由", "q": "コンピュータが2の補数表現を採用する主な理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "小数の表現を簡単にするため"}, {"label": "イ", "text": "加算回路だけで減算も実現できるため"}, {"label": "ウ", "text": "乗算の速度を向上させるため"}, {"label": "エ", "text": "浮動小数点演算の精度を高めるため"}], "correct": "イ", "hint": "2の補数では減算をA+(-B)の加算に変換できる。ハードウェアを単純化できる。"}, {"id": 8, "cat": "基礎理論", "topic": "8進数への変換", "q": "10進数の255を8進数で表したものはどれか。", "choices": [{"label": "ア", "text": "377"}, {"label": "イ", "text": "FF"}, {"label": "ウ", "text": "11111111"}, {"label": "エ", "text": "400"}], "correct": "ア", "hint": "255÷8=31余7、31÷8=3余7、3÷8=0余3→377(8)。2進11111111を3ビット区切りで011,111,111→377。"}, {"id": 9, "cat": "基礎理論", "topic": "論理式の吸収則", "q": "論理式 A・(A+B) を簡略化した結果として正しいものはどれか。", "choices": [{"label": "ア", "text": "A+B"}, {"label": "イ", "text": "A・B"}, {"label": "ウ", "text": "A"}, {"label": "エ", "text": "B"}], "correct": "ウ", "hint": "吸収則：A・(A+B)=A。分配してA・A+A・B=A+A・B=A(1+B)=A。"}, {"id": 10, "cat": "基礎理論", "topic": "エッジトリガFF", "q": "クロックの立ち上がりエッジでのみ入力を取り込むフリップフロップはどれか。", "choices": [{"label": "ア", "text": "SR型ラッチ"}, {"label": "イ", "text": "D型エッジトリガフリップフロップ"}, {"label": "ウ", "text": "透過型ラッチ"}, {"label": "エ", "text": "RS型ラッチ"}], "correct": "イ", "hint": "エッジトリガFF（D-FF）はクロック立ち上がり/立ち下がりでのみサンプリング。ラッチはレベル（High期間中）で動作。"}, {"id": 11, "cat": "基礎理論", "topic": "集合演算", "q": "集合U={1,2,3,4,5,6}でA={1,2,3}、B={2,3,4}のときAの補集合∩Bの結果はどれか。", "choices": [{"label": "ア", "text": "{1,2,3,4}"}, {"label": "イ", "text": "{4}"}, {"label": "ウ", "text": "{5,6}"}, {"label": "エ", "text": "{2,3}"}], "correct": "イ", "hint": "Aの補集合={4,5,6}。補集合∩B={4,5,6}∩{2,3,4}={4}。"}, {"id": 12, "cat": "基礎理論", "topic": "命題の逆", "q": "命題「素数ならば奇数である」の逆として正しいものはどれか。", "choices": [{"label": "ア", "text": "奇数でなければ素数でない"}, {"label": "イ", "text": "素数でなければ奇数でない"}, {"label": "ウ", "text": "奇数ならば素数である"}, {"label": "エ", "text": "素数でなければ奇数である"}], "correct": "ウ", "hint": "逆はP→QをQ→Pに入れ替え。「奇数ならば素数」。（逆は必ずしも真でない：2は偶数の素数）"}, {"id": 13, "cat": "基礎理論", "topic": "情報量の計算", "q": "4種類の記号を等確率で送信するとき1記号の情報量は何ビットか。", "choices": [{"label": "ア", "text": "1ビット"}, {"label": "イ", "text": "2ビット"}, {"label": "ウ", "text": "4ビット"}, {"label": "エ", "text": "8ビット"}], "correct": "イ", "hint": "情報量=log₂(1/P)=log₂(4)=2ビット。4種類の識別に2ビット必要。"}, {"id": 14, "cat": "基礎理論", "topic": "有限状態機械の構成要素", "q": "有限状態機械（FSM）の構成要素として含まれないものはどれか。", "choices": [{"label": "ア", "text": "状態の有限集合"}, {"label": "イ", "text": "入力アルファベット"}, {"label": "ウ", "text": "遷移関数"}, {"label": "エ", "text": "無限長のメモリテープ"}], "correct": "エ", "hint": "FSMは有限個の状態・入力・遷移・初期状態・受理状態で構成。無限テープはチューリング機械の要素。"}, {"id": 15, "cat": "基礎理論", "topic": "アルゴリズムの停止性", "q": "アルゴリズムの「停止性」の説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "任意の入力に対して有限ステップで必ず終了する性質"}, {"label": "イ", "text": "常に正しい出力を返す正確性の性質"}, {"label": "ウ", "text": "実行時間が短い効率性の性質"}, {"label": "エ", "text": "メモリ使用量が最小の省メモリ性質"}], "correct": "ア", "hint": "アルゴリズムの条件：有限性（停止性）・確定性・正確性。停止しないアルゴリズムは実用的でない。"}, {"id": 16, "cat": "基礎理論", "topic": "全加算器", "q": "全加算器の説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "2入力の和だけを出力し桁上がりは無視する"}, {"label": "イ", "text": "2入力と下位からの桁上がりを加算し和と上位への桁上がりを出力する"}, {"label": "ウ", "text": "半加算器2つを並列接続したものと完全に同じ回路"}, {"label": "エ", "text": "符号付き整数の加算だけに使える専用回路"}], "correct": "イ", "hint": "全加算器はA・B・Cinの3入力からSumとCoutを出力。半加算器にCarry入力を追加したもの。"}, {"id": 17, "cat": "基礎理論", "topic": "再帰の計算", "q": "f(0)=1、f(n)=n×f(n-1)のとき、f(5)の値はどれか。", "choices": [{"label": "ア", "text": "5"}, {"label": "イ", "text": "25"}, {"label": "ウ", "text": "120"}, {"label": "エ", "text": "24"}], "correct": "ウ", "hint": "f(5)=5×4×3×2×1×1=120。5の階乗。"}, {"id": 18, "cat": "基礎理論", "topic": "木の性質", "q": "n頂点の連結な木（閉路なし）の辺の数として正しいものはどれか。", "choices": [{"label": "ア", "text": "n"}, {"label": "イ", "text": "n-1"}, {"label": "ウ", "text": "n+1"}, {"label": "エ", "text": "n×2"}], "correct": "イ", "hint": "木の性質：n頂点でn-1辺。5頂点の木は4辺。連結・閉路なしの3条件のうち2つを満たせば自動的に3つ目も成立。"}, {"id": 19, "cat": "基礎理論", "topic": "確率の加法定理", "q": "P(A)=0.3、P(B)=0.4、P(A∩B)=0.1のとき、P(A∪B)はどれか。", "choices": [{"label": "ア", "text": "0.5"}, {"label": "イ", "text": "0.6"}, {"label": "ウ", "text": "0.7"}, {"label": "エ", "text": "0.12"}], "correct": "イ", "hint": "P(A∪B)=P(A)+P(B)-P(A∩B)=0.3+0.4-0.1=0.6。"}, {"id": 20, "cat": "基礎理論", "topic": "ハミング符号の原理", "q": "ハミング符号が1ビットの誤りを訂正できる理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "データを2重に送信して比較するから"}, {"label": "イ", "text": "複数のパリティビットの組み合わせで誤りビットの位置を特定できるから"}, {"label": "ウ", "text": "パリティビットを2つ付けて冗長性を持つから"}, {"label": "エ", "text": "CRCを組み合わせて使うから"}], "correct": "イ", "hint": "ハミング符号：r個のパリティビットで2^r-1個の位置を2進数で表現。誤りビットの番号を特定して訂正。"}, {"id": 21, "cat": "基礎理論", "topic": "ビット数と状態数", "q": "4ビットで表現できる状態数として正しいものはどれか。", "choices": [{"label": "ア", "text": "4"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "16"}, {"label": "エ", "text": "32"}], "correct": "ウ", "hint": "nビットで2^n通り。4ビットは2^4=16通り（0000〜1111）。"}, {"id": 22, "cat": "基礎理論", "topic": "2進数の減算", "q": "2進数1010から0011を引いた結果として正しいものはどれか。", "choices": [{"label": "ア", "text": "0110"}, {"label": "イ", "text": "0111"}, {"label": "ウ", "text": "1000"}, {"label": "エ", "text": "0101"}], "correct": "イ", "hint": "10進では10-3=7。7を2進数で表すと0111。"}, {"id": 23, "cat": "基礎理論", "topic": "論理関数の同値", "q": "真理値表でA=B→1、A≠B→0となる論理関数はどれか。", "choices": [{"label": "ア", "text": "A XOR B"}, {"label": "イ", "text": "A XNOR B（同値回路）"}, {"label": "ウ", "text": "A AND B"}, {"label": "エ", "text": "A OR B"}], "correct": "イ", "hint": "XNORは一致検出回路。A=Bのとき1、異なるとき0。XORの反転。"}, {"id": 24, "cat": "基礎理論", "topic": "分割統治法", "q": "分割統治法の説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "各ステップで局所最適な選択をして全体解を構築する"}, {"label": "イ", "text": "部分問題の解をメモして再利用する動的計画法"}, {"label": "ウ", "text": "問題を同種の小問題に分割し再帰的に解いて統合する"}, {"label": "エ", "text": "全ての候補を列挙して最良解を選ぶ全列挙法"}], "correct": "ウ", "hint": "分割統治：マージソート・クイックソート・二分探索が代表例。分割→再帰的解決→統合の3ステップ。"}, {"id": 25, "cat": "基礎理論", "topic": "UTF-8のバイト数", "q": "UTF-8で一般的な日本語漢字1文字を表現するのに必要なバイト数として正しいものはどれか。", "choices": [{"label": "ア", "text": "1バイト"}, {"label": "イ", "text": "2バイト"}, {"label": "ウ", "text": "3バイト"}, {"label": "エ", "text": "4バイト"}], "correct": "ウ", "hint": "UTF-8：ASCII(U+0000〜U+007F)は1バイト。ひらがな・カタカナ・漢字(U+0800〜U+FFFF)は3バイト。"}, {"id": 26, "cat": "基礎理論", "topic": "線形探索の計算量", "q": "サイズnの配列の線形探索における最悪計算量として正しいものはどれか。", "choices": [{"label": "ア", "text": "O(1)"}, {"label": "イ", "text": "O(log n)"}, {"label": "ウ", "text": "O(n)"}, {"label": "エ", "text": "O(n²)"}], "correct": "ウ", "hint": "線形探索は最悪で全n要素を確認する。O(n)。最良（先頭）はO(1)、平均はO(n/2)=O(n)。"}, {"id": 27, "cat": "基礎理論", "topic": "完全2分木の節点数", "q": "深さ3の完全2分木（ルートの深さ=0）の節点数として正しいものはどれか。", "choices": [{"label": "ア", "text": "7"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "15"}, {"label": "エ", "text": "16"}], "correct": "ウ", "hint": "深さdの完全2分木の節点数=2^(d+1)-1。深さ3なら2^4-1=15節点。葉は8個（深さ3の段）。"}, {"id": 28, "cat": "基礎理論", "topic": "グレイコード変換", "q": "2進数0110をグレイコードに変換した結果として正しいものはどれか。", "choices": [{"label": "ア", "text": "0110"}, {"label": "イ", "text": "0101"}, {"label": "ウ", "text": "1001"}, {"label": "エ", "text": "0100"}], "correct": "イ", "hint": "変換：MSBはそのまま。以降はB[i] XOR B[i-1]。0110→0,(0 XOR 1),(1 XOR 1),(1 XOR 0)=0,1,0,1→0101。"}, {"id": 29, "cat": "基礎理論", "topic": "スタックとキューの違い", "q": "スタックにA,B,Cの順でpushし2回popしたとき取り出される順序として正しいものはどれか。", "choices": [{"label": "ア", "text": "A,B"}, {"label": "イ", "text": "C,B"}, {"label": "ウ", "text": "B,C"}, {"label": "エ", "text": "A,C"}], "correct": "イ", "hint": "スタックはLIFO。push順A,B,C→pop1回目:C、pop2回目:B。取り出し順はC,B。"}, {"id": 30, "cat": "基礎理論", "topic": "暗号ハッシュの性質", "q": "暗号学的ハッシュ関数の性質として正しいものはどれか。", "choices": [{"label": "ア", "text": "同じハッシュ値から元のデータを簡単に復元できる"}, {"label": "イ", "text": "異なる入力から同じハッシュ値が出ることは絶対にない"}, {"label": "ウ", "text": "一方向性があり出力から入力を求めることが計算上困難"}, {"label": "エ", "text": "ハッシュ値の長さは入力データの長さに比例する"}], "correct": "ウ", "hint": "一方向性・衝突困難性・雪崩効果が3大性質。衝突は理論上ゼロではないが計算上困難。出力は固定長。"}, {"id": 31, "cat": "基礎理論", "topic": "チョムスキー階層", "q": "文脈自由言語を認識するオートマトンとして正しいものはどれか。", "choices": [{"label": "ア", "text": "有限オートマトン（FA）"}, {"label": "イ", "text": "プッシュダウンオートマトン（PDA）"}, {"label": "ウ", "text": "チューリング機械（TM）"}, {"label": "エ", "text": "線形有界オートマトン（LBA）"}], "correct": "イ", "hint": "正規言語→FA、文脈自由言語→PDA、文脈依存言語→LBA、再帰可算言語→TM。プログラム言語の構文はCFL。"}, {"id": 32, "cat": "基礎理論", "topic": "期待値", "q": "サイコロ1個を振ったとき出る目の期待値として正しいものはどれか。", "choices": [{"label": "ア", "text": "3"}, {"label": "イ", "text": "3.5"}, {"label": "ウ", "text": "4"}, {"label": "エ", "text": "2.5"}], "correct": "イ", "hint": "E=(1+2+3+4+5+6)÷6=21÷6=3.5。"}, {"id": 33, "cat": "基礎理論", "topic": "ビッグエンディアン", "q": "ビッグエンディアンの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "最下位バイト(LSB)をメモリの低いアドレスに格納する方式"}, {"label": "イ", "text": "最上位バイト(MSB)をメモリの低いアドレスに格納する方式"}, {"label": "ウ", "text": "ビット単位で逆順に格納する方式"}, {"label": "エ", "text": "ネットワーク通信では使われない方式"}], "correct": "イ", "hint": "ビッグエンディアン：上位バイトが低アドレス。ネットワークバイト順はビッグエンディアン。x86はリトルエンディアン。"}, {"id": 34, "cat": "基礎理論", "topic": "正規言語", "q": "有限オートマトンが認識できる言語クラスとして正しいものはどれか。", "choices": [{"label": "ア", "text": "文脈自由言語"}, {"label": "イ", "text": "正規言語"}, {"label": "ウ", "text": "文脈依存言語"}, {"label": "エ", "text": "再帰可算言語"}], "correct": "イ", "hint": "FA（有限オートマトン）は正規言語を認識。正規表現と等価。プログラム言語の構文はより強力なPDAが必要。"}, {"id": 35, "cat": "基礎理論", "topic": "バイナリサーチの計算量", "q": "ソート済み配列に対する二分探索の計算量として正しいものはどれか。", "choices": [{"label": "ア", "text": "O(1)"}, {"label": "イ", "text": "O(log n)"}, {"label": "ウ", "text": "O(n)"}, {"label": "エ", "text": "O(n log n)"}], "correct": "イ", "hint": "二分探索は毎回範囲を半分にする。n→n/2→n/4→…→1でlog₂n回比較。O(log n)。"}, {"id": 36, "cat": "基礎理論", "topic": "マージソートの計算量", "q": "マージソートの計算量として正しいものはどれか。", "choices": [{"label": "ア", "text": "最悪O(n²)で平均O(n log n)"}, {"label": "イ", "text": "常にO(n log n)で安定ソート"}, {"label": "ウ", "text": "常にO(n)で最速のソートアルゴリズム"}, {"label": "エ", "text": "O(log n)でin-placeソート"}], "correct": "イ", "hint": "マージソートは常にO(n log n)。安定ソートだが追加メモリO(n)が必要。クイックソートは平均O(n log n)・最悪O(n²)。"}, {"id": 37, "cat": "基礎理論", "topic": "P対NP問題", "q": "NP完全問題の説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "多項式時間で解くことができる問題"}, {"label": "イ", "text": "解は検証が多項式時間でできるがNP内で最も難しい問題クラス"}, {"label": "ウ", "text": "量子コンピュータがあれば多項式時間で解ける問題"}, {"label": "エ", "text": "解くことが数学的に証明されている不可能な問題"}], "correct": "イ", "hint": "NP完全：NP問題かつNP困難。巡回セールスマン・充足可能性問題など。P=NPか否かは未解決の問題。"}, {"id": 38, "cat": "コンピュータシステム", "topic": "パイプライン処理", "q": "4段パイプラインで10命令を処理するのに必要なクロック数として正しいものはどれか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "13"}, {"label": "ウ", "text": "40"}, {"label": "エ", "text": "4"}], "correct": "イ", "hint": "パイプラインはk段でn命令の処理=(k-1)+n クロック。4段・10命令=3+10=13クロック。"}, {"id": 39, "cat": "コンピュータシステム", "topic": "キャッシュの階層", "q": "L1キャッシュとL2キャッシュの関係として正しいものはどれか。", "choices": [{"label": "ア", "text": "L1の方がL2より大容量で低速"}, {"label": "イ", "text": "L1の方がL2より小容量で高速、CPUコアに近い"}, {"label": "ウ", "text": "L1とL2は同じ速度で容量が違うだけ"}, {"label": "エ", "text": "L2はL1のデータを暗号化して保存する"}], "correct": "イ", "hint": "L1はコア内・高速・小容量。L2はコア外・やや低速・大容量。L3はさらに大容量でコア間共有。"}, {"id": 40, "cat": "コンピュータシステム", "topic": "ページフォールト", "q": "ページフォールト発生時にOSが行う処理として正しいものはどれか。", "choices": [{"label": "ア", "text": "プログラムを強制終了してエラーを報告する"}, {"label": "イ", "text": "補助記憶から該当ページを主記憶に読み込んで実行を再開する"}, {"label": "ウ", "text": "CPUのクロック周波数を下げて処理を継続する"}, {"label": "エ", "text": "他プロセスのメモリを借用して処理を継続する"}], "correct": "イ", "hint": "ページフォールト：アクセスしたページが主記憶にない状態。OSがスワップ領域からロードする。"}, {"id": 41, "cat": "コンピュータシステム", "topic": "プロセスの状態遷移", "q": "プロセスの状態遷移で「実行状態→待機状態」への遷移が起きる場面はどれか。", "choices": [{"label": "ア", "text": "タイムスライスが切れたとき"}, {"label": "イ", "text": "I/O完了の割り込みが届いたとき"}, {"label": "ウ", "text": "I/O要求でプロセスが自発的にブロックされたとき"}, {"label": "エ", "text": "優先度の高いプロセスが起動したとき"}], "correct": "ウ", "hint": "実行→待機：I/O待ちなど自発ブロック。実行→準備：タイムスライス切れ。待機→準備：I/O完了。"}, {"id": 42, "cat": "コンピュータシステム", "topic": "フラッシュメモリ", "q": "フラッシュメモリの特徴として正しいものはどれか。", "choices": [{"label": "ア", "text": "電源を切るとデータが消える揮発性メモリ"}, {"label": "イ", "text": "電気的に書き換え可能な不揮発性メモリでブロック単位で消去する"}, {"label": "ウ", "text": "製造時にデータが書き込まれる読み出し専用メモリ"}, {"label": "エ", "text": "磁気でデータを記録するメモリ"}], "correct": "イ", "hint": "フラッシュメモリはNAND型とNOR型がある。SSD・USBメモリ・SDカードに使用。ブロック消去単位が特徴。"}, {"id": 43, "cat": "コンピュータシステム", "topic": "RAID5", "q": "RAID5の特徴として正しいものはどれか。", "choices": [{"label": "ア", "text": "2台のディスクに同じデータを書き込むミラーリング"}, {"label": "イ", "text": "ストライピングのみで冗長性はない高速方式"}, {"label": "ウ", "text": "データとパリティを複数ディスクに分散し1台故障から復旧できる"}, {"label": "エ", "text": "3台以上の同時故障に耐えられる高冗長方式"}], "correct": "ウ", "hint": "RAID5は最低3台。パリティを分散配置し1台故障時は他のデータ+パリティで再構築可能。"}, {"id": 44, "cat": "コンピュータシステム", "topic": "コンテナとVM", "q": "コンテナ型仮想化がハイパーバイザ型より軽量な理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "コンテナはOSカーネルをホストと共有するため独立したゲストOSが不要"}, {"label": "イ", "text": "コンテナはハードウェアをエミュレートするため処理が速い"}, {"label": "ウ", "text": "コンテナはメモリを圧縮して使用量を削減するため"}, {"label": "エ", "text": "コンテナはGPUを使って高速化しているため"}], "correct": "ア", "hint": "コンテナはカーネル共有でゲストOS不要。VMはゲストOS含む完全な仮想コンピュータを動かす。"}, {"id": 45, "cat": "コンピュータシステム", "topic": "スーパースカラ", "q": "スーパースカラプロセッサの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "1クロックで1命令を順番に実行するプロセッサ"}, {"label": "イ", "text": "複数の実行ユニットで1クロックに複数命令を並列実行できるプロセッサ"}, {"label": "ウ", "text": "クロック周波数を動的に変化させるプロセッサ"}, {"label": "エ", "text": "命令セットが少ないRISCプロセッサの別名"}], "correct": "イ", "hint": "スーパースカラは命令レベル並列性（ILP）を実現。現代のCPUはほぼ全てスーパースカラ設計。"}, {"id": 46, "cat": "コンピュータシステム", "topic": "DMAと割り込み", "q": "DMA転送完了をCPUに通知する方法として正しいものはどれか。", "choices": [{"label": "ア", "text": "CPUがDMAコントローラを定期的にポーリングして確認する"}, {"label": "イ", "text": "DMAコントローラが転送完了後に割り込みを発生させてCPUに通知する"}, {"label": "ウ", "text": "転送中はCPUが停止して完了を待つ"}, {"label": "エ", "text": "専用シリアル回線でCPUに通知する"}], "correct": "イ", "hint": "DMAはデータ転送をCPUの代わりに実行。完了時に割り込みでCPUに通知。CPUは転送中に他の処理が可能。"}, {"id": 47, "cat": "コンピュータシステム", "topic": "ジャーナリングFS", "q": "ジャーナリングファイルシステムの目的として正しいものはどれか。", "choices": [{"label": "ア", "text": "ファイルの圧縮効率を高めるため"}, {"label": "イ", "text": "ファイルアクセス速度を最大化するため"}, {"label": "ウ", "text": "システムクラッシュ後にファイルシステムの整合性を素早く回復するため"}, {"label": "エ", "text": "ファイルの暗号化を自動化するため"}], "correct": "ウ", "hint": "ジャーナルに変更を先書きすることでクラッシュ時に未完了操作をロールバック/ロールフォワードできる。"}, {"id": 48, "cat": "コンピュータシステム", "topic": "メモリ階層の速度順", "q": "レジスタ・L1・L2・主記憶・補助記憶を速い順に並べたものとして正しいものはどれか。", "choices": [{"label": "ア", "text": "補助記憶>主記憶>L2>L1>レジスタ"}, {"label": "イ", "text": "レジスタ>L1>L2>主記憶>補助記憶"}, {"label": "ウ", "text": "L1>レジスタ>主記憶>L2>補助記憶"}, {"label": "エ", "text": "主記憶>L2>L1>レジスタ>補助記憶"}], "correct": "イ", "hint": "速い順：レジスタ(ps)>L1(ns)>L2(ns)>主記憶(ns〜μs)>補助記憶(ms)。速いほど小容量・高価。"}, {"id": 49, "cat": "コンピュータシステム", "topic": "メモリ保護", "q": "OSのメモリ保護機能の目的として正しいものはどれか。", "choices": [{"label": "ア", "text": "メモリの消費電力を削減するため"}, {"label": "イ", "text": "あるプロセスが他プロセスやOSのメモリ領域を不正に読み書きするのを防ぐため"}, {"label": "ウ", "text": "メモリの動作速度を向上させるため"}, {"label": "エ", "text": "メモリを圧縮して使用量を削減するため"}], "correct": "イ", "hint": "メモリ保護はプロセス間隔離とOSカーネルの保護に不可欠。違反するとセグメンテーションフォルトが発生。"}, {"id": 50, "cat": "コンピュータシステム", "topic": "ブート順序", "q": "電源投入からOSが起動するまでの順序として正しいものはどれか。", "choices": [{"label": "ア", "text": "OS→BIOS/UEFI→ブートローダ→POST"}, {"label": "イ", "text": "POST→BIOS/UEFI→ブートローダ→OS"}, {"label": "ウ", "text": "BIOS/UEFI→POST→OS→ブートローダ"}, {"label": "エ", "text": "ブートローダ→POST→BIOS/UEFI→OS"}], "correct": "イ", "hint": "電源ON→POST（ハードウェアチェック）→BIOS/UEFI→ブートローダ（GRUB等）→OSカーネル起動の順。"}, {"id": 51, "cat": "コンピュータシステム", "topic": "直列稼働率", "q": "稼働率0.9の装置3台を直列接続した場合の稼働率として正しいものはどれか。", "choices": [{"label": "ア", "text": "0.9"}, {"label": "イ", "text": "0.81"}, {"label": "ウ", "text": "0.729"}, {"label": "エ", "text": "0.999"}], "correct": "ウ", "hint": "直列稼働率=各稼働率の積。0.9×0.9×0.9=0.729。直列は弱い方に引っ張られる。"}, {"id": 52, "cat": "コンピュータシステム", "topic": "並列稼働率", "q": "稼働率0.8の装置2台を並列接続した場合の稼働率として正しいものはどれか。", "choices": [{"label": "ア", "text": "0.8"}, {"label": "イ", "text": "0.64"}, {"label": "ウ", "text": "0.96"}, {"label": "エ", "text": "1.6"}], "correct": "ウ", "hint": "並列稼働率=1-(1-0.8)²=1-0.04=0.96。2台とも壊れる確率(0.2×0.2=0.04)の余事象。"}, {"id": 53, "cat": "コンピュータシステム", "topic": "MMUの役割", "q": "MMU（メモリ管理ユニット）の役割として正しいものはどれか。", "choices": [{"label": "ア", "text": "メモリの電圧を制御してデータを安定させる"}, {"label": "イ", "text": "CPUが発行する論理アドレスを物理アドレスに変換する"}, {"label": "ウ", "text": "メモリのデータを圧縮して容量を節約する"}, {"label": "エ", "text": "DMA転送のアドレスを管理する"}], "correct": "イ", "hint": "MMUはCPUとメモリの間で仮想→物理アドレス変換・メモリ保護・キャッシュ制御を担う。TLBを持つ。"}, {"id": 54, "cat": "コンピュータシステム", "topic": "ハイブリッドクラウド", "q": "ハイブリッドクラウドの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "複数のパブリッククラウドを組み合わせて使うマルチクラウド"}, {"label": "イ", "text": "自社専用のプライベートクラウドだけを使う構成"}, {"label": "ウ", "text": "プライベートクラウドとパブリッククラウドを組み合わせて使う構成"}, {"label": "エ", "text": "複数企業が共同利用するコミュニティクラウド"}], "correct": "ウ", "hint": "ハイブリッド：機密データはプライベート、バースト処理はパブリックに柔軟に分けられる。"}, {"id": 55, "cat": "コンピュータシステム", "topic": "世代別GC", "q": "世代別GCで若い世代を頻繁に回収する理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "若いオブジェクトはサイズが小さいから"}, {"label": "イ", "text": "多くのオブジェクトは生成後すぐに不要になるという弱い世代仮説に基づくから"}, {"label": "ウ", "text": "若い世代は高速なSRAMに配置されているから"}, {"label": "エ", "text": "GCの規格で決められているから"}], "correct": "イ", "hint": "弱い世代仮説：ほとんどのオブジェクトは短命。Minor GCで若い世代を頻繁に回収し効率化。"}, {"id": 56, "cat": "コンピュータシステム", "topic": "ECCメモリ", "q": "ECCメモリの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "通常DRAMより高速に動作するメモリ"}, {"label": "イ", "text": "ビット化けを自動検出・訂正できる信頼性の高いメモリ"}, {"label": "ウ", "text": "暗号化機能を内蔵したセキュリティ専用メモリ"}, {"label": "エ", "text": "消費電力を削減した省エネ設計のメモリ"}], "correct": "イ", "hint": "ECCはサーバ・ワークステーション用。ハミング符号原理で1ビット誤り訂正・2ビット誤り検出が可能。"}, {"id": 57, "cat": "コンピュータシステム", "topic": "ライブマイグレーション", "q": "仮想マシンのライブマイグレーションの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "VMを停止してから別ホストにコピーする方法"}, {"label": "イ", "text": "VMの実行を止めずに別の物理ホストに移動する技術"}, {"label": "ウ", "text": "VMのスナップショットをクラウドにバックアップする技術"}, {"label": "エ", "text": "複数のVMを1台に統合するコンソリデーション技術"}], "correct": "イ", "hint": "ライブマイグレーションはサービス停止なしにVMを移動。ハードウェアメンテナンスや負荷分散に使用。"}, {"id": 58, "cat": "コンピュータシステム", "topic": "プロセス間通信", "q": "Unixのパイプ（|）を使ったプロセス間通信の説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "ネットワーク越しにデータをやり取りする"}, {"label": "イ", "text": "あるプロセスの標準出力を別プロセスの標準入力に接続する"}, {"label": "ウ", "text": "共有メモリを使って大量データを高速転送する"}, {"label": "エ", "text": "メッセージに優先度を付けてやり取りする"}], "correct": "イ", "hint": "パイプはUnixの基本機能。ls | grep .txt のように前プロセスの出力を次の入力にチェーンする。"}, {"id": 59, "cat": "コンピュータシステム", "topic": "キャッシュコヒーレンシ", "q": "マルチコアCPUでキャッシュコヒーレンシ（一貫性）が必要な理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "各コアのキャッシュが独立しているため同一データの値が異なる可能性があるから"}, {"label": "イ", "text": "キャッシュのアクセス速度を均一にするため"}, {"label": "ウ", "text": "キャッシュの容量を最大化するため"}, {"label": "エ", "text": "電力消費を削減するため"}], "correct": "ア", "hint": "コア1がデータを更新しても他コアのキャッシュに古い値が残る可能性。MESIプロトコルなどで解決。"}, {"id": 60, "cat": "コンピュータシステム", "topic": "PUE", "q": "PUE（Power Usage Effectiveness）の計算式として正しいものはどれか。", "choices": [{"label": "ア", "text": "データセンター全消費電力÷IT機器消費電力（理想値は1.0）"}, {"label": "イ", "text": "IT機器消費電力÷データセンター全消費電力（理想値は1.0）"}, {"label": "ウ", "text": "サーバのCPU使用率の平均値"}, {"label": "エ", "text": "冷却装置の熱効率を表す指標"}], "correct": "ア", "hint": "PUE=総消費電力/IT消費電力。理想は1.0（冷却等ゼロ）。Google等は1.1前後。低いほど省エネ。"}, {"id": 61, "cat": "コンピュータシステム", "topic": "割り込みの種類", "q": "マスカブル割り込みとノンマスカブル割り込みの違いとして正しいものはどれか。", "choices": [{"label": "ア", "text": "マスカブルはソフトウェアで禁止可能だがノンマスカブルは禁止できない"}, {"label": "イ", "text": "マスカブルはハードウェアからノンマスカブルはソフトウェアから発生する"}, {"label": "ウ", "text": "マスカブルは優先度が高くノンマスカブルは優先度が低い"}, {"label": "エ", "text": "両者は同義で区別なく使われる"}], "correct": "ア", "hint": "NMI（ノンマスカブル）は電源異常など緊急時に常に受け付ける。通常割り込みはCPUフラグでマスク可能。"}, {"id": 62, "cat": "コンピュータシステム", "topic": "フォルトトレランス", "q": "シングルポイントオブフェイラー（SPOF）を排除する目的として正しいものはどれか。", "choices": [{"label": "ア", "text": "処理速度を向上させるため"}, {"label": "イ", "text": "1か所の故障でシステム全体が停止しないよう可用性を高めるため"}, {"label": "ウ", "text": "セキュリティを強化するため"}, {"label": "エ", "text": "コストを削減するため"}], "correct": "イ", "hint": "SPOF排除＝冗長化。電源・ネットワーク・サーバを二重化して単一障害点をなくす高可用性設計。"}, {"id": 63, "cat": "コンピュータシステム", "topic": "Webサーバのアーキテクチャ", "q": "イベント駆動型WebサーバがスレッドベースのWebサーバより多くの同時接続を処理できる主な理由はどれか。", "choices": [{"label": "ア", "text": "イベント駆動型はCPUが高速だから"}, {"label": "イ", "text": "I/O待ちを非同期で処理するため少ないスレッドで多数の接続を扱えるから"}, {"label": "ウ", "text": "イベント駆動型はデータを圧縮しないから"}, {"label": "エ", "text": "イベント駆動型はHTTP/2専用に設計されているから"}], "correct": "イ", "hint": "スレッドベースはスレッドごとにメモリを消費。イベントループで非同期I/Oを処理し1スレッドで多数管理。"}, {"id": 64, "cat": "コンピュータシステム", "topic": "スワッピング", "q": "スワッピング（プロセス単位の仮想記憶）とページングの違いとして正しいものはどれか。", "choices": [{"label": "ア", "text": "スワッピングはプロセス全体を補助記憶に退避、ページングは固定長ページ単位で退避"}, {"label": "イ", "text": "スワッピングはページング専用ハードウェアが必要、ページングはソフトウェアだけで実現"}, {"label": "ウ", "text": "両者は同じ技術で名称が違うだけ"}, {"label": "エ", "text": "ページングはスワッピングより古い技術"}], "correct": "ア", "hint": "スワッピング：プロセス全体を丸ごと退避（粗い粒度）。ページング：ページ単位で部分退避（細かい粒度）。"}, {"id": 65, "cat": "コンピュータシステム", "topic": "TLB", "q": "TLB（Translation Lookaside Buffer）の説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "ディスクのアクセス速度を改善するキャッシュ"}, {"label": "イ", "text": "仮想アドレスから物理アドレスへの変換結果をキャッシュする高速バッファ"}, {"label": "ウ", "text": "ネットワークパケットを一時格納するバッファ"}, {"label": "エ", "text": "CPUの命令をデコードするバッファ"}], "correct": "イ", "hint": "TLBはMMU内のキャッシュ。ページテーブルへのアクセスを省略して仮想→物理アドレス変換を高速化する。"}, {"id": 66, "cat": "コンピュータシステム", "topic": "組み込みシステム", "q": "リアルタイムOSが組み込みシステムに使われる理由として正しいものはどれか。", "choices": [{"label": "ア", "text": "汎用OSより安価だから"}, {"label": "イ", "text": "処理の応答時間を厳密に保証できるため安全性・信頼性が必要な機器に適するから"}, {"label": "ウ", "text": "グラフィカルなUIが使えるから"}, {"label": "エ", "text": "インターネットに接続できるから"}], "correct": "イ", "hint": "RTOS（VxWorks・FreeRTOS等）は決定論的スケジューリングで応答時間を保証。自動車・医療機器・航空宇宙に使用。"}, {"id": 67, "cat": "ネットワーク", "topic": "TCPのフロー制御", "q": "TCPのスライディングウィンドウが実現する機能として正しいものはどれか。", "choices": [{"label": "ア", "text": "パケットの暗号化"}, {"label": "イ", "text": "受信側バッファあふれを防ぐフロー制御"}, {"label": "ウ", "text": "ネットワーク全体の輻輳検出"}, {"label": "エ", "text": "パケットの到達順序保証"}], "correct": "イ", "hint": "ウィンドウサイズ（受信バッファ空き量）を送信側に通知してフロー制御。バッファあふれを防ぐ。"}, {"id": 68, "cat": "ネットワーク", "topic": "DNSの階層", "q": "DNS問い合わせでルートDNSサーバが返す情報として正しいものはどれか。", "choices": [{"label": "ア", "text": "全てのドメインのIPアドレスを直接返す"}, {"label": "イ", "text": "TLDネームサーバ（.comや.jpを管理するサーバ）のアドレスを返す"}, {"label": "ウ", "text": "IPアドレスをMACアドレスに変換して返す"}, {"label": "エ", "text": "メールサーバのIPアドレスを返す"}], "correct": "イ", "hint": "DNS解決：リゾルバ→ルートサーバ（TLD情報）→TLDサーバ（権威DNSアドレス）→権威DNS（IPアドレス）。"}, {"id": 69, "cat": "ネットワーク", "topic": "サブネット計算", "q": "192.168.10.0/28のネットワークで使用可能なホスト数として正しいものはどれか。", "choices": [{"label": "ア", "text": "14"}, {"label": "イ", "text": "16"}, {"label": "ウ", "text": "30"}, {"label": "エ", "text": "254"}], "correct": "ア", "hint": "/28はホスト部4ビット。2^4=16。ネットワークアドレスとブロードキャストを除く14がホスト数。"}, {"id": 70, "cat": "ネットワーク", "topic": "ARPの動作", "q": "ARPの動作として正しいものはどれか。", "choices": [{"label": "ア", "text": "ユニキャストでターゲットIPに直接問い合わせる"}, {"label": "イ", "text": "ブロードキャストでARP要求を送り対象ホストがARP応答でMACを返す"}, {"label": "ウ", "text": "DNSサーバに問い合わせてMACアドレスを取得する"}, {"label": "エ", "text": "ルータ経由でMACアドレスを解決する"}], "correct": "イ", "hint": "ARP要求はブロードキャスト（FF:FF:FF:FF:FF:FF）。対象ホストだけがユニキャストで自分のMACを応答。"}, {"id": 71, "cat": "ネットワーク", "topic": "TCPのコネクション終了", "q": "TCP接続の正常終了（4ウェイ）の順序として正しいものはどれか。", "choices": [{"label": "ア", "text": "FIN→ACK→FIN→ACK"}, {"label": "イ", "text": "RST→ACK→RST→ACK"}, {"label": "ウ", "text": "SYN→SYN/ACK→FIN→ACK"}, {"label": "エ", "text": "FIN→FIN/ACK→FIN→FIN/ACK"}], "correct": "ア", "hint": "クライアントFIN→サーバACK→サーバFIN→クライアントACKの4ステップで双方向を順に終了。"}, {"id": 72, "cat": "ネットワーク", "topic": "HTTPのPUT", "q": "REST APIでリソース全体の置換に使うHTTPメソッドはどれか。", "choices": [{"label": "ア", "text": "GET"}, {"label": "イ", "text": "POST"}, {"label": "ウ", "text": "PUT"}, {"label": "エ", "text": "DELETE"}], "correct": "ウ", "hint": "GET:取得、POST:作成、PUT:全体置換（べき等）、PATCH:部分更新、DELETE:削除。PUTは同じ操作を繰り返しても同じ結果。"}, {"id": 73, "cat": "ネットワーク", "topic": "MACアドレスのOUI", "q": "MACアドレスの上位24ビット（OUI）の役割として正しいものはどれか。", "choices": [{"label": "ア", "text": "デバイスのシリアル番号を表す"}, {"label": "イ", "text": "製造元（ベンダー）をIEEEが識別するための番号"}, {"label": "ウ", "text": "IPアドレスのネットワーク部に対応する"}, {"label": "エ", "text": "通信速度を表す"}], "correct": "イ", "hint": "MACアドレス上位24bit=OUI（Organizationally Unique Identifier）。IEEEがベンダーに割り当てる。"}, {"id": 74, "cat": "ネットワーク", "topic": "静的NATと動的NAT", "q": "静的NATと動的NATの違いとして正しいものはどれか。", "choices": [{"label": "ア", "text": "静的NATはIPv6用で動的NATはIPv4用"}, {"label": "イ", "text": "静的NATはプライベートIPとグローバルIPが1対1固定、動的NATはプールから動的に割り当てる"}, {"label": "ウ", "text": "静的NATは速く動的NATは遅い"}, {"label": "エ", "text": "動的NATはNAPTの別名"}], "correct": "イ", "hint": "静的NAT：固定対応（サーバ公開向け）。動的NAT：プールから動的割り当て。NAPTはポート番号も変換。"}, {"id": 75, "cat": "ネットワーク", "topic": "HTTPS証明書の検証", "q": "ブラウザがHTTPS接続でサーバ証明書を検証する主な項目として正しいものはどれか。", "choices": [{"label": "ア", "text": "証明書のIPアドレスがURLと一致するか確認する"}, {"label": "イ", "text": "有効期限・発行CAの信頼性・ドメイン名の一致を検証する"}, {"label": "ウ", "text": "サーバに直接問い合わせて証明書の有効性を確認する"}, {"label": "エ", "text": "証明書のファイルサイズが規定値以内か確認する"}], "correct": "イ", "hint": "TLS証明書検証：①期限チェック②CAの署名検証（信頼チェーン）③CN/SANがホスト名と一致するか確認。"}, {"id": 76, "cat": "ネットワーク", "topic": "ダイナミックルーティング", "q": "スタティックルーティングとダイナミックルーティングの比較として正しいものはどれか。", "choices": [{"label": "ア", "text": "スタティックは障害時に自動で迂回経路を選択できる"}, {"label": "イ", "text": "ダイナミックはプロトコルで経路情報を自動交換・更新する"}, {"label": "ウ", "text": "スタティックは大規模ネットワークほど管理が楽になる"}, {"label": "エ", "text": "ダイナミックは常にスタティックより速い"}], "correct": "イ", "hint": "スタティック：手動設定・小規模向け。ダイナミック（OSPF・BGP）：自動収束・障害時自動迂回・大規模向け。"}, {"id": 77, "cat": "ネットワーク", "topic": "NGFW", "q": "次世代ファイアウォール（NGFW）が従来のパケットフィルタリングFWと異なる点として正しいものはどれか。", "choices": [{"label": "ア", "text": "アプリケーション・ユーザ・コンテンツを識別して制御できる"}, {"label": "イ", "text": "ハードウェア実装のため高速である"}, {"label": "ウ", "text": "IPv6のみに対応している"}, {"label": "エ", "text": "ルータの機能も内蔵している"}], "correct": "ア", "hint": "NGFWはL7アプリケーション識別・IPS・SSL検査・URLフィルタリングなどを統合した多機能FW。"}, {"id": 78, "cat": "ネットワーク", "topic": "遅延と帯域", "q": "光ファイバの帯域幅を2倍にしても改善しないものはどれか。", "choices": [{"label": "ア", "text": "大きなファイルのダウンロード完了時間"}, {"label": "イ", "text": "1秒間に転送できるデータ量"}, {"label": "ウ", "text": "東京からニューヨークへのpingの往復時間(RTT)"}, {"label": "エ", "text": "同時に扱えるストリーム数"}], "correct": "ウ", "hint": "RTTは物理的な距離と光速で決まる。帯域幅を増やしても光の速度は変わらないためRTTは改善しない。"}, {"id": 79, "cat": "ネットワーク", "topic": "ポートベースVLAN", "q": "ポートベースVLANの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "MACアドレスによってVLANを割り当てる動的VLAN"}, {"label": "イ", "text": "スイッチの物理ポートにVLANを静的に割り当てる"}, {"label": "ウ", "text": "IPアドレスによってVLANを動的に割り当てる"}, {"label": "エ", "text": "認証結果に基づいてVLANを動的に割り当てる"}], "correct": "イ", "hint": "ポートベースVLAN（静的VLAN）が最もシンプルで一般的。ポートに接続した端末が自動的に該当VLANに属する。"}, {"id": 80, "cat": "ネットワーク", "topic": "ホットスタンバイ", "q": "ネットワーク機器のホットスタンバイの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "障害時に手動で切り替える冗長構成"}, {"label": "イ", "text": "予備機が常に動作状態で障害時に自動即座に切り替わる冗長構成"}, {"label": "ウ", "text": "低負荷時にのみ予備機を起動する省電力構成"}, {"label": "エ", "text": "クラウドの自動スケーリング機能の別名"}], "correct": "イ", "hint": "ホット（即時）＞ウォーム（準備済み・切替に時間必要）＞コールド（電源OFF・切替に最も時間必要）。"}, {"id": 81, "cat": "ネットワーク", "topic": "Wireshark", "q": "Wiresharkなどのパケットキャプチャツールの主な用途として正しいものはどれか。", "choices": [{"label": "ア", "text": "ネットワーク機器の設定を自動変更する"}, {"label": "イ", "text": "ネットワーク上を流れるパケットを記録・分析してトラブル原因を特定する"}, {"label": "ウ", "text": "ファイアウォールのルールを自動生成する"}, {"label": "エ", "text": "ウイルスを検出して自動駆除する"}], "correct": "イ", "hint": "Wiresharkはネットワークアナライザ。TCPハンドシェイク確認・プロトコル解析・障害調査に使われる。"}, {"id": 82, "cat": "ネットワーク", "topic": "APIPA", "q": "IPv4アドレス169.254.0.0/16の用途として正しいものはどれか。", "choices": [{"label": "ア", "text": "ループバックアドレスとしてテストに使用する"}, {"label": "イ", "text": "マルチキャスト通信に使用する"}, {"label": "ウ", "text": "DHCPで取得できなかった場合にOSが自動設定するリンクローカルアドレス"}, {"label": "エ", "text": "インターネットで使うグローバルアドレスの一種"}], "correct": "ウ", "hint": "APIPA：DHCPサーバに繋がれないときWindowsが169.254.x.xを自動設定。同一リンク内でのみ通信可能。"}, {"id": 83, "cat": "ネットワーク", "topic": "BGPのAS_PATH", "q": "BGPのAS_PATH属性がループ防止に使われる仕組みとして正しいものはどれか。", "choices": [{"label": "ア", "text": "通信の暗号化情報を記録する"}, {"label": "イ", "text": "通過した全ASの番号を記録し自ASが含まれる経路を受け取らないことでループを防ぐ"}, {"label": "ウ", "text": "帯域幅の使用量を記録する"}, {"label": "エ", "text": "パケットのTTLを設定する"}], "correct": "イ", "hint": "BGPはAS_PATHに通過したAS番号をリストとして蓄積。自ASが含まれていれば経路ループと判断して破棄。"}, {"id": 84, "cat": "ネットワーク", "topic": "マルチキャストの用途", "q": "IPマルチキャストが適している用途として正しいものはどれか。", "choices": [{"label": "ア", "text": "特定の1台へのファイル転送"}, {"label": "イ", "text": "全ホストへのブロードキャスト通知"}, {"label": "ウ", "text": "ライブ動画配信・株式相場配信など同じデータを複数宛先に効率よく送る場合"}, {"label": "エ", "text": "1対1のビデオ通話（ユニキャスト）"}], "correct": "ウ", "hint": "マルチキャストはグループに属する複数ホストに1パケットで届く。ブロードキャストと異なり対象グループのみ受信。"}, {"id": 85, "cat": "ネットワーク", "topic": "SDNのメリット", "q": "SDNでコントロールプレーンとデータプレーンを分離する利点として正しいものはどれか。", "choices": [{"label": "ア", "text": "物理機器が不要になりコストが大幅に削減できる"}, {"label": "イ", "text": "ネットワーク全体をソフトウェアから一元制御でき柔軟な設定変更が可能になる"}, {"label": "ウ", "text": "通信速度が自動的に2倍になる"}, {"label": "エ", "text": "セキュリティが自動的に向上する"}], "correct": "イ", "hint": "SDNはOpenFlowで代表される。APIによるプログラマブルなネットワーク制御が最大のメリット。"}, {"id": 86, "cat": "ネットワーク", "topic": "イーサネット規格名", "q": "1000BASE-Tの「1000」「BASE」「T」が意味するものとして正しいものはどれか。", "choices": [{"label": "ア", "text": "1000Mbps・ベースバンド伝送・ツイストペアケーブル"}, {"label": "イ", "text": "1000MHz・ブロードバンド・同軸ケーブル"}, {"label": "ウ", "text": "1000m・ベースバンド・テスト用途"}, {"label": "エ", "text": "1000Mbps・ブロードバンド・光ファイバ"}], "correct": "ア", "hint": "IEEE 802.3命名規則：速度(Mbps)・変調方式(BASE=ベースバンド)・媒体(T=ツイストペア、F=光ファイバ)。"}, {"id": 87, "cat": "ネットワーク", "topic": "ポートフォワーディング", "q": "NATルータでポートフォワーディングを設定する目的として正しいものはどれか。", "choices": [{"label": "ア", "text": "複数端末がインターネットを共有するため"}, {"label": "イ", "text": "特定ポートへの外部からの通信を内部サーバの特定ポートに転送するため"}, {"label": "ウ", "text": "DNS名前解決を高速化するため"}, {"label": "エ", "text": "内部ネットワークの帯域幅を制御するため"}], "correct": "イ", "hint": "外部80番→内部192.168.1.10:80に転送するなど。プライベートネットワークのサーバを外部公開する際に使用。"}, {"id": 88, "cat": "ネットワーク", "topic": "pingとICMP", "q": "pingコマンドが使うICMPメッセージの種類として正しいものはどれか。", "choices": [{"label": "ア", "text": "ICMP Echo RequestとICMP Echo Reply"}, {"label": "イ", "text": "ICMP Redirect"}, {"label": "ウ", "text": "ICMP Time Exceeded"}, {"label": "エ", "text": "ICMP Destination Unreachable"}], "correct": "ア", "hint": "ping=Echo Request送信→Echo Reply受信で疎通確認。tracerouteはTTLを1から増やしてTime Exceededを収集。"}, {"id": 89, "cat": "ネットワーク", "topic": "トラフィックシェーピング", "q": "トラフィックシェーピングの説明として正しいものはどれか。", "choices": [{"label": "ア", "text": "不正パケットをブロックするセキュリティ技術"}, {"label": "イ", "text": "送信トラフィックを平滑化して帯域を超えないよう送信レートを制御する技術"}, {"label": "ウ", "text": "複数経路にトラフィックを分散する負荷分散技術"}, {"label": "エ", "text": "パケットを圧縮して転送量を削減する技術"}], "correct": "イ", "hint": "シェーピングはバッファにパケットを蓄えて一定レートで送出する。ポリシングは超過パケットを即廃棄。"}, {"id": 90, "cat": "ネットワーク", "topic": "SNMPv3のセキュリティ", "q": "SNMPv3でSNMPv1/v2cから改善された主な点として正しいものはどれか。", "choices": [{"label": "ア", "text": "監視できるMIBオブジェクト数が増えた"}, {"label": "イ", "text": "認証と暗号化によるセキュリティ機能が追加された"}, {"label": "ウ", "text": "TCPを使うようになりUDPを廃止した"}, {"label": "エ", "text": "監視間隔を1秒以下にできるようになった"}], "correct": "イ", "hint": "SNMPv1/v2cはコミュニティ名（平文）のみ。v3でUSM（認証・暗号化）とVACM（アクセス制御）を追加。"}, {"id": 91, "cat": "ネットワーク", "topic": "リング型の欠点", "q": "リング型トポロジーの欠点として正しいものはどれか。", "choices": [{"label": "ア", "text": "ハブが単一障害点になりやすい"}, {"label": "イ", "text": "1か所の断線でネットワーク全体が影響を受ける可能性がある"}, {"label": "ウ", "text": "構築コストが最も高い"}, {"label": "エ", "text": "1台のコンピュータにしか接続できない"}], "correct": "イ", "hint": "リング型：1か所断線でリングが分断するリスク。デュアルリングで冗長化することが多い。"}, {"id": 92, "cat": "ネットワーク", "topic": "TLSのセッション鍵", "q": "TLSハンドシェイクでサーバの公開鍵が使われる目的として正しいものはどれか。", "choices": [{"label": "ア", "text": "データの圧縮"}, {"label": "イ", "text": "セッション鍵（共通鍵）を安全にサーバに送るための暗号化"}, {"label": "ウ", "text": "クライアントの認証"}, {"label": "エ", "text": "TCPの3ウェイハンドシェイクの代替"}], "correct": "イ", "hint": "TLSハンドシェイク：クライアントがプリマスタシークレットをサーバ公開鍵で暗号化→サーバが秘密鍵で復号→セッション鍵を共有。"}, {"id": 93, "cat": "ネットワーク", "topic": "IGMP", "q": "IGMP（Internet Group Management Protocol）の役割として正しいものはどれか。", "choices": [{"label": "ア", "text": "マルチキャストルータ間で経路情報を交換する"}, {"label": "イ", "text": "ホストがマルチキャストグループへの参加・脱退をルータに通知する"}, {"label": "ウ", "text": "マルチキャストアドレスをMACアドレスに変換する"}, {"label": "エ", "text": "マルチキャスト通信のQoSを管理する"}], "correct": "イ", "hint": "IGMPはホストが近くのルータにグループ参加を通知するプロトコル。ルータ間はPIM等を使う。"}];

const C = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2330", border:"#30363d",
  accent:"#58a6ff", green:"#3fb950", red:"#f85149", warn:"#d29922",
  text:"#e6edf3", muted:"#8b949e",
};

const s = {
  app:{ background:C.bg, minHeight:"100vh", padding:"20px 14px", fontFamily:"'Noto Sans JP',sans-serif", color:C.text },
  container:{ maxWidth:600, margin:"0 auto" },
  header:{ textAlign:"center", marginBottom:28 },
  h1:{ fontFamily:"monospace", fontSize:13, color:C.accent, letterSpacing:".1em", textTransform:"uppercase", marginBottom:4 },
  sub:{ color:C.muted, fontSize:12 },
  card:{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20, marginBottom:14 },
  row:{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 },
  chip:(a)=>({ padding:"5px 12px", background:a?"rgba(88,166,255,.1)":C.surface, border:`1px solid ${a?C.accent:C.border}`, borderRadius:20, color:a?C.accent:C.muted, fontSize:12, cursor:"pointer", fontFamily:"inherit" }),
  btn:(color=C.accent, outline=false)=>({ padding:"10px 20px", background:outline?"none":color, border:`1px solid ${color}`, borderRadius:8, color:outline?color:"#0d1117", fontFamily:"inherit", fontWeight:700, fontSize:14, cursor:"pointer" }),
  choiceBtn:(state)=>({
    width:"100%", padding:"11px 14px",
    background:state==="correct"?"rgba(63,185,80,.1)":state==="wrong"?"rgba(248,81,73,.1)":C.surface2,
    border:`1px solid ${state==="correct"?C.green:state==="wrong"?C.red:C.border}`,
    borderRadius:8, color:state==="correct"?C.green:state==="wrong"?C.red:C.text,
    fontFamily:"inherit", fontSize:16, textAlign:"left", cursor:state?"default":"pointer",
    display:"flex", gap:10, alignItems:"flex-start", lineHeight:1.5, marginBottom:7,
  }),
  label:{ fontFamily:"monospace", fontSize:14, color:C.muted, flexShrink:0, paddingTop:1 },
  fb:(ok)=>({ marginTop:14, padding:"12px 14px", borderRadius:8, fontSize:15, lineHeight:1.7, background:ok?"rgba(63,185,80,.08)":"rgba(248,81,73,.08)", border:`1px solid ${ok?"rgba(63,185,80,.3)":"rgba(248,81,73,.3)"}`, color:ok?C.green:C.red }),
  hintBox:{ marginTop:10, padding:"10px 12px", background:"rgba(255,255,255,.03)", border:`1px solid ${C.border}`, borderRadius:6, fontSize:14, color:C.muted, lineHeight:1.6 },
  hintLabel:{ fontSize:11, fontFamily:"monospace", color:C.accent, textTransform:"uppercase", letterSpacing:".05em", marginBottom:3 },
  progress:{ height:3, background:C.border, borderRadius:2, marginBottom:16, overflow:"hidden" },
  bar:(pct)=>({ height:"100%", background:C.accent, borderRadius:2, width:`${pct}%`, transition:"width .3s" }),
  meta:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 },
  catTag:{ fontSize:11, padding:"2px 7px", background:"rgba(88,166,255,.1)", color:C.accent, borderRadius:4, fontFamily:"monospace" },
  qnum:{ fontSize:13, color:C.muted, fontFamily:"monospace", marginBottom:6 },
  qtext:{ fontSize:17, fontWeight:500, lineHeight:1.65, marginBottom:18 },
  tabs:{ display:"flex", gap:4, marginBottom:20, background:C.surface, padding:4, borderRadius:8, border:`1px solid ${C.border}` },
  tabBtn:(a)=>({ flex:1, padding:8, background:a?C.surface2:"none", border:"none", color:a?C.text:C.muted, fontFamily:"inherit", fontSize:15, borderRadius:6, cursor:"pointer", fontWeight:a?700:400 }),
  reviewItem:{ background:C.surface, border:`1px solid ${C.border}`, borderLeft:`3px solid ${C.red}`, borderRadius:8, padding:14, marginBottom:10 },
  sectionTitle:{ fontSize:11, color:C.muted, fontFamily:"monospace", textTransform:"uppercase", letterSpacing:".06em", margin:"20px 0 8px" },
  catBarRow:{ display:"flex", alignItems:"center", gap:8, marginBottom:8, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"9px 11px" },
  statBox:{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:"12px 8px", textAlign:"center", flex:1 },
  statNum:{ fontFamily:"monospace", fontSize:22, fontWeight:600, color:C.accent },
  statLabel:{ fontSize:11, color:C.muted, marginTop:2 },
  analysisBox:{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:16, fontSize:13, lineHeight:1.8, color:C.text, whiteSpace:"pre-wrap" },
  spinner:{ display:"inline-block", width:16, height:16, border:`2px solid ${C.border}`, borderTop:`2px solid ${C.accent}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", verticalAlign:"middle" },
  errBox:{ padding:"12px 14px", background:"rgba(248,81,73,.08)", border:`1px solid rgba(248,81,73,.3)`, borderRadius:8, color:C.red, fontSize:13, marginTop:12 },
  copyBox:{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:12, fontSize:12, fontFamily:"monospace", color:C.muted, lineHeight:1.7, whiteSpace:"pre-wrap", wordBreak:"break-all", marginTop:8, maxHeight:160, overflowY:"auto" },
  copyBtn:(copied)=>({ padding:"8px 16px", background:copied?"rgba(63,185,80,.15)":"none", border:`1px solid ${copied?C.green:C.border}`, borderRadius:6, color:copied?C.green:C.muted, fontFamily:"inherit", fontSize:12, cursor:"pointer", transition:"all .2s" }),
  stockBadge:(n)=>({ display:"inline-block", padding:"2px 8px", borderRadius:10, fontSize:12, fontFamily:"monospace", fontWeight:700, background:n>=20?"rgba(63,185,80,.15)":n>0?"rgba(210,153,34,.15)":"rgba(248,81,73,.15)", color:n>=20?C.green:n>0?C.warn:C.red }),
};

function rateColor(p){ return p>=80?C.green:p>=50?C.warn:C.red; }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

async function callClaude(messages, system){
  const apiKey = process.env.REACT_APP_ANTHROPIC_KEY || "";
  const headers = {"Content-Type":"application/json"};
  if(apiKey) headers["x-api-key"] = apiKey;
  const res = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST", headers,
    body:JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1000, system, messages }),
  });
  const data = await res.json();
  return data.content?.map(b=>b.text||"").join("")||"";
}

async function analyzeResults(questions, answers, catStats){
  const log = questions.map((q,i)=>`Q${i+1}[${q.cat}/${q.topic}]: ${answers[i]===q.correct?"○":"✗"}`).join("\n");
  const stats = Object.entries(catStats).map(([c,s])=>`${c}: ${Math.round(s.ok/s.total*100)}% (${s.ok}/${s.total}問)`).join("\n");
  const system = `あなたは基本情報技術者試験の学習コーチです。結果を分析し①弱点②強み・弱みの評価③次の学習ステップを250〜350字で返してください。`;
  return await callClaude([{role:"user",content:`【回答】\n${log}\n\n【累計】\n${stats}`}], system);
}

function ReviewCopyBox({ missedList, catStats }){
  const [copied, setCopied] = useState(false);

  const buildText = useCallback(()=>{
    const now = new Date();
    const ds = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const catGroup = {};
    missedList.forEach(q=>{ if(!catGroup[q.cat]) catGroup[q.cat]=[]; catGroup[q.cat].push(q); });
    const lines = [
      `📝 FE科目A 復習リスト ${ds}`,
      `間違えた問題: ${missedList.length}問`,
      `---`,
    ];
    Object.entries(catGroup).forEach(([cat, qs])=>{
      const st = catStats[cat];
      const pct = st ? Math.round(st.ok/st.total*100) : 0;
      lines.push(`\n■ ${cat}（正解率 ${pct}%）`);
      qs.forEach((q,i)=>{
        const cc = q.choices.find(c=>c.label===q.correct);
        lines.push(`Q: ${q.q}`);
        lines.push(`A: ${q.correct}. ${cc?.text}`);
        lines.push(`解説: ${q.hint}`);
        if(i < qs.length-1) lines.push("");
      });
    });
    return lines.join("\n");
  },[missedList, catStats]);

  const handleCopy = useCallback(()=>{
    const text = buildText();
    navigator.clipboard.writeText(text).then(()=>{
      setCopied(true); setTimeout(()=>setCopied(false), 2000);
    }).catch(()=>{
      const ta = document.getElementById("review-copy-area");
      if(ta){ ta.value=text; ta.select(); document.execCommand("copy"); setCopied(true); setTimeout(()=>setCopied(false),2000); }
    });
  },[buildText]);

  return(
    <div style={{background:C.surface2, border:`1px solid ${C.border}`, borderRadius:10, padding:14, marginBottom:16}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
        <div style={{fontSize:12, color:C.muted}}>📋 復習リストをチャットに貼る</div>
        <button style={s.copyBtn(copied)} onClick={handleCopy}>
          {copied ? "✓ コピーしました" : "コピー"}
        </button>
      </div>
      <div style={{fontSize:11, color:C.muted, lineHeight:1.6}}>
        間違えた問題の正解・解説を分野別にまとめたテキストをコピーできます。<br/>
        コピー後このチャットに貼り付けると履歴として残ります。
      </div>
      <textarea id="review-copy-area" readOnly value={buildText()}
        style={{position:"absolute", left:"-9999px", top:0}}/>
    </div>
  );
}

export default function App(){
  const [tab, setTab] = useState("quiz");
  const [cat, setCat] = useState("すべて");
  const [weakMode, setWeakMode] = useState(false);
  const [weakIds, setWeakIds] = useState([]);
  const [phase, setPhase] = useState("idle");
  const [usedIds, setUsedIds] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [showFb, setShowFb] = useState(false);
  const [analysis, setAnalysis] = useState("");
  const [allHistory, setAllHistory] = useState([]);
  const [missedList, setMissedList] = useState([]);
  const [catStats, setCatStats] = useState({});
  const [copyText, setCopyText] = useState("");
  const [copied, setCopied] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbSaved, setDbSaved] = useState(false);
  const [dbHistory, setDbHistory] = useState([]);
  const [dbMissed, setDbMissed] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");

  // 起動時にlocalStorageから進捗を復元
  useEffect(()=>{
    const local = store.loadIds();
    const valid = local.filter(id => ALL_QUESTIONS.some(q=>q.id===id));
    if(valid.length > 0){
      setUsedIds(valid);
      setProgressError(`✓ ${valid.length}問分の進捗を復元`);
      setProgressLoading(false);
    } else {
      gas.get({type:"progress"}).then(res=>{
        if(res.ok && res.usedIds && res.usedIds.length > 0){
          const v = res.usedIds.filter(id => ALL_QUESTIONS.some(q=>q.id===id));
          setUsedIds(v); store.saveIds(v);
          setProgressError(`✓ ${v.length}問分の進捗を復元`);
        }
        setProgressLoading(false);
      }).catch(()=>{ setProgressLoading(false); });
    }
  },[]); // eslint-disable-line

  // 残り問題数
  const available = ALL_QUESTIONS.filter(q=>{
    const catOk = cat==="すべて" || q.cat===cat;
    const notUsed = !usedIds.includes(q.id);
    return catOk && notUsed;
  });

  const saveUsedIds = useCallback((ids)=>{
    setUsedIds(ids);
    store.saveIds(ids);
  },[]);

  const startSession = useCallback(async()=>{
    let picked = [];

    if(weakMode && weakIds.length > 0){
      // 苦手優先：間違えた問題IDから優先出題
      const weakInAll = ALL_QUESTIONS.filter(q => weakIds.includes(q.id));
      const others = ALL_QUESTIONS.filter(q => !weakIds.includes(q.id) && (cat==="すべて" || q.cat===cat));
      const shuffledWeak = shuffle(weakInAll).slice(0, Math.min(10, weakInAll.length));
      const rest = shuffle(others).slice(0, Math.max(0, 10 - shuffledWeak.length));
      picked = shuffle([...shuffledWeak, ...rest]).slice(0, 10);
    } else {
      const base = ALL_QUESTIONS.filter(q=>(cat==="すべて"||q.cat===cat) && !usedIds.includes(q.id));
      if(base.length < 10){
        const fresh = ALL_QUESTIONS.filter(q=>cat==="すべて"||q.cat===cat);
        picked = shuffle(fresh).slice(0,10);
        saveUsedIds(picked.map(q=>q.id));
      } else {
        picked = shuffle(base).slice(0,10);
        saveUsedIds([...usedIds, ...picked.map(q=>q.id)]);
      }
    }

    setQuestions(picked);
    setAnswers(new Array(10).fill(null));
    setQIdx(0); setChosen(null); setShowFb(false);
    setAnalysis(""); setCopyText(""); setCopied(false);
    setPhase("question");
  },[cat, usedIds, weakMode, weakIds, saveUsedIds]);

  const handleAnswer = useCallback((choice)=>{
    if(showFb) return;
    setChosen(choice); setShowFb(true);
    const q = questions[qIdx];
    const ok = choice.label===q.correct;
    setAllHistory(h=>[...h,{cat:q.cat,topic:q.topic,correct:ok}]);
    setCatStats(prev=>{const cur=prev[q.cat]||{ok:0,total:0};return{...prev,[q.cat]:{ok:cur.ok+(ok?1:0),total:cur.total+1}};});
    if(!ok) setMissedList(m=>[...m,q]);
    setAnswers(prev=>{const n=[...prev];n[qIdx]=choice.label;return n;});
  },[showFb,questions,qIdx]);

  const handleNext = useCallback(()=>{
    const next=qIdx+1;
    if(next>=questions.length) setPhase("score");
    else{setQIdx(next);setChosen(null);setShowFb(false);}
  },[qIdx,questions.length]);

  const sessionCorrect = answers.filter((a,i)=>a!==null&&questions[i]&&a===questions[i].correct).length;

  // セッション終了時にGASへ保存
  const saveToDb = useCallback(async(qs, ans)=>{
    setDbSaving(true); setDbSaved(false);
    try{
      const correct = ans.filter((a,i)=>a!==null&&qs[i]&&a===qs[i].correct).length;
      await gas.post({
        type:"session", cat, correct, total:qs.length,
        answers: ans.map((a,i)=>({topic:qs[i]?.topic, ok:a===qs[i]?.correct})),
      });
      const wrong = qs.filter((_,i)=>ans[i]!==null&&ans[i]!==qs[i]?.correct);
      for(const q of wrong){
        await gas.post({type:"missed", question:{id:q.id,cat:q.cat,topic:q.topic,q:q.q,correct:q.correct,hint:q.hint}});
      }
      setDbSaved(true);
    }catch(e){ console.error(e); }
    finally{ setDbSaving(false); }
  },[cat]);

  useEffect(()=>{
    if(phase==="score"&&questions.length>0){
      if(copyText===""){
        const now=new Date();
        const ds=`${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
        const correct=answers.filter((a,i)=>a!==null&&questions[i]&&a===questions[i].correct).length;
        const lines=[
          `📊 FE科目A クイズ結果 ${ds}`,
          `正解: ${correct}/${questions.length}問 (${Math.round(correct/questions.length*100)}%)`,
          `分野: ${[...new Set(questions.map(q=>q.cat))].join("・")}`,
          `---`,
          ...questions.map((q,i)=>`Q${i+1}[${q.cat}/${q.topic}] ${answers[i]===q.correct?"○":"✗"}`),
          `---`,
          `累計分野別:`,
          ...Object.entries(catStats).map(([c,s])=>`${c}: ${Math.round(s.ok/s.total*100)}% (${s.ok}/${s.total})`),
        ];
        setCopyText(lines.join("\n"));
      }
      // Supabaseに自動保存
      saveToDb(questions, answers, catStats);
    }
  },[phase]); // eslint-disable-line

  // 履歴タブを開いたときにGASからデータ取得
  const loadDbHistory = useCallback(async()=>{
    setDbLoading(true);
    try{
      const [statsRes, missedRes] = await Promise.all([
        gas.get({type:"stats"}),
        gas.get({type:"missed"}),
      ]);
      setDbHistory(statsRes.sessions||[]);
      setDbMissed(missedRes.missed||[]);
    }catch(e){console.error(e);}
    finally{setDbLoading(false);}
  },[]);

  const clearDbMissed = useCallback(async()=>{
    if(!window.confirm("GASの復習リストを全削除しますか？\n（スプレッドシートのmissedシートを手動で削除してください）")) return;
    setDbMissed([]);
  },[]);

  const handleAnalyze = useCallback(async()=>{
    setPhase("analyzing");
    try{
      const result=await analyzeResults(questions,answers,catStats);
      setAnalysis(result);
      setCopyText(prev=>prev+"\n---\n📝 AI分析:\n"+result);
    }catch{setAnalysis("分析の取得に失敗しました。");}
    finally{setPhase("score");}
  },[questions,answers,catStats]);

  const resetSession = useCallback(()=>{setPhase("idle");setAnalysis("");setCopyText("");setCopied(false);},[]);
  const clearMissed = useCallback(()=>setMissedList([]),[]);

  const totalAnswered=allHistory.length;
  const totalCorrect=allHistory.filter(h=>h.correct).length;
  const overallPct=totalAnswered>0?Math.round(totalCorrect/totalAnswered*100):0;

  return(
    <div style={s.app}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');`}</style>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.h1}>FE 科目A Quiz</div>
          <div style={s.sub}>基本情報技術者 — 93問（随時追加）</div>
        </header>

        <div style={s.tabs}>
          {["quiz","review","history"].map((t,i)=>(
            <button key={t} style={s.tabBtn(tab===t)} onClick={()=>{ setTab(t); if(t==="history") loadDbHistory(); }}>
              {["クイズ",`復習${missedList.length>0?` (${missedList.length})`:""}`, "履歴・分析"][i]}
            </button>
          ))}
        </div>

        {tab==="quiz" && <>
          {phase==="idle" && (
            <div style={s.card}>
              {progressLoading ? (
                <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:13}}>
                  <span style={s.spinner}/> <span style={{marginLeft:8}}>進捗をSupabaseから読み込み中…</span>
                </div>
              ) : (
                <div style={{marginBottom:12,fontSize:13,color:C.muted}}>
                  残り問題: <span style={s.stockBadge(available.length)}>{available.length}問</span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:8}}>/ {ALL_QUESTIONS.length}問中</span>
                  {progressError && <div style={{fontSize:11,color:progressError.startsWith("✓")?C.green:C.warn,marginTop:4}}>{progressError}</div>}
                </div>
              )}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",marginBottom:8,textTransform:"uppercase",letterSpacing:".06em"}}>分野</div>
                <div style={s.row}>
                  {CATS.map(c=><button key={c} style={s.chip(cat===c)} onClick={()=>setCat(c)}>{c}</button>)}
                </div>
              </div>
              <button style={{...s.btn(),width:"100%"}} onClick={startSession}>
                {weakMode ? "🎯 苦手優先モードでスタート" : "スタート（10問）"}
              </button>
              {/* 苦手優先モード切替 */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,padding:"10px 12px",background:weakMode?"rgba(63,185,80,.08)":"rgba(255,255,255,.03)",border:`1px solid ${weakMode?C.green:C.border}`,borderRadius:8,cursor:"pointer"}}
                onClick={async()=>{
                  const next = !weakMode;
                  setWeakMode(next);
                  if(next){
                    const res = await gas.get({type:"missed"}).catch(()=>({ok:false}));
                    const ids = (res.missed||[]).map(m=>m.id).filter(Boolean);
                    setWeakIds([...new Set(ids)]);
                  }
                }}>
                <div style={{width:36,height:20,background:weakMode?C.green:C.border,borderRadius:10,position:"relative",flexShrink:0,transition:"background .2s"}}>
                  <div style={{width:16,height:16,background:"white",borderRadius:"50%",position:"absolute",top:2,left:weakMode?18:2,transition:"left .2s"}}/>
                </div>
                <div>
                  <div style={{fontSize:13,color:weakMode?C.green:C.muted,fontWeight:weakMode?700:400}}>苦手優先モード</div>
                  <div style={{fontSize:11,color:C.muted}}>{weakMode && weakIds.length>0 ? `Supabaseの${weakIds.length}問を優先出題` : "Supabaseの間違えた問題を優先"}</div>
                </div>
              </div>
              <button style={{width:"100%",padding:9,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",marginTop:8}}
                onClick={()=>{ if(window.confirm("使用済み問題をリセットして全問を出題可能にします。よろしいですか？")){ saveUsedIds([]); } }}>
                🔄 問題をリセット（全93問に戻す）
              </button>
            </div>
          )}

          {phase==="question" && questions[qIdx] && (()=>{
            const q=questions[qIdx];
            return(
              <div>
                <div style={s.progress}><div style={s.bar((qIdx/questions.length)*100)}/></div>
                <div style={s.card}>
                  <div style={s.meta}>
                    <span style={{fontFamily:"monospace",fontSize:12,color:C.muted}}>{qIdx+1} / {questions.length}</span>
                    <span style={s.catTag}>{q.cat}</span>
                  </div>
                  <div style={s.qnum}>テーマ: {q.topic}</div>
                  <div style={s.qtext}>{q.q}</div>
                  <div>
                    {q.choices.map(c=>{
                      let state=null;
                      if(showFb){if(c.label===q.correct)state="correct";else if(chosen?.label===c.label)state="wrong";}
                      return(
                        <button key={c.label} style={s.choiceBtn(state)} onClick={()=>handleAnswer(c)} disabled={showFb}>
                          <span style={s.label}>{c.label}</span><span>{c.text}</span>
                        </button>
                      );
                    })}
                  </div>
                  {showFb && (
                    <div>
                      <div style={s.fb(chosen?.label===q.correct)}>
                        {chosen?.label===q.correct?"✓ 正解！":`✗ 不正解。正解は ${q.correct}. ${q.choices.find(c=>c.label===q.correct)?.text}`}
                        <div style={s.hintBox}><div style={s.hintLabel}>解説</div>{q.hint}</div>
                        {chosen?.label!==q.correct && (
                          <div style={{...s.hintBox,marginTop:8,borderColor:"rgba(248,81,73,.2)"}}>
                            <div style={{...s.hintLabel,color:C.warn}}>あなたの選択</div>
                            {chosen?.label}. {chosen?.text}
                          </div>
                        )}
                      </div>
                      <button style={{...s.btn(),width:"100%",marginTop:14}} onClick={handleNext}>
                        {qIdx+1>=questions.length?"結果を見る":"次の問題 →"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {(phase==="score"||phase==="analyzing") && (
            <div style={{...s.card,textAlign:"center"}}>
              <div style={{fontFamily:"monospace",fontSize:48,fontWeight:600,color:C.accent,marginBottom:4}}>
                {sessionCorrect} / {questions.length}
              </div>
              <div style={{color:C.muted,fontSize:13,marginBottom:20}}>
                正解率 {Math.round(sessionCorrect/questions.length*100)}%
                {Math.round(sessionCorrect/questions.length*100)>=80?" — 完璧に近い！":Math.round(sessionCorrect/questions.length*100)>=60?" — 惜しい、復習しよう":" — 復習タブで確認を"}
              </div>
              <div style={{textAlign:"left",marginBottom:20}}>
                {questions.map((q,i)=>{
                  const ok=answers[i]===q.correct;
                  return(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"7px 0",borderBottom:`1px solid ${C.border}`,gap:8}}>
                      <div style={{fontSize:12}}>
                        <span style={{fontFamily:"monospace",color:C.muted,marginRight:6}}>Q{i+1}</span>
                        <span style={{color:C.muted,fontSize:11}}>[{q.cat}]</span>
                        <span style={{marginLeft:6}}>{q.topic}</span>
                      </div>
                      <span style={{fontFamily:"monospace",color:ok?C.green:C.red,flexShrink:0}}>{ok?"○":"✗"}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginBottom:16}}>
                <button style={s.btn()} onClick={startSession}>もう一度</button>
                <button style={s.btn(C.accent,true)} onClick={resetSession}>設定に戻る</button>
              </div>
              {/* DB保存状態 */}
              <div style={{fontSize:12,color:dbSaved?C.green:dbSaving?C.warn:C.muted,marginBottom:12,textAlign:"center"}}>
                {dbSaving?"💾 Supabaseに保存中…":dbSaved?"✓ Supabaseに保存しました":""}
              </div>
              <div style={{textAlign:"left"}}>
                <div style={s.sectionTitle}>AI 学習分析</div>
                {analysis?(
                  <div style={s.analysisBox}>{analysis}</div>
                ):(
                  <button style={{...s.btn(C.green),width:"100%"}} onClick={handleAnalyze} disabled={phase==="analyzing"}>
                    {phase==="analyzing"?<><span style={s.spinner}/><span style={{marginLeft:8}}>分析中…</span></>:"このセッションをAIに分析してもらう"}
                  </button>
                )}
              </div>
              {copyText && (
                <div style={{textAlign:"left",marginTop:20}}>
                  <div style={s.sectionTitle}>📋 チャットに貼り付ける用</div>
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}>
                    <button style={s.copyBtn(copied)} onClick={()=>{
                      navigator.clipboard.writeText(copyText).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);})
                      .catch(()=>{const el=document.getElementById("copyarea");if(el){el.select();document.execCommand("copy");setCopied(true);setTimeout(()=>setCopied(false),2000);}});
                    }}>{copied?"✓ コピーしました":"コピー"}</button>
                  </div>
                  <textarea id="copyarea" readOnly value={copyText}
                    style={{...s.copyBox,width:"100%",resize:"none",outline:"none"}} rows={8}/>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>コピーしてチャットに貼り付けると履歴として残ります</div>
                </div>
              )}
            </div>
          )}
        </>}

        {tab==="review" && (
          <div>
            {missedList.length===0
              ?<div style={{textAlign:"center",color:C.muted,fontSize:14,padding:"48px 0"}}>間違えた問題はまだありません。</div>
              :<>
                {/* コピーテキスト生成 */}
                <ReviewCopyBox missedList={missedList} catStats={catStats}/>
                <button style={{width:"100%",padding:9,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,fontFamily:"inherit",fontSize:13,cursor:"pointer",marginBottom:16}} onClick={clearMissed}>復習リストをクリア</button>
                {missedList.map((q,i)=>{
                  const cc=q.choices.find(c=>c.label===q.correct);
                  return(
                    <div key={i} style={s.reviewItem}>
                      <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",marginBottom:4}}>{q.cat} / {q.topic}</div>
                      <div style={{fontSize:13,fontWeight:500,lineHeight:1.6,marginBottom:8}}>{q.q}</div>
                      <div style={s.hintLabel}>正解</div>
                      <div style={{fontSize:13,color:C.text,marginBottom:6,lineHeight:1.5}}>{q.correct}. {cc?.text}</div>
                      <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{q.hint}</div>
                    </div>
                  );
                })}
              </>
            }
          </div>
        )}

        {tab==="history" && (
          <div>
            <div style={{display:"flex",gap:8,marginBottom:18}}>
              {[["解答数",totalAnswered],["正解数",totalCorrect],["正解率",`${overallPct}%`]].map(([l,v],i)=>(
                <div key={l} style={s.statBox}>
                  <div style={{...s.statNum,color:i===2?rateColor(overallPct):C.accent}}>{v}</div>
                  <div style={s.statLabel}>{l}（今回）</div>
                </div>
              ))}
            </div>
            {Object.keys(catStats).length>0 && <>
              <div style={s.sectionTitle}>分野別 正解率（今回のセッション）</div>
              {Object.entries(catStats)
                .map(([c,st])=>({c,pct:Math.round(st.ok/st.total*100),ok:st.ok,total:st.total}))
                .sort((a,b)=>a.pct-b.pct)
                .map(({c,pct,ok,total})=>(
                  <div key={c} style={s.catBarRow}>
                    <div style={{fontSize:12,width:140,flexShrink:0,lineHeight:1.3}}>{c}</div>
                    <div style={{flex:1,height:7,background:C.surface2,borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:4,width:`${pct}%`,background:rateColor(pct),transition:"width .4s"}}/>
                    </div>
                    <div style={{fontFamily:"monospace",fontSize:12,width:72,textAlign:"right",color:rateColor(pct)}}>
                      {pct}% ({ok}/{total})
                    </div>
                  </div>
                ))
              }
            </>}

            {/* ── Supabase永続履歴 ── */}
            <div style={{...s.sectionTitle,marginTop:28,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📦 Supabase保存済み履歴</span>
              <button style={{...s.copyBtn(false),fontSize:11,padding:"4px 10px"}} onClick={loadDbHistory}>
                {dbLoading?"読込中…":"更新"}
              </button>
            </div>

            {dbLoading ? (
              <div style={{textAlign:"center",padding:20}}><span style={s.spinner}/></div>
            ) : dbHistory.length===0 ? (
              <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:20}}>まだ保存された履歴がありません</div>
            ) : (
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 13px",marginBottom:16}}>
                {dbHistory.map((h,i)=>{
                  const d=new Date(h.created_at);
                  const ds=`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                  const pct=Math.round(h.correct/h.total*100);
                  return(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:i<dbHistory.length-1?`1px solid ${C.border}`:"none"}}>
                      <div>
                        <div style={{fontSize:12,color:C.muted,fontFamily:"monospace"}}>{ds} ・ {h.cat}</div>
                      </div>
                      <div style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:rateColor(pct),flexShrink:0}}>{h.correct}/{h.total}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Supabase復習リスト */}
            <div style={{...s.sectionTitle,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>📝 Supabase復習リスト（{dbMissed.length}問）</span>
              {dbMissed.length>0 && <button style={{...s.copyBtn(false),fontSize:11,padding:"4px 10px",color:C.red,borderColor:C.red}} onClick={clearDbMissed}>クリア</button>}
            </div>
            {dbMissed.length===0 ? (
              <div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"12px 0"}}>間違えた問題はまだありません</div>
            ) : (
              dbMissed.slice(0,20).map((m,i)=>(
                <div key={i} style={s.reviewItem}>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",marginBottom:4}}>{m.cat} / {m.topic}</div>
                  <div style={{fontSize:13,fontWeight:500,lineHeight:1.6,marginBottom:6}}>{m.q}</div>
                  <div style={s.hintLabel}>正解: {m.correct_label}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginTop:4}}>{m.hint}</div>
                </div>
              ))
            )}

            {totalAnswered===0 && dbHistory.length===0 && <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:"12px 0"}}>クイズに挑戦すると履歴が表示されます。</div>}
          </div>
        )}
      </div>
    </div>
  );
}
