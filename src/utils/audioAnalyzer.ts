import type {
  RepetitionDetectionRules,
  SilenceDetectionRules,
  TimelineCut,
  TimeRange,
} from '../types/studio';

export const DEFAULT_SILENCE_RULES: SilenceDetectionRules = {
  thresholdDb: -38,
  minDurationSec: 0.7,
  paddingSec: 0.12,
};

export const DEFAULT_REPETITION_RULES: RepetitionDetectionRules = {
  sensitivity: 0.74,
  minPhraseSec: 0.45,
  maxGapSec: 12,
  keepTake: 'last',
};

export interface SpeechUtterance {
  start: number;
  end: number;
  duration: number;
  features: Float32Array[]; // B bins × 5 normalized acoustic features
}

export interface AudioAnalysisResult {
  durationSec: number;
  sampleRate: number;
  waveformPeaks: number[];
  mono: Float32Array;
  noiseFloorDb: number;
  peakDb: number;
  hasAudibleSignal: boolean;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function roundTime(sec: number): number {
  return Math.round(sec * 100) / 100;
}

/**
 * Downmixes multi-channel PCM Float32Arrays to a single mono Float32Array.
 */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const mono = new Float32Array(len);
  const inv = 1 / channels.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      sum += channels[ch][i] ?? 0;
    }
    mono[i] = sum * inv;
  }
  return mono;
}

/**
 * Downsamples mono PCM samples into normalized [0..1] amplitude bars for timeline waveform display.
 */
export function computeWaveformPeaks(mono: Float32Array, barCount = 180): number[] {
  if (mono.length === 0 || barCount <= 0) {
    return Array.from({ length: Math.max(0, barCount) }, () => 0);
  }
  const peaks: number[] = new Array(barCount);
  const samplesPerBar = mono.length / barCount;
  let globalMax = 0.001;

  for (let b = 0; b < barCount; b++) {
    const start = Math.floor(b * samplesPerBar);
    const end = Math.min(mono.length, Math.max(start + 1, Math.floor((b + 1) * samplesPerBar)));
    let maxAbs = 0;
    // Stride to stay ultra-fast even on 30-minute recordings
    const stride = Math.max(1, Math.floor((end - start) / 128));
    for (let i = start; i < end; i += stride) {
      const a = Math.abs(mono[i]);
      if (a > maxAbs) maxAbs = a;
    }
    peaks[b] = maxAbs;
    if (maxAbs > globalMax) globalMax = maxAbs;
  }

  // Normalize softly while preserving relative silence vs speech contrast
  const normScale = globalMax > 0.02 ? 1 / globalMax : 1;
  for (let b = 0; b < barCount; b++) {
    peaks[b] = Number(clamp(peaks[b] * normScale, 0, 1).toFixed(4));
  }
  return peaks;
}

/**
 * Computes frame-by-frame RMS loudness in dBFS (default 20ms frame resolution).
 */
export function computeRmsFrames(
  mono: Float32Array,
  sampleRate: number,
  frameMs = 20
): { rmsDb: Float32Array; frameSec: number } {
  const safeSr = Math.max(8000, sampleRate);
  const frameSamples = Math.max(64, Math.round((safeSr * frameMs) / 1000));
  const frameSec = frameSamples / safeSr;
  const frameCount = Math.ceil(mono.length / frameSamples);
  const rmsDb = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const start = f * frameSamples;
    const end = Math.min(mono.length, start + frameSamples);
    let sumSq = 0;
    const count = Math.max(1, end - start);
    for (let i = start; i < end; i++) {
      const s = mono[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / count);
    rmsDb[f] = rms > 1e-6 ? 20 * Math.log10(rms) : -120;
  }

  return { rmsDb, frameSec };
}

/**
 * Analyzes mono PCM audio into waveform bars and basic loudness diagnostics.
 */
