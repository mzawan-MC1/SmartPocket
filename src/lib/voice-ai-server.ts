import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  VOICE_AI_MAX_AUDIO_BYTES,
  VOICE_AI_GATEWAY,
  VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL,
  type VoiceTranscriptionHealthCode,
} from '@/lib/voice-ai';
import { getOpenRouterBaseUrl } from '@/lib/ai-gateway';

type AISettingsRow = {
  ai_enabled: boolean | null;
  enable_transcript_retention: boolean | null;
  openrouter_model: string | null;
  voice_model: string | null;
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
  provider: string;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured';
  checkedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  errorCategory: string | null;
  responseTimeMs: number | null;
  modelUsed: string | null;
  modelAudioCapable: boolean | null;
}

export interface VoiceTranscriptionStatusSnapshot {
  aiEnabled: boolean;
  adminAiEnabled: boolean;
  serverAiEnabled: boolean;
  enableTranscriptRetention: boolean;
  ready: boolean;
  code: VoiceTranscriptionHealthCode;
  gateway: typeof VOICE_AI_GATEWAY;
  model: string | null;
  modelSource: 'voice_model' | 'openrouter_model' | 'env' | 'none';
  modelAudioCapable: boolean | null;
  maxAudioSeconds: number;
  maxAudioBytes: number;
  supportedAudioFormats: string;
  openrouterConfigured: boolean;
  apiKeyConfigured: boolean;
  baseUrlConfigured: boolean;
  lastHealthCheck: VoiceProviderHealthSnapshot | null;
}

export interface RuntimeVoiceTranscriptionConfig extends VoiceTranscriptionStatusSnapshot {
  baseUrl: string;
  apiKey: string;
}

export interface VoiceProviderHealthCheckResult {
  provider: string;
  code: VoiceTranscriptionHealthCode;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured';
  checkedAt: string;
  responseTimeMs: number;
  errorCategory?: string;
  modelUsed?: string | null;
  modelAudioCapable?: boolean | null;
}

const DEFAULT_MAX_AUDIO_SECONDS = Math.max(
  10,
  parseInt(process.env.AI_MAX_AUDIO_SECONDS || '120', 10) || 120
);

const VOICE_OPENROUTER_PROVIDER_KEY = 'openrouter_voice';

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

function mapHealthCodeToStatus(code: VoiceTranscriptionHealthCode): VoiceProviderHealthCheckResult['status'] {
  switch (code) {
    case 'ready':
      return 'healthy';
    case 'voice_model_audio_unsupported':
    case 'openrouter_auth_failed':
      return 'degraded';
    case 'openrouter_provider_unavailable':
      return 'offline';
    default:
      return 'not_configured';
  }
}

function getModelCollection(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) return root.data;
  if (Array.isArray(root.models)) return root.models;
  return [];
}

function findModelMetadata(payload: unknown, modelId: string) {
  const normalizedModelId = modelId.trim().toLowerCase();
  return getModelCollection(payload).find((item) => {
    if (!item || typeof item !== 'object') return false;
    const model = item as Record<string, unknown>;
    const candidates = [
      typeof model.id === 'string' ? model.id : '',
      typeof model.canonical_slug === 'string' ? model.canonical_slug : '',
      typeof model.name === 'string' ? model.name : '',
    ];
    return candidates.some((candidate) => candidate.trim().toLowerCase() === normalizedModelId);
  }) as Record<string, unknown> | undefined;
}

function extractInputModalities(model: Record<string, unknown> | undefined) {
  if (!model) return [];

  const architecture = model.architecture && typeof model.architecture === 'object'
    ? model.architecture as Record<string, unknown>
    : null;
  const values = Array.isArray(architecture?.input_modalities)
    ? architecture?.input_modalities
    : Array.isArray(model.input_modalities)
      ? model.input_modalities
      : [];

  return values
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);
}

function inferPersistedAudioCapability(row: ProviderHealthRow | null) {
  if (!row) return null;
  if (row.last_error_category === 'voice_model_audio_unsupported') return false;
  if (row.status === 'healthy') return true;
  return null;
}

function resolveSelectedVoiceModel(settings: AISettingsRow | null) {
  const voiceModel = firstNonEmpty(settings?.voice_model);
  if (voiceModel) {
    return { model: voiceModel, source: 'voice_model' as const };
  }

  const openrouterModel = firstNonEmpty(settings?.openrouter_model);
  if (openrouterModel) {
    return { model: openrouterModel, source: 'openrouter_model' as const };
  }

  const envModel = firstNonEmpty(process.env.OPENROUTER_MODEL);
  if (envModel) {
    return { model: envModel, source: 'env' as const };
  }

  return { model: '', source: 'none' as const };
}

