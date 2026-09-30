import React, { useState, useCallback, useEffect } from "react";

// localStorage管理
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

const CATS = [
  "すべて","基礎理論","コンピュータシステム","ネットワーク","情報セキュリティ",
  "データベース","アルゴリズム・プログラミング","ソフトウェア・HI",
  "システム開発","プロジェクトマネジメント","サービスマネジメント・監査","経営・戦略・法務",
];

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "2進数→10進数", "q": "2進数1011011を10進数で表したものはどれか。", "choices": [{"label": "ア", "text": "89"}, {"label": "イ", "text": "91"}, {"label": "ウ", "text": "87"}, {"label": "エ", "text": "93"}], "correct": "イ", "hint": "正解理由: 1011011=64+0+16+8+0+2+1=91になる。間違いやすいポイント: 各桁の重み(64,32,16,8,4,2,1)を1つずらして数えてしまうミス。覚え方: 右端から1,2,4,8,16,32,64と2倍ずつ重みを振り、1が立つ桁だけ足す。"}, {"id": 2, "cat": "基礎理論", "topic": "2の補数", "q": "8ビットの2の補数表現11110110が表す10進整数はどれか。", "choices": [{"label": "ア", "text": "-10"}, {"label": "イ", "text": "10"}, {"label": "ウ", "text": "-9"}, {"label": "エ", "text": "246"}], "correct": "ア", "hint": "正解理由: 先頭ビットが1なので負数。反転すると00001001、+1すると00001010=10進の10になるため、値は-10になる。間違いやすいポイント: 反転して+1する手順を忘れ、そのまま2進数を10進数に変換して符号を付け忘れるミス。覚え方: 負数を判定したら「反転して+1」した結果が絶対値になる。"}, {"id": 3, "cat": "基礎理論", "topic": "論理演算(XOR)", "q": "2進数10101と01110のXORはどれか。", "choices": [{"label": "ア", "text": "10011"}, {"label": "イ", "text": "11111"}, {"label": "ウ", "text": "11011"}, {"label": "エ", "text": "00100"}], "correct": "ウ", "hint": "正解理由: 各桁を比較し、異なる桁は1、同じ桁は0にすると10101 XOR 01110 = 11011になる。間違いやすいポイント: ORと混同し、同じ桁も1にしてしまうミス。覚え方: XORは「違いを検出する」演算。同じなら0、違えば1。"}, {"id": 4, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "O(n log n)のアルゴリズムでデータ件数を4倍にしたとき、処理時間は概ねどのように変化するか。", "choices": [{"label": "ア", "text": "ほぼ変わらない"}, {"label": "イ", "text": "ほぼ8倍"}, {"label": "ウ", "text": "ほぼ4倍より少し大きい"}, {"label": "エ", "text": "ほぼ16倍"}], "correct": "ウ", "hint": "正解理由: (4n)log(4n) ÷ (n log n) を計算すると、log(4n)=log n + log4なので比率は4×(1+log4/log n)となり、4倍よりわずかに大きくなる。間違いやすいポイント: nが4倍だから単純に4倍、または2乗して16倍などと誤解しやすい。覚え方: O(n log n)は「n倍の効果」にlogの補正がわずかに乗ると考える。"}, {"id": 5, "cat": "基礎理論", "topic": "確率", "q": "赤玉3個、白玉2個の袋から同時に2個取り出すとき、2個とも赤玉である確率はどれか。", "choices": [{"label": "ア", "text": "2/5"}, {"label": "イ", "text": "1/5"}, {"label": "ウ", "text": "3/10"}, {"label": "エ", "text": "3/5"}], "correct": "ウ", "hint": "正解理由: 5個から2個を選ぶ組合せはC(5,2)=10通り、赤玉2個を選ぶ組合せはC(3,2)=3通りなので、確率は3/10になる。間違いやすいポイント: 連続して引く確率(3/5×2/4)の計算過程で分母分子を取り違えるミス。覚え方: 「両方とも赤」の確率は、赤だけの組合せ数÷全体の組合せ数で求める。"}, {"id": 6, "cat": "基礎理論", "topic": "数値表現(符号なし整数)", "q": "符号なし10ビット整数で表せる最大値はどれか。", "choices": [{"label": "ア", "text": "512"}, {"label": "イ", "text": "511"}, {"label": "ウ", "text": "1024"}, {"label": "エ", "text": "1023"}], "correct": "エ", "hint": "正解理由: 符号なしnビット整数は0〜2^n-1の範囲を表現でき、10ビットでは2^10-1=1023になる。間違いやすいポイント: 2^10=1024自体を最大値と誤答するミス。覚え方: 符号なしは「0から2^n-1まで」であり、2^nそのものは範囲に含まれない。"}, {"id": 7, "cat": "基礎理論", "topic": "基数変換(16進数)", "q": "16進数2Fを10進数で表したものはどれか。", "choices": [{"label": "ア", "text": "46"}, {"label": "イ", "text": "48"}, {"label": "ウ", "text": "47"}, {"label": "エ", "text": "45"}], "correct": "ウ", "hint": "正解理由: 16進の2Fは2×16+15=47になる(Fは10進で15)。間違いやすいポイント: Fを15ではなく16と勘違いする、または桁の重み(16)を掛け忘れるミス。覚え方: 16進2桁は「上位桁×16+下位桁の値」で10進に変換する。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "MIPS計算", "q": "クロック周波数3.0GHz、平均CPIが5のCPUの性能は約何MIPSか。", "choices": [{"label": "ア", "text": "1500"}, {"label": "イ", "text": "500"}, {"label": "ウ", "text": "300"}, {"label": "エ", "text": "600"}], "correct": "エ", "hint": "正解理由: 3.0GHz=3000MHzであり、MIPS=クロック周波数÷CPI=3000÷5=600MIPSになる。間違いやすいポイント: GHzをMHzに変換せずに計算する、またはクロックとCPIを掛けてしまうミス。覚え方: GHzは1000倍してMHzに直してからCPIで割る。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "パイプライン処理", "q": "5段パイプラインで30命令を理想的に実行するとき、必要クロック数はどれか。", "choices": [{"label": "ア", "text": "35"}, {"label": "イ", "text": "150"}, {"label": "ウ", "text": "30"}, {"label": "エ", "text": "34"}], "correct": "エ", "hint": "正解理由: 最初の1命令に5クロック、以降は1クロックずつ増えるため、5+(30-1)×1=34クロックになる。間違いやすいポイント: 段数×命令数(5×30=150)を計算し、パイプラインの重なりを考慮し忘れるミス。覚え方: パイプラインは「流れ作業」。最初の1個だけフルにかかり、あとは1クロックずつずれて完成する。"}, {"id": 10, "cat": "コンピュータシステム", "topic": "キャッシュ実効アクセス時間", "q": "キャッシュヒット率80%、キャッシュアクセス時間5ns、主記憶45nsの実効アクセス時間はどれか。", "choices": [{"label": "ア", "text": "9ns"}, {"label": "イ", "text": "50ns"}, {"label": "ウ", "text": "13ns"}, {"label": "エ", "text": "36ns"}], "correct": "ウ", "hint": "正解理由: 実効アクセス時間=0.8×5+0.2×45=4+9=13nsになる。間違いやすいポイント: ヒット率とミス率を掛ける相手を逆にしてしまうミス。覚え方: 「ヒットした確率×キャッシュの時間」+「外れた確率×主記憶の時間」の加重平均で計算する。"}, {"id": 11, "cat": "コンピュータシステム", "topic": "仮想記憶", "q": "ページフォルトが発生する条件として適切なものはどれか。", "choices": [{"label": "ア", "text": "参照ページが主記憶に存在しない"}, {"label": "イ", "text": "CPUが割込み禁止状態である"}, {"label": "ウ", "text": "キャッシュにデータが存在する"}, {"label": "エ", "text": "RAID1で片方のディスクが故障する"}], "correct": "ア", "hint": "正解理由: 仮想記憶方式において、参照しようとしたページが主記憶上に存在しない場合にページフォルト(ページ不在割込み)が発生する。間違いやすいポイント: キャッシュヒットやRAID故障など、無関係な用語と混同するミス。覚え方: ページフォルトは「必要なページが見つからない(fault=失敗)」ときに起きるイベント。"}, {"id": 12, "cat": "コンピュータシステム", "topic": "RAID", "q": "RAID5の特徴として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "冗長性を持たない"}, {"label": "イ", "text": "1台のディスクだけにパリティを保存する"}, {"label": "ウ", "text": "パリティを複数ディスクに分散する"}, {"label": "エ", "text": "全データを単純複製する"}], "correct": "ウ", "hint": "正解理由: RAID5は、パリティ情報を特定の1台に集中させず複数のディスクに分散して保存することで、冗長性と性能のバランスを取る方式である。間違いやすいポイント: RAID0(冗長性なし)、RAID1(単純複製)、RAID4(専用パリティディスク1台)と混同するミス。覚え方: RAID5は「パリティも分散させる」のが最大の特徴。"}, {"id": 13, "cat": "コンピュータシステム", "topic": "稼働率(直列)", "q": "稼働率0.98の装置を2台直列接続したときの全体稼働率に最も近いものはどれか。", "choices": [{"label": "ア", "text": "0.9996"}, {"label": "イ", "text": "0.9604"}, {"label": "ウ", "text": "0.9800"}, {"label": "エ", "text": "1.9600"}], "correct": "イ", "hint": "正解理由: 直列システムの稼働率は各装置の稼働率の積であり、0.98×0.98=0.9604になる。間違いやすいポイント: 並列と混同して1から引く計算をしてしまう、または足し算にしてしまうミス。覚え方: 直列は「全部そろって動く」ので単純に掛け算。"}, {"id": 14, "cat": "コンピュータシステム", "topic": "稼働率(並列)", "q": "稼働率0.8の装置2台を並列接続し、1台でも動けばよい。全体稼働率はどれか。", "choices": [{"label": "ア", "text": "1.60"}, {"label": "イ", "text": "0.96"}, {"label": "ウ", "text": "0.64"}, {"label": "エ", "text": "0.80"}], "correct": "イ", "hint": "正解理由: 並列システムは両方とも停止したときだけ止まるため、両方停止の確率(1-0.8)×(1-0.8)=0.04を1から引いて1-0.04=0.96になる。間違いやすいポイント: 直列と同じように単純に掛け算(0.8×0.8=0.64)してしまうミス。覚え方: 並列は「1から、両方止まる確率を引く」で計算する。"}, {"id": 15, "cat": "コンピュータシステム", "topic": "DMA", "q": "DMAの主な利点はどれか。", "choices": [{"label": "ア", "text": "IPアドレスを自動配布できる"}, {"label": "イ", "text": "CPUを介さず主記憶と入出力装置で転送できる"}, {"label": "ウ", "text": "CPUクロックが必ず2倍になる"}, {"label": "エ", "text": "主記憶容量が増える"}], "correct": "イ", "hint": "正解理由: DMA(Direct Memory Access)は、CPUを介さずに入出力装置と主記憶の間で直接データ転送を行う仕組みであり、CPUの負荷を軽減できる点が利点である。間違いやすいポイント: クロック速度やメモリ容量、IP配布など無関係な機能と混同するミス。覚え方: DMAの名前どおり「メモリへの直接アクセス」とそのまま覚える。"}, {"id": 16, "cat": "コンピュータシステム", "topic": "スプーリング", "q": "スプーリングが特に有効な装置はどれか。", "choices": [{"label": "ア", "text": "キャッシュメモリ"}, {"label": "イ", "text": "CPU"}, {"label": "ウ", "text": "プリンタ"}, {"label": "エ", "text": "ルータ"}], "correct": "ウ", "hint": "正解理由: スプーリングは、プリンタのような低速な入出力装置向けのデータを一時的にディスクへためておき、CPUと入出力装置の速度差を吸収する仕組みである。間違いやすいポイント: CPUやキャッシュメモリなど、高速な装置と混同するミス。覚え方: スプーリングの代表例は「プリンタへの印刷データの一時保存」。"}, {"id": 17, "cat": "データベース", "topic": "主キー", "q": "関係データベースで主キーに求められる性質として適切なものはどれか。", "choices": [{"label": "ア", "text": "行を一意に識別できる"}, {"label": "イ", "text": "必ず文字列である"}, {"label": "ウ", "text": "NULLを含んでもよい"}, {"label": "エ", "text": "重複してもよい"}], "correct": "ア", "hint": "正解理由: 主キーは表の各行を一意に識別するための列であり、値の重複やNULLは許されない。間違いやすいポイント: 「重複してもよい」「NULLを含んでもよい」など、主キーの制約と正反対の内容を選んでしまうミス。覚え方: 主キーは「一意性」と「NOT NULL」の2つの制約を必ず満たす。"}, {"id": 18, "cat": "データベース", "topic": "SQL(DISTINCT)", "q": "SQLで検索結果から重複する行を除く指定はどれか。", "choices": [{"label": "ア", "text": "ORDER BY"}, {"label": "イ", "text": "UNION ALL"}, {"label": "ウ", "text": "HAVING"}, {"label": "エ", "text": "DISTINCT"}], "correct": "エ", "hint": "正解理由: SELECT文にDISTINCTを指定すると、結果から重複する行を除いて取得できる。間違いやすいポイント: UNION ALL(重複を除かずに結合する)と混同し、意味を逆に覚えてしまうミス。覚え方: DISTINCTは「別々にする」＝重複を除く、UNION ALLは「全部まとめる」＝重複を残す。"}, {"id": 19, "cat": "データベース", "topic": "SQL(HAVING)", "q": "GROUP BYで集計した結果に条件を付ける句はどれか。", "choices": [{"label": "ア", "text": "SELECT"}, {"label": "イ", "text": "FROM"}, {"label": "ウ", "text": "HAVING"}, {"label": "エ", "text": "WHERE"}], "correct": "ウ", "hint": "正解理由: HAVING句はGROUP BYで集計した後の結果(集計値)に対して条件を指定する。間違いやすいポイント: WHEREと混同するが、WHEREは集計前の行に対する条件である点が異なる。覚え方: WHEREは「集計前の絞り込み」、HAVINGは「集計後の絞り込み」と対で覚える。"}, {"id": 20, "cat": "データベース", "topic": "SQL集合演算(INTERSECT)", "q": "二つのSELECT結果の共通部分を求める集合演算子はどれか。", "choices": [{"label": "ア", "text": "EXCEPT"}, {"label": "イ", "text": "UNION ALL"}, {"label": "ウ", "text": "INTERSECT"}, {"label": "エ", "text": "UNION"}], "correct": "ウ", "hint": "正解理由: INTERSECTは二つの問合せ結果の積集合(共通する行)を求める演算子である。間違いやすいポイント: UNION(和集合)やEXCEPT(差集合)と役割を混同するミス。覚え方: INTERSECT=「交差」なので、共通部分だけを取り出す。"}, {"id": 21, "cat": "データベース", "topic": "ロールフォワード", "q": "障害復旧でコミット済み更新をログから再現する処理はどれか。", "choices": [{"label": "ア", "text": "正規化"}, {"label": "イ", "text": "ロールフォワード"}, {"label": "ウ", "text": "ロールバック"}, {"label": "エ", "text": "デッドロック"}], "correct": "イ", "hint": "正解理由: ロールフォワードは、バックアップ以降のログを使ってコミット済みの更新を再現し、障害直前の状態に復元する処理である。間違いやすいポイント: ロールバック(未コミットの取り消し)と方向を逆に覚えてしまうミス。覚え方: ロールフォワードは「前に進めて復元」、ロールバックは「後ろに戻して取り消し」。"}, {"id": 22, "cat": "データベース", "topic": "正規化", "q": "第3正規形にする主な目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "更新時の不整合を減らす"}, {"label": "イ", "text": "主記憶を増やす"}, {"label": "ウ", "text": "暗号化を強くする"}, {"label": "エ", "text": "通信速度を上げる"}], "correct": "ア", "hint": "正解理由: 正規化(第3正規形化を含む)は、データの冗長性を排除し、更新時の不整合(更新異常)を防ぐことを主な目的とする。間違いやすいポイント: 暗号化や通信速度、メモリ容量など、正規化と無関係な効果と混同するミス。覚え方: 正規化は「重複と矛盾をなくす整理整頓」であり、速度向上や暗号化が目的ではない。"}, {"id": 23, "cat": "ネットワーク", "topic": "ARP", "q": "IPアドレスから同一LAN上のMACアドレスを求めるプロトコルはどれか。", "choices": [{"label": "ア", "text": "NTP"}, {"label": "イ", "text": "DHCP"}, {"label": "ウ", "text": "DNS"}, {"label": "エ", "text": "ARP"}], "correct": "エ", "hint": "正解理由: ARP(Address Resolution Protocol)は同一LAN内でIPアドレスからMACアドレスを解決するプロトコルである。間違いやすいポイント: DNS(名前解決)やDHCP(IP自動割当)と役割を混同するミス。覚え方: ARP=IPとMACの「橋渡し」。DNSは名前↔IP、DHCPはIPの配布と分けて覚える。"}, {"id": 24, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/28のIPv4ネットワークで使用可能なホスト数は最大いくつか。", "choices": [{"label": "ア", "text": "16"}, {"label": "イ", "text": "12"}, {"label": "ウ", "text": "14"}, {"label": "エ", "text": "30"}], "correct": "ウ", "hint": "正解理由: /28はホスト部が4ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^4-2=14個になる。間違いやすいポイント: 「2を引く」ことを忘れて2^4=16個と誤答しやすい。覚え方: ホストビット数を2で累乗してから必ず2を引く。"}, {"id": 25, "cat": "ネットワーク", "topic": "ネットワークアドレス", "q": "IPアドレス192.168.50.77/27が属するネットワークアドレスはどれか。", "choices": [{"label": "ア", "text": "192.168.50.32"}, {"label": "イ", "text": "192.168.50.64"}, {"label": "ウ", "text": "192.168.50.96"}, {"label": "エ", "text": "192.168.50.77"}], "correct": "イ", "hint": "正解理由: /27は32刻み(0,32,64,96)であり、77は64～95の範囲に含まれるため、ネットワークアドレスは192.168.50.64になる。間違いやすいポイント: 区切り幅を計算せずキリのよい数字を選んでしまうミス。覚え方: 区切り幅=256÷2^(ホストビット数)。/27なら256÷8=32刻み。"}, {"id": 26, "cat": "ネットワーク", "topic": "IPv4アドレスクラス", "q": "IPv4マルチキャストで使われる先頭オクテットの範囲はどれか。", "choices": [{"label": "ア", "text": "224〜239"}, {"label": "イ", "text": "192〜223"}, {"label": "ウ", "text": "128〜191"}, {"label": "エ", "text": "240〜255"}], "correct": "ア", "hint": "正解理由: クラスDに相当する224〜239がマルチキャスト用のアドレス範囲として使われる。間違いやすいポイント: クラスB・C(128〜223)や予約領域(240〜255)と混同するミス。覚え方: 224〜239はマルチキャスト、240〜255は将来使用のため予約と対で覚える。"}, {"id": 27, "cat": "ネットワーク", "topic": "ルーティング", "q": "異なるネットワーク間でパケットを中継するとき、ルータが主に参照するものはどれか。", "choices": [{"label": "ア", "text": "MACアドレス"}, {"label": "イ", "text": "ユーザID"}, {"label": "ウ", "text": "ファイル名"}, {"label": "エ", "text": "IPアドレス"}], "correct": "エ", "hint": "正解理由: ルータはネットワーク層(IP層)で動作し、宛先IPアドレスを参照して転送先(経路)を判断する。間違いやすいポイント: MACアドレスを参照するのはスイッチ(データリンク層)である点と混同するミス。覚え方: スイッチは「MACアドレスで同一LAN内を中継」、ルータは「IPアドレスで異なるネットワーク間を中継」。"}, {"id": 28, "cat": "ネットワーク", "topic": "メールプロトコル", "q": "電子メール送信に主に使うプロトコルはどれか。", "choices": [{"label": "ア", "text": "SMTP"}, {"label": "イ", "text": "SNMP"}, {"label": "ウ", "text": "IMAP"}, {"label": "エ", "text": "POP3"}], "correct": "ア", "hint": "正解理由: SMTP(Simple Mail Transfer Protocol)はメールを送信するためのプロトコルである。間違いやすいポイント: POP3やIMAP(メールを受信・取得するためのプロトコル)と役割を混同するミス。覚え方: SMTPは「送信(Send)」、POP3・IMAPは「受信(受け取り)」と役割を分けて覚える。"}, {"id": 29, "cat": "ネットワーク", "topic": "DHCP", "q": "DHCPの役割として適切なものはどれか。", "choices": [{"label": "ア", "text": "IPアドレスなどを自動設定する"}, {"label": "イ", "text": "時刻を同期する"}, {"label": "ウ", "text": "ドメイン名を解決する"}, {"label": "エ", "text": "MACアドレスを暗号化する"}], "correct": "ア", "hint": "正解理由: DHCP(Dynamic Host Configuration Protocol)は、端末にIPアドレスなどのネットワーク設定情報を自動的に割り当てるプロトコルである。間違いやすいポイント: DNS(名前解決)やNTP(時刻同期)と役割を混同するミス。覚え方: DHCPは「IPアドレスの自動配布係」。"}, {"id": 30, "cat": "情報セキュリティ", "topic": "SQLインジェクション対策", "q": "SQLインジェクション対策として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "通信を平文にする"}, {"label": "イ", "text": "DBのログを無効化する"}, {"label": "ウ", "text": "入力値をSQL文字列へ直接連結する"}, {"label": "エ", "text": "プレースホルダを使用する"}], "correct": "エ", "hint": "正解理由: プレースホルダ(パラメータ化クエリ)を使うことで、入力値がSQL文の一部として解釈されるのを防げる。間違いやすいポイント: 入力値を直接連結する方法こそがSQLインジェクションを招く原因である点を見落とすミス。覚え方: SQLインジェクション対策は「入力値とSQL文を混ぜない」がキーワード。"}, {"id": 31, "cat": "情報セキュリティ", "topic": "電子署名", "q": "デジタル署名で確認できるものはどれか。", "choices": [{"label": "ア", "text": "通信速度"}, {"label": "イ", "text": "送信者の真正性と改ざん有無"}, {"label": "ウ", "text": "可用性だけ"}, {"label": "エ", "text": "機密性だけ"}], "correct": "イ", "hint": "正解理由: 電子署名は、送信者本人であることの証明(真正性)と、データが途中で改ざんされていないこと(完全性)を確認するために使われる。間違いやすいポイント: 暗号化(秘匿性の確保)と役割を混同するミス。覚え方: 電子署名は「誰が送ったか」+「途中で変わっていないか」を確認する仕組み。"}, {"id": 32, "cat": "情報セキュリティ", "topic": "パスワード保護(ソルト)", "q": "パスワード保存でソルトを付与する主な目的はどれか。", "choices": [{"label": "ア", "text": "ログを削除する"}, {"label": "イ", "text": "同一パスワードでも異なるハッシュ値にしやすくする"}, {"label": "ウ", "text": "通信を高速化する"}, {"label": "エ", "text": "パスワードを復号可能にする"}], "correct": "イ", "hint": "正解理由: ソルト(ランダムな値)を付与してからハッシュ化することで、同じパスワードでも異なるハッシュ値になり、レインボーテーブル攻撃などへの耐性が高まる。間違いやすいポイント: ソルトによってパスワードが復号可能になると誤解するミス(ハッシュ化は依然として不可逆)。覚え方: ソルトは「同じ味付け(パスワード)でも、ひとつまみ加えて別の味(ハッシュ値)にする」イメージ。"}, {"id": 33, "cat": "情報セキュリティ", "topic": "3-2-1バックアップルール", "q": "3-2-1バックアップの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "3コピー、2種類の媒体、1コピーを別場所"}, {"label": "イ", "text": "3日ごとに2回、1台だけに保存"}, {"label": "ウ", "text": "3世代だけを同一ディスクに保存"}, {"label": "エ", "text": "3台の同一PCに保存"}], "correct": "ア", "hint": "正解理由: 3-2-1ルールは、データを3つ以上のコピーとして、2種類の異なる媒体に、うち1つはオフサイト(遠隔地)に保管する考え方である。間違いやすいポイント: 数字の意味(コピー数・媒体数・遠隔地数)を取り違えるミス。覚え方: 3=コピー数、2=媒体の種類数、1=遠隔地保管の数。"}, {"id": 34, "cat": "情報セキュリティ", "topic": "多要素認証", "q": "多要素認証の組合せとして適切なものはどれか。", "choices": [{"label": "ア", "text": "パスワード＋秘密の質問"}, {"label": "イ", "text": "パスワード＋PIN"}, {"label": "ウ", "text": "パスワード＋ワンタイムコード端末"}, {"label": "エ", "text": "二つの異なるパスワード"}], "correct": "ウ", "hint": "正解理由: 多要素認証は「知識要素(パスワード)」「所持要素(ワンタイムコード生成端末)」「生体要素」など異なる種類の要素を組み合わせる。パスワード+ワンタイムコード端末は知識要素と所持要素の組合せであり適切。間違いやすいポイント: パスワード+秘密の質問やPINなど、すべて「知識要素」同士の組合せは多要素にならない点を見落とすミス。覚え方: 多要素認証は「知識・所持・生体のうち異なる種類を組み合わせる」ことが条件。"}, {"id": 35, "cat": "情報セキュリティ", "topic": "公開鍵暗号方式", "q": "公開鍵暗号で受信者だけが復号できるようにする場合、送信者が暗号化に使う鍵はどれか。", "choices": [{"label": "ア", "text": "受信者の公開鍵"}, {"label": "イ", "text": "受信者の秘密鍵"}, {"label": "ウ", "text": "送信者の公開鍵"}, {"label": "エ", "text": "送信者の秘密鍵"}], "correct": "ア", "hint": "正解理由: 送信者は受信者の公開鍵で暗号化し、受信者だけが自分の秘密鍵で復号できる。これにより受信者だけが内容を読める(機密性の確保)。間違いやすいポイント: 電子署名(送信者の秘密鍵で署名)と暗号化(受信者の公開鍵で暗号化)の鍵の使い方を混同するミス。覚え方: 暗号化は「相手の公開鍵」、署名は「自分の秘密鍵」を使う。"}, {"id": 36, "cat": "情報セキュリティ", "topic": "ランサムウェア対策", "q": "ランサムウェア感染時の被害軽減として有効な対策はどれか。", "choices": [{"label": "ア", "text": "管理者権限を常用する"}, {"label": "イ", "text": "OS更新を止める"}, {"label": "ウ", "text": "バックアップを同じ端末だけに置く"}, {"label": "エ", "text": "オフラインまたは分離されたバックアップを持つ"}], "correct": "エ", "hint": "正解理由: バックアップをオフラインまたはネットワークから論理的に分離しておくことで、ランサムウェアがバックアップまで暗号化してしまう被害を防げる。間違いやすいポイント: 同じ端末やネットワーク上に常時接続したバックアップは、本体と一緒に感染・暗号化されるリスクがある点を見落とすミス。覚え方: バックアップは「本体と一緒に被害に遭わない場所」に置くのが鉄則。"}, {"id": 37, "cat": "ソフトウェア・開発", "topic": "テスト駆動開発(TDD)", "q": "TDDの基本的な進め方はどれか。", "choices": [{"label": "ア", "text": "テストを作らない"}, {"label": "イ", "text": "テストを書いてから実装する"}, {"label": "ウ", "text": "実装後に一度だけテストする"}, {"label": "エ", "text": "要件定義を省略する"}], "correct": "イ", "hint": "正解理由: TDD(テスト駆動開発)は、先に失敗するテストを書き、それを通すように実装を進める開発手法である。間違いやすいポイント: 「テストは実装後に書くもの」という一般的な順序と逆であることを見落とすミス。覚え方: TDDは「テスト(Test)が駆動(Driven)する開発」、つまりテストが先。"}, {"id": 38, "cat": "ソフトウェア・開発", "topic": "バージョン管理", "q": "Gitで変更内容をレビューしてからメインブランチへ統合する仕組みはどれか。", "choices": [{"label": "ア", "text": "キャッシュ"}, {"label": "イ", "text": "ページング"}, {"label": "ウ", "text": "プルリクエスト"}, {"label": "エ", "text": "スプーリング"}], "correct": "ウ", "hint": "正解理由: プルリクエスト(Pull Request、Merge Request)は、変更内容をレビューしてからメインブランチへ統合するための仕組みである。間違いやすいポイント: ページングやスプーリングなど、OSの用語と混同するミス。覚え方: プルリクエストは「取り込んで、の依頼」＝レビューを経て合流する仕組み。"}, {"id": 39, "cat": "ソフトウェア・開発", "topic": "テスト技法", "q": "ホワイトボックステストで主に着目するものはどれか。", "choices": [{"label": "ア", "text": "市場占有率"}, {"label": "イ", "text": "外部仕様だけ"}, {"label": "ウ", "text": "利用者アンケートだけ"}, {"label": "エ", "text": "内部の制御構造"}], "correct": "エ", "hint": "正解理由: ホワイトボックステストは、プログラムの内部構造(制御の流れや分岐条件など)に着目してテストケースを設計する手法である。間違いやすいポイント: ブラックボックステスト(外部仕様だけに着目する手法)と混同するミス。覚え方: ホワイト(白)=中身が見える=内部構造に着目、ブラック(黒)=中身が見えない=入出力だけに着目。"}, {"id": 40, "cat": "ソフトウェア・開発", "topic": "テスト技法", "q": "ブラックボックステストの代表的技法はどれか。", "choices": [{"label": "ア", "text": "同値分割"}, {"label": "イ", "text": "命令網羅"}, {"label": "ウ", "text": "パス網羅"}, {"label": "エ", "text": "分岐網羅"}], "correct": "ア", "hint": "正解理由: 同値分割は、入力を「同じ結果になるグループ」に分けてテストケースを設計する、ブラックボックステストの代表的技法である。間違いやすいポイント: 命令網羅・分岐網羅・パス網羅は、いずれも内部構造に着目するホワイトボックステストの技法である点を見落とすミス。覚え方: 「網羅」と付くものは内部構造(ホワイトボックス)、同値分割・境界値分析は外部仕様(ブラックボックス)。"}, {"id": 41, "cat": "ソフトウェア・開発", "topic": "DevOps", "q": "DevOpsの考え方として適切なものはどれか。", "choices": [{"label": "ア", "text": "自動化を避ける"}, {"label": "イ", "text": "テストを行わない"}, {"label": "ウ", "text": "開発と運用が協力して継続改善する"}, {"label": "エ", "text": "開発と運用を完全分離する"}], "correct": "ウ", "hint": "正解理由: DevOpsは、開発(Development)と運用(Operations)が密接に協力し、自動化や継続的な改善を通じて迅速で安定したリリースを目指す考え方・文化である。間違いやすいポイント: 開発と運用を分離する、自動化やテストをなくすなど、逆の内容と混同するミス。覚え方: DevOpsは名前の通り「開発(Dev)と運用(Ops)の融合」。"}, {"id": 42, "cat": "ソフトウェア・開発", "topic": "技術的負債", "q": "技術的負債の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "通信障害"}, {"label": "イ", "text": "CPU性能不足"}, {"label": "ウ", "text": "借入金そのもの"}, {"label": "エ", "text": "短期優先の妥協が将来の保守コストを増やす状態"}], "correct": "エ", "hint": "正解理由: 技術的負債は、短期的な効率を優先して設計や実装の質を妥協した結果、将来の修正・保守コストが増大する状態を指す比喩表現である。間違いやすいポイント: 「負債」という言葉から実際の借入金や財務上の負債と誤解するミス。覚え方: 技術的負債は「借金」と同じで、後で利息(保守コスト)がついて返ってくるとイメージする(あくまで比喩)。"}, {"id": 43, "cat": "プロジェクトマネジメント", "topic": "三点見積り(PERT)", "q": "PERTで楽観値4、最頻値7、悲観値16の期待値はどれか。", "choices": [{"label": "ア", "text": "9"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "7"}, {"label": "エ", "text": "10"}], "correct": "イ", "hint": "正解理由: PERT期待値=(楽観値+4×最頻値+悲観値)÷6=(4+4×7+16)/6=48/6=8になる。間違いやすいポイント: 4を掛ける対象を最頻値ではなく他の値にしてしまう計算ミス。覚え方: PERT期待値の式は「楽観+4×最頻+悲観を6で割る」という決まった形をそのまま覚える。"}, {"id": 44, "cat": "プロジェクトマネジメント", "topic": "WBS", "q": "WBSの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "作業を階層的に分解する"}, {"label": "イ", "text": "売上を予測する"}, {"label": "ウ", "text": "IPを配布する"}, {"label": "エ", "text": "暗号鍵を管理する"}], "correct": "ア", "hint": "正解理由: WBS(Work Breakdown Structure)は、プロジェクトの作業を階層的に分解し、管理しやすい単位にする手法である。間違いやすいポイント: 売上予測やIP配布など全く異なる分野の用語と混同するミス。覚え方: WBSは「作業(Work)を分解(Breakdown)した構造(Structure)」と名前の通りに覚える。"}, {"id": 45, "cat": "プロジェクトマネジメント", "topic": "クリティカルパス", "q": "クリティカルパスはどれか。", "choices": [{"label": "ア", "text": "費用が最小の経路"}, {"label": "イ", "text": "作業数が最少の経路"}, {"label": "ウ", "text": "最短時間の経路"}, {"label": "エ", "text": "遅れると全体納期に影響する経路"}], "correct": "エ", "hint": "正解理由: クリティカルパスは、余裕(フロート)がなく、遅延がそのままプロジェクト全体の納期遅延に直結する最長経路である。間違いやすいポイント: 「最短時間」や費用・作業数など、期間と無関係な観点と混同するミス。覚え方: クリティカルパスは「一番長い経路」かつ「一番遅れが許されない経路」。"}, {"id": 46, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法", "q": "ファンクションポイント法が主に基準とするものはどれか。", "choices": [{"label": "ア", "text": "ソース行数だけ"}, {"label": "イ", "text": "利用者から見た機能量"}, {"label": "ウ", "text": "CPUクロック"}, {"label": "エ", "text": "開発者人数だけ"}], "correct": "イ", "hint": "正解理由: ファンクションポイント法は、外部入出力や内部論理ファイルなど、利用者から見た機能量を基に開発規模を見積もる手法である。間違いやすいポイント: ソースコード行数(ステップ数法の考え方)と混同するミス。覚え方: ファンクションポイント法は「機能の数」を数える見積り手法、行数を数えるわけではない。"}, {"id": 47, "cat": "サービスマネジメント", "topic": "インシデント管理", "q": "インシデント管理の主目的はどれか。", "choices": [{"label": "ア", "text": "利益率を求める"}, {"label": "イ", "text": "サービスをできるだけ早く正常に戻す"}, {"label": "ウ", "text": "株価を予測する"}, {"label": "エ", "text": "新製品を設計する"}], "correct": "イ", "hint": "正解理由: インシデント管理は、発生した障害やサービス中断を可能な限り早く正常な状態へ復旧させることを主目的とする。間違いやすいポイント: 根本原因の恒久対応(問題管理の役割)と混同するミス。覚え方: インシデント管理は「今すぐ直す」、問題管理は「根本原因を追究する」と役割を分けて覚える。"}, {"id": 48, "cat": "サービスマネジメント", "topic": "SLA", "q": "SLAに定めるものはどれか。", "choices": [{"label": "ア", "text": "IPアドレス数"}, {"label": "イ", "text": "CPU命令数"}, {"label": "ウ", "text": "ソースコードの行数"}, {"label": "エ", "text": "サービス水準"}], "correct": "エ", "hint": "正解理由: SLA(Service Level Agreement)は、サービス提供者と利用者の間で、提供するサービスの水準(可用性や応答時間など)を取り決めた合意文書である。間違いやすいポイント: プログラムの内部的な技術詳細と混同するミス。覚え方: SLAは「サービスの品質についての約束事」を文書化したもの。"}, {"id": 49, "cat": "プロジェクトマネジメント", "topic": "リスク対応", "q": "リスク対応で、発生確率や影響度を小さくする対応はどれか。", "choices": [{"label": "ア", "text": "回避"}, {"label": "イ", "text": "受容"}, {"label": "ウ", "text": "軽減"}, {"label": "エ", "text": "移転"}], "correct": "ウ", "hint": "正解理由: 軽減(低減)は、リスクの発生確率や発生した場合の影響を小さくする対応である。間違いやすいポイント: 回避(リスクの原因自体をなくす)や移転(保険等で他者に転嫁する)と混同するミス。覚え方: 回避=そもそもやらない、軽減=確率や影響を減らす、移転=他者に肩代わりさせる、受容=そのまま受け入れる、と4分類を整理して覚える。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "限界利益", "q": "売上高900万円、変動費540万円の限界利益はいくらか。", "choices": [{"label": "ア", "text": "180万円"}, {"label": "イ", "text": "360万円"}, {"label": "ウ", "text": "540万円"}, {"label": "エ", "text": "900万円"}], "correct": "イ", "hint": "正解理由: 限界利益=売上高-変動費=900-540=360万円になる(固定費はまだ引かない)。間違いやすいポイント: 変動費や売上高をそのまま答えてしまう、または固定費まで差し引いた利益と混同するミス。覚え方: 限界利益=売上高-変動費という式をそのまま覚える。"}, {"id": 51, "cat": "経営・戦略・法務", "topic": "損益分岐点", "q": "固定費240万円、限界利益率30%のとき損益分岐点売上高はいくらか。", "choices": [{"label": "ア", "text": "72万円"}, {"label": "イ", "text": "800万円"}, {"label": "ウ", "text": "720万円"}, {"label": "エ", "text": "240万円"}], "correct": "イ", "hint": "正解理由: 損益分岐点売上高=固定費÷限界利益率=240÷0.3=800万円になる。間違いやすいポイント: 固定費×限界利益率(240×0.3=72万円)のように、割り算と掛け算を取り違えるミス。覚え方: 損益分岐点売上高は「固定費を、利益率で割り戻す」というイメージで覚える。"}, {"id": 52, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "SWOT分析で外部環境に当たる組合せはどれか。", "choices": [{"label": "ア", "text": "StrengthとWeakness"}, {"label": "イ", "text": "WeaknessとThreat"}, {"label": "ウ", "text": "StrengthとOpportunity"}, {"label": "エ", "text": "OpportunityとThreat"}], "correct": "エ", "hint": "正解理由: Opportunity(機会)とThreat(脅威)は自社を取り巻く外部環境の要因であり、Strength(強み)とWeakness(弱み)は自社の内部環境の要因である。間違いやすいポイント: 内部要因と外部要因の組合せを取り違えるミス。覚え方: S・Wは「自分の中」、O・Tは「外の世界」と2軸に分けて覚える。"}, {"id": 53, "cat": "経営・戦略・法務", "topic": "PPM", "q": "PPMで市場成長率が低く市場占有率が高い事業はどれか。", "choices": [{"label": "ア", "text": "金のなる木"}, {"label": "イ", "text": "負け犬"}, {"label": "ウ", "text": "花形"}, {"label": "エ", "text": "問題児"}], "correct": "ア", "hint": "正解理由: PPMでは市場成長率が低く市場占有率が高い事業を「金のなる木」と分類する。安定した収益源として位置づけられる。間違いやすいポイント: 「花形」(両方とも高い)と混同するミス。覚え方: 花形=両方高い、金のなる木=占有率だけ高い、問題児=成長率だけ高い、負け犬=両方低いと4象限を整理して覚える。"}, {"id": 54, "cat": "経営・戦略・法務", "topic": "バリューチェーン分析", "q": "バリューチェーン分析の目的はどれか。", "choices": [{"label": "ア", "text": "企業活動を分解して付加価値の源泉を分析する"}, {"label": "イ", "text": "IPを割り当てる"}, {"label": "ウ", "text": "CPU温度を測る"}, {"label": "エ", "text": "SQLを最適化する"}], "correct": "ア", "hint": "正解理由: バリューチェーン分析は、企業活動を主活動と支援活動に分解し、どこで付加価値(競争優位の源泉)が生まれているかを分析する手法である。間違いやすいポイント: ネットワークやDB、CPUなど全く異なる分野の用語と混同するミス。覚え方: バリューチェーンは「価値(Value)の連鎖(Chain)」で、価値がどこで生まれるかを見る手法。"}, {"id": 55, "cat": "経営・戦略・法務", "topic": "ROA", "q": "ROAが表すものはどれか。", "choices": [{"label": "ア", "text": "売上高に対する変動費の割合"}, {"label": "イ", "text": "自己資本に対する売上高"}, {"label": "ウ", "text": "流動資産に対する負債"}, {"label": "エ", "text": "総資産に対する利益の割合"}], "correct": "エ", "hint": "正解理由: ROA(Return on Assets、総資産利益率)は、企業が保有する総資産に対してどれだけ利益を生み出しているかを示す指標である。間違いやすいポイント: 売上高に対する変動費の割合(変動費率)など、別の財務指標と混同するミス。覚え方: ROAは「資産(Assets)に対する見返り(Return)の割合」。"}, {"id": 56, "cat": "経営・戦略・法務", "topic": "請負契約", "q": "請負契約の特徴はどれか。", "choices": [{"label": "ア", "text": "仕事の完成を目的とする"}, {"label": "イ", "text": "業務遂行だけを目的とし完成責任を負わない"}, {"label": "ウ", "text": "必ず無償である"}, {"label": "エ", "text": "成果物を作れない"}], "correct": "ア", "hint": "正解理由: 請負契約は、依頼された「仕事の完成」を目的とする契約であり、受注者は成果物を完成させる責任を負う。間違いやすいポイント: 準委任契約(業務の遂行自体を目的とし、完成責任を負わない)と混同するミス。覚え方: 請負は「完成させてなんぼ」、準委任は「業務をきちんと遂行すればよい」と対で覚える。"}, {"id": 57, "cat": "経営・戦略・法務", "topic": "BCP", "q": "BCPの目的はどれか。", "choices": [{"label": "ア", "text": "CPU性能を上げる"}, {"label": "イ", "text": "広告効果を測る"}, {"label": "ウ", "text": "災害時にも重要業務を継続・早期復旧する"}, {"label": "エ", "text": "DBを正規化する"}], "correct": "ウ", "hint": "正解理由: BCP(Business Continuity Plan、事業継続計画)は、災害や事故が発生した際にも重要業務を継続させ、または早期に復旧させるための計画である。間違いやすいポイント: 広告効果測定やDB正規化など、全く異なる分野の活動と混同するミス。覚え方: BCPは名前の通り「事業(Business)の継続(Continuity)のための計画(Plan)」。"}, {"id": 58, "cat": "経営・戦略・法務", "topic": "ERP", "q": "ERPの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "暗号鍵だけを管理する"}, {"label": "イ", "text": "顧客関係だけを管理する"}, {"label": "ウ", "text": "供給連鎖だけを管理する"}, {"label": "エ", "text": "企業全体の経営資源を統合管理する"}], "correct": "エ", "hint": "正解理由: ERP(Enterprise Resource Planning)は、企業全体のヒト・モノ・カネ・情報といった経営資源を統合的に管理する仕組み・システムである。間違いやすいポイント: CRM(顧客関係管理)やSCM(供給連鎖管理)など、経営資源の一部だけを管理する仕組みと混同するミス。覚え方: ERPは「企業の経営資源をまとめて管理する仕組み」、CRMやSCMはその一部分野に特化した仕組み。"}, {"id": 59, "cat": "経営・戦略・法務", "topic": "CRM", "q": "CRMの目的はどれか。", "choices": [{"label": "ア", "text": "DNSを管理する"}, {"label": "イ", "text": "顧客との関係を管理し価値向上を図る"}, {"label": "ウ", "text": "CPU負荷を管理する"}, {"label": "エ", "text": "仮想記憶を管理する"}], "correct": "イ", "hint": "正解理由: CRM(Customer Relationship Management)は、顧客との関係を管理し、顧客満足度や顧客生涯価値の向上を図る手法・システムである。間違いやすいポイント: CPUやDNS、仮想記憶など技術的な管理と混同するミス。覚え方: CRMは「顧客(Customer)との関係(Relationship)を管理する」とそのまま覚える。"}, {"id": 60, "cat": "経営・戦略・法務", "topic": "損益計算書", "q": "売上高から売上原価を差し引いた利益はどれか。", "choices": [{"label": "ア", "text": "売上総利益"}, {"label": "イ", "text": "経常利益"}, {"label": "ウ", "text": "当期純利益"}, {"label": "エ", "text": "営業利益"}], "correct": "ア", "hint": "正解理由: 売上総利益(粗利)は、売上高から売上原価を差し引いて求める、損益計算書の最初の利益段階である。間違いやすいポイント: さらに販管費を引いた営業利益など、後段の利益と混同するミス。覚え方: 売上総利益→営業利益→経常利益→当期純利益の順に、引く費用が増えていくと覚える。"}];

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
    // 問題内容が(id構成として)前回と変わっていないかを確認する。
    // 変わっていた場合、古い周回進捗・復習リストは今の問題内容と対応しなくなるため
    // 自動的にクリアする(生涯累計・セッション履歴は問題内容が変わっても意味を持つため維持する)。
    const currentSignature = ALL_QUESTIONS.length + ":" + ALL_QUESTIONS.map(q=>q.id).join(",");
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
  const available = ALL_QUESTIONS.filter(q=>{
    const catOk = cat==="すべて" || q.cat===cat;
    const notUsed = !usedIds.includes(q.id);
    return catOk && notUsed;
  });
  // 分子(available.length)と同じ母集団で揃えた分母。
  // 従来はここが常にALL_QUESTIONS.length(全100問)固定だったため、
  // 分野を絞ると「1問/100問中」のように分子分母の母集団が食い違って表示され、
  // 全体の周回進捗(今の周回で30問に解答済み等)と矛盾しているように見える不具合があった。
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
        // 以前は残り10問未満で無条件に「周回終了」と誤判定し、周回の途中(例: 96問中90問時点)
        // でも今の周回の成績を強制リセットしてしまうバグがあった。
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
    // 「今の周回(1周=全問題を重複なく1回ずつ)」の集計(allHistory/catStats)には含めない。
    // 含めてしまうと同じ問題が何度もカウントされ、分野の合計がその分野の
    // 実際の問題数を超えるなど、集計が壊れる原因になっていた。
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
          <div style={s.sub}>基本情報技術者 — 想定問題60問(IPA公開問題傾向を参考)</div>
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
                onClick={()=>{ if(window.confirm("使用済み問題をリセットして全問を出題可能にします。今回の周回成績もリセットされます。よろしいですか？")){ saveUsedIds([]); setAllHistory([]); setCatStats({}); store.clearCycle(); } }}>
                🔄 問題をリセット（全60問に戻す）
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
          </div>
        )}
      </div>
    </div>
  );
}
