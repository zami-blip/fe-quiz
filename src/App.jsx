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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "2の補数による負数表現(再出題対象)", "q": "8ビットの2の補数表現において、10進数の-37を表すビット列はどれか。", "choices": [{"label": "ア", "text": "11011010"}, {"label": "イ", "text": "00100101"}, {"label": "ウ", "text": "11011011"}, {"label": "エ", "text": "10100101"}], "correct": "ウ", "hint": "正解理由: 37(00100101)のビットを反転すると11011010、これに1を加えると11011011になる。間違いやすいポイント: 「反転して終わり」で止めてしまい+1を忘れるミスが多い。覚え方: 2の補数は「反転してから+1」。1の補数(反転だけ)と混同しないこと。"}, {"id": 2, "cat": "基礎理論", "topic": "論理式と真理値表の対応(OR回路)", "q": "論理式 A OR B の真理値表として正しいものはどれか。ここでA,Bは0または1、1が真を表す。", "choices": [{"label": "ア", "text": "A,Bの少なくとも一方が1なら1、両方0のときだけ0になる"}, {"label": "イ", "text": "A,Bが異なるときだけ1になる"}, {"label": "ウ", "text": "常にAの値と同じになる"}, {"label": "エ", "text": "A,Bがともに1のときだけ1になる"}], "correct": "ア", "hint": "正解理由: ORは論理和であり、どちらか一方でも真(1)であれば結果は真になる。間違いやすいポイント: ANDと混同し「両方とも1のときだけ」と誤答しやすい。覚え方: OR=「または」なので、条件の一つでも満たせばOK、両方0のときだけNG。"}, {"id": 3, "cat": "基礎理論", "topic": "排他的論理和(XOR)のビット演算", "q": "2進数01101と01011の排他的論理和(XOR)を求めるとどれか。", "choices": [{"label": "ア", "text": "00101"}, {"label": "イ", "text": "01001"}, {"label": "ウ", "text": "01111"}, {"label": "エ", "text": "00110"}], "correct": "エ", "hint": "正解理由: 各桁を比較し、異なる桁は1、同じ桁は0にする。01101と01011を1桁ずつ比較すると00110になる。間違いやすいポイント: ORやANDの計算と混同し、同じ桁も1にしてしまうミスが多い。覚え方: XORは「違いを検出する」演算。同じなら0、違えば1。"}, {"id": 4, "cat": "基礎理論", "topic": "計算量オーダーの比較(定数時間・線形・二乗)", "q": "データ件数nが十分大きいとき、O(1)、O(n)、O(n^2)の3つのアルゴリズムの処理時間を比較した記述として適切なものはどれか。", "choices": [{"label": "ア", "text": "3つとも件数が増えても処理時間は変わらない"}, {"label": "イ", "text": "O(1)が最も速く、O(n)、O(n^2)の順に遅くなる"}, {"label": "ウ", "text": "O(n)が常に最も速い"}, {"label": "エ", "text": "O(n^2)が最も速く、O(n)、O(1)の順に遅くなる"}], "correct": "イ", "hint": "正解理由: O(1)は件数に関係なく一定時間、O(n)は件数に比例、O(n^2)は件数の2乗に比例するため、この順に遅くなる。間違いやすいポイント: 「数字が大きいO(n^2)の方が速そう」という直感的な誤解をしやすい。覚え方: オーダー記法のnは「件数が増えたときの伸び方」を表す。数式のイメージではなくグラフの傾きで覚える。"}, {"id": 5, "cat": "コンピュータシステム", "topic": "並列システムの稼働率計算", "q": "稼働率0.85の装置2台を並列に接続したシステム全体の稼働率はどれか。", "choices": [{"label": "ア", "text": "0.925"}, {"label": "イ", "text": "0.85"}, {"label": "ウ", "text": "0.7225"}, {"label": "エ", "text": "0.9775"}], "correct": "エ", "hint": "正解理由: 並列システムは「両方とも同時に止まる確率」を1から引いて求める。1-(1-0.85)×(1-0.85)=1-0.0225=0.9775になる。間違いやすいポイント: 直列と同じように単純に掛け算(0.85×0.85)してしまうミスが多い。覚え方: 直列は「両方動いてこそ動く」ので掛け算、並列は「両方止まって初めて止まる」ので逆から考える。"}, {"id": 6, "cat": "コンピュータシステム", "topic": "CPU性能(MIPS値)の計算", "q": "クロック周波数900MHz、CPI(1命令当たりの平均クロック数)が3のプロセッサがある。この性能は約何MIPSか。", "choices": [{"label": "ア", "text": "2700"}, {"label": "イ", "text": "900"}, {"label": "ウ", "text": "270"}, {"label": "エ", "text": "300"}], "correct": "エ", "hint": "正解理由: MIPS=クロック周波数÷CPI÷10^6=900÷3=300MIPSになる。間違いやすいポイント: クロック周波数とCPIを掛けてしまう(900×3)符号の取り違えが多い。覚え方: CPIは「1命令に何クロックかかるか」なので、クロック数をCPIで割れば1秒あたりの命令数(MIPS)が出る。"}, {"id": 7, "cat": "コンピュータシステム", "topic": "パイプライン処理のクロック数計算", "q": "パイプラインなしでは1命令の実行に7クロックかかる処理を、7段のパイプラインで12命令連続して実行する場合、理想的には合計何クロックかかるか。", "choices": [{"label": "ア", "text": "18"}, {"label": "イ", "text": "84"}, {"label": "ウ", "text": "19"}, {"label": "エ", "text": "12"}], "correct": "ア", "hint": "正解理由: 最初の1命令に7クロック、以降は1クロックずつ増えるため、7+(12-1)×1=18クロックになる。間違いやすいポイント: 段数×命令数(7×12=84)を計算してしまい、パイプラインの重なりを考慮し忘れるミスが多い。覚え方: パイプラインは「流れ作業」なので、最初の1個だけフルにかかり、あとは1クロックずつずれて完成する。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "割込みの分類(外部割込みと内部割込み)", "q": "次の割込みのうち、内部割込みに分類されるものはどれか。", "choices": [{"label": "ア", "text": "プリンタが印刷完了を通知する割込み"}, {"label": "イ", "text": "タイマ回路が一定時間の経過を通知する割込み"}, {"label": "ウ", "text": "ゼロによる除算エラーが発生したことによる割込み"}, {"label": "エ", "text": "マウスがクリックされたことによる割込み"}], "correct": "ウ", "hint": "正解理由: ゼロ除算はプログラム自身の実行中に生じるエラーであるため内部割込みに分類される。間違いやすいポイント: 「割込み」という言葉から全て外部からの信号だと思い込みやすい。覚え方: 内部割込みは「プログラム自身が原因」、外部割込みは「周辺機器やタイマなど外からの信号が原因」と主語で区別する。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュのヒット率が85%、キャッシュのアクセス時間が8ナノ秒、主記憶のアクセス時間が60ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "68"}, {"label": "イ", "text": "15.8"}, {"label": "ウ", "text": "34"}, {"label": "エ", "text": "17.8"}], "correct": "イ", "hint": "正解理由: 実効アクセス時間=0.85×8+0.15×60=6.8+9=15.8ナノ秒になる。間違いやすいポイント: ヒット率とミス率(1-ヒット率)を掛ける相手を逆にしてしまうミスが多い。覚え方: 「ヒットした確率×キャッシュの時間」＋「外れた確率×主記憶の時間」という加重平均の形をそのまま式にする。"}, {"id": 10, "cat": "コンピュータシステム", "topic": "RAID5の実効容量計算", "q": "1台150GBのディスク8台でRAID5を構成した場合の実効容量は何GBか。", "choices": [{"label": "ア", "text": "1050"}, {"label": "イ", "text": "1200"}, {"label": "ウ", "text": "1350"}, {"label": "エ", "text": "900"}], "correct": "ア", "hint": "正解理由: RAID5はn台のうち1台分をパリティに使うため、実効容量は(8-1)×150=1,050GBになる。間違いやすいポイント: 台数をそのまま全部掛けてしまい(8×150)パリティ分を引き忘れるミスが多い。覚え方: RAID5は「n台のうち1台はパリティ専用」と覚え、必ず(台数-1)から計算を始める。"}, {"id": 11, "cat": "ネットワーク", "topic": "CIDR表記からのネットワークアドレスの特定", "q": "IPアドレス10.0.5.70にサブネットマスク255.255.255.240(/28)を適用したとき、このホストが属するネットワークアドレスはどれか。", "choices": [{"label": "ア", "text": "10.0.5.0"}, {"label": "イ", "text": "10.0.5.80"}, {"label": "ウ", "text": "10.0.5.64"}, {"label": "エ", "text": "10.0.5.48"}], "correct": "ウ", "hint": "正解理由: /28は16個区切り(0,16,32,48,64,80…)であり、70は64～79の範囲に含まれるため、ネットワークアドレスは10.0.5.64になる。間違いやすいポイント: 区切り幅(この場合16)を計算せず、キリのよい数字(10.0.5.0など)を選んでしまうミスが多い。覚え方: 区切り幅=256÷2^(ホストビット数)。/28ならホスト部4ビットなので256÷16=16刻みで区切りが並ぶ。"}, {"id": 12, "cat": "ネットワーク", "topic": "サブネットにおける使用可能ホスト数の計算", "q": "サブネットマスクが/30であるネットワークにおいて、割り当て可能なホストアドレスの最大数はどれか。", "choices": [{"label": "ア", "text": "6"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "14"}, {"label": "エ", "text": "2"}], "correct": "エ", "hint": "正解理由: /30はホスト部が2ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^2-2=2個になる。間違いやすいポイント: 「2を引く」ことを忘れて2^2=4個と誤答しやすい。覚え方: 「ホストビット数を2で累乗してから、必ず2を引く」を一つのセットとして覚える(先頭と末尾は使えない)。"}, {"id": 13, "cat": "ネットワーク", "topic": "TCPとUDPの使い分け", "q": "ファイルのダウンロードのように、1バイトの欠損も許されず、確実に完全なデータを受信したい通信で用いられるプロトコルはどれか。", "choices": [{"label": "ア", "text": "UDP"}, {"label": "イ", "text": "TCP"}, {"label": "ウ", "text": "ARP"}, {"label": "エ", "text": "ICMP"}], "correct": "イ", "hint": "正解理由: TCPは確認応答・再送制御・順序制御を行うため、データの欠損や順序の乱れを許容できない用途に適している。間違いやすいポイント: 「速いから」という理由でUDPを選んでしまいやすいが、ここで問われているのは信頼性である。覚え方: TCP=「届いたか確認する」通信、UDP=「届いたかは気にせず速さ優先」の通信。"}, {"id": 14, "cat": "ネットワーク", "topic": "IDSとIPSの機能の違い", "q": "不正な通信を検知した場合に、検知するだけでなく自動的に通信を遮断する機能をもつものはどれか。", "choices": [{"label": "ア", "text": "DHCP"}, {"label": "イ", "text": "IPS(侵入防止システム)"}, {"label": "ウ", "text": "DNS"}, {"label": "エ", "text": "IDS(侵入検知システム)"}], "correct": "イ", "hint": "正解理由: IPS(Intrusion Prevention System)は検知に加えて自動的な遮断まで行う。IDS(Intrusion Detection System)は検知して通知するだけで、遮断は行わない。間違いやすいポイント: IDSとIPSの略語が似ているため機能を逆に覚えてしまいやすい。覚え方: IPSの「P」はPrevention(防止)＝遮断まで行う、IDSの「D」はDetection(検知)＝知らせるだけ。"}, {"id": 15, "cat": "ネットワーク", "topic": "ルータの役割(OSI参照モデルにおける階層)", "q": "複数のネットワークを相互に接続し、IPアドレスを基にパケットの転送先を決定する機器はどれか。", "choices": [{"label": "ア", "text": "スイッチングハブ"}, {"label": "イ", "text": "リピータ"}, {"label": "ウ", "text": "ルータ"}, {"label": "エ", "text": "ブリッジ"}], "correct": "ウ", "hint": "正解理由: ルータはネットワーク層(OSI第3層)でIPアドレスを基に経路選択(ルーティング)を行い、異なるネットワーク同士を接続する。間違いやすいポイント: MACアドレスで転送するスイッチングハブ(データリンク層)と役割を混同しやすい。覚え方: ルータは「IPアドレスで道を選ぶ」、スイッチは「MACアドレスで席を割り振る」とイメージで区別する。"}, {"id": 16, "cat": "ネットワーク", "topic": "回線速度からの転送時間の計算", "q": "450Mバイトのデータを150Mビット/秒の回線で転送するのに理論上かかる時間は何秒か。1M=10^6とする。", "choices": [{"label": "ア", "text": "36"}, {"label": "イ", "text": "48"}, {"label": "ウ", "text": "12"}, {"label": "エ", "text": "24"}], "correct": "エ", "hint": "正解理由: 450Mバイト=3,600Mビットであり、150Mビット/秒の回線では3,600÷150=24秒かかる。間違いやすいポイント: バイトとビットの単位変換(×8)を忘れて計算してしまうミスが最も多い。覚え方: 「データ量(バイト)を8倍してビットに揃えてから、回線速度(ビット/秒)で割る」を必ずセットで行う。"}, {"id": 17, "cat": "アルゴリズム・プログラミング", "topic": "後置記法(逆ポーランド記法)の式の評価【レベル1】", "q": "後置記法(逆ポーランド記法)の式 8 2 3 * - を計算した結果はどれか。", "choices": [{"label": "ア", "text": "18"}, {"label": "イ", "text": "2"}, {"label": "ウ", "text": "14"}, {"label": "エ", "text": "3"}], "correct": "イ", "hint": "正解理由: 8,2,3をスタックへ積み、*が現れたら2と3を取り出して2×3=6を計算しスタックへ戻す(スタックは[8,6])。次に-が現れたら8と6を取り出して8-6=2を計算する。間違いやすいポイント: 演算子の左右どちらが先に積まれた値かを取り違え、6-8=-2のように符号を逆にしてしまうミスが多い。覚え方: スタックから取り出す順は「後に積んだ方が先(上から順)」。減算・除算は順序が結果に影響するため特に注意。"}, {"id": 18, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表への線形探索法による格納【レベル1】", "q": "大きさ5のハッシュ表(格納場所は0番目から4番目)に、ハッシュ関数h(k)=k mod 5と線形探索法(衝突時は次の番地を順に調べる)を用いて、キー6, 11, 16をこの順に格納する。16が格納される場所は何番目か。", "choices": [{"label": "ア", "text": "3番目"}, {"label": "イ", "text": "2番目"}, {"label": "ウ", "text": "1番目"}, {"label": "エ", "text": "4番目"}], "correct": "ア", "hint": "正解理由: 6はh(6)=1で1番目、11はh(11)=1で衝突するため2番目、16もh(16)=1で衝突し、1番目・2番目も使用済みのため3番目に格納される。間違いやすいポイント: 最初に計算したハッシュ値の位置をそのまま答えてしまい、衝突による移動を反映し忘れるミスが多い。覚え方: 衝突したら「次の番地が空くまで」1つずつ進める、を実際に手を動かして確認する。"}, {"id": 19, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数のトレース【レベル2】", "q": "関数s(n)を「nが0のとき0を返し、それ以外はn+s(n-1)を返す」と定義する。s(6)の値はどれか。", "choices": [{"label": "ア", "text": "21"}, {"label": "イ", "text": "30"}, {"label": "ウ", "text": "36"}, {"label": "エ", "text": "15"}], "correct": "ア", "hint": "正解理由: s(6)=6+s(5)=6+5+s(4)=…と展開すると6+5+4+3+2+1+0=21になる。間違いやすいポイント: 展開を最後まで追わずに途中で計算を打ち切ってしまう、またはs(0)=0を忘れて1から数えてしまうミスが多い。覚え方: 「nが0のとき」という基底部分(終了条件)を必ず最初に確認し、そこから逆算して積み上げていく。"}, {"id": 20, "cat": "アルゴリズム・プログラミング", "topic": "クイックソートの1回目の分割によるピボットの確定位置【レベル2】", "q": "配列{13, 4, 9, 6, 15, 8}の末尾の8をピボットとし、左から順に調べて「8以下」を左側へ集め、最後にピボットを境界へ置く分割を1回行う。分割後、ピボット8の確定位置は先頭から何番目か。", "choices": [{"label": "ア", "text": "4番目"}, {"label": "イ", "text": "5番目"}, {"label": "ウ", "text": "3番目"}, {"label": "エ", "text": "2番目"}], "correct": "ウ", "hint": "正解理由: 8以下の要素は4と6の2個であり、ピボットはそれらの直後、先頭から3番目に確定する。間違いやすいポイント: ピボット自身を「8以下」の個数に含めてしまい、1つ多く数えるミスが多い。覚え方: 「ピボット以下の個数+1」がピボットの確定位置になる、と公式化して覚える。"}];

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
          <div style={s.sub}>基本情報技術者 — 弱点補強20問(ネットワーク・コンピュータシステム・基礎理論中心)</div>
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