function resolveVoiceConfig(settings: AISettingsRow | null, healthRow: ProviderHealthRow | null) {
  const serverAiEnabled = process.env.AI_ENABLED === 'true';
  const adminAiEnabled = settings?.ai_enabled === true;
  const enableTranscriptRetention = settings?.enable_transcript_retention === true;
  const aiEnabled = serverAiEnabled && adminAiEnabled;
  const maxAudioSeconds = Math.max(10, settings?.max_audio_seconds || DEFAULT_MAX_AUDIO_SECONDS);
  const resolvedModel = resolveSelectedVoiceModel(settings);
  const baseUrl = firstNonEmpty(process.env.OPENROUTER_BASE_URL, getOpenRouterBaseUrl());
  const apiKey = firstNonEmpty(process.env.OPENROUTER_API_KEY);
  const openrouterConfigured = Boolean(apiKey && baseUrl);

  let code: VoiceTranscriptionHealthCode = 'ready';
  if (!aiEnabled || !openrouterConfigured) {
    code = 'openrouter_not_configured';
  } else if (!resolvedModel.model) {
    code = 'voice_model_missing';
  }

  return {
    aiEnabled,
    adminAiEnabled,
    serverAiEnabled,
    enableTranscriptRetention,
    gateway: VOICE_AI_GATEWAY,
    model: resolvedModel.model || null,
    modelSource: resolvedModel.source,
    modelAudioCapable: inferPersistedAudioCapability(healthRow),
    baseUrl,
    apiKey,
    maxAudioSeconds,
    code,
    openrouterConfigured,
  };
}

async function loadSettingsAndHealth() {
  const admin = createAdminClient();
  if (!admin) {
    return {
      settings: null,
      healthRow: null,
    };
  }

  const { data: settings } = await admin
    .from('ai_settings')
    .select('ai_enabled, enable_transcript_retention, openrouter_model, voice_model, max_audio_seconds')
    .eq('singleton_key', 'global')
    .maybeSingle();

  const { data: healthRow } = await admin
    .from('ai_provider_health')
    .select('provider, status, last_checked_at, last_success_at, last_failure_at, last_error_category, response_time_ms, model_used')
    .eq('provider', VOICE_OPENROUTER_PROVIDER_KEY)
    .maybeSingle();

  return {
    settings: (settings as AISettingsRow | null) ?? null,
    healthRow: (healthRow as ProviderHealthRow | null) ?? null,
  };
}

function toHealthSnapshot(
  row: ProviderHealthRow | null
): VoiceProviderHealthSnapshot | null {
  if (!row) {
    return null;
  }

  return {
    provider: row.provider,
    status: row.status,
    checkedAt: row.last_checked_at,
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    errorCategory: row.last_error_category,
    responseTimeMs: row.response_time_ms,
    modelUsed: row.model_used,
    modelAudioCapable: inferPersistedAudioCapability(row),
  };
}

function statusFromRuntimeConfig(
  runtimeConfig: RuntimeVoiceTranscriptionConfig,
  overrides?: Partial<VoiceTranscriptionStatusSnapshot>
): VoiceTranscriptionStatusSnapshot {
  return {
    aiEnabled: runtimeConfig.aiEnabled,
    adminAiEnabled: runtimeConfig.adminAiEnabled,
    serverAiEnabled: runtimeConfig.serverAiEnabled,
    enableTranscriptRetention: runtimeConfig.enableTranscriptRetention,
    ready: overrides?.ready ?? runtimeConfig.ready,
    code: overrides?.code ?? runtimeConfig.code,
    gateway: VOICE_AI_GATEWAY,
    model: overrides?.model ?? runtimeConfig.model,
    modelSource: overrides?.modelSource ?? runtimeConfig.modelSource,
    modelAudioCapable: overrides?.modelAudioCapable ?? runtimeConfig.modelAudioCapable,
    maxAudioSeconds: runtimeConfig.maxAudioSeconds,
    maxAudioBytes: runtimeConfig.maxAudioBytes,
    supportedAudioFormats: runtimeConfig.supportedAudioFormats,
    openrouterConfigured: runtimeConfig.openrouterConfigured,
    apiKeyConfigured: runtimeConfig.apiKeyConfigured,
    baseUrlConfigured: runtimeConfig.baseUrlConfigured,
    lastHealthCheck: overrides?.lastHealthCheck ?? runtimeConfig.lastHealthCheck,
  };
}

export async function loadVoiceTranscriptionStatus(): Promise<VoiceTranscriptionStatusSnapshot> {
  const runtimeConfig = await loadRuntimeVoiceTranscriptionConfig();
  if (runtimeConfig.code !== 'ready') {
    return statusFromRuntimeConfig(runtimeConfig, { ready: false });
  }

  const health = await runVoiceTranscriptionHealthCheck();
  return {
    ...statusFromRuntimeConfig(runtimeConfig, {
      ready: health.code === 'ready',
      code: health.code,
      modelAudioCapable: typeof health.modelAudioCapable === 'boolean'
        ? health.modelAudioCapable
        : runtimeConfig.modelAudioCapable,
    }),
  };
}

