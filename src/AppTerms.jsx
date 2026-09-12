import React, { useState, useEffect, useMemo, useCallback } from "react";

// localStorage管理(科目A/Bとは独立したキー)
const LS_KNOWN = "feterm_known"; // 「わかった」を押したことがある用語IDの累積リスト
const LS_LASTCAT = "feterm_lastcat";

const CATS = [
  "すべて","基礎理論","コンピュータシステム","ネットワーク","情報セキュリティ",
  "データベース","アルゴリズム・プログラミング","ソフトウェア・HI",
  "システム開発","プロジェクトマネジメント","サービスマネジメント・監査","経営・戦略・法務",
];

const TERMS = [{"id": 1, "cat": "基礎理論", "term": "2進数", "def": "0と1だけで数値を表す記数法。コンピュータ内部の基本的な数値表現。"}, {"id": 2, "cat": "基礎理論", "term": "補数表現", "def": "負の数を表現するための方式。2進数では通常2の補数が使われる。"}, {"id": 3, "cat": "基礎理論", "term": "桁落ち", "def": "絶対値がほぼ等しい数どうしを減算した際に有効数字が失われる誤差。"}, {"id": 4, "cat": "基礎理論", "term": "情報落ち", "def": "絶対値の差が大きい数を加減算した際に小さい方の値が計算に反映されない誤差。"}, {"id": 5, "cat": "基礎理論", "term": "ベン図", "def": "集合の関係を円の重なりで視覚的に表現する図。"}, {"id": 6, "cat": "基礎理論", "term": "ド・モルガンの法則", "def": "論理演算においてANDとORの否定を相互に変換できる法則。"}, {"id": 7, "cat": "基礎理論", "term": "条件付き確率", "def": "ある事象が起きたという条件のもとで、別の事象が起きる確率。"}, {"id": 8, "cat": "基礎理論", "term": "標準偏差", "def": "データのばらつきの大きさを表す統計量。分散の平方根。"}, {"id": 9, "cat": "基礎理論", "term": "回帰分析", "def": "説明変数と目的変数の関係を数式でモデル化する統計手法。"}, {"id": 10, "cat": "基礎理論", "term": "ニュートン法", "def": "方程式の近似解を反復計算によって求める数値解析手法。"}, {"id": 11, "cat": "基礎理論", "term": "有向グラフ", "def": "辺に向きがあるグラフ。矢印で関係の方向を表す。"}, {"id": 12, "cat": "基礎理論", "term": "待ち行列理論", "def": "窓口やサーバへの到着・サービスをモデル化し待ち時間などを分析する理論。"}, {"id": 13, "cat": "基礎理論", "term": "ハフマン符号", "def": "出現頻度に応じて符号長を変え、データを効率的に圧縮する符号化方式。"}, {"id": 14, "cat": "基礎理論", "term": "ASCIIコード", "def": "英数字や記号を7ビットで表現する代表的な文字コード。"}, {"id": 15, "cat": "基礎理論", "term": "逆ポーランド表記法", "def": "演算子を被演算子の後に置く記法。スタックを使って計算しやすい。"}, {"id": 16, "cat": "基礎理論", "term": "有限オートマトン", "def": "有限個の状態と状態遷移で動作を表現する計算モデル。"}, {"id": 17, "cat": "基礎理論", "term": "オーダー記法", "def": "アルゴリズムの計算量の増加傾向を表す記法(O記法)。"}, {"id": 18, "cat": "基礎理論", "term": "教師あり学習", "def": "正解ラベル付きデータを用いて入力と出力の関係を学習する機械学習の手法。"}, {"id": 19, "cat": "基礎理論", "term": "過学習", "def": "学習データに適合しすぎて、未知データへの汎化性能が下がる現象。"}, {"id": 20, "cat": "基礎理論", "term": "ニューラルネットワーク", "def": "脳の神経回路を模した、ノードと重みからなる機械学習のモデル構造。"}, {"id": 21, "cat": "基礎理論", "term": "ファインチューニング", "def": "事前学習済みモデルを特定タスク向けのデータで追加学習すること。"}, {"id": 22, "cat": "基礎理論", "term": "バックプロパゲーション", "def": "ニューラルネットワークの誤差を逆方向に伝播させ重みを更新する学習アルゴリズム。"}, {"id": 23, "cat": "基礎理論", "term": "大規模言語モデル(LLM)", "def": "大量のテキストで学習した、自然言語を扱う大規模なニューラルネットワーク。"}, {"id": 24, "cat": "基礎理論", "term": "コンパイラ", "def": "高水準言語のソースコードを、機械語などの目的プログラムに変換するソフトウェア。"}, {"id": 25, "cat": "基礎理論", "term": "BNF", "def": "プログラム言語などの構文を定義するための記法(バッカス・ナウア記法)。"}, {"id": 26, "cat": "コンピュータシステム", "term": "CPU", "def": "中央処理装置。命令の解読と演算を行うコンピュータの中核部品。"}, {"id": 27, "cat": "コンピュータシステム", "term": "RISC", "def": "命令を単純化し1命令1クロックでの実行を目指すプロセッサアーキテクチャ。"}, {"id": 28, "cat": "コンピュータシステム", "term": "パイプライン", "def": "命令の実行を複数段階に分け、並行して処理速度を高める高速化技術。"}, {"id": 29, "cat": "コンピュータシステム", "term": "マルチコアプロセッサ", "def": "1つのチップに複数の処理コアを搭載したプロセッサ。"}, {"id": 30, "cat": "コンピュータシステム", "term": "CPI", "def": "1命令の実行に必要な平均クロック数。プロセッサ性能指標の一つ。"}, {"id": 31, "cat": "コンピュータシステム", "term": "MIPS", "def": "1秒間に実行できる命令数(100万単位)を表す性能指標。"}, {"id": 32, "cat": "コンピュータシステム", "term": "キャッシュメモリ", "def": "CPUと主記憶の速度差を埋めるための高速小容量メモリ。"}, {"id": 33, "cat": "コンピュータシステム", "term": "DRAM", "def": "記憶保持にリフレッシュ動作が必要な、安価で大容量な半導体メモリ。"}, {"id": 34, "cat": "コンピュータシステム", "term": "ライトバック", "def": "キャッシュへの書込みを、後でまとめて主記憶へ反映する方式。"}, {"id": 35, "cat": "コンピュータシステム", "term": "DMA", "def": "CPUを介さずに周辺装置と主記憶が直接データ転送を行う方式。"}, {"id": 36, "cat": "コンピュータシステム", "term": "RAID", "def": "複数のディスクを組み合わせて冗長性や速度を高める技術。"}, {"id": 37, "cat": "コンピュータシステム", "term": "MTBF", "def": "平均故障間隔。システムが故障せずに動作する平均時間。"}, {"id": 38, "cat": "コンピュータシステム", "term": "MTTR", "def": "平均修復時間。故障から復旧までにかかる平均時間。"}, {"id": 39, "cat": "コンピュータシステム", "term": "フォールトトレラント", "def": "構成要素が故障してもシステム全体は正常に動作し続ける設計思想。"}, {"id": 40, "cat": "コンピュータシステム", "term": "仮想化", "def": "物理的なハードウェア資源を論理的に分割・統合して利用する技術。"}, {"id": 41, "cat": "コンピュータシステム", "term": "IaaS", "def": "サーバやストレージなどのインフラをサービスとして提供する形態。"}, {"id": 42, "cat": "コンピュータシステム", "term": "スラッシング", "def": "ページの入れ替えが頻発し、システム全体の処理性能が低下する現象。"}, {"id": 43, "cat": "コンピュータシステム", "term": "スワッピング", "def": "主記憶の空き不足を補うため、プロセス全体を補助記憶と入れ替える方式。"}, {"id": 44, "cat": "コンピュータシステム", "term": "ページング方式", "def": "仮想記憶を固定長のページ単位で管理する記憶管理方式。"}, {"id": 45, "cat": "コンピュータシステム", "term": "LRU", "def": "最も長い間参照されていないページを置換対象とするアルゴリズム。"}, {"id": 46, "cat": "コンピュータシステム", "term": "カーネル", "def": "OSの中核部分。プロセス管理やメモリ管理などの基本機能を担う。"}, {"id": 47, "cat": "コンピュータシステム", "term": "ラウンドロビン", "def": "一定時間ごとに処理を切り替える公平なタスクスケジューリング方式。"}, {"id": 48, "cat": "ネットワーク", "term": "LAN", "def": "建物内など限られた範囲を結ぶ比較的狭い通信ネットワーク。"}, {"id": 49, "cat": "ネットワーク", "term": "OSI基本参照モデル", "def": "通信機能を7つの階層に分けて整理したネットワークの標準モデル。"}, {"id": 50, "cat": "ネットワーク", "term": "TCP/IP", "def": "インターネットで広く使われる通信プロトコル群の総称。"}, {"id": 51, "cat": "ネットワーク", "term": "IPアドレス", "def": "ネットワーク上の機器を識別するための番号。"}, {"id": 52, "cat": "ネットワーク", "term": "サブネットマスク", "def": "IPアドレスをネットワーク部とホスト部に分ける際に使う値。"}, {"id": 53, "cat": "ネットワーク", "term": "DNS", "def": "ドメイン名とIPアドレスを対応付ける仕組み。"}, {"id": 54, "cat": "ネットワーク", "term": "DHCP", "def": "端末にIPアドレスなどの設定情報を自動的に割り当てるプロトコル。"}, {"id": 55, "cat": "ネットワーク", "term": "ARP", "def": "IPアドレスから対応するMACアドレスを取得するプロトコル。"}, {"id": 56, "cat": "ネットワーク", "term": "NAT", "def": "プライベートIPアドレスとグローバルIPアドレスを相互変換する技術。"}, {"id": 57, "cat": "ネットワーク", "term": "ルータ", "def": "異なるネットワーク間でパケットの経路選択(ルーティング)を行う機器。"}, {"id": 58, "cat": "ネットワーク", "term": "スイッチングハブ", "def": "MACアドレスを基に必要なポートだけにデータを転送する集線装置。"}, {"id": 59, "cat": "ネットワーク", "term": "CSMA/CD", "def": "搬送波感知多重アクセス／衝突検出方式。イーサネットの伝送制御方式。"}, {"id": 60, "cat": "ネットワーク", "term": "ポート番号", "def": "TCP/UDP通信でアプリケーションを識別するための番号。"}, {"id": 61, "cat": "ネットワーク", "term": "HTTP", "def": "Webページなどのハイパーテキストをやり取りするプロトコル。"}, {"id": 62, "cat": "ネットワーク", "term": "SMTP", "def": "電子メールを送信するためのプロトコル。"}, {"id": 63, "cat": "ネットワーク", "term": "VPN", "def": "公衆回線上に仮想的な専用線を構築し安全に通信する技術。"}, {"id": 64, "cat": "ネットワーク", "term": "5G", "def": "第5世代移動通信システム。高速・低遅延・多接続を特徴とする通信規格。"}, {"id": 65, "cat": "ネットワーク", "term": "QoS", "def": "通信の帯域や遅延などの品質を制御・保証する仕組み。"}, {"id": 66, "cat": "ネットワーク", "term": "SDN", "def": "ソフトウェアによってネットワークの構成や制御を柔軟に行う技術。"}, {"id": 67, "cat": "ネットワーク", "term": "SNMP", "def": "ネットワーク機器を集中的に監視・管理するためのプロトコル。"}, {"id": 68, "cat": "情報セキュリティ", "term": "機密性", "def": "許可された者だけが情報にアクセスできる状態を確保する特性。"}, {"id": 69, "cat": "情報セキュリティ", "term": "完全性", "def": "情報が改ざん・破壊されず正確な状態を保っている特性。"}, {"id": 70, "cat": "情報セキュリティ", "term": "可用性", "def": "許可された者が必要なときに情報やサービスを利用できる特性。"}, {"id": 71, "cat": "情報セキュリティ", "term": "ソーシャルエンジニアリング", "def": "人の心理的な隙や行動のミスにつけこんで情報を盗み出す手法。"}, {"id": 72, "cat": "情報セキュリティ", "term": "マルウェア", "def": "コンピュータウイルスなど、悪意のある不正なプログラムの総称。"}, {"id": 73, "cat": "情報セキュリティ", "term": "ランサムウェア", "def": "データを暗号化するなどして身代金を要求する不正プログラム。"}, {"id": 74, "cat": "情報セキュリティ", "term": "ゼロデイ攻撃", "def": "修正プログラムが提供される前の脆弱性を悪用した攻撃。"}, {"id": 75, "cat": "情報セキュリティ", "term": "フィッシング", "def": "偽のWebサイトやメールで個人情報をだまし取る攻撃手法。"}, {"id": 76, "cat": "情報セキュリティ", "term": "SQLインジェクション", "def": "不正なSQL文を注入してデータベースを不正に操作する攻撃。"}, {"id": 77, "cat": "情報セキュリティ", "term": "クロスサイトスクリプティング", "def": "Webページに悪意のあるスクリプトを埋め込む攻撃手法。"}, {"id": 78, "cat": "情報セキュリティ", "term": "DDoS攻撃", "def": "多数の端末から一斉に大量アクセスを行い、サービスを妨害する攻撃。"}, {"id": 79, "cat": "情報セキュリティ", "term": "共通鍵暗号方式", "def": "暗号化と復号に同じ鍵を用いる暗号方式。"}, {"id": 80, "cat": "情報セキュリティ", "term": "公開鍵暗号方式", "def": "暗号化と復号に異なる鍵(公開鍵・秘密鍵)を用いる暗号方式。"}, {"id": 81, "cat": "情報セキュリティ", "term": "ハッシュ関数", "def": "入力データから固定長の値を生成し、改ざん検知などに使う関数。"}, {"id": 82, "cat": "情報セキュリティ", "term": "デジタル署名", "def": "秘密鍵で署名し、改ざん検知と送信者の真正性を確認する技術。"}, {"id": 83, "cat": "情報セキュリティ", "term": "PKI", "def": "公開鍵と所有者を結び付ける証明書の仕組み全体(公開鍵基盤)。"}, {"id": 84, "cat": "情報セキュリティ", "term": "多要素認証", "def": "記憶・所有・生体など異なる種類の要素を組み合わせる認証方式。"}, {"id": 85, "cat": "情報セキュリティ", "term": "シングルサインオン", "def": "一度の認証で複数のシステムを利用できるようにする仕組み。"}, {"id": 86, "cat": "情報セキュリティ", "term": "WAF", "def": "Webアプリケーションへの通信内容を検査し攻撃を遮断する製品。"}, {"id": 87, "cat": "情報セキュリティ", "term": "IDS/IPS", "def": "不正アクセスを検知(IDS)または検知して防御(IPS)する仕組み。"}, {"id": 88, "cat": "情報セキュリティ", "term": "DMZ", "def": "インターネットと内部ネットワークの間に置く緩衝地帯となる区域。"}, {"id": 89, "cat": "情報セキュリティ", "term": "ISMS", "def": "組織の情報セキュリティを継続的に管理・改善する仕組み。"}, {"id": 90, "cat": "情報セキュリティ", "term": "リスクアセスメント", "def": "情報資産に対するリスクを特定・分析・評価するプロセス。"}, {"id": 91, "cat": "情報セキュリティ", "term": "CSIRT", "def": "情報セキュリティインシデントに対応する組織内外のチーム。"}, {"id": 92, "cat": "データベース", "term": "RDB", "def": "表(テーブル)の形式でデータを管理する関係データベース。"}, {"id": 93, "cat": "データベース", "term": "E-R図", "def": "実体(エンティティ)と関連(リレーションシップ)を表現する図。"}, {"id": 94, "cat": "データベース", "term": "主キー", "def": "表の中で各行を一意に識別するための項目。"}, {"id": 95, "cat": "データベース", "term": "外部キー", "def": "他の表の主キーを参照し、表間の関連を表す項目。"}, {"id": 96, "cat": "データベース", "term": "正規化", "def": "データの重複や矛盾を排除するために表を整理する設計手法。"}, {"id": 97, "cat": "データベース", "term": "第3正規形", "def": "推移関数従属も排除された、より整理されたデータ構造の段階。"}, {"id": 98, "cat": "データベース", "term": "トランザクション", "def": "複数の処理をひとまとまりとして扱う、データベースの処理単位。"}, {"id": 99, "cat": "データベース", "term": "ACID特性", "def": "トランザクションが満たすべき、原子性・一貫性・独立性・耐久性の4特性。"}, {"id": 100, "cat": "データベース", "term": "排他制御(ロック)", "def": "複数の処理が同時にデータを更新しないよう制御する仕組み。"}, {"id": 101, "cat": "データベース", "term": "デッドロック", "def": "複数のトランザクションが互いのロック解除を待ち処理が停止する状態。"}, {"id": 102, "cat": "データベース", "term": "インデックス", "def": "検索を高速化するために作成される、データの索引構造。"}, {"id": 103, "cat": "データベース", "term": "SELECT文", "def": "データベースからデータを問い合わせるためのSQL文。"}, {"id": 104, "cat": "データベース", "term": "正規化(第1正規形)", "def": "繰り返し項目を排除し、一つのセルに一つの値だけを持たせる段階。"}, {"id": 105, "cat": "データベース", "term": "OLAP", "def": "蓄積されたデータを多面的に分析するためのオンライン処理。"}, {"id": 106, "cat": "データベース", "term": "データウェアハウス", "def": "分析目的で時系列に整理・統合された大規模なデータの集積。"}, {"id": 107, "cat": "データベース", "term": "NoSQLデータベース", "def": "表形式にとらわれない、柔軟な構造でデータを扱うデータベース。"}, {"id": 108, "cat": "アルゴリズム・プログラミング", "term": "配列", "def": "同じ型のデータを連続した領域に格納するデータ構造。"}, {"id": 109, "cat": "アルゴリズム・プログラミング", "term": "連結リスト", "def": "要素同士がポインタでつながったデータ構造。"}, {"id": 110, "cat": "アルゴリズム・プログラミング", "term": "スタック", "def": "後入れ先出し(LIFO)でデータを出し入れするデータ構造。"}, {"id": 111, "cat": "アルゴリズム・プログラミング", "term": "キュー", "def": "先入れ先出し(FIFO)でデータを出し入れするデータ構造。"}, {"id": 112, "cat": "アルゴリズム・プログラミング", "term": "二分探索木", "def": "左の子が親より小さく右の子が親より大きい規則をもつ木構造。"}, {"id": 113, "cat": "アルゴリズム・プログラミング", "term": "クイックソート", "def": "基準値(ピボット)を用いて分割しながら整列する高速なソート手法。"}, {"id": 114, "cat": "アルゴリズム・プログラミング", "term": "マージソート", "def": "データを分割して整列した後、統合していくソート手法。"}, {"id": 115, "cat": "アルゴリズム・プログラミング", "term": "二分探索法", "def": "整列済みデータの中央値と比較しながら探索範囲を絞り込む探索法。"}, {"id": 116, "cat": "アルゴリズム・プログラミング", "term": "深さ優先探索", "def": "一つの経路を行き止まりまで進んでから戻る探索方法。"}, {"id": 117, "cat": "アルゴリズム・プログラミング", "term": "幅優先探索", "def": "近い階層から順に全体を探索していく探索方法。"}, {"id": 118, "cat": "アルゴリズム・プログラミング", "term": "再帰", "def": "自分自身を呼び出して処理を繰り返すプログラミング手法。"}, {"id": 119, "cat": "アルゴリズム・プログラミング", "term": "分割統治法", "def": "問題を小さな部分問題に分けて解き、結果を統合する設計技法。"}, {"id": 120, "cat": "アルゴリズム・プログラミング", "term": "動的計画法", "def": "部分問題の計算結果を記録し、再利用しながら解く設計技法。"}, {"id": 121, "cat": "アルゴリズム・プログラミング", "term": "ハッシュ表", "def": "キーからハッシュ値を計算し、高速にデータへアクセスする構造。"}, {"id": 122, "cat": "アルゴリズム・プログラミング", "term": "カプセル化", "def": "データと操作をまとめ、内部の実装を外部から隠す考え方。"}, {"id": 123, "cat": "アルゴリズム・プログラミング", "term": "継承", "def": "既存のクラスの特性を引き継いで新しいクラスを定義する仕組み。"}, {"id": 124, "cat": "アルゴリズム・プログラミング", "term": "多相性(ポリモーフィズム)", "def": "同じ呼び出しでも実体に応じて異なる動作をする性質。"}, {"id": 125, "cat": "アルゴリズム・プログラミング", "term": "オーバーロード", "def": "同じ名前のメソッドを引数の型や数で使い分ける仕組み。"}, {"id": 126, "cat": "ソフトウェア・HI", "term": "GUI", "def": "アイコンやウィンドウなど視覚的な部品を用いた操作画面。"}, {"id": 127, "cat": "ソフトウェア・HI", "term": "ユーザビリティ", "def": "使いやすさ、利用者にとっての操作のしやすさを表す指標。"}, {"id": 128, "cat": "ソフトウェア・HI", "term": "アクセシビリティ", "def": "障害の有無などにかかわらず、誰もが利用しやすい度合い。"}, {"id": 129, "cat": "ソフトウェア・HI", "term": "ユニバーサルデザイン", "def": "できるだけ多くの人が快適に利用できることを目指す設計思想。"}, {"id": 130, "cat": "ソフトウェア・HI", "term": "レスポンシブWebデザイン", "def": "画面サイズに応じてレイアウトを自動的に最適化する手法。"}, {"id": 131, "cat": "ソフトウェア・HI", "term": "ヒューリスティック評価", "def": "専門家が経験則に基づいてUIの問題点を洗い出す評価手法。"}, {"id": 132, "cat": "ソフトウェア・HI", "term": "ワイヤーフレーム", "def": "画面のレイアウトや配置を簡易的に示した設計図。"}, {"id": 133, "cat": "ソフトウェア・HI", "term": "ペルソナ", "def": "典型的な利用者像を具体的な人物として設定する設計手法。"}, {"id": 134, "cat": "ソフトウェア・HI", "term": "カスタマージャーニーマップ", "def": "顧客が製品・サービスと接する一連の体験を時系列で可視化した図。"}, {"id": 135, "cat": "ソフトウェア・HI", "term": "JPEG", "def": "写真など自然画像に適した非可逆圧縮の静止画ファイル形式。"}, {"id": 136, "cat": "ソフトウェア・HI", "term": "ストリーミング", "def": "データを受信しながら同時に再生する配信方式。"}, {"id": 137, "cat": "ソフトウェア・HI", "term": "AR(拡張現実)", "def": "現実世界の映像にデジタル情報を重ねて表示する技術。"}, {"id": 138, "cat": "システム開発", "term": "要件定義", "def": "開発するシステムに求められる機能・性能などを明確にする工程。"}, {"id": 139, "cat": "システム開発", "term": "外部設計", "def": "利用者から見える画面や帳票などのインタフェースを設計する工程。"}, {"id": 140, "cat": "システム開発", "term": "内部設計", "def": "プログラムの内部構造やモジュール分割を設計する工程。"}, {"id": 141, "cat": "システム開発", "term": "モジュール分割", "def": "プログラムを機能単位の部品(モジュール)に分ける設計作業。"}, {"id": 142, "cat": "システム開発", "term": "結合度", "def": "モジュール間の依存の強さを表す指標。低いほど独立性が高い。"}, {"id": 143, "cat": "システム開発", "term": "ホワイトボックステスト", "def": "プログラムの内部構造に着目してテストケースを作成する手法。"}, {"id": 144, "cat": "システム開発", "term": "ブラックボックステスト", "def": "入力と出力の関係に着目し、内部構造を意識せずに行うテスト。"}, {"id": 145, "cat": "システム開発", "term": "命令網羅", "def": "プログラム中の全ての命令を最低1回実行するテスト網羅基準。"}, {"id": 146, "cat": "システム開発", "term": "回帰テスト", "def": "プログラムの変更によって既存機能に影響が出ていないかを確認するテスト。"}, {"id": 147, "cat": "システム開発", "term": "リファクタリング", "def": "外部の動作を変えずに内部構造を改善するプログラム修正作業。"}, {"id": 148, "cat": "システム開発", "term": "デザインパターン", "def": "オブジェクト指向設計でよく使われる典型的な設計の型。"}, {"id": 149, "cat": "システム開発", "term": "アジャイル", "def": "短い期間で開発とリリースを繰り返す軽量なソフトウェア開発手法。"}, {"id": 150, "cat": "システム開発", "term": "スクラム", "def": "アジャイル開発の代表的な手法。スプリント単位で開発を進める。"}, {"id": 151, "cat": "システム開発", "term": "スプリント", "def": "スクラムにおける、機能の開発を行う一定期間の作業サイクル。"}, {"id": 152, "cat": "システム開発", "term": "DevOps", "def": "開発チームと運用チームが連携し迅速にリリースを行う考え方。"}, {"id": 153, "cat": "システム開発", "term": "CI/CD", "def": "ビルド・テスト・リリースを自動化し継続的に行う仕組み。"}, {"id": 154, "cat": "システム開発", "term": "ペアプログラミング", "def": "2人1組でコーディングとレビューを同時に行う開発手法。"}, {"id": 155, "cat": "システム開発", "term": "構成管理", "def": "ソフトウェアの構成品目やバージョンを一貫して管理すること。"}, {"id": 156, "cat": "プロジェクトマネジメント", "term": "WBS", "def": "プロジェクトの作業を階層的に分解し明確にした構成図。"}, {"id": 157, "cat": "プロジェクトマネジメント", "term": "ガントチャート", "def": "作業ごとの開始・終了時期を横棒で示すスケジュール表。"}, {"id": 158, "cat": "プロジェクトマネジメント", "term": "アローダイアグラム", "def": "作業の順序関係と所要日数を矢印で表現した図。"}, {"id": 159, "cat": "プロジェクトマネジメント", "term": "クリティカルパス", "def": "プロジェクト全体の最短所要期間を決定する最長の経路。"}, {"id": 160, "cat": "プロジェクトマネジメント", "term": "PERT", "def": "作業の順序や所要時間を分析し日程計画を立てる手法。"}, {"id": 161, "cat": "プロジェクトマネジメント", "term": "ファンクションポイント法", "def": "画面や帳票などの機能量を基に開発規模を見積もる手法。"}, {"id": 162, "cat": "プロジェクトマネジメント", "term": "EVM", "def": "コストと進捗を金額換算して定量的に管理する手法。"}, {"id": 163, "cat": "プロジェクトマネジメント", "term": "スコープ", "def": "プロジェクトで実施すべき作業や成果物の範囲。"}, {"id": 164, "cat": "プロジェクトマネジメント", "term": "ステークホルダ", "def": "プロジェクトに利害関係を持つ人や組織。"}, {"id": 165, "cat": "プロジェクトマネジメント", "term": "リスク登録簿", "def": "洗い出したリスクとその対応策を記録する文書。"}, {"id": 166, "cat": "プロジェクトマネジメント", "term": "三点見積り", "def": "楽観値・悲観値・最頻値の3つから見積りを算出する手法。"}, {"id": 167, "cat": "プロジェクトマネジメント", "term": "マイルストーン", "def": "プロジェクトの進捗を確認する重要な節目となる時点。"}, {"id": 168, "cat": "プロジェクトマネジメント", "term": "PMBOK", "def": "プロジェクトマネジメントの知識を体系化したガイドライン。"}, {"id": 169, "cat": "サービスマネジメント・監査", "term": "SLA", "def": "サービスの品質目標を提供者と顧客の間で合意した文書。"}, {"id": 170, "cat": "サービスマネジメント・監査", "term": "ITIL", "def": "サービスマネジメントの代表的なフレームワーク。"}, {"id": 171, "cat": "サービスマネジメント・監査", "term": "インシデント管理", "def": "発生した障害を迅速に復旧させることを目的とするプロセス。"}, {"id": 172, "cat": "サービスマネジメント・監査", "term": "問題管理", "def": "インシデントの根本原因を分析し再発を防止するプロセス。"}, {"id": 173, "cat": "サービスマネジメント・監査", "term": "変更管理", "def": "サービスへの変更を計画的かつ安全に実施するためのプロセス。"}, {"id": 174, "cat": "サービスマネジメント・監査", "term": "サービスデスク", "def": "利用者からの問合せに対応する単一窓口の機能。"}, {"id": 175, "cat": "サービスマネジメント・監査", "term": "キャパシティ管理", "def": "将来の需要を見越して資源の容量・能力を計画・管理すること。"}, {"id": 176, "cat": "サービスマネジメント・監査", "term": "可用性管理", "def": "サービスが必要なときに利用できる状態を維持するための管理。"}, {"id": 177, "cat": "サービスマネジメント・監査", "term": "RTO", "def": "災害などからの復旧にかかる目標時間(目標復旧時間)。"}, {"id": 178, "cat": "サービスマネジメント・監査", "term": "システム監査", "def": "情報システムのリスク対応状況を独立した立場で検証・評価すること。"}, {"id": 179, "cat": "サービスマネジメント・監査", "term": "内部統制", "def": "健全で効率的な組織運営のために自ら構築・運用する管理の仕組み。"}, {"id": 180, "cat": "サービスマネジメント・監査", "term": "ITガバナンス", "def": "組織のIT活用のあるべき姿を示す戦略と方針の策定・実現の活動。"}, {"id": 181, "cat": "経営・戦略・法務", "term": "SWOT分析", "def": "強み・弱み・機会・脅威の4要素を整理して戦略を検討する手法。"}, {"id": 182, "cat": "経営・戦略・法務", "term": "3C分析", "def": "顧客・競合・自社の3つの視点から市場環境を分析する手法。"}, {"id": 183, "cat": "経営・戦略・法務", "term": "PPM", "def": "製品や事業を市場成長率と占有率で分類し資源配分を検討する手法。"}, {"id": 184, "cat": "経営・戦略・法務", "term": "コアコンピタンス", "def": "競合他社に真似のできない企業の中核的な強み。"}, {"id": 185, "cat": "経営・戦略・法務", "term": "バリューチェーン分析", "def": "事業活動を機能ごとに分解し付加価値の源泉を分析する手法。"}, {"id": 186, "cat": "経営・戦略・法務", "term": "マーケットバスケット分析", "def": "一緒に購入されやすい商品の組み合わせを見つける分析手法。"}, {"id": 187, "cat": "経営・戦略・法務", "term": "ロングテール", "def": "販売機会の少ない商品を多数扱うことで売上を積み上げる考え方。"}, {"id": 188, "cat": "経営・戦略・法務", "term": "KPI", "def": "目標達成度合いを測るための具体的な業績評価指標。"}, {"id": 189, "cat": "経営・戦略・法務", "term": "BSC", "def": "財務・顧客・業務プロセス・学習と成長の視点で戦略を管理する手法。"}, {"id": 190, "cat": "経営・戦略・法務", "term": "ERP", "def": "企業の基幹業務を統合的に管理する情報システムの考え方。"}, {"id": 191, "cat": "経営・戦略・法務", "term": "著作権", "def": "文芸・学術・美術・プログラムなどの創作物を保護する権利。"}, {"id": 192, "cat": "経営・戦略・法務", "term": "職務著作", "def": "従業員が職務上作成した著作物の著作権が法人に帰属する制度。"}, {"id": 193, "cat": "経営・戦略・法務", "term": "特許権", "def": "発明を独占的に実施できる権利。出願・審査を経て取得する。"}, {"id": 194, "cat": "経営・戦略・法務", "term": "個人情報保護法", "def": "個人情報の適正な取扱いに関するルールを定めた法律。"}, {"id": 195, "cat": "経営・戦略・法務", "term": "労働者派遣法", "def": "派遣労働者の権利保護や派遣事業のルールを定めた法律。"}, {"id": 196, "cat": "経営・戦略・法務", "term": "下請法", "def": "発注者と下請事業者との取引の公正化を図るための法律。"}];
const store = {
  loadKnown(){ try{ const v = localStorage.getItem(LS_KNOWN); return v ? JSON.parse(v) : []; }catch(e){ return []; } },
  saveKnown(ids){ try{ localStorage.setItem(LS_KNOWN, JSON.stringify(ids)); }catch(e){} },
  loadLastCat(){ try{ return localStorage.getItem(LS_LASTCAT) || "すべて"; }catch(e){ return "すべて"; } },
  saveLastCat(c){ try{ localStorage.setItem(LS_LASTCAT, c); }catch(e){} },
};