export function analyzeMonoAudio(
  mono: Float32Array,
  sampleRate: number,
  barCount = 180
): AudioAnalysisResult {
  const safeSr = Math.max(8000, sampleRate);
  const durationSec = mono.length / safeSr;
  const waveformPeaks = computeWaveformPeaks(mono, barCount);
  const { rmsDb } = computeRmsFrames(mono, safeSr, 20);

  let peakDb = -120;
  const sortedDb = Array.from(rmsDb).sort((a, b) => a - b);
  for (let i = 0; i < rmsDb.length; i++) {
    if (rmsDb[i] > peakDb) peakDb = rmsDb[i];
  }
  const noiseFloorDb =
    sortedDb.length > 0 ? sortedDb[Math.floor(sortedDb.length * 0.15)] : -120;

  return {
    durationSec,
    sampleRate: safeSr,
    waveformPeaks,
    mono,
    noiseFloorDb,
    peakDb,
    hasAudibleSignal: peakDb > -65,
  };
}

/**
 * Pure rule-based silence detector.
 * Flags continuous quiet spans >= minDurationSec (below thresholdDb) and preserves natural
 * breath padding on both speech boundaries so edits sound clean and never clip words.
 */
export function detectSilences(
  mono: Float32Array,
  sampleRate: number,
  rules: SilenceDetectionRules = DEFAULT_SILENCE_RULES
): TimelineCut[] {
  if (mono.length === 0 || sampleRate <= 0) return [];
  const durationSec = mono.length / sampleRate;
  const { rmsDb, frameSec } = computeRmsFrames(mono, sampleRate, 20);
  const frameCount = rmsDb.length;
  if (frameCount === 0) return [];

  const thresholdDb = clamp(rules.thresholdDb, -70, -10);
  const minDurationSec = clamp(rules.minDurationSec, 0.2, 6);
  const paddingSec = clamp(rules.paddingSec, 0, 0.5);

  // Mark silent frames
  const isSilent = new Uint8Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    isSilent[i] = rmsDb[i] < thresholdDb ? 1 : 0;
  }

  // Bridge ultra-short non-silent clicks (< 60ms, i.e. 1–2 frames) surrounded by silence
  const glitchMaxFrames = Math.max(1, Math.round(0.06 / frameSec));
  let idx = 0;
  while (idx < frameCount) {
    if (isSilent[idx] === 0) {
      const start = idx;
      while (idx < frameCount && isSilent[idx] === 0) idx++;
      const runLen = idx - start;
      if (runLen <= glitchMaxFrames && start > 0 && idx < frameCount) {
        for (let k = start; k < idx; k++) isSilent[k] = 1;
      }
    } else {
      idx++;
    }
  }

  // Extract contiguous silent runs
  const cuts: TimelineCut[] = [];
  let cutIndex = 0;
  let f = 0;
  while (f < frameCount) {
    if (isSilent[f] === 1) {
      const runStart = f;
      while (f < frameCount && isSilent[f] === 1) f++;
      const runEnd = f;

      const rawStart = runStart * frameSec;
      const rawEnd = Math.min(durationSec, runEnd * frameSec);
      const rawDur = rawEnd - rawStart;

      if (rawDur >= minDurationSec) {
        // Keep breath padding inside speech edges, trim tightly at very start/end of clip
        const leftPad = runStart === 0 ? Math.min(paddingSec * 0.4, 0.05) : paddingSec;
        const rightPad = runEnd >= frameCount ? Math.min(paddingSec * 0.4, 0.05) : paddingSec;
        const cutStart = roundTime(clamp(rawStart + leftPad, 0, durationSec));
        const cutEnd = roundTime(clamp(rawEnd - rightPad, 0, durationSec));
        const cutDur = cutEnd - cutStart;

        if (cutDur >= 0.15) {
          cutIndex += 1;
          cuts.push({
            id: `silence-${cutIndex}-${Math.round(cutStart * 100)}`,
            start: cutStart,
            end: cutEnd,
            reason: 'silence',
            enabled: true,
            label: `Silence #${cutIndex}`,
          });
        }
      }
    } else {
      f++;
    }
  }

  return cuts;
}

/**
 * Fast Goertzel single-frequency power estimator (pure DSP, zero external deps).
 */
