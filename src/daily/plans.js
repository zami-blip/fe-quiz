// 「今日の学習」の計画とセットの一覧。日付ごとに data/YYYY-MM-DD.json を追加し、ここに1行加える。
// 計画は GPT が決め、問題・解説・検算は Claude が作って tools/daily/ の生成スクリプトで出力する。
import p20261113 from "./data/2026-11-13.json";
import p20261114 from "./data/2026-11-14.json";

export const PLANS = [p20261113, p20261114].sort((x, y) => (x.date < y.date ? -1 : 1));

export function planOf(date) { return PLANS.find(p => p.date === date) || null; }
export function findSet(setId) {
  for (const p of PLANS) { const s = p.sets.find(x => x.setId === setId); if (s) return { plan: p, set: s }; }
  return null;
}
