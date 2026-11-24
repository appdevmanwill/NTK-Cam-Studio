import type {
  AspectRatio,
  ExportFormat,
  RecordedClip,
  TimeRange,
  VideoResolutionPreset,
} from '../types/studio';
import { spliceAudioSegments } from './audioAnalyzer';
import {
  type CanvasSize,
  getCanvasDimensions,
  getRecommendedVideoBitrate,
  selectBestVideoMimeType,
} from './compositorMath';

export interface ExportFormatOption {
  id: ExportFormat;
  label: string;
  extension: string;
  description: string;
  badge?: string;
  supportsResolution: boolean;
}

export interface ResolutionPresetOption {
  id: VideoResolutionPreset;
  label: string;
  shortLabel: string;
  qualityTag: string;
}

export const EXPORT_FORMAT_OPTIONS: ExportFormatOption[] = [
  {
    id: 'mp4',
    label: 'MP4',
    extension: 'mp4',
    description: 'Universal · YouTube, WhatsApp & Phones',
    badge: 'Best',
    supportsResolution: true,
  },
  {
    id: 'webm',
    label: 'WebM',
    extension: 'webm',
    description: 'Smaller file · Web & Chrome',
    supportsResolution: true,
  },
  {
    id: 'mkv',
    label: 'MKV',
    extension: 'mkv',
    description: 'Matroska · VLC & OBS Studio',
    supportsResolution: true,
  },
  {
    id: 'gif',
    label: 'GIF',
    extension: 'gif',
    description: 'Animated loop · Slides, Chat & Docs',
    supportsResolution: true,
  },
  {
    id: 'wav',
    label: 'WAV',
    extension: 'wav',
    description: 'Audio only · Uncompressed voiceover',
    supportsResolution: false,
  },
];

export const RESOLUTION_PRESET_OPTIONS: ResolutionPresetOption[] = [
  { id: '2160p', label: '4K (2160p)', shortLabel: '4K', qualityTag: 'Ultra HD' },
  { id: '1440p', label: '1440p (2K)', shortLabel: '1440p', qualityTag: 'Quad HD' },
  { id: '1080p', label: '1080p', shortLabel: '1080p', qualityTag: 'Full HD' },
  { id: '720p', label: '720p', shortLabel: '720p', qualityTag: 'HD' },
  { id: '480p', label: '480p', shortLabel: '480p', qualityTag: 'Standard' },
  { id: '360p', label: '360p', shortLabel: '360p', qualityTag: 'Small File' },
];

export interface ExportClipRequest {
  clip: RecordedClip;
  format: ExportFormat;
  resolution: VideoResolutionPreset;
  trimStart: number;
  trimEnd: number;
  /** Optional ordered list of kept segments after removing silence/repetition/manual cuts */
  keptSegments?: TimeRange[];
  onProgress: (pct: number, stageLabel?: string) => void;
}

export interface ExportClipResult {
  blob: Blob;
  extension: string;
  mimeType: string;
  width: number;
  height: number;
  note?: string;
}

function resolveExportSegments(
  trimStart: number,
  trimEnd: number,
  keptSegments?: TimeRange[]
): TimeRange[] {
  if (keptSegments && keptSegments.length > 0) {
    const valid = keptSegments.filter((s) => s.end - s.start >= 0.05);
    if (valid.length > 0) return valid;
  }
  return [{ start: Math.max(0, trimStart), end: Math.max(trimStart + 0.25, trimEnd) }];
}

function extractSplicedAudioChannels(
  audioBuf: AudioBuffer,
  segments: TimeRange[],
  maxChannels: number
): Float32Array[] {
  const chCount = Math.min(maxChannels, audioBuf.numberOfChannels);
  const rawChannels: Float32Array[] = [];
  for (let ch = 0; ch < chCount; ch++) {
    rawChannels.push(audioBuf.getChannelData(ch));
  }
  return spliceAudioSegments(rawChannels, audioBuf.sampleRate, segments, 8);
}

/**
 * Computes responsive GIF dimensions capped cleanly to keep animated GIFs crisp and fast in-browser.
 */
