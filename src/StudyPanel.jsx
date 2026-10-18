import React, { useState } from "react";
import { currentCounts, loadSettings, saveSettings, loadShown, loadFlags, setFlag } from "./studyStore";

const C = { surface:"#161b22", border:"#30363d", muted:"#8b949e", text:"#e6edf3", accent:"#58a6ff", warn:"#d29922", green:"#3fb950" };
const btn = { padding:"6px 10px", background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:6, fontFamily:"inherit", fontSize:12, cursor:"pointer" };
const box = (l, v, color) => (
  <div key={l} style={{ flex:1, minWidth:90, background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"8px 6px", textAlign:"center" }}>
    <div style={{ fontSize:20, fontWeight:700, color: color || C.accent }}>{v}</div>
    <div style={{ fontSize:11, color:C.muted }}>{l}</div>
  </div>
);

// 回答直後に表示する、問題ID単位の手動操作(履歴は消さない・いつでも解除可)
export function FlagButtons({ subject, id }) {
  const [, force] = useState(0);
  const f = loadFlags(subject)[id];
  const cur = f ? f.flag : null;
  const act = (flag) => { setFlag(subject, id, cur === flag ? null : flag); force(x => x + 1); };
  return (
    <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
      <button style={{ ...btn, ...(cur==="weak" ? { color:C.warn, borderColor:C.warn } : {}) }} onClick={() => act("weak")}>
        {cur==="weak" ? "✓ 理解不足に登録中(解除)" : "理解不足として登録"}
      </button>
      <button style={{ ...btn, ...(cur==="hold" ? { color:C.green, borderColor:C.green } : {}) }} onClick={() => act("hold")}>
        {cur==="hold" ? "✓ 保留中(解除)" : "保留(理解済み・出題しない)"}
      </button>
    </div>
  );
}

// 管理画面: 状態数・設定・今回の選択理由・手動フラグの解除
export default function StudyPanel({ subject, allQuestions }) {
  const [, force] = useState(0);
  const st = loadSettings(subject);
  const { counts } = currentCounts(subject, allQuestions);
  const shown = loadShown(subject);
  const flags = loadFlags(subject);
  const flagged = Object.keys(flags).map(Number);
  const upd = (patch) => { saveSettings(subject, { ...st, ...patch }); force(x => x + 1); };
  const num = (v, min, max, fb) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb; };
  const bd = shown.plan && shown.plan.breakdown;
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>出題状況(問題ID単位・この科目のみ)</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        {box("総問題数", counts.total)}
        {box("未回答", counts.unanswered)}
        {box("復習対象", counts.review, C.warn)}
        {box("再確認待ち", counts.waiting, C.muted)}
        {box("再確認期", counts.due, C.muted)}
        {box("保留", counts.hold, C.green)}
      </div>
      <div style={{ fontSize:12, color:C.text, marginBottom:8 }}>
        今回の出題内訳: {bd ? `復習 ${bd["復習"]} / 未回答 ${bd["未回答"]} / 再確認 ${bd["再確認"]}` : "まだ出題していません"}
      </div>
      <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
        <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>設定</div>
        <label style={{ fontSize:12, color:C.text, display:"block", marginBottom:6 }}>
          1回の出題数{" "}
          <input type="number" value={st.size} min={1} max={30} style={{ width:56 }} onChange={e => upd({ size: num(e.target.value, 1, 30, st.size) })} />
        </label>
        <label style={{ fontSize:12, color:C.text, display:"block", marginBottom:6 }}>
          未回答の枠(空=約1/3){" "}
          <input type="number" value={st.unansweredSlots == null ? "" : st.unansweredSlots} min={0} max={30} style={{ width:56 }}
            onChange={e => upd({ unansweredSlots: e.target.value === "" ? null : num(e.target.value, 0, 30, 0) })} />
        </label>
        <label style={{ fontSize:12, color:C.text, display:"block" }}>
          再確認までの日数{" "}
          <input type="number" value={st.recheckDays} min={0} max={60} style={{ width:56 }} onChange={e => upd({ recheckDays: num(e.target.value, 0, 60, st.recheckDays) })} />
        </label>
      </div>
      {shown.plan && (
        <details style={{ marginBottom:8 }}>
          <summary style={{ fontSize:12, color:C.muted, cursor:"pointer" }}>直近の選択理由({shown.plan.at.slice(0, 16).replace("T", " ")})</summary>
          <div style={{ fontSize:11, color:C.text, lineHeight:1.7, marginTop:6 }}>
            {shown.plan.picks.map(p => <div key={p.id}>ID {p.id}: {p.reason}</div>)}
            {shown.plan.notes.map((n, i) => <div key={i} style={{ color:C.warn }}>{n}</div>)}
          </div>
        </details>
      )}
      {flagged.length > 0 && (
        <details>
          <summary style={{ fontSize:12, color:C.muted, cursor:"pointer" }}>手動で設定した問題({flagged.length}件)</summary>
          <div style={{ fontSize:12, color:C.text, marginTop:6 }}>
            {flagged.map(id => (
              <div key={id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                <span>ID {id}: {flags[id].flag === "hold" ? "保留(手動の理解済み)" : "理解不足"}</span>
                <button style={btn} onClick={() => { setFlag(subject, id, null); force(x => x + 1); }}>解除</button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