function goertzelPower(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
  targetFreqHz: number
): number {
  if (length <= 4) return 0;
  const omega = (2 * Math.PI * targetFreqHz) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let sPrev = 0;
  let sPrev2 = 0;
  const end = Math.min(samples.length, start + length);
  for (let i = start; i < end; i++) {
    const s = samples[i] + coeff * sPrev - sPrev2;
    sPrev2 = sPrev;
    sPrev = s;
  }
  const power = sPrev2 * sPrev2 + sPrev * sPrev - coeff * sPrev * sPrev2;
  return Math.max(0, power) / Math.max(1, length * length);
}

/**
 * Extracts a B-bin acoustic trajectory (5 features per bin: relative RMS, ZCR, Low/Mid/High band ratios)
 * from a time slice of mono PCM audio.
 */
function extractAcousticTrajectory(
  mono: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  binCount = 20
): Float32Array[] {
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(mono.length, Math.ceil(endSec * sampleRate));
  const totalLen = Math.max(1, endSample - startSample);
  const binLen = Math.max(16, Math.floor(totalLen / binCount));

  const rawBins: Float32Array[] = [];
  let maxRms = 1e-5;

  for (let b = 0; b < binCount; b++) {
    const bStart = startSample + Math.floor((b * totalLen) / binCount);
    const bEnd = Math.min(endSample, bStart + binLen);
    const len = Math.max(1, bEnd - bStart);

    let sumSq = 0;
    let zeroCrossings = 0;
    let prev = mono[bStart] ?? 0;
    for (let i = bStart; i < bEnd; i++) {
      const s = mono[i];
      sumSq += s * s;
      if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) {
        zeroCrossings++;
      }
      prev = s;
    }

    const rms = Math.sqrt(sumSq / len);
    if (rms > maxRms) maxRms = rms;
    const zcr = clamp((zeroCrossings / len) * 6, 0, 1);

    // 3-band spectral energy profile (voice fundamental, formants, sibilants)
    const lowP =
      goertzelPower(mono, bStart, len, sampleRate, 260) +
      goertzelPower(mono, bStart, len, sampleRate, 440);
    const midP =
      goertzelPower(mono, bStart, len, sampleRate, 880) +
      goertzelPower(mono, bStart, len, sampleRate, 1450);
    const highP =
      goertzelPower(mono, bStart, len, sampleRate, 2400) +
      goertzelPower(mono, bStart, len, sampleRate, 3600);

    const bandTotal = Math.sqrt(lowP) + Math.sqrt(midP) + Math.sqrt(highP) + 1e-7;
    const lowR = Math.sqrt(lowP) / bandTotal;
    const midR = Math.sqrt(midP) / bandTotal;
    const highR = Math.sqrt(highP) / bandTotal;

    rawBins.push(new Float32Array([rms, zcr, lowR, midR, highR]));
  }

  // Normalize RMS per utterance so quiet and loud retakes match accurately
  for (let b = 0; b < binCount; b++) {
    rawBins[b][0] = rawBins[b][0] / maxRms;
  }

  return rawBins;
}

/**
 * Banded Dynamic Time Warping similarity (0..1) between two equal-length 5D acoustic feature sequences.
 * Handles slight speaking speed changes between repeated takes without requiring any AI model.
 */
function computeTrajectorySimilarity(seqA: Float32Array[], seqB: Float32Array[], band = 3): number {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return 0;

  // Weighted feature distance per frame pair (RMS rhythm + ZCR + 3 spectral bands)
  const weights = [1.45, 0.9, 1.1, 1.25, 1.1];
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const frameDist = (a: Float32Array, b: Float32Array): number => {
    let acc = 0;
    for (let k = 0; k < 5; k++) {
      const diff = a[k] - b[k];
      acc += weights[k] * diff * diff;
    }
    return Math.sqrt(acc / weightSum);
  };

  const INF = 1e9;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
  dp[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    const jStart = Math.max(1, i - band);
    const jEnd = Math.min(m, i + band);
    for (let j = jStart; j <= jEnd; j++) {
      const cost = frameDist(seqA[i - 1], seqB[j - 1]);
      const prev = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      dp[i][j] = cost + prev;
    }
  }

  const pathCost = dp[n][m] / Math.max(n, m);
  // Map average per-frame normalized distance [0..0.55] smoothly to [1..0] similarity
  const sim = Math.exp(-pathCost * 3.1);
  return clamp(sim, 0, 1);
}

