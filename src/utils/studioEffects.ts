import type {
  AnnotationStroke,
  BrandWatermark,
  CameraFilterPreset,
  LiveReaction,
  LowerThirdConfig,
  Rect,
  SlideAdjustments,
  SlideItem,
  SlideTemplateId,
  StageDesignConfig,
  StageTextOverlay,
  WebcamCorner,
  WebcamEffects,
} from '../types/studio';

export const DEFAULT_SLIDE_ADJUSTMENTS: SlideAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

export const DEFAULT_WEBCAM_EFFECTS: WebcamEffects = {
  filterPreset: 'none',
  skinSmooth: 0,
  brightness: 100,
  contrast: 100,
  saturation: 100,
  lowLightBoost: false,
  lowLightLevel: 0,
  virtualBg: 'none',
  customBgUrl: null,
};

export const DEFAULT_STAGE_DESIGN: StageDesignConfig = {
  lowerThird: {
    enabled: false,
    name: 'Alex Morgan',
    title: 'Product Lead · NTK Cam Studio',
    accentColor: '#3b82f6',
    style: 'broadcast',
    position: 'bottom-left',
    x: 0.22,
    y: 0.88,
  },
  textOverlays: [],
  watermark: {
    enabled: false,
    text: 'NTK CAM',
    logoDataUrl: null,
    corner: 'top-right',
    x: 0.9,
    y: 0.08,
    opacity: 0.72,
    size: 1,
  },
  handRaised: false,
};

export const CAMERA_FILTER_PRESETS: Array<{
  id: CameraFilterPreset;
  label: string;
  cssFilter: string;
}> = [
  { id: 'none', label: 'Natural', cssFilter: '' },
  { id: 'studio-warm', label: 'Studio Warm', cssFilter: 'sepia(14%) saturate(114%) brightness(103%)' },
  { id: 'cool-crisp', label: 'Cool Crisp', cssFilter: 'hue-rotate(-8deg) contrast(106%) saturate(108%)' },
  { id: 'cinema', label: 'Cinema', cssFilter: 'contrast(114%) saturate(90%) sepia(8%)' },
  { id: 'bw', label: 'Noir B&W', cssFilter: 'grayscale(100%) contrast(116%)' },
  { id: 'vintage', label: 'Vintage', cssFilter: 'sepia(28%) contrast(94%) brightness(104%) saturate(88%)' },
];

export const ANNOTATION_COLORS = [
  { id: 'crimson', label: 'Red', value: '#ef4444' },
  { id: 'amber', label: 'Amber', value: '#f59e0b' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'emerald', label: 'Emerald', value: '#10b981' },
  { id: 'white', label: 'White', value: '#f8fafc' },
];

export const LIVE_REACTION_EMOJIS = ['👍', '👏', '🔥', '💡', '🎉', '❤️'];

