export type DisplaySurfaceKind = 'monitor' | 'window' | 'browser' | 'application' | 'unknown';

export interface ScreenShareInfo {
  active: boolean;
  surfaceKind: DisplaySurfaceKind;
  surfaceLabel: string;
  sourceName: string;
  resolutionLabel: string | null;
  hasSystemAudio: boolean;
}

export interface RawTrackDescriptor {
  label?: string | null;
  displaySurface?: string | null;
  width?: number | null;
  height?: number | null;
  hasSystemAudio?: boolean;
}

const SURFACE_LABELS: Record<DisplaySurfaceKind, string> = {
  monitor: 'Entire Screen',
  window: 'Window',
  browser: 'Browser Tab',
  application: 'Application',
  unknown: 'Screen Share',
};

function normalizeSurfaceKind(raw?: string | null): DisplaySurfaceKind {
  if (!raw) return 'unknown';
  const lowered = raw.toLowerCase();
  if (lowered === 'monitor' || lowered === 'screen') return 'monitor';
  if (lowered === 'window') return 'window';
  if (lowered === 'browser' || lowered === 'tab') return 'browser';
  if (lowered === 'application') return 'application';
  return 'unknown';
}

/**
 * Pure parser that converts browser getDisplayMedia video track metadata
 * (displaySurface + raw Chromium/Firefox/Safari track labels) into a clean,
 * human-readable description of what the audience sees.
 */
export function parseScreenShareInfo(descriptor: RawTrackDescriptor | null): ScreenShareInfo {
  if (!descriptor) {
    return {
      active: false,
      surfaceKind: 'unknown',
      surfaceLabel: 'Not Sharing',
      sourceName: 'No screen selected',
      resolutionLabel: null,
      hasSystemAudio: false,
    };
  }

  const rawLabel = (descriptor.label ?? '').trim();
  let surfaceKind = normalizeSurfaceKind(descriptor.displaySurface);

  // Infer surface kind from common Chromium/Firefox label patterns if displaySurface is missing
  const screenMatch = rawLabel.match(/^screen:(\d+)(?::\d+)?$/i);
  const windowIdMatch = rawLabel.match(/^window:(\d+)(?::\d+)?$/i);
  const webContentsMatch = /^web-contents-media-stream:\/\//i.test(rawLabel);
  const tabIdMatch = /^tab:\d+/i.test(rawLabel);

  if (surfaceKind === 'unknown') {
    if (screenMatch) surfaceKind = 'monitor';
    else if (windowIdMatch) surfaceKind = 'window';
    else if (webContentsMatch || tabIdMatch) surfaceKind = 'browser';
  }

  let sourceName: string;
  if (screenMatch) {
    const displayNum = parseInt(screenMatch[1], 10);
    sourceName = Number.isFinite(displayNum) ? `Display ${displayNum + 1}` : 'Primary Display';
  } else if (windowIdMatch) {
    sourceName = 'Application Window';
  } else if (webContentsMatch || tabIdMatch) {
    sourceName = 'Browser Tab';
  } else if (rawLabel.length > 0) {
    // Strip redundant leading prefixes like "window:" or "tab:" when followed by a real title
    const cleaned = rawLabel
      .replace(/^(?:window|screen|tab)\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    sourceName = cleaned.length > 0 ? cleaned : SURFACE_LABELS[surfaceKind];
  } else {
    sourceName =
      surfaceKind === 'monitor'
        ? 'Primary Display'
        : surfaceKind === 'window'
          ? 'Application Window'
          : surfaceKind === 'browser'
            ? 'Browser Tab'
            : 'Live Screen';
  }

  const width = descriptor.width && descriptor.width > 0 ? Math.round(descriptor.width) : null;
  const height = descriptor.height && descriptor.height > 0 ? Math.round(descriptor.height) : null;
  const resolutionLabel = width && height ? `${width}×${height}` : null;

  return {
    active: true,
    surfaceKind,
    surfaceLabel: SURFACE_LABELS[surfaceKind],
    sourceName,
    resolutionLabel,
    hasSystemAudio: Boolean(descriptor.hasSystemAudio),
  };
}

/**
 * Extracts normalized ScreenShareInfo from a live browser MediaStream.
 */
export function extractScreenShareInfoFromStream(stream: MediaStream | null): ScreenShareInfo {
  if (!stream) {
    return parseScreenShareInfo(null);
  }
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) {
    return parseScreenShareInfo(null);
  }
  const settings =
    typeof videoTrack.getSettings === 'function'
      ? (videoTrack.getSettings() as MediaTrackSettings & { displaySurface?: string })
      : {};
  return parseScreenShareInfo({
    label: videoTrack.label,
    displaySurface: settings.displaySurface ?? null,
    width: settings.width ?? null,
    height: settings.height ?? null,
    hasSystemAudio: stream.getAudioTracks().length > 0,
  });
}