export function computeGifDimensions(
  aspectRatio: AspectRatio,
  resolution: VideoResolutionPreset
): CanvasSize {
  const full = getCanvasDimensions(aspectRatio, resolution);
  const maxLongestEdge =
    resolution === '360p'
      ? 640
      : resolution === '480p'
        ? 720
        : resolution === '720p'
          ? 800
          : 960;
  const longest = Math.max(full.width, full.height);
  if (longest <= maxLongestEdge) {
    return full;
  }
  const scale = maxLongestEdge / longest;
  const w = Math.max(160, Math.round((full.width * scale) / 2) * 2);
  const h = Math.max(160, Math.round((full.height * scale) / 2) * 2);
  return { width: w, height: h };
}

/**
 * Pure 16-bit PCM RIFF/WAVE encoder for audio-only exports.
 */
export function encodeWavBuffer(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const numChannels = Math.max(1, channels.length);
  const frameCount = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return buffer;
}

function seekVideoSafely(video: HTMLVideoElement, targetSec: number): Promise<void> {
  if (targetSec <= 0.05 && video.currentTime <= 0.05) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, 1200);
    video.addEventListener('seeked', done, { once: true });
    try {
      video.currentTime = Math.max(0, targetSec);
    } catch {
      done();
    }
  });
}

function loadVideoForExport(url: string, muted: boolean): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.muted = muted;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    let settled = false;
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onError);
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Could not decode recorded video for export.'));
    };
    const onReady = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(video);
    };
    const onMeta = () => {
      if (video.readyState >= 2) {
        onReady();
      } else {
        window.setTimeout(onReady, 250);
      }
    };

    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.load();
  });
}

/**
 * Steps through an ordered list of kept segments on an HTMLVideoElement, invoking `onFrame`
 * at the target frame rate with monotonic continuous timestamps across cut jumps.
 */
