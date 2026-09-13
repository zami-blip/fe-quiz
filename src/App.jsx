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

const ALL_QUESTIONS = [{"id": 1, "cat": "基礎理論", "topic": "16進数から10進数への変換", "q": "16進数1A3を10進数で表したものはどれか。", "choices": [{"label": "ア", "text": "427"}, {"label": "イ", "text": "403"}, {"label": "ウ", "text": "419"}, {"label": "エ", "text": "435"}], "correct": "ウ", "hint": "1A3=1×16^2+10×16+3=256+160+3=419になる。"}, {"id": 2, "cat": "基礎理論", "topic": "排他的論理和の真理値表", "q": "論理式 A XOR B (排他的論理和)の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "AとBの少なくとも一方が真のとき真になる"}, {"label": "イ", "text": "AとBがともに真のときだけ真になる"}, {"label": "ウ", "text": "AとBが等しいときだけ真になる"}, {"label": "エ", "text": "AとBが異なるときだけ真になる"}], "correct": "エ", "hint": "排他的論理和は、AとBの値が異なるときに真(1)、同じときに偽(0)になる。"}, {"id": 3, "cat": "基礎理論", "topic": "期待値の計算", "q": "1個のさいころを1回投げるとき、出る目の期待値はどれか。", "choices": [{"label": "ア", "text": "4.0"}, {"label": "イ", "text": "4.5"}, {"label": "ウ", "text": "3.5"}, {"label": "エ", "text": "3.0"}], "correct": "ウ", "hint": "期待値=(1+2+3+4+5+6)÷6=21÷6=3.5になる。"}, {"id": 4, "cat": "基礎理論", "topic": "待ち行列理論(M/M/1モデル)", "q": "M/M/1モデルの待ち行列理論において、利用率(ρ)が1に近づくにつれて平均待ち時間はどのように変化するか。", "choices": [{"label": "ア", "text": "一定を保つ"}, {"label": "イ", "text": "0に収束する"}, {"label": "ウ", "text": "徐々に減少する"}, {"label": "エ", "text": "急激に増大する"}], "correct": "エ", "hint": "M/M/1モデルでは、利用率が1に近づくほど平均待ち時間は急激に増大することが知られている。"}, {"id": 5, "cat": "基礎理論", "topic": "アルゴリズムの計算量比較", "q": "データ件数nが大きくなるにつれて、O(n)のアルゴリズムとO(n^2)のアルゴリズムの処理時間の差はどのようになるか。", "choices": [{"label": "ア", "text": "nが小さいときだけ差が生じる"}, {"label": "イ", "text": "nが大きくなるほど差は急激に広がる"}, {"label": "ウ", "text": "nが大きくなるほど差は縮まる"}, {"label": "エ", "text": "nによらず常に一定の差である"}], "correct": "イ", "hint": "nが大きくなるほどO(n^2)の増加が急激になり、O(n)との差は広がっていく。"}, {"id": 6, "cat": "コンピュータシステム", "topic": "パイプライン処理のクロック数計算", "q": "パイプラインなしでは1命令の実行に5クロックかかる処理を、5段のパイプラインで10命令連続して実行する場合、理想的には合計何クロックかかるか。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "14"}, {"label": "ウ", "text": "30"}, {"label": "エ", "text": "50"}], "correct": "イ", "hint": "パイプラインでは、最初の1命令に5クロック、以降は1クロックずつ増えるため、5+(10-1)×1=14クロックになる。"}, {"id": 7, "cat": "コンピュータシステム", "topic": "RAID5の実効容量計算", "q": "1台300GBのディスク4台でRAID5を構成した場合の実効容量は何GBか。", "choices": [{"label": "ア", "text": "900"}, {"label": "イ", "text": "600"}, {"label": "ウ", "text": "1200"}, {"label": "エ", "text": "300"}], "correct": "ア", "hint": "RAID5はn台のうち1台分をパリティに使うため、実効容量は(4-1)×300=900GBになる。"}, {"id": 8, "cat": "コンピュータシステム", "topic": "キャッシュメモリの実効アクセス時間の計算", "q": "キャッシュのヒット率が95%、キャッシュのアクセス時間が5ナノ秒、主記憶のアクセス時間が60ナノ秒のとき、実効アクセス時間は何ナノ秒か。", "choices": [{"label": "ア", "text": "6.75"}, {"label": "イ", "text": "8.75"}, {"label": "ウ", "text": "5.75"}, {"label": "エ", "text": "7.75"}], "correct": "エ", "hint": "実効アクセス時間=0.95×5+0.05×60=4.75+3=7.75ナノ秒になる。"}, {"id": 9, "cat": "コンピュータシステム", "topic": "直列・並列システムの稼働率計算", "q": "稼働率0.9の装置を2台直列に接続したシステムと、2台並列に接続したシステムの稼働率について正しいものはどれか。", "choices": [{"label": "ア", "text": "直列は0.99、並列は0.81"}, {"label": "イ", "text": "直列は0.9、並列は1.0"}, {"label": "ウ", "text": "直列は0.81、並列は0.99"}, {"label": "エ", "text": "直列も並列も0.9"}], "correct": "ウ", "hint": "直列の稼働率は0.9×0.9=0.81、並列の稼働率は1-(1-0.9)×(1-0.9)=0.99になる。"}, {"id": 10, "cat": "コンピュータシステム", "topic": "アドレスバスのビット数と最大アドレス空間", "q": "アドレスバスが20ビットのコンピュータが直接アドレス指定できる最大の記憶空間はどれか。", "choices": [{"label": "ア", "text": "1,024バイト"}, {"label": "イ", "text": "1,048,576バイト"}, {"label": "ウ", "text": "65,536バイト"}, {"label": "エ", "text": "4,294,967,296バイト"}], "correct": "イ", "hint": "20ビットで表現できるアドレス数は2^20=1,048,576通りになる。"}, {"id": 11, "cat": "ネットワーク", "topic": "回線速度からの転送時間の計算", "q": "500Mバイトのデータを100Mビット/秒の回線で転送するのに理論上かかる時間は何秒か。1M=10^6とする。", "choices": [{"label": "ア", "text": "40"}, {"label": "イ", "text": "80"}, {"label": "ウ", "text": "20"}, {"label": "エ", "text": "4"}], "correct": "ア", "hint": "500Mバイト=4,000Mビットであり、100Mビット/秒の回線では4,000÷100=40秒かかる。"}, {"id": 12, "cat": "ネットワーク", "topic": "サブネットにおける使用可能ホスト数の計算", "q": "サブネットマスクが/28であるネットワークにおいて、割り当て可能なホストアドレスの最大数はどれか。", "choices": [{"label": "ア", "text": "6"}, {"label": "イ", "text": "14"}, {"label": "ウ", "text": "62"}, {"label": "エ", "text": "30"}], "correct": "イ", "hint": "/28はホスト部が4ビットであり、ネットワークアドレスとブロードキャストアドレスを除くと2^4-2=14個になる。"}, {"id": 13, "cat": "ネットワーク", "topic": "CIDR表記のホスト数", "q": "192.168.1.0/24のネットワークにおいて、割り当て可能なホストの最大数はどれか。", "choices": [{"label": "ア", "text": "256"}, {"label": "イ", "text": "126"}, {"label": "ウ", "text": "254"}, {"label": "エ", "text": "510"}], "correct": "ウ", "hint": "/24はホスト部が8ビットであり、2^8-2=254個のホストアドレスが割り当て可能である。"}, {"id": 14, "cat": "ネットワーク", "topic": "TCPとUDPの違い", "q": "TCPとUDPの違いに関する説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "TCPはコネクションレス型、UDPはコネクション型である"}, {"label": "イ", "text": "TCPとUDPはどちらも暗号化通信を保証する"}, {"label": "ウ", "text": "TCPはコネクション型で信頼性の高い通信を提供し、UDPはコネクションレス型で高速だが信頼性は低い"}, {"label": "エ", "text": "UDPは必ずTCPより信頼性が高い"}], "correct": "ウ", "hint": "TCPは確認応答や再送制御を行うコネクション型プロトコルであり、UDPはそれらを行わない軽量なコネクションレス型プロトコルである。"}, {"id": 15, "cat": "ネットワーク", "topic": "VLANの効果", "q": "1台の物理スイッチ上でVLANを設定する主な効果はどれか。", "choices": [{"label": "ア", "text": "IPアドレスが自動的に割り当てられる"}, {"label": "イ", "text": "回線の伝送速度が向上する"}, {"label": "ウ", "text": "物理的な配線を増やさずに論理的にネットワークを分割できる"}, {"label": "エ", "text": "ケーブルの本数を必ず削減できる"}], "correct": "ウ", "hint": "VLANは物理構成を変えずに、論理的にブロードキャストドメインを分割できる技術である。"}, {"id": 16, "cat": "情報セキュリティ", "topic": "リスク対応の四分類", "q": "情報セキュリティリスクへの対応のうち、リスクの原因となる活動自体を中止する対応はどれか。", "choices": [{"label": "ア", "text": "リスク受容"}, {"label": "イ", "text": "リスク低減"}, {"label": "ウ", "text": "リスク移転"}, {"label": "エ", "text": "リスク回避"}], "correct": "エ", "hint": "リスク回避は、リスクの原因となる活動を中止するなどしてリスクの発生自体をなくす対応である。"}, {"id": 17, "cat": "情報セキュリティ", "topic": "総当たり攻撃にかかる時間の見積り", "q": "4桁の数字だけからなるPINコード(0000～9999)に対して、1秒間に1,000回の割合で総当たり攻撃を行う場合、全ての組み合わせを試すのに最大何秒かかるか。", "choices": [{"label": "ア", "text": "1000"}, {"label": "イ", "text": "1"}, {"label": "ウ", "text": "10"}, {"label": "エ", "text": "100"}], "correct": "ウ", "hint": "組み合わせは10,000通りであり、1秒間に1,000回試せるので、10,000÷1,000=10秒になる。"}, {"id": 18, "cat": "情報セキュリティ", "topic": "デジタル署名の検証手順", "q": "受信者がデジタル署名を検証する際に用いる鍵はどれか。", "choices": [{"label": "ア", "text": "受信者の公開鍵"}, {"label": "イ", "text": "受信者の秘密鍵"}, {"label": "ウ", "text": "送信者の秘密鍵"}, {"label": "エ", "text": "送信者の公開鍵"}], "correct": "エ", "hint": "デジタル署名は送信者の秘密鍵で作成され、受信者は送信者の公開鍵を使って検証する。"}, {"id": 19, "cat": "情報セキュリティ", "topic": "アクセス制御リスト(ACL)の考え方", "q": "ファイアウォールにおけるアクセス制御リスト(ACL)の役割として適切なものはどれか。", "choices": [{"label": "ア", "text": "ログをリアルタイムで暗号化する"}, {"label": "イ", "text": "ウイルス定義ファイルを更新する"}, {"label": "ウ", "text": "暗号化通信の鍵を自動生成する"}, {"label": "エ", "text": "通過を許可または拒否する通信の条件をルールとして定義する"}], "correct": "エ", "hint": "ACLは、送信元・宛先アドレスやポート番号などの条件に基づき、通信の許可・拒否を定義するルールの一覧である。"}, {"id": 20, "cat": "情報セキュリティ", "topic": "CSIRTの役割", "q": "組織内に設置されるCSIRTの主な役割として適切なものはどれか。", "choices": [{"label": "ア", "text": "全従業員の給与計算を行う"}, {"label": "イ", "text": "ハードウェアの調達価格を交渉する"}, {"label": "ウ", "text": "製品の広告戦略を立案する"}, {"label": "エ", "text": "セキュリティインシデントの検知・対応・調整を行う"}], "correct": "エ", "hint": "CSIRT(Computer Security Incident Response Team)は、セキュリティインシデントへの対応や関係機関との調整を行うチームである。"}, {"id": 21, "cat": "情報セキュリティ", "topic": "脆弱性診断とペネトレーションテストの違い", "q": "ペネトレーションテストの説明として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "実際に攻撃を試みてシステムへの侵入可否を検証する"}, {"label": "イ", "text": "ソースコードを静的に解析して不備を検出する"}, {"label": "ウ", "text": "従業員へのセキュリティ教育を実施する"}, {"label": "エ", "text": "既知の脆弱性を自動ツールで網羅的に洗い出す"}], "correct": "ア", "hint": "ペネトレーションテストは、実際の攻撃手法を用いてシステムに侵入できるかどうかを検証するテストである。"}, {"id": 22, "cat": "データベース", "topic": "第3正規形への正規化(推移関数従属の排除)", "q": "ある表で「社員番号→部署コード」「部署コード→部署名」という関係があるとき、第3正規形にするための操作として適切なものはどれか。", "choices": [{"label": "ア", "text": "社員番号を削除する"}, {"label": "イ", "text": "部署コードと部署名を別表に分離する"}, {"label": "ウ", "text": "全ての列を1つの表にまとめる"}, {"label": "エ", "text": "部署名を主キーにする"}], "correct": "イ", "hint": "部署名は社員番号に推移的に従属しているため、部署コードと部署名を別表に分離することで第3正規形になる。"}, {"id": 23, "cat": "データベース", "topic": "GROUP BYとHAVING句", "q": "SQLにおいて、グループ化した後の集計結果に対して条件を指定する句はどれか。", "choices": [{"label": "ア", "text": "ORDER BY句"}, {"label": "イ", "text": "WHERE句"}, {"label": "ウ", "text": "GROUP BY句"}, {"label": "エ", "text": "HAVING句"}], "correct": "エ", "hint": "HAVING句は、GROUP BYで集計した後のグループに対して絞り込み条件を指定する。"}, {"id": 24, "cat": "データベース", "topic": "排他制御のロック粒度", "q": "データベースの排他制御において、ロックの粒度を表全体からレコード単位に細かくすることの効果として適切なものはどれか。", "choices": [{"label": "ア", "text": "同時実行性は必ず低下する"}, {"label": "イ", "text": "同時実行性が高まるが、ロック管理のオーバーヘッドは増える"}, {"label": "ウ", "text": "ロックの管理コストは常にゼロになる"}, {"label": "エ", "text": "データの整合性が保証されなくなる"}], "correct": "イ", "hint": "ロックの粒度を細かくすると、複数のトランザクションが同時に異なる行を更新しやすくなり同時実行性が高まるが、管理するロックの数が増えるためオーバーヘッドも増加する。"}, {"id": 25, "cat": "データベース", "topic": "障害回復のロールフォワードとロールバック", "q": "データベース障害からの回復において、コミット済みのトランザクションの更新内容をログを用いて再現する処理はどれか。", "choices": [{"label": "ア", "text": "デッドロック検出"}, {"label": "イ", "text": "正規化"}, {"label": "ウ", "text": "ロールフォワード"}, {"label": "エ", "text": "ロールバック"}], "correct": "ウ", "hint": "ロールフォワードは、バックアップ以降にコミットされた更新内容をログを使って再現し、障害直前の状態に復元する処理である。"}, {"id": 26, "cat": "アルゴリズム・プログラミング", "topic": "安定ソートの定義", "q": "ソートアルゴリズムにおける「安定ソート」の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "同じ値をもつ要素の相対的な順序が、ソート後も保たれる"}, {"label": "イ", "text": "必ずO(n log n)で動作する"}, {"label": "ウ", "text": "比較回数が常に最小になる"}, {"label": "エ", "text": "追加のメモリ領域を必要としない"}], "correct": "ア", "hint": "安定ソートとは、同じキー値をもつ要素同士の元の順序が、ソート後も変わらないソート方式のことである。"}, {"id": 27, "cat": "アルゴリズム・プログラミング", "topic": "二分探索の最大比較回数の計算", "q": "整列済みの1,024件のデータに対して二分探索を行う場合、最悪の場合の比較回数はどれか。", "choices": [{"label": "ア", "text": "100"}, {"label": "イ", "text": "512"}, {"label": "ウ", "text": "32"}, {"label": "エ", "text": "10"}], "correct": "エ", "hint": "二分探索の比較回数はlog2(データ件数)に相当し、log2(1024)=10回になる。"}, {"id": 28, "cat": "アルゴリズム・プログラミング", "topic": "後置記法(逆ポーランド記法)の評価にスタックを使う理由", "q": "後置記法(逆ポーランド記法)で書かれた数式をコンピュータが評価する際に、スタックを用いる理由として適切なものはどれか。", "choices": [{"label": "ア", "text": "文字列を逆順に表示するため"}, {"label": "イ", "text": "メモリ使用量を必ず最小にできるため"}, {"label": "ウ", "text": "演算子が現れるたびに直前の被演算子を取り出して計算できるため"}, {"label": "エ", "text": "括弧の対応を数えるため"}], "correct": "ウ", "hint": "後置記法では、被演算子をスタックに積んでおき、演算子が現れたときにスタックから取り出して計算するという処理がしやすい。"}, {"id": 29, "cat": "アルゴリズム・プログラミング", "topic": "線形探索の平均比較回数の計算", "q": "101件のデータが格納された配列に対して線形探索を行い、目的のデータが必ず存在する場合、平均的な比較回数はどれか。", "choices": [{"label": "ア", "text": "51"}, {"label": "イ", "text": "50.5"}, {"label": "ウ", "text": "101"}, {"label": "エ", "text": "1"}], "correct": "ア", "hint": "データが均等な確率でどの位置にもあると仮定すると、平均比較回数は(件数+1)÷2=(101+1)÷2=51回になる。"}, {"id": 30, "cat": "アルゴリズム・プログラミング", "topic": "動的計画法によるメモ化の考え方", "q": "フィボナッチ数列を再帰で計算する際に、計算済みの値を配列などに保存して再利用する手法を何と呼ぶか。", "choices": [{"label": "ア", "text": "メモ化"}, {"label": "イ", "text": "仮想化"}, {"label": "ウ", "text": "カプセル化"}, {"label": "エ", "text": "多重定義"}], "correct": "ア", "hint": "メモ化は、一度計算した結果を保存しておき、同じ計算が再度必要になったときに再利用する動的計画法の代表的な手法である。"}, {"id": 31, "cat": "アルゴリズム・プログラミング", "topic": "ダイクストラ法の考え方", "q": "重み付きグラフにおいて、始点から各頂点までの最短経路を求める代表的なアルゴリズムはどれか。", "choices": [{"label": "ア", "text": "ダイクストラ法"}, {"label": "イ", "text": "二分探索法"}, {"label": "ウ", "text": "クイックソート"}, {"label": "エ", "text": "ハッシュ法"}], "correct": "ア", "hint": "ダイクストラ法は、非負の重みをもつグラフにおいて、始点から各頂点への最短経路を求める代表的なアルゴリズムである。"}, {"id": 32, "cat": "ソフトウェア・HI", "topic": "UNIX系OSのファイルアクセス権表現", "q": "UNIX系OSにおけるファイルのアクセス権表示「rwxr--r--」の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "全ての利用者が読み書き実行できる"}, {"label": "イ", "text": "所有者だけがアクセスでき、他は一切アクセスできない"}, {"label": "ウ", "text": "グループだけが読み書き実行できる"}, {"label": "エ", "text": "所有者は読み書き実行が可能で、グループとその他は読み取りのみ可能"}], "correct": "エ", "hint": "rwxr--r--は、所有者(rwx)、グループ(r--)、その他(r--)の順に権限を表しており、所有者のみ読み書き実行が可能で他は読み取りのみとなる。"}, {"id": 33, "cat": "ソフトウェア・HI", "topic": "ユーザビリティテストの目的", "q": "実際の利用者にシステムを操作してもらい、使いにくい点や問題点を発見する評価手法はどれか。", "choices": [{"label": "ア", "text": "負荷テスト"}, {"label": "イ", "text": "回帰テスト"}, {"label": "ウ", "text": "ホワイトボックステスト"}, {"label": "エ", "text": "ユーザビリティテスト"}], "correct": "エ", "hint": "ユーザビリティテストは、実際の利用者にシステムを操作してもらうことで使い勝手の問題点を発見する評価手法である。"}, {"id": 34, "cat": "システム開発", "topic": "判定条件網羅の考え方", "q": "ホワイトボックステストにおいて、条件分岐の真偽の両方の結果を少なくとも1回ずつ実行するように設計する網羅基準はどれか。", "choices": [{"label": "ア", "text": "限界値分析"}, {"label": "イ", "text": "判定条件網羅"}, {"label": "ウ", "text": "同値分割"}, {"label": "エ", "text": "命令網羅"}], "correct": "イ", "hint": "判定条件網羅は、if文などの判定条件が真になる場合と偽になる場合の両方を少なくとも1回ずつテストする基準である。"}, {"id": 35, "cat": "システム開発", "topic": "ウォーターフォールモデルとアジャイルの違い", "q": "ウォーターフォールモデルと比較したアジャイル開発の特徴として適切なものはどれか。", "choices": [{"label": "ア", "text": "文書化を最も重視する開発手法である"}, {"label": "イ", "text": "工程の後戻りを一切想定しない"}, {"label": "ウ", "text": "要件を全て確定させてから一括で開発を進める"}, {"label": "エ", "text": "短い期間で開発とリリースを繰り返し、変化に柔軟に対応する"}], "correct": "エ", "hint": "アジャイル開発は、短い反復(イテレーション)で開発とリリースを繰り返し、要求の変化に柔軟に対応することを特徴とする。"}, {"id": 36, "cat": "システム開発", "topic": "コードレビューの目的", "q": "開発チームで実施するコードレビューの主な目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "ソースコードの著作権を主張すること"}, {"label": "イ", "text": "開発者の勤務時間を記録すること"}, {"label": "ウ", "text": "コーディング標準の遵守やバグを早期に発見すること"}, {"label": "エ", "text": "テストを完全に省略できるようにすること"}], "correct": "ウ", "hint": "コードレビューは、他の開発者がコードを確認することでバグやコーディング標準からの逸脱を早期に発見する活動である。"}, {"id": 37, "cat": "システム開発", "topic": "バージョン管理システムの効果", "q": "複数人でソフトウェア開発を行う際に、Gitなどのバージョン管理システムを利用する効果として適切なものはどれか。", "choices": [{"label": "ア", "text": "要件定義を自動化する"}, {"label": "イ", "text": "変更履歴を管理し、複数人での並行開発や過去の状態への復元を容易にする"}, {"label": "ウ", "text": "テストケースを自動的に生成する"}, {"label": "エ", "text": "プログラムの実行速度を自動的に高速化する"}], "correct": "イ", "hint": "バージョン管理システムは、変更履歴を記録し、複数人での並行開発や過去のバージョンへの復元を容易にする。"}, {"id": 38, "cat": "システム開発", "topic": "ファンクションポイント法の計算", "q": "あるシステムの外部入力が3個(1個当たりの重み4)、外部出力が2個(1個当たりの重み5)、内部論理ファイルが1個(重み10)であるとき、未調整ファンクションポイントの合計はどれか。", "choices": [{"label": "ア", "text": "32"}, {"label": "イ", "text": "22"}, {"label": "ウ", "text": "38"}, {"label": "エ", "text": "28"}], "correct": "ア", "hint": "3×4+2×5+1×10=12+10+10=32ファンクションポイントになる。"}, {"id": 39, "cat": "プロジェクトマネジメント", "topic": "PERTの3点見積りによる期待値計算", "q": "ある作業の所要日数について、楽観値4日、最頻値6日、悲観値14日と見積もられた。PERTの計算式による期待値は何日か。", "choices": [{"label": "ア", "text": "7"}, {"label": "イ", "text": "8"}, {"label": "ウ", "text": "9"}, {"label": "エ", "text": "6"}], "correct": "ア", "hint": "PERTの期待値=(楽観値+4×最頻値+悲観値)÷6=(4+24+14)÷6=42÷6=7日になる。"}, {"id": 40, "cat": "プロジェクトマネジメント", "topic": "クリティカルパスの特定", "q": "作業A(3日、先行作業なし)、B(5日、先行作業A)、C(4日、先行作業A)、D(2日、先行作業B・Cの両方完了後)から成るプロジェクトがある。このプロジェクトの最短所要日数は何日か。", "choices": [{"label": "ア", "text": "10"}, {"label": "イ", "text": "9"}, {"label": "ウ", "text": "14"}, {"label": "エ", "text": "12"}], "correct": "ア", "hint": "経路A→B→Dは3+5+2=10日、経路A→C→Dは3+4+2=9日であり、長い方の10日が全体の最短所要日数になる。"}, {"id": 41, "cat": "プロジェクトマネジメント", "topic": "EVMによるコスト差異とスケジュール差異", "q": "あるプロジェクトの計画価値(PV)が100万円、出来高価値(EV)が80万円、実コスト(AC)が90万円のとき、コスト差異(CV=EV-AC)とスケジュール差異(SV=EV-PV)の組み合わせとして正しいものはどれか。", "choices": [{"label": "ア", "text": "CV=+10万円、SV=+20万円(コスト削減・進捗先行)"}, {"label": "イ", "text": "CV=0、SV=0"}, {"label": "ウ", "text": "CV=-20万円、SV=-10万円"}, {"label": "エ", "text": "CV=-10万円、SV=-20万円(コスト超過・進捗遅延)"}], "correct": "エ", "hint": "CV=EV-AC=80-90=-10万円、SV=EV-PV=80-100=-20万円であり、いずれも負の値のためコスト超過かつ進捗遅延を示す。"}, {"id": 42, "cat": "プロジェクトマネジメント", "topic": "リスクの期待金額価値(EMV)の計算", "q": "発生確率20%、発生時の損失額500万円と見積もられたリスクの期待金額価値(EMV)はどれか。", "choices": [{"label": "ア", "text": "-500万円"}, {"label": "イ", "text": "100万円"}, {"label": "ウ", "text": "-100万円"}, {"label": "エ", "text": "-20万円"}], "correct": "ウ", "hint": "EMV=発生確率×影響額=0.2×(-500万円)=-100万円になる。"}, {"id": 43, "cat": "サービスマネジメント・監査", "topic": "SLA違反時の対応", "q": "サービス提供者がSLAで合意した目標値を達成できなかった場合に、一般的に行われることはどれか。", "choices": [{"label": "ア", "text": "顧客への報告を一切行わない"}, {"label": "イ", "text": "サービスの提供を無条件に停止する"}, {"label": "ウ", "text": "SLAそのものを直ちに廃止する"}, {"label": "エ", "text": "原因分析と再発防止策の検討、必要に応じた是正措置の実施"}], "correct": "エ", "hint": "SLA未達成の場合は、原因を分析し是正処置を講じるとともに、必要に応じて顧客へ報告することが一般的である。"}, {"id": 44, "cat": "サービスマネジメント・監査", "topic": "問題管理における既知の誤り(Known Error)", "q": "問題管理プロセスにおいて、根本原因と暫定的な回避策が特定された未解決の問題を何と呼ぶか。", "choices": [{"label": "ア", "text": "変更要求(RFC)"}, {"label": "イ", "text": "インシデント"}, {"label": "ウ", "text": "既知の誤り(Known Error)"}, {"label": "エ", "text": "サービス要求"}], "correct": "ウ", "hint": "既知の誤り(Known Error)は、根本原因と回避策(ワークアラウンド)が判明しているが、恒久的な解決には至っていない問題を指す。"}, {"id": 45, "cat": "サービスマネジメント・監査", "topic": "システム監査のフォローアップ", "q": "システム監査人が監査報告書を提出した後に実施するフォローアップの内容として適切なものはどれか。", "choices": [{"label": "ア", "text": "被監査部門の人事評価を行う"}, {"label": "イ", "text": "監査対象システムの開発を代行する"}, {"label": "ウ", "text": "改善提案に基づく措置が適切かつ適時に実施されているかを確認する"}, {"label": "エ", "text": "監査結果を非公開のまま破棄する"}], "correct": "ウ", "hint": "フォローアップでは、監査で指摘した改善提案や改善計画が実際に適切かつ適時に実施されているかを確認する。"}, {"id": 46, "cat": "経営・戦略・法務", "topic": "損益分岐点売上高の計算", "q": "固定費が300万円、変動費率が60%である場合、損益分岐点売上高はいくらか。", "choices": [{"label": "ア", "text": "500万円"}, {"label": "イ", "text": "750万円"}, {"label": "ウ", "text": "480万円"}, {"label": "エ", "text": "900万円"}], "correct": "イ", "hint": "損益分岐点売上高=固定費÷(1-変動費率)=300÷(1-0.6)=300÷0.4=750万円になる。"}, {"id": 47, "cat": "経営・戦略・法務", "topic": "在庫回転率の計算", "q": "年間売上原価が1,200万円、平均在庫金額が200万円である場合の在庫回転率は何回か。", "choices": [{"label": "ア", "text": "3回"}, {"label": "イ", "text": "4回"}, {"label": "ウ", "text": "6回"}, {"label": "エ", "text": "8回"}], "correct": "ウ", "hint": "在庫回転率=売上原価÷平均在庫金額=1,200÷200=6回になる。"}, {"id": 48, "cat": "経営・戦略・法務", "topic": "特許権と著作権の違い", "q": "特許権と著作権の違いに関する説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "特許権は出願・審査を経て発生し、著作権は創作した時点で自動的に発生する"}, {"label": "イ", "text": "両方とも登録なしに自動的に発生する"}, {"label": "ウ", "text": "両方とも出願・審査が必須である"}, {"label": "エ", "text": "著作権は出願・審査を経て発生し、特許権は自動的に発生する"}], "correct": "ア", "hint": "特許権は特許庁への出願と審査を経て権利が発生するのに対し、著作権は創作した時点で自動的に発生する無方式主義を採る。"}, {"id": 49, "cat": "経営・戦略・法務", "topic": "下請法の趣旨", "q": "下請法(下請代金支払遅延等防止法)の主な目的として適切なものはどれか。", "choices": [{"label": "ア", "text": "下請事業者の労働時間を管理すること"}, {"label": "イ", "text": "特許権の存続期間を延長すること"}, {"label": "ウ", "text": "発注者と下請事業者との取引の公正化を図り、下請事業者の利益を保護すること"}, {"label": "エ", "text": "個人情報の第三者提供を制限すること"}], "correct": "ウ", "hint": "下請法は、親事業者と下請事業者との取引の公正化を図り、下請事業者の利益を保護することを目的とした法律である。"}, {"id": 50, "cat": "経営・戦略・法務", "topic": "ROI(投資利益率)の計算", "q": "500万円を投資し、その結果として年間100万円の利益を得た場合のROI(投資利益率)はどれか。", "choices": [{"label": "ア", "text": "20%"}, {"label": "イ", "text": "5%"}, {"label": "ウ", "text": "10%"}, {"label": "エ", "text": "50%"}], "correct": "ア", "hint": "ROI=利益÷投資額×100=100÷500×100=20%になる。"}, {"id": 51, "cat": "基礎理論", "topic": "2進数の論理右シフト演算", "q": "8ビットの2進数00101100を、符号を考慮しない論理右シフトで2ビット右にシフトした結果はどれか。", "choices": [{"label": "ア", "text": "11001011"}, {"label": "イ", "text": "00001011"}, {"label": "ウ", "text": "10001011"}, {"label": "エ", "text": "00101100"}], "correct": "イ", "hint": "論理右シフトでは空いた上位ビットに0を補うため、00101100を2ビット右シフトすると00001011になる。"}, {"id": 52, "cat": "コンピュータシステム", "topic": "MTBFとMTTRから稼働率を求める計算", "q": "あるシステムのMTBF(平均故障間隔)が180時間、MTTR(平均修復時間)が20時間であるとき、このシステムの稼働率はどれか。", "choices": [{"label": "ア", "text": "0.99"}, {"label": "イ", "text": "0.9"}, {"label": "ウ", "text": "0.8"}, {"label": "エ", "text": "0.95"}], "correct": "イ", "hint": "稼働率=MTBF÷(MTBF+MTTR)=180÷(180+20)=180÷200=0.9になる。"}, {"id": 53, "cat": "ネットワーク", "topic": "ICMPの役割", "q": "pingコマンドなどで用いられ、ネットワークの疎通確認やエラー通知を行うプロトコルはどれか。", "choices": [{"label": "ア", "text": "ICMP"}, {"label": "イ", "text": "SMTP"}, {"label": "ウ", "text": "SNMP"}, {"label": "エ", "text": "FTP"}], "correct": "ア", "hint": "ICMP(Internet Control Message Protocol)は、疎通確認やエラー通知などネットワーク層の制御メッセージを扱うプロトコルである。"}, {"id": 54, "cat": "情報セキュリティ", "topic": "ISMS認証の目的", "q": "組織がISMS(情報セキュリティマネジメントシステム)の認証を取得する目的として最も適切なものはどれか。", "choices": [{"label": "ア", "text": "組織全体で情報セキュリティを継続的に管理・改善する体制を第三者に証明するため"}, {"label": "イ", "text": "製品の販売価格を統一するため"}, {"label": "ウ", "text": "従業員の給与体系を標準化するため"}, {"label": "エ", "text": "特定のウイルス対策ソフトの導入を義務付けるため"}], "correct": "ア", "hint": "ISMS認証は、組織が情報セキュリティを継続的に管理・改善する仕組みを整備していることを第三者機関が証明する制度である。"}, {"id": 55, "cat": "データベース", "topic": "三層スキーマ構造", "q": "データベースの三層スキーマ構造における「外部スキーマ」の説明として適切なものはどれか。", "choices": [{"label": "ア", "text": "データの物理的な格納方法を定義したもの"}, {"label": "イ", "text": "ネットワークの通信経路を定義したもの"}, {"label": "ウ", "text": "データベース全体の論理的な構造を定義したもの"}, {"label": "エ", "text": "利用者やアプリケーションから見えるデータの視点(ビュー)を定義したもの"}], "correct": "エ", "hint": "外部スキーマは、利用者やアプリケーションプログラムごとに必要なデータの見え方(ビュー)を定義したものである。"}, {"id": 56, "cat": "アルゴリズム・プログラミング", "topic": "M/M/1待ち行列モデルの平均系内人数の計算", "q": "M/M/1の待ち行列モデルにおいて、到着率λが4件/分、サービス率μが5件/分であるとき、平均系内人数(系内にいる客の平均数)はどれか。", "choices": [{"label": "ア", "text": "0.8"}, {"label": "イ", "text": "4"}, {"label": "ウ", "text": "5"}, {"label": "エ", "text": "1"}], "correct": "イ", "hint": "利用率ρ=λ/μ=4/5=0.8であり、平均系内人数L=ρ/(1-ρ)=0.8/0.2=4になる。"}, {"id": 57, "cat": "ソフトウェア・HI", "topic": "色覚の多様性に配慮したデザイン", "q": "グラフや図の色分けにおいて、色覚の多様性に配慮する方法として適切なものはどれか。", "choices": [{"label": "ア", "text": "彩度の高い原色のみを使用する"}, {"label": "イ", "text": "色だけでなく形状やパターン、ラベルなど複数の手段で情報を区別できるようにする"}, {"label": "ウ", "text": "できるだけ多くの色数を使って情報量を増やす"}, {"label": "エ", "text": "色の違いだけで全ての情報を伝えるようにする"}], "correct": "イ", "hint": "色覚の多様性に配慮するには、色だけに頼らず形状やパターン、文字ラベルなど複数の手段を併用して情報を区別できるようにすることが重要である。"}, {"id": 58, "cat": "システム開発", "topic": "スパイラルモデルの特徴", "q": "開発工程を「計画→リスク分析→開発・テスト→評価」の反復として捉え、リスクを低減しながら段階的にシステムを完成させる開発モデルはどれか。", "choices": [{"label": "ア", "text": "Vモデル"}, {"label": "イ", "text": "スパイラルモデル"}, {"label": "ウ", "text": "プロトタイピングモデル"}, {"label": "エ", "text": "ウォーターフォールモデル"}], "correct": "イ", "hint": "スパイラルモデルは、リスク分析を組み込んだ工程を繰り返しながら、段階的にシステムの完成度を高めていく開発モデルである。"}, {"id": 59, "cat": "プロジェクトマネジメント", "topic": "スコープクリープの説明", "q": "プロジェクトの進行中に、正式な変更管理の手続きを経ないまま、要求や作業範囲がなし崩し的に拡大していく現象を何と呼ぶか。", "choices": [{"label": "ア", "text": "スコープクリープ"}, {"label": "イ", "text": "クリティカルチェーン"}, {"label": "ウ", "text": "ベースライン"}, {"label": "エ", "text": "マイルストーン"}], "correct": "ア", "hint": "スコープクリープは、正式な変更管理を経ずにプロジェクトの範囲(スコープ)が徐々に拡大してしまう現象を指す。"}, {"id": 60, "cat": "経営・戦略・法務", "topic": "バランススコアカード(BSC)の4つの視点", "q": "バランススコアカード(BSC)における4つの視点の組み合わせとして適切なものはどれか。", "choices": [{"label": "ア", "text": "財務、生産、販売、人事"}, {"label": "イ", "text": "財務、顧客、業務プロセス、学習と成長"}, {"label": "ウ", "text": "顧客、競合、自社、市場"}, {"label": "エ", "text": "強み、弱み、機会、脅威"}], "correct": "イ", "hint": "バランススコアカードは、財務・顧客・業務プロセス・学習と成長という4つの視点から企業戦略を評価・管理する手法である。"}];

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
          <div style={s.sub}>基本情報技術者 — 60問内蔵(本試験想定問題・科目A実際の出題数に準拠)</div>
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
