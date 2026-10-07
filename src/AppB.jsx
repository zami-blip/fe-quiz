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

// 問題内容の識別: 問題の「追加のみ」なら周回進捗・復習リストを維持し、
// 削除や差し替え(idが同じでも題材が変わった場合を含む)のときだけ初期化する。
const qFp = (q) => { const s = String(q.id) + "|" + (q.cat||"") + "|" + (q.topic||""); let h = 5381; for(let i=0;i<s.length;i++){ h = (((h<<5)+h) + s.charCodeAt(i)) | 0; } return (h>>>0).toString(36); };
const buildSignature = (qs) => "v2:" + JSON.stringify(qs.map(q => [q.id, qFp(q)]));
const hasContentChanged = (stored, qs) => {
  if(stored === null || stored === undefined) return false;
  const prev = {};
  try{
    if(stored.startsWith("v2:")){
      JSON.parse(stored.slice(3)).forEach(p => { prev[p[0]] = {fp:p[1], cat:null}; });
    } else {
      // 旧形式 "件数:id,id,..."(科目Bは "id-分野")
      stored.slice(stored.indexOf(":")+1).split(",").forEach(x => {
        if(x === "") return;
        const k = x.indexOf("-");
        if(k < 0) prev[x] = {fp:null, cat:null}; else prev[x.slice(0,k)] = {fp:null, cat:x.slice(k+1)};
      });
    }
  }catch(e){ return true; }
  const cur = {};
  qs.forEach(q => { cur[q.id] = {fp:qFp(q), cat:q.cat}; });
  return Object.keys(prev).some(id => {
    const c = cur[id], p = prev[id];
    if(!c) return true;
    if(p.fp !== null && p.fp !== c.fp) return true;
    if(p.cat !== null && p.cat !== c.cat) return true;
    return false;
  });
};

const CATS = [
  "すべて","アルゴリズム・プログラミング","配列操作","再帰処理",
  "ソートアルゴリズム","探索アルゴリズム","スタック・キュー","情報セキュリティ",
];

