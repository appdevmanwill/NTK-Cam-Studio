import React, { useRef } from 'react';
import type { TimelineCut } from '../types/studio';
import { formatTimecode } from '../utils/compositorMath';

interface WaveformTimelineProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  waveformPeaks: number[];
  cuts: TimelineCut[];
  selectedCutId: string | null;
  hasAudio: boolean;
  onSeek: (timeSec: number) => void;
  onSelectCut: (cutId: string | null) => void;
}

const CUT_COLORS: Record<
  TimelineCut['reason'],
  { activeBg: string; activeBorder: string; inactiveBg: string }
> = {
  silence: {
    activeBg: 'bg-amber-400/35 dark:bg-amber-500/30',
    activeBorder: 'border-amber-500 dark:border-amber-400/80',
    inactiveBg:
      'bg-amber-400/15 dark:bg-amber-500/10 border-dashed border-amber-500/60 dark:border-amber-400/35',
  },
  repetition: {
    activeBg: 'bg-rose-400/35 dark:bg-rose-500/30',
    activeBorder: 'border-rose-500 dark:border-rose-400/80',
    inactiveBg:
      'bg-rose-400/15 dark:bg-rose-500/10 border-dashed border-rose-500/60 dark:border-rose-400/35',
  },
  manual: {
    activeBg: 'bg-red-400/35 dark:bg-red-500/32',
    activeBorder: 'border-red-500 dark:border-red-400/85',
    inactiveBg:
      'bg-red-400/15 dark:bg-red-500/10 border-dashed border-red-500/60 dark:border-red-400/35',
  },
};

export const WaveformTimeline: React.FC<WaveformTimelineProps> = ({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  waveformPeaks,
  cuts,
  selectedCutId,
  hasAudio,
  onSeek,
  onSelectCut,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const safeDur = Math.max(0.2, duration);

  const clientXToTime = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Number((ratio * safeDur).toFixed(2));
  };

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const t = clientXToTime(e.clientX);
    onSeek(t);
    const hitCut = cuts.find((c) => t >= c.start && t <= c.end);
    onSelectCut(hitCut ? hitCut.id : null);
  };

  const startPct = (trimStart / safeDur) * 100;
  const endPct = (trimEnd / safeDur) * 100;
  const playheadPct = Math.max(0, Math.min(100, (currentTime / safeDur) * 100));

  const bars =
    waveformPeaks.length > 0
      ? waveformPeaks
      : Array.from({ length: 120 }, (_, i) => (hasAudio ? 0.14 + (i % 5) * 0.04 : 0.08));

  return (
    <div className="space-y-1.5">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Recording waveform timeline"
        aria-valuemin={0}
        aria-valuemax={Number(safeDur.toFixed(1))}
        aria-valuenow={Number(currentTime.toFixed(1))}
        data-testid="waveform-timeline"
        onPointerDown={handleTrackPointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            onSeek(Math.min(safeDur, currentTime + 0.5));
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            onSeek(Math.max(0, currentTime - 0.5));
          }
        }}
        className="relative h-20 w-full rounded-lg bg-slate-100 dark:bg-[#0D1017] border border-slate-300 dark:border-[#272D3B] overflow-hidden cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-blue-500/60"
      >
        {/* Center axis line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-300/80 dark:bg-white/[0.06]"
        />

        {/* Audio Waveform Bars */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center gap-px px-1"
        >
          {bars.map((peak, i) => {
            const barTime = ((i + 0.5) / bars.length) * safeDur;
            const outsideTrim = barTime < trimStart || barTime > trimEnd;
            const inActiveCut = cuts.some(
              (c) => c.enabled && barTime >= c.start && barTime <= c.end
            );
            const heightPct = Math.max(7, Math.round(peak * 86));
            return (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors ${
                  outsideTrim
                    ? 'bg-slate-300 dark:bg-slate-700/35'
                    : inActiveCut
                      ? 'bg-slate-400/70 dark:bg-slate-500/45'
                      : hasAudio
                        ? 'bg-blue-600/85 dark:bg-blue-400/80'
                        : 'bg-slate-400/60 dark:bg-slate-600/50'
                }`}
                style={{ height: `${heightPct}%` }}
              />
            );
          })}
        </div>

        {/* Left & Right Trimmed-Out Shading */}
        {startPct > 0.2 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 bg-slate-900/30 dark:bg-black/65 border-r-2 border-blue-600 dark:border-blue-400"
            style={{ width: `${startPct}%` }}
          />
        )}
        {endPct < 99.8 && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 bg-slate-900/30 dark:bg-black/65 border-l-2 border-blue-600 dark:border-blue-400"
            style={{ width: `${100 - endPct}%` }}
          />
        )}

        {/* Detected & Manual Cut Region Overlays */}
        {cuts.map((cut) => {
          const left = (cut.start / safeDur) * 100;
          const width = Math.max(0.8, ((cut.end - cut.start) / safeDur) * 100);
          const palette = CUT_COLORS[cut.reason];
          const isSelected = selectedCutId === cut.id;

          return (
            <button
              key={cut.id}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectCut(cut.id);
                onSeek(Math.max(0, cut.start - 0.35));
              }}
              title={`${cut.label} (${formatTimecode(cut.start, true)}–${formatTimecode(cut.end, true)}) · ${cut.enabled ? 'Will be removed' : 'Kept'}`}
              aria-label={`Select ${cut.label}`}
              className={`absolute inset-y-0 border-x transition-all ${
                cut.enabled ? `${palette.activeBg} ${palette.activeBorder}` : palette.inactiveBg
              } ${
                isSelected
                  ? 'ring-2 ring-inset ring-slate-900 dark:ring-white/90 z-10'
                  : 'hover:brightness-110 dark:hover:brightness-125'
              }`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
              }}
            >
              {width >= 4.5 && (
                <span className="absolute top-1 left-1 right-1 truncate text-[9px] font-semibold uppercase tracking-wide text-white bg-slate-900/70 dark:bg-black/55 rounded px-1 py-0.5 leading-none">
                  {cut.reason === 'silence' ? 'Sil' : cut.reason === 'repetition' ? 'Rep' : 'Cut'}
                </span>
              )}
            </button>
          );
        })}

        {/* Live Playhead Line */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-slate-900 dark:bg-white shadow-[0_0_6px_rgba(15,23,42,0.45)] dark:shadow-[0_0_8px_rgba(255,255,255,0.8)] z-20"
          style={{ left: `${playheadPct}%` }}
        >
          <div className="w-2.5 h-2.5 -ml-[4px] -mt-0.5 rounded-full bg-slate-900 dark:bg-white border border-blue-500 dark:border-blue-600" />
        </div>
      </div>

      {/* Timeline Legend + Time Readout */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/60 dark:bg-amber-500/50 border border-amber-500 dark:border-amber-400/80" />
            Silence
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-400/60 dark:bg-rose-500/50 border border-rose-500 dark:border-rose-400/80" />
            Repetition
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-400/60 dark:bg-red-500/50 border border-red-500 dark:border-red-400/80" />
            Manual cut
          </span>
        </div>
        <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
          Playhead {formatTimecode(currentTime, true)} / {formatTimecode(safeDur, true)}
        </span>
      </div>
    </div>
  );
};
