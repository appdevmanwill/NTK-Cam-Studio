import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Monitor,
  MonitorOff,
  Plus,
  Presentation,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  BackdropPreset,
  SlideAdjustments,
  SlideItem,
  SlideTemplateId,
  StageConfig,
  TransitionStyle,
} from '../types/studio';
import { loadSlidesFromFiles } from '../utils/slideLoader';
import {
  buildSlideFilterString,
  createTemplateSlide,
  DEFAULT_SLIDE_ADJUSTMENTS,
  isSlideAdjustmentDefault,
  normalizeSlideAdjustments,
  SLIDE_TEMPLATE_OPTIONS,
} from '../utils/studioEffects';

interface SlideManagerProps {
  slides: SlideItem[];
  activeSlideIndex: number;
  stageConfig: StageConfig;
  backdrops: BackdropPreset[];
  screenActive: boolean;
  onSelectSlide: (index: number) => void;
  onAddSlides: (newSlides: SlideItem[]) => void;
  onDeleteSlide: (index: number) => void;
  onMoveSlide: (fromIndex: number, toIndex: number) => void;
  onUpdateSlideAdjustments: (index: number, patch: Partial<SlideAdjustments>) => void;
  onApplyAdjustmentsToAll: (adjustments: SlideAdjustments) => void;
  onChangeStage: (patch: Partial<StageConfig>) => void;
  onStartScreenShare: () => Promise<void>;
  onStopScreenShare: () => void;
}

const TRANSITION_OPTIONS: Array<{ id: TransitionStyle; label: string }> = [
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'fade-black', label: 'Fade Black' },
  { id: 'none', label: 'None' },
];

