import React, { useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  CameraOff,
  Columns2,
  Eraser,
  FileText,
  Hand,
  HelpCircle,
  Highlighter,
  Keyboard,
  Layers,
  LayoutGrid,
  Mic,
  MicOff,
  Monitor,
  MousePointer2,
  Palette,
  Pause,
  PenTool,
  PictureInPicture2,
  Play,
  Radio,
  SlidersHorizontal,
  Smile,
  Square,
  Undo2,
  User,
  X,
} from 'lucide-react';
import type {
  AnnotationTool,
  AspectRatio,
  LayoutMode,
  RecordingStatus,
  SidebarTab,
  ThemePreference,
  VideoResolutionPreset,
} from '../types/studio';
import { formatTimecode, getCanvasDimensions } from '../utils/compositorMath';
import { ANNOTATION_COLORS, LIVE_REACTION_EMOJIS } from '../utils/studioEffects';
import { RESOLUTION_PRESET_OPTIONS } from '../utils/videoExporter';
import { ThemeSegmentedControl } from './ThemeSwitcher';

export type MobileSheetTab = SidebarTab | 'layout';

interface MobileQuickStageRailProps {
  activeTool: AnnotationTool;
  annotationColor: string;
  annotationCount: number;
  handRaised: boolean;
  onSelectTool: (tool: AnnotationTool) => void;
  onSelectColor: (color: string) => void;
  onUndoAnnotation: () => void;
  onClearAnnotations: () => void;
  onTriggerReaction: (emoji: string) => void;
  onToggleHandRaised: () => void;
  onOpenLayoutSheet: () => void;
  onTakeSnapshot: () => void;
}

/**
 * Compact thumb-friendly quick action rail shown right below the live stage on mobile phones.
 * Keeps the video canvas clean and spacious while giving 1-tap access to Draw, React, Layout, and Photo.
 */
