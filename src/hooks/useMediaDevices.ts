import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaPermissionIssue } from '../types/studio';
import {
  extractScreenShareInfoFromStream,
  parseScreenShareInfo,
  type ScreenShareInfo,
} from '../utils/stageMonitor';

export interface MediaDevicesState {
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  selectedVideoId: string;
  selectedAudioId: string;
  cameraStream: MediaStream | null;
  micStream: MediaStream | null;
  screenStream: MediaStream | null;
  cameraActive: boolean;
  micActive: boolean;
  screenActive: boolean;
  screenShareInfo: ScreenShareInfo;
  micAnalyser: AnalyserNode | null;
  audioLevel: number; // 0 to 1
  permissionIssue: MediaPermissionIssue | null;
  dismissIssue: () => void;
  setSelectedVideoId: (deviceId: string) => void;
  setSelectedAudioId: (deviceId: string) => void;
  enableCamera: (deviceId?: string) => Promise<boolean>;
  disableCamera: () => void;
  enableMic: (deviceId?: string) => Promise<boolean>;
  disableMic: () => void;
  startScreenShare: () => Promise<boolean>;
  stopScreenShare: () => void;
  refreshDevices: () => Promise<void>;
}

function describeMediaError(
  source: 'camera' | 'microphone' | 'screen',
  err: unknown
): string {
  const error = err as { name?: string; message?: string };
  const label =
    source === 'camera'
      ? 'Camera'
      : source === 'microphone'
        ? 'Microphone'
        : 'Screen share';

  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
    if (source === 'screen') {
      return 'Screen sharing was cancelled or blocked. Click "Share Screen" whenever you are ready.';
    }
    return `${label} access was denied. Allow ${label.toLowerCase()} permissions in your browser address bar, then retry.`;
  }
  if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
    return `No ${label.toLowerCase()} device was detected on this system.`;
  }
  if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
    return `${label} is currently in use by another application.`;
  }
  if (error?.name === 'SecurityError') {
    return `${label} capture requires a secure HTTPS or localhost context.`;
  }
  return `Unable to access ${label.toLowerCase()}: ${error?.message || 'Unknown device error.'}`;
}

