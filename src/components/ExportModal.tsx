import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileVideo,
  Loader2,
  Maximize2,
  Minus,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  ExportFormat,
  RecordedClip,
  RepetitionDetectionRules,
  SilenceDetectionRules,
  TimelineCut,
  VideoResolutionPreset,
} from '../types/studio';
import {
  type AudioAnalysisResult,
  analyzeMonoAudio,
  DEFAULT_REPETITION_RULES,
  DEFAULT_SILENCE_RULES,
  detectRepetitions,
  detectSilences,
  downmixToMono,
} from '../utils/audioAnalyzer';
import {
  clampTrimRange,
  estimateExportSizeMb,
  formatTimecode,
  getCanvasDimensions,
} from '../utils/compositorMath';
import {
  clampCutBounds,
  computeTimelineSummary,
  findNextPlayableTime,
  replaceAutoCutsByReason,
} from '../utils/timelineCuts';
import {
  EXPORT_FORMAT_OPTIONS,
  RESOLUTION_PRESET_OPTIONS,
  computeGifDimensions,
  exportRecordedClip,
} from '../utils/videoExporter';
import { saveBlobToDevice } from '../utils/nativeDownload';
import { WaveformTimeline } from './WaveformTimeline';

interface ExportModalProps {
  clip: RecordedClip | null;
  onClose: () => void;
  onExportComplete?: () => void;
}

type ModalTab = 'edit' | 'export';

