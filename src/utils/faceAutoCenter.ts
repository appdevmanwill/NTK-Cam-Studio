import type { Rect } from '../types/studio';
import { computeCoverSourceCrop } from './compositorMath';

export interface SubjectDetectionResult {
  /** Normalized horizontal center of detected subject (0..1 in source video coordinates) */
  cx: number;
  /** Normalized vertical center of detected subject (0..1 in source video coordinates) */
  cy: number;
  /** Confidence 0..1 indicating how strongly a face/subject was detected */
  confidence: number;
  /** Approximate fraction of sampled pixels belonging to the subject (0..1) */
  coverage: number;
}

export interface AutoCenterState {
  /** Smoothed normalized X anchor (0..1) */
  x: number;
  /** Smoothed normalized Y anchor (0..1) */
  y: number;
  /** Timestamp (ms) of the last confident subject detection */
  lastDetectedAtMs: number;
  /** Latest detection confidence (0..1) */
  confidence: number;
}

export const NEUTRAL_PORTRAIT_ANCHOR = { x: 0.5, y: 0.44 };

export function createInitialAutoCenterState(): AutoCenterState {
  return {
    x: NEUTRAL_PORTRAIT_ANCHOR.x,
    y: NEUTRAL_PORTRAIT_ANCHOR.y,
    lastDetectedAtMs: 0,
    confidence: 0,
  };
}

/**
 * Classifies whether an RGB pixel falls inside an inclusive YCbCr human skin-tone gamut.
 * Works across light, medium, and deep skin tones while rejecting pure shadows and clipped highlights.
 */
export function isSkinToneRgb(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 38 || y > 242) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 128 && cr >= 132 && cr <= 176;
}

/**
 * Pure, zero-dependency subject centroid detector operating on a tiny downsampled RGBA frame.
 * Combines inclusive YCbCr skin-tone detection with optional temporal motion energy and a gentle
 * upper-portrait prior so a presenter's face/head stays centered smoothly without jitter.
 */
export function detectSubjectAnchorFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  prevLuma?: Uint8Array | null
): SubjectDetectionResult {
  const totalPixels = width * height;
  if (totalPixels === 0 || rgba.length < totalPixels * 4) {
    return { cx: NEUTRAL_PORTRAIT_ANCHOR.x, cy: NEUTRAL_PORTRAIT_ANCHOR.y, confidence: 0, coverage: 0 };
  }

  let skinWeightSum = 0;
  let skinXSum = 0;
  let skinYSum = 0;
  let skinCount = 0;

  let motionWeightSum = 0;
  let motionXSum = 0;
  let motionYSum = 0;
  let motionCount = 0;

  for (let py = 0; py < height; py++) {
    const ny = (py + 0.5) / height;
    // Slight preference for head/upper-torso vertical zone (0.12..0.78) to avoid hands at bottom edge
    const verticalPrior = ny >= 0.08 && ny <= 0.78 ? 1.0 : 0.45;

    for (let px = 0; px < width; px++) {
      const idx = py * width + px;
      const offset = idx * 4;
      const r = rgba[offset];
      const g = rgba[offset + 1];
      const b = rgba[offset + 2];
      const nx = (px + 0.5) / width;

      if (isSkinToneRgb(r, g, b)) {
        // Weight slightly higher for cleaner mid-luma face pixels
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const lumaWeight = luma > 55 && luma < 225 ? 1.15 : 0.75;
        const w = verticalPrior * lumaWeight;
        skinWeightSum += w;
        skinXSum += nx * w;
        skinYSum += ny * w;
        skinCount++;
      }

      if (prevLuma && prevLuma.length === totalPixels) {
        const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const diff = Math.abs(luma - prevLuma[idx]);
        if (diff >= 18) {
          const mw = Math.min(2.5, (diff - 16) / 32) * verticalPrior;
          motionWeightSum += mw;
          motionXSum += nx * mw;
          motionYSum += ny * mw;
          motionCount++;
        }
      }
    }
  }

  const skinCoverage = skinCount / totalPixels;
  const motionCoverage = motionCount / totalPixels;

  // Skin-tone cluster is our primary portrait signal (ignore tiny <1.2% speckles or >85% warm wall)
  if (skinCoverage >= 0.012 && skinCoverage <= 0.85 && skinWeightSum > 0) {
    let cx = skinXSum / skinWeightSum;
    let cy = skinYSum / skinWeightSum;

    // Blend a small motion cue if active movement is occurring simultaneously
    if (motionCoverage >= 0.015 && motionCoverage <= 0.65 && motionWeightSum > 0) {
      const mcx = motionXSum / motionWeightSum;
      const mcy = motionYSum / motionWeightSum;
      cx = cx * 0.8 + mcx * 0.2;
      cy = cy * 0.8 + mcy * 0.2;
    }

    const confidence = Math.min(1, Math.max(0.25, skinCoverage * 8));
    return { cx, cy, confidence, coverage: skinCoverage };
  }

  // Fallback: temporal motion centroid (helps in monochromatic lighting or non-standard setups)
  if (motionCoverage >= 0.02 && motionCoverage <= 0.6 && motionWeightSum > 0) {
    const cx = motionXSum / motionWeightSum;
    const cy = motionYSum / motionWeightSum;
    const confidence = Math.min(0.7, motionCoverage * 5);
    return { cx, cy, confidence, coverage: motionCoverage };
  }

  return { cx: NEUTRAL_PORTRAIT_ANCHOR.x, cy: NEUTRAL_PORTRAIT_ANCHOR.y, confidence: 0, coverage: 0 };
}

