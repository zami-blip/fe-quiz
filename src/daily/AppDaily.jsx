import React, { useState, useEffect, useRef, useCallback } from "react";
import { Body, Choices, MOCK_CSS } from "../mock/QView";
import { PLANS, planOf, findSet } from "./plans";
import {
  jstDate, addDays, dateLabel, loadResults, loadAllAttempts, saveAttempt, clearAttempt, appendResult, loadNotes, saveNotes,
  newAttempt, nextAttemptNo, setResults, syncHidden, stepOnline, operate, goTo, markVisit, pick, clearAnswer, toggleFlag,
  submitAt, remainingMs, getStoreError, judgeSet, defaultPriority, setStatus, REASONS, STATUS, ONLINE_CAP_MS,
} from "./dailyStore";
import { buildDayReport, buildAttemptReport, BY, mmss, secText } from "./dailyReport";

// 「今日の学習」：日付ごとの学習目標と短いセット。模試（/mock）と通常学習のデータには書き込まない。
const CSS = MOCK_CSS + `
.dl-dates{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.dl-date{font:inherit;font-size:14px;border:1px solid var(--bd);background:var(--sf2);color:var(--tx);border-radius:16px;padding:4px 12px;cursor:pointer;min-height:36px}
.dl-date.sel{border-color:var(--ac);background:rgba(88,166,255,.18)}
.dl-date .s{color:var(--mu);font-size:12px;margin-left:4px}
.dl-strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
.dl-strip .m2-cell{min-width:52px;min-height:42px}
.dl-goal{border-left:4px solid var(--ac);padding:4px 12px;margin:8px 0}
.dl-reasons{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.dl-reasons button{font:inherit;font-size:14px;border:1px solid var(--bd);background:var(--sf2);color:var(--tx);border-radius:16px;padding:4px 12px;cursor:pointer;min-height:36px}
.dl-reasons button.sel{border-color:var(--wn);color:var(--wn)}
textarea.dl-memo{width:100%;height:64px;background:#0a0e14;color:var(--tx);border:1px solid var(--bd);border-radius:8px;font:inherit;font-size:15px;padding:8px}
`;

const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const clone = x => JSON.parse(JSON.stringify(x));
const limitText = sec => (sec % 60 ? `${Math.floor(sec / 60)}分${sec % 60}秒` : `${sec / 60}分`);
const SUBJ = { A: "科目A", B: "科目B" };

const qOf = a => { const f = findSet(a.setId); return f ? f.set.questions[a.current] : null; };

function initialAttempts() {
  const all = loadAllAttempts(); const now = Date.now();
  Object.values(all).forEach(a => { if (!a.endedAt) syncHidden(a, now); });
  return all;
}
function initialDate() {
  try { const d = new URLSearchParams(window.location.search).get("date"); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d; } catch (e) {}
  return jstDate();
}

function useCopy(text) {
  const [msg, setMsg] = useState(""); const ref = useRef(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setMsg("コピーしました"); }
    catch (e) { if (ref.current) { ref.current.focus(); ref.current.select(); } setMsg("自動でコピーできませんでした。下の欄を選択した状態にしたので、コピーしてください"); }
  };
  const save = name => {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const el = document.createElement("a");
    el.href = url; el.download = name; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return { msg, ref, copy, save };
}

function ReportBox({ text, file, note }) {
  const c = useCopy(text);
  return (<>
    <p className="m2-muted">{note}</p>
    <div className="m2-row"><button className="m2-btn" onClick={c.copy}>テキストをコピー</button><button className="m2-btn o" onClick={() => c.save(file)}>.txt で保存</button><span className="m2-muted">{c.msg}</span></div>
    <textarea ref={c.ref} className="m2-rep" readOnly value={text} aria-label="GPT分析用テキスト" />
  </>);
}