export const ExportModal: React.FC<ExportModalProps> = ({ clip, onClose, onExportComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const auditionEndRef = useRef<number | null>(null);
  const hasUserTrimmedRef = useRef<boolean>(false);
  const [activeTab, setActiveTab] = useState<ModalTab>('edit');
  const [duration, setDuration] = useState<number>(clip?.durationSec ?? 0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(clip?.durationSec ?? 0);

  // Rule-based Audio Analysis & Cut State (Zero AI)
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysisResult | null>(null);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState<boolean>(false);
  const [autoRemoveSilences, setAutoRemoveSilences] = useState<boolean>(true);
  const [autoDetectRepetitions, setAutoDetectRepetitions] = useState<boolean>(true);
  const [silenceRules, setSilenceRules] = useState<SilenceDetectionRules>({
    ...DEFAULT_SILENCE_RULES,
  });
  const [repetitionRules, setRepetitionRules] = useState<RepetitionDetectionRules>({
    ...DEFAULT_REPETITION_RULES,
  });
  const [cuts, setCuts] = useState<TimelineCut[]>([]);
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [skipCutsInPreview, setSkipCutsInPreview] = useState<boolean>(true);

  // Export Format & Size State
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('mp4');
  const [selectedResolution, setSelectedResolution] = useState<VideoResolutionPreset>(
    clip?.resolution ?? '1080p'
  );
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [exportStage, setExportStage] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessNote, setExportSuccessNote] = useState<string | null>(null);

  // Escape key dismiss when not actively transcoding
  useEffect(() => {
    if (!clip) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clip, isExporting, onClose]);

  // Reset modal state & decode audio waveform when a new clip arrives
  useEffect(() => {
    if (!clip) return;
    let cancelled = false;
    auditionEndRef.current = null;
    hasUserTrimmedRef.current = false;

    setActiveTab('edit');
    setDuration(clip.durationSec);
    setCurrentTime(0);
    setTrimStart(0);
    setTrimEnd(clip.durationSec);
    setAudioAnalysis(null);
    setCuts([]);
    setSelectedCutId(null);
    setAutoRemoveSilences(true);
    setAutoDetectRepetitions(true);
    setSilenceRules({ ...DEFAULT_SILENCE_RULES });
    setRepetitionRules({ ...DEFAULT_REPETITION_RULES });
    setSkipCutsInPreview(true);
    setSelectedFormat('mp4');
    setSelectedResolution(clip.resolution);
    setExportError(null);
    setExportSuccessNote(null);
    setExportProgress(0);
    setExportStage('');
    setIsExporting(false);

    const decodeAndAnalyze = async () => {
      setIsAnalyzingAudio(true);
      let audioCtx: AudioContext | null = null;
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        audioCtx = new AudioCtx();
        const rawBuf = await clip.blob.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(rawBuf.slice(0));
        if (cancelled) return;

        const channels: Float32Array[] = [];
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          channels.push(decoded.getChannelData(ch));
        }
        const mono = downmixToMono(channels);
        const analysis = analyzeMonoAudio(mono, decoded.sampleRate, 180);
        if (cancelled) return;

        setAudioAnalysis(analysis);

        if (
          analysis.durationSec >= 0.3 &&
          (!videoRef.current || !Number.isFinite(videoRef.current.duration))
        ) {
          const exactDur = Number(analysis.durationSec.toFixed(2));
          setDuration(exactDur);
          if (!hasUserTrimmedRef.current) {
            setTrimStart(0);
            setTrimEnd(exactDur);
          }
        }

        if (analysis.hasAudibleSignal) {
          const detectedSilences = detectSilences(
            analysis.mono,
            analysis.sampleRate,
            DEFAULT_SILENCE_RULES
          );
          const detectedReps = detectRepetitions(
            analysis.mono,
            analysis.sampleRate,
            DEFAULT_REPETITION_RULES,
            DEFAULT_SILENCE_RULES.thresholdDb
          );
          setCuts([...detectedSilences, ...detectedReps].sort((a, b) => a.start - b.start));
        }
      } catch {
        // Clip has no audio track (mic was off) — gracefully continue with manual cuts & trim
        if (!cancelled) {
          setAudioAnalysis(null);
        }
      } finally {
        if (audioCtx && audioCtx.state !== 'closed') {
          void audioCtx.close();
        }
        if (!cancelled) {
          setIsAnalyzingAudio(false);
        }
      }
    };

    void decodeAndAnalyze();
    return () => {
      cancelled = true;
    };
  }, [clip]);

  const timelineSummary = useMemo(
    () => computeTimelineSummary(duration, trimStart, trimEnd, cuts),
    [cuts, duration, trimEnd, trimStart]
  );

  if (!clip) return null;

  const runSilenceDetection = (nextRules: SilenceDetectionRules, enabled: boolean) => {
    if (!audioAnalysis || !audioAnalysis.hasAudibleSignal) return;
    if (!enabled) {
      setCuts((prev) => prev.filter((c) => c.reason !== 'silence'));
      return;
    }
    const found = detectSilences(audioAnalysis.mono, audioAnalysis.sampleRate, nextRules);
    setCuts((prev) => replaceAutoCutsByReason(prev, found, 'silence'));
  };

  const runRepetitionDetection = (
    nextRules: RepetitionDetectionRules,
    enabled: boolean,
    thresholdDb = silenceRules.thresholdDb
  ) => {
    if (!audioAnalysis || !audioAnalysis.hasAudibleSignal) return;
    if (!enabled) {
      setCuts((prev) => prev.filter((c) => c.reason !== 'repetition'));
      return;
    }
    const found = detectRepetitions(
      audioAnalysis.mono,
      audioAnalysis.sampleRate,
      nextRules,
      thresholdDb
    );
    setCuts((prev) => replaceAutoCutsByReason(prev, found, 'repetition'));
  };

  const handleSilenceRuleChange = (patch: Partial<SilenceDetectionRules>) => {
    const next = { ...silenceRules, ...patch };
    setSilenceRules(next);
    if (autoRemoveSilences) {
      runSilenceDetection(next, true);
    }
    if (autoDetectRepetitions && patch.thresholdDb !== undefined) {
      runRepetitionDetection(repetitionRules, true, next.thresholdDb);
    }
  };

  const handleRepetitionRuleChange = (patch: Partial<RepetitionDetectionRules>) => {
    const next = { ...repetitionRules, ...patch };
    setRepetitionRules(next);
    if (autoDetectRepetitions) {
      runRepetitionDetection(next, true);
    }
  };

  const handleAddManualCut = () => {
    const safeDur = Math.max(0.5, duration);
    const defaultStart = Math.min(Math.max(trimStart, currentTime), Math.max(0, safeDur - 0.5));
    const defaultEnd = Math.min(safeDur, defaultStart + Math.min(1.0, safeDur * 0.25));
    const bounds = clampCutBounds(defaultStart, defaultEnd, safeDur, 0.15);
    const manualNum = cuts.filter((c) => c.reason === 'manual').length + 1;
    const newCut: TimelineCut = {
      id: `manual-${Date.now()}-${manualNum}`,
      start: bounds.start,
      end: bounds.end,
      reason: 'manual',
      enabled: true,
      label: `Manual cut #${manualNum}`,
    };
    setCuts((prev) => [...prev, newCut].sort((a, b) => a.start - b.start));
    setSelectedCutId(newCut.id);
  };

  const handleToggleCutEnabled = (id: string) => {
    setCuts((prev) => prev.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const handleNudgeCutEdge = (id: string, edge: 'start' | 'end', deltaSec: number) => {
    setCuts((prev) =>
      prev
        .map((c) => {
          if (c.id !== id) return c;
          const nextStart = edge === 'start' ? c.start + deltaSec : c.start;
          const nextEnd = edge === 'end' ? c.end + deltaSec : c.end;
          const clamped = clampCutBounds(nextStart, nextEnd, duration, 0.1);
          return { ...c, start: clamped.start, end: clamped.end };
        })
        .sort((a, b) => a.start - b.start)
    );
  };

  const handleDeleteCut = (id: string) => {
    setCuts((prev) => prev.filter((c) => c.id !== id));
    if (selectedCutId === id) setSelectedCutId(null);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    if (
      Number.isFinite(video.duration) &&
      video.duration >= Math.max(0.3, clip.durationSec * 0.5)
    ) {
      const actual = Number(video.duration.toFixed(2));
      setDuration(actual);
      if (!hasUserTrimmedRef.current) {
        setTrimStart(0);
        setTrimEnd(actual);
      } else {
        const clamped = clampTrimRange(trimStart, trimEnd, actual, 0.5);
        setTrimStart(clamped.start);
        setTrimEnd(clamped.end);
      }
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const now = video.currentTime;
    setCurrentTime(now);

    // If auditioning a specific cut via "Hear", play straight through the cut without skipping,
    // then pause neatly right after the cut ends.
    if (auditionEndRef.current !== null) {
      if (now >= auditionEndRef.current - 0.03) {
        video.pause();
        auditionEndRef.current = null;
      }
      return;
    }

    if (skipCutsInPreview && !video.paused) {
      const nav = findNextPlayableTime(now, trimStart, trimEnd, cuts);
      if (nav.action === 'jump') {
        video.currentTime = nav.targetTime;
        setCurrentTime(nav.targetTime);
      } else if (nav.action === 'stop') {
        video.pause();
        video.currentTime = nav.targetTime;
        setCurrentTime(nav.targetTime);
      }
      return;
    }

    if (now < trimStart - 0.05) {
      video.currentTime = trimStart;
    } else if (now >= trimEnd) {
      video.pause();
      video.currentTime = trimStart;
    }
  };

  const handleSeek = (timeSec: number) => {
    auditionEndRef.current = null;
    const clamped = Math.max(0, Math.min(duration, timeSec));
    setCurrentTime(clamped);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  };

  const handleStartChange = (nextStart: number) => {
    hasUserTrimmedRef.current = true;
    const clamped = clampTrimRange(nextStart, trimEnd, duration, 0.5);
    setTrimStart(clamped.start);
    setTrimEnd(clamped.end);
    handleSeek(clamped.start);
  };

  const handleEndChange = (nextEnd: number) => {
    hasUserTrimmedRef.current = true;
    const clamped = clampTrimRange(trimStart, nextEnd, duration, 0.5);
    setTrimStart(clamped.start);
    setTrimEnd(clamped.end);
    handleSeek(Math.max(clamped.start, clamped.end - 0.15));
  };

  const handlePreviewEdited = () => {
    const video = videoRef.current;
    if (!video) return;
    auditionEndRef.current = null;
    const firstStart = timelineSummary.keptSegments[0]?.start ?? trimStart;
    video.currentTime = firstStart;
    setCurrentTime(firstStart);
    void video.play().catch(() => {});
  };

  const handlePreviewAroundCut = (cut: TimelineCut) => {
    const video = videoRef.current;
    if (!video) return;
    setSelectedCutId(cut.id);
    const startAt = Math.max(0, cut.start - 0.45);
    auditionEndRef.current = Math.min(duration, cut.end + 0.35);
    video.currentTime = startAt;
    setCurrentTime(startAt);
    void video.play().catch(() => {});
  };

  const handleResetEdits = () => {
    auditionEndRef.current = null;
    hasUserTrimmedRef.current = false;
    setTrimStart(0);
    setTrimEnd(duration);
    setCuts([]);
    setAutoRemoveSilences(false);
    setAutoDetectRepetitions(false);
    setSelectedCutId(null);
    handleSeek(0);
  };

  const activeFormatMeta =
    EXPORT_FORMAT_OPTIONS.find((f) => f.id === selectedFormat) ?? EXPORT_FORMAT_OPTIONS[0];
  const activeResMeta =
    RESOLUTION_PRESET_OPTIONS.find((r) => r.id === selectedResolution) ??
    RESOLUTION_PRESET_OPTIONS[2];

  const isTrimmed = trimStart > 0.08 || trimEnd < Math.max(0, duration - 0.08);
  const hasActiveCuts = timelineSummary.activeCutCount > 0;
  const isEdited = isTrimmed || hasActiveCuts;
  const effectiveDuration = Math.max(0.2, timelineSummary.editedDuration);

  const outputDims =
    selectedFormat === 'wav'
      ? { width: 0, height: 0 }
      : selectedFormat === 'gif'
        ? computeGifDimensions(clip.aspectRatio, selectedResolution)
        : getCanvasDimensions(clip.aspectRatio, selectedResolution);

  const isInstantDownload =
    !isEdited &&
    selectedFormat === clip.extension &&
    outputDims.width === clip.width &&
    outputDims.height === clip.height;

  const estimatedMb = isInstantDownload
    ? (clip.blob.size / (1024 * 1024)).toFixed(2)
    : `~${estimateExportSizeMb(effectiveDuration, selectedFormat, selectedResolution).toFixed(1)}`;

  const handleDownload = async () => {
    setExportError(null);
    setExportSuccessNote(null);
    if (timelineSummary.keptSegments.length === 0) {
      setExportError(
        'Every part of the clip is currently cut. Keep at least one segment to export.'
      );
      return;
    }

    const stamp = new Date(clip.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const sizeTag = selectedFormat === 'wav' ? 'audio' : activeResMeta.shortLabel.toLowerCase();
    const editTag = hasActiveCuts ? '-edited' : isTrimmed ? '-trimmed' : '';

    if (isInstantDownload) {
      const filename = `ntk-cam-studio-${sizeTag}-${stamp}.${clip.extension}`;
      try {
        const { savedPath } = await saveBlobToDevice(clip.blob, filename);
        setExportSuccessNote(savedPath ? `Saved to ${savedPath}` : `Downloaded ${filename}`);
        onExportComplete?.();
      } catch (err) {
        setExportError(err instanceof Error ? err.message : `Could not save ${filename}.`);
      }
      return;
    }

    setIsExporting(true);
    setExportProgress(5);
    setExportStage(`Preparing ${activeFormatMeta.label} export…`);

    try {
      const result = await exportRecordedClip({
        clip,
        format: selectedFormat,
        resolution: selectedResolution,
        trimStart,
        trimEnd: Math.max(trimStart + 0.25, trimEnd),
        keptSegments: timelineSummary.keptSegments,
        onProgress: (pct, stageLabel) => {
          setExportProgress(pct);
          if (stageLabel) setExportStage(stageLabel);
        },
      });
      const filename = `ntk-cam-studio-${sizeTag}${editTag}-${stamp}.${result.extension}`;
      const { savedPath } = await saveBlobToDevice(result.blob, filename);
      const baseNote = savedPath ? `Saved to ${savedPath}` : `Downloaded ${filename}`;
      setExportSuccessNote(result.note ? `${baseNote} · ${result.note}` : baseNote);
      onExportComplete?.();
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : `Could not export as ${activeFormatMeta.label}. Please try WebM or another size.`
      );
    } finally {
      setIsExporting(false);
    }
  };

  const recordedSizeMb = (clip.blob.size / (1024 * 1024)).toFixed(2);
  const downloadLabel =
    selectedFormat === 'wav'
      ? 'Download WAV Audio'
      : `Download ${activeFormatMeta.label} (${activeResMeta.shortLabel})`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onClick={() => {
        if (!isExporting) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-950/70 dark:bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl rounded-t-3xl sm:rounded-xl bg-white dark:bg-[#12141A] border border-slate-200 dark:border-[#272B35] shadow-2xl overflow-hidden flex flex-col max-h-[95dvh] pb-safe sm:pb-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-[#222630] shrink-0 gap-3">
          <div className="min-w-0">
            <h2
              id="export-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-white truncate"
            >
              Edit, Clean & Export Recording
            </h2>
            <p
              data-testid="edit-summary-header"
              className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate"
            >
              Original {formatTimecode(duration, true)} → Edited{' '}
              <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                {formatTimecode(effectiveDuration, true)}
              </span>
              {timelineSummary.savedDuration >= 0.1 && (
                <span className="text-amber-700 dark:text-amber-300">
                  {' '}
                  (−{timelineSummary.savedDuration.toFixed(1)}s removed)
                </span>
              )}{' '}
              · {clip.width}×{clip.height} · {recordedSizeMb} MB
            </p>
          </div>

          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            aria-label="Close export preview"
            className="w-9 h-9 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 space-y-3 overflow-y-auto studio-scroll">
          {/* Video Preview + Waveform Strip */}
          <div className="space-y-2.5">
            <div className="w-full rounded-lg bg-slate-950 dark:bg-[#08090C] border border-slate-200 dark:border-white/10 overflow-hidden flex items-center justify-center max-h-[24vh]">
              <video
                ref={videoRef}
                src={clip.url}
                controls
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => {
                  auditionEndRef.current = null;
                }}
                className="max-h-[24vh] w-auto max-w-full"
              />
            </div>

            {/* Interactive Audio Waveform & Cut Map */}
            <WaveformTimeline
              duration={duration}
              currentTime={currentTime}
              trimStart={trimStart}
              trimEnd={trimEnd}
              waveformPeaks={audioAnalysis?.waveformPeaks ?? []}
              cuts={cuts}
              selectedCutId={selectedCutId}
              hasAudio={Boolean(audioAnalysis?.hasAudibleSignal)}
              onSeek={handleSeek}
              onSelectCut={setSelectedCutId}
            />

            {/* Quick Playback & Mode Tabs Row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div
                role="tablist"
                aria-label="Editor sections"
                className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'edit'}
                  onClick={() => setActiveTab('edit')}
                  className={`h-8 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'edit'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <Scissors className="w-3.5 h-3.5" />
                  Clean & Edit Cuts
                  {timelineSummary.activeCutCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-black/20 dark:bg-black/25 text-[10px] font-mono">
                      {timelineSummary.activeCutCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'export'}
                  onClick={() => setActiveTab('export')}
                  className={`h-8 px-3 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    activeTab === 'export'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  }`}
                >
                  <FileVideo className="w-3.5 h-3.5" />
                  Format & Size ({activeFormatMeta.label} · {activeResMeta.shortLabel})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={skipCutsInPreview}
                    onChange={(e) => {
                      auditionEndRef.current = null;
                      setSkipCutsInPreview(e.target.checked);
                    }}
                    className="accent-blue-600 dark:accent-blue-500 rounded cursor-pointer"
                  />
                  Skip cuts in preview
                </label>

                <button
                  type="button"
                  onClick={handlePreviewEdited}
                  className="h-8 px-2.5 rounded-md bg-slate-100 hover:bg-slate-200/80 dark:bg-[#232733] dark:hover:bg-[#2C3140] border border-slate-200 dark:border-transparent text-xs font-medium text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 transition-colors"
                >
                  <Play className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  Preview Edited
                </button>
              </div>
            </div>
          </div>

          {activeTab === 'edit' ? (
            <div className="space-y-3">
              {/* Rule-Based Auto-Clean Controls (Zero AI) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Rule Card 1: Automatic Rule-Based Silence Removal */}
                <section className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <VolumeX className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Rule-Based Silence Removal</span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoRemoveSilences}
                        disabled={!audioAnalysis?.hasAudibleSignal}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAutoRemoveSilences(next);
                          runSilenceDetection(silenceRules, next);
                        }}
                        aria-label="Auto-remove silences"
                        className="accent-amber-500 rounded cursor-pointer"
                      />
                      Auto
                    </label>
                  </div>

                  {isAnalyzingAudio ? (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 inline-flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin text-blue-600 dark:text-blue-400" />
                      Analyzing audio waveform…
                    </p>
                  ) : !audioAnalysis?.hasAudibleSignal ? (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      No microphone audio track found in this clip. Turn on Mic before recording to
                      auto-detect silences, or add manual cuts below.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label
                            htmlFor="silence-mindur-slider"
                            className="text-slate-600 dark:text-slate-400"
                          >
                            Remove pauses longer than
                          </label>
                          <span className="font-mono tabular-nums text-amber-700 dark:text-amber-200">
                            {silenceRules.minDurationSec.toFixed(2)}s
                          </span>
                        </div>
                        <input
                          id="silence-mindur-slider"
                          type="range"
                          min={0.25}
                          max={2.5}
                          step={0.05}
                          value={silenceRules.minDurationSec}
                          onChange={(e) =>
                            handleSilenceRuleChange({ minDurationSec: parseFloat(e.target.value) })
                          }
                          className="w-full studio-slider"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label
                            htmlFor="silence-thresh-slider"
                            className="text-slate-600 dark:text-slate-400"
                          >
                            Silence threshold
                          </label>
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {silenceRules.thresholdDb} dB
                          </span>
                        </div>
                        <input
                          id="silence-thresh-slider"
                          type="range"
                          min={-55}
                          max={-18}
                          step={1}
                          value={silenceRules.thresholdDb}
                          onChange={(e) =>
                            handleSilenceRuleChange({ thresholdDb: parseInt(e.target.value, 10) })
                          }
                          className="w-full studio-slider"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label
                            htmlFor="silence-pad-slider"
                            className="text-slate-600 dark:text-slate-400"
                          >
                            Keep breath padding
                          </label>
                          <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {Math.round(silenceRules.paddingSec * 1000)} ms
                          </span>
                        </div>
                        <input
                          id="silence-pad-slider"
                          type="range"
                          min={0}
                          max={0.35}
                          step={0.02}
                          value={silenceRules.paddingSec}
                          onChange={(e) =>
                            handleSilenceRuleChange({ paddingSec: parseFloat(e.target.value) })
                          }
                          className="w-full studio-slider"
                        />
                      </div>
                    </div>
                  )}
                </section>

                {/* Rule Card 2: Automatic Rule-Based Repetition Detection (Zero AI) */}
                <section className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36] space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      <Repeat className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                      <span>Rule-Based Repetition Detector</span>
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoDetectRepetitions}
                        disabled={!audioAnalysis?.hasAudibleSignal}
                        onChange={(e) => {
                          const next = e.target.checked;
                          setAutoDetectRepetitions(next);
                          runRepetitionDetection(repetitionRules, next);
                        }}
                        aria-label="Auto-detect repetitions"
                        className="accent-rose-500 rounded cursor-pointer"
                      />
                      Auto
                    </label>
                  </div>

                  {!audioAnalysis?.hasAudibleSignal ? (
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      Compares speech cadence & acoustic rhythm locally (rule-based, no AI) to flag
                      repeated phrases and false starts once Mic audio is recorded.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <label
                            htmlFor="rep-sens-slider"
                            className="text-slate-600 dark:text-slate-400"
                          >
                            Match threshold (strictness)
                          </label>
                          <span className="font-mono tabular-nums text-rose-700 dark:text-rose-200">
                            {Math.round(repetitionRules.sensitivity * 100)}%
                          </span>
                        </div>
                        <input
                          id="rep-sens-slider"
                          type="range"
                          min={0.55}
                          max={0.92}
                          step={0.02}
                          value={repetitionRules.sensitivity}
                          onChange={(e) =>
                            handleRepetitionRuleChange({
                              sensitivity: parseFloat(e.target.value),
                            })
                          }
                          className="w-full studio-slider"
                        />
                      </div>

                      <div className="space-y-1">
                        <span className="block text-[11px] text-slate-600 dark:text-slate-400">
                          When a phrase is repeated
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {(
                            [
                              { id: 'last', label: 'Keep Last Take' },
                              { id: 'first', label: 'Keep First Take' },
                            ] as const
                          ).map((opt) => {
                            const active = repetitionRules.keepTake === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => handleRepetitionRuleChange({ keepTake: opt.id })}
                                className={`h-8 rounded-md text-[11px] font-medium border transition-colors ${
                                  active
                                    ? 'bg-rose-50 border-rose-500 text-rose-800 dark:bg-rose-500/20 dark:border-rose-500/60 dark:text-white'
                                    : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-[#12151C] dark:border-[#272B35] dark:text-slate-400 dark:hover:text-slate-200'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500 leading-snug">
                        Uses local acoustic pattern & cadence matching (100% rule-based, no AI) to
                        flag repeated lines and false starts.
                      </p>
                    </div>
                  )}
                </section>
              </div>

              {/* Editable Cut List — Inspect, Keep/Cut, Fine-Tune Edges, or Add Manual Cuts */}
              <section className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Detected & Manual Cuts</span>
                    <span
                      data-testid="cut-count-badge"
                      className="text-[11px] font-mono font-normal text-slate-500 dark:text-slate-400"
                    >
                      {timelineSummary.silenceCutCount} silence ·{' '}
                      {timelineSummary.repetitionCutCount} repetition ·{' '}
                      {timelineSummary.manualCutCount} manual
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleAddManualCut}
                      className="h-8 px-2.5 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-600/20 dark:hover:bg-blue-600/30 border border-blue-400 dark:border-blue-500/45 text-xs font-medium text-blue-700 dark:text-blue-100 inline-flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Manual Cut
                    </button>
                    {(cuts.length > 0 || isTrimmed) && (
                      <button
                        type="button"
                        onClick={handleResetEdits}
                        className="h-8 px-2.5 rounded-md bg-white hover:bg-slate-100 dark:bg-transparent dark:hover:bg-white/5 border border-slate-300 dark:border-[#2E3340] text-xs text-slate-700 dark:text-slate-300 inline-flex items-center gap-1 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset All
                      </button>
                    )}
                  </div>
                </div>

                {cuts.length === 0 ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#252934] rounded-lg px-3 py-2.5">
                    No silences or repetitions are flagged with the current rules. Lower the minimum
                    pause length or click{' '}
                    <span className="text-slate-900 dark:text-slate-200 font-medium">
                      Add Manual Cut
                    </span>{' '}
                    to remove any section yourself.
                  </p>
                ) : (
                  <div
                    data-testid="cuts-list"
                    className="space-y-1.5 max-h-44 overflow-y-auto pr-1 studio-scroll"
                  >
                    {cuts.map((cut) => {
                      const isSelected = selectedCutId === cut.id;
                      const span = Math.max(0, cut.end - cut.start);
                      const badgeClass =
                        cut.reason === 'silence'
                          ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40'
                          : cut.reason === 'repetition'
                            ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/20 dark:text-rose-200 dark:border-rose-500/40'
                            : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/20 dark:text-red-200 dark:border-red-500/40';

                      return (
                        <div
                          key={cut.id}
                          onClick={() => setSelectedCutId(cut.id)}
                          className={`p-2 rounded-lg border flex flex-wrap items-center justify-between gap-2 transition-colors ${
                            isSelected
                              ? 'bg-blue-50/70 dark:bg-[#1D2230] border-blue-500/70'
                              : 'bg-white dark:bg-[#12151C] border-slate-200 dark:border-[#252A36] hover:border-slate-300 dark:hover:border-[#343B4C]'
                          } ${!cut.enabled ? 'opacity-65' : ''}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${badgeClass}`}
                            >
                              {cut.reason}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                                {cut.label}
                                {cut.confidence !== undefined && (
                                  <span className="ml-1.5 text-[10px] font-mono text-rose-700 dark:text-rose-300">
                                    {cut.confidence}% match
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                                {formatTimecode(cut.start, true)} — {formatTimecode(cut.end, true)} (
                                {span.toFixed(2)}s)
                              </div>
                            </div>
                          </div>

                          {/* Per-Cut Precision Edit Controls */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Fine-tune Start edge */}
                            <div className="inline-flex items-center rounded bg-slate-100 dark:bg-[#181C26] border border-slate-200 dark:border-[#2B3140]">
                              <span className="px-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                In
                              </span>
                              <button
                                type="button"
                                aria-label={`Move ${cut.label} start earlier`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNudgeCutEdge(cut.id, 'start', -0.1);
                                }}
                                className="w-6 h-6 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 flex items-center justify-center"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${cut.label} start later`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNudgeCutEdge(cut.id, 'start', 0.1);
                                }}
                                className="w-6 h-6 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {/* Fine-tune End edge */}
                            <div className="inline-flex items-center rounded bg-slate-100 dark:bg-[#181C26] border border-slate-200 dark:border-[#2B3140]">
                              <span className="px-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                Out
                              </span>
                              <button
                                type="button"
                                aria-label={`Move ${cut.label} end earlier`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNudgeCutEdge(cut.id, 'end', -0.1);
                                }}
                                className="w-6 h-6 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 flex items-center justify-center"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Move ${cut.label} end later`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNudgeCutEdge(cut.id, 'end', 0.1);
                                }}
                                className="w-6 h-6 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 flex items-center justify-center"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <button
                              type="button"
                              aria-label={`Preview ${cut.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreviewAroundCut(cut);
                              }}
                              className="h-6 px-2 rounded bg-slate-100 hover:bg-slate-200 dark:bg-[#1E2330] dark:hover:bg-[#2A3042] text-[11px] text-slate-800 dark:text-slate-200 inline-flex items-center gap-1"
                            >
                              <Play className="w-2.5 h-2.5" />
                              Hear
                            </button>

                            <button
                              type="button"
                              aria-pressed={cut.enabled}
                              aria-label={
                                cut.enabled
                                  ? `Keep ${cut.label} in video`
                                  : `Remove ${cut.label} from video`
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleCutEnabled(cut.id);
                              }}
                              className={`h-6 px-2 rounded text-[11px] font-medium inline-flex items-center gap-1 border transition-colors ${
                                cut.enabled
                                  ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100 dark:bg-red-500/20 dark:border-red-500/45 dark:text-red-200 dark:hover:bg-red-500/30'
                                  : 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-200 dark:hover:bg-emerald-500/25'
                              }`}
                            >
                              {cut.enabled ? (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  Cut
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3 h-3" />
                                  Kept
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              aria-label={`Delete ${cut.label}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteCut(cut.id);
                              }}
                              className="w-6 h-6 rounded text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-500/15 flex items-center justify-center"
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

              {/* Outer Start / End Trim Sliders */}
              <section className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36] space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                  <span>Trim Start & End</span>
                  <span className="font-mono tabular-nums font-normal text-slate-500 dark:text-slate-400">
                    {formatTimecode(trimStart, true)} — {formatTimecode(trimEnd, true)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="trim-start-slider"
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        Start time
                      </label>
                      <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatTimecode(trimStart, true)}
                      </span>
                    </div>
                    <input
                      id="trim-start-slider"
                      type="range"
                      min={0}
                      max={Math.max(0.5, duration)}
                      step={0.1}
                      value={trimStart}
                      onChange={(e) => handleStartChange(parseFloat(e.target.value))}
                      className="w-full studio-slider"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="trim-end-slider"
                        className="text-[11px] text-slate-600 dark:text-slate-400"
                      >
                        End time
                      </label>
                      <span className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatTimecode(trimEnd, true)}
                      </span>
                    </div>
                    <input
                      id="trim-end-slider"
                      type="range"
                      min={0}
                      max={Math.max(0.5, duration)}
                      step={0.1}
                      value={trimEnd}
                      onChange={(e) => handleEndChange(parseFloat(e.target.value))}
                      className="w-full studio-slider"
                    />
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Export Format Picker (MP4, WebM, MKV, GIF, WAV) */}
              <section className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <FileVideo className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>File Format</span>
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {activeFormatMeta.description}
                  </span>
                </div>

                <div
                  role="group"
                  aria-label="Export file format"
                  className="grid grid-cols-3 sm:grid-cols-5 gap-2"
                >
                  {EXPORT_FORMAT_OPTIONS.map((fmt) => {
                    const active = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        disabled={isExporting}
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedFormat(fmt.id);
                          setExportError(null);
                          setExportSuccessNote(null);
                        }}
                        className={`min-h-[48px] px-2.5 py-2 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                          active
                            ? 'bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-600/20 dark:border-blue-500/75 dark:text-white'
                            : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950 hover:border-slate-300 dark:bg-[#12151C] dark:border-[#272B35] dark:text-slate-300 dark:hover:text-white dark:hover:border-[#373D4C]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold font-mono">{fmt.label}</span>
                          {fmt.badge && (
                            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-500/25 dark:text-blue-200">
                              {fmt.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          .{fmt.extension}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Export Resolution / Size Picker (4K, 1440p, 1080p, 720p, 480p, 360p) */}
              <section className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#171A22] border border-slate-200 dark:border-[#262B36] space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {selectedFormat === 'wav' ? (
                      <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    )}
                    <span>Video Size (Resolution)</span>
                  </div>
                  <span
                    data-testid="export-output-summary"
                    className="text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-300"
                  >
                    {selectedFormat === 'wav'
                      ? `Audio only · ${estimatedMb} MB`
                      : `${outputDims.width}×${outputDims.height} · ${estimatedMb} MB`}
                  </span>
                </div>

                {selectedFormat === 'wav' ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-[#12151C] border border-slate-200 dark:border-[#252934] rounded-lg px-3 py-2.5">
                    WAV exports uncompressed 16-bit studio audio with all silences and repetitions
                    spliced cleanly out.
                  </p>
                ) : (
                  <div
                    role="group"
                    aria-label="Export video resolution"
                    className="grid grid-cols-3 sm:grid-cols-6 gap-2"
                  >
                    {RESOLUTION_PRESET_OPTIONS.map((res) => {
                      const active = selectedResolution === res.id;
                      const dims =
                        selectedFormat === 'gif'
                          ? computeGifDimensions(clip.aspectRatio, res.id)
                          : getCanvasDimensions(clip.aspectRatio, res.id);
                      return (
                        <button
                          key={res.id}
                          type="button"
                          disabled={isExporting}
                          aria-pressed={active}
                          aria-label={`Export size ${res.label} (${dims.width} by ${dims.height})`}
                          onClick={() => {
                            setSelectedResolution(res.id);
                            setExportError(null);
                            setExportSuccessNote(null);
                          }}
                          className={`min-h-[54px] px-2 py-2 rounded-lg border text-center flex flex-col items-center justify-center gap-0.5 transition-colors disabled:opacity-50 ${
                            active
                              ? 'bg-blue-50 border-blue-500 text-blue-950 dark:bg-blue-600/20 dark:border-blue-500/75 dark:text-white'
                              : 'bg-white border-slate-200 text-slate-700 hover:text-slate-950 hover:border-slate-300 dark:bg-[#12151C] dark:border-[#272B35] dark:text-slate-300 dark:hover:text-white dark:hover:border-[#373D4C]'
                          }`}
                        >
                          <span className="text-xs font-semibold font-mono">{res.shortLabel}</span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {dims.width}×{dims.height}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Progress Bar while transcoding */}
          {isExporting && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs text-blue-900 dark:text-blue-100">
                <span>{exportStage || `Exporting ${activeFormatMeta.label}…`}</span>
                <span className="font-mono tabular-nums">{exportProgress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-blue-200 dark:bg-blue-950 overflow-hidden">
                <div
                  className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-150"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {exportSuccessNote && (
            <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{exportSuccessNote}</span>
            </p>
          )}

          {exportError && (
            <p className="text-xs text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-lg px-3 py-2">
              {exportError}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-200 dark:border-[#222630] bg-slate-50 dark:bg-[#0F1117] shrink-0">
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="h-10 px-4 rounded-lg bg-white hover:bg-slate-100 dark:bg-[#1A1D24] dark:hover:bg-[#232733] disabled:opacity-50 border border-slate-300 dark:border-[#2A2F3B] text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
          >
            Record Another
          </button>

          <button
            type="button"
            disabled={isExporting}
            onClick={() => void handleDownload()}
            className="h-10 px-5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Exporting ({exportProgress}%)
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                {downloadLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