/**
 * Segments mono PCM audio into individual speech utterances separated by pauses.
 */
export function segmentSpeechUtterances(
  mono: Float32Array,
  sampleRate: number,
  speechThresholdDb = -38,
  minPauseSplitSec = 0.24,
  minUtteranceSec = 0.45
): SpeechUtterance[] {
  if (mono.length === 0 || sampleRate <= 0) return [];
  const durationSec = mono.length / sampleRate;
  const { rmsDb, frameSec } = computeRmsFrames(mono, sampleRate, 20);
  const frameCount = rmsDb.length;
  if (frameCount === 0) return [];

  const isSpeech = new Uint8Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    isSpeech[i] = rmsDb[i] >= speechThresholdDb ? 1 : 0;
  }

  // Bridge brief intra-phrase pauses shorter than minPauseSplitSec
  const maxBridgeFrames = Math.max(1, Math.round(minPauseSplitSec / frameSec));
  let idx = 0;
  while (idx < frameCount) {
    if (isSpeech[idx] === 0) {
      const start = idx;
      while (idx < frameCount && isSpeech[idx] === 0) idx++;
      const gapLen = idx - start;
      if (gapLen < maxBridgeFrames && start > 0 && idx < frameCount) {
        for (let k = start; k < idx; k++) isSpeech[k] = 1;
      }
    } else {
      idx++;
    }
  }

  const utterances: SpeechUtterance[] = [];
  let f = 0;
  while (f < frameCount) {
    if (isSpeech[f] === 1) {
      const uStart = f;
      while (f < frameCount && isSpeech[f] === 1) f++;
      const uEnd = f;
      const startSec = roundTime(uStart * frameSec);
      const endSec = roundTime(Math.min(durationSec, uEnd * frameSec));
      const dur = endSec - startSec;
      if (dur >= minUtteranceSec) {
        utterances.push({
          start: startSec,
          end: endSec,
          duration: dur,
          features: extractAcousticTrajectory(mono, sampleRate, startSec, endSec, 20),
        });
      }
    } else {
      f++;
    }
  }

  return utterances;
}

/**
 * Pure rule-based repetition & false-start detector (zero AI / zero network).
 * Compares nearby speech utterances using multi-band acoustic trajectories + banded DTW:
 * 1. Full repeated phrases (e.g., speaker re-records a sentence after pausing).
 * 2. False-start prefix repetitions (e.g., "So today we..." [pause] "So today we will cover...").
 */
