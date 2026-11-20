import { useCallback, useEffect, useRef, useState } from 'react';
import { MediaDeviceOption, RecordingMode } from '../types/teleprompter';
import { getBestMimeType, listAvailableMediaDevices } from '../utils/media';

interface UseMediaHardwareOptions {
  mode: RecordingMode;
  videoDeviceId: string;
  audioDeviceId: string;
}

export interface CompletedRecording {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  mode: 'video-audio' | 'audio-only';
}

export function useMediaHardware({
  mode,
  videoDeviceId,
  audioDeviceId,
}: UseMediaHardwareOptions) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([]);
  const [permissionState, setPermissionState] = useState<
    'idle' | 'requesting' | 'ready' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartMsRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const activeRecordingModeRef = useRef<'video-audio' | 'audio-only'>('video-audio');

  const stopAudioMeter = useCallback(() => {
    if (meterRafRef.current !== null) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const stopStream = useCallback(() => {
    stopAudioMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, [stopAudioMeter]);

  const startAudioMeter = useCallback((mediaStream: MediaStream) => {
    stopAudioMeter();
    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(mediaStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const scaled = Math.min(100, Math.round(rms * 280));
        setAudioLevel(scaled);
        meterRafRef.current = requestAnimationFrame(update);
      };
      meterRafRef.current = requestAnimationFrame(update);
    } catch {
      // Audio meter optional if AudioContext blocked
    }
  }, [stopAudioMeter]);

  const refreshDevices = useCallback(async () => {
    try {
      const { videoDevices: v, audioDevices: a } = await listAvailableMediaDevices();
      setVideoDevices(v);
      setAudioDevices(a);
    } catch {
      // ignore enumeration errors
    }
  }, []);

  const requestHardwareStream = useCallback(
    async (overrideMode?: RecordingMode): Promise<MediaStream | null> => {
      const targetMode = overrideMode ?? mode;
      if (targetMode === 'prompter-only') {
        stopStream();
        setPermissionState('idle');
        setErrorMessage(null);
        return null;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermissionState('error');
        setErrorMessage(
          'Media capture is not supported in this browser or insecure context.'
        );
        return null;
      }

      setPermissionState('requesting');
      setErrorMessage(null);

      // Stop previous stream before requesting new device constraints
      stopStream();

      const audioConstraint: MediaTrackConstraints | boolean = audioDeviceId
        ? {
            deviceId: { exact: audioDeviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };

      const videoConstraint: MediaTrackConstraints | boolean =
        targetMode === 'video-audio'
          ? videoDeviceId
            ? {
                deviceId: { exact: videoDeviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
              }
            : {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                facingMode: 'user',
              }
          : false;

      try {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraint,
          video: videoConstraint,
        });

        streamRef.current = nextStream;
        setStream(nextStream);
        setPermissionState('ready');
        startAudioMeter(nextStream);
        await refreshDevices();
        return nextStream;
      } catch (err) {
        const error = err as DOMException;
        let friendly = 'Unable to access camera or microphone.';
        if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
          friendly =
            'Camera or microphone permission was denied. Enable access in your browser bar or switch to Prompter Only mode.';
        } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
          friendly =
            targetMode === 'video-audio'
              ? 'No camera or microphone was detected on this device. Try Audio Only or Prompter Only mode.'
              : 'No microphone was detected on this device.';
        } else if (error?.name === 'NotReadableError') {
          friendly =
            'Your camera or microphone is currently in use by another application.';
        } else if (error?.name === 'OverconstrainedError') {
          // Retry with default constraints if specific deviceId disappeared
          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: targetMode === 'video-audio',
            });
            streamRef.current = fallbackStream;
            setStream(fallbackStream);
            setPermissionState('ready');
            startAudioMeter(fallbackStream);
            await refreshDevices();
            return fallbackStream;
          } catch {
            friendly = 'Selected hardware device is unavailable.';
          }
        }
        setPermissionState('error');
        setErrorMessage(friendly);
        return null;
      }
    },
    [audioDeviceId, mode, refreshDevices, startAudioMeter, stopStream, videoDeviceId]
  );

  useEffect(() => {
    refreshDevices();
    const handleDeviceChange = () => {
      refreshDevices();
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshDevices]);

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
      stopStream();
    };
  }, [stopStream]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (mode === 'prompter-only') return false;

    let activeStream = streamRef.current;
    const needsVideo = mode === 'video-audio';
    const hasVideo = (activeStream?.getVideoTracks().length ?? 0) > 0;
    const hasAudio = (activeStream?.getAudioTracks().length ?? 0) > 0;

    if (!activeStream || !hasAudio || (needsVideo && !hasVideo)) {
      activeStream = await requestHardwareStream(mode);
    }

    if (!activeStream) return false;

    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('Recording is not supported in this browser.');
      return false;
    }

    const mimeType = getBestMimeType(mode);
    try {
      const recorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType })
        : new MediaRecorder(activeStream);

      chunksRef.current = [];
      activeRecordingModeRef.current = mode;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      accumulatedMsRef.current = 0;
      recordingStartMsRef.current = Date.now();
      setRecordingElapsed(0);
      setIsRecording(true);
      setIsRecordingPaused(false);

      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
      }
      timerIntervalRef.current = window.setInterval(() => {
        const currentElapsed =
          accumulatedMsRef.current + (Date.now() - recordingStartMsRef.current);
        setRecordingElapsed(Math.floor(currentElapsed / 1000));
      }, 250);

      return true;
    } catch {
      setErrorMessage('Could not start MediaRecorder with the active hardware stream.');
      return false;
    }
  }, [mode, requestHardwareStream]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    accumulatedMsRef.current += Date.now() - recordingStartMsRef.current;
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsRecordingPaused(true);
  }, []);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    recordingStartMsRef.current = Date.now();
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = window.setInterval(() => {
      const currentElapsed =
        accumulatedMsRef.current + (Date.now() - recordingStartMsRef.current);
      setRecordingElapsed(Math.floor(currentElapsed / 1000));
    }, 250);
    setIsRecordingPaused(false);
  }, []);

  const stopRecording = useCallback((): Promise<CompletedRecording | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false);
        setIsRecordingPaused(false);
        resolve(null);
        return;
      }

      if (timerIntervalRef.current !== null) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }

      const totalMs =
        recorder.state === 'paused'
          ? accumulatedMsRef.current
          : accumulatedMsRef.current + (Date.now() - recordingStartMsRef.current);
      const durationSeconds = Math.max(1, Math.round(totalMs / 1000));
      const resolvedMime =
        recorder.mimeType ||
        (activeRecordingModeRef.current === 'video-audio' ? 'video/webm' : 'audio/webm');

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: resolvedMime });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setIsRecordingPaused(false);
        setRecordingElapsed(0);
        resolve({
          blob,
          mimeType: resolvedMime,
          durationSeconds,
          mode: activeRecordingModeRef.current,
        });
      };

      recorder.stop();
    });
  }, []);

  return {
    stream,
    videoDevices,
    audioDevices,
    permissionState,
    errorMessage,
    audioLevel,
    isRecording,
    isRecordingPaused,
    recordingElapsed,
    requestHardwareStream,
    stopStream,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    clearError: () => setErrorMessage(null),
  };
}
