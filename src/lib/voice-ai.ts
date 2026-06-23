export const VOICE_AI_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const VOICE_AI_ALLOWED_RECORDING_EXTENSIONS = ['webm', 'm4a', 'mp3', 'wav'] as const;
export const VOICE_AI_SUPPORTED_TRANSCRIPTION_MIME_TYPES = [
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
] as const;

export const VOICE_AI_BROWSER_RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const;

export const VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL = 'WebM (Opus), MP4 (AAC/M4A), MP3, WAV';
export const VOICE_AI_GATEWAY = 'openrouter' as const;

export type VoiceTranscriptionProvider = typeof VOICE_AI_GATEWAY;

export type VoiceTranscriptionHealthCode =
  | 'ready'
  | 'openrouter_not_configured'
  | 'voice_model_missing'
  | 'voice_model_audio_unsupported'
  | 'openrouter_auth_failed'
  | 'openrouter_provider_unavailable';

export type VoiceTranscriptionErrorCode =
  | 'voice_not_in_plan'
  | 'voice_limit_reached'
  | 'microphone_permission_denied'
  | 'empty_audio'
  | 'unsupported_audio_type'
  | 'audio_too_large'
  | 'openrouter_not_configured'
  | 'voice_model_missing'
  | 'voice_model_audio_unsupported'
  | 'openrouter_auth_failed'
  | 'openrouter_provider_unavailable'
  | 'transcription_failed';

export interface VoiceRecorderSubmission {
  file: File;
  mimeType: string;
  durationSeconds: number;
}

export function normalizeVoiceAudioMimeType(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export function isSupportedVoiceAudioMimeType(value: string | null | undefined) {
  const normalized = normalizeVoiceAudioMimeType(value);
  return (VOICE_AI_SUPPORTED_TRANSCRIPTION_MIME_TYPES as readonly string[]).includes(normalized);
}

export function getVoiceAudioExtension(value: string | null | undefined) {
  const normalized = normalizeVoiceAudioMimeType(value);

  switch (normalized) {
    case 'audio/webm':
    case 'audio/webm;codecs=opus':
      return 'webm';
    case 'audio/mp4':
    case 'audio/mp4;codecs=mp4a.40.2':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    default:
      return 'audio';
  }
}

export function getOpenRouterAudioFormat(value: string | null | undefined) {
  const normalized = normalizeVoiceAudioMimeType(value);

  switch (normalized) {
    case 'audio/webm':
    case 'audio/webm;codecs=opus':
      return 'webm';
    case 'audio/mp4':
    case 'audio/mp4;codecs=mp4a.40.2':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    default:
      return null;
  }
}

export function formatVoiceAudioSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '0 KB';
  }

  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

export function getPreferredVoiceRecordingMimeType() {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return null;
  }

  for (const candidate of VOICE_AI_BROWSER_RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return null;
}
