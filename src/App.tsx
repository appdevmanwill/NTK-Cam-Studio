import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Keyboard,
  Layers,
  Palette,
  PanelRightClose,
  PanelRightOpen,
  ScrollText,
  X,
} from 'lucide-react';
import { CanvasCompositor } from './components/CanvasCompositor';
import { ExportModal } from './components/ExportModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import {
  MobileBottomDock,
  MobileBottomSheet,
  MobileLayoutPicker,
  MobileQuickStageRail,
  QuickGuideModal,
  type MobileSheetTab,
} from './components/MobileStudioDock';
import { RecorderEngine } from './components/RecorderEngine';
import { SlideManager } from './components/SlideManager';
import { ScreenShareOverlayIndicator, StageMicWaveform } from './components/StageOverlays';
import { StageToolbar } from './components/StageToolbar';
import { StudioDesignPanel } from './components/StudioDesignPanel';
import {
  FloatingTeleprompter,
  TeleprompterSidebarPanel,
  type TeleprompterSettings,
} from './components/Teleprompter';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { WebcamControls } from './components/WebcamControls';
import { useMediaDevices } from './hooks/useMediaDevices';
import { useRecorderEngine } from './hooks/useRecorderEngine';
import { useTheme } from './hooks/useTheme';
import type {
  AnnotationStroke,
  AnnotationTool,
  AspectRatio,
  BrandWatermark,
  LayoutMode,
  LiveReaction,
  LowerThirdConfig,
  RecordedClip,
  SidebarTab,
  SlideAdjustments,
  SlideItem,
  StageConfig,
  StageDesignConfig,
  StageTextOverlay,
  VideoResolutionPreset,
  WebcamConfig,
} from './types/studio';
import {
  BACKDROP_PRESETS,
  createStarterSlides,
  DEFAULT_TELEPROMPTER_SCRIPT,
} from './utils/starterSlides';
import { saveDataUrlToDevice } from './utils/nativeDownload';
import type { SegmentationEngineStatus } from './utils/cameraSegmentation';
import {
  addSlidesToDeck,
  applyAdjustmentsToAllSlides,
  deleteSlideFromDeck,
  moveSlideInDeck,
  type SlideDeckState,
  updateSlideAdjustmentsInDeck,
} from './utils/slideDeck';
import {
  ANNOTATION_COLORS,
  DEFAULT_STAGE_DESIGN,
  DEFAULT_WEBCAM_EFFECTS,
  pruneExpiredAnnotations,
  pruneExpiredReactions,
} from './utils/studioEffects';
import { loadStudioPrefs, saveStudioPrefs } from './utils/theme';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialPrefsRef = useRef(loadStudioPrefs());

  const theme = useTheme();

  const [deck, setDeck] = useState<SlideDeckState>(() => ({
    slides: createStarterSlides(),
    activeIndex: 0,
  }));
  const slides = deck.slides;
  const activeSlideIndex = deck.activeIndex;

  const [stageConfig, setStageConfig] = useState<StageConfig>({
    aspectRatio: '16:9',
    resolution: '1080p',
    layout: 'pip',
    sourceMode: 'slides',
    backdropId: BACKDROP_PRESETS[0].id,
    slidePadding: 0,
    slideRadius: 0,
    transition: 'crossfade',
  });

  const [webcamConfig, setWebcamConfig] = useState<WebcamConfig>({
    enabled: true,
    shape: 'circle',
    scale: 0.28,
    x: 0.86,
    y: 0.77,
    mirror: true,
    autoCenter: false,
    backgroundBlur: false,
    borderStyle: 'subtle',
    shadow: true,
    effects: { ...DEFAULT_WEBCAM_EFFECTS },
  });

  const [stageDesign, setStageDesign] = useState<StageDesignConfig>(() => {
    const saved = initialPrefsRef.current;
    return {
      lowerThird: {
        ...DEFAULT_STAGE_DESIGN.lowerThird,
        name: saved.lowerThirdName ?? DEFAULT_STAGE_DESIGN.lowerThird.name,
        title: saved.lowerThirdTitle ?? DEFAULT_STAGE_DESIGN.lowerThird.title,
        style: saved.lowerThirdStyle ?? DEFAULT_STAGE_DESIGN.lowerThird.style,
        accentColor: saved.lowerThirdAccent ?? DEFAULT_STAGE_DESIGN.lowerThird.accentColor,
      },
      textOverlays: [],
      watermark: {
        ...DEFAULT_STAGE_DESIGN.watermark,
        text: saved.watermarkText ?? DEFAULT_STAGE_DESIGN.watermark.text,
        opacity: saved.watermarkOpacity ?? DEFAULT_STAGE_DESIGN.watermark.opacity,
        size: saved.watermarkSize ?? DEFAULT_STAGE_DESIGN.watermark.size,
      },
      handRaised: false,
    };
  });

  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('select');
  const [annotationColor, setAnnotationColor] = useState<string>(ANNOTATION_COLORS[0].value);
  const [autoFadeInk, setAutoFadeInk] = useState<boolean>(false);
  const [annotations, setAnnotations] = useState<AnnotationStroke[]>([]);
  const [reactions, setReactions] = useState<LiveReaction[]>([]);

  const [teleprompter, setTeleprompter] = useState<TeleprompterSettings>(() => {
    const saved = initialPrefsRef.current;
    return {
      script: saved.teleprompterScript ?? DEFAULT_TELEPROMPTER_SCRIPT,
      fontSize: saved.teleprompterFontSize ?? 22,
      scrollSpeed: saved.teleprompterScrollSpeed ?? 32,
      isScrolling: false,
      isFloatingOpen: false,
      opacity: 0.9,
    };
  });
  const [prompterResetSignal, setPrompterResetSignal] = useState(0);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<SidebarTab>('slides');
  const [mobileSheetTab, setMobileSheetTab] = useState<MobileSheetTab | null>(null);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [recordedClip, setRecordedClip] = useState<RecordedClip | null>(null);
  const [clipExported, setClipExported] = useState(false);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const [segmentationStatus, setSegmentationStatus] = useState<SegmentationEngineStatus>('idle');

  const media = useMediaDevices();

  // Persist lightweight presenter preferences across reloads
  useEffect(() => {
    saveStudioPrefs({
      lowerThirdName: stageDesign.lowerThird.name,
      lowerThirdTitle: stageDesign.lowerThird.title,
      lowerThirdStyle: stageDesign.lowerThird.style,
      lowerThirdAccent: stageDesign.lowerThird.accentColor,
      watermarkText: stageDesign.watermark.text,
      watermarkOpacity: stageDesign.watermark.opacity,
      watermarkSize: stageDesign.watermark.size,
      teleprompterScript: teleprompter.script,
      teleprompterFontSize: teleprompter.fontSize,
      teleprompterScrollSpeed: teleprompter.scrollSpeed,
    });
  }, [
    stageDesign.lowerThird.accentColor,
    stageDesign.lowerThird.name,
    stageDesign.lowerThird.style,
    stageDesign.lowerThird.title,
    stageDesign.watermark.opacity,
    stageDesign.watermark.size,
    stageDesign.watermark.text,
    teleprompter.fontSize,
    teleprompter.script,
    teleprompter.scrollSpeed,
  ]);

  // Gracefully return to Slide Deck if the user clicks the browser's built-in "Stop sharing" bar
  const prevScreenActiveRef = useRef<boolean>(media.screenActive);
  useEffect(() => {
    if (prevScreenActiveRef.current && !media.screenActive) {
      setStageConfig((prev) =>
        prev.sourceMode === 'screen' ? { ...prev, sourceMode: 'slides' } : prev
      );
    }
    prevScreenActiveRef.current = media.screenActive;
  }, [media.screenActive]);

  const handleRecordingComplete = useCallback((clip: RecordedClip) => {
    setClipExported(false);
    setRecordedClip(clip);
  }, []);

  const recorder = useRecorderEngine({
    canvasRef,
    aspectRatio: stageConfig.aspectRatio,
    resolution: stageConfig.resolution,
    micStream: media.micStream,
    screenStream: media.screenStream,
    onRecordingComplete: handleRecordingComplete,
    onError: (msg) => setRecorderError(msg),
  });

  // Single-owner lifecycle revocation for recorded clip object URLs
  useEffect(() => {
    const urlToRevoke = recordedClip?.url;
    return () => {
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [recordedClip]);

  // Warn before accidentally closing/reloading during an active recording or unsaved clip
  useEffect(() => {
    const shouldWarn =
      recorder.status === 'recording' ||
      recorder.status === 'paused' ||
      (Boolean(recordedClip) && !clipExported);
    if (!shouldWarn) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [clipExported, recordedClip, recorder.status]);

  const activeBackdrop = useMemo(
    () => BACKDROP_PRESETS.find((b) => b.id === stageConfig.backdropId) ?? BACKDROP_PRESETS[0],
    [stageConfig.backdropId]
  );

  const activeSlide = slides[activeSlideIndex] ?? null;

  const updateStage = useCallback((patch: Partial<StageConfig>) => {
    setStageConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateWebcam = useCallback((patch: Partial<WebcamConfig>) => {
    setWebcamConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateTeleprompter = useCallback((patch: Partial<TeleprompterSettings>) => {
    setTeleprompter((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateLowerThird = useCallback((patch: Partial<LowerThirdConfig>) => {
    setStageDesign((prev) => ({
      ...prev,
      lowerThird: { ...prev.lowerThird, ...patch },
    }));
  }, []);

  const updateWatermark = useCallback((patch: Partial<BrandWatermark>) => {
    setStageDesign((prev) => ({
      ...prev,
      watermark: { ...prev.watermark, ...patch },
    }));
  }, []);

  const handleAddTextOverlay = useCallback((style: StageTextOverlay['style']) => {
    const id = `ov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const defaults: Record<StageTextOverlay['style'], Omit<StageTextOverlay, 'id'>> = {
      headline: {
        text: 'Key Takeaway',
        style: 'headline',
        x: 0.5,
        y: 0.16,
        textColor: '#ffffff',
        bgColor: '#0f172a',
        fontSize: 38,
      },
      callout: {
        text: 'Live Walkthrough',
        style: 'callout',
        x: 0.5,
        y: 0.22,
        textColor: '#ffffff',
        bgColor: '#2563eb',
        fontSize: 24,
      },
      badge: {
        text: 'Q4 UPDATE',
        style: 'badge',
        x: 0.18,
        y: 0.14,
        textColor: '#ffffff',
        bgColor: '#059669',
        fontSize: 18,
      },
    };
    setStageDesign((prev) => ({
      ...prev,
      textOverlays: [...prev.textOverlays, { id, ...defaults[style] }],
    }));
    setAnnotationTool('select');
  }, []);

  const handleUpdateTextOverlay = useCallback((id: string, patch: Partial<StageTextOverlay>) => {
    setStageDesign((prev) => ({
      ...prev,
      textOverlays: prev.textOverlays.map((ov) => (ov.id === id ? { ...ov, ...patch } : ov)),
    }));
  }, []);

  const handleDeleteTextOverlay = useCallback((id: string) => {
    setStageDesign((prev) => ({
      ...prev,
      textOverlays: prev.textOverlays.filter((ov) => ov.id !== id),
    }));
  }, []);

  const handleToggleHandRaised = useCallback(() => {
    setStageDesign((prev) => ({ ...prev, handRaised: !prev.handRaised }));
  }, []);

  const handleAddAnnotation = useCallback((stroke: AnnotationStroke) => {
    setAnnotations((prev) => [...prev, stroke]);
  }, []);

  const handleUndoAnnotation = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
  }, []);

  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, []);

  const handleTriggerReaction = useCallback((emoji: string) => {
    const reaction: LiveReaction = {
      id: `react-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      emoji,
      x: 0.22 + Math.random() * 0.56,
      createdAt: Date.now(),
      durationMs: 2400,
      driftX: (Math.random() > 0.5 ? 1 : -1) * (14 + Math.random() * 14),
    };
    setReactions((prev) => [...prev.slice(-14), reaction]);
  }, []);

  const handlePruneExpiredEffects = useCallback((now: number) => {
    setAnnotations((prev) => {
      if (!prev.some((s) => s.autoFade)) return prev;
      const next = pruneExpiredAnnotations(prev, now);
      return next.length === prev.length ? prev : next;
    });
    setReactions((prev) => {
      if (prev.length === 0) return prev;
      const next = pruneExpiredReactions(prev, now);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  const handleTakeSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const filename = `ntk-cam-studio-stage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    void saveDataUrlToDevice(dataUrl, filename);
  }, []);

  const handleToggleCamera = useCallback(async () => {
    if (media.cameraActive) {
      media.disableCamera();
    } else {
      const ok = await media.enableCamera();
      if (ok) {
        updateWebcam({ enabled: true });
      }
    }
  }, [media, updateWebcam]);

  const handleToggleMic = useCallback(async () => {
    if (media.micActive) {
      media.disableMic();
    } else {
      await media.enableMic();
    }
  }, [media]);

  const handleStartScreenShare = useCallback(async () => {
    const ok = await media.startScreenShare();
    if (ok) {
      updateStage({ sourceMode: 'screen' });
    }
  }, [media, updateStage]);

  const handleStopScreenShare = useCallback(() => {
    media.stopScreenShare();
    updateStage({ sourceMode: 'slides' });
  }, [media, updateStage]);

  const handlePrevSlide = useCallback(() => {
    setDeck((prev) => ({
      ...prev,
      activeIndex: Math.max(0, prev.activeIndex - 1),
    }));
  }, []);

  const handleNextSlide = useCallback(() => {
    setDeck((prev) => ({
      ...prev,
      activeIndex: Math.min(Math.max(0, prev.slides.length - 1), prev.activeIndex + 1),
    }));
  }, []);

  const handleSelectSlide = useCallback((index: number) => {
    setDeck((prev) => ({
      ...prev,
      activeIndex: Math.max(0, Math.min(Math.max(0, prev.slides.length - 1), index)),
    }));
  }, []);

  const handleAddSlides = useCallback((newSlides: SlideItem[]) => {
    setDeck((prev) => addSlidesToDeck(prev, newSlides));

    const slidesWithNotes = newSlides.filter((s) => s.notes && s.notes.trim().length > 0);
    if (slidesWithNotes.length > 0) {
      const formattedScript = newSlides
        .map((slide, idx) => {
          const header = `[Slide ${idx + 1}: ${slide.title}]`;
          return slide.notes?.trim() ? `${header}\n${slide.notes.trim()}` : header;
        })
        .join('\n\n');
      setTeleprompter((prev) => ({
        ...prev,
        script: formattedScript,
      }));
      setPrompterResetSignal((n) => n + 1);
    }
  }, []);

  const handleUpdateSlideAdjustments = useCallback(
    (index: number, patch: Partial<SlideAdjustments>) => {
      setDeck((prev) => updateSlideAdjustmentsInDeck(prev, index, patch));
    },
    []
  );

  const handleApplyAdjustmentsToAll = useCallback((adjustments: SlideAdjustments) => {
    setDeck((prev) => applyAdjustmentsToAllSlides(prev, adjustments));
  }, []);

  const handleDeleteSlide = useCallback((index: number) => {
    setDeck((prev) => deleteSlideFromDeck(prev, index));
  }, []);

  const handleMoveSlide = useCallback((fromIndex: number, toIndex: number) => {
    setDeck((prev) => moveSlideInDeck(prev, fromIndex, toIndex));
  }, []);

  // Keyboard shortcuts: modals Escape dismiss, '?' cheat sheet, Ctrl/Cmd+Z undo ink, slides, layouts, and tools
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
        if (quickGuideOpen) {
          setQuickGuideOpen(false);
          return;
        }
        if (mobileSheetTab) {
          setMobileSheetTab(null);
          return;
        }
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (recordedClip) return;

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setQuickGuideOpen(false);
        setShortcutsOpen((open) => !open);
        return;
      }

      if (shortcutsOpen || quickGuideOpen) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (annotations.length > 0) {
          e.preventDefault();
          handleUndoAnnotation();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'ArrowRight' && stageConfig.sourceMode === 'slides') {
        handleNextSlide();
      } else if (e.key === 'ArrowLeft' && stageConfig.sourceMode === 'slides') {
        handlePrevSlide();
      } else if (e.key === '1') {
        updateStage({ layout: 'pip' });
      } else if (e.key === '2') {
        updateStage({ layout: 'side-by-side' });
      } else if (e.key === '3') {
        updateStage({ layout: 'screen-only' });
      } else if (e.key === '4') {
        updateStage({ layout: 'camera-only' });
      } else if (e.key === 'v' || e.key === 'V' || e.key === 'Escape') {
        setAnnotationTool('select');
      } else if (e.key === 'p' || e.key === 'P') {
        setAnnotationTool('pen');
      } else if (e.key === 'h' || e.key === 'H') {
        setAnnotationTool('highlighter');
      } else if (e.key === 'a' || e.key === 'A') {
        setAnnotationTool('arrow');
      } else if (e.key === 'l' || e.key === 'L') {
        setAnnotationTool('laser');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    annotations.length,
    handleNextSlide,
    handlePrevSlide,
    handleUndoAnnotation,
    mobileSheetTab,
    quickGuideOpen,
    recordedClip,
    shortcutsOpen,
    stageConfig.sourceMode,
    updateStage,
  ]);

  const activeBannerMessage = media.permissionIssue?.message ?? recorderError;

  const handleRetryPermission = () => {
    if (!media.permissionIssue) return;
    const src = media.permissionIssue.source;
    media.dismissIssue();
    if (src === 'camera') void media.enableCamera();
    else if (src === 'microphone') void media.enableMic();
    else if (src === 'screen') void handleStartScreenShare();
  };

  const renderInspectorPanel = (tab: SidebarTab) => {
    if (tab === 'webcam') {
      return (
        <WebcamControls
          webcamConfig={webcamConfig}
          aspectRatio={stageConfig.aspectRatio}
          cameraActive={media.cameraActive}
          micActive={media.micActive}
          audioLevel={media.audioLevel}
          segmentationStatus={segmentationStatus}
          videoDevices={media.videoDevices}
          audioDevices={media.audioDevices}
          selectedVideoId={media.selectedVideoId}
          selectedAudioId={media.selectedAudioId}
          onChangeWebcam={updateWebcam}
          onToggleCamera={() => void handleToggleCamera()}
          onToggleMic={() => void handleToggleMic()}
          onSelectVideoDevice={media.setSelectedVideoId}
          onSelectAudioDevice={media.setSelectedAudioId}
        />
      );
    }

    if (tab === 'slides') {
      return (
        <SlideManager
          slides={slides}
          activeSlideIndex={activeSlideIndex}
          stageConfig={stageConfig}
          backdrops={BACKDROP_PRESETS}
          screenActive={media.screenActive}
          onSelectSlide={handleSelectSlide}
          onAddSlides={handleAddSlides}
          onDeleteSlide={handleDeleteSlide}
          onMoveSlide={handleMoveSlide}
          onUpdateSlideAdjustments={handleUpdateSlideAdjustments}
          onApplyAdjustmentsToAll={handleApplyAdjustmentsToAll}
          onChangeStage={updateStage}
          onStartScreenShare={handleStartScreenShare}
          onStopScreenShare={handleStopScreenShare}
        />
      );
    }

    if (tab === 'design') {
      return (
        <StudioDesignPanel
          design={stageDesign}
          aspectRatio={stageConfig.aspectRatio}
          onUpdateLowerThird={updateLowerThird}
          onAddTextOverlay={handleAddTextOverlay}
          onUpdateTextOverlay={handleUpdateTextOverlay}
          onDeleteTextOverlay={handleDeleteTextOverlay}
          onUpdateWatermark={updateWatermark}
        />
      );
    }

    return (
      <TeleprompterSidebarPanel
        settings={teleprompter}
        onUpdate={updateTeleprompter}
        onResetScroll={() => setPrompterResetSignal((n) => n + 1)}
      />
    );
  };

  return (
    <div
      className="h-[100dvh] w-screen flex flex-col bg-[#F3F5F9] dark:bg-[#0B0C0F] text-slate-900 dark:text-[#F4F5F7] overflow-hidden"
      data-recording-status={recorder.status}
      data-theme-preference={theme.preference}
      data-resolved-theme={theme.resolvedTheme}
    >
      {/* Responsive Top Studio Bar (Compact Native App Bar on Mobile, Full Studio Bar on Desktop) */}
      <header className="shrink-0 min-h-[52px] lg:h-14 pt-safe px-3 sm:px-4 md:px-6 border-b border-slate-200 dark:border-[#1F232D] bg-white dark:bg-[#101217] flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Wordmark */}
        <div className="font-display text-sm sm:text-base font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
          NTK Cam<span className="hidden sm:inline"> Studio</span>
        </div>

        {/* Zone 2: Slide Navigation / Source Context (Always visible on mobile & desktop!) */}
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 min-w-0">
          {stageConfig.sourceMode === 'slides' ? (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={handlePrevSlide}
                disabled={activeSlideIndex <= 0}
                aria-label="Previous slide"
                className="w-8 h-8 lg:w-7 lg:h-7 rounded-lg lg:rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#171A22] dark:hover:bg-[#222632] border border-slate-200 dark:border-[#272B35] text-slate-700 dark:text-slate-300 flex items-center justify-center disabled:opacity-30 transition-colors shrink-0"
              >
                <ChevronLeft className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              </button>
              <span
                data-testid="slide-counter"
                className="font-mono tabular-nums text-slate-800 dark:text-slate-200 min-w-[44px] sm:min-w-[54px] text-center whitespace-nowrap"
              >
                {slides.length > 0 ? `${activeSlideIndex + 1} / ${slides.length}` : '0 / 0'}
              </span>
              <button
                type="button"
                onClick={handleNextSlide}
                disabled={activeSlideIndex >= slides.length - 1}
                aria-label="Next slide"
                className="w-8 h-8 lg:w-7 lg:h-7 rounded-lg lg:rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#171A22] dark:hover:bg-[#222632] border border-slate-200 dark:border-[#272B35] text-slate-700 dark:text-slate-300 flex items-center justify-center disabled:opacity-30 transition-colors shrink-0"
              >
                <ChevronRight className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
              </button>
              {activeSlide && (
                <span className="hidden lg:inline text-slate-500 dark:text-slate-400 truncate max-w-[220px] pl-1">
                  · {activeSlide.title}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-700 dark:text-slate-300 truncate max-w-[180px] sm:max-w-[260px]">
              Screen · {media.screenActive ? media.screenShareInfo.sourceName : 'Not Sharing'}
            </span>
          )}
        </div>

        {/* Zone 3: Theme, Quick Guide, Teleprompter & Desktop Sidebar Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <ThemeSwitcher
            preference={theme.preference}
            resolvedTheme={theme.resolvedTheme}
            systemPrefersDark={theme.systemPrefersDark}
            onChangePreference={theme.setPreference}
          />

          <button
            type="button"
            data-testid="shortcuts-button"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            className="hidden lg:inline-flex h-9 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-[#171A22] dark:hover:bg-[#1F232E] border border-slate-200 dark:border-[#272B35] text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Keyboard className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
            <span>Shortcuts</span>
            <kbd className="px-1 py-0.5 rounded bg-white dark:bg-[#101217] border border-slate-300 dark:border-[#2E3442] font-mono text-[10px] leading-none text-slate-600 dark:text-slate-300">
              ?
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setQuickGuideOpen(true)}
            aria-label="Quick start guide"
            title="How to use NTK Cam Studio"
            className="h-9 px-2.5 sm:px-3 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-[#171A22] dark:hover:bg-[#1F232E] border border-slate-200 dark:border-[#272B35] text-xs font-medium text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden md:inline">Guide</span>
          </button>

          <button
            type="button"
            onClick={() => updateTeleprompter({ isFloatingOpen: !teleprompter.isFloatingOpen })}
            aria-label="Toggle presenter teleprompter"
            aria-pressed={teleprompter.isFloatingOpen}
            className={`h-9 px-2.5 sm:px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              teleprompter.isFloatingOpen
                ? 'bg-blue-50 dark:bg-blue-500/15 border-blue-400 dark:border-blue-500/50 text-blue-700 dark:text-blue-200'
                : 'bg-slate-100 hover:bg-slate-200/80 dark:bg-[#171A22] dark:hover:bg-[#1F232E] border-slate-200 dark:border-[#272B35] text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white'
            }`}
          >
            <ScrollText className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden sm:inline">Teleprompter</span>
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? 'Collapse studio sidebar' : 'Expand studio sidebar'}
            aria-expanded={sidebarOpen}
            className="hidden lg:flex h-9 w-9 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-[#171A22] dark:hover:bg-[#1F232E] border border-slate-200 dark:border-[#272B35] text-slate-700 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white items-center justify-center transition-colors shrink-0"
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-4 h-4" />
            ) : (
              <PanelRightOpen className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Studio Workspace */}
      <div className="flex-1 min-h-0 flex overflow-hidden relative">
        {/* Centerpiece Preview Stage */}
        <main className="relative flex-1 min-w-0 flex flex-col bg-[#F3F5F9] dark:bg-[#0B0C0F] overflow-hidden">
          {/* Permission / Error Notification Banner */}
          {activeBannerMessage && (
            <div
              role="alert"
              className="mx-3 lg:mx-4 mt-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/35 text-amber-900 dark:text-amber-100 flex items-center justify-between gap-2 text-xs z-20"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="leading-snug">{activeBannerMessage}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {media.permissionIssue && (
                  <button
                    type="button"
                    onClick={handleRetryPermission}
                    className="h-7 px-2.5 rounded bg-amber-200/80 hover:bg-amber-300/80 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 text-amber-950 dark:text-amber-100 font-medium transition-colors"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    media.dismissIssue();
                    setRecorderError(null);
                  }}
                  aria-label="Dismiss notification"
                  className="w-7 h-7 rounded hover:bg-amber-200/60 dark:hover:bg-white/10 text-amber-800 dark:text-amber-200 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Desktop Stage Quick-Action Dock (Annotate, Laser, Reactions, Snapshot) */}
          <StageToolbar
            activeTool={annotationTool}
            annotationColor={annotationColor}
            autoFadeInk={autoFadeInk}
            annotationCount={annotations.length}
            handRaised={stageDesign.handRaised}
            onSelectTool={setAnnotationTool}
            onSelectColor={setAnnotationColor}
            onToggleAutoFade={() => setAutoFadeInk((v) => !v)}
            onUndoAnnotation={handleUndoAnnotation}
            onClearAnnotations={handleClearAnnotations}
            onTriggerReaction={handleTriggerReaction}
            onToggleHandRaised={handleToggleHandRaised}
            onTakeSnapshot={handleTakeSnapshot}
          />

          {/* Presenter-Only Floating Teleprompter (Never Rendered to Canvas) */}
          <FloatingTeleprompter
            settings={teleprompter}
            resetSignal={prompterResetSignal}
            resolvedTheme={theme.resolvedTheme}
            onUpdate={updateTeleprompter}
            onClose={() => updateTeleprompter({ isFloatingOpen: false, isScrolling: false })}
          />

          {/* Real-Time Canvas Compositor */}
          <CanvasCompositor
            canvasRef={canvasRef}
            stageConfig={stageConfig}
            webcamConfig={webcamConfig}
            stageDesign={stageDesign}
            backdrop={activeBackdrop}
            activeSlide={activeSlide}
            slideIndex={activeSlideIndex}
            slideCount={slides.length}
            cameraStream={media.cameraStream}
            screenStream={media.screenStream}
            isRecording={recorder.status === 'recording'}
            annotationTool={annotationTool}
            annotationColor={annotationColor}
            autoFadeInk={autoFadeInk}
            annotations={annotations}
            reactions={reactions}
            onUpdateWebcamPosition={(x, y) => updateWebcam({ x, y })}
            onUpdateTextOverlayPosition={(id, x, y) => handleUpdateTextOverlay(id, { x, y })}
            onUpdateLowerThirdPosition={(x, y) => updateLowerThird({ x, y })}
            onUpdateWatermarkPosition={(x, y) => updateWatermark({ x, y })}
            onAddAnnotation={handleAddAnnotation}
            onPruneExpiredEffects={handlePruneExpiredEffects}
            onPrevSlide={handlePrevSlide}
            onNextSlide={handleNextSlide}
            onSegmentationStatusChange={setSegmentationStatus}
            paused={Boolean(recordedClip)}
            stageOverlayChildren={
              <>
                <ScreenShareOverlayIndicator
                  visible={stageConfig.sourceMode === 'screen'}
                  screenInfo={media.screenShareInfo}
                  onStartOrSwitchShare={() => void handleStartScreenShare()}
                  onStopShare={handleStopScreenShare}
                />
                <StageMicWaveform
                  micActive={media.micActive}
                  micAnalyser={media.micAnalyser}
                  audioLevel={media.audioLevel}
                  resolvedTheme={theme.resolvedTheme}
                  onToggleMic={() => void handleToggleMic()}
                />
              </>
            }
          />

          {/* Mobile Thumb-Friendly Quick Stage Actions (Layout, Draw, React, Photo) */}
          <MobileQuickStageRail
            activeTool={annotationTool}
            annotationColor={annotationColor}
            annotationCount={annotations.length}
            handRaised={stageDesign.handRaised}
            onSelectTool={setAnnotationTool}
            onSelectColor={setAnnotationColor}
            onUndoAnnotation={handleUndoAnnotation}
            onClearAnnotations={handleClearAnnotations}
            onTriggerReaction={handleTriggerReaction}
            onToggleHandRaised={handleToggleHandRaised}
            onOpenLayoutSheet={() => setMobileSheetTab('layout')}
            onTakeSnapshot={handleTakeSnapshot}
          />

          {/* 3-Second Pre-Recording Countdown Overlay (DOM-only, never burned into video) */}
          {recorder.status === 'countdown' && (
            <div
              data-testid="countdown-overlay"
              className="absolute inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4"
            >
              <div className="w-28 h-28 rounded-full bg-white/95 dark:bg-[#12141A]/95 border border-slate-200 dark:border-white/20 flex items-center justify-center shadow-2xl">
                <span className="font-mono text-6xl font-semibold tabular-nums text-slate-900 dark:text-white">
                  {recorder.countdown}
                </span>
              </div>
              <p className="text-sm font-medium text-white">Starting recording...</p>
              <button
                type="button"
                onClick={recorder.cancelCountdown}
                className="min-h-[44px] px-5 rounded-xl bg-white hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#252A36] border border-slate-200 dark:border-[#343A47] text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </main>

        {/* Desktop Collapsible Right Inspector Sidebar (Hidden on Mobile; Replaced by Native Bottom Sheet) */}
        {sidebarOpen && (
          <aside
            aria-label="Studio controls"
            className="hidden lg:flex w-[320px] shrink-0 border-l border-slate-200 dark:border-[#1F232D] bg-white dark:bg-[#101217] flex-col min-h-0"
          >
            {/* Sidebar Navigation Tabs */}
            <div
              role="tablist"
              aria-label="Inspector sections"
              className="grid grid-cols-4 gap-1 p-2 border-b border-slate-200 dark:border-[#1F232D] shrink-0"
            >
              {[
                { id: 'slides' as SidebarTab, label: 'Slides', icon: Layers },
                { id: 'webcam' as SidebarTab, label: 'Camera', icon: Camera },
                { id: 'design' as SidebarTab, label: 'Design', icon: Palette },
                { id: 'script' as SidebarTab, label: 'Script', icon: FileText },
              ].map(({ id, label, icon: Icon }) => {
                const selected = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(id)}
                    className={`h-9 px-1.5 rounded-lg text-[11px] font-medium inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                      selected
                        ? 'bg-slate-900 dark:bg-[#222734] text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar Active Panel */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 studio-scroll">
              {renderInspectorPanel(activeTab)}
            </div>
          </aside>
        )}
      </div>

      {/* Desktop Bottom Recording, Layout & Aspect Ratio Toolbar */}
      <RecorderEngine
        status={recorder.status}
        elapsedSec={recorder.elapsedSec}
        layout={stageConfig.layout}
        aspectRatio={stageConfig.aspectRatio}
        resolution={stageConfig.resolution}
        cameraActive={media.cameraActive}
        micActive={media.micActive}
        audioLevel={media.audioLevel}
        onStartRecording={recorder.startRecording}
        onCancelCountdown={recorder.cancelCountdown}
        onPauseRecording={recorder.pauseRecording}
        onResumeRecording={recorder.resumeRecording}
        onStopRecording={recorder.stopRecording}
        onChangeLayout={(layout: LayoutMode) => updateStage({ layout })}
        onChangeAspectRatio={(aspectRatio: AspectRatio) => updateStage({ aspectRatio })}
        onChangeResolution={(resolution: VideoResolutionPreset) => updateStage({ resolution })}
        onToggleCamera={() => void handleToggleCamera()}
        onToggleMic={() => void handleToggleMic()}
      />

      {/* Mobile Native Zoom/Loom Bottom Dock */}
      <MobileBottomDock
        status={recorder.status}
        elapsedSec={recorder.elapsedSec}
        cameraActive={media.cameraActive}
        micActive={media.micActive}
        audioLevel={media.audioLevel}
        activeSheet={mobileSheetTab}
        onToggleCamera={() => void handleToggleCamera()}
        onToggleMic={() => void handleToggleMic()}
        onStartRecording={recorder.startRecording}
        onCancelCountdown={recorder.cancelCountdown}
        onPauseRecording={recorder.pauseRecording}
        onResumeRecording={recorder.resumeRecording}
        onStopRecording={recorder.stopRecording}
        onOpenSheet={(tab) => setMobileSheetTab(tab)}
      />

      {/* Mobile Native Slide-Up Studio Controls Bottom Sheet */}
      <MobileBottomSheet
        activeTab={mobileSheetTab}
        onSelectTab={setMobileSheetTab}
        onClose={() => setMobileSheetTab(null)}
      >
        {mobileSheetTab === 'layout' ? (
          <MobileLayoutPicker
            layout={stageConfig.layout}
            aspectRatio={stageConfig.aspectRatio}
            resolution={stageConfig.resolution}
            isRecordingOrPaused={recorder.status === 'recording' || recorder.status === 'paused'}
            themePreference={theme.preference}
            systemPrefersDark={theme.systemPrefersDark}
            onChangeLayout={(layout) => updateStage({ layout })}
            onChangeAspectRatio={(aspectRatio) => updateStage({ aspectRatio })}
            onChangeResolution={(resolution) => updateStage({ resolution })}
            onChangeThemePreference={theme.setPreference}
          />
        ) : mobileSheetTab ? (
          renderInspectorPanel(mobileSheetTab)
        ) : null}
      </MobileBottomSheet>

      {/* Novice-Friendly Quick Start Guide */}
      <QuickGuideModal
        open={quickGuideOpen}
        onClose={() => setQuickGuideOpen(false)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      {/* Keyboard Shortcuts Cheat Sheet Modal ('?' key) */}
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Post-Recording Preview, Rule-Based Cleanup & Export Modal */}
      <ExportModal
        key={recordedClip?.createdAt ?? 'empty'}
        clip={recordedClip}
        onExportComplete={() => setClipExported(true)}
        onClose={() => setRecordedClip(null)}
      />
    </div>
  );
}
