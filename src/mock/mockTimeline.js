// 経過時間を試験の段階（科目A → 休憩 → 科目B）に順に割り当てる純粋関数。
// ブラウザを閉じていた間などに経過した時間が、ある段階の残り時間を超えたときは、
// 超えた分をそのまま次の段階の経過時間として扱う。これにより、閉じている間も
// 本番と同様に時間が進み、試験時間が実質的に延長されることはない。
import { isoWithTz } from "./mockStore";

// a: 受験データ（直接書き換える）, d: 加算する経過ミリ秒, nowMs: 計測した時点の壁時計
// opt.qid(sub, sec): 現在表示している設問ID（設問別の所要時間に加えるため）
// opt.offline: true のときは画面を開いていなかった時間として扱い、設問別の所要時間には加えない
// 戻り値: 発生した段階の切替え（"A_timeout" | "break_end" | "B_timeout"）の配列
export function advance(a, d, nowMs, opt = {}) {
  const events = [];
  let t = Math.max(0, d || 0);
  const at = () => isoWithTz(new Date(nowMs - t)); // 切替えが起きた時刻（残りの t だけ前）
  for (let guard = 0; guard < 4; guard++) {
    if (a.phase === "A" || a.phase === "B") {
      const sub = a.phase; const s = a.sections[sub];
      const use = Math.min(t, Math.max(0, s.limitMs - s.elapsedMs));
      s.elapsedMs += use; t -= use;
      if (opt.offline) s.offlineMs = (s.offlineMs || 0) + use;
      else if (opt.qid && use > 0) {
        const id = opt.qid(sub, s);
        if (id) { const pq = s.perQ[id] || { ms: 0, changes: 0, history: [] }; pq.ms += use; s.perQ[id] = pq; }
      }
      if (s.elapsedMs < s.limitMs) break;
      s.elapsedMs = s.limitMs;
      if (!s.endedAt) { s.endedAt = at(); s.submittedBy = "timeout"; }
      if (sub === "A") {
        events.push("A_timeout");
        a.phase = "break"; a.brk.startedAt = at();
        continue;
      }
      events.push("B_timeout");
      a.phase = "done"; a.finishedAt = at();
      break;
    }
    if (a.phase === "break") {
      const use = Math.min(t, Math.max(0, a.brk.limitMs - a.brk.elapsedMs));
      a.brk.elapsedMs += use; t -= use;
      if (a.brk.elapsedMs < a.brk.limitMs) break;
      a.brk.elapsedMs = a.brk.limitMs; a.brk.endedAt = at();
      events.push("break_end");
      a.phase = "B"; a.sections.B.startedAt = at();
      continue;
    }
    break;
  }
  return events;
}
