import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  VOICE_AI_MAX_AUDIO_BYTES,
  VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL,
  type VoiceTranscriptionHealthCode,
  type VoiceTranscriptionProvider,
} from '@/lib/voice-ai';

type AISettingsRow = {
  ai_enabled: boolean | null;
  enable_transcript_retention: boolean | null;
  primary_stt_provider: string | null;
  fallback_stt_provider: string | null;
  cloud_stt_model: string | null;
  vps_stt_model: string | null;
  vps_stt_base_url: string | null;
  max_audio_seconds: number | null;
};

type ProviderHealthRow = {
  provider: string;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured';
  last_checked_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_category: string | null;
  response_time_ms: number | null;
  model_used: string | null;
};

export interface VoiceProviderHealthSnapshot {
  provider: VoiceTranscriptionProvider;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured';
  checkedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  errorCategory: string | null;
  responseTimeMs: number | null;
  modelUsed: string | null;
}

export interface VoiceTranscriptionStatusSnapshot {
  aiEnabled: boolean;
  adminAiEnabled: boolean;
  serverAiEnabled: boolean;
  enableTranscriptRetention: boolean;
  ready: boolean;
  code: VoiceTranscriptionHealthCode;
  provider: VoiceTranscriptionProvider | null;
  fallbackProvider: VoiceTranscriptionProvider | null;
  model: string | null;
  maxAudioSeconds: number;
  maxAudioBytes: number;
  supportedAudioFormats: string;
  apiKeyConfigured: boolean;
  authTokenConfigured: boolean;
  baseUrlConfigured: boolean;
  lastHealthCheck: VoiceProviderHealthSnapshot | null;
}

export interface RuntimeVoiceTranscriptionConfig extends VoiceTranscriptionStatusSnapshot {
  baseUrl: string;
  apiKey: string;
  authToken: string;
}

export interface VoiceProviderHealthCheckResult {
  provider: VoiceTranscriptionProvider;
  code: VoiceTranscriptionHealthCode;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured';
  checkedAt: string;
  responseTimeMs: number;
  errorCategory?: string;
  modelUsed?: string | null;
}

const DEFAULT_MAX_AUDIO_SECONDS = Math.max(
  10,
  parseInt(process.env.AI_MAX_AUDIO_SECONDS || '120', 10) || 120
);

function toVoiceProvider(value: string | null | undefined): VoiceTranscriptionProvider | null {
  return value === 'cloud_stt' || value === 'vps_stt' ? value : null;
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function appendPath(baseUrl: string, path: string) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\/+/, ''), normalizedBase).toString();
}

function extractModelIds(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;
  const items = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const model = item as Record<string, unknown>;
      return typeof model.id === 'string'
        ? model.id
        : typeof model.name === 'string'
          ? model.name
          : '';
    })
    .filter(Boolean);
}

function mapHealthCodeToStatus(code: VoiceTranscriptionHealthCode): VoiceProviderHealthCheckResult['status'] {
  switch (code) {
    case 'ready':
      return 'healthy';
    case 'unsupported_model':
    case 'transcription_auth_failed':
      return 'degraded';
    case 'transcription_provider_unavailable':
      return 'offline';
    default:
      return 'not_configured';
  }
}

function resolveVoiceConfig(settings: AISettingsRow | null, providerOverride?: VoiceTranscriptionProvider | null) {
  const provider = providerOverride
    || toVoiceProvider(settings?.primary_stt_provider)
    || toVoiceProvider(process.env.PRIMARY_STT_PROVIDER)
    || 'cloud_stt';
  const fallbackProvider = toVoiceProvider(settings?.fallback_stt_provider)
    || toVoiceProvider(process.env.FALLBACK_STT_PROVIDER)
    || (provider === 'cloud_stt' ? 'vps_stt' : 'cloud_stt');
  const serverAiEnabled = process.env.AI_ENABLED === 'true';
  const adminAiEnabled = settings?.ai_enabled === true;
  const enableTranscriptRetention = settings?.enable_transcript_retention === true;
  const aiEnabled = serverAiEnabled && adminAiEnabled;
  const maxAudioSeconds = Math.max(10, settings?.max_audio_seconds || DEFAULT_MAX_AUDIO_SECONDS);
  const model = provider === 'cloud_stt'
    ? firstNonEmpty(settings?.cloud_stt_model, process.env.CLOUD_STT_MODEL, 'whisper-1')
    : firstNonEmpty(settings?.vps_stt_model, process.env.LOCAL_STT_MODEL, 'whisper');
  const baseUrl = provider === 'cloud_stt'
    ? firstNonEmpty(process.env.CLOUD_STT_BASE_URL)
    : firstNonEmpty(settings?.vps_stt_base_url, process.env.LOCAL_STT_BASE_URL);
  const apiKey = provider === 'cloud_stt' ? firstNonEmpty(process.env.CLOUD_STT_API_KEY) : '';
  const authToken = provider === 'vps_stt' ? firstNonEmpty(process.env.LOCAL_STT_AUTH_TOKEN) : '';

  let code: VoiceTranscriptionHealthCode = 'ready';
  if (!aiEnabled || !provider) {
    code = 'provider_not_configured';
  } else if (!baseUrl) {
    code = 'provider_not_configured';
  } else if (provider === 'cloud_stt' && !apiKey) {
    code = 'api_key_missing';
  } else if (!model) {
    code = 'transcription_model_missing';
  }

  return {
    aiEnabled,
    adminAiEnabled,
    serverAiEnabled,
    enableTranscriptRetention,
    provider,
    fallbackProvider,
    model: model || null,
    baseUrl,
    apiKey,
    authToken,
    maxAudioSeconds,
    code,
  };
}

