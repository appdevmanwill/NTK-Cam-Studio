import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

export type SegmentationEngineStatus = 'idle' | 'loading' | 'ready' | 'fallback';

const MEDIAPIPE_WASM_ROOTS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm',
];
const SELFIE_SEGMENTER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

/**
 * Pure confidence-to-alpha feathering curve (smoothstep) for crisp hair & shoulder edges
 * without harsh binary jagged borders. Exported for unit testing.
 */
export function computePersonMaskAlpha(confidence: number): number {
  const low = 0.28;
  const high = 0.72;
  if (confidence <= low) return 0;
  if (confidence >= high) return 255;
  const t = (confidence - low) / (high - low);
  const smooth = t * t * (3 - 2 * t);
  return Math.round(smooth * 255);
}

/**
 * Lightweight real-time client-side AI person segmentation engine built on MediaPipe Selfie Segmenter.
 * Lazily initializes only when a virtual background / blur / background removal mode is enabled,
 * automatically falling back from GPU to CPU and reporting status cleanly if offline.
 */
export class CameraPersonSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private status: SegmentationEngineStatus = 'idle';
  private initPromise: Promise<SegmentationEngineStatus> | null = null;
  private maskCanvas: HTMLCanvasElement | null = null;
  private maskCtx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;
  private lastSegmentTs = -1;
  private lastInferenceWallMs = 0;

  getStatus(): SegmentationEngineStatus {
    return this.status;
  }

  async ensureInitialized(
    onStatusChange?: (status: SegmentationEngineStatus) => void
  ): Promise<SegmentationEngineStatus> {
    if (this.status === 'ready' && this.segmenter) return 'ready';
    if (this.status === 'fallback') return 'fallback';
    if (this.initPromise) return this.initPromise;

    this.status = 'loading';
    onStatusChange?.('loading');

    this.initPromise = (async () => {
      try {
        let vision = null;
        for (const wasmRoot of MEDIAPIPE_WASM_ROOTS) {
          try {
            vision = await FilesetResolver.forVisionTasks(wasmRoot);
            break;
          } catch {
            // Try next fallback CDN version
          }
        }
        if (!vision) {
          throw new Error('Could not initialize MediaPipe vision WASM runtime.');
        }
        try {
          this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: SELFIE_SEGMENTER_MODEL,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        } catch {
          // Graceful automatic fallback to CPU delegate when WebGL2 GPU delegate is unavailable
          this.segmenter = await ImageSegmenter.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: SELFIE_SEGMENTER_MODEL,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            outputCategoryMask: false,
            outputConfidenceMasks: true,
          });
        }

        if (typeof document !== 'undefined') {
          this.maskCanvas = document.createElement('canvas');
          this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: false });
        }

        this.status = 'ready';
        onStatusChange?.('ready');
        return 'ready';
      } catch {
        this.status = 'fallback';
        onStatusChange?.('fallback');
        return 'fallback';
      }
    })();

    return this.initPromise;
  }

  /**
   * Updates and returns an alpha-matte HTMLCanvasElement matching the video frame's aspect ratio
   * where foreground person pixels have smooth alpha 0..255. Throttled to ~24fps to keep CPU cool.
   */
  segmentVideoFrame(video: HTMLVideoElement, nowMs: number): HTMLCanvasElement | null {
    if (this.status !== 'ready' || !this.segmenter || !this.maskCanvas || !this.maskCtx) {
      return null;
    }
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    // Reuse recent mask between rapid rAF ticks (target ~24fps inference)
    if (nowMs - this.lastInferenceWallMs < 40 && this.maskCanvas.width > 0) {
      return this.maskCanvas;
    }

    // MediaPipe VIDEO mode requires strictly monotonically increasing integer timestamps
    const ts = Math.max(Math.round(nowMs), this.lastSegmentTs + 1);
    this.lastSegmentTs = ts;
    this.lastInferenceWallMs = nowMs;

    try {
      const result = this.segmenter.segmentForVideo(video, ts);
      const confidenceMasks = result.confidenceMasks;
      if (!confidenceMasks || confidenceMasks.length === 0) {
        result.close();
        return this.maskCanvas.width > 0 ? this.maskCanvas : null;
      }

      // MediaPipe selfie_segmenter outputs either 1 mask (foreground confidence) or 2 masks ([bg, person])
      const personMask =
        confidenceMasks.length > 1 ? confidenceMasks[1] : confidenceMasks[0];
      const mw = personMask.width;
      const mh = personMask.height;
      const floatData = personMask.getAsFloat32Array();

      if (this.maskCanvas.width !== mw || this.maskCanvas.height !== mh) {
        this.maskCanvas.width = mw;
        this.maskCanvas.height = mh;
        this.imageData = this.maskCtx.createImageData(mw, mh);
      }

      if (this.imageData) {
        const pixels = this.imageData.data;
        const len = Math.min(floatData.length, mw * mh);
        for (let i = 0; i < len; i++) {
          const idx = i * 4;
          const alpha = computePersonMaskAlpha(floatData[i]);
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = alpha;
        }
        this.maskCtx.putImageData(this.imageData, 0, 0);
      }

      result.close();
      return this.maskCanvas;
    } catch {
      return this.maskCanvas.width > 0 ? this.maskCanvas : null;
    }
  }

  dispose() {
    try {
      this.segmenter?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.segmenter = null;
    this.maskCanvas = null;
    this.maskCtx = null;
    this.imageData = null;
    this.initPromise = null;
    this.status = 'idle';
  }
}