export type MicSignalState = 'off' | 'quiet' | 'capturing' | 'hot' | 'clipping';

export interface WaveformFrameMetrics {
  /** Normalized bar heights (0..1) ready for canvas rendering */
  bars: number[];
  /** Overall frame RMS amplitude (0..1) */
  rms: number;
  /** Peak sample excursion (0..1) */
  peak: number;
}

/**
 * Converts raw AnalyserNode time-domain bytes (0..255 centered at 128) into
 * smoothly interpolated symmetric waveform bars with perceptual gain lift.
 */
export function computeWaveformBars(
  timeDomainBytes: Uint8Array,
  barCount: number,
  prevBars?: number[] | null
): WaveformFrameMetrics {
  const safeCount = Math.max(4, Math.min(64, Math.floor(barCount)));
  if (!timeDomainBytes || timeDomainBytes.length === 0) {
    return {
      bars: new Array<number>(safeCount).fill(0),
      rms: 0,
      peak: 0,
    };
  }

  let totalSumSq = 0;
  let globalPeak = 0;
  for (let i = 0; i < timeDomainBytes.length; i++) {
    const v = (timeDomainBytes[i] - 128) / 128;
    const abs = Math.abs(v);
    totalSumSq += v * v;
    if (abs > globalPeak) globalPeak = abs;
  }
  const rms = Math.sqrt(totalSumSq / timeDomainBytes.length);

  const bars = new Array<number>(safeCount);
  const samplesPerBar = timeDomainBytes.length / safeCount;

  for (let b = 0; b < safeCount; b++) {
    const start = Math.floor(b * samplesPerBar);
    const end = Math.max(start + 1, Math.floor((b + 1) * samplesPerBar));
    let bucketPeak = 0;
    let bucketSumSq = 0;
    const count = Math.max(1, end - start);

    for (let i = start; i < end && i < timeDomainBytes.length; i++) {
      const sample = Math.abs((timeDomainBytes[i] - 128) / 128);
      if (sample > bucketPeak) bucketPeak = sample;
      bucketSumSq += sample * sample;
    }

    const bucketRms = Math.sqrt(bucketSumSq / count);
    // Blend peak & RMS and apply gentle perceptual lift so conversational voice fills the meter clearly
    const blended = bucketPeak * 0.6 + bucketRms * 0.4;
    const lifted = Math.min(1, Math.pow(blended * 3.4, 0.82));

    const prev = prevBars && prevBars.length === safeCount ? prevBars[b] : 0;
    // Fast attack, smooth broadcast release
    const alpha = lifted >= prev ? 0.58 : 0.24;
    const smoothed = prev + (lifted - prev) * alpha;
    bars[b] = smoothed < 0.01 ? 0 : Math.min(1, smoothed);
  }

  return { bars, rms, peak: globalPeak };
}

/**
 * Classifies live microphone audio status for immediate visual feedback.
 */
export function classifyMicSignal(
  rms: number,
  peak: number,
  micActive: boolean
): MicSignalState {
  if (!micActive) return 'off';
  if (peak >= 0.94) return 'clipping';
  if (rms >= 0.38) return 'hot';
  if (rms >= 0.018 || peak >= 0.045) return 'capturing';
  return 'quiet';
}

/**
 * Formats RMS amplitude as a clean studio decibel readout.
 */
export function formatAudioDb(rms: number): string {
  if (!Number.isFinite(rms) || rms <= 0.001) return '-∞ dB';
  const db = Math.max(-60, Math.min(0, Math.round(20 * Math.log10(rms))));
  return `${db} dB`;
}
