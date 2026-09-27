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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "2の補数", "q": "8ビットの2の補数表現で-13を表したものはどれか。", "choices": [{"label": "ア", "text": "10001101"}, {"label": "イ", "text": "11110010"}, {"label": "ウ", "text": "00001101"}, {"label": "エ", "text": "11110011"}], "correct": "エ", "hint": "正解理由: 13(00001101)を反転すると11110010、それに1を加えると11110011になる。間違いやすいポイント: 反転しただけで+1を忘れる、または元の2進数をそのまま答えてしまうミス。覚え方: 2の補数は「反転して+1」の2ステップを必ずセットで行う。"}, {"id": 2, "cat": "基礎理論", "topic": "論理演算(XOR)", "q": "2進数11010と10111のXORはどれか。", "choices": [{"label": "ア", "text": "01101"}, {"label": "イ", "text": "11111"}, {"label": "ウ", "text": "00101"}, {"label": "エ", "text": "10010"}], "correct": "ア", "hint": "正解理由: 各桁を比較し、異なる桁は1、同じ桁は0にすると11010 XOR 10111 = 01101になる。間違いやすいポイント: ORと混同し、同じ桁も1にしてしまうミス。覚え方: XORは「違いを検出する」演算。同じなら0、違えば1。"}, {"id": 3, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "計算量O(n^2)の処理で、データ件数を3倍にしたとき処理時間はおおよそ何倍か。", "choices": [{"label": "ア", "text": "27倍"}, {"label": "イ", "text": "6倍"}, {"label": "ウ", "text": "3倍"}, {"label": "エ", "text": "9倍"}], "correct": "エ", "hint": "正解理由: O(n^2)は件数の2乗に比例するため、件数が3倍になると処理時間は3^2=9倍になる。間違いやすいポイント: 件数の増加率とそのまま同じ倍率だと錯覚するミス。覚え方: O(n^2)の「2」は指数。掛け算ではなく累乗で考える。"}, {"id": 4, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "O(log n)のアルゴリズムの例として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "未整列配列の線形探索"}, {"label": "イ", "text": "バブルソート"}, {"label": "ウ", "text": "全要素の合計"}, {"label": "エ", "text": "整列済み配列の二分探索"}], "correct": "エ", "hint": "正解理由: 二分探索は探索範囲を毎回半分に減らすため、計算量はO(log n)になる。間違いやすいポイント: 線形探索(O(n))やバブルソート(O(n^2))と混同するミス。覚え方: 「半分ずつ絞り込む」処理はlog、「全部見る」処理はnと結びつける。"}, {"id": 5, "cat": "コンピュータシステム", "topic": "MIPS計算", "q": "クロック周波数1.8GHz、平均CPIが3のCPUの性能は約何MIPSか。", "choices": [{"label": "ア", "text": "900"}, {"label": "イ", "text": "5,400"}, {"label": "ウ", "text": "300"}, {"label": "エ", "text": "600"}], "correct": "エ", "hint": "正解理由: 1.8GHz=1800MHzであり、MIPS=クロック周波数÷CPI=1800÷3=600MIPSになる。間違いやすいポイント: GHzをMHzに変換せずに計算する、またはクロックとCPIを掛けてしまうミス。覚え方: GHzは1000倍してMHzに直してからCPIで割る。"}, {"id": 6, "cat": "コンピュータシステム", "topic": "キャッシュ実効アクセス時間", "q": "キャッシュヒット率80%、キャッシュ10ns、主記憶70nsのとき実効アクセス時間はどれか。", "choices": [{"label": "ア", "text": "80ns"}, {"label": "イ", "text": "12ns"}, {"label": "ウ", "text": "22ns"}, {"label": "エ", "text": "56ns"}], "correct": "ウ", "hint": "正解理由: 実効アクセス時間=0.8×10+0.2×70=8+14=22nsになる。間違いやすいポイント: ヒット率とミス率を掛ける相手を逆にしてしまうミス。覚え方: 「ヒットした確率×キャッシュの時間」+「外れた確率×主記憶の時間」の加重平均で計算する。"}, {"id": 7, "cat": "コンピュータシステム", "topic": "パイプライン処理", "q": "6段パイプラインで15命令を理想的に連続実行する。必要クロック数はどれか。", "choices": [{"label": "ア", "text": "15"}, {"label": "イ", "text": "20"}, {"label": "ウ", "text": "21"}, {"label": "エ", "text": "90"}], "correct": "イ", "hint": "正解理由: 最初の1命令に6クロック、以降は1クロックずつ増えるため、6+(15-1)×1=20クロックになる。間違いやすいポイント: 段数×命令数(6×15=90)を計算し、パイプラインの重なりを考慮し忘れるミス。覚え方: パイプラインは「流れ作業」。最初の1個だけフルにかかり、あとは1クロックずつずれて完成する。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "稼働率(直列)", "q": "稼働率0.95の装置2台を直列接続したシステムの稼働率はどれか。", "choices": [{"label": "ア", "text": "0.9975"}, {"label": "イ", "text": "0.9500"}, {"label": "ウ", "text": "0.9025"}, {"label": "エ", "text": "1.9000"}], "correct": "ウ", "hint": "正解理由: 直列システムの稼働率は各装置の稼働率の積であり、0.95×0.95=0.9025になる。間違いやすいポイント: 並列と混同して1から引く計算をしてしまう、または足し算にしてしまうミス。覚え方: 直列は「全部そろって動く」ので単純に掛け算。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "RAID", "q": "RAID1の特徴として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "パリティ専用ディスクを1台だけ用いる"}, {"label": "イ", "text": "複数ディスクへ分散書込みし冗長性なし"}, {"label": "ウ", "text": "同じデータを複数ディスクへ複製する"}, {"label": "エ", "text": "メモリ内容を定期的に磁気テープへ保存する"}], "correct": "ウ", "hint": "正解理由: RAID1はミラーリングと呼ばれ、同じデータを複数のディスクに複製して保持する方式である。間違いやすいポイント: RAID0(分散書込み・冗長性なし)やRAID3/4(専用パリティディスク)と混同するミス。覚え方: RAID1は「1つのデータを1枚コピーして持つ」=ミラー(鏡)とセットで覚える。"}, {"id": 10, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/26のIPv4ネットワークで利用可能なホストアドレス数は最大いくつか。", "choices": [{"label": "ア", "text": "30"}, {"label": "イ", "text": "126"}, {"label": "ウ", "text": "64"}, {"label": "エ", "text": "62"}], "correct": "エ", "hint": "正解理由: /26はホスト部が6ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^6-2=62個になる。間違いやすいポイント: 「2を引く」ことを忘れて2^6=64個と誤答しやすい。覚え方: ホストビット数を2で累乗してから必ず2を引く。"}, {"id": 11, "cat": "ネットワーク", "topic": "ネットワークアドレス", "q": "IPアドレス192.168.1.141/27が属するネットワークアドレスはどれか。", "choices": [{"label": "ア", "text": "192.168.1.96"}, {"label": "イ", "text": "192.168.1.128"}, {"label": "ウ", "text": "192.168.1.112"}, {"label": "エ", "text": "192.168.1.160"}], "correct": "イ", "hint": "正解理由: /27は32刻み(0,32,64,96,128,160…)であり、141は128～159の範囲に含まれるため、ネットワークアドレスは192.168.1.128になる。間違いやすいポイント: 区切り幅を計算せずキリのよい数字を選んでしまうミス。覚え方: 区切り幅=256÷2^(ホストビット数)。/27なら256÷8=32刻み。"}, {"id": 12, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/28のサブネットにおけるアドレスの区切り幅はどれか。", "choices": [{"label": "ア", "text": "32"}, {"label": "イ", "text": "16"}, {"label": "ウ", "text": "28"}, {"label": "エ", "text": "8"}], "correct": "イ", "hint": "正解理由: /28はホスト部が4ビットであり、区切り幅は2^4=16になる。間違いやすいポイント: プレフィックス長の数字(28)や別の刻み幅と取り違えるミス。覚え方: 区切り幅=2^(32-プレフィックス長)。/28なら2^4=16。"}, {"id": 13, "cat": "ネットワーク", "topic": "ARP", "q": "同一LAN内でIPアドレスからMACアドレスを調べるプロトコルはどれか。", "choices": [{"label": "ア", "text": "SMTP"}, {"label": "イ", "text": "ARP"}, {"label": "ウ", "text": "DHCP"}, {"label": "エ", "text": "DNS"}], "correct": "イ", "hint": "正解理由: ARP(Address Resolution Protocol)は同一LAN内でIPアドレスからMACアドレスを解決するプロトコルである。間違いやすいポイント: DNS(名前解決)やDHCP(IP自動割当)と役割を混同するミス。覚え方: ARP=IPとMACの「橋渡し」。DNSは名前↔IP、DHCPはIPの配布と分けて覚える。"}, {"id": 14, "cat": "ネットワーク", "topic": "DNS", "q": "ドメイン名をIPアドレスへ変換する仕組みはどれか。", "choices": [{"label": "ア", "text": "NTP"}, {"label": "イ", "text": "SNMP"}, {"label": "ウ", "text": "FTP"}, {"label": "エ", "text": "DNS"}], "correct": "エ", "hint": "正解理由: DNS(Domain Name System)はドメイン名とIPアドレスを対応付ける名前解決の仕組みである。間違いやすいポイント: FTP(ファイル転送)やNTP(時刻同期)など他のプロトコルと役割を混同するミス。覚え方: DNSは「名前(ドメイン)から住所(IP)を調べる電話帳」とイメージする。"}, {"id": 15, "cat": "データベース", "topic": "SQL(HAVING)", "q": "GROUP BYで集計した後のグループに条件を指定する句はどれか。", "choices": [{"label": "ア", "text": "HAVING"}, {"label": "イ", "text": "WHERE"}, {"label": "ウ", "text": "ORDER BY"}, {"label": "エ", "text": "DISTINCT"}], "correct": "ア", "hint": "正解理由: HAVING句はGROUP BYで集計した後の結果(集計値)に対して条件を指定する。間違いやすいポイント: WHEREと混同するが、WHEREは集計前の行に対する条件である点が異なる。覚え方: WHEREは「集計前の絞り込み」、HAVINGは「集計後の絞り込み」と対で覚える。"}, {"id": 16, "cat": "データベース", "topic": "SQL集合演算(INTERSECT)", "q": "二つのSELECT結果の共通部分だけを取得する集合演算子はどれか。", "choices": [{"label": "ア", "text": "EXCEPT"}, {"label": "イ", "text": "JOIN"}, {"label": "ウ", "text": "UNION"}, {"label": "エ", "text": "INTERSECT"}], "correct": "エ", "hint": "正解理由: INTERSECTは二つの問合せ結果の積集合(共通する行)を求める演算子である。間違いやすいポイント: UNION(和集合)やEXCEPT(差集合)と役割を混同するミス。覚え方: INTERSECT=「交差」なので、共通部分だけを取り出す。"}, {"id": 17, "cat": "データベース", "topic": "SQL集合演算(UNION)", "q": "二つのSELECT結果をまとめ、重複行を除いた和集合を返すものはどれか。", "choices": [{"label": "ア", "text": "EXCEPT"}, {"label": "イ", "text": "INTERSECT"}, {"label": "ウ", "text": "UNION"}, {"label": "エ", "text": "CROSS JOIN"}], "correct": "ウ", "hint": "正解理由: UNIONは二つの問合せ結果を結合し、重複行を除いた和集合を返す演算子である。間違いやすいポイント: INTERSECT(積集合)やEXCEPT(差集合)と役割を混同するミス。覚え方: UNION=「和集合」、INTERSECT=「交差」、EXCEPT=「差」とセットで覚える。"}, {"id": 18, "cat": "データベース", "topic": "ロールフォワード", "q": "障害復旧で、バックアップ以降のコミット済み更新をログから再現する処理はどれか。", "choices": [{"label": "ア", "text": "排他制御"}, {"label": "イ", "text": "ロールバック"}, {"label": "ウ", "text": "ロールフォワード"}, {"label": "エ", "text": "正規化"}], "correct": "ウ", "hint": "正解理由: ロールフォワードは、バックアップ以降のログを使ってコミット済みの更新を再現し、障害直前の状態に復元する処理である。間違いやすいポイント: ロールバック(未コミットの取り消し)と方向を逆に覚えてしまうミス。覚え方: ロールフォワードは「前に進めて復元」、ロールバックは「後ろに戻して取り消し」。"}, {"id": 19, "cat": "データベース", "topic": "正規化", "q": "第3正規形への正規化の主目的として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "データ重複や更新時の不整合を減らす"}, {"label": "イ", "text": "必ず検索を高速化する"}, {"label": "ウ", "text": "主キーを削除する"}, {"label": "エ", "text": "すべての表を1つにまとめる"}], "correct": "ア", "hint": "正解理由: 正規化はデータの重複を排除し、更新時の不整合(更新異常)を防ぐことを主な目的とする。間違いやすいポイント: 「検索が必ず速くなる」という誤解や、テーブル統合が目的だと考えるミス。覚え方: 正規化は「重複と矛盾をなくす整理整頓」であり、速度向上が主目的ではない。"}, {"id": 20, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数", "q": "次の関数f(n)の戻り値を考える。n=0なら0、それ以外はn+f(n-1)を返す。f(5)はいくつか。", "choices": [{"label": "ア", "text": "25"}, {"label": "イ", "text": "15"}, {"label": "ウ", "text": "20"}, {"label": "エ", "text": "10"}], "correct": "イ", "hint": "正解理由: f(5)=5+f(4)=5+4+f(3)=…と展開すると5+4+3+2+1+0=15になる。間違いやすいポイント: f(0)=0を忘れて1から数え始めてしまう、または途中で展開を打ち切るミス。覚え方: 「nが0のとき」という基底条件を必ず最初に確認し、そこから逆算して積み上げる。"}, {"id": 21, "cat": "アルゴリズム・プログラミング", "topic": "探索アルゴリズム", "q": "昇順配列[2,5,8,12,16,21,30]を二分探索して16を探す。最初に比較する値はどれか。", "choices": [{"label": "ア", "text": "12"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "16"}, {"label": "エ", "text": "2"}], "correct": "ア", "hint": "正解理由: 二分探索は配列の中央の要素と比較する。要素数7個の中央(4番目、添字3)は12であり、最初に比較するのは12になる。間違いやすいポイント: 探している値(16)自体を最初の比較対象だと勘違いするミス。覚え方: 二分探索の最初の一手は必ず「配列全体の中央」であり、探索対象の値とは無関係。"}, {"id": 22, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表(線形探索法)", "q": "大きさ7のハッシュ表でh(k)=k mod 7、衝突時は次番地へ進む。8,15,22を順に格納したとき22の格納位置はどれか。", "choices": [{"label": "ア", "text": "1"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "2"}, {"label": "エ", "text": "3"}], "correct": "エ", "hint": "正解理由: 8,15,22はいずれもmod7=1になる。8が1番地、15は衝突して2番地、22も衝突し1・2番地が使用済みのため3番地に格納される。間違いやすいポイント: 最初に計算したハッシュ値(1)をそのまま答えてしまうミス。覚え方: 衝突したら「次の番地が空くまで」1つずつ進める。"}, {"id": 23, "cat": "アルゴリズム・プログラミング", "topic": "選択ソート", "q": "配列[4,1,3,2]を選択ソートで昇順にする。最初の1回の交換後の配列はどれか。", "choices": [{"label": "ア", "text": "[1,4,3,2]"}, {"label": "イ", "text": "[4,1,2,3]"}, {"label": "ウ", "text": "[1,2,3,4]"}, {"label": "エ", "text": "[2,1,3,4]"}], "correct": "ア", "hint": "正解理由: 選択ソートは未整列部分から最小値を探し、先頭要素と交換する。[4,1,3,2]の最小値は1であり、先頭の4と交換すると[1,4,3,2]になる。間違いやすいポイント: 1回の交換で完全にソートされると思い込むミス。覚え方: 選択ソートは「1回につき1つだけ確定位置に置く」を繰り返す。"}, {"id": 24, "cat": "アルゴリズム・プログラミング", "topic": "スタック", "q": "スタックの特徴として適切なものはどれか。", "choices": [{"label": "ア", "text": "任意位置からしか取り出せない"}, {"label": "イ", "text": "最後に入れたものを先に取り出す"}, {"label": "ウ", "text": "常に小さい値から取り出す"}, {"label": "エ", "text": "先に入れたものを先に取り出す"}], "correct": "イ", "hint": "正解理由: スタックはLIFO(Last In First Out、後入れ先出し)の構造であり、最後に入れたものを最初に取り出す。間違いやすいポイント: キュー(FIFO、先入れ先出し)と混同するミス。覚え方: スタックは「積み重ねた皿」。上(最後に置いたもの)から取る。"}, {"id": 25, "cat": "情報セキュリティ", "topic": "パスワード保護", "q": "パスワード保存方法として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "ZIP圧縮して保存"}, {"label": "イ", "text": "ソルトを付与してハッシュ化"}, {"label": "ウ", "text": "平文で保存"}, {"label": "エ", "text": "Base64で変換して保存"}], "correct": "イ", "hint": "正解理由: ソルト(ランダムな値)を付与してからハッシュ化することで、同じパスワードでも異なるハッシュ値になり、レインボーテーブル攻撃などへの耐性が高まる。間違いやすいポイント: Base64は単なる符号化(誰でも元に戻せる)であり保護にならない点を見落とすミス。覚え方: 平文論外、Base64は暗号化ではない、ハッシュ化+ソルトが基本セット。"}, {"id": 26, "cat": "情報セキュリティ", "topic": "3-2-1バックアップルール", "q": "ランサムウェア対策の3-2-1ルールの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "3つのパスワード、2段階認証、1管理者"}, {"label": "イ", "text": "3世代、2時間ごと、1台のNAS"}, {"label": "ウ", "text": "3コピー、2種類の媒体、1コピーを別拠点"}, {"label": "エ", "text": "3台のPC、2人で管理、1日1回更新"}], "correct": "ウ", "hint": "正解理由: 3-2-1ルールは、データを3つ以上のコピーとして、2種類の異なる媒体に、うち1つはオフサイト(遠隔地)に保管する考え方である。間違いやすいポイント: 数字の意味(コピー数・媒体数・遠隔地数)を取り違えるミス。覚え方: 3=コピー数、2=媒体の種類数、1=遠隔地保管の数。"}, {"id": 27, "cat": "情報セキュリティ", "topic": "SQLインジェクション対策", "q": "SQLインジェクション対策として有効なものはどれか。", "choices": [{"label": "ア", "text": "プレースホルダを用いたパラメータ化クエリ"}, {"label": "イ", "text": "パスワードを短くする"}, {"label": "ウ", "text": "画面の背景色を変更する"}, {"label": "エ", "text": "HTTPを使用する"}], "correct": "ア", "hint": "正解理由: パラメータ化クエリ(プレースホルダ)を使うことで、入力値がSQL文の一部として解釈されるのを防げる。間違いやすいポイント: 画面表示やパスワード長など、SQLインジェクションと無関係な選択肢に惑わされるミス。覚え方: SQLインジェクション対策は「入力値とSQL文を混ぜない」がキーワード。"}, {"id": 28, "cat": "情報セキュリティ", "topic": "電子署名", "q": "電子署名によって主に確認できるものはどれか。", "choices": [{"label": "ア", "text": "ファイル容量"}, {"label": "イ", "text": "送信者の真正性と改ざんの有無"}, {"label": "ウ", "text": "受信者の住所"}, {"label": "エ", "text": "通信速度と圧縮率"}], "correct": "イ", "hint": "正解理由: 電子署名は、送信者本人であることの証明(真正性)と、データが途中で改ざんされていないこと(完全性)を確認するために使われる。間違いやすいポイント: 暗号化(秘匿性の確保)と役割を混同するミス。覚え方: 電子署名は「誰が送ったか」+「途中で変わっていないか」を確認する仕組み。"}, {"id": 29, "cat": "ソフトウェア・開発", "topic": "バージョン管理", "q": "Gitで変更をレビューしてからメインブランチへ統合する仕組みは一般に何と呼ばれるか。", "choices": [{"label": "ア", "text": "スプーリング"}, {"label": "イ", "text": "スワッピング"}, {"label": "ウ", "text": "プルリクエスト"}, {"label": "エ", "text": "デッドロック"}], "correct": "ウ", "hint": "正解理由: プルリクエスト(Pull Request、Merge Request)は、変更内容をレビューしてからメインブランチへ統合するための仕組みである。間違いやすいポイント: デッドロックやスワッピングなど、開発フローと無関係なOS用語と混同するミス。覚え方: プルリクエストは「取り込んで、の依頼」＝レビューを経て合流する仕組み。"}, {"id": 30, "cat": "ソフトウェア・開発", "topic": "技術的負債", "q": "短期的な納期優先で設計品質を妥協し、将来の保守コストが増える状態はどれか。", "choices": [{"label": "ア", "text": "ロードバランシング"}, {"label": "イ", "text": "フェールセーフ"}, {"label": "ウ", "text": "オーバーフロー"}, {"label": "エ", "text": "技術的負債"}], "correct": "エ", "hint": "正解理由: 技術的負債は、短期的な効率を優先して設計や実装の質を妥協した結果、将来の修正・保守コストが増大する状態を指す比喩表現である。間違いやすいポイント: フェールセーフ(安全側に倒す設計思想)など無関係な用語と混同するミス。覚え方: 技術的負債は「借金」と同じで、後で利息(保守コスト)がついて返ってくるとイメージする。"}, {"id": 31, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法", "q": "入出力やファイルなど利用者から見た機能量で規模を見積もる手法はどれか。", "choices": [{"label": "ア", "text": "CPM"}, {"label": "イ", "text": "ファンクションポイント法"}, {"label": "ウ", "text": "デルファイ法"}, {"label": "エ", "text": "PERT"}], "correct": "イ", "hint": "正解理由: ファンクションポイント法は、外部入出力や内部論理ファイルなどの機能量を基に開発規模を見積もる手法である。間違いやすいポイント: PERT(三点見積り)やデルファイ法(専門家合議)と混同するミス。覚え方: ファンクションポイント法は「機能の数」を数える見積り手法。"}, {"id": 32, "cat": "プロジェクトマネジメント", "topic": "三点見積り(PERT)", "q": "楽観値2日、最頻値5日、悲観値8日の三点見積りによる期待値はどれか。式は(楽観+4×最頻+悲観)/6とする。", "choices": [{"label": "ア", "text": "5日"}, {"label": "イ", "text": "6日"}, {"label": "ウ", "text": "7日"}, {"label": "エ", "text": "4日"}], "correct": "ア", "hint": "正解理由: (2+4×5+8)/6=(2+20+8)/6=30/6=5日になる。間違いやすいポイント: 4を掛ける対象を最頻値ではなく他の値にしてしまう計算ミス。覚え方: PERT期待値の式は「楽観+4×最頻+悲観を6で割る」という決まった形をそのまま覚える。"}, {"id": 33, "cat": "プロジェクトマネジメント", "topic": "プロジェクト工期(クリティカルパス)", "q": "A=3日、B=6日は同時開始でき、その両方の完了後にC=4日を行う。最短所要日数はどれか。", "choices": [{"label": "ア", "text": "10日"}, {"label": "イ", "text": "13日"}, {"label": "ウ", "text": "9日"}, {"label": "エ", "text": "7日"}], "correct": "ア", "hint": "正解理由: AとBは並行に進められるため、両方が終わるのは長い方のB(6日)の時点。そこからCの4日を加えると6+4=10日になる。間違いやすいポイント: A+B+C(3+6+4=13)と直列に足してしまうミス。覚え方: 並行作業は「長い方だけ」を採用し、直列作業は「そのまま足す」。"}, {"id": 34, "cat": "サービスマネジメント", "topic": "インシデント管理", "q": "インシデント管理の主目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "障害の根本原因を永久に除去することだけ"}, {"label": "イ", "text": "契約書を作成する"}, {"label": "ウ", "text": "サービスをできるだけ早く正常状態へ戻す"}, {"label": "エ", "text": "新規システムを設計する"}], "correct": "ウ", "hint": "正解理由: インシデント管理は、発生した障害やサービス中断を可能な限り早く正常な状態へ復旧させることを主目的とする。間違いやすいポイント: 根本原因の恒久対応(問題管理の役割)と混同するミス。覚え方: インシデント管理は「今すぐ直す」、問題管理は「根本原因を追究する」と役割を分けて覚える。"}, {"id": 35, "cat": "経営・戦略・法務", "topic": "限界利益", "q": "売上高から変動費を差し引いたものはどれか。", "choices": [{"label": "ア", "text": "限界利益"}, {"label": "イ", "text": "経常利益"}, {"label": "ウ", "text": "純利益"}, {"label": "エ", "text": "営業利益"}], "correct": "ア", "hint": "正解理由: 限界利益は売上高から変動費のみを差し引いたものであり、固定費を回収する前の利益指標である。間違いやすいポイント: 営業利益(さらに固定費や販管費を引いた後の利益)と混同するミス。覚え方: 限界利益=売上高-変動費(固定費はまだ引かない)。"}, {"id": 36, "cat": "経営・戦略・法務", "topic": "損益分岐点", "q": "固定費300万円、1個あたり販売価格5,000円、変動費3,000円の製品の損益分岐点販売数量はどれか。", "choices": [{"label": "ア", "text": "1,000個"}, {"label": "イ", "text": "3,000個"}, {"label": "ウ", "text": "600個"}, {"label": "エ", "text": "1,500個"}], "correct": "エ", "hint": "正解理由: 1個あたり限界利益=5,000-3,000=2,000円。損益分岐点数量=固定費÷1個あたり限界利益=3,000,000÷2,000=1,500個になる。間違いやすいポイント: 変動費を引かずに固定費÷販売価格で計算してしまうミス。覚え方: 損益分岐点数量=固定費÷(価格-変動費)という式をそのまま覚える。"}, {"id": 37, "cat": "経営・戦略・法務", "topic": "PPM", "q": "市場成長率と相対的市場占有率で事業を分類する手法はどれか。", "choices": [{"label": "ア", "text": "ABC分析"}, {"label": "イ", "text": "PPM"}, {"label": "ウ", "text": "SWOT"}, {"label": "エ", "text": "E-R図"}], "correct": "イ", "hint": "正解理由: PPM(プロダクト・ポートフォリオ・マネジメント)は市場成長率と相対的市場占有率の2軸で事業を「花形」「金のなる木」「問題児」「負け犬」に分類する手法である。間違いやすいポイント: SWOT分析(内部/外部環境の強み弱み分析)と混同するミス。覚え方: PPMは「2つの軸で事業を仕分けする表」とイメージする。"}, {"id": 38, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "SWOT分析で「機会(Opportunity)」に当たるものはどれか。", "choices": [{"label": "ア", "text": "市場拡大という外部環境"}, {"label": "イ", "text": "競合企業の参入"}, {"label": "ウ", "text": "自社の高い技術力"}, {"label": "エ", "text": "自社の人材不足"}], "correct": "ア", "hint": "正解理由: 機会(Opportunity)は自社にとって有利に働く外部環境の変化であり、市場拡大はその代表例である。間違いやすいポイント: 自社の強み・弱み(内部要因)と機会・脅威(外部要因)を混同するミス。覚え方: S(強み)とW(弱み)は自社の内部、O(機会)とT(脅威)は外部環境と2軸に分けて覚える。"}, {"id": 39, "cat": "経営・戦略・法務", "topic": "個人情報保護", "q": "個人情報保護の観点から適切な行為はどれか。", "choices": [{"label": "ア", "text": "本人の同意なく目的外利用を常態化する"}, {"label": "イ", "text": "取得した情報を無制限に第三者提供する"}, {"label": "ウ", "text": "利用目的を特定し必要な範囲で扱う"}, {"label": "エ", "text": "不要になっても永久保存する"}], "correct": "ウ", "hint": "正解理由: 個人情報保護の基本原則は、利用目的をあらかじめ特定し、その必要な範囲内でのみ個人情報を取り扱うことである。間違いやすいポイント: 「同意があれば何でも良い」と拡大解釈してしまうミス。覚え方: 個人情報の扱いは「目的を決めてから、その範囲だけ」が基本ルール。"}, {"id": 40, "cat": "経営・戦略・法務", "topic": "可用性", "q": "次のうち「可用性」を高める対策として最も直接的なものはどれか。", "choices": [{"label": "ア", "text": "データを暗号化する"}, {"label": "イ", "text": "アクセス権を最小化する"}, {"label": "ウ", "text": "サーバを冗長化する"}, {"label": "エ", "text": "電子署名を付ける"}], "correct": "ウ", "hint": "正解理由: 可用性(Availability)はシステムが必要なときに使える状態を保つ性質であり、サーバの冗長化は障害時にも稼働を継続できるようにする直接的な対策である。間違いやすいポイント: 暗号化や署名、アクセス権最小化は主に機密性・完全性を高める対策であり可用性とは目的が異なる点を混同するミス。覚え方: CIAトライアッド(機密性・完全性・可用性)のうち、冗長化・バックアップは「可用性」担当。"}];

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
          <div style={s.sub}>基本情報技術者 — 全体演習テスト40問(総合力確認用)</div>
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
                🔄 問題をリセット（全40問に戻す）
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
