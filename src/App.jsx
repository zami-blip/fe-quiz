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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "2進数から10進数への変換", "q": "2進数11010を10進数で表したものはどれか。", "choices": [{"label": "ア", "text": "30"}, {"label": "イ", "text": "28"}, {"label": "ウ", "text": "26"}, {"label": "エ", "text": "24"}], "correct": "ウ", "hint": "11010は16+8+0+2+0=26である。"}, {"id": 2, "cat": "基礎理論", "topic": "ド・モルガンの法則", "q": "論理式 NOT(A AND B) と等しい式はどれか。", "choices": [{"label": "ア", "text": "A OR B"}, {"label": "イ", "text": "(NOT A) OR (NOT B)"}, {"label": "ウ", "text": "A AND B"}, {"label": "エ", "text": "(NOT A) AND (NOT B)"}], "correct": "イ", "hint": "ド・モルガンの法則により、AND否定はOR否定の組み合わせになる。"}, {"id": 3, "cat": "基礎理論", "topic": "逆ポーランド表記法の計算", "q": "逆ポーランド表記法で書かれた式 3 4 + 2 * を計算した結果はどれか。", "choices": [{"label": "ア", "text": "14"}, {"label": "イ", "text": "10"}, {"label": "ウ", "text": "11"}, {"label": "エ", "text": "20"}], "correct": "ア", "hint": "スタックを使って計算すると、(3+4)×2=14になる。"}, {"id": 4, "cat": "基礎理論", "topic": "教師あり学習と教師なし学習の違い", "q": "機械学習における教師あり学習の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "規則をあらかじめ人手で記述する"}, {"label": "イ", "text": "報酬を最大化するように試行錯誤で学習する"}, {"label": "ウ", "text": "正解ラベルのないデータの構造を発見する"}, {"label": "エ", "text": "正解ラベルが付いたデータを用いて学習する"}], "correct": "エ", "hint": "教師あり学習は入力と正解ラベルの組を用いて予測モデルを学習する手法である。"}, {"id": 5, "cat": "基礎理論", "topic": "時間計算量のオーダー表記", "q": "要素数nの配列に対して、全ての要素を1回ずつ調べる線形探索の計算量をオーダー記法で表したものはどれか。", "choices": [{"label": "ア", "text": "O(log n)"}, {"label": "イ", "text": "O(n^2)"}, {"label": "ウ", "text": "O(1)"}, {"label": "エ", "text": "O(n)"}], "correct": "エ", "hint": "全要素を1回ずつ調べるため、処理時間はnに比例する。"}, {"id": 6, "cat": "コンピュータシステム", "topic": "クロック周波数とCPIからMIPS値を求める計算", "q": "クロック周波数600MHz、CPI(1命令当たりの平均クロック数)が4のプロセッサがある。このプロセッサの性能は約何MIPSか。", "choices": [{"label": "ア", "text": "240"}, {"label": "イ", "text": "150"}, {"label": "ウ", "text": "100"}, {"label": "エ", "text": "200"}], "correct": "イ", "hint": "MIPS=クロック周波数÷CPI÷10^6=600÷4=150MIPSになる。"}, {"id": 7, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュメモリのヒット率が90%、キャッシュのアクセス時間が10ナノ秒、主記憶のアクセス時間が100ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "100"}, {"label": "ウ", "text": "55"}, {"label": "エ", "text": "19"}], "correct": "エ", "hint": "実効アクセス時間=0.9×10+0.1×100=9+10=19ナノ秒になる。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "RAID5の特徴", "q": "RAID5の特徴として適切なものはどれか。", "choices": [{"label": "ア", "text": "ミラーリングだけで冗長化する"}, {"label": "イ", "text": "ストライピングのみで冗長性はない"}, {"label": "ウ", "text": "パリティを分散して記録し1台の故障まで復旧できる"}, {"label": "エ", "text": "2台のディスクを完全に複製する"}], "correct": "ウ", "hint": "RAID5はデータとパリティを複数のディスクに分散して記録し、1台までの故障に対応できる。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "内部割込みと外部割込み", "q": "プログラムのゼロ除算エラーの発生によって生じる割込みの種類はどれか。", "choices": [{"label": "ア", "text": "タイマ割込み"}, {"label": "イ", "text": "外部割込み"}, {"label": "ウ", "text": "内部割込み"}, {"label": "エ", "text": "入出力割込み"}], "correct": "ウ", "hint": "プログラム自身の実行中のエラーによって生じる割込みは内部割込みに分類される。"}, {"id": 10, "cat": "コンピュータシステム", "topic": "仮想記憶のページ置換えアルゴリズム(LRU)", "q": "仮想記憶におけるページ置換えアルゴリズムのうち、最も長い間参照されていないページを置換え対象とする方式はどれか。", "choices": [{"label": "ア", "text": "FIFO"}, {"label": "イ", "text": "LRU"}, {"label": "ウ", "text": "ランダム置換え"}, {"label": "エ", "text": "LFU"}], "correct": "イ", "hint": "LRU(Least Recently Used)は最も長く参照されていないページを置き換える方式である。"}, {"id": 11, "cat": "ネットワーク", "topic": "サブネットマスクによるネットワークアドレスの計算", "q": "IPアドレス192.168.10.130にサブネットマスク255.255.255.192を適用したとき、このホストが属するネットワークアドレスはどれか。", "choices": [{"label": "ア", "text": "192.168.10.128"}, {"label": "イ", "text": "192.168.10.0"}, {"label": "ウ", "text": "192.168.10.192"}, {"label": "エ", "text": "192.168.10.64"}], "correct": "ア", "hint": "255.255.255.192は/26であり、192.168.10.130は128～191の範囲に含まれるため、ネットワークアドレスは192.168.10.128になる。"}, {"id": 12, "cat": "ネットワーク", "topic": "OSI基本参照モデルとルータの対応層", "q": "OSI基本参照モデルにおいて、IPアドレスを基にパケットの経路選択を行うルータが主に動作する層はどれか。", "choices": [{"label": "ア", "text": "物理層"}, {"label": "イ", "text": "データリンク層"}, {"label": "ウ", "text": "ネットワーク層"}, {"label": "エ", "text": "トランスポート層"}], "correct": "ウ", "hint": "ルータはネットワーク層のIPアドレスを基に経路選択(ルーティング)を行う。"}, {"id": 13, "cat": "ネットワーク", "topic": "ARPの役割", "q": "同一LAN内で、IPアドレスから対応するMACアドレスを取得するために使われるプロトコルはどれか。", "choices": [{"label": "ア", "text": "DNS"}, {"label": "イ", "text": "ICMP"}, {"label": "ウ", "text": "DHCP"}, {"label": "エ", "text": "ARP"}], "correct": "エ", "hint": "ARPはIPアドレスからMACアドレスを解決するためのデータリンク層のプロトコルである。"}, {"id": 14, "cat": "ネットワーク", "topic": "CSMA/CDの仕組み", "q": "イーサネットのメディアアクセス制御方式であるCSMA/CDの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "中央の制御局が送信順序を管理する"}, {"label": "イ", "text": "送信前に必ず衝突回避のための待機時間を設ける"}, {"label": "ウ", "text": "送信前にキャリアの有無を確認し、衝突を検出したら再送する"}, {"label": "エ", "text": "一定時間ごとに送信権を巡回させる"}], "correct": "ウ", "hint": "CSMA/CDは搬送波感知多重アクセス／衝突検出方式であり、送信中の衝突を検出して再送を行う。"}, {"id": 15, "cat": "ネットワーク", "topic": "プライベートIPアドレスの範囲", "q": "次のうち、プライベートIPアドレスとして利用される代表的なアドレス範囲はどれか。", "choices": [{"label": "ア", "text": "8.8.8.0/24"}, {"label": "イ", "text": "172.16.0.0/12"}, {"label": "ウ", "text": "198.51.100.0/24"}, {"label": "エ", "text": "203.0.113.0/24"}], "correct": "イ", "hint": "172.16.0.0～172.31.255.255はプライベートIPアドレスとして予約された範囲の一つである。"}, {"id": 16, "cat": "情報セキュリティ", "topic": "多要素認証", "q": "パスワードとスマートフォンアプリのワンタイムパスワードを組み合わせてログインさせる認証方式を何と呼ぶか。", "choices": [{"label": "ア", "text": "多要素認証"}, {"label": "イ", "text": "チャレンジレスポンス認証"}, {"label": "ウ", "text": "リスクベース認証"}, {"label": "エ", "text": "シングルサインオン"}], "correct": "ア", "hint": "記憶(パスワード)と所有(スマートフォン)など異なる要素を組み合わせる認証を多要素認証と呼ぶ。"}, {"id": 17, "cat": "情報セキュリティ", "topic": "デジタル署名の目的", "q": "電子文書に付与するデジタル署名によって主に確認できることはどれか。", "choices": [{"label": "ア", "text": "文書が改ざんされていないことと送信者の真正性"}, {"label": "イ", "text": "データの圧縮率"}, {"label": "ウ", "text": "通信の伝送速度"}, {"label": "エ", "text": "文書の保存期間"}], "correct": "ア", "hint": "デジタル署名は、送信者の秘密鍵で署名することで、改ざんの検知と送信者の本人性確認を可能にする。"}, {"id": 18, "cat": "情報セキュリティ", "topic": "ゼロデイ攻撃", "q": "OSやソフトウェアの脆弱性が公表され、修正プログラムが提供される前に、その脆弱性を突いて行われる攻撃はどれか。", "choices": [{"label": "ア", "text": "辞書攻撃"}, {"label": "イ", "text": "ゼロデイ攻撃"}, {"label": "ウ", "text": "DDoS攻撃"}, {"label": "エ", "text": "フィッシング"}], "correct": "イ", "hint": "脆弱性の修正プログラムが提供される前(0日目)に行われる攻撃をゼロデイ攻撃と呼ぶ。"}, {"id": 19, "cat": "情報セキュリティ", "topic": "ランサムウェア対策の3-2-1ルール", "q": "ランサムウェア対策として推奨される3-2-1ルールの説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "3人の承認者が2つの経路で1つのシステムを操作する"}, {"label": "イ", "text": "データを3世代・2媒体・1オフサイトの計3コピー以上保持する"}, {"label": "ウ", "text": "3か月ごとに2回、1つのバックアップを検証する"}, {"label": "エ", "text": "3種類のパスワードを2要素・1回で入力する"}], "correct": "イ", "hint": "3-2-1ルールは、データを3つ以上のコピーとして、2種類の異なる媒体に、うち1つはオフサイト(遠隔地)に保管する考え方である。"}, {"id": 20, "cat": "情報セキュリティ", "topic": "PKIにおける認証局の役割", "q": "公開鍵基盤(PKI)において、公開鍵の所有者を証明するデジタル証明書を発行する機関はどれか。", "choices": [{"label": "ア", "text": "IDS"}, {"label": "イ", "text": "認証局(CA)"}, {"label": "ウ", "text": "SOC"}, {"label": "エ", "text": "ISP"}], "correct": "イ", "hint": "認証局(CA:Certification Authority)は公開鍵と所有者を結び付けるデジタル証明書を発行する。"}, {"id": 21, "cat": "情報セキュリティ", "topic": "情報セキュリティリスクアセスメントの手順", "q": "情報セキュリティリスクアセスメントにおける一般的な手順の順序として適切なものはどれか。", "choices": [{"label": "ア", "text": "リスク特定→リスク分析→リスク評価"}, {"label": "イ", "text": "リスク対応→リスク特定→リスク分析"}, {"label": "ウ", "text": "リスク分析→リスク対応→リスク評価"}, {"label": "エ", "text": "リスク評価→リスク対応→リスク特定"}], "correct": "ア", "hint": "リスクアセスメントは、リスクを特定し、分析し、評価するという順序で行われる。"}, {"id": 22, "cat": "データベース", "topic": "第2正規形への正規化(部分関数従属の排除)", "q": "主キーが「注文番号+商品コード」の複合キーである表で、「商品コード→商品名」という部分関数従属が存在する。第2正規形にするための操作として適切なものはどれか。", "choices": [{"label": "ア", "text": "注文番号を主キーから外す"}, {"label": "イ", "text": "商品コードと商品名を別表に分離する"}, {"label": "ウ", "text": "商品名を主キーに追加する"}, {"label": "エ", "text": "商品名の列を削除する"}], "correct": "イ", "hint": "複合キーの一部だけで決まる部分関数従属する列は、別表に分離することで第2正規形になる。"}, {"id": 23, "cat": "データベース", "topic": "トランザクションのACID特性", "q": "データベースのトランザクションが満たすべきACID特性のうち、処理の途中結果が他のトランザクションから見えないことを保証する特性はどれか。", "choices": [{"label": "ア", "text": "一貫性(Consistency)"}, {"label": "イ", "text": "原子性(Atomicity)"}, {"label": "ウ", "text": "耐久性(Durability)"}, {"label": "エ", "text": "独立性(Isolation)"}], "correct": "エ", "hint": "独立性(Isolation)は、複数のトランザクションが同時実行されても互いの途中経過が見えないことを保証する。"}, {"id": 24, "cat": "データベース", "topic": "インデックスの効果とトレードオフ", "q": "表にインデックスを追加することの効果として適切なものはどれか。", "choices": [{"label": "ア", "text": "データの重複が自動的に排除される"}, {"label": "イ", "text": "検索・更新のいずれも常に高速化する"}, {"label": "ウ", "text": "主キー制約が不要になる"}, {"label": "エ", "text": "検索処理は高速化するが、更新処理のコストが増える場合がある"}], "correct": "エ", "hint": "インデックスは検索を高速化する一方、更新のたびにインデックス自体も更新するためコストが増える。"}, {"id": 25, "cat": "データベース", "topic": "デッドロックの発生条件", "q": "複数のトランザクションが互いに相手のロック解除を待ち続け、処理が進まなくなる状態を何と呼ぶか。", "choices": [{"label": "ア", "text": "フラグメンテーション"}, {"label": "イ", "text": "オーバーフロー"}, {"label": "ウ", "text": "デッドロック"}, {"label": "エ", "text": "スラッシング"}], "correct": "ウ", "hint": "複数のトランザクションが互いのロック解除を待ち続けて処理が停止する状態をデッドロックと呼ぶ。"}, {"id": 26, "cat": "データベース", "topic": "SQL集合演算(UNIONとINTERSECT)", "q": "二つのSELECT文の結果から、両方に共通して含まれる行だけを取得するSQLの集合演算子はどれか。", "choices": [{"label": "ア", "text": "UNION"}, {"label": "イ", "text": "EXCEPT"}, {"label": "ウ", "text": "INTERSECT"}, {"label": "エ", "text": "JOIN"}], "correct": "ウ", "hint": "INTERSECTは二つの問合せ結果の積集合(共通する行)を求める演算子である。"}, {"id": 27, "cat": "アルゴリズム・プログラミング", "topic": "クイックソートの平均計算量", "q": "クイックソートの平均的な時間計算量をオーダー記法で表したものはどれか。", "choices": [{"label": "ア", "text": "O(n)"}, {"label": "イ", "text": "O(2^n)"}, {"label": "ウ", "text": "O(n^2)"}, {"label": "エ", "text": "O(n log n)"}], "correct": "エ", "hint": "クイックソートは平均的にはO(n log n)の計算量で動作する。"}, {"id": 28, "cat": "アルゴリズム・プログラミング", "topic": "スタックとキューの用途の違い", "q": "Webブラウザの「戻る」機能の実装に適しているデータ構造はどれか。", "choices": [{"label": "ア", "text": "ハッシュ表"}, {"label": "イ", "text": "スタック(LIFO)"}, {"label": "ウ", "text": "二分探索木"}, {"label": "エ", "text": "キュー(FIFO)"}], "correct": "イ", "hint": "最後に訪れたページから戻るという後入れ先出しの動作は、スタック(LIFO)に適している。"}, {"id": 29, "cat": "アルゴリズム・プログラミング", "topic": "深さ優先探索と幅優先探索の違い", "q": "グラフの探索アルゴリズムのうち、スタック(または再帰)を用いて一つの経路を行き止まりまで進んでからバックトラックする方式はどれか。", "choices": [{"label": "ア", "text": "二分探索"}, {"label": "イ", "text": "ダイクストラ法"}, {"label": "ウ", "text": "幅優先探索"}, {"label": "エ", "text": "深さ優先探索"}], "correct": "エ", "hint": "深さ優先探索(DFS)はスタックや再帰を用いて、一つの経路を可能な限り深く進む探索方式である。"}, {"id": 30, "cat": "アルゴリズム・プログラミング", "topic": "ハッシュ表探索の衝突処理", "q": "ハッシュ表探索において、異なるキーが同じハッシュ値になる現象を何と呼ぶか。", "choices": [{"label": "ア", "text": "衝突(コリジョン)"}, {"label": "イ", "text": "フラグメンテーション"}, {"label": "ウ", "text": "オーバーフロー"}, {"label": "エ", "text": "デッドロック"}], "correct": "ア", "hint": "異なるキーが同じハッシュ値になる現象を衝突(コリジョン)と呼び、対処法として連鎖法などがある。"}, {"id": 31, "cat": "アルゴリズム・プログラミング", "topic": "分割統治法の考え方", "q": "問題を複数の小さな部分問題に分割し、それぞれを解いてから結果を統合するアルゴリズム設計技法はどれか。", "choices": [{"label": "ア", "text": "分割統治法"}, {"label": "イ", "text": "貪欲法"}, {"label": "ウ", "text": "線形計画法"}, {"label": "エ", "text": "動的計画法"}], "correct": "ア", "hint": "分割統治法は問題を部分問題に分割して個別に解き、結果を統合して元の問題を解く設計技法である。"}, {"id": 32, "cat": "ソフトウェア・HI", "topic": "ラジオボタンとチェックボックスの違い", "q": "GUIの部品のうち、複数の選択肢から一つだけを選択させたい場合に用いるものはどれか。", "choices": [{"label": "ア", "text": "プルダウンメニュー(複数選択可)"}, {"label": "イ", "text": "チェックボックス"}, {"label": "ウ", "text": "ラジオボタン"}, {"label": "エ", "text": "テキストボックス"}], "correct": "ウ", "hint": "ラジオボタンは複数の選択肢から一つだけを選ばせる場合に用いるGUI部品である。"}, {"id": 33, "cat": "ソフトウェア・HI", "topic": "ユニバーサルデザインの考え方", "q": "年齢や障害の有無、能力の違いなどにかかわらず、できる限り多くの人が快適に利用できることを目指す設計の考え方はどれか。", "choices": [{"label": "ア", "text": "レスポンシブデザイン"}, {"label": "イ", "text": "マテリアルデザイン"}, {"label": "ウ", "text": "フラットデザイン"}, {"label": "エ", "text": "ユニバーサルデザイン"}], "correct": "エ", "hint": "ユニバーサルデザインは、できるだけ多様な利用者が快適に使えることを目指す設計の考え方である。"}, {"id": 34, "cat": "ソフトウェア・HI", "topic": "レスポンシブWebデザイン", "q": "画面サイズに応じてレイアウトを自動的に最適化し、PCとスマートフォンの両方で見やすい表示を実現する手法はどれか。", "choices": [{"label": "ア", "text": "アコーディオンUI"}, {"label": "イ", "text": "レスポンシブWebデザイン"}, {"label": "ウ", "text": "クロスブラウザ"}, {"label": "エ", "text": "プログレッシブエンハンスメント"}], "correct": "イ", "hint": "レスポンシブWebデザインは、画面サイズに応じてレイアウトを自動調整する手法である。"}, {"id": 35, "cat": "ソフトウェア・HI", "topic": "ヒューリスティック評価", "q": "専門家が経験則(ガイドライン)に基づいてユーザーインタフェースの問題点を発見する評価手法はどれか。", "choices": [{"label": "ア", "text": "ホワイトボックステスト"}, {"label": "イ", "text": "A/Bテスト"}, {"label": "ウ", "text": "ユーザビリティテスト"}, {"label": "エ", "text": "ヒューリスティック評価"}], "correct": "エ", "hint": "ヒューリスティック評価は、専門家が経験則に基づいてUIの問題点を洗い出す評価手法である。"}, {"id": 36, "cat": "システム開発", "topic": "ホワイトボックステストの命令網羅", "q": "ホワイトボックステストにおいて、プログラム中の全ての命令文を少なくとも1回は実行するテストケースを設計する網羅基準はどれか。", "choices": [{"label": "ア", "text": "判定条件網羅"}, {"label": "イ", "text": "命令網羅"}, {"label": "ウ", "text": "複数条件網羅"}, {"label": "エ", "text": "同値分割"}], "correct": "イ", "hint": "命令網羅は、プログラム中の全ての命令を少なくとも1回実行することを基準にテストケースを設計する。"}, {"id": 37, "cat": "システム開発", "topic": "オブジェクト指向のカプセル化", "q": "オブジェクト指向プログラミングにおいて、データとそれを操作する手続きを一つにまとめ、内部の詳細を外部から隠蔽する考え方はどれか。", "choices": [{"label": "ア", "text": "多相性"}, {"label": "イ", "text": "継承"}, {"label": "ウ", "text": "カプセル化"}, {"label": "エ", "text": "汎化"}], "correct": "ウ", "hint": "カプセル化は、データと操作をまとめ、内部の実装詳細を外部から隠す考え方である。"}, {"id": 38, "cat": "システム開発", "topic": "モジュールの結合度", "q": "モジュール間の独立性を高める設計として望ましいのはどれか。", "choices": [{"label": "ア", "text": "モジュール間の結合度をできるだけ低くする"}, {"label": "イ", "text": "モジュール間の結合度をできるだけ高くする"}, {"label": "ウ", "text": "モジュール分割を行わない"}, {"label": "エ", "text": "全てのモジュールを一つに統合する"}], "correct": "ア", "hint": "モジュール間の結合度を低くすることで、モジュールの独立性が高まり保守性が向上する。"}, {"id": 39, "cat": "システム開発", "topic": "リファクタリングの目的", "q": "外部から見た動作を変えずに、プログラムの内部構造を整理して保守性を高める作業を何と呼ぶか。", "choices": [{"label": "ア", "text": "デバッグ"}, {"label": "イ", "text": "マイグレーション"}, {"label": "ウ", "text": "リファクタリング"}, {"label": "エ", "text": "ローンチ"}], "correct": "ウ", "hint": "リファクタリングは、外部仕様を変えずに内部構造を改善する作業である。"}, {"id": 40, "cat": "システム開発", "topic": "DevOpsの特徴(CI/CD)", "q": "開発チームと運用チームが連携し、ビルドやテストを自動化して迅速にリリースを行う考え方はどれか。", "choices": [{"label": "ア", "text": "DevOps"}, {"label": "イ", "text": "ウォーターフォールモデル"}, {"label": "ウ", "text": "構造化設計"}, {"label": "エ", "text": "ペアプログラミング"}], "correct": "ア", "hint": "DevOpsは開発と運用が連携し、CI/CDなどを通じて迅速で柔軟な開発・運用を目指す考え方である。"}, {"id": 41, "cat": "プロジェクトマネジメント", "topic": "ファンクションポイント法", "q": "入出力画面や帳票、ファイル数などのソフトウェアの機能規模を基に開発規模を見積もる手法はどれか。", "choices": [{"label": "ア", "text": "三点見積り"}, {"label": "イ", "text": "類推見積り"}, {"label": "ウ", "text": "ファンクションポイント法"}, {"label": "エ", "text": "ボトムアップ見積り"}], "correct": "ウ", "hint": "ファンクションポイント法は、外部入出力やファイル数などの機能量を基に規模を見積もる手法である。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "リスクの定性的分析と定量的分析", "q": "プロジェクトリスクを「発生確率」と「影響度」の高低で分類し、優先度をおおまかに把握する分析方法はどれか。", "choices": [{"label": "ア", "text": "リスクの定性的分析"}, {"label": "イ", "text": "リスクの定量的分析"}, {"label": "ウ", "text": "モンテカルロ分析"}, {"label": "エ", "text": "感度分析"}], "correct": "ア", "hint": "定性的分析は、発生確率と影響度を高中低などで評価し、対応の優先度をおおまかに把握する手法である。"}, {"id": 43, "cat": "プロジェクトマネジメント", "topic": "クリティカルパス法(CPM)", "q": "プロジェクトの各作業の依存関係から、プロジェクト全体の最短所要期間を左右する経路を求める技法はどれか。", "choices": [{"label": "ア", "text": "ガントチャート"}, {"label": "イ", "text": "クリティカルパス法(CPM)"}, {"label": "ウ", "text": "EVM"}, {"label": "エ", "text": "WBS"}], "correct": "イ", "hint": "クリティカルパス法は、作業の依存関係のネットワーク図から、最も長い経路(最短所要期間を決める経路)を求める技法である。"}, {"id": 44, "cat": "サービスマネジメント・監査", "topic": "SLAの目的", "q": "サービス提供者と顧客の間で、サービスの品質目標を明文化して合意する文書はどれか。", "choices": [{"label": "ア", "text": "RFI"}, {"label": "イ", "text": "RFP"}, {"label": "ウ", "text": "SLA"}, {"label": "エ", "text": "NDA"}], "correct": "ウ", "hint": "SLA(Service Level Agreement)は、サービスレベルの目標を提供者と顧客の間で合意した文書である。"}, {"id": 45, "cat": "サービスマネジメント・監査", "topic": "インシデント管理と問題管理の違い", "q": "サービスマネジメントにおいて、発生した障害を迅速に復旧させることを目的とするプロセスはどれか。", "choices": [{"label": "ア", "text": "変更管理"}, {"label": "イ", "text": "問題管理"}, {"label": "ウ", "text": "構成管理"}, {"label": "エ", "text": "インシデント管理"}], "correct": "エ", "hint": "インシデント管理はサービス中断からの迅速な復旧を目的とし、根本原因の分析は問題管理が担う。"}, {"id": 46, "cat": "サービスマネジメント・監査", "topic": "システム監査人の独立性", "q": "システム監査を実施する際に、監査人に最も求められる基本姿勢はどれか。", "choices": [{"label": "ア", "text": "監査対象システムの開発を担当すること"}, {"label": "イ", "text": "被監査部門の業務を代行すること"}, {"label": "ウ", "text": "監査結果を非公開にすること"}, {"label": "エ", "text": "独立性と客観性を保つこと"}], "correct": "エ", "hint": "システム監査人は、被監査部門から独立した客観的な立場で検証・評価を行う必要がある。"}, {"id": 47, "cat": "経営・戦略・法務", "topic": "SWOT分析", "q": "自社の強み・弱みという内部要因と、機会・脅威という外部要因を整理して分析する手法はどれか。", "choices": [{"label": "ア", "text": "3C分析"}, {"label": "イ", "text": "PPM"}, {"label": "ウ", "text": "バリューチェーン分析"}, {"label": "エ", "text": "SWOT分析"}], "correct": "エ", "hint": "SWOT分析は、強み(S)・弱み(W)・機会(O)・脅威(T)の4要素を整理して戦略を検討する手法である。"}, {"id": 48, "cat": "経営・戦略・法務", "topic": "著作権の職務著作", "q": "従業員が職務上作成したプログラムの著作権は、原則として誰に帰属するか。", "choices": [{"label": "ア", "text": "著作権は発生しない"}, {"label": "イ", "text": "作成した従業員個人"}, {"label": "ウ", "text": "法人(会社)"}, {"label": "エ", "text": "国"}], "correct": "ウ", "hint": "職務著作の要件を満たす場合、著作権は原則として作成させた法人(会社)に帰属する。"}, {"id": 49, "cat": "経営・戦略・法務", "topic": "個人情報保護法における第三者提供", "q": "個人情報取扱事業者が、取得した個人データを第三者に提供する場合に、原則として必要となるものはどれか。", "choices": [{"label": "ア", "text": "本人の同意"}, {"label": "イ", "text": "第三者からの依頼書のみ"}, {"label": "ウ", "text": "監督官庁への届出のみ"}, {"label": "エ", "text": "特に手続は不要"}], "correct": "ア", "hint": "個人情報保護法では、第三者提供には原則として本人の同意を得ることが必要とされている。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "コアコンピタンス", "q": "他社に真似のできない、企業の中核となる独自の強み・能力を指す用語はどれか。", "choices": [{"label": "ア", "text": "コアコンピタンス"}, {"label": "イ", "text": "アウトソーシング"}, {"label": "ウ", "text": "シナジー効果"}, {"label": "エ", "text": "ベンチマーキング"}], "correct": "ア", "hint": "コアコンピタンスは、競合他社にはまねのできない企業の中核的な強みを指す用語である。"}];

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
          <div style={s.sub}>基本情報技術者 — 50問内蔵(シラバスVer.9.2準拠)</div>
          <a href="/b" style={{display:"inline-block",marginTop:8,fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>科目Bの問題を解く →</a>
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
                🔄 問題をリセット（全50問に戻す）
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
