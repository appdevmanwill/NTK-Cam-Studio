import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Move } from 'lucide-react';
import type {
  AnnotationStroke,
  AnnotationTool,
  BackdropPreset,
  LiveReaction,
  Rect,
  SlideItem,
  StageConfig,
  StageDesignConfig,
  WebcamConfig,
} from '../types/studio';
import {
  computeContainRect,
  computeCoverSourceCrop,
  computeSideBySideLayout,
  computeStageViewportFit,
  computeTransitionState,
  computeWebcamBubbleRect,
  getCanvasDimensions,
  hitTestWebcamBubble,
  type TransitionState,
} from '../utils/compositorMath';
import {
  CameraPersonSegmenter,
  type SegmentationEngineStatus,
} from '../utils/cameraSegmentation';
import {
  computeAutoCenteredCoverCrop,
  WebcamAutoCenterTracker,
} from '../utils/faceAutoCenter';
import {
  buildSlideFilterString,
  buildWebcamFilterString,
  computeAnnotationOpacity,
  computeLowerThirdRect,
  computeReactionFrame,
  computeTextOverlayRect,
  computeWatermarkRect,
  hitTestLowerThird,
  hitTestTextOverlay,
  hitTestWatermark,
} from '../utils/studioEffects';

interface CanvasCompositorProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  stageConfig: StageConfig;
  webcamConfig: WebcamConfig;
  stageDesign: StageDesignConfig;
  backdrop: BackdropPreset;
  activeSlide: SlideItem | null;
  slideIndex: number;
  slideCount: number;
  cameraStream: MediaStream | null;
  screenStream: MediaStream | null;
  isRecording: boolean;
  annotationTool: AnnotationTool;
  annotationColor: string;
  autoFadeInk: boolean;
  annotations: AnnotationStroke[];
  reactions: LiveReaction[];
  onUpdateWebcamPosition: (x: number, y: number) => void;
  onUpdateTextOverlayPosition: (id: string, x: number, y: number) => void;
  onUpdateLowerThirdPosition: (x: number, y: number) => void;
  onUpdateWatermarkPosition: (x: number, y: number) => void;
  onAddAnnotation: (stroke: AnnotationStroke) => void;
  onPruneExpiredEffects: (now: number) => void;
  onPrevSlide: () => void;
  onNextSlide: () => void;
  onSegmentationStatusChange?: (status: SegmentationEngineStatus) => void;
  paused?: boolean;
  stageOverlayChildren?: React.ReactNode;
}