async function loadSettingsAndHealth(providerOverride?: VoiceTranscriptionProvider | null) {
  const admin = createAdminClient();
  if (!admin) {
    return {
      settings: null,
      healthRow: null,
      provider: providerOverride || 'cloud_stt',
    };
  }

  const { data: settings } = await admin
    .from('ai_settings')
    .select('ai_enabled, enable_transcript_retention, primary_stt_provider, fallback_stt_provider, cloud_stt_model, vps_stt_model, vps_stt_base_url, max_audio_seconds')
    .eq('singleton_key', 'global')
    .maybeSingle();

  const resolvedProvider = providerOverride
    || toVoiceProvider((settings as AISettingsRow | null)?.primary_stt_provider)
    || 'cloud_stt';

  const { data: healthRow } = await admin
    .from('ai_provider_health')
    .select('provider, status, last_checked_at, last_success_at, last_failure_at, last_error_category, response_time_ms, model_used')
    .eq('provider', resolvedProvider)
    .maybeSingle();

  return {
    settings: (settings as AISettingsRow | null) ?? null,
    healthRow: (healthRow as ProviderHealthRow | null) ?? null,
    provider: resolvedProvider,
  };
}

function toHealthSnapshot(
  provider: VoiceTranscriptionProvider,
  row: ProviderHealthRow | null
): VoiceProviderHealthSnapshot | null {
  if (!row) {
    return null;
  }

  return {
    provider,
    status: row.status,
    checkedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    errorCategory: row.last_error_category,
    responseTimeMs: row.response_time_ms,
    modelUsed: row.model_used,
  };
}

export async function loadVoiceTranscriptionStatus(
  providerOverride?: VoiceTranscriptionProvider | null
): Promise<VoiceTranscriptionStatusSnapshot> {
  const { settings, healthRow, provider } = await loadSettingsAndHealth(providerOverride);
  const resolved = resolveVoiceConfig(settings, provider);

  return {
    aiEnabled: resolved.aiEnabled,
    adminAiEnabled: resolved.adminAiEnabled,
    serverAiEnabled: resolved.serverAiEnabled,
    enableTranscriptRetention: resolved.enableTranscriptRetention,
    ready: resolved.code === 'ready',
    code: resolved.code,
    provider: resolved.provider,
    fallbackProvider: resolved.fallbackProvider,
    model: resolved.model,
    maxAudioSeconds: resolved.maxAudioSeconds,
    maxAudioBytes: VOICE_AI_MAX_AUDIO_BYTES,
    supportedAudioFormats: VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL,
    apiKeyConfigured: Boolean(resolved.apiKey),
    authTokenConfigured: Boolean(resolved.authToken),
    baseUrlConfigured: Boolean(resolved.baseUrl),
    lastHealthCheck: resolved.provider ? toHealthSnapshot(resolved.provider, healthRow) : null,
  };
}

export async function loadRuntimeVoiceTranscriptionConfig(
  providerOverride?: VoiceTranscriptionProvider | null
): Promise<RuntimeVoiceTranscriptionConfig> {
  const { settings, healthRow, provider } = await loadSettingsAndHealth(providerOverride);
  const resolved = resolveVoiceConfig(settings, providerOverride || provider);

  return {
    aiEnabled: resolved.aiEnabled,
    adminAiEnabled: resolved.adminAiEnabled,
    serverAiEnabled: resolved.serverAiEnabled,
    enableTranscriptRetention: resolved.enableTranscriptRetention,
    ready: resolved.code === 'ready',
    code: resolved.code,
    provider: resolved.provider,
    fallbackProvider: resolved.fallbackProvider,
    model: resolved.model,
    maxAudioSeconds: resolved.maxAudioSeconds,
    maxAudioBytes: VOICE_AI_MAX_AUDIO_BYTES,
    supportedAudioFormats: VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL,
    apiKeyConfigured: Boolean(resolved.apiKey),
    authTokenConfigured: Boolean(resolved.authToken),
    baseUrlConfigured: Boolean(resolved.baseUrl),
    lastHealthCheck: resolved.provider ? toHealthSnapshot(resolved.provider, healthRow) : null,
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
    authToken: resolved.authToken,
  };
}

