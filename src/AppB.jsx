import React, { useState, useCallback, useEffect } from "react";
import { ensureSnapshot, logAnswer, startLogSession, newCycleId } from "./answerLog";
import BackupBox from "./BackupBox";
import GptExportBox from "./GptExportBox";

// localStorage管理
const LS_TARGET = "feb_cycle_target"; // 今の周回の対象問題id(周回開始時点で固定。追加問題は次周から参加)
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

// 周回の対象固定: 周回の開始時点の問題idを保存し、途中で追加された問題は次の周回から参加させる。
// target === null は「周回がまだ始まっていない」状態で、その時点の全問題が対象になる。
const inCycleTarget = (target, id) => target === null || target.includes(id);
const cycleBase = (qs, target, cat, used) => qs.filter(q => inCycleTarget(target, q.id) && (cat==="すべて"||q.cat===cat) && !used.includes(q.id));
const resolveTarget = (rawStored, allIds, usedCount, contentChanged) => {
  if(contentChanged || usedCount === 0) return null;
  let tgt = null;
  try{ const arr = rawStored ? JSON.parse(rawStored) : null; if(Array.isArray(arr)) tgt = arr.filter(id => allIds.includes(id)); }catch(e){}
  return (tgt === null || tgt.length === 0) ? allIds : tgt;
};

