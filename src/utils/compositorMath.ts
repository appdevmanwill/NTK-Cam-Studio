import type {
  AspectRatio,
  ExportFormat,
  Rect,
  TransitionStyle,
  VideoResolutionPreset,
  WebcamCorner,
  WebcamShape,
} from '../types/studio';

export interface CanvasSize {
  width: number;
  height: number;
}

const RESOLUTION_SHORT_SIDE: Record<VideoResolutionPreset, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
};

function ensureEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/**
 * Returns crisp, even-dimension canvas pixels for any aspect ratio and quality preset
 * (360p, 480p, 720p, 1080p, 1440p, 4K/2160p). Even dimensions are required by H.264/MP4 encoders.
 */
export function getCanvasDimensions(
  aspectRatio: AspectRatio,
  resolution: VideoResolutionPreset = '1080p'
): CanvasSize {
  const shortSide = RESOLUTION_SHORT_SIDE[resolution] ?? 1080;
  const longSide16x9 = ensureEven((shortSide * 16) / 9);

  switch (aspectRatio) {
    case '16:9':
      return { width: longSide16x9, height: shortSide };
    case '9:16':
      return { width: shortSide, height: longSide16x9 };
    case '1:1':
      return { width: shortSide, height: shortSide };
  }
}

/**
 * Returns a clean target video bitrate (bits per second) scaled to the selected resolution preset.
 */
export function getRecommendedVideoBitrate(resolution: VideoResolutionPreset): number {
  switch (resolution) {
    case '2160p':
      return 18_000_000;
    case '1440p':
      return 10_000_000;
    case '1080p':
      return 6_000_000;
    case '720p':
      return 3_500_000;
    case '480p':
      return 1_800_000;
    case '360p':
      return 1_000_000;
  }
}

/**
 * Estimates approximate download file size in megabytes for a given duration, format, and resolution.
 */
export function estimateExportSizeMb(
  durationSec: number,
  format: ExportFormat,
  resolution: VideoResolutionPreset
): number {
  const safeDuration = Math.max(0.5, Number.isFinite(durationSec) ? durationSec : 1);
  if (format === 'wav') {
    // 48kHz stereo 16-bit PCM = 192,000 bytes/sec
    return Number(((safeDuration * 192_000) / (1024 * 1024)).toFixed(2));
  }
  if (format === 'gif') {
    const scaleFactor =
      resolution === '360p' ? 0.55 : resolution === '480p' ? 0.85 : 1.35;
    // Approximate compressed GIF bytes/sec at 10fps
    return Number(((safeDuration * 380_000 * scaleFactor) / (1024 * 1024)).toFixed(2));
  }
  const videoBps = getRecommendedVideoBitrate(resolution);
  const formatFactor = format === 'webm' ? 0.78 : format === 'mkv' ? 0.92 : 0.95;
  const audioBps = 128_000;
  const bytes = ((videoBps * formatFactor + audioBps) / 8) * safeDuration;
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

/**
 * Computes a contained rectangle inside bounds while maintaining media aspect ratio.
 */
export function computeContainRect(
  sourceWidth: number,
  sourceHeight: number,
  bounds: Rect
): Rect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return { ...bounds };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const boundsRatio = bounds.width / bounds.height;

  let width: number;
  let height: number;

  if (sourceRatio > boundsRatio) {
    width = bounds.width;
    height = bounds.width / sourceRatio;
  } else {
    height = bounds.height;
    width = bounds.height * sourceRatio;
  }

  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
}

/**
 * Computes the largest pixel dimensions inside a viewport container that strictly preserve
 * the exact target canvas aspect ratio (preventing horizontal stretching in short flex containers).
 */
export function computeStageViewportFit(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: AspectRatio
): CanvasSize {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { width: 0, height: 0 };
  }
  const dims = getCanvasDimensions(aspectRatio);
  const fitted = computeContainRect(dims.width, dims.height, {
    x: 0,
    y: 0,
    width: containerWidth,
    height: containerHeight,
  });
  return {
    width: Math.max(1, Math.floor(fitted.width)),
    height: Math.max(1, Math.floor(fitted.height)),
  };
}

/**
 * Computes source crop rectangle for "object-fit: cover" drawing onto a target rect.
 */
export function computeCoverSourceCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Rect {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { x: 0, y: 0, width: Math.max(1, sourceWidth), height: Math.max(1, sourceHeight) };
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const cropWidth = sourceHeight * targetRatio;
    return {
      x: (sourceWidth - cropWidth) / 2,
      y: 0,
      width: cropWidth,
      height: sourceHeight,
    };
  } else {
    const cropHeight = sourceWidth / targetRatio;
    return {
      x: 0,
      y: (sourceHeight - cropHeight) / 2,
      width: sourceWidth,
      height: cropHeight,
    };
  }
}

/**
 * Computes the pixel bounding box of the floating PiP webcam bubble on the canvas,
 * clamping normalized coordinates so the bubble never clips outside the frame margin.
 */