const C = {
  bg:"#0d1117", surface:"#161b22", surface2:"#1c2330", border:"#30363d",
  accent:"#58a6ff", green:"#3fb950", red:"#f85149", warn:"#d29922",
  text:"#e6edf3", muted:"#8b949e",
};

const s = {
  app:{ background:C.bg, minHeight:"100vh", padding:"20px 14px", fontFamily:"'Noto Sans JP',sans-serif", color:C.text },
  container:{ maxWidth:600, margin:"0 auto" },
  header:{ textAlign:"center", marginBottom:20 },
  h1:{ fontFamily:"monospace", fontSize:13, color:C.accent, letterSpacing:".1em", textTransform:"uppercase", marginBottom:4 },
  sub:{ color:C.muted, fontSize:12 },
  row:{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:14 },
  chip:(a)=>({ padding:"5px 12px", background:a?"rgba(88,166,255,.1)":C.surface, border:`1px solid ${a?C.accent:C.border}`, borderRadius:20, color:a?C.accent:C.muted, fontSize:12, cursor:"pointer", fontFamily:"inherit" }),
  progressLine:{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:12, color:C.muted, marginBottom:10, fontFamily:"monospace" },
  progress:{ height:3, background:C.border, borderRadius:2, marginBottom:20, overflow:"hidden" },
  bar:(pct)=>({ height:"100%", background:C.accent, borderRadius:2, width:`${pct}%`, transition:"width .3s" }),
  card:{
    background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"36px 24px",
    minHeight:220, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    textAlign:"center", cursor:"pointer", userSelect:"none", marginBottom:16,
  },
  catTag:{ fontSize:11, padding:"3px 9px", background:"rgba(88,166,255,.1)", color:C.accent, borderRadius:4, fontFamily:"monospace", marginBottom:18 },
  term:{ fontSize:26, fontWeight:700, lineHeight:1.4, marginBottom:6 },
  tapHint:{ fontSize:12, color:C.muted, marginTop:22 },
  defText:{ fontSize:17, lineHeight:1.8, color:C.text },
  btnRow:{ display:"flex", gap:10 },
  btnAgain:{ flex:1, padding:"14px 10px", background:"none", border:`1px solid ${C.red}`, borderRadius:10, color:C.red, fontFamily:"inherit", fontWeight:700, fontSize:15, cursor:"pointer" },
  btnKnown:{ flex:1, padding:"14px 10px", background:C.green, border:`1px solid ${C.green}`, borderRadius:10, color:"#0d1117", fontFamily:"inherit", fontWeight:700, fontSize:15, cursor:"pointer" },
  doneBox:{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"36px 24px", textAlign:"center", marginBottom:16 },
  doneTitle:{ fontSize:19, fontWeight:700, marginBottom:10 },
  doneStat:{ fontSize:14, color:C.muted, marginBottom:20, lineHeight:1.8 },
  btnPrimary:{ padding:"12px 26px", background:C.accent, border:`1px solid ${C.accent}`, borderRadius:8, color:"#0d1117", fontFamily:"inherit", fontWeight:700, fontSize:15, cursor:"pointer" },
  footRow:{ display:"flex", justifyContent:"center", marginTop:24 },
  resetBtn:{ padding:"8px 16px", background:"none", border:`1px solid ${C.border}`, borderRadius:6, color:C.muted, fontFamily:"inherit", fontSize:12, cursor:"pointer" },
  emptyBox:{ padding:30, textAlign:"center", color:C.muted, fontSize:14 },
};

