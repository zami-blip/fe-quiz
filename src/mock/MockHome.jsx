import React from 'react';

// 第1回の受験記録・問題データには触れない。第2回の準備が完了するまで選択肢は無効にする。
export default function MockHome({ onFirst }) {
  const hasAttempt = (() => {
    try { return !!localStorage.getItem('fe_mock_v1_attempt'); } catch { return false; }
  })();
  return (
    <main style={{ maxWidth: 680, margin: '32px auto', padding: 20, fontFamily: 'sans-serif', lineHeight: 1.8 }}>
      <h1>基本情報技術者 本番形式模擬試験</h1>
      <section style={{border:'1px solid #bbb',borderRadius:12,padding:20,marginBottom:16}}>
        <h2>第1回</h2>
        {hasAttempt && <p>受験途中の記録があります。続きから再開できます。</p>}
        <button type="button" onClick={onFirst} style={{padding:'12px 20px',cursor:'pointer'}}>第1回を開く</button>
      </section>
      <section style={{border:'1px solid #bbb',borderRadius:12,padding:20}}>
        <h2>第2回</h2>
        <p>問題制作・検証中（未公開）。正解・解説・成績の混在を防ぐため、現在は受験できません。</p>
        <button type="button" disabled style={{padding:'12px 20px'}}>準備中</button>
      </section>
    </main>
  );
}
