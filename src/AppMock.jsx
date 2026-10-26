import React, { useState, useEffect, useRef, useCallback } from "react";
import QA from "./mock/mockA.json";
import QB from "./mock/mockB.json";
import {
  newAttempt, loadAttempt, saveAttempt, clearAttempt, loadResults, appendResult,
  stepMs, resumeGap, isoWithTz, getStoreError, BREAK_MS,
} from "./mock/mockStore";
import { buildReport, SUBJ_NAME, pct, mmss } from "./mock/mockReport";
import { advance } from "./mock/mockTimeline";

// 本番形式に準拠したオリジナル模擬試験（/mock）。
// 通常学習の出題プール・回答ログ・理解済み判定には一切触れない(このファイルは mock/ 以下だけを使う)。
const QS = { A: QA, B: QB };
const TITLE = "本番形式に準拠したオリジナル模擬試験";

const CSS = `
.mk{--bg:#0d1117;--sf:#161b22;--sf2:#1c2330;--bd:#30363d;--ac:#58a6ff;--gr:#3fb950;--rd:#f85149;--wn:#d29922;--tx:#e6edf3;--mu:#8b949e;
 background:var(--bg);color:var(--tx);min-height:100vh;font-family:'Noto Sans JP','Hiragino Sans','Hiragino Kaku Gothic ProN',sans-serif;font-size:17px;line-height:1.75;-webkit-text-size-adjust:100%}
.mk *{box-sizing:border-box}
.mk-wrap{max-width:920px;margin:0 auto;padding:12px 16px 120px}
.mk h1{font-size:20px;margin:8px 0 4px}.mk h2{font-size:18px;margin:18px 0 8px}
.mk-card{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:16px;margin:12px 0}
.mk-muted{color:var(--mu);font-size:14px}
.mk-btn{appearance:none;border:1px solid var(--ac);background:var(--ac);color:#0d1117;font:inherit;font-size:15px;font-weight:700;border-radius:8px;padding:9px 16px;cursor:pointer;min-height:42px}
.mk-btn.o{background:none;color:var(--ac)}.mk-btn.w{border-color:var(--wn);background:none;color:var(--wn)}.mk-btn.r{border-color:var(--rd);background:none;color:var(--rd)}
.mk-btn:disabled{opacity:.4;cursor:default}
.mk-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mk-top{position:sticky;top:0;z-index:5;background:rgba(13,17,23,.96);border-bottom:1px solid var(--bd);padding:8px 16px}
.mk-top .in{max-width:920px;margin:0 auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
.mk-time{font-variant-numeric:tabular-nums;font-weight:700;font-size:18px}.mk-time.low{color:var(--wn)}.mk-time.crit{color:var(--rd)}
.mk-q p{margin:0 0 10px}
.mk-code{background:#0a0e14;border:1px solid var(--bd);border-radius:8px;padding:12px;margin:10px 0;overflow-x:auto;-webkit-overflow-scrolling:touch}
.mk-code pre{margin:0;font-family:'Noto Sans Mono','Osaka-Mono','MS Gothic','Noto Sans Mono CJK JP',ui-monospace,Menlo,Consolas,monospace;font-size:15px;line-height:1.6;white-space:pre;tab-size:2}
.mk-tw{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:10px 0}
.mk-table{border-collapse:collapse;font-size:15px;min-width:60%}
.mk-table th,.mk-table td{border:1px solid var(--bd);padding:6px 10px;vertical-align:top;text-align:left}
.mk-table th{background:var(--sf2);font-weight:700}
.mk-cap{font-size:14px;color:var(--mu);margin:2px 0 4px}
.mk-fig{background:#fff;color:#111;border-radius:8px;padding:10px;margin:10px 0;overflow-x:auto}
.mk-fig svg{display:block;width:100%;max-width:760px;height:auto;margin:0 auto}
.mk-list{margin:6px 0 10px;padding-left:0;list-style:none}.mk-list li{margin:2px 0}
.mk-choice{display:flex;gap:10px;width:100%;text-align:left;font:inherit;font-size:16px;color:var(--tx);background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;margin:8px 0;cursor:pointer}
.mk-choice.sel{border-color:var(--ac);background:rgba(88,166,255,.14)}
.mk-choice .lb{font-weight:700;flex-shrink:0;width:1.6em}
.mk-ct td.sel,.mk-ct tr.sel td{background:rgba(88,166,255,.14)}
.mk-ct tr{cursor:pointer}
.mk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px}
.mk-cell{font:inherit;font-size:14px;border:1px solid var(--bd);background:var(--sf2);color:var(--tx);border-radius:8px;padding:6px 0;cursor:pointer;position:relative}
.mk-cell.ans{background:rgba(88,166,255,.18);border-color:var(--ac)}.mk-cell.cur{outline:2px solid var(--tx)}
.mk-cell .fl{position:absolute;top:1px;right:4px;color:var(--wn);font-size:11px}
.mk-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:20;display:flex;align-items:flex-start;justify-content:center;padding:40px 12px;overflow:auto}
.mk-modal .box{background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:18px;max-width:640px;width:100%}
.mk-bottom{position:fixed;left:0;right:0;bottom:0;background:rgba(13,17,23,.97);border-top:1px solid var(--bd);padding:10px 16px calc(10px + env(safe-area-inset-bottom))}
.mk-bottom .in{max-width:920px;margin:0 auto;display:flex;gap:8px;justify-content:space-between;flex-wrap:wrap}
.st-ok{color:var(--gr)}.st-ng{color:var(--rd)}.st-na{color:var(--wn)}
.mk-warn{border:1px solid var(--rd);color:var(--rd);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:14px}
.mk-tag{display:inline-block;font-size:12px;border:1px solid var(--bd);border-radius:12px;padding:0 8px;margin:2px 4px 2px 0;color:var(--mu)}
textarea.mk-rep{width:100%;height:220px;background:#0a0e14;color:var(--tx);border:1px solid var(--bd);border-radius:8px;font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:8px}
@media (max-width:600px){.mk{font-size:16px}.mk-code pre{font-size:14px}.mk-table{font-size:14px}}
`;