export async function loadRuntimeVoiceTranscriptionConfig(): Promise<RuntimeVoiceTranscriptionConfig> {
  const { settings, healthRow } = await loadSettingsAndHealth();
  const resolved = resolveVoiceConfig(settings, healthRow);

  return {
    aiEnabled: resolved.aiEnabled,
    adminAiEnabled: resolved.adminAiEnabled,
    serverAiEnabled: resolved.serverAiEnabled,
    enableTranscriptRetention: resolved.enableTranscriptRetention,
    ready: resolved.code === 'ready',
    code: resolved.code,
    gateway: VOICE_AI_GATEWAY,
    model: resolved.model,
    modelSource: resolved.modelSource,
    modelAudioCapable: resolved.modelAudioCapable,
    maxAudioSeconds: resolved.maxAudioSeconds,
    maxAudioBytes: VOICE_AI_MAX_AUDIO_BYTES,
    supportedAudioFormats: VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL,
    openrouterConfigured: resolved.openrouterConfigured,
    apiKeyConfigured: Boolean(resolved.apiKey),
    baseUrlConfigured: Boolean(resolved.baseUrl),
    lastHealthCheck: toHealthSnapshot(healthRow),
    baseUrl: resolved.baseUrl,
    apiKey: resolved.apiKey,
  };
}

export async function runVoiceTranscriptionHealthCheck(): Promise<VoiceProviderHealthCheckResult> {
  const runtimeConfig = await loadRuntimeVoiceTranscriptionConfig();
  const checkedAt = new Date().toISOString();

  if (runtimeConfig.code !== 'ready' || !runtimeConfig.model) {
    return {
      provider: VOICE_OPENROUTER_PROVIDER_KEY,
      code: runtimeConfig.code,
      status: mapHealthCodeToStatus(runtimeConfig.code),
      checkedAt,
      responseTimeMs: 0,
      errorCategory: runtimeConfig.code,
      modelUsed: runtimeConfig.model,
      modelAudioCapable: runtimeConfig.modelAudioCapable,
    };
  }

  const start = Date.now();
  try {
    const response = await fetch(appendPath(runtimeConfig.baseUrl, 'models'), {
      headers: {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://1smartpocket.com',
        'X-Title': 'Smart Pocket AI',
      },
      signal: AbortSignal.timeout(5000),
    });

    const responseTimeMs = Date.now() - start;
    if (response.status === 401 || response.status === 403) {
      return {
        provider: VOICE_OPENROUTER_PROVIDER_KEY,
        code: 'openrouter_auth_failed',
        status: 'degraded',
        checkedAt,
        responseTimeMs,
        errorCategory: 'openrouter_auth_failed',
        modelUsed: runtimeConfig.model,
      };
    }

    if (!response.ok) {
      return {
        provider: VOICE_OPENROUTER_PROVIDER_KEY,
        code: 'openrouter_provider_unavailable',
        status: 'offline',
        checkedAt,
        responseTimeMs,
        errorCategory: `http_${response.status}`,
        modelUsed: runtimeConfig.model,
      };
    }

    const payload = await response.json().catch(() => null);
    const metadata = runtimeConfig.model ? findModelMetadata(payload, runtimeConfig.model) : undefined;
    if (!metadata) {
      return {
        provider: VOICE_OPENROUTER_PROVIDER_KEY,
        code: 'voice_model_missing',
        status: 'not_configured',
        checkedAt,
        responseTimeMs,
        errorCategory: 'model_not_found',
        modelUsed: runtimeConfig.model,
        modelAudioCapable: null,
      };
    }

    const inputModalities = extractInputModalities(metadata);
    const modelAudioCapable = inputModalities.includes('audio');
    if (!modelAudioCapable) {
      return {
        provider: VOICE_OPENROUTER_PROVIDER_KEY,
        code: 'voice_model_audio_unsupported',
        status: 'degraded',
        checkedAt,
        responseTimeMs,
        errorCategory: 'voice_model_audio_unsupported',
        modelUsed: runtimeConfig.model,
        modelAudioCapable: false,
      };
    }

    return {
      provider: VOICE_OPENROUTER_PROVIDER_KEY,
      code: 'ready',
      status: 'healthy',
      checkedAt,
      responseTimeMs,
      modelUsed: runtimeConfig.model,
      modelAudioCapable: true,
    };
  } catch {
    return {
      provider: VOICE_OPENROUTER_PROVIDER_KEY,
      code: 'openrouter_provider_unavailable',
      status: 'offline',
      checkedAt,
      responseTimeMs: Date.now() - start,
      errorCategory: 'openrouter_provider_unavailable',
      modelUsed: runtimeConfig.model,
    };
  }
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
