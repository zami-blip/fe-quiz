import React from "react";

// 模試（第3回）と「今日の学習」で共用する、問題文・解答群の表示とスタイル。
// 第3回模試の AppMock3.jsx から表示部分だけを取り出したもの（表示内容は変更していない）。
export const MOCK_CSS = `
.m2{--bg:#0d1117;--sf:#161b22;--sf2:#1c2330;--bd:#30363d;--ac:#58a6ff;--gr:#3fb950;--rd:#f85149;--wn:#d29922;--tx:#e6edf3;--mu:#8b949e;
 background:var(--bg);color:var(--tx);min-height:100vh;font-family:'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif;font-size:17px;line-height:1.75;-webkit-text-size-adjust:100%}
.m2 *{box-sizing:border-box}
.m2-wrap{max-width:920px;margin:0 auto;padding:12px 16px 120px}
.m2 h1{font-size:20px;margin:8px 0 4px}.m2 h2{font-size:18px;margin:18px 0 8px}.m2 h3{font-size:16px;margin:12px 0 6px}
.m2-card{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:16px;margin:12px 0}
.m2-muted{color:var(--mu);font-size:14px}
.m2-btn{appearance:none;border:1px solid var(--ac);background:var(--ac);color:#0d1117;font:inherit;font-size:15px;font-weight:700;border-radius:8px;padding:9px 16px;cursor:pointer;min-height:42px}
.m2-btn.o{background:none;color:var(--ac)}.m2-btn.w{border-color:var(--wn);background:none;color:var(--wn)}.m2-btn.r{border-color:var(--rd);background:none;color:var(--rd)}
.m2-btn:disabled{opacity:.4;cursor:default}
.m2-btn:focus-visible,.m2-choice:focus-visible,.m2-cell:focus-visible{outline:2px solid var(--tx);outline-offset:2px}
.m2-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.m2-subjects{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
.m2-subjects .m2-card{margin:0}
.m2-top{position:sticky;top:0;z-index:5;background:rgba(13,17,23,.96);border-bottom:1px solid var(--bd);padding:8px 16px}
.m2-top .in{max-width:920px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.m2-time{font-variant-numeric:tabular-nums;font-weight:700;font-size:18px}.m2-time.low{color:var(--wn)}.m2-time.crit{color:var(--rd)}
.m2-q p{margin:0 0 10px}
.m2-code{background:#0a0e14;border:1px solid var(--bd);border-radius:8px;padding:12px;margin:10px 0;overflow-x:auto;-webkit-overflow-scrolling:touch}
.m2-code pre{margin:0;font-family:'Noto Sans Mono','Osaka-Mono','MS Gothic','Noto Sans Mono CJK JP',ui-monospace,Menlo,Consolas,monospace;font-size:15px;line-height:1.6;white-space:pre;tab-size:2}
.m2-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0}
.m2-table{border-collapse:collapse;font-size:15px;min-width:60%}
.m2-table th,.m2-table td{border:1px solid var(--bd);padding:6px 10px;vertical-align:top;text-align:left}
.m2-table th{background:var(--sf2);font-weight:700}
.m2-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.m2-cap{font-size:14px;color:var(--mu);margin:2px 0 4px}
.m2-fig{background:#fff;color:#111;border-radius:8px;padding:10px;margin:10px 0;overflow-x:auto}
.m2-fig svg{display:block;width:100%;max-width:640px;height:auto;margin:0 auto}
.m2-list{margin:6px 0 10px;padding-left:0;list-style:none}.m2-list li{margin:2px 0}
.m2-choice{display:flex;gap:10px;width:100%;text-align:left;font:inherit;font-size:16px;color:var(--tx);background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin:8px 0;cursor:pointer}
.m2-choice.sel{border-color:var(--ac);background:rgba(88,166,255,.14)}
.m2-choice.ok{border-color:var(--gr)}
.m2-choice .lb{font-weight:700;flex-shrink:0;width:1.6em}
.m2-ct tr.sel td{background:rgba(88,166,255,.14)}
.m2-ct tr.ok td:first-child{color:var(--gr)}
.m2-ct tr{cursor:pointer}
.m2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px}
.m2-cell{font:inherit;font-size:14px;border:1px solid var(--bd);background:var(--sf2);color:var(--tx);border-radius:8px;padding:6px 0;cursor:pointer;position:relative}
.m2-cell.ans{background:rgba(88,166,255,.18);border-color:var(--ac)}.m2-cell.cur{outline:2px solid var(--tx)}
.m2-cell .fl{position:absolute;top:1px;right:4px;color:var(--wn);font-size:11px}
.m2-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:20;display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto}
.m2-modal .box{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:18px;max-width:640px;width:100%}
.m2-bottom{position:fixed;left:0;right:0;bottom:0;background:rgba(13,17,23,.97);border-top:1px solid var(--bd);padding:10px 16px calc(10px + env(safe-area-inset-bottom))}
.m2-bottom .in{max-width:920px;margin:0 auto;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap}
.st-ok{color:var(--gr)}.st-ng{color:var(--rd)}.st-na{color:var(--wn)}
.m2-warn{border:1px solid var(--rd);color:var(--rd);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:14px}
.m2-tag{display:inline-block;font-size:12px;border:1px solid var(--bd);border-radius:12px;padding:0 8px;margin:2px 4px 2px 0;color:var(--mu)}
.m2-big{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}
.m2-pill{display:inline-block;font-size:13px;border-radius:12px;padding:1px 10px;border:1px solid var(--bd)}
.m2-pill.run{border-color:var(--wn);color:var(--wn)}.m2-pill.done{border-color:var(--gr);color:var(--gr)}
textarea.m2-rep{width:100%;height:220px;background:#0a0e14;color:var(--tx);border:1px solid var(--bd);border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:8px}
.m2 input[type=number]{width:5em;font:inherit;background:#0a0e14;color:var(--tx);border:1px solid var(--bd);border-radius:6px;padding:4px 6px}
@media (max-width:600px){.m2{font-size:16px}.m2-code pre{font-size:14px}.m2-table{font-size:14px}}
@media (min-width:700px) and (max-width:1100px){.m2-wrap{padding-left:24px;padding-right:24px}}
`;

