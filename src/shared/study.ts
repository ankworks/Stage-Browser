/**
 * Pure study helpers shared by main, PREP and the tests.
 *
 * Nothing here touches Electron or the DOM, so every rule (reading time,
 * per-site zoom keys, tab-search ranking) can be asserted in `npm test`.
 */

import type { ReadingEntry, TabState } from './types';
import { tabLabel } from './types';

/** 220 wpm is the common "comfortable study" estimate, rounded up to a minute. */
export const WORDS_PER_MINUTE = 220;

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return matches ? matches.length : 0;
}

export function readingMinutes(words: number): number {
  if (words <= 0) return 1;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Zoom is remembered per registrable-ish host: `www.` is dropped, ports kept. */
export function zoomKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.host.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

export function clampZoom(factor: number): number {
  return Math.min(5, Math.max(0.25, Math.round(factor * 100) / 100));
}

export interface TabHit {
  id: string;
  label: string;
  url?: string;
  kind: TabState['kind'];
  score: number;
  positions: number[];
}

/**
 * Subsequence match with a small ranking: prefix > word-start > substring.
 * Deliberately tiny — tab search must feel instant on every keystroke.
 */
export function scoreText(haystack: string, query: string): { score: number; positions: number[] } | null {
  if (!query) return { score: 0, positions: [] };
  const h = haystack.toLowerCase();
  const q = query.toLowerCase();
  const direct = h.indexOf(q);
  const positions: number[] = [];
  if (direct >= 0) {
    for (let i = 0; i < q.length; i += 1) positions.push(direct + i);
    const wordStart = direct === 0 || /[^a-z0-9]/i.test(h[direct - 1] ?? '');
    return { score: (direct === 0 ? 120 : wordStart ? 90 : 60) - h.length, positions };
  }
  let qi = 0;
  for (let i = 0; i < h.length && qi < q.length; i += 1) {
    if (h[i] === q[qi]) {
      positions.push(i);
      qi += 1;
    }
  }
  if (qi === q.length) return { score: 30 - h.length + q.length, positions };
  return null;
}

export function searchTabs(tabs: TabState[], query: string, limit = 8): TabHit[] {
  const hits: TabHit[] = [];
  for (const tab of tabs) {
    const label = tabLabel(tab);
    const url = tab.kind === 'web' ? tab.url : undefined;
    const byLabel = scoreText(label, query);
    const byUrl = url ? scoreText(url, query) : null;
    const best = !byLabel ? byUrl : !byUrl ? byLabel : byLabel.score >= byUrl.score ? byLabel : byUrl;
    if (!best) continue;
    hits.push({
      id: tab.id,
      label,
      url,
      kind: tab.kind,
      score: best.score,
      positions: best.positions,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return hits.slice(0, limit);
}

export function readingEntry(id: string, url: string, title: string, words: number, favicon?: string): ReadingEntry {
  return {
    id,
    url,
    title: title.slice(0, 160),
    favicon,
    addedAt: Date.now(),
    minutes: readingMinutes(words),
    words,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A single friendly line for the reader's meta row. */
export function readerMeta(article: { siteName?: string; byline?: string; minutes: number }): string {
  return [article.siteName, article.byline, `${article.minutes} min read`].filter(Boolean).join(' · ');
}
