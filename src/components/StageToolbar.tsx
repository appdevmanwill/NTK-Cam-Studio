import React, { useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  Eraser,
  Hand,
  Highlighter,
  MousePointer2,
  PenTool,
  Radio,
  Smile,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type { AnnotationTool } from '../types/studio';
import { ANNOTATION_COLORS, LIVE_REACTION_EMOJIS } from '../utils/studioEffects';

interface StageToolbarProps {
  activeTool: AnnotationTool;
  annotationColor: string;
  autoFadeInk: boolean;
  annotationCount: number;
  handRaised: boolean;
  onSelectTool: (tool: AnnotationTool) => void;
  onSelectColor: (color: string) => void;
  onToggleAutoFade: () => void;
  onUndoAnnotation: () => void;
  onClearAnnotations: () => void;
  onTriggerReaction: (emoji: string) => void;
  onToggleHandRaised: () => void;
  onTakeSnapshot: () => void;
}

const TOOL_ITEMS: Array<{
  id: AnnotationTool;
  label: string;
  shortLabel: string;
  shortcut: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'select', label: 'Select & Drag', shortLabel: 'Select', shortcut: 'V', icon: MousePointer2 },
  { id: 'pen', label: 'Draw Pen', shortLabel: 'Pen', shortcut: 'P', icon: PenTool },
  { id: 'highlighter', label: 'Highlighter', shortLabel: 'Highlight', shortcut: 'H', icon: Highlighter },
  { id: 'arrow', label: 'Draw Arrow', shortLabel: 'Arrow', shortcut: 'A', icon: ArrowUpRight },
  { id: 'laser', label: 'Laser Pointer', shortLabel: 'Laser', shortcut: 'L', icon: Radio },
];

export const StageToolbar: React.FC<StageToolbarProps> = ({
  activeTool,
  annotationColor,
  autoFadeInk,
  annotationCount,
  handRaised,
  onSelectTool,
  onSelectColor,
  onToggleAutoFade,
  onUndoAnnotation,
  onClearAnnotations,
  onTriggerReaction,
  onToggleHandRaised,
  onTakeSnapshot,
}) => {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [snapshotFlash, setSnapshotFlash] = useState(false);

  const isDrawingTool = activeTool !== 'select';

  const handleSnapshotClick = () => {
    onTakeSnapshot();
    setSnapshotFlash(true);
    window.setTimeout(() => setSnapshotFlash(false), 900);
  };

  return (
    <div
      aria-label="Stage annotation and reaction tools"
      className="hidden lg:flex shrink-0 px-4 pt-2.5 pb-0.5 flex-wrap items-center justify-center gap-2 z-20"
    >
      {/* Loom / Zoom Live Annotation Tools */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-white/95 dark:bg-[#101217]/95 border border-slate-200 dark:border-[#242834] shadow-sm">
        <div role="group" aria-label="Canvas drawing tools" className="flex items-center gap-0.5">
          {TOOL_ITEMS.map(({ id, label, shortLabel, shortcut, icon: Icon }) => {
            const active = activeTool === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTool(id)}
                aria-label={`${label} (${shortcut})`}
                aria-pressed={active}
                title={`${label} (${shortcut})`}
                className={`h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Ink Color Swatches & Loom Auto-Fade Toggle (shown whenever drawing or strokes exist) */}
        {(isDrawingTool || annotationCount > 0) && (
          <>
            <div className="w-px h-5 bg-slate-200 dark:bg-[#242834] mx-1" aria-hidden="true" />
            <div role="group" aria-label="Annotation ink color" className="flex items-center gap-1 px-0.5">
              {ANNOTATION_COLORS.map((c) => {
                const selected = annotationColor === c.value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectColor(c.value)}
                    aria-label={`Ink color ${c.label}`}
                    aria-pressed={selected}
                    title={c.label}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      selected
                        ? 'border-slate-900 dark:border-white scale-110 ring-2 ring-blue-500/50'
                        : 'border-slate-300 dark:border-white/25 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                );
              })}
            </div>

            <button
              type="button"
              onClick={onToggleAutoFade}
              aria-pressed={autoFadeInk}
              title="Auto-fade drawn strokes after 4 seconds"
              className={`h-8 px-2 rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
                autoFadeInk
                  ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-400 dark:border-amber-500/40'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.05]'
              }`}
            >
              <Sparkles className="w-3 h-3" />
              <span>Fade Ink</span>
            </button>
          </>
        )}

        {annotationCount > 0 && (
          <>
            <div className="w-px h-5 bg-slate-200 dark:bg-[#242834] mx-0.5" aria-hidden="true" />
            <button
              type="button"
              onClick={onUndoAnnotation}
              aria-label="Undo last stroke"
              title="Undo last stroke (Ctrl+Z)"
              className="h-8 w-8 rounded-md text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] inline-flex items-center justify-center transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClearAnnotations}
              aria-label="Clear annotations"
              title="Clear all strokes"
              className="h-8 px-2 rounded-md text-[11px] font-medium text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 hover:bg-red-50 dark:hover:bg-red-500/15 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </>
        )}
      </div>

      {/* Zoom / Loom Live Reactions, Raise Hand & Instant Stage Snapshot */}
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-white/95 dark:bg-[#101217]/95 border border-slate-200 dark:border-[#242834] shadow-sm relative">
        <button
          type="button"
          onClick={() => setReactionsOpen((o) => !o)}
          aria-expanded={reactionsOpen}
          aria-label="Live stage reactions"
          className={`h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            reactionsOpen
              ? 'bg-slate-200 dark:bg-[#252A36] text-slate-900 dark:text-white'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
          }`}
        >
          <Smile className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
          <span>React</span>
        </button>

        {reactionsOpen && (
          <div
            role="group"
            aria-label="Trigger live reaction on canvas"
            className="flex items-center gap-0.5 pl-0.5 pr-1 border-l border-slate-200 dark:border-[#242834]"
          >
            {LIVE_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onTriggerReaction(emoji)}
                aria-label={`Send ${emoji} reaction`}
                className="w-8 h-8 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 active:scale-90 text-base flex items-center justify-center transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onToggleHandRaised}
          aria-pressed={handRaised}
          aria-label={handRaised ? 'Lower hand badge' : 'Raise hand badge'}
          title="Toggle Zoom-style Raise Hand badge on canvas"
          className={`h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            handRaised
              ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-400 dark:border-amber-500/45'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{handRaised ? 'Hand Up' : 'Raise Hand'}</span>
        </button>

        <div className="w-px h-5 bg-slate-200 dark:bg-[#242834] mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={handleSnapshotClick}
          aria-label="Take HD stage snapshot"
          title="Download PNG snapshot of the current stage"
          className={`h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            snapshotFlash
              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border border-emerald-400 dark:border-emerald-500/40'
              : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.05]'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span className="hidden md:inline">{snapshotFlash ? 'Saved PNG' : 'Snapshot'}</span>
        </button>
      </div>
    </div>
  );
};
