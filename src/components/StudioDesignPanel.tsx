import React, { useRef } from 'react';
import {
  BadgeCheck,
  ImagePlus,
  Plus,
  Trash2,
  Type,
  UserSquare2,
  X,
} from 'lucide-react';
import type {
  AspectRatio,
  BrandWatermark,
  LowerThirdConfig,
  StageDesignConfig,
  StageTextOverlay,
  WebcamCorner,
} from '../types/studio';
import { getCanvasDimensions } from '../utils/compositorMath';
import {
  getLowerThirdCornerPosition,
  getWatermarkCornerPosition,
} from '../utils/studioEffects';

interface StudioDesignPanelProps {
  design: StageDesignConfig;
  aspectRatio: AspectRatio;
  onUpdateLowerThird: (patch: Partial<LowerThirdConfig>) => void;
  onAddTextOverlay: (style: StageTextOverlay['style']) => void;
  onUpdateTextOverlay: (id: string, patch: Partial<StageTextOverlay>) => void;
  onDeleteTextOverlay: (id: string) => void;
  onUpdateWatermark: (patch: Partial<BrandWatermark>) => void;
}

const ACCENT_SWATCHES = ['#3b82f6', '#10b981', '#f59e0b', '#e11d48', '#8b5cf6', '#f8fafc'];

const LOWER_THIRD_STYLES: Array<{ id: LowerThirdConfig['style']; label: string }> = [
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'glass', label: 'Glass' },
  { id: 'minimal', label: 'Minimal' },
];

const WATERMARK_CORNERS: Array<{ id: WebcamCorner; label: string }> = [
  { id: 'top-left', label: 'Top Left' },
  { id: 'top-right', label: 'Top Right' },
  { id: 'bottom-left', label: 'Bottom Left' },
  { id: 'bottom-right', label: 'Bottom Right' },
];