export const SLIDE_TEMPLATE_OPTIONS: Array<{
  id: SlideTemplateId;
  label: string;
  accent: string;
  defaultHeading: string;
  defaultBody: string;
}> = [
  {
    id: 'minimal-dark',
    label: 'Minimal Dark',
    accent: '#3b82f6',
    defaultHeading: 'Key Product Takeaway',
    defaultBody: 'Summarize your core thesis cleanly with focused typography and high contrast.',
  },
  {
    id: 'executive-split',
    label: 'Executive Light',
    accent: '#0f766e',
    defaultHeading: 'Quarterly Strategic Priorities',
    defaultBody: '• Expand studio workflow integrations\n• Improve live color calibration\n• Accelerate team review cycles',
  },
  {
    id: 'metric-card',
    label: 'Metric Spotlight',
    accent: '#f59e0b',
    defaultHeading: '+148%',
    defaultBody: 'Presenter engagement growth after switching to interactive studio recordings.',
  },
  {
    id: 'editorial-quote',
    label: 'Quote Card',
    accent: '#8b5cf6',
    defaultHeading: '“Clarity turns a slide deck into a memorable story.”',
    defaultBody: '— Design & Studio Operations',
  },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeSlideAdjustments(adj?: Partial<SlideAdjustments>): SlideAdjustments {
  return {
    brightness: Math.round(clamp(adj?.brightness ?? 100, 50, 150)),
    contrast: Math.round(clamp(adj?.contrast ?? 100, 50, 150)),
    saturation: Math.round(clamp(adj?.saturation ?? 100, 0, 200)),
  };
}

export function isSlideAdjustmentDefault(adj?: Partial<SlideAdjustments>): boolean {
  const n = normalizeSlideAdjustments(adj);
  return n.brightness === 100 && n.contrast === 100 && n.saturation === 100;
}

/**
 * Builds a deterministic CanvasRenderingContext2D / CSS filter string for slide color correction.
 * Returns 'none' when all adjustments are neutral so canvas rendering takes the fastest path.
 */
export function buildSlideFilterString(adj?: Partial<SlideAdjustments>): string {
  const n = normalizeSlideAdjustments(adj);
  if (n.brightness === 100 && n.contrast === 100 && n.saturation === 100) {
    return 'none';
  }
  const parts: string[] = [];
  if (n.brightness !== 100) parts.push(`brightness(${n.brightness}%)`);
  if (n.contrast !== 100) parts.push(`contrast(${n.contrast}%)`);
  if (n.saturation !== 100) parts.push(`saturate(${n.saturation}%)`);
  return parts.join(' ');
}

/**
 * Builds a deterministic CanvasRenderingContext2D filter string combining YouCam LUT presets,
 * adjustable Zoom low-light lift (up to +100% brightness), and manual camera exposure/contrast/saturation.
 */
export function buildWebcamFilterString(fx: WebcamEffects): string {
  const parts: string[] = [];
  const level = clamp(fx.lowLightLevel ?? 0, 0, 100);
  const lowLightBonus = level > 0 ? Math.round(level * 1.0) : fx.lowLightBoost ? 16 : 0;
  const lowLightContrastBonus = level > 0 ? Math.round(level * 0.14) : fx.lowLightBoost ? 6 : 0;

  const effectiveBrightness = Math.round(clamp(fx.brightness + lowLightBonus, 60, 260));
  const effectiveContrast = Math.round(clamp(fx.contrast + lowLightContrastBonus, 60, 175));
  const effectiveSaturation = Math.round(clamp(fx.saturation, 0, 200));

  if (effectiveBrightness !== 100) {
    parts.push(`brightness(${effectiveBrightness}%)`);
  }
  if (effectiveContrast !== 100) {
    parts.push(`contrast(${effectiveContrast}%)`);
  }
  if (effectiveSaturation !== 100) {
    parts.push(`saturate(${effectiveSaturation}%)`);
  }

  const preset = CAMERA_FILTER_PRESETS.find((p) => p.id === fx.filterPreset);
  if (preset && preset.cssFilter) {
    parts.push(preset.cssFilter);
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}

export function isWebcamEffectsDefault(fx: WebcamEffects): boolean {
  return (
    fx.filterPreset === 'none' &&
    fx.skinSmooth === 0 &&
    fx.brightness === 100 &&
    fx.contrast === 100 &&
    fx.saturation === 100 &&
    !fx.lowLightBoost &&
    (fx.lowLightLevel ?? 0) === 0 &&
    fx.virtualBg === 'none'
  );
}

/**
 * Computes opacity (0..1) for a Loom-style auto-fading annotation stroke.
 * Persistent strokes always return 1.
 */
export function computeAnnotationOpacity(
  stroke: AnnotationStroke,
  now: number,
  holdMs = 3600,
  fadeDurationMs = 1400
): number {
  if (!stroke.autoFade) return 1;
  const age = Math.max(0, now - stroke.createdAt);
  if (age <= holdMs) return 1;
  if (age >= holdMs + fadeDurationMs) return 0;
  const t = (age - holdMs) / fadeDurationMs;
  return Number((1 - t).toFixed(4));
}

export function pruneExpiredAnnotations(
  strokes: AnnotationStroke[],
  now: number,
  holdMs = 3600,
  fadeDurationMs = 1400
): AnnotationStroke[] {
  return strokes.filter((s) => computeAnnotationOpacity(s, now, holdMs, fadeDurationMs) > 0);
}

/**
 * Computes deterministic animation frame for a floating Zoom/Loom live reaction.
 */
export function computeReactionFrame(
  reaction: LiveReaction,
  now: number,
  canvasWidth: number,
  canvasHeight: number
): { active: boolean; x: number; y: number; opacity: number; scale: number } {
  const elapsed = now - reaction.createdAt;
  if (elapsed < 0 || elapsed >= reaction.durationMs) {
    return { active: false, x: 0, y: 0, opacity: 0, scale: 1 };
  }
  const t = elapsed / reaction.durationMs;
  const riseEase = 1 - Math.pow(1 - t, 2.2);
  const startY = canvasHeight * 0.88;
  const travel = canvasHeight * 0.48;
  const y = startY - riseEase * travel;
  const sway = Math.sin(t * Math.PI * 3) * reaction.driftX;
  const x = reaction.x * canvasWidth + sway;

  // Pop in smoothly, stay crisp, fade out over final 30%
  const scale = t < 0.14 ? 0.55 + (t / 0.14) * 0.55 : t < 0.25 ? 1.1 - ((t - 0.14) / 0.11) * 0.1 : 1;
  const opacity = t > 0.68 ? Math.max(0, 1 - (t - 0.68) / 0.32) : Math.min(1, t / 0.08);

  return {
    active: true,
    x,
    y,
    opacity: Number(opacity.toFixed(4)),
    scale: Number(scale.toFixed(4)),
  };
}

export function pruneExpiredReactions(reactions: LiveReaction[], now: number): LiveReaction[] {
  return reactions.filter((r) => now - r.createdAt < r.durationMs);
}

/**
 * Estimates bounding box for a Canva stage text overlay to enable accurate pointer hit-testing.
 */
export function computeTextOverlayRect(
  overlay: StageTextOverlay,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number; width: number; height: number } {
  const scaleFactor = Math.min(canvasWidth, canvasHeight) / 720;
  const fontPx = Math.round(overlay.fontSize * scaleFactor);
  const padX = overlay.style === 'headline' ? fontPx * 0.65 : fontPx * 0.85;
  const padY = overlay.style === 'headline' ? fontPx * 0.36 : fontPx * 0.45;
  const approxTextW = Math.max(fontPx * 2.5, overlay.text.length * fontPx * 0.56);
  const width = Math.min(canvasWidth * 0.86, approxTextW + padX * 2);
  const height = fontPx * 1.28 + padY * 2;
  const cx = clamp(overlay.x, 0.06, 0.94) * canvasWidth;
  const cy = clamp(overlay.y, 0.06, 0.94) * canvasHeight;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
  };
}

export function hitTestTextOverlay(
  pointX: number,
  pointY: number,
  overlay: StageTextOverlay,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  const rect = computeTextOverlayRect(overlay, canvasWidth, canvasHeight);
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  );
}