const ALL_QUESTIONS = [
  {
    "id": 1,
    "cat": "アルゴリズム・プログラミング",
    "topic": "再帰関数",
    "q": "再帰手続calc(7)の返却値を求めよ。\ncalcはnが1以下なら1、それ以外はcalc(n-2)+n。\n○整数型: calc(整数型: n)\n  if (n <= 1)\n    return 1\n  endif\n  return calc(n - 2) + n",
    "choices": [
      {
        "label": "ア",
        "text": "15"
      },
      {
        "label": "イ",
        "text": "13"
      },
      {
        "label": "ウ",
        "text": "16"
      },
      {
        "label": "エ",
        "text": "17"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: calc(7)=calc(5)+7=calc(3)+5+7=calc(1)+3+5+7=1+3+5+7=16。間違いやすいポイント: nが2ずつ減ることを見落とし1から7まで全部足して17などと計算してしまう。覚え方: 「n-2」の再帰はn,n-2,n-4,…と奇数(または偶数)だけを足し合わせる。"
  },
  {
    "id": 2,
    "cat": "アルゴリズム・プログラミング",
    "topic": "二分探索",
    "q": "二分探索でtarget=45が見つかる添字はどれか。\ndata={3,7,11,18,24,31,45,60,72}、添字0始まり。\nlo ← 0\nhi ← 8\nwhile (lo <= hi)\n  mid ← (lo + hi) ÷ 2 の商\n  if (data[mid] = target)\n    return mid\n  elseif (data[mid] < target)\n    lo ← mid + 1\n  else\n    hi ← mid - 1\n  endif\nendwhile",
    "choices": [
      {
        "label": "ア",
        "text": "5"
      },
      {
        "label": "イ",
        "text": "7"
      },
      {
        "label": "ウ",
        "text": "6"
      },
      {
        "label": "エ",
        "text": "4"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 1回目mid=4、data[4]=24<45でlo=5。2回目mid=(5+8)/2=6、data[6]=45で一致し添字6を返す。間違いやすいポイント: 1回目のmidの値(4)をそのまま答えてしまう。覚え方: whileループの中で範囲が狭まるたびにmidを計算し直すことを意識する。"
  },
  {
    "id": 3,
    "cat": "アルゴリズム・プログラミング",
    "topic": "選択ソート",
    "q": "選択ソートでi=0の処理終了後の配列はどれか。\na={7,4,6,2,5}。\nfor i を 0 から 3 まで\n  min ← i\n  for j を i+1 から 4 まで\n    if (a[j] < a[min])\n      min ← j\n    endif\n  endfor\n  a[i] と a[min] を交換\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "{2,4,6,7,5}"
      },
      {
        "label": "イ",
        "text": "{2,4,5,6,7}"
      },
      {
        "label": "ウ",
        "text": "{4,6,2,5,7}"
      },
      {
        "label": "エ",
        "text": "{7,2,4,5,6}"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: i=0のとき配列全体{7,4,6,2,5}の最小値は2(添字3)なので、先頭の7と2を交換し{2,4,6,7,5}になる。間違いやすいポイント: 2番目に小さい4と交換するなど最小値の探索位置を誤る。覚え方: 選択ソートはi回目のループで「未整列部分の最小値を1回だけ先頭と交換」する。"
  },
  {
    "id": 4,
    "cat": "アルゴリズム・プログラミング",
    "topic": "キュー",
    "q": "キューの最後のdequeueで取り出される値はどれか。FIFO、初期状態空。\nenqueue(4)\nenqueue(7)\nx ← dequeue()\nenqueue(9)\nenqueue(x + 1)\ny ← dequeue()\nz ← dequeue()",
    "choices": [
      {
        "label": "ア",
        "text": "9"
      },
      {
        "label": "イ",
        "text": "10"
      },
      {
        "label": "ウ",
        "text": "7"
      },
      {
        "label": "エ",
        "text": "5"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: enqueue(4,7)→x=dequeue()=4→キュー{7}→enqueue(9)で{7,9}→enqueue(x+1=5)で{7,9,5}→y=dequeue()=7→z=dequeue()=9。間違いやすいポイント: xの値(4)を使ったenqueue(x+1)の計算を忘れ、最後に入れた5が先に出ると勘違いする。覚え方: FIFOは「入れた順にそのまま出てくる」ので、キューの中身を逐一書き出して追跡する。"
  },
  {
    "id": 5,
    "cat": "アルゴリズム・プログラミング",
    "topic": "スタック",
    "q": "スタック処理で出力される順序はどれか。LIFO、初期状態空。\npush(A)\npush(B)\nx ← pop()\npush(C)\npush(D)\ny ← pop()\nz ← pop()\nw ← pop()\n出力 x,y,z,w",
    "choices": [
      {
        "label": "ア",
        "text": "D,C,B,A"
      },
      {
        "label": "イ",
        "text": "A,D,C,B"
      },
      {
        "label": "ウ",
        "text": "B,D,C,A"
      },
      {
        "label": "エ",
        "text": "B,C,D,A"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: push(A,B)で{A,B}→x=pop()=B→push(C,D)で{A,C,D}→y=pop()=D→z=pop()=C→w=pop()=A。よってx,y,z,w=B,D,C,A。間違いやすいポイント: push順を無視して先に入れたAやBが早く出ると考えてしまう。覚え方: スタックは「最後に積んだものが最初に取れる(LIFO)」ので、直前の操作から逆順にたどる。"
  },
  {
    "id": 6,
    "cat": "アルゴリズム・プログラミング",
    "topic": "ハッシュ表",
    "q": "ハッシュ表でキー31の格納位置はどれか。大きさ10、h(k)=k mod 10。11,21,31を順に格納し、衝突時は次へ。",
    "choices": [
      {
        "label": "ア",
        "text": "2"
      },
      {
        "label": "イ",
        "text": "3"
      },
      {
        "label": "ウ",
        "text": "4"
      },
      {
        "label": "エ",
        "text": "1"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 11→11mod10=1番地、21→21mod10=1番地だが衝突のため2番地、31→31mod10=1番地だが1,2とも衝突のため3番地。間違いやすいポイント: 衝突を考慮せずk mod 10の値(1)をそのまま答えてしまう。覚え方: 「衝突したら番地を1つずつ進めて空きを探す」のが線形探索法。"
  },
  {
    "id": 7,
    "cat": "アルゴリズム・プログラミング",
    "topic": "連結リスト",
    "q": "単方向リスト探索の空欄Aはどれか。各ノードはvalueとnextを持つ。\np ← head\nwhile (p ≠ null)\n  if (p.value = target)\n    return p\n  endif\n  p ← [ A ]\nendwhile\nreturn null",
    "choices": [
      {
        "label": "ア",
        "text": "head"
      },
      {
        "label": "イ",
        "text": "target"
      },
      {
        "label": "ウ",
        "text": "p.value"
      },
      {
        "label": "エ",
        "text": "p.next"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 一致しなかった場合は次のノードへ進む必要があるのでp.nextを代入する。間違いやすいポイント: 毎回headに戻してしまうと無限ループになることに気づかない。覚え方: 単方向リストの走査は「p ← p.next」で一歩ずつ進めるのが基本形。"
  },
  {
    "id": 8,
    "cat": "アルゴリズム・プログラミング",
    "topic": "文字列処理",
    "q": "s=\"AAABBCCCCDAA\" の連続する同じ文字の最大長はどれか。curLenは現在長、maxLenは最大長。\ncurLen ← 1\nmaxLen ← 1\nfor i を 1 から sの長さ-1 まで\n  if (s[i] = s[i-1])\n    curLen ← curLen + 1\n  else\n    curLen ← 1\n  endif\n  if (curLen > maxLen)\n    maxLen ← curLen\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "2"
      },
      {
        "label": "イ",
        "text": "5"
      },
      {
        "label": "ウ",
        "text": "4"
      },
      {
        "label": "エ",
        "text": "3"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: \"AAABBCCCCDAA\"の中で最長の連続部分は\"CCCC\"の4文字。間違いやすいポイント: 先頭の\"AAA\"(3文字)を最大長と誤認してしまう。覚え方: curLenとmaxLenを別々に管理し、文字が変わるたびにcurLenをリセットする流れを追う。"
  },
  {
    "id": 9,
    "cat": "アルゴリズム・プログラミング",
    "topic": "グラフ",
    "q": "頂点2から直接到達できる頂点数はどれか。matrix[i][j]=1はiからjへの辺。頂点2の行は{0,1,0,1,1}。\ncount ← 0\nfor j を 0 から 4 まで\n  if (matrix[2][j] = 1)\n    count ← count + 1\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "2"
      },
      {
        "label": "イ",
        "text": "3"
      },
      {
        "label": "ウ",
        "text": "1"
      },
      {
        "label": "エ",
        "text": "4"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 頂点2の行{0,1,0,1,1}の中で1になっているのは3か所なのでcount=3。間違いやすいポイント: 0の個数や配列の要素数全体(5)と数え間違える。覚え方: 「行の中の1の数=その頂点から出る辺の数」と覚える。"
  },
  {
    "id": 10,
    "cat": "アルゴリズム・プログラミング",
    "topic": "配列操作",
    "q": "偶数要素だけの合計はどれか。a={3,8,5,12,7,4}。\nsum ← 0\nfor i を 0 から 5 まで\n  if (a[i] mod 2 = 0)\n    sum ← sum + a[i]\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "26"
      },
      {
        "label": "イ",
        "text": "27"
      },
      {
        "label": "ウ",
        "text": "24"
      },
      {
        "label": "エ",
        "text": "20"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 偶数は8,12,4なので合計8+12+4=24。間違いやすいポイント: 奇数(3,5,7)も含めて計算してしまい合計を誤る。覚え方: 「mod 2 = 0」は偶数判定の条件式、奇数の値は無視する。"
  },
  {
    "id": 11,
    "cat": "アルゴリズム・プログラミング",
    "topic": "配列操作",
    "q": "処理後の配列aはどれか。a={1,3,5,7,9}。i=0,1の2回。\nfor i を 0 から 1 まで\n  temp ← a[i]\n  a[i] ← a[4-i]\n  a[4-i] ← temp\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "{9,7,5,3,1}"
      },
      {
        "label": "イ",
        "text": "{7,9,5,1,3}"
      },
      {
        "label": "ウ",
        "text": "{1,7,5,3,9}"
      },
      {
        "label": "エ",
        "text": "{9,3,5,7,1}"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: i=0でa[0]とa[4]を交換(9,3,5,7,1)、i=1でa[1]とa[3]を交換(9,7,5,3,1)。間違いやすいポイント: 2回目の交換(a[1]とa[3])を忘れて1回目の結果のまま止まってしまう。覚え方: 「i と 4-i」は配列の両端から中心に向かって交換する反転処理の典型形。"
  },
  {
    "id": 12,
    "cat": "アルゴリズム・プログラミング",
    "topic": "最大値探索",
    "q": "最大値の添字を保存する空欄Aはどれか。aの要素数はn、添字0始まり。\nmax ← a[0]\npos ← 0\nfor i を 1 から n-1 まで\n  if (a[i] > max)\n    max ← a[i]\n    [ A ]\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "pos ← 0"
      },
      {
        "label": "イ",
        "text": "pos ← i"
      },
      {
        "label": "ウ",
        "text": "max ← pos"
      },
      {
        "label": "エ",
        "text": "i ← pos"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 最大値を更新したタイミングで、その時の添字iをposに保存する必要があるのでpos←iが適切。間違いやすいポイント: posを常に0にリセットしてしまい、添字の更新ができなくなる選択肢を選んでしまう。覚え方: 「値を更新したら、その位置(添字)も一緒に覚えておく」。"
  },
  {
    "id": 13,
    "cat": "アルゴリズム・プログラミング",
    "topic": "再帰関数",
    "q": "power(2,5)の返却値はどれか。\n○整数型: power(整数型: x, 整数型: n)\n  if (n = 0)\n    return 1\n  endif\n  return x × power(x, n - 1)",
    "choices": [
      {
        "label": "ア",
        "text": "10"
      },
      {
        "label": "イ",
        "text": "32"
      },
      {
        "label": "ウ",
        "text": "25"
      },
      {
        "label": "エ",
        "text": "16"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: power(2,5)=2×power(2,4)=2×2×power(2,3)=…=2^5=32。間違いやすいポイント: 2×5=10のようにxとnを単純にかけ算してしまう。覚え方: 「x × power(x, n-1)」はxをn回掛け合わせる累乗の典型的な再帰パターン。"
  },
  {
    "id": 14,
    "cat": "アルゴリズム・プログラミング",
    "topic": "バブルソート",
    "q": "バブルソート1回目の走査後の配列はどれか。a={5,1,4,2}。\nfor j を 0 から 2 まで\n  if (a[j] > a[j+1])\n    a[j] と a[j+1] を交換\n  endif\nendfor",
    "choices": [
      {
        "label": "ア",
        "text": "{1,4,2,5}"
      },
      {
        "label": "イ",
        "text": "{5,1,2,4}"
      },
      {
        "label": "ウ",
        "text": "{1,2,4,5}"
      },
      {
        "label": "エ",
        "text": "{1,5,2,4}"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: j=0で5>1交換→{1,5,4,2}、j=1で5>4交換→{1,4,5,2}、j=2で5>2交換→{1,4,2,5}。1回の走査で最大値5が右端へ移動する。間違いやすいポイント: 1回の走査だけで配列が完全にソートされると思い込み{1,2,4,5}を選んでしまう。覚え方: バブルソートは1回の走査につき隣接交換を繰り返し、最大値を1つずつ右端に押し出す。"
  },
  {
    "id": 15,
    "cat": "アルゴリズム・プログラミング",
    "topic": "文字列判定",
    "q": "次の処理が判定しているものはどれか。leftは先頭、rightは末尾。\nwhile (left < right)\n  if (s[left] ≠ s[right])\n    return false\n  endif\n  left ← left + 1\n  right ← right - 1\nendwhile\nreturn true",
    "choices": [
      {
        "label": "ア",
        "text": "母音数"
      },
      {
        "label": "イ",
        "text": "辞書順"
      },
      {
        "label": "ウ",
        "text": "文字列長が偶数"
      },
      {
        "label": "エ",
        "text": "回文"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 両端から中央に向かって文字を比較し、すべて一致すれば前後対称=回文と判定する処理。間違いやすいポイント: 文字列長の偶奇判定だと誤解してしまう(実際には長さに関係なく動作する)。覚え方: 「左右から挟み込んで比較する=回文判定」の定番パターン。"
  },
  {
    "id": 16,
    "cat": "アルゴリズム・プログラミング",
    "topic": "グラフ探索",
    "q": "幅優先探索(BFS)で一般に使用するデータ構造はどれか。未訪問頂点を発見した順に処理する。開始頂点を入れ、取り出した頂点の未訪問隣接頂点を追加する。",
    "choices": [
      {
        "label": "ア",
        "text": "スタック"
      },
      {
        "label": "イ",
        "text": "ハッシュだけ"
      },
      {
        "label": "ウ",
        "text": "ヒープだけ"
      },
      {
        "label": "エ",
        "text": "キュー"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: BFSは発見した順(FIFO)に頂点を処理するためキューを用いる。間違いやすいポイント: 深さ優先探索(DFS)で使うスタックと取り違える。覚え方: 「BFS=Breadth(幅)=キューで順番通り」「DFS=深さ=スタックで直前優先」。"
  },
  {
    "id": 17,
    "cat": "情報セキュリティ",
    "topic": "SQLインジェクション",
    "q": "SQLインジェクション対策として最も直接的なものはどれか。利用者入力をSQLの値として使う。\nSELECT * FROM users\nWHERE id = ? AND password_hash = ?",
    "choices": [
      {
        "label": "ア",
        "text": "Cookie削除"
      },
      {
        "label": "イ",
        "text": "ログ停止"
      },
      {
        "label": "ウ",
        "text": "文字列連結"
      },
      {
        "label": "エ",
        "text": "プレースホルダ"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: プレースホルダ(パラメータ化クエリ)を使うと入力値はSQL構文ではなく単なる値として扱われ、注入攻撃を防げる。間違いやすいポイント: 文字列連結はむしろ脆弱性の原因であり対策にならない。覚え方: 「?」のようなプレースホルダに値を後からバインドする方式を選ぶ。"
  },
  {
    "id": 18,
    "cat": "情報セキュリティ",
    "topic": "セッション管理",
    "q": "セッションID漏えいへの対策として適切なのはどれか。セッションIDは認証後の利用者を識別する。",
    "choices": [
      {
        "label": "ア",
        "text": "HTTPSと安全なCookie属性"
      },
      {
        "label": "イ",
        "text": "ログアウト削除"
      },
      {
        "label": "ウ",
        "text": "ID固定"
      },
      {
        "label": "エ",
        "text": "URLへ常時表示"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: HTTPSによる暗号化と、Secure・HttpOnlyなど安全なCookie属性の設定によりセッションIDの漏えいや盗用を防げる。間違いやすいポイント: URLにセッションIDを表示する方式はブラウザ履歴やログに残り漏えいしやすいため逆効果。覚え方: 「セッションIDはCookie+HTTPSで保護、URLに載せない」。"
  },
  {
    "id": 19,
    "cat": "情報セキュリティ",
    "topic": "パスワード保護",
    "q": "パスワード保存方法として適切なのはどれか。DB漏えい時に元パスワードが直接判明しにくい方式を選ぶ。",
    "choices": [
      {
        "label": "ア",
        "text": "ZIP"
      },
      {
        "label": "イ",
        "text": "平文"
      },
      {
        "label": "ウ",
        "text": "Base64"
      },
      {
        "label": "エ",
        "text": "ソルト付きハッシュ"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: ソルト付きハッシュは一方向変換かつユーザごとに異なる値になるため、DB漏えい時でも元のパスワードが直接判明しにくい。間違いやすいポイント: Base64は単なるエンコードであり誰でも容易に復元できるため安全な保存方法ではない。覚え方: 「保存は不可逆のハッシュ+ソルトで、暗号化や単純エンコードとは別物」。"
  },
  {
    "id": 20,
    "cat": "情報セキュリティ",
    "topic": "多要素認証",
    "q": "パスワードに加えて端末のワンタイムコードを使う方式はどれか。要素1=知識、要素2=所持。",
    "choices": [
      {
        "label": "ア",
        "text": "RAID"
      },
      {
        "label": "イ",
        "text": "多要素認証"
      },
      {
        "label": "ウ",
        "text": "デジタル署名"
      },
      {
        "label": "エ",
        "text": "単一要素"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: パスワード(知識要素)と端末のワンタイムコード(所持要素)という異なる種類の要素を組み合わせているため多要素認証にあたる。間違いやすいポイント: どちらも「認証に使う情報」という点だけを見て単一要素だと誤解してしまう。覚え方: 「知識・所持・生体」のうち異なる種類を2つ以上組み合わせたものが多要素認証。"
  },
  {
    "id": 21,
    "cat": "配列操作",
    "topic": "周期処理(干支)",
    "q": "干支を求める関数eto(year)について、2001年は巳(添字5)である。配列の添字は0から始まる。\n○文字列型: eto(整数型: year)\n  文字列型の配列: E ← {\"子\",\"丑\",\"寅\",\"卯\",\"辰\",\"巳\",\"午\",\"未\",\"申\",\"酉\",\"戌\",\"亥\"}\n  return E[(5 + (year - 2001)) mod 12]\neto(2025)とeto(2032)の戻り値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "午・丑"
      },
      {
        "label": "イ",
        "text": "巳・丑"
      },
      {
        "label": "ウ",
        "text": "巳・子"
      },
      {
        "label": "エ",
        "text": "午・子"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 2025は(5+24) mod 12=5で巳、2032は(5+31) mod 12=0で子。間違いやすいポイント: 基準年との差を足し忘れる、mod 12の余りを1ずらして数える。覚え方: 基準の添字+年差を周期Nで割った余りが添字。"
  },
  {
    "id": 22,
    "cat": "ソートアルゴリズム",
    "topic": "クイックソートの分割",
    "q": "末尾を基準値にするパーティション。\n○整数型: partition(整数型の配列: A, 整数型: lo, 整数型: hi)\n  整数型: p ← A[hi]\n  整数型: i ← lo - 1\n  整数型: j\n  for (j を lo から hi - 1 まで 1 ずつ増やす)\n    if (A[j] <= p)\n      i ← i + 1\n      A[i] と A[j] を交換する\n    endif\n  endfor\n  A[i + 1] と A[hi] を交換する\n  return i + 1\nA = {5, 8, 2, 7, 3, 6, 4}に対してpartition(A, 0, 6)を実行した後のAと戻り値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "{2,3,5,7,8,6,4}・1"
      },
      {
        "label": "イ",
        "text": "{2,3,4,7,8,6,5}・2"
      },
      {
        "label": "ウ",
        "text": "{2,3,4,7,8,6,5}・3"
      },
      {
        "label": "エ",
        "text": "{2,3,4,5,6,7,8}・2"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 基準値4以下の2と3が左へ集まり、最後にA[2]とA[6]を交換して4が確定、戻り値は基準値の位置2。間違いやすいポイント: 最後の交換を忘れる(戻り値1)、戻り値を要素数や位置+1と取り違える、全体が整列されると誤解する。覚え方: partitionは基準値の位置を確定するだけで全体は整列しない。"
  },
  {
    "id": 23,
    "cat": "探索アルゴリズム",
    "topic": "二分探索の途中状態",
    "q": "二分探索。\n○整数型: bsearch(整数型の配列: A, 整数型: n, 整数型: x)\n  整数型: left ← 0\n  整数型: right ← n - 1\n  整数型: mid\n  while (left <= right)\n    mid ← (left + right) ÷ 2 の商\n    if (A[mid] = x)\n      return mid\n    elseif (A[mid] < x)\n      left ← mid + 1\n    else\n      right ← mid - 1\n    endif\n  endwhile\n  return -1\nA = {3, 8, 12, 17, 21, 26, 30, 35}、n = 8、x = 12のとき、whileの2回目の繰返しが終わった時点の(left, right)と、最終的な戻り値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(0,2)・2"
      },
      {
        "label": "イ",
        "text": "(1,2)・2"
      },
      {
        "label": "ウ",
        "text": "(2,2)・3"
      },
      {
        "label": "エ",
        "text": "(2,2)・2"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 1回目はmid=3でA[3]=17>12よりright=2、2回目はmid=1でA[1]=8<12よりleft=2となり(2,2)。3回目でmid=2、A[2]=12が見つかり戻り値は2。間違いやすいポイント: 添字を1始まりで数えて3にする、1回目終了時点の(0,2)と取り違える。覚え方: 毎回midを書き出してleft/rightを更新する。"
  },
  {
    "id": 24,
    "cat": "スタック・キュー",
    "topic": "BFSとDFSの訪問順",
    "q": "無向グラフ(ノード1〜5、辺は1-2, 1-3, 2-4, 3-4, 4-5)を、出発点を1として探索する。隣接ノードは番号の小さい順に処理する。BFS(キュー使用)とDFS(再帰)の訪問順の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "BFS: 1,2,3,4,5 / DFS: 1,2,4,3,5"
      },
      {
        "label": "イ",
        "text": "BFS: 1,2,4,3,5 / DFS: 1,2,3,4,5"
      },
      {
        "label": "ウ",
        "text": "BFS: 1,2,3,4,5 / DFS: 1,2,4,5,3"
      },
      {
        "label": "エ",
        "text": "BFS: 1,3,2,4,5 / DFS: 1,2,4,3,5"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: BFSは1の隣接2,3を先にキューへ入れ、その後4、5の順で1,2,3,4,5。DFSは1→2→4と深く進み、4の隣接のうち小さい3を先に訪問して戻り、最後に5で1,2,4,3,5。間違いやすいポイント: DFSで4の次を5にする(隣接は小さい順なので3が先)。覚え方: BFSは近い順、DFSは行き止まりまで進んでから戻る。"
  },
  {
    "id": 25,
    "cat": "再帰処理",
    "topic": "回文判定のバグ発見",
    "q": "文字列が回文(前から読んでも後ろから読んでも同じ)かを判定する。左端lと右端rの文字を比べ、一致すれば内側へ進む。\n○論理型: isPal(文字列型: s, 整数型: l, 整数型: r)\n  if (l >= r)\n    return true\n  endif\n  if (s[l] ≠ s[r])\n    return false\n  endif\n  return isPal(s, l + 1, r)\nisPal(\"abba\", 0, 3)は正しい結果を返さない。実際の戻り値と、正しい修正の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "trueを返す・修正不要"
      },
      {
        "label": "イ",
        "text": "falseを返す・条件を l = r にする"
      },
      {
        "label": "ウ",
        "text": "falseを返す・最後の行を isPal(s, l - 1, r + 1) にする"
      },
      {
        "label": "エ",
        "text": "falseを返す・最後の行を isPal(s, l + 1, r - 1) にする"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 最後の再帰でrを縮めないため、l=1,r=3でb≠aとなりfalseを返す。左右を同時に内側へ進めるisPal(s, l+1, r-1)が正しい。間違いやすいポイント: 終了条件の誤りと思い込む、再帰の方向を外側(l-1, r+1)にする。覚え方: 回文判定は左を+1、右を-1して範囲を狭める。"
  },
  {
    "id": 26,
    "cat": "スタック・キュー",
    "topic": "循環バッファの途中状態",
    "q": "添字は0から始まる。要素数4の整数配列bufを循環バッファとして使う。bufの要素は全て0、変数head,tail,countは全て0で始める。\n○put(x)\n if (count = 4)\n  何もしない\n else\n  buf[tail] ← x\n  tail ← (tail + 1) mod 4\n  count ← count + 1\n endif\n○get()\n if (count = 0)\n  return -1\n endif\n v ← buf[head]\n head ← (head + 1) mod 4\n count ← count - 1\n return v\n次の順に実行した。\nput(5), put(7), put(2), get(), put(9), put(4), put(6), get(), put(8)\n全て実行した後のbuf[0], buf[1], buf[2], buf[3]はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "4, 8, 2, 9"
      },
      {
        "label": "イ",
        "text": "4, 6, 8, 9"
      },
      {
        "label": "ウ",
        "text": "5, 8, 2, 9"
      },
      {
        "label": "エ",
        "text": "4, 7, 2, 9"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: put(5,7,2)でbuf[0..2]、get()で5を取り出しhead=1、put(9)でbuf[3]、put(4)でtailが0に戻りbuf[0]=4(count=4で満杯)。put(6)は満杯のため無視され、get()で7を取り出し、put(8)がbuf[1]=8に入る。 間違いやすいポイント: put(6)が満杯で無視されることを見落とすとbuf[1]=6, buf[2]=8となり「4, 6, 8, 9」になる(同等ロジックで実行して確認)。取り出した要素は消えずに残るだけで、tailが回ってきたときに上書きされる。 覚え方: 循環バッファはhead(取出し位置)とtail(書込み位置)をmodで回し、countで満杯・空を判定する。"
  },
  {
    "id": 27,
    "cat": "再帰処理",
    "topic": "ユークリッドの互除法(再帰の空欄補充)",
    "q": "2つの正の整数の最大公約数を再帰で求める。a mod b は a を b で割った余りである。\n○整数型: gcd(整数型: a, 整数型: b)\n if (b = 0)\n  return a\n else\n  return gcd( □ )\n endif\ngcd(84, 36) が12を返して終了するために、□に入れる実引数はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "a mod b, b"
      },
      {
        "label": "イ",
        "text": "b, a mod b"
      },
      {
        "label": "ウ",
        "text": "a - b, b"
      },
      {
        "label": "エ",
        "text": "b, a div b"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: gcd(84,36)→gcd(36,12)→gcd(12,0)となり、b=0で12を返す。つまり実引数は(b, a mod b)。 間違いやすいポイント: (a mod b, b)は引数の順が逆でgcd(12,36)→gcd(12,36)...と同じ形に戻り終了しない。(a−b, b)はaが負になり終了しない。(b, a div b)は商を使うため結果が12にならない。 覚え方: 再帰は『問題を小さくする』『終了条件(b=0)に近づく』の2点を確認する。"
  },
  {
    "id": 28,
    "cat": "文字列処理",
    "topic": "ランレングス圧縮のトレース",
    "q": "添字は1から始まる。文字列sの同じ文字の連続を「文字＋連続個数」に圧縮する。nはsの長さで、andは左の条件が偽なら右の条件を評価しない。\nout ← \"\"\ni ← 1\nwhile (i <= n)\n c ← s[i]\n k ← 1\n while (i + k <= n and s[i + k] = c)\n  k ← k + 1\n endwhile\n out ← out + c + 個数を表す文字(k)\n i ← i + k\nendwhile\ns = \"wwwbbwwwwb\"(n=10)のとき、処理後のoutはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "w7b3"
      },
      {
        "label": "イ",
        "text": "w3b2w4b"
      },
      {
        "label": "ウ",
        "text": "w3b2w4b1"
      },
      {
        "label": "エ",
        "text": "w2b1w3b0"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 先頭から連続を数え、www→w3、bb→b2、wwww→w4、b→b1(個数1も出力)。 間違いやすいポイント: 文字ごとの合計(w7b3)は連続でなく全体の集計。最後のbは個数1でも『b1』と出力される。内側のループは i+k がnを超えない範囲で比較する。 覚え方: 外側は『次の塊の先頭 i』、内側は『塊の長さ k』を進め、最後に i ← i + k で塊の分だけ飛ぶ。"
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

// 今の周回の問題別進捗(4分類)。missedListは使わず、allHistory(idつき)とusedIdsだけで判定する。
// 旧形式の履歴(idなし)は問題idを推測せず「判定不能」として扱う。
const classifyCycle = (qs, history, usedIds) => {
  const byId = new Map();
  (history||[]).forEach(h => { if(h && h.id != null) byId.set(h.id, h); });
  const hasLegacy = (history||[]).some(h => h && h.id == null);
  const used = new Set(usedIds||[]);
  const rows = qs.map(q => {
    const h = byId.get(q.id);
    let st;
    if(h) st = h.correct ? "ok" : "ng";
    else if(used.has(q.id)) st = hasLegacy ? "unk" : "pending";
    else st = "new";
    return { id:q.id, topic:q.topic, cat:q.cat, st };
  });
  return { rows, hasLegacy };
};
const PROG_LABEL = { ok:"✅ 正解", ng:"❌ 不正解", pending:"⏸ 出題済み・未回答", unk:"❔ 出題済み・判定不能(旧履歴)", new:"○ 未出題" };
const PROG_NOTE = "※この機能追加前に回答した問題は、問題IDが履歴に保存されていないため、正解・不正解・中断を問題単位では判定できません。次の周回から完全に判定できます。";

function CycleProgressBox({ title, questions, history, usedIds }){
  const [copied, setCopied] = useState(false);
  const { rows, hasLegacy } = classifyCycle(questions, history, usedIds);
  const groups = { ok:[], ng:[], [hasLegacy?"unk":"pending"]:[], new:[] };
  rows.forEach(r => groups[r.st].push(r));
  const order = hasLegacy ? ["ok","ng","unk","new"] : ["ok","ng","pending","new"];
  const colorOf = { ok:C.green, ng:C.red, pending:C.warn, unk:C.warn, new:C.muted };
  const shortLabel = { ok:"正解", ng:"不正解", pending:"出題済み・未回答", unk:"出題済み・判定不能", new:"未出題" };

  const buildText = () => {
    const lines = [`📊 ${title} 今の周回 進捗`, "", `全${questions.length}問`];
    order.forEach(k => lines.push(`${shortLabel[k]}: ${groups[k].length}問`));
    if(hasLegacy){ lines.push("", "※機能追加前の回答履歴には問題IDがないため、", "一部は正解・不正解・中断を問題単位で判定できません。"); }
    order.forEach(k => {
      lines.push("", `■ ${shortLabel[k]}`);
      if(groups[k].length === 0) lines.push("(なし)");
      groups[k].forEach(r => lines.push(`問${r.id} ${r.topic}`));
    });
    return lines.join("\n");
  };
  const handleCopy = () => {
    const text = buildText();
    const done = () => { setCopied(true); setTimeout(()=>setCopied(false), 2000); };
    const fallback = () => {
      const ta = document.getElementById("cycle-copy-area");
      if(ta){ ta.value = text; ta.select(); try{ document.execCommand("copy"); done(); }catch(e){} }
    };
    try{ navigator.clipboard.writeText(text).then(done).catch(fallback); }catch(e){ fallback(); }
  };

  return(
    <div style={{background:C.surface, border:`1px solid ${C.border}`, borderRadius:10, padding:14, marginBottom:16}}>
      <div style={{fontSize:13, fontWeight:600, marginBottom:10}}>今の周回の問題別進捗（全{questions.length}問）</div>
      <div style={{display:"flex", gap:6, marginBottom:10}}>
        {order.map(k=>(
          <div key={k} style={{flex:1, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 4px", textAlign:"center"}}>
            <div style={{fontFamily:"monospace", fontSize:18, fontWeight:700, color:colorOf[k]}}>{groups[k].length}</div>
            <div style={{fontSize:10, color:C.muted, lineHeight:1.3}}>{shortLabel[k]}</div>
          </div>
        ))}
      </div>
      {hasLegacy && <div style={{fontSize:11, color:C.warn, lineHeight:1.6, marginBottom:10}}>{PROG_NOTE}</div>}
      <div style={{display:"flex", justifyContent:"flex-end", marginBottom:8}}>
        <button style={s.copyBtn(copied)} onClick={handleCopy}>{copied ? "✓ コピーしました" : "今の周回の進捗をコピー"}</button>
      </div>
      <details>
        <summary style={{fontSize:12, color:C.accent, cursor:"pointer", padding:"4px 0"}}>問題別の一覧を開く</summary>
        <div style={{marginTop:6}}>
          {rows.map(r=>(
            <div key={r.id} style={{display:"flex", gap:8, alignItems:"baseline", padding:"6px 0", borderBottom:`1px solid ${C.border}`, fontSize:12}}>
              <span style={{fontFamily:"monospace", color:C.muted, width:44, flexShrink:0}}>問{r.id}</span>
              <span style={{width:112, flexShrink:0, color:colorOf[r.st]}}>{PROG_LABEL[r.st]}</span>
              <span style={{flex:1, lineHeight:1.4}}>{r.topic}</span>
            </div>
          ))}
        </div>
      </details>
      <textarea id="cycle-copy-area" readOnly value="" style={{position:"absolute", left:"-9999px", top:0}}/>
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
    const currentSignature = buildSignature(ALL_QUESTIONS);
    let storedSignature = null;
    try{ storedSignature = localStorage.getItem(LS_QVERSION); }catch(e){}
    const contentChanged = hasContentChanged(storedSignature, ALL_QUESTIONS);
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
        const updatedHistory=[...h,{id:q.id,cat:q.cat,topic:q.topic,correct:ok}];
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
                🔄 問題をリセット（全25問に戻す）
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
            <CycleProgressBox title="FE科目B" questions={ALL_QUESTIONS} history={allHistory} usedIds={usedIds}/>
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