function Body({ q }) {
  return (
    <div className="mk-q">
      {q.body.map((b, i) => {
        if (b.t === "p") return <p key={i}>{b.text}</p>;
        if (b.t === "code") return <div key={i} className="mk-code"><pre>{b.text}</pre></div>;
        if (b.t === "list") return <ul key={i} className="mk-list">{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>;
        if (b.t === "table") return (
          <div key={i}>
            {b.caption && <div className="mk-cap">{b.caption}</div>}
            <div className="mk-tw"><table className="mk-table"><thead><tr>{b.header.map((h, j) => <th key={j} style={String(h).length <= 10 ? { whiteSpace: "nowrap" } : undefined}>{h}</th>)}</tr></thead>
              <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={String(c).length <= 10 ? { whiteSpace: "nowrap" } : undefined}>{c}</td>)}</tr>)}</tbody></table></div>
          </div>);
        if (b.t === "svg") return (
          <figure key={i} style={{ margin: 0 }}>
            <div className="mk-fig" role="img" aria-label={b.alt || b.caption || "図"} dangerouslySetInnerHTML={{ __html: b.svg }} />
            {b.caption && <div className="mk-cap">{b.caption}</div>}
          </figure>);
        return null;
      })}
    </div>
  );
}

function Choices({ q, value, onPick, disabled }) {
  if (q.choice_header) {
    return (
      <div className="mk-tw"><table className="mk-table mk-ct" role="radiogroup">
        <thead><tr><th>解答群</th>{q.choice_header.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{q.choices.map(c => (
          <tr key={c.label} className={value === c.label ? "sel" : ""} role="radio" aria-checked={value === c.label}
            onClick={() => !disabled && onPick(c.label)}>
            <td><b>{value === c.label ? "● " : "○ "}{c.label}</b></td>{c.cols.map((x, i) => <td key={i}>{x}</td>)}
          </tr>))}</tbody>
      </table></div>);
  }
  return (
    <div role="radiogroup">
      {q.choices.map(c => (
        <button key={c.label} type="button" role="radio" aria-checked={value === c.label}
          className={"mk-choice" + (value === c.label ? " sel" : "")} disabled={disabled} onClick={() => onPick(c.label)}>
          <span className="lb">{c.label}</span><span>{c.text}</span>
        </button>))}
    </div>);
}

function startB(a) { a.phase = "B"; a.sections.B.startedAt = isoWithTz(); }

const curQid = (sub, s) => { const q = QS[sub][s.current]; return q ? q.id : null; };

const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export default function AppMock() {
  const [att, setAtt] = useState(() => {
    const a = loadAttempt();
    if (!a) return null;
    // 再読込み・ブラウザを閉じていた間の時間を、本番と同様に経過時間として加える。
    // 残り時間を超えた分は次の段階（休憩→科目B）に繰り越す。設問別の所要時間には含めない。
    const now = Date.now();
    advance(a, resumeGap(a), now, { offline: true });
    a.lastWall = now;
    return a;
  });
  const [results, setResults] = useState(() => loadResults());
  const [modal, setModal] = useState(null); // "list" | "submit" | "abort" | "skipbreak"
  const [listFilter, setListFilter] = useState("all");
  const [viewId, setViewId] = useState(null);
  const [storeErr, setStoreErr] = useState("");
  const perfRef = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const attRef = useRef(att);
  attRef.current = att;

  const commit = useCallback((a) => {
    // 両科目が終わった受験は結果に追加してから、受験中のデータを消す（追加に失敗したら消さない）
    if (a.phase === "done" && !a._stored && !a.aborted) {
      if (appendResult(JSON.parse(JSON.stringify(a)))) { a._stored = true; setResults(loadResults()); setViewId(a.attemptId); }
      else setStoreErr(getStoreError() + "（結果の保存に失敗したため、受験データは消さずに残しています）");
    }
    if (a.phase === "done" && a._stored) { clearAttempt(); setAtt(null); return; }
    a.lastWall = Date.now();
    const ok = saveAttempt(a);
    setStoreErr(ok ? "" : getStoreError());
    setAtt({ ...a });
  }, []);

  const finishSection = useCallback((a, sub, by) => {
    const s = a.sections[sub];
    if (s.endedAt) return a;
    s.endedAt = isoWithTz(); s.submittedBy = by;
    if (sub === "A") { a.phase = "break"; a.brk.startedAt = isoWithTz(); }
    else { a.phase = "done"; a.finishedAt = isoWithTz(); }
    return a;
  }, []);

  // 1秒ごとの計測
  const tick = useCallback(() => {
    const a = attRef.current;
    const now = performance.now();
    const pd = now - perfRef.current; perfRef.current = now;
    if (!a || !["A", "B", "break"].includes(a.phase)) return;
    const nowWall = Date.now();
    const d = stepMs(pd, nowWall - (a.lastWall || nowWall));
    const events = advance(a, d, nowWall, { qid: curQid });
    if (events.length) setModal(null);
    commit(a);
  }, [commit]);

  // 起動時：再開時の経過時間の反映（自動提出・休憩終了を含む）を保存する
  useEffect(() => {
    const a = attRef.current;
    if (a && a.phase !== "intro") commit(a);
  }, [commit]);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); else { const a = attRef.current; if (a) { a.lastWall = Date.now(); saveAttempt(a); } } };
    const onHide = () => { const a = attRef.current; if (a) { a.lastWall = Date.now(); saveAttempt(a); } };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, [tick]);

  useEffect(() => {
    const inExam = att && ["A", "B", "break"].includes(att.phase);
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    if (inExam) window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [att]);

  const scrollKey = att ? att.phase + ":" + (att.sections[att.phase] ? att.sections[att.phase].current : "") : "";
  useEffect(() => { window.scrollTo(0, 0); }, [scrollKey]);

  const start = () => {
    const a = newAttempt(); a.phase = "A"; a.sections.A.startedAt = isoWithTz();
    perfRef.current = performance.now(); commit(a);
  };
  const pick = (label) => {
    const a = attRef.current; const s = a.sections[a.phase]; const q = QS[a.phase][s.current];
    if (s.answers[q.id] === label) return;
    s.answers[q.id] = label;
    const pq = s.perQ[q.id] || { ms: 0, changes: 0, history: [] };
    if (pq.history.length) pq.changes += 1;
    pq.history.push({ t: Math.round(s.elapsedMs), v: label }); s.perQ[q.id] = pq;
    commit(a);
  };
  const clearAns = () => {
    const a = attRef.current; const s = a.sections[a.phase]; const q = QS[a.phase][s.current];
    if (!s.answers[q.id]) return;
    delete s.answers[q.id];
    const pq = s.perQ[q.id]; pq.changes += 1; pq.history.push({ t: Math.round(s.elapsedMs), v: null });
    commit(a);
  };
  const go = (i) => { const a = attRef.current; const s = a.sections[a.phase]; s.current = Math.max(0, Math.min(QS[a.phase].length - 1, i)); commit(a); };
  const toggleFlag = () => { const a = attRef.current; const s = a.sections[a.phase]; const q = QS[a.phase][s.current]; if (s.flags[q.id]) delete s.flags[q.id]; else s.flags[q.id] = true; commit(a); };
  const submit = () => { const a = attRef.current; finishSection(a, a.phase, "user"); setModal(null); commit(a); };
  const beginB = (skipped) => { const a = attRef.current; a.brk.endedAt = isoWithTz(); a.brk.skipped = skipped && a.brk.elapsedMs < 1000; startB(a); setModal(null); commit(a); };
  const abort = () => {
    const a = attRef.current; a.aborted = true; a.phase = "done"; a.finishedAt = isoWithTz();
    ["A", "B"].forEach(k => { if (a.sections[k].startedAt && !a.sections[k].endedAt) { a.sections[k].endedAt = isoWithTz(); a.sections[k].submittedBy = "abort"; } });
    if (appendResult(JSON.parse(JSON.stringify(a)))) { clearAttempt(); setResults(loadResults()); setViewId(a.attemptId); setAtt(null); }
    else setStoreErr(getStoreError());
    setModal(null);
  };

  const warn = storeErr && <div className="mk-warn">保存の警告：{storeErr}。この画面を閉じずに、空き容量の確保やバックアップを行ってください。</div>;

  // ---------- 結果の表示 ----------
  if (viewId) {
    const a = results.find(r => r.attemptId === viewId);
    if (a) return <Result a={a} onBack={() => { setViewId(null); setAtt(loadAttempt()); }} />;
  }

  // ---------- 開始前 ----------
  if (!att || att.phase === "intro" || att.phase === "done") {
    return (
      <div className="mk"><style>{CSS}</style><div className="mk-wrap">
        <h1>{TITLE}</h1>
        <div className="mk-muted">基本情報技術者試験（FE）の出題形式に準拠して作成したオリジナル問題です。IPAの本試験問題や採点方法を再現したものではありません。</div>
        {warn}
        <div className="mk-card">
          <h2 style={{ marginTop: 0 }}>試験の条件</h2>
          <ul className="mk-list">
            <li>科目A：60問・90分・四肢択一（全問解答）</li>
            <li>休憩：10分以内（取らずに科目Bへ進むこともできます）</li>
            <li>科目B：20問・100分（全問解答）。選択肢の数は問題ごとに異なります</li>
            <li>科目ごとに制限時間を計ります。時間になると自動で提出されます</li>
            <li>解答中は、正誤・正解・解説は表示されません。両科目の提出後にまとめて表示します</li>
            <li>解答と経過時間は操作のたびにこの端末に保存され、再読込みしても続きから再開できます。再読込みしている間も時間は経過します</li>
            <li>この模試の記録は、通常の学習の出題・回答記録・理解済みの判定には反映されません</li>
          </ul>
          <div className="mk-row"><button className="mk-btn" onClick={start}>科目Aを開始する</button></div>
        </div>
        {results.length > 0 && (
          <div className="mk-card">
            <h2 style={{ marginTop: 0 }}>これまでの受験結果</h2>
            {results.slice().reverse().map(r => (
              <div key={r.attemptId} className="mk-row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
                <span>{(r.createdAt || "").replace("T", " ").slice(0, 16)}{r.aborted ? "（中止）" : ""}</span>
                <button className="mk-btn o" onClick={() => setViewId(r.attemptId)}>結果を見る</button>
              </div>))}
          </div>)}
        <div className="mk-muted"><a href="/" style={{ color: "var(--ac)" }}>通常の学習画面へ戻る</a></div>
      </div></div>);
  }

  // ---------- 休憩 ----------
  if (att.phase === "break") {
    const remain = att.brk.limitMs - att.brk.elapsedMs;
    return (
      <div className="mk"><style>{CSS}</style><div className="mk-wrap">
        <h1>休憩</h1>{warn}
        <div className="mk-card">
          <p>科目Aを提出しました。科目Bの開始まで、最大10分間休憩できます。休憩時間が終わると、科目Bが自動で始まります。</p>
          <p className="mk-time" style={{ fontSize: 28 }}>残り {fmtClock(remain)}</p>
          <div className="mk-row"><button className="mk-btn" onClick={() => beginB(true)}>科目Bを開始する</button></div>
        </div>
        <div className="mk-muted">休憩の上限：{BREAK_MS / 60000}分。科目Aの結果は、科目Bの提出後に表示されます。</div>
      </div></div>);
  }

  // ---------- 解答中 ----------
  const sub = att.phase; const sec = att.sections[sub]; const qs = QS[sub];
  const q = qs[sec.current];
  const remain = sec.limitMs - sec.elapsedMs;
  const answered = qs.filter(x => sec.answers[x.id]).length;
  const flaggedN = qs.filter(x => sec.flags[x.id]).length;
  const tcls = remain < 60000 ? "crit" : remain < 600000 ? "low" : "";
  return (
    <div className="mk"><style>{CSS}</style>
      <div className="mk-top"><div className="in">
        <span><b>{SUBJ_NAME[sub]}</b>　問{sec.current + 1}／{qs.length}</span>
        <span className={"mk-time " + tcls} aria-live="off">残り {fmtClock(remain)}</span>
        <span className="mk-row">
          <button className="mk-btn o" onClick={() => setModal("list")}>設問一覧</button>
          <button className="mk-btn" onClick={() => setModal("submit")}>提出</button>
        </span>
      </div></div>
      <div className="mk-wrap">
        {warn}
        <div className="mk-row" style={{ justifyContent: "space-between", margin: "8px 0" }}>
          <span className="mk-muted">解答済み {answered}／{qs.length}　見直し {flaggedN}</span>
          <button className={"mk-btn " + (sec.flags[q.id] ? "w" : "o")} onClick={toggleFlag} aria-pressed={!!sec.flags[q.id]}>
            {sec.flags[q.id] ? "★ 見直しフラグあり" : "☆ 見直しフラグ"}</button>
        </div>
        <div className="mk-card">
          <div className="mk-muted" style={{ marginBottom: 6 }}>問{sec.current + 1}</div>
          <Body q={q} />
        </div>
        <div className="mk-card">
          <div className="mk-muted">解答群</div>
          <Choices q={q} value={sec.answers[q.id]} onPick={pick} />
          <div className="mk-row" style={{ marginTop: 6 }}>
            <button className="mk-btn o" disabled={!sec.answers[q.id]} onClick={clearAns}>解答を消す</button>
          </div>
        </div>
      </div>
      <div className="mk-bottom"><div className="in">
        <button className="mk-btn o" disabled={sec.current === 0} onClick={() => go(sec.current - 1)}>◀ 前へ</button>
        <button className="mk-btn r" onClick={() => setModal("abort")}>中止</button>
        <button className="mk-btn o" disabled={sec.current === qs.length - 1} onClick={() => go(sec.current + 1)}>次へ ▶</button>
      </div></div>

      {modal === "list" && (
        <div className="mk-modal" onClick={() => setModal(null)}><div className="box" onClick={e => e.stopPropagation()}>
          <h2 style={{ marginTop: 0 }}>設問一覧（{SUBJ_NAME[sub]}）</h2>
          <div className="mk-row" style={{ marginBottom: 10 }}>
            {[["all", "すべて"], ["blank", "未回答"], ["flag", "見直し"]].map(([k, l]) =>
              <button key={k} className={"mk-btn " + (listFilter === k ? "" : "o")} onClick={() => setListFilter(k)}>{l}</button>)}
          </div>
          <div className="mk-grid">
            {qs.map((x, i) => {
              if (listFilter === "blank" && sec.answers[x.id]) return null;
              if (listFilter === "flag" && !sec.flags[x.id]) return null;
              return <button key={x.id} className={"mk-cell" + (sec.answers[x.id] ? " ans" : "") + (i === sec.current ? " cur" : "")}
                onClick={() => { go(i); setModal(null); }} aria-label={`問${i + 1}${sec.answers[x.id] ? " 解答済み" : " 未回答"}${sec.flags[x.id] ? " 見直し" : ""}`}>
                {i + 1}{sec.flags[x.id] && <span className="fl">★</span>}</button>;
            })}
          </div>
          <p className="mk-muted">色付き＝解答済み、★＝見直しフラグ。未回答 {qs.length - answered}問。</p>
          <button className="mk-btn o" onClick={() => setModal(null)}>閉じる</button>
        </div></div>)}

      {modal === "submit" && (
        <div className="mk-modal"><div className="box">
          <h2 style={{ marginTop: 0 }}>{SUBJ_NAME[sub]}を提出しますか</h2>
          <p>未回答：<b className={qs.length - answered ? "st-na" : ""}>{qs.length - answered}問</b>　見直しフラグ：{flaggedN}問　残り時間：{fmtClock(remain)}</p>
          <p className="mk-muted">提出すると、{SUBJ_NAME[sub]}の解答は変更できません。{sub === "A" ? "提出後は休憩（最大10分）を経て科目Bに進みます。" : "提出後に両科目の結果を表示します。"}</p>
          <div className="mk-row"><button className="mk-btn" onClick={submit}>提出する</button><button className="mk-btn o" onClick={() => setModal(null)}>解答に戻る</button></div>
        </div></div>)}

      {modal === "abort" && (
        <div className="mk-modal"><div className="box">
          <h2 style={{ marginTop: 0 }}>模擬試験を中止しますか</h2>
          <p>中止すると、ここまでの解答で記録を残して終了し、結果を表示します。未提出の科目は、その時点の解答で打ち切りになります。この操作は取り消せません。</p>
          <div className="mk-row"><button className="mk-btn r" onClick={abort}>中止して終了する</button><button className="mk-btn o" onClick={() => setModal(null)}>解答に戻る</button></div>
        </div></div>)}
    </div>);
}

