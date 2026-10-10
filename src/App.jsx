import React, { useState, useCallback, useEffect } from "react";
import { ensureSnapshot, logAnswer, startLogSession, newCycleId } from "./answerLog";
import BackupBox from "./BackupBox";
import GptExportBox from "./GptExportBox";

// localStorage管理
const LS_TARGET = "fe_cycle_target"; // 今の周回の対象問題id(周回開始時点で固定。追加問題は次周から参加)
const LS_USED = "fe_used_ids";
const LS_SESSIONS = "fe_sessions";
const LS_MISSED = "fe_missed";
const LS_LIFETIME = "fe_lifetime"; // 生涯累計(セッション履歴とは別に、間引かれず増え続ける集計)
const LS_CYCLE = "fe_cycle"; // 今回の周回成績(問題プールを1周する間、リロードしても消えない)
const LS_QVERSION = "fe_qversion"; // 問題内容のバージョン識別子(内容が変わったら周回・復習リストを自動リセットするために使う)

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
const qFp = (q) => { const s = String(q.id) + "|" + (q.topic||""); let h = 5381; for(let i=0;i<s.length;i++){ h = (((h<<5)+h) + s.charCodeAt(i)) | 0; } return (h>>>0).toString(36); };
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
  "すべて","基礎理論","コンピュータシステム","ネットワーク","情報セキュリティ",
  "データベース","アルゴリズム・プログラミング","ソフトウェア・開発",
  "システム開発","プロジェクトマネジメント","サービスマネジメント","経営・戦略・法務",
];

