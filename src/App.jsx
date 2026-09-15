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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "16進小数から10進小数への変換", "q": "16進小数0.3を10進小数で表したものはどれか。", "choices": [{"label": "ア", "text": "0.1875"}, {"label": "イ", "text": "0.3"}, {"label": "ウ", "text": "0.1"}, {"label": "エ", "text": "0.5"}], "correct": "ア", "hint": "16進の1桁は4ビットに相当し、0.3=3/16=0.1875になる。"}, {"id": 2, "cat": "基礎理論", "topic": "重み付きくじの賞金期待値", "q": "20本のくじのうち3本が当たりで、当たると1,000円、外れると0円がもらえる。このくじを1本引いたときの賞金の期待値はどれか。", "choices": [{"label": "ア", "text": "150円"}, {"label": "イ", "text": "300円"}, {"label": "ウ", "text": "200円"}, {"label": "エ", "text": "100円"}], "correct": "ア", "hint": "期待値=1,000円×(3/20)+0円×(17/20)=150円になる。"}, {"id": 3, "cat": "基礎理論", "topic": "2の補数による負数表現", "q": "8ビットの2の補数表現において、10進数の-12を表すビット列はどれか。", "choices": [{"label": "ア", "text": "10001100"}, {"label": "イ", "text": "00001100"}, {"label": "ウ", "text": "11110011"}, {"label": "エ", "text": "11110100"}], "correct": "エ", "hint": "12(00001100)のビットを反転すると11110011、これに1を加えると11110100になり、これが-12の2の補数表現である。"}, {"id": 4, "cat": "基礎理論", "topic": "NAND素子だけでAND回路を構成する方法", "q": "論理回路の設計において、NAND素子(NOT AND)だけを使ってAND素子と同じ入出力の関係をもつ回路を作りたい。適切な構成はどれか。", "choices": [{"label": "ア", "text": "NAND素子1つの片方の入力だけを使い、もう片方は常に開放にしておく"}, {"label": "イ", "text": "NAND素子を並列に2つ並べ、それぞれの出力を単純に足し合わせる"}, {"label": "ウ", "text": "NAND素子の出力をそのまま使う(1段だけでよい)"}, {"label": "エ", "text": "1つのNAND素子の出力を、別のNAND素子の両方の入力端子に接続する(NANDを2段直列に重ねる)"}], "correct": "エ", "hint": "NAND素子の出力はANDの結果を反転したものであるため、その出力をもう一段のNAND素子へ入れて再度反転させると、ANDと同じ働きになる。"}, {"id": 5, "cat": "基礎理論", "topic": "パリティビットで検出できない誤りのパターン", "q": "1ビットの偶数パリティを付加して伝送する通信方式について、パリティチェックだけでは検出できない誤りはどれか。", "choices": [{"label": "ア", "text": "5ビットが同時に反転する誤り"}, {"label": "イ", "text": "3ビットが同時に反転する誤り"}, {"label": "ウ", "text": "同一データ内で偶数個のビットが同時に反転する誤り"}, {"label": "エ", "text": "1ビットだけが反転する誤り"}], "correct": "ウ", "hint": "偶数パリティは1の個数の偶奇を検査する仕組みであるため、偶数個のビットが同時に反転すると1の個数の偶奇が変化せず、誤りとして検出できない。"}, {"id": 6, "cat": "基礎理論", "topic": "計算量オーダーとデータ件数増加の関係", "q": "あるアルゴリズムの処理時間がデータ件数nに対してO(n^2)で表されるとき、データ件数が3倍になると処理時間はおよそ何倍になるか。", "choices": [{"label": "ア", "text": "27倍"}, {"label": "イ", "text": "9倍"}, {"label": "ウ", "text": "3倍"}, {"label": "エ", "text": "6倍"}], "correct": "イ", "hint": "O(n^2)は件数の2乗に比例するため、件数が3倍になると処理時間は3^2=9倍になる。"}, {"id": 7, "cat": "アルゴリズム・プログラミング", "topic": "片方向連結リストの要素の削除", "q": "片方向連結リストで先頭からP→Q→Rの順に連結されている。Qを削除して先頭からP→Rとしたい場合に必要な操作はどれか。", "choices": [{"label": "ア", "text": "Qの次ポインタが指す先をPへ変更するだけでよい"}, {"label": "イ", "text": "Rの次ポインタが指す先をQからPへ変更する"}, {"label": "ウ", "text": "Pの次ポインタが指す先をQからRへ変更する"}, {"label": "エ", "text": "Pを削除してからQとRを直接連結する"}], "correct": "ウ", "hint": "Qを読み飛ばすには、直前の要素であるPの次ポインタの参照先を、Qの次であったRへ書き換えればよい。"}, {"id": 8, "cat": "アルゴリズム・プログラミング", "topic": "乗算による最小公倍数の流れ図トレース", "q": "変数aを8、変数bを12として、「aとbの最大公約数gを求め、その後 a×b÷g を計算する」処理を行う。この処理で最終的に得られる値はどれか。", "choices": [{"label": "ア", "text": "4"}, {"label": "イ", "text": "96"}, {"label": "ウ", "text": "48"}, {"label": "エ", "text": "24"}], "correct": "エ", "hint": "8と12の最大公約数は4であり、最小公倍数は8×12÷4=24になる。"}, {"id": 9, "cat": "アルゴリズム・プログラミング", "topic": "二分探索木への挿入と前順(preorder)走査", "q": "空の二分探索木に40, 25, 60, 10, 30, 50, 70の順で値を挿入した。この木を前順(根→左部分木→右部分木の順)で走査した結果はどれか。", "choices": [{"label": "ア", "text": "40, 60, 70, 50, 25, 30, 10"}, {"label": "イ", "text": "40, 25, 10, 30, 60, 50, 70"}, {"label": "ウ", "text": "10, 25, 30, 40, 50, 60, 70"}, {"label": "エ", "text": "70, 60, 50, 40, 30, 25, 10"}], "correct": "イ", "hint": "この挿入順で構成される木を前順走査すると、根→左部分木→右部分木の順で出力され、40, 25, 10, 30, 60, 50, 70になる。"}, {"id": 10, "cat": "アルゴリズム・プログラミング", "topic": "クイックソートの1回目の分割によるピボットの確定位置", "q": "配列{9, 4, 7, 2, 8, 5}の末尾の5をピボットとし、左から順に調べて「5以下」を左側へ集め、最後にピボットを境界へ置く分割を1回行う。分割後、ピボット5の確定位置は先頭から何番目か。", "choices": [{"label": "ア", "text": "4番目"}, {"label": "イ", "text": "5番目"}, {"label": "ウ", "text": "3番目"}, {"label": "エ", "text": "2番目"}], "correct": "ウ", "hint": "5以下の要素は4と2の2個であり、ピボットはそれらの直後、先頭から3番目に確定する。"}, {"id": 11, "cat": "アルゴリズム・プログラミング", "topic": "前置記法(ポーランド記法)の式の評価", "q": "前置記法(ポーランド記法)で書かれた式 * + 2 3 4 を計算した結果はどれか。ここで前置記法は「演算子 被演算子1 被演算子2」の順で書かれる。", "choices": [{"label": "ア", "text": "14"}, {"label": "イ", "text": "24"}, {"label": "ウ", "text": "9"}, {"label": "エ", "text": "20"}], "correct": "エ", "hint": "内側の + 2 3 をまず計算すると2+3=5になり、外側の * 5 4 を計算すると5×4=20になる。"}, {"id": 12, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数によるべき乗計算のトレース", "q": "関数g(x, n)を「nが0のとき1を返し、それ以外はx×g(x, n-1)を返す」と定義する。g(2, 5)の値はどれか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "32"}, {"label": "ウ", "text": "16"}, {"label": "エ", "text": "64"}], "correct": "イ", "hint": "g(2,5)=2×g(2,4)=2×2×g(2,3)=…と展開すると2の5乗となり、2^5=32になる。"}, {"id": 13, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表への線形探索法(オープンアドレス法)による格納", "q": "大きさ5のハッシュ表(格納場所は0番目から4番目)に、ハッシュ関数h(k)=k mod 5と線形探索法(衝突時は次の番地を順に調べ、末尾の次は先頭に戻る)を用いて、キー12, 7, 17をこの順に格納する。17が格納される場所は何番目か。", "choices": [{"label": "ア", "text": "2番目"}, {"label": "イ", "text": "4番目"}, {"label": "ウ", "text": "3番目"}, {"label": "エ", "text": "0番目"}], "correct": "イ", "hint": "12はh(12)=2で2番目に格納される。7はh(7)=2で衝突するため3番目に格納される。17もh(17)=2で衝突し、3番目も使用済みのため4番目に格納される。"}, {"id": 14, "cat": "アルゴリズム・プログラミング", "topic": "二分探索の最大比較回数の計算", "q": "整列済みの512件のデータに対して二分探索を行う場合、最悪の場合の比較回数はどれか。", "choices": [{"label": "ア", "text": "16"}, {"label": "イ", "text": "32"}, {"label": "ウ", "text": "9"}, {"label": "エ", "text": "7"}], "correct": "ウ", "hint": "比較回数はlog2(データ件数)に相当し、log2(512)=9回になる。"}, {"id": 15, "cat": "コンピュータシステム", "topic": "メモリインタリーブによる高速化の仕組み", "q": "主記憶を複数の独立したバンクに分割し、連続するアドレスを異なるバンクに割り当てるメモリインタリーブについて、連続領域への読み出しが高速化される理由として適切なものはどれか。", "choices": [{"label": "ア", "text": "CPUのクロック周波数が上がるため"}, {"label": "イ", "text": "主記憶の総容量が増えるため"}, {"label": "ウ", "text": "データを圧縮して転送するため"}, {"label": "エ", "text": "複数のバンクへ並行してアクセスを開始でき、各バンクのアクセス待ち時間が重なり合うため"}], "correct": "エ", "hint": "連続アドレスが異なるバンクに分散配置されるため、複数バンクへ並行してアクセスを開始でき、1つのバンクのアクセス待ち時間中に他のバンクの読み出しを進められる。"}, {"id": 16, "cat": "コンピュータシステム", "topic": "エッジコンピューティングとクラウド処理の使い分け", "q": "自動運転車が数十ミリ秒以内に障害物を検知して急ブレーキをかける判断を行いたい。この処理を遠隔地のクラウドサーバに送信してから結果を待つ方式では間に合わない可能性が高い。より適した処理方式はどれか。", "choices": [{"label": "ア", "text": "車両やその近傍でデータを処理するエッジコンピューティング"}, {"label": "イ", "text": "判断結果を紙の記録として後日確認する方式"}, {"label": "ウ", "text": "全ての判断をデータセンタのクラウドサーバに一元集約する方式"}, {"label": "エ", "text": "月次バッチで走行データをまとめて解析する方式"}], "correct": "ア", "hint": "クラウドへの送信は通信の往復遅延を伴うため、即時性が求められる判断は、データ発生源に近い場所で処理するエッジコンピューティングが適している。"}, {"id": 17, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュのヒット率が92%、キャッシュのアクセス時間が6ナノ秒、主記憶のアクセス時間が90ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "9.72"}, {"label": "イ", "text": "15.72"}, {"label": "ウ", "text": "12.72"}, {"label": "エ", "text": "6.72"}], "correct": "ウ", "hint": "実効アクセス時間=0.92×6+0.08×90=5.52+7.2=12.72ナノ秒になる。"}, {"id": 18, "cat": "コンピュータシステム", "topic": "RAID5の実効容量計算", "q": "1台250GBのディスク6台でRAID5を構成した場合の実効容量は何GBか。", "choices": [{"label": "ア", "text": "1750"}, {"label": "イ", "text": "1000"}, {"label": "ウ", "text": "1250"}, {"label": "エ", "text": "1500"}], "correct": "ウ", "hint": "RAID5はn台のうち1台分をパリティに使うため、実効容量は(6-1)×250=1,250GBになる。"}, {"id": 19, "cat": "コンピュータシステム", "topic": "直列システムの稼働率計算", "q": "稼働率0.98の装置を4台直列に接続したシステム全体の稼働率に最も近いものはどれか。", "choices": [{"label": "ア", "text": "0.96"}, {"label": "イ", "text": "0.92"}, {"label": "ウ", "text": "0.88"}, {"label": "エ", "text": "0.84"}], "correct": "イ", "hint": "直列システムの稼働率は各装置の稼働率の積であり、0.98の4乗≒0.922、最も近いのは0.92になる。"}, {"id": 20, "cat": "コンピュータシステム", "topic": "割込みの分類(外部割込みと内部割込み)", "q": "次の割込みのうち、内部割込みに分類されるものはどれか。", "choices": [{"label": "ア", "text": "プリンタが印刷完了を通知する割込み"}, {"label": "イ", "text": "タイマ回路が一定時間の経過を通知する割込み"}, {"label": "ウ", "text": "マウスのクリック操作による割込み"}, {"label": "エ", "text": "実行中のプログラムでスタックオーバーフローが発生したことによる割込み"}], "correct": "エ", "hint": "スタックオーバーフローはプログラム自身の実行中に生じるため内部割込みに分類される。他の選択肢はいずれも周辺機器やタイマなど外部からの信号による外部割込みである。"}, {"id": 21, "cat": "コンピュータシステム", "topic": "コンテナ型仮想化が適する場面", "q": "1台の物理サーバ上に、OS起動のオーバーヘッドを抑えながら多数の独立したアプリケーション実行環境を迅速に構築・破棄したい。最も適した技術はどれか。", "choices": [{"label": "ア", "text": "物理サーバの追加購入による対応"}, {"label": "イ", "text": "コンテナ型仮想化"}, {"label": "ウ", "text": "ハイパーバイザ型の完全仮想化(各環境にゲストOSを個別導入)"}, {"label": "エ", "text": "デュアルブート環境の構築"}], "correct": "イ", "hint": "コンテナ型仮想化はホストOSのカーネルを複数のコンテナで共有するため、ゲストOSを個別に起動するハイパーバイザ型よりも軽量かつ迅速に環境を構築・破棄できる。"}, {"id": 22, "cat": "ネットワーク", "topic": "WAFの設置場所", "q": "次の図の構成において、Webアプリケーションへの攻撃を検査・遮断するWAFを設置すべき最も適切な箇所はどこか。ここで、ロードバランサでSSL通信が復号されるものとし、WAF自体には暗号化・復号機能はないものとする。\nインターネット─(a)─ファイアウォール─(b)─ロードバランサ─(c)─Webサーバ群─(d)─データベースサーバ", "choices": [{"label": "ア", "text": "(d)"}, {"label": "イ", "text": "(a)"}, {"label": "ウ", "text": "(c)"}, {"label": "エ", "text": "(b)"}], "correct": "ウ", "hint": "WAFはHTTP通信の内容を検査する必要があるため、ロードバランサで復号された後、Webサーバ群への平文通信が流れる(c)の位置に設置する必要がある。"}, {"id": 23, "cat": "ネットワーク", "topic": "サブネットにおける使用可能ホスト数の計算", "q": "サブネットマスクが/29であるネットワークにおいて、割り当て可能なホストアドレスの最大数はどれか。", "choices": [{"label": "ア", "text": "14"}, {"label": "イ", "text": "30"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "2"}], "correct": "ウ", "hint": "/29はホスト部が3ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^3-2=6個になる。"}, {"id": 24, "cat": "ネットワーク", "topic": "低遅延を優先する通信に適したプロトコル", "q": "スマートフォン向けの音声通話アプリで、多少の音声の途切れが生じても、確認応答や再送によって遅延が増えることを避けたい。このような用途で一般的に用いられるトランスポート層のプロトコルはどれか。", "choices": [{"label": "ア", "text": "SMTP"}, {"label": "イ", "text": "UDP"}, {"label": "ウ", "text": "FTP"}, {"label": "エ", "text": "TCP"}], "correct": "イ", "hint": "UDPは確認応答や再送制御を行わないため低遅延だが信頼性は低く、多少の欠損より低遅延を優先する音声・映像通話などの用途に適している。"}, {"id": 25, "cat": "ネットワーク", "topic": "名前解決の仕組み(DNS)", "q": "社内のメールサーバがmail.example.co.jp宛のメールを外部へ送信する際、送信先ドメインexample.co.jpに対応するメールサーバのアドレス情報を得るために問い合わせる仕組みはどれか。", "choices": [{"label": "ア", "text": "DNS"}, {"label": "イ", "text": "NTP"}, {"label": "ウ", "text": "DHCP"}, {"label": "エ", "text": "SNMP"}], "correct": "ア", "hint": "DNSはドメイン名に対応するIPアドレスやメールサーバの情報(MXレコード等)を解決する仕組みである。"}, {"id": 26, "cat": "ネットワーク", "topic": "回線速度からの転送時間の計算", "q": "600Mバイトのデータを200Mビット/秒の回線で転送するのに理論上かかる時間は何秒か。1M=10^6とする。", "choices": [{"label": "ア", "text": "24"}, {"label": "イ", "text": "12"}, {"label": "ウ", "text": "48"}, {"label": "エ", "text": "36"}], "correct": "ア", "hint": "600Mバイト=4,800Mビットであり、200Mビット/秒の回線では4,800÷200=24秒かかる。"}, {"id": 27, "cat": "データベース", "topic": "推移的関数従属の排除による正規化", "q": "ある表で「注文番号→顧客コード」「顧客コード→顧客名」という関数従属が成立するとき、顧客名は注文番号にどのように従属しているか。", "choices": [{"label": "ア", "text": "推移的に従属している"}, {"label": "イ", "text": "直接に(部分従属なく)従属している"}, {"label": "ウ", "text": "従属していない"}, {"label": "エ", "text": "顧客名は主キーである"}], "correct": "ア", "hint": "顧客名は顧客コードを経由して注文番号に間接的に従属しており、これを推移的関数従属と呼ぶ。"}, {"id": 28, "cat": "データベース", "topic": "トランザクションの原子性(atomicity)", "q": "在庫を1個減らす処理と売上金額を加算する処理を1つのトランザクションとして実行中に、在庫の更新後、売上加算の直前でシステム障害が発生した。トランザクション管理が保証すべき挙動として適切なものはどれか。", "choices": [{"label": "ア", "text": "エラーを無視して次の処理へ進む"}, {"label": "イ", "text": "在庫の更新だけは確定させ、売上加算は後で手動処理する"}, {"label": "ウ", "text": "在庫の更新も取り消し、処理開始前の状態に戻す"}, {"label": "エ", "text": "在庫を更新した状態のままロックして保持する"}], "correct": "ウ", "hint": "原子性(atomicity)は、トランザクションの処理が全て実行されるか、全く実行されなかった状態に戻るかのどちらかになることを保証する特性であり、一部だけ実行された状態を許さない。"}, {"id": 29, "cat": "データベース", "topic": "GROUP BYとHAVING句を用いた集計条件の指定", "q": "受注表(受注ID, 担当者, 金額)から、担当者ごとの受注金額の合計を求め、合計金額が300(万円)以上の担当者だけを抽出したい。適切なSQL文はどれか。", "choices": [{"label": "ア", "text": "SELECT 担当者, SUM(金額) FROM 受注表 WHERE SUM(金額) >= 300 GROUP BY 担当者"}, {"label": "イ", "text": "SELECT 担当者, SUM(金額) FROM 受注表 GROUP BY 担当者 HAVING SUM(金額) >= 300"}, {"label": "ウ", "text": "SELECT 担当者, SUM(金額) FROM 受注表 GROUP BY 担当者 WHERE SUM(金額) >= 300"}, {"label": "エ", "text": "SELECT 担当者, SUM(金額) FROM 受注表 WHERE 金額 >= 300"}], "correct": "イ", "hint": "集計関数(SUM)の結果に対する条件はHAVING句で指定する。WHERE句には集計関数を直接使うことはできない。"}, {"id": 30, "cat": "データベース", "topic": "デッドロックの発生条件", "q": "オンライン予約システムで、処理Pが座席Aをロックしたまま座席Bのロック解放を待ち、同時に処理Qが座席Bをロックしたまま座席Aのロック解放を待っている状態が続き、両方の処理が完了しなくなった。この状態を何と呼ぶか。", "choices": [{"label": "ア", "text": "スラッシング"}, {"label": "イ", "text": "キャッシュミス"}, {"label": "ウ", "text": "フラグメンテーション"}, {"label": "エ", "text": "デッドロック"}], "correct": "エ", "hint": "複数のトランザクションが互いに相手の保持する資源(ロック)の解放を待ち続け、処理が進まなくなる状態をデッドロックと呼ぶ。"}, {"id": 31, "cat": "データベース", "topic": "排他制御のロック粒度とトレードオフ", "q": "ある予約管理システムでは、繁忙期にロック待ちによる処理遅延が増えたため、表全体を対象としていたロックの単位を、対象のレコード単位に変更することを検討している。この変更によって一般的に生じる効果はどれか。", "choices": [{"label": "ア", "text": "データの整合性が保証されなくなる"}, {"label": "イ", "text": "ロック管理のオーバーヘッドは必ず減少する"}, {"label": "ウ", "text": "同時実行性は高まるが、ロック管理のオーバーヘッドが増加する"}, {"label": "エ", "text": "同時実行性は必ず低下する"}], "correct": "ウ", "hint": "ロック粒度を細かくすると複数のトランザクションが異なる行を同時に更新しやすくなり同時実行性は高まるが、管理するロック数が増えオーバーヘッドも増加する。"}, {"id": 32, "cat": "情報セキュリティ", "topic": "水飲み場型攻撃の特徴", "q": "攻撃対象の組織の従業員がよく閲覧するWebサイトを事前に調査して改ざんし、その従業員がアクセスした際にマルウェアへ感染させる攻撃はどれか。", "choices": [{"label": "ア", "text": "総当たり攻撃"}, {"label": "イ", "text": "水飲み場型攻撃"}, {"label": "ウ", "text": "クリックジャッキング"}, {"label": "エ", "text": "辞書攻撃"}], "correct": "イ", "hint": "水飲み場型攻撃は、標的組織の従業員がよく訪れるWebサイトを狙って改ざんし、アクセスしてきた従業員をマルウェアに感染させる標的型攻撃の一種である。"}, {"id": 33, "cat": "情報セキュリティ", "topic": "所有物を利用した多要素認証", "q": "社内システムへのログインに、社員証(ICカード)をカードリーダーにかざす操作と、暗証番号の入力の両方を必須にしている。この認証方式は、認証の3要素のうちどの組み合わせを用いているか。", "choices": [{"label": "ア", "text": "生体情報だけを用いた認証"}, {"label": "イ", "text": "所有(ICカード)と記憶(暗証番号)の組み合わせによる多要素認証"}, {"label": "ウ", "text": "所有要素だけを2回確認する認証"}, {"label": "エ", "text": "記憶要素だけを2回確認するシングルファクタ認証"}], "correct": "イ", "hint": "ICカードは物理的に「所有」する要素、暗証番号は「記憶」する要素であり、異なる種類の要素を組み合わせているため多要素認証に該当する。"}, {"id": 34, "cat": "情報セキュリティ", "topic": "デジタル署名の検証に用いる鍵", "q": "取引先から届いた契約書PDFに付与されたデジタル署名を、受信者が検証する際に用いる鍵として適切なものはどれか。", "choices": [{"label": "ア", "text": "受信者自身の秘密鍵"}, {"label": "イ", "text": "受信者自身の公開鍵"}, {"label": "ウ", "text": "送信者(取引先)の秘密鍵"}, {"label": "エ", "text": "送信者(取引先)の公開鍵"}], "correct": "エ", "hint": "デジタル署名は送信者の秘密鍵で作成され、受信者は送信者の公開鍵を使って検証する。"}, {"id": 35, "cat": "情報セキュリティ", "topic": "ゼロデイ攻撃の特徴", "q": "あるソフトウェアの脆弱性が2月1日に発見され、開発元が修正パッチを配布したのは2月10日だった。この間の2月5日に、その脆弱性を悪用した攻撃を受けた。この攻撃の分類として適切なものはどれか。", "choices": [{"label": "ア", "text": "ランサムウェア攻撃"}, {"label": "イ", "text": "DDoS攻撃"}, {"label": "ウ", "text": "フィッシング"}, {"label": "エ", "text": "ゼロデイ攻撃"}], "correct": "エ", "hint": "脆弱性の修正プログラムが提供される前に、その脆弱性を悪用して行われる攻撃をゼロデイ攻撃と呼ぶ。"}, {"id": 36, "cat": "情報セキュリティ", "topic": "リスク対応の四分類(リスク移転)", "q": "ECサイトを運営する企業が、大規模な不正アクセスによる損害に備えてサイバー保険に加入し、万一の被害額の一部を保険金で補填できるようにした。このリスク対応の分類はどれか。", "choices": [{"label": "ア", "text": "リスク移転"}, {"label": "イ", "text": "リスク受容"}, {"label": "ウ", "text": "リスク低減"}, {"label": "エ", "text": "リスク回避"}], "correct": "ア", "hint": "リスク移転は、保険への加入やアウトソーシングなどによって、リスクによる損失の一部を外部に転嫁する対応である。"}, {"id": 37, "cat": "情報セキュリティ", "topic": "CSIRTの役割", "q": "自社の基幹システムが不正アクセスを受けたことが判明した際、被害範囲の特定、証拠保全、外部機関(JPCERT/CC等)との連絡調整、再発防止策の統括までを一貫して担う社内組織はどれか。", "choices": [{"label": "ア", "text": "CSIRT"}, {"label": "イ", "text": "一般的な情報システム部門のヘルプデスク"}, {"label": "ウ", "text": "ISMS"}, {"label": "エ", "text": "経理部門"}], "correct": "ア", "hint": "CSIRT(Computer Security Incident Response Team)は、セキュリティインシデントへの対応や関係機関との調整を担うチームである。"}, {"id": 38, "cat": "ソフトウェア・HI", "topic": "3次元グラフィックスにおけるクリッピング", "q": "3Dゲームの描画処理において、視界(カメラの表示範囲)の外側に位置するオブジェクトの部分を計算対象から除外し、画面内に映る部分だけを取り出す処理を何と呼ぶか。", "choices": [{"label": "ア", "text": "クリッピング"}, {"label": "イ", "text": "シェーディング"}, {"label": "ウ", "text": "レンダリング"}, {"label": "エ", "text": "アンチエイリアシング"}], "correct": "ア", "hint": "クリッピングは、表示領域(ウィンドウや視界)の外側の部分を除去し、内側の見える部分だけを取り出す処理である。"}, {"id": 39, "cat": "ソフトウェア・HI", "topic": "ユニバーサルデザインの実践例", "q": "駅の券売機を設計する際、車いす利用者が使いやすい低い位置の操作パネルを、特別仕様としてではなく標準仕様として全ての券売機に採用することは、どの設計思想の実践例か。", "choices": [{"label": "ア", "text": "レスポンシブデザイン"}, {"label": "イ", "text": "スキューモーフィズム"}, {"label": "ウ", "text": "フラットデザイン"}, {"label": "エ", "text": "ユニバーサルデザイン"}], "correct": "エ", "hint": "特定の利用者向けの特別な設備としてではなく、できるだけ多くの人が最初から使える設計にすることがユニバーサルデザインの考え方である。"}, {"id": 40, "cat": "システム開発", "topic": "スクラムにおけるデイリースクラムの目的", "q": "スクラムを採用しているチームが、毎朝15分程度集まり、各メンバーが前日の進捗・当日の予定・困っていることを順番に共有する場を設けている。このイベントの名称はどれか。", "choices": [{"label": "ア", "text": "スプリントプランニング"}, {"label": "イ", "text": "スプリントレビュー"}, {"label": "ウ", "text": "デイリースクラム"}, {"label": "エ", "text": "レトロスペクティブ"}], "correct": "ウ", "hint": "デイリースクラムは、開発チームが毎日短時間集まり、進捗状況や課題を共有するイベントである。"}, {"id": 41, "cat": "システム開発", "topic": "判定条件網羅を満たす最小テストケース数", "q": "次の擬似コードに対して、判定条件網羅(全ての分岐条件について真になる場合と偽になる場合の両方を少なくとも1回ずつテストする)を満たすために必要な最小のテストケース数はどれか。\nif (x > 0 かつ y > 0) then\n  z ← 1\nelse\n  z ← -1\nendif", "choices": [{"label": "ア", "text": "1"}, {"label": "イ", "text": "2"}, {"label": "ウ", "text": "4"}, {"label": "エ", "text": "3"}], "correct": "イ", "hint": "「x>0かつy>0」という判定条件全体が真になる場合(例: x=1,y=1)と偽になる場合(例: x=-1,y=1)の2通りのテストケースがあれば、条件全体の真偽を両方カバーできる。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "PERTの3点見積りによる期待値計算", "q": "ある作業の所要日数について、楽観値5日、最頻値8日、悲観値17日と見積もられた。PERTの計算式による期待値は何日か。", "choices": [{"label": "ア", "text": "9"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "11"}, {"label": "エ", "text": "10"}], "correct": "ア", "hint": "PERTの期待値=(楽観値+4×最頻値+悲観値)÷6=(5+32+17)÷6=54÷6=9日になる。"}, {"id": 43, "cat": "プロジェクトマネジメント", "topic": "アローダイアグラムにおける費用最小の短縮対象作業の選定", "q": "作業A(5日)の後にB(7日)、続いてD(3日)と進む経路(A→B→D、計15日)と、作業A(5日)の後にC(6日)、続いてD(3日)と進む経路(A→C→D、計14日)をもつプロジェクトがある(当初の全体所要日数は15日)。ここで作業Aに1日の遅れが生じ、A→B→Dの経路が16日、A→C→Dの経路が15日になった。当初の15日で終えるために、1日短縮すべき作業として費用面で最も適切なのはどれか。ここで各作業の1日当たりの短縮費用は、A=8万円、B=3万円、C=5万円、D=9万円とする。", "choices": [{"label": "ア", "text": "D"}, {"label": "イ", "text": "C"}, {"label": "ウ", "text": "B"}, {"label": "エ", "text": "A"}], "correct": "ウ", "hint": "A→C→D経路は遅延後も15日に収まっており、短縮が必要なのはA→B→D経路(16日)だけである。この経路上にあるA・B・Dのうち、短縮費用が最も安いのはBの3万円であり、Bを1日短縮すれば必要十分である。"}, {"id": 44, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法の計算", "q": "あるシステムの外部入力が5個(1個当たりの重み4)、外部出力が4個(1個当たりの重み5)、内部論理ファイルが3個(重み10)であるとき、未調整ファンクションポイントの合計はどれか。", "choices": [{"label": "ア", "text": "70"}, {"label": "イ", "text": "80"}, {"label": "ウ", "text": "60"}, {"label": "エ", "text": "50"}], "correct": "ア", "hint": "5×4+4×5+3×10=20+20+30=70ファンクションポイントになる。"}, {"id": 45, "cat": "プロジェクトマネジメント", "topic": "EVMによるコスト差異とスケジュール差異の計算", "q": "あるプロジェクトの計画価値(PV)が150万円、出来高価値(EV)が130万円、実コスト(AC)が120万円のとき、コスト差異(CV=EV-AC)とスケジュール差異(SV=EV-PV)の組み合わせとして正しいものはどれか。", "choices": [{"label": "ア", "text": "CV=+10万円、SV=+20万円"}, {"label": "イ", "text": "CV=-10万円、SV=-20万円"}, {"label": "ウ", "text": "CV=+10万円、SV=-20万円"}, {"label": "エ", "text": "CV=-10万円、SV=+20万円"}], "correct": "ウ", "hint": "CV=EV-AC=130-120=+10万円(コスト削減)、SV=EV-PV=130-150=-20万円(進捗遅延)になる。"}, {"id": 46, "cat": "サービスマネジメント・監査", "topic": "テレワーク運用規程のシステム監査における指摘事項", "q": "L社が定めたテレワーク運用規程について、情報セキュリティの観点からシステム監査を実施したところ、複数の運用実態が判明した。このうち監査人が指摘事項として報告すべき状況はどれか。", "choices": [{"label": "ア", "text": "テレワークで使用するPCを従業員の家族に使用させないよう定めている"}, {"label": "イ", "text": "テレワーク運用規程の遵守を利用条件としている"}, {"label": "ウ", "text": "テレワークで使用するPCを会社支給のものに限定している"}, {"label": "エ", "text": "従業員が使用するPCへのマルウェア対策ソフトの導入可否を、従業員それぞれの判断に委ねている"}], "correct": "エ", "hint": "マルウェア対策ソフトの導入要否を従業員の判断に委ねると、対策が徹底されないリスクがあるため、指摘事項に該当する。"}, {"id": 47, "cat": "サービスマネジメント・監査", "topic": "障害復旧後の根本原因分析(問題管理)", "q": "夜間バッチ処理の異常終了によりサービスが一時停止し、運用チームは暫定的な回避策を適用して朝までにサービスを復旧させた。この後、二度と同じ障害を起こさないよう根本原因を調査し恒久対策を検討するプロセスはどれか。", "choices": [{"label": "ア", "text": "リリース管理"}, {"label": "イ", "text": "問題管理"}, {"label": "ウ", "text": "変更管理"}, {"label": "エ", "text": "構成管理"}], "correct": "イ", "hint": "問題管理は、インシデントの根本原因を分析し、恒久的な解決策や再発防止策を検討するプロセスである。"}, {"id": 48, "cat": "サービスマネジメント・監査", "topic": "SLAにおけるサービスレベル未達成時の取り決め", "q": "クラウドサービスの提供事業者と利用企業との契約において、目標稼働率を99.9%と定め、これを下回った場合の利用料金の減額幅まであらかじめ明文化して合意している。この文書はどれか。", "choices": [{"label": "ア", "text": "NDA"}, {"label": "イ", "text": "MOU"}, {"label": "ウ", "text": "RFP"}, {"label": "エ", "text": "SLA"}], "correct": "エ", "hint": "SLA(Service Level Agreement)は、サービスの品質目標や、目標未達成時の取り決めを提供者と顧客の間で合意した文書である。"}, {"id": 49, "cat": "経営・戦略・法務", "topic": "ハイブリッドクラウドの活用シナリオ", "q": "A社は、機密性の高い顧客データは自社専用の環境で厳重に管理しつつ、繁忙期だけは計算資源をパブリッククラウド上に柔軟に拡張したいと考えている。両者を連携させて相互運用できるようにするこの構成はどれか。", "choices": [{"label": "ア", "text": "マルチクラウド"}, {"label": "イ", "text": "コミュニティクラウド"}, {"label": "ウ", "text": "ハイブリッドクラウド"}, {"label": "エ", "text": "オンプレミス単独運用"}], "correct": "ウ", "hint": "ハイブリッドクラウドは、プライベートな環境とパブリッククラウドを連携させ、データやアプリケーションの相互運用を可能にする構成である。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "ダイバーシティマネジメントの実践例", "q": "B社は、国籍や年齢、価値観の異なる人材を積極的に採用し、その多様な視点を新商品開発に活かす方針を掲げた。この経営の考え方はどれか。", "choices": [{"label": "ア", "text": "年功序列制度"}, {"label": "イ", "text": "ワークライフバランス"}, {"label": "ウ", "text": "目標管理制度(MBO)"}, {"label": "エ", "text": "ダイバーシティマネジメント"}], "correct": "エ", "hint": "ダイバーシティマネジメントは、性別や年齢、国籍などの多様性を尊重し、組織の活力向上につなげる経営の考え方である。"}, {"id": 51, "cat": "経営・戦略・法務", "topic": "ERP導入の目的", "q": "C社では、会計・人事・生産・販売の情報がそれぞれ別のシステムで管理されており、同じデータを複数のシステムに二重入力する手間と、部門間でのデータの不整合が課題になっていた。これを解消するために導入すべき仕組みとして適切なものはどれか。", "choices": [{"label": "ア", "text": "SCM(サプライチェーンマネジメント)に特化したシステム"}, {"label": "イ", "text": "部門ごとの表計算ソフトの利用ルール統一"}, {"label": "ウ", "text": "ERP(統合基幹業務システム)"}, {"label": "エ", "text": "CRM(顧客関係管理)に特化したシステム"}], "correct": "ウ", "hint": "ERPは、会計・人事・生産・販売など企業全体の経営資源を1つのシステムで統合的に計画・管理し、データの二重入力や不整合を解消する仕組みである。"}, {"id": 52, "cat": "経営・戦略・法務", "topic": "イノベータ理論における「アーリーアダプタ」の位置づけ", "q": "イノベータ理論では、消費者を新商品の採用時期によってイノベータ、アーリーアダプタ、アーリーマジョリティ、レイトマジョリティ、ラガードの5層に分類する。これらのうち、新商品を早期に受け入れ、流行に敏感で自ら情報収集を行い、周囲の消費者に大きな影響を与える層はどれか。", "choices": [{"label": "ア", "text": "アーリーアダプタ"}, {"label": "イ", "text": "イノベータ"}, {"label": "ウ", "text": "アーリーマジョリティ"}, {"label": "エ", "text": "ラガード"}], "correct": "ア", "hint": "アーリーアダプタは、最も早く採用するイノベータに次いで新商品を受け入れる層であり、流行に敏感で周囲への影響力が大きいとされる。"}, {"id": 53, "cat": "経営・戦略・法務", "topic": "CIOの役割", "q": "D社は、情報システム戦略の立案と実行を一元的に統括する責任者のポストを新設することにした。この役職の一般的な呼称はどれか。", "choices": [{"label": "ア", "text": "CTO"}, {"label": "イ", "text": "COO"}, {"label": "ウ", "text": "CFO"}, {"label": "エ", "text": "CIO"}], "correct": "エ", "hint": "CIO(Chief Information Officer)は、情報管理・情報システムに関する戦略の立案及び執行を統括する最高責任者である。"}, {"id": 54, "cat": "経営・戦略・法務", "topic": "ボリュームライセンス契約の活用シナリオ", "q": "E社は、社内500台のPCに同じソフトウェアを導入するにあたり、パッケージを1本ずつ購入するのではなく、まとめて必要な台数分の使用権を1つの契約でまとめて取得する方式を検討している。この契約形態はどれか。", "choices": [{"label": "ア", "text": "サブスクリプション契約"}, {"label": "イ", "text": "ボリュームライセンス契約"}, {"label": "ウ", "text": "フリーウェアライセンス"}, {"label": "エ", "text": "OEM契約"}], "correct": "イ", "hint": "ボリュームライセンス契約は、大量購入者向けに、インストールできる台数をあらかじめ取り決めてソフトウェアの使用を認める契約形態である。"}, {"id": 55, "cat": "経営・戦略・法務", "topic": "SWOT分析の適用", "q": "F社は自社の技術力の高さと知名度の低さ、市場の拡大傾向と新規参入の増加という4つの要因を整理し、それぞれを内部要因・外部要因、プラス要因・マイナス要因の軸で分類して経営戦略の検討材料とした。この整理に用いた分析手法はどれか。", "choices": [{"label": "ア", "text": "SWOT分析"}, {"label": "イ", "text": "3C分析"}, {"label": "ウ", "text": "バリューチェーン分析"}, {"label": "エ", "text": "PPM"}], "correct": "ア", "hint": "SWOT分析は、強み(S)・弱み(W)という内部要因と、機会(O)・脅威(T)という外部要因を整理して戦略を検討する手法である。"}, {"id": 56, "cat": "経営・戦略・法務", "topic": "損益分岐点売上高の計算", "q": "固定費が500万円、変動費率が40%である場合、損益分岐点売上高はいくらか。", "choices": [{"label": "ア", "text": "900万円"}, {"label": "イ", "text": "833万円"}, {"label": "ウ", "text": "700万円"}, {"label": "エ", "text": "750万円"}], "correct": "イ", "hint": "損益分岐点売上高=固定費÷(1-変動費率)=500÷(1-0.4)=500÷0.6≒833万円になる。"}, {"id": 57, "cat": "経営・戦略・法務", "topic": "ROI(投資利益率)の計算", "q": "600万円を投資し、その結果として年間90万円の利益を得た場合のROI(投資利益率)はどれか。", "choices": [{"label": "ア", "text": "25%"}, {"label": "イ", "text": "20%"}, {"label": "ウ", "text": "10%"}, {"label": "エ", "text": "15%"}], "correct": "エ", "hint": "ROI=利益÷投資額×100=90÷600×100=15%になる。"}, {"id": 58, "cat": "経営・戦略・法務", "topic": "著作権の職務著作", "q": "G社の従業員が、会社の指示のもと業務時間内に開発したプログラムについて、その著作権は原則として誰に帰属するか。", "choices": [{"label": "ア", "text": "法人であるG社"}, {"label": "イ", "text": "著作権は発生しない"}, {"label": "ウ", "text": "開発した従業員個人"}, {"label": "エ", "text": "発注元の顧客企業"}], "correct": "ア", "hint": "職務著作の要件(法人の発意、従業員が職務上作成、法人名義での公表等)を満たす場合、著作権は原則として作成させた法人に帰属する。"}, {"id": 59, "cat": "経営・戦略・法務", "topic": "個人情報保護法における第三者提供の同意", "q": "H社が、自社で取得した顧客の個人データを、業務提携先のI社に提供しようとしている。この場合に原則として必要となる手続はどれか。", "choices": [{"label": "ア", "text": "本人(顧客)の同意を得ること"}, {"label": "イ", "text": "I社からの依頼書を受け取ること"}, {"label": "ウ", "text": "監督官庁への届出だけを行うこと"}, {"label": "エ", "text": "特に手続は不要である"}], "correct": "ア", "hint": "個人情報保護法では、第三者提供には原則として本人の同意を得ることが必要とされている。"}, {"id": 60, "cat": "経営・戦略・法務", "topic": "下請法の趣旨", "q": "J社(親事業者)がK社(下請事業者)にシステム開発の一部を委託する取引において、下請法(下請代金支払遅延等防止法)が主に目的としていることはどれか。", "choices": [{"label": "ア", "text": "特許権の存続期間を延長すること"}, {"label": "イ", "text": "親事業者と下請事業者との取引の公正化を図り、下請事業者の利益を保護すること"}, {"label": "ウ", "text": "下請事業者の労働時間の上限を規定すること"}, {"label": "エ", "text": "個人情報の第三者提供を制限すること"}], "correct": "イ", "hint": "下請法は、親事業者と下請事業者との取引の公正化を図り、代金の支払遅延などから下請事業者の利益を保護することを目的とした法律である。"}];

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
          <div style={s.sub}>基本情報技術者 — 60問内蔵(本試験レベル・出題分野比率準拠)</div>
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