async function captureVideoAcrossSegments(params: {
  video: HTMLVideoElement;
  segments: TimeRange[];
  fps: number;
  maxFrames?: number;
  shouldAbort?: () => boolean;
  onFrame: () => void;
  onProgress: (fraction: number) => void;
}): Promise<number> {
  const { video, segments, fps, maxFrames = Infinity, shouldAbort, onFrame, onProgress } = params;
  const totalSpan = Math.max(
    0.25,
    segments.reduce((acc, s) => acc + Math.max(0.05, s.end - s.start), 0)
  );
  const frameIntervalMs = 1000 / fps;
  let capturedTotal = 0;
  let completedSpan = 0;

  for (const seg of segments) {
    if (shouldAbort?.() || capturedTotal >= maxFrames) break;
    const segSpan = Math.max(0.08, seg.end - seg.start);
    await seekVideoSafely(video, seg.start);
    try {
      await video.play();
    } catch {
      // Static-frame fallback completes cleanly via wall-clock segSpan
    }

    const segStartWall = performance.now();
    let lastCaptureWall = 0;
    let segFrames = 0;

    await new Promise<void>((resolve) => {
      let rafId = 0;
      const finish = () => {
        cancelAnimationFrame(rafId);
        video.pause();
        resolve();
      };

      const step = (now: number) => {
        if (shouldAbort?.() || capturedTotal >= maxFrames) {
          finish();
          return;
        }

        const elapsedWallSec = (now - segStartWall) / 1000;
        if (now - lastCaptureWall >= frameIntervalMs - 4) {
          lastCaptureWall = now;
          onFrame();
          capturedTotal += 1;
          segFrames += 1;
        }

        const segMediaProg = clamp01((video.currentTime - seg.start) / segSpan);
        const segWallProg = clamp01(elapsedWallSec / (segSpan + 0.35));
        const overallFrac = clamp01(
          (completedSpan + Math.max(segMediaProg, segWallProg) * segSpan) / totalSpan
        );
        onProgress(overallFrac);

        const reachedEnd =
          video.ended ||
          video.currentTime >= seg.end - 0.02 ||
          elapsedWallSec >= segSpan + 0.9;
        if (reachedEnd && (segFrames >= 1 || elapsedWallSec >= segSpan + 0.4)) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    });

    completedSpan += segSpan;
  }

  return capturedTotal;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Re-encodes video via offscreen scaled canvas + native MediaRecorder (fallback for browsers without WebCodecs).
 */
async function transcodeViaMediaRecorder(
  clip: RecordedClip,
  targetDims: CanvasSize,
  bitrate: number,
  preferredFormat: 'mp4' | 'webm' | 'mkv',
  segments: TimeRange[],
  onProgress: (pct: number, stageLabel?: string) => void
): Promise<ExportClipResult> {
  const video = await loadVideoForExport(clip.url, true);

  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let audioTracks: MediaStreamTrack[] = [];

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const rawBuf = await clip.blob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(rawBuf.slice(0));
      if (audioBuf && audioBuf.length > 0 && audioBuf.numberOfChannels > 0) {
        const splicedChannels = extractSplicedAudioChannels(
          audioBuf,
          segments,
          audioBuf.numberOfChannels
        );
        const splicedFrames = splicedChannels[0]?.length ?? 0;
        if (splicedFrames > 0) {
          const splicedBuf = ctx.createBuffer(
            splicedChannels.length,
            splicedFrames,
            audioBuf.sampleRate
          );
          splicedChannels.forEach((data, ch) => {
            splicedBuf.getChannelData(ch).set(data);
          });
          const dest = ctx.createMediaStreamDestination();
          const src = ctx.createBufferSource();
          src.buffer = splicedBuf;
          src.connect(dest);
          audioCtx = ctx;
          audioSource = src;
          audioTracks = dest.stream.getAudioTracks();
        } else {
          void ctx.close();
        }
      } else {
        void ctx.close();
      }
    } catch {
      void ctx.close();
      audioTracks = [];
    }
  } catch {
    audioTracks = [];
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetDims.width;
  canvas.height = targetDims.height;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;z-index:9999;pointer-events:none;';
  document.body.appendChild(canvas);

  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for video export.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const canvasStream = canvas.captureStream(30);
    const hasAudio = audioTracks.length > 0;
    const recordStream = hasAudio
      ? new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])
      : canvasStream;

    const selected = selectBestVideoMimeType(
      (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
      preferredFormat,
      hasAudio
    );

    const recorderOptions: MediaRecorderOptions = {
      videoBitsPerSecond: bitrate,
    };
    if (MediaRecorder.isTypeSupported(selected.mimeType)) {
      recorderOptions.mimeType = selected.mimeType;
    }

    const recorder = new MediaRecorder(recordStream, recorderOptions);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };

    const stopPromise = new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () => {
        recordStream.getTracks().forEach((t) => t.stop());
        canvasStream.getTracks().forEach((t) => t.stop());
        const outMime =
          preferredFormat === 'mkv'
            ? 'video/x-matroska'
            : recorder.mimeType || selected.mimeType;
        resolve(new Blob(chunks, { type: outMime }));
      };
      recorder.onerror = () => {
        recordStream.getTracks().forEach((t) => t.stop());
        canvasStream.getTracks().forEach((t) => t.stop());
        reject(new Error('Browser video encoder stopped unexpectedly.'));
      };
    });

    await seekVideoSafely(video, segments[0]?.start ?? 0);
    onProgress(5, `Encoding ${preferredFormat.toUpperCase()} (${targetDims.width}×${targetDims.height})…`);

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      // ignore until first decoded frame
    }

    recorder.start(200);

    if (audioSource && audioCtx) {
      try {
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        audioSource.start(0);
      } catch {
        // Non-fatal
      }
    }

    await captureVideoAcrossSegments({
      video,
      segments,
      fps: 30,
      onFrame: () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        } catch {
          // ignore transient frame error
        }
      },
      onProgress: (frac) => {
        const pct = Math.min(97, Math.max(5, Math.round(5 + frac * 92)));
        onProgress(pct, `Encoding ${preferredFormat.toUpperCase()}…`);
      },
    });

    if (audioSource) {
      try {
        audioSource.stop();
      } catch {
        // already stopped
      }
    }
    if (recorder.state !== 'inactive') {
      try {
        if (recorder.state === 'recording') recorder.requestData();
      } catch {
        // ignore
      }
      recorder.stop();
    }

    const blob = await stopPromise;
    if (blob.size === 0) {
      throw new Error(
        `Browser ${preferredFormat.toUpperCase()} encoder returned an empty file. Try MP4 or another size.`
      );
    }
    onProgress(100, 'Ready');

    return {
      blob,
      extension: preferredFormat,
      mimeType: blob.type || selected.mimeType,
      width: targetDims.width,
      height: targetDims.height,
    };
  } finally {
    canvas.remove();
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close();
    }
  }
}

