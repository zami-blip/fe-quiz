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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "論理演算(AND)", "q": "2進数101011と001101のANDを求めるとどれか。", "choices": [{"label": "ア", "text": "001111"}, {"label": "イ", "text": "001001"}, {"label": "ウ", "text": "100001"}, {"label": "エ", "text": "101111"}], "correct": "イ", "hint": "正解理由: ANDは両方の桁が1のときだけ1になる。101011と001101を1桁ずつ比較すると001001になる。間違いやすいポイント: ORと混同し、どちらかが1なら1にしてしまうミス。覚え方: ANDは「両方そろって初めて1」、ORは「どちらかあれば1」。"}, {"id": 2, "cat": "基礎理論", "topic": "数値表現(符号なし整数)", "q": "8ビット符号なし整数で表現できる最大値はどれか。", "choices": [{"label": "ア", "text": "256"}, {"label": "イ", "text": "127"}, {"label": "ウ", "text": "128"}, {"label": "エ", "text": "255"}], "correct": "エ", "hint": "正解理由: 8ビット符号なし整数は0〜2^8-1の範囲を表現でき、最大値は2^8-1=255になる。間違いやすいポイント: 2^8=256自体を最大値と誤答する、または符号付き整数の最大値127と混同するミス。覚え方: 符号なしは「0から2^n-1まで」、符号付きは「-2^(n-1)から2^(n-1)-1まで」と対で覚える。"}, {"id": 3, "cat": "基礎理論", "topic": "計算量(オーダー記法)", "q": "計算量O(log n)の代表例として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "線形探索"}, {"label": "イ", "text": "二分探索"}, {"label": "ウ", "text": "全探索"}, {"label": "エ", "text": "バブルソート"}], "correct": "イ", "hint": "正解理由: 二分探索は探索範囲を毎回半分に減らすため、計算量はO(log n)になる。間違いやすいポイント: 線形探索(O(n))やバブルソート(O(n^2))と混同するミス。覚え方: 「半分ずつ絞り込む」処理はlog、「全部見る」処理はnと結びつける。"}, {"id": 4, "cat": "基礎理論", "topic": "10進数→2進数", "q": "10進数37を2進数で表すとどれか。", "choices": [{"label": "ア", "text": "100111"}, {"label": "イ", "text": "100101"}, {"label": "ウ", "text": "101001"}, {"label": "エ", "text": "110001"}], "correct": "イ", "hint": "正解理由: 37=32+4+1であり、2進数では100101になる。間違いやすいポイント: 32+8+1=41や32+4+2+1=39など、重みの組み合わせを間違えるミス。覚え方: 大きい重み(32)から順に引けるだけ引いていき、引けた桁を1、引けなかった桁を0にする。"}, {"id": 5, "cat": "コンピュータシステム", "topic": "MIPS計算", "q": "クロック周波数1.8GHz、CPIが3のCPUの性能は約何MIPSか。", "choices": [{"label": "ア", "text": "300"}, {"label": "イ", "text": "1800"}, {"label": "ウ", "text": "600"}, {"label": "エ", "text": "900"}], "correct": "ウ", "hint": "正解理由: 1.8GHz=1800MHzであり、MIPS=クロック周波数÷CPI=1800÷3=600MIPSになる。間違いやすいポイント: GHzをMHzに変換せずに計算する、またはクロックとCPIを掛けてしまうミス。覚え方: GHzは1000倍してMHzに直してからCPIで割る。"}, {"id": 6, "cat": "コンピュータシステム", "topic": "パイプライン処理", "q": "4段パイプラインで15命令を理想的に実行すると、合計何クロックか。", "choices": [{"label": "ア", "text": "19"}, {"label": "イ", "text": "18"}, {"label": "ウ", "text": "15"}, {"label": "エ", "text": "60"}], "correct": "イ", "hint": "正解理由: 最初の1命令に4クロック、以降は1クロックずつ増えるため、4+(15-1)×1=18クロックになる。間違いやすいポイント: 段数×命令数(4×15=60)を計算し、パイプラインの重なりを考慮し忘れるミス。覚え方: パイプラインは「流れ作業」。最初の1個だけフルにかかり、あとは1クロックずつずれて完成する。"}, {"id": 7, "cat": "コンピュータシステム", "topic": "キャッシュ実効アクセス時間", "q": "キャッシュヒット率80%、キャッシュ10ns、主記憶70nsの実効アクセス時間はどれか。", "choices": [{"label": "ア", "text": "80ns"}, {"label": "イ", "text": "18ns"}, {"label": "ウ", "text": "22ns"}, {"label": "エ", "text": "58ns"}], "correct": "ウ", "hint": "正解理由: 実効アクセス時間=0.8×10+0.2×70=8+14=22nsになる。間違いやすいポイント: ヒット率とミス率を掛ける相手を逆にしてしまうミス。覚え方: 「ヒットした確率×キャッシュの時間」+「外れた確率×主記憶の時間」の加重平均で計算する。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "RAID", "q": "RAID0の特徴として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "専用パリティディスクを使う"}, {"label": "イ", "text": "ストライピングで高速化するが冗長性はない"}, {"label": "ウ", "text": "3重複製する"}, {"label": "エ", "text": "ミラーリング"}], "correct": "イ", "hint": "正解理由: RAID0はストライピングと呼ばれ、複数ディスクに分散して書き込むことで高速化するが、冗長性(耐障害性)は持たない。間違いやすいポイント: RAID1(ミラーリング)と混同し、冗長性があると誤解するミス。覚え方: RAID0の「0」は「冗長性ゼロ」と覚える。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "稼働率(直列)", "q": "稼働率0.8の装置3台を直列接続したときの稼働率はどれか。", "choices": [{"label": "ア", "text": "0.64"}, {"label": "イ", "text": "0.992"}, {"label": "ウ", "text": "0.512"}, {"label": "エ", "text": "0.80"}], "correct": "ウ", "hint": "正解理由: 直列システムの稼働率は各装置の稼働率の積であり、0.8の3乗=0.8×0.8×0.8=0.512になる。間違いやすいポイント: 2台分(0.8×0.8=0.64)で止めてしまう、または並列の考え方と混同するミス。覚え方: 直列は「台数分だけ掛け算を繰り返す」。"}, {"id": 10, "cat": "ネットワーク", "topic": "サブネットマスク", "q": "/29のサブネットで使用可能なホスト数は最大いくつか。", "choices": [{"label": "ア", "text": "14"}, {"label": "イ", "text": "6"}, {"label": "ウ", "text": "4"}, {"label": "エ", "text": "8"}], "correct": "イ", "hint": "正解理由: /29はホスト部が3ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^3-2=6個になる。間違いやすいポイント: 「2を引く」ことを忘れて2^3=8個と誤答しやすい。覚え方: ホストビット数を2で累乗してから必ず2を引く。"}, {"id": 11, "cat": "ネットワーク", "topic": "ネットワークアドレス", "q": "IPアドレス192.168.1.150/26が属するネットワークアドレスはどれか。", "choices": [{"label": "ア", "text": "192.168.1.64"}, {"label": "イ", "text": "192.168.1.192"}, {"label": "ウ", "text": "192.168.1.150"}, {"label": "エ", "text": "192.168.1.128"}], "correct": "エ", "hint": "正解理由: /26は64刻み(0,64,128,192)であり、150は128〜191の範囲に含まれるため、ネットワークアドレスは192.168.1.128になる。間違いやすいポイント: 区切り幅を計算せずキリのよい数字を選んでしまうミス。覚え方: 区切り幅=256÷2^(ホストビット数)。/26なら256÷4=64刻み。"}, {"id": 12, "cat": "ネットワーク", "topic": "メールプロトコル", "q": "電子メール送信に主に用いられるプロトコルはどれか。", "choices": [{"label": "ア", "text": "FTP"}, {"label": "イ", "text": "POP3"}, {"label": "ウ", "text": "SMTP"}, {"label": "エ", "text": "IMAP"}], "correct": "ウ", "hint": "正解理由: SMTP(Simple Mail Transfer Protocol)はメールを送信するためのプロトコルである。間違いやすいポイント: POP3やIMAP(メールを受信・取得するためのプロトコル)と役割を混同するミス。覚え方: SMTPは「送信(Send)」、POP3・IMAPは「受信(受け取り)」と役割を分けて覚える。"}, {"id": 13, "cat": "ネットワーク", "topic": "DNS", "q": "ホスト名からIPアドレスを調べる仕組みはどれか。", "choices": [{"label": "ア", "text": "ARP"}, {"label": "イ", "text": "DHCP"}, {"label": "ウ", "text": "NTP"}, {"label": "エ", "text": "DNS"}], "correct": "エ", "hint": "正解理由: DNS(Domain Name System)はホスト名(ドメイン名)とIPアドレスを対応付ける名前解決の仕組みである。間違いやすいポイント: ARP(同一LAN内のMAC解決)やDHCP(IP自動割当)と役割を混同するミス。覚え方: DNSは「名前(ドメイン)から住所(IP)を調べる電話帳」とイメージする。"}, {"id": 14, "cat": "ネットワーク", "topic": "ルーティング", "q": "ルータが主に参照して転送先を判断するものはどれか。", "choices": [{"label": "ア", "text": "IPアドレス"}, {"label": "イ", "text": "ポート番号だけ"}, {"label": "ウ", "text": "MACアドレス"}, {"label": "エ", "text": "ファイル名"}], "correct": "ア", "hint": "正解理由: ルータはネットワーク層(IP層)で動作し、宛先IPアドレスを参照して転送先(経路)を判断する。間違いやすいポイント: MACアドレスを参照するのはスイッチ(データリンク層)である点と混同するミス。覚え方: スイッチは「MACアドレスで同一LAN内を中継」、ルータは「IPアドレスで異なるネットワーク間を中継」。"}, {"id": 15, "cat": "データベース", "topic": "主キー", "q": "主キーの説明として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "行を一意に識別する"}, {"label": "イ", "text": "外部キーと同じ意味"}, {"label": "ウ", "text": "NULLを必ず許す"}, {"label": "エ", "text": "重複を許す"}], "correct": "ア", "hint": "正解理由: 主キーは表の各行を一意に識別するための列(または列の組み合わせ)であり、重複やNULLは許されない。間違いやすいポイント: 外部キー(他表の主キーを参照する列)と役割を混同するミス。覚え方: 主キーは「自分の表の中で行を特定するID」、外部キーは「他の表とのつながりを示すID」。"}, {"id": 16, "cat": "データベース", "topic": "SQL(DISTINCT)", "q": "SQLで重複行を除いて結果を取得する指定はどれか。", "choices": [{"label": "ア", "text": "GROUP"}, {"label": "イ", "text": "UNIQUE BY"}, {"label": "ウ", "text": "SORT"}, {"label": "エ", "text": "DISTINCT"}], "correct": "エ", "hint": "正解理由: SELECT文にDISTINCTを指定すると、結果から重複する行を除いて取得できる。間違いやすいポイント: GROUP BY(グループ化して集計する句)と混同するミス。覚え方: DISTINCTは「重複を除く」、GROUP BYは「グループごとに集計する」と役割を分けて覚える。"}, {"id": 17, "cat": "データベース", "topic": "結合(INNER JOIN)", "q": "二つの表で条件に一致する行だけを結合するものはどれか。", "choices": [{"label": "ア", "text": "UNION"}, {"label": "イ", "text": "EXCEPT"}, {"label": "ウ", "text": "CROSS JOIN"}, {"label": "エ", "text": "INNER JOIN"}], "correct": "エ", "hint": "正解理由: INNER JOIN(内部結合)は、結合条件に一致する行だけを両方の表から取得する。間違いやすいポイント: CROSS JOIN(全組み合わせを返す)やUNION(集合演算)と混同するミス。覚え方: INNER JOINは「両方に共通するものだけ」を条件付きで結合する。"}, {"id": 18, "cat": "データベース", "topic": "ACID特性", "q": "トランザクションのACID特性で、処理が全部成功するか全部失敗することを表すものはどれか。", "choices": [{"label": "ア", "text": "永続性"}, {"label": "イ", "text": "独立性"}, {"label": "ウ", "text": "原子性"}, {"label": "エ", "text": "一貫性"}], "correct": "ウ", "hint": "正解理由: 原子性(Atomicity)は、トランザクション内の処理が「全部成功する」か「全部失敗する(取り消される)」かのどちらかであることを保証する性質である。間違いやすいポイント: 一貫性(データの整合性維持)や独立性(同時実行の分離)と混同するミス。覚え方: 原子性(Atomicity)の頭文字Aを「All or Nothing」と結びつけて覚える。"}, {"id": 19, "cat": "アルゴリズム・プログラミング", "topic": "スタック", "q": "スタックのデータ取出し方式はどれか。", "choices": [{"label": "ア", "text": "LIFO"}, {"label": "イ", "text": "優先度順"}, {"label": "ウ", "text": "FIFO"}, {"label": "エ", "text": "ランダム"}], "correct": "ア", "hint": "正解理由: スタックはLIFO(Last In First Out、後入れ先出し)の構造であり、最後に入れたものを最初に取り出す。間違いやすいポイント: キュー(FIFO、先入れ先出し)と混同するミス。覚え方: スタックは「積み重ねた皿」。上(最後に置いたもの)から取る。"}, {"id": 20, "cat": "アルゴリズム・プログラミング", "topic": "選択ソート", "q": "配列[7,3,5,1]を選択ソートで昇順にする。最初の交換後はどれか。", "choices": [{"label": "ア", "text": "[1,3,5,7]"}, {"label": "イ", "text": "[3,7,5,1]"}, {"label": "ウ", "text": "[7,3,5,1]"}, {"label": "エ", "text": "[1,7,5,3]"}], "correct": "ア", "hint": "正解理由: 選択ソートは未整列部分から最小値を探し、先頭要素と交換する。[7,3,5,1]の最小値は1(添字3)であり、先頭の7と交換すると[1,3,5,7]になる(たまたま1回の交換で整列済みの形と一致する)。間違いやすいポイント: 交換がまだ行われていないと思い込む、または隣接要素を入れ替えるバブルソートの動きと混同するミス。覚え方: 選択ソートは「未整列部分の最小値」と「先頭」を交換する、を毎回繰り返す。"}, {"id": 21, "cat": "アルゴリズム・プログラミング", "topic": "二分探索", "q": "二分探索を行うための前提として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "データが整列済み"}, {"label": "イ", "text": "データ件数が偶数"}, {"label": "ウ", "text": "重複がない"}, {"label": "エ", "text": "配列長が10以下"}], "correct": "ア", "hint": "正解理由: 二分探索は中央の値と比較しながら探索範囲を半分に絞り込むため、対象データがあらかじめ整列(ソート)されている必要がある。間違いやすいポイント: 件数の偶奇や配列長の上限など、探索の前提と無関係な条件を選んでしまうミス。覚え方: 二分探索は「順番に並んでいるからこそ、真ん中と比べて絞り込める」。"}, {"id": 22, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数", "q": "関数f(n)を、n=0なら0、それ以外なら2+f(n-1)とする。f(4)はどれか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "8"}], "correct": "エ", "hint": "正解理由: f(4)=2+f(3)=2+2+f(2)=2+2+2+f(1)=2+2+2+2+f(0)=2×4+0=8になる。間違いやすいポイント: 2を掛ける回数(4回)を数え間違える、またはf(0)=0を忘れるミス。覚え方: 「nが0のとき」という基底条件を確認し、そこから2をn回加えると考える。"}, {"id": 23, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ法", "q": "ハッシュ法で衝突が発生した状態を何というか。", "choices": [{"label": "ア", "text": "スワップ"}, {"label": "イ", "text": "デッドロック"}, {"label": "ウ", "text": "コリジョン"}, {"label": "エ", "text": "オーバーフロー"}], "correct": "ウ", "hint": "正解理由: 異なるキーのハッシュ値が同じ格納位置になることをコリジョン(衝突)という。間違いやすいポイント: オーバーフロー(容量超過)やデッドロック(相互待ち状態)と混同するミス。覚え方: コリジョン(collision)は英語でも「衝突」の意味。ハッシュ表特有の現象として覚える。"}, {"id": 24, "cat": "ソフトウェア・開発", "topic": "バージョン管理", "q": "複数人でソースコードの変更履歴を管理するために使うものはどれか。", "choices": [{"label": "ア", "text": "RAID"}, {"label": "イ", "text": "Git"}, {"label": "ウ", "text": "DNS"}, {"label": "エ", "text": "SMTP"}], "correct": "イ", "hint": "正解理由: Gitは分散型のバージョン管理システムであり、複数人でのソースコードの変更履歴管理に広く使われる。間違いやすいポイント: DNSやRAID、SMTPなど、全く異なる分野の用語と混同するミス。覚え方: バージョン管理と言えばGit、と直結させて覚える。"}, {"id": 25, "cat": "ソフトウェア・開発", "topic": "テスト駆動開発(TDD)", "q": "テスト駆動開発(TDD)の進め方として適切なものはどれか。", "choices": [{"label": "ア", "text": "設計を行わない"}, {"label": "イ", "text": "テストを自動化しない"}, {"label": "ウ", "text": "実装後にだけテストを書く"}, {"label": "エ", "text": "先にテストを書き、実装して通す"}], "correct": "エ", "hint": "正解理由: TDD(テスト駆動開発)は、先に失敗するテストを書き、それを通すように実装を進める開発手法である。間違いやすいポイント: 「テストは実装後に書くもの」という一般的な順序と逆であることを見落とすミス。覚え方: TDDは「テスト(Test)が駆動(Driven)する開発」、つまりテストが先。"}, {"id": 26, "cat": "ソフトウェア・開発", "topic": "バージョン管理", "q": "変更をレビューしてからメインブランチへ統合する仕組みはどれか。", "choices": [{"label": "ア", "text": "ロールバック"}, {"label": "イ", "text": "プルリクエスト"}, {"label": "ウ", "text": "ポーリング"}, {"label": "エ", "text": "スワップ"}], "correct": "イ", "hint": "正解理由: プルリクエスト(Pull Request、Merge Request)は、変更内容をレビューしてからメインブランチへ統合するための仕組みである。間違いやすいポイント: ロールバックやスワップなど、開発フローと無関係なDB/OS用語と混同するミス。覚え方: プルリクエストは「取り込んで、の依頼」＝レビューを経て合流する仕組み。"}, {"id": 27, "cat": "情報セキュリティ", "topic": "電子署名", "q": "送信者本人であることと改ざんされていないことを確認するために用いるものはどれか。", "choices": [{"label": "ア", "text": "デジタル署名"}, {"label": "イ", "text": "圧縮"}, {"label": "ウ", "text": "RAID"}, {"label": "エ", "text": "キャッシュ"}], "correct": "ア", "hint": "正解理由: デジタル署名は、送信者本人であることの証明(真正性)と、データが途中で改ざんされていないこと(完全性)を確認するために使われる。間違いやすいポイント: 圧縮やRAID、キャッシュなど、セキュリティと無関係な技術と混同するミス。覚え方: デジタル署名は「誰が送ったか」+「途中で変わっていないか」を確認する仕組み。"}, {"id": 28, "cat": "情報セキュリティ", "topic": "認証強化", "q": "不正ログイン対策として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "多要素認証を利用する"}, {"label": "イ", "text": "ログを残さない"}, {"label": "ウ", "text": "同じパスワードを使い回す"}, {"label": "エ", "text": "パスワードを短くする"}], "correct": "ア", "hint": "正解理由: 多要素認証(MFA)は、パスワードに加えて別の要素(ワンタイムコードや生体認証など)を組み合わせることで、不正ログインへの耐性を高める。間違いやすいポイント: パスワードを短くする、使い回すなど、むしろセキュリティを弱める選択肢に惑わされるミス。覚え方: 不正ログイン対策の基本は「認証要素を増やす」こと。"}, {"id": 29, "cat": "情報セキュリティ", "topic": "SQLインジェクション対策", "q": "SQLインジェクション対策として有効なものはどれか。", "choices": [{"label": "ア", "text": "プレースホルダを使う"}, {"label": "イ", "text": "DNSを無効にする"}, {"label": "ウ", "text": "パスワードを平文保存する"}, {"label": "エ", "text": "ポート番号を固定する"}], "correct": "ア", "hint": "正解理由: プレースホルダ(パラメータ化クエリ)を使うことで、入力値がSQL文の一部として解釈されるのを防げる。間違いやすいポイント: パスワード保存やポート番号、DNSなど、SQLインジェクションと直接関係のない選択肢に惑わされるミス。覚え方: SQLインジェクション対策は「入力値とSQL文を混ぜない」がキーワード。"}, {"id": 30, "cat": "情報セキュリティ", "topic": "3-2-1バックアップルール", "q": "ランサムウェア対策として有効なものはどれか。", "choices": [{"label": "ア", "text": "バックアップを同じPC内だけに置く"}, {"label": "イ", "text": "3-2-1ルールを用いる"}, {"label": "ウ", "text": "OS更新を止める"}, {"label": "エ", "text": "ログを削除する"}], "correct": "イ", "hint": "正解理由: 3-2-1ルール(3コピー、2種類の媒体、1つはオフサイト保管)に基づくバックアップは、ランサムウェアによる被害からの復旧に有効である。間違いやすいポイント: 同じPC内だけにバックアップを置くと、ランサムウェアに一緒に暗号化されてしまう点を見落とすミス。覚え方: バックアップは「離れた場所」に「複数の形」で持つことが鉄則。"}, {"id": 31, "cat": "プロジェクトマネジメント", "topic": "三点見積り(PERT)", "q": "PERTで楽観値3、最頻値6、悲観値9の期待値はどれか。", "choices": [{"label": "ア", "text": "5"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "7"}], "correct": "ウ", "hint": "正解理由: PERT期待値=(楽観値+4×最頻値+悲観値)÷6=(3+4×6+9)/6=36/6=6になる。間違いやすいポイント: 4を掛ける対象を最頻値ではなく他の値にしてしまう計算ミス。覚え方: PERT期待値の式は「楽観+4×最頻+悲観を6で割る」という決まった形をそのまま覚える。"}, {"id": 32, "cat": "プロジェクトマネジメント", "topic": "WBS", "q": "WBSの説明として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "IPを割り当てる"}, {"label": "イ", "text": "売上を予測する"}, {"label": "ウ", "text": "作業を階層的に分解する"}, {"label": "エ", "text": "データを暗号化する"}], "correct": "ウ", "hint": "正解理由: WBS(Work Breakdown Structure)は、プロジェクトの作業を階層的に分解し、管理しやすい単位にする手法である。間違いやすいポイント: 売上予測やIP割当など全く異なる分野の用語と混同するミス。覚え方: WBSは「作業(Work)を分解(Breakdown)した構造(Structure)」と名前の通りに覚える。"}, {"id": 33, "cat": "プロジェクトマネジメント", "topic": "クリティカルパス", "q": "クリティカルパスの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "人数が最大の経路"}, {"label": "イ", "text": "最短の作業経路"}, {"label": "ウ", "text": "遅れると全体納期に影響する経路"}, {"label": "エ", "text": "費用が最小の経路"}], "correct": "ウ", "hint": "正解理由: クリティカルパスは、余裕(フロート)がなく、遅延がそのままプロジェクト全体の納期遅延に直結する最長経路である。間違いやすいポイント: 「最短」や費用・人数など、期間と無関係な観点と混同するミス。覚え方: クリティカルパスは「一番長い経路」かつ「一番遅れが許されない経路」。"}, {"id": 34, "cat": "サービスマネジメント", "topic": "インシデント管理", "q": "インシデント管理の主目的はどれか。", "choices": [{"label": "ア", "text": "新製品を設計する"}, {"label": "イ", "text": "長期戦略を立てる"}, {"label": "ウ", "text": "株価を予測する"}, {"label": "エ", "text": "サービスをできるだけ早く正常状態へ戻す"}], "correct": "エ", "hint": "正解理由: インシデント管理は、発生した障害やサービス中断を可能な限り早く正常な状態へ復旧させることを主目的とする。間違いやすいポイント: 長期戦略や製品設計など、インシデント管理の範囲外の業務と混同するミス。覚え方: インシデント管理は「今すぐ直す」、問題管理は「根本原因を追究する」と役割を分けて覚える。"}, {"id": 35, "cat": "経営・戦略・法務", "topic": "損益分岐点", "q": "損益分岐点売上高を求める式として適切なものはどれか。", "choices": [{"label": "ア", "text": "売上高÷固定費"}, {"label": "イ", "text": "固定費÷限界利益率"}, {"label": "ウ", "text": "固定費×変動費率"}, {"label": "エ", "text": "変動費÷売上高"}], "correct": "イ", "hint": "正解理由: 損益分岐点売上高=固定費÷限界利益率(限界利益率=限界利益÷売上高)で求められる。間違いやすいポイント: 損益分岐点「数量」の式(固定費÷1個あたり限界利益)と混同するミス。覚え方: 「数量」を求めるときは1個あたりの限界利益で割り、「金額」を求めるときは限界利益率で割る。"}, {"id": 36, "cat": "経営・戦略・法務", "topic": "PPM", "q": "PPMで市場成長率・市場占有率ともに高い事業はどれか。", "choices": [{"label": "ア", "text": "花形"}, {"label": "イ", "text": "負け犬"}, {"label": "ウ", "text": "金のなる木"}, {"label": "エ", "text": "問題児"}], "correct": "ア", "hint": "正解理由: PPMでは市場成長率と市場占有率がともに高い事業を「花形」と分類する。間違いやすいポイント: 「金のなる木」(成長率は低いが占有率が高い)と混同するミス。覚え方: 花形=両方高い、金のなる木=占有率だけ高い、問題児=成長率だけ高い、負け犬=両方低いと4象限を整理して覚える。"}, {"id": 37, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "SWOT分析でOpportunityが表すものはどれか。", "choices": [{"label": "ア", "text": "強み"}, {"label": "イ", "text": "弱み"}, {"label": "ウ", "text": "脅威"}, {"label": "エ", "text": "機会"}], "correct": "エ", "hint": "正解理由: Opportunity(機会)は自社にとって有利に働く外部環境の変化を指す。間違いやすいポイント: Strength(強み)やWeakness(弱み)など内部要因と混同するミス。覚え方: S(強み)とW(弱み)は自社の内部、O(機会)とT(脅威)は外部環境と2軸に分けて覚える。"}, {"id": 38, "cat": "経営・戦略・法務", "topic": "限界利益", "q": "売上高500万円、変動費300万円、固定費120万円のとき限界利益はいくらか。", "choices": [{"label": "ア", "text": "120万円"}, {"label": "イ", "text": "380万円"}, {"label": "ウ", "text": "200万円"}, {"label": "エ", "text": "80万円"}], "correct": "ウ", "hint": "正解理由: 限界利益=売上高-変動費=500-300=200万円になる(固定費はまだ引かない)。間違いやすいポイント: 固定費まで差し引いた営業利益(500-300-120=80万円)と混同するミス。覚え方: 限界利益=売上高-変動費、営業利益=限界利益-固定費、と2段階に分けて覚える。"}, {"id": 39, "cat": "経営・戦略・法務", "topic": "著作権", "q": "著作権の保護対象として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "単なる事実"}, {"label": "イ", "text": "アイデアそのもの"}, {"label": "ウ", "text": "数学の公式そのもの"}, {"label": "エ", "text": "表現されたプログラムコード"}], "correct": "エ", "hint": "正解理由: 著作権は、アイデアそのものではなく、具体的に表現されたもの(プログラムコードなど)を保護対象とする。間違いやすいポイント: アイデアや事実、数式そのものも著作権で保護されると誤解するミス。覚え方: 著作権が守るのは「アイデア」ではなく「表現」。プログラムは表現されたコードとして保護される。"}, {"id": 40, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法", "q": "ファンクションポイント法が主に基準とするものはどれか。", "choices": [{"label": "ア", "text": "利用者から見た機能量"}, {"label": "イ", "text": "ソースコード行数だけ"}, {"label": "ウ", "text": "開発者人数だけ"}, {"label": "エ", "text": "CPUクロック"}], "correct": "ア", "hint": "正解理由: ファンクションポイント法は、外部入出力や内部論理ファイルなど、利用者から見た機能量を基に開発規模を見積もる手法である。間違いやすいポイント: ソースコード行数(ステップ数法の考え方)と混同するミス。覚え方: ファンクションポイント法は「機能の数」を数える見積り手法、行数を数えるわけではない。"}];

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
          <div style={s.sub}>基本情報技術者 — 新規全体演習40問(重複を減らした新規セット)</div>
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
