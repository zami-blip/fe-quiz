import React, { useState, useRef } from "react";
import { downloadBackup, restoreBackup, logStats, getLastError } from "./answerLog";

const C = { surface:"#161b22", border:"#30363d", muted:"#8b949e", text:"#e6edf3", red:"#f85149", green:"#3fb950" };
const btn = { width:"100%", padding:9, background:"none", border:`1px solid ${C.border}`, color:C.muted, borderRadius:8, fontFamily:"inherit", fontSize:12, cursor:"pointer", marginTop:8 };

export default function BackupBox({ subject }) {
  const [msg, setMsg] = useState("");
  const [, force] = useState(0);
  const fileRef = useRef(null);
  const st = logStats(subject);
  const err = getLastError();
  const onRestore = (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (!window.confirm("バックアップから復元します。復元前の状態は端末内に退避され、回答ログは削除されず統合されます。よろしいですか？")) return;
    const r = new FileReader();
    r.onload = () => {
      try { const n = restoreBackup(String(r.result)); setMsg(`${n}件のキーを復元しました。ページを再読み込みしてください。`); }
      catch (ex) { setMsg("復元できませんでした: " + (ex && ex.message ? ex.message : ex)); }
      force(x => x + 1);
    };
    r.readAsText(f);
  };
  return (
    <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 13px", marginTop:16 }}>
      <div style={{ fontSize:12, color:C.muted, marginBottom:4 }}>💾 回答ログとバックアップ</div>
      <div style={{ fontSize:12, color:C.text }}>
        問題ID付き回答ログ: {st.total}件(通常 {st.normal} / 苦手優先 {st.weak})
        {st.last ? ` ・最新 ${st.last.slice(0, 16).replace("T", " ")}` : ""}
      </div>
      {err && <div style={{ fontSize:11, color:C.red, marginTop:4 }}>保存エラー: {err}</div>}
      <button style={btn} onClick={() => { try { setMsg(`${downloadBackup()} を保存しました。`); } catch (ex) { setMsg("バックアップに失敗: " + (ex && ex.message ? ex.message : ex)); } force(x => x + 1); }}>
        バックアップを保存(全データ・回答ログ)
      </button>
      <button style={btn} onClick={() => fileRef.current && fileRef.current.click()}>バックアップから復元</button>
      <input ref={fileRef} type="file" accept="application/json,.json" style={{ display:"none" }} onChange={onRestore} />
      {msg && <div style={{ fontSize:11, color:C.green, marginTop:6 }}>{msg}</div>}
    </div>
  );
}
