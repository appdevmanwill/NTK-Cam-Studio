import React from 'react';
import {
  Camera,
  CameraOff,
  Columns2,
  Mic,
  MicOff,
  Monitor,
  Pause,
  PictureInPicture2,
  Play,
  Square,
  User,
} from 'lucide-react';
import type {
  AspectRatio,
  LayoutMode,
  RecordingStatus,
  VideoResolutionPreset,
} from '../types/studio';
import { formatTimecode } from '../utils/compositorMath';
import { RESOLUTION_PRESET_OPTIONS } from '../utils/videoExporter';

interface RecorderEngineToolbarProps {
  status: RecordingStatus;
  elapsedSec: number;
  layout: LayoutMode;
  aspectRatio: AspectRatio;
  resolution: VideoResolutionPreset;
  cameraActive: boolean;
  micActive: boolean;
  audioLevel: number;
  onStartRecording: () => void;
  onCancelCountdown: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onStopRecording: () => void;
  onChangeLayout: (layout: LayoutMode) => void;
  onChangeAspectRatio: (ratio: AspectRatio) => void;
  onChangeResolution: (resolution: VideoResolutionPreset) => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
}

const LAYOUT_ITEMS: Array<{
  id: LayoutMode;
  label: string;
  shortLabel: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'pip', label: 'Picture-in-Picture', shortLabel: 'PiP', icon: PictureInPicture2 },
  { id: 'side-by-side', label: 'Side by Side', shortLabel: 'Split', icon: Columns2 },
  { id: 'screen-only', label: 'Slides or Screen Only', shortLabel: 'Stage', icon: Monitor },
  { id: 'camera-only', label: 'Camera Only', shortLabel: 'Camera', icon: User },
];

const ASPECT_ITEMS: Array<{ id: AspectRatio; label: string; hint: string }> = [
  { id: '16:9', label: '16:9', hint: 'Landscape / YouTube' },
  { id: '9:16', label: '9:16', hint: 'Vertical / Shorts & Reels' },
  { id: '1:1', label: '1:1', hint: 'Square / LinkedIn' },
];