export const MobileQuickStageRail: React.FC<MobileQuickStageRailProps> = ({
  activeTool,
  annotationColor,
  annotationCount,
  handRaised,
  onSelectTool,
  onSelectColor,
  onUndoAnnotation,
  onClearAnnotations,
  onTriggerReaction,
  onToggleHandRaised,
  onOpenLayoutSheet,
  onTakeSnapshot,
}) => {
  const [drawTrayOpen, setDrawTrayOpen] = useState(false);
  const [reactTrayOpen, setReactTrayOpen] = useState(false);
  const [snapDone, setSnapDone] = useState(false);

  const handleToggleDraw = () => {
    const next = !drawTrayOpen;
    setDrawTrayOpen(next);
    setReactTrayOpen(false);
    if (next && activeTool === 'select') {
      onSelectTool('pen');
    } else if (!next) {
      onSelectTool('select');
    }
  };

  const handleToggleReact = () => {
    setReactTrayOpen((v) => !v);
    setDrawTrayOpen(false);
  };

  const handleSnap = () => {
    onTakeSnapshot();
    setSnapDone(true);
    window.setTimeout(() => setSnapDone(false), 900);
  };

  return (
    <div className="lg:hidden shrink-0 px-3 pb-2 space-y-2 z-20">
      {/* Contextual Draw / Laser Sub-Tray */}
      {drawTrayOpen && (
        <div
          aria-label="Mobile drawing tools"
          className="p-2 rounded-2xl bg-white/95 dark:bg-[#13161E]/95 border border-slate-200 dark:border-[#272C39] backdrop-blur-md space-y-2 shadow-lg"
        >
          <div className="flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
            {[
              { id: 'select' as AnnotationTool, label: 'Move', icon: MousePointer2 },
              { id: 'pen' as AnnotationTool, label: 'Pen', icon: PenTool },
              { id: 'highlighter' as AnnotationTool, label: 'Mark', icon: Highlighter },
              { id: 'arrow' as AnnotationTool, label: 'Arrow', icon: ArrowUpRight },
              { id: 'laser' as AnnotationTool, label: 'Laser', icon: Radio },
            ].map(({ id, label, icon: Icon }) => {
              const active = activeTool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTool(id)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-white/[0.07]">
            <div className="flex items-center gap-2">
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectColor(c.value)}
                  aria-label={`Ink color ${c.label}`}
                  className={`w-7 h-7 rounded-full border-2 transition-transform ${
                    annotationColor === c.value
                      ? 'border-slate-900 dark:border-white scale-110'
                      : 'border-slate-300 dark:border-white/25'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>

            {annotationCount > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onUndoAnnotation}
                  aria-label="Undo stroke"
                  className="min-w-[38px] min-h-[38px] rounded-xl bg-slate-100 dark:bg-[#1D212D] text-slate-700 dark:text-slate-200 flex items-center justify-center"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onClearAnnotations}
                  aria-label="Clear drawing"
                  className="min-h-[38px] px-2.5 rounded-xl bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-200 text-xs font-medium inline-flex items-center gap-1"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  Clear
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contextual Reactions Sub-Tray */}
      {reactTrayOpen && (
        <div
          aria-label="Mobile live reactions"
          className="px-2.5 py-2 rounded-2xl bg-white/95 dark:bg-[#13161E]/95 border border-slate-200 dark:border-[#272C39] backdrop-blur-md flex items-center justify-between gap-1 shadow-lg"
        >
          <div className="flex items-center gap-1">
            {LIVE_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onTriggerReaction(emoji)}
                aria-label={`Send ${emoji} reaction`}
                className="w-10 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 active:scale-90 text-xl flex items-center justify-center transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onToggleHandRaised}
            aria-pressed={handRaised}
            className={`min-h-[40px] px-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
              handRaised
                ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-400 dark:border-amber-500/45'
                : 'bg-slate-100 dark:bg-[#1D212D] text-slate-700 dark:text-slate-200'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span>{handRaised ? 'Lower' : 'Hand'}</span>
          </button>
        </div>
      )}

      {/* 4 Simple Thumb-Friendly Stage Action Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={onOpenLayoutSheet}
          className="min-h-[44px] px-2 rounded-xl bg-white active:bg-slate-100 dark:bg-[#141720] dark:active:bg-[#1E2330] border border-slate-200 dark:border-[#242936] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs dark:shadow-none"
        >
          <LayoutGrid className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>Layout</span>
        </button>

        <button
          type="button"
          onClick={handleToggleDraw}
          aria-pressed={drawTrayOpen || activeTool !== 'select'}
          className={`min-h-[44px] px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs dark:shadow-none ${
            drawTrayOpen || activeTool !== 'select'
              ? 'bg-blue-50 border-blue-500 text-blue-800 dark:bg-blue-600/20 dark:border-blue-500/60 dark:text-blue-100'
              : 'bg-white active:bg-slate-100 border-slate-200 text-slate-700 dark:bg-[#141720] dark:active:bg-[#1E2330] dark:border-[#242936] dark:text-slate-200'
          }`}
        >
          <PenTool className="w-4 h-4 shrink-0" />
          <span>Draw</span>
        </button>

        <button
          type="button"
          onClick={handleToggleReact}
          aria-pressed={reactTrayOpen || handRaised}
          className={`min-h-[44px] px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs dark:shadow-none ${
            reactTrayOpen || handRaised
              ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/50 dark:text-amber-100'
              : 'bg-white active:bg-slate-100 border-slate-200 text-slate-700 dark:bg-[#141720] dark:active:bg-[#1E2330] dark:border-[#242936] dark:text-slate-200'
          }`}
        >
          <Smile className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
          <span>React</span>
        </button>

        <button
          type="button"
          onClick={handleSnap}
          className={`min-h-[44px] px-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs dark:shadow-none ${
            snapDone
              ? 'bg-emerald-50 border-emerald-400 text-emerald-800 dark:bg-emerald-500/20 dark:border-emerald-500/50 dark:text-emerald-100'
              : 'bg-white active:bg-slate-100 border-slate-200 text-slate-700 dark:bg-[#141720] dark:active:bg-[#1E2330] dark:border-[#242936] dark:text-slate-200'
          }`}
        >
          <Camera className="w-4 h-4 shrink-0" />
          <span>{snapDone ? 'Saved' : 'Photo'}</span>
        </button>
      </div>
    </div>
  );
};

interface MobileBottomDockProps {
  status: RecordingStatus;
  elapsedSec: number;
  cameraActive: boolean;
  micActive: boolean;
  audioLevel: number;
  activeSheet: MobileSheetTab | null;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onStartRecording: () => void;
  onCancelCountdown: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  onOpenSheet: (tab: MobileSheetTab) => void;
}

/**
 * Native mobile bottom navigation & recording dock.
 * Keeps every primary action (Mic, Video, Record, Slides, Studio) in the natural thumb zone.
 */
export const MobileBottomDock: React.FC<MobileBottomDockProps> = ({
  status,
  elapsedSec,
  cameraActive,
  micActive,
  audioLevel,
  activeSheet,
  onToggleCamera,
  onToggleMic,
  onStartRecording,
  onCancelCountdown,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onOpenSheet,
}) => {
  const isRecordingOrPaused = status === 'recording' || status === 'paused';

  return (
    <nav
      aria-label="Mobile studio controls"
      className="lg:hidden shrink-0 border-t border-slate-200 dark:border-[#1F232D] bg-white/95 dark:bg-[#101217]/95 backdrop-blur-md px-2 pt-1.5 pb-safe z-30"
    >
      {isRecordingOrPaused ? (
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div
            data-testid="mobile-recording-timer"
            className="min-h-[44px] px-3 rounded-xl bg-red-50 dark:bg-[#181B24] border border-red-300 dark:border-red-500/40 inline-flex items-center gap-2 text-xs font-mono tabular-nums text-red-950 dark:text-white"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
              }`}
              aria-hidden="true"
            />
            <span>{formatTimecode(elapsedSec)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMic}
              aria-label={micActive ? 'Mute microphone' : 'Unmute microphone'}
              className={`min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center ${
                micActive
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/50 dark:text-emerald-300'
                  : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-[#181B24] dark:border-[#272B35] dark:text-slate-400'
              }`}
            >
              {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>

            {status === 'recording' ? (
              <button
                type="button"
                onClick={onPauseRecording}
                aria-label="Pause recording"
                className="min-h-[44px] px-3.5 rounded-xl bg-slate-100 dark:bg-[#1D212D] border border-slate-300 dark:border-[#323846] text-xs font-medium text-slate-800 dark:text-white inline-flex items-center gap-1.5"
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={onResumeRecording}
                aria-label="Resume recording"
                className="min-h-[44px] px-3.5 rounded-xl bg-blue-600 text-xs font-medium text-white inline-flex items-center gap-1.5"
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}

            <button
              type="button"
              onClick={onStopRecording}
              aria-label="Stop recording"
              className="min-h-[44px] px-4 rounded-xl bg-[#E5484D] text-xs font-semibold text-white inline-flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 items-center gap-1">
          {/* 1. Mic */}
          <button
            type="button"
            onClick={onToggleMic}
            aria-label={micActive ? 'Mute microphone' : 'Turn on microphone'}
            aria-pressed={micActive}
            className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 active:bg-slate-100 dark:active:bg-white/[0.06] transition-colors"
          >
            <span
              className={`w-6 h-6 flex items-center justify-center relative ${
                micActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {micActive ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              {micActive && audioLevel > 0.15 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400"
                />
              )}
            </span>
            <span
              className={`text-[11px] font-medium ${
                micActive
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {micActive ? 'Mic On' : 'Mic Off'}
            </span>
          </button>

          {/* 2. Camera */}
          <button
            type="button"
            onClick={onToggleCamera}
            aria-label={cameraActive ? 'Turn off camera' : 'Turn on camera'}
            aria-pressed={cameraActive}
            className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 active:bg-slate-100 dark:active:bg-white/[0.06] transition-colors"
          >
            <span
              className={
                cameraActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }
            >
              {cameraActive ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
            </span>
            <span
              className={`text-[11px] font-medium ${
                cameraActive
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {cameraActive ? 'Video On' : 'Video'}
            </span>
          </button>

          {/* 3. Center Record Shutter */}
          <div className="flex flex-col items-center justify-center">
            {status === 'countdown' ? (
              <button
                type="button"
                onClick={onCancelCountdown}
                aria-label="Cancel countdown"
                className="w-13 h-13 rounded-full bg-slate-200 dark:bg-[#242834] border-2 border-slate-500 dark:border-slate-400 text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-center active:scale-95 transition-transform"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartRecording}
                aria-label="Start Recording"
                className="w-13 h-13 rounded-full border-[3px] border-slate-900/85 dark:border-white/85 p-1 flex items-center justify-center shadow-[0_6px_20px_rgba(229,72,77,0.35)] active:scale-95 transition-transform"
              >
                <span className="w-full h-full rounded-full bg-[#E5484D]" />
              </button>
            )}
          </div>

          {/* 4. Slides Bottom Sheet */}
          <button
            type="button"
            onClick={() => onOpenSheet('slides')}
            aria-pressed={activeSheet === 'slides'}
            className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 active:bg-slate-100 dark:active:bg-white/[0.06] transition-colors"
          >
            <Layers
              className={`w-5 h-5 ${
                activeSheet === 'slides'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            />
            <span
              className={`text-[11px] font-medium ${
                activeSheet === 'slides'
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Slides
            </span>
          </button>

          {/* 5. Studio Controls Bottom Sheet */}
          <button
            type="button"
            onClick={() => onOpenSheet('webcam')}
            aria-pressed={activeSheet !== null && activeSheet !== 'slides'}
            className="min-h-[52px] rounded-xl flex flex-col items-center justify-center gap-1 active:bg-slate-100 dark:active:bg-white/[0.06] transition-colors"
          >
            <SlidersHorizontal
              className={`w-5 h-5 ${
                activeSheet !== null && activeSheet !== 'slides'
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            />
            <span
              className={`text-[11px] font-medium ${
                activeSheet !== null && activeSheet !== 'slides'
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Studio
            </span>
          </button>
        </div>
      )}
    </nav>
  );
};

interface MobileLayoutPickerProps {
  layout: LayoutMode;
  aspectRatio: AspectRatio;
  resolution: VideoResolutionPreset;
  isRecordingOrPaused: boolean;
  themePreference: ThemePreference;
  systemPrefersDark: boolean;
  onChangeLayout: (layout: LayoutMode) => void;
  onChangeAspectRatio: (ratio: AspectRatio) => void;
  onChangeResolution: (resolution: VideoResolutionPreset) => void;
  onChangeThemePreference: (next: ThemePreference) => void;
}

/**
 * Novice-friendly visual Layout, Video Shape, Resolution & Theme selector rendered inside the mobile bottom sheet.
 */
export const MobileLayoutPicker: React.FC<MobileLayoutPickerProps> = ({
  layout,
  aspectRatio,
  resolution,
  isRecordingOrPaused,
  themePreference,
  systemPrefersDark,
  onChangeLayout,
  onChangeAspectRatio,
  onChangeResolution,
  onChangeThemePreference,
}) => {
  const layouts: Array<{
    id: LayoutMode;
    title: string;
    desc: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    {
      id: 'pip',
      title: 'Slides + Bubble',
      desc: 'Classic floating camera',
      icon: PictureInPicture2,
    },
    {
      id: 'side-by-side',
      title: 'Split View',
      desc: 'Slides and camera stacked cleanly',
      icon: Columns2,
    },
    {
      id: 'screen-only',
      title: 'Slides Only',
      desc: 'Hide camera for full slide focus',
      icon: Monitor,
    },
    {
      id: 'camera-only',
      title: 'Camera Only',
      desc: 'Full-screen talking head',
      icon: User,
    },
  ];

  const ratios: Array<{ id: AspectRatio; label: string; useCase: string }> = [
    { id: '16:9', label: '16:9 Wide', useCase: 'YouTube & Presentations' },
    { id: '9:16', label: '9:16 Vertical', useCase: 'Phone, Reels & Shorts' },
    { id: '1:1', label: '1:1 Square', useCase: 'LinkedIn & Feeds' },
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
          How should your video look?
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {layouts.map(({ id, title, desc, icon: Icon }) => {
            const active = layout === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeLayout(id)}
                aria-pressed={active}
                className={`p-3 rounded-xl border text-left space-y-1.5 transition-colors ${
                  active
                    ? 'bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-600/15 dark:border-blue-500/70 dark:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-[#161922] dark:border-[#272C38] dark:text-slate-300'
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${
                    active
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                <div className="text-xs font-semibold">{title}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {desc}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
            Video Shape
          </h3>
          {isRecordingOrPaused && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Stop recording to switch
            </span>
          )}
        </div>
        <div className="space-y-2">
          {ratios.map((r) => {
            const active = aspectRatio === r.id;
            return (
              <button
                key={r.id}
                type="button"
                disabled={isRecordingOrPaused}
                onClick={() => onChangeAspectRatio(r.id)}
                aria-pressed={active}
                className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between transition-colors disabled:opacity-45 ${
                  active
                    ? 'bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-600/15 dark:border-blue-500/70 dark:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-[#161922] dark:border-[#272C38] dark:text-slate-300'
                }`}
              >
                <span className="text-xs font-semibold">{r.label}</span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{r.useCase}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
            Recording Size (Quality)
          </h3>
          {isRecordingOrPaused && (
            <span className="text-[11px] text-amber-700 dark:text-amber-300">
              Stop recording to switch
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="Mobile recording resolution"
          className="grid grid-cols-3 gap-2"
        >
          {RESOLUTION_PRESET_OPTIONS.map((opt) => {
            const active = resolution === opt.id;
            const dims = getCanvasDimensions(aspectRatio, opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                disabled={isRecordingOrPaused}
                onClick={() => onChangeResolution(opt.id)}
                aria-pressed={active}
                className={`min-h-[54px] px-2 py-2 rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 transition-colors disabled:opacity-45 ${
                  active
                    ? 'bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-600/15 dark:border-blue-500/70 dark:text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-[#161922] dark:border-[#272C38] dark:text-slate-300'
                }`}
              >
                <span className="text-xs font-semibold font-mono">{opt.shortLabel}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {dims.width}×{dims.height}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="h-px bg-slate-200 dark:bg-[#222630]" />

      {/* App Appearance / Theme Switcher */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 tracking-wide">
            App Theme
          </h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            Default: Device ({systemPrefersDark ? 'Dark' : 'Light'})
          </span>
        </div>
        <ThemeSegmentedControl
          preference={themePreference}
          systemPrefersDark={systemPrefersDark}
          onChangePreference={onChangeThemePreference}
        />
      </section>
    </div>
  );
};

interface MobileBottomSheetProps {
  activeTab: MobileSheetTab | null;
  onSelectTab: (tab: MobileSheetTab) => void;
  onClose: () => void;
  children: React.ReactNode;
}

const SHEET_TABS: Array<{
  id: MobileSheetTab;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'slides', label: 'Slides', icon: Layers },
  { id: 'layout', label: 'Layout', icon: LayoutGrid },
  { id: 'webcam', label: 'Camera', icon: Camera },
  { id: 'design', label: 'Design', icon: Palette },
  { id: 'script', label: 'Script', icon: FileText },
];

export const MobileBottomSheet: React.FC<MobileBottomSheetProps> = ({
  activeTab,
  onSelectTab,
  onClose,
  children,
}) => {
  if (!activeTab) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Studio settings sheet"
      className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-slate-950/55 dark:bg-black/60 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        data-testid="mobile-studio-sheet"
        className="w-full max-h-[82dvh] rounded-t-3xl bg-white dark:bg-[#101217] border-t border-slate-200 dark:border-[#272C38] shadow-[0_-20px_50px_rgba(15,23,42,0.22)] dark:shadow-[0_-20px_50px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Native Drag Handle & Sheet Header */}
        <div className="shrink-0 pt-2.5 px-4 pb-2 border-b border-slate-200 dark:border-[#1F232D] space-y-2.5">
          <div
            className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600/80 mx-auto"
            aria-hidden="true"
          />

          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Studio Controls
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
            >
              Done
            </button>
          </div>

          {/* 5 Clear Single-Line Sheet Tabs */}
          <div
            role="tablist"
            aria-label="Mobile studio sections"
            className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#171A23] border border-slate-200 dark:border-[#242936]"
          >
            {SHEET_TABS.map(({ id, label, icon: Icon }) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onSelectTab(id)}
                  className={`min-h-[40px] px-1 rounded-lg flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-white dark:bg-[#262C3C] text-slate-900 dark:text-white shadow-xs dark:shadow-none'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Sheet Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-safe studio-scroll">{children}</div>
      </div>
    </div>
  );
};

interface QuickGuideModalProps {
  open: boolean;
  onClose: () => void;
  onOpenShortcuts?: () => void;
}

/**
 * Friendly 4-step quick guide for novices, opened on demand via the Guide button.
 */
export const QuickGuideModal: React.FC<QuickGuideModalProps> = ({
  open,
  onClose,
  onOpenShortcuts,
}) => {
  if (!open) return null;

  const steps = [
    {
      num: '1',
      title: 'Add Slides or Share Screen',
      desc: 'Upload a PowerPoint (.pptx), PDF, or images—or create a slide from a template. Tune slide Brightness, Contrast, and Saturation right inside the Slides tab.',
    },
    {
      num: '2',
      title: 'Frame Camera, Lower-Third & Watermark',
      desc: 'Turn on Mic and Camera, blur or remove your background, or enable Auto-Center to stay centered automatically. Drag your camera bubble, presenter lower-third, and watermark anywhere on stage.',
    },
    {
      num: '3',
      title: 'Present with Resizable Teleprompter & Tools',
      desc: 'Resize or drag the hidden Teleprompter (S/M/L presets or corner handles) so it never blocks slide buttons. Switch Light, Dark, or Auto (PC/Mobile) theme anytime.',
    },
    {
      num: '4',
      title: 'Auto-Clean Silences & Export MP4 / WebM',
      desc: 'Stop recording to open the rule-based editor: automatically cut pauses and repeated takes without AI, fine-tune cuts, pick 4K–360p size, and download MP4, WebM, MKV, GIF, or WAV.',
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-guide-title"
      className="fixed inset-0 z-50 bg-slate-950/65 dark:bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        data-testid="quick-guide-modal"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#12151D] border border-slate-200 dark:border-[#272C38] shadow-2xl overflow-hidden pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#222632]">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 id="quick-guide-title" className="text-sm font-semibold text-slate-900 dark:text-white">
              NTK Cam Studio Quick Guide
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick guide"
            className="w-9 h-9 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {steps.map((step) => (
            <div key={step.num} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-600/20 border border-blue-200 dark:border-blue-500/40 text-blue-700 dark:text-blue-300 font-mono text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5">
                {step.num}
              </div>
              <div className="space-y-0.5">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white">{step.title}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 pt-1">
            {onOpenShortcuts && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="min-h-[44px] px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 dark:bg-[#1A1D26] dark:hover:bg-[#232734] border border-slate-200 dark:border-[#2C3140] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Keyboard className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                Shortcuts (?)
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors"
            >
              Got It — Back to Studio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
