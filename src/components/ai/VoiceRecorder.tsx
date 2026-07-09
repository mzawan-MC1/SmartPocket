'use client';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Pause, Play, X, RotateCcw, Type, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  formatVoiceAudioSize,
  getPreferredVoiceRecordingMimeType,
  getVoiceAudioExtension,
  VOICE_AI_MAX_AUDIO_BYTES,
  type VoiceRecorderSubmission,
} from '@/lib/voice-ai';

export type RecordingState =
  | 'idle' |'requesting_permission' |'recording' |'paused' |'processing' |'done' |'error';

export interface VoiceRecorderProps {
  onTranscriptReady: (submission: VoiceRecorderSubmission) => void;
  onCancel: () => void;
  onSwitchToText: () => void;
  onError?: (code: 'microphone_permission_denied', message: string) => void;
  maxSeconds?: number;
  language?: string;
}

export default function VoiceRecorder({
  onTranscriptReady,
  onCancel,
  onSwitchToText,
  onError,
  maxSeconds = 120,
  language = 'en',
}: VoiceRecorderProps) {
  const { t } = useTranslation(['portal', 'common']);
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const mimeTypeRef = useRef<string>('audio/webm');

  const updateElapsed = useCallback(() => {
    const activeMs = recordingStartedAtRef.current ? (Date.now() - recordingStartedAtRef.current) : 0;
    const elapsedSeconds = Math.min(maxSeconds, Math.round((accumulatedMsRef.current + activeMs) / 1000));
    setElapsed(elapsedSeconds);
    return elapsedSeconds;
  }, [maxSeconds]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopAudioLevel = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopTimer();
    stopAudioLevel();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    analyserRef.current = null;
    chunksRef.current = [];
    recordingStartedAtRef.current = null;
    accumulatedMsRef.current = 0;
  }, [stopTimer, stopAudioLevel]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const startAudioLevelMonitor = useCallback((stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setAudioLevel(Math.min(100, (avg / 128) * 100));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } catch {
      // AudioContext not available — skip level monitoring
    }
  }, []);

  const handleRecorderError = useCallback((message: string) => {
    setErrorMessage(message);
    setState('error');
  }, []);

  const getUnsupportedRecordingMessage = useCallback(() => {
    return t('smartEntryModal.voice.errors.notSupported', { ns: 'portal' });
  }, [t]);

  const getRecordingEnvironmentError = useCallback(() => {
    if (typeof window === 'undefined' || !window.isSecureContext) {
      return getUnsupportedRecordingMessage();
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return getUnsupportedRecordingMessage();
    }

    if (typeof MediaRecorder === 'undefined') {
      return getUnsupportedRecordingMessage();
    }

    if (!getPreferredVoiceRecordingMimeType()) {
      return getUnsupportedRecordingMessage();
    }

    return null;
  }, [getUnsupportedRecordingMessage]);

  const startRecording = useCallback(async () => {
    setErrorMessage('');
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    recordingStartedAtRef.current = null;

    try {
      const environmentError = getRecordingEnvironmentError();
      if (environmentError) {
        handleRecorderError(environmentError);
        return;
      }

      setState('requesting_permission');
      const mimeType = getPreferredVoiceRecordingMimeType();
      if (!mimeType) {
        handleRecorderError(getUnsupportedRecordingMessage());
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      mimeTypeRef.current = mimeType;

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stopAudioLevel();
        stopTimer();
        setAudioLevel(0);
        if (recordingStartedAtRef.current) {
          accumulatedMsRef.current += Date.now() - recordingStartedAtRef.current;
          recordingStartedAtRef.current = null;
        }

        const durationSeconds = Math.max(0, accumulatedMsRef.current / 1000);
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || mimeType });
        const outputMimeType = blob.type || mimeTypeRef.current || mimeType;

        if (blob.size <= 0 || durationSeconds <= 0) {
          handleRecorderError(t('smartEntryModal.voice.errors.emptyAudio', { ns: 'portal' }));
          return;
        }

        if (blob.size > VOICE_AI_MAX_AUDIO_BYTES) {
          handleRecorderError(t('smartEntryModal.voice.errors.fileTooLarge', {
            ns: 'portal',
            maxSize: formatVoiceAudioSize(VOICE_AI_MAX_AUDIO_BYTES),
          }));
          return;
        }

        const file = new File(
          [blob],
          `voice-entry.${getVoiceAudioExtension(outputMimeType)}`,
          { type: outputMimeType }
        );
        setState('processing');
        onTranscriptReady({
          file,
          mimeType: outputMimeType,
          durationSeconds,
        });
      };

      recorder.start(250); // collect chunks every 250ms
      recordingStartedAtRef.current = Date.now();
      setState('recording');
      startAudioLevelMonitor(stream);

      // Start timer
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const next = updateElapsed();
        if (next >= maxSeconds) {
          stopRecording();
        }
      }, 1000);

      // Haptic feedback
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Microphone access denied';
      if (message.includes('denied') || message.includes('NotAllowed')) {
        const deniedMessage = t('smartEntryModal.voice.errors.permissionDenied', { ns: 'portal' });
        setErrorMessage(deniedMessage);
        onError?.('microphone_permission_denied', deniedMessage);
      } else if (message.includes('NotFound') || message.includes('DevicesNotFound')) {
        setErrorMessage(t('smartEntryModal.voice.errors.noMicrophone', { ns: 'portal' }));
      } else if (message.includes('NotSupported') || message.includes('MediaRecorder')) {
        setErrorMessage(t('smartEntryModal.voice.errors.notSupported', { ns: 'portal' }));
      } else {
        setErrorMessage(t('smartEntryModal.voice.errors.startFailed', { ns: 'portal' }));
      }
      setState('error');
      cleanup();
    }
  }, [cleanup, getRecordingEnvironmentError, handleRecorderError, maxSeconds, onError, onTranscriptReady, startAudioLevelMonitor, stopAudioLevel, t, updateElapsed]);

  const stopRecording = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if ('vibrate' in navigator) navigator.vibrate([50, 50, 50]);
  }, [stopTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      if (recordingStartedAtRef.current) {
        accumulatedMsRef.current += Date.now() - recordingStartedAtRef.current;
        recordingStartedAtRef.current = null;
        updateElapsed();
      }
      mediaRecorderRef.current.pause();
      stopTimer();
      stopAudioLevel();
      setState('paused');
    }
  }, [stopTimer, stopAudioLevel, updateElapsed]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      recordingStartedAtRef.current = Date.now();
      setState('recording');
      startAudioLevelMonitor(streamRef.current!);
      timerRef.current = setInterval(() => {
        const next = updateElapsed();
        if (next >= maxSeconds) stopRecording();
      }, 1000);
    }
  }, [maxSeconds, startAudioLevelMonitor, stopRecording, updateElapsed]);

  const handleCancel = useCallback(() => {
    cleanup();
    setState('idle');
    setElapsed(0);
    onCancel();
  }, [cleanup, onCancel]);

  const handleRetry = useCallback(() => {
    cleanup();
    setState('idle');
    setElapsed(0);
    setErrorMessage('');
  }, [cleanup]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const progress = (elapsed / maxSeconds) * 100;

  return (
    <div className="flex flex-col items-center gap-6 py-6 px-4">
      {/* Status label */}
      <div className="text-center">
        {state === 'idle' && (
          <p className="text-sm text-muted-foreground">
            {t('smartEntryModal.voice.status.idle', { ns: 'portal' })}
          </p>
        )}
        {state === 'requesting_permission' && (
          <p className="text-sm text-muted-foreground">
            {t('smartEntryModal.voice.status.requestingPermission', { ns: 'portal' })}
          </p>
        )}
        {state === 'recording' && (
          <p className="text-sm font-600 text-negative animate-pulse">
            {t('smartEntryModal.voice.status.recording', { ns: 'portal' })}
          </p>
        )}
        {state === 'paused' && (
          <p className="text-sm font-600 text-warning">
            {t('smartEntryModal.voice.status.paused', { ns: 'portal' })}
          </p>
        )}
        {state === 'processing' && (
          <p className="text-sm font-600 text-accent">
            {t('smartEntryModal.voice.status.processing', { ns: 'portal' })}
          </p>
        )}
        {state === 'error' && (
          <p className="text-sm font-600 text-negative">{errorMessage}</p>
        )}
      </div>

      {/* Audio level visualiser */}
      {(state === 'recording') && (
        <div className="flex items-end gap-0.5 h-10">
          {Array.from({ length: 20 }).map((_, i) => {
            const barHeight = Math.max(4, (audioLevel / 100) * 40 * (0.5 + Math.sin(i * 0.8 + Date.now() / 200) * 0.5));
            return (
              <div
                key={i}
                className="w-1.5 rounded-full bg-negative transition-all duration-75"
                style={{ height: `${barHeight}px`, opacity: 0.6 + (audioLevel / 100) * 0.4 }}
              />
            );
          })}
        </div>
      )}

      {/* Timer */}
      {(state === 'recording' || state === 'paused') && (
        <div className="text-center">
          <p className="text-2xl font-700 tabular-nums text-foreground">{formatTime(elapsed)}</p>
          <div className="mt-2 w-48 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-negative rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t('smartEntryModal.voice.maxDuration', {
              ns: 'portal',
              duration: formatTime(maxSeconds),
            })}
          </p>
        </div>
      )}

      {/* Processing spinner */}
      {state === 'processing' && (
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={40} className="text-accent animate-spin" />
          <p className="text-sm text-muted-foreground">
            {t('smartEntryModal.voice.transcribing', { ns: 'portal' })}
          </p>
        </div>
      )}

      {/* Main action button */}
      <div className="flex flex-col items-center gap-4">
        {state === 'idle' && (
          <button
            onClick={startRecording}
            className="w-20 h-20 rounded-full gradient-teal flex items-center justify-center shadow-teal-glow hover:scale-105 active:scale-95 transition-all duration-200"
            aria-label={t('smartEntryModal.voice.actions.start', { ns: 'portal' })}
          >
            <Mic size={32} className="text-white" />
          </button>
        )}

        {state === 'requesting_permission' && (
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
            <Loader2 size={32} className="text-muted-foreground animate-spin" />
          </div>
        )}

        {state === 'recording' && (
          <div className="flex items-center gap-4">
            <button
              onClick={pauseRecording}
              className="w-12 h-12 rounded-full bg-warning-soft border border-warning/30 flex items-center justify-center hover:bg-warning/20 transition-colors"
              aria-label={t('smartEntryModal.voice.actions.pause', { ns: 'portal' })}
            >
              <Pause size={20} className="text-warning" />
            </button>
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-negative flex items-center justify-center shadow-lg hover:bg-negative/90 active:scale-95 transition-all duration-200"
              aria-label={t('smartEntryModal.voice.actions.stop', { ns: 'portal' })}
            >
              <Square size={28} className="text-white fill-white" />
            </button>
            <button
              onClick={handleCancel}
              className="w-12 h-12 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              aria-label={t('actions.cancel', { ns: 'common' })}
            >
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>
        )}

        {state === 'paused' && (
          <div className="flex items-center gap-4">
            <button
              onClick={resumeRecording}
              className="w-14 h-14 rounded-full bg-positive flex items-center justify-center hover:bg-positive/90 transition-colors"
              aria-label={t('smartEntryModal.voice.actions.resume', { ns: 'portal' })}
            >
              <Play size={22} className="text-white fill-white" />
            </button>
            <button
              onClick={stopRecording}
              className="w-20 h-20 rounded-full bg-negative flex items-center justify-center shadow-lg hover:bg-negative/90 active:scale-95 transition-all"
              aria-label={t('smartEntryModal.voice.actions.stop', { ns: 'portal' })}
            >
              <Square size={28} className="text-white fill-white" />
            </button>
            <button
              onClick={handleCancel}
              className="w-12 h-12 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
              aria-label={t('actions.cancel', { ns: 'common' })}
            >
              <X size={20} className="text-muted-foreground" />
            </button>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleRetry}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors"
            >
              <RotateCcw size={16} />
              {t('actions.refresh', { ns: 'common' })}
            </button>
            <button
              onClick={onSwitchToText}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
            >
              <Type size={16} />
              {t('smartEntryModal.voice.actions.useText', { ns: 'portal' })}
            </button>
          </div>
        )}
      </div>

      {/* Switch to text */}
      {(state === 'idle' || state === 'error') && (
        <button
          onClick={onSwitchToText}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Type size={14} />
          {t('smartEntryModal.voice.actions.typeInstead', { ns: 'portal' })}
        </button>
      )}

      {/* Cancel button for idle */}
      {state === 'idle' && (
        <button
          onClick={handleCancel}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('actions.cancel', { ns: 'common' })}
        </button>
      )}
    </div>
  );
}