interface LaserTrailPoint {
  x: number;
  y: number;
  t: number;
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  backdrop: BackdropPreset
) {
  if (backdrop.category === 'solid' || backdrop.colors.length === 1) {
    ctx.fillStyle = backdrop.colors[0] || '#14161b';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const grad = ctx.createLinearGradient(0, 0, width, height);
  const stops = backdrop.colors;
  stops.forEach((color, idx) => {
    grad.addColorStop(idx / Math.max(1, stops.length - 1), color);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  if (backdrop.radialSpot) {
    const sx = width * backdrop.radialSpot.x;
    const sy = height * backdrop.radialSpot.y;
    const radius = Math.max(width, height) * 0.65;
    const radial = ctx.createRadialGradient(sx, sy, 10, sx, sy, radius);
    radial.addColorStop(0, backdrop.radialSpot.color);
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
  }
}

function createShapePath(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  shape: WebcamConfig['shape'],
  customRadius?: number
) {
  ctx.beginPath();
  if (shape === 'circle') {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const r = Math.min(rect.width, rect.height) / 2;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
  } else if (shape === 'rounded') {
    const r = customRadius ?? Math.min(rect.width, rect.height) * 0.14;
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, r);
  } else {
    const r = customRadius ?? Math.min(rect.width, rect.height) * 0.04;
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, r);
  }
}

function drawVirtualBackdropFill(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  virtualBg: WebcamConfig['effects']['virtualBg'],
  customBgImg: HTMLImageElement | null
) {
  const { x, y, width, height } = rect;
  if (virtualBg === 'custom' && customBgImg && customBgImg.complete && customBgImg.naturalWidth > 0) {
    const crop = computeCoverSourceCrop(
      customBgImg.naturalWidth,
      customBgImg.naturalHeight,
      width,
      height
    );
    ctx.drawImage(customBgImg, crop.x, crop.y, crop.width, crop.height, x, y, width, height);
    return;
  }

  if (virtualBg === 'modern-office') {
    // Warm sunlit minimalist architectural office backdrop (soft out-of-focus depth)
    const wall = ctx.createLinearGradient(x, y, x + width, y + height);
    wall.addColorStop(0, '#e2e8f0');
    wall.addColorStop(0.5, '#cbd5e1');
    wall.addColorStop(1, '#94a3b8');
    ctx.fillStyle = wall;
    ctx.fillRect(x, y, width, height);

    // Soft window sunlight shaft
    const sun = ctx.createRadialGradient(
      x + width * 0.2,
      y + height * 0.18,
      4,
      x + width * 0.2,
      y + height * 0.18,
      width * 0.72
    );
    sun.addColorStop(0, 'rgba(255, 251, 235, 0.92)');
    sun.addColorStop(0.55, 'rgba(254, 243, 199, 0.35)');
    sun.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(x, y, width, height);

    // Soft blurred wooden credenza & accent plant silhouette
    ctx.fillStyle = 'rgba(120, 84, 54, 0.32)';
    ctx.fillRect(x, y + height * 0.74, width, height * 0.26);
    const plantGlow = ctx.createRadialGradient(
      x + width * 0.85,
      y + height * 0.62,
      4,
      x + width * 0.85,
      y + height * 0.62,
      width * 0.24
    );
    plantGlow.addColorStop(0, 'rgba(22, 101, 52, 0.36)');
    plantGlow.addColorStop(1, 'rgba(22, 101, 52, 0)');
    ctx.fillStyle = plantGlow;
    ctx.fillRect(x, y, width, height);
    return;
  }

  if (virtualBg === 'bokeh') {
    const grad = ctx.createLinearGradient(x, y, x + width, y + height);
    grad.addColorStop(0, '#1e1b38');
    grad.addColorStop(0.5, '#171c30');
    grad.addColorStop(1, '#0d111d');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);

    const orbs = [
      { ox: 0.2, oy: 0.24, r: 0.22, color: 'rgba(251, 191, 36, 0.36)' },
      { ox: 0.82, oy: 0.26, r: 0.24, color: 'rgba(96, 165, 250, 0.34)' },
      { ox: 0.16, oy: 0.76, r: 0.19, color: 'rgba(192, 132, 252, 0.28)' },
      { ox: 0.78, oy: 0.78, r: 0.18, color: 'rgba(244, 114, 182, 0.24)' },
    ];
    for (const orb of orbs) {
      const gx = x + width * orb.ox;
      const gy = y + height * orb.oy;
      const gr = Math.min(width, height) * orb.r;
      const og = ctx.createRadialGradient(gx, gy, 2, gx, gy, gr);
      og.addColorStop(0, orb.color);
      og.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = og;
      ctx.fillRect(x, y, width, height);
    }
    return;
  }

  // studio-dark (and fallback for custom before upload)
  const bgGrad = ctx.createLinearGradient(x, y, x + width, y + height);
  bgGrad.addColorStop(0, '#182030');
  bgGrad.addColorStop(0.55, '#10141f');
  bgGrad.addColorStop(1, '#090b10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(x, y, width, height);

  const keyLight = ctx.createRadialGradient(
    x + width * 0.5,
    y + height * 0.35,
    4,
    x + width * 0.5,
    y + height * 0.35,
    Math.max(width, height) * 0.6
  );
  keyLight.addColorStop(0, 'rgba(59, 130, 246, 0.24)');
  keyLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = keyLight;
  ctx.fillRect(x, y, width, height);
}

function drawCameraPlaceholder(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  virtualBg: WebcamConfig['effects']['virtualBg'],
  customBgImg: HTMLImageElement | null,
  camFilter: string
) {
  ctx.save();
  if ('filter' in ctx && camFilter !== 'none') {
    ctx.filter = camFilter;
  }

  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  if (virtualBg === 'remove') {
    // Transparent presenter cutout preview (no filled box behind silhouette)
  } else if (
    virtualBg === 'studio-dark' ||
    virtualBg === 'modern-office' ||
    virtualBg === 'bokeh' ||
    virtualBg === 'custom'
  ) {
    drawVirtualBackdropFill(ctx, rect, virtualBg, customBgImg);
  } else {
    const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
    if (virtualBg === 'blur-light' || virtualBg === 'blur-strong') {
      grad.addColorStop(0, '#2c364b');
      grad.addColorStop(1, '#121722');
    } else {
      grad.addColorStop(0, '#1e2431');
      grad.addColorStop(1, '#11151e');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    // Subtle ambient rim glow behind silhouette
    const rim = ctx.createRadialGradient(
      cx,
      cy * 0.96,
      4,
      cx,
      cy,
      Math.max(rect.width, rect.height) * 0.55
    );
    rim.addColorStop(0, 'rgba(96, 165, 250, 0.22)');
    rim.addColorStop(1, 'rgba(96, 165, 250, 0)');
    ctx.fillStyle = rim;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }

  // Minimalist presenter silhouette
  const scale = Math.min(rect.width, rect.height);
  ctx.fillStyle =
    virtualBg === 'modern-office'
      ? 'rgba(30, 41, 59, 0.55)'
      : virtualBg === 'remove'
        ? 'rgba(148, 163, 184, 0.65)'
        : 'rgba(203, 213, 225, 0.38)';
  ctx.beginPath();
  ctx.arc(cx, cy - scale * 0.12, scale * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy + scale * 0.34, scale * 0.31, scale * 0.24, 0, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Crisp status label inside camera bubble (unfiltered so text stays sharp)
  const fontSize = Math.max(10, Math.round(scale * 0.068));
  ctx.font = `500 ${fontSize}px "DM Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = virtualBg === 'remove' ? 'BG Removed' : 'Camera Off';
  const labelX = rect.x + rect.width / 2;
  const labelY = rect.y + rect.height - Math.max(26, scale * 0.22);

  if (virtualBg === 'remove') {
    const metrics = ctx.measureText(label);
    const padX = Math.max(10, Math.round(fontSize * 0.7));
    const pillW = Math.min(rect.width * 0.72, metrics.width + padX * 2);
    const pillH = Math.round(fontSize * 1.75);
    const pillX = labelX - pillW / 2;
    const pillY = labelY - pillH / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = 'rgba(15, 18, 26, 0.86)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#F8FAFC';
  } else {
    ctx.fillStyle =
      virtualBg === 'modern-office' ? 'rgba(15, 23, 42, 0.85)' : 'rgba(226, 232, 240, 0.85)';
  }

  ctx.fillText(label, labelX, labelY);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function drawWebcamFrame(
  ctx: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement | null,
  offscreenCanvas: HTMLCanvasElement,
  personMaskCanvas: HTMLCanvasElement | null,
  customBgImg: HTMLImageElement | null,
  rect: Rect,
  shape: WebcamConfig['shape'],
  webcam: WebcamConfig,
  isFloatingPip: boolean,
  autoCenterAnchor: { x: number; y: number } | null = null,
  overrideRadius?: number
) {
  ctx.save();

  const camFilter = buildWebcamFilterString(webcam.effects);
  const virtualBg = webcam.effects.virtualBg;
  const isTransparentCutout = virtualBg === 'remove' && isFloatingPip;

  // Optional outer drop shadow (skipped for transparent PiP cutout so no opaque circle appears behind person)
  if (webcam.shadow && !isTransparentCutout) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.48)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    createShapePath(ctx, rect, shape, overrideRadius);
    ctx.fillStyle = '#0f1117';
    ctx.fill();
    ctx.restore();
  }

  // Clip to target webcam shape (keep clip even on cutout so bubble stays within bounds)
  ctx.save();
  createShapePath(ctx, rect, shape, overrideRadius);
  ctx.clip();

  const hasLiveVideo =
    videoEl && videoEl.readyState >= 2 && videoEl.videoWidth > 0 && videoEl.videoHeight > 0;

  if (hasLiveVideo) {
    const crop =
      webcam.autoCenter && autoCenterAnchor
        ? computeAutoCenteredCoverCrop(
            videoEl.videoWidth,
            videoEl.videoHeight,
            rect.width,
            rect.height,
            autoCenterAnchor.x,
            autoCenterAnchor.y,
            1.18
          )
        : computeCoverSourceCrop(
            videoEl.videoWidth,
            videoEl.videoHeight,
            rect.width,
            rect.height
          );

    const drawVideo = (
      targetCtx: CanvasRenderingContext2D,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
      filterStr?: string
    ) => {
      targetCtx.save();
      if ('filter' in targetCtx && filterStr && filterStr !== 'none') {
        targetCtx.filter = filterStr;
      }
      if (webcam.mirror) {
        targetCtx.translate(dx + dw, dy);
        targetCtx.scale(-1, 1);
        targetCtx.drawImage(videoEl, crop.x, crop.y, crop.width, crop.height, 0, 0, dw, dh);
      } else {
        targetCtx.drawImage(videoEl, crop.x, crop.y, crop.width, crop.height, dx, dy, dw, dh);
      }
      targetCtx.restore();
    };

    const drawSegmentedPersonToOffscreen = (ow: number, oh: number, filterStr: string) => {
      if (offscreenCanvas.width !== ow || offscreenCanvas.height !== oh) {
        offscreenCanvas.width = ow;
        offscreenCanvas.height = oh;
      }
      const octx = offscreenCanvas.getContext('2d');
      if (!octx) return false;

      octx.clearRect(0, 0, ow, oh);
      octx.globalCompositeOperation = 'source-over';
      drawVideo(octx, 0, 0, ow, oh, filterStr);

      octx.globalCompositeOperation = 'destination-in';
      if (personMaskCanvas && personMaskCanvas.width > 0 && personMaskCanvas.height > 0) {
        // Real MediaPipe AI person segmentation matte cropped identically to cover-cropped video
        const maskScaleX = personMaskCanvas.width / Math.max(1, videoEl.videoWidth);
        const maskScaleY = personMaskCanvas.height / Math.max(1, videoEl.videoHeight);
        const mx = crop.x * maskScaleX;
        const my = crop.y * maskScaleY;
        const mw = crop.width * maskScaleX;
        const mh = crop.height * maskScaleY;

        octx.save();
        if ('filter' in octx) {
          octx.filter = 'blur(1.8px)';
        }
        if (webcam.mirror) {
          octx.translate(ow, 0);
          octx.scale(-1, 1);
          octx.drawImage(personMaskCanvas, mx, my, mw, mh, 0, 0, ow, oh);
        } else {
          octx.drawImage(personMaskCanvas, mx, my, mw, mh, 0, 0, ow, oh);
        }
        octx.restore();
      } else {
        // Smooth temporary portrait feather while AI model initializes or if offline
        const maskGrad = octx.createRadialGradient(
          ow * 0.5,
          oh * 0.48,
          Math.min(ow, oh) * 0.22,
          ow * 0.5,
          oh * 0.52,
          Math.max(ow, oh) * 0.5
        );
        maskGrad.addColorStop(0, 'rgba(0,0,0,1)');
        maskGrad.addColorStop(0.65, 'rgba(0,0,0,0.92)');
        maskGrad.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = maskGrad;
        octx.fillRect(0, 0, ow, oh);
      }
      octx.globalCompositeOperation = 'source-over';
      return true;
    };

    if (virtualBg !== 'none') {
      // Layer 1: Background replacement or blurred room (omitted for 'remove' so stage shows through)
      if (virtualBg === 'blur-light' || virtualBg === 'blur-strong') {
        const blurPx =
          virtualBg === 'blur-strong'
            ? 'blur(22px) saturate(1.08)'
            : 'blur(10px) saturate(1.04)';
        const bgFilter = camFilter !== 'none' ? `${camFilter} ${blurPx}` : blurPx;
        drawVideo(ctx, rect.x - 14, rect.y - 14, rect.width + 28, rect.height + 28, bgFilter);
      } else if (virtualBg !== 'remove') {
        drawVirtualBackdropFill(ctx, rect, virtualBg, customBgImg);
      }

      // Layer 2: Crisp AI-segmented foreground person
      const ow = Math.max(1, Math.round(rect.width));
      const oh = Math.max(1, Math.round(rect.height));
      if (drawSegmentedPersonToOffscreen(ow, oh, camFilter)) {
        if (isTransparentCutout && webcam.shadow) {
          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 4;
          ctx.drawImage(offscreenCanvas, rect.x, rect.y, rect.width, rect.height);
          ctx.restore();
        } else {
          ctx.drawImage(offscreenCanvas, rect.x, rect.y, rect.width, rect.height);
        }
      }

      // Soft skin smoothing only over the segmented person when background is active
      if (webcam.effects.skinSmooth > 0) {
        const smoothFilter =
          camFilter !== 'none'
            ? `${camFilter} blur(2.6px) brightness(104%)`
            : 'blur(2.6px) brightness(104%)';
        if (drawSegmentedPersonToOffscreen(ow, oh, smoothFilter)) {
          ctx.save();
          ctx.globalAlpha = (webcam.effects.skinSmooth / 100) * 0.34;
          ctx.drawImage(offscreenCanvas, rect.x, rect.y, rect.width, rect.height);
          ctx.restore();
        }
      }
    } else {
      drawVideo(ctx, rect.x, rect.y, rect.width, rect.height, camFilter);

      // YouCam-style soft-focus skin smoothing / studio diffusion glow pass
      if (webcam.effects.skinSmooth > 0) {
        ctx.save();
        const smoothAlpha = (webcam.effects.skinSmooth / 100) * 0.36;
        ctx.globalAlpha = smoothAlpha;
        const smoothFilter =
          camFilter !== 'none'
            ? `${camFilter} blur(2.6px) brightness(104%)`
            : 'blur(2.6px) brightness(104%)';
        drawVideo(ctx, rect.x, rect.y, rect.width, rect.height, smoothFilter);
        ctx.restore();
      }
    }
  } else {
    drawCameraPlaceholder(ctx, rect, virtualBg, customBgImg, camFilter);
  }

  ctx.restore();

  // Border stroke (hidden for transparent cutout mode so presenter floats cleanly over slide)
  if (webcam.borderStyle !== 'none' && !isTransparentCutout) {
    createShapePath(ctx, rect, shape, overrideRadius);
    if (webcam.borderStyle === 'subtle') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.lineWidth = 3;
    } else if (webcam.borderStyle === 'bright') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 5;
    } else if (webcam.borderStyle === 'accent') {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 5;
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawPresentationMedia(
  ctx: CanvasRenderingContext2D,
  bounds: Rect,
  radius: number,
  sourceMode: StageConfig['sourceMode'],
  slideImage: HTMLImageElement | null,
  slideFilter: string,
  screenVideo: HTMLVideoElement | null,
  prevSlideImage: HTMLImageElement | null,
  prevSlideFilter: string,
  slideTransition: TransitionState | null
) {
  const hasScreen =
    sourceMode === 'screen' &&
    screenVideo &&
    screenVideo.readyState >= 2 &&
    screenVideo.videoWidth > 0 &&
    screenVideo.videoHeight > 0;

  const hasSlide =
    sourceMode === 'slides' &&
    slideImage &&
    slideImage.complete &&
    slideImage.naturalWidth > 0;

  if (!hasScreen && !hasSlide) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(bounds.x, bounds.y, bounds.width, bounds.height, radius);
    ctx.fillStyle = 'rgba(18, 20, 26, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 28px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      sourceMode === 'screen' ? 'No Screen Shared Yet' : 'No Slides Loaded',
      cx,
      cy - 10
    );
    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 18px "DM Sans", sans-serif';
    ctx.fillText(
      sourceMode === 'screen'
        ? 'Use "Share Screen" in the toolbar or sidebar to capture a window or tab.'
        : 'Upload PowerPoint, PDF, or image slides from the Slides panel.',
      cx,
      cy + 26
    );
    ctx.textAlign = 'start';
    ctx.restore();
    return;
  }

  const mediaW = hasScreen ? screenVideo.videoWidth : slideImage!.naturalWidth;
  const mediaH = hasScreen ? screenVideo.videoHeight : slideImage!.naturalHeight;
  const fitted = computeContainRect(mediaW, mediaH, bounds);
  const isFullBleed = bounds.x === 0 && bounds.y === 0 && radius === 0;

  const drawFilteredSlide = (
    img: HTMLImageElement,
    filterStr: string,
    alpha = 1,
    dest: Rect = fitted
  ) => {
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    if ('filter' in ctx && filterStr !== 'none') {
      ctx.filter = filterStr;
    }
    ctx.drawImage(img, dest.x, dest.y, dest.width, dest.height);
    ctx.restore();
  };

  ctx.save();
  // Soft studio elevation shadow only when framed with padding/radius
  if (!isFullBleed) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.roundRect(fitted.x, fitted.y, fitted.width, fitted.height, radius);
    ctx.fillStyle = '#090a0d';
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  if (radius > 0) {
    ctx.roundRect(fitted.x, fitted.y, fitted.width, fitted.height, radius);
  } else {
    ctx.rect(fitted.x, fitted.y, fitted.width, fitted.height);
  }
  ctx.clip();

  if (hasScreen) {
    ctx.drawImage(screenVideo, fitted.x, fitted.y, fitted.width, fitted.height);
  } else if (slideImage) {
    const canTransitionSlide =
      Boolean(slideTransition?.active) &&
      prevSlideImage &&
      prevSlideImage.complete &&
      prevSlideImage.naturalWidth > 0;
    const prevFitted = prevSlideImage
      ? computeContainRect(prevSlideImage.naturalWidth, prevSlideImage.naturalHeight, bounds)
      : fitted;

    if (canTransitionSlide && slideTransition) {
      if (slideTransition.blackAlpha > 0) {
        const imgToDraw = slideTransition.showPrevBase ? prevSlideImage! : slideImage;
        const filt = slideTransition.showPrevBase ? prevSlideFilter : slideFilter;
        const dest = slideTransition.showPrevBase ? prevFitted : fitted;
        drawFilteredSlide(imgToDraw, filt, 1, dest);
        ctx.fillStyle = `rgba(0, 0, 0, ${slideTransition.blackAlpha})`;
        ctx.fillRect(fitted.x, fitted.y, fitted.width, fitted.height);
      } else {
        drawFilteredSlide(slideImage, slideFilter, 1, fitted);
        if (slideTransition.prevAlpha > 0) {
          drawFilteredSlide(
            prevSlideImage!,
            prevSlideFilter,
            slideTransition.prevAlpha,
            prevFitted
          );
        }
      }
    } else {
      drawFilteredSlide(slideImage, slideFilter, 1, fitted);
    }
  }
  ctx.restore();

  // Crisp subtle hairline border only when framed with backdrop padding
  if (!isFullBleed) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(fitted.x, fitted.y, fitted.width, fitted.height, radius);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

function drawStageDesignOverlays(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  design: StageDesignConfig,
  logoImage: HTMLImageElement | null
) {
  const sf = Math.min(w, h) / 720;

  // 1. Canva Brand Watermark / Logo (freely draggable anywhere on stage)
  if (design.watermark.enabled) {
    ctx.save();
    ctx.globalAlpha = design.watermark.opacity;

    const hasLogo = Boolean(logoImage && logoImage.complete && logoImage.naturalWidth > 0);
    const logoRatio =
      hasLogo && logoImage ? logoImage.naturalWidth / Math.max(1, logoImage.naturalHeight) : null;
    const wmRect = computeWatermarkRect(design.watermark, w, h, logoRatio, ctx);

    if (hasLogo && logoImage) {
      ctx.drawImage(logoImage, wmRect.x, wmRect.y, wmRect.width, wmRect.height);
    } else {
      const fontPx = Math.round(18 * sf * design.watermark.size);
      ctx.fillStyle = 'rgba(15, 18, 25, 0.65)';
      ctx.beginPath();
      ctx.roundRect(wmRect.x, wmRect.y, wmRect.width, wmRect.height, Math.round(8 * sf));
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = Math.max(1, 1.2 * sf);
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = `700 ${fontPx}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        design.watermark.text.trim() || 'NTK CAM',
        wmRect.x + wmRect.width / 2,
        wmRect.y + wmRect.height / 2
      );
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }

  // 2. Canva Draggable Stage Text Overlays
  for (const ov of design.textOverlays) {
    if (!ov.text.trim()) continue;
    const rect = computeTextOverlayRect(ov, w, h);
    const fontPx = Math.round(ov.fontSize * sf);
    const radius =
      ov.style === 'badge' ? Math.round(rect.height / 2) : Math.round(10 * sf);

    ctx.save();
    if (ov.style !== 'headline') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = ov.bgColor;
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(1, 1.5 * sf);
      ctx.stroke();
    } else {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 3;
    }

    ctx.fillStyle = ov.textColor || '#ffffff';
    ctx.font = `${ov.style === 'badge' ? 600 : 700} ${fontPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ov.text, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
    ctx.restore();
  }

  // 3. Zoom / YouCam Broadcast Presenter Lower-Third Banner (freely draggable anywhere on stage)
  if (design.lowerThird.enabled && (design.lowerThird.name.trim() || design.lowerThird.title.trim())) {
    const lt = design.lowerThird;
    const nameFontPx = Math.round(24 * sf);
    const titleFontPx = Math.round(15 * sf);
    const padX = Math.round(20 * sf);
    const padY = Math.round(13 * sf);
    const accentW = lt.style === 'minimal' ? 0 : Math.round(6 * sf);

    ctx.save();
    const ltRect = computeLowerThirdRect(lt, w, h, ctx);
    const { x, y, width: cardW, height: cardH } = ltRect;

    // Background container
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, Math.round(10 * sf));
    if (lt.style === 'glass') {
      ctx.fillStyle = 'rgba(15, 20, 30, 0.72)';
    } else if (lt.style === 'minimal') {
      ctx.fillStyle = 'rgba(11, 13, 18, 0.88)';
    } else {
      ctx.fillStyle = '#0f131c';
    }
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = lt.style === 'glass' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, 1.2 * sf);
    ctx.stroke();

    // Accent strip (Broadcast / Glass)
    if (accentW > 0) {
      ctx.fillStyle = lt.accentColor;
      ctx.beginPath();
      ctx.roundRect(
        x + Math.round(8 * sf),
        y + Math.round(9 * sf),
        accentW,
        cardH - Math.round(18 * sf),
        Math.round(3 * sf)
      );
      ctx.fill();
    }

    const textX = x + padX + (accentW > 0 ? accentW + Math.round(4 * sf) : 0);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${nameFontPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(lt.name.trim(), textX, y + padY);

    if (lt.title.trim()) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `500 ${titleFontPx}px "DM Sans", sans-serif`;
      ctx.fillText(lt.title.trim(), textX, y + padY + nameFontPx + Math.round(6 * sf));
    }
    ctx.restore();
  }

  // 4. Zoom Raise Hand Indicator Badge
  if (design.handRaised) {
    const pad = Math.round(28 * sf);
    const bh = Math.round(40 * sf);
    const bw = Math.round(154 * sf);
    const bx = pad;
    const by = pad;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(245, 158, 11, 0.94)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, Math.round(bh / 2));
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.fillStyle = '#111827';
    ctx.font = `700 ${Math.round(16 * sf)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✋  Hand Raised', bx + bw / 2, by + bh / 2 + 1);
    ctx.restore();
  }
}

function drawAnnotationStroke(
  ctx: CanvasRenderingContext2D,
  stroke: AnnotationStroke,
  w: number,
  h: number,
  opacity: number
) {
  if (stroke.points.length === 0 || opacity <= 0) return;
  const sf = Math.min(w, h) / 720;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = opacity * 0.38;
    ctx.lineWidth = Math.max(12, stroke.width * 3.8 * sf);
  } else {
    ctx.globalAlpha = opacity;
    ctx.lineWidth = Math.max(2.5, stroke.width * sf);
  }

  if (stroke.tool === 'arrow' && stroke.points.length >= 2) {
    const start = stroke.points[0];
    const end = stroke.points[stroke.points.length - 1];
    const x1 = start.x * w;
    const y1 = start.y * h;
    const x2 = end.x * w;
    const y2 = end.y * h;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(16, 22 * sf);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    const p0 = stroke.points[0];
    ctx.moveTo(p0.x * w, p0.y * h);
    for (let i = 1; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      ctx.lineTo(p.x * w, p.y * h);
    }
    if (stroke.points.length === 1) {
      ctx.lineTo(p0.x * w + 0.5, p0.y * h + 0.5);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawLaserPointer(
  ctx: CanvasRenderingContext2D,
  trail: LaserTrailPoint[],
  w: number,
  h: number,
  color: string,
  now: number
) {
  if (trail.length === 0) return;
  const sf = Math.min(w, h) / 720;
  const maxAge = 460;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < trail.length; i++) {
    const p0 = trail[i - 1];
    const p1 = trail[i];
    const age = now - p1.t;
    if (age > maxAge) continue;
    const alpha = Math.max(0, 1 - age / maxAge);
    ctx.beginPath();
    ctx.moveTo(p0.x * w, p0.y * h);
    ctx.lineTo(p1.x * w, p1.y * h);
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * 0.65;
    ctx.lineWidth = Math.max(2, 8 * sf * alpha);
    ctx.stroke();
  }

  const head = trail[trail.length - 1];
  const headAge = now - head.t;
  if (headAge < maxAge) {
    const hx = head.x * w;
    const hy = head.y * h;
    const headAlpha = Math.max(0, 1 - headAge / maxAge);

    const glow = ctx.createRadialGradient(hx, hy, 2, hx, hy, 24 * sf);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = headAlpha * 0.85;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, 24 * sf, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = headAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, 5.5 * sf, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawLiveReactions(
  ctx: CanvasRenderingContext2D,
  reactions: LiveReaction[],
  w: number,
  h: number,
  now: number
) {
  if (reactions.length === 0) return;
  const baseFont = Math.round(52 * (Math.min(w, h) / 720));

  for (const r of reactions) {
    const frame = computeReactionFrame(r, now, w, h);
    if (!frame.active) continue;

    ctx.save();
    ctx.globalAlpha = frame.opacity;
    ctx.translate(frame.x, frame.y);
    ctx.scale(frame.scale, frame.scale);
    ctx.font = `${baseFont}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(r.emoji, 0, 0);
    ctx.restore();
  }
}

export const CanvasCompositor: React.FC<CanvasCompositorProps> = ({
  canvasRef,
  stageConfig,
  webcamConfig,
  stageDesign,
  backdrop,
  activeSlide,
  slideIndex,
  slideCount,
  cameraStream,
  screenStream,
  isRecording,
  annotationTool,
  annotationColor,
  autoFadeInk,
  annotations,
  reactions,
  onUpdateWebcamPosition,
  onUpdateTextOverlayPosition,
  onUpdateLowerThirdPosition,
  onUpdateWatermarkPosition,
  onAddAnnotation,
  onPruneExpiredEffects,
  onPrevSlide,
  onNextSlide,
  onSegmentationStatusChange,
  paused = false,
  stageOverlayChildren,
}) => {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevSceneCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const slideImageRef = useRef<HTMLImageElement | null>(null);
  const prevSlideImageRef = useRef<HTMLImageElement | null>(null);
  const prevSlideFilterRef = useRef<string>('none');
  const loadedSlideUrlRef = useRef<string>('');
  const watermarkLogoImgRef = useRef<HTMLImageElement | null>(null);
  const customBgImgRef = useRef<HTMLImageElement | null>(null);
  const segmenterRef = useRef<CameraPersonSegmenter | null>(null);
  const autoCenterTrackerRef = useRef<WebcamAutoCenterTracker | null>(null);
  const prevLayoutRef = useRef<StageConfig['layout']>(stageConfig.layout);
  const [segStatus, setSegStatus] = useState<SegmentationEngineStatus>('idle');
  const [stageBoxSize, setStageBoxSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const activeStrokeRef = useRef<AnnotationStroke | null>(null);
  const laserTrailRef = useRef<LaserTrailPoint[]>([]);
  const lastPruneTimeRef = useRef<number>(0);

  const slideTransitionRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
  }>({ active: false, startTime: 0, durationMs: 340 });

  const layoutTransitionRef = useRef<{
    active: boolean;
    startTime: number;
    durationMs: number;
  }>({ active: false, startTime: 0, durationMs: 380 });

  const [isHoveringBubble, setIsHoveringBubble] = useState(false);
  const [isHoveringTextOverlay, setIsHoveringTextOverlay] = useState(false);
  const [isDraggingBubble, setIsDraggingBubble] = useState(false);
  const [draggingOverlayId, setDraggingOverlayId] = useState<string | null>(null);
  const [draggingStageItem, setDraggingStageItem] = useState<'lowerThird' | 'watermark' | null>(
    null
  );
  const [hoverStageItem, setHoverStageItem] = useState<'lowerThird' | 'watermark' | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const slideFilter = useMemo(
    () => buildSlideFilterString(activeSlide?.adjustments),
    [activeSlide?.adjustments]
  );
  const cameraFilter = useMemo(
    () => buildWebcamFilterString(webcamConfig.effects),
    [webcamConfig.effects]
  );

  const dirtyRef = useRef<boolean>(true);
  const hasLiveMediaRef = useRef<boolean>(false);
  hasLiveMediaRef.current = Boolean(cameraStream || screenStream || isRecording);

  const stateRef = useRef({
    stageConfig,
    webcamConfig,
    stageDesign,
    backdrop,
    slideFilter,
    annotations,
    reactions,
    annotationColor,
    onPruneExpiredEffects,
  });
  stateRef.current = {
    stageConfig,
    webcamConfig,
    stageDesign,
    backdrop,
    slideFilter,
    annotations,
    reactions,
    annotationColor,
    onPruneExpiredEffects,
  };

  // Preload optional brand watermark logo
  useEffect(() => {
    const url = stageDesign.watermark.logoDataUrl;
    if (!url) {
      watermarkLogoImgRef.current = null;
      dirtyRef.current = true;
      return;
    }
    const img = new Image();
    img.onload = () => {
      watermarkLogoImgRef.current = img;
      dirtyRef.current = true;
    };
    img.src = url;
  }, [stageDesign.watermark.logoDataUrl]);

  // Preload optional custom virtual background image
  useEffect(() => {
    const url = webcamConfig.effects.customBgUrl;
    if (!url) {
      customBgImgRef.current = null;
      dirtyRef.current = true;
      return;
    }
    const img = new Image();
    img.onload = () => {
      customBgImgRef.current = img;
      dirtyRef.current = true;
    };
    img.src = url;
  }, [webcamConfig.effects.customBgUrl]);

  // Lazily initialize real MediaPipe AI person segmentation when camera + background effect are active
  useEffect(() => {
    const needsSeg = Boolean(cameraStream) && webcamConfig.effects.virtualBg !== 'none';
    if (!needsSeg) return;
    if (!segmenterRef.current) {
      segmenterRef.current = new CameraPersonSegmenter();
    }
    void segmenterRef.current.ensureInitialized((nextStatus) => {
      setSegStatus(nextStatus);
      onSegmentationStatusChange?.(nextStatus);
      dirtyRef.current = true;
    });
  }, [cameraStream, webcamConfig.effects.virtualBg, onSegmentationStatusChange]);

  // Reset auto-center tracker smoothly when toggled off or camera stops
  useEffect(() => {
    if (!webcamConfig.autoCenter || !cameraStream) {
      autoCenterTrackerRef.current?.reset();
    }
    dirtyRef.current = true;
  }, [cameraStream, webcamConfig.autoCenter]);

  // Dispose AI segmentation WebGL/WASM resources on unmount
  useEffect(() => {
    return () => {
      segmenterRef.current?.dispose();
      segmenterRef.current = null;
      autoCenterTrackerRef.current = null;
    };
  }, []);

  // Measure available stage container and strictly enforce exact aspect ratio (prevents horizontal stretching)
  useEffect(() => {
    const el = stageContainerRef.current;
    if (!el) return;

    const updateSize = () => {
      const style = window.getComputedStyle(el);
      const padX = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
      const padY = parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
      const availW = Math.max(0, el.clientWidth - padX);
      const availH = Math.max(0, el.clientHeight - padY);
      const fitted = computeStageViewportFit(availW, availH, stageConfig.aspectRatio);
      setStageBoxSize((prev) =>
        prev.width === fitted.width && prev.height === fitted.height ? prev : fitted
      );
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    window.addEventListener('resize', updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateSize);
    };
  }, [stageConfig.aspectRatio]);

  // Snapshot current composited canvas before layout changes so layout switch animates smoothly
  useEffect(() => {
    if (prevLayoutRef.current !== stageConfig.layout) {
      prevLayoutRef.current = stageConfig.layout;
      const canvas = canvasRef.current;
      if (stageConfig.transition !== 'none' && canvas && canvas.width > 0 && canvas.height > 0) {
        if (!prevSceneCanvasRef.current && typeof document !== 'undefined') {
          prevSceneCanvasRef.current = document.createElement('canvas');
        }
        const snap = prevSceneCanvasRef.current;
        if (snap) {
          snap.width = canvas.width;
          snap.height = canvas.height;
          const sctx = snap.getContext('2d');
          if (sctx) {
            sctx.clearRect(0, 0, snap.width, snap.height);
            sctx.drawImage(canvas, 0, 0);
            layoutTransitionRef.current = {
              active: true,
              startTime: performance.now(),
              durationMs: stageConfig.transition === 'fade-black' ? 420 : 340,
            };
          }
        }
      }
      dirtyRef.current = true;
    }
  }, [canvasRef, stageConfig.layout, stageConfig.transition]);

  // Mark canvas dirty whenever visual studio configuration changes
  useEffect(() => {
    dirtyRef.current = true;
  }, [
    stageConfig,
    webcamConfig,
    stageDesign,
    backdrop,
    activeSlide,
    slideFilter,
    annotations,
    reactions,
    cameraStream,
    screenStream,
    isRecording,
  ]);

  const dimensions = useMemo(
    () => getCanvasDimensions(stageConfig.aspectRatio, stageConfig.resolution),
    [stageConfig.aspectRatio, stageConfig.resolution]
  );

  // Sync camera stream to hidden video element
  useEffect(() => {
    const video = cameraVideoRef.current;
    if (!video) return;
    if (cameraStream) {
      video.srcObject = cameraStream;
      void video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
    dirtyRef.current = true;
  }, [cameraStream]);

  // Sync screen share stream to hidden video element
  useEffect(() => {
    const video = screenVideoRef.current;
    if (!video) return;
    if (screenStream) {
      video.srcObject = screenStream;
      void video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
    dirtyRef.current = true;
  }, [screenStream]);

  // Preload active slide HTMLImageElement and trigger smooth slide transition
  useEffect(() => {
    if (!activeSlide?.dataUrl) {
      prevSlideImageRef.current = null;
      slideImageRef.current = null;
      loadedSlideUrlRef.current = '';
      slideTransitionRef.current.active = false;
      dirtyRef.current = true;
      return;
    }
    if (loadedSlideUrlRef.current === activeSlide.dataUrl) {
      return;
    }
    const previousImg = slideImageRef.current;
    const previousFilter = stateRef.current.slideFilter;
    loadedSlideUrlRef.current = activeSlide.dataUrl;
    const img = new Image();
    img.onload = () => {
      if (loadedSlideUrlRef.current === activeSlide.dataUrl) {
        if (previousImg && stateRef.current.stageConfig.transition !== 'none') {
          prevSlideImageRef.current = previousImg;
          prevSlideFilterRef.current = previousFilter;
          slideTransitionRef.current = {
            active: true,
            startTime: performance.now(),
            durationMs: stateRef.current.stageConfig.transition === 'fade-black' ? 400 : 320,
          };
        } else {
          prevSlideImageRef.current = null;
          slideTransitionRef.current.active = false;
        }
        slideImageRef.current = img;
        dirtyRef.current = true;
      }
    };
    img.src = activeSlide.dataUrl;
  }, [activeSlide]);

  // Real-time requestAnimationFrame compositor loop
  useEffect(() => {
    if (paused) {
      return;
    }
    dirtyRef.current = true;

    if (!offscreenCanvasRef.current && typeof document !== 'undefined') {
      offscreenCanvasRef.current = document.createElement('canvas');
    }

    let rafId = 0;
    let lastDrawTime = 0;

    const renderFrame = (now: number) => {
      if (pausedRef.current) {
        return;
      }
      const stState = stateRef.current;
      const liveMode = hasLiveMediaRef.current;

      // Prune stale laser trail points
      if (laserTrailRef.current.length > 0) {
        laserTrailRef.current = laserTrailRef.current.filter((p) => now - p.t < 460);
      }

      const hasFadingStrokes = stState.annotations.some((s) => s.autoFade);
      const hasReactions = stState.reactions.length > 0;
      const hasLaser = laserTrailRef.current.length > 0;
      const animatingTransition =
        slideTransitionRef.current.active || layoutTransitionRef.current.active;
      const hasAnimatedEffects = animatingTransition || hasFadingStrokes || hasReactions || hasLaser;

      // Periodically prune expired auto-fade annotations / reactions from React state
      if ((hasFadingStrokes || hasReactions) && now - lastPruneTimeRef.current > 350) {
        lastPruneTimeRef.current = now;
        stState.onPruneExpiredEffects(Date.now());
      }

      const shouldDraw =
        dirtyRef.current ||
        (hasAnimatedEffects && now - lastDrawTime >= 24) ||
        (liveMode && now - lastDrawTime >= 32);

      if (shouldDraw) {
        dirtyRef.current = false;
        lastDrawTime = now;

        const canvas = canvasRef.current;
        const offscreen = offscreenCanvasRef.current;
        if (canvas && offscreen) {
          const {
            stageConfig: sc,
            webcamConfig: wc,
            stageDesign: sd,
            backdrop: bp,
            slideFilter: activeSlideFilter,
            annotations: committedAnnotations,
            reactions: liveReactions,
            annotationColor: laserColor,
          } = stState;

          const target = getCanvasDimensions(sc.aspectRatio, sc.resolution);
          if (canvas.width !== target.width || canvas.height !== target.height) {
            canvas.width = target.width;
            canvas.height = target.height;
            layoutTransitionRef.current.active = false;
          }

          // Compute active slide transition state
          let activeSlideTrans: TransitionState | null = null;
          if (slideTransitionRef.current.active) {
            const elapsed = now - slideTransitionRef.current.startTime;
            const st = computeTransitionState(
              elapsed,
              slideTransitionRef.current.durationMs,
              sc.transition
            );
            if (!st.active) {
              slideTransitionRef.current.active = false;
              prevSlideImageRef.current = null;
            } else {
              activeSlideTrans = st;
            }
          }

          // Compute active layout transition state
          let activeLayoutTrans: TransitionState | null = null;
          if (layoutTransitionRef.current.active) {
            const elapsed = now - layoutTransitionRef.current.startTime;
            const lt = computeTransitionState(
              elapsed,
              layoutTransitionRef.current.durationMs,
              sc.transition
            );
            if (!lt.active) {
              layoutTransitionRef.current.active = false;
            } else {
              activeLayoutTrans = lt;
            }
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            const w = canvas.width;
            const h = canvas.height;
            const wallNow = Date.now();

            drawBackdrop(ctx, w, h, bp);

            const scaledPadding = Math.round(sc.slidePadding * (Math.min(w, h) / 720));
            const scaledRadius = Math.round(sc.slideRadius * (Math.min(w, h) / 720));

            const webcamVisible =
              sc.layout === 'camera-only' || (sc.layout !== 'screen-only' && wc.enabled);

            // Run AI person segmentation when live webcam + background effect are active and visible
            const needsSeg =
              webcamVisible &&
              wc.effects.virtualBg !== 'none' &&
              Boolean(cameraVideoRef.current && cameraVideoRef.current.readyState >= 2);
            const personMask =
              needsSeg && segmenterRef.current && cameraVideoRef.current
                ? segmenterRef.current.segmentVideoFrame(cameraVideoRef.current, now)
                : null;

            // Run lightweight face/subject auto-center tracking when enabled on live visible camera
            let autoCenterAnchor: { x: number; y: number } | null = null;
            if (
              webcamVisible &&
              wc.autoCenter &&
              cameraVideoRef.current &&
              cameraVideoRef.current.readyState >= 2
            ) {
              if (!autoCenterTrackerRef.current) {
                autoCenterTrackerRef.current = new WebcamAutoCenterTracker();
              }
              autoCenterAnchor = autoCenterTrackerRef.current.update(cameraVideoRef.current, now);
            }

            if (sc.layout === 'camera-only') {
              const camBounds: Rect = {
                x: scaledPadding,
                y: scaledPadding,
                width: w - scaledPadding * 2,
                height: h - scaledPadding * 2,
              };
              drawWebcamFrame(
                ctx,
                cameraVideoRef.current,
                offscreen,
                personMask,
                customBgImgRef.current,
                camBounds,
                'rounded',
                wc,
                false,
                autoCenterAnchor,
                scaledRadius
              );
            } else if (sc.layout === 'screen-only') {
              const contentBounds: Rect = {
                x: scaledPadding,
                y: scaledPadding,
                width: w - scaledPadding * 2,
                height: h - scaledPadding * 2,
              };
              drawPresentationMedia(
                ctx,
                contentBounds,
                scaledRadius,
                sc.sourceMode,
                slideImageRef.current,
                activeSlideFilter,
                screenVideoRef.current,
                prevSlideImageRef.current,
                prevSlideFilterRef.current,
                activeSlideTrans
              );
            } else if (sc.layout === 'side-by-side') {
              const { contentBounds, cameraBounds } = computeSideBySideLayout(
                w,
                h,
                Math.max(16, scaledPadding)
              );
              drawPresentationMedia(
                ctx,
                contentBounds,
                Math.max(8, scaledRadius),
                sc.sourceMode,
                slideImageRef.current,
                activeSlideFilter,
                screenVideoRef.current,
                prevSlideImageRef.current,
                prevSlideFilterRef.current,
                activeSlideTrans
              );
              if (wc.enabled) {
                drawWebcamFrame(
                  ctx,
                  cameraVideoRef.current,
                  offscreen,
                  personMask,
                  customBgImgRef.current,
                  cameraBounds,
                  'rounded',
                  wc,
                  false,
                  autoCenterAnchor,
                  Math.max(12, scaledRadius)
                );
              }
            } else {
              // Picture-in-Picture (default): full-bleed edge-to-edge slide when slidePadding === 0
              const contentBounds: Rect = {
                x: scaledPadding,
                y: scaledPadding,
                width: w - scaledPadding * 2,
                height: h - scaledPadding * 2,
              };
              drawPresentationMedia(
                ctx,
                contentBounds,
                scaledRadius,
                sc.sourceMode,
                slideImageRef.current,
                activeSlideFilter,
                screenVideoRef.current,
                prevSlideImageRef.current,
                prevSlideFilterRef.current,
                activeSlideTrans
              );

              if (wc.enabled) {
                const bubbleRect = computeWebcamBubbleRect(
                  w,
                  h,
                  wc.scale,
                  wc.x,
                  wc.y,
                  wc.shape,
                  24
                );
                drawWebcamFrame(
                  ctx,
                  cameraVideoRef.current,
                  offscreen,
                  personMask,
                  customBgImgRef.current,
                  bubbleRect,
                  wc.shape,
                  wc,
                  true,
                  autoCenterAnchor
                );
              }
            }

            // Canva / Zoom / YouCam Stage Design Overlays (Lower-Third, Text Callouts, Watermark, Raise Hand)
            drawStageDesignOverlays(ctx, w, h, sd, watermarkLogoImgRef.current);

            // Loom / Zoom Live Annotations (committed + in-progress stroke)
            for (const stroke of committedAnnotations) {
              const op = computeAnnotationOpacity(stroke, wallNow);
              if (op > 0) {
                drawAnnotationStroke(ctx, stroke, w, h, op);
              }
            }
            if (activeStrokeRef.current) {
              drawAnnotationStroke(ctx, activeStrokeRef.current, w, h, 1);
            }

            // Live Laser Pointer trail
            if (laserTrailRef.current.length > 0) {
              drawLaserPointer(ctx, laserTrailRef.current, w, h, laserColor, now);
            }

            // Floating Zoom / Loom Live Reactions
            if (liveReactions.length > 0) {
              drawLiveReactions(ctx, liveReactions, w, h, wallNow);
            }

            // Composite layout switch transition over full canvas when active
            const snap = prevSceneCanvasRef.current;
            if (activeLayoutTrans && snap && snap.width === w && snap.height === h) {
              if (activeLayoutTrans.blackAlpha > 0) {
                if (activeLayoutTrans.showPrevBase) {
                  ctx.drawImage(snap, 0, 0, w, h);
                }
                ctx.fillStyle = `rgba(0, 0, 0, ${activeLayoutTrans.blackAlpha})`;
                ctx.fillRect(0, 0, w, h);
              } else if (activeLayoutTrans.prevAlpha > 0) {
                ctx.save();
                ctx.globalAlpha = activeLayoutTrans.prevAlpha;
                ctx.drawImage(snap, 0, 0, w, h);
                ctx.restore();
              }
            }
          }
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [canvasRef, paused]);

  const clientToCanvasCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: ((clientX - rect.left) / rect.width) * canvas.width,
        y: ((clientY - rect.top) / rect.height) * canvas.height,
      };
    },
    [canvasRef]
  );

  const canDragBubble =
    annotationTool === 'select' && stageConfig.layout === 'pip' && webcamConfig.enabled;

  const currentBubbleRect = useMemo(() => {
    return computeWebcamBubbleRect(
      dimensions.width,
      dimensions.height,
      webcamConfig.scale,
      webcamConfig.x,
      webcamConfig.y,
      webcamConfig.shape,
      24
    );
  }, [
    dimensions.height,
    dimensions.width,
    webcamConfig.scale,
    webcamConfig.shape,
    webcamConfig.x,
    webcamConfig.y,
  ]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = clientToCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;

    // 1. Live Drawing Tools (Pen / Highlighter / Arrow)
    if (annotationTool === 'pen' || annotationTool === 'highlighter' || annotationTool === 'arrow') {
      e.currentTarget.setPointerCapture(e.pointerId);
      const normPt = {
        x: Math.max(0, Math.min(1, pt.x / dimensions.width)),
        y: Math.max(0, Math.min(1, pt.y / dimensions.height)),
      };
      activeStrokeRef.current = {
        id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool: annotationTool,
        color: annotationColor,
        width: annotationTool === 'arrow' ? 4.5 : 4,
        points: [normPt],
        createdAt: Date.now(),
        autoFade: autoFadeInk,
      };
      dirtyRef.current = true;
      return;
    }

    // 2. Laser pointer click pulse
    if (annotationTool === 'laser') {
      laserTrailRef.current.push({
        x: pt.x / dimensions.width,
        y: pt.y / dimensions.height,
        t: performance.now(),
      });
      dirtyRef.current = true;
      return;
    }

    // 3. Select Mode: Hit-test Presenter Lower-Third first (topmost overlay)
    const hitCtx = canvasRef.current?.getContext('2d') ?? null;
    const logoImg = watermarkLogoImgRef.current;
    const logoRatio =
      logoImg && logoImg.complete && logoImg.naturalWidth > 0
        ? logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight)
        : null;

    if (
      hitTestLowerThird(pt.x, pt.y, stageDesign.lowerThird, dimensions.width, dimensions.height, hitCtx)
    ) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = computeLowerThirdRect(
        stageDesign.lowerThird,
        dimensions.width,
        dimensions.height,
        hitCtx
      );
      dragOffsetRef.current = {
        dx: rect.x + rect.width / 2 - pt.x,
        dy: rect.y + rect.height / 2 - pt.y,
      };
      setDraggingStageItem('lowerThird');
      return;
    }

    // 4. Select Mode: Hit-test Canva Text Overlays (topmost first)
    for (let i = stageDesign.textOverlays.length - 1; i >= 0; i--) {
      const ov = stageDesign.textOverlays[i];
      if (hitTestTextOverlay(pt.x, pt.y, ov, dimensions.width, dimensions.height)) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOffsetRef.current = {
          dx: ov.x * dimensions.width - pt.x,
          dy: ov.y * dimensions.height - pt.y,
        };
        setDraggingOverlayId(ov.id);
        return;
      }
    }

    // 5. Select Mode: Hit-test Brand Watermark
    if (
      hitTestWatermark(
        pt.x,
        pt.y,
        stageDesign.watermark,
        dimensions.width,
        dimensions.height,
        logoRatio,
        hitCtx
      )
    ) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = computeWatermarkRect(
        stageDesign.watermark,
        dimensions.width,
        dimensions.height,
        logoRatio,
        hitCtx
      );
      dragOffsetRef.current = {
        dx: rect.x + rect.width / 2 - pt.x,
        dy: rect.y + rect.height / 2 - pt.y,
      };
      setDraggingStageItem('watermark');
      return;
    }

    // 6. Select Mode: Hit-test Floating Webcam Bubble
    if (canDragBubble && hitTestWebcamBubble(pt.x, pt.y, currentBubbleRect, webcamConfig.shape)) {
      e.currentTarget.setPointerCapture(e.pointerId);
      const bubbleCenterX = currentBubbleRect.x + currentBubbleRect.width / 2;
      const bubbleCenterY = currentBubbleRect.y + currentBubbleRect.height / 2;
      dragOffsetRef.current = {
        dx: bubbleCenterX - pt.x,
        dy: bubbleCenterY - pt.y,
      };
      setIsDraggingBubble(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = clientToCanvasCoords(e.clientX, e.clientY);
    if (!pt) return;

    // Active Laser Pointer trail
    if (annotationTool === 'laser') {
      laserTrailRef.current.push({
        x: Math.max(0, Math.min(1, pt.x / dimensions.width)),
        y: Math.max(0, Math.min(1, pt.y / dimensions.height)),
        t: performance.now(),
      });
      if (laserTrailRef.current.length > 36) {
        laserTrailRef.current.shift();
      }
      dirtyRef.current = true;
      return;
    }

    // Active Drawing Stroke
    if (activeStrokeRef.current) {
      const normPt = {
        x: Math.max(0, Math.min(1, pt.x / dimensions.width)),
        y: Math.max(0, Math.min(1, pt.y / dimensions.height)),
      };
      if (activeStrokeRef.current.tool === 'arrow') {
        activeStrokeRef.current.points = [activeStrokeRef.current.points[0], normPt];
      } else {
        activeStrokeRef.current.points.push(normPt);
      }
      dirtyRef.current = true;
      return;
    }

    const hitCtx = canvasRef.current?.getContext('2d') ?? null;
    const logoImg = watermarkLogoImgRef.current;
    const logoRatio =
      logoImg && logoImg.complete && logoImg.naturalWidth > 0
        ? logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight)
        : null;

    // Dragging Presenter Lower-Third anywhere on stage
    if (draggingStageItem === 'lowerThird') {
      const nextCx = (pt.x + dragOffsetRef.current.dx) / dimensions.width;
      const nextCy = (pt.y + dragOffsetRef.current.dy) / dimensions.height;
      const clamped = computeLowerThirdRect(
        { ...stageDesign.lowerThird, x: nextCx, y: nextCy },
        dimensions.width,
        dimensions.height,
        hitCtx
      );
      onUpdateLowerThirdPosition(
        (clamped.x + clamped.width / 2) / dimensions.width,
        (clamped.y + clamped.height / 2) / dimensions.height
      );
      return;
    }

    // Dragging Brand Watermark anywhere on stage
    if (draggingStageItem === 'watermark') {
      const nextCx = (pt.x + dragOffsetRef.current.dx) / dimensions.width;
      const nextCy = (pt.y + dragOffsetRef.current.dy) / dimensions.height;
      const clamped = computeWatermarkRect(
        { ...stageDesign.watermark, x: nextCx, y: nextCy },
        dimensions.width,
        dimensions.height,
        logoRatio,
        hitCtx
      );
      onUpdateWatermarkPosition(
        (clamped.x + clamped.width / 2) / dimensions.width,
        (clamped.y + clamped.height / 2) / dimensions.height
      );
      return;
    }

    // Dragging a Canva Text Overlay
    if (draggingOverlayId) {
      const nx = Math.max(0.06, Math.min(0.94, (pt.x + dragOffsetRef.current.dx) / dimensions.width));
      const ny = Math.max(0.06, Math.min(0.94, (pt.y + dragOffsetRef.current.dy) / dimensions.height));
      onUpdateTextOverlayPosition(draggingOverlayId, nx, ny);
      return;
    }

    // Dragging Webcam Bubble
    if (isDraggingBubble) {
      const nextCenterX = pt.x + dragOffsetRef.current.dx;
      const nextCenterY = pt.y + dragOffsetRef.current.dy;
      const clampedRect = computeWebcamBubbleRect(
        dimensions.width,
        dimensions.height,
        webcamConfig.scale,
        nextCenterX / dimensions.width,
        nextCenterY / dimensions.height,
        webcamConfig.shape,
        24
      );
      const normX = (clampedRect.x + clampedRect.width / 2) / dimensions.width;
      const normY = (clampedRect.y + clampedRect.height / 2) / dimensions.height;
      onUpdateWebcamPosition(normX, normY);
      return;
    }

    // Hover feedback for lower-third, watermark, text overlays, and webcam bubble
    if (
      hitTestLowerThird(pt.x, pt.y, stageDesign.lowerThird, dimensions.width, dimensions.height, hitCtx)
    ) {
      if (hoverStageItem !== 'lowerThird') setHoverStageItem('lowerThird');
      if (isHoveringTextOverlay) setIsHoveringTextOverlay(false);
      if (isHoveringBubble) setIsHoveringBubble(false);
      return;
    }
    if (
      hitTestWatermark(
        pt.x,
        pt.y,
        stageDesign.watermark,
        dimensions.width,
        dimensions.height,
        logoRatio,
        hitCtx
      )
    ) {
      if (hoverStageItem !== 'watermark') setHoverStageItem('watermark');
      if (isHoveringTextOverlay) setIsHoveringTextOverlay(false);
      if (isHoveringBubble) setIsHoveringBubble(false);
      return;
    }
    if (hoverStageItem !== null) setHoverStageItem(null);

    const hoveringText = stageDesign.textOverlays.some((ov) =>
      hitTestTextOverlay(pt.x, pt.y, ov, dimensions.width, dimensions.height)
    );
    if (hoveringText !== isHoveringTextOverlay) {
      setIsHoveringTextOverlay(hoveringText);
    }
    if (hoveringText) {
      if (isHoveringBubble) setIsHoveringBubble(false);
      return;
    }

    if (canDragBubble) {
      const hovering = hitTestWebcamBubble(pt.x, pt.y, currentBubbleRect, webcamConfig.shape);
      if (hovering !== isHoveringBubble) {
        setIsHoveringBubble(hovering);
      }
    } else if (isHoveringBubble) {
      setIsHoveringBubble(false);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeStrokeRef.current) {
      const finished: AnnotationStroke = {
        ...activeStrokeRef.current,
        createdAt: Date.now(),
      };
      activeStrokeRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onAddAnnotation(finished);
      dirtyRef.current = true;
      return;
    }

    if (draggingStageItem) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDraggingStageItem(null);
      return;
    }

    if (draggingOverlayId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDraggingOverlayId(null);
      return;
    }

    if (isDraggingBubble) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setIsDraggingBubble(false);
    }
  };

  // Overlay guide coordinates as percentages so hover outline aligns accurately without polluting canvas pixels
  const bubbleOverlayStyle = useMemo(() => {
    const leftPct = (currentBubbleRect.x / dimensions.width) * 100;
    const topPct = (currentBubbleRect.y / dimensions.height) * 100;
    const widthPct = (currentBubbleRect.width / dimensions.width) * 100;
    const heightPct = (currentBubbleRect.height / dimensions.height) * 100;
    const borderRadius =
      webcamConfig.shape === 'circle'
        ? '9999px'
        : webcamConfig.shape === 'rounded'
          ? '14%'
          : '4%';
    return {
      left: `${leftPct}%`,
      top: `${topPct}%`,
      width: `${widthPct}%`,
      height: `${heightPct}%`,
      borderRadius,
    };
  }, [currentBubbleRect, dimensions.height, dimensions.width, webcamConfig.shape]);

  const activeStageGuideStyle = useMemo(() => {
    const target = draggingStageItem ?? hoverStageItem;
    if (!target) return null;
    const hitCtx = canvasRef.current?.getContext('2d') ?? null;
    const logoImg = watermarkLogoImgRef.current;
    const logoRatio =
      logoImg && logoImg.complete && logoImg.naturalWidth > 0
        ? logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight)
        : null;
    const rect =
      target === 'lowerThird'
        ? computeLowerThirdRect(stageDesign.lowerThird, dimensions.width, dimensions.height, hitCtx)
        : computeWatermarkRect(
            stageDesign.watermark,
            dimensions.width,
            dimensions.height,
            logoRatio,
            hitCtx
          );
    return {
      left: `${(rect.x / dimensions.width) * 100}%`,
      top: `${(rect.y / dimensions.height) * 100}%`,
      width: `${(rect.width / dimensions.width) * 100}%`,
      height: `${(rect.height / dimensions.height) * 100}%`,
      label: target === 'lowerThird' ? 'Drag lower-third' : 'Drag watermark',
    };
  }, [
    canvasRef,
    dimensions.height,
    dimensions.width,
    draggingStageItem,
    hoverStageItem,
    stageDesign.lowerThird,
    stageDesign.watermark,
  ]);

  const showSlideArrows =
    stageConfig.sourceMode === 'slides' &&
    stageConfig.layout !== 'camera-only' &&
    slideCount > 1;

  const canvasCursorClass =
    annotationTool !== 'select'
      ? 'cursor-crosshair'
      : isDraggingBubble || draggingOverlayId || draggingStageItem
        ? 'cursor-grabbing'
        : (isHoveringBubble && canDragBubble) || hoverStageItem || isHoveringTextOverlay
          ? 'cursor-grab'
          : 'cursor-default';

  const stageWrapperStyle: React.CSSProperties =
    stageBoxSize.width > 0 && stageBoxSize.height > 0
      ? {
          width: `${stageBoxSize.width}px`,
          height: `${stageBoxSize.height}px`,
        }
      : {
          aspectRatio: `${dimensions.width} / ${dimensions.height}`,
          maxWidth: '100%',
          maxHeight: '100%',
        };

  return (
    <div
      ref={stageContainerRef}
      className="relative flex-1 min-h-0 w-full flex items-center justify-center p-1.5 sm:p-2 lg:px-4 lg:py-2 overflow-hidden"
    >
      {/* Hidden off-DOM media elements feeding the canvas compositor */}
      <video ref={cameraVideoRef} muted playsInline className="hidden" aria-hidden="true" />
      <video ref={screenVideoRef} muted playsInline className="hidden" aria-hidden="true" />

      {/* Mathematically aspect-locked stage wrapper (guarantees true 16:9 / 9:16 / 1:1 with zero stretch) */}
      <div
        data-testid="stage-frame"
        className="relative shrink-0 flex items-center justify-center shadow-[0_14px_38px_rgba(15,23,42,0.18)] dark:shadow-[0_20px_54px_rgba(0,0,0,0.65)] rounded-lg overflow-hidden ring-1 ring-slate-900/12 dark:ring-white/10"
        style={stageWrapperStyle}
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          data-testid="studio-canvas"
          data-aspect={stageConfig.aspectRatio}
          data-layout={stageConfig.layout}
          data-transition={stageConfig.transition}
          data-slide-filter={slideFilter}
          data-camera-filter={cameraFilter}
          data-virtual-bg={webcamConfig.effects.virtualBg}
          data-seg-status={segStatus}
          data-slide-padding={stageConfig.slidePadding}
          data-annotation-tool={annotationTool}
          data-annotation-count={annotations.length}
          data-active-reactions={reactions.length}
          data-webcam-shape={webcamConfig.shape}
          data-webcam-autocenter={String(webcamConfig.autoCenter)}
          data-webcam-x={webcamConfig.x.toFixed(3)}
          data-webcam-y={webcamConfig.y.toFixed(3)}
          data-lower-third-x={stageDesign.lowerThird.x.toFixed(3)}
          data-lower-third-y={stageDesign.lowerThird.y.toFixed(3)}
          data-watermark-x={stageDesign.watermark.x.toFixed(3)}
          data-watermark-y={stageDesign.watermark.y.toFixed(3)}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            if (!isDraggingBubble) setIsHoveringBubble(false);
            if (!draggingStageItem) setHoverStageItem(null);
            if (!draggingOverlayId) setIsHoveringTextOverlay(false);
          }}
          className={`block w-full h-full touch-none select-none ${canvasCursorClass}`}
        />

        {/* Non-recorded visual guide outline when hovering/dragging lower-third or watermark */}
        {activeStageGuideStyle && annotationTool === 'select' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-lg border-2 border-dashed border-blue-400/90 flex items-start justify-end"
            style={{
              left: activeStageGuideStyle.left,
              top: activeStageGuideStyle.top,
              width: activeStageGuideStyle.width,
              height: activeStageGuideStyle.height,
            }}
          >
            <span className="-mt-6 inline-flex items-center gap-1 rounded bg-[#0B0C0F]/90 px-2 py-0.5 text-[10px] font-medium text-blue-200 border border-blue-400/35 whitespace-nowrap">
              <Move className="w-2.5 h-2.5" />
              {activeStageGuideStyle.label}
            </span>
          </div>
        )}

        {/* Non-recorded visual guide outline when hovering/dragging webcam bubble */}
        {canDragBubble && (isHoveringBubble || isDraggingBubble) && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-2 border-blue-400/90 transition-opacity duration-150 flex items-start justify-center"
            style={bubbleOverlayStyle}
          >
            <span className="mt-2 inline-flex items-center gap-1 rounded bg-[#0B0C0F]/85 px-2 py-0.5 text-[11px] font-medium text-blue-200 border border-blue-400/30">
              <Move className="w-3 h-3" />
              Drag to move
            </span>
          </div>
        )}

        {/* Quick on-stage slide navigation controls on desktop (mobile uses the top bar stepper so the canvas stays unobstructed) */}
        {showSlideArrows && (
          <>
            <button
              type="button"
              onClick={onPrevSlide}
              disabled={slideIndex <= 0}
              aria-label="Previous slide"
              className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-[#0B0C0F]/75 hover:bg-[#0B0C0F]/95 border border-white/15 text-slate-200 items-center justify-center transition-all disabled:opacity-25 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={onNextSlide}
              disabled={slideIndex >= slideCount - 1}
              aria-label="Next slide"
              className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-[#0B0C0F]/75 hover:bg-[#0B0C0F]/95 border border-white/15 text-slate-200 items-center justify-center transition-all disabled:opacity-25 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Subtle recording border indicator on stage frame (never burned into canvas) */}
        {isRecording && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-inset ring-red-500/80"
          />
        )}
        {/* Presenter-only stage HUD overlays (never burned into recorded canvas) */}
        {stageOverlayChildren}
      </div>
    </div>
  );
};