/**
 * Universal client-side MP4 exporter using WebCodecs VideoEncoder + AudioEncoder + mp4-muxer.
 * Supports multi-segment silence/repetition cut splicing with click-free audio crossfading.
 */
async function transcodeToMp4ViaWebCodecs(
  clip: RecordedClip,
  targetDims: CanvasSize,
  bitrate: number,
  segments: TimeRange[],
  onProgress: (pct: number, stageLabel?: string) => void
): Promise<ExportClipResult> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('WebCodecs MP4 encoder is not supported in this browser.');
  }

  const codecCandidates: Array<{
    webCodecs: string;
    muxerCodec: 'avc' | 'vp9';
    note?: string;
  }> = [
    { webCodecs: 'avc1.640028', muxerCodec: 'avc' },
    { webCodecs: 'avc1.4d002a', muxerCodec: 'avc' },
    { webCodecs: 'avc1.42001f', muxerCodec: 'avc' },
    {
      webCodecs: 'vp09.00.10.08',
      muxerCodec: 'vp9',
      note: 'Encoded as VP9 inside MP4 container (H.264 encoder unavailable in this browser).',
    },
  ];

  let chosenCodec: (typeof codecCandidates)[number] | null = null;
  for (const cand of codecCandidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: cand.webCodecs,
        width: targetDims.width,
        height: targetDims.height,
        bitrate,
        framerate: 30,
      });
      if (support.supported) {
        chosenCodec = cand;
        break;
      }
    } catch {
      // Try next codec candidate
    }
  }

  if (!chosenCodec) {
    throw new Error('No supported MP4 video codec was found in WebCodecs.');
  }

  let decodedAudio: AudioBuffer | null = null;
  let audioConfig: {
    webCodecs: string;
    muxerCodec: 'aac' | 'opus';
    sampleRate: number;
    numberOfChannels: number;
  } | null = null;

  if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      try {
        const rawBuf = await clip.blob.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(rawBuf.slice(0));

        if (audioBuf && audioBuf.length > 0 && audioBuf.numberOfChannels > 0) {
          const audioCandidates: Array<{ webCodecs: string; muxerCodec: 'aac' | 'opus' }> = [
            { webCodecs: 'mp4a.40.2', muxerCodec: 'aac' },
            { webCodecs: 'opus', muxerCodec: 'opus' },
          ];
          for (const ac of audioCandidates) {
            try {
              const sup = await AudioEncoder.isConfigSupported({
                codec: ac.webCodecs,
                numberOfChannels: Math.min(2, audioBuf.numberOfChannels),
                sampleRate: audioBuf.sampleRate,
                bitrate: 128_000,
              });
              if (sup.supported) {
                decodedAudio = audioBuf;
                audioConfig = {
                  ...ac,
                  sampleRate: audioBuf.sampleRate,
                  numberOfChannels: Math.min(2, audioBuf.numberOfChannels),
                };
                break;
              }
            } catch {
              // Try next audio codec
            }
          }
        }
      } finally {
        if (ctx.state !== 'closed') {
          void ctx.close();
        }
      }
    } catch {
      decodedAudio = null;
      audioConfig = null;
    }
  }

  const splicedAudioChannels =
    decodedAudio && audioConfig
      ? extractSplicedAudioChannels(decodedAudio, segments, audioConfig.numberOfChannels)
      : null;
  const hasSplicedAudio = Boolean(splicedAudioChannels?.[0]?.length);

  const { ArrayBufferTarget, Muxer } = await import('mp4-muxer');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: chosenCodec.muxerCodec,
      width: targetDims.width,
      height: targetDims.height,
      frameRate: 30,
    },
    ...(hasSplicedAudio && audioConfig
      ? {
          audio: {
            codec: audioConfig.muxerCodec,
            numberOfChannels: audioConfig.numberOfChannels,
            sampleRate: audioConfig.sampleRate,
          },
        }
      : {}),
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  let video: HTMLVideoElement | null = null;
  try {
    videoEncoder.configure({
      codec: chosenCodec.webCodecs,
      width: targetDims.width,
      height: targetDims.height,
      bitrate,
      framerate: 30,
    });

    if (hasSplicedAudio && decodedAudio && audioConfig && splicedAudioChannels) {
      onProgress(8, 'Splicing & encoding MP4 audio…');
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: () => {
          // Non-fatal
        },
      });
      try {
        audioEncoder.configure({
          codec: audioConfig.webCodecs,
          numberOfChannels: audioConfig.numberOfChannels,
          sampleRate: audioConfig.sampleRate,
          bitrate: 128_000,
        });

        const sr = decodedAudio.sampleRate;
        const totalSamples = splicedAudioChannels[0].length;
        const chunkSize = 1024;
        const chCount = splicedAudioChannels.length;

        for (let offset = 0; offset < totalSamples; offset += chunkSize) {
          const frames = Math.min(chunkSize, totalSamples - offset);
          const planar = new Float32Array(frames * chCount);
          for (let ch = 0; ch < chCount; ch++) {
            planar.set(splicedAudioChannels[ch].subarray(offset, offset + frames), ch * frames);
          }
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: sr,
            numberOfFrames: frames,
            numberOfChannels: chCount,
            timestamp: Math.round((offset / sr) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
      } finally {
        if (audioEncoder.state !== 'closed') {
          audioEncoder.close();
        }
      }
    }

    video = await loadVideoForExport(clip.url, true);
    const loadedVideo = video;
    const canvas = document.createElement('canvas');
    canvas.width = targetDims.width;
    canvas.height = targetDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for MP4 export.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const fps = 30;
    const frameDurationUs = Math.round(1_000_000 / fps);
    let frameIndex = 0;

    onProgress(12, `Encoding MP4 (${targetDims.width}×${targetDims.height})…`);
    await captureVideoAcrossSegments({
      video: loadedVideo,
      segments,
      fps,
      shouldAbort: () => Boolean(encoderError),
      onFrame: () => {
        ctx.drawImage(loadedVideo, 0, 0, canvas.width, canvas.height);
        if (videoEncoder.encodeQueueSize < 8) {
          const timestampUs = frameIndex * frameDurationUs;
          const vf = new VideoFrame(canvas, {
            timestamp: timestampUs,
            duration: frameDurationUs,
          });
          videoEncoder.encode(vf, { keyFrame: frameIndex % 60 === 0 });
          vf.close();
          frameIndex += 1;
        }
      },
      onProgress: (frac) => {
        const pct = Math.min(94, Math.max(12, Math.round(12 + frac * 82)));
        onProgress(pct, `Muxing MP4 (${targetDims.width}×${targetDims.height})…`);
      },
    });

    if (frameIndex === 0) {
      ctx.drawImage(loadedVideo, 0, 0, canvas.width, canvas.height);
      const vf = new VideoFrame(canvas, { timestamp: 0, duration: frameDurationUs });
      videoEncoder.encode(vf, { keyFrame: true });
      vf.close();
    }

    onProgress(96, 'Finalizing MP4 file…');
    await videoEncoder.flush();
    videoEncoder.close();

    if (encoderError) {
      throw encoderError;
    }

    muxer.finalize();
    onProgress(100, 'Ready');

    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      extension: 'mp4',
      mimeType: 'video/mp4',
      width: targetDims.width,
      height: targetDims.height,
      note: chosenCodec.note,
    };
  } finally {
    if (videoEncoder.state !== 'closed') {
      videoEncoder.close();
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
}

/**
 * Deterministic client-side WebM & Matroska (MKV) exporter using WebCodecs + webm-muxer.
 * Supports multi-segment silence/repetition cut splicing with click-free Opus audio.
 */
async function transcodeToWebmOrMkvViaWebCodecs(
  clip: RecordedClip,
  targetDims: CanvasSize,
  bitrate: number,
  format: 'webm' | 'mkv',
  segments: TimeRange[],
  onProgress: (pct: number, stageLabel?: string) => void
): Promise<ExportClipResult> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    throw new Error('WebCodecs encoder is not supported in this browser.');
  }

  const codecCandidates: Array<{ webCodecs: string; muxerCodec: string }> = [
    { webCodecs: 'vp09.00.10.08', muxerCodec: 'V_VP9' },
    { webCodecs: 'vp8', muxerCodec: 'V_VP8' },
  ];

  let chosenCodec: (typeof codecCandidates)[number] | null = null;
  for (const cand of codecCandidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: cand.webCodecs,
        width: targetDims.width,
        height: targetDims.height,
        bitrate,
        framerate: 30,
      });
      if (support.supported) {
        chosenCodec = cand;
        break;
      }
    } catch {
      // Try next codec candidate
    }
  }

  if (!chosenCodec) {
    throw new Error(`No supported ${format.toUpperCase()} video codec was found in WebCodecs.`);
  }

  let decodedAudio: AudioBuffer | null = null;
  let audioConfig: { sampleRate: number; numberOfChannels: number } | null = null;

  if (typeof AudioEncoder !== 'undefined' && typeof AudioData !== 'undefined') {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      try {
        const rawBuf = await clip.blob.arrayBuffer();
        const audioBuf = await ctx.decodeAudioData(rawBuf.slice(0));
        if (audioBuf && audioBuf.length > 0 && audioBuf.numberOfChannels > 0) {
          const chCount = Math.min(2, audioBuf.numberOfChannels);
          const sup = await AudioEncoder.isConfigSupported({
            codec: 'opus',
            numberOfChannels: chCount,
            sampleRate: audioBuf.sampleRate,
            bitrate: 128_000,
          });
          if (sup.supported) {
            decodedAudio = audioBuf;
            audioConfig = {
              sampleRate: audioBuf.sampleRate,
              numberOfChannels: chCount,
            };
          }
        }
      } finally {
        void ctx.close();
      }
    } catch {
      decodedAudio = null;
      audioConfig = null;
    }
  }

  const splicedAudioChannels =
    decodedAudio && audioConfig
      ? extractSplicedAudioChannels(decodedAudio, segments, audioConfig.numberOfChannels)
      : null;
  const hasSplicedAudio = Boolean(splicedAudioChannels?.[0]?.length);

  const { ArrayBufferTarget, Muxer } = await import('webm-muxer');
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    type: format === 'mkv' ? 'matroska' : 'webm',
    video: {
      codec: chosenCodec.muxerCodec,
      width: targetDims.width,
      height: targetDims.height,
      frameRate: 30,
    },
    ...(hasSplicedAudio && audioConfig
      ? {
          audio: {
            codec: 'A_OPUS',
            numberOfChannels: audioConfig.numberOfChannels,
            sampleRate: audioConfig.sampleRate,
          },
        }
      : {}),
    firstTimestampBehavior: 'offset',
  });

  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      encoderError = err instanceof Error ? err : new Error(String(err));
    },
  });

  let video: HTMLVideoElement | null = null;
  try {
    videoEncoder.configure({
      codec: chosenCodec.webCodecs,
      width: targetDims.width,
      height: targetDims.height,
      bitrate,
      framerate: 30,
    });

    if (hasSplicedAudio && decodedAudio && audioConfig && splicedAudioChannels) {
      onProgress(8, `Splicing & encoding ${format.toUpperCase()} audio…`);
      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: () => {
          // Non-fatal
        },
      });
      try {
        audioEncoder.configure({
          codec: 'opus',
          numberOfChannels: audioConfig.numberOfChannels,
          sampleRate: audioConfig.sampleRate,
          bitrate: 128_000,
        });

        const sr = decodedAudio.sampleRate;
        const totalSamples = splicedAudioChannels[0].length;
        const chunkSize = 960;
        const chCount = splicedAudioChannels.length;

        for (let offset = 0; offset < totalSamples; offset += chunkSize) {
          const frames = Math.min(chunkSize, totalSamples - offset);
          const planar = new Float32Array(frames * chCount);
          for (let ch = 0; ch < chCount; ch++) {
            planar.set(splicedAudioChannels[ch].subarray(offset, offset + frames), ch * frames);
          }
          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate: sr,
            numberOfFrames: frames,
            numberOfChannels: chCount,
            timestamp: Math.round((offset / sr) * 1_000_000),
            data: planar,
          });
          audioEncoder.encode(audioData);
          audioData.close();
        }
        await audioEncoder.flush();
      } finally {
        if (audioEncoder.state !== 'closed') {
          audioEncoder.close();
        }
      }
    }

    video = await loadVideoForExport(clip.url, true);
    const loadedVideo = video;
    const canvas = document.createElement('canvas');
    canvas.width = targetDims.width;
    canvas.height = targetDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error(`Canvas 2D context unavailable for ${format.toUpperCase()} export.`);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const fps = 30;
    const frameDurationUs = Math.round(1_000_000 / fps);
    let frameIndex = 0;

    onProgress(12, `Encoding ${format.toUpperCase()} (${targetDims.width}×${targetDims.height})…`);
    await captureVideoAcrossSegments({
      video: loadedVideo,
      segments,
      fps,
      shouldAbort: () => Boolean(encoderError),
      onFrame: () => {
        ctx.drawImage(loadedVideo, 0, 0, canvas.width, canvas.height);
        if (videoEncoder.encodeQueueSize < 8) {
          const timestampUs = frameIndex * frameDurationUs;
          const vf = new VideoFrame(canvas, {
            timestamp: timestampUs,
            duration: frameDurationUs,
          });
          videoEncoder.encode(vf, { keyFrame: frameIndex % 60 === 0 });
          vf.close();
          frameIndex += 1;
        }
      },
      onProgress: (frac) => {
        const pct = Math.min(94, Math.max(12, Math.round(12 + frac * 82)));
        onProgress(pct, `Muxing ${format.toUpperCase()} (${targetDims.width}×${targetDims.height})…`);
      },
    });

    if (frameIndex === 0) {
      ctx.drawImage(loadedVideo, 0, 0, canvas.width, canvas.height);
      const vf = new VideoFrame(canvas, { timestamp: 0, duration: frameDurationUs });
      videoEncoder.encode(vf, { keyFrame: true });
      vf.close();
    }

    onProgress(96, `Finalizing ${format.toUpperCase()} file…`);
    await videoEncoder.flush();
    videoEncoder.close();

    if (encoderError) {
      throw encoderError;
    }

    muxer.finalize();
    onProgress(100, 'Ready');

    const outMime = format === 'mkv' ? 'video/x-matroska' : 'video/webm';
    return {
      blob: new Blob([target.buffer], { type: outMime }),
      extension: format,
      mimeType: outMime,
      width: targetDims.width,
      height: targetDims.height,
    };
  } finally {
    if (videoEncoder.state !== 'closed') {
      videoEncoder.close();
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }
}