export function useMediaDevices(): MediaDevicesState {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoIdState] = useState<string>('');
  const [selectedAudioId, setSelectedAudioIdState] = useState<string>('');

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenShareInfo, setScreenShareInfo] = useState<ScreenShareInfo>(() =>
    parseScreenShareInfo(null)
  );
  const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [permissionIssue, setPermissionIssue] = useState<MediaPermissionIssue | null>(null);

  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const stopTracks = (stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((t) => {
      t.onended = null;
      t.stop();
    });
  };

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const vids = devices.filter((d) => d.kind === 'videoinput');
      const auds = devices.filter((d) => d.kind === 'audioinput');
      setVideoDevices(vids);
      setAudioDevices(auds);

      setSelectedVideoIdState((prev) => {
        if (prev && vids.some((d) => d.deviceId === prev)) return prev;
        return vids[0]?.deviceId ?? '';
      });
      setSelectedAudioIdState((prev) => {
        if (prev && auds.some((d) => d.deviceId === prev)) return prev;
        return auds[0]?.deviceId ?? '';
      });
    } catch {
      // Ignore enumeration errors when permissions haven't been granted yet
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleChange = () => void refreshDevices();
    mediaDevices.addEventListener('devicechange', handleChange);
    return () => mediaDevices.removeEventListener('devicechange', handleChange);
  }, [refreshDevices]);

  const enableCamera = useCallback(
    async (deviceId?: string): Promise<boolean> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionIssue({
          source: 'camera',
          message: 'Camera capture is not supported in this browser.',
        });
        return false;
      }

      const targetId = deviceId ?? selectedVideoId;
      try {
        stopTracks(cameraStreamRef.current);
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: targetId
              ? { deviceId: { exact: targetId }, width: { ideal: 1280 }, height: { ideal: 720 } }
              : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
            audio: false,
          });
        } catch (err) {
          const errName = (err as { name?: string })?.name;
          if (targetId && (errName === 'OverconstrainedError' || errName === 'NotFoundError')) {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
              audio: false,
            });
          } else {
            throw err;
          }
        }

        cameraStreamRef.current = stream;
        setCameraStream(stream);
        setPermissionIssue((prev) => (prev?.source === 'camera' ? null : prev));

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            if (cameraStreamRef.current !== stream) return;
            stopTracks(cameraStreamRef.current);
            cameraStreamRef.current = null;
            setCameraStream(null);
          };
        }

        const activeDeviceId = videoTrack?.getSettings().deviceId;
        if (activeDeviceId) {
          setSelectedVideoIdState(activeDeviceId);
        }
        await refreshDevices();
        return true;
      } catch (err) {
        cameraStreamRef.current = null;
        setCameraStream(null);
        setPermissionIssue({
          source: 'camera',
          message: describeMediaError('camera', err),
        });
        return false;
      }
    },
    [refreshDevices, selectedVideoId]
  );

  const disableCamera = useCallback(() => {
    stopTracks(cameraStreamRef.current);
    cameraStreamRef.current = null;
    setCameraStream(null);
  }, []);

  const enableMic = useCallback(
    async (deviceId?: string): Promise<boolean> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionIssue({
          source: 'microphone',
          message: 'Microphone capture is not supported in this browser.',
        });
        return false;
      }

      const targetId = deviceId ?? selectedAudioId;
      try {
        stopTracks(micStreamRef.current);
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: targetId
              ? {
                  deviceId: { exact: targetId },
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                }
              : {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
            video: false,
          });
        } catch (err) {
          const errName = (err as { name?: string })?.name;
          if (targetId && (errName === 'OverconstrainedError' || errName === 'NotFoundError')) {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
          } else {
            throw err;
          }
        }

        micStreamRef.current = stream;
        setMicStream(stream);
        setPermissionIssue((prev) => (prev?.source === 'microphone' ? null : prev));

        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            if (micStreamRef.current !== stream) return;
            stopTracks(micStreamRef.current);
            micStreamRef.current = null;
            setMicStream(null);
            setAudioLevel(0);
          };
        }

        const activeDeviceId = audioTrack?.getSettings().deviceId;
        if (activeDeviceId) {
          setSelectedAudioIdState(activeDeviceId);
        }
        await refreshDevices();
        return true;
      } catch (err) {
        micStreamRef.current = null;
        setMicStream(null);
        setPermissionIssue({
          source: 'microphone',
          message: describeMediaError('microphone', err),
        });
        return false;
      }
    },
    [refreshDevices, selectedAudioId]
  );

  const disableMic = useCallback(() => {
    stopTracks(micStreamRef.current);
    micStreamRef.current = null;
    setMicStream(null);
    setAudioLevel(0);
  }, []);

  const startScreenShare = useCallback(async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setPermissionIssue({
        source: 'screen',
        message: 'Screen sharing is not supported in this browser.',
      });
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
        },
        audio: true,
      });

      stopTracks(screenStreamRef.current);
      screenStreamRef.current = stream;
      setScreenStream(stream);
      setPermissionIssue((prev) => (prev?.source === 'screen' ? null : prev));

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (screenStreamRef.current !== stream) return;
          stopTracks(screenStreamRef.current);
          screenStreamRef.current = null;
          setScreenStream(null);
        };
      }
      return true;
    } catch (err) {
      setPermissionIssue({
        source: 'screen',
        message: describeMediaError('screen', err),
      });
      return false;
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    stopTracks(screenStreamRef.current);
    screenStreamRef.current = null;
    setScreenStream(null);
  }, []);

  const setSelectedVideoId = useCallback(
    (deviceId: string) => {
      setSelectedVideoIdState(deviceId);
      if (cameraStreamRef.current) {
        void enableCamera(deviceId);
      }
    },
    [enableCamera]
  );

  const setSelectedAudioId = useCallback(
    (deviceId: string) => {
      setSelectedAudioIdState(deviceId);
      if (micStreamRef.current) {
        void enableMic(deviceId);
      }
    },
    [enableMic]
  );

  // Track live shared screen/window/tab metadata (updates if resolution populates after track unmute)
  useEffect(() => {
    setScreenShareInfo(extractScreenShareInfoFromStream(screenStream));
    if (!screenStream) return;

    const videoTrack = screenStream.getVideoTracks()[0];
    if (!videoTrack) return;

    const refreshInfo = () => {
      setScreenShareInfo(extractScreenShareInfoFromStream(screenStream));
    };

    videoTrack.addEventListener?.('unmute', refreshInfo);
    const timer = window.setTimeout(refreshInfo, 350);
    return () => {
      videoTrack.removeEventListener?.('unmute', refreshInfo);
      window.clearTimeout(timer);
    };
  }, [screenStream]);

  // Live microphone audio level meter + shared AnalyserNode via Web Audio API
  useEffect(() => {
    if (!micStream) {
      setAudioLevel(0);
      setMicAnalyser(null);
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let audioCtx: AudioContext | null = null;

    try {
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioContextCtor();
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume().catch(() => {});
      }
      const source = audioCtx.createMediaStreamSource(micStream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      setMicAnalyser(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      let lastUpdate = 0;

      const sample = (ts: number) => {
        if (cancelled) return;
        if (ts - lastUpdate > 45) {
          analyser.getByteTimeDomainData(data);
          let sumSquares = 0;
          for (let i = 0; i < data.length; i++) {
            const normalized = (data[i] - 128) / 128;
            sumSquares += normalized * normalized;
          }
          const rms = Math.sqrt(sumSquares / data.length);
          const boosted = Math.min(1, rms * 4.2);
          setAudioLevel(boosted);
          lastUpdate = ts;
        }
        rafId = requestAnimationFrame(sample);
      };

      rafId = requestAnimationFrame(sample);
    } catch {
      setAudioLevel(0);
      setMicAnalyser(null);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      setMicAnalyser(null);
      if (audioCtx && audioCtx.state !== 'closed') {
        void audioCtx.close();
      }
    };
  }, [micStream]);

  // Cleanup all streams on unmount
  useEffect(() => {
    return () => {
      stopTracks(cameraStreamRef.current);
      stopTracks(micStreamRef.current);
      stopTracks(screenStreamRef.current);
    };
  }, []);

  return {
    videoDevices,
    audioDevices,
    selectedVideoId,
    selectedAudioId,
    cameraStream,
    micStream,
    screenStream,
    cameraActive: Boolean(cameraStream),
    micActive: Boolean(micStream),
    screenActive: Boolean(screenStream),
    screenShareInfo,
    micAnalyser,
    audioLevel,
    permissionIssue,
    dismissIssue: () => setPermissionIssue(null),
    setSelectedVideoId,
    setSelectedAudioId,
    enableCamera,
    disableCamera,
    enableMic,
    disableMic,
    startScreenShare,
    stopScreenShare,
    refreshDevices,
  };
}