function Result({ a, onBack }) {
  const { text, S } = buildReport(a, QA, QB);
  const [open, setOpen] = useState({});
  const [copied, setCopied] = useState("");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied("コピーしました"); }
    catch (e) { setCopied("コピーできませんでした。下の欄を長押しして全選択・コピーしてください"); }
  };
  const download = () => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const el = document.createElement("a");
    el.href = url; el.download = a.attemptId + "_report.txt"; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return (
    <div className="mk"><style>{CSS}</style><div className="mk-wrap">
      <h1>模擬試験の結果{a.aborted ? "（中止）" : ""}</h1>
      <div className="mk-muted">{TITLE}／受験開始 {(a.createdAt || "").replace("T", " ").slice(0, 16)}</div>
      <div className="mk-card mk-muted">正答率×1000 は、この模試独自の参考換算値です。IPAのIRT（項目応答理論）による評価点ではなく、600点の合否判定や合格の可能性を示すものではありません。</div>
      {["A", "B"].map(k => {
        const s = S[k]; const sec = a.sections[k];
        return (
          <div key={k} className="mk-card">
            <h2 style={{ marginTop: 0 }}>{SUBJ_NAME[k]}</h2>
            <p><b>正解 {s.correct}／{s.total}</b>（正答率 {pct(s.rate)}・参考換算値 {Math.round(s.rate * 1000)}）　<span className="st-ng">誤答 {s.wrong}</span>　<span className="st-na">未回答 {s.blank}</span></p>
            <p className="mk-muted">所要時間 {mmss(sec.elapsedMs)}／制限 {mmss(sec.limitMs)}　{sec.submittedBy === "timeout" ? "時間切れで自動提出" : sec.submittedBy === "abort" ? "中止で打切り" : sec.submittedBy === "user" ? "本人が提出" : "未受験"}</p>
            <div className="mk-tw"><table className="mk-table"><thead><tr><th>分野</th><th>正解／問題数</th><th>正答率</th></tr></thead>
              <tbody>{Object.entries(s.byCat).map(([c, v]) => <tr key={c}><td>{c}</td><td>{v.ok}／{v.total}</td><td>{pct(v.ok / v.total)}</td></tr>)}</tbody></table></div>
            <h2>設問別</h2>
            {s.rows.map((r, i) => (
              <div key={r.q.id} style={{ borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
                <button className="mk-choice" style={{ margin: 0, background: "none", border: "none", padding: 0 }} onClick={() => setOpen(o => ({ ...o, [r.q.id]: !o[r.q.id] }))} aria-expanded={!!open[r.q.id]}>
                  <span className="lb">{i + 1}</span>
                  <span><b className={r.status === "自力正解" ? "st-ok" : r.status === "誤答" ? "st-ng" : "st-na"}>{r.status}</b>　{r.q.topic}
                    <br /><span className="mk-muted">解答 {r.ans || "－"}／正解 {r.q.correct}　{r.seconds}秒（想定 {r.q.expected_seconds}秒）{r.changes ? `　変更${r.changes}回` : ""}{r.flagged ? "　★見直し" : ""}</span>
                    {r.flags.map(f => <span key={f} className="mk-tag">{f}</span>)}</span>
                </button>
                {open[r.q.id] && (
                  <div className="mk-card">
                    <div><span className="mk-tag">{r.q.field}</span><span className="mk-tag">{r.q.cat}</span><span className="mk-tag">{r.q.skill}</span><span className="mk-tag">難度 {r.q.difficulty}</span></div>
                    <Body q={r.q} />
                    <Choices q={r.q} value={r.ans} onPick={() => {}} disabled />
                    <p><b>正解 {r.q.correct}</b></p>
                    <p>{r.q.explanation}</p>
                  </div>)}
              </div>))}
          </div>);
      })}
      <div className="mk-card">
        <h2 style={{ marginTop: 0 }}>GPT分析用レポート</h2>
        <p className="mk-muted">問題文・全選択肢・本人の解答・正解・解説・所要時間・タグを含むテキストです。個人情報は含みません。誤答は通常の学習には自動登録していません（末尾に候補を一覧にしています）。</p>
        <div className="mk-row"><button className="mk-btn" onClick={copy}>テキストをコピー</button><button className="mk-btn o" onClick={download}>.txt で保存</button><span className="mk-muted">{copied}</span></div>
        <textarea className="mk-rep" readOnly value={text} aria-label="GPT分析用レポート" />
      </div>
      <button className="mk-btn o" onClick={onBack}>模擬試験のトップへ</button>
    </div></div>);
}
