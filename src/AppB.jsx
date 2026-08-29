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

const ALL_QUESTIONS = [{"id":1,"cat":"順次・分岐処理","topic":"変数の入れ替え(第2弾)","q":"次の疑似言語プログラムを実行した直後のaとbの値の組合せはどれか。","choices":[{"label":"ア","text":"a=7, b=7"},{"label":"イ","text":"a=12, b=7"},{"label":"ウ","text":"a=12, b=12"},{"label":"エ","text":"a=7, b=12"}],"correct":"エ","hint":"tに退避したaの値(12)を最後にbへ代入するため、a=7, b=12となる。","code":"○整数型: a ← 12\n○整数型: b ← 7\n○整数型: t\nt ← a\na ← b\nb ← t"},{"id":2,"cat":"順次・分岐処理","topic":"if-elseif-else文のトレース(第2弾)","q":"次の疑似言語プログラムを実行したとき、gradeに代入される値はどれか。","choices":[{"label":"ア","text":"\"C\""},{"label":"イ","text":"\"S\""},{"label":"ウ","text":"\"A\""},{"label":"エ","text":"\"B\""}],"correct":"ウ","hint":"scoreは90未満だが80以上なので、2番目の条件が成立しgradeは\"A\"になる。","code":"○整数型: score ← 85\n○文字列型: grade\nif (score ≥ 90) then\n    grade ← \"S\"\nelseif (score ≥ 80) then\n    grade ← \"A\"\nelseif (score ≥ 70) then\n    grade ← \"B\"\nelse\n    grade ← \"C\"\nendif"},{"id":3,"cat":"順次・分岐処理","topic":"ネストしたif文のトレース(第2弾)","q":"次の疑似言語プログラムを実行したとき、resultに代入される値はどれか。","choices":[{"label":"ア","text":"2"},{"label":"イ","text":"4"},{"label":"ウ","text":"3"},{"label":"エ","text":"1"}],"correct":"ア","hint":"x>yは真(8>3)。x-y=5は10を超えないため、内側のelse節が実行されresultは2になる。","code":"○整数型: x ← 8\n○整数型: y ← 3\n○整数型: result\nif (x > y) then\n    if (x - y > 10) then\n        result ← 1\n    else\n        result ← 2\n    endif\nelse\n    result ← 3\nendif"},{"id":4,"cat":"順次・分岐処理","topic":"論理和(or)を使った条件式のトレース","q":"次の疑似言語プログラムを実行したとき、resultに代入される値はどれか。","choices":[{"label":"ア","text":"エラーになる"},{"label":"イ","text":"\"T\""},{"label":"ウ","text":"\"F\""},{"label":"エ","text":"\"TF\""}],"correct":"イ","hint":"x>0は偽だがy>0は真であり、or条件は一方が真であれば全体が真となるためresultは\"T\"になる。","code":"○整数型: x ← -3\n○整数型: y ← 5\n○文字列型: result\nif (x > 0 or y > 0) then\n    result ← \"T\"\nelse\n    result ← \"F\"\nendif"},{"id":5,"cat":"順次・分岐処理","topic":"複合条件のnotのトレース","q":"次の疑似言語プログラムを実行したとき、resultに代入される値はどれか。","choices":[{"label":"ア","text":"\"0\""},{"label":"イ","text":"\"対象\""},{"label":"ウ","text":"\"対象外\""},{"label":"エ","text":"\"15\""}],"correct":"イ","hint":"15 mod 3は0であり、(n mod 3 = 0)は真。それをnotで反転すると偽になるためelse節が実行される。","code":"○整数型: n ← 15\n○文字列型: result\nif (not (n mod 3 = 0)) then\n    result ← \"対象外\"\nelse\n    result ← \"対象\"\nendif"},{"id":6,"cat":"順次・分岐処理","topic":"剰余演算子を使った分類のトレース","q":"次の疑似言語プログラムを実行したとき、resultに代入される値はどれか。","choices":[{"label":"ア","text":"\"両方\""},{"label":"イ","text":"\"3の倍数\""},{"label":"ウ","text":"\"該当なし\""},{"label":"エ","text":"\"5の倍数\""}],"correct":"ア","hint":"15は15で割り切れるため、最初の条件が成立し\"両方\"になる(3や5の判定より先に評価される)。","code":"○整数型: n ← 15\n○文字列型: result\nif (n mod 15 = 0) then\n    result ← \"両方\"\nelseif (n mod 3 = 0) then\n    result ← \"3の倍数\"\nelseif (n mod 5 = 0) then\n    result ← \"5の倍数\"\nelse\n    result ← \"該当なし\"\nendif"},{"id":7,"cat":"繰返し処理","topic":"forループによる合計計算(第2弾)","q":"次の疑似言語プログラムを実行した直後のsumの値はどれか。","choices":[{"label":"ア","text":"28"},{"label":"イ","text":"45"},{"label":"ウ","text":"8"},{"label":"エ","text":"36"}],"correct":"エ","hint":"1+2+3+4+5+6+7+8=36である。","code":"○整数型: sum ← 0\nfor (i を 1 から 8 まで 1 ずつ増やす)\n    sum ← sum + i\nendfor"},{"id":8,"cat":"繰返し処理","topic":"forループによる積の計算(第2弾)","q":"次の疑似言語プログラムを実行した直後のprodの値はどれか。","choices":[{"label":"ア","text":"15"},{"label":"イ","text":"24"},{"label":"ウ","text":"120"},{"label":"エ","text":"60"}],"correct":"ウ","hint":"1×1×2×3×4×5=120であり、これは5の階乗(5!)に等しい。","code":"○整数型: prod ← 1\nfor (i を 1 から 5 まで 1 ずつ増やす)\n    prod ← prod × i\nendfor"},{"id":9,"cat":"繰返し処理","topic":"whileループと整数除算のトレース(第2弾)","q":"次の疑似言語プログラム(÷は小数点以下切り捨ての整数除算とする)を実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"3"},{"label":"イ","text":"4"},{"label":"ウ","text":"5"},{"label":"エ","text":"50"}],"correct":"ア","hint":"50÷3=16(1回目)、16÷3=5(2回目)、5÷3=1(3回目)でn=1となりwhile(n>1)が偽になるため、countは3になる。","code":"○整数型: n ← 50\n○整数型: count ← 0\nwhile (n > 1)\n    n ← n ÷ 3\n    count ← count + 1\nendwhile"},{"id":10,"cat":"繰返し処理","topic":"for文の減少ループと条件付き合計(第2弾)","q":"次の疑似言語プログラムを実行した直後のsumの値はどれか。","choices":[{"label":"ア","text":"36"},{"label":"イ","text":"15"},{"label":"ウ","text":"45"},{"label":"エ","text":"60"}],"correct":"ウ","hint":"15から1のうち3の倍数は3,6,9,12,15であり、合計は3+6+9+12+15=45である。","code":"○整数型: sum ← 0\nfor (i を 15 から 1 まで 1 ずつ減らす)\n    if (i mod 3 = 0) then\n        sum ← sum + i\n    endif\nendfor"},{"id":11,"cat":"繰返し処理","topic":"二重ループの反復回数(第2弾)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"5"},{"label":"イ","text":"4"},{"label":"ウ","text":"9"},{"label":"エ","text":"20"}],"correct":"エ","hint":"外側4回×内側5回で、countは4×5=20回加算される。","code":"○整数型: count ← 0\nfor (i を 1 から 4 まで 1 ずつ増やす)\n    for (j を 1 から 5 まで 1 ずつ増やす)\n        count ← count + 1\n    endfor\nendfor"},{"id":12,"cat":"繰返し処理","topic":"do-while文(後判定ループ)のトレース(第2弾)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"7"},{"label":"イ","text":"6"},{"label":"ウ","text":"50"},{"label":"エ","text":"5"}],"correct":"イ","hint":"x: 1→2→4→8→16→32→64。x=64になった時点(6回目)で64<50が偽となり終了するため、countは6になる。","code":"○整数型: x ← 1\n○整数型: count ← 0\ndo\n    x ← x × 2\n    count ← count + 1\nwhile (x < 50)"},{"id":13,"cat":"繰返し処理","topic":"forループと5の倍数の合計(第2弾)","q":"次の疑似言語プログラムを実行した直後のsumの値はどれか。","choices":[{"label":"ア","text":"40"},{"label":"イ","text":"60"},{"label":"ウ","text":"50"},{"label":"エ","text":"75"}],"correct":"ウ","hint":"1から20のうち5の倍数は5,10,15,20であり、合計は5+10+15+20=50である。","code":"○整数型: sum ← 0\nfor (i を 1 から 20 まで 1 ずつ増やす)\n    if (i mod 5 = 0) then\n        sum ← sum + i\n    endif\nendfor"},{"id":14,"cat":"繰返し処理","topic":"forループの増分パターンの理解(第2弾)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"11"},{"label":"イ","text":"9"},{"label":"ウ","text":"10"},{"label":"エ","text":"100"}],"correct":"ア","hint":"iは100,90,80,...,10,0の11個の値を取るため、countは11になる。","code":"○整数型: count ← 0\nfor (i を 100 から 0 まで 10 ずつ減らす)\n    count ← count + 1\nendfor"},{"id":15,"cat":"配列操作","topic":"配列の最大値を求める処理(第2弾)","q":"次の疑似言語プログラムを実行した直後のmaxの値はどれか。","choices":[{"label":"ア","text":"7"},{"label":"イ","text":"15"},{"label":"ウ","text":"37"},{"label":"エ","text":"9"}],"correct":"イ","hint":"配列Aの中で最大の値は15(A[4])であり、maxは最終的に15になる。","code":"○整数型の配列: A ← {4, 9, 2, 15, 7}\n○整数型: max ← A[1]\nfor (i を 2 から 5 まで 1 ずつ増やす)\n    if (A[i] > max) then\n        max ← A[i]\n    endif\nendfor"},{"id":16,"cat":"配列操作","topic":"配列要素の合計と平均(第2弾)","q":"次の疑似言語プログラムを実行した直後のavgの値はどれか。","choices":[{"label":"ア","text":"100"},{"label":"イ","text":"30"},{"label":"ウ","text":"20"},{"label":"エ","text":"25"}],"correct":"エ","hint":"配列の合計は10+20+30+40=100であり、100÷4=25がavgになる。","code":"○整数型の配列: A ← {10, 20, 30, 40}\n○整数型: sum ← 0\nfor (i を 1 から 4 まで 1 ずつ増やす)\n    sum ← sum + A[i]\nendfor\n○整数型: avg ← sum ÷ 4"},{"id":17,"cat":"配列操作","topic":"配列要素の入れ替え(第2弾)","q":"次の疑似言語プログラムを実行した直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{10, 40, 30, 20, 50}"},{"label":"イ","text":"{10, 20, 30, 40, 50}"},{"label":"ウ","text":"{10, 20, 40, 30, 50}"},{"label":"エ","text":"{40, 20, 30, 10, 50}"}],"correct":"ア","hint":"2番目の要素(20)と4番目の要素(40)だけが入れ替わり、他の要素は変化しない。","code":"○整数型の配列: A ← {10, 20, 30, 40, 50}\n○整数型: t\nt ← A[2]\nA[2] ← A[4]\nA[4] ← t"},{"id":18,"cat":"配列操作","topic":"配列中の特定要素の出現回数(第2弾)","q":"次の疑似言語プログラムを実行した直後のcountの値はどれか。","choices":[{"label":"ア","text":"4"},{"label":"イ","text":"6"},{"label":"ウ","text":"3"},{"label":"エ","text":"2"}],"correct":"ウ","hint":"配列Aの中で値7は3回(A[1], A[3], A[4])出現するため、countは3になる。","code":"○整数型の配列: A ← {7, 3, 7, 7, 1, 3}\n○整数型: count ← 0\nfor (i を 1 から 6 まで 1 ずつ増やす)\n    if (A[i] = 7) then\n        count ← count + 1\n    endif\nendfor"},{"id":19,"cat":"配列操作","topic":"配列の最大値のインデックス(第2弾)","q":"次の疑似言語プログラムを実行した直後のmaxIdxの値はどれか(先頭を1番目とする)。","choices":[{"label":"ア","text":"2"},{"label":"イ","text":"4"},{"label":"ウ","text":"1"},{"label":"エ","text":"5"}],"correct":"イ","hint":"配列Aの最大値12はA[4]に格納されているため、maxIdxは最終的に4になる。","code":"○整数型の配列: A ← {3, 8, 1, 12, 6}\n○整数型: maxIdx ← 1\nfor (i を 2 から 5 まで 1 ずつ増やす)\n    if (A[i] > A[maxIdx]) then\n        maxIdx ← i\n    endif\nendfor"},{"id":20,"cat":"配列操作","topic":"配列要素のシフト処理のトレース","q":"次の疑似言語プログラムを実行した直後の配列Bの状態はどれか。","choices":[{"label":"ア","text":"{1, 2, 3, 4}"},{"label":"イ","text":"{1, 2, 3, 0}"},{"label":"ウ","text":"{0, 0, 0, 0}"},{"label":"エ","text":"{0, 1, 2, 3}"}],"correct":"エ","hint":"B[2]←A[1]=1, B[3]←A[2]=2, B[4]←A[3]=3となり、先頭のB[1]は初期値0のままとなる。","code":"○整数型の配列: A ← {1, 2, 3, 4}\n○整数型の配列: B ← {0, 0, 0, 0}\nfor (i を 1 から 3 まで 1 ずつ増やす)\n    B[i + 1] ← A[i]\nendfor"},{"id":21,"cat":"再帰処理","topic":"再帰による階乗計算(第2弾)","q":"次の疑似言語で定義された手続きfactorialについて、factorial(6)の戻り値はどれか。","choices":[{"label":"ア","text":"720"},{"label":"イ","text":"46656"},{"label":"ウ","text":"360"},{"label":"エ","text":"120"}],"correct":"ア","hint":"factorial(6)=6×5×4×3×2×1=720であり、これは6の階乗の値と一致する。","code":"○整数型: 手続き factorial(整数型: n)\n  if (n ≤ 1) then\n      return 1\n  else\n      return n × factorial(n - 1)\n  endif"},{"id":22,"cat":"再帰処理","topic":"再帰によるフィボナッチ数列計算(第2弾)","q":"次の疑似言語で定義された手続きfibについて、fib(6)の戻り値はどれか。","choices":[{"label":"ア","text":"5"},{"label":"イ","text":"13"},{"label":"ウ","text":"6"},{"label":"エ","text":"8"}],"correct":"エ","hint":"fib(0)=0, fib(1)=1, fib(2)=1, fib(3)=2, fib(4)=3, fib(5)=5, fib(6)=8と順に求まる。","code":"○整数型: 手続き fib(整数型: n)\n  if (n ≤ 1) then\n      return n\n  else\n      return fib(n - 1) + fib(n - 2)\n  endif"},{"id":23,"cat":"再帰処理","topic":"再帰による総和計算(第2弾)","q":"次の疑似言語で定義された手続きsumToについて、sumTo(8)の戻り値はどれか。","choices":[{"label":"ア","text":"45"},{"label":"イ","text":"36"},{"label":"ウ","text":"28"},{"label":"エ","text":"64"}],"correct":"イ","hint":"8+7+6+5+4+3+2+1+0=36であり、1からnまでの総和を再帰的に求める処理である。","code":"○整数型: 手続き sumTo(整数型: n)\n  if (n = 0) then\n      return 0\n  else\n      return n + sumTo(n - 1)\n  endif"},{"id":24,"cat":"再帰処理","topic":"再帰によるべき乗計算のトレース(第2弾)","q":"次の疑似言語で定義された手続きpowerについて、power(2, 6)の戻り値はどれか。","choices":[{"label":"ア","text":"12"},{"label":"イ","text":"128"},{"label":"ウ","text":"64"},{"label":"エ","text":"32"}],"correct":"ウ","hint":"2^6=2×2×2×2×2×2=64であり、expを1ずつ減らしながらbaseを掛け合わせていく処理である。","code":"○整数型: 手続き power(整数型: base, 整数型: exp)\n  if (exp = 0) then\n      return 1\n  else\n      return base × power(base, exp - 1)\n  endif"},{"id":25,"cat":"再帰処理","topic":"再帰呼び出しの回数のトレース(第2弾)","q":"問21のfactorial(整数型n)の定義において、factorial(7)を呼び出したときに発生する関数呼び出しの総回数(最初の呼び出しを含む)はどれか。","choices":[{"label":"ア","text":"6回"},{"label":"イ","text":"5040回"},{"label":"ウ","text":"7回"},{"label":"エ","text":"8回"}],"correct":"ウ","hint":"factorial(7)→(6)→(5)→(4)→(3)→(2)→(1)の順に呼び出され、合計7回の呼び出しが発生する。","code":"○整数型: 手続き factorial(整数型: n)\n  if (n ≤ 1) then\n      return 1\n  else\n      return n × factorial(n - 1)\n  endif"},{"id":26,"cat":"再帰処理","topic":"再帰によるユークリッドの互除法のトレース","q":"次の疑似言語で定義された手続きgcdについて、gcd(48, 18)の戻り値はどれか。","choices":[{"label":"ア","text":"6"},{"label":"イ","text":"3"},{"label":"ウ","text":"12"},{"label":"エ","text":"18"}],"correct":"ア","hint":"gcd(48,18)→gcd(18,12)→gcd(12,6)→gcd(6,0)=6の順に計算され、48と18の最大公約数6が求まる。","code":"○整数型: 手続き gcd(整数型: a, 整数型: b)\n  if (b = 0) then\n      return a\n  else\n      return gcd(b, a mod b)\n  endif"},{"id":27,"cat":"ソートアルゴリズム","topic":"選択ソート1パス目のトレース(第2弾)","q":"配列A ← {6, 9, 1, 4, 8}に対して、未整列部分から最小値を探して先頭要素と交換する選択ソートを1回(1パス目)実行した直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{1, 9, 4, 6, 8}"},{"label":"イ","text":"{1, 9, 6, 4, 8}"},{"label":"ウ","text":"{1, 4, 6, 9, 8}"},{"label":"エ","text":"{6, 9, 1, 4, 8}"}],"correct":"イ","hint":"配列全体の最小値1(3番目の要素)を探し出し、先頭の6と交換する。","code":"(未整列部分{6,9,1,4,8}から最小値を探し、先頭と交換する処理を1回実行)"},{"id":28,"cat":"ソートアルゴリズム","topic":"バブルソート1パス目のトレース(第2弾)","q":"配列A ← {4, 8, 2, 6}に対して、隣接する要素を先頭から順に比較し、左が右より大きい場合に交換するバブルソートを1回(1パス)走査した直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{4, 8, 2, 6}"},{"label":"イ","text":"{2, 6, 4, 8}"},{"label":"ウ","text":"{2, 4, 6, 8}"},{"label":"エ","text":"{4, 2, 6, 8}"}],"correct":"エ","hint":"(4,8)は交換不要、(8,2)は交換→{4,2,8,6}、(8,6)は交換→{4,2,6,8}となる。","code":"(隣接要素を(A[1],A[2])→(A[2],A[3])→(A[3],A[4])の順に比較・交換する処理を1回実行)"},{"id":29,"cat":"ソートアルゴリズム","topic":"挿入ソートの部分整列の理解(第2弾)","q":"配列A ← {5, 1, 8, 3, 2}に対して挿入ソートを適用し、先頭3要素の整列が完了した直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{1, 5, 8, 2, 3}"},{"label":"イ","text":"{5, 1, 8, 3, 2}"},{"label":"ウ","text":"{1, 5, 8, 3, 2}"},{"label":"エ","text":"{1, 3, 5, 8, 2}"}],"correct":"ウ","hint":"先頭3要素{5,1,8}を整列すると{1,5,8}になり、残りの要素はまだ手つかずのままとなる。","code":"(先頭3要素{5,1,8}を挿入ソートで整列する処理までを実行)"},{"id":30,"cat":"ソートアルゴリズム","topic":"選択ソートの必要パス回数の理解(第2弾)","q":"要素数8個の配列を選択ソートで完全に整列させるために必要な走査(パス)の回数は最大何回か。","choices":[{"label":"ア","text":"8回"},{"label":"イ","text":"7回"},{"label":"ウ","text":"6回"},{"label":"エ","text":"28回"}],"correct":"イ","hint":"選択ソートはn個の要素に対しn-1回のパスで整列が完了するため、8-1=7回となる。","code":"(要素数n=8の配列を選択ソートで整列する場合の必要パス数を考える)"},{"id":31,"cat":"ソートアルゴリズム","topic":"バブルソート2パス目のトレース(第2弾)","q":"配列A ← {4, 8, 2, 6}に1パス目のバブルソートを実行すると{4, 2, 6, 8}になる。続けて2パス目を実行した直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{2, 4, 6, 8}"},{"label":"イ","text":"{4, 6, 2, 8}"},{"label":"ウ","text":"{2, 6, 4, 8}"},{"label":"エ","text":"{4, 2, 6, 8}"}],"correct":"ア","hint":"(4,2)は交換→{2,4,6,8}、(4,6)は交換不要、(6,8)は交換不要となる。","code":"(1パス目終了後の{4,2,6,8}に対して、隣接要素の比較・交換をもう1回先頭から末尾まで実行する)"},{"id":32,"cat":"ソートアルゴリズム","topic":"選択ソート2パス目のトレース(第2弾)","q":"配列A ← {6, 9, 1, 4, 8}に選択ソートの1パス目を実行すると{1, 9, 6, 4, 8}になる。続けて2パス目(2番目以降の未整列部分から最小値を探して2番目の位置と交換)を実行した直後の配列Aの状態はどれか。","choices":[{"label":"ア","text":"{1, 4, 9, 6, 8}"},{"label":"イ","text":"{1, 6, 9, 4, 8}"},{"label":"ウ","text":"{1, 9, 6, 4, 8}"},{"label":"エ","text":"{1, 4, 6, 9, 8}"}],"correct":"エ","hint":"未整列部分{9,6,4,8}の最小値4を探し出し、2番目の位置(9があった場所)と交換する。","code":"(1パス目終了後の{1,9,6,4,8}に対して、未整列部分{9,6,4,8}から最小値を探索する)"},{"id":33,"cat":"探索アルゴリズム","topic":"線形探索のトレース(第2弾)","q":"配列A ← {9, 4, 7, 2, 6}に対して先頭から順にkey=2を探す線形探索を行うとき、配列の何番目の要素で一致が見つかるか(先頭を1番目とする)。","choices":[{"label":"ア","text":"2番目"},{"label":"イ","text":"5番目"},{"label":"ウ","text":"3番目"},{"label":"エ","text":"4番目"}],"correct":"エ","hint":"A[4]=2であるため、4番目の要素で一致が見つかる。","code":"(先頭からA[1],A[2],…の順にkey=2と比較していく)"},{"id":34,"cat":"探索アルゴリズム","topic":"二分探索の最初の比較対象(第2弾)","q":"昇順に整列済みの配列A ← {2, 4, 6, 8, 10, 12, 14, 16}(要素数8)に対してkey=14を二分探索するとき、最初に比較される中央の要素の値はどれか。","choices":[{"label":"ア","text":"6"},{"label":"イ","text":"8"},{"label":"ウ","text":"10"},{"label":"エ","text":"14"}],"correct":"イ","hint":"中央の添字は(1+8)÷2=4(切り捨て)であり、A[4]=8が最初の比較対象になる。","code":"(中央位置 = (1+8) を 2 で割った値(小数点以下切り捨て) を添字として最初の比較を行う)"},{"id":35,"cat":"探索アルゴリズム","topic":"二分探索の比較回数(第2弾)","q":"問34と同じ配列A ← {2, 4, 6, 8, 10, 12, 14, 16}に対してkey=14を二分探索する場合、keyが見つかるまでに必要な比較回数はどれか。","choices":[{"label":"ア","text":"2回"},{"label":"イ","text":"4回"},{"label":"ウ","text":"3回"},{"label":"エ","text":"1回"}],"correct":"ウ","hint":"1回目(A[4]=8)、2回目(A[6]=12)、3回目(A[7]=14)の順に比較し、3回目で一致が見つかる。","code":"(1回目:A[4]=8と比較→14の方が大きいので右半分へ。2回目:右半分の中央付近と比較。3回目でkeyが見つかる)"},{"id":36,"cat":"探索アルゴリズム","topic":"線形探索と二分探索の計算量比較","q":"要素数1000のソート済み配列から特定の値を探索する場合、最悪計算量の観点で線形探索と二分探索を比較した記述として正しいものはどれか。","choices":[{"label":"ア","text":"二分探索の方が最悪計算量が小さく、より高速に探索できる"},{"label":"イ","text":"両者の最悪計算量は常に同じである"},{"label":"ウ","text":"線形探索の方が最悪計算量が小さく、より高速に探索できる"},{"label":"エ","text":"要素数が増えるほど線形探索の方が有利になる"}],"correct":"ア","hint":"線形探索はO(n)、二分探索はO(log n)であり、要素数が多いほど二分探索の優位性が際立つ。"},{"id":37,"cat":"文字列処理","topic":"文字列の長さを数える処理(第2弾)","q":"文字列s ← \"PSEUDOCODE\"の文字数はどれか。","choices":[{"label":"ア","text":"10"},{"label":"イ","text":"8"},{"label":"ウ","text":"9"},{"label":"エ","text":"11"}],"correct":"ア","hint":"P-S-E-U-D-O-C-O-D-Eの10文字から構成される文字列である。","code":"○文字列型: s ← \"PSEUDOCODE\""},{"id":38,"cat":"文字列処理","topic":"文字列の逆順生成処理(第2弾)","q":"次の疑似言語プログラムを実行した直後のrevの値はどれか(sのi番目の文字はs[i]で表す)。","choices":[{"label":"ア","text":"\"TOKYO\""},{"label":"イ","text":"\"TOYKO\""},{"label":"ウ","text":"\"OKYOT\""},{"label":"エ","text":"\"OYKOT\""}],"correct":"エ","hint":"i=5,4,3,2,1の順にs[5]=\"O\", s[4]=\"Y\", s[3]=\"K\", s[2]=\"O\", s[1]=\"T\"を連結し\"OYKOT\"になる。","code":"○文字列型: s ← \"TOKYO\"\n○文字列型: rev ← \"\"\nfor (i を 5 から 1 まで 1 ずつ減らす)\n    rev ← rev + s[i]\nendfor"},{"id":39,"cat":"スタック・キュー","topic":"スタックのpush/pop操作のトレース(第2弾)","q":"空のスタックに対してpush(A), push(B), pop(), push(C), push(D), pop()の順に操作を行った。最後のpop()で取り出される値はどれか。","choices":[{"label":"ア","text":"A"},{"label":"イ","text":"C"},{"label":"ウ","text":"D"},{"label":"エ","text":"B"}],"correct":"ウ","hint":"push A,Bで[A,B]。pop()でBが取り出され[A]。push C,Dで[A,C,D]。最後のpop()でDが取り出される。","code":"(スタックはLIFO(後入れ先出し)の構造である)"},{"id":40,"cat":"スタック・キュー","topic":"キューのenqueue/dequeue操作のトレース(第2弾)","q":"空のキューに対してenqueue(1), enqueue(2), dequeue(), enqueue(3), enqueue(4), dequeue()の順に操作を行った直後の、キューの中身を先頭から順に並べたものはどれか。","choices":[{"label":"ア","text":"1, 2, 3, 4"},{"label":"イ","text":"3, 4"},{"label":"ウ","text":"4, 3"},{"label":"エ","text":"2, 3, 4"}],"correct":"イ","hint":"enqueueで1,2が入り、dequeue()で1が取り出され[2]。enqueue3,4で[2,3,4]。dequeue()で2が取り出され[3,4]になる。","code":"(キューはFIFO(先入れ先出し)の構造である)"},{"id":41,"cat":"情報セキュリティ","topic":"総当たり攻撃の識別(第2弾)","q":"不正アクセスを試みる攻撃者が、あらゆる文字の組合せを総当たりで試行してパスワードを解析しようとする攻撃はどれか。","choices":[{"label":"ア","text":"フィッシング"},{"label":"イ","text":"ブルートフォース攻撃"},{"label":"ウ","text":"SQLインジェクション"},{"label":"エ","text":"DoS攻撃"}],"correct":"イ","hint":"文字数やログイン試行回数の制限が有効な対策となる。"},{"id":42,"cat":"情報セキュリティ","topic":"フィッシング詐欺の識別(第2弾)","q":"実在する金融機関等を装った偽のWebサイトへ利用者を誘導し、IDやパスワードを入力させて盗み取る攻撃はどれか。","choices":[{"label":"ア","text":"ブルートフォース攻撃"},{"label":"イ","text":"ワーム"},{"label":"ウ","text":"DoS攻撃"},{"label":"エ","text":"フィッシング"}],"correct":"エ","hint":"メールやSMSに偽サイトへのリンクを記載して誘導する手口が典型的である。"},{"id":43,"cat":"情報セキュリティ","topic":"ワームの識別(第2弾)","q":"電子メールの添付ファイルなどを介して感染し、他のコンピュータへ自己増殖(自己複製)しながら拡散する不正プログラムはどれか。","choices":[{"label":"ア","text":"ウイルス(宿主必須型)"},{"label":"イ","text":"アドウェア"},{"label":"ウ","text":"ワーム"},{"label":"エ","text":"スパイウェア"}],"correct":"ウ","hint":"宿主となるファイルに寄生するウイルスと異なり、単独で自己増殖できる点が特徴。"},{"id":44,"cat":"情報セキュリティ","topic":"多要素認証の識別(第2弾)","q":"IDとパスワードに加えて、スマートフォンに送信されたワンタイムコードの入力を求める認証方式は、一般に何と呼ばれるか。","choices":[{"label":"ア","text":"二要素認証(多要素認証)"},{"label":"イ","text":"生体認証単体"},{"label":"ウ","text":"パスワードレス認証"},{"label":"エ","text":"シングルサインオン"}],"correct":"ア","hint":"知識情報(パスワード)と所持情報(スマートフォン)という異なる要素を組み合わせている。"},{"id":45,"cat":"情報セキュリティ","topic":"SQLインジェクションの識別(第2弾)","q":"Webアプリケーションにおいて、利用者からの入力値をそのままSQL文に埋め込むことで発生する脆弱性を悪用した攻撃はどれか。","choices":[{"label":"ア","text":"SQLインジェクション"},{"label":"イ","text":"ディレクトリトラバーサル"},{"label":"ウ","text":"クロスサイトスクリプティング(XSS)"},{"label":"エ","text":"セッションハイジャック"}],"correct":"ア","hint":"プレースホルダを使ったバインド機構(プリペアドステートメント)により対策できる。"},{"id":46,"cat":"情報セキュリティ","topic":"DoS攻撃の識別(第2弾)","q":"大量のリクエストを送りつけてサーバの処理能力を超えさせ、サービスを利用不能に陥れる攻撃はどれか。","choices":[{"label":"ア","text":"フィッシング"},{"label":"イ","text":"DoS攻撃"},{"label":"ウ","text":"ブルートフォース攻撃"},{"label":"エ","text":"SQLインジェクション"}],"correct":"イ","hint":"多数の送信元から同時に行う場合はDDoS攻撃と呼ばれる。"},{"id":47,"cat":"情報セキュリティ","topic":"公開鍵暗号方式の鍵の使い方の理解(第2弾)","q":"公開鍵暗号方式において、送信者がデータを暗号化する際に使用する鍵はどれか。","choices":[{"label":"ア","text":"送信者の公開鍵"},{"label":"イ","text":"送信者の秘密鍵"},{"label":"ウ","text":"受信者の秘密鍵"},{"label":"エ","text":"受信者の公開鍵"}],"correct":"エ","hint":"受信者の公開鍵で暗号化されたデータは、対応する受信者の秘密鍵でのみ復号できる。"},{"id":48,"cat":"情報セキュリティ","topic":"ディジタル署名の目的の理解(第2弾)","q":"送信者がメッセージにディジタル署名を付与する主な目的はどれか。","choices":[{"label":"ア","text":"メッセージ内容の暗号化による秘匿"},{"label":"イ","text":"通信経路の暗号化"},{"label":"ウ","text":"送信者の本人性の証明とメッセージの改ざん検知"},{"label":"エ","text":"受信者の認証"}],"correct":"ウ","hint":"送信者の秘密鍵で署名し、対応する公開鍵で検証することで本人性と非改ざんを確認できる。"},{"id":49,"cat":"情報セキュリティ","topic":"ゼロデイ攻撃の識別","q":"修正パッチがまだ公開されていない、発見されたばかりの脆弱性を悪用する攻撃はどれか。","choices":[{"label":"ア","text":"フィッシング"},{"label":"イ","text":"DoS攻撃"},{"label":"ウ","text":"ゼロデイ攻撃"},{"label":"エ","text":"ブルートフォース攻撃"}],"correct":"ウ","hint":"対策(パッチ)が存在しない期間を突かれるため、既知の脆弱性への対策だけでは防ぎきれない。"},{"id":50,"cat":"情報セキュリティ","topic":"多層防御の考え方","q":"ファイアウォールに加えてウイルス対策ソフトやアクセス制御など、複数の防御策を組み合わせることで、1つの対策が突破されても被害を防ぎやすくする考え方はどれか。","choices":[{"label":"ア","text":"シングルサインオン"},{"label":"イ","text":"多層防御"},{"label":"ウ","text":"最小権限の原則"},{"label":"エ","text":"ゼロトラスト(前提を置かない別の考え方)"}],"correct":"イ","hint":"単一の防御策に頼らず複数の対策を層状に組み合わせてリスクを低減する。"}];

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
