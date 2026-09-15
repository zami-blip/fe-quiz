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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "16進小数から10進小数への変換", "q": "16進小数0.4Cを10進小数で表したものはどれか。", "choices": [{"label": "ア", "text": "0.375"}, {"label": "イ", "text": "0.48"}, {"label": "ウ", "text": "0.30"}, {"label": "エ", "text": "0.296875"}], "correct": "エ", "hint": "0.4C=(4×16+12)/256=76/256=0.296875になる。"}, {"id": 2, "cat": "基礎理論", "topic": "NAND素子だけでAND回路を構成する方法", "q": "NAND素子だけを用いてAND回路と同じ働きをする回路を作る方法として適切なものはどれか。", "choices": [{"label": "ア", "text": "NAND素子を1個だけ使い、入力をそのまま出力する"}, {"label": "イ", "text": "NAND素子の出力を接地する"}, {"label": "ウ", "text": "NAND素子を並列に並べるだけでよい"}, {"label": "エ", "text": "2つの入力をNAND素子に入れ、その出力をもう一つのNAND素子の両方の入力に入れる"}], "correct": "エ", "hint": "NAND素子の出力を反転させることでANDと同じ働きが得られるため、NANDの出力を別のNAND素子の両方の入力へ入れる(NANDを2段重ねる)ことでAND回路を構成できる。"}, {"id": 3, "cat": "基礎理論", "topic": "二つのさいころの目の和の期待値", "q": "2個のさいころを同時に投げるとき、出た目の和の期待値はどれか。", "choices": [{"label": "ア", "text": "6"}, {"label": "イ", "text": "6.5"}, {"label": "ウ", "text": "7.5"}, {"label": "エ", "text": "7"}], "correct": "エ", "hint": "出た目の和のとり得る値は2～12であり、対称性から期待値は(1+6)×2/2=7になる(全36通りの合計は252、252÷36=7)。"}, {"id": 4, "cat": "基礎理論", "topic": "2の補数による負数表現", "q": "8ビットの2の補数表現において、10進数の-5を表すビット列はどれか。", "choices": [{"label": "ア", "text": "11111011"}, {"label": "イ", "text": "00000101"}, {"label": "ウ", "text": "11111010"}, {"label": "エ", "text": "10000101"}], "correct": "ア", "hint": "5(00000101)のビットを反転すると11111010、これに1を加えると11111011になり、これが-5の2の補数表現である。"}, {"id": 5, "cat": "基礎理論", "topic": "パリティビットで検出できない誤り", "q": "1ビットの水平パリティ(偶数パリティ)を付加して伝送する場合、検出できない誤りとして適切なものはどれか。", "choices": [{"label": "ア", "text": "3ビットが同時に反転する誤り"}, {"label": "イ", "text": "5ビットが同時に反転する誤り"}, {"label": "ウ", "text": "同じデータ内で偶数個のビットが同時に反転する誤り"}, {"label": "エ", "text": "1ビットだけが反転する誤り"}], "correct": "ウ", "hint": "偶数パリティは1の個数の偶奇を検査するため、偶数個のビットが同時に反転すると1の個数の偶奇が変わらず、誤りを検出できない。"}, {"id": 6, "cat": "基礎理論", "topic": "計算量オーダーとデータ件数増加の関係", "q": "あるアルゴリズムの処理時間がデータ件数nに対してO(n^2)で表されるとき、データ件数が2倍になると処理時間はおよそ何倍になるか。", "choices": [{"label": "ア", "text": "16倍"}, {"label": "イ", "text": "4倍"}, {"label": "ウ", "text": "2倍"}, {"label": "エ", "text": "8倍"}], "correct": "イ", "hint": "O(n^2)は件数の2乗に比例するため、件数が2倍になると処理時間は2^2=4倍になる。"}, {"id": 7, "cat": "アルゴリズム・プログラミング", "topic": "双方向リンクリストへの要素挿入", "q": "双方向リンクリストで社員A→社員K→社員Tの順に並んでいる。社員Aと社員Kの間に新しい社員Gを挿入するとき、変更が必要なポインタの組み合わせとして適切なものはどれか。", "choices": [{"label": "ア", "text": "社員Kの次ポインタと社員Tの前ポインタだけ"}, {"label": "イ", "text": "全ての社員の前後ポインタ"}, {"label": "ウ", "text": "社員Aの前ポインタと社員Tの次ポインタだけ"}, {"label": "エ", "text": "社員Aの次ポインタ、社員Kの前ポインタ、社員Gの次・前ポインタ"}], "correct": "エ", "hint": "Aの次ポインタをGへ、Kの前ポインタをGへ変更し、新設するGの次ポインタをK、前ポインタをAに設定する必要がある。社員Tのポインタは変更不要である。"}, {"id": 8, "cat": "アルゴリズム・プログラミング", "topic": "減算による最大公約数の流れ図トレース", "q": "変数mを18、nを12として、m>nならm←m-n、n>mならn←n-mという処理をm=nになるまで繰り返す。処理が終了したときのmの値はどれか。", "choices": [{"label": "ア", "text": "12"}, {"label": "イ", "text": "9"}, {"label": "ウ", "text": "3"}, {"label": "エ", "text": "6"}], "correct": "エ", "hint": "18→(m=6,n=12)→(m=6,n=6)で一致し、最大公約数である6が最終的なmの値になる。"}, {"id": 9, "cat": "アルゴリズム・プログラミング", "topic": "二分探索木の後順(postorder)走査", "q": "空の二分探索木に50, 30, 70, 20, 40, 60, 80の順で値を挿入した。この木を後順(左部分木→右部分木→根の順)で走査した結果はどれか。", "choices": [{"label": "ア", "text": "20, 40, 30, 60, 80, 70, 50"}, {"label": "イ", "text": "50, 30, 20, 40, 70, 60, 80"}, {"label": "ウ", "text": "80, 70, 60, 50, 40, 30, 20"}, {"label": "エ", "text": "20, 30, 40, 50, 60, 70, 80"}], "correct": "ア", "hint": "この挿入順で構成される木を後順走査すると、各部分木の左→右→根の順で出力され、20, 40, 30, 60, 80, 70, 50になる。"}, {"id": 10, "cat": "アルゴリズム・プログラミング", "topic": "クイックソートの1回目の分割によるピボットの確定位置", "q": "配列{6, 2, 8, 3, 9, 4}の末尾の4をピボットとし、左から順に調べて「4以下」を左側へ集め、最後にピボットを境界へ置く分割を1回行う。分割後、ピボット4の確定位置は先頭から何番目か。", "choices": [{"label": "ア", "text": "1番目"}, {"label": "イ", "text": "4番目"}, {"label": "ウ", "text": "2番目"}, {"label": "エ", "text": "3番目"}], "correct": "エ", "hint": "4以下の要素は2と3の2個であり、ピボットはそれらの直後、先頭から3番目に確定する。"}, {"id": 11, "cat": "アルゴリズム・プログラミング", "topic": "後置記法の式をスタックで評価する手順", "q": "後置記法(逆ポーランド記法)の式 5 3 2 - * をスタックを用いて計算した結果はどれか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "5"}, {"label": "エ", "text": "15"}], "correct": "ウ", "hint": "5,3,2の順にスタックへ積み、演算子-が現れたら3と2を取り出して3-2=1を計算しスタックへ戻す(スタックは[5,1])。次に演算子*が現れたら5と1を取り出して5×1=5を計算する。よって結果は5になる。"}, {"id": 12, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数のトレース", "q": "関数f(n)を「nが0のとき1を返し、それ以外はn×f(n-1)を返す」と定義する。f(4)の値はどれか。", "choices": [{"label": "ア", "text": "120"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "10"}, {"label": "エ", "text": "24"}], "correct": "エ", "hint": "f(4)=4×f(3)=4×3×f(2)=4×3×2×f(1)=4×3×2×1×f(0)=4×3×2×1×1=24になる。"}, {"id": 13, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表への線形探索法(オープンアドレス法)による格納", "q": "大きさ7のハッシュ表(格納場所は0番目から6番目)に、ハッシュ関数h(k)=k mod 7と線形探索法(衝突時は次の番地を順に調べる)を用いて、キー10, 17, 23をこの順に格納する。17が格納される場所は何番目か。", "choices": [{"label": "ア", "text": "4番目"}, {"label": "イ", "text": "5番目"}, {"label": "ウ", "text": "3番目"}, {"label": "エ", "text": "2番目"}], "correct": "ア", "hint": "10はh(10)=3で3番目に格納される。17もh(17)=3で衝突するため、次の空き番地である4番目に格納される。"}, {"id": 14, "cat": "アルゴリズム・プログラミング", "topic": "二分探索の最大比較回数の計算", "q": "整列済みの2,048件のデータに対して二分探索を行う場合、最悪の場合の比較回数はどれか。", "choices": [{"label": "ア", "text": "32"}, {"label": "イ", "text": "11"}, {"label": "ウ", "text": "8"}, {"label": "エ", "text": "16"}], "correct": "イ", "hint": "比較回数はlog2(データ件数)に相当し、log2(2048)=11回になる。"}, {"id": 15, "cat": "コンピュータシステム", "topic": "メモリインタリーブによる高速化の仕組み", "q": "主記憶を4つの独立したバンクに分割し、連続するアドレスを異なるバンクに割り当てるメモリインタリーブについて、連続領域への読み出しが高速化される理由として適切なものはどれか。", "choices": [{"label": "ア", "text": "データを圧縮して転送するため"}, {"label": "イ", "text": "主記憶の総容量が増えるため"}, {"label": "ウ", "text": "複数のバンクへ並行してアクセスを開始でき、各バンクのアクセス待ち時間が重なり合うため"}, {"label": "エ", "text": "CPUのクロック周波数が上がるため"}], "correct": "ウ", "hint": "連続アドレスが異なるバンクに分散配置されるため、複数バンクへ並行してアクセスを開始でき、1つのバンクのアクセス待ち時間中に他のバンクの読み出しを進められる。"}, {"id": 16, "cat": "コンピュータシステム", "topic": "エッジコンピューティングが適する場面", "q": "工場のロボットアームに取り付けたセンサの異常検知を、ミリ秒単位の遅延で即座に行いたい。この要件に最も適した処理方式はどれか。", "choices": [{"label": "ア", "text": "月次バッチで蓄積データをまとめて処理する方式"}, {"label": "イ", "text": "全てのセンサデータを遠隔地のクラウドサーバへ送信してから処理する方式"}, {"label": "ウ", "text": "センサの近くに設置したサーバでデータを即座に処理するエッジコンピューティング"}, {"label": "エ", "text": "処理結果を紙の帳票に出力してから確認する方式"}], "correct": "ウ", "hint": "遠隔のクラウドへ送信すると通信の往復遅延が生じるため、データ発生源に近い場所で即座に処理するエッジコンピューティングが、低遅延の要件に適している。"}, {"id": 17, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュのヒット率が98%、キャッシュのアクセス時間が4ナノ秒、主記憶のアクセス時間が80ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "6.52"}, {"label": "イ", "text": "7.52"}, {"label": "ウ", "text": "5.52"}, {"label": "エ", "text": "4.52"}], "correct": "ウ", "hint": "実効アクセス時間=0.98×4+0.02×80=3.92+1.6=5.52ナノ秒になる。"}, {"id": 18, "cat": "コンピュータシステム", "topic": "RAID5の実効容量計算", "q": "1台400GBのディスク5台でRAID5を構成した場合の実効容量は何GBか。", "choices": [{"label": "ア", "text": "1600"}, {"label": "イ", "text": "2000"}, {"label": "ウ", "text": "1200"}, {"label": "エ", "text": "2400"}], "correct": "ア", "hint": "RAID5はn台のうち1台分をパリティに使うため、実効容量は(5-1)×400=1,600GBになる。"}, {"id": 19, "cat": "コンピュータシステム", "topic": "直列システムの稼働率計算", "q": "稼働率0.95の装置を3台直列に接続したシステム全体の稼働率に最も近いものはどれか。", "choices": [{"label": "ア", "text": "0.86"}, {"label": "イ", "text": "0.95"}, {"label": "ウ", "text": "0.90"}, {"label": "エ", "text": "0.81"}], "correct": "ア", "hint": "直列システムの稼働率は各装置の稼働率の積であり、0.95の3乗≒0.857、最も近いのは0.86になる。"}, {"id": 20, "cat": "コンピュータシステム", "topic": "割込みの分類(外部割込みと内部割込み)", "q": "次の割込みのうち、外部割込みに分類されるものはどれか。", "choices": [{"label": "ア", "text": "未定義命令の実行による割込み"}, {"label": "イ", "text": "ゼロによる除算エラーによる割込み"}, {"label": "ウ", "text": "キーボードからの入力信号による割込み"}, {"label": "エ", "text": "演算結果のオーバーフローによる割込み"}], "correct": "ウ", "hint": "キーボードなど周辺機器からの信号による割込みは外部割込みであり、他の選択肢はいずれもプログラム自身の実行中に生じる内部割込みである。"}, {"id": 21, "cat": "コンピュータシステム", "topic": "コンテナ型仮想化が適する場面", "q": "1台の物理サーバ上に、OS起動のオーバーヘッドを抑えながら5つの独立したアプリケーション実行環境を迅速に構築・破棄したい。最も適した技術はどれか。", "choices": [{"label": "ア", "text": "デュアルブート環境の構築"}, {"label": "イ", "text": "ハイパーバイザ型の完全仮想化(各環境にゲストOSを個別導入)"}, {"label": "ウ", "text": "物理サーバの5台への分割購入"}, {"label": "エ", "text": "コンテナ型仮想化"}], "correct": "エ", "hint": "コンテナ型仮想化はホストOSのカーネルを複数のコンテナで共有するため、ゲストOSを個別に起動するハイパーバイザ型よりも軽量かつ迅速に環境を構築・破棄できる。"}, {"id": 22, "cat": "ネットワーク", "topic": "WAFの設置場所", "q": "次の図の構成において、Webアプリケーションへの攻撃を検査・遮断するWAFを設置すべき最も適切な箇所はどこか。ここで、SSLアクセラレータで暗号化通信が復号されるものとし、WAF自体には暗号化・復号機能はないものとする。\nインターネット─(a)─ファイアウォール─(b)─SSLアクセラレータ─(c)─Webサーバ─(d)─データベースサーバ", "choices": [{"label": "ア", "text": "(a)"}, {"label": "イ", "text": "(d)"}, {"label": "ウ", "text": "(c)"}, {"label": "エ", "text": "(b)"}], "correct": "ウ", "hint": "WAFはHTTP通信の内容を検査する必要があるため、SSLアクセラレータで復号された後、Webサーバへの平文通信が流れる(c)の位置に設置する必要がある。"}, {"id": 23, "cat": "ネットワーク", "topic": "サブネットにおける使用可能ホスト数の計算", "q": "サブネットマスクが/27であるネットワークにおいて、割り当て可能なホストアドレスの最大数はどれか。", "choices": [{"label": "ア", "text": "30"}, {"label": "イ", "text": "62"}, {"label": "ウ", "text": "14"}, {"label": "エ", "text": "126"}], "correct": "ア", "hint": "/27はホスト部が5ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^5-2=30個になる。"}, {"id": 24, "cat": "ネットワーク", "topic": "低遅延を優先する通信に適したプロトコル", "q": "対戦型オンラインゲームのプレイヤー座標のようにリアルタイム性が重視され、多少のデータ欠損よりも低遅延を優先したい通信で一般的に用いられるプロトコルはどれか。", "choices": [{"label": "ア", "text": "TCP"}, {"label": "イ", "text": "FTP"}, {"label": "ウ", "text": "UDP"}, {"label": "エ", "text": "SMTP"}], "correct": "ウ", "hint": "UDPは確認応答や再送制御を行わないため低遅延だが信頼性は低く、多少の欠損より低遅延を優先する用途に適している。"}, {"id": 25, "cat": "ネットワーク", "topic": "名前解決の仕組み(DNS)", "q": "利用者がWebブラウザにドメイン名を入力してアクセスする際、そのドメイン名に対応するIPアドレスを取得するために問い合わせる仕組みはどれか。", "choices": [{"label": "ア", "text": "SNMP"}, {"label": "イ", "text": "DNS"}, {"label": "ウ", "text": "DHCP"}, {"label": "エ", "text": "NTP"}], "correct": "イ", "hint": "DNSはドメイン名とIPアドレスを対応付け、名前解決を行う仕組みである。"}, {"id": 26, "cat": "ネットワーク", "topic": "回線速度からの転送時間の計算", "q": "900Mバイトのデータを150Mビット/秒の回線で転送するのに理論上かかる時間は何秒か。1M=10^6とする。", "choices": [{"label": "ア", "text": "48"}, {"label": "イ", "text": "96"}, {"label": "ウ", "text": "24"}, {"label": "エ", "text": "12"}], "correct": "ア", "hint": "900Mバイト=7,200Mビットであり、150Mビット/秒の回線では7,200÷150=48秒かかる。"}, {"id": 27, "cat": "データベース", "topic": "推移的関数従属の排除による正規化", "q": "ある表で「社員番号→所属部署コード」「所属部署コード→部署名」という関数従属が成立するとき、部署名は社員番号にどのように従属しているか。", "choices": [{"label": "ア", "text": "推移的に従属している"}, {"label": "イ", "text": "直接に(部分従属なく)従属している"}, {"label": "ウ", "text": "従属していない"}, {"label": "エ", "text": "部署名は主キーである"}], "correct": "ア", "hint": "部署名は所属部署コードを経由して社員番号に間接的に従属しており、これを推移的関数従属と呼ぶ。"}, {"id": 28, "cat": "データベース", "topic": "トランザクションの原子性(atomicity)", "q": "口座Xから1万円を引き落とし口座Yへ入金する振込処理で、引き落としには成功したが、直後にシステム障害で入金処理が実行されなかった。この場合にトランザクション管理が保証すべき挙動として適切なものはどれか。", "choices": [{"label": "ア", "text": "引き落としだけは確定させ、入金は後で手動処理する"}, {"label": "イ", "text": "エラーを無視して処理を継続する"}, {"label": "ウ", "text": "引き落としも取り消し、振込前の状態に戻す"}, {"label": "エ", "text": "口座Xの残高をそのまま凍結する"}], "correct": "ウ", "hint": "原子性(atomicity)は、トランザクションの処理が全て実行されるか、全く実行されなかった状態に戻るかのどちらかになることを保証する特性であり、一部だけ実行された状態を許さない。"}, {"id": 29, "cat": "データベース", "topic": "GROUP BYとHAVING句を用いた集計条件の指定", "q": "社員表(社員名, 部署, 給与)から、部署ごとの平均給与を求め、平均給与が400(万円)以上の部署だけを抽出したい。適切なSQL文はどれか。", "choices": [{"label": "ア", "text": "SELECT 部署, AVG(給与) FROM 社員表 WHERE AVG(給与) >= 400 GROUP BY 部署"}, {"label": "イ", "text": "SELECT 部署, AVG(給与) FROM 社員表 GROUP BY 部署 WHERE AVG(給与) >= 400"}, {"label": "ウ", "text": "SELECT 部署, AVG(給与) FROM 社員表 GROUP BY 部署 HAVING AVG(給与) >= 400"}, {"label": "エ", "text": "SELECT 部署, AVG(給与) FROM 社員表 WHERE 給与 >= 400"}], "correct": "ウ", "hint": "集計関数(AVG)の結果に対する条件はHAVING句で指定する。WHERE句には集計関数を直接使うことはできない。"}, {"id": 30, "cat": "データベース", "topic": "デッドロックの発生条件", "q": "トランザクションTaが資源Xをロックしたまま資源Yの解放を待ち、同時にトランザクションTbが資源Yをロックしたまま資源Xの解放を待っている。この状態を何と呼ぶか。", "choices": [{"label": "ア", "text": "キャッシュミス"}, {"label": "イ", "text": "デッドロック"}, {"label": "ウ", "text": "スラッシング"}, {"label": "エ", "text": "フラグメンテーション"}], "correct": "イ", "hint": "複数のトランザクションが互いに相手の保持する資源(ロック)の解放を待ち続け、処理が進まなくなる状態をデッドロックと呼ぶ。"}, {"id": 31, "cat": "データベース", "topic": "排他制御のロック粒度とトレードオフ", "q": "データベースの排他制御において、ロックの粒度を表単位からレコード単位に細かくすることの一般的な効果はどれか。", "choices": [{"label": "ア", "text": "同時実行性は高まるが、ロック管理のオーバーヘッドが増加する"}, {"label": "イ", "text": "データの整合性が保証されなくなる"}, {"label": "ウ", "text": "同時実行性は必ず低下する"}, {"label": "エ", "text": "ロック管理のオーバーヘッドは必ず減少する"}], "correct": "ア", "hint": "ロック粒度を細かくすると複数のトランザクションが異なる行を同時に更新しやすくなり同時実行性は高まるが、管理するロック数が増えオーバーヘッドも増加する。"}, {"id": 32, "cat": "情報セキュリティ", "topic": "ドライブバイダウンロード攻撃", "q": "利用者が悪意のあるWebサイトを閲覧しただけで、Webブラウザなどの脆弱性を突かれてマルウェアに感染させられる攻撃はどれか。", "choices": [{"label": "ア", "text": "中間者攻撃"}, {"label": "イ", "text": "ドライブバイダウンロード攻撃"}, {"label": "ウ", "text": "総当たり攻撃"}, {"label": "エ", "text": "辞書攻撃"}], "correct": "イ", "hint": "ドライブバイダウンロード攻撃は、利用者が悪意のあるWebサイトを閲覧しただけで、ブラウザ等の脆弱性を突かれマルウェアに感染させられる攻撃である。"}, {"id": 33, "cat": "情報セキュリティ", "topic": "所有物を利用した多要素認証", "q": "パスワードの入力に加えて、利用者のスマートフォンアプリ上に60秒ごとに更新される6桁のコードの入力を求めるログイン方式は、認証の3要素のうちどの組み合わせを用いているか。", "choices": [{"label": "ア", "text": "所有要素だけを2回確認する認証"}, {"label": "イ", "text": "記憶要素だけを2回確認するシングルファクタ認証"}, {"label": "ウ", "text": "記憶(パスワード)と所有(スマートフォン)の組み合わせによる多要素認証"}, {"label": "エ", "text": "生体情報だけを用いた認証"}], "correct": "ウ", "hint": "パスワードは「記憶」、スマートフォンで生成されるコードは端末の「所有」に基づく要素であり、異なる種類の要素を組み合わせているため多要素認証に該当する。"}, {"id": 34, "cat": "情報セキュリティ", "topic": "デジタル署名の検証に用いる鍵", "q": "受信者がデジタル署名を検証する際に用いる鍵として適切なものはどれか。", "choices": [{"label": "ア", "text": "受信者の秘密鍵"}, {"label": "イ", "text": "送信者の秘密鍵"}, {"label": "ウ", "text": "送信者の公開鍵"}, {"label": "エ", "text": "受信者の公開鍵"}], "correct": "ウ", "hint": "デジタル署名は送信者の秘密鍵で作成され、受信者は送信者の公開鍵を使って検証する。"}, {"id": 35, "cat": "情報セキュリティ", "topic": "ゼロデイ攻撃の特徴", "q": "ソフトウェアの脆弱性が発見されてから、開発元が修正パッチを配布するまでの間に、その脆弱性を悪用して行われる攻撃を何と呼ぶか。", "choices": [{"label": "ア", "text": "ゼロデイ攻撃"}, {"label": "イ", "text": "DDoS攻撃"}, {"label": "ウ", "text": "フィッシング"}, {"label": "エ", "text": "ランサムウェア攻撃"}], "correct": "ア", "hint": "脆弱性の修正プログラムが提供される前(0日目)に行われる攻撃をゼロデイ攻撃と呼ぶ。"}, {"id": 36, "cat": "情報セキュリティ", "topic": "リスク対応の四分類(リスク移転)", "q": "情報セキュリティリスクへの対応のうち、サイバー保険への加入や外部クラウドサービスの利用などによって、リスクによる損失の一部を外部に転嫁する対応はどれか。", "choices": [{"label": "ア", "text": "リスク受容"}, {"label": "イ", "text": "リスク回避"}, {"label": "ウ", "text": "リスク移転"}, {"label": "エ", "text": "リスク低減"}], "correct": "ウ", "hint": "リスク移転は、保険への加入やアウトソーシングなどによって、リスクによる損失の一部を外部に転嫁する対応である。"}, {"id": 37, "cat": "情報セキュリティ", "topic": "CSIRTの役割", "q": "自社でランサムウェア感染が発生した際に、被害範囲の特定、外部機関(JPCERT/CC等)との連携、再発防止策の統括を専門に行う組織はどれか。", "choices": [{"label": "ア", "text": "ISMS"}, {"label": "イ", "text": "CSIRT"}, {"label": "ウ", "text": "SOC(のみで完結する運用監視チーム)"}, {"label": "エ", "text": "PMO"}], "correct": "イ", "hint": "CSIRT(Computer Security Incident Response Team)は、セキュリティインシデントへの対応や関係機関との調整を担うチームである。"}, {"id": 38, "cat": "ソフトウェア・HI", "topic": "3次元グラフィックスにおけるクリッピング", "q": "3次元グラフィックス処理において、表示ウィンドウの外側にはみ出た部分を除去し、内側に見える部分だけを取り出す処理を何と呼ぶか。", "choices": [{"label": "ア", "text": "シェーディング"}, {"label": "イ", "text": "クリッピング"}, {"label": "ウ", "text": "レンダリング"}, {"label": "エ", "text": "アンチエイリアシング"}], "correct": "イ", "hint": "クリッピングは、表示領域(ウィンドウ)の外側の部分を除去し、内側の見える部分だけを取り出す処理である。"}, {"id": 39, "cat": "ソフトウェア・HI", "topic": "ユニバーサルデザインの実践例", "q": "公共施設の入口を設計する際、車いすの利用者だけでなくベビーカー利用者や高齢者、けがをした人など幅広い人が段差なく使える通路を標準として設けることは、どの設計思想の実践例か。", "choices": [{"label": "ア", "text": "ユニバーサルデザイン"}, {"label": "イ", "text": "スキューモーフィズム"}, {"label": "ウ", "text": "フラットデザイン"}, {"label": "エ", "text": "レスポンシブデザイン"}], "correct": "ア", "hint": "特定の利用者向けの特別な設備としてではなく、できるだけ多くの人が最初から使える設計にすることがユニバーサルデザインの考え方である。"}, {"id": 40, "cat": "システム開発", "topic": "スクラムにおけるデイリースクラムの目的", "q": "スクラムにおいて、開発チームの全員が短時間で集まり、昨日やったこと・今日やること・障害になっていることを共有するイベントはどれか。", "choices": [{"label": "ア", "text": "スプリントレビュー"}, {"label": "イ", "text": "スプリントプランニング"}, {"label": "ウ", "text": "レトロスペクティブ"}, {"label": "エ", "text": "デイリースクラム"}], "correct": "エ", "hint": "デイリースクラムは、開発チームが毎日短時間集まり、進捗状況や課題を共有するイベントである。"}, {"id": 41, "cat": "システム開発", "topic": "命令網羅を満たす最小テストケース数", "q": "次の擬似コードに対して、命令網羅(プログラム中の全ての命令文を少なくとも1回実行する)を満たすために必要な最小のテストケース数はどれか。\nif (x > 0) then\n  y ← 1\nelse\n  y ← -1\nendif\ny ← y + 1", "choices": [{"label": "ア", "text": "3"}, {"label": "イ", "text": "1"}, {"label": "ウ", "text": "2"}, {"label": "エ", "text": "4"}], "correct": "ウ", "hint": "「y←1」と「y←-1」はどちらか一方しか実行されないため、x>0の場合とx<=0の場合の2通りのテストケースが必要である。「y←y+1」はどちらの場合にも実行されるため追加のケースは不要である。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "PERTの3点見積りによる期待値計算", "q": "ある作業の所要日数について、楽観値3日、最頻値5日、悲観値13日と見積もられた。PERTの計算式による期待値は何日か。", "choices": [{"label": "ア", "text": "8"}, {"label": "イ", "text": "5"}, {"label": "ウ", "text": "7"}, {"label": "エ", "text": "6"}], "correct": "エ", "hint": "PERTの期待値=(楽観値+4×最頻値+悲観値)÷6=(3+20+13)÷6=36÷6=6日になる。"}, {"id": 43, "cat": "プロジェクトマネジメント", "topic": "アローダイアグラムにおける費用最小の短縮対象作業の選定", "q": "作業A(3日)の後にB(5日)、続いてD(2日)と進む経路と、作業A(3日)の後にC(4日)、続いてD(2日)と進む経路をもつプロジェクトがある(A→B→Dは10日、A→C→Dは9日で、当初の全体所要日数は10日)。ここで作業Aに1日の遅れが生じ、A→B→Dの経路が11日になった。当初の10日で終えるために、1日短縮すべき作業として費用面で最も適切なのはどれか。ここで各作業の1日当たりの短縮費用は、A=5万円、B=2万円、C=3万円、D=6万円とする。", "choices": [{"label": "ア", "text": "A"}, {"label": "イ", "text": "B"}, {"label": "ウ", "text": "D"}, {"label": "エ", "text": "C"}], "correct": "イ", "hint": "A→C→D経路は遅延後も10日に収まっており、短縮が必要なのはA→B→D経路だけである。この経路上にあるA・B・Dのうち、短縮費用が最も安いのはBの2万円であり、Bを1日短縮すれば必要十分である。"}, {"id": 44, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法の計算", "q": "あるシステムの外部入力が4個(1個当たりの重み4)、外部出力が3個(1個当たりの重み5)、内部論理ファイルが2個(重み10)であるとき、未調整ファンクションポイントの合計はどれか。", "choices": [{"label": "ア", "text": "51"}, {"label": "イ", "text": "61"}, {"label": "ウ", "text": "41"}, {"label": "エ", "text": "71"}], "correct": "ア", "hint": "4×4+3×5+2×10=16+15+20=51ファンクションポイントになる。"}, {"id": 45, "cat": "プロジェクトマネジメント", "topic": "EVMによるコスト差異とスケジュール差異の計算", "q": "あるプロジェクトの計画価値(PV)が120万円、出来高価値(EV)が100万円、実コスト(AC)が110万円のとき、コスト差異(CV=EV-AC)とスケジュール差異(SV=EV-PV)の組み合わせとして正しいものはどれか。", "choices": [{"label": "ア", "text": "CV=-10万円、SV=-20万円"}, {"label": "イ", "text": "CV=0万円、SV=-10万円"}, {"label": "ウ", "text": "CV=-20万円、SV=-10万円"}, {"label": "エ", "text": "CV=+10万円、SV=+20万円"}], "correct": "ア", "hint": "CV=EV-AC=100-110=-10万円、SV=EV-PV=100-120=-20万円であり、いずれも負の値のためコスト超過かつ進捗遅延を示す。"}, {"id": 46, "cat": "サービスマネジメント・監査", "topic": "テレワーク運用規程のシステム監査における指摘事項", "q": "ある会社が定めたテレワーク運用規程について、情報セキュリティの観点からシステム監査を実施した。監査人が指摘事項として報告すべき状況はどれか。", "choices": [{"label": "ア", "text": "テレワーク運用規程の遵守を利用条件としている"}, {"label": "イ", "text": "テレワークで使用するPCへのマルウェア対策ソフトの導入可否を、従業員それぞれの判断に委ねている"}, {"label": "ウ", "text": "テレワークで使用するPCを会社支給のものに限定している"}, {"label": "エ", "text": "テレワークで使用するPCを従業員の家族に使用させないよう定めている"}], "correct": "イ", "hint": "マルウェア対策ソフトの導入要否を従業員の判断に委ねると、対策が徹底されないリスクがあるため、指摘事項に該当する。"}, {"id": 47, "cat": "サービスマネジメント・監査", "topic": "障害復旧後の根本原因分析(問題管理)", "q": "サービス中断からの復旧を優先するインシデント管理によって暫定的にサービスが復旧した後、同じ障害の再発を防ぐために根本原因を調査し恒久対策を検討するプロセスはどれか。", "choices": [{"label": "ア", "text": "構成管理"}, {"label": "イ", "text": "リリース管理"}, {"label": "ウ", "text": "問題管理"}, {"label": "エ", "text": "変更管理"}], "correct": "ウ", "hint": "問題管理は、インシデントの根本原因を分析し、恒久的な解決策や再発防止策を検討するプロセスである。"}, {"id": 48, "cat": "サービスマネジメント・監査", "topic": "SLAにおけるサービスレベル未達成時の取り決め", "q": "サービス提供者と顧客の間で、目標稼働率を99.9%と定め、これを下回った場合の対応(利用料金の減額等)についてもあらかじめ明文化して合意する文書はどれか。", "choices": [{"label": "ア", "text": "NDA"}, {"label": "イ", "text": "SLA"}, {"label": "ウ", "text": "MOU"}, {"label": "エ", "text": "RFP"}], "correct": "イ", "hint": "SLA(Service Level Agreement)は、サービスの品質目標や、目標未達成時の取り決めを提供者と顧客の間で合意した文書である。"}, {"id": 49, "cat": "経営・戦略・法務", "topic": "ハイブリッドクラウドの説明", "q": "自社専用のプライベートクラウドと、汎用のパブリッククラウドとを連携させ、データやアプリケーションを相互に運用できるようにする構成はどれか。", "choices": [{"label": "ア", "text": "マルチクラウド"}, {"label": "イ", "text": "ハイブリッドクラウド"}, {"label": "ウ", "text": "コミュニティクラウド"}, {"label": "エ", "text": "オンプレミス"}], "correct": "イ", "hint": "ハイブリッドクラウドは、プライベートクラウドとパブリッククラウドを連携させ、相互運用が可能な環境を提供する構成である。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "ダイバーシティマネジメントの考え方", "q": "性別・年齢・国籍・価値観など従業員の多様性を尊重し、それぞれの個性を活かすことで組織の活力向上を図る経営の考え方はどれか。", "choices": [{"label": "ア", "text": "目標管理制度(MBO)"}, {"label": "イ", "text": "ダイバーシティマネジメント"}, {"label": "ウ", "text": "労使協調"}, {"label": "エ", "text": "ワークライフバランス"}], "correct": "イ", "hint": "ダイバーシティマネジメントは、性別や年齢、国籍などの多様性を尊重し、組織の活力向上につなげる経営の考え方である。"}, {"id": 51, "cat": "経営・戦略・法務", "topic": "ERPの説明", "q": "企業の会計・人事・生産・販売など基幹業務の経営資源を統合的に計画・管理し、経営の効率向上を図るための手法・システムはどれか。", "choices": [{"label": "ア", "text": "SCM"}, {"label": "イ", "text": "ERP"}, {"label": "ウ", "text": "BPR"}, {"label": "エ", "text": "CRM"}], "correct": "イ", "hint": "ERP(Enterprise Resource Planning)は、企業の経営資源を統合的に計画・管理し、経営の効率向上を図るための手法・概念である。"}, {"id": 52, "cat": "経営・戦略・法務", "topic": "イノベータ理論における「アーリーアダプタ」の位置づけ", "q": "イノベータ理論において、新商品やサービスを比較的早い段階で受け入れ、流行に敏感で自ら情報収集を行い、他の消費者にも大きな影響を与える層はどれか。", "choices": [{"label": "ア", "text": "アーリーアダプタ"}, {"label": "イ", "text": "レイトマジョリティ"}, {"label": "ウ", "text": "ラガード"}, {"label": "エ", "text": "イノベータ"}], "correct": "ア", "hint": "アーリーアダプタは、新商品・サービスを早期に受け入れ、周囲への影響力が大きい層とされる。"}, {"id": 53, "cat": "経営・戦略・法務", "topic": "CIOの役割", "q": "企業における情報管理や情報システムに関する戦略の立案及び執行を統括する最高責任者の役職はどれか。", "choices": [{"label": "ア", "text": "CFO"}, {"label": "イ", "text": "CTO"}, {"label": "ウ", "text": "COO"}, {"label": "エ", "text": "CIO"}], "correct": "エ", "hint": "CIO(Chief Information Officer)は、情報管理・情報システムに関する戦略の立案及び執行を統括する最高責任者である。"}, {"id": 54, "cat": "経営・戦略・法務", "topic": "ボリュームライセンス契約の説明", "q": "企業などソフトウェアを大量に購入する組織向けに、インストール可能な台数をあらかじめ取り決めて使用を認める契約形態はどれか。", "choices": [{"label": "ア", "text": "フリーウェアライセンス"}, {"label": "イ", "text": "サブスクリプション契約"}, {"label": "ウ", "text": "OEM契約"}, {"label": "エ", "text": "ボリュームライセンス契約"}], "correct": "エ", "hint": "ボリュームライセンス契約は、大量購入者向けに、インストールできる台数をあらかじめ取り決めてソフトウェアの使用を認める契約形態である。"}, {"id": 55, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "自社の強み・弱みという内部要因と、機会・脅威という外部要因を整理して戦略を検討する手法はどれか。", "choices": [{"label": "ア", "text": "PPM"}, {"label": "イ", "text": "バリューチェーン分析"}, {"label": "ウ", "text": "3C分析"}, {"label": "エ", "text": "SWOT分析"}], "correct": "エ", "hint": "SWOT分析は、強み(S)・弱み(W)・機会(O)・脅威(T)の4要素を整理して戦略を検討する手法である。"}, {"id": 56, "cat": "経営・戦略・法務", "topic": "損益分岐点売上高の計算", "q": "固定費が400万円、変動費率が50%である場合、損益分岐点売上高はいくらか。", "choices": [{"label": "ア", "text": "800万円"}, {"label": "イ", "text": "700万円"}, {"label": "ウ", "text": "600万円"}, {"label": "エ", "text": "900万円"}], "correct": "ア", "hint": "損益分岐点売上高=固定費÷(1-変動費率)=400÷(1-0.5)=400÷0.5=800万円になる。"}, {"id": 57, "cat": "経営・戦略・法務", "topic": "ROI(投資利益率)の計算", "q": "800万円を投資し、その結果として年間160万円の利益を得た場合のROI(投資利益率)はどれか。", "choices": [{"label": "ア", "text": "15%"}, {"label": "イ", "text": "20%"}, {"label": "ウ", "text": "25%"}, {"label": "エ", "text": "10%"}], "correct": "イ", "hint": "ROI=利益÷投資額×100=160÷800×100=20%になる。"}, {"id": 58, "cat": "経営・戦略・法務", "topic": "著作権の職務著作", "q": "従業員が職務上作成したプログラムの著作権は、原則として誰に帰属するか。", "choices": [{"label": "ア", "text": "著作権は発生しない"}, {"label": "イ", "text": "発注元の顧客企業"}, {"label": "ウ", "text": "作成した従業員個人"}, {"label": "エ", "text": "法人(会社)"}], "correct": "エ", "hint": "職務著作の要件を満たす場合、著作権は原則として作成させた法人(会社)に帰属する。"}, {"id": 59, "cat": "経営・戦略・法務", "topic": "個人情報保護法における第三者提供の同意", "q": "個人情報取扱事業者が、取得した個人データを第三者に提供する場合に、原則として必要となる手続はどれか。", "choices": [{"label": "ア", "text": "監督官庁への届出だけを行うこと"}, {"label": "イ", "text": "第三者からの依頼書を受け取ること"}, {"label": "ウ", "text": "特に手続は不要である"}, {"label": "エ", "text": "本人の同意を得ること"}], "correct": "エ", "hint": "個人情報保護法では、第三者提供には原則として本人の同意を得ることが必要とされている。"}, {"id": 60, "cat": "経営・戦略・法務", "topic": "下請法の趣旨", "q": "下請法(下請代金支払遅延等防止法)の主な目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "個人情報の第三者提供を制限すること"}, {"label": "イ", "text": "発注者と下請事業者との取引の公正化を図り、下請事業者の利益を保護すること"}, {"label": "ウ", "text": "下請事業者の労働時間の上限を規定すること"}, {"label": "エ", "text": "特許権の存続期間を延長すること"}], "correct": "イ", "hint": "下請法は、親事業者と下請事業者との取引の公正化を図り、下請事業者の利益を保護することを目的とした法律である。"}];

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