/**
 * Computes exact pixel bounding box for the draggable Presenter Lower-Third banner,
 * clamped inside stage bounds so dragging never loses it off-canvas.
 */
export function computeLowerThirdRect(
  lt: LowerThirdConfig,
  canvasWidth: number,
  canvasHeight: number,
  ctx?: CanvasRenderingContext2D | null
): Rect {
  const sf = Math.min(canvasWidth, canvasHeight) / 720;
  const nameFontPx = Math.round(24 * sf);
  const titleFontPx = Math.round(15 * sf);
  const padX = Math.round(20 * sf);
  const padY = Math.round(13 * sf);
  const accentW = lt.style === 'minimal' ? 0 : Math.round(6 * sf);

  const nameText = lt.name.trim();
  const titleText = lt.title.trim();

  let nameW = nameText.length * nameFontPx * 0.58;
  let titleW = titleText.length * titleFontPx * 0.55;

  if (ctx) {
    ctx.save();
    ctx.font = `700 ${nameFontPx}px "Plus Jakarta Sans", sans-serif`;
    nameW = ctx.measureText(nameText).width;
    ctx.font = `500 ${titleFontPx}px "DM Sans", sans-serif`;
    titleW = ctx.measureText(titleText).width;
    ctx.restore();
  }

  const cardW = Math.min(
    canvasWidth * 0.65,
    Math.max(120 * sf, Math.max(nameW, titleW) + padX * 2 + accentW + Math.round(10 * sf))
  );
  const cardH = Math.round(
    padY * 2 + nameFontPx + (titleText ? titleFontPx + 8 * sf : 0)
  );

  const margin = Math.round(16 * sf);
  const targetCx = clamp(lt.x, 0, 1) * canvasWidth;
  const targetCy = clamp(lt.y, 0, 1) * canvasHeight;
  const x = clamp(targetCx - cardW / 2, margin, Math.max(margin, canvasWidth - margin - cardW));
  const y = clamp(targetCy - cardH / 2, margin, Math.max(margin, canvasHeight - margin - cardH));

  return { x, y, width: cardW, height: cardH };
}

export function hitTestLowerThird(
  pointX: number,
  pointY: number,
  lt: LowerThirdConfig,
  canvasWidth: number,
  canvasHeight: number,
  ctx?: CanvasRenderingContext2D | null
): boolean {
  if (!lt.enabled || (!lt.name.trim() && !lt.title.trim())) return false;
  const rect = computeLowerThirdRect(lt, canvasWidth, canvasHeight, ctx);
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  );
}

