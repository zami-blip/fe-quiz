import React, { useState, useCallback, useEffect } from "react";

// localStorage管理
const LS_USED = "feb_used_ids";
const LS_SESSIONS = "feb_sessions";
const LS_MISSED = "feb_missed";
const LS_LIFETIME = "feb_lifetime"; // 生涯累計(セッション履歴とは別に、間引かれず増え続ける集計)
const LS_CYCLE = "feb_cycle"; // 今回の周回成績(問題プールを1周する間、リロードしても消えない)
const LS_QVERSION = "feb_qversion"; // 問題内容(分野構成含む)のバージョン識別子

const store = {
  saveIds(ids){ try{ localStorage.setItem(LS_USED, JSON.stringify(ids)); }catch(e){} },
  loadIds(){ try{ const v=localStorage.getItem(LS_USED); return v?JSON.parse(v):[]; }catch(e){ return []; } },
  addSession(session){
    try{
      // 生涯累計を先に確定(この時点ではまだ今回のsessionを含まない状態で
      // 初回マイグレーションのベースラインを作る。二重計上を防ぐため必ず
      // sessionsの更新より前に行う)
      const lt = this.loadLifetime();
      lt.totalAnswered += session.total;
      lt.totalCorrect += session.correct;
      Object.entries(session.cats||{}).forEach(([c,v])=>{
        if(!lt.byCat[c]) lt.byCat[c] = {ok:0,total:0};
        lt.byCat[c].ok += v.ok;
        lt.byCat[c].total += v.total;
      });
      this.saveLifetime(lt);

      const sessions = this.loadSessions();
      sessions.push(session);
      // 直近セッション一覧の表示用に最新100件だけ保持(この間引きは表示用のみで、
      // 累計成績はfe_lifetimeに別途加算保存するため間引きの影響を受けない)
      if(sessions.length > 100) sessions.splice(0, sessions.length - 100);
      localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
    }catch(e){}
  },
  loadSessions(){ try{ const v=localStorage.getItem(LS_SESSIONS); return v?JSON.parse(v):[]; }catch(e){ return []; } },
  saveLifetime(lt){ try{ localStorage.setItem(LS_LIFETIME, JSON.stringify(lt)); }catch(e){} },
  loadLifetime(){
    try{
      const v = localStorage.getItem(LS_LIFETIME);
      if(v) return JSON.parse(v);
    }catch(e){}
    // 初回: fe_lifetimeが存在しない場合、既存のfe_sessions(直近最大100件、
    // =この呼び出し時点でまだ今回のsessionは含まれていない)の合計値を初期値として
    // 引き継ぐ。これより前に間引かれてしまった分は復元不可能だが、
    // 以後は間引かれずに正しく積み上がっていく。
    const sessions = this.loadSessions();
    const lt = { totalAnswered:0, totalCorrect:0, byCat:{} };
    sessions.forEach(sess=>{
      lt.totalAnswered += sess.total;
      lt.totalCorrect += sess.correct;
      Object.entries(sess.cats||{}).forEach(([c,v])=>{
        if(!lt.byCat[c]) lt.byCat[c] = {ok:0,total:0};
        lt.byCat[c].ok += v.ok;
        lt.byCat[c].total += v.total;
      });
    });
    return lt;
  },
  saveMissed(list){ try{ localStorage.setItem(LS_MISSED, JSON.stringify(list)); }catch(e){} },
  loadMissed(){ try{ const v=localStorage.getItem(LS_MISSED); return v?JSON.parse(v):[]; }catch(e){ return []; } },
  // 今回の周回成績: 問題プールを1周する(usedIdsがリセットされる)まで保持し、
  // ページのリロードやタブの再読込では消えないようにする
  saveCycle(data){ try{ localStorage.setItem(LS_CYCLE, JSON.stringify(data)); }catch(e){} },
  loadCycle(){ try{ const v=localStorage.getItem(LS_CYCLE); return v?JSON.parse(v):{history:[],catStats:{}}; }catch(e){ return {history:[],catStats:{}}; } },
  clearCycle(){ try{ localStorage.removeItem(LS_CYCLE); }catch(e){} },
};

const CATS = [
  "すべて","順次・分岐処理","繰返し処理","配列操作","再帰処理",
  "ソートアルゴリズム","探索アルゴリズム","文字列処理","スタック・キュー","情報セキュリティ",
];