/**
 * Smoothly updates the auto-center anchor using deadzone + exponential smoothing
 * so camera framing glides like a gimbal without micro-jitter.
 */
export function stepAutoCenterState(
  prev: AutoCenterState,
  detection: SubjectDetectionResult | null,
  nowMs: number,
  dtSec: number
): AutoCenterState {
  const clampedDt = Math.max(0.008, Math.min(0.25, dtSec));
  let targetX = prev.x;
  let targetY = prev.y;
  let lastDetectedAtMs = prev.lastDetectedAtMs;
  let confidence = prev.confidence;

  if (detection && detection.confidence >= 0.22) {
    const dx = Math.abs(detection.cx - prev.x);
    const dy = Math.abs(detection.cy - prev.y);
    // Small deadzone prevents tiny sensor noise from nudging a seated presenter
    targetX = dx > 0.022 ? detection.cx : prev.x;
    targetY = dy > 0.022 ? detection.cy : prev.y;
    lastDetectedAtMs = nowMs;
    confidence = detection.confidence;
  } else if (nowMs - prev.lastDetectedAtMs > 1600) {
    // Gently return to neutral portrait framing if nobody is detected for >1.6s
    targetX = NEUTRAL_PORTRAIT_ANCHOR.x;
    targetY = NEUTRAL_PORTRAIT_ANCHOR.y;
    confidence = 0;
  }

  // Smooth gimbal-like easing (time constant ~0.28s)
  const alpha = 1 - Math.exp(-clampedDt / 0.28);
  const nextX = prev.x + (targetX - prev.x) * alpha;
  const nextY = prev.y + (targetY - prev.y) * alpha;

  return {
    x: Math.max(0.1, Math.min(0.9, nextX)),
    y: Math.max(0.1, Math.min(0.9, nextY)),
    lastDetectedAtMs,
    confidence,
  };
}

/**
 * Computes an aspect-locked cover-crop rectangle shifted to keep (anchorX, anchorY)
 * framed cleanly in the portrait focal point of circular or rectangular overlays.
 * Strictly clamped to source bounds so edges never show blank margins.
 */
export function computeAutoCenteredCoverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  anchorX: number,
  anchorY: number,
  zoomBoost = 1.18
): Rect {
  const baseCrop = computeCoverSourceCrop(sourceWidth, sourceHeight, targetWidth, targetHeight);
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return baseCrop;
  }

  const safeZoom = Math.max(1.0, Math.min(1.6, zoomBoost));
  const cropWidth = baseCrop.width / safeZoom;
  const cropHeight = baseCrop.height / safeZoom;

  // Align subject X to horizontal center (0.5) and Y slightly above center (0.44) for natural headroom
  const desiredLeft = anchorX * sourceWidth - cropWidth * 0.5;
  const desiredTop = anchorY * sourceHeight - cropHeight * 0.44;

  const maxLeft = Math.max(0, sourceWidth - cropWidth);
  const maxTop = Math.max(0, sourceHeight - cropHeight);

  return {
    x: Math.max(0, Math.min(maxLeft, desiredLeft)),
    y: Math.max(0, Math.min(maxTop, desiredTop)),
    width: cropWidth,
    height: cropHeight,
  };
}

interface NativeFaceDetectorLike {
  detect: (source: HTMLCanvasElement) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
}

/**
 * Lightweight browser-side media stream tracker.
 * Samples live webcam video onto an 80x45 offscreen canvas at ~10Hz, uses native FaceDetector
 * when available, and seamlessly falls back to pure-JS skin-tone + motion centroid tracking.
 */
