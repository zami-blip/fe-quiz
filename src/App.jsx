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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "16進小数から10進小数への変換", "q": "16進小数0.Aを10進小数で表したものはどれか。", "choices": [{"label": "ア", "text": "0.7"}, {"label": "イ", "text": "0.8"}, {"label": "ウ", "text": "0.5"}, {"label": "エ", "text": "0.625"}], "correct": "エ", "hint": "16進のAは10進の10であり、0.A=10/16=0.625になる。"}, {"id": 2, "cat": "基礎理論", "topic": "NAND素子だけでAND回路を構成する考え方", "q": "NAND素子だけを用いてAND回路と同じ働きをする回路を作る方法として適切なものはどれか。", "choices": [{"label": "ア", "text": "NAND素子を1個だけ使い、入力をそのまま出力する"}, {"label": "イ", "text": "NAND素子を並列に並べるだけでよい"}, {"label": "ウ", "text": "2つの入力をNAND素子に入れ、その出力をもう一つのNAND素子の両方の入力に入れる"}, {"label": "エ", "text": "NAND素子の出力を接地する"}], "correct": "ウ", "hint": "NAND素子の出力を反転させることでANDと同じ働きが得られるため、NANDの出力を別のNAND素子の両方の入力へ入れる(NANDを2段重ねる)ことでAND回路を構成できる。"}, {"id": 3, "cat": "基礎理論", "topic": "期待値の計算(くじ引き)", "q": "くじが10本あり、そのうち2本が当たりで、当たると500円、外れると0円がもらえる。このくじを1本引いたときの賞金の期待値はどれか。", "choices": [{"label": "ア", "text": "100円"}, {"label": "イ", "text": "200円"}, {"label": "ウ", "text": "50円"}, {"label": "エ", "text": "250円"}], "correct": "ア", "hint": "期待値=500円×(2/10)+0円×(8/10)=100円になる。"}, {"id": 4, "cat": "基礎理論", "topic": "2の補数による負数表現", "q": "8ビットの2の補数表現において、10進数の-5を表すビット列はどれか。", "choices": [{"label": "ア", "text": "10000101"}, {"label": "イ", "text": "11111010"}, {"label": "ウ", "text": "11111011"}, {"label": "エ", "text": "00000101"}], "correct": "ウ", "hint": "5(00000101)のビットを反転して1を加えると11111011になり、これが-5の2の補数表現である。"}, {"id": 5, "cat": "基礎理論", "topic": "誤り検出符号(パリティビット)の目的", "q": "送信データに1ビットのパリティビットを付加する主な目的はどれか。", "choices": [{"label": "ア", "text": "データ量を圧縮するため"}, {"label": "イ", "text": "送信速度を向上させるため"}, {"label": "ウ", "text": "暗号化を行うため"}, {"label": "エ", "text": "伝送中の1ビットの誤りを検出するため"}], "correct": "エ", "hint": "パリティビットは、送信データ中のビットの1の個数の偶奇を利用して、伝送中の1ビット誤りを検出するために付加される。"}, {"id": 6, "cat": "基礎理論", "topic": "計算量のオーダー比較", "q": "あるデータ件数nに対して、アルゴリズムAの処理時間がO(n)、アルゴリズムBの処理時間がO(n^2)であるとき、nが10倍になった場合の処理時間の増加倍率について正しいものはどれか。", "choices": [{"label": "ア", "text": "AもBも約10倍になる"}, {"label": "イ", "text": "Aは約100倍、Bは約10倍になる"}, {"label": "ウ", "text": "Aは約10倍、Bは約100倍になる"}, {"label": "エ", "text": "AもBも約100倍になる"}], "correct": "ウ", "hint": "O(n)は件数に比例するため約10倍、O(n^2)は件数の2乗に比例するため約100倍になる。"}, {"id": 7, "cat": "アルゴリズム・プログラミング", "topic": "双方向リンクリストへの要素挿入", "q": "双方向リンクリストで社員A→社員K→社員Tの順に並んでいる。社員Aと社員Kの間に新しい社員Gを挿入するとき、変更が必要なポインタの組み合わせとして適切なものはどれか。", "choices": [{"label": "ア", "text": "全ての社員の前後ポインタ"}, {"label": "イ", "text": "社員Kの次ポインタと社員Tの前ポインタだけ"}, {"label": "ウ", "text": "社員Aの次ポインタ、社員Kの前ポインタ、社員Gの次・前ポインタ"}, {"label": "エ", "text": "社員Aの前ポインタと社員Tの次ポインタだけ"}], "correct": "ウ", "hint": "Aの次ポインタをGへ、Kの前ポインタをGへ変更し、新設するGの次ポインタをK、前ポインタをAに設定する必要がある。社員Tのポインタは変更不要である。"}, {"id": 8, "cat": "アルゴリズム・プログラミング", "topic": "減算による最大公約数(ユークリッドの互除法・減算版)の流れ図トレース", "q": "変数mを18、nを12として、m>nならm←m-n、n>mならn←n-mという処理をm=nになるまで繰り返す。処理が終了したときのmの値はどれか。", "choices": [{"label": "ア", "text": "12"}, {"label": "イ", "text": "9"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "3"}], "correct": "ウ", "hint": "18→(m=6,n=12)→(m=6,n=6)で一致し、最大公約数である6が最終的なmの値になる。"}, {"id": 9, "cat": "アルゴリズム・プログラミング", "topic": "二分探索木の中順走査", "q": "二分探索木に対して中順(左部分木→根→右部分木)で走査を行うと得られる結果として適切なものはどれか。", "choices": [{"label": "ア", "text": "キーの昇順に並んだ結果が得られる"}, {"label": "イ", "text": "ランダムな順序になる"}, {"label": "ウ", "text": "挿入した順序がそのまま得られる"}, {"label": "エ", "text": "キーの降順に並んだ結果が得られる"}], "correct": "ア", "hint": "二分探索木を中順走査すると、キーが昇順に並んだ結果が得られる。"}, {"id": 10, "cat": "アルゴリズム・プログラミング", "topic": "クイックソートのピボット選択と分割", "q": "クイックソートにおいて、分割の基準となる値(ピボット)の選び方が処理効率に与える影響について適切な説明はどれか。", "choices": [{"label": "ア", "text": "ピボットは必ず配列の中央の値を使わなければならない"}, {"label": "イ", "text": "ピボットが常に最小値または最大値に偏ると、最悪計算量O(n^2)に近づく"}, {"label": "ウ", "text": "ピボットの選び方は処理効率に一切影響しない"}, {"label": "エ", "text": "ピボットを使うと必ずO(n)で処理が終わる"}], "correct": "イ", "hint": "ピボットの選び方が偏ると分割が不均等になり、最悪の場合の計算量がO(n^2)に近づいてしまう。"}, {"id": 11, "cat": "アルゴリズム・プログラミング", "topic": "後置記法の式をスタックで評価する手順", "q": "後置記法(逆ポーランド記法)の式 5 3 2 - * をスタックを用いて計算した結果はどれか。", "choices": [{"label": "ア", "text": "5"}, {"label": "イ", "text": "10"}, {"label": "ウ", "text": "4"}, {"label": "エ", "text": "15"}], "correct": "ア", "hint": "5,3,2の順にスタックへ積み、演算子-が現れたら3と2を取り出して3-2=1を計算しスタックへ戻す(スタックは[5,1])。次に演算子*が現れたら5と1を取り出して5×1=5を計算する。よって結果は5になる。"}, {"id": 12, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数のトレース", "q": "関数f(n)を「nが0のとき1を返し、それ以外はn×f(n-1)を返す」と定義する。f(4)の値はどれか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "120"}, {"label": "ウ", "text": "4"}, {"label": "エ", "text": "24"}], "correct": "エ", "hint": "f(4)=4×f(3)=4×3×f(2)=4×3×2×f(1)=4×3×2×1×f(0)=4×3×2×1×1=24になる。"}, {"id": 13, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表の衝突処理(連鎖法)", "q": "ハッシュ表探索において、異なるキーのハッシュ値が衝突した場合に、同じバケットに複数の要素を連結リストでつなげて対応する方式はどれか。", "choices": [{"label": "ア", "text": "ビットマップ法"}, {"label": "イ", "text": "二分探索法"}, {"label": "ウ", "text": "線形探索法"}, {"label": "エ", "text": "連鎖法(チェイン法)"}], "correct": "エ", "hint": "連鎖法(チェイン法)は、同じハッシュ値をもつ要素を連結リストでつなげて衝突に対応する方式である。"}, {"id": 14, "cat": "アルゴリズム・プログラミング", "topic": "二分探索の最大比較回数の計算", "q": "整列済みの2,048件のデータに対して二分探索を行う場合、最悪の場合の比較回数はどれか。", "choices": [{"label": "ア", "text": "8"}, {"label": "イ", "text": "32"}, {"label": "ウ", "text": "11"}, {"label": "エ", "text": "16"}], "correct": "ウ", "hint": "比較回数はlog2(2048)に相当し、log2(2048)=11回になる。"}, {"id": 15, "cat": "コンピュータシステム", "topic": "メモリインタリーブの仕組み", "q": "主記憶へのアクセスを高速化する技術であるメモリインタリーブの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "主記憶の内容を補助記憶へ退避させる方式"}, {"label": "イ", "text": "主記憶を複数の独立したグループ(バンク)に分割し、各バンクへ並行してアクセスすることで実効的なアクセス速度を高める方式"}, {"label": "ウ", "text": "CPUと主記憶の間にキャッシュを設けてアクセス速度の差を埋める方式"}, {"label": "エ", "text": "複数のCPUコアで主記憶を分割して専有する方式"}], "correct": "イ", "hint": "メモリインタリーブは、主記憶を複数のバンクに分割し並行してアクセスすることで、見かけ上のアクセス速度を高める技術である。"}, {"id": 16, "cat": "コンピュータシステム", "topic": "エッジコンピューティングの特徴", "q": "IoT機器などのデータ発生源に近い場所にサーバを配置し、その場でデータの一次処理を行うことで、遅延を減らしリアルタイム性を高める仕組みはどれか。", "choices": [{"label": "ア", "text": "エッジコンピューティング"}, {"label": "イ", "text": "クラウドコンピューティング"}, {"label": "ウ", "text": "量子コンピューティング"}, {"label": "エ", "text": "グリッドコンピューティング"}], "correct": "ア", "hint": "エッジコンピューティングは、データ発生源に近い場所(エッジ)でデータを処理することで通信遅延を減らし、リアルタイム性を高める仕組みである。"}, {"id": 17, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュのヒット率が98%、キャッシュのアクセス時間が4ナノ秒、主記憶のアクセス時間が80ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "7.52"}, {"label": "イ", "text": "4.52"}, {"label": "ウ", "text": "5.52"}, {"label": "エ", "text": "6.52"}], "correct": "ウ", "hint": "実効アクセス時間=0.98×4+0.02×80=3.92+1.6=5.52ナノ秒になる。"}, {"id": 18, "cat": "コンピュータシステム", "topic": "RAID5の実効容量計算", "q": "1台400GBのディスク5台でRAID5を構成した場合の実効容量は何GBか。", "choices": [{"label": "ア", "text": "2400"}, {"label": "イ", "text": "2000"}, {"label": "ウ", "text": "1200"}, {"label": "エ", "text": "1600"}], "correct": "エ", "hint": "RAID5はn台のうち1台分をパリティに使うため、実効容量は(5-1)×400=1,600GBになる。"}, {"id": 19, "cat": "コンピュータシステム", "topic": "直列システムの稼働率計算", "q": "稼働率0.95の装置を3台直列に接続したシステム全体の稼働率に最も近いものはどれか。", "choices": [{"label": "ア", "text": "0.90"}, {"label": "イ", "text": "0.95"}, {"label": "ウ", "text": "0.86"}, {"label": "エ", "text": "0.81"}], "correct": "ウ", "hint": "直列システムの稼働率は各装置の稼働率の積であり、0.95の3乗≒0.857、最も近いのは0.86になる。"}, {"id": 20, "cat": "コンピュータシステム", "topic": "内部割込みと外部割込み", "q": "キーボードからの入力信号によって生じる割込みの種類はどれか。", "choices": [{"label": "ア", "text": "外部割込み"}, {"label": "イ", "text": "内部割込み"}, {"label": "ウ", "text": "ページフォールト"}, {"label": "エ", "text": "ゼロ除算割込み"}], "correct": "ア", "hint": "キーボードなどの周辺機器からの信号によって生じる割込みは外部割込みに分類される。"}, {"id": 21, "cat": "コンピュータシステム", "topic": "仮想化とコンテナの違い", "q": "サーバ仮想化(ハイパーバイザ型)とコンテナ型仮想化の違いに関する説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "ハイパーバイザ型はOSを一切必要としない"}, {"label": "イ", "text": "コンテナ型は必ずハードウェアを直接占有する"}, {"label": "ウ", "text": "ハイパーバイザ型はゲストOSごとにOS全体を持つが、コンテナ型はホストOSのカーネルを共有し軽量に動作する"}, {"label": "エ", "text": "コンテナ型はハイパーバイザ型より常に低速である"}], "correct": "ウ", "hint": "ハイパーバイザ型はゲストOSごとに独立したOSを持つのに対し、コンテナ型はホストOSのカーネルを複数のコンテナで共有するため、より軽量に動作する。"}, {"id": 22, "cat": "ネットワーク", "topic": "WAFの設置場所", "q": "インターネットからのHTTP通信をファイアウォールとWebサーバの間で受け、Webアプリケーションへの攻撃を検査・遮断したい。WAFを設置すべき最も適切な位置はどれか。", "choices": [{"label": "ア", "text": "インターネット回線の物理ケーブル上(暗号化前後を問わない任意の場所)"}, {"label": "イ", "text": "社内LANの末端の利用者PCの直前"}, {"label": "ウ", "text": "データベースサーバとストレージの間"}, {"label": "エ", "text": "ファイアウォールとWebサーバの間で、Webアプリケーションへの通信が復号された状態で流れる経路上"}], "correct": "エ", "hint": "WAFは通信内容(HTTPリクエスト)を検査する必要があるため、暗号化が復号された状態でWebアプリケーションへの通信が流れる経路上に設置する必要がある。"}, {"id": 23, "cat": "ネットワーク", "topic": "サブネットにおける使用可能ホスト数の計算", "q": "サブネットマスクが/27であるネットワークにおいて、割り当て可能なホストアドレスの最大数はどれか。", "choices": [{"label": "ア", "text": "62"}, {"label": "イ", "text": "30"}, {"label": "ウ", "text": "126"}, {"label": "エ", "text": "14"}], "correct": "イ", "hint": "/27はホスト部が5ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^5-2=30個になる。"}, {"id": 24, "cat": "ネットワーク", "topic": "TCPとUDPの違い", "q": "動画のライブ配信のように、多少のデータ欠損よりも低遅延を重視する通信でよく用いられるプロトコルはどれか。", "choices": [{"label": "ア", "text": "TCP"}, {"label": "イ", "text": "FTP"}, {"label": "ウ", "text": "SMTP"}, {"label": "エ", "text": "UDP"}], "correct": "エ", "hint": "UDPは再送制御を行わないため低遅延だが信頼性は低く、ライブ配信など遅延を重視する用途に用いられることが多い。"}, {"id": 25, "cat": "ネットワーク", "topic": "DNSの役割", "q": "Webブラウザにドメイン名を入力したときに、それに対応するIPアドレスを取得するために問い合わせる仕組みはどれか。", "choices": [{"label": "ア", "text": "SNMP"}, {"label": "イ", "text": "DNS"}, {"label": "ウ", "text": "NTP"}, {"label": "エ", "text": "DHCP"}], "correct": "イ", "hint": "DNSはドメイン名とIPアドレスを対応付け、名前解決を行う仕組みである。"}, {"id": 26, "cat": "ネットワーク", "topic": "回線速度からの転送時間の計算", "q": "900Mバイトのデータを150Mビット/秒の回線で転送するのに理論上かかる時間は何秒か。1M=10^6とする。", "choices": [{"label": "ア", "text": "48"}, {"label": "イ", "text": "96"}, {"label": "ウ", "text": "24"}, {"label": "エ", "text": "12"}], "correct": "ア", "hint": "900Mバイト=7,200Mビットであり、150Mビット/秒の回線では7,200÷150=48秒かかる。"}, {"id": 27, "cat": "データベース", "topic": "推移的関数従属の排除による正規化", "q": "ある表で「社員番号→所属部署コード」「所属部署コード→部署名」という関数従属が成立するとき、部署名は社員番号にどのように従属しているか。", "choices": [{"label": "ア", "text": "部署名は主キーである"}, {"label": "イ", "text": "推移的に従属している"}, {"label": "ウ", "text": "直接に(部分従属なく)従属している"}, {"label": "エ", "text": "従属していない"}], "correct": "イ", "hint": "部署名は所属部署コードを経由して社員番号に間接的に従属しており、これを推移的関数従属と呼ぶ。"}, {"id": 28, "cat": "データベース", "topic": "トランザクションのACID特性のうち原子性", "q": "トランザクションが、データベースへの更新処理を完全に実行するか、全く実行しなかった状態に戻すかのどちらかの結果になることを保証する特性はどれか。", "choices": [{"label": "ア", "text": "独立性(isolation)"}, {"label": "イ", "text": "耐久性(durability)"}, {"label": "ウ", "text": "一貫性(consistency)"}, {"label": "エ", "text": "原子性(atomicity)"}], "correct": "エ", "hint": "原子性(atomicity)は、トランザクションの処理が全て実行されるか、全く実行されなかった状態に戻るかのどちらかになることを保証する特性である。"}, {"id": 29, "cat": "データベース", "topic": "GROUP BYとHAVING句", "q": "SQLで部署ごとに社員数を集計し、社員数が5人以上の部署だけを抽出したい。この条件を指定する句はどれか。", "choices": [{"label": "ア", "text": "HAVING句"}, {"label": "イ", "text": "LIMIT句"}, {"label": "ウ", "text": "ORDER BY句"}, {"label": "エ", "text": "WHERE句"}], "correct": "ア", "hint": "HAVING句は、GROUP BYで集計した後のグループに対して絞り込み条件を指定する。"}, {"id": 30, "cat": "データベース", "topic": "デッドロックの発生条件", "q": "トランザクションAがロックXの解放を待ちながらロックYを保持し、同時にトランザクションBがロックYの解放を待ちながらロックXを保持している状態を何と呼ぶか。", "choices": [{"label": "ア", "text": "デッドロック"}, {"label": "イ", "text": "キャッシュミス"}, {"label": "ウ", "text": "フラグメンテーション"}, {"label": "エ", "text": "スラッシング"}], "correct": "ア", "hint": "複数のトランザクションが互いに相手の保持するロックの解放を待ち続け、処理が進まなくなる状態をデッドロックと呼ぶ。"}, {"id": 31, "cat": "データベース", "topic": "排他制御のロック粒度とトレードオフ", "q": "データベースの排他制御において、ロックの粒度を表単位からレコード単位に細かくすることの一般的な効果はどれか。", "choices": [{"label": "ア", "text": "データの整合性が保証されなくなる"}, {"label": "イ", "text": "同時実行性は高まるが、ロック管理のオーバーヘッドが増加する"}, {"label": "ウ", "text": "同時実行性は必ず低下する"}, {"label": "エ", "text": "ロック管理のオーバーヘッドは必ず減少する"}], "correct": "イ", "hint": "ロック粒度を細かくすると複数のトランザクションが異なる行を同時に更新しやすくなり同時実行性は高まるが、管理するロック数が増えオーバーヘッドも増加する。"}, {"id": 32, "cat": "情報セキュリティ", "topic": "ドライブバイダウンロード攻撃", "q": "利用者が悪意のあるWebサイトを閲覧しただけで、Webブラウザなどの脆弱性を突かれてマルウェアに感染させられる攻撃はどれか。", "choices": [{"label": "ア", "text": "ドライブバイダウンロード攻撃"}, {"label": "イ", "text": "辞書攻撃"}, {"label": "ウ", "text": "中間者攻撃"}, {"label": "エ", "text": "総当たり攻撃"}], "correct": "ア", "hint": "ドライブバイダウンロード攻撃は、利用者が悪意のあるWebサイトを閲覧しただけで、ブラウザ等の脆弱性を突かれマルウェアに感染させられる攻撃である。"}, {"id": 33, "cat": "情報セキュリティ", "topic": "多要素認証の考え方", "q": "パスワード(記憶)と生体認証(指紋などの身体的特徴)を組み合わせてログインさせる仕組みを何と呼ぶか。", "choices": [{"label": "ア", "text": "チャレンジレスポンス認証"}, {"label": "イ", "text": "多要素認証"}, {"label": "ウ", "text": "ワンタイムパスワード認証"}, {"label": "エ", "text": "シングルサインオン"}], "correct": "イ", "hint": "記憶・所有・生体など異なる種類の要素を組み合わせる認証方式を多要素認証と呼ぶ。"}, {"id": 34, "cat": "情報セキュリティ", "topic": "デジタル署名の検証に用いる鍵", "q": "受信者がデジタル署名を検証する際に用いる鍵として適切なものはどれか。", "choices": [{"label": "ア", "text": "受信者の秘密鍵"}, {"label": "イ", "text": "送信者の公開鍵"}, {"label": "ウ", "text": "受信者の公開鍵"}, {"label": "エ", "text": "送信者の秘密鍵"}], "correct": "イ", "hint": "デジタル署名は送信者の秘密鍵で作成され、受信者は送信者の公開鍵を使って検証する。"}, {"id": 35, "cat": "情報セキュリティ", "topic": "ゼロデイ攻撃の特徴", "q": "OSやソフトウェアの脆弱性の修正プログラムがまだ提供されていない段階で、その脆弱性を悪用して行われる攻撃はどれか。", "choices": [{"label": "ア", "text": "フィッシング"}, {"label": "イ", "text": "DDoS攻撃"}, {"label": "ウ", "text": "ゼロデイ攻撃"}, {"label": "エ", "text": "ランサムウェア攻撃"}], "correct": "ウ", "hint": "脆弱性の修正プログラムが提供される前(0日目)に行われる攻撃をゼロデイ攻撃と呼ぶ。"}, {"id": 36, "cat": "情報セキュリティ", "topic": "リスク対応の四分類(リスク移転)", "q": "情報セキュリティリスクへの対応のうち、保険への加入やクラウドサービスの利用などによって、リスクの一部を外部に転嫁する対応はどれか。", "choices": [{"label": "ア", "text": "リスク回避"}, {"label": "イ", "text": "リスク低減"}, {"label": "ウ", "text": "リスク受容"}, {"label": "エ", "text": "リスク移転"}], "correct": "エ", "hint": "リスク移転は、保険への加入やアウトソーシングなどによって、リスクによる損失の一部を外部に転嫁する対応である。"}, {"id": 37, "cat": "情報セキュリティ", "topic": "CSIRTの役割", "q": "組織内で発生したセキュリティインシデントの検知・分析・対応、および外部機関との調整を専門に行うチームはどれか。", "choices": [{"label": "ア", "text": "PMO"}, {"label": "イ", "text": "CSIRT"}, {"label": "ウ", "text": "SOC"}, {"label": "エ", "text": "ISMS"}], "correct": "イ", "hint": "CSIRT(Computer Security Incident Response Team)は、セキュリティインシデントへの対応や関係機関との調整を担うチームである。"}, {"id": 38, "cat": "ソフトウェア・HI", "topic": "3次元グラフィックスにおけるクリッピング", "q": "3次元グラフィックス処理において、表示ウィンドウの外側にはみ出た部分を除去し、内側に見える部分だけを取り出す処理を何と呼ぶか。", "choices": [{"label": "ア", "text": "アンチエイリアシング"}, {"label": "イ", "text": "レンダリング"}, {"label": "ウ", "text": "シェーディング"}, {"label": "エ", "text": "クリッピング"}], "correct": "エ", "hint": "クリッピングは、表示領域(ウィンドウ)の外側の部分を除去し、内側の見える部分だけを取り出す処理である。"}, {"id": 39, "cat": "ソフトウェア・HI", "topic": "ユニバーサルデザインの考え方", "q": "年齢や身体的な能力の違いにかかわらず、できるだけ多くの人が利用しやすいように製品や環境を設計する考え方はどれか。", "choices": [{"label": "ア", "text": "スキューモーフィズム"}, {"label": "イ", "text": "レスポンシブデザイン"}, {"label": "ウ", "text": "ユニバーサルデザイン"}, {"label": "エ", "text": "フラットデザイン"}], "correct": "ウ", "hint": "ユニバーサルデザインは、年齢や能力の違いにかかわらず、できるだけ多くの人が利用しやすいことを目指す設計の考え方である。"}, {"id": 40, "cat": "システム開発", "topic": "スクラムにおけるデイリースクラムの目的", "q": "スクラムにおいて、開発チームの全員が短時間で集まり、昨日やったこと・今日やること・障害になっていることを共有するイベントはどれか。", "choices": [{"label": "ア", "text": "レトロスペクティブ"}, {"label": "イ", "text": "スプリントプランニング"}, {"label": "ウ", "text": "スプリントレビュー"}, {"label": "エ", "text": "デイリースクラム"}], "correct": "エ", "hint": "デイリースクラムは、開発チームが毎日短時間集まり、進捗状況や課題を共有するイベントである。"}, {"id": 41, "cat": "システム開発", "topic": "ホワイトボックステストの命令網羅", "q": "ホワイトボックステストにおいて、プログラム中の全ての命令文を少なくとも1回は実行するようにテストケースを設計する網羅基準はどれか。", "choices": [{"label": "ア", "text": "複数条件網羅"}, {"label": "イ", "text": "判定条件網羅"}, {"label": "ウ", "text": "命令網羅"}, {"label": "エ", "text": "同値分割"}], "correct": "ウ", "hint": "命令網羅は、プログラム中の全ての命令を少なくとも1回実行することを基準にテストケースを設計する網羅基準である。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "PERTの3点見積りによる期待値計算", "q": "ある作業の所要日数について、楽観値3日、最頻値5日、悲観値13日と見積もられた。PERTの計算式による期待値は何日か。", "choices": [{"label": "ア", "text": "5"}, {"label": "イ", "text": "7"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "8"}], "correct": "ウ", "hint": "PERTの期待値=(楽観値+4×最頻値+悲観値)÷6=(3+20+13)÷6=36÷6=6日になる。"}, {"id": 43, "cat": "プロジェクトマネジメント", "topic": "アローダイアグラムからのクリティカルパスの特定", "q": "作業A(4日、先行なし)の後にC(5日)、さらにF(3日)と続く経路と、作業A(4日)の後にD(6日)、さらにG(4日)と続く経路、および作業B(3日、先行なし)の後にE(2日)、さらにG(4日)と続く経路をもつプロジェクトがある。最も長い経路の所要日数はどれか。", "choices": [{"label": "ア", "text": "14日"}, {"label": "イ", "text": "9日"}, {"label": "ウ", "text": "17日"}, {"label": "エ", "text": "12日"}], "correct": "ア", "hint": "経路A→C→Fは4+5+3=12日、経路A→D→Gは4+6+4=14日、経路B→E→Gは3+2+4=9日であり、最も長い14日がこのプロジェクトの最短所要日数(クリティカルパス)になる。"}, {"id": 44, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法の計算", "q": "あるシステムの外部入力が4個(1個当たりの重み4)、外部出力が3個(1個当たりの重み5)、内部論理ファイルが2個(重み10)であるとき、未調整ファンクションポイントの合計はどれか。", "choices": [{"label": "ア", "text": "61"}, {"label": "イ", "text": "51"}, {"label": "ウ", "text": "41"}, {"label": "エ", "text": "71"}], "correct": "イ", "hint": "4×4+3×5+2×10=16+15+20=51ファンクションポイントになる。"}, {"id": 45, "cat": "プロジェクトマネジメント", "topic": "EVMによるコスト差異とスケジュール差異の計算", "q": "あるプロジェクトの計画価値(PV)が120万円、出来高価値(EV)が100万円、実コスト(AC)が110万円のとき、コスト差異(CV=EV-AC)とスケジュール差異(SV=EV-PV)の組み合わせとして正しいものはどれか。", "choices": [{"label": "ア", "text": "CV=0万円、SV=-10万円"}, {"label": "イ", "text": "CV=+10万円、SV=+20万円"}, {"label": "ウ", "text": "CV=-20万円、SV=-10万円"}, {"label": "エ", "text": "CV=-10万円、SV=-20万円"}], "correct": "エ", "hint": "CV=EV-AC=100-110=-10万円、SV=EV-PV=100-120=-20万円であり、いずれも負の値のためコスト超過かつ進捗遅延を示す。"}, {"id": 46, "cat": "サービスマネジメント・監査", "topic": "テレワーク運用規程のシステム監査における指摘事項", "q": "ある会社が定めたテレワーク運用規程について、情報セキュリティの観点からシステム監査を実施した。監査人が指摘事項として報告すべき状況はどれか。", "choices": [{"label": "ア", "text": "テレワーク運用規程の遵守を利用条件としている"}, {"label": "イ", "text": "テレワークで使用するPCへのマルウェア対策ソフトの導入可否を、従業員それぞれの判断に委ねている"}, {"label": "ウ", "text": "テレワークで使用するPCを会社支給のものに限定している"}, {"label": "エ", "text": "テレワークで使用するPCを従業員の家族に使用させないよう定めている"}], "correct": "イ", "hint": "マルウェア対策ソフトの導入要否を従業員の判断に委ねると、対策が徹底されないリスクがあるため、指摘事項に該当する。"}, {"id": 47, "cat": "サービスマネジメント・監査", "topic": "インシデント管理と問題管理の違い", "q": "サービスマネジメントにおいて、発生した障害の根本原因を分析し、恒久的な再発防止策を検討するプロセスはどれか。", "choices": [{"label": "ア", "text": "構成管理"}, {"label": "イ", "text": "インシデント管理"}, {"label": "ウ", "text": "問題管理"}, {"label": "エ", "text": "変更管理"}], "correct": "ウ", "hint": "問題管理は、インシデントの根本原因を分析し、恒久的な解決策や再発防止策を検討するプロセスである。"}, {"id": 48, "cat": "サービスマネジメント・監査", "topic": "SLAの目的", "q": "サービス提供者と顧客の間で、サービスの品質に関する具体的な目標値を明文化して合意する文書はどれか。", "choices": [{"label": "ア", "text": "SLA"}, {"label": "イ", "text": "RFP"}, {"label": "ウ", "text": "MOU"}, {"label": "エ", "text": "NDA"}], "correct": "ア", "hint": "SLA(Service Level Agreement)は、サービスの品質目標を提供者と顧客の間で合意した文書である。"}, {"id": 49, "cat": "経営・戦略・法務", "topic": "ハイブリッドクラウドの説明", "q": "自社専用のプライベートクラウドと、汎用のパブリッククラウドとを連携させ、データやアプリケーションを相互に運用できるようにする構成はどれか。", "choices": [{"label": "ア", "text": "ハイブリッドクラウド"}, {"label": "イ", "text": "コミュニティクラウド"}, {"label": "ウ", "text": "マルチクラウド"}, {"label": "エ", "text": "オンプレミス"}], "correct": "ア", "hint": "ハイブリッドクラウドは、プライベートクラウドとパブリッククラウドを連携させ、相互運用が可能な環境を提供する構成である。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "ダイバーシティマネジメントの考え方", "q": "性別・年齢・国籍・価値観など従業員の多様性を尊重し、それぞれの個性を活かすことで組織の活力向上を図る経営の考え方はどれか。", "choices": [{"label": "ア", "text": "目標管理制度(MBO)"}, {"label": "イ", "text": "ワークライフバランス"}, {"label": "ウ", "text": "ダイバーシティマネジメント"}, {"label": "エ", "text": "労使協調"}], "correct": "ウ", "hint": "ダイバーシティマネジメントは、性別や年齢、国籍などの多様性を尊重し、組織の活力向上につなげる経営の考え方である。"}, {"id": 51, "cat": "経営・戦略・法務", "topic": "ERPの説明", "q": "企業の会計・人事・生産・販売など基幹業務の経営資源を統合的に計画・管理し、経営の効率向上を図るための手法・システムはどれか。", "choices": [{"label": "ア", "text": "CRM"}, {"label": "イ", "text": "ERP"}, {"label": "ウ", "text": "SCM"}, {"label": "エ", "text": "BPR"}], "correct": "イ", "hint": "ERP(Enterprise Resource Planning)は、企業の経営資源を統合的に計画・管理し、経営の効率向上を図るための手法・概念である。"}, {"id": 52, "cat": "経営・戦略・法務", "topic": "イノベータ理論における「アーリーアダプタ」の位置づけ", "q": "イノベータ理論において、新商品やサービスを比較的早い段階で受け入れ、流行に敏感で自ら情報収集を行い、他の消費者にも大きな影響を与える層はどれか。", "choices": [{"label": "ア", "text": "アーリーアダプタ"}, {"label": "イ", "text": "レイトマジョリティ"}, {"label": "ウ", "text": "ラガード"}, {"label": "エ", "text": "イノベータ"}], "correct": "ア", "hint": "アーリーアダプタは、新商品・サービスを早期に受け入れ、周囲への影響力が大きい層とされる。"}, {"id": 53, "cat": "経営・戦略・法務", "topic": "CIOの役割", "q": "企業における情報管理や情報システムに関する戦略の立案及び執行を統括する最高責任者の役職はどれか。", "choices": [{"label": "ア", "text": "CIO"}, {"label": "イ", "text": "CTO"}, {"label": "ウ", "text": "CFO"}, {"label": "エ", "text": "COO"}], "correct": "ア", "hint": "CIO(Chief Information Officer)は、情報管理・情報システムに関する戦略の立案及び執行を統括する最高責任者である。"}, {"id": 54, "cat": "経営・戦略・法務", "topic": "ボリュームライセンス契約の説明", "q": "企業などソフトウェアを大量に購入する組織向けに、インストール可能な台数をあらかじめ取り決めて使用を認める契約形態はどれか。", "choices": [{"label": "ア", "text": "サブスクリプション契約"}, {"label": "イ", "text": "フリーウェアライセンス"}, {"label": "ウ", "text": "OEM契約"}, {"label": "エ", "text": "ボリュームライセンス契約"}], "correct": "エ", "hint": "ボリュームライセンス契約は、大量購入者向けに、インストールできる台数をあらかじめ取り決めてソフトウェアの使用を認める契約形態である。"}, {"id": 55, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "自社の強み・弱みという内部要因と、機会・脅威という外部要因を整理して戦略を検討する手法はどれか。", "choices": [{"label": "ア", "text": "バリューチェーン分析"}, {"label": "イ", "text": "SWOT分析"}, {"label": "ウ", "text": "PPM"}, {"label": "エ", "text": "3C分析"}], "correct": "イ", "hint": "SWOT分析は、強み(S)・弱み(W)・機会(O)・脅威(T)の4要素を整理して戦略を検討する手法である。"}, {"id": 56, "cat": "経営・戦略・法務", "topic": "損益分岐点売上高の計算", "q": "固定費が400万円、変動費率が50%である場合、損益分岐点売上高はいくらか。", "choices": [{"label": "ア", "text": "600万円"}, {"label": "イ", "text": "700万円"}, {"label": "ウ", "text": "900万円"}, {"label": "エ", "text": "800万円"}], "correct": "エ", "hint": "損益分岐点売上高=固定費÷(1-変動費率)=400÷(1-0.5)=400÷0.5=800万円になる。"}, {"id": 57, "cat": "経営・戦略・法務", "topic": "ROI(投資利益率)の計算", "q": "800万円を投資し、その結果として年間160万円の利益を得た場合のROI(投資利益率)はどれか。", "choices": [{"label": "ア", "text": "10%"}, {"label": "イ", "text": "20%"}, {"label": "ウ", "text": "25%"}, {"label": "エ", "text": "15%"}], "correct": "イ", "hint": "ROI=利益÷投資額×100=160÷800×100=20%になる。"}, {"id": 58, "cat": "経営・戦略・法務", "topic": "著作権の職務著作", "q": "従業員が職務上作成したプログラムの著作権は、原則として誰に帰属するか。", "choices": [{"label": "ア", "text": "発注元の顧客企業"}, {"label": "イ", "text": "法人(会社)"}, {"label": "ウ", "text": "作成した従業員個人"}, {"label": "エ", "text": "著作権は発生しない"}], "correct": "イ", "hint": "職務著作の要件を満たす場合、著作権は原則として作成させた法人(会社)に帰属する。"}, {"id": 59, "cat": "経営・戦略・法務", "topic": "個人情報保護法における第三者提供の同意", "q": "個人情報取扱事業者が、取得した個人データを第三者に提供する場合に、原則として必要となる手続はどれか。", "choices": [{"label": "ア", "text": "監督官庁への届出だけを行うこと"}, {"label": "イ", "text": "第三者からの依頼書を受け取ること"}, {"label": "ウ", "text": "特に手続は不要である"}, {"label": "エ", "text": "本人の同意を得ること"}], "correct": "エ", "hint": "個人情報保護法では、第三者提供には原則として本人の同意を得ることが必要とされている。"}, {"id": 60, "cat": "経営・戦略・法務", "topic": "下請法の趣旨", "q": "下請法(下請代金支払遅延等防止法)の主な目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "発注者と下請事業者との取引の公正化を図り、下請事業者の利益を保護すること"}, {"label": "イ", "text": "個人情報の第三者提供を制限すること"}, {"label": "ウ", "text": "特許権の存続期間を延長すること"}, {"label": "エ", "text": "下請事業者の労働時間の上限を規定すること"}], "correct": "ア", "hint": "下請法は、親事業者と下請事業者との取引の公正化を図り、下請事業者の利益を保護することを目的とした法律である。"}];

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
          <div style={s.sub}>基本情報技術者 — 60問内蔵(令和5年公開問題の出題分野比率に準拠)</div>
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
