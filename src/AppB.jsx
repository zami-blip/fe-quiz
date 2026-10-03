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

const ALL_QUESTIONS = [
  {
    "id": 1,
    "cat": "アルゴリズム・プログラミング",
    "topic": "再帰関数",
    "q": "次の手続procを実行したとき、proc(5)の返却値はどれか。\n○整数型: proc(整数型: n)\n  if (n = 0)\n    return 0\n  endif\n  return n + proc(n - 1)",
    "choices": [
      {
        "label": "ア",
        "text": "10"
      },
      {
        "label": "イ",
        "text": "20"
      },
      {
        "label": "ウ",
        "text": "15"
      },
      {
        "label": "エ",
        "text": "5"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: proc(5)=5+4+3+2+1+0=15と1からnまでの合計を再帰的に積み上げる。間違いやすいポイント: nをそのまま返す値と勘違いして5を選んでしまう。覚え方: 「n+proc(n-1)」は「1から現在値までの総和」を作る典型パターン。"
  },
  {
    "id": 2,
    "cat": "アルゴリズム・プログラミング",
    "topic": "二分探索",
    "q": "次の二分探索で、data={2,5,8,12,16,21,30}、target=16 とする。最初の比較後に設定される lo, hi の組合せはどれか。添字は0始まりとする。\nlo ← 0\nhi ← 6\nmid ← (lo + hi) ÷ 2 の商\nif (data[mid] < target)\n  lo ← mid + 1\nelseif (data[mid] > target)\n  hi ← mid - 1\nendif",
    "choices": [
      {
        "label": "ア",
        "text": "lo=0, hi=6"
      },
      {
        "label": "イ",
        "text": "lo=0, hi=2"
      },
      {
        "label": "ウ",
        "text": "lo=4, hi=6"
      },
      {
        "label": "エ",
        "text": "lo=3, hi=6"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: mid=(0+6)/2=3、data[3]=12<16なのでlo←mid+1=4、hiは6のまま。間違いやすいポイント: data[mid]の値とtargetの大小比較の向きを逆にしてhiを更新してしまう。覚え方: 「中央値が目標より小さい→探索範囲は右半分→loを進める」。"
  },
  {
    "id": 3,
    "cat": "アルゴリズム・プログラミング",
    "topic": "選択ソート",
    "q": "配列a={6,2,5,1,4}を選択ソートで昇順にする。最初の交換直後の配列はどれか。\nfor i を 0 から 3 まで\n  min ← i\n  for j を i+1 から 4 まで\n    if (a[j] < a[min])\n      min ← j\n    endif\n  endfor\n  a[i] と a[min] を交換\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "{1,2,5,6,4}"
      },
      {
        "label": "イ",
        "text": "{2,6,5,1,4}"
      },
      {
        "label": "ウ",
        "text": "{2,5,1,4,6}"
      },
      {
        "label": "エ",
        "text": "{6,2,1,4,5}"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: i=0のとき未整列部分{6,2,5,1,4}の最小値は1(添字3)なので、先頭の6と1を交換し{1,2,5,6,4}になる。間違いやすいポイント: 2番目に小さい値(2)と交換するなど最小値の探索を誤る。覚え方: 選択ソートは「未整列部分の最小値を先頭に1回だけ交換」する。"
  },
  {
    "id": 4,
    "cat": "アルゴリズム・プログラミング",
    "topic": "キュー",
    "q": "キューqが空の状態から、enqueue(10), enqueue(20), dequeue(), enqueue(30), dequeue() の順に操作した。2回目のdequeue()で取り出される値はどれか。キューは FIFO とする。",
    "choices": [
      {
        "label": "ア",
        "text": "10"
      },
      {
        "label": "イ",
        "text": "20"
      },
      {
        "label": "ウ",
        "text": "30"
      },
      {
        "label": "エ",
        "text": "取り出せない"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: enqueue(10,20)後にdequeueで10が出る→残り{20}→enqueue(30)で{20,30}→2回目のdequeueで先入れの20が出る。間違いやすいポイント: キューをスタック(LIFO)と混同し直近に入れた30が出ると考えてしまう。覚え方: キューは「先に入れたものが先に出る(FIFO)」。"
  },
  {
    "id": 5,
    "cat": "アルゴリズム・プログラミング",
    "topic": "スタック",
    "q": "スタックが空の状態から、push(A), push(B), pop(), push(C), pop(), pop() の順に操作する。popで得られる順序はどれか。スタックは LIFO とする。",
    "choices": [
      {
        "label": "ア",
        "text": "B,C,A"
      },
      {
        "label": "イ",
        "text": "B,A,C"
      },
      {
        "label": "ウ",
        "text": "A,B,C"
      },
      {
        "label": "エ",
        "text": "C,B,A"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: push(A,B)で{A,B}→pop()でB→push(C)で{A,C}→pop()でC→pop()でA、よってB,C,Aの順。間違いやすいポイント: スタックをキューと混同し先入れのAが先に出ると考えてしまう。覚え方: スタックは「後に入れたものが先に出る(LIFO)」。"
  },
  {
    "id": 6,
    "cat": "アルゴリズム・プログラミング",
    "topic": "ハッシュ表",
    "q": "大きさ7のハッシュ表に h(k)=k mod 7、線形探索法を使う。キー8,15,22をこの順に格納すると、22は何番地に入るか。格納場所は0〜6とする。衝突時は次の番地を調べる。",
    "choices": [
      {
        "label": "ア",
        "text": "3"
      },
      {
        "label": "イ",
        "text": "4"
      },
      {
        "label": "ウ",
        "text": "2"
      },
      {
        "label": "エ",
        "text": "1"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 8→8mod7=1番地、15→15mod7=1番地だが衝突のため2番地、22→22mod7=1番地だが1,2とも衝突のため3番地。間違いやすいポイント: 衝突を考慮せず単純にk mod 7の値(1)をそのまま答えてしまう。覚え方: 「衝突したら番地を1つずつ進めて空きを探す」のが線形探索法。"
  },
  {
    "id": 7,
    "cat": "アルゴリズム・プログラミング",
    "topic": "繰返し処理",
    "q": "次の処理で最終的なsumはいくつか。\nsum ← 0\nfor i を 1 から 5 まで\n  if (i mod 2 = 0)\n    sum ← sum + i\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "5"
      },
      {
        "label": "イ",
        "text": "15"
      },
      {
        "label": "ウ",
        "text": "6"
      },
      {
        "label": "エ",
        "text": "9"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 1から5のうち偶数は2と4なので、sum=2+4=6。間違いやすいポイント: 奇数(1,3,5)を足してしまい9と答えてしまう。覚え方: 「i mod 2 = 0」は偶数判定の条件式。"
  },
  {
    "id": 8,
    "cat": "アルゴリズム・プログラミング",
    "topic": "配列操作",
    "q": "配列a={3,1,4,1,5}に対して次の処理を行う。countはいくつになるか。\ncount ← 0\nfor i を 0 から 4 まで\n  if (a[i] >= 3)\n    count ← count + 1\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "3"
      },
      {
        "label": "イ",
        "text": "2"
      },
      {
        "label": "ウ",
        "text": "5"
      },
      {
        "label": "エ",
        "text": "4"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 3,4,5の3個が3以上の条件を満たすのでcount=3。間違いやすいポイント: 「>=3」を「>3」と読み違えて3自身をカウントから外してしまう。覚え方: 「以上」は境界値を含むことを意識して読む。"
  },
  {
    "id": 9,
    "cat": "アルゴリズム・プログラミング",
    "topic": "再帰関数",
    "q": "次の手続g(6)の返却値はどれか。\n○整数型: g(整数型: n)\n  if (n <= 1)\n    return 1\n  endif\n  return g(n - 2) + 1",
    "choices": [
      {
        "label": "ア",
        "text": "3"
      },
      {
        "label": "イ",
        "text": "6"
      },
      {
        "label": "ウ",
        "text": "5"
      },
      {
        "label": "エ",
        "text": "4"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: g(6)=g(4)+1=g(2)+2=g(0)+3。g(0)はn<=1なので1を返す→1+3=4。間違いやすいポイント: nが2ずつ減ることを見落とし、g(5)系統の奇数側で計算してしまう。覚え方: 「n-2」の再帰はnを2ずつ減らしながら+1を積み上げる。"
  },
  {
    "id": 10,
    "cat": "アルゴリズム・プログラミング",
    "topic": "繰返し処理",
    "q": "次の処理が出力する値はどれか。\nx ← 1\nfor i を 1 から 4 まで\n  x ← x × 2\nendfor\n出力 x",
    "choices": [
      {
        "label": "ア",
        "text": "12"
      },
      {
        "label": "イ",
        "text": "16"
      },
      {
        "label": "ウ",
        "text": "32"
      },
      {
        "label": "エ",
        "text": "8"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 1を4回2倍すると1→2→4→8→16で最終的にx=16。間違いやすいポイント: ループ回数を1回多く数えて32としてしまう。覚え方: 「2のn乗」をxに掛け続ける処理はビットシフトのイメージで数える。"
  },
  {
    "id": 11,
    "cat": "アルゴリズム・プログラミング",
    "topic": "二分探索",
    "q": "昇順配列a={2,4,7,9,13,18}で target=10 を二分探索する。探索結果として適切なものはどれか。通常の二分探索を行い、見つからなければ -1 を返す。",
    "choices": [
      {
        "label": "ア",
        "text": "3"
      },
      {
        "label": "イ",
        "text": "-1"
      },
      {
        "label": "ウ",
        "text": "2"
      },
      {
        "label": "エ",
        "text": "4"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 配列中に10は存在しないため、探索範囲が狭まりきった時点で-1を返す。間違いやすいポイント: 近い値(9や13)の添字を誤って返り値としてしまう。覚え方: 二分探索は「見つからなければ必ず-1(または該当の判定値)」を返す設計にする。"
  },
  {
    "id": 12,
    "cat": "アルゴリズム・プログラミング",
    "topic": "配列操作",
    "q": "次の処理で出力される配列はどれか。\na ← {1,2,3,4}\nfor i を 0 から 1 まで\n  temp ← a[i]\n  a[i] ← a[3-i]\n  a[3-i] ← temp\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "{3,4,1,2}"
      },
      {
        "label": "イ",
        "text": "{2,1,4,3}"
      },
      {
        "label": "ウ",
        "text": "{4,3,2,1}"
      },
      {
        "label": "エ",
        "text": "{1,2,3,4}"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: i=0でa[0]とa[3]を交換(4,2,3,1)、i=1でa[1]とa[2]を交換(4,3,2,1)。間違いやすいポイント: 交換するペアの添字を間違え(例えば隣同士)別の並びにしてしまう。覚え方: 「i と 3-i」は配列の両端から中心に向かって交換する典型的な反転処理。"
  },
  {
    "id": 13,
    "cat": "アルゴリズム・プログラミング",
    "topic": "連結リスト",
    "q": "単方向リストの各要素が value と next をもつ。先頭から全要素を数える処理の空欄に入るものはどれか。\ncount ← 0\np ← head\nwhile (p ≠ null)\n  count ← count + 1\n  p ← [ A ]\nendwhile",
    "choices": [
      {
        "label": "ア",
        "text": "count"
      },
      {
        "label": "イ",
        "text": "p.value"
      },
      {
        "label": "ウ",
        "text": "head"
      },
      {
        "label": "エ",
        "text": "p.next"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 次のノードへ進むためにはp.nextを代入する必要がある。間違いやすいポイント: 毎回headに戻してしまうと無限ループになることに気づかない。覚え方: 単方向リストの走査は「p ← p.next」で一歩ずつ進めるのが基本形。"
  },
  {
    "id": 14,
    "cat": "アルゴリズム・プログラミング",
    "topic": "最大値探索",
    "q": "次の処理は何を求めているか。\nmax ← a[0]\nfor i を 1 から aの要素数-1 まで\n  if (a[i] > max)\n    max ← a[i]\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "最小値"
      },
      {
        "label": "イ",
        "text": "中央値"
      },
      {
        "label": "ウ",
        "text": "平均値"
      },
      {
        "label": "エ",
        "text": "最大値"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 先頭を初期値とし、より大きい値が見つかるたびにmaxを更新しているので最大値を求める処理。間違いやすいポイント: 比較演算子の向き(> と <)を読み違えて最小値と誤答してしまう。覚え方: 「a[i] > max なら更新」は最大値探索の定番パターン。"
  },
  {
    "id": 15,
    "cat": "アルゴリズム・プログラミング",
    "topic": "文字列処理",
    "q": "次の文字列処理で count はいくつになるか。s=\"ABRACADABRA\" とする。\ncount ← 0\nfor i を 0 から sの長さ-1 まで\n  if (s[i] = 'A')\n    count ← count + 1\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "3"
      },
      {
        "label": "イ",
        "text": "6"
      },
      {
        "label": "ウ",
        "text": "5"
      },
      {
        "label": "エ",
        "text": "4"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 「ABRACADABRA」の中のAの出現回数を数えると5個(A,_,_,A,_,A,_,A,_,_,A)。間違いやすいポイント: 数え漏れや重複カウントで4や6と誤答してしまう。覚え方: 一文字ずつ指で押さえながら数えるなど、慎重に逐次カウントする。"
  },
  {
    "id": 16,
    "cat": "アルゴリズム・プログラミング",
    "topic": "グラフ",
    "q": "隣接行列matrixを使って、頂点vから辺が出ている頂点数を数える。空欄Aに入る条件はどれか。\ndegree ← 0\nfor i を 0 から n-1 まで\n  if ([ A ])\n    degree ← degree + 1\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "i = v"
      },
      {
        "label": "イ",
        "text": "matrix[v][v] = i"
      },
      {
        "label": "ウ",
        "text": "matrix[i][i] = 1"
      },
      {
        "label": "エ",
        "text": "matrix[v][i] = 1"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 頂点vから各頂点iへの辺の有無をmatrix[v][i]で判定し、1であれば辺が存在するのでdegreeを加算する。間違いやすいポイント: 対角成分matrix[i][i]を参照してしまい自己ループの判定になってしまう。覚え方: 「matrix[行][列]=matrix[始点][終点]」の形で辺の有無を読む。"
  },
  {
    "id": 17,
    "cat": "情報セキュリティ",
    "topic": "SQLインジェクション",
    "q": "Webアプリが利用者入力をそのままSQL文へ連結している。最も直接的な対策はどれか。\n入力例:\nname = \"x' OR '1'='1\"\nSQL文を文字列連結で生成している。",
    "choices": [
      {
        "label": "ア",
        "text": "DBの文字コードを変更する"
      },
      {
        "label": "イ",
        "text": "プレースホルダを使う"
      },
      {
        "label": "ウ",
        "text": "ブラウザキャッシュを削除する"
      },
      {
        "label": "エ",
        "text": "URLを短くする"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: プレースホルダ(パラメータ化クエリ)を使うことで入力値がSQL構文として解釈されなくなり、SQLインジェクションを防げる。間違いやすいポイント: 文字コードやURLの長さなど、攻撃の仕組みと無関係な対策を選んでしまう。覚え方: 「入力値とSQL文を混ぜない=プレースホルダで分離」。"
  },
  {
    "id": 18,
    "cat": "情報セキュリティ",
    "topic": "多要素認証",
    "q": "パスワード認証に加えて、スマートフォンの認証アプリで生成されるワンタイムコードを要求する。この方式の説明として適切なものはどれか。利用者はパスワードと認証アプリを使用する。",
    "choices": [
      {
        "label": "ア",
        "text": "公開鍵基盤"
      },
      {
        "label": "イ",
        "text": "同一要素による二段階認証"
      },
      {
        "label": "ウ",
        "text": "電子署名"
      },
      {
        "label": "エ",
        "text": "多要素認証"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: パスワード(知識要素)と認証アプリの生成コード(所持要素)という異なる要素を組み合わせているため多要素認証にあたる。間違いやすいポイント: 「2段階」という言葉だけに注目して同一要素の二段階認証と誤解してしまう。覚え方: 「要素の種類が異なれば多要素、同じ種類を繰り返すだけなら二段階」。"
  },
  {
    "id": 19,
    "cat": "情報セキュリティ",
    "topic": "バックアップ対策",
    "q": "バックアップサーバも通常時に共有フォルダとして書込み可能であり、ランサムウェア感染時にバックアップまで暗号化された。改善策として最も適切なものはどれか。本番データとバックアップが常時同一ネットワークから書込み可能であった。",
    "choices": [
      {
        "label": "ア",
        "text": "パスワードを短くする"
      },
      {
        "label": "イ",
        "text": "バックアップをオフラインまたは論理的に分離する"
      },
      {
        "label": "ウ",
        "text": "バックアップを削除する"
      },
      {
        "label": "エ",
        "text": "OS更新を停止する"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: バックアップを本番環境から物理的・論理的に分離(オフライン化やイミュータブル化)すれば、ランサムウェア感染がバックアップまで及ぶのを防げる。間違いやすいポイント: バックアップの削除やOS更新停止など、むしろ被害を悪化させる選択肢を選んでしまう。覚え方: 「バックアップは本番と同じ経路から書き換えられないようにする」。"
  },
  {
    "id": 20,
    "cat": "情報セキュリティ",
    "topic": "暗号方式",
    "q": "公開鍵暗号方式を利用して、送信内容を受信者だけが読めるようにしたい。暗号化に使う鍵はどれか。送信者Sが受信者Rへ秘密の文書を送る。",
    "choices": [
      {
        "label": "ア",
        "text": "Rの公開鍵"
      },
      {
        "label": "イ",
        "text": "Rの秘密鍵"
      },
      {
        "label": "ウ",
        "text": "Sの公開鍵"
      },
      {
        "label": "エ",
        "text": "Sの秘密鍵"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 受信者Rの公開鍵で暗号化すると、対応する秘密鍵を持つRだけが復号できる。間違いやすいポイント: 送信者側の鍵を使ってしまい、デジタル署名の仕組み(送信者の秘密鍵で署名)と混同する。覚え方: 「暗号化は受信者の公開鍵、復号は受信者の秘密鍵」。"
  }
];

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
          <div style={s.sub}>基本情報技術者 — 本番寄り想定問題20問(アルゴリズム16+セキュリティ4)</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:8}}>
            <a href="/" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>← 科目Aの問題を解く</a>
            <a href="/terms" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>用語フラッシュカード →</a>
          </div>
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
                🔄 問題をリセット（全20問に戻す）
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
