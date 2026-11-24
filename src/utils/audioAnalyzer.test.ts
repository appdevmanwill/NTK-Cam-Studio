import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMonoAudio,
  DEFAULT_REPETITION_RULES,
  DEFAULT_SILENCE_RULES,
  detectRepetitions,
  detectSilences,
  spliceAudioSegments,
} from './audioAnalyzer';
import {
  clampCutBounds,
  computeKeptSegments,
  computeTimelineSummary,
  findNextPlayableTime,
  replaceAutoCutsByReason,
} from './timelineCuts';
import type { TimelineCut } from '../types/studio';

/**
 * Helper to synthesize a speech-like multi-syllable burst with distinct spectral & rhythm cadence.
 */
function writePhrase(
  buf: Float32Array,
  sampleRate: number,
  startSec: number,
  syllables: Array<{ dur: number; gap: number; f1: number; f2: number; amp: number }>
): number {
  let cursor = startSec;
  for (const syl of syllables) {
    const startIdx = Math.floor(cursor * sampleRate);
    const len = Math.floor(syl.dur * sampleRate);
    for (let i = 0; i < len && startIdx + i < buf.length; i++) {
      const t = i / sampleRate;
      const env = Math.sin((Math.PI * i) / Math.max(1, len));
      const val =
        (Math.sin(2 * Math.PI * syl.f1 * t) * 0.6 +
          Math.sin(2 * Math.PI * syl.f2 * t) * 0.4) *
        syl.amp *
        env;
      buf[startIdx + i] += val;
    }
    cursor += syl.dur + syl.gap;
  }
  return cursor;
}

test('detectSilences ignores short natural pauses and flags long silences with breath padding', () => {
  const sr = 16000;
  const totalSec = 6.0;
  const mono = new Float32Array(sr * totalSec);

  // Speech 1: 0.2s .. 1.0s
  writePhrase(mono, sr, 0.2, [
    { dur: 0.35, gap: 0.08, f1: 300, f2: 950, amp: 0.4 },
    { dur: 0.35, gap: 0.0, f1: 360, f2: 1200, amp: 0.4 },
  ]);
  // Short breath pause: 1.0s .. 1.3s (0.3s < 0.7s minDuration -> MUST BE KEPT)
  // Speech 2: 1.3s .. 2.1s
  writePhrase(mono, sr, 1.3, [
    { dur: 0.38, gap: 0.06, f1: 320, f2: 1050, amp: 0.42 },
    { dur: 0.36, gap: 0.0, f1: 420, f2: 1400, amp: 0.38 },
  ]);
  // Long silence: 2.1s .. 3.8s (1.7s >= 0.7s -> MUST BE FLAGGED)
  // Speech 3: 3.8s .. 5.5s
  writePhrase(mono, sr, 3.8, [
    { dur: 0.5, gap: 0.08, f1: 280, f2: 900, amp: 0.45 },
    { dur: 0.5, gap: 0.08, f1: 340, f2: 1150, amp: 0.4 },
    { dur: 0.5, gap: 0.0, f1: 390, f2: 1300, amp: 0.4 },
  ]);

  const analysis = analyzeMonoAudio(mono, sr, 120);
  assert.equal(analysis.hasAudibleSignal, true);
  assert.equal(analysis.waveformPeaks.length, 120);

  const silences = detectSilences(mono, sr, DEFAULT_SILENCE_RULES);
  assert.equal(silences.length, 1, 'Expected exactly 1 long silence cut');
  const cut = silences[0];
  assert.equal(cut.reason, 'silence');
  assert.equal(cut.enabled, true);
  // With 0.12s breath padding on both sides of [2.1, 3.8], cut should sit near [2.22, 3.68]
  assert.ok(cut.start >= 2.15 && cut.start <= 2.35, `Unexpected cut start ${cut.start}`);
  assert.ok(cut.end >= 3.55 && cut.end <= 3.76, `Unexpected cut end ${cut.end}`);

  // Tightening minDurationSec to 0.25s should also catch the 0.3s short pause
  const strictSilences = detectSilences(mono, sr, {
    ...DEFAULT_SILENCE_RULES,
    minDurationSec: 0.25,
    paddingSec: 0.04,
  });
  assert.ok(strictSilences.length >= 2, 'Stricter minDurationSec should catch shorter pauses');
});

test('detectRepetitions flags repeated phrase and respects Keep Last vs Keep First take rule', () => {
  const sr = 16000;
  const totalSec = 7.5;
  const mono = new Float32Array(sr * totalSec);

  const phraseA = [
    { dur: 0.26, gap: 0.05, f1: 280, f2: 920, amp: 0.45 },
    { dur: 0.22, gap: 0.05, f1: 420, f2: 1550, amp: 0.35 },
    { dur: 0.3, gap: 0.0, f1: 310, f2: 1100, amp: 0.5 },
  ];
  const phraseDistinct = [
    { dur: 0.42, gap: 0.06, f1: 950, f2: 3400, amp: 0.5 },
    { dur: 0.38, gap: 0.0, f1: 1100, f2: 3600, amp: 0.22 },
  ];

  // Take 1 of phrase A at t=0.4s..1.28s
  writePhrase(mono, sr, 0.4, phraseA);
  // Pause 0.72s, then Take 2 of phrase A at t=2.0s..2.88s (repeated!)
  writePhrase(mono, sr, 2.0, phraseA);
  // Pause 0.8s, then completely different phrase at t=3.7s..4.56s
  writePhrase(mono, sr, 3.7, phraseDistinct);

  const keepLastCuts = detectRepetitions(mono, sr, {
    ...DEFAULT_REPETITION_RULES,
    keepTake: 'last',
  });
  assert.equal(keepLastCuts.length, 1, 'Should detect exactly 1 repeated phrase');
  assert.equal(keepLastCuts[0].reason, 'repetition');
  assert.ok(keepLastCuts[0].start < 0.8 && keepLastCuts[0].end < 1.6, 'Keep Last should cut first take');
  assert.ok((keepLastCuts[0].confidence ?? 0) >= 75);

  const keepFirstCuts = detectRepetitions(mono, sr, {
    ...DEFAULT_REPETITION_RULES,
    keepTake: 'first',
  });
  assert.equal(keepFirstCuts.length, 1);
  assert.ok(keepFirstCuts[0].start >= 1.8 && keepFirstCuts[0].end <= 3.1, 'Keep First should cut second take');
});