export function computeWebcamBubbleRect(
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  normX: number,
  normY: number,
  shape: WebcamShape,
  margin = 24
): Rect {
  const clampedScale = Math.min(0.5, Math.max(0.14, scale));
  const baseSize = Math.round(Math.min(canvasWidth, canvasHeight) * clampedScale);

  const width = shape === 'rounded' ? Math.round(baseSize * 1.25) : baseSize;
  const height = shape === 'rounded' ? Math.round(baseSize * 0.85) : baseSize;

  const halfW = width / 2;
  const halfH = height / 2;

  const minCenterX = Math.min(canvasWidth / 2, margin + halfW);
  const maxCenterX = Math.max(canvasWidth / 2, canvasWidth - margin - halfW);
  const minCenterY = Math.min(canvasHeight / 2, margin + halfH);
  const maxCenterY = Math.max(canvasHeight / 2, canvasHeight - margin - halfH);

  const rawCenterX = normX * canvasWidth;
  const rawCenterY = normY * canvasHeight;

  const centerX = Math.min(maxCenterX, Math.max(minCenterX, rawCenterX));
  const centerY = Math.min(maxCenterY, Math.max(minCenterY, rawCenterY));

  return {
    x: centerX - halfW,
    y: centerY - halfH,
    width,
    height,
  };
}

/**
 * Returns normalized (x, y) center coordinates for snapping the webcam bubble to a corner.
 */
export function getCornerSnapPosition(
  corner: WebcamCorner,
  canvasWidth: number,
  canvasHeight: number,
  scale: number,
  shape: WebcamShape,
  margin = 32
): { x: number; y: number } {
  const sample = computeWebcamBubbleRect(canvasWidth, canvasHeight, scale, 0.5, 0.5, shape, margin);
  const halfW = sample.width / 2;
  const halfH = sample.height / 2;

  const leftX = (margin + halfW) / canvasWidth;
  const rightX = (canvasWidth - margin - halfW) / canvasWidth;
  const topY = (margin + halfH) / canvasHeight;
  const bottomY = (canvasHeight - margin - halfH) / canvasHeight;

  switch (corner) {
    case 'top-left':
      return { x: leftX, y: topY };
    case 'top-right':
      return { x: rightX, y: topY };
    case 'bottom-left':
      return { x: leftX, y: bottomY };
    case 'bottom-right':
      return { x: rightX, y: bottomY };
  }
}

/**
 * Hit-tests whether a point (in canvas pixels) lies inside the webcam bubble.
 */
export function hitTestWebcamBubble(
  pointX: number,
  pointY: number,
  rect: Rect,
  shape: WebcamShape
): boolean {
  if (shape === 'circle') {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const r = Math.min(rect.width, rect.height) / 2;
    const dx = pointX - cx;
    const dy = pointY - cy;
    return dx * dx + dy * dy <= r * r;
  }
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  );
}

/**
 * Computes slide/screen region and webcam region for Side-by-Side layout.
 * Uses left/right split for landscape/square and stacked top/bottom split for vertical 9:16.
 */
export function computeSideBySideLayout(
  canvasWidth: number,
  canvasHeight: number,
  padding: number
): { contentBounds: Rect; cameraBounds: Rect } {
  const gap = Math.max(20, Math.round(padding * 0.6));
  const outer = Math.max(24, padding);

  if (canvasHeight > canvasWidth) {
    // Vertical 9:16: stack presentation on top (60%) and camera on bottom (40%)
    const availW = canvasWidth - outer * 2;
    const availH = canvasHeight - outer * 2 - gap;
    const contentH = Math.round(availH * 0.58);
    const cameraH = availH - contentH;
    return {
      contentBounds: { x: outer, y: outer, width: availW, height: contentH },
      cameraBounds: { x: outer, y: outer + contentH + gap, width: availW, height: cameraH },
    };
  }

  // Landscape 16:9 or Square 1:1: Slides left (~66%), Camera right (~34%)
  const availW = canvasWidth - outer * 2 - gap;
  const availH = canvasHeight - outer * 2;
  const contentW = Math.round(availW * 0.65);
  const cameraW = availW - contentW;

  return {
    contentBounds: { x: outer, y: outer, width: contentW, height: availH },
    cameraBounds: { x: outer + contentW + gap, y: outer, width: cameraW, height: availH },
  };
}

/**
 * Formats seconds into MM:SS or MM:SS.d for timers and trim controls.
 */
export function formatTimecode(seconds: number, includeTenths = false): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  if (!includeTenths) {
    return base;
  }
  const tenths = Math.floor((safe % 1) * 10);
  return `${base}.${tenths}`;
}

/**
 * Ensures trim start/end stay within [0, duration] with at least minGap seconds between them.
 */
