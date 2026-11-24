import type { CutReason, TimelineCut, TimeRange } from '../types/studio';

export interface TimelineSummary {
  originalDuration: number;
  trimmedSpan: number;
  editedDuration: number;
  savedDuration: number;
  activeCutCount: number;
  silenceCutCount: number;
  repetitionCutCount: number;
  manualCutCount: number;
  keptSegments: TimeRange[];
}

function roundTime(sec: number): number {
  return Math.round(sec * 100) / 100;
}

/**
 * Sorts and merges overlapping or nearly-touching time ranges.
 */
export function mergeRanges(ranges: TimeRange[], minGapSec = 0.04): TimeRange[] {
  const valid = ranges
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .map((r) => ({ start: r.start, end: r.end }))
    .sort((a, b) => a.start - b.start);

  if (valid.length <= 1) return valid;

  const merged: TimeRange[] = [valid[0]];
  for (let i = 1; i < valid.length; i++) {
    const curr = valid[i];
    const last = merged[merged.length - 1];
    if (curr.start <= last.end + minGapSec) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

/**
 * Clamps a cut's start/end bounds cleanly inside [0, durationSec] with a minimum cut length.
 */
export function clampCutBounds(
  start: number,
  end: number,
  durationSec: number,
  minSpan = 0.1
): TimeRange {
  const safeDur = Math.max(0.2, Number.isFinite(durationSec) ? durationSec : 0.2);
  const clampedStart = Math.max(0, Math.min(safeDur - minSpan, Number.isFinite(start) ? start : 0));
  const clampedEnd = Math.max(
    clampedStart + minSpan,
    Math.min(safeDur, Number.isFinite(end) ? end : safeDur)
  );
  return {
    start: roundTime(clampedStart),
    end: roundTime(clampedEnd),
  };
}

/**
 * Computes the ordered chronological kept segments inside [trimStart, trimEnd]
 * after subtracting all enabled cuts. Guarantees at least a tiny fallback segment
 * if the user accidentally cuts the entire clip.
 */
export function computeKeptSegments(
  durationSec: number,
  trimStart: number,
  trimEnd: number,
  cuts: TimelineCut[]
): TimeRange[] {
  const safeDur = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  const tStart = Math.max(0, Math.min(safeDur, trimStart));
  const tEnd = Math.max(tStart, Math.min(safeDur, trimEnd));
  if (tEnd - tStart <= 0.02) return [];

  const activeClipped = cuts
    .filter((c) => c.enabled)
    .map((c) => ({
      start: Math.max(tStart, c.start),
      end: Math.min(tEnd, c.end),
    }))
    .filter((c) => c.end - c.start >= 0.05);

  const mergedCuts = mergeRanges(activeClipped, 0.04);
  if (mergedCuts.length === 0) {
    return [{ start: roundTime(tStart), end: roundTime(tEnd) }];
  }

  const kept: TimeRange[] = [];
  let cursor = tStart;

  for (const cut of mergedCuts) {
    if (cut.start > cursor + 0.05) {
      kept.push({ start: roundTime(cursor), end: roundTime(cut.start) });
    }
    cursor = Math.max(cursor, cut.end);
  }

  if (tEnd > cursor + 0.05) {
    kept.push({ start: roundTime(cursor), end: roundTime(tEnd) });
  }

  return kept;
}

/**
 * Computes complete summary metrics for the post-recording cut editor UI.
 */
export function computeTimelineSummary(
  durationSec: number,
  trimStart: number,
  trimEnd: number,
  cuts: TimelineCut[]
): TimelineSummary {
  const originalDuration = Math.max(0, roundTime(durationSec));
  const trimmedSpan = Math.max(0, roundTime(Math.max(0, trimEnd - trimStart)));
  const keptSegments = computeKeptSegments(durationSec, trimStart, trimEnd, cuts);
  const editedDuration = roundTime(
    keptSegments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0)
  );
  const savedDuration = Math.max(0, roundTime(trimmedSpan - editedDuration));

  let activeCutCount = 0;
  let silenceCutCount = 0;
  let repetitionCutCount = 0;
  let manualCutCount = 0;

  for (const cut of cuts) {
    if (!cut.enabled) continue;
    const overlapsTrim = cut.end > trimStart + 0.05 && cut.start < trimEnd - 0.05;
    if (!overlapsTrim) continue;
    activeCutCount++;
    if (cut.reason === 'silence') silenceCutCount++;
    else if (cut.reason === 'repetition') repetitionCutCount++;
    else manualCutCount++;
  }

  return {
    originalDuration,
    trimmedSpan,
    editedDuration,
    savedDuration,
    activeCutCount,
    silenceCutCount,
    repetitionCutCount,
    manualCutCount,
    keptSegments,
  };
}

/**
 * Determines how the preview `<video>` element should handle playback at `currentTime`
 * when "Skip cuts during preview" is active.
 */
export function findNextPlayableTime(
  currentTime: number,
  trimStart: number,
  trimEnd: number,
  cuts: TimelineCut[]
): { action: 'continue' | 'jump' | 'stop'; targetTime: number } {
  const kept = computeKeptSegments(Math.max(trimEnd, currentTime), trimStart, trimEnd, cuts);
  if (kept.length === 0) {
    return { action: 'stop', targetTime: trimStart };
  }

  const firstStart = kept[0].start;
  const lastEnd = kept[kept.length - 1].end;

  if (currentTime < firstStart - 0.04) {
    return { action: 'jump', targetTime: firstStart };
  }
  if (currentTime >= lastEnd - 0.03) {
    return { action: 'stop', targetTime: firstStart };
  }

  for (let i = 0; i < kept.length; i++) {
    const seg = kept[i];
    if (currentTime >= seg.start - 0.04 && currentTime < seg.end - 0.03) {
      return { action: 'continue', targetTime: currentTime };
    }
    if (currentTime < seg.start - 0.04) {
      return { action: 'jump', targetTime: seg.start };
    }
  }

  return { action: 'stop', targetTime: firstStart };
}

/**
 * Replaces auto-detected cuts of a specific reason ('silence' or 'repetition')
 * while preserving manual cuts and other auto-detected cut categories.
 */
export function replaceAutoCutsByReason(
  existingCuts: TimelineCut[],
  nextDetected: TimelineCut[],
  reason: Extract<CutReason, 'silence' | 'repetition'>
): TimelineCut[] {
  const preserved = existingCuts.filter((c) => c.reason !== reason);
  return [...preserved, ...nextDetected].sort((a, b) => a.start - b.start);
}
