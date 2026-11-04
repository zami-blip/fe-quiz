import React, { useState, useEffect, useRef, useCallback } from "react";
import QA from "./mockA2.json";
import QB from "./mockB2.json";
import {
  newAttempt, loadAttempt, saveAttempt, clearAttempt, loadResults, appendResult, nextAttemptNo, firstResult,
  syncOffline, stepOnline, finish, remainingMs, getStoreError, loadR1Manual, saveR1Manual, LIMIT_MS,
} from "./mock2Store";
import { buildReport2, round1Summary, compareRows, score, SUBJ, pct, mmss, BY } from "./mock2Report";

// 第2回 本番形式準拠オリジナル模擬試験。科目A・科目Bを別々に受験・中断・再開できる。
// 第1回(AppMock.jsx・mockA.json・mockB.json・fe_mock_v1_*)と通常学習のデータには書き込まない。
const QS = { A: QA, B: QB };
const TITLE = "本番形式に準拠したオリジナル模擬試験　第2回";

const CSS = `
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

const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const nowPerf = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const clone = x => JSON.parse(JSON.stringify(x));

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

function loadSynced(sub) {
  const a = loadAttempt(sub);
  if (!a) return null;
  syncOffline(a);
  return a;
}

export default function AppMock2({ onBack }) {
  const [att, setAtt] = useState(() => ({ A: loadSynced("A"), B: loadSynced("B") }));
  const [results, setResults] = useState(() => loadResults());
  const [screen, setScreen] = useState({ name: "home" }); // home | exam(sub) | result(id)
  const [modal, setModal] = useState(null);
  const [listFilter, setListFilter] = useState("all");
  const [storeErr, setStoreErr] = useState("");
  const [r1Manual, setR1Manual] = useState(() => loadR1Manual());
  const perfRef = useRef(nowPerf());
  const attRef = useRef(att); attRef.current = att;
  const screenRef = useRef(screen); screenRef.current = screen;

  // 受験データを保存する。終了した受験は結果に追加してから、受験中のデータを消す(追加に失敗したら消さない)。
  const commit = useCallback((a) => {
    if (a.endedAt) {
      if (appendResult(clone(a))) {
        clearAttempt(a.subject);
        setResults(loadResults());
        setAtt(s => ({ ...s, [a.subject]: null }));
        setStoreErr("");
        if (screenRef.current.name === "exam" && screenRef.current.sub === a.subject) { setModal(null); setScreen({ name: "result", id: a.attemptId }); }
        return;
      }
      setStoreErr(getStoreError() + "（結果の保存に失敗したため、受験データは消さずに残しています）");
    }
    const ok = saveAttempt(a);
    setStoreErr(ok ? "" : getStoreError());
    setAtt(s => ({ ...s, [a.subject]: { ...a } }));
  }, []);

  // 起動時：画面を閉じていた間の経過を反映した状態を保存する(時間切れなら結果に移す)
  useEffect(() => { ["A", "B"].forEach(k => { const a = attRef.current[k]; if (a) commit(a); }); }, [commit]);

  // 1秒ごとの計測。表示中の科目は画面を開いている時間として設問別にも数え、表示していない科目は経過だけを反映する。
  const tick = useCallback(() => {
    const now = Date.now(); const p = nowPerf(); const pd = p - perfRef.current; perfRef.current = p;
    const sc = screenRef.current;
    ["A", "B"].forEach(k => {
      const a = attRef.current[k];
      if (!a || a.endedAt) return;
      if (sc.name === "exam" && sc.sub === k) {
        const q = QS[k][a.current];
        stepOnline(a, pd, now, q ? q.id : null);
      } else syncOffline(a, now);
      commit(a);
    });
  }, [commit]);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    const save = () => ["A", "B"].forEach(k => { const a = attRef.current[k]; if (a && !a.endedAt) { a.lastWall = Date.now(); saveAttempt(a); } });
    const onVis = () => { if (document.visibilityState === "visible") tick(); else save(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", save); };
  }, [tick]);

  const inExam = screen.name === "exam";
  useEffect(() => {
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    if (inExam) window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [inExam]);

  const cur = inExam ? att[screen.sub] : null;
  const scrollKey = screen.name + ":" + (screen.sub || screen.id || "") + ":" + (cur ? cur.current : "");
  useEffect(() => { window.scrollTo(0, 0); }, [scrollKey]);

  const r1 = round1Summary(r1Manual);

  const start = (sub) => {
    const a = newAttempt(sub, nextAttemptNo(loadResults(), sub));
    perfRef.current = nowPerf(); setModal(null);
    commit(a); setScreen({ name: "exam", sub });
  };
  const resume = (sub) => {
    const a = attRef.current[sub]; if (!a) return;
    syncOffline(a); a.resumes = (a.resumes || 0) + 1; perfRef.current = nowPerf();
    commit(a); if (!a.endedAt) setScreen({ name: "exam", sub });
  };
  const leave = () => { const a = attRef.current[screen.sub]; if (a) { a.lastWall = Date.now(); commit(a); } setModal(null); setScreen({ name: "home" }); };
  const mut = (fn) => { const a = attRef.current[screen.sub]; if (!a || a.endedAt) return; fn(a, QS[a.subject][a.current]); commit(a); };
  const pick = (label) => mut((a, q) => {
    if (a.answers[q.id] === label) return;
    a.answers[q.id] = label;
    const pq = a.perQ[q.id] || { ms: 0, changes: 0, history: [] };
    if (pq.history.length) pq.changes += 1;
    pq.history.push({ t: Math.round(a.elapsedMs), v: label }); a.perQ[q.id] = pq;
  });
  const clearAns = () => mut((a, q) => {
    if (!a.answers[q.id]) return;
    delete a.answers[q.id];
    const pq = a.perQ[q.id] || { ms: 0, changes: 0, history: [] }; pq.changes += 1; pq.history.push({ t: Math.round(a.elapsedMs), v: null }); a.perQ[q.id] = pq;
  });
  const go = (i) => mut(a => { a.current = Math.max(0, Math.min(QS[a.subject].length - 1, i)); });
  const toggleFlag = () => mut((a, q) => { if (a.flags[q.id]) delete a.flags[q.id]; else a.flags[q.id] = true; });
  const submit = (by) => { const a = attRef.current[screen.sub]; if (!a) return; finish(a, by); commit(a); };

  const warn = storeErr && <div className="m2-warn">保存の警告：{storeErr}。この画面を閉じずに、空き容量の確保やバックアップを行ってください。</div>;

  // ---------------------------------------------------------------- 結果
  if (screen.name === "result") {
    const a = results.find(r => r.attemptId === screen.id);
    if (a) return <Result a={a} results={results} r1={r1} onBack={() => setScreen({ name: "home" })} />;
  }

  // ---------------------------------------------------------------- 解答中
  if (inExam && cur) {
    const sub = screen.sub; const qs = QS[sub]; const q = qs[cur.current];
    const remain = remainingMs(cur);
    const answered = qs.filter(x => cur.answers[x.id]).length;
    const flaggedN = qs.filter(x => cur.flags[x.id]).length;
    const tcls = remain < 60000 ? "crit" : remain < 600000 ? "low" : "";
    return (
      <div className="m2"><style>{CSS}</style>
        <div className="m2-top"><div className="in">
          <span><b>第2回 {SUBJ[sub]}</b>　問{cur.current + 1}／{qs.length}</span>
          <span className={"m2-time " + tcls} aria-live="off">残り {fmtClock(remain)}</span>
          <span className="m2-row">
            <button className="m2-btn o" onClick={() => setModal("list")}>設問一覧</button>
            <button className="m2-btn" onClick={() => setModal("submit")}>提出</button>
          </span>
        </div></div>
        <div className="m2-wrap">
          {warn}
          <div className="m2-row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
            <span className="m2-muted">解答済み {answered}／{qs.length}　見直し {flaggedN}</span>
            <button className={"m2-btn " + (cur.flags[q.id] ? "w" : "o")} onClick={toggleFlag} aria-pressed={!!cur.flags[q.id]}>
              {cur.flags[q.id] ? "★ 見直しフラグあり" : "☆ 見直しフラグ"}</button>
          </div>
          <div className="m2-card">
            <div className="m2-muted" style={{ marginBottom: 6 }}>問{cur.current + 1}</div>
            <Body q={q} />
          </div>
          <div className="m2-card">
            <div className="m2-muted">解答群</div>
            <Choices q={q} value={cur.answers[q.id]} onPick={pick} />
            <div className="m2-row" style={{ marginTop: 6 }}>
              <button className="m2-btn o" disabled={!cur.answers[q.id]} onClick={clearAns}>解答を消す</button>
            </div>
          </div>
        </div>
        <div className="m2-bottom"><div className="in">
          <button className="m2-btn o" disabled={cur.current === 0} onClick={() => go(cur.current - 1)}>◀ 前へ</button>
          <button className="m2-btn w" onClick={() => setModal("leave")}>中断</button>
          <button className="m2-btn o" disabled={cur.current === qs.length - 1} onClick={() => go(cur.current + 1)}>次へ ▶</button>
        </div></div>

        {modal === "list" && (
          <div className="m2-modal" onClick={() => setModal(null)}><div className="box" role="dialog" aria-label="設問一覧" onClick={e => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>設問一覧（{SUBJ[sub]}）</h2>
            <div className="m2-row" style={{ marginBottom: 10 }}>
              {[["all", "すべて"], ["blank", "未回答"], ["flag", "見直し"]].map(([k, l]) =>
                <button key={k} className={"m2-btn " + (listFilter === k ? "" : "o")} onClick={() => setListFilter(k)}>{l}</button>)}
            </div>
            <div className="m2-grid">
              {qs.map((x, i) => {
                if (listFilter === "blank" && cur.answers[x.id]) return null;
                if (listFilter === "flag" && !cur.flags[x.id]) return null;
                return <button key={x.id} className={"m2-cell" + (cur.answers[x.id] ? " ans" : "") + (i === cur.current ? " cur" : "")}
                  onClick={() => { go(i); setModal(null); }} aria-label={`問${i + 1}${cur.answers[x.id] ? " 解答済み" : " 未回答"}${cur.flags[x.id] ? " 見直し" : ""}`}>
                  {i + 1}{cur.flags[x.id] && <span className="fl">★</span>}</button>;
              })}
            </div>
            <p className="m2-muted">色付き＝解答済み、★＝見直しフラグ。未回答 {qs.length - answered}問。</p>
            <button className="m2-btn o" onClick={() => setModal(null)}>閉じる</button>
          </div></div>)}

        {modal === "submit" && (
          <div className="m2-modal"><div className="box" role="dialog" aria-label="提出の確認">
            <h2 style={{ marginTop: 0 }}>{SUBJ[sub]}を提出しますか</h2>
            <p>未回答：<b className={qs.length - answered ? "st-na" : ""}>{qs.length - answered}問</b>　見直しフラグ：{flaggedN}問　残り時間：{fmtClock(remain)}</p>
            <p className="m2-muted">提出すると解答は変更できません。提出後に、この科目の採点結果と解説を表示します。</p>
            <div className="m2-row"><button className="m2-btn" onClick={() => submit("user")}>提出する</button><button className="m2-btn o" onClick={() => setModal(null)}>解答に戻る</button></div>
          </div></div>)}

        {modal === "leave" && (
          <div className="m2-modal"><div className="box" role="dialog" aria-label="中断の確認">
            <h2 style={{ marginTop: 0 }}>中断してトップに戻りますか</h2>
            <p>解答はこの端末に保存され、あとで続きから再開できます。<b>中断している間も試験時間は経過します。</b>残り時間がなくなると、その時点の解答で自動的に提出されます。</p>
            <p className="m2-muted">今の残り時間：{fmtClock(remain)}</p>
            <div className="m2-row">
              <button className="m2-btn w" onClick={leave}>中断してトップへ</button>
              <button className="m2-btn o" onClick={() => setModal(null)}>解答に戻る</button>
              <button className="m2-btn r" onClick={() => setModal("abort")}>受験を中止する</button>
            </div>
          </div></div>)}

        {modal === "abort" && (
          <div className="m2-modal"><div className="box" role="dialog" aria-label="中止の確認">
            <h2 style={{ marginTop: 0 }}>{SUBJ[sub]}の受験を中止しますか</h2>
            <p>中止すると、ここまでの解答で記録を残して終了し、結果を表示します。この操作は取り消せません。</p>
            <div className="m2-row"><button className="m2-btn r" onClick={() => submit("abort")}>中止して終了する</button><button className="m2-btn o" onClick={() => setModal(null)}>解答に戻る</button></div>
          </div></div>)}
      </div>);
  }

  // ---------------------------------------------------------------- トップ
  const SubjectCard = ({ sub }) => {
    const a = att[sub];
    const mine = results.filter(r => r.subject === sub).sort((x, y) => x.attemptNo - y.attemptNo);
    const first = mine[0];
    const last = mine[mine.length - 1];
    const sc = r => score(QS[sub], r);
    return (
      <div className="m2-card">
        <div className="m2-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>{SUBJ[sub]}</h2>
          {a ? <span className="m2-pill run">受験中</span> : first ? <span className="m2-pill done">受験済み</span> : <span className="m2-pill">未受験</span>}
        </div>
        <p className="m2-muted" style={{ margin: "4px 0 10px" }}>{QS[sub].length}問・{LIMIT_MS[sub] / 60000}分{sub === "A" ? "・四肢択一" : "・選択肢の数は問題ごとに異なる"}</p>
        {a && (<>
          <p style={{ margin: "0 0 8px" }}>{a.attemptNo}回目を受験中。解答済み {QS[sub].filter(x => a.answers[x.id]).length}／{QS[sub].length}<br />
            残り時間 <b className="m2-time">{fmtClock(remainingMs(a))}</b>（中断中も経過しています）</p>
          <button className="m2-btn" onClick={() => resume(sub)}>続きから再開する</button>
        </>)}
        {!a && !first && <button className="m2-btn" onClick={() => setModal("start" + sub)}>{SUBJ[sub]}を開始する</button>}
        {!a && first && (<>
          <p style={{ margin: "0 0 8px" }}>初回：<b>{sc(first).correct}／{QS[sub].length}</b>（{pct(sc(first).rate)}）{first.submittedBy === "abort" ? "（中止）" : ""}
            {last !== first && <><br />最新（{last.attemptNo}回目）：{sc(last).correct}／{QS[sub].length}</>}</p>
          <div className="m2-row">
            <button className="m2-btn o" onClick={() => setScreen({ name: "result", id: first.attemptId })}>初回の結果</button>
            {last !== first && <button className="m2-btn o" onClick={() => setScreen({ name: "result", id: last.attemptId })}>最新の結果</button>}
            <button className="m2-btn w" onClick={() => setModal("retake" + sub)}>再受験する</button>
          </div>
        </>)}
      </div>);
  };

  const r1in = r1Manual || {};
  return (
    <div className="m2"><style>{CSS}</style><div className="m2-wrap">
      <h1>{TITLE}</h1>
      <div className="m2-muted">基本情報技術者試験（FE）の出題形式に準拠して作成したオリジナル問題です。IPAの本試験問題や採点方法を再現したものではありません。</div>
      {warn}
      <div className="m2-subjects" style={{ marginTop: 12 }}>
        {SubjectCard({ sub: "A" })}{SubjectCard({ sub: "B" })}
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>受験のしかた</h2>
        <ul className="m2-list">
          <li>科目A・科目Bは別々に受験できます。どちらを先に受けてもかまいません。</li>
          <li>科目ごとに制限時間を計ります。時間になると、その時点の解答で自動的に提出されます。</li>
          <li>解答は操作のたびにこの端末に保存されます。「中断」でトップに戻ったり、画面を閉じたりしても続きから再開できますが、<b>その間も試験時間は経過します</b>。</li>
          <li>解答中は、正誤・正解・解説を表示しません。提出後に、その科目の結果を表示します。</li>
          <li>再受験できます。初回の成績は残り、第1回との比較には第2回の初回の成績を使います。</li>
          <li>この模試の記録は、通常の学習の出題・回答記録・理解済みの判定には反映されません。</li>
          <li>バックアップの復元を行うと、模試の記録も復元するファイルの内容に置き換わります（復元前の状態は自動で退避されます）。</li>
        </ul>
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>第1回の成績（比較用）</h2>
        {r1 && r1.source === "device" && <p>この端末の第1回の記録（{String(r1.createdAt || "").slice(0, 10)}{r1.aborted ? "・中止" : ""}）：科目A {r1.A.correct}／{r1.A.total}、科目B {r1.B.correct}／{r1.B.total}</p>}
        {(!r1 || r1.source === "manual") && (<>
          <p className="m2-muted">この端末に第1回の受験記録がありません。別の端末で受験した場合は、正解数を入力すると合計で比較できます（分野別の比較はできません）。</p>
          <div className="m2-row">
            <label>科目A <input id="r1a" type="number" min="0" max="60" value={r1in.A ?? ""} onChange={e => { const v = e.target.value === "" ? null : Math.max(0, Math.min(60, +e.target.value)); const n = { ...r1in, A: v }; saveR1Manual(n); setR1Manual(n); }} />／60</label>
            <label>科目B <input id="r1b" type="number" min="0" max="20" value={r1in.B ?? ""} onChange={e => { const v = e.target.value === "" ? null : Math.max(0, Math.min(20, +e.target.value)); const n = { ...r1in, B: v }; saveR1Manual(n); setR1Manual(n); }} />／20</label>
          </div>
        </>)}
      </div>
      {results.length > 0 && (
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>第2回の受験記録</h2>
          {results.slice().reverse().map(r => (
            <div key={r.attemptId} className="m2-row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
              <span>{SUBJ[r.subject]} {r.attemptNo}回目{r.attemptNo === 1 ? "（初回）" : ""}　{String(r.startedAt || "").replace("T", " ").slice(0, 16)}　{score(QS[r.subject], r).correct}／{QS[r.subject].length}{r.submittedBy === "abort" ? "（中止）" : r.submittedBy === "timeout" ? "（時間切れ）" : ""}</span>
              <button className="m2-btn o" onClick={() => setScreen({ name: "result", id: r.attemptId })}>結果を見る</button>
            </div>))}
        </div>)}
      <div className="m2-row m2-muted">
        {onBack && <button className="m2-btn o" onClick={onBack}>模擬試験の選択へ</button>}
        <a href="/" style={{ color: "var(--ac)" }}>通常の学習画面へ戻る</a>
      </div>

      {["A", "B"].map(sub => (modal === "start" + sub || modal === "retake" + sub) && (
        <div key={sub} className="m2-modal"><div className="box" role="dialog" aria-label="開始の確認">
          <h2 style={{ marginTop: 0 }}>{SUBJ[sub]}を{modal.startsWith("retake") ? "再受験" : "開始"}しますか</h2>
          <p>{QS[sub].length}問・制限時間{LIMIT_MS[sub] / 60000}分。開始すると時間の計測が始まり、中断している間も経過します。</p>
          {modal.startsWith("retake") && <p className="m2-muted">再受験しても、初回とこれまでの成績は残ります。同じ問題なので、2回目以降の正答数には問題を覚えた影響が含まれます。</p>}
          <div className="m2-row"><button className="m2-btn" onClick={() => start(sub)}>開始する</button><button className="m2-btn o" onClick={() => setModal(null)}>やめる</button></div>
        </div></div>))}
    </div></div>);
}

function Result({ a, results, r1, onBack }) {
  const qs = QS[a.subject];
  const first = firstResult(results, a.subject);
  const { text, S } = buildReport2(a, qs, r1, first);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("all");
  const [copied, setCopied] = useState("");
  const taRef = useRef(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied("コピーしました"); }
    catch (e) { if (taRef.current) { taRef.current.focus(); taRef.current.select(); } setCopied("自動でコピーできませんでした。下の欄を選択した状態にしたので、コピーしてください"); }
  };
  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const el = document.createElement("a");
    el.href = url; el.download = a.attemptId + "_report.txt"; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const cmp = r1 && r1[a.subject] ? compareRows(a.subject, S, r1) : null;
  const F = first && first.attemptId !== a.attemptId ? score(qs, first) : null;
  const rows = S.rows.map((r, i) => ({ ...r, i })).filter(r => filter === "all" || (filter === "ng" ? r.status !== "自力正解" : r.flagged));
  return (
    <div className="m2"><style>{CSS}</style><div className="m2-wrap">
      <h1>第2回 {SUBJ[a.subject]}の結果{a.submittedBy === "abort" ? "（中止）" : ""}</h1>
      <div className="m2-muted">{a.attemptNo}回目{a.attemptNo === 1 ? "（初回）" : "（再受験）"}／開始 {String(a.startedAt || "").replace("T", " ").slice(0, 16)}</div>
      <div className="m2-card">
        <div className="m2-big">正解 {S.correct}／{S.total}</div>
        <p style={{ margin: "4px 0" }}>正答率 {pct(S.rate)}・参考換算値 {Math.round(S.rate * 1000)}　<span className="st-ng">誤答 {S.wrong}</span>　<span className="st-na">未回答 {S.blank}</span></p>
        <p className="m2-muted" style={{ margin: 0 }}>経過 {mmss(a.elapsedMs)}／制限 {mmss(a.limitMs)}　{BY[a.submittedBy] || ""}　中断して再開 {a.resumes || 0}回（閉じていた間の経過 {mmss(a.offlineMs || 0)}）</p>
        <p className="m2-muted">参考換算値（正答率×1000）は、この模試独自の値です。IPAのIRT（項目応答理論）による評価点ではなく、600点の合否判定や合格の可能性を示すものではありません。</p>
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>第1回との比較</h2>
        {cmp ? (<>
          <div className="m2-tw"><table className="m2-table"><thead><tr><th>区分</th><th>第1回</th><th>第2回{a.attemptNo === 1 ? "（初回）" : `（${a.attemptNo}回目）`}</th><th>差</th></tr></thead>
            <tbody>{cmp.map(r => <tr key={r.label}><td>{r.label}</td><td className="num">{r.r1}</td><td className="num">{r.r2}</td>
              <td className={"num " + (r.diff == null ? "" : r.diff >= 0 ? "st-ok" : "st-ng")}>{r.diff == null ? "－" : `${r.diff >= 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}ポイント`}</td></tr>)}</tbody></table></div>
          <p className="m2-muted">第1回の値は{r1.source === "device" ? "この端末の第1回の受験記録" : "手入力の値"}です。第1回と第2回は別の問題なので、差は目安です。</p>
        </>) : <p className="m2-muted">第1回の記録がないため比較できません。トップで第1回の正解数を入力すると、合計で比較できます。</p>}
        {F && <p>第2回の初回：{F.correct}／{F.total} → 今回：{S.correct}／{S.total}（同じ問題の再受験のため、問題を覚えた影響を含みます）</p>}
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>分野別</h2>
        <div className="m2-tw"><table className="m2-table"><thead><tr><th>分野／小分類</th><th>正解／問題数</th><th>正答率</th></tr></thead>
          <tbody>{Object.entries(S.byCat).map(([c, v]) => <tr key={c}><td>{c}</td><td className="num">{v.ok}／{v.total}</td><td className="num">{pct(v.ok / v.total)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>設問別の結果と解説</h2>
        <div className="m2-row" style={{ marginBottom: 8 }}>
          {[["all", "すべて"], ["ng", "誤答・未回答"], ["flag", "見直しフラグ"]].map(([k, l]) =>
            <button key={k} className={"m2-btn " + (filter === k ? "" : "o")} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        {rows.map(r => (
          <div key={r.q.id} style={{ borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
            <button className="m2-choice" style={{ margin: 0, background: "none", border: "none", padding: 0 }} onClick={() => setOpen(o => ({ ...o, [r.q.id]: !o[r.q.id] }))} aria-expanded={!!open[r.q.id]}>
              <span className="lb">{r.i + 1}</span>
              <span><b className={r.status === "自力正解" ? "st-ok" : r.status === "誤答" ? "st-ng" : "st-na"}>{r.status}</b>　{r.q.topic}
                <br /><span className="m2-muted">解答 {r.ans || "－"}／正解 {r.q.correct}　{r.seconds}秒（想定 {r.q.expected_seconds}秒）{r.changes ? `　変更${r.changes}回` : ""}{r.flagged ? "　★見直し" : ""}</span>
                {r.tflags.map(f => <span key={f} className="m2-tag">{f}</span>)}</span>
            </button>
            {open[r.q.id] && (
              <div className="m2-card">
                <div><span className="m2-tag">{r.q.id}</span><span className="m2-tag">{r.q.field}</span><span className="m2-tag">{r.q.cat}</span><span className="m2-tag">{r.q.skill}</span><span className="m2-tag">難度 {r.q.difficulty}</span></div>
                <Body q={r.q} />
                <Choices q={r.q} value={r.ans} onPick={() => {}} disabled showCorrect />
                <p><b>正解 {r.q.correct}</b>　あなたの解答 {r.ans || "未回答"}</p>
                <p style={{ whiteSpace: "pre-wrap" }}>{r.q.explanation}</p>
              </div>)}
          </div>))}
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>GPT分析用テキスト</h2>
        <p className="m2-muted">模試回次・科目・受験回・問題文・全選択肢・本人の解答・正解・解説・所要時間・中断再開の回数・第1回との比較を含みます。個人情報は含みません。誤答は通常の学習には自動登録していません。</p>
        <div className="m2-row"><button className="m2-btn" onClick={copy}>テキストをコピー</button><button className="m2-btn o" onClick={download}>.txt で保存</button><span className="m2-muted">{copied}</span></div>
        <textarea ref={taRef} className="m2-rep" readOnly value={text} aria-label="GPT分析用テキスト" />
      </div>
      <button className="m2-btn o" onClick={onBack}>第2回のトップへ</button>
    </div></div>);
}