export function getLowerThirdCornerPosition(
  corner: WebcamCorner,
  lt: LowerThirdConfig,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  const sf = Math.min(canvasWidth, canvasHeight) / 720;
  const rect = computeLowerThirdRect(lt, canvasWidth, canvasHeight);
  const pad = Math.round(32 * sf);
  const leftX = (pad + rect.width / 2) / canvasWidth;
  const rightX = (canvasWidth - pad - rect.width / 2) / canvasWidth;
  const topY = (pad + rect.height / 2) / canvasHeight;
  const bottomY = (canvasHeight - pad - rect.height / 2) / canvasHeight;

  return {
    x: clamp(corner === 'top-left' || corner === 'bottom-left' ? leftX : rightX, 0.04, 0.96),
    y: clamp(corner === 'top-left' || corner === 'top-right' ? topY : bottomY, 0.04, 0.96),
  };
}

/**
 * Computes exact pixel bounding box for the draggable Brand Watermark (image logo or wordmark pill).
 */
export function computeWatermarkRect(
  wm: BrandWatermark,
  canvasWidth: number,
  canvasHeight: number,
  logoAspectRatio?: number | null,
  ctx?: CanvasRenderingContext2D | null
): Rect {
  const sf = Math.min(canvasWidth, canvasHeight) / 720;
  const scale = clamp(wm.size, 0.6, 2.0);
  let wmW = 0;
  let wmH = 0;

  if (wm.logoDataUrl && logoAspectRatio && logoAspectRatio > 0) {
    const targetH = Math.round(40 * sf * scale);
    wmH = targetH;
    wmW = Math.min(canvasWidth * 0.34, targetH * logoAspectRatio);
  } else {
    const fontPx = Math.round(18 * sf * scale);
    const text = wm.text.trim() || 'NTK CAM';
    let textW = text.length * fontPx * 0.62;
    if (ctx) {
      ctx.save();
      ctx.font = `700 ${fontPx}px "Plus Jakarta Sans", sans-serif`;
      textW = ctx.measureText(text).width;
      ctx.restore();
    }
    wmW = Math.min(canvasWidth * 0.5, textW + Math.round(24 * sf));
    wmH = Math.round(fontPx + 14 * sf);
  }

  const margin = Math.round(14 * sf);
  const targetCx = clamp(wm.x, 0, 1) * canvasWidth;
  const targetCy = clamp(wm.y, 0, 1) * canvasHeight;
  const x = clamp(targetCx - wmW / 2, margin, Math.max(margin, canvasWidth - margin - wmW));
  const y = clamp(targetCy - wmH / 2, margin, Math.max(margin, canvasHeight - margin - wmH));

  return { x, y, width: wmW, height: wmH };
}

export function hitTestWatermark(
  pointX: number,
  pointY: number,
  wm: BrandWatermark,
  canvasWidth: number,
  canvasHeight: number,
  logoAspectRatio?: number | null,
  ctx?: CanvasRenderingContext2D | null
): boolean {
  if (!wm.enabled) return false;
  const rect = computeWatermarkRect(wm, canvasWidth, canvasHeight, logoAspectRatio, ctx);
  return (
    pointX >= rect.x &&
    pointX <= rect.x + rect.width &&
    pointY >= rect.y &&
    pointY <= rect.y + rect.height
  );
}

export function getWatermarkCornerPosition(
  corner: WebcamCorner,
  wm: BrandWatermark,
  canvasWidth: number,
  canvasHeight: number,
  logoAspectRatio?: number | null
): { x: number; y: number } {
  const sf = Math.min(canvasWidth, canvasHeight) / 720;
  const rect = computeWatermarkRect(wm, canvasWidth, canvasHeight, logoAspectRatio);
  const pad = Math.round(28 * sf);
  const leftX = (pad + rect.width / 2) / canvasWidth;
  const rightX = (canvasWidth - pad - rect.width / 2) / canvasWidth;
  const topY = (pad + rect.height / 2) / canvasHeight;
  const bottomY = (canvasHeight - pad - rect.height / 2) / canvasHeight;

  return {
    x: clamp(corner === 'top-left' || corner === 'bottom-left' ? leftX : rightX, 0.04, 0.96),
    y: clamp(corner === 'top-left' || corner === 'top-right' ? topY : bottomY, 0.04, 0.96),
  };
}

/**
 * Clamps floating teleprompter window position & dimensions cleanly inside its stage container.
 */
