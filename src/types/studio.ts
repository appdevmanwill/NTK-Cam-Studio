export type AspectRatio = '16:9' | '9:16' | '1:1';

export type VideoResolutionPreset = '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p';

export type ExportFormat = 'mp4' | 'webm' | 'mkv' | 'gif' | 'wav';

export type LayoutMode = 'pip' | 'side-by-side' | 'screen-only' | 'camera-only';

export type WebcamShape = 'circle' | 'rounded' | 'square';

export type WebcamCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type WebcamBorderStyle = 'none' | 'subtle' | 'bright' | 'accent';

export type SourceMode = 'slides' | 'screen';

export type TransitionStyle = 'crossfade' | 'fade-black' | 'none';

export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused';

export type SidebarTab = 'webcam' | 'slides' | 'design' | 'script';

export type ThemePreference = 'system' | 'light' | 'dark';

export type ResolvedTheme = 'light' | 'dark';

export type CameraFilterPreset =
  | 'none'
  | 'studio-warm'
  | 'cool-crisp'
  | 'cinema'
  | 'bw'
  | 'vintage';

export type VirtualBgMode =
  | 'none'
  | 'blur-light'
  | 'blur-strong'
  | 'remove'
  | 'studio-dark'
  | 'modern-office'
  | 'bokeh'
  | 'custom';

export type AnnotationTool = 'select' | 'pen' | 'highlighter' | 'arrow' | 'laser';

export type SlideTemplateId = 'minimal-dark' | 'executive-split' | 'metric-card' | 'editorial-quote';

export interface SlideAdjustments {
  /** Percentage 50..150 (100 = neutral) */
  brightness: number;
  /** Percentage 50..150 (100 = neutral) */
  contrast: number;
  /** Percentage 0..200 (100 = neutral) */
  saturation: number;
}

export interface WebcamEffects {
  filterPreset: CameraFilterPreset;
  /** 0..100 soft-focus skin smoothing / studio diffusion */
  skinSmooth: number;
  /** Percentage 70..180 (100 = neutral) */
  brightness: number;
  /** Percentage 70..140 (100 = neutral) */
  contrast: number;
  /** Percentage 50..160 (100 = neutral) */
  saturation: number;
  /** Zoom-style studio low-light enhancement toggle */
  lowLightBoost: boolean;
  /** 0..100 adjustable studio low-light brightness lift */
  lowLightLevel: number;
  /** AI-segmented virtual background / blur / removal mode */
  virtualBg: VirtualBgMode;
  /** Optional user-uploaded virtual background image data URL */
  customBgUrl: string | null;
}

export interface AnnotationPoint {
  /** Normalized 0..1 X coordinate on canvas */
  x: number;
  /** Normalized 0..1 Y coordinate on canvas */
  y: number;
}

export interface AnnotationStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'arrow';
  color: string;
  width: number;
  points: AnnotationPoint[];
  createdAt: number;
  autoFade: boolean;
}

export interface LiveReaction {
  id: string;
  emoji: string;
  /** Normalized starting X coordinate (0.15..0.85) */
  x: number;
  createdAt: number;
  durationMs: number;
  /** Gentle horizontal sway amplitude in canvas px */
  driftX: number;
}

export interface LowerThirdConfig {
  enabled: boolean;
  name: string;
  title: string;
  accentColor: string;
  style: 'minimal' | 'broadcast' | 'glass';
  position: WebcamCorner;
  /** Normalized center X (0..1) on canvas */
  x: number;
  /** Normalized center Y (0..1) on canvas */
  y: number;
}

export interface StageTextOverlay {
  id: string;
  text: string;
  style: 'headline' | 'callout' | 'badge';
  /** Normalized center X (0..1) */
  x: number;
  /** Normalized center Y (0..1) */
  y: number;
  textColor: string;
  bgColor: string;
  fontSize: number;
}

export interface BrandWatermark {
  enabled: boolean;
  text: string;
  logoDataUrl: string | null;
  corner: WebcamCorner;
  /** Normalized center X (0..1) on canvas */
  x: number;
  /** Normalized center Y (0..1) on canvas */
  y: number;
  /** 0.2..1.0 */
  opacity: number;
  /** 0.6..2.0 relative scale */
  size: number;
}

export interface StageDesignConfig {
  lowerThird: LowerThirdConfig;
  textOverlays: StageTextOverlay[];
  watermark: BrandWatermark;
  handRaised: boolean;
}

export interface TimeRange {
  start: number;
  end: number;
}

export type CutReason = 'silence' | 'repetition' | 'manual';

export interface TimelineCut {
  id: string;
  start: number;
  end: number;
  reason: CutReason;
  /** When true, this segment is cut (removed) from preview & export; when false, it is kept */
  enabled: boolean;
  label: string;
  /** Optional 0..100 acoustic match confidence for repetition cuts */
  confidence?: number;
}

export interface SilenceDetectionRules {
  /** Audio level in dBFS below which audio is considered silence (-55 to -18) */
  thresholdDb: number;
  /** Minimum continuous pause duration (seconds) before flagging as removable silence */
  minDurationSec: number;
  /** Natural breathing padding (seconds) kept before and after speech edges */
  paddingSec: number;
}

export interface RepetitionDetectionRules {
  /** Acoustic similarity threshold (0.55 to 0.92) to flag repeated spoken phrases */
  sensitivity: number;
  /** Minimum utterance length in seconds to evaluate for repetition */
  minPhraseSec: number;
  /** Maximum gap in seconds between an initial take and a retake */
  maxGapSec: number;
  /** Rule for which take to keep when a repetition is detected */
  keepTake: 'last' | 'first';
}

export interface BackdropPreset {
  id: string;
  name: string;
  category: 'solid' | 'gradient' | 'studio';
  previewCss: string;
  colors: string[];
  angle?: number;
  radialSpot?: { x: number; y: number; color: string };
}

export interface SlideItem {
  id: string;
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  sourceType: 'starter' | 'image' | 'pdf' | 'pptx' | 'template';
  notes?: string;
  adjustments?: SlideAdjustments;
}

export interface WebcamConfig {
  enabled: boolean;
  shape: WebcamShape;
  /** Scale relative to shortest canvas dimension (0.16 to 0.48) */
  scale: number;
  /** Normalized center X position (0..1) on canvas */
  x: number;
  /** Normalized center Y position (0..1) on canvas */
  y: number;
  mirror: boolean;
  autoCenter: boolean;
  backgroundBlur: boolean;
  borderStyle: WebcamBorderStyle;
  shadow: boolean;
  effects: WebcamEffects;
}

export interface StageConfig {
  aspectRatio: AspectRatio;
  resolution: VideoResolutionPreset;
  layout: LayoutMode;
  sourceMode: SourceMode;
  backdropId: string;
  slidePadding: number; // 0 to 80 (in 1080p reference px)
  slideRadius: number;  // 0 to 36
  transition: TransitionStyle;
}

export interface RecordedClip {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: 'webm' | 'mp4' | 'mkv';
  durationSec: number;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  resolution: VideoResolutionPreset;
  createdAt: number;
}

export interface MediaPermissionIssue {
  source: 'camera' | 'microphone' | 'screen';
  message: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