/**
 * Exports a real animated GIF using gifenc at 10fps scaled to the selected resolution preset.
 */
async function exportToAnimatedGif(
  clip: RecordedClip,
  resolution: VideoResolutionPreset,
  segments: TimeRange[],
  onProgress: (pct: number, stageLabel?: string) => void
): Promise<ExportClipResult> {
  const gifDims = computeGifDimensions(clip.aspectRatio, resolution);
  const video = await loadVideoForExport(clip.url, true);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = gifDims.width;
    canvas.height = gifDims.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable for GIF export.');
    }

    const targetFps = 10;
    const frameIntervalMs = Math.round(1000 / targetFps);
    const maxFrames = 180;

    const gifencMod = await import('gifenc');
    const GIFEncoder = gifencMod.GIFEncoder ?? gifencMod.default?.GIFEncoder;
    const quantize = gifencMod.quantize ?? gifencMod.default?.quantize;
    const applyPalette = gifencMod.applyPalette ?? gifencMod.default?.applyPalette;
    if (!GIFEncoder || !quantize || !applyPalette) {
      throw new Error('GIF encoder failed to initialize.');
    }

    const gif = GIFEncoder();
    onProgress(8, `Capturing GIF frames (${gifDims.width}×${gifDims.height})…`);

    let frameCount = 0;
    await captureVideoAcrossSegments({
      video,
      segments,
      fps: targetFps,
      maxFrames,
      onFrame: () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const palette = quantize(rgba, 256, { format: 'rgb565' });
        const index = applyPalette(rgba, palette, 'rgb565');
        gif.writeFrame(index, canvas.width, canvas.height, {
          palette,
          delay: frameIntervalMs,
          repeat: 0,
        });
        frameCount += 1;
      },
      onProgress: (frac) => {
        const pct = Math.min(95, Math.max(8, Math.round(8 + frac * 87)));
        onProgress(pct, `Encoding GIF (${frameCount} frames)…`);
      },
    });

    if (frameCount === 0) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const palette = quantize(rgba, 256, { format: 'rgb565' });
      const index = applyPalette(rgba, palette, 'rgb565');
      gif.writeFrame(index, canvas.width, canvas.height, {
        palette,
        delay: frameIntervalMs,
        repeat: 0,
      });
    }

    gif.finish();
    onProgress(100, 'Ready');

    const gifBytes = new Uint8Array(gif.bytes());
    return {
      blob: new Blob([gifBytes], { type: 'image/gif' }),
      extension: 'gif',
      mimeType: 'image/gif',
      width: gifDims.width,
      height: gifDims.height,
    };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
}

