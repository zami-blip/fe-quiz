import React, { useState, useEffect, useRef, useCallback } from "react";
import { Body, Choices, MOCK_CSS } from "../QView";
import QA from "./mockA3.json";
import QB from "./mockB3.json";
import {
  newAttempt, loadAttempt, saveAttempt, clearAttempt, loadResults, appendResult, nextAttemptNo, firstResult,
  syncOffline, stepOnline, finish, operate, submitAt, remainingMs, getStoreError, loadPrevManual, savePrevManual, LIMIT_MS,
} from "./mock3Store";
import { buildReport3, round2Summary, compareRows, score, SUBJ, pct, mmss, BY, LIMIT_NOTE } from "./mock3Report";

// 第3回 本番形式準拠オリジナル模擬試験。科目A・科目Bを別々に受験・中断・再開できる。
// 第1回・第2回(fe_mock_v1_*・fe_mock_r2_*)と通常学習のデータには書き込まない(第2回の記録は比較のために読むだけ)。
const QS = { A: QA, B: QB };
const TITLE = "本番形式に準拠したオリジナル模擬試験　第3回";

const CSS = MOCK_CSS;

const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const nowPerf = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const clone = x => JSON.parse(JSON.stringify(x));
export { Body, Choices };

function loadSynced(sub) {
  const a = loadAttempt(sub);
  if (!a) return null;
  syncOffline(a);
  return a;
}

