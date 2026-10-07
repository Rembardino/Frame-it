/**
 * Riepilogo di fine partita a partire dai voti dei momenti. Puro: niente DOM.
 */
import type { DirectorResult } from '../events/director';
import { VERDICTS } from '../director/lines';
import { CONFIG } from '../config';

export interface MatchSummary {
  points: number;
  /** Stelle medie dei momenti ripresi (azioni, distrazioni, ordini). */
  avgStars: number;
  best: { label: string; stars: number; score: number }[];
  orders: { done: number; total: number };
  distractions: { caught: number; total: number };
  /** Clip rare catturate (album: Passo 5). */
  rareClips: number;
  verdict: string;
}

export function summarize(history: DirectorResult[]): MatchSummary {
  const scored = history.filter((r) => r.result);
  const avgStars = scored.length ? scored.reduce((s, r) => s + r.result!.stars, 0) / scored.length : 0;
  const best = scored
    .filter((r) => r.category !== 'order' && r.result!.stars >= 3)
    .sort((a, b) => b.result!.score * b.importance - a.result!.score * a.importance)
    .slice(0, 3)
    .map((r) => ({ label: r.label, stars: r.result!.stars, score: r.result!.score }));
  const orders = history.filter((r) => r.category === 'order');
  const distractions = history.filter((r) => r.category === 'distraction');
  return {
    points: history.reduce((s, r) => s + r.points, 0),
    avgStars,
    best,
    orders: { done: orders.filter((r) => r.bonus).length, total: orders.length },
    distractions: { caught: distractions.filter((r) => r.result).length, total: distractions.length },
    rareClips: history.filter((r) => r.category === 'rare' && r.result && r.result.stars >= CONFIG.rare.captureStars).length,
    verdict: VERDICTS.find(([min]) => avgStars >= min)![1],
  };
}
