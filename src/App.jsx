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

const REV_TAG = "TD6E";
const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "16進小数から10進小数への変換", "q": "16進小数0.9を10進小数で表したものはどれか。", "choices": [{"label": "ア", "text": "0.5625"}, {"label": "イ", "text": "0.9"}, {"label": "ウ", "text": "0.45"}, {"label": "エ", "text": "0.5"}], "correct": "ア", "hint": "16進の1桁は4ビットに相当し、0.9=9/16=0.5625になる。"}, {"id": 2, "cat": "基礎理論", "topic": "重み付きくじの賞金期待値", "q": "15本のくじのうち3本が当たりで、当たると600円、外れると0円がもらえる。このくじを1本引いたときの賞金の期待値はどれか。", "choices": [{"label": "ア", "text": "100円"}, {"label": "イ", "text": "120円"}, {"label": "ウ", "text": "200円"}, {"label": "エ", "text": "150円"}], "correct": "イ", "hint": "期待値=600円×(3/15)+0円×(12/15)=120円になる。"}, {"id": 3, "cat": "基礎理論", "topic": "2の補数による負数表現", "q": "8ビットの2の補数表現において、10進数の-20を表すビット列はどれか。", "choices": [{"label": "ア", "text": "11101011"}, {"label": "イ", "text": "00010100"}, {"label": "ウ", "text": "10010100"}, {"label": "エ", "text": "11101100"}], "correct": "エ", "hint": "20(00010100)のビットを反転すると11101011、これに1を加えると11101100になり、これが-20の2の補数表現である。"}, {"id": 4, "cat": "基礎理論", "topic": "XOR素子だけで否定(NOT)を構成する方法", "q": "論理回路の設計において、XOR素子(排他的論理和)だけを使ってNOT素子(反転)と同じ働きをする回路を作りたい。適切な構成はどれか。", "choices": [{"label": "ア", "text": "XOR素子の一方の入力を常に1に固定し、もう一方に信号を入力する"}, {"label": "イ", "text": "XOR素子の両方の入力に同じ信号を入力する"}, {"label": "ウ", "text": "XOR素子の一方の入力を常に0に固定し、もう一方に信号を入力する"}, {"label": "エ", "text": "XOR素子を使わずAND素子だけで構成する"}], "correct": "ア", "hint": "XORは一方の入力を1に固定すると、もう一方の入力を反転させて出力する働きになるため、NOT素子として使うことができる。"}, {"id": 5, "cat": "基礎理論", "topic": "巡回冗長検査(CRC)の特徴", "q": "ネットワーク通信で広く用いられる誤り検出方式であるCRC(巡回冗長検査)の特徴として適切なものはどれか。", "choices": [{"label": "ア", "text": "誤りを検出するだけでなく、誤り箇所を自動的に訂正できる"}, {"label": "イ", "text": "送信するデータ量を必ず半分に圧縮する"}, {"label": "ウ", "text": "生成多項式による除算の余りを付加して検査するため、パリティビットより多くのビット誤りパターンを検出できる"}, {"label": "エ", "text": "暗号化と同じ仕組みで秘匿性を確保する"}], "correct": "ウ", "hint": "CRCは生成多項式による除算の余り(検査符号)を付加する方式で、単純なパリティビットよりも多くのビット誤りパターンを検出できる誤り検出方式である。"}, {"id": 6, "cat": "基礎理論", "topic": "計算量オーダーとデータ件数増加の関係", "q": "あるアルゴリズムの処理時間がデータ件数nに対してO(n log n)で表されるとき、データ件数が2倍になった場合の処理時間の変化について適切な説明はどれか。", "choices": [{"label": "ア", "text": "4倍になる"}, {"label": "イ", "text": "変化しない"}, {"label": "ウ", "text": "ちょうど2倍になる"}, {"label": "エ", "text": "ほぼ2倍強になる(2倍よりわずかに大きい)"}], "correct": "エ", "hint": "O(n log n)はO(n)よりわずかに増加が大きいため、件数が2倍になると処理時間は2倍をわずかに上回る程度に増加する。"}, {"id": 7, "cat": "アルゴリズム・プログラミング", "topic": "片方向連結リストの先頭への要素追加", "q": "片方向連結リストで先頭ポインタheadがPを指し、P→Q→Rの順に連結されている。新しい要素Nを先頭に追加してN→P→Q→Rとしたい場合に必要な操作はどれか。", "choices": [{"label": "ア", "text": "Qの次ポインタをNに設定する"}, {"label": "イ", "text": "Pの次ポインタをNに設定するだけでよい"}, {"label": "ウ", "text": "Rの次ポインタをNに設定する"}, {"label": "エ", "text": "Nの次ポインタをPに設定し、headがNを指すように変更する"}], "correct": "エ", "hint": "Nを先頭に追加するには、Nの次ポインタを現在の先頭であるPに設定し、その後head自体がNを指すように変更する必要がある。"}, {"id": 8, "cat": "アルゴリズム・プログラミング", "topic": "剰余を用いたユークリッドの互除法の流れ図トレース", "q": "変数aを84、変数bを36として、「bが0でない間、rをaをbで割った余りとし、aにbを、bにrを代入する」処理を繰り返す。bが0になったときのaの値はどれか。", "choices": [{"label": "ア", "text": "6"}, {"label": "イ", "text": "12"}, {"label": "ウ", "text": "24"}, {"label": "エ", "text": "18"}], "correct": "イ", "hint": "84÷36の余りは12(a=36,b=12)→36÷12の余りは0(a=12,b=0)となり、bが0になったときのaの値である12が最大公約数になる。"}, {"id": 9, "cat": "アルゴリズム・プログラミング", "topic": "二分探索木への挿入と中順(inorder)走査", "q": "空の二分探索木に55, 35, 75, 20, 45, 65, 90の順で値を挿入した。この木を中順(左部分木→根→右部分木の順)で走査した結果はどれか。", "choices": [{"label": "ア", "text": "55, 35, 75, 20, 45, 65, 90"}, {"label": "イ", "text": "90, 75, 65, 55, 45, 35, 20"}, {"label": "ウ", "text": "20, 45, 35, 65, 90, 75, 55"}, {"label": "エ", "text": "20, 35, 45, 55, 65, 75, 90"}], "correct": "エ", "hint": "二分探索木を中順走査すると、キーが昇順に並んだ結果が得られるため、20, 35, 45, 55, 65, 75, 90になる。"}, {"id": 10, "cat": "アルゴリズム・プログラミング", "topic": "クイックソートの1回目の分割によるピボットの確定位置", "q": "配列{11, 3, 8, 5, 14, 7}の末尾の7をピボットとし、左から順に調べて「7以下」を左側へ集め、最後にピボットを境界へ置く分割を1回行う。分割後、ピボット7の確定位置は先頭から何番目か。", "choices": [{"label": "ア", "text": "3番目"}, {"label": "イ", "text": "2番目"}, {"label": "ウ", "text": "5番目"}, {"label": "エ", "text": "4番目"}], "correct": "ア", "hint": "7以下の要素は3と5の2個であり、ピボットはそれらの直後、先頭から3番目に確定する。"}, {"id": 11, "cat": "アルゴリズム・プログラミング", "topic": "中置記法の式を後置記法に変換する考え方", "q": "中置記法の式 (A + B) * C を後置記法(逆ポーランド記法)に変換したものはどれか。", "choices": [{"label": "ア", "text": "A B C + *"}, {"label": "イ", "text": "A B + C *"}, {"label": "ウ", "text": "+ A B * C"}, {"label": "エ", "text": "* + A B C"}], "correct": "イ", "hint": "括弧内のA+Bを先に後置記法A B +に変換し、その結果に*とCを続けるとA B + C *になる。"}, {"id": 12, "cat": "アルゴリズム・プログラミング", "topic": "再帰関数によるべき乗計算のトレース", "q": "関数g(x, n)を「nが0のとき1を返し、それ以外はx×g(x, n-1)を返す」と定義する。g(3, 4)の値はどれか。", "choices": [{"label": "ア", "text": "27"}, {"label": "イ", "text": "12"}, {"label": "ウ", "text": "81"}, {"label": "エ", "text": "64"}], "correct": "ウ", "hint": "g(3,4)=3×g(3,3)=3×3×g(3,2)=…と展開すると3の4乗となり、3^4=81になる。"}, {"id": 13, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表への線形探索法(オープンアドレス法)による格納", "q": "大きさ6のハッシュ表(格納場所は0番目から5番目)に、ハッシュ関数h(k)=k mod 6と線形探索法(衝突時は次の番地を順に調べる)を用いて、キー14, 8, 20をこの順に格納する。20が格納される場所は何番目か。", "choices": [{"label": "ア", "text": "5番目"}, {"label": "イ", "text": "3番目"}, {"label": "ウ", "text": "4番目"}, {"label": "エ", "text": "2番目"}], "correct": "ウ", "hint": "14はh(14)=2で2番目に格納される。8はh(8)=2で衝突するため3番目に格納される。20もh(20)=2で衝突し、2番目・3番目も使用済みのため4番目に格納される。"}, {"id": 14, "cat": "アルゴリズム・プログラミング", "topic": "二分探索の最大比較回数の計算", "q": "整列済みの256件のデータに対して二分探索を行う場合、最悪の場合の比較回数はどれか。", "choices": [{"label": "ア", "text": "16"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "32"}], "correct": "イ", "hint": "比較回数はlog2(データ件数)に相当し、log2(256)=8回になる。"}, {"id": 15, "cat": "コンピュータシステム", "topic": "パイプラインハザードの一種(データハザード)", "q": "パイプライン処理を行うプロセッサにおいて、ある命令の実行結果を直後の命令が必要とするために、後続の命令の実行を一時的に待たせなければならない現象を何と呼ぶか。", "choices": [{"label": "ア", "text": "制御ハザード"}, {"label": "イ", "text": "分岐予測ミス"}, {"label": "ウ", "text": "データハザード"}, {"label": "エ", "text": "構造ハザード"}], "correct": "ウ", "hint": "データハザードは、命令間でのデータの依存関係により、後続命令が先行命令の結果を待たなければならないために生じるパイプラインの乱れである。"}, {"id": 16, "cat": "コンピュータシステム", "topic": "デジタルツインの活用場面", "q": "工場の生産ラインを仮想空間上に精密に再現し、実際の設備を止めることなく、シミュレーション上で稼働条件の変更による影響を事前に検証したい。この目的に適した技術はどれか。", "choices": [{"label": "ア", "text": "ブロックチェーン"}, {"label": "イ", "text": "エッジコンピューティング(単体)"}, {"label": "ウ", "text": "デジタルツイン"}, {"label": "エ", "text": "RPA"}], "correct": "ウ", "hint": "デジタルツインは、現実の設備やシステムを仮想空間上に精密に再現し、シミュレーションによる検証や予測を行う技術である。"}, {"id": 17, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュのヒット率が90%、キャッシュのアクセス時間が5ナノ秒、主記憶のアクセス時間が70ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "14.5"}, {"label": "イ", "text": "17.5"}, {"label": "ウ", "text": "11.5"}, {"label": "エ", "text": "8.5"}], "correct": "ウ", "hint": "実効アクセス時間=0.9×5+0.1×70=4.5+7=11.5ナノ秒になる。"}, {"id": 18, "cat": "コンピュータシステム", "topic": "RAID5の実効容量計算", "q": "1台200GBのディスク7台でRAID5を構成した場合の実効容量は何GBか。", "choices": [{"label": "ア", "text": "1200"}, {"label": "イ", "text": "1000"}, {"label": "ウ", "text": "1400"}, {"label": "エ", "text": "1600"}], "correct": "ア", "hint": "RAID5はn台のうち1台分をパリティに使うため、実効容量は(7-1)×200=1,200GBになる。"}, {"id": 19, "cat": "コンピュータシステム", "topic": "直列システムの稼働率計算", "q": "稼働率0.97の装置を5台直列に接続したシステム全体の稼働率に最も近いものはどれか。", "choices": [{"label": "ア", "text": "0.80"}, {"label": "イ", "text": "0.86"}, {"label": "ウ", "text": "0.92"}, {"label": "エ", "text": "0.97"}], "correct": "イ", "hint": "直列システムの稼働率は各装置の稼働率の積であり、0.97の5乗≒0.859、最も近いのは0.86になる。"}, {"id": 20, "cat": "コンピュータシステム", "topic": "割込みの分類(外部割込みと内部割込み)", "q": "プログラムの実行中に生じる割込みのうち、周辺機器やタイマなどCPUの外部からの信号によらず、実行中の命令自体が原因で発生するものを内部割込みという。次のうち内部割込みに該当するものはどれか。", "choices": [{"label": "ア", "text": "タッチパネルが入力を検知したことによる割込み"}, {"label": "イ", "text": "バッテリー残量低下を通知する割込み"}, {"label": "ウ", "text": "整数演算のオーバーフローによる割込み"}, {"label": "エ", "text": "通信モデムが着信を通知する割込み"}], "correct": "ウ", "hint": "整数演算のオーバーフローはプログラム自身の演算処理中に生じるため内部割込みに分類される。他の選択肢はいずれも周辺機器からの信号による外部割込みである。"}, {"id": 21, "cat": "コンピュータシステム", "topic": "ブルーグリーンデプロイメントの特徴", "q": "本番環境をBとGの2系統用意し、新バージョンを待機系にデプロイしてから、ルータの切り替えだけで新旧を入れ替える方式を何と呼ぶか。", "choices": [{"label": "ア", "text": "ビッグバンリリース"}, {"label": "イ", "text": "ローリングアップデート"}, {"label": "ウ", "text": "ブルーグリーンデプロイメント"}, {"label": "エ", "text": "カナリアリリース"}], "correct": "ウ", "hint": "ブルーグリーンデプロイメントは、稼働系(例:青)と待機系(例:緑)の2系統を用意し、切り替えによって新バージョンへの移行を短時間かつ低リスクで行う方式である。"}, {"id": 22, "cat": "ネットワーク", "topic": "IDS/IPSの設置場所と役割", "q": "次の図の構成において、外部からの不正な通信パターンをリアルタイムで検知し、必要に応じて自動的に遮断したい。IPS(侵入防止システム)を設置すべき最も適切な箇所はどこか。\nインターネット─(a)─ルータ─(b)─ファイアウォール─(c)─社内LAN(利用者PC群)", "choices": [{"label": "ア", "text": "設置場所は問わない"}, {"label": "イ", "text": "(c)"}, {"label": "ウ", "text": "(a)"}, {"label": "エ", "text": "(b)"}], "correct": "エ", "hint": "ファイアウォールを通過した後だが社内LANに入る前の(b)に設置することで、社内向けの通信を検査し、不正な通信を検知次第自動的に遮断できる。"}, {"id": 23, "cat": "ネットワーク", "topic": "サブネットにおける使用可能ホスト数の計算", "q": "サブネットマスクが/26であるネットワークにおいて、割り当て可能なホストアドレスの最大数はどれか。", "choices": [{"label": "ア", "text": "30"}, {"label": "イ", "text": "126"}, {"label": "ウ", "text": "14"}, {"label": "エ", "text": "62"}], "correct": "エ", "hint": "/26はホスト部が6ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^6-2=62個になる。"}, {"id": 24, "cat": "ネットワーク", "topic": "信頼性を優先する通信に適したプロトコル", "q": "銀行の送金処理のように、パケットの欠損や順序の入れ替わりを一切許容できず、確実にデータを届けたい通信で一般的に用いられるプロトコルはどれか。", "choices": [{"label": "ア", "text": "ARP"}, {"label": "イ", "text": "UDP"}, {"label": "ウ", "text": "ICMP"}, {"label": "エ", "text": "TCP"}], "correct": "エ", "hint": "TCPは確認応答や再送制御、順序制御を行うため、データの欠損や順序の乱れを許容できない用途に適している。"}, {"id": 25, "cat": "ネットワーク", "topic": "メールサーバのIPアドレス自動割当の仕組み", "q": "社内ネットワークに新しいノートPCを接続した際、手動設定なしにIPアドレスやデフォルトゲートウェイなどのネットワーク設定が自動的に割り当てられる仕組みはどれか。", "choices": [{"label": "ア", "text": "NTP"}, {"label": "イ", "text": "DNS"}, {"label": "ウ", "text": "DHCP"}, {"label": "エ", "text": "SNMP"}], "correct": "ウ", "hint": "DHCPは、ネットワークに接続した機器にIPアドレスなどの設定情報を自動的に割り当てる仕組みである。"}, {"id": 26, "cat": "ネットワーク", "topic": "回線速度からの転送時間の計算", "q": "720Mバイトのデータを120Mビット/秒の回線で転送するのに理論上かかる時間は何秒か。1M=10^6とする。", "choices": [{"label": "ア", "text": "24"}, {"label": "イ", "text": "48"}, {"label": "ウ", "text": "36"}, {"label": "エ", "text": "60"}], "correct": "イ", "hint": "720Mバイト=5,760Mビットであり、120Mビット/秒の回線では5,760÷120=48秒かかる。"}, {"id": 27, "cat": "データベース", "topic": "部分関数従属の排除による第2正規形化", "q": "主キーが「注文番号+商品コード」の複合キーである受注明細表で、「商品コード→商品名」という商品コードだけで決まる関数従属(部分関数従属)が存在する。第2正規形にするための操作として適切なものはどれか。", "choices": [{"label": "ア", "text": "商品コードと商品名を別の表に分離する"}, {"label": "イ", "text": "注文番号を主キーから外す"}, {"label": "ウ", "text": "商品名の列を削除する"}, {"label": "エ", "text": "商品名を複合主キーに追加する"}], "correct": "ア", "hint": "複合キーの一部だけで決まる部分関数従属する列は、別表に分離することで第2正規形になる。"}, {"id": 28, "cat": "データベース", "topic": "トランザクションの一貫性(consistency)", "q": "ある会員ポイントシステムで、ポイント付与処理の前後で「会員の保有ポイント合計と、ポイント履歴の合計が必ず一致する」という業務ルールが常に保たれるようにしたい。これはACID特性のうちどれに該当するか。", "choices": [{"label": "ア", "text": "原子性(atomicity)"}, {"label": "イ", "text": "耐久性(durability)"}, {"label": "ウ", "text": "独立性(isolation)"}, {"label": "エ", "text": "一貫性(consistency)"}], "correct": "エ", "hint": "一貫性(consistency)は、トランザクションの実行前後でデータベースが業務ルール(整合性制約)を満たした状態を保つことを保証する特性である。"}, {"id": 29, "cat": "データベース", "topic": "サブクエリを用いた条件抽出", "q": "社員表(社員名, 部署, 給与)から、自部署内の平均給与より高い給与を得ている社員を抽出したい。このような条件指定に用いるSQLの技法はどれか。", "choices": [{"label": "ア", "text": "相関サブクエリ(自分自身の行を参照するサブクエリ)"}, {"label": "イ", "text": "トリガーの作成だけ"}, {"label": "ウ", "text": "単純なUNION"}, {"label": "エ", "text": "INDEXの作成だけ"}], "correct": "ア", "hint": "自部署の平均という、行ごとに異なる基準値と比較するには、外側のクエリの行を参照する相関サブクエリを用いる必要がある。"}, {"id": 30, "cat": "データベース", "topic": "ロールバックの適用場面", "q": "複数の更新処理を含むトランザクションの途中でエラーが発生し、それまでの更新を全て取り消して処理開始前の状態に戻したい。この操作はどれか。", "choices": [{"label": "ア", "text": "ロールバック"}, {"label": "イ", "text": "チェックポイント"}, {"label": "ウ", "text": "コミット"}, {"label": "エ", "text": "ロールフォワード"}], "correct": "ア", "hint": "ロールバックは、トランザクション内の更新を取り消し、処理開始前の状態に戻す操作である。"}, {"id": 31, "cat": "データベース", "topic": "ビュー(仮想表)の役割", "q": "複数の表を結合した複雑なSELECT文を、あたかも1つの表であるかのように扱えるようにし、利用者には必要な列だけを見せたい。この目的で用いる機能はどれか。", "choices": [{"label": "ア", "text": "ビュー(仮想表)"}, {"label": "イ", "text": "インデックス"}, {"label": "ウ", "text": "トリガー"}, {"label": "エ", "text": "ストアドプロシージャ(のみ)"}], "correct": "ア", "hint": "ビューは、SELECT文の定義を仮想的な表として扱えるようにする機能であり、複雑な問合せを隠蔽したり、見せる列を制限したりするのに用いられる。"}, {"id": 32, "cat": "情報セキュリティ", "topic": "サプライチェーン攻撃の特徴", "q": "標的企業に直接侵入する代わりに、その企業が利用しているソフトウェア開発ベンダーのシステムに侵入し、正規のアップデート配布経路を悪用してマルウェアを混入させる攻撃を何と呼ぶか。", "choices": [{"label": "ア", "text": "クリックジャッキング"}, {"label": "イ", "text": "辞書攻撃"}, {"label": "ウ", "text": "総当たり攻撃"}, {"label": "エ", "text": "サプライチェーン攻撃"}], "correct": "エ", "hint": "サプライチェーン攻撃は、標的に直接侵入する代わりに、取引先やソフトウェア供給元など信頼された経路を経由して攻撃を行う手法である。"}, {"id": 33, "cat": "情報セキュリティ", "topic": "生体認証を利用した認証", "q": "スマートフォンのロック解除で、指紋や顔などの身体的特徴を用いて本人確認を行う認証方式は、認証の3要素のうちどれに分類されるか。", "choices": [{"label": "ア", "text": "生体(inherence)"}, {"label": "イ", "text": "記憶(knowledge)"}, {"label": "ウ", "text": "権限(authority)"}, {"label": "エ", "text": "所有(possession)"}], "correct": "ア", "hint": "指紋や顔など身体的特徴を用いる認証は、本人自身に備わった特徴による生体(inherence)要素に分類される。"}, {"id": 34, "cat": "情報セキュリティ", "topic": "共通鍵暗号方式の鍵配送の課題", "q": "共通鍵暗号方式を用いて多数の相手と個別に暗号通信を行う場合に生じる課題として適切なものはどれか。", "choices": [{"label": "ア", "text": "デジタル署名を作成できない"}, {"label": "イ", "text": "鍵の長さを64ビット固定にしなければならない"}, {"label": "ウ", "text": "相手ごとに異なる鍵を安全に配送・管理する必要があり、相手が増えるほど鍵の数が急増する"}, {"label": "エ", "text": "暗号化・復号の処理速度が公開鍵暗号方式より大幅に遅い"}], "correct": "ウ", "hint": "共通鍵暗号方式では、通信相手ごとに異なる鍵を安全に共有・管理する必要があり、相手の数が増えると管理すべき鍵の組み合わせが急増するという課題がある。"}, {"id": 35, "cat": "情報セキュリティ", "topic": "ソーシャルエンジニアリングの手口", "q": "攻撃者が情報システム部門の担当者を装って社員に電話をかけ、パスワードを口頭で聞き出そうとする行為に該当する攻撃はどれか。", "choices": [{"label": "ア", "text": "ポートスキャン"}, {"label": "イ", "text": "バッファオーバーフロー攻撃"}, {"label": "ウ", "text": "SQLインジェクション"}, {"label": "エ", "text": "ソーシャルエンジニアリング"}], "correct": "エ", "hint": "ソーシャルエンジニアリングは、技術的手段ではなく、人の心理的な隙や行動のミスにつけこんで情報を盗み出す手法である。"}, {"id": 36, "cat": "情報セキュリティ", "topic": "リスクアセスメントにおけるリスクの特定", "q": "情報セキュリティリスクアセスメントの最初の段階で、組織が保有する情報資産を洗い出し、それぞれに対する脅威と脆弱性を明らかにする活動はどれか。", "choices": [{"label": "ア", "text": "リスクの保険付保"}, {"label": "イ", "text": "リスク特定"}, {"label": "ウ", "text": "リスク対応"}, {"label": "エ", "text": "リスク受容の承認"}], "correct": "イ", "hint": "リスク特定は、リスクアセスメントの最初の段階として、情報資産とそれに対する脅威・脆弱性を洗い出す活動である。"}, {"id": 37, "cat": "情報セキュリティ", "topic": "SOCの役割", "q": "24時間365日体制でネットワークやサーバのログを監視し、不審な兆候を早期に検知して一次対応を行う専門組織はどれか。", "choices": [{"label": "ア", "text": "CFO室"}, {"label": "イ", "text": "SOC(Security Operation Center)"}, {"label": "ウ", "text": "広報部"}, {"label": "エ", "text": "人事部"}], "correct": "イ", "hint": "SOC(Security Operation Center)は、ログやアラートを常時監視し、セキュリティインシデントの兆候を早期に検知・一次対応する専門組織である。"}, {"id": 38, "cat": "ソフトウェア・HI", "topic": "レイトレーシングの説明", "q": "光の反射や屈折、影の描画を物理的な光線の経路計算によって精密に再現する3次元グラフィックスの描画技法はどれか。", "choices": [{"label": "ア", "text": "アンチエイリアシング"}, {"label": "イ", "text": "テクスチャマッピング(のみ)"}, {"label": "ウ", "text": "クリッピング"}, {"label": "エ", "text": "レイトレーシング"}], "correct": "エ", "hint": "レイトレーシングは、視点から発する光線の経路を追跡し、反射・屈折・影を物理的に精密に計算して描画する技法である。"}, {"id": 39, "cat": "ソフトウェア・HI", "topic": "ユーザビリティ評価における認知的ウォークスルー", "q": "専門家が、初めてそのシステムを使う利用者の視点に立って、タスクを一段階ずつ実行しながら、各画面で利用者が迷わず次の操作を選べるかを検証する評価手法はどれか。", "choices": [{"label": "ア", "text": "負荷テスト"}, {"label": "イ", "text": "ユーザビリティテスト(実利用者による実施)"}, {"label": "ウ", "text": "認知的ウォークスルー"}, {"label": "エ", "text": "A/Bテスト"}], "correct": "ウ", "hint": "認知的ウォークスルーは、専門家が初心者の視点でタスクを一段階ずつ実行し、各段階で利用者が正しい操作を選べるかを検証する評価手法である。"}, {"id": 40, "cat": "システム開発", "topic": "スプリントレビューの目的", "q": "スクラムにおいて、スプリントの最後に、開発したインクリメント(成果物)をステークホルダーに実際に見せ、フィードバックを得るイベントはどれか。", "choices": [{"label": "ア", "text": "レトロスペクティブ"}, {"label": "イ", "text": "スプリントレビュー"}, {"label": "ウ", "text": "スプリントプランニング"}, {"label": "エ", "text": "デイリースクラム"}], "correct": "イ", "hint": "スプリントレビューは、スプリントの終わりに開発した成果物をステークホルダーに提示し、フィードバックを得るイベントである。"}, {"id": 41, "cat": "システム開発", "topic": "境界値分析によるテストケース設計", "q": "「入力値が1以上100以下の場合に受け付ける」という仕様に対して、境界値分析の考え方に基づいてテストケースを設計する場合、優先的に含めるべき値の組み合わせはどれか。", "choices": [{"label": "ア", "text": "文字列などの型が異なる値だけ"}, {"label": "イ", "text": "50だけ(範囲の中央値)"}, {"label": "ウ", "text": "1000(明らかに範囲外の極端な値)だけ"}, {"label": "エ", "text": "0, 1, 100, 101(境界とその前後の値)"}], "correct": "エ", "hint": "境界値分析は、仕様上の境界(この場合は1と100)とその直前・直後の値に誤りが生じやすいという経験則に基づき、境界付近の値を優先してテストケースに含める手法である。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "PERTの3点見積りによる期待値計算", "q": "ある作業の所要日数について、楽観値2日、最頻値4日、悲観値12日と見積もられた。PERTの計算式による期待値は何日か。", "choices": [{"label": "ア", "text": "4"}, {"label": "イ", "text": "5"}, {"label": "ウ", "text": "6"}, {"label": "エ", "text": "7"}], "correct": "イ", "hint": "PERTの期待値=(楽観値+4×最頻値+悲観値)÷6=(2+16+12)÷6=30÷6=5日になる。"}, {"id": 43, "cat": "プロジェクトマネジメント", "topic": "アローダイアグラムにおける費用最小の短縮対象作業の選定", "q": "作業A(4日)の後にB(6日)、続いてD(3日)と進む経路(A→B→D、計13日)と、作業A(4日)の後にC(5日)、続いてD(3日)と進む経路(A→C→D、計12日)をもつプロジェクトがある(当初の全体所要日数は13日)。ここで作業Aに1日の遅れが生じ、A→B→Dの経路が14日、A→C→Dの経路が13日になった。当初の13日で終えるために、1日短縮すべき作業として費用面で最も適切なのはどれか。ここで各作業の1日当たりの短縮費用は、A=7万円、B=2万円、C=4万円、D=8万円とする。", "choices": [{"label": "ア", "text": "A"}, {"label": "イ", "text": "C"}, {"label": "ウ", "text": "B"}, {"label": "エ", "text": "D"}], "correct": "ウ", "hint": "A→C→D経路は遅延後も13日に収まっており、短縮が必要なのはA→B→D経路(14日)だけである。この経路上にあるA・B・Dのうち、短縮費用が最も安いのはBの2万円であり、Bを1日短縮すれば必要十分である。"}, {"id": 44, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法の計算", "q": "あるシステムの外部入力が6個(1個当たりの重み4)、外部出力が2個(1個当たりの重み5)、内部論理ファイルが4個(重み10)であるとき、未調整ファンクションポイントの合計はどれか。", "choices": [{"label": "ア", "text": "74"}, {"label": "イ", "text": "54"}, {"label": "ウ", "text": "84"}, {"label": "エ", "text": "64"}], "correct": "ア", "hint": "6×4+2×5+4×10=24+10+40=74ファンクションポイントになる。"}, {"id": 45, "cat": "プロジェクトマネジメント", "topic": "EVMによるコスト差異とスケジュール差異の計算", "q": "あるプロジェクトの計画価値(PV)が110万円、出来高価値(EV)が90万円、実コスト(AC)が100万円のとき、コスト差異(CV=EV-AC)とスケジュール差異(SV=EV-PV)の組み合わせとして正しいものはどれか。", "choices": [{"label": "ア", "text": "CV=-10万円、SV=-20万円"}, {"label": "イ", "text": "CV=-20万円、SV=-10万円"}, {"label": "ウ", "text": "CV=+10万円、SV=-10万円"}, {"label": "エ", "text": "CV=+10万円、SV=+20万円"}], "correct": "ア", "hint": "CV=EV-AC=90-100=-10万円、SV=EV-PV=90-110=-20万円であり、いずれも負の値のためコスト超過かつ進捗遅延を示す。"}, {"id": 46, "cat": "サービスマネジメント・監査", "topic": "クラウド利用規程のシステム監査における指摘事項", "q": "ある会社がクラウドストレージの利用規程を定めた。情報セキュリティの観点からシステム監査を実施したところ、複数の運用実態が判明した。このうち監査人が指摘事項として報告すべき状況はどれか。", "choices": [{"label": "ア", "text": "定期的にアクセスログを確認する体制を整えている"}, {"label": "イ", "text": "社外秘の顧客データを含むファイルについても、アクセス権限の範囲設定を利用者個人の判断に委ねている"}, {"label": "ウ", "text": "会社が許可したクラウドストレージサービスのみ利用を認めている"}, {"label": "エ", "text": "共有リンクの発行に上長の承認を必須としている"}], "correct": "イ", "hint": "社外秘データを含むファイルのアクセス権限設定を個人の判断に委ねると、意図しない範囲への公開や漏えいのリスクが高まるため、指摘事項に該当する。"}, {"id": 47, "cat": "サービスマネジメント・監査", "topic": "変更管理プロセスの目的", "q": "本番環境への設定変更やソフトウェア更新を実施する際に、影響範囲の評価や承認手続を経てから実施することで、変更に伴う障害の発生を抑えることを目的とするプロセスはどれか。", "choices": [{"label": "ア", "text": "変更管理"}, {"label": "イ", "text": "インシデント管理"}, {"label": "ウ", "text": "問題管理"}, {"label": "エ", "text": "キャパシティ管理"}], "correct": "ア", "hint": "変更管理は、本番環境への変更を計画的かつ統制された手順で実施し、変更に伴う障害発生のリスクを抑えることを目的とするプロセスである。"}, {"id": 48, "cat": "サービスマネジメント・監査", "topic": "RTO(目標復旧時間)の考え方", "q": "災害などでシステムが停止した場合に、「停止から4時間以内にサービスを復旧させる」という目標をあらかじめ定めている。この目標値を表す用語はどれか。", "choices": [{"label": "ア", "text": "SLA違反率"}, {"label": "イ", "text": "MTBF"}, {"label": "ウ", "text": "RPO(目標復旧時点)"}, {"label": "エ", "text": "RTO(目標復旧時間)"}], "correct": "エ", "hint": "RTO(Recovery Time Objective)は、災害等からシステムを復旧させるまでの目標時間を表す指標である。"}, {"id": 49, "cat": "経営・戦略・法務", "topic": "マルチクラウド戦略の採用理由", "q": "M社は、特定のクラウド事業者に依存するリスク(ベンダーロックイン)を避けるため、用途に応じて複数の異なるクラウド事業者のサービスを組み合わせて利用する方針を採用した。この構成はどれか。", "choices": [{"label": "ア", "text": "ハイブリッドクラウド"}, {"label": "イ", "text": "マルチクラウド"}, {"label": "ウ", "text": "プライベートクラウド単独運用"}, {"label": "エ", "text": "オンプレミス集約"}], "correct": "イ", "hint": "マルチクラウドは、複数の異なるクラウド事業者のサービスを組み合わせて利用する構成であり、特定事業者への依存(ベンダーロックイン)を避ける狙いで採用されることが多い。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "ワークエンゲージメントを高める施策", "q": "N社は、従業員が仕事に対して活力・熱意・没頭を感じながら前向きに取り組める状態を高めることを目的に、裁量権の拡大やフィードバックの充実といった施策を導入した。この目指す状態を表す用語はどれか。", "choices": [{"label": "ア", "text": "ジョブローテーション(単独の意味)"}, {"label": "イ", "text": "ワークエンゲージメント"}, {"label": "ウ", "text": "アウトソーシング"}, {"label": "エ", "text": "ワークライフバランス"}], "correct": "イ", "hint": "ワークエンゲージメントは、従業員が仕事に対して活力・熱意・没頭を感じながら前向きに取り組んでいる心理状態を表す概念である。"}, {"id": 51, "cat": "経営・戦略・法務", "topic": "SCM(サプライチェーンマネジメント)の目的", "q": "O社は、原材料の調達から生産、物流、販売に至る一連の流れを複数企業間で情報共有しながら全体最適化し、欠品や過剰在庫を減らしたいと考えている。この目的で導入する仕組みはどれか。", "choices": [{"label": "ア", "text": "ERP(単体導入によるものだけ)"}, {"label": "イ", "text": "BPR(業務改革)単独の実施"}, {"label": "ウ", "text": "CRM(顧客関係管理)"}, {"label": "エ", "text": "SCM(サプライチェーンマネジメント)"}], "correct": "エ", "hint": "SCMは、調達から生産・物流・販売までの一連の流れを企業間で情報共有し全体最適化することで、欠品や過剰在庫の削減を図る仕組みである。"}, {"id": 52, "cat": "経営・戦略・法務", "topic": "キャズム理論の考え方", "q": "イノベータ理論を発展させたキャズム理論では、新商品が初期採用者層(イノベータ・アーリーアダプタ)から一般消費者層(アーリーマジョリティ以降)に普及する過程で生じる、越えるのが難しい大きな溝を何と呼ぶか。", "choices": [{"label": "ア", "text": "ブルーオーシャン"}, {"label": "イ", "text": "キャズム"}, {"label": "ウ", "text": "レッドオーシャン"}, {"label": "エ", "text": "デジタルデバイド"}], "correct": "イ", "hint": "キャズムは、新商品が初期採用者層から一般消費者層(アーリーマジョリティ以降)へ普及する過程で生じる、超えるのが難しい溝を指す概念である。"}, {"id": 53, "cat": "経営・戦略・法務", "topic": "CDOの役割", "q": "P社は、データやデジタル技術を活用した新規事業創出とビジネスモデル変革を統括する責任者のポストを新設することにした。この役職の一般的な呼称はどれか。", "choices": [{"label": "ア", "text": "CLO"}, {"label": "イ", "text": "CDO(Chief Digital Officer)"}, {"label": "ウ", "text": "CFO"}, {"label": "エ", "text": "CHRO"}], "correct": "イ", "hint": "CDO(Chief Digital Officer)は、データやデジタル技術を活用した事業創出・変革を統括する責任者である。"}, {"id": 54, "cat": "経営・戦略・法務", "topic": "サブスクリプション契約の特徴", "q": "Q社は、ソフトウェアを買い切りで販売する代わりに、月額料金を支払っている間だけ利用でき、支払いを止めると利用できなくなる契約形態に切り替えた。この契約形態はどれか。", "choices": [{"label": "ア", "text": "パブリックドメインとしての提供"}, {"label": "イ", "text": "ボリュームライセンス契約"}, {"label": "ウ", "text": "サブスクリプション契約"}, {"label": "エ", "text": "OEM契約"}], "correct": "ウ", "hint": "サブスクリプション契約は、利用期間に応じて定期的に料金を支払い、支払いを継続している間だけサービスやソフトウェアを利用できる契約形態である。"}, {"id": 55, "cat": "経営・戦略・法務", "topic": "プロダクトポートフォリオマネジメント(PPM)の適用", "q": "R社は、自社の複数の事業を「市場成長率」と「市場占有率」の2軸で分類し、資金を投入すべき事業と撤退を検討すべき事業を判断する材料とした。この分析手法はどれか。", "choices": [{"label": "ア", "text": "PPM(プロダクトポートフォリオマネジメント)"}, {"label": "イ", "text": "バリューチェーン分析"}, {"label": "ウ", "text": "3C分析"}, {"label": "エ", "text": "SWOT分析"}], "correct": "ア", "hint": "PPMは、事業を市場成長率と市場占有率の2軸でマトリクスに分類し、資源配分の判断材料とする分析手法である。"}, {"id": 56, "cat": "経営・戦略・法務", "topic": "損益分岐点売上高の計算", "q": "固定費が450万円、変動費率が40%である場合、損益分岐点売上高はいくらか。", "choices": [{"label": "ア", "text": "750万円"}, {"label": "イ", "text": "800万円"}, {"label": "ウ", "text": "650万円"}, {"label": "エ", "text": "700万円"}], "correct": "ア", "hint": "損益分岐点売上高=固定費÷(1-変動費率)=450÷(1-0.4)=450÷0.6=750万円になる。"}, {"id": 57, "cat": "経営・戦略・法務", "topic": "ROI(投資利益率)の計算", "q": "700万円を投資し、その結果として年間140万円の利益を得た場合のROI(投資利益率)はどれか。", "choices": [{"label": "ア", "text": "10%"}, {"label": "イ", "text": "15%"}, {"label": "ウ", "text": "20%"}, {"label": "エ", "text": "25%"}], "correct": "ウ", "hint": "ROI=利益÷投資額×100=140÷700×100=20%になる。"}, {"id": 58, "cat": "経営・戦略・法務", "topic": "特許権のライセンス許諾契約", "q": "S社が保有する特許技術について、対価(ロイヤリティ)を受け取る代わりに、他社に対してその技術の実施を許諾する契約はどれか。", "choices": [{"label": "ア", "text": "ライセンス契約(実施許諾契約)"}, {"label": "イ", "text": "業務委託契約"}, {"label": "ウ", "text": "秘密保持契約(NDA)"}, {"label": "エ", "text": "労働者派遣契約"}], "correct": "ア", "hint": "ライセンス契約(実施許諾契約)は、特許権者が対価を受け取る代わりに、他者にその特許発明の実施を許諾する契約である。"}, {"id": 59, "cat": "経営・戦略・法務", "topic": "不正アクセス禁止法の対象行為", "q": "他人のID・パスワードを無断で使用し、アクセス制御機能によって利用が制限されているサーバに不正にログインする行為を規制する法律はどれか。", "choices": [{"label": "ア", "text": "著作権法"}, {"label": "イ", "text": "個人情報保護法"}, {"label": "ウ", "text": "不正アクセス禁止法"}, {"label": "エ", "text": "不正競争防止法(のみ)"}], "correct": "ウ", "hint": "不正アクセス禁止法は、他人のID・パスワードを無断利用してアクセス制御機能を回避しシステムに不正にログインする行為などを規制する法律である。"}, {"id": 60, "cat": "経営・戦略・法務", "topic": "独占禁止法における優越的地位の濫用", "q": "取引上優位な立場にある事業者が、その地位を利用して取引先に対し不当に不利益な条件を押し付ける行為を規制する法律はどれか。", "choices": [{"label": "ア", "text": "下請法(のみ)"}, {"label": "イ", "text": "労働基準法"}, {"label": "ウ", "text": "特定商取引法"}, {"label": "エ", "text": "独占禁止法(優越的地位の濫用の規制)"}], "correct": "エ", "hint": "独占禁止法は、取引上優位な地位にある事業者が、その地位を利用して取引先に不当な不利益を強いる「優越的地位の濫用」などの不公正な取引方法を規制する法律である。"}];

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
          <div style={s.sub}>基本情報技術者 — 60問内蔵 [rev: {REV_TAG}]</div>
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