const ALL_QUESTIONS = [{"id":1,"cat":"順次・分岐処理","topic":"変数の入れ替え(新数値)","q":"次の疑似言語プログラムを実行した直後のaとbの値の組合せはどれか。","choices":[{"label":"ア","text":"a=25, b=25"},{"label":"イ","text":"a=9, b=9"},{"label":"ウ","text":"a=9, b=25"},{"label":"エ","text":"a=25, b=9"}],"correct":"ウ","hint":"tに退避したaの値(25)を最後にbへ代入するため、a=9, b=25となる。","code":"○整数型: a ← 25\n○整数型: b ← 9\n○整数型: t\nt ← a\na ← b\nb ← t"},{"id":2,"cat":"順次・分岐処理","topic":"if-elseif-else文のトレース(新数値)","q":"次の疑似言語プログラムを実行したとき、gradeに代入される値はどれか。","choices":[{"label":"ア","text":"\"A\""},{"label":"イ","text":"\"C\""},{"label":"ウ","text":"\"B\""},{"label":"エ","text":"\"S\""}],"correct":"ウ","hint":"scoreは80未満だが70以上なので、3番目の条件が成立しgradeは\"B\"になる。","code":"○整数型: score ← 72\n○文字列型: grade\nif (score ≥ 90) then\n    grade ← \"S\"\nelseif (score ≥ 80) then\n    grade ← \"A\"\nelseif (score ≥ 70) then\n    grade ← \"B\"\nelse\n    grade ← \"C\"\nendif"},{"id":3,"cat":"順次・分岐処理","topic":"論理積(and)を使った条件式のトレース","q":"次の疑似言語プログラムを実行したとき、resultに代入される値はどれか。","choices":[{"label":"ア","text":"\"F\""},{"label":"イ","text":"エラーになる"},{"label":"ウ","text":"\"T\""},{"label":"エ","text":"\"TF\""}],"correct":"ア","hint":"x>0は真だがy>0は偽であり、and条件は両方が真でなければ全体が偽となるためresultは\"F\"になる。","code":"○整数型: x ← 4\n○整数型: y ← -2\n○文字列型: result\nif (x > 0 and y > 0) then\n    result ← \"T\"\nelse\n    result ← \"F\"\nendif"},{"id":4,"cat":"繰返し処理","topic":"whileループと整数除算のトレース(新数値)","q":"次の疑似言語プログラム(÷は小数点以下切り捨ての整数除算とする)を実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"6"},{"label":"イ","text":"7"},{"label":"ウ","text":"8"},{"label":"エ","text":"200"}],"correct":"イ","hint":"200を2で割り続けると200→100→50→25→12→6→3→1となり、n>1が偽になるまでに7回の除算が行われるため、countは7になる。","code":"○整数型: n ← 200\n○整数型: count ← 0\nwhile (n > 1)\n    n ← n ÷ 2\n    count ← count + 1\nendwhile"},{"id":5,"cat":"繰返し処理","topic":"for文の増分パターンの理解(新数値)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"30"},{"label":"イ","text":"9"},{"label":"ウ","text":"11"},{"label":"エ","text":"10"}],"correct":"エ","hint":"iは3,6,9,...,30の10個の値を取るため、countは10になる。","code":"○整数型: count ← 0\nfor (i を 3 から 30 まで 3 ずつ増やす)\n    count ← count + 1\nendfor"},{"id":6,"cat":"繰返し処理","topic":"forループと偶数の合計(新数値)","q":"次の疑似言語プログラムを実行した直後のsumの値はどれか。","choices":[{"label":"ア","text":"30"},{"label":"イ","text":"55"},{"label":"ウ","text":"25"},{"label":"エ","text":"20"}],"correct":"ア","hint":"1から10のうち偶数は2,4,6,8,10であり、合計は2+4+6+8+10=30である。","code":"○整数型: sum ← 0\nfor (i を 1 から 10 まで 1 ずつ増やす)\n    if (i mod 2 = 0) then\n        sum ← sum + i\n    endif\nendfor"},{"id":7,"cat":"繰返し処理","topic":"do-while文(後判定ループ)のトレース(新数値)","q":"次の疑似言語プログラムを実行した直後のcountとxの値の組合せはどれか。","choices":[{"label":"ア","text":"count=6, x=1458"},{"label":"イ","text":"count=4, x=162"},{"label":"ウ","text":"count=5, x=486"},{"label":"エ","text":"count=5, x=162"}],"correct":"ウ","hint":"xは2→6→18→54→162→486と変化し、5回目の乗算でx=486となった時点でx<200が偽になり終了するため、countは5、xは486になる。","code":"○整数型: x ← 2\n○整数型: count ← 0\ndo\n    x ← x × 3\n    count ← count + 1\nwhile (x < 200)"},{"id":8,"cat":"繰返し処理","topic":"二重ループの反復回数(新数値)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"8"},{"label":"イ","text":"3"},{"label":"ウ","text":"15"},{"label":"エ","text":"20"}],"correct":"ウ","hint":"外側5回×内側3回で、countは5×3=15回加算される。","code":"○整数型: count ← 0\nfor (i を 1 から 5 まで 1 ずつ増やす)\n    for (j を 1 から 3 まで 1 ずつ増やす)\n        count ← count + 1\n    endfor\nendfor"},{"id":9,"cat":"配列操作","topic":"配列の最大値とそのインデックス(新数値)","q":"次の疑似言語プログラムを実行した直後のmaxとmaxIdxの値の組合せはどれか(先頭を1番目とする)。","choices":[{"label":"ア","text":"max=42, maxIdx=1"},{"label":"イ","text":"max=42, maxIdx=2"},{"label":"ウ","text":"max=31, maxIdx=6"},{"label":"エ","text":"max=23, maxIdx=4"}],"correct":"イ","hint":"配列Aの中で最大の値は42(A[2])であり、maxは42、maxIdxは2になる。","code":"○整数型の配列: A ← {15, 42, 8, 23, 4, 31}\n○整数型: max ← A[1]\n○整数型: maxIdx ← 1\nfor (i を 2 から 6 まで 1 ずつ増やす)\n    if (A[i] > max) then\n        max ← A[i]\n        maxIdx ← i\n    endif\nendfor"},{"id":10,"cat":"配列操作","topic":"配列要素の合計と平均(新数値)","q":"次の疑似言語プログラムを実行した直後のavgの値はどれか。","choices":[{"label":"ア","text":"19"},{"label":"イ","text":"144"},{"label":"ウ","text":"30"},{"label":"エ","text":"24"}],"correct":"エ","hint":"配列の合計は12+45+7+33+19+28=144であり、144÷6=24がavgになる。","code":"○整数型の配列: A ← {12, 45, 7, 33, 19, 28}\n○整数型: sum ← 0\nfor (i を 1 から 6 まで 1 ずつ増やす)\n    sum ← sum + A[i]\nendfor\n○整数型: avg ← sum ÷ 6"},{"id":11,"cat":"配列操作","topic":"条件を満たす要素数のカウント(新数値)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"3"},{"label":"イ","text":"4"},{"label":"ウ","text":"7"},{"label":"エ","text":"2"}],"correct":"ア","hint":"配列Aの中で10より大きい値は17,25,11の3個であるため、countは3になる。","code":"○整数型の配列: A ← {4, 17, 9, 2, 25, 11, 6}\n○整数型: count ← 0\nfor (i を 1 から 7 まで 1 ずつ増やす)\n    if (A[i] > 10) then\n        count ← count + 1\n    endif\nendfor"},{"id":12,"cat":"配列操作","topic":"特定要素の出現回数のカウント(新数値)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"4"},{"label":"イ","text":"3"},{"label":"ウ","text":"5"},{"label":"エ","text":"7"}],"correct":"ア","hint":"配列Aの中で値3は4回(A[1],A[3],A[5],A[7])出現するため、countは4になる。","code":"○整数型の配列: A ← {3, 8, 3, 5, 3, 9, 3}\n○整数型: count ← 0\nfor (i を 1 から 7 まで 1 ずつ増やす)\n    if (A[i] = 3) then\n        count ← count + 1\n    endif\nendfor"},{"id":13,"cat":"配列操作","topic":"配列の反転処理のトレース","q":"次の疑似言語プログラムを実行した直後の配列Bの状態はどれか(要素数5)。","choices":[{"label":"ア","text":"{10, 50, 30, 20, 40}"},{"label":"イ","text":"{10, 20, 30, 40, 50}"},{"label":"ウ","text":"{50, 10, 30, 20, 40}"},{"label":"エ","text":"{50, 40, 30, 20, 10}"}],"correct":"エ","hint":"B[i]にA[6-i]を代入することで、Aの並びを逆順にしたものがBに格納される。","code":"○整数型の配列: A ← {10, 20, 30, 40, 50}\n○整数型の配列: B ← {0, 0, 0, 0, 0}\nfor (i を 1 から 5 まで 1 ずつ増やす)\n    B[i] ← A[6 - i]\nendfor"},{"id":14,"cat":"再帰処理","topic":"ハノイの塔の再帰呼び出し(移動回数の公式)","q":"次の疑似言語で定義された手続きhanoiは、n枚の円盤をハノイの塔のルールで移動させるのに必要な最小手数を返す。hanoi(5)の戻り値はどれか。","choices":[{"label":"ア","text":"63"},{"label":"イ","text":"15"},{"label":"ウ","text":"31"},{"label":"エ","text":"32"}],"correct":"ウ","hint":"hanoi(n)=2×hanoi(n-1)+1という漸化式であり、これは2^n-1に等しい。n=5のとき2^5-1=31となる。","code":"○整数型: 手続き hanoi(整数型: n)\n  if (n = 0) then\n      return 0\n  else\n      return 2 × hanoi(n - 1) + 1\n  endif"},{"id":15,"cat":"再帰処理","topic":"相互再帰(isEven/isOdd)のトレース","q":"次の疑似言語で定義された、互いを呼び合う2つの手続きisEvenとisOddについて、isEven(6)を最初に呼び出したときに発生する呼び出しの総回数(最初の呼び出しを含む)はどれか。","choices":[{"label":"ア","text":"6回"},{"label":"イ","text":"3回"},{"label":"ウ","text":"13回"},{"label":"エ","text":"7回"}],"correct":"エ","hint":"isEven(6)→isOdd(5)→isEven(4)→isOdd(3)→isEven(2)→isOdd(1)→isEven(0)の順に、n=0に達するまで1回ずつ呼び出しが連鎖し、合計7回になる。","code":"○論理型: 手続き isEven(整数型: n)\n  if (n = 0) then\n      return true\n  else\n      return isOdd(n - 1)\n  endif\n\n○論理型: 手続き isOdd(整数型: n)\n  if (n = 0) then\n      return false\n  else\n      return isEven(n - 1)\n  endif"},{"id":16,"cat":"再帰処理","topic":"メモ化を用いたフィボナッチ数列の呼び出し回数","q":"次の疑似言語で定義された手続きfibMemoは、計算済みの値を配列memoに保存しながらフィボナッチ数を求める(メモ化)。要素数8のmemo配列を全て-1で初期化した状態からfibMemo(7, memo)を呼び出したとき、発生する関数呼び出しの総回数(最初の呼び出しを含む)はどれか。","choices":[{"label":"ア","text":"7回"},{"label":"イ","text":"13回"},{"label":"ウ","text":"233回"},{"label":"エ","text":"21回"}],"correct":"イ","hint":"メモ化により、一度計算した値は再計算せずmemo配列から即座に返すため、単純な再帰(fib(7)なら41回)よりも呼び出し回数が大幅に少なくなり、合計13回となる。","code":"○整数型: 手続き fibMemo(整数型: n, 整数型の配列: memo)\n  if (memo[n] ≠ -1) then\n      return memo[n]\n  endif\n  if (n ≤ 1) then\n      memo[n] ← n\n      return n\n  endif\n  memo[n] ← fibMemo(n - 1, memo) + fibMemo(n - 2, memo)\n  return memo[n]"},{"id":17,"cat":"再帰処理","topic":"再帰による二分探索のトレース(比較回数)","q":"次の疑似言語で定義された手続きbsearchは、整列済み配列Aの範囲[lo, hi](添字は1始まり)からkeyを再帰的に探索する。配列A ← {2,5,8,12,16,23,38,45,56,72}(要素数10)に対してbsearch(A, 45, 1, 10)を呼び出した場合、keyが見つかるまでに行われる比較(if文での等値・大小判定を1回とする)の回数はどれか。","choices":[{"label":"ア","text":"4回"},{"label":"イ","text":"3回"},{"label":"ウ","text":"2回"},{"label":"エ","text":"1回"}],"correct":"ウ","hint":"1回目:mid=(1+10)÷2=5、A[5]=16<45なので右半分へ。2回目:mid=(6+10)÷2=8、A[8]=45で一致。比較は2回で完了する。","code":"○整数型: 手続き bsearch(整数型の配列: A, 整数型: key, 整数型: lo, 整数型: hi)\n  if (lo > hi) then\n      return -1\n  endif\n  ○整数型: mid ← (lo + hi) ÷ 2\n  if (A[mid] = key) then\n      return mid\n  elseif (A[mid] < key) then\n      return bsearch(A, key, mid + 1, hi)\n  else\n      return bsearch(A, key, lo, mid - 1)\n  endif"},{"id":18,"cat":"再帰処理","topic":"再帰による順列総数の計算(nPr)","q":"次の疑似言語で定義された手続きnPrは、n個からr個を選んで並べる順列の総数を再帰的に求める。nPr(6, 3)の戻り値はどれか。","choices":[{"label":"ア","text":"20"},{"label":"イ","text":"120"},{"label":"ウ","text":"18"},{"label":"エ","text":"720"}],"correct":"イ","hint":"nPr(6,3)=6×5×4=120であり、r回だけnを1ずつ減らしながら掛け合わせていく処理である。","code":"○整数型: 手続き nPr(整数型: n, 整数型: r)\n  if (r = 0) then\n      return 1\n  else\n      return n × nPr(n - 1, r - 1)\n  endif"},{"id":19,"cat":"再帰処理","topic":"累積引数(アキュムレータ)を使った末尾再帰のべき乗計算","q":"次の疑似言語で定義された手続きpowerAccは、累積引数accに計算途中の値を蓄積しながらべき乗を求める(末尾再帰)。powerAcc(2, 5, 1)の戻り値はどれか。","choices":[{"label":"ア","text":"16"},{"label":"イ","text":"64"},{"label":"ウ","text":"32"},{"label":"エ","text":"10"}],"correct":"ウ","hint":"accにbaseを掛けながらexpを1ずつ減らしていくため、acc=1×2×2×2×2×2=32となり、2^5=32が求まる。","code":"○整数型: 手続き powerAcc(整数型: base, 整数型: exp, 整数型: acc)\n  if (exp = 0) then\n      return acc\n  else\n      return powerAcc(base, exp - 1, acc × base)\n  endif"},{"id":20,"cat":"再帰処理","topic":"レコード配列を対象とした再帰的な集計処理","q":"生徒の氏名(name)と得点(score)を持つレコード型の配列Students ← {(\"A\",78), (\"B\",92), (\"C\",65), (\"D\",88)}(要素数4)に対し、次の疑似言語で定義された手続きsumScoreを呼び出す。sumScore(Students, 1)の戻り値はどれか。","choices":[{"label":"ア","text":"243"},{"label":"イ","text":"78"},{"label":"ウ","text":"230"},{"label":"エ","text":"323"}],"correct":"エ","hint":"各生徒のscoreフィールドを添字1から順に加算していくと、78+92+65+88=323になる。","code":"○整数型: 手続き sumScore(レコード型の配列: Students, 整数型: i)\n  if (i > Studentsの要素数) then\n      return 0\n  else\n      return Students[i].score + sumScore(Students, i + 1)\n  endif"},{"id":21,"cat":"再帰処理","topic":"再帰による最大公約数と呼び出し回数の複合トレース","q":"次の疑似言語で定義された手続きgcdについて、gcd(60, 24)を呼び出したときの戻り値と、発生する関数呼び出しの総回数(最初の呼び出しを含む)の組合せはどれか。","choices":[{"label":"ア","text":"戻り値=12, 呼び出し回数=4回"},{"label":"イ","text":"戻り値=12, 呼び出し回数=3回"},{"label":"ウ","text":"戻り値=6, 呼び出し回数=3回"},{"label":"エ","text":"戻り値=12, 呼び出し回数=2回"}],"correct":"イ","hint":"gcd(60,24)→gcd(24,12)→gcd(12,0)=12の順に呼び出され、最大公約数12を求めるのに合計3回の呼び出しが発生する。","code":"○整数型: 手続き gcd(整数型: a, 整数型: b)\n  if (b = 0) then\n      return a\n  else\n      return gcd(b, a mod b)\n  endif"},{"id":22,"cat":"再帰処理","topic":"再帰による回文(パリンドローム)判定","q":"次の疑似言語で定義された手続きisPalindromeは、文字列が前後どちらから読んでも同じ並びになっているかを再帰的に判定する(sの1文字目をs[1]、末尾の1文字をs[末尾]、両端を除いた部分文字列をs[2..末尾-1]と表す)。isPalindrome(\"LEVEL\")の戻り値はどれか。","choices":[{"label":"ア","text":"false"},{"label":"イ","text":"エラーになる"},{"label":"ウ","text":"true"},{"label":"エ","text":"\"LEVEL\""}],"correct":"ウ","hint":"L-E-V-E-Lは前から読んでも後ろから読んでも同じ並びであるため、再帰的に両端の文字を比較し続けた結果、最終的にtrueが返る。","code":"○論理型: 手続き isPalindrome(文字列型: s)\n  if (sの文字数 ≤ 1) then\n      return true\n  endif\n  if (s[1] ≠ s[末尾]) then\n      return false\n  endif\n  return isPalindrome(s[2..末尾-1])"},{"id":23,"cat":"再帰処理","topic":"再帰関数の計算量とスタック使用量の理解","q":"上記のisPalindrome(文字列型s)を、文字数が非常に多い文字列(例えば10万文字)に適用した場合に懸念される問題として適切なものはどれか。","choices":[{"label":"ア","text":"計算結果が必ず不正確になる"},{"label":"イ","text":"戻り値の型が自動的に変化する"},{"label":"ウ","text":"文字列の内容が自動的に書き換えられる"},{"label":"エ","text":"再帰の深さが文字数の半分程度に達し、スタックオーバーフローを引き起こす可能性がある"}],"correct":"エ","hint":"各再帰呼び出しで両端を1文字ずつ削っていくため、再帰の深さは文字数のおよそ半分に達し、非常に長い文字列では深い再帰によるスタックオーバーフローのリスクが生じる。"},{"id":24,"cat":"ソートアルゴリズム","topic":"クイックソートの分割(パーティション)処理のトレース","q":"配列A ← {6, 2, 8, 5, 9, 1}に対し、末尾の要素(1)をピボットとしてクイックソートの分割処理を1回実行した。ピボットより小さい要素を前方に集め、最後にピボットを適切な位置へ移動させた直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{2, 1, 8, 5, 9, 6}"},{"label":"イ","text":"{1, 2, 8, 5, 9, 6}"},{"label":"ウ","text":"{6, 2, 8, 5, 9, 1}"},{"label":"エ","text":"{1, 6, 2, 8, 5, 9}"}],"correct":"イ","hint":"ピボット1より小さい要素は配列内に存在しないため、1は先頭(添字1)に移動し、他の要素の相対順序は走査順のまま後方に押し出される。","code":"○整数型: 手続き partition(整数型の配列: A, 整数型: lo, 整数型: hi)\n  ○整数型: pivot ← A[hi]\n  ○整数型: i ← lo - 1\n  for (j を lo から hi - 1 まで 1 ずつ増やす)\n      if (A[j] ≤ pivot) then\n          i ← i + 1\n          (A[i]とA[j]を交換)\n      endif\n  endfor\n  (A[i+1]とA[hi]を交換)\n  return i + 1"},{"id":25,"cat":"ソートアルゴリズム","topic":"マージソートのマージ処理のトレース","q":"整列済みの2つの部分配列Left ← {2, 5, 9}とRight ← {3, 4, 7}をマージソートのマージ処理で1つの整列済み配列に統合した結果はどれか。","choices":[{"label":"ア","text":"{2, 3, 5, 4, 7, 9}"},{"label":"イ","text":"{2, 3, 4, 5, 7, 9}"},{"label":"ウ","text":"{3, 4, 7, 2, 5, 9}"},{"label":"エ","text":"{2, 5, 9, 3, 4, 7}"}],"correct":"イ","hint":"両方の配列の先頭同士を比較し、小さい方を順に取り出していくことで、{2,3,4,5,7,9}という整列済み配列が得られる。","code":"○整数型の配列: 手続き merge(整数型の配列: Left, 整数型の配列: Right)\n  (LeftとRightの先頭同士を比較し、小さい方から順に結果配列へ格納していく)"},{"id":26,"cat":"ソートアルゴリズム","topic":"挿入ソートの比較回数のカウント","q":"配列A ← {5, 2, 4, 6, 1, 3}に挿入ソートを適用して完全に整列させる場合、要素の挿入位置を決めるために行われる比較(隣接要素との大小判定)の総回数はどれか。","choices":[{"label":"ア","text":"5回"},{"label":"イ","text":"6回"},{"label":"ウ","text":"15回"},{"label":"エ","text":"12回"}],"correct":"エ","hint":"各要素を挿入すべき位置までスライドさせる際の比較を全て数えると、合計12回の比較が発生する。","code":"○整数型の配列: A ← {5, 2, 4, 6, 1, 3}\nfor (i を 2 から 6 まで 1 ずつ増やす)\n    ○整数型: key ← A[i]\n    ○整数型: j ← i - 1\n    while (j ≥ 1 and A[j] > key)\n        A[j + 1] ← A[j]\n        j ← j - 1\n    endwhile\n    A[j + 1] ← key\nendfor"},{"id":27,"cat":"ソートアルゴリズム","topic":"交換フラグによるバブルソートの早期終了","q":"次の疑似言語は、1パス内で1回も交換が発生しなかった場合にソート済みと判断して処理を打ち切る改良版バブルソートである。配列A ← {1, 2, 3, 5, 4}(要素数5)に適用した場合、実際に実行されるパスの回数はどれか。","choices":[{"label":"ア","text":"2回"},{"label":"イ","text":"4回"},{"label":"ウ","text":"1回"},{"label":"エ","text":"5回"}],"correct":"ア","hint":"1パス目で(5,4)のみ交換が発生し{1,2,3,4,5}になる。2パス目は交換が1回も発生しないため、そこで打ち切られ、実行されるパスは合計2回となる。","code":"○整数型の配列: A ← {1, 2, 3, 5, 4}\nfor (p を 1 から 4 まで 1 ずつ増やす)\n    ○論理型: swapped ← false\n    for (i を 1 から 5 - p まで 1 ずつ増やす)\n        if (A[i] > A[i + 1]) then\n            (A[i]とA[i+1]を交換)\n            swapped ← true\n        endif\n    endfor\n    if (swapped = false) then\n        (ループを抜ける)\n    endif\nendfor"},{"id":28,"cat":"ソートアルゴリズム","topic":"クイックソート全体の再帰トレース(最終結果)","q":"配列A ← {6, 2, 8, 5, 9, 1}に対して、末尾要素をピボットとするクイックソートを再帰的に最後まで適用した場合の最終的な整列結果はどれか。","choices":[{"label":"ア","text":"{1, 2, 6, 5, 8, 9}"},{"label":"イ","text":"{1, 2, 5, 6, 8, 9}"},{"label":"ウ","text":"{9, 8, 6, 5, 2, 1}"},{"label":"エ","text":"{6, 2, 8, 5, 9, 1}"}],"correct":"イ","hint":"分割統治で部分配列ごとに再帰的に分割・整列を繰り返すことで、最終的に{1,2,5,6,8,9}という完全な昇順配列が得られる。","code":"○整数型の配列: 手続き quickSort(整数型の配列: A, 整数型: lo, 整数型: hi)\n  if (lo < hi) then\n      ○整数型: p ← partition(A, lo, hi)\n      quickSort(A, lo, p - 1)\n      quickSort(A, p + 1, hi)\n  endif\n  return A"},{"id":29,"cat":"ソートアルゴリズム","topic":"ソートの安定性の判定(レコード配列)","q":"キー(key)フィールドを持つレコード配列Data ← {(\"A\",3), (\"B\",1), (\"C\",3), (\"D\",2), (\"E\",1)}(要素数5)を、キーの昇順で安定ソートした場合の結果として正しいものはどれか。","choices":[{"label":"ア","text":"(\"A\",3), (\"C\",3), (\"D\",2), (\"B\",1), (\"E\",1)"},{"label":"イ","text":"(\"E\",1), (\"B\",1), (\"D\",2), (\"C\",3), (\"A\",3)"},{"label":"ウ","text":"(\"B\",1), (\"E\",1), (\"D\",2), (\"C\",3), (\"A\",3)"},{"label":"エ","text":"(\"B\",1), (\"E\",1), (\"D\",2), (\"A\",3), (\"C\",3)"}],"correct":"エ","hint":"安定ソートでは同じキー値(1どうし、3どうし)を持つ要素の元の相対順序が保たれるため、\"B\"は\"E\"より前、\"A\"は\"C\"より前のままとなる。","code":"(安定ソートは、同じキー値を持つ要素同士の元の出現順序を並び替え後も維持する)"},{"id":30,"cat":"ソートアルゴリズム","topic":"クイックソートの最悪計算量が生じる条件","q":"クイックソートで常に配列の末尾要素をピボットとして選ぶ実装において、あらかじめ昇順に整列済みの配列を入力した場合に生じる問題として適切なものはどれか。","choices":[{"label":"ア","text":"ピボットの選択自体が実行時エラーになる"},{"label":"イ","text":"分割のたびに一方の部分配列が空になり、再帰の深さがnに達して最悪計算量O(n²)になる"},{"label":"ウ","text":"整列済みの配列は入力として受け付けられない"},{"label":"エ","text":"常に配列がちょうど半分に分割され、最良の計算量になる"}],"correct":"イ","hint":"整列済み配列で末尾要素をピボットに選ぶと、毎回ピボットが最大値になり分割が偏るため、平均計算量O(n log n)ではなく最悪計算量O(n²)に陥る。"},{"id":31,"cat":"探索アルゴリズム","topic":"レコード配列に対する線形探索","q":"商品名(name)と価格(price)を持つレコード型の配列Products ← {(\"apple\",120), (\"banana\",80), (\"cherry\",300), (\"durian\",900)}(要素数4)に対して、name=\"cherry\"となる要素を先頭から順に線形探索する。何番目の要素で一致が見つかるか(先頭を1番目とする)。","choices":[{"label":"ア","text":"4番目"},{"label":"イ","text":"3番目"},{"label":"ウ","text":"1番目"},{"label":"エ","text":"2番目"}],"correct":"イ","hint":"Products[3].name=\"cherry\"であるため、3番目の要素で一致が見つかる。","code":"(Products[1]から順にnameフィールドとkey=\"cherry\"を比較していく)"},{"id":32,"cat":"探索アルゴリズム","topic":"レコード配列に対する二分探索(idフィールドで整列済み)","q":"idフィールドの値で昇順に整列済みのレコード型配列Records ← {(101,\"A\"), (205,\"B\"), (330,\"C\"), (412,\"D\"), (560,\"E\"), (677,\"F\")}(要素数6)に対してid=412を二分探索するとき、最初に比較されるレコードのidの値はどれか。","choices":[{"label":"ア","text":"560"},{"label":"イ","text":"205"},{"label":"ウ","text":"412"},{"label":"エ","text":"330"}],"correct":"エ","hint":"中央の添字は(1+6)÷2=3(切り捨て)であり、Records[3].id=330が最初の比較対象になる。","code":"(中央位置 = (1+6) を 2 で割った値(小数点以下切り捨て) を添字として最初の比較を行う)"},{"id":33,"cat":"探索アルゴリズム","topic":"ハッシュ関数によるバケット位置の計算","q":"ハッシュ表(バケット数10)において、キーの値をバケット数で割った余りをハッシュ値として格納位置を決定する方式を採用している。キー273を格納するバケット番号(0始まり)はどれか。","choices":[{"label":"ア","text":"27"},{"label":"イ","text":"0"},{"label":"ウ","text":"3"},{"label":"エ","text":"7"}],"correct":"ウ","hint":"273 mod 10 = 3であるため、バケット番号3に格納される。","code":"○整数型: 手続き hash(整数型: key, 整数型: tableSize)\n  return key mod tableSize"},{"id":34,"cat":"探索アルゴリズム","topic":"ハッシュ表における衝突の発生","q":"上記のhash関数(バケット数10)を用いてキー273とキー456を格納しようとした場合の挙動として正しいものはどれか。","choices":[{"label":"ア","text":"両方とも同じバケットに格納され、衝突が発生する"},{"label":"イ","text":"ハッシュ表のサイズが自動的に拡張される"},{"label":"ウ","text":"hash(273,10)=3、hash(456,10)=6となり、異なるバケットに格納されるため衝突しない"},{"label":"エ","text":"キー456は格納できずエラーになる"}],"correct":"ウ","hint":"273 mod 10=3、456 mod 10=6であり、異なるバケット番号となるため、この2つのキーの間では衝突は発生しない。"},{"id":35,"cat":"探索アルゴリズム","topic":"番兵(センチネル)を用いた線形探索の工夫","q":"線形探索を実装する際、配列の末尾にあらかじめkeyと同じ値(番兵)を追加しておくことで得られる効果として適切なものはどれか。","choices":[{"label":"ア","text":"探索結果が必ず正しくなる(番兵がなくても正しい結果は得られる)"},{"label":"イ","text":"二分探索と同じ計算量に改善される"},{"label":"ウ","text":"配列のサイズが自動的に縮小する"},{"label":"エ","text":"ループ内で「配列の範囲外に達していないか」の判定を省略でき、比較回数を減らせる"}],"correct":"エ","hint":"番兵により必ずどこかで一致が保証されるため、範囲外チェックの条件を省略でき、ループ内の比較回数を実質的に減らせる。"},{"id":36,"cat":"探索アルゴリズム","topic":"二分探索木における探索経路のトレース","q":"5, 3, 8, 1, 4, 7, 9の順に値を二分探索木へ挿入した(小さい値は左、大きい値は右の子として配置)。この木に対して値7を探索する際にたどるノードの順序はどれか。","choices":[{"label":"ア","text":"5 → 8 → 7"},{"label":"イ","text":"5 → 3 → 7"},{"label":"ウ","text":"5 → 8 → 9 → 7"},{"label":"エ","text":"5 → 4 → 7"}],"correct":"ア","hint":"根(5)と比較し7の方が大きいので右の子(8)へ、次に8と比較し7の方が小さいので左の子(7)へ進み、一致する。","code":"(挿入順5,3,8,1,4,7,9により構築された二分探索木において、根から値7を探索する)"},{"id":37,"cat":"探索アルゴリズム","topic":"探索アルゴリズムの適用場面の判断","q":"頻繁にデータの追加・削除が発生し、かつ高速な検索も必要とされる場面で、配列を使った二分探索よりもハッシュ表による探索が適しているとされる主な理由はどれか。","choices":[{"label":"ア","text":"配列の挿入・削除は要素のシフトに伴うコストが大きいが、ハッシュ表は平均的に定数時間(O(1))での操作が期待できるため"},{"label":"イ","text":"二分探索は整列済みでなくても動作するため"},{"label":"ウ","text":"ハッシュ表は必ずメモリ使用量が配列より少ないため"},{"label":"エ","text":"配列は探索以外の操作を一切サポートしないため"}],"correct":"ア","hint":"二分探索は整列済み配列を前提とするため挿入・削除のたびに整列を維持するコストがかかるが、ハッシュ表は衝突が少なければ追加・削除・探索いずれも平均O(1)で行える。"},{"id":38,"cat":"文字列処理","topic":"文字列の長さを数える処理(新数値)","q":"文字列s ← \"ALGORITHM\"の文字数はどれか。","choices":[{"label":"ア","text":"10"},{"label":"イ","text":"8"},{"label":"ウ","text":"7"},{"label":"エ","text":"9"}],"correct":"エ","hint":"A-L-G-O-R-I-T-H-Mの9文字から構成される文字列である。","code":"○文字列型: s ← \"ALGORITHM\""},{"id":39,"cat":"文字列処理","topic":"条件を満たす文字のカウント","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか(sのi番目の文字はs[i]で表す)。文字列sは\"BANANA\"であり、文字\"A\"の出現回数を数える。","choices":[{"label":"ア","text":"3"},{"label":"イ","text":"2"},{"label":"ウ","text":"4"},{"label":"エ","text":"6"}],"correct":"ア","hint":"\"BANANA\"の中で\"A\"は3回(2番目、4番目、6番目)出現するため、countは3になる。","code":"○文字列型: s ← \"BANANA\"\n○整数型: count ← 0\nfor (i を 1 から 6 まで 1 ずつ増やす)\n    if (s[i] = \"A\") then\n        count ← count + 1\n    endif\nendfor"},{"id":40,"cat":"スタック・キュー","topic":"キューのenqueue/dequeue操作のトレース(新数値)","q":"空のキューに対してenqueue(A), enqueue(B), enqueue(C), dequeue(), enqueue(D), dequeue()の順に操作を行った直後の、キューの中身を先頭から順に並べたものはどれか。","choices":[{"label":"ア","text":"C, D"},{"label":"イ","text":"B, C, D"},{"label":"ウ","text":"D, C"},{"label":"エ","text":"A, B, C, D"}],"correct":"ア","hint":"enqueueでA,B,Cが入り[A,B,C]。dequeue()でAが取り出され[B,C]。enqueue Dで[B,C,D]。2回目のdequeue()でBが取り出され[C,D]になる。","code":"(キューはFIFO(先入れ先出し)の構造である)"},{"id":41,"cat":"情報セキュリティ","topic":"ランサムウェアの識別","q":"感染したコンピュータ内のファイルを勝手に暗号化し、復号と引き換えに金銭を要求する不正プログラムはどれか。","choices":[{"label":"ア","text":"ランサムウェア"},{"label":"イ","text":"アドウェア"},{"label":"ウ","text":"キーロガー"},{"label":"エ","text":"スパイウェア"}],"correct":"ア","hint":"身代金(ランサム)を要求することからこの名がついており、バックアップの確保が有効な対策となる。"},{"id":42,"cat":"情報セキュリティ","topic":"クロスサイトスクリプティング(XSS)の識別","q":"Webサイトの入力フォーム等に悪意のあるスクリプトを埋め込み、他の利用者のブラウザ上でそのスクリプトを実行させる攻撃はどれか。","choices":[{"label":"ア","text":"ブルートフォース攻撃"},{"label":"イ","text":"DoS攻撃"},{"label":"ウ","text":"クロスサイトスクリプティング(XSS)"},{"label":"エ","text":"SQLインジェクション"}],"correct":"ウ","hint":"入力値のサニタイジング(エスケープ処理)が主要な対策となる。"},{"id":43,"cat":"情報セキュリティ","topic":"ソーシャルエンジニアリングの識別","q":"技術的手段によらず、電話や対面での会話などを通じて人の心理的な隙や信頼を悪用し、パスワード等の重要情報を聞き出す手口を何と呼ぶか。","choices":[{"label":"ア","text":"マルウェア感染"},{"label":"イ","text":"ブルートフォース攻撃"},{"label":"ウ","text":"ソーシャルエンジニアリング"},{"label":"エ","text":"フィッシング(偽サイトへの誘導が主体の手口)"}],"correct":"ウ","hint":"技術的な脆弱性ではなく、人間の心理的な隙を突く点が特徴であり、組織的な教育・啓発が対策となる。"},{"id":44,"cat":"情報セキュリティ","topic":"ワンタイムパスワードの効果","q":"一度だけ有効なパスワードを都度発行し、それを認証に用いることで、パスワードが漏えいしても再利用による不正ログインを防ぐ仕組みを何と呼ぶか。","choices":[{"label":"ア","text":"公開鍵暗号方式"},{"label":"イ","text":"ハッシュ関数"},{"label":"ウ","text":"ワンタイムパスワード(OTP)"},{"label":"エ","text":"シングルサインオン"}],"correct":"ウ","hint":"一定時間ごとに変化するコードや、使用のたびに新しく発行されるコードを用いることで、使い回しによる不正利用を防止する。"},{"id":45,"cat":"情報セキュリティ","topic":"ハッシュ関数の特徴","q":"入力データから固定長の値を生成し、同じ入力からは常に同じ値が得られるが、出力から元の入力を復元することが極めて困難な関数を何と呼ぶか。","choices":[{"label":"ア","text":"ハッシュ関数"},{"label":"イ","text":"公開鍵暗号(復号可能な暗号化方式)"},{"label":"ウ","text":"乱数生成器"},{"label":"エ","text":"共通鍵暗号(復号可能な暗号化方式)"}],"correct":"ア","hint":"パスワードの保管等で、元の値を直接保存せずハッシュ値のみを保存する用途で広く使われる。"},{"id":46,"cat":"情報セキュリティ","topic":"WAF(Web Application Firewall)の役割","q":"通常のファイアウォールでは検知が難しい、SQLインジェクションやクロスサイトスクリプティングなどWebアプリケーション層への攻撃を検知・遮断する仕組みはどれか。","choices":[{"label":"ア","text":"VPN"},{"label":"イ","text":"IDS(侵入検知システム、より広範な通信を監視する仕組み)"},{"label":"ウ","text":"プロキシサーバ"},{"label":"エ","text":"WAF(Web Application Firewall)"}],"correct":"エ","hint":"HTTPリクエストの内容を解析し、アプリケーション層特有の攻撃パターンを検知できる点が通常のファイアウォールとの違い。"},{"id":47,"cat":"情報セキュリティ","topic":"ゼロトラストの考え方","q":"社内ネットワークだからといって無条件に信頼せず、あらゆる通信・アクセスのたびに検証を行うセキュリティの考え方はどれか。","choices":[{"label":"ア","text":"ゼロトラスト"},{"label":"イ","text":"境界型防御(社内ネットワークを信頼する従来型の考え方)"},{"label":"ウ","text":"シングルサインオン"},{"label":"エ","text":"多層防御(層状に対策を重ねる別の考え方)"}],"correct":"ア","hint":"「決して信頼せず、常に検証する」という原則に基づき、社内・社外を問わずアクセスのたびに認証・認可を行う。"},{"id":48,"cat":"情報セキュリティ","topic":"マルウェア対策ソフトのパターンマッチングの限界","q":"既知のウイルスの特徴的なコードパターン(シグネチャ)と照合してマルウェアを検知する方式について、限界として挙げられることはどれか。","choices":[{"label":"ア","text":"ネットワーク通信を必要とせず動作しない"},{"label":"イ","text":"シグネチャが未登録の新種・亜種のマルウェアを検知できない場合がある"},{"label":"ウ","text":"検知率が常に100%である"},{"label":"エ","text":"あらゆる未知のマルウェアも確実に検知できる"}],"correct":"イ","hint":"この限界を補うため、ふるまい検知など既知パターンに依存しない検知手法が併用されることが多い。"},{"id":49,"cat":"情報セキュリティ","topic":"バックアップによるランサムウェア対策の考え方","q":"ランサムウェアによるファイル暗号化被害からの復旧手段として、日頃から重要データを定期的にバックアップしておくことが有効とされる理由はどれか。","choices":[{"label":"ア","text":"感染前の正常な状態のデータへ復元できれば、身代金を支払わずに被害から復旧できるため"},{"label":"イ","text":"バックアップを取ることでランサムウェアの感染自体を防止できるため"},{"label":"ウ","text":"バックアップデータは暗号化されることが絶対にないため"},{"label":"エ","text":"バックアップを取ると通信速度が向上するため"}],"correct":"ア","hint":"ただし、バックアップ自体も感染・破壊されないよう、ネットワークから分離した保管等の工夫が求められる。"},{"id":50,"cat":"情報セキュリティ","topic":"脆弱性診断の目的","q":"システムやWebアプリケーションに対して、既知の脆弱性が存在しないかを網羅的に検査する取組みを何と呼ぶか。","choices":[{"label":"ア","text":"脆弱性診断(セキュリティ診断)"},{"label":"イ","text":"負荷テスト"},{"label":"ウ","text":"ペネトレーションテスト(実際に侵入を試みて評価する、より攻撃的な検証手法)"},{"label":"エ","text":"ユーザビリティテスト"}],"correct":"ア","hint":"既知の脆弱性を体系的に洗い出し、悪用される前に対策を講じることを目的とする。"}];

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