function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }

export default function AppTerms(){
  const [cat, setCat] = useState(()=>store.loadLastCat());
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [known, setKnown] = useState(()=>store.loadKnown());
  const [queue, setQueue] = useState([]);
  const [flipped, setFlipped] = useState(false);
  const [round, setRound] = useState({ seen:0, gotIt:0 });

  const knownSet = useMemo(()=> new Set(known), [known]);

  const pool = useMemo(()=>{
    let list = cat === "すべて" ? TERMS : TERMS.filter(t=>t.cat===cat);
    if(onlyUnknown) list = list.filter(t=>!knownSet.has(t.id));
    return list;
  }, [cat, onlyUnknown, knownSet]);

  const startRound = useCallback((list)=>{
    setQueue(shuffle(list));
    setFlipped(false);
    setRound({ seen:0, gotIt:0 });
  }, []);

  useEffect(()=>{ startRound(pool); }, [cat, onlyUnknown]); // eslint-disable-line

  const current = queue[0];
  const poolKnownCount = useMemo(()=>{
    const base = cat === "すべて" ? TERMS : TERMS.filter(t=>t.cat===cat);
    return base.filter(t=>knownSet.has(t.id)).length;
  }, [cat, knownSet]);
  const poolTotal = (cat === "すべて" ? TERMS : TERMS.filter(t=>t.cat===cat)).length;

  function markKnown(){
    if(!current) return;
    if(!knownSet.has(current.id)){
      const next = [...known, current.id];
      setKnown(next);
      store.saveKnown(next);
    }
    setRound(r=>({ seen:r.seen+1, gotIt:r.gotIt+1 }));
    setQueue(q=>q.slice(1));
    setFlipped(false);
  }

  function markAgain(){
    if(!current) return;
    setRound(r=>({ seen:r.seen+1, gotIt:r.gotIt }));
    setQueue(q=>{
      const rest = q.slice(1);
      const insertAt = Math.min(rest.length, 3);
      const copy = [...rest];
      copy.splice(insertAt, 0, current);
      return copy;
    });
    setFlipped(false);
  }

  function changeCat(c){
    setCat(c);
    store.saveLastCat(c);
  }

  const roundDone = queue.length === 0;

  return (
    <div style={s.app}>
      <div style={s.container}>
        <div style={s.header}>
          <div style={s.h1}>FE 用語フラッシュカード</div>
          <div style={s.sub}>シラバスVer.9.2 用語例より — {TERMS.length}語収録</div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"wrap",marginTop:8}}>
            <a href="/" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>← 科目Aの問題を解く</a>
            <a href="/b" style={{fontSize:12,color:C.accent,textDecoration:"none",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 10px"}}>科目Bの問題を解く →</a>
          </div>
        </div>

        <div style={s.row}>
          {CATS.map(c=>(
            <div key={c} style={s.chip(cat===c)} onClick={()=>changeCat(c)}>{c}</div>
          ))}
        </div>
        <div style={s.row}>
          <div style={s.chip(onlyUnknown)} onClick={()=>setOnlyUnknown(v=>!v)}>
            {onlyUnknown ? "✓ 未習得のみ表示中" : "未習得のみ表示"}
          </div>
        </div>

        <div style={s.progressLine}>
          <span>習得済み {poolKnownCount} / {poolTotal}</span>
          <span>今回 {round.gotIt}/{round.seen}</span>
        </div>
        <div style={s.progress}>
          <div style={s.bar(poolTotal ? (poolKnownCount/poolTotal)*100 : 0)} />
        </div>

        {poolTotal === 0 ? (
          <div style={s.emptyBox}>このカテゴリの用語は全て習得済みです。🎉<br/>「未習得のみ表示」を解除すると全て復習できます。</div>
        ) : roundDone ? (
          <div style={s.doneBox}>
            <div style={s.doneTitle}>🎉 このラウンドは終了です</div>
            <div style={s.doneStat}>
              今回 {round.seen}語中 {round.gotIt}語を「わかった」<br/>
              このカテゴリの習得済み: {poolKnownCount} / {poolTotal}
            </div>
            <button style={s.btnPrimary} onClick={()=>startRound(pool)}>🔄 もう一周する</button>
          </div>
        ) : (
          <>
            <div style={s.card} onClick={()=>setFlipped(f=>!f)}>
              <div style={s.catTag}>{current.cat}</div>
              {!flipped ? (
                <>
                  <div style={s.term}>{current.term}</div>
                  <div style={s.tapHint}>タップして意味を見る</div>
                </>
              ) : (
                <div style={s.defText}>{current.def}</div>
              )}
            </div>
            {flipped ? (
              <div style={s.btnRow}>
                <button style={s.btnAgain} onClick={markAgain}>🔁 もう一度</button>
                <button style={s.btnKnown} onClick={markKnown}>✅ わかった</button>
              </div>
            ) : (
              <div style={{...s.progressLine, justifyContent:"center"}}>残り {queue.length}枚</div>
            )}
          </>
        )}

        <div style={s.footRow}>
          <button
            style={s.resetBtn}
            onClick={()=>{
              if(!window.confirm("習得済みの記録を全てリセットします。よろしいですか？")) return;
              setKnown([]);
              store.saveKnown([]);
            }}
          >
            🗑️ 習得記録をリセット
          </button>
        </div>
      </div>
    </div>
  );
}