const CATS = [
  "すべて","アルゴリズム・プログラミング","配列操作","再帰処理",
  "ソートアルゴリズム","探索アルゴリズム","スタック・キュー","文字列処理","情報セキュリティ",
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
  },
  {
    "id": 29,
    "cat": "文字列処理",
    "topic": "文字のずらし処理",
    "q": "文字列を、鍵の数字に従って1文字ずつずらす。添字は0から始まる。文字コードはA=0、B=1、…、Z=25とし、len(x)はxの長さを表す。文字コードが((c + k) mod 26)である文字を、新しい文字とする。\n○文字列型: shift(文字列型: s, 文字列型: key)\n 文字列型: out ← \"\"\n for (i を 0 から len(s) - 1 まで 1 ずつ増やす)\n  整数型: k ← key[i mod len(key)] の数字\n  整数型: c ← s[i] の文字コード\n  out ← out + コードが ((c + k) mod 26) である文字\n endfor\n return out\nshift(\"ZEBRA\", \"321\") の戻り値はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "CGCSB"
      },
      {
        "label": "イ",
        "text": "BFETB"
      },
      {
        "label": "ウ",
        "text": "CGCUC"
      },
      {
        "label": "エ",
        "text": "CHEUD"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 鍵は i mod 3 で繰り返し使う(3,2,1,3,2)。Z(25)+3=28→mod26=2→C、E(4)+2=6→G、B(1)+1=2→C、R(17)+3=20→U、A(0)+2=2→C。よってCGCUC。 間違いやすいポイント: 4文字目以降も鍵を繰り返す(i mod len(key))。鍵の最後の数字を使い続けるとCGCSB、鍵の開始位置がずれるとBFETB、鍵を使わず一定値3でずらすとCHEUDになる。ZはmodでAの側に戻る。 覚え方: 『i mod 鍵の長さ』で鍵が循環し、『mod 26』で文字が循環する。"
  },
  {
    "id": 30,
    "cat": "配列操作",
    "topic": "配列の途中状態",
    "q": "添字は0から始まる。配列aの要素数をnとする。引数の配列は参照渡しで、関数内の変更は呼出し元のaに反映される。\n○reverse(整数型の配列: a, 整数型: lo, 整数型: hi)\n while (lo < hi)\n  整数型: t ← a[lo]\n  a[lo] ← a[hi]\n  a[hi] ← t\n  lo ← lo + 1\n  hi ← hi - 1\n endwhile\n○mystery(整数型の配列: a, 整数型: n, 整数型: k)\n reverse(a, 0, k - 1)\n reverse(a, k, n - 1)\n reverse(a, 0, n - 1)\na = {5, 8, 2, 9, 4, 7, 1}、n = 7、k = 3 で mystery(a, n, k) を実行する。mystery内の2回目のreverseの呼出しが終わった直後の配列aはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "{2, 8, 5, 9, 4, 7, 1}"
      },
      {
        "label": "イ",
        "text": "{2, 8, 5, 1, 7, 4, 9}"
      },
      {
        "label": "ウ",
        "text": "{9, 4, 7, 1, 5, 8, 2}"
      },
      {
        "label": "エ",
        "text": "{5, 8, 2, 1, 7, 4, 9}"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 1回目のreverse(a,0,2)で{2,8,5,9,4,7,1}。2回目のreverse(a,3,6)で添字3〜6の{9,4,7,1}が{1,7,4,9}になり、{2,8,5,1,7,4,9}。 間違いやすいポイント: {2,8,5,9,4,7,1}は1回目終了時点、{9,4,7,1,5,8,2}は3回目まで終えた最終結果。{5,8,2,1,7,4,9}は1回目の範囲(0〜k-1)の反転を忘れた値。聞かれているのは『2回目の直後』。 覚え方: 範囲(lo, hi)を端から内側へ交換する。どの呼出しの直後かを先に確認する。"
  },
  {
    "id": 31,
    "cat": "情報セキュリティ",
    "topic": "ログの判定処理",
    "q": "認証システムは、ログを1件ずつ順に処理して、ログインの成否を判定する。ログの記号は、Sが正しいパスワードの入力、Fが誤ったパスワードの入力を表す。判定の規則は次のとおりである。\n・ロック中は、S、Fのどちらも拒否し、状態を変更しない。\n・ロック中でなくFのとき、失敗回数に1を加え、失敗回数が3以上になったらロック中にする。\n・ロック中でなくSのとき、ログイン成功として成功件数に1を加え、失敗回数を0に戻す。\n初期状態は、ロック中でない、失敗回数0、成功件数0である。\nログがF、F、S、F、F、S、F、F、F、S の順に並んでいるとき、全て処理した後の成功件数と状態の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "成功件数1、ロック中"
      },
      {
        "label": "イ",
        "text": "成功件数3、ロック中"
      },
      {
        "label": "ウ",
        "text": "成功件数2、ロック中でない"
      },
      {
        "label": "エ",
        "text": "成功件数2、ロック中"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: F,F(失敗2)→S(成功1、失敗0に戻る)→F,F(失敗2)→S(成功2、失敗0)→F,F,F(失敗3でロック)→最後のSはロック中で拒否。よって成功件数2、ロック中。 間違いやすいポイント: 成功で失敗回数を戻さずに累計で数えると成功件数1(途中でロック)。最後のSをロック中でも成功にすると成功件数3。ロックは3回連続の失敗で起きる(最後の3つのF)。 覚え方: 規則を状態(失敗回数・ロック)の更新として1件ずつ表にして追う。"
  },
  {
    "id": 32,
    "cat": "アルゴリズム・プログラミング",
    "topic": "範囲の更新の追跡",
    "q": "添字は0から始まる。÷は商の整数部分を表す。配列aは昇順(同じ値を含む)に並んでおり、nは要素数である。\n○整数型: find(整数型の配列: a, 整数型: n, 整数型: x)\n 整数型: lo ← 0\n 整数型: hi ← n\n while (lo < hi)\n  整数型: mid ← (lo + hi) ÷ 2\n  if (a[mid] < x)\n   lo ← mid + 1\n  else\n   hi ← mid\n  endif\n endwhile\n return lo\na = {3, 7, 7, 12, 12, 12, 18, 25, 25}、n = 9 で find(a, 9, 12) を実行したときの、戻り値とwhileの繰返し回数の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "戻り値 4、繰返し 3回"
      },
      {
        "label": "イ",
        "text": "戻り値 5、繰返し 3回"
      },
      {
        "label": "ウ",
        "text": "戻り値 6、繰返し 4回"
      },
      {
        "label": "エ",
        "text": "戻り値 3、繰返し 3回"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: (lo,hi)＝(0,9)でmid4、a[4]＝12は12未満でないのでhi＝4。(0,4)でmid2、a[2]＝7＜12なのでlo＝3。(3,4)でmid3、a[3]＝12なのでhi＝3。lo＝hi＝3で終了。戻り値3、繰返し3回。 間違いやすいポイント: 最初に12を見つけたmid(4)で終わると誤らない。条件が『＜』なので、xと等しい最初の位置(最も小さい添字)まで狭まる。『≦』と読み違えると最後の12の次の6が返る。 覚え方: lo/hiの更新を1回ごとに(lo,hi,mid,a[mid])の表にして追う。"
  },
  {
    "id": 33,
    "cat": "配列操作",
    "topic": "条件に合う要素の前詰め",
    "q": "添字は0から始まる。配列aの要素数をnとする。次の関数は、引数limの以下の値を配列の前方に集める。\n○整数型: arrange(整数型の配列: a, 整数型: n, 整数型: lim)\n 整数型: k ← 0\n for (i を 0 から n - 1 まで 1 ずつ増やす)\n  if ( 空欄a )\n   整数型: t ← a[k]\n   a[k] ← a[i]\n   a[i] ← t\n   k ← 空欄b\n  endif\n endfor\n return k\na = {7, 2, 9, 4, 1, 8}、n = 6、lim = 4 で arrange(a, 6, 4) を実行したところ、aは {2, 4, 1, 7, 9, 8} になり、戻り値は3であった。空欄a、空欄bに入る式の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "空欄a: a[i] < lim　空欄b: k + 1"
      },
      {
        "label": "イ",
        "text": "空欄a: a[i] <= lim　空欄b: k + 1"
      },
      {
        "label": "ウ",
        "text": "空欄a: a[i] <= lim　空欄b: i + 1"
      },
      {
        "label": "エ",
        "text": "空欄a: a[k] <= lim　空欄b: k + 1"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 空欄aがa[i] <= lim、空欄bがk + 1のとき、i＝1(2)でa[0]と交換して{2,7,9,4,1,8}、k＝1。i＝3(4)でa[1]と交換して{2,4,9,7,1,8}、k＝2。i＝4(1)でa[2]と交換して{2,4,1,7,9,8}、k＝3となり、結果と一致する。 間違いやすいポイント: 『<』では4が前に来ず{2,1,9,4,7,8}、戻り値2になる。bをi+1にすると途中でkがずれて{2,7,4,9,1,8}、戻り値5になる。a[k]を調べると条件が成立せず何も変わらない。 覚え方: kは『集め終えた個数＝次に置く位置』。調べるのはa[i]、置くたびにk＋1。"
  },
  {
    "id": 34,
    "cat": "アルゴリズム・プログラミング",
    "topic": "呼出しの戻り値の連結",
    "q": "正の整数nを2進数の文字列に変換する次の関数convを作った(例: 6は \"110\")。\n○文字列型: conv(整数型: n)\n if (n < 2)\n  return n を文字列にしたもの\n endif\n return (n mod 2 を文字列にしたもの) + conv(n ÷ 2)\n+は文字列の連結を、÷は商の整数部分を、modは余りを表す。実際に conv(13) を実行したときの戻り値と、意図どおり \"1101\" を返すようにするための修正の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "戻り値 \"1101\"。連結の順序を入れ替え、conv(n ÷ 2) を先に、n mod 2 の文字列を後にする。"
      },
      {
        "label": "イ",
        "text": "戻り値 \"1011\"。終了条件を n < 1 に変更する。"
      },
      {
        "label": "ウ",
        "text": "戻り値 \"1011\"。連結の順序を入れ替え、conv(n ÷ 2) を先に、n mod 2 の文字列を後にする。"
      },
      {
        "label": "エ",
        "text": "戻り値 \"1011\"。終了条件を n = 1 に変更する。"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: conv(13)＝\"1\"＋conv(6)、conv(6)＝\"0\"＋conv(3)、conv(3)＝\"1\"＋conv(1)＝\"1\"＋\"1\"＝\"11\"。よってconv(6)＝\"011\"、conv(13)＝\"1011\"。下位の桁を先に連結するため桁の順が逆になっている。連結を conv(n ÷ 2) ＋ (n mod 2) にすれば \"1101\" になる。 間違いやすいポイント: 戻り値を正しい2進表記\"1101\"と思い込まない。終了条件を n < 1 にすると末尾に余分な\"0\"が付いて\"10110\"になる。n = 1 にしてもconv(13)の動きは変わらない。 覚え方: 再帰の戻り値は内側(小さいn)から確定する。上位の桁を先に並べたいなら、再帰呼出しの結果を先に置く。"
  },
  {
    "id": 35,
    "cat": "アルゴリズム・プログラミング",
    "topic": "操作履歴の状態",
    "q": "文字列型の変数curと、文字列型のスタックA、Bがある。最初はcur＝\"P0\"で、AとBは空である。push(x)はスタックの頂上にxを積み、pop()は頂上の値を取り出して返す。\n○go(文字列型: p)\n A.push(cur)\n cur ← p\n B を空にする\n○prev()\n if (A が空でない)\n  B.push(cur)\n  cur ← A.pop()\n endif\n○next()\n if (B が空でない)\n  A.push(cur)\n  cur ← B.pop()\n endif\ngo(\"P1\")、go(\"P2\")、go(\"P3\")、prev()、prev()、go(\"P4\")、prev()、next()、prev()、prev()、next() をこの順に実行した後の、cur、A、Bの内容の組合せはどれか。スタックの内容は底から頂上の順に示す。",
    "choices": [
      {
        "label": "ア",
        "text": "cur: \"P1\"　A: P0　B: P4"
      },
      {
        "label": "イ",
        "text": "cur: \"P1\"　A: P0　B: P3, P2, P4"
      },
      {
        "label": "ウ",
        "text": "cur: \"P4\"　A: (空)　B: (空)"
      },
      {
        "label": "エ",
        "text": "cur: \"P4\"　A: P0　B: P1"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 実行の過程は(cur,A,B)で、go3回後(P3,[P0,P1,P2],[])、prev2回後(P1,[P0],[P3,P2])、go(P4)後(P4,[P0,P1],[])、prev後(P1,[P0],[P4])、next後(P4,[P0,P1],[])、prev2回後(P0,[],[P4,P1])、next後(P1,[P0],[P4])。 間違いやすいポイント: go()でBを空にし忘れると、Bに古いP3,P2が残る。next()でcurをAに積み忘れるとAが空になる。Bを先頭から取り出すとcurがP4になる。 覚え方: 1操作ごとに(cur,A,B)を書き並べる。スタックは常に頂上から出入りする。"
  },
  {
    "id": 36,
    "cat": "情報セキュリティ",
    "topic": "記録の整合性の検証",
    "q": "取引記録の改ざんを検知するため、記録を1件ずつ連鎖させたハッシュ値を保存している。各件の保存ハッシュ値は『(直前の件の保存ハッシュ値×7＋金額) mod 100』で求める(1件目の直前の値は0)。検証では、各件について同じ式で再計算した値と、その件の保存ハッシュ値を比べる。ある日の検証対象は次のとおりである。\n件 | 金額 | 保存ハッシュ値\n1 | 30 | 30\n2 | 45 | 55\n3 | 52 | 97\n4 | 60 | 39\n5 | 25 | 98\n攻撃者が1件だけ金額を書き換えたとき、検証で保存値と一致しない件と、攻撃者が金額とそれ以降の保存ハッシュ値を全て再計算して書き換えても改ざんを検知できるようにするための対策の組合せとして、適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "3件目から5件目まで。最新のハッシュ値を、改ざんできない別の媒体に保管する(または署名を付けて保管する)。"
      },
      {
        "label": "イ",
        "text": "3件目のみ。最新のハッシュ値を、改ざんできない別の媒体に保管する(または署名を付けて保管する)。"
      },
      {
        "label": "ウ",
        "text": "3件目のみ。金額の列を暗号化して保存する。"
      },
      {
        "label": "エ",
        "text": "3件目から5件目まで。ハッシュ値の計算式を非公開にする。"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 再計算は直前の件の『保存』ハッシュ値を使う。1件目30、2件目(30×7＋45)mod100＝55で一致。3件目は(55×7＋52)mod100＝37で保存値97と不一致。4件目は(97×7＋60)mod100＝39、5件目は(39×7＋25)mod100＝98でどちらも一致。不一致は3件目のみ。連鎖全体を再計算されても検知できるよう、最新のハッシュ値を別の場所に保管する。 間違いやすいポイント: 再計算値を連鎖させると4・5件目も不一致になるが、本問の検証は保存値を使う。金額の暗号化は漏えい対策で、再計算しての改ざんを防げない。式の非公開は秘密に頼る対策で、攻撃者が式を知れば無効になる。 覚え方: ハッシュの連鎖は改ざんの位置を絞れる。全体を作り直されないよう、基準となる値を別に固定する。"
  },
  {
    "id": 37,
    "cat": "アルゴリズム・プログラミング",
    "topic": "関数の戻り値の連鎖",
    "q": "添字は0から始まる。mod は余りを表す。配列ngは、1のとき当番にしない(不在など)ことを表し、配列cntは当番を務めた回数を表す。\n○整数型: nx(整数型の配列: ng, 整数型: n, 整数型: cur)\n 整数型: k ← (cur + 1) mod n\n while (ng[k] = 1)\n  k ← (k + 1) mod n\n endwhile\n return k\n\nメインの処理は次のとおりである。\n整数型の配列: ng ← {0, 0, 0, 1, 0, 0}\n整数型の配列: cnt ← {1, 0, 0, 0, 1, 0}\n整数型: cur ← 3\nfor (d を 1 から 8 まで 1 ずつ増やす)\n cur ← nx(ng, 6, cur)\n cnt[cur] ← cnt[cur] + 1\n if (cnt[cur] >= 2)\n  ng[cur] ← 1\n endif\nendfor\n実行後の配列cntの内容と、変数curの値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "cnt: {3, 1, 1, 0, 3, 2}　cur: 0"
      },
      {
        "label": "イ",
        "text": "cnt: {2, 2, 2, 0, 2, 2}　cur: 2"
      },
      {
        "label": "ウ",
        "text": "cnt: {2, 2, 1, 1, 2, 2}　cur: 1"
      },
      {
        "label": "エ",
        "text": "cnt: {2, 1, 1, 0, 2, 2}　cur: 0"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 当番は順に 4,5,0,1,2,5,1,2(d=1〜8)。d=1でcnt[4]が2になりng[4]=1、d=3でng[0]=1、d=6では3と4を飛ばして5(cnt[5]が2でロック)、d=7では0を飛ばして1(ロック)、d=8でcur=2。最終はcnt={2,2,2,0,2,2}、cur=2。 間違いやすいポイント: ng[cur]の更新を見落とすと当番が{4,5,0,1,2,4,5,0}となり、cnt={3,1,1,0,3,2}、cur=0。ng[3]を無視すると3も当番になる。cntの初期値(1が2か所)を0として数えるとcnt[0]とcnt[4]がずれる。 覚え方: 関数の戻り値を使う側で更新した配列が、次の呼出しの条件に影響することを追う。"
  },
  {
    "id": 38,
    "cat": "配列操作",
    "topic": "2次元配列の更新",
    "q": "添字は0から始まる。orは論理和、<>は等しくないことを表す。次の関数は、h行w列の配列gの全要素を0にしたうえで、1からh×wまでの整数を順に格納する。\n○整数型の2次元配列: fill(整数型: h, 整数型: w)\n 整数型の2次元配列: g ← h行w列で全ての要素が0\n 整数型の配列: dr ← {0, 1, 0, -1}\n 整数型の配列: dc ← {1, 0, -1, 0}\n 整数型: r ← 0\n 整数型: c ← 0\n 整数型: t ← 0\n for (v を 1 から h × w まで 1 ずつ増やす)\n  g[r][c] ← v\n  整数型: nr ← r + dr[t]\n  整数型: nc ← c + dc[t]\n  if (nr < 0 or nr >= h or nc < 0 or nc >= w or g[nr][nc] <> 0)\n   t ← (t + 1) mod 4\n   nr ← r + dr[t]\n   nc ← c + dc[t]\n  endif\n  r ← nr\n  c ← nc\n endfor\n return g\nfill(4, 5) を実行した。v＝12の繰返しが終了した直後(v＝13の繰返しを始める前)のr、c、tの値と、実行終了後のg[2][3]の値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "r: 3　c: 0　t: 2　g[2][3]: 18"
      },
      {
        "label": "イ",
        "text": "r: 2　c: 0　t: 3　g[2][3]: 19"
      },
      {
        "label": "ウ",
        "text": "r: 1　c: 0　t: 3　g[2][3]: 17"
      },
      {
        "label": "エ",
        "text": "r: 2　c: 0　t: 3　g[2][3]: 18"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 位置は1〜5が1行目、6〜8が右端を下へ、9〜12が最下行を左へ進む。v=12はg[3][0]に格納され、次は左(列-1)が範囲外なのでt=3(上向き)に変えて(r,c)=(2,0)になる。以降は13→g[2][0]、14→g[1][0]と上へ進み、15から内側(1行目の右、g[1][1])へ入る。内側は15〜17が右へ、18〜20が下の行を左へ進み、g[2][3]は18。 間違いやすいポイント: t=2(r=3)は向きを変える前の値。g[2][3]が19、r=1(g[1][0])で17になるのは、位置や順番を1つずらした数え間違い。向きを変えた後に、nr,ncを計算し直す点に注意。 覚え方: 向きを変えたら、その向きで進む先を再計算する。"
  },
  {
    "id": 39,
    "cat": "スタック・キュー",
    "topic": "配列を用いた逐次処理",
    "q": "文字列を左から1文字ずつ見て、直前に残っている文字と同じ文字が来たら、その2文字を両方取り除き、そうでなければ残す。この処理を、配列stをスタックとして使って実現する。添字は0から始まり、|s|は文字列sの長さ、s[i]はsのi番目の文字を表す。\n○文字列型: proc(文字列型: s)\n 文字型の配列: st ← 要素数|s|の配列\n 整数型: top ← 0\n for (i を 0 から |s| - 1 まで 1 ずつ増やす)\n  if (top > 0 and st[top - 1] = s[i])\n   top ← 空欄a\n  else\n   st[top] ← s[i]\n   top ← 空欄b\n  endif\n endfor\n return st[0]からst[top - 1]までを連結した文字列(top＝0のときは空文字列)\nproc(\"abbaca\") の戻り値が \"ca\" となり、proc(\"abccba\") の戻り値が空文字列となるための、空欄a、空欄bに入る式の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "空欄a: top - 1　空欄b: top + 1"
      },
      {
        "label": "イ",
        "text": "空欄a: top - 1　空欄b: top"
      },
      {
        "label": "ウ",
        "text": "空欄a: top - 2　空欄b: top + 1"
      },
      {
        "label": "エ",
        "text": "空欄a: 0　空欄b: top + 1"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: topは残っている文字の個数。同じ文字が来たら、その文字は積まずに直前の1文字を取り除くのでtop-1、違う文字なら積んでtop+1。\"abbaca\"はa,bを積み、次のbで取り除いて{a}、次のaで取り除いて空、c,aを積んで\"ca\"。\"abccba\"はc,b,aが順に取り除かれ空になる。 間違いやすいポイント: 空欄bがtopのままだと、積んでも個数が増えず結果が空になる。空欄aがtop-2だと余計に消えて\"aca\"になる。空欄aが0だと、残っている文字を全て捨ててしまい\"aca\"になる。 覚え方: スタックの個数を表す変数は、積むときに+1、取り除くときに-1。"
  },
  {
    "id": 40,
    "cat": "再帰処理",
    "topic": "呼出し回数の追跡",
    "q": "添字は0から始まる。\n○整数型: f(整数型の配列: a, 整数型: i, 整数型: rest)\n if (rest = 0)\n  return 1\n endif\n if (i < 0 or rest < 0)\n  return 0\n endif\n return f(a, i - 1, rest - a[i]) + f(a, i - 1, rest)\na ← {2, 3, 1, 4} のとき、f(a, 3, 5) を実行した。戻り値と、fが呼び出された回数(最初の呼出しを含む)の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "戻り値: 2　呼出し回数: 27"
      },
      {
        "label": "イ",
        "text": "戻り値: 4　呼出し回数: 23"
      },
      {
        "label": "ウ",
        "text": "戻り値: 2　呼出し回数: 23"
      },
      {
        "label": "エ",
        "text": "戻り値: 2　呼出し回数: 25"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: fは、a[0]〜a[i]のうち幾つかを選んで合計をrestにする方法の数を返す。f(a,3,5)の展開で、rest=0で1を返すのは{2,3}(=5)と{1,4}(=5)の2通りで戻り値は2。呼出し回数は、rest=0、rest<0、i<0のいずれかで止まる枝を数えて全体で23回。 間違いやすいポイント: rest<0やrest=0の打切りを見落とすと、枝を余分に展開して回数が増える(25回や27回)。戻り値4は、2通りを二重に数えた場合。 覚え方: 再帰の呼出し回数は、終了条件で止まる枝を数えながら木に書き出す。"
  },
  {
    "id": 41,
    "cat": "情報セキュリティ",
    "topic": "検知結果と対策",
    "q": "あるシステムでは、ログイン試行の記録に次の2つの検知ルールを適用している。時刻は秒で、各ルールは「その試行の時刻から直近60秒間(その試行を含む)」の失敗を数える。\nルール1: 同一ユーザへのログイン失敗が3回以上になったら、そのユーザのアカウントをロックする。\nルール2: 同一の送信元IPアドレスから、異なる3人以上のユーザへのログイン失敗があったら、その送信元IPアドレスを遮断する。\nログイン試行の記録(F=失敗、S=成功)\n時刻 | ユーザ | 送信元IP | 結果\n0 | alice | 10.0.0.5 | F\n10 | bob | 10.0.0.5 | F\n20 | carol | 10.0.0.5 | F\n25 | dave | 10.0.0.9 | F\n40 | dave | 10.0.0.9 | F\n70 | dave | 10.0.0.9 | F\n80 | erin | 10.0.0.7 | F\n150 | erin | 10.0.0.7 | F\n230 | erin | 10.0.0.7 | F\n240 | erin | 10.0.0.7 | S\nこの記録に対する検知結果と、検知漏れを減らすための対策の組合せとして、適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ルール1でalice、bob、carolがロックされ、ルール2で10.0.0.5が遮断される。daveとerinへの試行は検知されない。対策として、失敗を数える時間幅を10分に広げる。"
      },
      {
        "label": "イ",
        "text": "ルール1でdaveがロックされ、ルール2で10.0.0.5が遮断される。erinへの試行は検知されない。対策として、失敗を数える時間幅を60秒から10分に広げる。"
      },
      {
        "label": "ウ",
        "text": "ルール1でdaveがロックされ、ルール2で10.0.0.5が遮断される。erinへの試行は検知されない。対策として、ルール1のしきい値を3回から1回に下げ、1回の失敗でロックする。"
      },
      {
        "label": "エ",
        "text": "ルール1でdaveとerinがロックされ、ルール2で10.0.0.5が遮断される。全ての試行が検知される。対策は不要である。"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 10.0.0.5は0・10・20秒に3人(alice、bob、carol)へ失敗しているのでルール2で遮断(20秒時点)。daveは25・40・70秒の3回が直近60秒に収まるのでルール1でロック(70秒時点)。erinは80・150・230秒と、間隔が60秒を超えるため直近60秒の失敗は常に1回で、検知されないまま240秒に成功している(低速な総当たり)。時間幅を10分に広げると、230秒の時点で3回が数えられ、成功(240秒)の前にロックできる。 間違いやすいポイント: alice、bob、carolは各1回の失敗でルール1に該当しない。しきい値を1回にすると、利用者の入力ミスでも全員ロックされ、業務に支障が出る。 覚え方: 短い時間幅だけでは、ゆっくり行う攻撃を見逃す。時間幅を広げて累積も見る。"
  },
    {
      "id": 42,
      "cat": "探索アルゴリズム",
      "topic": "繰返しごとの範囲の追跡",
      "q": "添字は0から始まる。÷は商の整数部分を表す。配列Aは昇順に整列済みである。\n○整数型: find(整数型の配列: A, 整数型: n, 整数型: x)\n 整数型: left ← 0\n 整数型: right ← n - 1\n while (left <= right)\n  整数型: mid ← (left + right) ÷ 2\n  if (A[mid] = x)\n   return mid\n  elseif (A[mid] < x)\n   left ← mid + 1\n  else\n   right ← mid - 1\n  endif\n endwhile\n return -1\nA = {3, 8, 12, 19, 23, 31, 40, 47, 55}、n = 9、x = 47 で find(A, n, x) を実行する。3回目の繰返しの処理を始めるとき(midを求める前)の(left, right)はどれか。",
      "choices": [
        {
          "label": "ア",
          "text": "(6, 8)"
        },
        {
          "label": "イ",
          "text": "(7, 8)"
        },
        {
          "label": "ウ",
          "text": "(5, 8)"
        },
        {
          "label": "エ",
          "text": "(7, 7)"
        }
      ],
      "correct": "イ",
      "hint": "正解理由: 1回目は(0,8)でmid=4、A[4]=23<47なのでleft=5。2回目は(5,8)でmid=6、A[6]=40<47なのでleft=7。3回目の開始時点は(7,8)。 間違いやすいポイント: A[mid]<xのとき、midは既に調べて不一致なので、次の範囲はmid+1から。left←midとすると(6,8)になる。(5,8)は2回目の更新を忘れた値。 覚え方: 繰返しごとに『left, right, mid, A[mid], 分岐, 更新後』を表に書き出す。"
    },
    {
      "id": 43,
      "cat": "探索アルゴリズム",
      "topic": "分岐ごとの更新後の範囲",
      "q": "添字は0から始まる。÷は商の整数部分を表す。配列Aは昇順に整列済みである。\n○整数型: find(整数型の配列: A, 整数型: n, 整数型: x)\n 整数型: left ← 0\n 整数型: right ← n - 1\n while (left <= right)\n  整数型: mid ← (left + right) ÷ 2\n  if (A[mid] = x)\n   return mid\n  elseif (A[mid] < x)\n   left ← mid + 1\n  else\n   right ← mid - 1\n  endif\n endwhile\n return -1\nA = {4, 9, 15, 22, 28, 36, 41, 50}、n = 8、x = 28 で find(A, n, x) を実行する。2回目の繰返しで、if文の分岐の処理が終わった直後の(left, right)はどれか。",
      "choices": [
        {
          "label": "ア",
          "text": "(4, 5)"
        },
        {
          "label": "イ",
          "text": "(3, 4)"
        },
        {
          "label": "ウ",
          "text": "(4, 6)"
        },
        {
          "label": "エ",
          "text": "(4, 4)"
        }
      ],
      "correct": "エ",
      "hint": "正解理由: 1回目は(0,7)でmid=3、A[3]=22<28なのでleft=4。2回目は(4,7)でmid=5、A[5]=36>28なのでright=mid-1=4。処理後は(4,4)。 間違いやすいポイント: A[mid]>xのときもmidは不一致と分かっているので、right←mid-1。right←midとすると(4,5)。1回目でleft←midとすると(3,4)になる。 覚え方: 『小さければleftをmid+1、大きければrightをmid-1』。調べ済みのmidは範囲から外す。"
    },
    {
      "id": 44,
      "cat": "探索アルゴリズム",
      "topic": "終了条件と戻り値",
      "q": "添字は0から始まる。÷は商の整数部分を表す。配列Aは昇順に整列済みである。\n○整数型: find(整数型の配列: A, 整数型: n, 整数型: x)\n 整数型: left ← 0\n 整数型: right ← n - 1\n while (left <= right)\n  整数型: mid ← (left + right) ÷ 2\n  if (A[mid] = x)\n   return mid\n  elseif (A[mid] < x)\n   left ← mid + 1\n  else\n   right ← mid - 1\n  endif\n endwhile\n return -1\nA = {2, 6, 10, 14, 18, 22}、n = 6、x = 15 で find(A, n, x) を実行する。戻り値と、whileの本体(ループ内の処理)を実行した回数の組合せはどれか。",
      "choices": [
        {
          "label": "ア",
          "text": "戻り値-1、実行回数3回"
        },
        {
          "label": "イ",
          "text": "戻り値-1、実行回数2回"
        },
        {
          "label": "ウ",
          "text": "戻り値3、実行回数3回"
        },
        {
          "label": "エ",
          "text": "処理が終わらない(無限ループ)"
        }
      ],
      "correct": "ア",
      "hint": "正解理由: 1回目は(0,5)でmid=2、A[2]=10<15なのでleft=3。2回目は(3,5)でmid=4、A[4]=18>15なのでright=3。3回目は(3,3)でmid=3、A[3]=14<15なのでleft=4。left>rightとなり終了し、-1を返す(本体3回)。 間違いやすいポイント: 最後の(3,3)の回を数え忘れて2回にする。戻り値は最後のmidではなく、見つからなかったことを表す-1。left←mid+1、right←mid-1と更新するので、範囲は必ず狭まり終了する。 覚え方: 見つからない場合は、left>rightになるまで範囲が狭まり続ける。"
    },
    {
      "id": 45,
      "cat": "アルゴリズム・プログラミング",
      "topic": "値の更新の追跡",
      "q": "÷は商の整数部分、mod は余りを表す。\n○整数型: calc(整数型: p, 整数型: q)\n while (q <> 0)\n  整数型: r ← p mod q\n  p ← q\n  q ← r\n endwhile\n return p\ncalc(252, 105) の戻り値はどれか。",
      "choices": [
        {
          "label": "ア",
          "text": "42"
        },
        {
          "label": "イ",
          "text": "52"
        },
        {
          "label": "ウ",
          "text": "21"
        },
        {
          "label": "エ",
          "text": "0"
        }
      ],
      "correct": "ウ",
      "hint": "正解理由: (p,q)の推移は (252,105)→(105,42)→(42,21)→(21,0)。q=0になったのでp=21を返す。 間違いやすいポイント: 42は1回少なく止めた値。52は mod を ÷(商)と取り違えた値((252,105)→(105,2)→(2,52)→(52,0))。0は最後のqを返した値。 覚え方: 余り(mod)で新しいqを作り、古いqが新しいpになる。q=0になった時点のpが結果。(p,q)の推移を1行ずつ書く。"
    },
    {
      "id": 46,
      "cat": "再帰処理",
      "topic": "再帰呼出しの追跡",
      "q": "mod は余りを表す。\n○整数型: g(整数型: a, 整数型: b)\n if (b = 0)\n  return a\n endif\n return g(b, a mod b)\ng(60, 42) を呼び出したとき、関数gが実行される回数(最初の呼出しを含む)と戻り値の組合せはどれか。",
      "choices": [
        {
          "label": "ア",
          "text": "3回、戻り値6"
        },
        {
          "label": "イ",
          "text": "4回、戻り値0"
        },
        {
          "label": "ウ",
          "text": "3回、戻り値18"
        },
        {
          "label": "エ",
          "text": "4回、戻り値6"
        }
      ],
      "correct": "エ",
      "hint": "正解理由: 呼出しの引数は g(60,42)→g(42,18)→g(18,6)→g(6,0)。b=0の呼出しでaの6を返し、それが全ての呼出しの戻り値になる。実行回数は4回。 間違いやすいポイント: b=0で終了する最後の呼出し(g(6,0))も実行回数に含める。戻り値は終了時のb(0)ではなくa(6)。引数は(b, a mod b)の順に入れ替わり、(a mod b, b)の順ではない。 覚え方: 『古いbが新しいaになり、余りが新しいbになる』を呼出しごとに書く。"
    },
    {
      "id": 47,
      "cat": "アルゴリズム・プログラミング",
      "topic": "条件に応じた2変数の更新",
      "q": "次の関数を考える。\n○整数型: calc2(整数型: w, 整数型: v)\n while (w <> v)\n  if (w > v)\n   w ← w - v\n  else\n   v ← v - w\n  endif\n endwhile\n return w\ncalc2(84, 36) の戻り値はどれか。",
      "choices": [
        {
          "label": "ア",
          "text": "12"
        },
        {
          "label": "イ",
          "text": "24"
        },
        {
          "label": "ウ",
          "text": "36"
        },
        {
          "label": "エ",
          "text": "48"
        }
      ],
      "correct": "ア",
      "hint": "正解理由: (w,v)の推移は (84,36)→(48,36)→(12,36)→(12,24)→(12,12)。w=vになったので12を返す。 間違いやすいポイント: 大きいほうから小さいほうを引く向きを間違えない。途中の値(24、36、48)は推移の途中の値で、w=vになる前に止めると誤る。 覚え方: 条件で『どちらを更新するか』を毎回決めてから引く。(w,v)の推移を1行ずつ書き、w=vで止める。"
    },
  {
    "id": 48,
    "cat": "スタック・キュー",
    "topic": "更新を繰り返す配列の読み出し",
    "q": "配列bufと変数head、cntを使う次の処理を考える。添字は0から始まり、mod は剰余を表す。\n整数型の配列: buf ← {0, 0, 0, 0}\n整数型: head ← 0\n整数型: cnt ← 0\n○rec(整数型: v)\n 整数型: pos\n pos ← (head + cnt) mod 4\n if (cnt < 4)\n  cnt ← cnt + 1\n else\n  head ← (head + 1) mod 4\n endif\n buf[pos] ← v\n○整数型: recent(整数型: k)\n 整数型: s ← 0\n for (i を 0 から k - 1 まで 1 ずつ増やす)\n  s ← s + buf[空欄a]\n endfor\n return s\nrec(5)、rec(3)、rec(8)、rec(2)、rec(7)、rec(4) をこの順に実行した後、recent(3) の戻り値が13となるための、空欄aに入る式はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(head + i) mod 4"
      },
      {
        "label": "イ",
        "text": "(head + cnt - i) mod 4"
      },
      {
        "label": "ウ",
        "text": "(cnt - 1 - i) mod 4"
      },
      {
        "label": "エ",
        "text": "(head + cnt - 1 - i) mod 4"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 6回のrec後は buf＝{7,4,8,2}、head＝2、cnt＝4(5回目以降は満杯なので、最も古い位置headを上書きしてheadを進める)。最新の値は添字 (head+cnt-1) mod 4＝1(値4)、その前は0(値7)、さらに前は3(値2)で、合計13。 間違いやすいポイント: (head + i) mod 4 は古い側から読むので8+2+7＝17、(head + cnt - i) mod 4 は1つずれて8+4+7＝19、(cnt - 1 - i) mod 4 はheadを無視して2+8+4＝14になる。 覚え方: 最新の要素の位置は『head+cnt-1』。1つ戻るごとに添字を1減らし、modで折り返す。"
  },
  {
    "id": 49,
    "cat": "文字列処理",
    "topic": "処理結果の不一致の原因",
    "q": "同じ文字が連続する部分を『文字＋連続した個数』に置き換える次の関数packがある。添字は0から始まり、length(s)は文字列sの長さ、toString(n)は整数nの10進表記の文字列、+は文字列の連結を表す。sは1文字以上とする。\n○文字列型: pack(文字列型: s)\n 文字列型: out ← \"\"\n 文字型: c ← s[0]\n 整数型: n ← 1\n for (i を 1 から length(s) - 1 まで 1 ずつ増やす)\n  if (s[i] = c)\n   n ← n + 1\n  else\n   out ← out + c + toString(n)\n   c ← s[i]\n   n ← 1\n  endif\n endfor\n return out\npack(\"mmmnoopppp\") の戻り値が期待する \"m3n1o2p4\" と一致しなかった。pack(\"mmmnoopppp\") の実際の戻り値と、期待どおりに動作させる修正の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "戻り値 \"m3n1o2p4\"　修正: return の直前に out ← out + c + toString(n) を追加する"
      },
      {
        "label": "イ",
        "text": "戻り値 \"m3n1o2\"　修正: return の直前に out ← out + c + toString(n) を追加する"
      },
      {
        "label": "ウ",
        "text": "戻り値 \"m3n1o2\"　修正: else節の n ← 1 を n ← 0 に変更する"
      },
      {
        "label": "エ",
        "text": "戻り値 \"m3n1o2\"　修正: c ← s[0] を c ← s[1] に変更する"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 文字が変わった時点で直前の連続分だけを出力するため、最後の連続(pppp)はループ終了後も変数c、nに残ったままで出力されず、戻り値は \"m3n1o2\" になる。ループの後で最後の連続分を追加すれば \"m3n1o2p4\" になる。 間違いやすいポイント: n←0にすると個数が1つ少なくなり別の誤りになる。c←s[1]にすると先頭の文字が数えられない。 覚え方: 『変化を検出して出力する』処理は、最後の塊が未出力で残る。ループ後の後始末が必要。"
  },
  {
    "id": 50,
    "cat": "情報セキュリティ",
    "topic": "規則の評価順と判定結果",
    "q": "ファイルサーバのアクセス制御で、次の規則1〜4が表の順に評価される。評価は、規則の『役割』が要求者の役割と一致し、かつ要求されたパスが規則の『パス』で始まる場合にその規則が一致したとみなし、一致した規則のうち最後の規則の動作を採用する。どの規則にも一致しない場合は拒否とする。\n規則1: 役割staff　パス/data/　動作 許可\n規則2: 役割staff　パス/data/hr/　動作 拒否\n規則3: 役割temp　パス/data/　動作 許可\n規則4: 役割staff　パス/data/hr/payroll/　動作 許可\n次の4つの要求(a)〜(d)の判定結果と、情報漏えいを防ぐための見直し方針の組合せとして適切なものはどれか。\n(a) staff が /data/sales/q3.csv を読む\n(b) staff が /data/hr/list.csv を読む\n(c) staff が /data/hr/payroll/2026.csv を読む\n(d) temp が /data/hr/list.csv を読む",
    "choices": [
      {
        "label": "ア",
        "text": "判定: (a)許可 (b)拒否 (c)許可 (d)許可。見直し: 拒否規則を優先して評価し、役割ごとに必要最小限の許可だけを定義する。"
      },
      {
        "label": "イ",
        "text": "判定: (a)許可 (b)拒否 (c)許可 (d)許可。見直し: 例外が出るたびに許可規則を追加し、個別に許可する方針に統一する。"
      },
      {
        "label": "ウ",
        "text": "判定: (a)許可 (b)拒否 (c)拒否 (d)許可。見直し: 拒否規則を優先して評価し、役割ごとに必要最小限の許可だけを定義する。"
      },
      {
        "label": "エ",
        "text": "判定: (a)許可 (b)許可 (c)許可 (d)許可。見直し: 拒否規則を優先して評価し、役割ごとに必要最小限の許可だけを定義する。"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: (a)は規則1のみ一致で許可。(b)は規則1(許可)・規則2(拒否)が一致し、最後の規則2で拒否。(c)は規則1・2・4が一致し、最後の規則4で許可となり、人事の給与データがstaffに見えてしまう。(d)は規則3のみ一致で許可で、一時的な利用者が人事情報に到達できる。順序依存の評価は設定ミスで漏えいに直結するので、拒否優先と最小権限が有効。 間違いやすいポイント: 『最後に一致した規則』ではなく『拒否が優先』や『最初に一致』と読み違えると結果が変わる。許可の積み増しは最小権限に反する。 覚え方: 規則の順序依存を避け、拒否優先・既定拒否・最小権限で設計する。"
  },
  {
    "id": 51,
    "cat": "アルゴリズム・プログラミング",
    "topic": "入力値の判定と回数",
    "q": "押している間は0、離している間は1となるスイッチの値を一定の間隔で読み取り、読み取った値を順に関数sampleに渡す。次の処理について考える。\n整数型: prev ← 1\n整数型: run ← 1\n整数型: stable ← 1\n整数型: count ← 0\n整数型: led ← 0\n○sample(整数型: v)\n if (v = prev)\n  run ← run + 1\n else\n  run ← 1\n endif\n prev ← v\n if (run = 3 and v ≠ stable)\n  stable ← v\n  if (stable = 0)\n   count ← count + 1\n   led ← 1 - led\n  endif\n endif\n読み取った値 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 1 の22個をこの順にsampleへ渡した後の、count、led、stable、runの値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "count=3　led=1　stable=1　run=2"
      },
      {
        "label": "イ",
        "text": "count=1　led=1　stable=0　run=2"
      },
      {
        "label": "ウ",
        "text": "count=3　led=1　stable=0　run=2"
      },
      {
        "label": "エ",
        "text": "count=5　led=1　stable=0　run=2"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 同じ値が3回続いた時点で状態(stable)が確定する。0が4回続く(2〜5番目)と3個目でstable=0、count=1、led=1。1が3回(6〜8番目)でstable=1。0が3回(9〜11番目)でstable=0、count=2、led=0。1が3回(12〜14番目)でstable=1。0が4回(15〜18番目)でstable=0、count=3、led=1。最後の1、0、1、1は3回続かないのでstableは0のままで、最後の1、1でrun=2。 間違いやすいポイント: 2回で確定すると読み違えると最後の1、1でstable=1になる(count=3, led=1, stable=1)。4回以上で確定すると読むとcountが1になる。離したときにもcountを増やすと5になる。 覚え方: 『同じ値がN回続いたら確定』の処理は、runを数え、確定した値(stable)が変わるときだけ処理する。"
  },
  {
    "id": 52,
    "cat": "配列操作",
    "topic": "関数を使った配列の途中状態",
    "q": "次の処理を考える。添字は0から始まり、配列の要素数は7である。\n整数型の配列: a ← {5, 7, 5, 7, 8, 6, 6}\n整数型: n ← 7\n整数型: cnt ← 0\n整数型: p\n整数型: t\n○整数型: posMin(整数型の配列: x, 整数型: from, 整数型: n)\n 整数型: m ← from\n for (j を from + 1 から n - 1 まで 1 ずつ増やす)\n  if (x[j] < x[m])\n   m ← j\n  endif\n endfor\n return m\nfor (i を 0 から n - 2 まで 1 ずつ増やす)\n p ← posMin(a, i, n)\n if (p ≠ i)\n  t ← a[i]\n  a[i] ← a[p]\n  a[p] ← t\n  cnt ← cnt + 1\n endif\nendfor\ni＝2の繰返しが終了した直後の、配列aと変数cntの組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "a={5, 5, 6, 7, 8, 7, 6}　cnt=2"
      },
      {
        "label": "イ",
        "text": "a={5, 5, 6, 7, 8, 6, 7}　cnt=3"
      },
      {
        "label": "ウ",
        "text": "a={5, 5, 7, 7, 8, 6, 6}　cnt=1"
      },
      {
        "label": "エ",
        "text": "a={5, 5, 6, 6, 8, 7, 7}　cnt=3"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: i=0: posMin(a,0,7)は、5より小さい要素がないので0を返し(a[2]=5は<でないので更新されない)、交換なし。i=1: 区間1〜6の最小5は添字2なのでp=2、交換して{5,5,7,7,8,6,6}、cnt=1。i=2: 区間2〜6の最小6は最初に現れる添字5(a[6]=6は<でないので更新されない)なのでp=5、a[2]とa[5]を交換して{5,5,6,7,8,7,6}、cnt=2。 間違いやすいポイント: 比較を≦にすると同値でも更新され、i=0で添字2と交換してcntが増え、i=2では添字6と交換して{5,5,6,7,8,6,7}、cnt=3になる。i=1終了時({5,5,7,7,8,6,6}、cnt=1)やi=3終了時({5,5,6,6,8,7,7}、cnt=3)と取り違えない。 覚え方: 関数の戻り値(最小値の位置)を使って交換する。同じ値が複数あるときは、比較が<か≦かで選ばれる位置が変わる。"
  },
  {
    "id": 53,
    "cat": "情報セキュリティ",
    "topic": "ログ判定ルールと追加の対策",
    "q": "認証システムが、ログイン失敗を次の規則で監視している。規則R: アカウント単位で、直近60秒以内(その失敗を含む)の失敗が4回以上になったら、そのアカウントをロックする(ロック後の失敗は数えない)。規則S: 送信元IP単位で、直近60秒以内(その失敗を含む)の失敗が20回以上になったら、そのIPを遮断する。\n次のログ(時刻、送信元IP、アカウントの順。失敗のみ記録)を時刻順に処理した。\n0秒　198.51.100.7　a1\n4秒　198.51.100.7　a2\n8秒　198.51.100.7　a3\n10秒　203.0.113.5　u1\n14秒　198.51.100.7　a4\n18秒　198.51.100.7　a5\n20秒　203.0.113.5　u1\n22秒　198.51.100.7　a6\n26秒　198.51.100.7　a1\n30秒　203.0.113.5　u1\n31秒　198.51.100.7　a2\n36秒　198.51.100.7　a3\n40秒　203.0.113.5　u1\n41秒　198.51.100.7　a4\n46秒　198.51.100.7　a5\n52秒　198.51.100.7　a6\n規則RとSでは、IP 198.51.100.7からの、多数のアカウントに少ない回数ずつ試す攻撃を検知できていない。次の条件を満たしつつ、この攻撃を検知する対策を考える。条件1: 正規利用者の誤入力でロックされるアカウントを増やさない。条件2: 共有ネットワーク(NAT)の拠点では、同一IPから多数の正規利用者が失敗する可能性があり、IP単位の失敗回数だけで遮断すると、正規利用者を巻き込む。\nログの処理結果(ロックされるアカウント、遮断されるIP)と、追加する規則の組合せとして最も適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ロック: u1のみ　遮断IP: なし　追加する規則: アカウントのロックの閾値を4回から2回に下げる"
      },
      {
        "label": "イ",
        "text": "ロック: u1とa1〜a6　遮断IP: なし　追加する規則: 同一IPの直近60秒の失敗のうち、異なるアカウントの数が5以上になったら、そのIPからの認証に追加の確認(CAPTCHAなど)を求める"
      },
      {
        "label": "ウ",
        "text": "ロック: u1のみ　遮断IP: 198.51.100.7　追加する規則: IP単位の遮断の閾値を20回から12回に下げる"
      },
      {
        "label": "エ",
        "text": "ロック: u1のみ　遮断IP: なし　追加する規則: 同一IPの直近60秒の失敗のうち、異なるアカウントの数が5以上になったら、そのIPからの認証に追加の確認(CAPTCHAなど)を求める"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: u1は10、20、30、40秒の4回の失敗で、40秒の時点でロックされる。a1〜a6は各2回ずつ(いずれも60秒以内)で4回に達せず、198.51.100.7の失敗は合計12回で20回に達しないので遮断されない。したがってロックはu1のみ、遮断IPはなし。攻撃の特徴は『短時間に多数の異なるアカウントを試す』ことなので、同一IPの異なるアカウント数(18秒の時点で5個に達する)を監視し、遮断ではなく追加の確認を求めれば、条件1・2を満たしつつ早い段階で検知できる。 間違いやすいポイント: ロックの閾値を2回に下げると、a1〜a6を含む7アカウントがロックされ、誤入力による不要なロックが増える(条件1に反する)。IPの遮断閾値を12回に下げると198.51.100.7は12回目(52秒)の失敗の後に遮断されるが、攻撃のほぼ全体が終わった後で、共有ネットワークの正規利用者を巻き込む(条件2に反する)。 覚え方: 1つのアカウントへの連続試行=アカウント単位の規則、多数のアカウントへの少数回の試行(パスワードスプレー)=IPごとの『異なるアカウント数』で見る。"
  },
  {
    "id": 54,
    "cat": "アルゴリズム・プログラミング",
    "topic": "配列と関数の戻り値による割当",
    "q": "添字は0から始まる。mod は余りを表す。配列usedは、1のとき箱が満杯で使えないことを表し、配列loadは各箱に入れた重さの合計を表す。\n○整数型: pick(整数型の配列: used, 整数型: n, 整数型: p)\n 整数型: k ← (p + 1) mod n\n while (used[k] = 1)\n  k ← (k + 1) mod n\n endwhile\n return k\n\nメインの処理は次のとおりである。\n整数型の配列: used ← {0, 0, 0, 0, 0}\n整数型の配列: load ← {0, 0, 0, 0, 0}\n整数型の配列: w ← {5, 6, 3, 8, 2, 6, 4}\n整数型: p ← 4\nfor (i を 0 から 6 まで 1 ずつ増やす)\n p ← pick(used, 5, p)\n load[p] ← load[p] + w[i]\n if (load[p] >= 6)\n  used[p] ← 1\n endif\nendfor\n実行後の配列loadの内容と、変数pの値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "load: {11, 10, 3, 8, 2}　p: 1"
      },
      {
        "label": "イ",
        "text": "load: {11, 8, 4, 0, 11}　p: 2"
      },
      {
        "label": "ウ",
        "text": "load: {11, 6, 7, 8, 2}　p: 2"
      },
      {
        "label": "エ",
        "text": "load: {11, 6, 7, 8, 2}　p: 1"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 箱の状態を1個ずつ追う。p=4から開始。w=5: k=0、load[0]=5(6未満で空き)。w=6: k=1、load[1]=6で満杯。w=3: k=2、load[2]=3。w=8: k=3、load[3]=8で満杯。w=2: k=4、load[4]=2。w=6: k=0、load[0]=11で満杯。w=4: k=1は満杯、k=2は空き→load[2]=7で満杯、p=2。最終はload={11, 6, 7, 8, 2}、p=2。 間違いやすいポイント: pickはpの次(p+1)から探す。満杯の判定は加えた後の合計で行う。whileは満杯の箱をまとめて読み飛ばす(ここでは最後の1回だけ読み飛ばす)。読み飛ばした先が新しいpになる。 覚え方: 変数表を作り、1回ごとに「k→load→used→p」の順に更新する。"
  },
  {
    "id": 55,
    "cat": "アルゴリズム・プログラミング",
    "topic": "条件成立回数と状態の反転",
    "q": "次の処理を実行する。mod は余りを表す。\n整数型: count ← 0\n整数型: led ← 0\nfor (i を 1 から 12 まで 1 ずつ増やす)\n if (i mod 3 = 0 or i mod 4 = 0)\n  count ← count + 1\n  led ← 1 - led\n endif\nendfor\n実行後のcountとledの値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "count=6　led=0"
      },
      {
        "label": "イ",
        "text": "count=6　led=1"
      },
      {
        "label": "ウ",
        "text": "count=7　led=1"
      },
      {
        "label": "エ",
        "text": "count=4　led=0"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 条件が成立するiは 3、4、6、8、9、12 の6回(12は3の倍数でも4の倍数でもあるが、1回の繰返しで条件は1回だけ成立する)。count=6。ledは1回ごとに0→1→0→1→0→1→0と切り替わり、6回(偶数回)なので最後は0。 間違いやすいポイント: ledは切替回数が奇数なら1、偶数なら0。回数を数え間違えるとledも変わる。orの条件はどちらか一方でも成立すれば1回と数える(12を2回数えない)。 覚え方: 「条件が成立した繰返し」に印を付けて回数を数え、その回数だけledを切り替える。0→1→0→1の表を書いて確認する。"
  },
  {
    "id": 56,
    "cat": "アルゴリズム・プログラミング",
    "topic": "複数変数を更新する入力処理",
    "q": "値0または1を順に読み取り、関数feedに渡す。次の処理について考える。\n整数型: last ← 0\n整数型: same ← 0\n整数型: armed ← 1\n整数型: hits ← 0\n整数型: led ← 0\n○feed(整数型: v)\n if (v = last)\n  same ← same + 1\n else\n  same ← 1\n endif\n last ← v\n if (same = 2)\n  if (v = 1)\n   if (armed = 1)\n    hits ← hits + 1\n    led ← 1 - led\n    armed ← 0\n   endif\n  else\n   armed ← 1\n  endif\n endif\n読み取った値 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 0, 1, 1 の18個をこの順にfeedへ渡した後の、hits、led、armed、sameの値の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "hits=4　led=0　armed=0　same=2"
      },
      {
        "label": "イ",
        "text": "hits=3　led=1　armed=0　same=2"
      },
      {
        "label": "ウ",
        "text": "hits=3　led=0　armed=0　same=2"
      },
      {
        "label": "エ",
        "text": "hits=3　led=1　armed=1　same=2"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: sameが2になった時だけ判定する。値を順に追うと、1が2回続いた2回目で1回目(armed=1)→hits=1、led=1、armed=0。次の1,1はarmedが0なので数えない。0,0(sameが2)でarmed=1に戻る。続く1,1→hits=2、led=0、armed=0。1が4回続いても判定は2回目の1回だけ。0,0,0でarmed=1に戻り、最後の1,1→hits=3、led=1、armed=0。最後の値は1,1なのでsame=2。 間違いやすいポイント: 「連続する1のまとまりの数」と「hitsが増える回数」は同じではない。armedが0の間は1が2回続いてもhitsは増えない(4を選ぶと誤り)。ledはhitsが増えた回数だけ切り替わる(3回なので1)。 覚え方: 値の列を1個ずつ書き出し、各回の後の5つの変数を表にして更新する。入れ子のifは外側から順に条件を確かめる。"
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
const classifyCycle = (qs, history, usedIds, target) => {
  const byId = new Map();
  (history||[]).forEach(h => { if(h && h.id != null) byId.set(h.id, h); });
  const hasLegacy = (history||[]).some(h => h && h.id == null);
  const used = new Set(usedIds||[]);
  const rows = qs.map(q => {
    const h = byId.get(q.id);
    let st;
    if(h) st = h.correct ? "ok" : "ng";
    else if(used.has(q.id)) st = hasLegacy ? "unk" : "pending";
    else if(!inCycleTarget(target === undefined ? null : target, q.id)) st = "later";
    else st = "new";
    return { id:q.id, topic:q.topic, cat:q.cat, st };
  });
  return { rows, hasLegacy };
};
const PROG_LABEL = { later:"🔜 次周から参加", ok:"✅ 正解", ng:"❌ 不正解", pending:"⏸ 出題済み・未回答", unk:"❔ 出題済み・判定不能(旧履歴)", new:"○ 未出題" };
const PROG_NOTE = "※この機能追加前に回答した問題は、問題IDが履歴に保存されていないため、正解・不正解・中断を問題単位では判定できません。次の周回から完全に判定できます。";

function CycleProgressBox({ title, questions, history, usedIds, target }){
  const [copied, setCopied] = useState(false);
  const { rows, hasLegacy } = classifyCycle(questions, history, usedIds, target);
  const groups = { later:[], ok:[], ng:[], [hasLegacy?"unk":"pending"]:[], new:[] };
  rows.forEach(r => groups[r.st].push(r));
  const order = hasLegacy ? ["ok","ng","unk","new"] : ["ok","ng","pending","new"];
  const colorOf = { later:C.muted, ok:C.green, ng:C.red, pending:C.warn, unk:C.warn, new:C.muted };
  const shortLabel = { later:"次周から参加", ok:"正解", ng:"不正解", pending:"出題済み・未回答", unk:"出題済み・判定不能", new:"未出題" };

  const buildText = () => {
    const total = questions.length - groups.later.length;
    const lines = [`📊 ${title} 今の周回 進捗`, "", `全${total}問`];
    order.forEach(k => lines.push(`${shortLabel[k]}: ${groups[k].length}問`));
    if(groups.later.length > 0) lines.push(`次周から参加(追加分): ${groups.later.length}問`);
    if(hasLegacy){ lines.push("", "※機能追加前の回答履歴には問題IDがないため、", "一部は正解・不正解・中断を問題単位で判定できません。"); }
    order.forEach(k => {
      lines.push("", `■ ${shortLabel[k]}`);
      if(groups[k].length === 0) lines.push("(なし)");
      groups[k].forEach(r => lines.push((k==="ok"||k==="ng") ? `問${r.id} ${r.topic}` : `問${r.id}`));
    });
    if(groups.later.length > 0){ lines.push("", "■ 次周から参加"); groups.later.forEach(r => lines.push(`問${r.id}`)); }
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
      <div style={{fontSize:13, fontWeight:600, marginBottom:10}}>今の周回の問題別進捗（全{questions.length - groups.later.length}問）</div>
      <div style={{display:"flex", gap:6, marginBottom:10}}>
        {order.map(k=>(
          <div key={k} style={{flex:1, background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 4px", textAlign:"center"}}>
            <div style={{fontFamily:"monospace", fontSize:18, fontWeight:700, color:colorOf[k]}}>{groups[k].length}</div>
            <div style={{fontSize:10, color:C.muted, lineHeight:1.3}}>{shortLabel[k]}</div>
          </div>
        ))}
      </div>
      {groups.later.length > 0 && <div style={{fontSize:11, color:C.muted, lineHeight:1.6, marginBottom:10}}>追加された{groups.later.length}問は、この周回が終わってから参加します。</div>}
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
              <span style={{flex:1, lineHeight:1.4}}>{(r.st==="ok"||r.st==="ng") ? r.topic : ""}</span>
            </div>
          ))}
        </div>
      </details>
      <textarea id="cycle-copy-area" readOnly value="" style={{position:"absolute", left:"-9999px", top:0}}/>
    </div>
  );
}

// 弱点優先(標準)モードの1セットの最大出題数。1日のノルマではない。
const SET_SIZE = 3;

export default function AppB(){
  const [tab, setTab] = useState("quiz");
  const [cat, setCat] = useState("すべて");
  const [weakMode, setWeakMode] = useState(true); // 標準＝弱点優先。false＝全問周回(任意)
  const [phase, setPhase] = useState("idle");
  const [usedIds, setUsedIds] = useState([]);
  const [cycleTarget, setCycleTarget] = useState(null); // null=周回未開始(全問が対象)
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
  const [noWeakMsg, setNoWeakMsg] = useState(false);
  const [logError, setLogError] = useState("");
  useEffect(()=>{ ensureSnapshot(); },[]);

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
        localStorage.removeItem(LS_TARGET);
      }catch(e){}
    }
    try{ localStorage.setItem(LS_QVERSION, currentSignature); }catch(e){}

    const ids = contentChanged ? [] : store.loadIds().filter(id => ALL_QUESTIONS.some(q=>q.id===id));
    const allIds = ALL_QUESTIONS.map(q=>q.id);
    let rawTarget = null;
    try{ rawTarget = localStorage.getItem(LS_TARGET); }catch(e){}
    const tgt = resolveTarget(rawTarget, allIds, ids.length, contentChanged);
    setCycleTarget(tgt);
    try{ if(tgt === null) localStorage.removeItem(LS_TARGET); else localStorage.setItem(LS_TARGET, JSON.stringify(tgt)); }catch(e){}
    if(ids.length > 0){
      setUsedIds(ids);
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


  const saveUsedIds = useCallback((ids)=>{
    setUsedIds(ids);
    store.saveIds(ids);
  },[]);
  const saveTarget = useCallback((ids)=>{
    setCycleTarget(ids);
    try{ if(ids === null) localStorage.removeItem(LS_TARGET); else localStorage.setItem(LS_TARGET, JSON.stringify(ids)); }catch(e){}
  },[]);

  const startSession = useCallback(async()=>{
    let picked = [];
    // 標準＝弱点優先(復習リストの問題のみ)。候補が無くても未回答問題などで自動補充しない。
    const usingWeak = weakMode;
    if(usingWeak){
      const weakCand = [...new Set(missedList.map(q=>q.id))];
      const pool = ALL_QUESTIONS.filter(q => weakCand.includes(q.id) && (cat==="すべて" || q.cat===cat));
      if(pool.length === 0){ setNoWeakMsg(true); return; }
      picked = shuffle(pool).slice(0, SET_SIZE);
    } else {
      const base = cycleBase(ALL_QUESTIONS, cycleTarget, cat, usedIds);
      if(base.length === 0){
        const fresh = ALL_QUESTIONS.filter(q=>cat==="すべて"||q.cat===cat);
        picked = shuffle(fresh).slice(0,10);
        saveUsedIds(picked.map(q=>q.id));
        saveTarget(ALL_QUESTIONS.map(q=>q.id)); newCycleId("B"); // 新しい周回: その時点の全問題を対象に固定
        // 全問題を1周し終えて新しい周回に入るため、今回の周回成績もリセットする
        setAllHistory([]); setCatStats({}); store.clearCycle();
      } else {
        // 残りが10問未満(周回の端数)の場合は、その残り分だけの少人数セッションにする。
        // 以前は残り10問未満で無条件に「周回終了」と誤判定し、周回の途中でも
        // 今の周回の成績を強制リセットしてしまうバグがあった。
        const sessionSize = Math.min(10, base.length);
        picked = shuffle(base).slice(0, sessionSize);
        saveUsedIds([...usedIds, ...picked.map(q=>q.id)]);
        if(cycleTarget === null) saveTarget(ALL_QUESTIONS.map(q=>q.id)); // 周回の開始: 対象を固定
      }
    }

    setIsWeakSession(usingWeak);
    startLogSession("B");
    setQuestions(picked);
    setAnswers(new Array(picked.length).fill(null));
    setQIdx(0); setChosen(null); setShowFb(false);
    setAnalysis(""); setCopyText(""); setCopied(false);
    setPhase("question");
  },[cat, usedIds, cycleTarget, weakMode, missedList, saveUsedIds, saveTarget]);

  const handleAnswer = useCallback((choice)=>{
    if(showFb) return;
    setChosen(choice); setShowFb(true);
    const q = questions[qIdx];
    const ok = choice.label===q.correct;
    // 回答確定時に問題ID付きの1件を追記(通常・苦手優先とも。失敗は表示する)
    { const lr = logAnswer("B",{question_id:q.id,selected_choice:choice.label,is_correct:ok,mode:isWeakSession?"weak":"normal"}); setLogError(lr.ok?"":(lr.error||"unknown")); }
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

  // 途中終了: 未回答の問題は誤答扱いにせず、全問周回の「使用済み」からも外して繰り越さない
  const endSessionEarly = useCallback(()=>{
    const unanswered = questions.filter((q,i)=>answers[i]===null).map(q=>q.id);
    if(!isWeakSession && unanswered.length>0) saveUsedIds(usedIds.filter(id=>!unanswered.includes(id)));
    setPhase("idle"); setAnalysis(""); setCopyText(""); setCopied(false);
  },[questions,answers,isWeakSession,usedIds,saveUsedIds]);

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
          <div style={s.sub}>基本情報技術者 — 科目B(疑似言語トレース＋セキュリティ)</div>
          {logError && <div style={{fontSize:11,color:C.red,marginTop:4}}>回答ログの保存に失敗しました: {logError}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:8}}>
            <a href="/" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>← 科目Aの問題を解く</a>
            <a href="/terms" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>用語フラッシュカード →</a>
          </div>
        </header>

        <div style={s.tabs}>
          {["quiz","review","history","admin"].map((t,i)=>(
            <button key={t} style={s.tabBtn(tab===t)} onClick={()=>{ setTab(t); if(t==="history") loadDbHistory(); }}>
              {["クイズ","復習","履歴・分析","管理"][i]}
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
                  {progressError && <div style={{fontSize:11,color:C.warn}}>{progressError}</div>}
                  {noWeakMsg && <div style={{lineHeight:1.6}}>いま復習する問題はありません。新しい問題を解く場合は、下の「全問周回モード」を選んでください。</div>}
                </div>
              )}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,color:C.muted,fontFamily:"monospace",marginBottom:8,textTransform:"uppercase",letterSpacing:".06em"}}>分野</div>
                <div style={s.row}>
                  {CATS.map(c=><button key={c} style={s.chip(cat===c)} onClick={()=>setCat(c)}>{c}</button>)}
                </div>
              </div>
              <button style={{...s.btn(),width:"100%"}} onClick={startSession}>
                学習を始める
              </button>
              {/* 全問周回モード(任意)。標準は弱点優先 */}
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,padding:"10px 12px",background:!weakMode?"rgba(88,166,255,.08)":"rgba(255,255,255,.03)",border:`1px solid ${!weakMode?C.accent:C.border}`,borderRadius:8,cursor:"pointer"}}
                onClick={()=>{ setWeakMode(!weakMode); setNoWeakMsg(false); }}>
                <div style={{width:36,height:20,background:!weakMode?C.accent:C.border,borderRadius:10,position:"relative",flexShrink:0,transition:"background .2s"}}>
                  <div style={{width:16,height:16,background:"white",borderRadius:"50%",position:"absolute",top:2,left:!weakMode?18:2,transition:"left .2s"}}/>
                </div>
                <div>
                  <div style={{fontSize:13,color:!weakMode?C.accent:C.muted,fontWeight:!weakMode?700:400}}>全問周回モード（任意）</div>
                  <div style={{fontSize:11,color:C.muted}}>{!weakMode ? "未解答の問題を順に出題" : "標準は弱点優先の復習"}</div>
                </div>
              </div>
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
                    <button style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",fontFamily:"inherit"}} onClick={endSessionEarly}>終了</button>
                    {showFb && <span style={s.catTag}>{q.cat}</span>}
                  </div>
                  {showFb && <div style={s.qnum}>テーマ: {q.topic}</div>}
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
              <div style={{textAlign:"left",marginBottom:16}}>
                <GptExportBox subject="B" questions={ALL_QUESTIONS} defaultScope="wrong" defaultRange="session"/>
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

        {tab==="admin" && (()=>{
          // 管理画面: 総数・周回進捗はここだけに表示する(学習画面には出さない)。数値は登録データから動的に算出
          const allAvail = cycleBase(ALL_QUESTIONS, cycleTarget, "すべて", usedIds);
          const tgtN = cycleTarget ? cycleTarget.length : ALL_QUESTIONS.length;
          const doneN = usedIds.filter(id => inCycleTarget(cycleTarget, id)).length;
          const weakN = new Set(missedList.map(q=>q.id)).size;
          const box=(l,v,color)=>(
            <div key={l} style={s.statBox}>
              <div style={{...s.statNum,color:color||C.accent}}>{v}</div>
              <div style={s.statLabel}>{l}</div>
            </div>
          );
          return(
            <div>
              <div style={s.sectionTitle}>問題バンク</div>
              <div style={{display:"flex",gap:8,marginBottom:18}}>
                {box("総問題数",ALL_QUESTIONS.length)}
                {box("復習リスト",weakN,C.warn)}
              </div>
              <div style={s.sectionTitle}>全問周回（任意）</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                {box("対象数",tgtN)}
                {box("解答済み",doneN,C.green)}
                {box("残り",allAvail.length,C.muted)}
              </div>
              <div style={{fontSize:11,color:C.muted,marginBottom:10,lineHeight:1.6}}>
                {allAvail.length===0 && usedIds.length>0 ? "今の周回は完了しています。再開すると新しい周回を始めます。" : "全問周回は任意です。終わらせる必要はありません。"}
              </div>
              <button style={{...s.btn(),width:"100%",marginBottom:12}} onClick={()=>{ setWeakMode(false); setNoWeakMsg(false); setTab("quiz"); }}>
                全問周回を始める／再開する
              </button>
              <CycleProgressBox title="FE科目B" questions={ALL_QUESTIONS} history={allHistory} usedIds={usedIds} target={cycleTarget}/>
              <button style={{width:"100%",padding:9,background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",marginTop:8}}
                onClick={()=>{ if(window.confirm("使用済み問題をリセットして全問を出題可能にします。今回の周回成績もリセットされます。よろしいですか？")){ saveUsedIds([]); saveTarget(null); newCycleId("B"); setAllHistory([]); setCatStats({}); store.clearCycle(); } }}>
                🔄 問題をリセット（全{ALL_QUESTIONS.length}問に戻す）
              </button>
              <button style={{width:"100%",padding:9,background:"none",border:`1px solid #7f1d1d`,color:"#f87171",borderRadius:8,fontFamily:"inherit",fontSize:12,cursor:"pointer",marginTop:8}}
                onClick={()=>{
                  if(!window.confirm("累計成績・履歴・復習リストを含む全てのデータを完全に削除します。これまでの学習記録は元に戻せません。本当によろしいですか？")) return;
                  if(!window.confirm("最終確認です。累計解答数・正解率など、これまでの記録は全て消えます。本当に実行しますか？")) return;
                  try{
                    localStorage.removeItem(LS_USED);
                    localStorage.removeItem(LS_TARGET);
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
              <BackupBox subject="B"/>
            </div>
          );
        })()}

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
              <div style={s.sectionTitle}>分野別 正解率（今の周回）</div>
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
            <GptExportBox subject="B" questions={ALL_QUESTIONS}/>
          </div>
        )}
      </div>
    </div>
  );
}