export const SlideManager: React.FC<SlideManagerProps> = ({
  slides,
  activeSlideIndex,
  stageConfig,
  backdrops,
  screenActive,
  onSelectSlide,
  onAddSlides,
  onDeleteSlide,
  onMoveSlide,
  onUpdateSlideAdjustments,
  onApplyAdjustmentsToAll,
  onChangeStage,
  onStartScreenShare,
  onStopScreenShare,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateId, setTemplateId] = useState<SlideTemplateId>('minimal-dark');
  const [templateHeading, setTemplateHeading] = useState(SLIDE_TEMPLATE_OPTIONS[0].defaultHeading);
  const [templateBody, setTemplateBody] = useState(SLIDE_TEMPLATE_OPTIONS[0].defaultBody);
  const [templateAccent, setTemplateAccent] = useState(SLIDE_TEMPLATE_OPTIONS[0].accent);
  const [appliedAllFeedback, setAppliedAllFeedback] = useState(false);

  const activeSlide = slides[activeSlideIndex] ?? null;
  const currentAdjustments = normalizeSlideAdjustments(activeSlide?.adjustments);
  const isDefaultAdjustments = isSlideAdjustmentDefault(currentAdjustments);

  const handleSelectTemplatePreset = (id: SlideTemplateId) => {
    setTemplateId(id);
    const preset = SLIDE_TEMPLATE_OPTIONS.find((t) => t.id === id);
    if (preset) {
      setTemplateHeading(preset.defaultHeading);
      setTemplateBody(preset.defaultBody);
      setTemplateAccent(preset.accent);
    }
  };

  const handleCreateTemplateSlide = (e: React.FormEvent) => {
    e.preventDefault();
    const created = createTemplateSlide(templateId, templateHeading, templateBody, templateAccent);
    if (created) {
      onAddSlides([created]);
      onChangeStage({ sourceMode: 'slides' });
      setTemplateOpen(false);
    }
  };

  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    setImportNotice(null);
    try {
      const loaded = await loadSlidesFromFiles(files);
      if (loaded.length === 0) {
        setImportError('Please select PowerPoint (.pptx), PDF, PNG, JPG, or WebP slide files.');
      } else {
        onAddSlides(loaded);
        onChangeStage({ sourceMode: 'slides' });
        const hasNotes = loaded.some((s) => Boolean(s.notes));
        const pptxCount = loaded.filter((s) => s.sourceType === 'pptx').length;
        if (pptxCount > 0) {
          setImportNotice(
            hasNotes
              ? `Imported ${pptxCount} PowerPoint slide${pptxCount === 1 ? '' : 's'} and synced speaker notes to Script.`
              : `Imported ${pptxCount} PowerPoint slide${pptxCount === 1 ? '' : 's'}.`
          );
        }
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to import selected files.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.length) {
      void handleFilesSelected(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-5">
      {/* Presentation Source Switcher */}
      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
          Stage Source
        </h3>

        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35]">
          <button
            type="button"
            onClick={() => onChangeStage({ sourceMode: 'slides' })}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              stageConfig.sourceMode === 'slides'
                ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Presentation className="w-3.5 h-3.5" />
            Slide Deck
          </button>

          <button
            type="button"
            onClick={() => {
              onChangeStage({ sourceMode: 'screen' });
              if (!screenActive) {
                void onStartScreenShare();
              }
            }}
            className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              stageConfig.sourceMode === 'screen'
                ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            Screen Share
          </button>
        </div>

        {/* Screen share action bar */}
        {stageConfig.sourceMode === 'screen' && (
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-[#272B35] space-y-2.5">
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {screenActive
                ? 'Your selected window or screen is streaming live to the stage canvas.'
                : 'Choose a window, browser tab, or entire monitor to present.'}
            </p>
            {screenActive ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void onStartScreenShare()}
                  className="flex-1 h-9 px-3 rounded-lg bg-white hover:bg-slate-100 dark:bg-[#232733] dark:hover:bg-[#2B3040] border border-slate-300 dark:border-transparent text-xs font-medium text-slate-800 dark:text-white transition-colors"
                >
                  Switch Window
                </button>
                <button
                  type="button"
                  onClick={onStopScreenShare}
                  className="h-9 px-3 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-500/15 dark:hover:bg-red-500/25 border border-red-300 dark:border-red-500/40 text-xs font-medium text-red-700 dark:text-red-200 inline-flex items-center gap-1.5 transition-colors"
                >
                  <MonitorOff className="w-3.5 h-3.5" />
                  Stop
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onStartScreenShare()}
                className="w-full h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Monitor className="w-3.5 h-3.5" />
                Share Screen or Window
              </button>
            )}
          </div>
        )}
      </section>

      {/* Slide Upload, Quick Template Creator & Deck Navigation */}
      {stageConfig.sourceMode === 'slides' && (
        <>
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
                Slides ({slides.length})
              </h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTemplateOpen((o) => !o)}
                  aria-expanded={templateOpen}
                  className={`h-7 px-2 rounded text-[11px] font-medium border inline-flex items-center gap-1 transition-colors whitespace-nowrap ${
                    templateOpen
                      ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-500/15 dark:border-blue-500/50 dark:text-blue-200'
                      : 'bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-950 hover:bg-slate-200/70 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  New Slide
                </button>
                <button
                  type="button"
                  onClick={() => onSelectSlide(Math.max(0, activeSlideIndex - 1))}
                  disabled={activeSlideIndex <= 0}
                  aria-label="Previous slide in deck"
                  className="w-7 h-7 rounded bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 px-1">
                  {slides.length > 0 ? `${activeSlideIndex + 1}/${slides.length}` : '0/0'}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectSlide(Math.min(slides.length - 1, activeSlideIndex + 1))}
                  disabled={activeSlideIndex >= slides.length - 1}
                  aria-label="Next slide in deck"
                  className="w-7 h-7 rounded bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Instant Slide Template Creator */}
            {templateOpen && (
              <form
                onSubmit={handleCreateTemplateSlide}
                className="p-3 rounded-lg bg-blue-50/50 dark:bg-[#151821] border border-blue-300 dark:border-blue-500/35 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-200">
                    Create Template Slide
                  </span>
                  <div className="flex items-center gap-1">
                    {['#3b82f6', '#0f766e', '#f59e0b', '#8b5cf6', '#e11d48'].map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setTemplateAccent(hex)}
                        aria-label={`Slide template accent ${hex}`}
                        className={`w-4 h-4 rounded-full border ${
                          templateAccent === hex
                            ? 'border-slate-900 dark:border-white scale-110'
                            : 'border-black/20 dark:border-white/25'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1">
                  {SLIDE_TEMPLATE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectTemplatePreset(opt.id)}
                      className={`h-7 px-2 rounded text-[11px] font-medium border transition-colors truncate ${
                        templateId === opt.id
                          ? 'bg-blue-600/15 dark:bg-[#252B3A] border-blue-500/70 dark:border-blue-500/60 text-blue-900 dark:text-white'
                          : 'bg-white dark:bg-[#101217] border-slate-200 dark:border-[#272B35] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={templateHeading}
                  onChange={(e) => setTemplateHeading(e.target.value)}
                  aria-label="Template slide heading"
                  placeholder="Slide heading"
                  className="w-full h-8 px-2.5 rounded bg-white dark:bg-[#101217] border border-slate-300 dark:border-[#272B35] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />

                <textarea
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  aria-label="Template slide body"
                  rows={2}
                  placeholder="Subtitle or bullet points"
                  className="w-full p-2 rounded bg-white dark:bg-[#101217] border border-slate-300 dark:border-[#272B35] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:outline-none focus:border-blue-500"
                />

                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    className="flex-1 h-8 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
                  >
                    Add to Deck
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateOpen(false)}
                    className="h-8 px-2.5 rounded-md bg-slate-200 hover:bg-slate-300/80 dark:bg-[#1D212B] dark:hover:bg-[#262B38] text-xs text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <input
              ref={fileInputRef}
              type="file"
              data-testid="slide-file-input"
              accept=".pptx,.pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              multiple
              onChange={(e) => void handleFilesSelected(e.target.files)}
              className="hidden"
              aria-label="Upload PowerPoint, PDF, or slide images"
            />

            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={`w-full py-3 px-3 rounded-lg border border-dashed text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors ${
                isDragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-white'
                  : 'border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-slate-100/80 text-slate-800 dark:border-[#343A47] dark:hover:border-blue-500/70 dark:bg-[#161920] dark:hover:bg-[#1B1F29] dark:text-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Upload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                {isImporting ? 'Parsing & rendering slides...' : 'Upload PowerPoint, PDF or Images'}
              </span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-500">
                Drag & drop .pptx, .pdf, .png, or .jpg
              </span>
            </button>

            {importError && (
              <p className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-md px-2.5 py-2">
                {importError}
              </p>
            )}

            {importNotice && (
              <div
                data-testid="slide-import-notice"
                className="text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-md px-2.5 py-2 space-y-1"
              >
                <p>{importNotice}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  Tip: For custom desktop fonts or SmartArt charts, Export as PDF in PowerPoint for 1:1 fidelity.
                </p>
              </div>
            )}

            {/* Slide Thumbnails or Friendly Empty State */}
            {slides.length === 0 ? (
              <div
                data-testid="empty-slides-state"
                className="p-4 rounded-lg bg-slate-50 dark:bg-[#151821] border border-slate-200 dark:border-[#242832] text-center space-y-2.5"
              >
                <Presentation className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Your slide deck is empty
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Upload a PowerPoint or PDF deck, or build a fresh title slide in seconds.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
                  >
                    Upload Slides
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateOpen(true)}
                    className="h-8 px-3 rounded-md bg-white hover:bg-slate-100 dark:bg-[#1D212B] dark:hover:bg-[#262B38] border border-slate-300 dark:border-[#2E3442] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    New Template
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 studio-scroll">
                {slides.map((slide, idx) => {
                  const isSelected = idx === activeSlideIndex;
                  const thumbFilter = buildSlideFilterString(slide.adjustments);
                  return (
                    <div
                      key={slide.id}
                      className={`group flex items-center gap-2.5 p-1.5 rounded-lg border transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 dark:bg-[#222733] border-blue-500/70'
                          : 'bg-slate-50 dark:bg-[#161920] border-slate-200 dark:border-[#242832] hover:border-slate-300 dark:hover:border-[#343A47]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectSlide(idx)}
                        aria-label={`Select slide ${idx + 1}: ${slide.title}`}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      >
                        <img
                          src={slide.dataUrl}
                          alt={slide.title}
                          style={thumbFilter !== 'none' ? { filter: thumbFilter } : undefined}
                          className="w-16 h-9 object-cover rounded border border-slate-300 dark:border-white/10 shrink-0 bg-slate-900 dark:bg-[#0B0C0F]"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {slide.title}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            Slide {idx + 1}
                            {slide.sourceType === 'pptx'
                              ? ' · PPTX'
                              : slide.sourceType === 'template'
                                ? ' · Template'
                                : ''}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => onMoveSlide(idx, idx - 1)}
                          aria-label={`Move slide ${idx + 1} up`}
                          className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 disabled:opacity-25"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === slides.length - 1}
                          onClick={() => onMoveSlide(idx, idx + 1)}
                          aria-label={`Move slide ${idx + 1} down`}
                          className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 disabled:opacity-25"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSlide(idx)}
                          aria-label={`Remove slide ${idx + 1}`}
                          className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Per-Slide Image & Color Adjustment Controls */}
          {activeSlide && (
            <>
              <div className="h-px bg-slate-200 dark:bg-[#222630]" />
              <section className="space-y-3" aria-label="Slide color adjustments">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Slide Color Correction
                  </h3>
                  <button
                    type="button"
                    disabled={isDefaultAdjustments}
                    onClick={() =>
                      onUpdateSlideAdjustments(activeSlideIndex, DEFAULT_SLIDE_ADJUSTMENTS)
                    }
                    className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 disabled:opacity-35 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                <div className="space-y-2.5">
                  {/* Brightness */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="slide-brightness-slider"
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Brightness
                      </label>
                      <span
                        data-testid="slide-brightness-value"
                        className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300"
                      >
                        {currentAdjustments.brightness}%
                      </span>
                    </div>
                    <input
                      id="slide-brightness-slider"
                      type="range"
                      min={50}
                      max={150}
                      step={1}
                      value={currentAdjustments.brightness}
                      onChange={(e) =>
                        onUpdateSlideAdjustments(activeSlideIndex, {
                          brightness: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="slide-contrast-slider"
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Contrast
                      </label>
                      <span
                        data-testid="slide-contrast-value"
                        className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300"
                      >
                        {currentAdjustments.contrast}%
                      </span>
                    </div>
                    <input
                      id="slide-contrast-slider"
                      type="range"
                      min={50}
                      max={150}
                      step={1}
                      value={currentAdjustments.contrast}
                      onChange={(e) =>
                        onUpdateSlideAdjustments(activeSlideIndex, {
                          contrast: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>

                  {/* Saturation */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="slide-saturation-slider"
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Saturation
                      </label>
                      <span
                        data-testid="slide-saturation-value"
                        className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300"
                      >
                        {currentAdjustments.saturation}%
                      </span>
                    </div>
                    <input
                      id="slide-saturation-slider"
                      type="range"
                      min={0}
                      max={200}
                      step={1}
                      value={currentAdjustments.saturation}
                      onChange={(e) =>
                        onUpdateSlideAdjustments(activeSlideIndex, {
                          saturation: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full studio-slider"
                    />
                  </div>
                </div>

                {slides.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyAdjustmentsToAll(currentAdjustments);
                      setAppliedAllFeedback(true);
                      window.setTimeout(() => setAppliedAllFeedback(false), 1200);
                    }}
                    className="w-full h-8 rounded-md bg-slate-100 hover:bg-slate-200/80 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-colors"
                  >
                    {appliedAllFeedback ? 'Applied to all slides' : 'Apply Adjustments to All Slides'}
                  </button>
                )}
              </section>
            </>
          )}
        </>
      )}

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Slide & Layout Transition Style */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Scene Transitions
          </h3>
          <span className="text-[11px] text-slate-500">Slides & layouts</span>
        </div>

        <div
          role="group"
          aria-label="Scene transition style"
          className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35]"
        >
          {TRANSITION_OPTIONS.map((opt) => {
            const active = stageConfig.transition === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChangeStage({ transition: opt.id })}
                className={`py-1.5 px-2 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* Canvas Backdrop Studio Themes */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
            Canvas Backdrop
          </h3>
          <span className="text-[11px] text-slate-500">
            {backdrops.find((b) => b.id === stageConfig.backdropId)?.name}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {backdrops.map((preset) => {
            const active = preset.id === stageConfig.backdropId;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChangeStage({ backdropId: preset.id })}
                aria-label={`Backdrop: ${preset.name}`}
                aria-pressed={active}
                title={preset.name}
                className={`h-9 rounded-lg border transition-all ${
                  active
                    ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-500/40 scale-[1.02]'
                    : 'border-slate-300 hover:border-slate-400 dark:border-white/15 dark:hover:border-white/35'
                }`}
                style={{ background: preset.previewCss }}
              />
            );
          })}
        </div>

        {/* Stage Frame Fit (Full Screen vs Framed) */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#1A1D24] border border-slate-200 dark:border-[#272B35]">
            <button
              type="button"
              aria-pressed={stageConfig.slidePadding === 0 && stageConfig.slideRadius === 0}
              onClick={() => onChangeStage({ slidePadding: 0, slideRadius: 0 })}
              className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                stageConfig.slidePadding === 0 && stageConfig.slideRadius === 0
                  ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Full Screen
            </button>
            <button
              type="button"
              aria-pressed={stageConfig.slidePadding > 0 || stageConfig.slideRadius > 0}
              onClick={() =>
                onChangeStage({
                  slidePadding: stageConfig.slidePadding > 0 ? stageConfig.slidePadding : 24,
                  slideRadius: stageConfig.slideRadius > 0 ? stageConfig.slideRadius : 14,
                })
              }
              className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                stageConfig.slidePadding > 0 || stageConfig.slideRadius > 0
                  ? 'bg-white dark:bg-[#282D3A] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Framed Backdrop
            </button>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="stage-padding-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Frame margin
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {stageConfig.slidePadding}px
              </span>
            </div>
            <input
              id="stage-padding-slider"
              type="range"
              min={0}
              max={64}
              step={2}
              value={stageConfig.slidePadding}
              onChange={(e) => onChangeStage({ slidePadding: parseInt(e.target.value, 10) })}
              className="w-full studio-slider"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="stage-radius-slider"
                className="text-[11px] text-slate-600 dark:text-slate-400"
              >
                Corner radius
              </label>
              <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                {stageConfig.slideRadius}px
              </span>
            </div>
            <input
              id="stage-radius-slider"
              type="range"
              min={0}
              max={28}
              step={2}
              value={stageConfig.slideRadius}
              onChange={(e) => onChangeStage({ slideRadius: parseInt(e.target.value, 10) })}
              className="w-full studio-slider"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
