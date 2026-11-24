import React, { useEffect, useRef, useState } from 'react';
import {
  EyeOff,
  GripHorizontal,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import type { ResolvedTheme } from '../types/studio';
import { clampTeleprompterRect } from '../utils/studioEffects';

export interface TeleprompterSettings {
  script: string;
  fontSize: number;
  scrollSpeed: number; // pixels per second
  isScrolling: boolean;
  isFloatingOpen: boolean;
  opacity: number;
}

interface TeleprompterSidebarPanelProps {
  settings: TeleprompterSettings;
  onUpdate: (patch: Partial<TeleprompterSettings>) => void;
  onResetScroll: () => void;
}

export const TeleprompterSidebarPanel: React.FC<TeleprompterSidebarPanelProps> = ({
  settings,
  onUpdate,
  onResetScroll,
}) => {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-[#161920] border border-slate-200 dark:border-[#272B35]">
        <EyeOff className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Presenter-only notes. Your teleprompter stays visible to you and is never rendered onto the recorded video canvas.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onUpdate({ isFloatingOpen: !settings.isFloatingOpen })}
        className={`w-full h-10 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition-colors ${
          settings.isFloatingOpen
            ? 'bg-blue-50 border-blue-400 text-blue-700 hover:bg-blue-100/70 dark:bg-blue-500/15 dark:border-blue-500/50 dark:text-blue-200 dark:hover:bg-blue-500/20'
            : 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
        }`}
      >
        <SquareArrowOutUpRight className="w-3.5 h-3.5" />
        {settings.isFloatingOpen ? 'Hide Floating Prompter' : 'Open Floating Prompter'}
      </button>

      {/* Auto-scroll playback controls */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdate({
                isScrolling: !settings.isScrolling,
                isFloatingOpen: true,
              })
            }
            className={`flex-1 h-9 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
              settings.isScrolling
                ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-500/15 dark:border-amber-500/50 dark:text-amber-200'
                : 'bg-slate-100 border-slate-200 text-slate-800 hover:bg-slate-200/70 dark:bg-[#1A1D24] dark:border-[#272B35] dark:text-slate-200 dark:hover:bg-[#232733]'
            }`}
          >
            {settings.isScrolling ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause Scroll
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Auto-Scroll
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onResetScroll}
            aria-label="Reset teleprompter scroll to top"
            className="h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200/70 dark:bg-[#1A1D24] dark:hover:bg-[#232733] border border-slate-200 dark:border-[#272B35] text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Top
          </button>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="prompter-font-slider"
              className="text-[11px] text-slate-600 dark:text-slate-400"
            >
              Font size
            </label>
            <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {settings.fontSize}px
            </span>
          </div>
          <input
            id="prompter-font-slider"
            type="range"
            min={16}
            max={40}
            step={1}
            value={settings.fontSize}
            onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value, 10) })}
            className="w-full studio-slider"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="prompter-speed-slider"
              className="text-[11px] text-slate-600 dark:text-slate-400"
            >
              Scroll speed
            </label>
            <span className="text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {settings.scrollSpeed} px/s
            </span>
          </div>
          <input
            id="prompter-speed-slider"
            type="range"
            min={10}
            max={110}
            step={5}
            value={settings.scrollSpeed}
            onChange={(e) => onUpdate({ scrollSpeed: parseInt(e.target.value, 10) })}
            className="w-full studio-slider"
          />
        </div>
      </div>

      {/* Script Editor */}
      <div className="space-y-1.5">
        <label
          htmlFor="speaker-notes-textarea"
          className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          Speaker Script
        </label>
        <textarea
          id="speaker-notes-textarea"
          value={settings.script}
          onChange={(e) => onUpdate({ script: e.target.value })}
          rows={10}
          placeholder="Paste or type your presentation talking points here..."
          className="w-full rounded-lg bg-white dark:bg-[#161920] border border-slate-300 dark:border-[#272B35] focus:border-blue-500 focus:outline-none p-3 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 leading-relaxed resize-y studio-scroll"
        />
      </div>
    </div>
  );
};

