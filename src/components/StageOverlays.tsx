import React, { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  Globe,
  Mic,
  MicOff,
  Minimize2,
  Monitor,
  MonitorOff,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import {
  classifyMicSignal,
  computeWaveformBars,
  formatAudioDb,
  type MicSignalState,
  type ScreenShareInfo,
} from '../utils/stageMonitor';

interface ScreenShareOverlayIndicatorProps {
  visible: boolean;
  screenInfo: ScreenShareInfo;
  onStartOrSwitchShare: () => void;
  onStopShare: () => void;
}

export const ScreenShareOverlayIndicator: React.FC<ScreenShareOverlayIndicatorProps> = ({
  visible,
  screenInfo,
  onStartOrSwitchShare,
  onStopShare,
}) => {
  if (!visible) return null;

  const SurfaceIcon =
    screenInfo.surfaceKind === 'window'
      ? AppWindow
      : screenInfo.surfaceKind === 'browser'
        ? Globe
        : Monitor;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="screen-share-indicator"
      data-sharing-active={String(screenInfo.active)}
      data-surface-kind={screenInfo.surfaceKind}
      className="absolute top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-auto sm:max-w-[min(460px,calc(100%-24px))] z-20 pointer-events-auto"
    >
      {screenInfo.active ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/95 dark:bg-[#0E1118]/92 backdrop-blur-md border border-emerald-500/45 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>

            <SurfaceIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 shrink-0">
                  Audience sees
                </span>
                <span className="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30 shrink-0">
                  {screenInfo.surfaceLabel}
                </span>
                {screenInfo.resolutionLabel && (
                  <span className="hidden md:inline text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                    {screenInfo.resolutionLabel}
                  </span>
                )}
                {screenInfo.hasSystemAudio && (
                  <span
                    title="System audio included"
                    className="inline-flex items-center text-emerald-600 dark:text-emerald-400 shrink-0"
                  >
                    <Volume2 className="w-3 h-3" />
                  </span>
                )}
              </div>
              <div
                data-testid="screen-share-source-name"
                title={screenInfo.sourceName}
                className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-tight mt-0.5"
              >
                {screenInfo.sourceName}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onStartOrSwitchShare}
              aria-label="Switch shared screen or window"
              title="Switch shared screen or window"
              className="h-7 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1B202C] dark:hover:bg-[#252B3B] border border-slate-200 dark:border-[#2C3344] text-[11px] font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">Change</span>
            </button>
            <button
              type="button"
              onClick={onStopShare}
              aria-label="Stop screen share"
              title="Stop sharing and return to slides"
              className="h-7 px-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-500/15 dark:hover:bg-red-500/25 border border-red-200 dark:border-red-500/35 text-[11px] font-medium text-red-700 dark:text-red-300 inline-flex items-center gap-1 transition-colors whitespace-nowrap"
            >
              <MonitorOff className="w-3 h-3" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-white/95 dark:bg-[#0E1118]/92 backdrop-blur-md border border-amber-400/50 dark:border-amber-500/40 shadow-lg">
          <div className="flex items-center gap-2 min-w-0">
            <Monitor className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-900 dark:text-white leading-tight truncate">
                Screen Mode · Not Sharing Yet
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                Choose a screen, window, or tab for your audience
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartOrSwitchShare}
            className="h-7 px-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-[11px] font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            Share Screen
          </button>
        </div>
      )}
    </div>
  );
};

interface StageMicWaveformProps {
  micActive: boolean;
  micAnalyser: AnalyserNode | null;
  audioLevel: number;
  resolvedTheme: 'light' | 'dark';
  onToggleMic: () => void;
}

const BAR_COUNT = 22;