const ALL_QUESTIONS = [
  {
    "id": 1,
    "cat": "基礎理論",
    "topic": "基数変換",
    "q": "10進数58を2進数で表したものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "111000"
      },
      {
        "label": "イ",
        "text": "111010"
      },
      {
        "label": "ウ",
        "text": "111100"
      },
      {
        "label": "エ",
        "text": "110110"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 58=32+16+8+2=0b111010。間違いやすいポイント: 桁を1つずらすと111100(60)や111000(56)など近い値と混同しやすい。覚え方: 2で割った余りを下から並べる筆算を素早く行う。"
  },
  {
    "id": 2,
    "cat": "基礎理論",
    "topic": "2の補数",
    "q": "8ビット2の補数で-18を表すものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "10010010"
      },
      {
        "label": "イ",
        "text": "11101101"
      },
      {
        "label": "ウ",
        "text": "00010010"
      },
      {
        "label": "エ",
        "text": "11101110"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 18=00010010を反転すると11101101、+1して11101110。間違いやすいポイント: 反転しただけ(+1を忘れる)の11101101を選んでしまう。覚え方: 「反転して+1」を機械的に2段階で実行する。"
  },
  {
    "id": 3,
    "cat": "基礎理論",
    "topic": "論理演算",
    "q": "2進数11001と10110のXORはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "10000"
      },
      {
        "label": "イ",
        "text": "00111"
      },
      {
        "label": "ウ",
        "text": "01111"
      },
      {
        "label": "エ",
        "text": "11111"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 同じ桁同士を比較し、異なる桁のみ1になる(01111)。間違いやすいポイント: ORやANDと混同して11111や10000を選んでしまう。覚え方: XORは「違っていたら1」。"
  },
  {
    "id": 4,
    "cat": "基礎理論",
    "topic": "計算量",
    "q": "O(n^2)の処理で件数が3倍になったとき、処理時間は概ね何倍か。",
    "choices": [
      {
        "label": "ア",
        "text": "6"
      },
      {
        "label": "イ",
        "text": "9"
      },
      {
        "label": "ウ",
        "text": "27"
      },
      {
        "label": "エ",
        "text": "3"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: O(n^2)なので3倍の二乗=9倍になる。間違いやすいポイント: 件数の倍率をそのまま時間の倍率と考えて3倍としてしまう。覚え方: オーダーの指数乗で計算する(n→3nならn^2→9n^2)。"
  },
  {
    "id": 5,
    "cat": "基礎理論",
    "topic": "組合せ",
    "q": "6個から2個を選ぶ組合せ数はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "30"
      },
      {
        "label": "イ",
        "text": "12"
      },
      {
        "label": "ウ",
        "text": "15"
      },
      {
        "label": "エ",
        "text": "8"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 6C2=6×5÷2=15。間違いやすいポイント: 順列6P2=30と組合せを混同してしまう。覚え方: 組合せは順列を並べ方の数(2!)で割る。"
  },
  {
    "id": 6,
    "cat": "基礎理論",
    "topic": "数値表現",
    "q": "符号なし12ビット整数の最大値はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "4095"
      },
      {
        "label": "イ",
        "text": "4096"
      },
      {
        "label": "ウ",
        "text": "2047"
      },
      {
        "label": "エ",
        "text": "8191"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 2^12-1=4095。間違いやすいポイント: 2^12そのもの(4096)や符号ありの範囲(2047)と混同する。覚え方: 符号なしnビットの最大値は「2^n-1」。"
  },
  {
    "id": 7,
    "cat": "基礎理論",
    "topic": "基数変換",
    "q": "16進数3Cを10進数で表したものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "60"
      },
      {
        "label": "イ",
        "text": "64"
      },
      {
        "label": "ウ",
        "text": "48"
      },
      {
        "label": "エ",
        "text": "56"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 3×16+12=60。間違いやすいポイント: Cを12ではなく10や13と誤読してしまう。覚え方: 16進数の桁ごとの重みは16^1,16^0で計算する。"
  },
  {
    "id": 8,
    "cat": "コンピュータシステム",
    "topic": "MIPS計算",
    "q": "クロック2.5GHz、CPI5のCPUは約何MIPSか。",
    "choices": [
      {
        "label": "ア",
        "text": "250"
      },
      {
        "label": "イ",
        "text": "2500"
      },
      {
        "label": "ウ",
        "text": "625"
      },
      {
        "label": "エ",
        "text": "500"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 2.5×10^9÷5=5×10^8命令/秒=500MIPS。間違いやすいポイント: クロックをそのままMIPSと考えて2500としてしまう。覚え方: MIPS=クロック周波数÷CPI(単位を百万に揃える)。"
  },
  {
    "id": 9,
    "cat": "コンピュータシステム",
    "topic": "パイプライン処理",
    "q": "8段パイプラインで25命令を理想実行すると何クロックか。",
    "choices": [
      {
        "label": "ア",
        "text": "200"
      },
      {
        "label": "イ",
        "text": "25"
      },
      {
        "label": "ウ",
        "text": "31"
      },
      {
        "label": "エ",
        "text": "32"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 段数+(命令数-1)=8+24=32クロック。間違いやすいポイント: 命令数と段数を単純にかけて200としてしまう。覚え方: 「最初の命令がパイプラインを満たす時間+残り命令数」で考える。"
  },
  {
    "id": 10,
    "cat": "コンピュータシステム",
    "topic": "キャッシュ",
    "q": "ヒット率90%、キャッシュ5ns、主記憶55nsの実効アクセス時間はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "15ns"
      },
      {
        "label": "イ",
        "text": "50ns"
      },
      {
        "label": "ウ",
        "text": "10ns"
      },
      {
        "label": "エ",
        "text": "60ns"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 0.9×5+0.1×55=4.5+5.5=10ns。間違いやすいポイント: ヒット率とミス率の重みを逆にして計算してしまう。覚え方: 実効アクセス時間=ヒット率×キャッシュ+ミス率×主記憶。"
  },
  {
    "id": 11,
    "cat": "コンピュータシステム",
    "topic": "仮想記憶",
    "q": "主記憶にないページ参照時に発生するものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "デッドロック"
      },
      {
        "label": "イ",
        "text": "スプール"
      },
      {
        "label": "ウ",
        "text": "キャッシュヒット"
      },
      {
        "label": "エ",
        "text": "ページフォルト"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: ページフォルトは要求ページが主記憶に存在しない場合に発生する割込み。間違いやすいポイント: デッドロック(資源の相互待ち)と混同してしまう。覚え方: 「フォルト=不在による例外」と覚える。"
  },
  {
    "id": 12,
    "cat": "コンピュータシステム",
    "topic": "RAID",
    "q": "RAID0の説明として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "分散パリティ"
      },
      {
        "label": "イ",
        "text": "ストライピングで冗長性なし"
      },
      {
        "label": "ウ",
        "text": "専用パリティ"
      },
      {
        "label": "エ",
        "text": "ミラーリング"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: RAID0は複数台にデータを分散配置(ストライピング)するが冗長性はない。間違いやすいポイント: ミラーリング(RAID1)と取り違える。覚え方: 「0=何もない(冗長性ゼロ)」と覚える。"
  },
  {
    "id": 13,
    "cat": "コンピュータシステム",
    "topic": "RAID",
    "q": "RAID5の特徴はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "冗長性なし"
      },
      {
        "label": "イ",
        "text": "単純複製"
      },
      {
        "label": "ウ",
        "text": "1台だけにパリティ"
      },
      {
        "label": "エ",
        "text": "パリティを分散"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: RAID5は複数ディスクにパリティ情報を分散して格納する。間違いやすいポイント: 専用パリティディスクを使うRAID4と混同する。覚え方: 「5=分散パリティ」とセットで暗記する。"
  },
  {
    "id": 14,
    "cat": "コンピュータシステム",
    "topic": "稼働率",
    "q": "稼働率0.96の装置2台を直列接続した稼働率はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "0.9984"
      },
      {
        "label": "イ",
        "text": "0.9600"
      },
      {
        "label": "ウ",
        "text": "0.9216"
      },
      {
        "label": "エ",
        "text": "1.9200"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 直列は積で計算: 0.96×0.96=0.9216。間違いやすいポイント: 単純に足し算して1.92としてしまう。覚え方: 直列は「かけ算」、並列は「1-(1-r)^n」。"
  },
  {
    "id": 15,
    "cat": "コンピュータシステム",
    "topic": "稼働率",
    "q": "稼働率0.7の装置2台を並列接続し1台動けばよい。稼働率はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "0.70"
      },
      {
        "label": "イ",
        "text": "0.49"
      },
      {
        "label": "ウ",
        "text": "0.91"
      },
      {
        "label": "エ",
        "text": "1.40"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 1-(1-0.7)^2=1-0.09=0.91。間違いやすいポイント: 両方の稼働率を単純にかけて0.49としてしまう(これは両方とも稼働している確率)。覚え方: 並列は「両方とも故障する確率」を1から引く。"
  },
  {
    "id": 16,
    "cat": "データベース",
    "topic": "主キー",
    "q": "主キーの性質として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "行を一意に識別"
      },
      {
        "label": "イ",
        "text": "重複可"
      },
      {
        "label": "ウ",
        "text": "NULL可"
      },
      {
        "label": "エ",
        "text": "必ず数値"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 主キーは各行を一意に識別するための列(または列の組)である。間違いやすいポイント: NULLを許容する、重複を許すなどの性質を誤って選んでしまう。覚え方: 主キーは「重複禁止・NULL禁止・一意識別」の3点セット。"
  },
  {
    "id": 17,
    "cat": "データベース",
    "topic": "SQL",
    "q": "重複行を除くSELECT指定はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ORDER BY"
      },
      {
        "label": "イ",
        "text": "DISTINCT"
      },
      {
        "label": "ウ",
        "text": "UNION ALL"
      },
      {
        "label": "エ",
        "text": "HAVING"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: DISTINCTはSELECT結果から重複行を除去する。間違いやすいポイント: UNION ALLは逆に重複を許したまま結合する点に注意。覚え方: 「DISTINCT=区別する→重複を1つに」。"
  },
  {
    "id": 18,
    "cat": "データベース",
    "topic": "SQL",
    "q": "集計結果に条件を指定する句はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "WHERE"
      },
      {
        "label": "イ",
        "text": "HAVING"
      },
      {
        "label": "ウ",
        "text": "SELECT"
      },
      {
        "label": "エ",
        "text": "FROM"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: HAVINGはGROUP BYで集計した結果に対する絞り込み条件を指定する。間違いやすいポイント: WHEREは集計前の行に対する条件なので混同しやすい。覚え方: 「WHEREは行、HAVINGは集計後のグループ」。"
  },
  {
    "id": 19,
    "cat": "データベース",
    "topic": "SQL",
    "q": "二つの結果を重複除去してまとめるものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "INTERSECT"
      },
      {
        "label": "イ",
        "text": "JOIN"
      },
      {
        "label": "ウ",
        "text": "EXCEPT"
      },
      {
        "label": "エ",
        "text": "UNION"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: UNIONは2つの問い合わせ結果を和集合として重複を除いて結合する。間違いやすいポイント: INTERSECT(積集合)やEXCEPT(差集合)と役割を混同する。覚え方: 「UNION=和、INTERSECT=積、EXCEPT=差」とセットで覚える。"
  },
  {
    "id": 20,
    "cat": "データベース",
    "topic": "トランザクション",
    "q": "未コミット更新を取り消す処理はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ロールバック"
      },
      {
        "label": "イ",
        "text": "ロールフォワード"
      },
      {
        "label": "ウ",
        "text": "正規化"
      },
      {
        "label": "エ",
        "text": "コミット"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: ロールバックは未確定(未コミット)の変更を取り消して元の状態に戻す処理。間違いやすいポイント: ロールフォワードは逆に障害前の状態まで更新を再適用する処理なので取り違えやすい。覚え方: 「バック=戻す」「フォワード=進める」。"
  },
  {
    "id": 21,
    "cat": "データベース",
    "topic": "SQL",
    "q": "INNER JOINの説明として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "全組合せを返す"
      },
      {
        "label": "イ",
        "text": "条件一致行を結合"
      },
      {
        "label": "ウ",
        "text": "重複除去"
      },
      {
        "label": "エ",
        "text": "差集合"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: INNER JOINは結合条件に一致する行だけを返す。間違いやすいポイント: 全組合せを返すのはCROSS JOINなので混同しやすい。覚え方: 「INNER=内側→一致するものだけ」。"
  },
  {
    "id": 22,
    "cat": "ネットワーク",
    "topic": "DNS",
    "q": "DNSの役割はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "MAC解決"
      },
      {
        "label": "イ",
        "text": "名前解決"
      },
      {
        "label": "ウ",
        "text": "時刻同期"
      },
      {
        "label": "エ",
        "text": "IP自動配布"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: DNSはドメイン名とIPアドレスを対応付ける名前解決を行う。間違いやすいポイント: IP自動配布(DHCP)と役割を取り違える。覚え方: 「DNS=Domain Name System→名前を解決」。"
  },
  {
    "id": 23,
    "cat": "ネットワーク",
    "topic": "ARP",
    "q": "ARPの役割はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "時刻同期"
      },
      {
        "label": "イ",
        "text": "名前→IP"
      },
      {
        "label": "ウ",
        "text": "メール送信"
      },
      {
        "label": "エ",
        "text": "IP→MAC"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: ARPはIPアドレスから対応するMACアドレスを求めるプロトコル。間違いやすいポイント: DNSの名前解決(名前→IP)と混同しやすい。覚え方: 「ARP=Address Resolution Protocol→IPからMACへ」。"
  },
  {
    "id": 24,
    "cat": "ネットワーク",
    "topic": "DHCP",
    "q": "DHCPの役割はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "IP設定自動配布"
      },
      {
        "label": "イ",
        "text": "経路制御"
      },
      {
        "label": "ウ",
        "text": "名前解決"
      },
      {
        "label": "エ",
        "text": "IP→MAC"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: DHCPはネットワーク上の端末にIPアドレス等の設定情報を自動的に割り当てる。間違いやすいポイント: ARPのIP→MAC変換機能と取り違える。覚え方: 「DHCP=Dynamic Host Configuration Protocol→自動設定」。"
  },
  {
    "id": 25,
    "cat": "ネットワーク",
    "topic": "サブネット",
    "q": "/29の使用可能ホスト数は最大いくつか。",
    "choices": [
      {
        "label": "ア",
        "text": "8"
      },
      {
        "label": "イ",
        "text": "4"
      },
      {
        "label": "ウ",
        "text": "14"
      },
      {
        "label": "エ",
        "text": "6"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: /29はホスト部3ビットなので2^3-2=6。間違いやすいポイント: ネットワーク/ブロードキャストアドレスを引かずに8と答えてしまう。覚え方: 使用可能ホスト数=2^(ホストビット数)-2。"
  },
  {
    "id": 26,
    "cat": "ネットワーク",
    "topic": "サブネット",
    "q": "192.168.5.142/27のネットワークアドレスはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "192.168.5.142"
      },
      {
        "label": "イ",
        "text": "192.168.5.160"
      },
      {
        "label": "ウ",
        "text": "192.168.5.128"
      },
      {
        "label": "エ",
        "text": "192.168.5.96"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: /27はブロックサイズ32。142÷32=4余り14なので4×32=128がネットワークアドレス。間違いやすいポイント: 32刻みの境界を見誤り96や160を選んでしまう。覚え方: 「アドレス÷ブロックサイズの商×ブロックサイズ」で求める。"
  },
  {
    "id": 27,
    "cat": "ネットワーク",
    "topic": "ルーティング",
    "q": "ルータが主に参照するものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ファイル名"
      },
      {
        "label": "イ",
        "text": "MAC"
      },
      {
        "label": "ウ",
        "text": "ユーザ名"
      },
      {
        "label": "エ",
        "text": "IP"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: ルータはネットワーク層のIPアドレスを基に経路選択(ルーティング)を行う。間違いやすいポイント: データリンク層で使われるMACアドレスと取り違える(スイッチの役割)。覚え方: 「ルータ=IP(ネットワーク層)、スイッチ=MAC(データリンク層)」。"
  },
  {
    "id": 28,
    "cat": "ネットワーク",
    "topic": "IPアドレス",
    "q": "IPv4マルチキャスト範囲はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "128-191"
      },
      {
        "label": "イ",
        "text": "224-239"
      },
      {
        "label": "ウ",
        "text": "192-223"
      },
      {
        "label": "エ",
        "text": "240-255"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: クラスDに相当する224.0.0.0〜239.255.255.255がマルチキャスト用に予約されている。間違いやすいポイント: クラスC(192-223)やクラスE(240-255)の範囲と混同する。覚え方: 「224から239までがマルチキャスト」と範囲ごと暗記する。"
  },
  {
    "id": 29,
    "cat": "情報セキュリティ",
    "topic": "SQLインジェクション",
    "q": "SQLインジェクション対策はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "平文通信"
      },
      {
        "label": "イ",
        "text": "プレースホルダ"
      },
      {
        "label": "ウ",
        "text": "ログ停止"
      },
      {
        "label": "エ",
        "text": "文字列連結"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: プレースホルダ(パラメータ化クエリ)を使うとSQL文と入力値が分離され、注入攻撃を防げる。間違いやすいポイント: 文字列連結はむしろ脆弱性の原因そのものなので対策にならない。覚え方: 「入力値はSQL文に直接埋め込まない=プレースホルダ」。"
  },
  {
    "id": 30,
    "cat": "情報セキュリティ",
    "topic": "認証",
    "q": "多要素認証として適切なのはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "PW+秘密の質問"
      },
      {
        "label": "イ",
        "text": "PW+PIN"
      },
      {
        "label": "ウ",
        "text": "PW2個"
      },
      {
        "label": "エ",
        "text": "PW+指紋"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: パスワード(知識要素)+指紋(生体要素)のように異なる要素を組み合わせるのが多要素認証。間違いやすいポイント: PWとPIN、PWと秘密の質問はどちらも「知識要素」同士なので多要素にならない。覚え方: 「知識・所持・生体」の異なる種類を2つ以上組み合わせる。"
  },
  {
    "id": 31,
    "cat": "情報セキュリティ",
    "topic": "デジタル署名",
    "q": "デジタル署名で確認できるものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "真正性と改ざん検知"
      },
      {
        "label": "イ",
        "text": "可用性のみ"
      },
      {
        "label": "ウ",
        "text": "通信速度"
      },
      {
        "label": "エ",
        "text": "圧縮率"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: デジタル署名は送信者の真正性(なりすましでないこと)とデータの改ざん検知ができる。間違いやすいポイント: 可用性や通信速度など署名と無関係な性質を選んでしまう。覚え方: 「署名=本人確認+改ざんチェック」のセットで覚える。"
  },
  {
    "id": 32,
    "cat": "情報セキュリティ",
    "topic": "パスワード保護",
    "q": "パスワードにソルトを付ける目的はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "復号可能にする"
      },
      {
        "label": "イ",
        "text": "ログ削除"
      },
      {
        "label": "ウ",
        "text": "同じPWでも異なるハッシュにしやすくする"
      },
      {
        "label": "エ",
        "text": "通信高速化"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: ソルトはユーザごとにランダムな値を付加し、同じパスワードでも異なるハッシュ値になるようにしてレインボーテーブル攻撃などを防ぐ。間違いやすいポイント: ハッシュを復号可能にするものと誤解してしまう(ハッシュは本来不可逆)。覚え方: 「ソルト=味付けして同じ味(ハッシュ)にならないようにする」。"
  },
  {
    "id": 33,
    "cat": "情報セキュリティ",
    "topic": "バックアップ",
    "q": "3-2-1バックアップはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "3台同一PW"
      },
      {
        "label": "イ",
        "text": "3日・2回・1台"
      },
      {
        "label": "ウ",
        "text": "3コピー・2媒体・1別場所"
      },
      {
        "label": "エ",
        "text": "3世代同一ディスク"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 3-2-1ルールは「データを3つコピーし、2種類の異なる媒体に保存し、1つは別の場所に置く」という考え方。間違いやすいポイント: 日数や回数の意味だと誤解してしまう。覚え方: 「3コピー・2媒体・1オフサイト」とそのまま覚える。"
  },
  {
    "id": 34,
    "cat": "情報セキュリティ",
    "topic": "暗号方式",
    "q": "受信者だけが復号できるように暗号化するとき使う鍵はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "受信者公開鍵"
      },
      {
        "label": "イ",
        "text": "送信者公開鍵"
      },
      {
        "label": "ウ",
        "text": "受信者秘密鍵"
      },
      {
        "label": "エ",
        "text": "送信者秘密鍵"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 公開鍵暗号では受信者の公開鍵で暗号化し、対応する受信者の秘密鍵でのみ復号できる。間違いやすいポイント: 送信者側の鍵を使うと誤認してしまう(それは署名の仕組み)。覚え方: 「暗号化は相手の公開鍵、復号は自分の秘密鍵」。"
  },
  {
    "id": 35,
    "cat": "ソフトウェア・開発",
    "topic": "バージョン管理",
    "q": "Gitでレビュー後にメインへ統合する仕組みはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "スプーリング"
      },
      {
        "label": "イ",
        "text": "ページング"
      },
      {
        "label": "ウ",
        "text": "プルリクエスト"
      },
      {
        "label": "エ",
        "text": "ARP"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: プルリクエスト(Pull Request)はレビューを経てからブランチの変更をメインブランチへ統合する仕組み。間違いやすいポイント: ページングやスプーリングなどOS用語と混同してしまう。覚え方: 「プルリク=レビュー付きの統合依頼」。"
  },
  {
    "id": 36,
    "cat": "ソフトウェア・開発",
    "topic": "開発手法",
    "q": "TDDの基本はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "テスト不要"
      },
      {
        "label": "イ",
        "text": "要件省略"
      },
      {
        "label": "ウ",
        "text": "テスト先行"
      },
      {
        "label": "エ",
        "text": "最後だけテスト"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: TDD(テスト駆動開発)はテストコードを先に書き、それを満たす実装を行う開発手法。間違いやすいポイント: 「最後にまとめてテストする」という従来型の開発と混同してしまう。覚え方: 「Test Driven=テストに駆動される→テストが先」。"
  },
  {
    "id": 37,
    "cat": "ソフトウェア・開発",
    "topic": "テスト技法",
    "q": "ブラックボックステスト技法はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "同値分割"
      },
      {
        "label": "イ",
        "text": "パス網羅"
      },
      {
        "label": "ウ",
        "text": "分岐網羅"
      },
      {
        "label": "エ",
        "text": "命令網羅"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 同値分割は内部構造を見ずに入力値の仕様から等価なグループに分けてテストするブラックボックス技法。間違いやすいポイント: 命令網羅・分岐網羅・パス網羅はいずれも内部構造に着目するホワイトボックステスト技法なので混同しやすい。覚え方: 「内部を見ない=ブラックボックス=同値分割・限界値分析」。"
  },
  {
    "id": 38,
    "cat": "ソフトウェア・開発",
    "topic": "技術的負債",
    "q": "技術的負債とはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "CPU不足"
      },
      {
        "label": "イ",
        "text": "通信障害"
      },
      {
        "label": "ウ",
        "text": "借金"
      },
      {
        "label": "エ",
        "text": "妥協実装が将来コストを増やす状態"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 技術的負債は、短期的な妥協や手抜き実装によって将来の保守・改修コストが増大する状態を指す比喩表現。間違いやすいポイント: 文字通りの金銭的な借金と誤解してしまう。覚え方: 「負債=後で利息(保守コスト)がかかる」というたとえ。"
  },
  {
    "id": 39,
    "cat": "ソフトウェア・開発",
    "topic": "DevOps",
    "q": "DevOpsの説明はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "開発と運用が連携"
      },
      {
        "label": "イ",
        "text": "テスト廃止"
      },
      {
        "label": "ウ",
        "text": "自動化禁止"
      },
      {
        "label": "エ",
        "text": "完全分離"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: DevOpsは開発(Development)と運用(Operations)が密接に連携し、継続的な改善・自動化を進める考え方。間違いやすいポイント: 開発と運用を分離する従来型の体制と逆の意味なので取り違えやすい。覚え方: 「Dev+Ops=開発と運用がひとつになる」。"
  },
  {
    "id": 40,
    "cat": "プロジェクトマネジメント",
    "topic": "PERT",
    "q": "PERTで楽観3、最頻6、悲観15の期待値はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "9"
      },
      {
        "label": "イ",
        "text": "8"
      },
      {
        "label": "ウ",
        "text": "7"
      },
      {
        "label": "エ",
        "text": "6"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: (楽観値+4×最頻値+悲観値)÷6=(3+24+15)÷6=7。間違いやすいポイント: 最頻値をそのまま答えとして6を選んでしまう。覚え方: 「楽観+4×最頻+悲観を6で割る」と公式を丸暗記する。"
  },
  {
    "id": 41,
    "cat": "プロジェクトマネジメント",
    "topic": "WBS",
    "q": "WBSの説明はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "IP配布"
      },
      {
        "label": "イ",
        "text": "売上予測"
      },
      {
        "label": "ウ",
        "text": "作業を階層分解"
      },
      {
        "label": "エ",
        "text": "暗号化"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: WBS(Work Breakdown Structure)はプロジェクトの作業を階層的に分解して整理する手法。間違いやすいポイント: 他分野の用語(IP配布や暗号化)と混同しないよう注意。覚え方: 「Work Breakdown=作業を分解する構造」。"
  },
  {
    "id": 42,
    "cat": "プロジェクトマネジメント",
    "topic": "クリティカルパス",
    "q": "クリティカルパスはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "最短経路"
      },
      {
        "label": "イ",
        "text": "遅れると全体納期へ影響"
      },
      {
        "label": "ウ",
        "text": "人数最大"
      },
      {
        "label": "エ",
        "text": "最安経路"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: クリティカルパスは余裕(フロート)がゼロの経路で、遅延がそのままプロジェクト全体の遅延につながる。間違いやすいポイント: 単純に「最短経路」や「最安経路」のことだと誤解してしまう。覚え方: 「遅れが即、納期遅延になる経路」と覚える。"
  },
  {
    "id": 43,
    "cat": "プロジェクトマネジメント",
    "topic": "見積り手法",
    "q": "ファンクションポイント法の基準はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "開発者数"
      },
      {
        "label": "イ",
        "text": "利用者から見た機能量"
      },
      {
        "label": "ウ",
        "text": "行数だけ"
      },
      {
        "label": "エ",
        "text": "CPUクロック"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: ファンクションポイント法は利用者から見た入出力や照会などの機能の量を基準に規模を見積もる手法。間違いやすいポイント: ソースコードの行数だけで見積もるLOC法と混同しやすい。覚え方: 「ファンクション=機能の数で測る」。"
  },
  {
    "id": 44,
    "cat": "サービスマネジメント",
    "topic": "インシデント管理",
    "q": "インシデント管理の主目的はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "利益率計算"
      },
      {
        "label": "イ",
        "text": "早期復旧"
      },
      {
        "label": "ウ",
        "text": "新製品設計"
      },
      {
        "label": "エ",
        "text": "株価予測"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: インシデント管理はサービスの中断に対して可能な限り早くサービスを復旧させることを主目的とする。間違いやすいポイント: 根本原因の恒久対策を行う問題管理と混同しやすい。覚え方: 「インシデント=まず復旧を最優先」。"
  },
  {
    "id": 45,
    "cat": "サービスマネジメント",
    "topic": "SLA",
    "q": "SLAに定めるものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "サービス水準"
      },
      {
        "label": "イ",
        "text": "CPU命令数"
      },
      {
        "label": "ウ",
        "text": "ソース行数"
      },
      {
        "label": "エ",
        "text": "IP数"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: SLA(Service Level Agreement)はサービス提供者と利用者の間で合意するサービスの品質水準を定める。間違いやすいポイント: 技術的な内部指標(CPU命令数など)と取り違えてしまう。覚え方: 「SLA=サービスレベルの約束」。"
  },
  {
    "id": 46,
    "cat": "経営・戦略・法務",
    "topic": "損益計算",
    "q": "売上1000、変動費650の限界利益はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "650"
      },
      {
        "label": "イ",
        "text": "350"
      },
      {
        "label": "ウ",
        "text": "250"
      },
      {
        "label": "エ",
        "text": "1000"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 限界利益=売上高-変動費=1000-650=350。間違いやすいポイント: 変動費そのものや売上高をそのまま答えにしてしまう。覚え方: 「限界利益=売上-変動費」と公式を直接当てはめる。"
  },
  {
    "id": 47,
    "cat": "経営・戦略・法務",
    "topic": "損益分岐点",
    "q": "固定費300、限界利益率25%の損益分岐点売上高はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "75"
      },
      {
        "label": "イ",
        "text": "300"
      },
      {
        "label": "ウ",
        "text": "900"
      },
      {
        "label": "エ",
        "text": "1200"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 損益分岐点売上高=固定費÷限界利益率=300÷0.25=1200。間違いやすいポイント: 固定費と限界利益率をかけ算してしまい75と答えてしまう。覚え方: 「分岐点売上高=固定費÷限界利益率」の割り算で求める。"
  },
  {
    "id": 48,
    "cat": "経営・戦略・法務",
    "topic": "損益計算",
    "q": "売上高から売上原価を引いた利益はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "純利益"
      },
      {
        "label": "イ",
        "text": "経常利益"
      },
      {
        "label": "ウ",
        "text": "営業利益"
      },
      {
        "label": "エ",
        "text": "売上総利益"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 売上高-売上原価=売上総利益(粗利)。間違いやすいポイント: さらに販管費を引いた営業利益と混同しやすい。覚え方: 「売上総利益=粗利=売上高-原価」の一段階だけの引き算。"
  },
  {
    "id": 49,
    "cat": "経営・戦略・法務",
    "topic": "SWOT分析",
    "q": "SWOTのOはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "機会"
      },
      {
        "label": "イ",
        "text": "脅威"
      },
      {
        "label": "ウ",
        "text": "弱み"
      },
      {
        "label": "エ",
        "text": "強み"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: SWOT分析のOはOpportunity(機会)で、外部環境のプラス要因を指す。間違いやすいポイント: T(Threat、脅威)と意味を取り違えやすい。覚え方: 「S強み・W弱み・O機会・T脅威」の頭文字を順番で覚える。"
  },
  {
    "id": 50,
    "cat": "経営・戦略・法務",
    "topic": "PPM分析",
    "q": "PPMで低成長・高シェアはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "負け犬"
      },
      {
        "label": "イ",
        "text": "金のなる木"
      },
      {
        "label": "ウ",
        "text": "問題児"
      },
      {
        "label": "エ",
        "text": "花形"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: PPMでは市場成長率が低くシェアが高い事業を「金のなる木」と呼び、安定した利益を生む。間違いやすいポイント: 成長率もシェアも高い「花形」と混同しやすい。覚え方: 「低成長でも稼げる=金のなる木」とイメージで覚える。"
  },
  {
    "id": 51,
    "cat": "経営・戦略・法務",
    "topic": "財務指標",
    "q": "ROAはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "売上に対する変動費率"
      },
      {
        "label": "イ",
        "text": "稼働率"
      },
      {
        "label": "ウ",
        "text": "総資産に対する利益率"
      },
      {
        "label": "エ",
        "text": "自己資本回転率"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: ROA(Return on Assets)は総資産に対してどれだけ利益を生み出したかを示す指標。間違いやすいポイント: 自己資本に対する利益率であるROEと混同しやすい。覚え方: 「ROA=Assets(総資産)に対する利益率」。"
  },
  {
    "id": 52,
    "cat": "経営・戦略・法務",
    "topic": "事業継続",
    "q": "BCPの目的はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "広告効果測定"
      },
      {
        "label": "イ",
        "text": "DB正規化"
      },
      {
        "label": "ウ",
        "text": "CPU高速化"
      },
      {
        "label": "エ",
        "text": "重要業務の継続・早期復旧"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: BCP(事業継続計画)は災害等の緊急事態でも重要業務を継続し、早期に復旧させることを目的とする。間違いやすいポイント: 技術的な性能改善(CPU高速化など)と無関係な内容を選んでしまう。覚え方: 「Business Continuity=事業の継続性を守る計画」。"
  },
  {
    "id": 53,
    "cat": "経営・戦略・法務",
    "topic": "経営情報システム",
    "q": "ERPはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "顧客関係管理"
      },
      {
        "label": "イ",
        "text": "暗号鍵管理"
      },
      {
        "label": "ウ",
        "text": "企業資源の統合管理"
      },
      {
        "label": "エ",
        "text": "供給連鎖管理"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: ERP(Enterprise Resource Planning)はヒト・モノ・カネ・情報などの企業資源を統合的に管理する仕組み。間違いやすいポイント: 顧客管理に特化したCRMや供給連鎖に特化したSCMと混同しやすい。覚え方: 「ERP=企業資源全体を一元管理」。"
  },
  {
    "id": 54,
    "cat": "経営・戦略・法務",
    "topic": "経営情報システム",
    "q": "CRMはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "顧客関係管理"
      },
      {
        "label": "イ",
        "text": "DNS管理"
      },
      {
        "label": "ウ",
        "text": "仮想記憶管理"
      },
      {
        "label": "エ",
        "text": "CPU管理"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: CRM(Customer Relationship Management)は顧客との関係を管理し、満足度や売上向上につなげる仕組み。間違いやすいポイント: 技術的なシステム用語(CPU・DNS・仮想記憶)と混同しないよう注意。覚え方: 「CRM=Customer(顧客)との関係管理」。"
  },
  {
    "id": 55,
    "cat": "経営・戦略・法務",
    "topic": "契約形態",
    "q": "請負契約の特徴はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "必ず無償"
      },
      {
        "label": "イ",
        "text": "仕事の完成を目的"
      },
      {
        "label": "ウ",
        "text": "成果物不可"
      },
      {
        "label": "エ",
        "text": "完成責任なし"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 請負契約は仕事の完成を目的とし、受注者は完成責任(契約不適合責任)を負う。間違いやすいポイント: 完成責任を負わない準委任契約と混同しやすい。覚え方: 「請負=完成させて初めて報酬が発生する契約」。"
  },
  {
    "id": 56,
    "cat": "経営・戦略・法務",
    "topic": "知的財産権",
    "q": "著作権の保護対象として最も適切なのはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "表現されたプログラムコード"
      },
      {
        "label": "イ",
        "text": "単なる事実"
      },
      {
        "label": "ウ",
        "text": "アイデアそのもの"
      },
      {
        "label": "エ",
        "text": "数学公式"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 著作権は具体的に表現されたプログラムコードなどの「表現」を保護する。間違いやすいポイント: アイデアや事実、数式そのものは著作権の保護対象外であることを見落としやすい。覚え方: 「著作権はアイデアでなく表現を守る」。"
  },
  {
    "id": 57,
    "cat": "経営・戦略・法務",
    "topic": "経営指標",
    "q": "KPIはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "暗号方式"
      },
      {
        "label": "イ",
        "text": "IP規格"
      },
      {
        "label": "ウ",
        "text": "目標達成状況を測る重要指標"
      },
      {
        "label": "エ",
        "text": "メモリ規格"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: KPI(Key Performance Indicator)は目標(KGI)の達成度合いを測るための重要業績評価指標。間違いやすいポイント: 技術規格や暗号方式と無関係な用語に惑わされないよう注意。覚え方: 「KPI=Key(重要な)Performance(成果)Indicator(指標)」。"
  },
  {
    "id": 58,
    "cat": "経営・戦略・法務",
    "topic": "損益計算",
    "q": "営業利益を求める式として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "売上高-変動費"
      },
      {
        "label": "イ",
        "text": "総資産÷利益"
      },
      {
        "label": "ウ",
        "text": "固定費÷限界利益率"
      },
      {
        "label": "エ",
        "text": "売上総利益-販売費及び一般管理費"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 営業利益=売上総利益-販売費及び一般管理費(販管費)。間違いやすいポイント: 限界利益の計算式(売上高-変動費)と混同しやすい。覚え方: 「営業利益=粗利から販管費を引いたもの」。"
  },
  {
    "id": 59,
    "cat": "経営・戦略・法務",
    "topic": "経営情報システム",
    "q": "SCMの説明として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "調達から販売までの供給連鎖を最適化する"
      },
      {
        "label": "イ",
        "text": "企業資源を統合管理する"
      },
      {
        "label": "ウ",
        "text": "サービス水準を定める"
      },
      {
        "label": "エ",
        "text": "顧客との関係を管理する"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: SCM(Supply Chain Management)は調達・生産・物流・販売までの供給連鎖全体を最適化する手法。間違いやすいポイント: 顧客管理に特化したCRMや企業資源全体を扱うERPと混同しやすい。覚え方: 「SCM=Supply Chain(供給連鎖)を管理」。"
  },
  {
    "id": 60,
    "cat": "経営・戦略・法務",
    "topic": "財務指標",
    "q": "ROIが表すものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "投資額に対する利益の割合"
      },
      {
        "label": "イ",
        "text": "総資産に対する利益率"
      },
      {
        "label": "ウ",
        "text": "自己資本比率"
      },
      {
        "label": "エ",
        "text": "売上に対する変動費率"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: ROI(Return on Investment)は投資した金額に対してどれだけの利益(リターン)を得たかを示す指標。間違いやすいポイント: 総資産に対する利益率であるROAと混同しやすい。覚え方: 「ROI=Investment(投資額)に対するReturn(利益)」。"
  },
  {
    "id": 61,
    "cat": "ネットワーク",
    "topic": "M2M",
    "q": "自動販売機が、在庫・売上データを人が操作しなくても、通信回線を通じて管理センターへ自動送信している。この仕組みを表す用語はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "VPN"
      },
      {
        "label": "イ",
        "text": "OCR"
      },
      {
        "label": "ウ",
        "text": "M2M"
      },
      {
        "label": "エ",
        "text": "SSO"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 機器同士が人手を介さず自動で情報交換する仕組みがM2M。間違いやすいポイント: VPNは通信路の秘匿、SSOは一度の認証で複数サービスを使う仕組みで、機器間通信ではない。覚え方: Machine to Machine＝機械から機械へ。"
  },
  {
    "id": 62,
    "cat": "データベース",
    "topic": "ACID特性",
    "q": "トランザクションのACID特性について、(a)「複数の処理が同時に実行されても互いに干渉しない」、(b)「障害が起きても確定した更新結果が失われない」に当たる特性の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(a)Atomicity (b)Consistency"
      },
      {
        "label": "イ",
        "text": "(a)Consistency (b)Durability"
      },
      {
        "label": "ウ",
        "text": "(a)Atomicity (b)Isolation"
      },
      {
        "label": "エ",
        "text": "(a)Isolation (b)Durability"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: (a)は独立性Isolation、(b)は永続性Durability。間違いやすいポイント: Atomicityは「全部成功か全部失敗」、Consistencyは「整合性を保つ」で、同時実行や障害後の保持とは別の性質。覚え方: A=全か無、C=一貫、I=干渉しない、D=残る。"
  },
  {
    "id": 63,
    "cat": "データベース",
    "topic": "LEFT JOINとINNER JOIN",
    "q": "users表に4人(A,B,C,D)、orders表に3件の注文(user_idがA,B,C各1件)がある。usersを左側としてordersと結合したときの行数は、LEFT JOINとINNER JOINでそれぞれいくつか。",
    "choices": [
      {
        "label": "ア",
        "text": "LEFT=3, INNER=4"
      },
      {
        "label": "イ",
        "text": "LEFT=4, INNER=3"
      },
      {
        "label": "ウ",
        "text": "LEFT=4, INNER=4"
      },
      {
        "label": "エ",
        "text": "LEFT=7, INNER=3"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: INNER JOINは両方に存在するA,B,Cの3行、LEFT JOINは左表の全員(4人)を残しDは注文列がNULLで4行。間違いやすいポイント: 左右の行数を足して7にする、LEFTとINNERを逆にする。覚え方: LEFTは左表を全部残す。"
  },
  {
    "id": 64,
    "cat": "情報セキュリティ",
    "topic": "共通鍵暗号・公開鍵暗号・ハッシュ・署名",
    "q": "暗号・ハッシュに関する記述のうち、不適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "SHA-256で得たハッシュ値は、鍵を使えば元のデータに復号できる。"
      },
      {
        "label": "イ",
        "text": "共通鍵暗号では、暗号化と復号に同じ鍵を使う。"
      },
      {
        "label": "ウ",
        "text": "公開鍵暗号で機密を守るには、受信者の公開鍵で暗号化する。"
      },
      {
        "label": "エ",
        "text": "デジタル署名は、送信者の秘密鍵で作成する。"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: ハッシュ関数は一方向で、鍵があっても元データには戻せない。間違いやすいポイント: 暗号化(復号できる)とハッシュ化(戻せない)の混同。覚え方: ハッシュは改ざん検知用で復号しない、署名は秘密鍵で作り公開鍵で検証。"
  },
  {
    "id": 65,
    "cat": "情報セキュリティ",
    "topic": "ソルトとストレッチング",
    "q": "パスワードをハッシュ化して保存する。同じパスワードでも異なるハッシュ値になり(レインボーテーブル対策)、かつ総当たり攻撃の計算コストを上げたい。組み合わせるべき対策はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "暗号化・圧縮"
      },
      {
        "label": "イ",
        "text": "ミラーリング・ストライピング"
      },
      {
        "label": "ウ",
        "text": "ソルト付与・ストレッチング"
      },
      {
        "label": "エ",
        "text": "チェックサム・パリティ"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: ソルトでユーザーごとにハッシュ値が変わりレインボーテーブルを防ぎ、ストレッチング(反復計算)で総当たりを遅くする。間違いやすいポイント: チェックサムやパリティは誤り検出、ミラーリングは冗長化で目的が違う。覚え方: 塩を振って(ソルト)、何度も混ぜる(ストレッチング)。"
  },
  {
    "id": 66,
    "cat": "データベース",
    "topic": "第3正規形",
    "q": "注文表 orders(注文ID[主キー], 顧客ID, 顧客名, 商品ID, 数量) で、顧客名は顧客IDから決まる。この「主キー以外の項目を経由した依存」を取り除く正規化はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "第1正規形"
      },
      {
        "label": "イ",
        "text": "第2正規形"
      },
      {
        "label": "ウ",
        "text": "第3正規形"
      },
      {
        "label": "エ",
        "text": "繰返し項目の除去"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 主キー→顧客ID→顧客名という推移的な(間接的な)依存を除くのが第3正規形で、顧客表を分離する。間違いやすいポイント: 主キーが1項目なので第2正規形(部分従属)の問題ではない。覚え方: 1NF=繰返し、2NF=主キーの一部への依存、3NF=間接依存。"
  },
  {
    "id": 67,
    "cat": "経営・戦略・法務",
    "topic": "損益分岐点",
    "q": "固定費が120万円、変動費率が60%の事業の損益分岐点売上高はいくらか。",
    "choices": [
      {
        "label": "ア",
        "text": "300万円"
      },
      {
        "label": "イ",
        "text": "200万円"
      },
      {
        "label": "ウ",
        "text": "120万円"
      },
      {
        "label": "エ",
        "text": "480万円"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 限界利益率=1-0.6=0.4、損益分岐点売上高=固定費÷限界利益率=120÷0.4=300万円。間違いやすいポイント: 変動費率0.6で割って200万円にする。覚え方: 割るのは変動費率ではなく限界利益率。"
  },
  {
    "id": 68,
    "cat": "ネットワーク",
    "topic": "LPWA",
    "q": "水道メーターの検針を無線化したい。電池で数年動かし、月に数回、少量のデータを送れればよい。最も適する通信技術はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "4K動画のライブ配信用回線"
      },
      {
        "label": "イ",
        "text": "大容量ファイル転送用の高速回線"
      },
      {
        "label": "ウ",
        "text": "ビデオ会議用の高速回線"
      },
      {
        "label": "エ",
        "text": "LPWA"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: LPWAは低速だが省電力・広域で、少量データを間欠的に送るセンサー用途に向く。間違いやすいポイント: 高速=高性能と考えて動画用回線を選ぶ。覚え方: LPWA=Low Power Wide Area。"
  },
  {
    "id": 69,
    "cat": "コンピュータシステム",
    "topic": "DMA",
    "q": "入出力装置が、CPUを介さずに主記憶と直接データをやり取りすることで、CPUが別の処理を続けられるようにする方式はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "DMA"
      },
      {
        "label": "イ",
        "text": "UEFI"
      },
      {
        "label": "ウ",
        "text": "セマフォ"
      },
      {
        "label": "エ",
        "text": "キャッシュメモリ"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: DMAは入出力装置と主記憶の間の直接転送で、CPUの負荷を減らす。間違いやすいポイント: 割込みはI/O完了をCPUへ通知する方式で、転送自体はCPUが行う。覚え方: Direct Memory Access。"
  },
  {
    "id": 70,
    "cat": "アルゴリズム・プログラミング",
    "topic": "BFSとキュー",
    "q": "重みのないグラフで、出発点から近いノードの順に探索し、最短経路(辺の数)を求めたい。探索手法と、実装で使うデータ構造の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "DFS・キュー"
      },
      {
        "label": "イ",
        "text": "DFS・スタック"
      },
      {
        "label": "ウ",
        "text": "BFS・スタック"
      },
      {
        "label": "エ",
        "text": "BFS・キュー"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 近い順に広がる探索は幅優先(BFS)で、先に見つけたものから処理するFIFOのキューを使う。間違いやすいポイント: DFSはスタック(または再帰)で深く進む。覚え方: BFS=キュー(FIFO)、DFS=スタック(LIFO)。"
  },
  {
    "id": 71,
    "cat": "アルゴリズム・プログラミング",
    "topic": "マージソート",
    "q": "配列を半分に分割して再帰的に整列し、整列済みの部分を統合する。常にO(n log n)で、同じ値の順序が保たれる(安定)。このアルゴリズムはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "クイックソート"
      },
      {
        "label": "イ",
        "text": "バブルソート"
      },
      {
        "label": "ウ",
        "text": "マージソート"
      },
      {
        "label": "エ",
        "text": "選択ソート"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 分割統治で常にO(n log n)、安定なのはマージソート。間違いやすいポイント: クイックソートは平均O(n log n)だが不安定で最悪O(n^2)。覚え方: マージ=安定・追加メモリ要、クイック=不安定・追加メモリ少。"
  },
  {
    "id": 72,
    "cat": "基礎理論",
    "topic": "2の補数",
    "q": "8ビットの2の補数表現で、10進数の-43を表したものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "11010100"
      },
      {
        "label": "イ",
        "text": "11010101"
      },
      {
        "label": "ウ",
        "text": "10101011"
      },
      {
        "label": "エ",
        "text": "00101011"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 43=00101011、ビット反転で11010100、+1で11010101。間違いやすいポイント: 反転だけで+1を忘れる(11010100)。覚え方: 2の補数=反転して+1。確認は元の値との和が(1)00000000になること。"
  },
  {
    "id": 73,
    "cat": "プロジェクトマネジメント",
    "topic": "パレート図",
    "q": "不具合の原因を件数の多い順に棒グラフで並べ、累積割合を折れ線で重ねて、影響の大きい原因を特定する図はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "散布図"
      },
      {
        "label": "イ",
        "text": "管理図"
      },
      {
        "label": "ウ",
        "text": "ヒストグラム"
      },
      {
        "label": "エ",
        "text": "パレート図"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 件数順の棒グラフと累積割合の折れ線の組合せがパレート図。間違いやすいポイント: ヒストグラムは階級ごとの度数分布で、件数順の並べ替えや累積線は持たない。覚え方: パレート=重要な少数を見つける。"
  },
  {
    "id": 74,
    "cat": "基礎理論",
    "topic": "適合率と再現率",
    "q": "二値分類で、陽性と予測した10件のうち実際に陽性だったのは8件。実際の陽性は全部で12件だった。適合率(Precision)と再現率(Recall)の組合せはどれか(小数第2位まで)。",
    "choices": [
      {
        "label": "ア",
        "text": "P=0.80, R=0.67"
      },
      {
        "label": "イ",
        "text": "P=0.67, R=0.80"
      },
      {
        "label": "ウ",
        "text": "P=0.80, R=0.80"
      },
      {
        "label": "エ",
        "text": "P=0.67, R=0.67"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: TP=8、FP=2、FN=4。適合率=8÷10=0.80、再現率=8÷12=0.67。間違いやすいポイント: 分母の取り違え(予測陽性か実際の陽性か)。覚え方: 適合率は「予測した中の当たり」、再現率は「実際の陽性の拾えた割合」。"
  },
  {
    "id": 75,
    "cat": "システム開発",
    "topic": "ウォークスルー",
    "q": "設計書のレビューで、作成者が説明役となって関係者と読み合わせ、比較的カジュアルに確認する形式はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "インスペクション"
      },
      {
        "label": "イ",
        "text": "マネジメントレビュー"
      },
      {
        "label": "ウ",
        "text": "ウォークスルー"
      },
      {
        "label": "エ",
        "text": "受入テスト"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 作成者が説明役になる比較的カジュアルなレビューがウォークスルー。間違いやすいポイント: インスペクションは進行役を置く形式的なレビューで、役割と手順が厳格。覚え方: ウォークスルー=歩いて読み合わせる。"
  },
  {
    "id": 76,
    "cat": "ネットワーク",
    "topic": "サブネット(CIDR)",
    "q": "192.168.10.0/26 のネットワークで、ホストに割り当てられるIPアドレスはいくつか。",
    "choices": [
      {
        "label": "ア",
        "text": "30"
      },
      {
        "label": "イ",
        "text": "64"
      },
      {
        "label": "ウ",
        "text": "126"
      },
      {
        "label": "エ",
        "text": "62"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: ホスト部は32-26=6ビットで2^6=64個、ネットワークアドレスとブロードキャストを除く62個。間違いやすいポイント: 64のまま答える、/27(30)や/25(126)との取り違え。覚え方: 2^ホスト部ビット数-2。"
  },
  {
    "id": 77,
    "cat": "ネットワーク",
    "topic": "NAPT",
    "q": "社内の10台の端末が、1つのグローバルIPアドレスを共有して同時に外部へ通信できる。その理由として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "IPアドレスだけを1対1で変換するから。"
      },
      {
        "label": "イ",
        "text": "送信元ポート番号も変換して、通信を区別するから。"
      },
      {
        "label": "ウ",
        "text": "DNSがグローバルIPを各端末に割り当てるから。"
      },
      {
        "label": "エ",
        "text": "MACアドレスを書き換えるから。"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: NAPT(IPマスカレード)はIPアドレスに加えポート番号も変換し、複数端末の通信を区別する。間違いやすいポイント: NATはIPアドレスのみの変換で、1対1の対応になる。覚え方: NAT+Port=NAPT。"
  },
  {
    "id": 78,
    "cat": "プロジェクトマネジメント",
    "topic": "PERTとクリティカルパス",
    "q": "作業A(4日、先行なし)、B(6日、A完了後)、C(3日、A完了後)、D(5日、BとCの完了後)。全体の最短所要日数と、Cの余裕日数の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "14日・2日"
      },
      {
        "label": "イ",
        "text": "15日・3日"
      },
      {
        "label": "ウ",
        "text": "15日・0日"
      },
      {
        "label": "エ",
        "text": "18日・3日"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: クリティカルパスはA→B→Dで4+6+5=15日。Cは6-3=3日の余裕がある。間違いやすいポイント: 全作業を足して18日にする、余裕を0日と誤る。覚え方: 最長経路が全体の所要日数、それ以外は余裕あり。"
  },
  {
    "id": 79,
    "cat": "経営・戦略・法務",
    "topic": "準委任契約",
    "q": "要件整理の支援を月額で依頼した。成果物の完成・納品は契約の条件ではなく、業務を行うこと自体に対して報酬を支払う。この契約形態はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "準委任契約"
      },
      {
        "label": "イ",
        "text": "請負契約"
      },
      {
        "label": "ウ",
        "text": "売買契約"
      },
      {
        "label": "エ",
        "text": "労働者派遣契約"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 業務の遂行そのものを目的とし、完成義務を負わないのが準委任契約。間違いやすいポイント: 請負契約は成果物の完成が報酬の条件。覚え方: 完成責任あり=請負、遂行のみ=準委任。"
  },
  {
    "id": 80,
    "cat": "情報セキュリティ",
    "topic": "CSRF",
    "q": "ユーザーがログインしている状態を悪用し、罠のページ経由で、本人の意図しない送金や設定変更を実行させる攻撃はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "XSS"
      },
      {
        "label": "イ",
        "text": "SQLインジェクション"
      },
      {
        "label": "ウ",
        "text": "CSRF"
      },
      {
        "label": "エ",
        "text": "ブルートフォース攻撃"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: ログイン中のセッションを悪用して意図しない操作をさせるのがCSRF。間違いやすいポイント: XSSは悪意あるスクリプトを閲覧者のブラウザで実行させる攻撃で、狙いが違う。覚え方: CSRF=なりすまして勝手に操作させる。"
  },
  {
    "id": 81,
    "cat": "経営・戦略・法務",
    "topic": "待ち行列(M/M/1)の平均待ち時間",
    "q": "ある窓口はM/M/1(到着はポアソン分布、サービス時間は指数分布、窓口1つ)で近似できる。平均サービス時間は3分、窓口の利用率は0.6である。待ち行列内で待つ平均時間(サービスを受けている時間は含まない)は、「利用率 ÷ (1 − 利用率) × 平均サービス時間」で求められるものとすると、何分か。",
    "choices": [
      {
        "label": "ア",
        "text": "3.0分"
      },
      {
        "label": "イ",
        "text": "1.8分"
      },
      {
        "label": "ウ",
        "text": "4.5分"
      },
      {
        "label": "エ",
        "text": "7.5分"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 0.6÷(1−0.6)×3＝1.5×3＝4.5分。 間違いやすいポイント: 7.5分は『待ち時間＋サービス時間(3÷0.4)』の合計で、待ち行列内の待ちだけではない。1.8分は利用率×サービス時間で式が違う。 覚え方: 待ち時間は ρ/(1−ρ)×Ts、滞在時間は待ち時間にTsを足したもの。"
  },
  {
    "id": 82,
    "cat": "情報セキュリティ",
    "topic": "ソーシャルエンジニアリング(電話)",
    "q": "情報システム部を名乗る人物が社員に電話し、「障害調査のため」と急かして社内システムのパスワードを聞き出した。システムの脆弱性を突かず、人の心理や行動の隙を利用したこの手口を表す用語はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ソーシャルエンジニアリング"
      },
      {
        "label": "イ",
        "text": "ブルートフォース攻撃"
      },
      {
        "label": "ウ",
        "text": "ゼロデイ攻撃"
      },
      {
        "label": "エ",
        "text": "SQLインジェクション"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 技術的な欠陥ではなく、担当者を装って人から情報を聞き出す手口なのでソーシャルエンジニアリング。 間違いやすいポイント: ブルートフォースは総当たりでパスワードを試す機械的な攻撃、ゼロデイは修正パッチ公開前の脆弱性を突く攻撃。 覚え方: 『人をだます』＝ソーシャルエンジニアリング、『機械で総当たり』＝ブルートフォース。"
  },
  {
    "id": 83,
    "cat": "データベース",
    "topic": "外部キーと参照整合性",
    "q": "注文テーブルの「顧客ID」に、顧客テーブルに存在しない値が登録されないようにしてデータの整合性を保ちたい。注文テーブルの顧客IDに設定するものとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "主キー"
      },
      {
        "label": "イ",
        "text": "ビュー"
      },
      {
        "label": "ウ",
        "text": "インデックス"
      },
      {
        "label": "エ",
        "text": "外部キー"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 他テーブルの主キーを参照する列に外部キーを設定すると、存在しない値の登録を防げる(参照整合性)。 間違いやすいポイント: 主キーは行を一意に識別する列、インデックスは検索を速くする仕組みで、値の存在チェックはしない。 覚え方: 1対多の『多』側が『1』側の主キーを参照する＝外部キー。"
  },
  {
    "id": 84,
    "cat": "ネットワーク",
    "topic": "TCPとUDPの使い分け",
    "q": "次のうち、UDPを使うのが最も適した用途はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "銀行システムへの振込データの送信"
      },
      {
        "label": "イ",
        "text": "ビデオ会議の音声のリアルタイム配信(多少の欠落よりも遅延の少なさを優先)"
      },
      {
        "label": "ウ",
        "text": "電子メールの添付ファイルの転送"
      },
      {
        "label": "エ",
        "text": "通販サイトでの購入確定処理の通信"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: UDPは再送や到着確認をしないため低遅延で、多少のパケット欠落が許されるリアルタイム音声・映像に向く。 間違いやすいポイント: 振込・購入確定・メール添付は欠落や順序の乱れが許されないので、再送制御のあるTCPが向く。 覚え方: 正確さ重視＝TCP、速さ・リアルタイム重視＝UDP。"
  },
  {
    "id": 85,
    "cat": "コンピュータシステム",
    "topic": "デッドロック",
    "q": "複数のプロセスが共有資源を排他制御して使っている。プロセスPが資源Xを確保して資源Yの解放を待ち、プロセスQが資源Yを確保して資源Xの解放を待ち続け、どちらも処理が進まなくなった。この状態を表す用語はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "排他制御"
      },
      {
        "label": "イ",
        "text": "スラッシング"
      },
      {
        "label": "ウ",
        "text": "デッドロック"
      },
      {
        "label": "エ",
        "text": "フラグメンテーション"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 互いが相手の保持する資源の解放を待って永久に進まない状態がデッドロック。 間違いやすいポイント: 排他制御は同時更新を防ぐ仕組み(原因側)で、停止した状態の名前ではない。スラッシングは仮想記憶でページ入替えが多発して性能が落ちる現象。 覚え方: 『二人が互いに道を譲らず動けない』＝デッドロック。"
  },
  {
    "id": 86,
    "cat": "システム開発",
    "topic": "境界値分析のテストデータ",
    "q": "会員割引は「18歳以上64歳以下」の人に適用される。境界値分析に基づいて、境界とそのすぐ外側・内側で漏れなく確認するテストデータとして、年齢の組合せのうち最も適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "17歳、18歳、64歳、65歳"
      },
      {
        "label": "イ",
        "text": "18歳、19歳、63歳、64歳"
      },
      {
        "label": "ウ",
        "text": "0歳、18歳、64歳、100歳"
      },
      {
        "label": "エ",
        "text": "20歳、40歳、50歳、60歳"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 境界値分析は有効範囲の端(18と64)と、範囲外の隣(17と65)を選ぶ。 間違いやすいポイント: 範囲内だけ(18,19,63,64)では外側の判定漏れ(≧と＞の誤り)を見つけられない。代表値を選ぶのは同値分割。 覚え方: 境界値は『端・端の外』、同値分割は『グループごとの代表』。"
  },
  {
    "id": 87,
    "cat": "基礎理論",
    "topic": "情報落ちと桁落ち",
    "q": "浮動小数点数の計算で、絶対値が極端に異なる2つの数を加算したところ、小さい方の数が結果にほとんど反映されなかった(例: 10の16乗に1を足しても値が変わらない)。この誤差を表す用語はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "桁落ち"
      },
      {
        "label": "イ",
        "text": "丸め誤差"
      },
      {
        "label": "ウ",
        "text": "オーバフロー"
      },
      {
        "label": "エ",
        "text": "情報落ち"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 大きさが極端に異なる数の加減算で小さい数の情報が失われるのが情報落ち。 間違いやすいポイント: 桁落ちは値が近い2数の引き算で有効桁が減ること。丸め誤差は有限桁で表せず切り捨て・四捨五入される誤差全般。 覚え方: 『大＋小』＝情報落ち、『ほぼ同じ数の引き算』＝桁落ち。"
  },
  {
    "id": 88,
    "cat": "情報セキュリティ",
    "topic": "ゼロトラスト",
    "q": "「社内ネットワークの内側だから安全」とは考えず、社内外を問わず、全てのアクセスについて利用者や端末の正当性を都度検証して許可する考え方はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "境界型防御"
      },
      {
        "label": "イ",
        "text": "ゼロトラスト"
      },
      {
        "label": "ウ",
        "text": "多要素認証"
      },
      {
        "label": "エ",
        "text": "ハニーポット"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 何も信頼せず、場所に関係なく常に検証する考え方がゼロトラスト。 間違いやすいポイント: 境界型防御は『内側は信頼、外側は遮断』という従来型で逆の考え方。多要素認証は認証手段の一つで、考え方全体の名前ではない。 覚え方: ゼロ(0)信頼＝常に疑って検証。"
  },
  {
    "id": 89,
    "cat": "プロジェクトマネジメント",
    "topic": "ガントチャートとPERT図",
    "q": "プロジェクトの各作業について、開始日と終了日を横棒で時間軸上に表し、予定と実績を比べて進捗を把握するために用いる図はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "PERT図"
      },
      {
        "label": "イ",
        "text": "パレート図"
      },
      {
        "label": "ウ",
        "text": "ガントチャート"
      },
      {
        "label": "エ",
        "text": "ヒストグラム"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 作業を時間軸に並べた横棒の図がガントチャートで、進捗の把握に使う。 間違いやすいポイント: PERT図は作業の順序関係を矢印で表しクリティカルパスを求める図。パレート図・ヒストグラムは品質管理で件数や分布を見る図。 覚え方: 『時間軸＋横棒』＝ガント、『矢印のネットワーク』＝PERT。"
  },
  {
    "id": 90,
    "cat": "システム開発",
    "topic": "ユースケース図",
    "q": "システムを利用する人や外部システム(アクタ)と、システムが提供する機能との関係を表し、「システムが何をするか」を要件定義の段階で整理するのに使うUMLの図はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "クラス図"
      },
      {
        "label": "イ",
        "text": "シーケンス図"
      },
      {
        "label": "ウ",
        "text": "状態遷移図"
      },
      {
        "label": "エ",
        "text": "ユースケース図"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: アクタと機能の関係で『システムが何をするか』を表すのがユースケース図。 間違いやすいポイント: クラス図は構造(クラスと関連)、シーケンス図はオブジェクト間のメッセージの時間的順序、状態遷移図は状態の変化を表す。 覚え方: 『誰が何をするか』＝ユースケース。"
  },
  {
    "id": 91,
    "cat": "ネットワーク",
    "topic": "通信プロトコルのヘッダ情報",
    "q": "TCPが、受信側にデータを正しい順序で組み立てさせ、どこまで受け取ったかを送信側に伝えるために使うヘッダ情報の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "送信元ポート番号と宛先ポート番号"
      },
      {
        "label": "イ",
        "text": "シーケンス番号と確認応答番号"
      },
      {
        "label": "ウ",
        "text": "TTLとプロトコル番号"
      },
      {
        "label": "エ",
        "text": "MACアドレスとVLAN ID"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: TCPは、送るデータの位置をシーケンス番号、次に期待する位置(受信済みの位置)を確認応答番号で表し、順序の保証と再送を行う。 間違いやすいポイント: ポート番号は通信相手のアプリケーションを識別する情報、TTLは経路上で転送できる回数の上限、MACアドレスとVLAN IDはデータリンク層の情報で、順序や到達の確認には使わない。 覚え方: 順序と到達確認＝シーケンス番号＋確認応答番号。"
  },
  {
    "id": 92,
    "cat": "コンピュータシステム",
    "topic": "入出力の制御方式",
    "q": "ディスク装置から主記憶へ大量のデータを転送する。CPUが転送データを1語ずつ中継せず、入出力を制御する装置が主記憶との間で直接データをやり取りし、転送の完了時にだけCPUへ通知する方式はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "プログラム制御入出力(CPUがデータを1語ずつ読み書きする)"
      },
      {
        "label": "イ",
        "text": "ポーリング方式(CPUが装置の状態を繰り返し確認する)"
      },
      {
        "label": "ウ",
        "text": "DMA方式"
      },
      {
        "label": "エ",
        "text": "スプーリング(出力を一旦ディスクに貯めて後で出力する)"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: データ転送をCPUを介さず入出力制御装置が主記憶と直接行い、完了時だけ割込みで知らせるのがDMA。転送中のCPU負荷が小さい。 間違いやすいポイント: プログラム制御入出力とポーリングは、CPUが転送や状態確認に関わるのでCPU負荷が大きい。スプーリングは低速な出力装置の待ちを減らす仕組みで、転送方式ではない。 覚え方: CPUを通さず直接(Direct)メモリへ＝DMA。"
  },
  {
    "id": 93,
    "cat": "情報セキュリティ",
    "topic": "攻撃と対策の対応",
    "q": "次の(a)〜(c)の被害を防ぐ対策として、X〜Zのうち適切な組合せはどれか。\n(a) 利用者がログインしたまま罠のページを開いただけで、本人が意図しない振込リクエストが銀行サイトに送られた。\n(b) 掲示板に書き込まれたスクリプトが、その投稿を閲覧した他の利用者のブラウザ上で実行された。\n(c) 検索欄に入力された文字列によってSQL文の意味が変わり、他人の情報が表示された。\n対策X: 重要な操作のリクエストに、サーバが発行した推測困難な値を埋め込み、サーバ側で照合する。\n対策Y: 画面に出力する際に、<、>、&などを別の表記に変換する。\n対策Z: SQL文の雛形を先に用意し、入力値は後から値として割り当てる。",
    "choices": [
      {
        "label": "ア",
        "text": "(a)X、(b)Y、(c)Z"
      },
      {
        "label": "イ",
        "text": "(a)Y、(b)X、(c)Z"
      },
      {
        "label": "ウ",
        "text": "(a)X、(b)Z、(c)Y"
      },
      {
        "label": "エ",
        "text": "(a)Z、(b)Y、(c)X"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: (a)は利用者の意図しないリクエストを送らせるCSRFで、推測困難な値(トークン)の照合が有効(X)。(b)は入力したスクリプトが閲覧者側で実行されるXSSで、出力時のエスケープ(Y)が有効。(c)はSQLインジェクションで、雛形と値を分けるプレースホルダ(Z)が有効。 間違いやすいポイント: 被害の出る場所で考える。CSRFは『本人のリクエストに見せかける』ので、リクエストの正当性を確かめる値で防ぐ。エスケープはブラウザ側でのスクリプト実行、プレースホルダはSQL文の構造変化を防ぐ。 覚え方: CSRF＝トークン、XSS＝エスケープ、SQLi＝プレースホルダ。"
  },
  {
    "id": 94,
    "cat": "経営・戦略・法務",
    "topic": "契約形態の判断",
    "q": "A社は、システムの保守のためにB社の技術者を受け入れた。技術者はA社のオフィスで、A社の担当者から日々の作業指示を直接受けて作業する。B社に成果物の完成義務はなく、B社は技術者が提供した作業時間に応じて報酬を受け取る。技術者はB社と雇用関係にある。この契約形態として最も適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "請負契約"
      },
      {
        "label": "イ",
        "text": "準委任契約"
      },
      {
        "label": "ウ",
        "text": "売買契約"
      },
      {
        "label": "エ",
        "text": "労働者派遣契約"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 受入れ先(A社)が作業を直接指揮命令し、雇用関係は派遣元(B社)にあるのが労働者派遣。 間違いやすいポイント: 請負は仕事の完成義務があり、発注者は請負人の作業者に直接指示できない。準委任は完成義務はないが、受託者が自らの裁量で業務を行い、委託者は作業者に直接指揮命令しない。売買は物の所有権の移転。 覚え方: 『完成義務の有無』と『誰が指揮命令するか』の2軸で区別する。"
  },
  {
    "id": 95,
    "cat": "基礎理論",
    "topic": "符号付き整数の加算",
    "q": "8ビットの2の補数表現を用いる。符号付き整数A=25とB=-37を加算した結果を、同じ8ビットの2の補数表現で16進数で表したものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "0C"
      },
      {
        "label": "イ",
        "text": "F3"
      },
      {
        "label": "ウ",
        "text": "F4"
      },
      {
        "label": "エ",
        "text": "3E"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 25+(-37)=-12。-12は8ビットで 256-12=244=F4(2進で11110100)。別解: -37はDB(11011011)で、25=19(16進)を足すとDB+19=F4。 間違いやすいポイント: 0Cは絶対値の12をそのまま16進にした値、F3は-12を1の補数(ビット反転)だけで表した値、3Eは25+37の和。 覚え方: 負数は『反転して1を足す』。-12→00001100→反転11110011→+1→11110100=F4。"
  },
  {
    "id": 96,
    "cat": "ネットワーク",
    "topic": "アドレス範囲の算出",
    "q": "ホストに割り当てられたIPアドレスが192.168.10.77/28のとき、このネットワークで、ホストに割り当てられる最大のIPアドレスはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "192.168.10.79"
      },
      {
        "label": "イ",
        "text": "192.168.10.78"
      },
      {
        "label": "ウ",
        "text": "192.168.10.94"
      },
      {
        "label": "エ",
        "text": "192.168.10.126"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: /28は下位4ビットがホスト部で、16個ずつのブロックに分かれる。77は64〜79のブロックに入り、ネットワークアドレスは.64、ブロードキャストアドレスは.79。ホストに割り当てられる最大は.78。 間違いやすいポイント: .79はブロードキャストアドレスで割り当てられない。.94は/27、.126は/25のブロックで考えた場合の値。 覚え方: ホスト部がnビットなら 2^n 個ずつのブロック。先頭=ネットワーク、末尾=ブロードキャスト、その間がホスト。"
  },
  {
    "id": 97,
    "cat": "アルゴリズム・プログラミング",
    "topic": "複数キーでの並べ替え",
    "q": "社員の(氏名, 得点)を氏名順に並べた次の表がある。\n社員A 70点、社員B 85点、社員C 70点、社員D 60点、社員E 85点\nこの表を、同じ得点の社員の相対的な順序を保つ(安定な)整列方法で、得点の高い順(降順)に並べ替えた。並べ替え後の社員の並びはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "B、E、A、C、D"
      },
      {
        "label": "イ",
        "text": "E、B、C、A、D"
      },
      {
        "label": "ウ",
        "text": "B、E、C、A、D"
      },
      {
        "label": "エ",
        "text": "A、C、B、E、D"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 得点の降順でグループ分けすると、85点(B,E)、70点(A,C)、60点(D)。安定な整列では同点の相対順序が元のまま(B→E、A→C)なので、B、E、A、C、D。 間違いやすいポイント: 降順だからといって同点の順序まで逆にしない(E,B,C,A,D)。同点の順序が保たれるのが安定。 覚え方: 安定＝『同じキーの順序は並べ替え前のまま』。"
  },
  {
    "id": 98,
    "cat": "データベース",
    "topic": "障害後の回復対象",
    "q": "データベースのシステム障害からの回復を考える。更新ジャーナルには各トランザクションの更新前の値、更新後の値、コミットが記録されている。チェックポイント時点までの更新は、全てディスク上のデータベースに反映済みである。障害で主記憶上の内容は失われたが、ディスク上のデータベースとジャーナルは使える。障害発生時の各トランザクションの状況は次のとおりである。\nT1: チェックポイントより前に開始し、チェックポイントより前にコミット\nT2: チェックポイントより前に開始し、チェックポイント後、障害前にコミット\nT3: チェックポイント後に開始し、障害前にコミット\nT4: チェックポイントより前に開始し、障害発生時点で未コミット\nT5: チェックポイント後に開始し、障害発生時点で未コミット\n再起動時に、ジャーナルの更新後の値でデータベースを再現する処理(ロールフォワード)と、更新前の値に戻す処理(ロールバック)が必要になるトランザクションの組合せとして、適切なものはどれか。回復処理が不要なトランザクションは、どちらにも含めない。",
    "choices": [
      {
        "label": "ア",
        "text": "ロールフォワード: T2, T3　ロールバック: T5"
      },
      {
        "label": "イ",
        "text": "ロールフォワード: T3　ロールバック: T4, T5"
      },
      {
        "label": "ウ",
        "text": "ロールフォワード: T2, T3, T4　ロールバック: T5"
      },
      {
        "label": "エ",
        "text": "ロールフォワード: T2, T3　ロールバック: T4, T5"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: チェックポイント後にコミットしたT2、T3は更新がディスクに反映されていない可能性があるのでロールフォワード。障害時に未コミットのT4、T5は、チェックポイント前の更新がディスクに反映されている可能性があるので、更新前の値に戻すロールバックが必要。T1はチェックポイント前にコミット済みで反映済みのため不要。 間違いやすいポイント: T4はチェックポイント前に開始しているので『反映済み＝問題なし』と考えがちだが、未コミットなので取り消す必要がある。T2はチェックポイントをまたいでいてもコミットがチェックポイント後なのでロールフォワード。 覚え方: コミット済み(チェックポイント後)は進める、未コミットは戻す、チェックポイント前にコミット済みは何もしない。"
  },
  {
    "id": 99,
    "cat": "データベース",
    "topic": "表の分割",
    "q": "次の表を第3正規形まで正規化したい。\n注文明細(注文番号, 商品コード, 注文日, 顧客番号, 顧客名, 商品名, 単価, 数量)\n主キーは(注文番号, 商品コード)である。関数従属は次のとおりである。\n注文番号 → 注文日、顧客番号\n顧客番号 → 顧客名\n商品コード → 商品名、単価\n(注文番号, 商品コード) → 数量\n正規化の結果として適切なものはどれか。ただし[ ]内は主キーを表す。",
    "choices": [
      {
        "label": "ア",
        "text": "注文([注文番号], 注文日, 顧客番号, 顧客名)、商品([商品コード], 商品名, 単価)、注文明細([注文番号, 商品コード], 数量)"
      },
      {
        "label": "イ",
        "text": "注文([注文番号], 注文日, 顧客番号)、顧客([顧客番号], 顧客名)、商品([商品コード], 商品名, 単価, 数量)、注文明細([注文番号, 商品コード])"
      },
      {
        "label": "ウ",
        "text": "注文([注文番号], 注文日, 顧客番号)、顧客([顧客番号], 顧客名)、商品([商品コード], 商品名, 単価)、注文明細([注文番号, 商品コード], 数量)"
      },
      {
        "label": "エ",
        "text": "注文([注文番号], 注文日, 顧客番号)、顧客([顧客番号], 顧客名)、注文明細([注文番号, 商品コード], 商品名, 単価, 数量)"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 主キーの一部だけに従属する項目(注文日・顧客番号は注文番号に、商品名・単価は商品コードに)を分離し(第2正規形)、さらに主キー以外を介した従属(注文番号→顧客番号→顧客名)を分離する(第3正規形)。数量は(注文番号, 商品コード)の両方で決まるので注文明細に残る。 間違いやすいポイント: 顧客名を注文に残すと『注文番号→顧客番号→顧客名』の間接的な従属が残り、第2正規形止まり。数量を商品側に移すと、商品ごとの数量が一意に決まらなくなる。商品名・単価を注文明細に残すと部分従属が残る。 覚え方: 第2正規形＝主キーの一部への従属を分ける、第3正規形＝主キー以外を介する従属(間接的な従属)を分ける。"
  },
  {
    "id": 100,
    "cat": "コンピュータシステム",
    "topic": "記憶階層の平均時間",
    "q": "CPUがデータを読み出すとき、1次キャッシュ、2次キャッシュ、主記憶の順に探す。各段のアクセス時間とヒット率は次のとおりである。\n1次キャッシュ: アクセス時間2ナノ秒、ヒット率90%\n2次キャッシュ: アクセス時間10ナノ秒、ヒット率80%(1次キャッシュにないデータのうち、2次キャッシュにある割合)\n主記憶: アクセス時間100ナノ秒\n読出しにかかる時間は、データが見つかった段のアクセス時間とし、探索で通過した段の時間は加えない。平均の読出し時間(実効アクセス時間)は何ナノ秒か。",
    "choices": [
      {
        "label": "ア",
        "text": "2.6ナノ秒"
      },
      {
        "label": "イ",
        "text": "4.8ナノ秒"
      },
      {
        "label": "ウ",
        "text": "5.0ナノ秒"
      },
      {
        "label": "エ",
        "text": "4.6ナノ秒"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 1次で見つかる確率0.9、2次で見つかる確率0.1×0.8=0.08、主記憶まで行く確率0.1×0.2=0.02。2×0.9+10×0.08+100×0.02=1.8+0.8+2.0=4.6ナノ秒。 間違いやすいポイント: 2次のヒット率80%は『1次にないもののうち』の割合なので、0.1を掛ける。2.6は主記憶の分を忘れた値、4.8は2次のヒット率0.8を掛け忘れた値(1.8+1.0+2.0)、5.0は通過した段の時間を加えた値。 覚え方: 『各段で見つかる確率×その段の時間』の合計。確率は前の段で見つからなかった分に掛ける。"
  },
  {
    "id": 101,
    "cat": "ネットワーク",
    "topic": "LAN外宛ての通信の送り先",
    "q": "同一LAN内のPCが、宛先のIPアドレスが自分のLANの外にあると判断したパケットを、最初に送る相手として、あらかじめPCに設定しておくIPアドレスはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "DNSサーバのIPアドレス"
      },
      {
        "label": "イ",
        "text": "DHCPサーバのIPアドレス"
      },
      {
        "label": "ウ",
        "text": "デフォルトゲートウェイのIPアドレス"
      },
      {
        "label": "エ",
        "text": "自LANのブロードキャストアドレス"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: LAN外宛てのパケットは、LANと外部を中継するルータ(デフォルトゲートウェイ)に渡し、以降の経路選択を任せる。 間違いやすいポイント: DNSサーバはドメイン名からIPアドレスを求める問合せ先、DHCPサーバはIPアドレス等を配る装置で、パケットの転送先ではない。ブロードキャストアドレスは同一LAN内の全機器宛て。 覚え方: LANの出口＝デフォルトゲートウェイ。"
  },
  {
    "id": 102,
    "cat": "サービスマネジメント",
    "topic": "障害時の管理の目的",
    "q": "ITサービスの運用で、障害が発生したときに、根本原因の究明よりも、サービスをできるだけ早く復旧させて利用者への影響を最小限に抑えることを主な目的とする管理プロセスはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "インシデント管理"
      },
      {
        "label": "イ",
        "text": "問題管理"
      },
      {
        "label": "ウ",
        "text": "変更管理"
      },
      {
        "label": "エ",
        "text": "構成管理"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 障害などサービスの中断を速やかに回復させ、影響を最小にするのがインシデント管理。暫定的な回避策での復旧も含む。 間違いやすいポイント: 問題管理は、インシデントの根本原因を究明して再発を防ぐ。変更管理は変更の影響を評価して承認・管理する。構成管理は構成要素の情報を正確に維持する。 覚え方: 早く元に戻す＝インシデント、原因を潰す＝問題。"
  },
  {
    "id": 103,
    "cat": "システム開発",
    "topic": "設計図の使い分け",
    "q": "オンライン書店のシステムを設計している。次の(1)〜(3)を表現するのに最も適したUMLの図の組合せはどれか。\n(1) 利用者(顧客、管理者)がシステムに対して行える機能の一覧と、その機能を使う人との関係\n(2) 注文確定の処理で、注文オブジェクトと在庫オブジェクトがやり取りするメッセージの時間順\n(3) 注文、商品、顧客といった事物の属性と、それらの間の関連",
    "choices": [
      {
        "label": "ア",
        "text": "(1)クラス図　(2)シーケンス図　(3)ユースケース図"
      },
      {
        "label": "イ",
        "text": "(1)ユースケース図　(2)クラス図　(3)シーケンス図"
      },
      {
        "label": "ウ",
        "text": "(1)シーケンス図　(2)ユースケース図　(3)クラス図"
      },
      {
        "label": "エ",
        "text": "(1)ユースケース図　(2)シーケンス図　(3)クラス図"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 機能と利用者の関係はユースケース図、オブジェクト間のメッセージの時間順はシーケンス図、事物の属性と関連はクラス図で表す。 間違いやすいポイント: 『やり取り』という語だけでクラス図を選ばない。クラス図は静的な構造、シーケンス図は時間順の動き、ユースケース図は機能と利用者の関係。 覚え方: 誰が何をする＝ユースケース、時間順のやり取り＝シーケンス、モノの構造＝クラス。"
  },
  {
    "id": 104,
    "cat": "経営・戦略・法務",
    "topic": "事業の位置づけ",
    "q": "ある企業の4事業について、市場成長率と相対的市場シェアは次のとおりである。\n事業W: 成長率15%、相対シェア0.4\n事業X: 成長率3%、相対シェア1.8\n事業Y: 成長率12%、相対シェア1.5\n事業Z: 成長率2%、相対シェア0.3\nプロダクト・ポートフォリオ・マネジメント(PPM)で、成長率10%以上を『高』、相対シェア1.0以上を『高』とする。『問題児』(成長率高・シェア低)と『金のなる木』(成長率低・シェア高)に該当する事業の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "問題児: 事業Z　金のなる木: 事業Y"
      },
      {
        "label": "イ",
        "text": "問題児: 事業W　金のなる木: 事業X"
      },
      {
        "label": "ウ",
        "text": "問題児: 事業Y　金のなる木: 事業X"
      },
      {
        "label": "エ",
        "text": "問題児: 事業W　金のなる木: 事業Z"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: Wは成長率高・シェア低で問題児、Xは成長率低・シェア高で金のなる木。Yは両方高で花形、Zは両方低で負け犬。 間違いやすいポイント: 軸の高低を逆に読むとZ・Yを選ぶ。シェアを見落とすとYを問題児、Zを金のなる木と誤る。 覚え方: 縦軸＝成長率、横軸＝シェア。成長高×シェア低＝問題児、成長低×シェア高＝金のなる木。"
  },
  {
    "id": 105,
    "cat": "経営・戦略・法務",
    "topic": "損益項目の読み取り",
    "q": "ある企業の損益計算書の一部は次のとおりである(単位: 百万円)。\n売上高 5,000\n売上原価 3,200\n販売費及び一般管理費 1,100\n営業外収益 80\n営業外費用 120\n特別損失 50\n営業利益は何百万円か。",
    "choices": [
      {
        "label": "ア",
        "text": "700"
      },
      {
        "label": "イ",
        "text": "660"
      },
      {
        "label": "ウ",
        "text": "610"
      },
      {
        "label": "エ",
        "text": "1,800"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 営業利益＝売上高－売上原価－販売費及び一般管理費＝5,000－3,200－1,100＝700。 間違いやすいポイント: 660は営業外損益を加減した経常利益(700＋80－120)、610は特別損失まで引いた税引前当期純利益、1,800は売上総利益(売上高－売上原価)。 覚え方: 売上総利益→営業利益(販管費を引く)→経常利益(営業外損益を加減)→税引前当期純利益(特別損益を加減)。"
  },
  {
    "id": 106,
    "cat": "ソフトウェア・開発",
    "topic": "テスト方法の選択",
    "q": "ある機能のテストケースを、プログラムの内部構造(ソースコード)を見ずに、仕様書に書かれた入力と期待される出力だけから作成する。このテスト方法と、その考え方に基づくテストケース設計技法の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ホワイトボックステスト、同値分割"
      },
      {
        "label": "イ",
        "text": "ブラックボックステスト、命令網羅"
      },
      {
        "label": "ウ",
        "text": "ブラックボックステスト、同値分割"
      },
      {
        "label": "エ",
        "text": "ホワイトボックステスト、命令網羅"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 内部構造を見ず仕様から作るのがブラックボックステストで、入力を同じ扱いになる範囲に分けて代表値を選ぶ同値分割がその技法。 間違いやすいポイント: 命令網羅はソースコードの全ての命令を実行することを基準とするホワイトボックスの技法。方法と技法の組合せが合っているかを両方確認する。 覚え方: 仕様から作る＝ブラックボックス(同値分割・境界値)、コードから作る＝ホワイトボックス(命令・分岐の網羅)。"
  },
  {
    "id": 107,
    "cat": "データベース",
    "topic": "更新結果が合わない原因",
    "q": "口座残高が10,000円のとき、トランザクションT1(1,000円を引き出す)とT2(2,000円を引き出す)が、次の順序で実行された。\nT1: 残高を読む(10,000)\nT2: 残高を読む(10,000)\nT1: 10,000－1,000＝9,000を書き込み、コミット\nT2: 10,000－2,000＝8,000を書き込み、コミット\n最終残高は8,000円となり、T1の引出しが反映されていない。この問題を防ぐために主に必要なトランザクションの性質と、その実現手段の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "原子性。更新の途中で失敗した場合に、それまでの更新を全て取り消す。"
      },
      {
        "label": "イ",
        "text": "分離性。読み取った残高に対する更新が完了するまで、他のトランザクションの更新を待たせる排他制御を行う。"
      },
      {
        "label": "ウ",
        "text": "永続性。コミットした更新内容をジャーナルに記録し、障害後に復元できるようにする。"
      },
      {
        "label": "エ",
        "text": "一貫性。更新後のデータが整合性制約に違反していないかを、コミット時に検査する。"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 複数のトランザクションが同時に実行されても、互いに干渉せず、1つずつ順に実行したのと同じ結果になる性質が分離性(Isolation)。排他制御(ロック)で実現する。 間違いやすいポイント: 原子性は全部成功か全部失敗、永続性はコミット後に結果が失われない、一貫性は制約を満たした状態を保つこと。本問はどの更新も失敗していない。 覚え方: 同時実行の干渉＝分離性＝排他制御。"
  },
  {
    "id": 108,
    "cat": "ネットワーク",
    "topic": "通信記録の読み取り",
    "q": "社内LANのPCで取得したパケットの記録の一部を示す。\n番号 | 送信元 | 宛先 | 種別 | 宛先ポート\n1 | 0.0.0.0 | 255.255.255.255 | UDP | 67\n2 | 192.168.1.20 | 192.168.1.5 | UDP | 53\n3 | 192.168.1.20 | 203.0.113.10 | TCP | 443\nこの順に行われた(1)〜(3)の通信の目的の組合せとして、最も適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(1)IPアドレス等の自動取得　(2)ドメイン名の名前解決　(3)HTTPによるWebアクセス"
      },
      {
        "label": "イ",
        "text": "(1)ドメイン名の名前解決　(2)IPアドレス等の自動取得　(3)HTTPSによるWebアクセス"
      },
      {
        "label": "ウ",
        "text": "(1)IPアドレス等の自動取得　(2)HTTPSによるWebアクセス　(3)ドメイン名の名前解決"
      },
      {
        "label": "エ",
        "text": "(1)IPアドレス等の自動取得　(2)ドメイン名の名前解決　(3)HTTPSによるWebアクセス"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: (1)は送信元0.0.0.0から全体宛て(ブロードキャスト)にUDP67番で、IPアドレス未取得のPCがDHCPサーバを探す通信。(2)はUDP53番でDNSの名前解決。(3)はTCP443番でHTTPS。 間違いやすいポイント: 80番はHTTP、443番はHTTPS。53番(DNS)と67番(DHCPサーバ)を逆にしない。 覚え方: 67/68=DHCP、53=DNS、80=HTTP、443=HTTPS。送信元0.0.0.0＝まだIPアドレスがない。"
  },
  {
    "id": 109,
    "cat": "データベース",
    "topic": "集計結果の件数",
    "q": "表「注文」に対する次のSQL文(1)〜(3)の結果について、(1)の行数、(2)の行数、(3)の値の組合せとして正しいものはどれか。\n注文(注文番号, 顧客, 商品)\n1, A, りんご\n2, B, みかん\n3, A, りんご\n4, C, りんご\n5, B, りんご\n6, A, みかん\n(1) SELECT 顧客 FROM 注文 WHERE 商品 = 'りんご'\n(2) SELECT DISTINCT 顧客 FROM 注文 WHERE 商品 = 'りんご'\n(3) SELECT COUNT(DISTINCT 商品) FROM 注文 WHERE 顧客 = 'A'",
    "choices": [
      {
        "label": "ア",
        "text": "(1)4行　(2)4行　(3)2"
      },
      {
        "label": "イ",
        "text": "(1)4行　(2)3行　(3)3"
      },
      {
        "label": "ウ",
        "text": "(1)4行　(2)3行　(3)2"
      },
      {
        "label": "エ",
        "text": "(1)6行　(2)3行　(3)2"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: (1)はりんごの注文(注文番号1,3,4,5)で4行。(2)は顧客A,B,Cを重複なしで3行。(3)はAの商品(りんご,りんご,みかん)の種類数で2。 間違いやすいポイント: DISTINCTは重複行を除く。COUNT(DISTINCT 商品)は行数ではなく商品の種類数。WHEREは集計前に行を絞る。 覚え方: WHEREで絞る→DISTINCTで重複を除く→COUNTで数える。"
  },
  {
    "id": 110,
    "cat": "コンピュータシステム",
    "topic": "ディスク構成の条件",
    "q": "容量4TBのHDDを6台使って、ディスク装置を構成する。次の条件(a)、(b)をともに満たす構成はどれか。ただし、ホットスペアは故障したディスクの代わりに自動で使われる待機用のディスクで、データは格納しない。\n(a) データを格納できる実効容量が16TBである。\n(b) 任意の2台のHDDが同時に故障しても、データを失わない。",
    "choices": [
      {
        "label": "ア",
        "text": "6台でRAID6を構成する"
      },
      {
        "label": "イ",
        "text": "6台でRAID5を構成する"
      },
      {
        "label": "ウ",
        "text": "6台でRAID1+0(2台ずつのミラーを3組作り、ストライピング)を構成する"
      },
      {
        "label": "エ",
        "text": "5台でRAID5を構成し、残り1台をホットスペアにする"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: RAID6は2台分のパリティを持つので、実効容量は(6－2)×4＝16TBで、任意の2台が同時に故障しても耐えられる。 間違いやすいポイント: RAID5(6台)は実効20TBで、2台同時故障には耐えられない。RAID1+0(6台)は実効12TBで、同じミラー対の2台が壊れると失う。RAID5(5台)＋ホットスペアは実効16TBだが、2台同時故障には耐えられない。 覚え方: 実効容量はRAID5＝(n－1)台分、RAID6＝(n－2)台分、RAID1+0＝n/2台分。"
  },
  {
    "id": 111,
    "cat": "アルゴリズム・プログラミング",
    "topic": "格納位置の決定",
    "q": "要素数7の配列T(添字0〜6)に整数のキーを格納する。格納位置は、まずキーを7で割った余りとし、その位置が既に使用されていたら、1つ後ろの位置(添字6の次は添字0)を順に調べて、最初に空いている位置に格納する。Tは最初は全て空である。キー12、20、26、13、19をこの順に格納したとき、キー19が格納される位置の添字はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "5"
      },
      {
        "label": "イ",
        "text": "1"
      },
      {
        "label": "ウ",
        "text": "0"
      },
      {
        "label": "エ",
        "text": "2"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 12→余り5でT[5]、20→余り6でT[6]、26→余り5(使用中)→6(使用中)→0でT[0]、13→余り6(使用中)→0(使用中)→1でT[1]、19→余り5→6→0→1と全て使用中で、2が空いているのでT[2]。 間違いやすいポイント: 5は余りだけを見た値。0や1は、26や13の格納を見落とした場合の位置。添字6の次は0に戻る。 覚え方: 衝突したら次の位置へ。端まで来たら先頭へ戻り、前に格納した順に表を更新して追う。"
  },
  {
    "id": 112,
    "cat": "コンピュータシステム",
    "topic": "許容できる修復時間",
    "q": "2台の装置A、Bを直列に接続したシステムの稼働率を0.90以上にしたい。Aの平均故障間隔(MTBF)は1,900時間、平均修復時間(MTTR)は100時間である。Bの平均故障間隔は380時間である。システム全体の稼働率を0.90以上にするために許容できる、Bの平均修復時間の最大値に最も近いものはどれか。ただし、稼働率はMTBF÷(MTBF＋MTTR)で求め、直列接続の稼働率は各装置の稼働率の積とする。",
    "choices": [
      {
        "label": "ア",
        "text": "42時間"
      },
      {
        "label": "イ",
        "text": "21時間"
      },
      {
        "label": "ウ",
        "text": "38時間"
      },
      {
        "label": "エ",
        "text": "100時間"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: Aの稼働率は1,900÷2,000＝0.95。全体0.90以上にはBの稼働率が0.90÷0.95≒0.947以上必要。380÷(380＋x)≧0.947より、xは約21.1以下で、最大は21時間。 間違いやすいポイント: Bだけで0.90を満たすと考えると42時間、故障間隔の10%を修復時間とすると38時間、Aと同じ100時間は稼働率が大きく下がる。 覚え方: 直列は稼働率の積。目標÷(他の装置の稼働率)で自分の必要稼働率を求める。"
  },
  {
    "id": 113,
    "cat": "情報セキュリティ",
    "topic": "鍵の使い分け",
    "q": "A社の担当者がB社の担当者に契約書ファイルをメールで送る。要件は、(1)第三者がファイルの内容を読めないこと、(2)B社の担当者が、A社の担当者が作成したものであり途中で改ざんされていないことを確認できること、の2点である。公開鍵暗号方式とデジタル署名(ファイルのハッシュ値に署名する)を使うとき、各処理で使う鍵の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "署名の作成にA社の秘密鍵、暗号化にB社の公開鍵、復号にB社の秘密鍵、署名の検証にA社の公開鍵を使う。"
      },
      {
        "label": "イ",
        "text": "署名の作成にA社の秘密鍵、暗号化にA社の公開鍵、復号にA社の秘密鍵、署名の検証にA社の公開鍵を使う。"
      },
      {
        "label": "ウ",
        "text": "署名の作成にA社の公開鍵、暗号化にB社の公開鍵、復号にB社の秘密鍵、署名の検証にA社の秘密鍵を使う。"
      },
      {
        "label": "エ",
        "text": "署名の作成にA社の秘密鍵、暗号化にB社の秘密鍵、復号にB社の公開鍵、署名の検証にA社の公開鍵を使う。"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 内容を隠すには受信者(B社)の公開鍵で暗号化し、B社の秘密鍵で復号する。送信者(A社)であることの確認には、A社の秘密鍵で署名し、A社の公開鍵で検証する。 間違いやすいポイント: 暗号化に送信者自身の公開鍵を使うとB社は復号できない。署名に公開鍵を使うと誰でも作成でき、検証に秘密鍵が必要になる。暗号化に秘密鍵を使うと、公開鍵を持つ誰でも復号できる。 覚え方: 暗号化は相手の公開鍵、署名は自分の秘密鍵。秘密鍵は持ち主だけが使う。"
  },
  {
    "id": 114,
    "cat": "経営・戦略・法務",
    "topic": "費用構造の変更",
    "q": "ある製品の現在の売上高は8,000万円、変動費は5,600万円、固定費は1,800万円である(変動費は売上高に比例する)。生産設備を更新すると、固定費が2,100万円に増える一方、変動費率が60%に下がる。設備更新後の損益分岐点売上高と、売上高が8,000万円のときの営業利益の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "損益分岐点売上高 7,000万円、営業利益 300万円"
      },
      {
        "label": "イ",
        "text": "損益分岐点売上高 4,500万円、営業利益 1,400万円"
      },
      {
        "label": "ウ",
        "text": "損益分岐点売上高 5,250万円、営業利益 1,100万円"
      },
      {
        "label": "エ",
        "text": "損益分岐点売上高 3,500万円、営業利益 2,700万円"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 更新後の限界利益率＝1－0.6＝0.4。損益分岐点売上高＝固定費÷限界利益率＝2,100÷0.4＝5,250万円。営業利益＝8,000×0.4－2,100＝1,100万円。 間違いやすいポイント: 固定費だけ変えて限界利益率を現状の30%のままにすると7,000万円・300万円、変動費率だけ変えて固定費を現状のままにすると4,500万円・1,400万円、変動費率60%を限界利益率として使うと3,500万円・2,700万円。 覚え方: 損益分岐点売上高＝固定費÷(1－変動費率)。変えた項目をすべて反映する。"
  },
  {
    "id": 115,
    "cat": "ネットワーク",
    "topic": "対応表の読み取り",
    "q": "アドレス変換を行う装置(グローバルIPアドレス203.0.113.1)が、次の変換表を保持している。\n内部のIPアドレス:ポート | 変換後のポート | 通信相手\n192.168.0.10:50001 | 60001 | 198.51.100.7:443\n192.168.0.11:50001 | 60002 | 198.51.100.7:443\n192.168.0.10:50002 | 60003 | 198.51.100.9:80\nインターネット側から、次の応答パケットが装置に届いた。表に従って、各パケットが転送されるLAN側のIPアドレス:ポートの組合せとして適切なものはどれか。\n(a) 198.51.100.7:443 → 203.0.113.1:60002\n(b) 198.51.100.9:80 → 203.0.113.1:60003\n(c) 198.51.100.7:443 → 203.0.113.1:60001",
    "choices": [
      {
        "label": "ア",
        "text": "(a)192.168.0.10:50001　(b)192.168.0.10:50002　(c)192.168.0.11:50001"
      },
      {
        "label": "イ",
        "text": "(a)192.168.0.11:50001　(b)192.168.0.10:50002　(c)192.168.0.10:50001"
      },
      {
        "label": "ウ",
        "text": "(a)192.168.0.11:50001　(b)192.168.0.10:50001　(c)192.168.0.10:50002"
      },
      {
        "label": "エ",
        "text": "(a)192.168.0.10:50002　(b)192.168.0.11:50001　(c)192.168.0.10:50001"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 戻りのパケットは宛先ポート(変換後のポート)で表を引く。60002→192.168.0.11:50001、60003→192.168.0.10:50002、60001→192.168.0.10:50001。 間違いやすいポイント: 内部ポート50001は2台で重複するので、内部ポートだけでは相手を特定できない。変換後のポートが各通信を一意に区別する。 覚え方: 戻りの通信は、変換後のポート番号で表を引いて元のIPアドレスとポートへ戻す。"
  },
  {
    "id": 116,
    "cat": "コンピュータシステム",
    "topic": "窓口の混雑",
    "q": "窓口が1つの待ち行列モデル(M/M/1)で、客の到着が平均5分に1人(到着率は1分あたり0.2人)、窓口の平均サービス時間が4分である。平均サービス時間を3分に短縮すると、客が到着してからサービスが終わるまでの平均時間(平均待ち時間＋平均サービス時間)は何分短縮されるか。ただし、利用率ρ＝到着率×平均サービス時間とし、平均待ち時間は ρ÷(1－ρ)×平均サービス時間 で求める。",
    "choices": [
      {
        "label": "ア",
        "text": "11.5分"
      },
      {
        "label": "イ",
        "text": "2.5分"
      },
      {
        "label": "ウ",
        "text": "1.0分"
      },
      {
        "label": "エ",
        "text": "12.5分"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 短縮前はρ＝0.8、待ち時間＝0.8÷0.2×4＝16分、合計20分。短縮後はρ＝0.6、待ち時間＝0.6÷0.4×3＝4.5分、合計7.5分。差は12.5分。 間違いやすいポイント: 待ち時間だけの差は11.5分、サービス時間だけの差は1.0分。式の『×平均サービス時間』を忘れると2.5分になる。 覚え方: 『待ち＋サービス』を前後で比べる。利用率が下がると待ち時間が大きく減る。"
  },
  {
    "id": 117,
    "cat": "ソフトウェア・開発",
    "topic": "資源の取得順序",
    "q": "トランザクションT1、T2、T3が、資源A、B、Cに対して次の順にロックを要求する。\nT1: A、Bの順　T2: B、Cの順　T3: C、Aの順\nTi-1はTiの1番目の要求、Ti-2は2番目の要求を表す。要求した資源が他のトランザクションに保持されているとき、そのトランザクションは待ち状態になり、保持が解放されるまで以降の要求を出せない。待ち状態でないトランザクションは、示された順序で要求を実行する。2つの要求が両方成立したトランザクションは直ちにコミットし、保持する資源を全て解放する。要求の実行順序が次のとき、デッドロックが発生するものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "T1-1、T2-1、T2-2、T3-1、T1-2、T3-2"
      },
      {
        "label": "イ",
        "text": "T1-1、T2-1、T1-2、T2-2、T3-1、T3-2"
      },
      {
        "label": "ウ",
        "text": "T1-1、T2-1、T1-2、T3-1、T2-2、T3-2"
      },
      {
        "label": "エ",
        "text": "T3-1、T3-2、T1-1、T2-1、T2-2、T1-2"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: T1-1、T2-1、T1-2、T3-1、T2-2、T3-2の順では、T1がA、T2がB、T3がCを保持した状態で、T1-2はBを待ち、T2-2はCを待ち、T3-2はAを待つ。待ちが環状(T1→T2→T3→T1)になるのでデッドロック。 間違いやすいポイント: 他の3つの順序では、3つが全て最初の資源を保持する前に、どれかがコミットして資源を解放するので、環状の待ちにならない。 覚え方: デッドロックは『保持したまま、互いに相手の保持する資源を待つ環』。全員が1つ目を保持した瞬間があるかを確認する。"
  },
  {
    "id": 118,
    "cat": "プロジェクトマネジメント",
    "topic": "作業の依存関係と工期",
    "q": "次の作業A〜Eで構成されるプロジェクトの最短の所要日数を求める。\n作業A(画面設計) 6日、作業B(API設計) 5日、作業C(実装) 8日、作業D(テスト準備) 4日、作業E(結合テスト) 3日\n依存関係:\n・Bは、Aの開始から2日後に開始できる(開始－開始、遅れ2日)。\n・Cは、AとBの両方が終了してから開始する。\n・Dは、Cの開始から3日後に開始できる(開始－開始、遅れ3日)。\n・Eは、CとDの両方が終了してから開始する。\n各作業は開始できる時点で直ちに開始する。Aの開始を0日目とするとき、プロジェクトの所要日数は何日か。",
    "choices": [
      {
        "label": "ア",
        "text": "18日"
      },
      {
        "label": "イ",
        "text": "26日"
      },
      {
        "label": "ウ",
        "text": "17日"
      },
      {
        "label": "エ",
        "text": "22日"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: A:0〜6、B:2〜7、C:7〜15(AとBの終了の遅い方7日目から)、D:10〜14(Cの開始＋3日)、E:15〜18(CとDの終了の遅い方15日目から)。所要日数は18日。 間違いやすいポイント: 開始－開始の関係を終了－開始として全て直列にすると26日。Bの遅れ2日を無視するとCが6日目開始で17日。DをCの終了後に始めると22日。 覚え方: 開始－開始(遅れn日)は『先行作業の開始＋n日』で開始時刻を決める。後続が複数あるときは終了の遅い方に合わせる。"
  },
  {
    "id": 119,
    "cat": "データベース",
    "topic": "削除操作後の状態",
    "q": "部署表と社員表がある(部署IDが部署表の主キー、社員IDが社員表の主キーで、社員表の部署IDは部署表の部署IDを参照する外部キー)。\n部署(部署ID, 部署名): D1 営業、D2 開発、D3 総務\n社員(社員ID, 部署ID): E1 D1、E2 D1、E3 D2、E4 D2、E5 D3\n次の操作を上から順に実行する。\n操作1: 社員表からE5の行を削除する。\n操作2: 部署表からD3の行を削除する。\n操作3: 部署表からD2の行を削除する。\n操作4: 社員表に(E6, D4)の行を挿入する。\n外部キー制約について、『A: 参照元の行がある行を削除するとき、参照元の行も一緒に削除する(連鎖削除)』と指定した場合と、『B: 指定なし(参照元の行がある行の削除は拒否され、表は変化しない)』の場合の、全操作後の社員表と部署表の行数の組合せとして適切なものはどれか。なお、参照先に存在しない部署IDを持つ行の挿入は、どちらの場合も拒否される。",
    "choices": [
      {
        "label": "ア",
        "text": "A: 社員表3行・部署表1行　B: 社員表5行・部署表2行"
      },
      {
        "label": "イ",
        "text": "A: 社員表2行・部署表1行　B: 社員表4行・部署表1行"
      },
      {
        "label": "ウ",
        "text": "A: 社員表4行・部署表1行　B: 社員表4行・部署表2行"
      },
      {
        "label": "エ",
        "text": "A: 社員表2行・部署表1行　B: 社員表4行・部署表2行"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 操作1でE5を削除(4行)、操作2でD3は参照元がないので削除できる。操作3のD2は、Aでは連鎖削除でE3,E4も消え社員2行・部署1行、Bでは参照元(E3,E4)があるため拒否され社員4行・部署2行。操作4のD4は存在しないので、どちらも拒否。 間違いやすいポイント: 操作2は操作1の後だから、Bでも成功する(部署2行になる)。操作4を成功と誤ると社員表が1行増える。連鎖削除では参照元の行も消える。 覚え方: 外部キーは『参照先に存在しない値を持てない』『参照されている行は(連鎖指定がなければ)消せない』。操作を順に状態更新で追う。"
  },
  {
    "id": 120,
    "cat": "基礎理論",
    "topic": "ビット列の検査",
    "q": "4ビットのデータ(d1 d2 d3 d4)に3ビットの検査ビット(p1 p2 p4)を加えた7ビットの符号を、位置1〜7に次のように並べる。\n位置: 1=p1、2=p2、3=d1、4=p4、5=d2、6=d3、7=d4\n検査ビットは偶数パリティ(対象位置の1の個数が偶数になる)で、p1は位置1,3,5,7、p2は位置2,3,6,7、p4は位置4,5,6,7を対象とする。\n受信した7ビット(位置1から順に)が 1 0 1 1 1 0 0 であった。誤りは高々1ビットである。誤りを訂正した後のデータ(d1 d2 d3 d4)はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "1 1 0 0"
      },
      {
        "label": "イ",
        "text": "0 1 0 0"
      },
      {
        "label": "ウ",
        "text": "1 0 0 0"
      },
      {
        "label": "エ",
        "text": "1 1 1 0"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 位置1,3,5,7の1の個数は3で奇数(p1の検査が不一致:1)、位置2,3,6,7は1個で奇数(p2の検査が不一致:1)、位置4,5,6,7は2個で偶数(p4の検査が一致:0)。不一致の位置番号の和1＋2＝3の位置が誤りなので、位置3を反転して0にする。訂正後のデータは位置3,5,6,7＝0 1 0 0。 間違いやすいポイント: 訂正しないと1 1 0 0。位置5を訂正すると1 0 0 0。検査の重みの順を逆(p1が4、p4が1)にすると位置6を訂正して1 1 1 0になる。 覚え方: 不一致になった検査ビットの位置番号(1,2,4)を足すと誤りの位置になる。"
  },
  {
    "id": 121,
    "cat": "情報セキュリティ",
    "topic": "信頼できる発行元",
    "q": "Webサイトの運営者が正当な相手であることを利用者が確認できるように、運営者の公開鍵と運営者の身元情報とを結び付けたデジタル証明書を発行し、その信頼性を保証する機関はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ドメイン名の登録を受け付けるレジストラ"
      },
      {
        "label": "イ",
        "text": "インターネットへの接続を提供するISP"
      },
      {
        "label": "ウ",
        "text": "認証局(CA)"
      },
      {
        "label": "エ",
        "text": "DNSのルートサーバを運用する機関"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 認証局(CA)が、公開鍵と所有者の情報を結び付けた証明書を発行する。利用者は証明書を検証して、公開鍵の持ち主と改ざんの有無を確認できる(PKI)。 間違いやすいポイント: レジストラはドメイン名の登録、ISPは接続の提供、DNSルートサーバは名前解決の階層の起点で、いずれも公開鍵の持ち主を保証しない。 覚え方: 公開鍵の「身元保証人」が認証局。"
  },
  {
    "id": 122,
    "cat": "ソフトウェア・開発",
    "topic": "資源の分割と割当て",
    "q": "1台の物理サーバ上で複数の仮想マシンを同時に動作させるために、CPUやメモリなどの物理資源を分割して各仮想マシンへ割り当て、それらの動作を制御するソフトウェアはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "デバイスドライバ"
      },
      {
        "label": "イ",
        "text": "ファームウェア"
      },
      {
        "label": "ウ",
        "text": "ミドルウェア"
      },
      {
        "label": "エ",
        "text": "ハイパーバイザ"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: ハイパーバイザは物理ハードウェアの上で複数の仮想マシンを動かし、資源の分割・割当てと動作の制御を行う。 間違いやすいポイント: デバイスドライバは入出力装置を制御するソフトウェア、ファームウェアは機器に組み込まれた制御プログラム、ミドルウェアはOSとアプリケーションの間で共通機能を提供する。 覚え方: 仮想マシンの「管理人」がハイパーバイザ。"
  },
  {
    "id": 123,
    "cat": "経営・戦略・法務",
    "topic": "要因の分類",
    "q": "国内の中堅部品メーカーについて、次の(1)〜(4)の分析結果を得た。\n(1) 自社が持つ特許技術により、競合より高い歩留まりを実現している。\n(2) 主要な取引先が、部品の調達先を海外企業へ切り替える動きを見せている。\n(3) 製造設備の老朽化が進んでいるが、更新のための資金が不足している。\n(4) 政府が、EV向け部品の国内生産を支援する補助金制度を新設した。\n(1)〜(4)をSWOT分析の強み・弱み・機会・脅威に分類したものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(1)強み　(2)機会　(3)弱み　(4)脅威"
      },
      {
        "label": "イ",
        "text": "(1)強み　(2)脅威　(3)弱み　(4)機会"
      },
      {
        "label": "ウ",
        "text": "(1)機会　(2)脅威　(3)強み　(4)弱み"
      },
      {
        "label": "エ",
        "text": "(1)強み　(2)脅威　(3)機会　(4)弱み"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: SWOTは、自社の内部要因が強み(好材料)・弱み(悪材料)、外部環境の要因が機会(好材料)・脅威(悪材料)。(1)は内部の好材料で強み、(2)は外部の悪材料で脅威、(3)は内部の悪材料で弱み、(4)は外部の好材料で機会。 間違いやすいポイント: 取引先の動き(外部)を機会と取る、資金不足(自社の状況)を外部要因と取る、補助金を弱みと取るなど、内部/外部と好/悪の判断を取り違える。 覚え方: 「内部か外部か」と「良いか悪いか」の2×2で考える。"
  },
  {
    "id": 124,
    "cat": "基礎理論",
    "topic": "小数の表し方",
    "q": "10進数の小数0.6875を2進数の小数で表したものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "0.1011"
      },
      {
        "label": "イ",
        "text": "0.1101"
      },
      {
        "label": "ウ",
        "text": "0.0111"
      },
      {
        "label": "エ",
        "text": "0.1001"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 小数部に2を掛けて整数部を順に取り出す。0.6875×2=1.375→1、0.375×2=0.75→0、0.75×2=1.5→1、0.5×2=1.0→1で、0.1011。検算: 1/2＋1/8＋1/16＝0.6875。 間違いやすいポイント: 0.1101は0.8125、0.0111は0.4375、0.1001は0.5625を表す。取り出した順を逆にする、途中の掛け算を誤ると他の選択肢になる。 覚え方: 小数部は「2倍して整数部を取る」を繰り返し、上から順に並べる。"
  },
  {
    "id": 125,
    "cat": "システム開発",
    "topic": "開発の進め方と管理物",
    "q": "ある開発チームは、1〜4週間の固定した期間ごとに、計画、開発、レビューを繰り返し、期間の終わりごとに動作するソフトウェアを成果として出している。プロダクト全体で開発する機能を、価値の高いものから順に並べた一覧は、プロダクトの責任者が管理している。この開発の進め方の名称と、この一覧の名称の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "ウォーターフォールモデル、プロダクトバックログ"
      },
      {
        "label": "イ",
        "text": "スクラム、ガントチャート"
      },
      {
        "label": "ウ",
        "text": "スクラム、スプリントバックログ"
      },
      {
        "label": "エ",
        "text": "スクラム、プロダクトバックログ"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 固定期間(スプリント)で計画・開発・レビューを繰り返し、動くソフトウェアを出す進め方はスクラム(アジャイル開発の代表的手法)。プロダクト全体の機能を優先順位順に並べ、責任者が管理する一覧はプロダクトバックログ。 間違いやすいポイント: ウォーターフォールは工程を上流から順に進める。ガントチャートは作業を時間軸に並べた図。スプリントバックログは、今回のスプリントで取り組む項目の一覧(プロダクト全体ではない)。 覚え方: 「全体の優先順位表」がプロダクトバックログ、「今期の作業表」がスプリントバックログ。"
  },
  {
    "id": 126,
    "cat": "プロジェクトマネジメント",
    "topic": "目的に合う図の選択",
    "q": "品質管理で、次の(1)〜(3)の目的に最も適した図を選ぶ。\n(1) 製品の不良の原因を、人・方法・機械・材料の観点に分けて洗い出したい。\n(2) 気温と、清涼飲料水の販売数量との間に関係があるかを調べたい。\n(3) 製造ラインの製品寸法を日々測定し、工程が安定しているか、異常が起きていないかを監視したい。\n(1)〜(3)の組合せとして適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(1)散布図　(2)特性要因図　(3)管理図"
      },
      {
        "label": "イ",
        "text": "(1)特性要因図　(2)管理図　(3)散布図"
      },
      {
        "label": "ウ",
        "text": "(1)特性要因図　(2)散布図　(3)管理図"
      },
      {
        "label": "エ",
        "text": "(1)パレート図　(2)散布図　(3)ヒストグラム"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: (1)原因を分類して洗い出す図は特性要因図(フィッシュボーン図)。(2)2つのデータの関係(相関)を見る図は散布図。(3)工程が安定しているか、異常があるかを時系列で監視する図は管理図。 間違いやすいポイント: パレート図は件数の多い項目から重点を決める図、ヒストグラムはデータの分布(頻度)を見る図で、(1)(3)の目的とは異なる。 覚え方: 原因=特性要因図、関係=散布図、異常の監視=管理図。"
  },
  {
    "id": 127,
    "cat": "基礎理論",
    "topic": "くじの確率",
    "q": "当たりが3本、はずれが7本の合計10本のくじがある。このくじから、引いたくじを戻さずに続けて2本引くとき、少なくとも1本が当たりである確率はどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "7/15"
      },
      {
        "label": "イ",
        "text": "8/15"
      },
      {
        "label": "ウ",
        "text": "3/5"
      },
      {
        "label": "エ",
        "text": "19/30"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 「少なくとも1本が当たり」は、「2本ともはずれ」の余事象。2本ともはずれの確率は 7/10×6/9＝7/15 なので、1－7/15＝8/15。組合せでは 1－C(7,2)/C(10,2)＝1－21/45＝8/15。 間違いやすいポイント: 7/15は「2本ともはずれ」の確率そのもの。3/5は2×(3/10)、19/30は3/10＋3/9と、確率を単純に足してしまった結果。戻さないので2本目の分母は9になる。 覚え方: 「少なくとも1つ」は、1から「1つもない確率」を引く。"
  },
  {
    "id": 128,
    "cat": "コンピュータシステム",
    "topic": "命令の実行クロック数",
    "q": "5段階(命令フェッチ、デコード、実行、メモリアクセス、書込み)のパイプライン方式のプロセッサで、各段階の処理時間は1クロックである。10命令を順に実行する。ロード命令の直後に、そのロード結果を使う命令が続く箇所が2か所あり、1か所につきパイプラインが1クロック停止する。また、分岐命令が1か所あり、分岐先が確定するまでの2クロック分はパイプラインに空きが生じる。停止や空き以外の待ちはないものとすると、最初の命令の処理開始から10命令の処理完了までは何クロックか。",
    "choices": [
      {
        "label": "ア",
        "text": "14"
      },
      {
        "label": "イ",
        "text": "16"
      },
      {
        "label": "ウ",
        "text": "18"
      },
      {
        "label": "エ",
        "text": "20"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: 停止も空きもない場合、最初の命令が5クロックで完了し、以降は1クロックごとに1命令が完了するので 5＋(10－1)＝14クロック。ロード直後の依存による停止が 1×2＝2クロック、分岐による空きが2クロックで、合計 14＋2＋2＝18クロック。 間違いやすいポイント: 14は停止と空きを無視、16は片方だけを加算、20は停止を1か所2クロックとして数えた場合。 覚え方: パイプラインは「5＋(命令数－1)」に、停止・空きのクロック数を加える。"
  },
  {
    "id": 129,
    "cat": "情報セキュリティ",
    "topic": "ビット列の演算",
    "q": "8ビットの平文P＝01101001を、8ビットの鍵K＝10110010との排他的論理和(XOR)で暗号化し、暗号文Cを得た。(1)Cはどれか。また、(2)攻撃者が平文PとCの両方を入手したとき、PとCのXORで得られるものはどれか。(1)と(2)の組合せとして適切なものを選べ。",
    "choices": [
      {
        "label": "ア",
        "text": "(1)11011011　(2)10110010"
      },
      {
        "label": "イ",
        "text": "(1)00100100　(2)10110010"
      },
      {
        "label": "ウ",
        "text": "(1)11011011　(2)01101001"
      },
      {
        "label": "エ",
        "text": "(1)11111011　(2)11011011"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: (1) C＝P XOR K＝01101001 XOR 10110010＝11011011。(2) P XOR C＝P XOR P XOR K＝K＝10110010となり、平文と暗号文の組から鍵が求まる。 間違いやすいポイント: 00100100はCの各ビットを反転した値(XNOR)、11111011はPとKのOR。XORは同じ値を2回掛けると元に戻る性質があり、(2)で得られるのは鍵。 覚え方: XORは「同じ値で2回やると元に戻る」。平文と暗号文のXORは鍵になる。"
  },
  {
    "id": 130,
    "cat": "経営・戦略・法務",
    "topic": "最大利益の算出",
    "q": "ある工場で製品XとYを製造する。1個当たりの必要量と利益は次のとおりである。\n製品 | 材料(kg) | 加工時間(時間) | 利益(万円)\nX | 2 | 1 | 3\nY | 1 | 2 | 4\n材料は合計14kgまで、加工時間は合計10時間までしか使えない。X、Yは整数個ずつ作るものとして、利益の合計の最大値は何万円か。",
    "choices": [
      {
        "label": "ア",
        "text": "20"
      },
      {
        "label": "イ",
        "text": "21"
      },
      {
        "label": "ウ",
        "text": "24"
      },
      {
        "label": "エ",
        "text": "26"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: Xをx個、Yをy個とすると、材料は2x＋y≦14、加工時間はx＋2y≦10の制約で、3x＋4yを最大にする。2つの制約が交わる点(x,y)＝(6,2)は材料2×6＋2＝14、時間6＋2×2＝10で両方を使い切り、利益は3×6＋4×2＝26万円。 間違いやすいポイント: Xだけ(7個)なら21、Yだけ(5個)なら20。(4,3)は制約内だが24で最大ではない。端点だけでなく、制約が交わる点を調べる。 覚え方: 線形計画法は、制約の境界が交わる点で最大になることが多い。"
  },
  {
    "id": 131,
    "cat": "サービスマネジメント",
    "topic": "停止時間と契約条件",
    "q": "あるクラウドサービスのSLAでは、サービス提供時間を24時間365日とし、月間稼働率の目標を99.9%と定めている。月間稼働率は「(サービス提供時間－停止時間)÷サービス提供時間」で求め、事前に通知した計画メンテナンスの時間は、サービス提供時間にも停止時間にも含めない。月間稼働率が目標を下回った場合は、利用者に利用料金の一部を返還する。30日の月の実績は、障害による停止が3回(15分、10分、15分)、計画メンテナンスが60分であった。月間稼働率(小数第3位を四捨五入)と、返還の要否の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "稼働率99.91%、返還は不要"
      },
      {
        "label": "イ",
        "text": "稼働率99.77%、返還が必要"
      },
      {
        "label": "ウ",
        "text": "稼働率99.91%、返還が必要"
      },
      {
        "label": "エ",
        "text": "稼働率99.86%、返還が必要"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 30日は43,200分。計画メンテナンス60分を除くサービス提供時間は43,140分、停止時間は障害の15＋10＋15＝40分。稼働率＝(43,140－40)÷43,140≒0.99907で99.91%。目標99.9%以上なので返還は不要。 間違いやすいポイント: 計画メンテナンスを停止時間に含めると(43,200－100)÷43,200≒99.77%で目標未達に見える。99.86%は計画メンテナンスのみを差し引いた値。数値が目標以上かどうかの比較も忘れない。 覚え方: SLAの稼働率は、契約で除外される時間を分母・分子の両方から外して計算する。"
  },
  {
    "id": 132,
    "cat": "ネットワーク",
    "topic": "宛先ごとの転送先",
    "q": "ルータが次の経路表を持つ。宛先アドレスに合致する経路が複数あるときは、ネットワーク部の長さ(プレフィックス長)が最も長い経路を選ぶ。\n宛先ネットワーク | 転送先\n10.1.0.0/16 | R1\n10.1.2.0/24 | R2\n10.1.2.128/25 | R3\n0.0.0.0/0 | R4\n宛先が(a)10.1.2.200、(b)10.1.2.100、(c)10.1.9.5のパケットの転送先の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(a)R3　(b)R2　(c)R4"
      },
      {
        "label": "イ",
        "text": "(a)R2　(b)R2　(c)R1"
      },
      {
        "label": "ウ",
        "text": "(a)R3　(b)R2　(c)R1"
      },
      {
        "label": "エ",
        "text": "(a)R4　(b)R4　(c)R1"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: (a)10.1.2.200は10.1.2.128/25(128〜255)に含まれ、他の経路にも合致するが最も長い/25を選んでR3。(b)10.1.2.100は/25の範囲(128〜255)外で、/24に合致するのでR2。(c)10.1.9.5は/16のみ合致でR1。0.0.0.0/0はどの宛先にも合致するが最も短いので、他に合致する経路がないときだけ選ばれる。 間違いやすいポイント: 100は128未満なので/25に入らない。/24にも合致することを理由に(a)をR2とするのは誤り。 覚え方: 経路選択は「最長一致」。デフォルト経路は最後の手段。"
  },
  {
    "id": 133,
    "cat": "基礎理論",
    "topic": "符号付きのビット移動",
    "q": "8ビットの2の補数表現で−43を表したビット列に対して、(1)左に1ビット論理シフトした結果と、(2)符号ビットを保つ算術シフトで右に2ビットシフトした結果を、それぞれ8ビットの2の補数表現による10進数で表したものの組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(1)−86　(2)−10"
      },
      {
        "label": "イ",
        "text": "(1)−86　(2)53"
      },
      {
        "label": "ウ",
        "text": "(1)−86　(2)−11"
      },
      {
        "label": "エ",
        "text": "(1)170　(2)−11"
      }
    ],
    "correct": "ウ",
    "hint": "正解理由: −43は、43(00101011)のビットを反転して1を加えた11010101。(1)左に1ビット: 10101010で、8ビットの2の補数表現では−86。(2)算術右シフトは符号ビットを補う: 11010101→11110101で−11(＝−43÷4を切り下げた値)。 間違いやすいポイント: 170は10101010を符号なしとして読んだ値。53は論理右シフト(上位に0を補う)の結果。−10は−43÷4(−10.75)を0方向に切り捨てた値。 覚え方: 算術右シフトは符号ビットのコピーを上位に補う。結果は切り下げ。"
  },
  {
    "id": 134,
    "cat": "アルゴリズム・プログラミング",
    "topic": "節点の訪問順",
    "q": "根をAとする二分木があり、各節点の左の子と右の子は次の表のとおりである。\n節点 | 左の子 | 右の子\nA | B | C\nB | D | E\nC | なし | F\nD | なし | なし\nE | G | なし\nF | H | I\nG | なし | なし\nH | なし | なし\nI | なし | なし\n前順(根→左部分木→右部分木)、中順(左部分木→根→右部分木)、後順(左部分木→右部分木→根)でそれぞれ全節点を巡回する。(1)前順で5番目、(2)中順で5番目、(3)後順で5番目に訪問する節点の組合せはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "(1)A　(2)G　(3)H"
      },
      {
        "label": "イ",
        "text": "(1)G　(2)E　(3)H"
      },
      {
        "label": "ウ",
        "text": "(1)G　(2)A　(3)I"
      },
      {
        "label": "エ",
        "text": "(1)G　(2)A　(3)H"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: 前順はA,B,D,E,G,C,F,H,Iで5番目はG。中順はD,B,G,E,A,C,H,F,Iで5番目はA。後順はD,G,E,B,H,I,F,C,Aで5番目はH。 間違いやすいポイント: (2)Eは中順の4番目、(3)Iは後順の6番目で、数え間違い。前順と中順を取り違えるとAとGが入れ替わる。右の子がない節点Eの扱い(左の子Gだけ)に注意。 覚え方: 根を訪問するタイミングが、前順は最初、中順は左の後、後順は最後。"
  },
  {
    "id": 135,
    "cat": "データベース",
    "topic": "結合結果の件数",
    "q": "表「顧客」と表「注文」がある。\n顧客(顧客ID, 氏名)\n1, 青木\n2, 伊藤\n3, 上田\n4, 遠藤\n注文(注文ID, 顧客ID, 金額)\n101, 1, 500\n102, 1, 300\n103, 3, 700\n次のSQL文(1)〜(3)の結果の組合せとして正しいものはどれか。\n(1) SELECT COUNT(*) FROM 顧客 LEFT JOIN 注文 ON 顧客.顧客ID = 注文.顧客ID\n(2) SELECT COUNT(注文.注文ID) FROM 顧客 LEFT JOIN 注文 ON 顧客.顧客ID = 注文.顧客ID\n(3) SELECT COUNT(DISTINCT 顧客.顧客ID) FROM 顧客 LEFT JOIN 注文 ON 顧客.顧客ID = 注文.顧客ID WHERE 注文.注文ID IS NULL",
    "choices": [
      {
        "label": "ア",
        "text": "(1)5　(2)3　(3)2"
      },
      {
        "label": "イ",
        "text": "(1)3　(2)3　(3)2"
      },
      {
        "label": "ウ",
        "text": "(1)5　(2)5　(3)2"
      },
      {
        "label": "エ",
        "text": "(1)5　(2)3　(3)4"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: LEFT JOINは左の表の全行を残す。結合結果は青木2行(101,102)、伊藤1行(注文なし)、上田1行、遠藤1行(注文なし)の5行。(1)COUNT(*)は行数なので5。(2)COUNT(列)はNULLを数えないので、注文IDがある3行で3。(3)注文IDがNULLの行(伊藤、遠藤)の顧客IDの種類数で2。 間違いやすいポイント: (1)を3にするのは内部結合と取り違えた場合。(2)COUNT(列)がNULLを数えないことの見落とし。(3)に4は、WHEREの条件を無視した場合。 覚え方: COUNT(*)は行数、COUNT(列)はNULLを除いた数。LEFT JOINで対応なしの行は右側がNULL。"
  },
  {
    "id": 136,
    "cat": "情報セキュリティ",
    "topic": "要件に合う通信許可の設定",
    "q": "インターネットとの間にファイアウォールを置き、内側にDMZ(Webサーバ)、さらに内側の社内LAN(DBサーバ、管理者PC)を置く構成にする。ファイアウォールは、許可した通信の応答を自動で許可し、許可していない通信は全て拒否する。要件は次のとおりである。\n(a) 利用者がインターネットからWebサーバにHTTPS(443)で接続できる。\n(b) WebサーバがDBサーバにTCP3306で接続して処理を行える。\n(c) 社内LANの管理者PCがWebサーバにSSH(22)で接続して管理できる。\n(d) インターネットから、DBサーバなど社内LANへ直接通信できない。\n要件を満たす最小の許可ルールの組(送信元→宛先:ポート)として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "インターネット→Webサーバ:443、インターネット→DBサーバ:3306、社内LAN→Webサーバ:22"
      },
      {
        "label": "イ",
        "text": "インターネット→Webサーバ:443、Webサーバ→DBサーバ:3306、社内LAN→Webサーバ:22"
      },
      {
        "label": "ウ",
        "text": "インターネット→Webサーバ:443、DBサーバ→Webサーバ:3306、社内LAN→Webサーバ:22"
      },
      {
        "label": "エ",
        "text": "インターネット→Webサーバ:443、Webサーバ→DBサーバ:3306、インターネット→社内LAN:22"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: (a)インターネット→Webサーバ:443、(b)接続を始めるのはWebサーバなのでWebサーバ→DBサーバ:3306、(c)管理者PCからの接続なので社内LAN→Webサーバ:22。この3つで足り、(d)に反するルールを含まない。応答は自動で許可される。 間違いやすいポイント: インターネット→DBサーバ:3306は(d)に反する。DBサーバ→Webサーバ:3306は接続の向きが逆で、Webサーバから問い合わせられない。インターネット→社内LAN:22は(d)に反し、(c)の向きとも異なる。 覚え方: ルールは「接続を始める側→受ける側」の向きで書く。外から内への直接通信は最小限にする。"
  },
  {
    "id": 137,
    "cat": "経営・戦略・法務",
    "topic": "将来の収益の評価",
    "q": "ある投資案件は、初期投資額が1,000万円で、その後3年間、各年末にそれぞれ500万円、500万円、400万円の収入が得られる。割引率を10%とし、1年後、2年後、3年後の収入を現在価値に換算する係数をそれぞれ0.909、0.826、0.751とするとき、この投資案件の正味現在価値(NPV)に最も近い金額は何万円か。",
    "choices": [
      {
        "label": "ア",
        "text": "130"
      },
      {
        "label": "イ",
        "text": "168"
      },
      {
        "label": "ウ",
        "text": "285"
      },
      {
        "label": "エ",
        "text": "400"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 収入の現在価値＝500×0.909＋500×0.826＋400×0.751＝454.5＋413＋300.4＝1,167.9万円。NPV＝現在価値の合計－初期投資＝1,167.9－1,000≒168万円。 間違いやすいポイント: 400は割り引かずに合計した値(1,400－1,000)。285は係数を1年ずつずらして適用した値。130は10%ずつ単純に差し引く方法の値。 覚え方: NPV＝(将来の収入×換算係数)の合計－投資額。年ごとに対応する係数を掛ける。"
  },
  {
    "id": 138,
    "cat": "ネットワーク",
    "topic": "経路の整理",
    "q": "経路表に、次の4つのネットワークが別々に登録されている。\n192.168.10.0/24、192.168.11.0/24、192.168.12.0/24、192.168.13.0/24\nこれらの全てを含み、かつこれら以外のアドレスを含まないようにして、経路を最も少ない個数にまとめたい。まとめ方として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "1つにまとめる: 192.168.8.0/21"
      },
      {
        "label": "イ",
        "text": "2つにまとめる: 192.168.10.0/23 と 192.168.12.0/24"
      },
      {
        "label": "ウ",
        "text": "まとめずに4つのまま登録する"
      },
      {
        "label": "エ",
        "text": "2つにまとめる: 192.168.10.0/23 と 192.168.12.0/23"
      }
    ],
    "correct": "エ",
    "hint": "正解理由: /23は連続する2つの/24(第3オクテットが偶数で始まる)をまとめられる。10と11は192.168.10.0/23、12と13は192.168.12.0/23にまとまる。10〜13を1つにするには、第3オクテットが4の倍数で始まる必要があり、10は該当しないので1つにはできない。よって最少は2つ。 間違いやすいポイント: 192.168.8.0/21は8〜15を含み、他のアドレスを含んでしまう。192.168.10.0/23と192.168.12.0/24では13が含まれない。4つのままは最少ではない。 覚え方: /23は第3オクテットが偶数始まり、/22は4の倍数始まりでないとまとめられない。"
  },
  {
    "id": 139,
    "cat": "アルゴリズム・プログラミング",
    "topic": "符号長と総ビット数",
    "q": "5種類の文字A〜Eからなるデータの、各文字の出現割合は A:40%、B:25%、C:15%、D:10%、E:10% である。このデータ1,000文字を、出現頻度をもとに作る可変長の符号(ハフマン符号)で符号化したときの総ビット数はどれか。なお、頻度が最も小さい2つを順に1つにまとめて木を作る方法で符号の長さを決める。",
    "choices": [
      {
        "label": "ア",
        "text": "2,050ビット"
      },
      {
        "label": "イ",
        "text": "2,150ビット"
      },
      {
        "label": "ウ",
        "text": "2,350ビット"
      },
      {
        "label": "エ",
        "text": "3,000ビット"
      }
    ],
    "correct": "イ",
    "hint": "正解理由: 頻度の小さい2つを順にまとめる。D(10)とE(10)→20、C(15)と20→35、B(25)と35→60、A(40)と60→100。符号の長さはA=1、B=2、C=3、D=4、E=4。1,000文字あたりの総ビット数は 400×1＋250×2＋150×3＋100×4＋100×4＝2,150ビット。 間違いやすいポイント: 3,000ビットは固定長3ビットの場合。2,050ビットはDを3ビット、2,350ビットはAを2ビットにした誤った木に対応する。まとめる2つは、その時点で最小の2つを選ぶ。 覚え方: ハフマン符号は、よく出る文字ほど短い符号を割り当てる。"
  },
  {
    "id": 140,
    "cat": "基礎理論",
    "topic": "指標による選択",
    "q": "1,000件の取引のうち、実際に不正だったものは20件である。不正を検知する2つのモデルX、Yの結果は次のとおりである。\nモデル | 不正と予測した件数 | うち実際に不正だった件数\nX | 16 | 12\nY | 40 | 18\n不正の見逃しを減らすことを最優先する場合に選ぶモデルと、その根拠として適切なものはどれか。",
    "choices": [
      {
        "label": "ア",
        "text": "モデルY。実際の不正のうち検知できた割合(再現率)が、Xの0.6に対してYは0.9と高いため。"
      },
      {
        "label": "イ",
        "text": "モデルX。全体のうち予測が当たった割合(正解率)が、Xの98.8%に対してYは97.6%と高いため。"
      },
      {
        "label": "ウ",
        "text": "モデルX。不正と予測したもののうち実際に不正だった割合(適合率)が、Xの0.75に対してYは0.45と高いため。"
      },
      {
        "label": "エ",
        "text": "モデルY。不正と予測したもののうち実際に不正だった割合(適合率)が、Xの0.75に対してYは0.9と高いため。"
      }
    ],
    "correct": "ア",
    "hint": "正解理由: 見逃しを減らす=実際の不正をできるだけ多く見つける=再現率を重視する。再現率はXが12÷20＝0.6、Yが18÷20＝0.9でYが高い。 間違いやすいポイント: 適合率(予測のうち当たった割合)はXが12÷16＝0.75、Yが18÷40＝0.45でXが高いが、これは誤検知を減らす観点。正解率はXが98.8%、Yが97.6%だが、不正が全体の2%と少ないため、見逃しの評価には向かない。適合率と再現率の取り違えにも注意する。 覚え方: 見逃し(取りこぼし)を減らすなら再現率、誤検知を減らすなら適合率。"
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
      `📝 FE科目A 復習リスト ${ds}`,
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

export default function App(){
  const [tab, setTab] = useState("quiz");
  const [cat, setCat] = useState("すべて");
  const [weakMode, setWeakMode] = useState(false);
  const [weakIds, setWeakIds] = useState([]);
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
  const [logError, setLogError] = useState("");
  useEffect(()=>{ ensureSnapshot(); },[]);

  // 起動時にlocalStorageから進捗・履歴を復元
  useEffect(()=>{
    // 問題内容が(id構成として)前回と変わっていないかを確認する。
    // 変わっていた場合、古い周回進捗・復習リストは今の問題内容と対応しなくなるため
    // 自動的にクリアする(生涯累計・セッション履歴は問題内容が変わっても意味を持つため維持する)。
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
      const tot = tgt ? tgt.length : ALL_QUESTIONS.length;
      setProgressError(`✓ 今の周回で${ids.length}問に解答済み（残り${tot-ids.length}問／全${tot}問）`);
    } else if(contentChanged){
      setProgressError(`問題の内容が更新されました。周回・復習リストを初期化しました（累計成績は引き続き保持されています）。`);
    }
    // 過去のセッション履歴を復元(直近最大100件、表示専用)
    const saved = store.loadSessions();
    if(saved.length > 0) setSavedSessions(saved);
    // 生涯累計を復元(こちらは間引かれない真の累計。問題内容が変わっても維持する)
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
  const available = cycleBase(ALL_QUESTIONS, cycleTarget, cat, usedIds);
  // 分子(available.length)と同じ母集団で揃えた分母。
  // 従来はここが常にALL_QUESTIONS.length(全100問)固定だったため、
  // 分野を絞ると「1問/100問中」のように分子分母の母集団が食い違って表示され、
  // 全体の周回進捗(今の周回で30問に解答済み等)と矛盾しているように見える不具合があった。
  const catTotal = ALL_QUESTIONS.filter(q => inCycleTarget(cycleTarget, q.id) && (cat==="すべて" || q.cat===cat)).length;

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
    const usingWeak = weakMode && weakIds.length > 0;
    setIsWeakSession(usingWeak);

    if(usingWeak){
      // 苦手優先：間違えた問題IDから優先出題
      const weakInAll = ALL_QUESTIONS.filter(q => weakIds.includes(q.id));
      const others = ALL_QUESTIONS.filter(q => inCycleTarget(cycleTarget, q.id) && !weakIds.includes(q.id) && (cat==="すべて" || q.cat===cat));
      const shuffledWeak = shuffle(weakInAll).slice(0, Math.min(10, weakInAll.length));
      const rest = shuffle(others).slice(0, Math.max(0, 10 - shuffledWeak.length));
      picked = shuffle([...shuffledWeak, ...rest]).slice(0, 10);
    } else {
      const base = cycleBase(ALL_QUESTIONS, cycleTarget, cat, usedIds);
      if(base.length === 0){
        const fresh = ALL_QUESTIONS.filter(q=>cat==="すべて"||q.cat===cat);
        picked = shuffle(fresh).slice(0,10);
        saveUsedIds(picked.map(q=>q.id));
        saveTarget(ALL_QUESTIONS.map(q=>q.id)); newCycleId("A"); // 新しい周回: その時点の全問題を対象に固定
        // 全問題を1周し終えて新しい周回に入るため、今回の周回成績もリセットする
        setAllHistory([]); setCatStats({}); store.clearCycle();
      } else {
        // 残りが10問未満(周回の端数)の場合は、その残り分だけの少人数セッションにする。
        // 以前は残り10問未満で無条件に「周回終了」と誤判定し、周回の途中(例: 96問中90問時点)
        // でも今の周回の成績を強制リセットしてしまうバグがあった。
        const sessionSize = Math.min(10, base.length);
        picked = shuffle(base).slice(0, sessionSize);
        saveUsedIds([...usedIds, ...picked.map(q=>q.id)]);
        if(cycleTarget === null) saveTarget(ALL_QUESTIONS.map(q=>q.id)); // 周回の開始: 対象を固定
      }
    }

    startLogSession("A");
    setQuestions(picked);
    setAnswers(new Array(picked.length).fill(null));
    setQIdx(0); setChosen(null); setShowFb(false);
    setAnalysis(""); setCopyText(""); setCopied(false);
    setPhase("question");
  },[cat, usedIds, cycleTarget, weakMode, weakIds, saveUsedIds, saveTarget]);

  const handleAnswer = useCallback((choice)=>{
    if(showFb) return;
    setChosen(choice); setShowFb(true);
    const q = questions[qIdx];
    const ok = choice.label===q.correct;
    // 回答確定時に問題ID付きの1件を追記(通常・苦手優先とも。失敗は表示する)
    { const lr = logAnswer("A",{question_id:q.id,selected_choice:choice.label,is_correct:ok,mode:isWeakSession?"weak":"normal"}); setLogError(lr.ok?"":(lr.error||"unknown")); }
    // 苦手優先モードは既出問題を意図的に何度も再出題する復習用モードのため、
    // 「今の周回(1周=全問題を重複なく1回ずつ)」の集計(allHistory/catStats)には含めない。
    // 含めてしまうと同じ問題が何度もカウントされ、分野の合計がその分野の
    // 実際の問題数を超えるなど、集計が壊れる原因になっていた。
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
          <div style={s.h1}>FE 科目A Quiz</div>
          <div style={s.sub}>基本情報技術者 — 想定問題{ALL_QUESTIONS.length}問(全分野ミックス)</div>
          {logError && <div style={{fontSize:11,color:C.red,marginTop:4}}>回答ログの保存に失敗しました: {logError}</div>}
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:8}}>
            <a href="/b" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>科目Bの問題を解く →</a>
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
                onClick={()=>{ if(window.confirm("使用済み問題をリセットして全問を出題可能にします。今回の周回成績もリセットされます。よろしいですか？")){ saveUsedIds([]); saveTarget(null); newCycleId("A"); setAllHistory([]); setCatStats({}); store.clearCycle(); } }}>
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
                    {showFb && <span style={s.catTag}>{q.cat}</span>}
                  </div>
                  {showFb && <div style={s.qnum}>テーマ: {q.topic}</div>}
                  <div style={s.qtext}>{q.q}</div>
                  {q.image && (
                    <div style={{margin:"10px 0 16px",textAlign:"center"}}>
                      <img src={q.image} alt="図表" style={{maxWidth:"100%",borderRadius:8,border:`1px solid ${C.border}`}} />
                    </div>
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
                <GptExportBox subject="A" questions={ALL_QUESTIONS} defaultScope="wrong" defaultRange="session"/>
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
                      {q.image && (
                        <div style={{margin:"6px 0 10px"}}>
                          <img src={q.image} alt="図表" style={{maxWidth:"100%",borderRadius:6,border:`1px solid ${C.border}`}} />
                        </div>
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
            <CycleProgressBox title="FE科目A" questions={ALL_QUESTIONS} history={allHistory} usedIds={usedIds} target={cycleTarget}/>
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
                  onClick={()=>{ if(window.confirm("直近のセッション一覧のみ削除します(累計成績は消えません)。よろしいですか？")){ localStorage.removeItem("fe_sessions"); setSavedSessions([]); } }}>
                  直近セッション一覧をクリア
                </button>
              </>;
            })()}
            {totalAnswered===0 && savedSessions.length===0 && <div style={{textAlign:"center",color:C.muted,fontSize:13,padding:"12px 0"}}>クイズに挑戦すると履歴が表示されます。</div>}
            <GptExportBox subject="A" questions={ALL_QUESTIONS}/>
            <BackupBox subject="A"/>
          </div>
        )}
      </div>
    </div>
  );
}
