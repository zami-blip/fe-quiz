import React from 'react';

// 第1回の受験記録・問題データには触れない(読み取りだけ)。第2回は科目ごとの受験途中の有無を表示する。
function has(key) {
  try { return !!localStorage.getItem(key); } catch { return false; }
}

export default function MockHome({ onFirst, onSecond, onThird }) {
  const hasAttempt = has('fe_mock_v1_attempt');
  const r2A = has('fe_mock_r2_attempt_A');
  const r2B = has('fe_mock_r2_attempt_B');
  const r2Done = has('fe_mock_r2_results');
  const r2Label = [r2A && '科目A', r2B && '科目B'].filter(Boolean).join('・');
  const r3A = has('fe_mock_r3_attempt_A');
  const r3B = has('fe_mock_r3_attempt_B');
  const r3Done = has('fe_mock_r3_results');
  const r3Label = [r3A && '科目A', r3B && '科目B'].filter(Boolean).join('・');
  return (
    <main style={{ maxWidth: 680, margin: '32px auto', padding: 20, fontFamily: 'sans-serif', lineHeight: 1.8 }}>
      <h1>基本情報技術者 本番形式模擬試験</h1>
      <p><a href="/daily">今日の学習（短いセット）はこちら</a></p>
      <section style={{border:'1px solid #bbb',borderRadius:12,padding:20,marginBottom:16}}>
        <h2>第1回</h2>
        {hasAttempt && <p>受験途中の記録があります。続きから再開できます。</p>}
        <button type="button" onClick={onFirst} style={{padding:'12px 20px',cursor:'pointer'}}>第1回を開く</button>
      </section>
      <section style={{border:'1px solid #bbb',borderRadius:12,padding:20}}>
        <h2>第2回</h2>
        <p>科目A（60問・90分）と科目B（20問・100分）を、別々に受験できます。</p>
        {r2Label && <p>{r2Label}の受験途中の記録があります。続きから再開できます（中断中も時間は経過しています）。</p>}
        {!r2Label && r2Done && <p>受験済みの記録があります。結果の確認と再受験ができます。</p>}
        <button type="button" onClick={onSecond} style={{padding:'12px 20px',cursor:'pointer'}}>第2回を開く</button>
      </section>
      <section style={{border:'1px solid #bbb',borderRadius:12,padding:20,marginTop:16}}>
        <h2>第3回</h2>
        <p>科目A（60問・90分）と科目B（20問・100分）を、別々に受験できます。</p>
        {r3Label && <p>{r3Label}の受験途中の記録があります。続きから再開できます（中断中も時間は経過しています）。</p>}
        {!r3Label && r3Done && <p>受験済みの記録があります。結果の確認と再受験ができます。</p>}
        <button type="button" onClick={onThird} style={{padding:'12px 20px',cursor:'pointer'}}>第3回を開く</button>
      </section>
    </main>
  );
}
