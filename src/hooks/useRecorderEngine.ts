import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AspectRatio,
  RecordedClip,
  RecordingStatus,
  VideoResolutionPreset,
} from '../types/studio';
import {
  getRecommendedVideoBitrate,
  selectBestVideoMimeType,
} from '../utils/compositorMath';

interface UseRecorderEngineOptions {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  aspectRatio: AspectRatio;
  resolution: VideoResolutionPreset;
  micStream: MediaStream | null;
  screenStream: MediaStream | null;
  onRecordingComplete: (clip: RecordedClip) => void;
  onError: (message: string) => void;
}

export interface RecorderEngineState {
  status: RecordingStatus;
  countdown: number;
  elapsedSec: number;
  startRecording: () => void;
  cancelCountdown: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
}

export function useRecorderEngine({
  canvasRef,
  aspectRatio,
  resolution,
  micStream,
  screenStream,
  onRecordingComplete,
  onError,
}: UseRecorderEngineOptions): RecorderEngineState {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [countdown, setCountdown] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mixedAudioCtxRef = useRef<AudioContext | null>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef<number>(0);
  const segmentStartMsRef = useRef<number>(0);
  const stoppingRef = useRef<boolean>(false);
  const unmountedRef = useRef<boolean>(false);
  const latestOptsRef = useRef({
    aspectRatio,
    resolution,
    micStream,
    screenStream,
    onRecordingComplete,
    onError,
  });
  latestOptsRef.current = {
    aspectRatio,
    resolution,
    micStream,
    screenStream,
    onRecordingComplete,
    onError,
  };
  const activeMimeRef = useRef<{ mimeType: string; extension: 'webm' | 'mp4' | 'mkv' }>({
    mimeType: 'video/webm',
    extension: 'webm',
  });

  const cleanupTimers = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  };

  const cleanupRecordingResources = () => {
    if (capturedStreamRef.current) {
      capturedStreamRef.current.getTracks().forEach((t) => t.stop());
      capturedStreamRef.current = null;
    }
    if (mixedAudioCtxRef.current && mixedAudioCtxRef.current.state !== 'closed') {
      void mixedAudioCtxRef.current.close();
      mixedAudioCtxRef.current = null;
    }
  };

  const beginMediaRecorder = useCallback(() => {
    const {
      aspectRatio: curAspectRatio,
      resolution: curResolution,
      micStream: curMicStream,
      screenStream: curScreenStream,
      onRecordingComplete: handleComplete,
      onError: handleError,
    } = latestOptsRef.current;

    const canvas = canvasRef.current;
    if (!canvas) {
      handleError('Preview stage is not ready to record.');
      setStatus('idle');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      handleError('MediaRecorder is not supported in this browser.');
      setStatus('idle');
      return;
    }

    stoppingRef.current = false;

    try {
      const canvasStream = canvas.captureStream(30);
      const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

      // Mix microphone + optional screen audio cleanly via Web Audio API
      const micAudioTracks = curMicStream?.getAudioTracks().filter((t) => t.readyState === 'live') ?? [];
      const screenAudioTracks =
        curScreenStream?.getAudioTracks().filter((t) => t.readyState === 'live') ?? [];

      if (micAudioTracks.length > 0 || screenAudioTracks.length > 0) {
        try {
          const AudioContextCtor =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const audioCtx = new AudioContextCtor();
          if (audioCtx.state === 'suspended') {
            void audioCtx.resume().catch(() => {});
          }
          const destination = audioCtx.createMediaStreamDestination();

          if (micAudioTracks.length > 0) {
            const micSource = audioCtx.createMediaStreamSource(new MediaStream(micAudioTracks));
            micSource.connect(destination);
          }
          if (screenAudioTracks.length > 0) {
            const sysSource = audioCtx.createMediaStreamSource(new MediaStream(screenAudioTracks));
            sysSource.connect(destination);
          }

          mixedAudioCtxRef.current = audioCtx;
          destination.stream.getAudioTracks().forEach((track) => tracks.push(track));
        } catch {
          // Fallback: attach raw mic track directly if AudioContext mixing fails
          if (micAudioTracks[0]) {
            tracks.push(micAudioTracks[0].clone());
          }
        }
      }

      const combinedStream = new MediaStream(tracks);
      capturedStreamRef.current = combinedStream;

      const hasAudio = tracks.some((t) => t.kind === 'audio');
      const selected = selectBestVideoMimeType(
        (mime) => MediaRecorder.isTypeSupported(mime),
        'mp4',
        hasAudio
      );
      activeMimeRef.current = selected;

      const options: MediaRecorderOptions = {
        videoBitsPerSecond: getRecommendedVideoBitrate(curResolution),
      };
      if (MediaRecorder.isTypeSupported(selected.mimeType)) {
        options.mimeType = selected.mimeType;
      }

      const recorder = new MediaRecorder(combinedStream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        cleanupTimers();
        cleanupRecordingResources();
        recorderRef.current = null;
        stoppingRef.current = false;

        if (unmountedRef.current) {
          chunksRef.current = [];
          return;
        }

        const totalDurationSec = Math.max(0.2, accumulatedMsRef.current / 1000);
        const mimeType = recorder.mimeType || activeMimeRef.current.mimeType;
        const extension: 'webm' | 'mp4' | 'mkv' = mimeType.includes('mp4')
          ? 'mp4'
          : mimeType.includes('matroska')
            ? 'mkv'
            : 'webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);

        const width = canvas.width;
        const height = canvas.height;

        setStatus('idle');
        setElapsedSec(0);

        handleComplete({
          blob,
          url,
          mimeType,
          extension,
          durationSec: Number(totalDurationSec.toFixed(2)),
          width,
          height,
          aspectRatio: curAspectRatio,
          resolution: curResolution,
          createdAt: Date.now(),
        });
      };

      recorder.onerror = () => {
        cleanupTimers();
        cleanupRecordingResources();
        recorderRef.current = null;
        stoppingRef.current = false;
        if (unmountedRef.current) return;
        setStatus('idle');
        handleError('Recording stopped unexpectedly due to an encoder error.');
      };

      recorderRef.current = recorder;
      accumulatedMsRef.current = 0;
      segmentStartMsRef.current = performance.now();
      setElapsedSec(0);

      recorder.start(250);
      setStatus('recording');

      // Immediately request an initial frame so static slides always emit keyframe data on millisecond 0
      const firstVideoTrack = canvasStream.getVideoTracks()[0] as
        | (MediaStreamTrack & { requestFrame?: () => void })
        | undefined;
      if (firstVideoTrack?.requestFrame) {
        try {
          firstVideoTrack.requestFrame();
        } catch {
          // ignore
        }
      }

      elapsedTimerRef.current = window.setInterval(() => {
        const nowMs = accumulatedMsRef.current + (performance.now() - segmentStartMsRef.current);
        setElapsedSec(nowMs / 1000);
      }, 100);
    } catch (err) {
      cleanupTimers();
      cleanupRecordingResources();
      stoppingRef.current = false;
      setStatus('idle');
      const message = err instanceof Error ? err.message : 'Unable to start MediaRecorder.';
      handleError(`Could not start recording: ${message}`);
    }
  }, [canvasRef]);

  const startRecording = useCallback(() => {
    if (status !== 'idle') return;
    setStatus('countdown');
    setCountdown(3);

    let remaining = 3;
    countdownTimerRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
      } else {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(0);
        beginMediaRecorder();
      }
    }, 1000);
  }, [beginMediaRecorder, status]);

  const cancelCountdown = useCallback(() => {
    if (status !== 'countdown') return;
    cleanupTimers();
    setCountdown(0);
    setStatus('idle');
  }, [status]);

  const pauseRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || status !== 'recording') return;
    if (recorder.state === 'recording') {
      recorder.pause();
      accumulatedMsRef.current += performance.now() - segmentStartMsRef.current;
      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      setElapsedSec(accumulatedMsRef.current / 1000);
      setStatus('paused');
    }
  }, [status]);

  const resumeRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || status !== 'paused') return;
    if (recorder.state === 'paused') {
      recorder.resume();
      segmentStartMsRef.current = performance.now();
      elapsedTimerRef.current = window.setInterval(() => {
        const nowMs = accumulatedMsRef.current + (performance.now() - segmentStartMsRef.current);
        setElapsedSec(nowMs / 1000);
      }, 100);
      setStatus('recording');
    }
  }, [status]);

  const stopRecording = useCallback(() => {
    if (stoppingRef.current) return;
    const recorder = recorderRef.current;
    if (!recorder) {
      cleanupTimers();
      stoppingRef.current = false;
      setStatus('idle');
      return;
    }
    stoppingRef.current = true;
    if (status === 'recording') {
      accumulatedMsRef.current += performance.now() - segmentStartMsRef.current;
    }
    if (recorder.state === 'recording' || recorder.state === 'paused') {
      try {
        if (recorder.state === 'recording') {
          recorder.requestData();
        }
      } catch {
        // ignore browsers that disallow requestData right before stop
      }
      recorder.stop();
    } else {
      stoppingRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      cleanupTimers();
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupRecordingResources();
    };
  }, []);

  return {
    status,
    countdown,
    elapsedSec,
    startRecording,
    cancelCountdown,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}