function ReviewCopyBox({ missedList, lifetimeByCat }){
  const [copied, setCopied] = useState(false);

  const buildText = useCallback(()=>{
    const now = new Date();
    const ds = `${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const catGroup = {};
    missedList.forEach(q=>{ if(!catGroup[q.cat]) catGroup[q.cat]=[]; catGroup[q.cat].push(q); });
    const lines = [
      `📝 FE科目B 復習リスト ${ds}`,
      `間違えた問題: ${missedList.length}問`,
      `---`,
    ];
    Object.entries(catGroup).forEach(([cat, qs])=>{
      // 分野別の正解率は「累計(生涯)」の実績を使う。今回の周回だけの一時的な
      // 集計だと、ページを開き直した直後は0%になってしまうため。
      const st = lifetimeByCat[cat];
      const pct = st && st.total>0 ? Math.round(st.ok/st.total*100) : null;
      const pctLabel = pct===null ? "累計データなし" : `累計正解率 ${pct}%`;
      lines.push(`\n■ ${cat}（${pctLabel}）`);
      qs.forEach((q,i)=>{
        const cc = q.choices.find(c=>c.label===q.correct);
        lines.push(`Q: ${q.q}`);
        if(q.code) lines.push(`[疑似言語]\n${q.code}`);
        lines.push(`A: ${q.correct}. ${cc?.text}`);
        lines.push(`解説: ${q.hint}`);
        if(i < qs.length-1) lines.push("");
      });
    });
    return lines.join("\n");
  },[missedList, lifetimeByCat]);

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

export default function AppB(){
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
  const [savedSessions, setSavedSessions] = useState([]);
  const [lifetime, setLifetime] = useState({totalAnswered:0,totalCorrect:0,byCat:{}});
  const [missedList, setMissedList] = useState([]);
  const [catStats, setCatStats] = useState({});
  const [isWeakSession, setIsWeakSession] = useState(false);
  const [copyText, setCopyText] = useState("");
  const [copied, setCopied] = useState(false);
  const [progressLoading, setProgressLoading] = useState(true);
  const [progressError, setProgressError] = useState("");

  // 起動時にlocalStorageから進捗・履歴を復元
  useEffect(()=>{
    // 問題内容(分野構成を含む)が前回と変わっていないかを確認する。変わっていた場合、
    // 古い周回進捗・復習リストは今の分野構成と対応しなくなるため自動的にクリアする
    // (生涯累計・セッション履歴は分野構成が変わっても意味を持つ記録のため維持する)。
    const currentSignature = ALL_QUESTIONS.length + ":" + ALL_QUESTIONS.map(q=>q.id+"-"+q.cat).join(",");
    let storedSignature = null;
    try{ storedSignature = localStorage.getItem(LS_QVERSION); }catch(e){}
    const contentChanged = storedSignature !== null && storedSignature !== currentSignature;
    if(contentChanged){
      try{
        localStorage.removeItem(LS_USED);
        localStorage.removeItem(LS_CYCLE);
        localStorage.removeItem(LS_MISSED);
      }catch(e){}
    }
    try{ localStorage.setItem(LS_QVERSION, currentSignature); }catch(e){}

    const ids = contentChanged ? [] : store.loadIds().filter(id => ALL_QUESTIONS.some(q=>q.id===id));
    if(ids.length > 0){
      setUsedIds(ids);
      setProgressError(`✓ 今の周回で${ids.length}問に解答済み（残り${ALL_QUESTIONS.length-ids.length}問／全${ALL_QUESTIONS.length}問）`);
    } else if(contentChanged){
      setProgressError(`問題の分野構成が更新されました。周回・復習リストを初期化しました（累計成績は引き続き保持されています）。`);
    }
    // 過去のセッション履歴を復元(直近最大100件、表示専用)
    const saved = store.loadSessions();
    if(saved.length > 0) setSavedSessions(saved);
    // 生涯累計を復元(こちらは間引かれない真の累計)
    setLifetime(store.loadLifetime());
    // 復習リストを復元
    if(!contentChanged){
      const missed = store.loadMissed();
      if(missed.length > 0) setMissedList(missed);
    }
    // 今回の周回成績を復元(リロードしても消えない。usedIdsが空＝新しい周回なら
    // 古いcycleデータが残っていても無視して空から始める)
    if(ids.length > 0){
      const cyc = store.loadCycle();
      if(cyc.history && cyc.history.length > 0) setAllHistory(cyc.history);
      if(cyc.catStats) setCatStats(cyc.catStats);
    } else {
      store.clearCycle();
    }
    setProgressLoading(false);
  },[]); // eslint-disable-line

  // 残り問題数(分野フィルタ適用後)
  const available = ALL_QUESTIONS.filter(q=>{
    const catOk = cat==="すべて" || q.cat===cat;
    const notUsed = !usedIds.includes(q.id);
    return catOk && notUsed;
  });
  // 分子と同じ母集団の分母(科目Aと同じ修正)
  const catTotal = cat==="すべて" ? ALL_QUESTIONS.length : ALL_QUESTIONS.filter(q=>q.cat===cat).length;

  const saveUsedIds = useCallback((ids)=>{
    setUsedIds(ids);
    store.saveIds(ids);
  },[]);

  const startSession = useCallback(async()=>{
    let picked = [];
    const usingWeak = weakMode && weakIds.length > 0;
    setIsWeakSession(usingWeak);

    if(usingWeak){
      // 苦手優先：間違えた問題IDから優先出題
      const weakInAll = ALL_QUESTIONS.filter(q => weakIds.includes(q.id));
      const others = ALL_QUESTIONS.filter(q => !weakIds.includes(q.id) && (cat==="すべて" || q.cat===cat));
      const shuffledWeak = shuffle(weakInAll).slice(0, Math.min(10, weakInAll.length));
      const rest = shuffle(others).slice(0, Math.max(0, 10 - shuffledWeak.length));
      picked = shuffle([...shuffledWeak, ...rest]).slice(0, 10);
    } else {
      const base = ALL_QUESTIONS.filter(q=>(cat==="すべて"||q.cat===cat) && !usedIds.includes(q.id));
      if(base.length === 0){
        const fresh = ALL_QUESTIONS.filter(q=>cat==="すべて"||q.cat===cat);
        picked = shuffle(fresh).slice(0,10);
        saveUsedIds(picked.map(q=>q.id));
        // 全問題を1周し終えて新しい周回に入るため、今回の周回成績もリセットする
        setAllHistory([]); setCatStats({}); store.clearCycle();
      } else {
        // 残りが10問未満(周回の端数)の場合は、その残り分だけの少人数セッションにする。
        // 以前は残り10問未満で無条件に「周回終了」と誤判定し、周回の途中でも
        // 今の周回の成績を強制リセットしてしまうバグがあった。
        const sessionSize = Math.min(10, base.length);
        picked = shuffle(base).slice(0, sessionSize);
        saveUsedIds([...usedIds, ...picked.map(q=>q.id)]);
      }
    }

    setQuestions(picked);
    setAnswers(new Array(picked.length).fill(null));
    setQIdx(0); setChosen(null); setShowFb(false);
    setAnalysis(""); setCopyText(""); setCopied(false);
    setPhase("question");
  },[cat, usedIds, weakMode, weakIds, saveUsedIds]);

  const handleAnswer = useCallback((choice)=>{
    if(showFb) return;
    setChosen(choice); setShowFb(true);
    const q = questions[qIdx];
    const ok = choice.label===q.correct;
    // 苦手優先モードは既出問題を意図的に何度も再出題する復習用モードのため、
    // 「今の周回」の集計(allHistory/catStats)には含めない。
    if(!isWeakSession){
      setAllHistory(h=>{
        const updatedHistory=[...h,{cat:q.cat,topic:q.topic,correct:ok}];
        setCatStats(prev=>{
          const cur=prev[q.cat]||{ok:0,total:0};
          const updatedStats={...prev,[q.cat]:{ok:cur.ok+(ok?1:0),total:cur.total+1}};
          store.saveCycle({history:updatedHistory, catStats:updatedStats});
          return updatedStats;
        });
        return updatedHistory;
      });
    }
    if(!ok){
      setMissedList(m=>{
        const updated=[...m,q];
        store.saveMissed(updated);
        return updated;
      });
    }
    setAnswers(prev=>{const n=[...prev];n[qIdx]=choice.label;return n;});
  },[showFb,questions,qIdx,isWeakSession]);

  const handleNext = useCallback(()=>{
    const next=qIdx+1;
    if(next>=questions.length) setPhase("score");
    else{setQIdx(next);setChosen(null);setShowFb(false);}
  },[qIdx,questions.length]);

  const sessionCorrect = answers.filter((a,i)=>a!==null&&questions[i]&&a===questions[i].correct).length;


  useEffect(()=>{
    if(phase==="score"&&questions.length>0){
      if(copyText===""){
        const now=new Date();
        const ds=`${now.getFullYear()}/${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
        const correct=answers.filter((a,i)=>a!==null&&questions[i]&&a===questions[i].correct).length;
        const lines=[
          `📊 FE科目B クイズ結果 ${ds}`,
          `正解: ${correct}/${questions.length}問 (${Math.round(correct/questions.length*100)}%)`,
          `分野: ${[...new Set(questions.map(q=>q.cat))].join("・")}`,
          `---`,
          ...questions.map((q,i)=>`Q${i+1}[${q.cat}/${q.topic}] ${answers[i]===q.correct?"○":"✗"}`),
          `---`,
          `累計分野別:`,
          ...Object.entries(catStats).map(([c,s])=>`${c}: ${Math.round(s.ok/s.total*100)}% (${s.ok}/${s.total})`),
        ];
        setCopyText(lines.join("\n"));

        // このセッションの分野別集計を作りlocalStorageへ永続化する
        const sessionCats = {};
        questions.forEach((q,i)=>{
          if(!sessionCats[q.cat]) sessionCats[q.cat]={ok:0,total:0};
          sessionCats[q.cat].total+=1;
          if(answers[i]!==null && answers[i]===q.correct) sessionCats[q.cat].ok+=1;
        });
        const session={
          date: now.getTime(),
          cat: cat,
          total: questions.length,
          correct: correct,
          pct: Math.round(correct/questions.length*100),
          cats: sessionCats,
        };
        store.addSession(session);
        setSavedSessions(prev=>{
          const updated=[...prev, session];
          return updated.length>100 ? updated.slice(updated.length-100) : updated;
        });
        setLifetime(store.loadLifetime());
      }
    }
  },[phase]); // eslint-disable-line

  const loadDbHistory = useCallback(()=>{ /* localStorage版は履歴タブで直接表示 */ },[]);

  const clearDbMissed = useCallback(async()=>{
    if(!window.confirm("復習リストを全削除しますか？")) return;
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
  const clearMissed = useCallback(()=>{ setMissedList([]); store.saveMissed([]); },[]);

  // 「今の周回」の集計はallHistory(今の周回で回答した{cat,correct}の記録)から
  // 毎回計算し直す。allHistoryはusedIdsと必ず同じタイミングでリセットされるため
  // (store.clearCycle()を常に一緒に呼んでいる)、この2つの間にズレは生じない。
  // ※missedList(復習リスト)は周回をまたいで蓄積し続ける別物であり、
  // 「今の周回」の集計には使えない(前回、誤って使ってしまい負の値になるバグを出した)。
  const cycleStats = (()=>{
    const byCat = {};
    allHistory.forEach(h=>{
      if(!byCat[h.cat]) byCat[h.cat] = { ok:0, total:0 };
      byCat[h.cat].total += 1;
      if(h.correct) byCat[h.cat].ok += 1;
    });
    const totalAnswered = allHistory.length;
    const totalCorrect = allHistory.filter(h=>h.correct).length;
    return { byCat, totalAnswered, totalCorrect };
  })();
  const totalAnswered = cycleStats.totalAnswered;
  const totalCorrect = cycleStats.totalCorrect;
  const overallPct=totalAnswered>0?Math.round(totalCorrect/totalAnswered*100):0;

  return(
    <div style={s.app}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap');`}</style>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.h1}>FE 科目B Quiz</div>
          <div style={s.sub}>基本情報技術者 — 疑似言語・アルゴリズム問題</div>
          <a href="/" style={{display:"inline-block",marginTop:8,fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>← 科目Aの問題を解く</a>
          <a href="/b" style={{display:"inline-block",marginTop:8,fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>科目Bの問題を解く →</a>
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
                  <span style={s.spinner}/> <span style={{marginLeft:8}}>進捗を読み込み中…</span>
                </div>
              ) : (
                <div style={{marginBottom:12,fontSize:13,color:C.muted}}>
                  残り問題: <span style={s.stockBadge(available.length)}>{available.length}問</span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:8}}>/ {catTotal}問中{cat!=="すべて"?`（${cat}）`:""}</span>
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
                {weakMode ? "🎯 苦手優先モードでスタート" : `スタート（${Math.min(10, available.length===0?10:available.length)}問）`}
              </button>
              {/* 苦手優先モード切替 */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,padding:"10px 12px",background:weakMode?"rgba(63,185,80,.08)":"rgba(255,255,255,.03)",border:`1px solid ${weakMode?C.green:C.border}`,borderRadius:8,cursor:"pointer"}}
                onClick={async()=>{
                  const next = !weakMode;
                  setWeakMode(next);
                  if(next){
                    // localStorageの復習リストから苦手IDを取得
                    const ids = missedList.map(q=>q.id);
                    setWeakIds([...new Set(ids)]);
                  }
                }}>
                <div style={{width:36,height:20,background:weakMode?C.green:C.border,borderRadius:10,position:"relative",flexShrink:0,transition:"background .2s"}}>
                  <div style={{width:16,height:16,background:"white",borderRadius:"50%",position:"absolute",top:2,left:weakMode?18:2,transition:"left .2s"}}/>
                </div>
                <div>
                  <div style={{fontSize:13,color:weakMode?C.green:C.muted,fontWeight:weakMode?700:400}}>苦手優先モード</div>
                  <div style={{fontSize:11,color:C.muted}}>{weakMode && weakIds.length>0 ? `${weakIds.length}問を優先出題` : "復習リストの問題を優先"}</div>
                </div>
              </div>
              <button style={{width:"100%",padding:9,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",marginTop:8}}
                onClick={()=>{ if(window.confirm("使用済み問題をリセットして全問を出題可能にします。今回の周回成績もリセットされます。よろしいですか？")){ saveUsedIds([]); setAllHistory([]); setCatStats({}); store.clearCycle(); } }}>
                🔄 問題をリセット（全50問に戻す）
              </button>
              <button style={{width:"100%",padding:9,background:"none",border:`1px solid #7f1d1d`,color:"#f87171",borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",marginTop:8}}
                onClick={()=>{
                  if(!window.confirm("累計成績・履歴・復習リストを含む全てのデータを完全に削除します。これまでの学習記録は元に戻せません。本当によろしいですか？")) return;
                  if(!window.confirm("最終確認です。累計解答数・正解率など、これまでの記録は全て消えます。本当に実行しますか？")) return;
                  try{
                    localStorage.removeItem(LS_USED);
                    localStorage.removeItem(LS_SESSIONS);
                    localStorage.removeItem(LS_MISSED);
                    localStorage.removeItem(LS_LIFETIME);
                    localStorage.removeItem(LS_CYCLE);
                    localStorage.removeItem(LS_QVERSION);
                  }catch(e){}
                  window.location.reload();
                }}>
                🗑️ 完全リセット（累計成績も含めて全データ削除）
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
                  {q.code && (
                    <pre style={{background:"#0a0e14",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:14,fontFamily:"monospace",fontSize:13,lineHeight:1.7,color:"#c9d1d9",overflowX:"auto",whiteSpace:"pre"}}>{q.code}</pre>
                  )}
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
                <ReviewCopyBox missedList={missedList} lifetimeByCat={lifetime.byCat||{}}/>
                <button style={{width:"100%",padding:9,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,fontFamily:"inherit",fontSize:13,cursor:"pointer",marginBottom:16}} onClick={clearMissed}>復習リストをクリア</button>
                {missedList.map((q,i)=>{
                  const cc=q.choices.find(c=>c.label===q.correct);
                  return(
                    <div key={i} style={s.reviewItem}>
                      <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",marginBottom:4}}>{q.cat} / {q.topic}</div>
                      <div style={{fontSize:13,fontWeight:500,lineHeight:1.6,marginBottom:8}}>{q.q}</div>
                      {q.code && (
                        <pre style={{background:"#0a0e14",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",marginBottom:8,fontFamily:"monospace",fontSize:12,lineHeight:1.6,color:"#c9d1d9",overflowX:"auto",whiteSpace:"pre"}}>{q.code}</pre>
                      )}
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
                  <div style={s.statLabel}>{l}（今の周回）</div>
                </div>
              ))}
            </div>
            {Object.keys(cycleStats.byCat).length>0 && <>
              <div style={s.sectionTitle}>分野別 正解率（今の周回・{ALL_QUESTIONS.length}問を1周する間ずっと蓄積）</div>
              {Object.entries(cycleStats.byCat)
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

            {/* 累計成績(fe_lifetime基準、間引かれない真の累計)＋直近セッション一覧(表示専用) */}
            {(lifetime.totalAnswered > 0 || savedSessions.length > 0) && (()=>{
              const totalA = lifetime.totalAnswered;
              const totalC = lifetime.totalCorrect;
              const ovPct = totalA>0?Math.round(totalC/totalA*100):0;
              const aggCats = lifetime.byCat || {};
              return <>
                <div style={s.sectionTitle}>📦 累計（全セッション）</div>
                <div style={{display:"flex",gap:8,marginBottom:12}}>
                  {[["累計解答",totalA],["累計正解",totalC],["累計正解率",`${ovPct}%`]].map(([l,v],i)=>(
                    <div key={l} style={s.statBox}>
                      <div style={{...s.statNum,color:i===2?rateColor(ovPct):C.accent,fontSize:16}}>{v}</div>
                      <div style={s.statLabel}>{l}</div>
                    </div>
                  ))}
                </div>
                {Object.keys(aggCats).length>0 && <>
                  <div style={s.sectionTitle}>累計分野別正解率</div>
                  {Object.entries(aggCats)
                    .map(([c,st])=>({c,pct:Math.round(st.ok/st.total*100),ok:st.ok,total:st.total, legacy: !CATS.includes(c)}))
                    .sort((a,b)=>a.pct-b.pct)
                    .map(({c,pct,ok,total,legacy})=>(
                      <div key={c} style={s.catBarRow}>
                        <div style={{fontSize:12,width:140,flexShrink:0,lineHeight:1.3,color:legacy?C.muted:undefined}}>{c}{legacy?"（分野再編前の記録）":""}</div>
                        <div style={{flex:1,height:7,background:C.surface2,borderRadius:4,overflow:"hidden"}}>
                          <div style={{height:"100%",borderRadius:4,width:`${pct}%`,background:rateColor(pct),transition:"width .4s"}}/>
                        </div>
                        <div style={{fontFamily:"monospace",fontSize:12,width:72,textAlign:"right",color:rateColor(pct)}}>{pct}% ({ok}/{total})</div>
                      </div>
                    ))
                  }
                </>}
                <div style={s.sectionTitle}>直近のセッション（最新20件）</div>
                <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 13px",marginBottom:12}}>
                  {savedSessions.slice(-20).reverse().map((sess,i)=>{
                    const d=new Date(sess.date);
                    const ds=`${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
                    return(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:i<Math.min(savedSessions.length,20)-1?`1px solid ${C.border}`:"none"}}>
                        <span style={{fontSize:12,color:C.muted,fontFamily:"monospace"}}>{ds} ・ {sess.cat}</span>
                        <span style={{fontFamily:"monospace",fontSize:13,fontWeight:600,color:rateColor(sess.pct)}}>{sess.correct}/{sess.total}</span>
                      </div>
                    );
                  })}
                </div>
                <button style={{width:"100%",padding:9,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer"}}
                  onClick={()=>{ if(window.confirm("直近のセッション一覧のみ削除します(累計成績は消えません)。よろしいですか？")){ localStorage.removeItem("feb_sessions"); setSavedSessions([]); } }}>
                  直近セッション一覧をクリア
                </button>
              </>;
            })()}
            {totalAnswered===0 && savedSessions.length===0 && <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:"12px 0"}}>クイズに挑戦すると履歴が表示されます。</div>}
          </div>
        )}
      </div>
    </div>
  );
}