export function clampTeleprompterRect(params: {
  x: number;
  y: number;
  width: number;
  height: number;
  containerWidth: number;
  containerHeight: number;
  minWidth?: number;
  minHeight?: number;
  margin?: number;
}): Rect {
  const margin = params.margin ?? 8;
  const maxW = Math.max(200, params.containerWidth - margin * 2);
  const maxH = Math.max(120, params.containerHeight - margin * 2);
  const minW = Math.min(params.minWidth ?? 230, maxW);
  const minH = Math.min(params.minHeight ?? 116, maxH);

  const width = Math.round(clamp(params.width, minW, maxW));
  const height = Math.round(clamp(params.height, minH, maxH));
  const x = Math.round(clamp(params.x, margin, Math.max(margin, params.containerWidth - margin - width)));
  const y = Math.round(clamp(params.y, margin, Math.max(margin, params.containerHeight - margin - height)));

  return { x, y, width, height };
}

/**
 * Renders a crisp 1600x900 Canva-style template slide locally on an HTML5 canvas.
 */
export function createTemplateSlide(
  templateId: SlideTemplateId,
  heading: string,
  body: string,
  accentColor: string
): SlideItem | null {
  if (typeof document === 'undefined') return null;

  const width = 1600;
  const height = 900;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const safeHeading = heading.trim() || 'Untitled Slide';
  const safeBody = body.trim();

  const drawWrapped = (
    text: string,
    x: number,
    y: number,
    maxW: number,
    lineHeight: number,
    align: CanvasTextAlign = 'left'
  ) => {
    ctx.textAlign = align;
    let cursorY = y;
    const paragraphs = text.split('\n');
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line, x, cursorY);
          line = word;
          cursorY += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) {
        ctx.fillText(line, x, cursorY);
        cursorY += lineHeight;
      } else {
        cursorY += lineHeight * 0.6;
      }
    }
    ctx.textAlign = 'start';
  };

  if (templateId === 'minimal-dark') {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#12151e');
    bg.addColorStop(1, '#090b10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const glow = ctx.createRadialGradient(width * 0.82, height * 0.2, 10, width * 0.82, height * 0.2, 520);
    glow.addColorStop(0, `${accentColor}38`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.roundRect(120, 190, 76, 10, 5);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 76px "Plus Jakarta Sans", sans-serif';
    drawWrapped(safeHeading, 120, 310, width - 240, 92);

    if (safeBody) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '400 32px "DM Sans", sans-serif';
      drawWrapped(safeBody, 120, 540, width - 280, 48);
    }
  } else if (templateId === 'executive-split') {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);

    // Right geometric studio panel
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(width * 0.64, 0, width * 0.36, height);

    ctx.fillStyle = accentColor;
    ctx.fillRect(width * 0.64, 0, 12, height);

    ctx.fillStyle = '#0f172a';
    ctx.font = '700 62px "Plus Jakarta Sans", sans-serif';
    drawWrapped(safeHeading, 105, 220, width * 0.52, 76);

    if (safeBody) {
      ctx.fillStyle = '#334155';
      ctx.font = '400 30px "DM Sans", sans-serif';
      drawWrapped(safeBody, 105, 430, width * 0.52, 50);
    }

    // Minimalist graphic accent inside dark right column
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(width * 0.69, 180, width * 0.25, 540, 24);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(width * 0.815, 450, 120, 0, Math.PI * 2);
    ctx.fill();
  } else if (templateId === 'metric-card') {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0f131b');
    bg.addColorStop(1, '#161c28');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#1d2433';
    ctx.beginPath();
    ctx.roundRect(140, 150, width - 280, height - 300, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = accentColor;
    ctx.font = '700 132px "JetBrains Mono", monospace';
    drawWrapped(safeHeading, width / 2, 420, width - 380, 145, 'center');

    if (safeBody) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '500 34px "DM Sans", sans-serif';
      drawWrapped(safeBody, width / 2, 545, width - 420, 50, 'center');
    }
  } else {
    // editorial-quote
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#171324');
    bg.addColorStop(1, '#0d0f17');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = accentColor;
    ctx.font = '700 160px Georgia, serif';
    ctx.fillText('“', 120, 270);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '600 58px "Plus Jakarta Sans", sans-serif';
    drawWrapped(safeHeading, 160, 360, width - 320, 78);

    if (safeBody) {
      ctx.fillStyle = '#a5b4fc';
      ctx.font = '500 28px "DM Sans", sans-serif';
      drawWrapped(safeBody, 160, 680, width - 320, 40);
    }
  }

  return {
    id: `template-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: safeHeading.slice(0, 42),
    dataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    sourceType: 'template',
    adjustments: { ...DEFAULT_SLIDE_ADJUSTMENTS },
  };
}