export async function runVoiceTranscriptionHealthCheck(
  providerOverride?: VoiceTranscriptionProvider | null
): Promise<VoiceProviderHealthCheckResult> {
  const runtimeConfig = await loadRuntimeVoiceTranscriptionConfig(providerOverride);
  const provider = providerOverride || runtimeConfig.provider || 'cloud_stt';
  const checkedAt = new Date().toISOString();

  if (!runtimeConfig.ready || runtimeConfig.provider !== provider) {
    return {
      provider,
      code: runtimeConfig.provider !== provider ? 'provider_not_configured' : runtimeConfig.code,
      status: mapHealthCodeToStatus(runtimeConfig.provider !== provider ? 'provider_not_configured' : runtimeConfig.code),
      checkedAt,
      responseTimeMs: 0,
      errorCategory: runtimeConfig.provider !== provider ? 'provider_not_configured' : runtimeConfig.code,
      modelUsed: runtimeConfig.model,
    };
  }

  const start = Date.now();
  const headers: Record<string, string> = {};
  if (provider === 'cloud_stt') {
    headers.Authorization = `Bearer ${runtimeConfig.apiKey}`;
  } else if (runtimeConfig.authToken) {
    headers.Authorization = `Bearer ${runtimeConfig.authToken}`;
  }

  const endpoints = provider === 'cloud_stt'
    ? [{ url: appendPath(runtimeConfig.baseUrl, 'models'), supportsModelCheck: true }]
    : [
        { url: appendPath(runtimeConfig.baseUrl, 'models'), supportsModelCheck: true },
        { url: appendPath(runtimeConfig.baseUrl, 'health'), supportsModelCheck: false },
      ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      const responseTimeMs = Date.now() - start;

      if (response.status === 401 || response.status === 403) {
        return {
          provider,
          code: 'transcription_auth_failed',
          status: 'degraded',
          checkedAt,
          responseTimeMs,
          errorCategory: 'transcription_auth_failed',
          modelUsed: runtimeConfig.model,
        };
      }

      if (response.status === 404 && provider === 'vps_stt' && endpoint.supportsModelCheck) {
        continue;
      }

      if (!response.ok) {
        return {
          provider,
          code: 'transcription_provider_unavailable',
          status: 'offline',
          checkedAt,
          responseTimeMs,
          errorCategory: `http_${response.status}`,
          modelUsed: runtimeConfig.model,
        };
      }

      if (endpoint.supportsModelCheck) {
        const payload = await response.json().catch(() => null);
        const modelIds = extractModelIds(payload);
        if (modelIds.length > 0 && runtimeConfig.model && !modelIds.includes(runtimeConfig.model)) {
          return {
            provider,
            code: 'unsupported_model',
            status: 'degraded',
            checkedAt,
            responseTimeMs,
            errorCategory: 'unsupported_model',
            modelUsed: runtimeConfig.model,
          };
        }
      }

      return {
        provider,
        code: 'ready',
        status: 'healthy',
        checkedAt,
        responseTimeMs,
        modelUsed: runtimeConfig.model,
      };
    } catch {
      if (endpoint !== endpoints[endpoints.length - 1]) {
        continue;
      }
    }
  }

  return {
    provider,
    code: 'transcription_provider_unavailable',
    status: 'offline',
    checkedAt,
    responseTimeMs: Date.now() - start,
    errorCategory: 'transcription_provider_unavailable',
    modelUsed: runtimeConfig.model,
  };
}

export async function persistVoiceTranscriptionHealth(result: VoiceProviderHealthCheckResult) {
  const admin = createAdminClient();
  if (!admin) {
    return;
  }

  await admin.from('ai_provider_health').upsert({
    provider: result.provider,
    status: result.status,
    last_checked_at: result.checkedAt,
    last_success_at: result.status === 'healthy' ? result.checkedAt : undefined,
    last_failure_at: result.status !== 'healthy' ? result.checkedAt : undefined,
    last_error_category: result.errorCategory || (result.code === 'ready' ? null : result.code),
    response_time_ms: result.responseTimeMs,
    model_used: result.modelUsed || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'provider' });
}
