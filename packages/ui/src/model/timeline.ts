import type { RunEvent } from "./types.js";

/** A pause in the run longer than the gap threshold, collapsed on the replay clock. */
export interface Pause {
  /** Replay seconds where the pause starts and ends. */
  from: number;
  to: number;
  realFrom: number;
  realTo: number;
}

export interface Timeline {
  /** Real start/end (ms since epoch). */
  start: number;
  end: number;
  /** Replay seconds of each event, same order as the events. */
  at: number[];
  /** Total replay seconds. */
  duration: number;
  pauses: Pause[];
}

export interface TimelineOptions {
  /** Known pauses (ms since epoch), e.g. the run model's gaps. When set, `maxGapMs` is not used. */
  gaps?: { start: number; end: number }[];
  /** Gaps longer than this become pauses. Default 15 minutes. */
  maxGapMs?: number;
  /** Replay seconds a pause takes. Default 20. */
  pauseSeconds?: number;
}

export function buildTimeline(events: RunEvent[], opts: TimelineOptions = {}): Timeline {
  const maxGap = opts.maxGapMs ?? 15 * 60_000;
  const pauseS = opts.pauseSeconds ?? 20;
  const at: number[] = [];
  const pauses: Pause[] = [];
  let prevReal: number | undefined;
  let v = 0;
  let start = 0;
  for (const e of events) {
    let real = Date.parse(e.ts);
    if (!Number.isFinite(real)) real = prevReal ?? 0;
    if (prevReal === undefined) {
      start = real;
    } else {
      const from = prevReal;
      const gap = Math.max(0, real - from);
      const isPause = opts.gaps
        ? opts.gaps.some((g) => g.start >= from && g.end <= real && g.end > g.start)
        : gap > maxGap;
      if (isPause && gap > 0) {
        pauses.push({ from: v, to: v + pauseS, realFrom: prevReal, realTo: real });
        v += pauseS;
      } else {
        v += gap / 1000;
      }
    }
    at.push(v);
    prevReal = real;
  }
  return { start, end: prevReal ?? start, at, duration: v, pauses };
}

/** Number of events at or before replay second `t` (binary search). */
export function countAt(tl: Timeline, t: number): number {
  let lo = 0;
  let hi = tl.at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((tl.at[mid] ?? 0) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function pauseAt(tl: Timeline, t: number): Pause | undefined {
  return tl.pauses.find((p) => t >= p.from && t < p.to);
}

/** Real time (ms) at replay second `t`. Inside a pause the real clock moves through the whole gap. */
export function realAt(tl: Timeline, t: number): number {
  let real = tl.start;
  let v = 0;
  for (const p of tl.pauses) {
    if (t < p.from) return real + (t - v) * 1000;
    if (t < p.to) return p.realFrom + ((t - p.from) / (p.to - p.from)) * (p.realTo - p.realFrom);
    real = p.realTo;
    v = p.to;
  }
  return Math.min(real + (t - v) * 1000, tl.end);
}