export default function AppDaily() {
  const [date, setDate] = useState(initialDate);
  const [att, setAtt] = useState(initialAttempts);
  const [results, setResultsState] = useState(() => loadResults());
  const [notes, setNotesState] = useState(() => loadNotes());
  const [screen, setScreen] = useState({ name: "day" }); // day | intro(setId) | exam(setId) | result(attemptId)
  const [modal, setModal] = useState(null);
  const [storeErr, setStoreErr] = useState("");
  const [openQ, setOpenQ] = useState({});
  const attRef = useRef(att); attRef.current = att;
  const screenRef = useRef(screen); screenRef.current = screen;
  const notesRef = useRef(notes); notesRef.current = notes;
  const openRef = useRef(openQ); openRef.current = openQ;
  const visibleRef = useRef(typeof document === "undefined" ? true : !document.hidden);
  const reviewWall = useRef(Date.now());
  const submitting = useRef(false);

  const updateNotes = useCallback(fn => {
    const n = clone(notesRef.current); fn(n); notesRef.current = n; setNotesState(n);
    if (!saveNotes(n)) setStoreErr(getStoreError());
  }, []);

  // 受験データを保存する。終了した受験は結果に追加してから受験中のデータを消す（追加に失敗したら消さずに残す）。
  const commit = useCallback(a => {
    if (a.endedAt) {
      if (appendResult(clone(a))) {
        clearAttempt(a.setId);
        setResultsState(loadResults());
        setAtt(s => { const n = { ...s }; delete n[a.setId]; return n; });
        setStoreErr("");
        const sc = screenRef.current;
        if (sc.name === "exam" && sc.setId === a.setId) { setModal(null); setOpenQ({}); setScreen({ name: "result", attemptId: a.attemptId }); }
        return true;
      }
      setStoreErr(getStoreError() + "（結果の保存に失敗しました。解答はこの画面に保持しています。「保存を再試行」を押してください）");
      saveAttempt(a);
      setAtt(s => ({ ...s, [a.setId]: { ...a } }));
      return false;
    }
    const ok = saveAttempt(a);
    setStoreErr(ok ? "" : getStoreError());
    setAtt(s => ({ ...s, [a.setId]: { ...a } }));
    return ok;
  }, []);

  const retrySave = () => { Object.values(attRef.current).forEach(a => commit(a)); };

  // 起動時：閉じていた間の経過を反映（期限を過ぎていれば期限の時刻で提出）し、保存待ちの結果を保存する
  useEffect(() => { Object.values(attRef.current).forEach(a => commit(a)); }, [commit]);

  // 1秒ごとの計測。受験画面で表示中の設問だけに設問別の時間を加え、それ以外は表示していなかった時間とする。
  const tick = useCallback(() => {
    const now = Date.now(); const sc = screenRef.current;
    Object.values(attRef.current).forEach(a => {
      if (!a || a.endedAt) return;
      const q = qOf(a);
      if (visibleRef.current && sc.name === "exam" && sc.setId === a.setId && q) stepOnline(a, now, q.id);
      else syncHidden(a, now);
      commit(a);
    });
    // 提出後の解説を開いている時間（受験時間とは別に記録）
    const d = Math.min(Math.max(0, now - reviewWall.current), ONLINE_CAP_MS); reviewWall.current = now;
    const open = Object.keys(openRef.current).filter(k => openRef.current[k]);
    if (visibleRef.current && sc.name === "result" && open.length && d > 0) {
      updateNotes(n => { const e = n[sc.attemptId] = n[sc.attemptId] || {}; e.reviewMs = e.reviewMs || {}; open.forEach(q => { e.reviewMs[q] = (e.reviewMs[q] || 0) + d; }); });
    }
  }, [commit, updateNotes]);

  useEffect(() => {
    const id = setInterval(tick, 1000);
    // 表示状態が変わったら、変わる前の状態で今までの経過を反映してから切り替える（二重に数えない）
    const onVis = () => { tick(); visibleRef.current = !document.hidden; reviewWall.current = Date.now(); };
    const onHide = () => tick();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", onHide); };
  }, [tick]);

  const inExam = screen.name === "exam";
  useEffect(() => {
    const h = e => { e.preventDefault(); e.returnValue = ""; };
    if (inExam) window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [inExam]);

  const cur = inExam ? att[screen.setId] : null;
  const scrollKey = screen.name + ":" + (screen.setId || screen.attemptId || "") + ":" + (cur ? cur.current : "");
  useEffect(() => { window.scrollTo(0, 0); }, [scrollKey]);

  const warn = storeErr && (
    <div className="m2-warn">保存の警告：{storeErr}
      <div className="m2-row" style={{ marginTop: 6 }}><button className="m2-btn r" onClick={retrySave}>保存を再試行</button></div>
    </div>);

  // ---------------------------------------------------------------- 操作
  const start = setId => {
    const f = findSet(setId); if (!f) return;
    const a = newAttempt(f.plan, f.set, nextAttemptNo(loadResults(), setId));
    submitting.current = false; setModal(null);
    commit(a); setScreen({ name: "exam", setId });
  };
  const resume = setId => {
    const a = attRef.current[setId]; if (!a) return;
    syncHidden(a, Date.now()); a.resumes = (a.resumes || 0) + 1; submitting.current = false;
    commit(a); if (!a.endedAt) setScreen({ name: "exam", setId });
  };
  const mut = fn => {
    const a = attRef.current[screen.setId]; if (!a || a.endedAt) return;
    const q = qOf(a);
    operate(a, Date.now(), q ? q.id : null, x => fn(x, qOf(x)));
    commit(a);
  };
  const leave = () => {
    const a = attRef.current[screen.setId];
    if (a && !a.endedAt) { const q = qOf(a); operate(a, Date.now(), q ? q.id : null, () => {}); commit(a); }
    setModal(null); if (!a || !a.endedAt) setScreen({ name: "day" });
  };
  const submit = () => {
    if (submitting.current) return;
    const a = attRef.current[screen.setId]; if (!a || a.endedAt) return;
    submitting.current = true;
    const q = qOf(a);
    submitAt(a, Date.now(), q ? q.id : null, "user");
    if (!commit(a)) submitting.current = false;
  };

  // ---------------------------------------------------------------- 結果
  if (screen.name === "result") {
    const a = results.find(r => r.attemptId === screen.attemptId);
    const f = a && findSet(a.setId);
    if (a && f) return (
      <Result a={a} plan={f.plan} set={f.set} results={results} notes={notes} updateNotes={updateNotes} openQ={openQ} setOpenQ={setOpenQ} warn={warn}
        onBack={() => { setDate(f.plan.date); setScreen({ name: "day" }); }} onRetake={() => setModal("retake:" + a.setId)}
        modal={modal} setModal={setModal} start={start} onOpen={id => { setOpenQ({}); setScreen({ name: "result", attemptId: id }); }} />);
  }

  // ---------------------------------------------------------------- 受験中
  if (inExam && cur) {
    const { set } = findSet(cur.setId); const qs = set.questions; const q = qs[cur.current];
    const remain = remainingMs(cur);
    const answered = qs.filter(x => cur.answers[x.id]).length;
    const flaggedN = qs.filter(x => cur.flags[x.id]).length;
    const tcls = remain < 60000 ? "crit" : remain < 180000 ? "low" : "";
    const go = i => mut(a => { const old = a.current; goTo(a, i, qs.length); if (a.current !== old) markVisit(a, qs[a.current].id); });
    return (
      <div className="m2"><style>{CSS}</style>
        <div className="m2-top"><div className="in">
          <span><b>{set.title}</b>　問{cur.current + 1}／{qs.length}</span>
          <span className={"m2-time " + tcls} aria-live="off">残り {fmtClock(remain)}</span>
          <span className="m2-row"><button className="m2-btn" onClick={() => setModal("submit")}>提出</button></span>
        </div></div>
        <div className="m2-wrap">
          {warn}
          <div className="dl-strip" role="navigation" aria-label="設問の移動">
            {qs.map((x, i) => (
              <button key={x.id} className={"m2-cell" + (cur.answers[x.id] ? " ans" : "") + (i === cur.current ? " cur" : "")} onClick={() => go(i)}
                aria-label={`問${i + 1}${cur.answers[x.id] ? " 回答済み" : " 未回答"}${cur.flags[x.id] ? " 保留" : ""}`}>
                問{i + 1}{cur.flags[x.id] && <span className="fl">★</span>}</button>))}
          </div>
          <div className="m2-row" style={{ justifyContent: "space-between", margin: "4px 0 8px" }}>
            <span className="m2-muted">回答済み {answered}／{qs.length}　保留 {flaggedN}</span>
            <button className={"m2-btn " + (cur.flags[q.id] ? "w" : "o")} onClick={() => mut((a, qq) => toggleFlag(a, qq.id))} aria-pressed={!!cur.flags[q.id]}>
              {cur.flags[q.id] ? "★ 保留中" : "☆ 保留（あとで見直す）"}</button>
          </div>
          <div className="m2-card">
            <div className="m2-muted" style={{ marginBottom: 6 }}>問{cur.current + 1}</div>
            <Body q={q} />
          </div>
          <div className="m2-card">
            <div className="m2-muted">解答群</div>
            <Choices q={q} value={cur.answers[q.id]} onPick={label => mut((a, qq) => pick(a, qq.id, label))} />
            <div className="m2-row" style={{ marginTop: 6 }}>
              <button className="m2-btn o" disabled={!cur.answers[q.id]} onClick={() => mut((a, qq) => clearAnswer(a, qq.id))}>解答を消す</button>
            </div>
          </div>
        </div>
        <div className="m2-bottom"><div className="in">
          <button className="m2-btn o" disabled={cur.current === 0} onClick={() => go(cur.current - 1)}>◀ 前へ</button>
          <button className="m2-btn w" onClick={() => setModal("leave")}>中断</button>
          <button className="m2-btn o" disabled={cur.current === qs.length - 1} onClick={() => go(cur.current + 1)}>次へ ▶</button>
        </div></div>

        {modal === "submit" && (
          <div className="m2-modal"><div className="box" role="dialog" aria-label="提出の確認">
            <h2 style={{ marginTop: 0 }}>{set.title}を提出しますか</h2>
            <p>未回答：<b className={qs.length - answered ? "st-na" : ""}>{qs.length - answered}問</b>　保留：{flaggedN}問　残り時間：{fmtClock(remain)}</p>
            <p className="m2-muted">提出すると解答は変更できません。提出後に正誤と解説を表示します。</p>
            <div className="m2-row"><button className="m2-btn" onClick={submit}>提出する</button><button className="m2-btn o" onClick={() => setModal(null)}>解答に戻る</button></div>
          </div></div>)}
        {modal === "leave" && (
          <div className="m2-modal"><div className="box" role="dialog" aria-label="中断の確認">
            <h2 style={{ marginTop: 0 }}>中断して今日の学習に戻りますか</h2>
            <p>解答はこの端末に保存され、続きから再開できます。<b>中断している間もセットの時間は進みます。</b>残り時間がなくなると、その時点の解答で自動的に提出されます。</p>
            <p className="m2-muted">今の残り時間：{fmtClock(remain)}</p>
            <div className="m2-row"><button className="m2-btn w" onClick={leave}>中断して戻る</button><button className="m2-btn o" onClick={() => setModal(null)}>解答に戻る</button></div>
          </div></div>)}
      </div>);
  }

  // ---------------------------------------------------------------- 開始前
  if (screen.name === "intro") {
    const f = findSet(screen.setId);
    if (f) {
      const { set, plan } = f; const no = nextAttemptNo(results, set.setId);
      return (
        <div className="m2"><style>{CSS}</style><div className="m2-wrap">
          <div className="m2-muted">{dateLabel(plan.date)}の課題</div>
          <h1>{set.title}{no > 1 ? `（${no}回目・再受験）` : ""}</h1>
          <div className="m2-card">
            <div className="dl-goal"><b>目標</b>　{set.goal}</div>
            <p style={{ margin: "6px 0" }}>{set.questions.length}問・制限時間 <b>{limitText(set.limitSec)}</b></p>
            <p className="m2-muted" style={{ margin: 0 }}>制限時間は {set.limitNote}。セット全体の時間配分の目安で、1問ごとの合格ラインではありません。</p>
          </div>
          <div className="m2-card">
            <h2 style={{ marginTop: 0 }}>受験のしかた</h2>
            <ul className="m2-list">
              <li>・「開始する」を押すと時間の計測が始まり、提出するまで止まりません（中断・画面を閉じる・スリープの間も進みます）。</li>
              <li>・上の「問1」「問2」…のボタンや「前へ」「次へ」で、どの問題にも移動できます。迷ったら「保留」を付けて先へ進めます。</li>
              <li>・正誤と解説は提出後に表示します。時間になると、その時点の解答で自動的に提出します（未回答も記録します）。</li>
              <li>・問題ごとに表示していた時間を記録します（戻って見直した時間も加えます）。</li>
              {no > 1 && <li>・再受験は同じ問題です。結果は初回と分けて記録します。</li>}
            </ul>
          </div>
          {warn}
          <div className="m2-row">
            <button className="m2-btn" onClick={() => start(set.setId)}>開始する</button>
            <button className="m2-btn o" onClick={() => setScreen({ name: "day" })}>戻る</button>
          </div>
        </div></div>);
    }
  }

  // ---------------------------------------------------------------- 日ごとの画面
  const today = jstDate();
  const plan = planOf(date);
  const dateSet = Array.from(new Set([...PLANS.map(p => p.date), today, addDays(today, 1)])).sort();
  const dayNote = (notes["day:" + date] || {}).memo || "";
  return (
    <div className="m2"><style>{CSS}</style><div className="m2-wrap">
      <h1>今日の学習</h1>
      <div className="m2-muted">今日は {dateLabel(today)}（日本時間）</div>
      {warn}
      <div className="dl-dates" role="tablist" aria-label="日付">
        {dateSet.map(d => {
          const p = planOf(d);
          const st = p ? p.sets.map(s => setStatus(s.setId, att, results)) : [];
          const lab = !p ? "未作成" : st.every(x => x === "完了") ? "完了" : st.some(x => x !== "未受験") ? "途中" : "未受験";
          return <button key={d} role="tab" aria-selected={d === date} className={"dl-date" + (d === date ? " sel" : "")} onClick={() => setDate(d)}>
            {d === today ? "今日 " : ""}{d.slice(5).replace("-", "/")}<span className="s">{lab}</span></button>;
        })}
      </div>
      {!plan && (
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>{dateLabel(date)}</h2>
          <p>この日の課題は{date > today ? "まだ作成されていません（予定）" : "作成されていません"}。前回の結果をGPTに渡すと、次の課題が作られます。</p>
        </div>)}
      {plan && (<>
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>{dateLabel(plan.date)}{plan.date === today ? "（今日）" : plan.date < today ? "（過去の課題）" : "（予定）"}</h2>
          <div className="dl-goal"><b>今日の目標</b>　{plan.goal}</div>
          {plan.note && <p className="m2-muted" style={{ margin: "6px 0 0" }}>{plan.note}</p>}
        </div>
        <div className="m2-subjects">
          {plan.sets.map(set => {
            const st = setStatus(set.setId, att, results);
            const a = att[set.setId];
            const list = setResults(results, set.setId);
            const first = list[0], last = list[list.length - 1];
            const sc = r => judgeSet(set, r);
            return (
              <div key={set.setId} className="m2-card">
                <div className="m2-row" style={{ justifyContent: "space-between" }}>
                  <h2 style={{ margin: 0 }}>{set.title}</h2>
                  <span className={"m2-pill" + (st === "受験中" ? " run" : st === "完了" ? " done" : "")}>{st}</span>
                </div>
                <p className="m2-muted" style={{ margin: "4px 0 6px" }}>{set.questions.length}問・制限時間 {limitText(set.limitSec)}　<span className="m2-tag">{set.setId}</span></p>
                <p style={{ margin: "0 0 6px" }}>{set.goal}</p>
                {a && !a.endedAt && (<>
                  <p style={{ margin: "0 0 8px" }}>回答済み {set.questions.filter(x => a.answers[x.id]).length}／{set.questions.length}　残り <b className="m2-time">{fmtClock(remainingMs(a))}</b>（中断中も進んでいます）</p>
                  <button className="m2-btn" onClick={() => resume(set.setId)}>続きから再開する</button>
                </>)}
                {a && a.endedAt && <p className="st-ng">提出済みですが、結果の保存がまだです。「保存を再試行」を押してください。</p>}
                {!a && !first && <button className="m2-btn" onClick={() => setScreen({ name: "intro", setId: set.setId })}>このセットに取り組む</button>}
                {!a && first && (<>
                  <p style={{ margin: "0 0 8px" }}>初回：<b>正解 {sc(first).correct}／{set.questions.length}</b>　{mmss(first.elapsedMs)}{first.submittedBy === "timeout" ? "（時間切れ）" : ""}
                    {last !== first && <><br />最新（{last.attemptNo}回目）：正解 {sc(last).correct}／{set.questions.length}</>}</p>
                  <div className="m2-row">
                    <button className="m2-btn o" onClick={() => { setOpenQ({}); setScreen({ name: "result", attemptId: first.attemptId }); }}>結果と復習</button>
                    {last !== first && <button className="m2-btn o" onClick={() => { setOpenQ({}); setScreen({ name: "result", attemptId: last.attemptId }); }}>最新の結果</button>}
                    <button className="m2-btn w" onClick={() => setScreen({ name: "intro", setId: set.setId })}>再受験</button>
                  </div>
                </>)}
              </div>);
          })}
        </div>
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>GPT分析用テキスト（この日の全セット）</h2>
          <label className="m2-muted" htmlFor="dl-memo">メモ（任意）：実際に使えた時間や、取り組めなかった理由など</label>
          <textarea id="dl-memo" className="dl-memo" value={dayNote} onChange={e => { const v = e.target.value; updateNotes(n => { n["day:" + date] = { ...(n["day:" + date] || {}), memo: v }; }); }} />
          <ReportBox text={buildDayReport(plan, att, results, notes)} file={`daily_${plan.date}_report.txt`}
            note="両方のセットが終わる前でも渡せます。未受験のセットは「未受験」と書かれ、誤答には数えません。問題文・解答群・正解・解説・設問別の時間・本人が付けた理由を含みます。" />
        </div>
      </>)}
      <div className="m2-row m2-muted" style={{ marginTop: 12 }}>
        <a href="/" style={{ color: "var(--ac)" }}>通常の学習へ</a>
        <a href="/mock" style={{ color: "var(--ac)" }}>本番形式の模擬試験へ</a>
      </div>
    </div></div>);
}

function Result({ a, plan, set, results, notes, updateNotes, openQ, setOpenQ, warn, onBack, onRetake, modal, setModal, start, onOpen }) {
  const S = judgeSet(set, a);
  const n = notes[a.attemptId] || {};
  const pri = n.priority || defaultPriority(S);
  const list = setResults(results, set.setId);
  const setNote = (fn) => updateNotes(x => { const e = x[a.attemptId] = x[a.attemptId] || {}; fn(e); });
  const priRow = S.rows.find(r => r.q.id === pri);
  const toggle = id => setOpenQ(o => ({ ...o, [id]: !o[id] }));
  // 優先する1問は、開いた状態で表示する（解説を開いている時間として記録）
  useEffect(() => { if (pri && openQ[pri] === undefined) setOpenQ(o => ({ ...o, [pri]: true })); }, [pri]);

  const Detail = ({ r }) => {
    const reason = n.reasons && n.reasons[r.q.id];
    return (
      <div className="m2-card">
        <div><span className="m2-tag">{r.q.id}</span><span className="m2-tag">{r.q.field}</span><span className="m2-tag">{r.q.cat}</span><span className="m2-tag">{r.q.measures}</span></div>
        <Body q={r.q} />
        <Choices q={r.q} value={r.ans} onPick={() => {}} disabled showCorrect />
        <p><b>正解 {r.q.correct}</b>　あなたの解答 {r.ans || "未回答"}</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{r.q.explanation}</p>
        {r.q.explain && <Body q={{ body: r.q.explain }} />}
        <div className="m2-muted">{r.status === STATUS.ok ? "迷った点があれば" : "間違えた・解けなかった理由"}（任意・分析に使います）</div>
        <div className="dl-reasons">
          {REASONS.map(x => <button key={x} className={reason === x ? "sel" : ""} aria-pressed={reason === x}
            onClick={() => setNote(e => { e.reasons = e.reasons || {}; if (e.reasons[r.q.id] === x) delete e.reasons[r.q.id]; else e.reasons[r.q.id] = x; })}>{x}</button>)}
        </div>
      </div>);
  };

  return (
    <div className="m2"><style>{CSS}</style><div className="m2-wrap">
      <div className="m2-muted">{dateLabel(plan.date)}の課題</div>
      <h1>{set.title}の結果</h1>
      <div className="m2-muted">{a.attemptNo}回目{a.isRetake ? "（再受験）" : "（初回）"}／開始 {String(a.startedAt).replace("T", " ").slice(0, 16)}</div>
      {warn}
      <div className="m2-card">
        <div className="m2-big">正解 {S.correct}／{S.total}</div>
        <p style={{ margin: "4px 0" }}><span className="st-ng">誤答 {S.wrong}</span>　<span className="st-na">未回答 {S.blank}</span></p>
        <p className="m2-muted" style={{ margin: 0 }}>経過 {mmss(a.elapsedMs)}／制限 {mmss(a.limitMs)}　{BY[a.submittedBy] || ""}　問題を表示していなかった時間 {mmss(a.hiddenMs)}・再開 {a.resumes || 0}回</p>
      </div>
      {priRow && (
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>まず復習する1問</h2>
          <p className="m2-muted" style={{ margin: "0 0 6px" }}>誤答・未回答、なければ想定より時間を使った正解から選んでいます。別の問題に変えられます。</p>
          <div className="dl-strip">
            {S.rows.map(r => <button key={r.q.id} className={"m2-cell" + (r.q.id === pri ? " cur" : "")} aria-pressed={r.q.id === pri}
              onClick={() => { setNote(e => { e.priority = r.q.id; }); setOpenQ(o => ({ ...o, [r.q.id]: true })); }}>問{r.i + 1}</button>)}
          </div>
          <p style={{ margin: "4px 0" }}><b className={priRow.status === STATUS.ok ? "st-ok" : priRow.status === STATUS.ng ? "st-ng" : "st-na"}>問{priRow.i + 1}　{priRow.status}</b>　{priRow.q.topic}
            <br /><span className="m2-muted">{secText(priRow.sec)}（想定 {secText(priRow.q.expected_seconds)}）</span></p>
          {openQ[pri] ? <><button className="m2-btn o" onClick={() => toggle(pri)}>解説を閉じる</button><Detail r={priRow} /></>
            : <button className="m2-btn" onClick={() => toggle(pri)}>解説を開く</button>}
        </div>)}
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>設問別の結果と時間</h2>
        <div className="m2-tw"><table className="m2-table"><thead><tr><th>問</th><th>結果</th><th>解答／正解</th><th>表示していた時間</th><th>うち再訪</th><th>想定</th><th>変更</th><th>保留</th></tr></thead>
          <tbody>{S.rows.map(r => <tr key={r.q.id}><td>問{r.i + 1}</td><td className={r.status === STATUS.ok ? "st-ok" : r.status === STATUS.ng ? "st-ng" : "st-na"}>{r.status}</td>
            <td>{r.ans || "－"}／{r.q.correct}</td><td className="num">{secText(r.sec)}</td><td className="num">{secText(r.revisitSec)}</td><td className="num">{secText(r.q.expected_seconds)}</td>
            <td className="num">{r.changes}</td><td>{r.flagged ? "★" : ""}</td></tr>)}</tbody></table></div>
        <p className="m2-muted">表示していた時間は、その問題を画面に出していた時間の近似です。想定時間は作問時の見積りで、速さの合否基準ではありません。</p>
        {S.rows.filter(r => r.q.id !== pri).map(r => (
          <div key={r.q.id} style={{ borderTop: "1px solid var(--bd)", padding: "8px 0" }}>
            <button className="m2-choice" style={{ margin: 0, background: "none", border: "none", padding: 0 }} onClick={() => toggle(r.q.id)} aria-expanded={!!openQ[r.q.id]}>
              <span className="lb">{r.i + 1}</span>
              <span><b className={r.status === STATUS.ok ? "st-ok" : r.status === STATUS.ng ? "st-ng" : "st-na"}>{r.status}</b>　{r.q.topic}
                <br /><span className="m2-muted">{openQ[r.q.id] ? "▲ 解説を閉じる" : "▼ 解説を開く"}</span></span>
            </button>
            {openQ[r.q.id] && <Detail r={r} />}
          </div>))}
      </div>
      <div className="m2-card">
        <h2 style={{ marginTop: 0 }}>GPT分析用テキスト（このセット）</h2>
        <ReportBox text={buildAttemptReport(plan, set, a, notes)} file={`${a.attemptId}_report.txt`}
          note="この日のすべてのセットをまとめて渡すときは、「今日の学習」画面の下にあるテキストを使ってください。" />
      </div>
      {list.length > 1 && (
        <div className="m2-card">
          <h2 style={{ marginTop: 0 }}>このセットの受験記録</h2>
          {list.map(r => <div key={r.attemptId} className="m2-row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--bd)", padding: "6px 0" }}>
            <span>{r.attemptNo}回目{r.isRetake ? "（再受験）" : "（初回）"}　正解 {judgeSet(set, r).correct}／{set.questions.length}</span>
            {r.attemptId !== a.attemptId && <button className="m2-btn o" onClick={() => onOpen(r.attemptId)}>結果を見る</button>}
          </div>)}
        </div>)}
      <div className="m2-row">
        <button className="m2-btn o" onClick={onBack}>今日の学習へ戻る</button>
        <button className="m2-btn w" onClick={onRetake}>このセットを再受験</button>
      </div>
      {modal === "retake:" + set.setId && (
        <div className="m2-modal"><div className="box" role="dialog" aria-label="再受験の確認">
          <h2 style={{ marginTop: 0 }}>{set.title}を再受験しますか</h2>
          <p>{set.questions.length}問・制限時間 {limitText(set.limitSec)}。同じ問題なので、結果は初回と分けて「再受験」として記録します。</p>
          <div className="m2-row"><button className="m2-btn" onClick={() => start(set.setId)}>開始する</button><button className="m2-btn o" onClick={() => setModal(null)}>やめる</button></div>
        </div></div>)}
    </div></div>);
}
