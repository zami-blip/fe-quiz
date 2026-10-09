import React, { useState, useMemo, useRef } from "react";
import { readForExport } from "./answerLog";
import { buildReport, SCOPE_LABEL, RANGE_LABEL, HANDOVER_TEMPLATE } from "./gptExport";

const C = { surface:"#161b22", border:"#30363d", muted:"#8b949e", text:"#e6edf3", red:"#f85149", green:"#3fb950", accent:"#58a6ff" };
const btn = { width:"100%", padding:9, background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:8, fontFamily:"inherit", fontSize:12, cursor:"pointer", marginTop:8 };
const strongBtn = { ...btn, color:C.text, borderColor:C.accent };
const radioRow = { display:"flex", gap:12, flexWrap:"wrap", fontSize:12, color:C.text, marginTop:4 };

function pad(n) { return String(n).padStart(2, "0"); }

// 読取専用: localStorage には何も書き込まない。ファイル保存(ダウンロード)とクリップボードだけを使う。
export default function GptExportBox({ subject, questions, defaultScope = "wrong", defaultRange = "all" }) {
  const [scope, setScope] = useState(defaultScope);
  const [range, setRange] = useState(defaultRange);
  const [partIdx, setPartIdx] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);
  const areaRef = useRef(null);

  const report = useMemo(() => {
    try {
      return { ok: true, ...buildReport({ subject, questions, scope, range, ...readForExport(subject) }) };
    } catch (e) {
      return { ok: false, error: e && e.message ? e.message : String(e), parts: [""], full: "", stats: { questions: 0, events: 0, chars: 0, partCount: 1 } };
    }
  }, [subject, questions, scope, range, tick]);

  const idx = Math.min(partIdx, report.parts.length - 1);
  const text = report.parts[idx] || "";

  const copy = (t, label) => {
    const fallback = () => {
      const el = areaRef.current;
      if (!el) { setMsg("コピーできませんでした。プレビューを開いて手動でコピーしてください。"); return; }
      el.value = t; el.select();
      try { document.execCommand("copy"); setMsg(`${label}をコピーしました。`); }
      catch (e) { setMsg("コピーできませんでした。プレビューを開いて手動でコピーしてください。"); }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t).then(() => setMsg(`${label}をコピーしました。`)).catch(fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  };

  const save = () => {
    try {
      const d = new Date();
      const name = `fe-quiz-gpt-${subject}-${scope}-${range}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.txt`;
      const blob = new Blob([report.full], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg(`${name} を保存しました。`);
    } catch (e) { setMsg("保存に失敗しました: " + (e && e.message ? e.message : e)); }
  };

  const st = report.stats;
  const n = report.parts.length;
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px", marginTop:16 }}>
      <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>📝 GPT分析用テキスト(科目{subject})</div>
      <div style={{ fontSize:11, color:C.muted }}>対象</div>
      <div style={radioRow}>
        {Object.entries(SCOPE_LABEL).map(([k, v]) => (
          <label key={k} style={{ cursor:"pointer" }}><input type="radio" name={`gpt-scope-${subject}`} checked={scope === k} onChange={() => { setScope(k); setPartIdx(0); setMsg(""); }} /> {v}</label>
        ))}
      </div>
      <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>範囲</div>
      <div style={radioRow}>
        {Object.entries(RANGE_LABEL).map(([k, v]) => (
          <label key={k} style={{ cursor:"pointer" }}><input type="radio" name={`gpt-range-${subject}`} checked={range === k} onChange={() => { setRange(k); setPartIdx(0); setMsg(""); }} /> {v}</label>
        ))}
      </div>
      <div style={{ fontSize:12, color:C.text, marginTop:8 }}>
        {st.questions}問・回答ログ{st.events}件{st.legacyRows ? `・旧成績${st.legacyRows}件` : ""}・{st.chars.toLocaleString()}文字{n > 1 ? `(${n}パートに分割)` : ""}
      </div>
      {!report.ok && <div style={{ fontSize:11, color:C.red, marginTop:4 }}>テキスト生成に失敗: {report.error}</div>}
      {n > 1 && (
        <div style={{ fontSize:12, color:C.text, marginTop:6 }}>
          コピーするパート:{" "}
          <select value={idx} onChange={e => { setPartIdx(Number(e.target.value)); setMsg(""); }} style={{ background:C.surface, color:C.text, border:`1px solid ${C.border}`, borderRadius:6, padding:"2px 6px" }}>
            {report.parts.map((_, i) => <option key={i} value={i}>{i + 1} / {n}</option>)}
          </select>
        </div>
      )}
      <button style={strongBtn} onClick={() => copy(text, n > 1 ? `パート${idx + 1}/${n}` : "テキスト")}>
        {n > 1 ? `テキストをコピー(パート${idx + 1}/${n})` : "テキストをコピー"}
      </button>
      <button style={btn} onClick={save}>TXTを保存{n > 1 ? "(全パートを1ファイル)" : ""}</button>
      <button style={btn} onClick={() => copy(HANDOVER_TEMPLATE, "返却フォーマット")}>返却フォーマットだけをコピー</button>
      <button style={btn} onClick={() => { setTick(x => x + 1); setMsg(""); }}>最新の記録で作り直す</button>
      <button style={btn} onClick={() => setShowPreview(v => !v)}>{showPreview ? "プレビューを閉じる" : "プレビューを表示"}</button>
      {showPreview && (
        <textarea readOnly value={text} rows={10}
          style={{ width:"100%", marginTop:8, background:"#0d1117", color:C.text, border:`1px solid ${C.border}`, borderRadius:8, padding:8, fontSize:11, fontFamily:"monospace", boxSizing:"border-box" }} />
      )}
      <textarea ref={areaRef} readOnly aria-hidden="true" tabIndex={-1} style={{ position:"absolute", left:-9999, top:0, width:1, height:1, opacity:0 }} />
      {msg && <div style={{ fontSize:11, color:C.green, marginTop:6 }}>{msg}</div>}
    </div>
  );
}