/**
 * Extracts & splices kept audio segments into a clean 16-bit PCM WAV file.
 */
async function exportAudioOnlyWav(
  clip: RecordedClip,
  segments: TimeRange[],
  onProgress: (pct: number, stageLabel?: string) => void
): Promise<ExportClipResult> {
  onProgress(20, 'Extracting & splicing audio track…');
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    let audioBuf: AudioBuffer;
    try {
      const rawBuffer = await clip.blob.arrayBuffer();
      audioBuf = await audioCtx.decodeAudioData(rawBuffer.slice(0));
    } catch {
      throw new Error(
        'No microphone or system audio track was recorded in this clip. Enable Mic before recording to export WAV audio.'
      );
    }

    const channels = extractSplicedAudioChannels(audioBuf, segments, audioBuf.numberOfChannels);
    if (!channels[0] || channels[0].length === 0) {
      throw new Error('Selected audio segments are empty.');
    }

    onProgress(65, 'Encoding WAV audio…');
    const wavBuffer = encodeWavBuffer(channels, audioBuf.sampleRate);
    onProgress(100, 'Ready');

    return {
      blob: new Blob([wavBuffer], { type: 'audio/wav' }),
      extension: 'wav',
      mimeType: 'audio/wav',
      width: 0,
      height: 0,
    };
  } finally {
    if (audioCtx.state !== 'closed') {
      void audioCtx.close();
    }
  }
}