export function clampTrimRange(
  startSec: number,
  endSec: number,
  durationSec: number,
  minGap = 0.5
): { start: number; end: number } {
  const safeDuration = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
  if (safeDuration <= minGap) {
    return { start: 0, end: safeDuration };
  }
  let start = Math.max(0, Math.min(safeDuration - minGap, startSec));
  let end = Math.max(minGap, Math.min(safeDuration, endSec));

  if (end - start < minGap) {
    if (start + minGap <= safeDuration) {
      end = start + minGap;
    } else {
      start = Math.max(0, end - minGap);
    }
  }
  return {
    start: Number(start.toFixed(2)),
    end: Number(end.toFixed(2)),
  };
}

/**
 * Selects the best supported MediaRecorder MIME type and corresponding file extension.
 * Optionally prioritizes MP4, WebM, or MKV containers, and omits audio codec specifiers
 * when recording or transcoding a silent (video-only) stream.
 */
export function selectBestVideoMimeType(
  isSupported: (mimeType: string) => boolean,
  preferredFormat: 'mp4' | 'webm' | 'mkv' = 'webm',
  hasAudio = true
): { mimeType: string; extension: 'webm' | 'mp4' | 'mkv' } {
  const mp4Candidates: Array<{ mimeType: string; extension: 'mp4' }> = hasAudio
    ? [
        { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
        { mimeType: 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', extension: 'mp4' },
        { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
        { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
        { mimeType: 'video/mp4', extension: 'mp4' },
      ]
    : [
        { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
        { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4' },
        { mimeType: 'video/mp4', extension: 'mp4' },
      ];

  const webmCandidates: Array<{ mimeType: string; extension: 'webm' }> = hasAudio
    ? [
        { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
        { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
        { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
        { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
        { mimeType: 'video/webm', extension: 'webm' },
      ]
    : [
        { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
        { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
        { mimeType: 'video/webm', extension: 'webm' },
      ];

  const mkvCandidates: Array<{ mimeType: string; extension: 'mkv' }> = hasAudio
    ? [
        { mimeType: 'video/x-matroska;codecs=avc1,opus', extension: 'mkv' },
        { mimeType: 'video/x-matroska;codecs=vp9,opus', extension: 'mkv' },
        { mimeType: 'video/x-matroska;codecs=vp8,opus', extension: 'mkv' },
        { mimeType: 'video/x-matroska', extension: 'mkv' },
      ]
    : [
        { mimeType: 'video/x-matroska;codecs=avc1', extension: 'mkv' },
        { mimeType: 'video/x-matroska;codecs=vp9', extension: 'mkv' },
        { mimeType: 'video/x-matroska;codecs=vp8', extension: 'mkv' },
        { mimeType: 'video/x-matroska', extension: 'mkv' },
      ];

  const ordered: Array<{ mimeType: string; extension: 'webm' | 'mp4' | 'mkv' }> =
    preferredFormat === 'mp4'
      ? [...mp4Candidates, ...webmCandidates]
      : preferredFormat === 'mkv'
        ? [...mkvCandidates, ...webmCandidates, ...mp4Candidates]
        : [...webmCandidates, ...mp4Candidates];

  for (const candidate of ordered) {
    if (isSupported(candidate.mimeType)) {
      return candidate;
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

export interface TransitionState {
  active: boolean;
  /** Eased 0..1 progress */
  progress: number;
  /** Opacity to draw the previous frame on top of the new frame (crossfade) or 1 during first half of fade-black */
  prevAlpha: number;
  /** Opacity of the black veil for fade-through-black transitions (0 for crossfade) */
  blackAlpha: number;
  /** True when the previous frame should still be the base layer (first half of fade-black) */
  showPrevBase: boolean;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Computes deterministic frame blending alphas for slide and layout transitions.
 */
export function computeTransitionState(
  elapsedMs: number,
  durationMs: number,
  style: TransitionStyle
): TransitionState {
  if (style === 'none' || durationMs <= 0 || elapsedMs >= durationMs) {
    return {
      active: false,
      progress: 1,
      prevAlpha: 0,
      blackAlpha: 0,
      showPrevBase: false,
    };
  }

  const raw = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const eased = easeInOutCubic(raw);

  if (style === 'crossfade') {
    return {
      active: true,
      progress: eased,
      prevAlpha: Number((1 - eased).toFixed(4)),
      blackAlpha: 0,
      showPrevBase: false,
    };
  }

  // fade-through-black: 0..0.5 dips previous scene to black; 0.5..1 reveals new scene from black
  if (raw < 0.5) {
    const halfEased = easeInOutCubic(raw * 2);
    return {
      active: true,
      progress: raw,
      prevAlpha: 1,
      blackAlpha: Number(halfEased.toFixed(4)),
      showPrevBase: true,
    };
  }

  const secondHalfEased = easeInOutCubic((raw - 0.5) * 2);
  return {
    active: true,
    progress: raw,
    prevAlpha: 0,
    blackAlpha: Number((1 - secondHalfEased).toFixed(4)),
    showPrevBase: false,
  };
}