export function detectRepetitions(
  mono: Float32Array,
  sampleRate: number,
  rules: RepetitionDetectionRules = DEFAULT_REPETITION_RULES,
  speechThresholdDb = -38
): TimelineCut[] {
  if (mono.length === 0 || sampleRate <= 0) return [];

  const sensitivity = clamp(rules.sensitivity, 0.5, 0.95);
  const minPhraseSec = clamp(rules.minPhraseSec, 0.3, 4);
  const maxGapSec = clamp(rules.maxGapSec, 1, 30);

  const utterances = segmentSpeechUtterances(
    mono,
    sampleRate,
    speechThresholdDb,
    0.24,
    minPhraseSec
  );
  if (utterances.length < 2) return [];

  const flagged = new Map<number, { kind: 'repeat' | 'false-start'; score: number }>();

  for (let i = 0; i < utterances.length; i++) {
    const uA = utterances[i];
    // Compare with up to 3 subsequent utterances within maxGapSec
    for (let j = i + 1; j < Math.min(utterances.length, i + 4); j++) {
      const uB = utterances[j];
      const gap = uB.start - uA.end;
      if (gap > maxGapSec) break;

      const minDur = Math.min(uA.duration, uB.duration);
      const maxDur = Math.max(uA.duration, uB.duration);
      const durRatio = minDur / Math.max(0.01, maxDur);

      // Rule A: Full phrase retake (similar duration & high DTW similarity)
      if (durRatio >= 0.58) {
        const sim = computeTrajectorySimilarity(uA.features, uB.features, 3);
        if (sim >= sensitivity) {
          const targetIdx = rules.keepTake === 'last' ? i : j;
          const prev = flagged.get(targetIdx);
          if (!prev || sim > prev.score) {
            flagged.set(targetIdx, { kind: 'repeat', score: sim });
          }
          continue;
        }
      }

      // Rule B: False-start prefix repetition (short opening A matches start of longer retake B)
      if (uA.duration <= 2.4 && uB.duration >= uA.duration * 1.18) {
        const prefixEnd = Math.min(uB.end, uB.start + uA.duration * 1.05);
        const prefixFeat = extractAcousticTrajectory(mono, sampleRate, uB.start, prefixEnd, 20);
        const prefixSim = computeTrajectorySimilarity(uA.features, prefixFeat, 2);
        if (prefixSim >= Math.min(0.95, sensitivity + 0.03)) {
          const prev = flagged.get(i);
          if (!prev || prefixSim > prev.score) {
            flagged.set(i, { kind: 'false-start', score: prefixSim });
          }
        }
      }
    }
  }

  const durationSec = mono.length / sampleRate;
  const cuts: TimelineCut[] = [];
  let repCount = 0;

  Array.from(flagged.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([uIdx, meta]) => {
      const utt = utterances[uIdx];
      const cutStart = roundTime(clamp(utt.start - 0.04, 0, durationSec));
      const cutEnd = roundTime(clamp(utt.end + 0.04, 0, durationSec));
      if (cutEnd - cutStart < 0.15) return;
      repCount += 1;
      const pct = Math.round(meta.score * 100);
      cuts.push({
        id: `repetition-${repCount}-${Math.round(cutStart * 100)}`,
        start: cutStart,
        end: cutEnd,
        reason: 'repetition',
        enabled: true,
        confidence: pct,
        label:
          meta.kind === 'false-start'
            ? `Repeated start #${repCount}`
            : `Repetition #${repCount}`,
      });
    });

  return cuts;
}

/**
 * Splices multi-channel PCM audio to keep ONLY the specified time segments,
 * applying a smooth micro-crossfade at cut boundaries to prevent clicks or pops.
 */
export function spliceAudioSegments(
  channels: Float32Array[],
  sampleRate: number,
  segments: TimeRange[],
  crossfadeMs = 8
): Float32Array[] {
  if (channels.length === 0) return [];
  const totalSourceFrames = channels[0].length;
  const safeSr = Math.max(8000, sampleRate);

  const sampleSlices: Array<{ start: number; end: number }> = [];
  for (const seg of segments) {
    const s = Math.max(0, Math.min(totalSourceFrames, Math.floor(seg.start * safeSr)));
    const e = Math.max(s, Math.min(totalSourceFrames, Math.ceil(seg.end * safeSr)));
    if (e > s) {
      sampleSlices.push({ start: s, end: e });
    }
  }

  if (sampleSlices.length === 0) {
    return channels.map(() => new Float32Array(0));
  }

  const fadeSamples = Math.max(0, Math.round((safeSr * crossfadeMs) / 1000));
  let totalOutFrames = 0;
  for (const sl of sampleSlices) {
    totalOutFrames += sl.end - sl.start;
  }

  return channels.map((ch) => {
    const out = new Float32Array(totalOutFrames);
    let writePos = 0;

    sampleSlices.forEach((sl, sliceIdx) => {
      const len = sl.end - sl.start;
      out.set(ch.subarray(sl.start, sl.end), writePos);

      const localFade = Math.min(fadeSamples, Math.floor(len / 4));
      if (localFade > 1) {
        // Soft fade-in at cut entry (after previous cut)
        if (sliceIdx > 0) {
          for (let i = 0; i < localFade; i++) {
            out[writePos + i] *= i / localFade;
          }
        }
        // Soft fade-out at cut exit (before next cut)
        if (sliceIdx < sampleSlices.length - 1) {
          for (let i = 0; i < localFade; i++) {
            out[writePos + len - 1 - i] *= i / localFade;
          }
        }
      }

      writePos += len;
    });

    return out;
  });
}