/**
 * Main export orchestrator: converts, resizes, trims, and splices out removed silences & repetitions.
 */
export async function exportRecordedClip(request: ExportClipRequest): Promise<ExportClipResult> {
  const { clip, format, resolution, trimStart, trimEnd, keptSegments, onProgress } = request;
  const segments = resolveExportSegments(trimStart, trimEnd, keptSegments);
  const hasCuts =
    segments.length > 1 ||
    (segments.length === 1 &&
      (segments[0].start > 0.08 || segments[0].end < Math.max(0, clip.durationSec - 0.08)));

  const targetDims = getCanvasDimensions(clip.aspectRatio, resolution);
  const bitrate = getRecommendedVideoBitrate(resolution);

  if (format === 'wav') {
    return exportAudioOnlyWav(clip, segments, onProgress);
  }

  if (format === 'gif') {
    return exportToAnimatedGif(clip, resolution, segments, onProgress);
  }

  const sameResolution = targetDims.width === clip.width && targetDims.height === clip.height;
  if (!hasCuts && sameResolution && format === clip.extension) {
    onProgress(100, 'Ready');
    return {
      blob: clip.blob,
      extension: format,
      mimeType: clip.mimeType,
      width: clip.width,
      height: clip.height,
    };
  }

  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';

  if (format === 'mp4') {
    if (hasWebCodecs) {
      try {
        return await transcodeToMp4ViaWebCodecs(
          clip,
          targetDims,
          bitrate,
          segments,
          onProgress
        );
      } catch {
        // Fall through to MediaRecorder
      }
    }

    return transcodeViaMediaRecorder(
      clip,
      targetDims,
      bitrate,
      'mp4',
      segments,
      onProgress
    );
  }

  if (hasWebCodecs) {
    try {
      return await transcodeToWebmOrMkvViaWebCodecs(
        clip,
        targetDims,
        bitrate,
        format,
        segments,
        onProgress
      );
    } catch {
      // Fall through to MediaRecorder
    }
  }

  return transcodeViaMediaRecorder(
    clip,
    targetDims,
    bitrate,
    format,
    segments,
    onProgress
  );
}
