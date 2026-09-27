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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "2進数→10進数", "q": "2進数101101を10進数で表したものはどれか。", "choices": [{"label": "ア", "text": "53"}, {"label": "イ", "text": "45"}, {"label": "ウ", "text": "47"}, {"label": "エ", "text": "43"}], "correct": "イ", "hint": "正解理由: 101101=32+0+8+4+0+1=45になる。間違いやすいポイント: 各桁の重み(32,16,8,4,2,1)を1つずらして数えてしまうミス。覚え方: 右端から1,2,4,8,16,32と2倍ずつ重みを振り、1が立つ桁だけ足す。"}, {"id": 2, "cat": "基礎理論", "topic": "論理演算(XOR)", "q": "2進数11010と10111のXORはどれか。", "choices": [{"label": "ア", "text": "11111"}, {"label": "イ", "text": "01001"}, {"label": "ウ", "text": "01101"}, {"label": "エ", "text": "11101"}], "correct": "ウ", "hint": "正解理由: 各桁を比較し、異なる桁は1、同じ桁は0にすると11010 XOR 10111 = 01101になる。間違いやすいポイント: ORと混同し、同じ桁も1にしてしまうミス。覚え方: XORは「違いを検出する」演算。同じなら0、違えば1。"}, {"id": 3, "cat": "基礎理論", "topic": "2の補数", "q": "8ビットの2の補数表現で-12を表したものはどれか。", "choices": [{"label": "ア", "text": "11110100"}, {"label": "イ", "text": "10001100"}, {"label": "ウ", "text": "00001100"}, {"label": "エ", "text": "11110011"}], "correct": "ア", "hint": "正解理由: 12(00001100)を反転すると11110011、それに1を加えると11110100になる。間違いやすいポイント: 反転しただけで+1を忘れる、または符号ビットだけ変えるミス。覚え方: 2の補数は「反転して+1」の2ステップを必ずセットで行う。"}, {"id": 4, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "計算量がO(n^2)の処理で、データ件数を3倍にしたとき処理時間はおおよそ何倍か。", "choices": [{"label": "ア", "text": "6倍"}, {"label": "イ", "text": "27倍"}, {"label": "ウ", "text": "9倍"}, {"label": "エ", "text": "3倍"}], "correct": "ウ", "hint": "正解理由: O(n^2)は件数の2乗に比例するため、件数が3倍になると処理時間は3^2=9倍になる。間違いやすいポイント: 件数の増加率とそのまま同じ倍率だと錯覚するミス。覚え方: O(n^2)の「2」は指数。掛け算ではなく累乗で考える。"}, {"id": 5, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "O(n log n)の処理で、nを2倍にしたときの処理時間として最も近い説明はどれか。", "choices": [{"label": "ア", "text": "約8倍"}, {"label": "イ", "text": "ほぼ同じ"}, {"label": "ウ", "text": "約2倍より少し大きい"}, {"label": "エ", "text": "約4倍"}], "correct": "ウ", "hint": "正解理由: (2n)log(2n) ÷ (n log n) を計算すると、log(2n)=log n + log2なので比率は2×(1+log2/log n)となり、2倍よりわずかに大きくなる。間違いやすいポイント: nが2倍だから単純に2倍、またはlogを見て「ほぼ変わらない」と誤解しやすい。覚え方: O(n log n)は「n倍の効果」にlogの補正がわずかに乗ると考える。"}, {"id": 6, "cat": "基礎理論", "topic": "論理演算(AND)", "q": "論理積ANDで、入力A=1、B=0のとき出力はどれか。", "choices": [{"label": "ア", "text": "不定"}, {"label": "イ", "text": "0"}, {"label": "ウ", "text": "1"}, {"label": "エ", "text": "Aと同じ"}], "correct": "イ", "hint": "正解理由: ANDは両方の入力が1のときだけ1を出力し、それ以外は0になる。A=1、B=0なので出力は0。間違いやすいポイント: ORと混同し、どちらかが1なら1にしてしまうミス。覚え方: ANDは「両方そろって初めて1」、ORは「どちらかあれば1」。"}, {"id": 7, "cat": "コンピュータシステム", "topic": "MIPS計算", "q": "クロック周波数1.8GHz、平均CPIが3のCPUは約何MIPSか。", "choices": [{"label": "ア", "text": "600"}, {"label": "イ", "text": "900"}, {"label": "ウ", "text": "300"}, {"label": "エ", "text": "1800"}], "correct": "ア", "hint": "正解理由: 1.8GHz=1800MHzであり、MIPS=クロック周波数÷CPI=1800÷3=600MIPSになる。間違いやすいポイント: GHzをMHzに変換せずに計算する、またはクロックとCPIを掛けてしまうミス。覚え方: GHzは1000倍してMHzに直してからCPIで割る。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "キャッシュ実効アクセス時間", "q": "キャッシュヒット率80%、キャッシュ10ns、主記憶70nsのとき実効アクセス時間はどれか。", "choices": [{"label": "ア", "text": "22ns"}, {"label": "イ", "text": "18ns"}, {"label": "ウ", "text": "64ns"}, {"label": "エ", "text": "58ns"}], "correct": "ア", "hint": "正解理由: 実効アクセス時間=0.8×10+0.2×70=8+14=22nsになる。間違いやすいポイント: ヒット率とミス率を掛ける相手を逆にしてしまうミス。覚え方: 「ヒットした確率×キャッシュの時間」+「外れた確率×主記憶の時間」の加重平均で計算する。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "パイプライン処理", "q": "6段パイプラインで15命令を理想的に実行するとき必要なクロック数はどれか。", "choices": [{"label": "ア", "text": "21"}, {"label": "イ", "text": "15"}, {"label": "ウ", "text": "90"}, {"label": "エ", "text": "20"}], "correct": "エ", "hint": "正解理由: 最初の1命令に6クロック、以降は1クロックずつ増えるため、6+(15-1)×1=20クロックになる。間違いやすいポイント: 段数×命令数(6×15=90)を計算し、パイプラインの重なりを考慮し忘れるミス。覚え方: パイプラインは「流れ作業」。最初の1個だけフルにかかり、あとは1クロックずつずれて完成する。"}, {"id": 10, "cat": "コンピュータシステム", "topic": "稼働率(直列)", "q": "稼働率0.95の装置2台を直列接続したときの稼働率はどれか。", "choices": [{"label": "ア", "text": "0.90"}, {"label": "イ", "text": "0.9025"}, {"label": "ウ", "text": "0.9975"}, {"label": "エ", "text": "0.95"}], "correct": "イ", "hint": "正解理由: 直列システムの稼働率は各装置の稼働率の積であり、0.95×0.95=0.9025になる。間違いやすいポイント: 並列と混同して1から引く計算をしてしまう、または足し算にしてしまうミス。覚え方: 直列は「全部そろって動く」ので単純に掛け算。"}, {"id": 11, "cat": "コンピュータシステム", "topic": "稼働率(並列)", "q": "稼働率0.9の装置2台を並列接続し、どちらか1台が動けばよい場合の稼働率はどれか。", "choices": [{"label": "ア", "text": "1.80"}, {"label": "イ", "text": "0.90"}, {"label": "ウ", "text": "0.99"}, {"label": "エ", "text": "0.81"}], "correct": "ウ", "hint": "正解理由: 並列システムは両方とも停止したときだけ止まるため、両方停止の確率(1-0.9)×(1-0.9)=0.01を1から引いて1-0.01=0.99になる。間違いやすいポイント: 直列と同じように単純に掛け算(0.9×0.9=0.81)してしまうミス。覚え方: 並列は「1から、両方止まる確率を引く」で計算する。"}, {"id": 12, "cat": "コンピュータシステム", "topic": "RAID", "q": "RAID1の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "ディスクを1台だけ高速化する"}, {"label": "イ", "text": "同じデータを複数ディスクに複製する"}, {"label": "ウ", "text": "複数ディスクへ分散書込みし冗長性を持たない"}, {"label": "エ", "text": "専用パリティディスクだけを使う"}], "correct": "イ", "hint": "正解理由: RAID1はミラーリングと呼ばれ、同じデータを複数のディスクに複製して保持する方式である。間違いやすいポイント: RAID0(分散書込み・冗長性なし)やRAID3/4(専用パリティディスク)と混同するミス。覚え方: RAID1は「1つのデータを1枚コピーして持つ」=ミラー(鏡)とセットで覚える。"}, {"id": 13, "cat": "コンピュータシステム", "topic": "記憶階層", "q": "主記憶より高速でCPUに近い記憶装置はどれか。", "choices": [{"label": "ア", "text": "磁気テープ"}, {"label": "イ", "text": "キャッシュメモリ"}, {"label": "ウ", "text": "NAS"}, {"label": "エ", "text": "光ディスク"}], "correct": "イ", "hint": "正解理由: キャッシュメモリはCPUと主記憶の速度差を埋めるため、CPUに近い位置に置かれる高速な記憶装置である。間違いやすいポイント: 磁気テープや光ディスクなど低速な補助記憶装置と混同するミス。覚え方: 記憶階層は「CPUに近いほど速く小容量、遠いほど遅く大容量」(レジスタ>キャッシュ>主記憶>補助記憶)。"}, {"id": 14, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/26のIPv4ネットワークで割り当て可能なホスト数の最大値はどれか。", "choices": [{"label": "ア", "text": "30"}, {"label": "イ", "text": "126"}, {"label": "ウ", "text": "64"}, {"label": "エ", "text": "62"}], "correct": "エ", "hint": "正解理由: /26はホスト部が6ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^6-2=62個になる。間違いやすいポイント: 「2を引く」ことを忘れて2^6=64個と誤答しやすい。覚え方: ホストビット数を2で累乗してから必ず2を引く。"}, {"id": 15, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/28のサブネットの区切り幅はどれか。", "choices": [{"label": "ア", "text": "32"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "28"}, {"label": "エ", "text": "16"}], "correct": "エ", "hint": "正解理由: /28はホスト部が4ビットであり、区切り幅は2^4=16になる。間違いやすいポイント: プレフィックス長の数字(28)や別の刻み幅と取り違えるミス。覚え方: 区切り幅=2^(32-プレフィックス長)。/28なら2^4=16。"}, {"id": 16, "cat": "ネットワーク", "topic": "ネットワークアドレス", "q": "192.168.1.70/27が属するネットワークアドレスはどれか。", "choices": [{"label": "ア", "text": "192.168.1.96"}, {"label": "イ", "text": "192.168.1.32"}, {"label": "ウ", "text": "192.168.1.70"}, {"label": "エ", "text": "192.168.1.64"}], "correct": "エ", "hint": "正解理由: /27は32刻み(0,32,64,96…)であり、70は64～95の範囲に含まれるため、ネットワークアドレスは192.168.1.64になる。間違いやすいポイント: 区切り幅を計算せずキリのよい数字を選んでしまうミス。覚え方: 区切り幅=256÷2^(ホストビット数)。/27なら256÷8=32刻み。"}, {"id": 17, "cat": "ネットワーク", "topic": "ARP", "q": "IPアドレスから同一LAN上のMACアドレスを求めるプロトコルはどれか。", "choices": [{"label": "ア", "text": "SMTP"}, {"label": "イ", "text": "DNS"}, {"label": "ウ", "text": "DHCP"}, {"label": "エ", "text": "ARP"}], "correct": "エ", "hint": "正解理由: ARP(Address Resolution Protocol)は同一LAN内でIPアドレスからMACアドレスを解決するプロトコルである。間違いやすいポイント: DNS(名前解決)やDHCP(IP自動割当)と役割を混同するミス。覚え方: ARP=IPとMACの「橋渡し」。DNSは名前↔IP、DHCPはIPの配布と分けて覚える。"}, {"id": 18, "cat": "ネットワーク", "topic": "DNS", "q": "ドメイン名からIPアドレスを求める仕組みはどれか。", "choices": [{"label": "ア", "text": "SNMP"}, {"label": "イ", "text": "ARP"}, {"label": "ウ", "text": "DNS"}, {"label": "エ", "text": "NTP"}], "correct": "ウ", "hint": "正解理由: DNS(Domain Name System)はドメイン名とIPアドレスを対応付ける名前解決の仕組みである。間違いやすいポイント: ARP(同一LAN内のMAC解決)やNTP(時刻同期)と役割を混同するミス。覚え方: DNSは「名前(ドメイン)から住所(IP)を調べる電話帳」とイメージする。"}, {"id": 19, "cat": "ネットワーク", "topic": "IPv4アドレスクラス", "q": "IPv4マルチキャストに使われる先頭オクテットの範囲はどれか。", "choices": [{"label": "ア", "text": "192〜223"}, {"label": "イ", "text": "240〜255"}, {"label": "ウ", "text": "224〜239"}, {"label": "エ", "text": "127〜191"}], "correct": "ウ", "hint": "正解理由: クラスDに相当する224〜239がマルチキャスト用のアドレス範囲として使われる。間違いやすいポイント: クラスA〜Cの範囲(0〜223)や予約領域(240〜255)と混同するミス。覚え方: 224〜239はマルチキャスト、240〜255は将来使用のため予約と対で覚える。"}, {"id": 20, "cat": "ネットワーク", "topic": "TCP/UDP", "q": "TCPの特徴として適切なものはどれか。", "choices": [{"label": "ア", "text": "再送制御を行わない"}, {"label": "イ", "text": "コネクション型で信頼性を確保する"}, {"label": "ウ", "text": "IPアドレスを自動配布する"}, {"label": "エ", "text": "名前解決を行う"}], "correct": "イ", "hint": "正解理由: TCPはコネクション型のプロトコルで、順序制御や再送制御によって信頼性の高い通信を実現する。間違いやすいポイント: 再送制御なしはUDPの特徴であり、TCPと逆に覚えてしまうミス。覚え方: TCPは「確実だが重い」、UDPは「速いが保証なし」と対で覚える。"}, {"id": 21, "cat": "データベース", "topic": "SQL(HAVING)", "q": "GROUP BYで集計した後の結果に条件を指定する句はどれか。", "choices": [{"label": "ア", "text": "ORDER BY"}, {"label": "イ", "text": "HAVING"}, {"label": "ウ", "text": "WHERE"}, {"label": "エ", "text": "FROM"}], "correct": "イ", "hint": "正解理由: HAVING句はGROUP BYで集計した後の結果(集計値)に対して条件を指定する。間違いやすいポイント: WHEREと混同するが、WHEREは集計前の行に対する条件である点が異なる。覚え方: WHEREは「集計前の絞り込み」、HAVINGは「集計後の絞り込み」と対で覚える。"}, {"id": 22, "cat": "データベース", "topic": "SQL集合演算(UNION)", "q": "二つのSELECT結果の和集合を、重複を除いて返す演算子はどれか。", "choices": [{"label": "ア", "text": "UNION"}, {"label": "イ", "text": "JOIN"}, {"label": "ウ", "text": "INTERSECT"}, {"label": "エ", "text": "EXCEPT"}], "correct": "ア", "hint": "正解理由: UNIONは二つの問合せ結果を結合し、重複行を除いた和集合を返す演算子である。間違いやすいポイント: INTERSECT(積集合)やEXCEPT(差集合)と役割を混同するミス。覚え方: UNION=「和集合」、INTERSECT=「交差」、EXCEPT=「差」とセットで覚える。"}, {"id": 23, "cat": "データベース", "topic": "SQL集合演算(INTERSECT)", "q": "二つのSELECT結果の共通部分だけを返す演算子はどれか。", "choices": [{"label": "ア", "text": "EXCEPT"}, {"label": "イ", "text": "DISTINCT"}, {"label": "ウ", "text": "INTERSECT"}, {"label": "エ", "text": "UNION"}], "correct": "ウ", "hint": "正解理由: INTERSECTは二つの問合せ結果の積集合(共通する行)を求める演算子である。間違いやすいポイント: UNION(和集合)やEXCEPT(差集合)と役割を混同するミス。覚え方: INTERSECT=「交差」なので、共通部分だけを取り出す。"}, {"id": 24, "cat": "データベース", "topic": "ロールフォワード", "q": "バックアップ以降のコミット済み更新をログから再現する処理はどれか。", "choices": [{"label": "ア", "text": "正規化"}, {"label": "イ", "text": "ロールバック"}, {"label": "ウ", "text": "デッドロック"}, {"label": "エ", "text": "ロールフォワード"}], "correct": "エ", "hint": "正解理由: ロールフォワードは、バックアップ以降のログを使ってコミット済みの更新を再現し、障害直前の状態に復元する処理である。間違いやすいポイント: ロールバック(未コミットの取り消し)と方向を逆に覚えてしまうミス。覚え方: ロールフォワードは「前に進めて復元」、ロールバックは「後ろに戻して取り消し」。"}, {"id": 25, "cat": "データベース", "topic": "結合(INNER JOIN)", "q": "INNER JOINの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "結合条件に一致する行だけを返す"}, {"label": "イ", "text": "二つの表を物理的に連結する"}, {"label": "ウ", "text": "重複列を自動削除する"}, {"label": "エ", "text": "片方の表の全行を必ず返す"}], "correct": "ア", "hint": "正解理由: INNER JOIN(内部結合)は、結合条件に一致する行だけを両方の表から取得する。間違いやすいポイント: OUTER JOIN(片方の表の全行を保持する)と混同するミス。覚え方: INNER JOINは「両方に共通するものだけ」、OUTER JOINは「片方は全部残す」。"}, {"id": 26, "cat": "データベース", "topic": "正規化", "q": "第1正規形の主な条件はどれか。", "choices": [{"label": "ア", "text": "繰返し項目をなくし各属性を原子的にする"}, {"label": "イ", "text": "部分関数従属をなくす"}, {"label": "ウ", "text": "推移的関数従属をなくす"}, {"label": "エ", "text": "主キーをなくす"}], "correct": "ア", "hint": "正解理由: 第1正規形は、繰返し項目(グループ)をなくし、各属性の値を単一の値(原子値)にすることが条件である。間違いやすいポイント: 部分関数従属の排除(第2正規形)や推移的関数従属の排除(第3正規形)と混同するミス。覚え方: 1NF=繰返しをなくす、2NF=部分関数従属をなくす、3NF=推移的関数従属をなくす、と段階を分けて覚える。"}, {"id": 27, "cat": "アルゴリズム・プログラミング", "topic": "探索アルゴリズム", "q": "昇順に整列済みのデータから高速に探索する方法として適切なものはどれか。", "choices": [{"label": "ア", "text": "二分探索"}, {"label": "イ", "text": "線形探索"}, {"label": "ウ", "text": "選択ソート"}, {"label": "エ", "text": "バブルソート"}], "correct": "ア", "hint": "正解理由: 二分探索は整列済みデータに対してO(log n)で探索でき、線形探索のO(n)より効率がよい。間違いやすいポイント: ソートアルゴリズム(選択ソート・バブルソート)を探索方法と混同するミス。覚え方: 「探索」と名がつくのは線形探索と二分探索だけ。整列済みなら二分探索一択。"}, {"id": 28, "cat": "アルゴリズム・プログラミング", "topic": "選択ソート", "q": "配列[5,2,4,1]を選択ソートで昇順にする。最初の交換後はどれか。", "choices": [{"label": "ア", "text": "[1,2,4,5]"}, {"label": "イ", "text": "[5,1,2,4]"}, {"label": "ウ", "text": "[1,5,4,2]"}, {"label": "エ", "text": "[2,5,4,1]"}], "correct": "ア", "hint": "正解理由: 選択ソートは未整列部分から最小値を探し、先頭要素と交換する。[5,2,4,1]の最小値は1であり、先頭の5と交換すると[1,2,4,5]になる。間違いやすいポイント: 1回の交換で完全にソートされたことと、隣接swapを繰り返すバブルソートを混同するミス。覚え方: 選択ソートは「1回につき1つだけ確定位置に置く」を繰り返す。"}, {"id": 29, "cat": "アルゴリズム・プログラミング", "topic": "選択ソート", "q": "配列[4,1,3,2]を選択ソートで昇順にする。最初の交換後はどれか。", "choices": [{"label": "ア", "text": "[4,1,3,2]"}, {"label": "イ", "text": "[4,1,2,3]"}, {"label": "ウ", "text": "[1,2,3,4]"}, {"label": "エ", "text": "[1,4,3,2]"}], "correct": "エ", "hint": "正解理由: 選択ソートは未整列部分から最小値を探し、先頭要素と交換する。[4,1,3,2]の最小値は1であり、先頭の4と交換すると[1,4,3,2]になる。間違いやすいポイント: 1回の交換で完全にソートされると思い込むミス。覚え方: 選択ソートは「1回につき1つだけ確定位置に置く」を繰り返す。"}, {"id": 30, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数", "q": "関数f(n)を、n=0なら0、それ以外はn+f(n-1)とする。f(5)はどれか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "25"}, {"label": "ウ", "text": "15"}, {"label": "エ", "text": "20"}], "correct": "ウ", "hint": "正解理由: f(5)=5+f(4)=5+4+f(3)=…と展開すると5+4+3+2+1+0=15になる。間違いやすいポイント: f(0)=0を忘れて1から数え始めてしまう、または途中で展開を打ち切るミス。覚え方: 「nが0のとき」という基底条件を必ず最初に確認し、そこから逆算して積み上げる。"}, {"id": 31, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表(線形探索法)", "q": "h(k)=k mod 5、線形探索法を使う。キー7,12,17を順に格納したとき17の格納位置はどれか。", "choices": [{"label": "ア", "text": "4"}, {"label": "イ", "text": "3"}, {"label": "ウ", "text": "0"}, {"label": "エ", "text": "2"}], "correct": "ア", "hint": "正解理由: 7,12,17はいずれもmod5=2になる。7が2番地、12は衝突して3番地、17も衝突し2・3番地が使用済みのため4番地に格納される。間違いやすいポイント: 最初に計算したハッシュ値(2)をそのまま答えてしまうミス。覚え方: 衝突したら「次の番地が空くまで」1つずつ進める。"}, {"id": 32, "cat": "アルゴリズム・プログラミング", "topic": "スタック", "q": "スタックのデータ取出し方式はどれか。", "choices": [{"label": "ア", "text": "優先度順"}, {"label": "イ", "text": "LIFO"}, {"label": "ウ", "text": "FIFO"}, {"label": "エ", "text": "ランダム"}], "correct": "イ", "hint": "正解理由: スタックはLIFO(Last In First Out、後入れ先出し)の構造であり、最後に入れたものを最初に取り出す。間違いやすいポイント: キュー(FIFO、先入れ先出し)と混同するミス。覚え方: スタックは「積み重ねた皿」。上(最後に置いたもの)から取る。"}, {"id": 33, "cat": "アルゴリズム・プログラミング", "topic": "キュー", "q": "キューのデータ取出し方式はどれか。", "choices": [{"label": "ア", "text": "常に最小値"}, {"label": "イ", "text": "FIFO"}, {"label": "ウ", "text": "LIFO"}, {"label": "エ", "text": "常に最大値"}], "correct": "イ", "hint": "正解理由: キューはFIFO(First In First Out、先入れ先出し)の構造であり、最初に入れたものを最初に取り出す。間違いやすいポイント: スタック(LIFO、後入れ先出し)と混同するミス。覚え方: キューは「行列」。並んだ順に処理される(先に来た人が先に処理される)。"}, {"id": 34, "cat": "ソフトウェア・開発", "topic": "バージョン管理", "q": "Gitで変更内容をレビューしてからメインブランチへ統合する仕組みは一般に何と呼ばれるか。", "choices": [{"label": "ア", "text": "プルリクエスト"}, {"label": "イ", "text": "スワップ"}, {"label": "ウ", "text": "チェックポイント"}, {"label": "エ", "text": "ロールバック"}], "correct": "ア", "hint": "正解理由: プルリクエスト(Pull Request、Merge Request)は、変更内容をレビューしてからメインブランチへ統合するための仕組みである。間違いやすいポイント: ロールバックやチェックポイントなど、開発フローと無関係なDB/OS用語と混同するミス。覚え方: プルリクエストは「取り込んで、の依頼」＝レビューを経て合流する仕組み。"}, {"id": 35, "cat": "ソフトウェア・開発", "topic": "技術的負債", "q": "短期優先の実装で将来の保守コストが増えていく状態はどれか。", "choices": [{"label": "ア", "text": "技術的負債"}, {"label": "イ", "text": "機会損失"}, {"label": "ウ", "text": "正規化"}, {"label": "エ", "text": "冗長化"}], "correct": "ア", "hint": "正解理由: 技術的負債は、短期的な効率を優先して設計や実装の質を妥協した結果、将来の修正・保守コストが増大する状態を指す比喩表現である。間違いやすいポイント: 機会損失や冗長化など無関係な経営・システム用語と混同するミス。覚え方: 技術的負債は「借金」と同じで、後で利息(保守コスト)がついて返ってくるとイメージする。"}, {"id": 36, "cat": "ソフトウェア・開発", "topic": "テスト工程", "q": "単体テストの主な対象はどれか。", "choices": [{"label": "ア", "text": "システム全体"}, {"label": "イ", "text": "個々のモジュールや関数"}, {"label": "ウ", "text": "ネットワークだけ"}, {"label": "エ", "text": "利用者の業務全体"}], "correct": "イ", "hint": "正解理由: 単体テストは、プログラムを構成する個々のモジュールや関数を最小単位として検証するテストである。間違いやすいポイント: 結合テストやシステムテスト(複数モジュールやシステム全体を対象)と混同するミス。覚え方: 単体→結合→システム→運用テストの順に対象範囲が広がっていくと覚える。"}, {"id": 37, "cat": "ソフトウェア・開発", "topic": "要件定義", "q": "要件定義で主に明確化するものはどれか。", "choices": [{"label": "ア", "text": "CPU内部の配線"}, {"label": "イ", "text": "ソースコードの全行"}, {"label": "ウ", "text": "運用後の障害件数"}, {"label": "エ", "text": "利用者が必要とする機能や条件"}], "correct": "エ", "hint": "正解理由: 要件定義は、利用者(発注者)が何を必要としているか、システムに求める機能や条件を明確にする工程である。間違いやすいポイント: 設計や実装フェーズの内容(内部構造やコード)と混同するミス。覚え方: 要件定義は「何を作るか」を決める工程、設計以降は「どう作るか」を決める工程。"}, {"id": 38, "cat": "プロジェクトマネジメント", "topic": "三点見積り(PERT)", "q": "楽観値2日、最頻値5日、悲観値8日の三点見積りの期待値はどれか。", "choices": [{"label": "ア", "text": "7日"}, {"label": "イ", "text": "4日"}, {"label": "ウ", "text": "5日"}, {"label": "エ", "text": "6日"}], "correct": "ウ", "hint": "正解理由: PERT期待値=(楽観値+4×最頻値+悲観値)÷6=(2+4×5+8)/6=30/6=5日になる。間違いやすいポイント: 4を掛ける対象を最頻値ではなく他の値にしてしまう計算ミス。覚え方: PERT期待値の式は「楽観+4×最頻+悲観を6で割る」という決まった形をそのまま覚える。"}, {"id": 39, "cat": "プロジェクトマネジメント", "topic": "プロジェクト工期(クリティカルパス)", "q": "作業A=3日とB=5日を同時開始し、両方終了後にC=4日を行う。最短所要日数はどれか。", "choices": [{"label": "ア", "text": "7日"}, {"label": "イ", "text": "12日"}, {"label": "ウ", "text": "8日"}, {"label": "エ", "text": "9日"}], "correct": "エ", "hint": "正解理由: AとBは並行に進められるため、両方が終わるのは長い方のB(5日)の時点。そこからCの4日を加えると5+4=9日になる。間違いやすいポイント: A+B+C(3+5+4=12)と直列に足してしまうミス。覚え方: 並行作業は「長い方だけ」を採用し、直列作業は「そのまま足す」。"}, {"id": 40, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法", "q": "外部入力・出力・ファイル数など機能量から規模を見積もる手法はどれか。", "choices": [{"label": "ア", "text": "回帰テスト"}, {"label": "イ", "text": "PERT"}, {"label": "ウ", "text": "CPM"}, {"label": "エ", "text": "ファンクションポイント法"}], "correct": "エ", "hint": "正解理由: ファンクションポイント法は、外部入出力や内部論理ファイルなどの機能量を基に開発規模を見積もる手法である。間違いやすいポイント: PERT(三点見積り)やCPM(クリティカルパス法)と混同するミス。覚え方: ファンクションポイント法は「機能の数」を数える見積り手法。"}, {"id": 41, "cat": "プロジェクトマネジメント", "topic": "WBS", "q": "WBSの目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "作業を階層的に分解して管理しやすくする"}, {"label": "イ", "text": "ネットワーク帯域を分割する"}, {"label": "ウ", "text": "DBを正規化する"}, {"label": "エ", "text": "暗号鍵を配布する"}], "correct": "ア", "hint": "正解理由: WBS(Work Breakdown Structure)は、プロジェクトの作業を階層的に分解し、管理しやすい単位にする手法である。間違いやすいポイント: ネットワークやDB、暗号など全く異なる分野の用語と混同するミス。覚え方: WBSは「作業(Work)を分解(Breakdown)した構造(Structure)」と名前の通りに覚える。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "クリティカルパス", "q": "クリティカルパスの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "最も費用が高い作業の経路"}, {"label": "イ", "text": "品質レビュー専用の経路"}, {"label": "ウ", "text": "遅延すると全体納期に影響する最長経路"}, {"label": "エ", "text": "最も人数が多い経路"}], "correct": "ウ", "hint": "正解理由: クリティカルパスは、余裕(フロート)がなく、遅延がそのままプロジェクト全体の納期遅延に直結する最長経路である。間違いやすいポイント: 費用や人数など、期間と無関係な観点と混同するミス。覚え方: クリティカルパスは「一番長い経路」かつ「一番遅れが許されない経路」。"}, {"id": 43, "cat": "サービスマネジメント", "topic": "サービスデスク", "q": "サービスデスクの主な役割として適切なものはどれか。", "choices": [{"label": "ア", "text": "DBを正規化する"}, {"label": "イ", "text": "財務諸表を作る"}, {"label": "ウ", "text": "利用者からの問合せや障害連絡の窓口"}, {"label": "エ", "text": "CPU性能を設計する"}], "correct": "ウ", "hint": "正解理由: サービスデスクは、利用者からの問合せや障害連絡を受け付ける単一窓口(シングルポイントオブコンタクト)としての役割を担う。間違いやすいポイント: 設計や開発、経理など他部門の業務と混同するミス。覚え方: サービスデスクは「利用者と情報システム部門をつなぐ受付窓口」。"}, {"id": 44, "cat": "サービスマネジメント", "topic": "インシデント管理", "q": "インシデント管理の主目的はどれか。", "choices": [{"label": "ア", "text": "原因を必ず恒久除去する"}, {"label": "イ", "text": "正常なサービスをできるだけ早く回復する"}, {"label": "ウ", "text": "契約を更新する"}, {"label": "エ", "text": "新機能を設計する"}], "correct": "イ", "hint": "正解理由: インシデント管理は、発生した障害やサービス中断を可能な限り早く正常な状態へ復旧させることを主目的とする。間違いやすいポイント: 根本原因の恒久対応(問題管理の役割)と混同するミス。覚え方: インシデント管理は「今すぐ直す」、問題管理は「根本原因を追究する」と役割を分けて覚える。"}, {"id": 45, "cat": "情報セキュリティ", "topic": "パスワード保護", "q": "パスワード保存方法として適切なものはどれか。", "choices": [{"label": "ア", "text": "平文保存"}, {"label": "イ", "text": "Base64だけで変換"}, {"label": "ウ", "text": "ハッシュ化して保存"}, {"label": "エ", "text": "圧縮して保存"}], "correct": "ウ", "hint": "正解理由: ハッシュ化は一方向性の変換であり、ハッシュ値から元のパスワードを復元することが計算上極めて困難なため、パスワード保存に適する。間違いやすいポイント: Base64は単なる符号化(誰でも元に戻せる)であり保護にならない点を見落とすミス。覚え方: 平文論外、Base64は暗号化ではない、ハッシュ化が基本。"}, {"id": 46, "cat": "情報セキュリティ", "topic": "3-2-1バックアップルール", "q": "ランサムウェア対策の3-2-1ルールとして適切なものはどれか。", "choices": [{"label": "ア", "text": "3台の同一媒体だけに保存"}, {"label": "イ", "text": "3人で2回確認し1台保存"}, {"label": "ウ", "text": "3コピー、2種類の媒体、1コピーを別場所"}, {"label": "エ", "text": "3日ごと、2回、1年保存"}], "correct": "ウ", "hint": "正解理由: 3-2-1ルールは、データを3つ以上のコピーとして、2種類の異なる媒体に、うち1つはオフサイト(遠隔地)に保管する考え方である。間違いやすいポイント: 数字の意味(コピー数・媒体数・遠隔地数)を取り違えるミス。覚え方: 3=コピー数、2=媒体の種類数、1=遠隔地保管の数。"}, {"id": 47, "cat": "情報セキュリティ", "topic": "公開鍵暗号方式", "q": "公開鍵暗号方式で、受信者だけが読めるよう送信者が暗号化するとき通常使う鍵はどれか。", "choices": [{"label": "ア", "text": "共通鍵を公開する"}, {"label": "イ", "text": "送信者の秘密鍵"}, {"label": "ウ", "text": "受信者の秘密鍵"}, {"label": "エ", "text": "受信者の公開鍵"}], "correct": "エ", "hint": "正解理由: 送信者は受信者の公開鍵で暗号化し、受信者だけが自分の秘密鍵で復号できる。これにより受信者だけが内容を読める。間違いやすいポイント: 電子署名(送信者の秘密鍵で署名)と暗号化(受信者の公開鍵で暗号化)の鍵の使い方を混同するミス。覚え方: 暗号化は「相手の公開鍵」、署名は「自分の秘密鍵」を使う。"}, {"id": 48, "cat": "情報セキュリティ", "topic": "電子署名", "q": "デジタル署名で主に確認できるものはどれか。", "choices": [{"label": "ア", "text": "空き容量"}, {"label": "イ", "text": "通信速度"}, {"label": "ウ", "text": "機密性だけ"}, {"label": "エ", "text": "送信者の真正性と改ざん有無"}], "correct": "エ", "hint": "正解理由: 電子署名は、送信者本人であることの証明(真正性)と、データが途中で改ざんされていないこと(完全性)を確認するために使われる。間違いやすいポイント: 暗号化(秘匿性の確保)と役割を混同するミス。覚え方: 電子署名は「誰が送ったか」+「途中で変わっていないか」を確認する仕組み。"}, {"id": 49, "cat": "情報セキュリティ", "topic": "SQLインジェクション対策", "q": "SQLインジェクション対策として有効なものはどれか。", "choices": [{"label": "ア", "text": "プレースホルダを用いたパラメータ化"}, {"label": "イ", "text": "HTTPを使わない"}, {"label": "ウ", "text": "パスワードを短くする"}, {"label": "エ", "text": "入力値をそのままSQL文へ連結する"}], "correct": "ア", "hint": "正解理由: パラメータ化クエリ(プレースホルダ)を使うことで、入力値がSQL文の一部として解釈されるのを防げる。間違いやすいポイント: 入力値を直接連結する方法こそがSQLインジェクションを招く原因である点を見落とすミス。覚え方: SQLインジェクション対策は「入力値とSQL文を混ぜない」がキーワード。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "限界利益", "q": "売上高から変動費を差し引いたものはどれか。", "choices": [{"label": "ア", "text": "限界利益"}, {"label": "イ", "text": "純利益"}, {"label": "ウ", "text": "経常利益"}, {"label": "エ", "text": "営業利益"}], "correct": "ア", "hint": "正解理由: 限界利益は売上高から変動費のみを差し引いたものであり、固定費を回収する前の利益指標である。間違いやすいポイント: 営業利益(さらに固定費や販管費を引いた後の利益)と混同するミス。覚え方: 限界利益=売上高-変動費(固定費はまだ引かない)。"}, {"id": 51, "cat": "経営・戦略・法務", "topic": "損益分岐点", "q": "固定費300万円、1個当たり販売価格5000円、変動費3000円のとき損益分岐点販売数量はどれか。", "choices": [{"label": "ア", "text": "1000個"}, {"label": "イ", "text": "3000個"}, {"label": "ウ", "text": "1500個"}, {"label": "エ", "text": "600個"}], "correct": "ウ", "hint": "正解理由: 1個あたり限界利益=5000-3000=2000円。損益分岐点数量=固定費÷1個あたり限界利益=3,000,000÷2,000=1,500個になる。間違いやすいポイント: 変動費を引かずに固定費÷販売価格で計算してしまうミス。覚え方: 損益分岐点数量=固定費÷(価格-変動費)という式をそのまま覚える。"}, {"id": 52, "cat": "経営・戦略・法務", "topic": "PPM", "q": "市場成長率と相対的市場占有率で事業を分類する手法はどれか。", "choices": [{"label": "ア", "text": "PPM"}, {"label": "イ", "text": "E-R図"}, {"label": "ウ", "text": "SWOT"}, {"label": "エ", "text": "PERT"}], "correct": "ア", "hint": "正解理由: PPM(プロダクト・ポートフォリオ・マネジメント)は市場成長率と相対的市場占有率の2軸で事業を「花形」「金のなる木」「問題児」「負け犬」に分類する手法である。間違いやすいポイント: SWOT分析(内部/外部環境の強み弱み分析)やPERT(スケジュール見積り)と混同するミス。覚え方: PPMは「2つの軸で事業を仕分けする表」とイメージする。"}, {"id": 53, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "SWOT分析のSが表すものはどれか。", "choices": [{"label": "ア", "text": "Security"}, {"label": "イ", "text": "Strength"}, {"label": "ウ", "text": "Service"}, {"label": "エ", "text": "Strategy"}], "correct": "イ", "hint": "正解理由: SWOT分析のSはStrength(強み)を表し、自社の内部環境における優れた点を指す。間違いやすいポイント: Strategy(戦略)など似た響きの英単語と混同するミス。覚え方: S=Strength(強み)、W=Weakness(弱み)、O=Opportunity(機会)、T=Threat(脅威)の頭文字と役割をセットで覚える。"}, {"id": 54, "cat": "経営・戦略・法務", "topic": "バリューチェーン分析", "q": "企業活動を主活動と支援活動に分けて付加価値を分析するものはどれか。", "choices": [{"label": "ア", "text": "回帰分析"}, {"label": "イ", "text": "バリューチェーン分析"}, {"label": "ウ", "text": "正規化"}, {"label": "エ", "text": "ベンチマークテスト"}], "correct": "イ", "hint": "正解理由: バリューチェーン分析は、企業活動を主活動(製造・物流・販売等)と支援活動(人事・調達等)に分け、どこで付加価値が生まれているかを分析する手法である。間違いやすいポイント: ベンチマークテストや正規化など全く異なる分野の用語と混同するミス。覚え方: バリューチェーンは「価値(Value)の連鎖(Chain)」で、価値がどこで生まれるかを見る手法。"}, {"id": 55, "cat": "経営・戦略・法務", "topic": "著作権", "q": "著作権について適切な説明はどれか。", "choices": [{"label": "ア", "text": "永久に存続する"}, {"label": "イ", "text": "特許庁だけが管理する"}, {"label": "ウ", "text": "登録しないと発生しない"}, {"label": "エ", "text": "原則として創作時に発生する"}], "correct": "エ", "hint": "正解理由: 著作権は、特許権などと異なり登録を必要とせず、著作物を創作した時点で自動的に発生する(無方式主義)。間違いやすいポイント: 特許権(出願・登録が必要)と混同し、著作権も登録が必要だと誤解するミス。覚え方: 著作権は「作った瞬間に自動で発生」、特許権は「出願して登録されて発生」と対で覚える。"}, {"id": 56, "cat": "基礎理論", "topic": "10進数→2進数", "q": "10進数13を2進数で表したものはどれか。", "choices": [{"label": "ア", "text": "1100"}, {"label": "イ", "text": "1110"}, {"label": "ウ", "text": "1011"}, {"label": "エ", "text": "1101"}], "correct": "エ", "hint": "正解理由: 13=8+4+1であり、2進数では1101になる。間違いやすいポイント: 8+4+1の組み合わせを間違え、8+2+1=11(1011)などと混同するミス。覚え方: 大きい重み(8)から順に引けるだけ引いていき、引けた桁を1、引けなかった桁を0にする。"}, {"id": 57, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/30のIPv4ネットワークで割り当て可能なホスト数はどれか。", "choices": [{"label": "ア", "text": "6"}, {"label": "イ", "text": "1"}, {"label": "ウ", "text": "2"}, {"label": "エ", "text": "4"}], "correct": "ウ", "hint": "正解理由: /30はホスト部が2ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^2-2=2個になる。間違いやすいポイント: 「2を引く」ことを忘れて2^2=4個と誤答しやすい。覚え方: 「ホストビット数を2で累乗してから、必ず2を引く」を一つのセットとして覚える。"}, {"id": 58, "cat": "データベース", "topic": "ロールバック", "q": "データベースで未コミットの更新を取り消す処理はどれか。", "choices": [{"label": "ア", "text": "UNION"}, {"label": "イ", "text": "ロールバック"}, {"label": "ウ", "text": "コミット"}, {"label": "エ", "text": "ロールフォワード"}], "correct": "イ", "hint": "正解理由: ロールバックは、まだコミットされていない更新を取り消し、トランザクション開始前の状態に戻す処理である。間違いやすいポイント: ロールフォワード(コミット済み更新を前向きに再現する処理)と方向を逆に覚えてしまうミス。覚え方: ロールバックは「後ろに戻して取り消し」、ロールフォワードは「前に進めて復元」。"}, {"id": 59, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "O(1)の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "件数の2乗に比例"}, {"label": "イ", "text": "件数に比例"}, {"label": "ウ", "text": "必ず1秒かかる"}, {"label": "エ", "text": "データ件数にほぼ関係なく一定時間"}], "correct": "エ", "hint": "正解理由: O(1)は、データ件数が増えても処理時間がほぼ一定であることを表す計算量である。間違いやすいポイント: 「1」という数字から「必ず1秒かかる」と誤解してしまうミス。覚え方: O(1)の1は時間の単位ではなく「一定」を意味する記号として覚える。"}, {"id": 60, "cat": "プロジェクトマネジメント", "topic": "三点見積り(PERT)", "q": "PERTで最頻値に掛ける係数はどれか。", "choices": [{"label": "ア", "text": "1"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "2"}, {"label": "エ", "text": "6"}], "correct": "イ", "hint": "正解理由: PERT期待値の式は(楽観値+4×最頻値+悲観値)÷6であり、最頻値には4を掛ける。間違いやすいポイント: 分母の6や、楽観値・悲観値の係数(1)と取り違えるミス。覚え方: 「最頻値だけ4倍重視して、6で割る」という式の形をそのまま暗記する。"}];

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
          <div style={s.sub}>基本情報技術者 — 模擬テスト60問(全体演習・総合力確認用)</div>
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