export const StageMicWaveform: React.FC<StageMicWaveformProps> = ({
  micActive,
  micAnalyser,
  audioLevel,
  resolvedTheme,
  onToggleMic,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevBarsRef = useRef<number[]>(new Array<number>(BAR_COUNT).fill(0));
  const [collapsed, setCollapsed] = useState(false);
  const [signalState, setSignalState] = useState<MicSignalState>(micActive ? 'quiet' : 'off');
  const [dbReadout, setDbReadout] = useState<string>('-∞ dB');

  const signalStateRef = useRef<MicSignalState>(signalState);
  signalStateRef.current = signalState;

  useEffect(() => {
    if (!micActive) {
      prevBarsRef.current = new Array<number>(BAR_COUNT).fill(0);
      setSignalState('off');
      setDbReadout('-∞ dB');
    } else if (signalStateRef.current === 'off') {
      setSignalState('quiet');
    }
  }, [micActive]);

  // Real-time 30fps canvas waveform driven directly from Web Audio AnalyserNode
  useEffect(() => {
    if (collapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = 104;
    const cssH = 24;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    let cancelled = false;
    let rafId = 0;
    let lastDraw = 0;
    let lastUiSync = 0;
    const sampleBuf = micAnalyser ? new Uint8Array(micAnalyser.fftSize) : new Uint8Array(128).fill(128);

    const drawBars = (bars: number[], state: MicSignalState) => {
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);

      const gap = 2;
      const barW = Math.max(2, (cssW - gap * (BAR_COUNT - 1)) / BAR_COUNT);
      const midY = cssH / 2;

      // Subtle center baseline
      ctx.fillStyle =
        resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.16)' : 'rgba(100, 116, 139, 0.18)';
      ctx.fillRect(0, midY - 0.5, cssW, 1);

      for (let i = 0; i < BAR_COUNT; i++) {
        const amp = bars[i] ?? 0;
        const minH = micActive ? 3 : 2;
        const barH = Math.max(minH, amp * (cssH - 4));
        const x = i * (barW + gap);
        const y = midY - barH / 2;

        if (!micActive) {
          ctx.fillStyle =
            resolvedTheme === 'dark' ? 'rgba(148, 163, 184, 0.28)' : 'rgba(148, 163, 184, 0.55)';
        } else if (state === 'clipping' && amp > 0.72) {
          ctx.fillStyle = '#ef4444';
        } else if ((state === 'hot' || state === 'clipping') && amp > 0.55) {
          ctx.fillStyle = '#f59e0b';
        } else if (amp > 0.06) {
          ctx.fillStyle = resolvedTheme === 'dark' ? '#34d399' : '#059669';
        } else {
          ctx.fillStyle =
            resolvedTheme === 'dark' ? 'rgba(52, 211, 153, 0.35)' : 'rgba(5, 150, 105, 0.32)';
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const tick = (now: number, force = false) => {
      if (cancelled) return;
      if (force || now - lastDraw >= 32) {
        lastDraw = now;
        if (micActive && micAnalyser) {
          micAnalyser.getByteTimeDomainData(sampleBuf);
          const metrics = computeWaveformBars(sampleBuf, BAR_COUNT, prevBarsRef.current);
          prevBarsRef.current = metrics.bars;
          const nextState = classifyMicSignal(metrics.rms, metrics.peak, true);
          drawBars(metrics.bars, nextState);

          if (now - lastUiSync >= 140) {
            lastUiSync = now;
            setSignalState(nextState);
            setDbReadout(formatAudioDb(metrics.rms));
          }
        } else {
          // Graceful decay or idle flatline
          const idleBars = prevBarsRef.current.map((v) => (v > 0.02 ? v * 0.72 : 0));
          prevBarsRef.current = idleBars;
          drawBars(idleBars, micActive ? 'quiet' : 'off');
        }
      }
      if (!cancelled && micActive && micAnalyser) {
        rafId = requestAnimationFrame((ts) => tick(ts));
      }
    };

    // Paint initial frame and kick off single loop when active
    tick(performance.now(), true);

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [collapsed, micActive, micAnalyser, resolvedTheme]);

  const statusMeta: Record<
    MicSignalState,
    { label: string; dotClass: string; textClass: string }
  > = {
    off: {
      label: 'Mic Off',
      dotClass: 'bg-slate-400 dark:bg-slate-500',
      textClass: 'text-slate-500 dark:text-slate-400',
    },
    quiet: {
      label: 'Mic Live',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700 dark:text-emerald-300',
    },
    capturing: {
      label: 'Capturing',
      dotClass: 'bg-emerald-500',
      textClass: 'text-emerald-700 dark:text-emerald-300',
    },
    hot: {
      label: 'Loud',
      dotClass: 'bg-amber-500',
      textClass: 'text-amber-700 dark:text-amber-300',
    },
    clipping: {
      label: 'Clipping',
      dotClass: 'bg-red-500',
      textClass: 'text-red-600 dark:text-red-400',
    },
  };

  const currentStatus = statusMeta[signalState];
  const collapsedDotClass = !micActive
    ? 'bg-slate-400 dark:bg-slate-500'
    : audioLevel >= 0.85
      ? 'bg-red-500'
      : audioLevel >= 0.55
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  if (collapsed) {
    return (
      <div
        data-testid="mic-waveform-visualizer"
        data-mic-active={String(micActive)}
        data-signal-state={signalState}
        className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-20 pointer-events-auto"
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand microphone waveform visualizer"
          title="Show live microphone waveform"
          className="h-8 px-2.5 rounded-xl bg-white/92 dark:bg-[#0E1118]/88 backdrop-blur-md border border-slate-200 dark:border-white/12 shadow-md inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-[#151924] transition-colors"
        >
          <span
            className={`w-2 h-2 rounded-full ${collapsedDotClass}`}
            aria-hidden="true"
          />
          {micActive ? <Mic className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <MicOff className="w-3.5 h-3.5 text-slate-400" />}
          <span className="font-mono tabular-nums text-[10px]">
            {micActive ? `${Math.round(audioLevel * 100)}%` : 'Muted'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={micActive ? `Microphone ${currentStatus.label}` : 'Microphone muted'}
      data-testid="mic-waveform-visualizer"
      data-mic-active={String(micActive)}
      data-signal-state={signalState}
      className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 z-20 pointer-events-auto flex items-center gap-2 px-2 py-1.5 sm:px-2.5 rounded-xl bg-white/92 dark:bg-[#0E1118]/88 backdrop-blur-md border border-slate-200/90 dark:border-white/12 shadow-lg"
    >
      <button
        type="button"
        onClick={onToggleMic}
        aria-label={micActive ? 'Mute microphone' : 'Enable microphone'}
        aria-pressed={micActive}
        title={micActive ? 'Click to mute microphone' : 'Click to enable microphone'}
        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
          micActive
            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/35'
            : 'bg-slate-100 dark:bg-[#1B1F2A] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#2A303E]'
        }`}
      >
        {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
      </button>

      {/* Real-time live waveform canvas */}
      <canvas
        ref={canvasRef}
        data-testid="mic-waveform-canvas"
        aria-hidden="true"
        className="w-[82px] sm:w-[104px] h-[24px] block shrink-0"
      />

      <div className="hidden sm:flex flex-col items-end leading-none min-w-[54px] pr-0.5">
        <span className={`text-[10px] font-semibold inline-flex items-center gap-1 ${currentStatus.textClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dotClass}`} aria-hidden="true" />
          {currentStatus.label}
        </span>
        <span className="text-[9px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
          {micActive ? dbReadout : 'Click mic'}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setCollapsed(true)}
        aria-label="Minimize microphone waveform"
        title="Minimize waveform"
        className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
      >
        <Minimize2 className="w-3 h-3" />
      </button>
    </div>
  );
};