export function Body({ q }) {
  return (
    <div className="m2-q">
      {q.body.map((b, i) => {
        if (b.t === "p") return <p key={i}>{b.text}</p>;
        if (b.t === "code") return <div key={i} className="m2-code"><pre>{b.text}</pre></div>;
        if (b.t === "list") return <ul key={i} className="m2-list">{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
        if (b.t === "table") return (
          <div key={i}>
            {b.caption && <div className="m2-cap">{b.caption}</div>}
            <div className="m2-tw"><table className="m2-table"><thead><tr>{b.header.map((h, j) => <th key={j} style={String(h).length <= 10 ? { whiteSpace: "nowrap" } : undefined}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={String(c).length <= 12 ? { whiteSpace: "nowrap" } : undefined}>{c}</td>)}</tr>)}</tbody></table></div>
          </div>);
        if (b.t === "svg") return (
          <figure key={i} style={{ margin: 0 }}>
            <div className="m2-fig" role="img" aria-label={(b.figure_text || []).join(" ") || b.caption} dangerouslySetInnerHTML={{ __html: b.svg }} />
            {b.caption && <div className="m2-cap">{b.caption}</div>}
          </figure>);
        return null;
      })}
    </div>);
}

export function Choices({ q, value, onPick, disabled, showCorrect }) {
  if (q.choice_header) {
    return (
      <div className="m2-tw"><table className="m2-table m2-ct" role="radiogroup" aria-label="解答群">
        <thead><tr><th>解答群</th>{q.choice_header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{q.choices.map(c => (
          <tr key={c.label} className={(value === c.label ? "sel " : "") + (showCorrect && q.correct === c.label ? "ok" : "")} role="radio" aria-checked={value === c.label}
            tabIndex={disabled ? -1 : 0} onClick={() => !disabled && onPick(c.label)}
            onKeyDown={e => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(c.label); } }}>
            <td><b>{value === c.label ? "● " : "○ "}{c.label}{showCorrect && q.correct === c.label ? "（正解）" : ""}</b></td>{c.cols.map((x, i) => <td key={i}>{x}</td>)}
          </tr>))}</tbody>
      </table></div>);
  }
  return (
    <div role="radiogroup" aria-label="解答群">
      {q.choices.map(c => (
        <button key={c.label} type="button" role="radio" aria-checked={value === c.label}
          className={"m2-choice" + (value === c.label ? " sel" : "") + (showCorrect && q.correct === c.label ? " ok" : "")} disabled={disabled} onClick={() => onPick(c.label)}>
          <span className="lb">{c.label}</span><span>{c.text}{showCorrect && q.correct === c.label ? "（正解）" : ""}</span>
        </button>))}
    </div>);
}