test('detectRepetitions catches false-start prefix repetitions before a full retake', () => {
  const sr = 16000;
  const mono = new Float32Array(sr * 6.5);

  const opening = [
    { dur: 0.25, gap: 0.04, f1: 300, f2: 1000, amp: 0.45 },
    { dur: 0.25, gap: 0.04, f1: 420, f2: 1500, amp: 0.38 },
  ];
  const continuation = [
    { dur: 0.32, gap: 0.05, f1: 800, f2: 2600, amp: 0.42 },
    { dur: 0.36, gap: 0.0, f1: 350, f2: 1200, amp: 0.46 },
  ];

  // False start at t=0.4..0.98
  writePhrase(mono, sr, 0.4, opening);
  // Full retake at t=1.6..2.92 starting with the same opening
  writePhrase(mono, sr, 1.6, [...opening, ...continuation]);

  const cuts = detectRepetitions(mono, sr, DEFAULT_REPETITION_RULES);
  assert.equal(cuts.length, 1, 'Should detect the false-start prefix repetition');
  assert.ok(cuts[0].label.toLowerCase().includes('repeated start'));
  assert.ok(cuts[0].start <= 0.5 && cuts[0].end <= 1.2);
});

test('computeKeptSegments, computeTimelineSummary, and findNextPlayableTime handle cuts cleanly', () => {
  const cuts: TimelineCut[] = [
    { id: 'c1', start: 2.0, end: 3.5, reason: 'silence', enabled: true, label: 'Silence #1' },
    { id: 'c2', start: 5.0, end: 6.2, reason: 'repetition', enabled: false, label: 'Rep #1 (kept)' },
    { id: 'c3', start: 7.0, end: 8.5, reason: 'manual', enabled: true, label: 'Manual #1' },
  ];

  const kept = computeKeptSegments(10, 0.5, 9.5, cuts);
  assert.deepEqual(kept, [
    { start: 0.5, end: 2.0 },
    { start: 3.5, end: 7.0 },
    { start: 8.5, end: 9.5 },
  ]);

  const summary = computeTimelineSummary(10, 0.5, 9.5, cuts);
  assert.equal(summary.trimmedSpan, 9.0);
  assert.equal(summary.editedDuration, 6.0);
  assert.equal(summary.savedDuration, 3.0);
  assert.equal(summary.activeCutCount, 2);
  assert.equal(summary.silenceCutCount, 1);
  assert.equal(summary.repetitionCutCount, 0);
  assert.equal(summary.manualCutCount, 1);

  // Playback inside active cut [2.0, 3.5] jumps to 3.5
  const jumpRes = findNextPlayableTime(2.2, 0.5, 9.5, cuts);
  assert.equal(jumpRes.action, 'jump');
  assert.equal(jumpRes.targetTime, 3.5);

  // Playback inside disabled cut [5.0, 6.2] continues normally
  const contRes = findNextPlayableTime(5.4, 0.5, 9.5, cuts);
  assert.equal(contRes.action, 'continue');

  // Playback past trimEnd stops & rewinds to first kept segment
  const stopRes = findNextPlayableTime(9.5, 0.5, 9.5, cuts);
  assert.equal(stopRes.action, 'stop');
  assert.equal(stopRes.targetTime, 0.5);

  // replaceAutoCutsByReason preserves manual cuts while refreshing silence cuts
  const replaced = replaceAutoCutsByReason(
    cuts,
    [{ id: 's-new', start: 1.0, end: 1.5, reason: 'silence', enabled: true, label: 'New Sil' }],
    'silence'
  );
  assert.equal(replaced.some((c) => c.id === 'c3'), true);
  assert.equal(replaced.some((c) => c.id === 's-new'), true);
  assert.equal(replaced.some((c) => c.id === 'c1'), false);

  const clamped = clampCutBounds(-2, 0.02, 5, 0.15);
  assert.equal(clamped.start, 0);
  assert.equal(clamped.end, 0.15);
});

test('spliceAudioSegments concatenates kept segments with click-free fades', () => {
  const sr = 10000;
  const ch = new Float32Array(sr * 4).fill(0.8);
  const spliced = spliceAudioSegments(
    [ch],
    sr,
    [
      { start: 0, end: 1.0 },
      { start: 2.0, end: 3.5 },
    ],
    8
  );
  assert.equal(spliced.length, 1);
  // 1.0s + 1.5s = 2.5s = 25000 samples
  assert.equal(spliced[0].length, 25000);
  // Boundary around sample 10000 should be softly faded near 0 (no sudden click)
  assert.ok(spliced[0][9999] < 0.05);
  assert.ok(spliced[0][10000] < 0.05);
  // Mid-segment should remain full amplitude 0.8
  assert.ok(Math.abs(spliced[0][5000] - 0.8) < 1e-4);
});