export default function AppMock3({ onBack }) {
  const [att, setAtt] = useState(() => ({ A: loadSynced("A"), B: loadSynced("B") }));
  const [results, setResults] = useState(() => loadResults());
  const [screen, setScreen] = useState({ name: "home" }); // home | exam(sub) | result(id)
  const [modal, setModal] = useState(null);
  const [listFilter, setListFilter] = useState("all");
  const [storeErr, setStoreErr] = useState("");
  const [r2Manual, setR2Manual] = useState(() => loadPrevManual());
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
    // 画面を離れる(非表示・pagehide)ときも、保存時刻を更新する前に未反映の経過を定期更新と同じ処理(tick)で反映する。
    // 期限に達していれば期限の時刻で timeout として結果に保存される。終了済みの受験は tick が飛ばすので、
    // 両イベントが続けて起きても二重に加算・保存しない(結果の保存は attemptId で重複も防ぐ)。
    const save = () => tick();
    const onVis = () => tick();
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

  const r2 = round2Summary(r2Manual);

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
  // 操作の時点までの経過を、定期更新と同じ基準(perfRef・lastWall)で反映するための差分
  const perfStep = () => { const p = nowPerf(); const d = p - perfRef.current; perfRef.current = p; return d; };
  const curQid = a => { const q = QS[a.subject][a.current]; return q ? q.id : null; };
  // 中断：移動前の設問に経過を加えてから戻る。期限に達していれば自動提出として保存する。
  const leave = () => {
    const a = attRef.current[screen.sub];
    if (a && !a.endedAt) { operate(a, perfStep(), Date.now(), curQid(a), () => {}); commit(a); }
    setModal(null); if (!a || !a.endedAt) setScreen({ name: "home" });
  };
  // 回答・取消し・移動・見直しフラグ：操作前に経過を反映し、期限に達していれば変更せずに自動提出を確定する
  const mut = (fn) => {
    const a = attRef.current[screen.sub]; if (!a || a.endedAt) return;
    operate(a, perfStep(), Date.now(), curQid(a), x => fn(x, QS[x.subject][x.current]));
    commit(a);
  };
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
  // 提出・中止は、確認画面で確定した時点で期限を判定する(期限ちょうど・後なら時間切れの自動提出)
  const submit = (by) => {
    const a = attRef.current[screen.sub]; if (!a || a.endedAt) return;
    submitAt(a, perfStep(), Date.now(), curQid(a), by);
    commit(a);
  };

  const warn = storeErr && <div className="m2-warn">保存の警告：{storeErr}。この画面を閉じずに、空き容量の確保やバックアップを行ってください。</div>;

  // ---------------------------------------------------------------- 結果
  if (screen.name === "result") {
    const a = results.find(r => r.attemptId === screen.id);
    if (a) return <Result a={a} results={results} r2={r2} onBack={() => setScreen({ name: "home" })} />;
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
          <span><b>第3回 {SUBJ[sub]}</b>　問{cur.current + 1}／{qs.length}</span>
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

  const r2in = r2Manual || {};
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
          <li>再受験できます。初回の成績は残り、第2回との比較には第3回の初回の成績を使います。</li>
          <li>この模試の記録は、通常の学習の出題・回答記録・理解済みの判定には反映されません。</li>
          <li>バックアップの復元を行うと、模試の記録も復元するファイルの内容に置き換わります（復元前の状態は自動で退避されます）。</li>
        </ul>
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>第2回の成績（比較用）</h2>
        {["A", "B"].map(k => r2 && r2[k] && r2[k].source === "device" && <p key={k} style={{ margin: "0 0 4px" }}>{SUBJ[k]}：この端末の第2回の初回 {r2[k].correct}／{r2[k].total}（{String(r2[k].startedAt || "").slice(0, 10)}{r2[k].aborted ? "・中止" : ""}）</p>)}
        {(!r2 || !r2.A || !r2.B || r2.A.source === "manual" || r2.B.source === "manual") && (<>
          <p className="m2-muted">この端末に第2回の初回の記録がない科目は、正解数を入力すると合計で比較できます（分野別の比較はできません）。</p>
          <div className="m2-row">
            {(!r2 || !r2.A || r2.A.source === "manual") && <label>第2回 科目A <input id="r2a" type="number" min="0" max="60" value={r2in.A ?? ""} onChange={e => { const v = e.target.value === "" ? null : Math.max(0, Math.min(60, +e.target.value)); const n = { ...r2in, A: v }; savePrevManual(n); setR2Manual(n); }} />／60</label>}
            {(!r2 || !r2.B || r2.B.source === "manual") && <label>第2回 科目B <input id="r2b" type="number" min="0" max="20" value={r2in.B ?? ""} onChange={e => { const v = e.target.value === "" ? null : Math.max(0, Math.min(20, +e.target.value)); const n = { ...r2in, B: v }; savePrevManual(n); setR2Manual(n); }} />／20</label>}
          </div>
        </>)}
        <p className="m2-muted">{LIMIT_NOTE}</p>
      </div>
      {results.length > 0 && (
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>第3回の受験記録</h2>
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

function Result({ a, results, r2, onBack }) {
  const qs = QS[a.subject];
  const first = firstResult(results, a.subject);
  const { text, S } = buildReport3(a, qs, r2, first);
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
  const cmp = r2 && r2[a.subject] ? compareRows(a.subject, S, r2) : null;
  const [showCat, setShowCat] = useState(false);
  const F = first && first.attemptId !== a.attemptId ? score(qs, first) : null;
  const rows = S.rows.map((r, i) => ({ ...r, i })).filter(r => filter === "all" || (filter === "ng" ? r.status !== "自力正解" : r.flagged));
  return (
    <div className="m2"><style>{CSS}</style><div className="m2-wrap">
      <h1>第3回 {SUBJ[a.subject]}の結果{a.submittedBy === "abort" ? "（中止）" : ""}</h1>
      <div className="m2-muted">{a.attemptNo}回目{a.attemptNo === 1 ? "（初回）" : "（再受験）"}／開始 {String(a.startedAt || "").replace("T", " ").slice(0, 16)}</div>
      <div className="m2-card">
        <div className="m2-big">正解 {S.correct}／{S.total}</div>
        <p style={{ margin: "4px 0" }}>正答率 {pct(S.rate)}・参考換算値 {Math.round(S.rate * 1000)}　<span className="st-ng">誤答 {S.wrong}</span>　<span className="st-na">未回答 {S.blank}</span></p>
        <p className="m2-muted" style={{ margin: 0 }}>経過 {mmss(a.elapsedMs)}／制限 {mmss(a.limitMs)}　{BY[a.submittedBy] || ""}　中断して再開 {a.resumes || 0}回（閉じていた間の経過 {mmss(a.offlineMs || 0)}）</p>
        <p className="m2-muted">参考換算値（正答率×1000）は、この模試独自の値です。IPAのIRT（項目応答理論）による評価点ではなく、600点の合否判定や合格の可能性を示すものではありません。</p>
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>第2回との比較</h2>
        {cmp ? (<>
          <div className="m2-tw"><table className="m2-table"><thead><tr><th>区分</th><th>第2回（初回）</th><th>第3回{a.attemptNo === 1 ? "（初回）" : `（${a.attemptNo}回目）`}</th><th>差</th></tr></thead>
            <tbody>{cmp.filter(r => showCat || !r.cat).map(r => <tr key={r.label}><td>{r.label}</td><td className="num">{r.r2}</td><td className="num">{r.r3}</td>
              <td className={"num " + (r.diff == null ? "" : r.diff >= 0 ? "st-ok" : "st-ng")}>{r.diff == null ? "－" : `${r.diff >= 0 ? "+" : ""}${(r.diff * 100).toFixed(1)}ポイント`}</td></tr>)}</tbody></table></div>
          <button className="m2-btn o" onClick={() => setShowCat(v => !v)}>{showCat ? "細分類を隠す" : "細分類も表示"}</button>
          <p className="m2-muted">第2回の値は{r2[a.subject].source === "device" ? "この端末の第2回の初回の記録" : "手入力の値"}です。{LIMIT_NOTE}細分類は1～数問のものが多く、1問の正誤で大きく変わります。</p>
        </>) : <p className="m2-muted">第2回の記録がないため比較できません。トップで第2回の正解数を入力すると、合計で比較できます。</p>}
        {F && <p>第3回の初回：{F.correct}／{F.total} → 今回：{S.correct}／{S.total}（同じ問題の再受験のため、問題を覚えた影響を含みます）</p>}
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
                {r.q.explain && <Body q={{ body: r.q.explain }} />}
              </div>)}
          </div>))}
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>GPT分析用テキスト</h2>
        <p className="m2-muted">模試回次・科目・受験回・問題文・全選択肢・本人の解答・正解・解説・所要時間・中断再開の回数・第2回との比較を含みます。個人情報は含みません。誤答は通常の学習には自動登録していません。</p>
        <div className="m2-row"><button className="m2-btn" onClick={copy}>テキストをコピー</button><button className="m2-btn o" onClick={download}>.txt で保存</button><span className="m2-muted">{copied}</span></div>
        <textarea ref={taRef} className="m2-rep" readOnly value={text} aria-label="GPT分析用テキスト" />
      </div>
      <button className="m2-btn o" onClick={onBack}>第3回のトップへ</button>
    </div></div>);
}