export const StudioDesignPanel: React.FC<StudioDesignPanelProps> = ({
  design,
  aspectRatio,
  onUpdateLowerThird,
  onAddTextOverlay,
  onUpdateTextOverlay,
  onDeleteTextOverlay,
  onUpdateWatermark,
}) => {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const stageDims = getCanvasDimensions(aspectRatio, '720p');

  const handleLogoUpload = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onUpdateWatermark({ logoDataUrl: reader.result, enabled: true });
      }
    };
    reader.readAsDataURL(file);
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Broadcast Presenter Lower-Third Banner */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
            <UserSquare2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Presenter Lower-Third
          </h3>
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={design.lowerThird.enabled}
              onChange={(e) => onUpdateLowerThird({ enabled: e.target.checked })}
              aria-label="Enable presenter lower-third"
              className="accent-blue-600 dark:accent-blue-500 rounded cursor-pointer"
            />
            Show
          </label>
        </div>

        <div className="space-y-2">
          <div className="space-y-1">
            <label
              htmlFor="lt-name-input"
              className="block text-[11px] text-slate-600 dark:text-slate-400"
            >
              Presenter name
            </label>
            <input
              id="lt-name-input"
              type="text"
              value={design.lowerThird.name}
              onChange={(e) => onUpdateLowerThird({ name: e.target.value })}
              placeholder="Your name"
              className="w-full h-9 px-2.5 rounded-lg bg-white dark:bg-[#1A1D24] border border-slate-300 dark:border-[#272B35] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="lt-title-input"
              className="block text-[11px] text-slate-600 dark:text-slate-400"
            >
              Role or subtitle
            </label>
            <input
              id="lt-title-input"
              type="text"
              value={design.lowerThird.title}
              onChange={(e) => onUpdateLowerThird({ title: e.target.value })}
              placeholder="Title · Organization"
              className="w-full h-9 px-2.5 rounded-lg bg-white dark:bg-[#1A1D24] border border-slate-300 dark:border-[#272B35] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35]">
            {LOWER_THIRD_STYLES.map((st) => {
              const active = design.lowerThird.style === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onUpdateLowerThird({ style: st.id })}
                  className={`py-1.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] text-slate-600 dark:text-slate-400">Accent color</span>
            <div className="flex items-center gap-1.5">
              {ACCENT_SWATCHES.map((hex) => {
                const selected = design.lowerThird.accentColor === hex;
                return (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => onUpdateLowerThird({ accentColor: hex })}
                    aria-label={`Lower-third accent ${hex}`}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      selected
                        ? 'border-slate-900 dark:border-white scale-110 ring-2 ring-blue-500/40'
                        : 'border-slate-300 dark:border-white/25'
                    }`}
                    style={{ backgroundColor: hex }}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600 dark:text-slate-400">Quick snap</span>
              <span className="text-[11px] text-slate-500">Or drag anywhere on stage</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {WATERMARK_CORNERS.map((c) => {
                const active = design.lowerThird.position === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      const pos = getLowerThirdCornerPosition(
                        c.id,
                        design.lowerThird,
                        stageDims.width,
                        stageDims.height
                      );
                      onUpdateLowerThird({ position: c.id, x: pos.x, y: pos.y, enabled: true });
                    }}
                    className={`h-8 rounded-md text-[11px] font-medium border transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-[#252A36] dark:border-blue-500/60 dark:text-white'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#161920] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Draggable Stage Text & Callout Overlays */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Stage Text Overlays
          </h3>
          <span className="text-[11px] text-slate-500">Drag on stage</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onAddTextOverlay('headline')}
            className="h-9 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            Heading
          </button>
          <button
            type="button"
            onClick={() => onAddTextOverlay('callout')}
            className="h-9 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            Callout
          </button>
          <button
            type="button"
            onClick={() => onAddTextOverlay('badge')}
            className="h-9 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            Label
          </button>
        </div>

        {design.textOverlays.length === 0 ? (
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Add live headlines, callout boxes, or section labels directly onto your video stage. Drag any text overlay on the canvas to position it.
          </p>
        ) : (
          <div className="space-y-2">
            {design.textOverlays.map((ov, idx) => (
              <div
                key={ov.id}
                className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-[#272B35] space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={ov.text}
                    aria-label={`Overlay ${idx + 1} text`}
                    onChange={(e) => onUpdateTextOverlay(ov.id, { text: e.target.value })}
                    className="flex-1 min-w-0 h-8 px-2 rounded bg-white dark:bg-[#101217] border border-slate-300 dark:border-[#272B35] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => onDeleteTextOverlay(ov.id)}
                    aria-label={`Delete overlay ${idx + 1}`}
                    className="w-8 h-8 rounded bg-slate-100 dark:bg-[#1A1D24] hover:bg-red-500/15 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-300 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1 shrink-0">
                    {['#2563eb', '#0f172a', '#059669', '#d97706', '#e11d48'].map((bg) => (
                      <button
                        key={bg}
                        type="button"
                        onClick={() => onUpdateTextOverlay(ov.id, { bgColor: bg })}
                        aria-label={`Overlay ${idx + 1} color ${bg}`}
                        className={`w-4 h-4 rounded-full border shrink-0 ${
                          ov.bgColor === bg
                            ? 'border-slate-900 dark:border-white scale-110'
                            : 'border-black/20 dark:border-white/25'
                        }`}
                        style={{ backgroundColor: bg }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 max-w-[118px]">
                    <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-400 shrink-0">
                      {ov.fontSize}px
                    </span>
                    <input
                      type="range"
                      min={18}
                      max={54}
                      step={2}
                      value={ov.fontSize}
                      aria-label={`Overlay ${idx + 1} font size`}
                      onChange={(e) =>
                        onUpdateTextOverlay(ov.id, { fontSize: parseInt(e.target.value, 10) })
                      }
                      className="w-full min-w-0 studio-slider"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Brand Kit Logo / Watermark */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
            <BadgeCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Brand Watermark
          </h3>
          <button
            type="button"
            aria-pressed={design.watermark.enabled}
            onClick={() => onUpdateWatermark({ enabled: !design.watermark.enabled })}
            className={`h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors ${
              design.watermark.enabled
                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-600/20 dark:border-blue-500/65 dark:text-blue-200'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-950 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            {design.watermark.enabled ? 'Watermark On' : '+ Add Watermark'}
          </button>
        </div>

        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/svg+xml,image/webp,image/jpeg"
          onChange={(e) => handleLogoUpload(e.target.files)}
          className="hidden"
          aria-label="Upload brand logo image"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="flex-1 h-9 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <ImagePlus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            {design.watermark.logoDataUrl ? 'Replace Logo' : 'Upload Logo'}
          </button>
          {design.watermark.logoDataUrl && (
            <button
              type="button"
              onClick={() => onUpdateWatermark({ logoDataUrl: null })}
              aria-label="Remove uploaded brand logo"
              className="h-9 w-9 rounded-lg bg-slate-50 hover:bg-red-500/15 dark:bg-[#1A1D24] dark:hover:bg-red-500/15 border border-slate-200 dark:border-[#272B35] text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-300 flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!design.watermark.logoDataUrl && (
          <div className="space-y-1">
            <label
              htmlFor="watermark-text-input"
              className="block text-[11px] text-slate-600 dark:text-slate-400"
            >
              Watermark text
            </label>
            <input
              id="watermark-text-input"
              type="text"
              value={design.watermark.text}
              onChange={(e) => onUpdateWatermark({ text: e.target.value, enabled: true })}
              placeholder="BRAND NAME"
              className="w-full h-9 px-2.5 rounded-lg bg-white dark:bg-[#1A1D24] border border-slate-300 dark:border-[#272B35] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-600 dark:text-slate-400">Snap corner</span>
            <span className="text-[11px] text-slate-500">Or drag anywhere on stage</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {WATERMARK_CORNERS.map((c) => {
              const active = design.watermark.corner === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const pos = getWatermarkCornerPosition(
                      c.id,
                      design.watermark,
                      stageDims.width,
                      stageDims.height
                    );
                    onUpdateWatermark({ corner: c.id, x: pos.x, y: pos.y, enabled: true });
                  }}
                  className={`h-8 rounded-md text-[11px] font-medium border transition-colors ${
                    active
                      ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-[#252A36] dark:border-blue-500/60 dark:text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#161920] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="watermark-size-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Size
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {Math.round(design.watermark.size * 100)}%
              </span>
            </div>
            <input
              id="watermark-size-slider"
              type="range"
              min={0.6}
              max={2.0}
              step={0.1}
              value={design.watermark.size}
              onChange={(e) => onUpdateWatermark({ size: parseFloat(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="watermark-opacity-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Opacity
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {Math.round(design.watermark.opacity * 100)}%
              </span>
            </div>
            <input
              id="watermark-opacity-slider"
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={design.watermark.opacity}
              onChange={(e) => onUpdateWatermark({ opacity: parseFloat(e.target.value) })}
              className="w-full studio-slider"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