interface FloatingTeleprompterProps {
  settings: TeleprompterSettings;
  resetSignal: number;
  resolvedTheme?: ResolvedTheme;
  onUpdate: (patch: Partial<TeleprompterSettings>) => void;
  onClose: () => void;
}

export const FloatingTeleprompter: React.FC<FloatingTeleprompterProps> = ({
  settings,
  resetSignal,
  resolvedTheme = 'dark',
  onUpdate,
  onClose,
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [boxRect, setBoxRect] = useState<{ x: number; y: number; width: number; height: number }>(
    () => ({ x: 80, y: 12, width: 420, height: 196 })
  );
  const initializedRef = useRef<boolean>(false);

  const interactionRef = useRef<{
    mode: 'drag' | 'resize-se' | 'resize-e' | 'resize-s' | 'resize-sw';
    startX: number;
    startY: number;
    origRect: { x: number; y: number; width: number; height: number };
    containerW: number;
    containerH: number;
  } | null>(null);

  const getParentBounds = () => {
    const parent = boxRef.current?.parentElement;
    if (!parent) return { width: 960, height: 600 };
    const r = parent.getBoundingClientRect();
    return { width: Math.max(260, r.width), height: Math.max(200, r.height) };
  };

  // Center near top of stage on first open and keep clamped on window resize
  useEffect(() => {
    if (!settings.isFloatingOpen) return;
    const syncBounds = () => {
      const parent = getParentBounds();
      setBoxRect((prev) => {
        if (!initializedRef.current) {
          initializedRef.current = true;
          const initW = Math.min(440, Math.max(250, parent.width - 110));
          const initH = Math.min(204, Math.max(132, Math.round(parent.height * 0.34)));
          const initX = Math.max(12, Math.round((parent.width - initW) / 2));
          return clampTeleprompterRect({
            x: initX,
            y: 12,
            width: initW,
            height: initH,
            containerWidth: parent.width,
            containerHeight: parent.height,
          });
        }
        return clampTeleprompterRect({
          ...prev,
          containerWidth: parent.width,
          containerHeight: parent.height,
        });
      });
    };
    syncBounds();
    const parentEl = boxRef.current?.parentElement;
    const ro =
      parentEl && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncBounds) : null;
    if (parentEl && ro) {
      ro.observe(parentEl);
    }
    window.addEventListener('resize', syncBounds);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', syncBounds);
    };
  }, [settings.isFloatingOpen]);

  // Reset scroll to top when requested
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [resetSignal]);

  // Smooth auto-scroll via requestAnimationFrame
  useEffect(() => {
    if (!settings.isScrolling || !settings.isFloatingOpen) return;

    let rafId = 0;
    let lastTs = performance.now();
    let carry = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTs) / 1000);
      lastTs = now;
      const el = scrollContainerRef.current;
      if (el) {
        carry += settings.scrollSpeed * dt;
        const step = Math.floor(carry);
        if (step >= 1) {
          el.scrollTop += step;
          carry -= step;
        }
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
          onUpdate({ isScrolling: false });
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [onUpdate, settings.isFloatingOpen, settings.isScrolling, settings.scrollSpeed]);

  if (!settings.isFloatingOpen) return null;

  const beginInteraction = (
    e: React.PointerEvent<HTMLElement>,
    mode: 'drag' | 'resize-se' | 'resize-e' | 'resize-s' | 'resize-sw'
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const parent = getParentBounds();
    interactionRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origRect: { ...boxRect },
      containerW: parent.width,
      containerH: parent.height,
    };
  };

  const moveInteraction = (e: React.PointerEvent<HTMLElement>) => {
    const active = interactionRef.current;
    if (!active) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    const { origRect, containerW, containerH, mode } = active;

    if (mode === 'drag') {
      setBoxRect(
        clampTeleprompterRect({
          x: origRect.x + dx,
          y: origRect.y + dy,
          width: origRect.width,
          height: origRect.height,
          containerWidth: containerW,
          containerHeight: containerH,
        })
      );
      return;
    }

    if (mode === 'resize-se') {
      setBoxRect(
        clampTeleprompterRect({
          x: origRect.x,
          y: origRect.y,
          width: origRect.width + dx,
          height: origRect.height + dy,
          containerWidth: containerW,
          containerHeight: containerH,
        })
      );
    } else if (mode === 'resize-e') {
      setBoxRect(
        clampTeleprompterRect({
          x: origRect.x,
          y: origRect.y,
          width: origRect.width + dx,
          height: origRect.height,
          containerWidth: containerW,
          containerHeight: containerH,
        })
      );
    } else if (mode === 'resize-s') {
      setBoxRect(
        clampTeleprompterRect({
          x: origRect.x,
          y: origRect.y,
          width: origRect.width,
          height: origRect.height + dy,
          containerWidth: containerW,
          containerHeight: containerH,
        })
      );
    } else if (mode === 'resize-sw') {
      const nextWidth = Math.max(230, origRect.width - dx);
      const actualDelta = origRect.width - nextWidth;
      setBoxRect(
        clampTeleprompterRect({
          x: origRect.x + actualDelta,
          y: origRect.y,
          width: nextWidth,
          height: origRect.height + dy,
          containerWidth: containerW,
          containerHeight: containerH,
        })
      );
    }
  };

  const endInteraction = (e: React.PointerEvent<HTMLElement>) => {
    if (interactionRef.current) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      interactionRef.current = null;
    }
  };

  const applySizePreset = (preset: 'sm' | 'md' | 'lg') => {
    const parent = getParentBounds();
    const dims =
      preset === 'sm'
        ? { width: 290, height: 142 }
        : preset === 'md'
          ? { width: 420, height: 204 }
          : { width: 580, height: 290 };
    setBoxRect((prev) =>
      clampTeleprompterRect({
        x: prev.x,
        y: prev.y,
        width: dims.width,
        height: dims.height,
        containerWidth: parent.width,
        containerHeight: parent.height,
      })
    );
  };

  const isLight = resolvedTheme === 'light';

  return (
    <div
      ref={boxRef}
      data-testid="floating-teleprompter"
      data-prompter-width={boxRect.width}
      data-prompter-height={boxRect.height}
      className={`absolute z-30 flex flex-col rounded-2xl sm:rounded-xl border backdrop-blur-md overflow-hidden ${
        isLight
          ? 'border-slate-300/90 shadow-[0_20px_50px_rgba(15,23,42,0.22)]'
          : 'border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.65)]'
      }`}
      style={{
        left: `${boxRect.x}px`,
        top: `${boxRect.y}px`,
        width: `${boxRect.width}px`,
        height: `${boxRect.height}px`,
        backgroundColor: isLight
          ? `rgba(255, 255, 255, ${Math.max(0.88, settings.opacity)})`
          : `rgba(14, 16, 22, ${settings.opacity})`,
      }}
    >
      {/* Movable Header Bar */}
      <div
        onPointerDown={(e) => beginInteraction(e, 'drag')}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        className={`shrink-0 flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b cursor-grab active:cursor-grabbing select-none ${
          isLight
            ? 'border-slate-200 bg-slate-100/80'
            : 'border-white/10 bg-white/[0.04]'
        }`}
      >
        <div
          className={`flex items-center gap-1.5 text-xs font-medium min-w-0 ${
            isLight ? 'text-slate-800' : 'text-slate-200'
          }`}
        >
          <GripHorizontal
            className={`w-4 h-4 shrink-0 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}
          />
          <span className="truncate">Prompter</span>
        </div>

        <div
          className="flex items-center gap-1 shrink-0"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Quick Compact / Medium / Large Window Size Presets — always visible on mobile & desktop */}
          <div
            role="group"
            aria-label="Teleprompter window size"
            className={`inline-flex items-center rounded p-0.5 mr-0.5 ${
              isLight ? 'bg-slate-200/90' : 'bg-white/[0.06]'
            }`}
          >
            {(
              [
                { id: 'sm', label: 'S', title: 'Compact teleprompter size' },
                { id: 'md', label: 'M', title: 'Medium teleprompter size' },
                { id: 'lg', label: 'L', title: 'Large teleprompter size' },
              ] as const
            ).map((sz) => (
              <button
                key={sz.id}
                type="button"
                title={sz.title}
                aria-label={sz.title}
                onClick={() => applySizePreset(sz.id)}
                className={`w-5 h-5 rounded text-[10px] font-semibold flex items-center justify-center transition-colors ${
                  isLight
                    ? 'text-slate-700 hover:text-slate-950 hover:bg-white'
                    : 'text-slate-300 hover:text-white hover:bg-white/15'
                }`}
              >
                {sz.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onUpdate({ isScrolling: !settings.isScrolling })}
            aria-label={settings.isScrolling ? 'Pause teleprompter' : 'Start teleprompter'}
            className={`h-6 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors ${
              settings.isScrolling
                ? isLight
                  ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {settings.isScrolling ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span className="hidden sm:inline">{settings.isScrolling ? 'Pause' : 'Scroll'}</span>
          </button>

          <button
            type="button"
            onClick={() => onUpdate({ fontSize: Math.max(14, settings.fontSize - 2) })}
            aria-label="Decrease teleprompter font size"
            className={`w-6 h-6 rounded flex items-center justify-center ${
              isLight
                ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/80'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Minus className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => onUpdate({ fontSize: Math.min(40, settings.fontSize + 2) })}
            aria-label="Increase teleprompter font size"
            className={`w-6 h-6 rounded flex items-center justify-center ${
              isLight
                ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/80'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Plus className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTop = 0;
              }
            }}
            aria-label="Restart teleprompter from top"
            className={`w-6 h-6 rounded flex items-center justify-center ${
              isLight
                ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-200/80'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close floating teleprompter"
            className={`w-6 h-6 rounded flex items-center justify-center ${
              isLight
                ? 'text-slate-500 hover:text-slate-950 hover:bg-slate-200/80'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Reading guide + Flex-Resizable Scrollable Script Body */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-8 h-px ${
            isLight ? 'bg-blue-500/25' : 'bg-blue-400/25'
          }`}
        />
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 studio-scroll"
        >
          <p
            className={`whitespace-pre-wrap leading-relaxed font-normal ${
              isLight ? 'text-slate-900' : 'text-slate-100'
            }`}
            style={{ fontSize: `${settings.fontSize}px` }}
          >
            {settings.script.trim() ||
              'Open the Script tab to write or paste your speaker notes.'}
          </p>
          <div className="h-20" />
        </div>
      </div>

      {/* Right-Edge Resize Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize teleprompter width"
        onPointerDown={(e) => beginInteraction(e, 'resize-e')}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        className="absolute top-9 bottom-4 right-0 w-2 cursor-ew-resize touch-none hover:bg-blue-500/25 transition-colors"
      />

      {/* Bottom-Edge Resize Handle */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize teleprompter height"
        onPointerDown={(e) => beginInteraction(e, 'resize-s')}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        className="absolute bottom-0 left-4 right-4 h-2 cursor-ns-resize touch-none hover:bg-blue-500/25 transition-colors"
      />

      {/* Bottom-Left Corner Resize Handle */}
      <div
        onPointerDown={(e) => beginInteraction(e, 'resize-sw')}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        aria-label="Resize teleprompter from bottom-left"
        className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize touch-none"
      />

      {/* Bottom-Right Diagonal Grip Resize Handle */}
      <button
        type="button"
        aria-label="Resize teleprompter"
        title="Drag to resize teleprompter"
        onPointerDown={(e) => beginInteraction(e, 'resize-se')}
        onPointerMove={moveInteraction}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        className={`absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize touch-none flex items-end justify-end p-1 ${
          isLight
            ? 'text-slate-500 hover:text-blue-600'
            : 'text-slate-400 hover:text-blue-300'
        }`}
      >
        <svg viewBox="0 0 12 12" className="w-3 h-3" aria-hidden="true">
          <path
            d="M11 1L1 11M11 5.5L5.5 11M11 9.5L9.5 11"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
};