export const RecorderEngine: React.FC<RecorderEngineToolbarProps> = ({
  status,
  elapsedSec,
  layout,
  aspectRatio,
  resolution,
  cameraActive,
  micActive,
  audioLevel,
  onStartRecording,
  onCancelCountdown,
  onPauseRecording,
  onResumeRecording,
  onStopRecording,
  onChangeLayout,
  onChangeAspectRatio,
  onChangeResolution,
  onToggleCamera,
  onToggleMic,
}) => {
  const isRecordingOrPaused = status === 'recording' || status === 'paused';
  const meterBars = [0.15, 0.3, 0.48, 0.68, 0.85];

  return (
    <footer className="hidden lg:block shrink-0 border-t border-slate-200 dark:border-[#1F232D] bg-white dark:bg-[#101217] px-4 py-2.5">
      <div className="max-w-[1380px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Quick Media Toggles & Live Audio Level Meter */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleCamera}
            aria-label={cameraActive ? 'Turn off camera' : 'Turn on camera'}
            aria-pressed={cameraActive}
            className={`h-10 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              cameraActive
                ? 'bg-blue-50 dark:bg-[#1D222D] border-blue-400 dark:border-blue-500/45 text-blue-800 dark:text-white hover:bg-blue-100/80 dark:hover:bg-[#242A38]'
                : 'bg-slate-100 dark:bg-[#161920] border-slate-200 dark:border-[#272B35] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#1D2029]'
            }`}
          >
            {cameraActive ? (
              <Camera className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <CameraOff className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{cameraActive ? 'Cam On' : 'Cam Off'}</span>
          </button>

          <button
            type="button"
            onClick={onToggleMic}
            aria-label={micActive ? 'Mute microphone' : 'Enable microphone'}
            aria-pressed={micActive}
            className={`h-10 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
              micActive
                ? 'bg-emerald-50 dark:bg-[#1D222D] border-emerald-400 dark:border-emerald-500/45 text-emerald-800 dark:text-white hover:bg-emerald-100/80 dark:hover:bg-[#242A38]'
                : 'bg-slate-100 dark:bg-[#161920] border-slate-200 dark:border-[#272B35] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-[#1D2029]'
            }`}
          >
            {micActive ? (
              <Mic className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <MicOff className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">{micActive ? 'Mic On' : 'Mic Off'}</span>
          </button>

          {/* Live Audio Level Meter */}
          <div
            aria-label="Live microphone level"
            title={micActive ? 'Microphone input level' : 'Microphone muted'}
            className="hidden md:flex items-end gap-1 h-10 px-2.5 py-2.5 rounded-lg bg-slate-100 dark:bg-[#161920] border border-slate-200 dark:border-[#242832]"
          >
            {meterBars.map((threshold, idx) => {
              const lit = micActive && audioLevel >= threshold;
              const barColor =
                idx >= 4
                  ? 'bg-red-500 dark:bg-red-400'
                  : idx >= 3
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : 'bg-emerald-500 dark:bg-emerald-400';
              return (
                <span
                  key={threshold}
                  className={`w-1 rounded-full transition-all duration-75 ${
                    lit ? barColor : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  style={{ height: `${8 + idx * 3}px` }}
                />
              );
            })}
          </div>
        </div>

        {/* Center: Primary Recording Transport Controls */}
        <div className="flex items-center gap-2">
          {status === 'idle' && (
            <button
              type="button"
              onClick={onStartRecording}
              className="h-10 px-5 rounded-lg bg-[#E5484D] hover:bg-[#EE575C] text-white text-sm font-semibold inline-flex items-center gap-2.5 shadow-[0_6px_20px_rgba(229,72,77,0.3)] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-white" aria-hidden="true" />
              Start Recording
            </button>
          )}

          {status === 'countdown' && (
            <button
              type="button"
              onClick={onCancelCountdown}
              className="h-10 px-4 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D2029] dark:hover:bg-[#272B36] border border-slate-300 dark:border-[#343A47] text-slate-800 dark:text-slate-200 text-xs font-medium whitespace-nowrap shrink-0"
            >
              Cancel Countdown
            </button>
          )}

          {isRecordingOrPaused && (
            <div className="flex items-center gap-2">
              <div
                data-testid="recording-timer"
                className="h-10 px-3.5 rounded-lg bg-red-50 dark:bg-[#181B23] border border-red-300 dark:border-red-500/40 inline-flex items-center gap-2 text-xs font-mono tabular-nums text-red-950 dark:text-white"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    status === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-amber-500'
                  }`}
                  aria-hidden="true"
                />
                <span>{formatTimecode(elapsedSec)}</span>
                <span className="text-slate-600 dark:text-slate-400 font-sans">
                  {status === 'paused' ? 'Paused' : 'REC'}
                </span>
              </div>

              {status === 'recording' ? (
                <button
                  type="button"
                  onClick={onPauseRecording}
                  aria-label="Pause recording"
                  className="h-10 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D2029] dark:hover:bg-[#272B36] border border-slate-300 dark:border-[#323744] text-slate-800 dark:text-slate-200 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onResumeRecording}
                  aria-label="Resume recording"
                  className="h-10 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Resume
                </button>
              )}

              <button
                type="button"
                onClick={onStopRecording}
                aria-label="Stop recording"
                className="h-10 px-4 rounded-lg bg-[#E5484D] hover:bg-[#EE575C] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </button>
            </div>
          )}
        </div>

        {/* Right: Real-time Layout Switcher & Aspect Ratio Toggle */}
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Stage layout"
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#161920] border border-slate-200 dark:border-[#242832]"
          >
            {LAYOUT_ITEMS.map(({ id, label, shortLabel, icon: Icon }) => {
              const active = layout === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChangeLayout(id)}
                  aria-label={label}
                  aria-pressed={active}
                  title={label}
                  className={`h-8 px-2.5 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white dark:bg-[#282E3D] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline">{shortLabel}</span>
                </button>
              );
            })}
          </div>

          <div
            role="group"
            aria-label="Canvas aspect ratio"
            className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#161920] border border-slate-200 dark:border-[#242832]"
          >
            {ASPECT_ITEMS.map((item) => {
              const active = aspectRatio === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={isRecordingOrPaused}
                  onClick={() => onChangeAspectRatio(item.id)}
                  aria-label={`Aspect ratio ${item.label} (${item.hint})`}
                  aria-pressed={active}
                  title={
                    isRecordingOrPaused
                      ? 'Stop recording to switch canvas aspect ratio'
                      : `${item.label} · ${item.hint}`
                  }
                  className={`h-8 px-2.5 rounded-md text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <select
            aria-label="Recording resolution"
            disabled={isRecordingOrPaused}
            value={resolution}
            onChange={(e) => onChangeResolution(e.target.value as VideoResolutionPreset)}
            title={
              isRecordingOrPaused
                ? 'Stop recording to switch recording resolution'
                : 'Choose recording size (4K, 1440p, 1080p, 720p, 480p, 360p)'
            }
            className="h-10 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 dark:bg-[#161920] dark:hover:bg-[#1D2029] border border-slate-200 dark:border-[#242832] text-xs font-mono font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
          >
            {RESOLUTION_PRESET_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.shortLabel}
              </option>
            ))}
          </select>
        </div>
      </div>
    </footer>
  );
};