export class WebcamAutoCenterTracker {
  private sampleCanvas: HTMLCanvasElement | null = null;
  private sampleCtx: CanvasRenderingContext2D | null = null;
  private prevLuma: Uint8Array | null = null;
  private state: AutoCenterState = createInitialAutoCenterState();
  private lastSampleMs = 0;
  private lastStepMs = 0;
  private latestDetection: SubjectDetectionResult | null = null;
  private nativeDetector: NativeFaceDetectorLike | null = null;
  private nativeDetectInFlight = false;

  private readonly sampleW = 80;
  private readonly sampleH = 45;

  constructor() {
    if (typeof window !== 'undefined') {
      const FaceDetectorCtor = (
        window as unknown as { FaceDetector?: new (opts?: object) => NativeFaceDetectorLike }
      ).FaceDetector;
      if (typeof FaceDetectorCtor === 'function') {
        try {
          this.nativeDetector = new FaceDetectorCtor({ fastMode: true, maxDetectedFaces: 1 });
        } catch {
          this.nativeDetector = null;
        }
      }
    }
  }

  reset() {
    this.state = createInitialAutoCenterState();
    this.prevLuma = null;
    this.latestDetection = null;
    this.lastSampleMs = 0;
    this.lastStepMs = 0;
  }

  getAnchor(): { x: number; y: number; confidence: number } {
    return { x: this.state.x, y: this.state.y, confidence: this.state.confidence };
  }

  update(video: HTMLVideoElement, nowMs: number): { x: number; y: number; confidence: number } {
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return this.getAnchor();
    }

    const dtSec = this.lastStepMs > 0 ? (nowMs - this.lastStepMs) / 1000 : 1 / 60;
    this.lastStepMs = nowMs;

    // Sample video stream at ~10Hz (every 100ms) to keep CPU negligible
    if (nowMs - this.lastSampleMs >= 100) {
      this.lastSampleMs = nowMs;
      this.sampleFrame(video);
    }

    this.state = stepAutoCenterState(this.state, this.latestDetection, nowMs, dtSec);
    return this.getAnchor();
  }

  private sampleFrame(video: HTMLVideoElement) {
    if (typeof document === 'undefined') return;
    if (!this.sampleCanvas) {
      this.sampleCanvas = document.createElement('canvas');
      this.sampleCanvas.width = this.sampleW;
      this.sampleCanvas.height = this.sampleH;
      this.sampleCtx = this.sampleCanvas.getContext('2d', { willReadFrequently: true });
    }
    if (!this.sampleCtx || !this.sampleCanvas) return;

    try {
      this.sampleCtx.drawImage(video, 0, 0, this.sampleW, this.sampleH);
      const frame = this.sampleCtx.getImageData(0, 0, this.sampleW, this.sampleH);

      // Run fast synchronous heuristic immediately
      const heuristic = detectSubjectAnchorFromRgba(
        frame.data,
        this.sampleW,
        this.sampleH,
        this.prevLuma
      );

      // Store luma plane for next frame's motion cue
      const total = this.sampleW * this.sampleH;
      if (!this.prevLuma || this.prevLuma.length !== total) {
        this.prevLuma = new Uint8Array(total);
      }
      for (let i = 0; i < total; i++) {
        const o = i * 4;
        this.prevLuma[i] = Math.round(
          0.299 * frame.data[o] + 0.587 * frame.data[o + 1] + 0.114 * frame.data[o + 2]
        );
      }

      if (this.nativeDetector && !this.nativeDetectInFlight) {
        this.nativeDetectInFlight = true;
        this.nativeDetector
          .detect(this.sampleCanvas)
          .then((faces) => {
            if (faces && faces.length > 0) {
              const box = faces[0].boundingBox;
              const cx = (box.x + box.width * 0.5) / this.sampleW;
              const cy = (box.y + box.height * 0.48) / this.sampleH;
              const coverage = (box.width * box.height) / (this.sampleW * this.sampleH);
              this.latestDetection = { cx, cy, confidence: 0.95, coverage };
            } else {
              this.latestDetection = heuristic;
            }
          })
          .catch(() => {
            this.nativeDetector = null;
            this.latestDetection = heuristic;
          })
          .finally(() => {
            this.nativeDetectInFlight = false;
          });
      } else if (!this.nativeDetector) {
        this.latestDetection = heuristic;
      }
    } catch {
      // Ignore transient frame-read errors
    }
  }
}
