import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  VOICE_AI_MAX_AUDIO_BYTES,
  VOICE_AI_SUPPORTED_AUDIO_FORMATS_LABEL,
  type VoiceTranscriptionHealthCode,
  type VoiceAiGateway,
} from '@/lib/voice-ai';
import { getOpenRouterBaseUrl } from '@/lib/ai-gateway';
import { getAIConfig, isOpenRouterEnabled } from '@/lib/ai-provider-config';
import { getGeminiClient } from '@/lib/gemini-client';

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
  configurationReady: boolean;
  code: VoiceTranscriptionHealthCode;
  gateway: VoiceAiGateway;
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
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured' | 'disabled';
  checkedAt: string;
  responseTimeMs: number;
  errorCategory?: string;
  modelUsed?: string | null;
  modelAudioCapable?: boolean | null;
  httpStatus?: number | null;
  requestId?: string | null;
  errorKind?: 'auth' | 'rate' | 'timeout' | 'unavailable' | 'configuration' | 'unknown' | null;
  sanitizedError?: string | null;
}

const DEFAULT_MAX_AUDIO_SECONDS = Math.max(
  10,
  parseInt(process.env.AI_MAX_AUDIO_SECONDS || '120', 10) || 120
);

const VOICE_GEMINI_PROVIDER_KEY = 'gemini_voice';
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
    case 'openrouter_disabled':
      return 'disabled';
    case 'voice_model_audio_unsupported':
    case 'openrouter_auth_failed':
    case 'gemini_model_missing':
      return 'degraded';
    case 'openrouter_provider_unavailable':
    case 'gemini_provider_unavailable':
    case 'gemini_request_timeout':
    case 'gemini_auth_failed':
    case 'gemini_rate_limited':
      return 'offline';
    default:
      return 'not_configured';
  }
}

function classifyGeminiError(err: unknown, message: string): {
  code: VoiceTranscriptionHealthCode;
  status: VoiceProviderHealthCheckResult['status'];
  errorKind: VoiceProviderHealthCheckResult['errorKind'];
  httpStatus: number | null;
  errorCategory: string;
  sanitizedError: string;
} {
  const msg = message || String(err || '');
  const msgLower = msg.toLowerCase();

  let httpStatus: number | null = null;
  const httpMatch = msg.match(/\b(4[0-9]{2}|5[0-9]{2})\b/);
  if (httpMatch) httpStatus = parseInt(httpMatch[1], 10);

  const isAuth = /\b(401|403|UNAUTHENTICATED|PERMISSION_DENIED|invalid authentication credentials|API key not valid)\b/i.test(msg);
  const isTimeout = /\b(timeout|timed out|DEADLINE_EXCEEDED|AbortError|TimeoutError|aborted|operation was aborted)\b/i.test(msg);
  const isRate = /\b(429|too many requests|rate limit|quota exceeded|resource exhausted|RESOURCE_EXHAUSTED)\b/i.test(msg) || httpStatus === 429;
  const is503 = /\b(503|UNAVAILABLE|high demand|unavailable|service unavailable|temporarily unavailable)\b/i.test(msg) || httpStatus === 503;

  let code: VoiceTranscriptionHealthCode;
  let status: VoiceProviderHealthCheckResult['status'];
  let errorKind: VoiceProviderHealthCheckResult['errorKind'];
  let errorCategory: string;

  if (isAuth) {
    code = 'gemini_auth_failed';
    status = 'offline';
    errorKind = 'auth';
    errorCategory = 'gemini_auth_failed';
  } else if (isRate) {
    code = 'gemini_rate_limited';
    status = 'offline';
    errorKind = 'rate';
    errorCategory = 'gemini_rate_limited';
  } else if (isTimeout) {
    code = 'gemini_request_timeout';
    status = 'offline';
    errorKind = 'timeout';
    errorCategory = 'gemini_request_timeout';
  } else if (is503) {
    code = 'gemini_provider_unavailable';
    status = 'offline';
    errorKind = 'unavailable';
    errorCategory = 'gemini_provider_unavailable';
  } else {
    code = 'gemini_provider_unavailable';
    status = 'offline';
    errorKind = 'unknown';
    errorCategory = 'gemini_provider_unavailable';
  }

  const sanitizedLines = msg.split(/\r?\n/).slice(0, 3).map(l => l.slice(0, 180));
  const sanitizedError = sanitizedLines.join(' | ').replace(/(Bearer|Authorization|api[_-]?key|google[_-]?api[_-]?key)[^,;\n]*/gi, '[REDACTED]');

  return { code, status, errorKind, httpStatus, errorCategory, sanitizedError };
}

function buildTinySilentWavBase64(): { base64: string; mimeType: 'audio/wav'; byteLength: number } {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const durationSeconds = 0.12;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataByteLength = numSamples * (bitsPerSample / 8);
  const byteLength = 44 + dataByteLength;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let base64 = '';
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    base64 = Buffer.from(new Uint8Array(buffer)).toString('base64');
  } else if (typeof btoa === 'function') {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    base64 = btoa(binary);
  } else {
    throw new Error('No base64 encoder available for health probe');
  }

  return { base64, mimeType: 'audio/wav', byteLength };
}

function logAdminVoiceHealthDiagnostic(
  result: VoiceProviderHealthCheckResult,
  extra?: Record<string, unknown>
): void {
  try {
    const safe: Record<string, unknown> = {
      scope: 'voice.health',
      provider: result.provider,
      code: result.code,
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      model: result.modelUsed || null,
      httpStatus: result.httpStatus ?? null,
      errorKind: result.errorKind ?? null,
      errorCategory: result.errorCategory ?? null,
      sanitized: result.sanitizedError ?? null,
      requestId: result.requestId ?? null,
    };
    if (extra) Object.assign(safe, extra);
    if (process.env.NODE_ENV !== 'production') {
      console.info('[voice.health.diagnostic]', safe);
    } else {
      console.info('[voice.health.diagnostic]', JSON.stringify(safe));
    }
  } catch {
    // never throw from logging
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
  const aiConfig = getAIConfig();

  const geminiMultimodal = firstNonEmpty(aiConfig.gemini.models.multimodal);
  if (geminiMultimodal) {
    return { model: geminiMultimodal, source: 'env' as const };
  }

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
  const aiConfig = getAIConfig();
  const primaryProvider = aiConfig.language.primary;
  const serverAiEnabled = aiConfig.runtime.enabled;
  const adminAiEnabled = settings?.ai_enabled === true;
  const enableTranscriptRetention = settings?.enable_transcript_retention === true;
  const aiEnabled = serverAiEnabled && adminAiEnabled;
  const maxAudioSeconds = Math.max(10, settings?.max_audio_seconds || DEFAULT_MAX_AUDIO_SECONDS);
  const resolvedModel = resolveSelectedVoiceModel(settings);

  let code: VoiceTranscriptionHealthCode = 'ready';
  let gateway: VoiceAiGateway = 'gemini';
  let baseUrl = '';
  let apiKey = '';
  let model = resolvedModel.model || null;
  let modelSource = resolvedModel.source;
  let attemptedGemini = false;

  const geminiApiOk = Boolean(aiConfig.gemini.apiKey);
  const multimodalOk = Boolean(aiConfig.gemini.models.multimodal);
  if (primaryProvider === 'gemini' || (typeof aiConfig.gemini.apiKey === 'string' && aiConfig.gemini.apiKey.trim() !== '')) {
    attemptedGemini = true;
    gateway = 'gemini';
    model = aiConfig.gemini.models.multimodal || null;
    modelSource = 'env';
    if (!geminiApiOk) {
      code = 'gemini_api_key_missing';
      baseUrl = '';
      apiKey = '';
    } else if (!multimodalOk) {
      code = 'gemini_model_missing';
      baseUrl = '';
      apiKey = aiConfig.gemini.apiKey || '';
    } else {
      code = 'ready';
      baseUrl = '';
      apiKey = aiConfig.gemini.apiKey || '';
    }
  }

  if (code !== 'ready' && aiConfig.openrouter.enabled === true && Boolean(aiConfig.openrouter.apiKey)) {
    gateway = 'openrouter';
    const openrouterEnabled = isOpenRouterEnabled();
    const openrouterBaseUrl = firstNonEmpty(aiConfig.openrouter.baseUrl, getOpenRouterBaseUrl());
    const openrouterApiKey = firstNonEmpty(aiConfig.openrouter.apiKey);
    const openrouterConfigured = Boolean(openrouterApiKey && openrouterBaseUrl);

    baseUrl = openrouterBaseUrl;
    apiKey = openrouterApiKey;
    model = resolvedModel.model || null;
    modelSource = resolvedModel.source;

    if (!openrouterEnabled) {
      code = 'openrouter_disabled';
    } else if (!aiEnabled || !openrouterConfigured) {
      code = 'openrouter_not_configured';
    } else if (!resolvedModel.model) {
      code = 'voice_model_missing';
    } else {
      code = 'ready';
    }
  }

  if (code !== 'ready' && gateway === 'gemini' && !attemptedGemini) {
    code = 'gemini_not_configured';
  }

  if (!aiEnabled) {
    if (gateway === 'gemini') {
      code = 'gemini_not_configured';
    } else {
      code = 'openrouter_not_configured';
    }
  }

  const openrouterConfigured = Boolean(
    aiConfig.openrouter.apiKey &&
    (aiConfig.openrouter.baseUrl || getOpenRouterBaseUrl())
  );

  const configurationReady = code === 'ready';
  const inferredAudioCapable = (() => {
    if (configurationReady && gateway === 'gemini' && multimodalOk) {
      return true;
    }
    return inferPersistedAudioCapability(healthRow);
  })();

  return {
    aiEnabled,
    adminAiEnabled,
    serverAiEnabled,
    enableTranscriptRetention,
    gateway,
    model: model || null,
    modelSource,
    modelAudioCapable: inferredAudioCapable,
    baseUrl,
    apiKey,
    maxAudioSeconds,
    code,
    configurationReady,
    openrouterConfigured,
  };
}

async function loadSettingsAndHealth() {
  const admin = createAdminClient();
  if (!admin) {
    return {
      settings: null,
      healthRow: null,
      geminiHealthRow: null,
      openrouterHealthRow: null,
    };
  }

  const { data: settings } = await admin
    .from('ai_settings')
    .select('ai_enabled, enable_transcript_retention, openrouter_model, voice_model, max_audio_seconds')
    .eq('singleton_key', 'global')
    .maybeSingle();

  const { data: geminiHealthRow } = await admin
    .from('ai_provider_health')
    .select('provider, status, last_checked_at, last_success_at, last_failure_at, last_error_category, response_time_ms, model_used')
    .eq('provider', VOICE_GEMINI_PROVIDER_KEY)
    .maybeSingle();

  const { data: openrouterHealthRow } = await admin
    .from('ai_provider_health')
    .select('provider, status, last_checked_at, last_success_at, last_failure_at, last_error_category, response_time_ms, model_used')
    .eq('provider', VOICE_OPENROUTER_PROVIDER_KEY)
    .maybeSingle();

  const aiConfig = getAIConfig();
  const useGemini = aiConfig.language.primary === 'gemini' || Boolean(aiConfig.gemini.apiKey);
  const healthRow = useGemini
    ? (geminiHealthRow as ProviderHealthRow | null) ?? null
    : (openrouterHealthRow as ProviderHealthRow | null) ?? null;

  return {
    settings: (settings as AISettingsRow | null) ?? null,
    healthRow,
    geminiHealthRow: (geminiHealthRow as ProviderHealthRow | null) ?? null,
    openrouterHealthRow: (openrouterHealthRow as ProviderHealthRow | null) ?? null,
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
  const configurationReady = runtimeConfig.configurationReady;
  return {
    aiEnabled: runtimeConfig.aiEnabled,
    adminAiEnabled: runtimeConfig.adminAiEnabled,
    serverAiEnabled: runtimeConfig.serverAiEnabled,
    enableTranscriptRetention: runtimeConfig.enableTranscriptRetention,
    ready: overrides?.ready ?? runtimeConfig.ready,
    configurationReady: overrides?.configurationReady ?? configurationReady,
    code: overrides?.code ?? runtimeConfig.code,
    gateway: runtimeConfig.gateway,
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

  return {
    ...statusFromRuntimeConfig(runtimeConfig, {
      ready: true,
      code: 'ready',
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
    configurationReady: resolved.configurationReady,
    code: resolved.code,
    gateway: resolved.gateway,
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
  const aiConfig = getAIConfig();

  if (runtimeConfig.gateway === 'gemini' && runtimeConfig.code !== 'ready') {
    return {
      provider: VOICE_GEMINI_PROVIDER_KEY,
      code: runtimeConfig.code,
      status: mapHealthCodeToStatus(runtimeConfig.code),
      checkedAt,
      responseTimeMs: 0,
      errorCategory: runtimeConfig.code,
      modelUsed: runtimeConfig.model,
      modelAudioCapable: runtimeConfig.modelAudioCapable,
    };
  }

  if (runtimeConfig.gateway === 'gemini' && runtimeConfig.code === 'ready') {
    const start = Date.now();
    try {
      const geminiHandle = getGeminiClient();
      const client = geminiHandle.requireClient('voice health check');
      const modelName = aiConfig.gemini.models.multimodal;

      const wav = buildTinySilentWavBase64();
      const healthSystemPrompt =
        'You are evaluating a 120ms silent audio health probe. Reply exactly with valid JSON {ok:true} and nothing else.';

      const result = await client.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'Health probe: return {"ok":true}.' },
              { inlineData: { mimeType: wav.mimeType, data: wav.base64 } },
            ],
          },
        ],
        config: {
          systemInstruction: {
            role: 'system',
            parts: [{ text: healthSystemPrompt }],
          },
          temperature: 0,
          maxOutputTokens: 32,
          responseMimeType: 'application/json',
          candidateCount: 1,
          abortSignal: AbortSignal.timeout(9000),
        },
      });

      const responseTimeMs = Date.now() - start;
      const text =
        (result &&
          result.candidates &&
          result.candidates[0] &&
          result.candidates[0].content &&
          Array.isArray(result.candidates[0].content.parts) &&
          (result.candidates[0].content.parts[0] as { text?: string }).text) ||
        '';
      const ok = /ok\s*:\s*true/i.test(text);
      if (!ok) {
        const healthResult: VoiceProviderHealthCheckResult = {
          provider: VOICE_GEMINI_PROVIDER_KEY,
          code: 'gemini_provider_unavailable',
          status: 'degraded',
          checkedAt,
          responseTimeMs,
          errorCategory: 'voice_probe_malformed_response',
          modelUsed: runtimeConfig.model,
          modelAudioCapable: true,
          httpStatus: 200,
          errorKind: 'unknown',
          requestId: null,
          sanitizedError: 'voice probe response ok:true not detected',
        };
        logAdminVoiceHealthDiagnostic(healthResult, { probeBytes: wav.byteLength, responseTruncated: text.slice(0, 120) });
        return healthResult;
      }

      const healthResult: VoiceProviderHealthCheckResult = {
        provider: VOICE_GEMINI_PROVIDER_KEY,
        code: 'ready',
        status: 'healthy',
        checkedAt,
        responseTimeMs,
        modelUsed: runtimeConfig.model,
        modelAudioCapable: true,
        httpStatus: 200,
        errorKind: null,
        requestId: null,
        sanitizedError: null,
      };
      logAdminVoiceHealthDiagnostic(healthResult, { probeBytes: wav.byteLength, probeMime: wav.mimeType });
      return healthResult;
    } catch (err) {
      const errAny = err as any;
      const msg = errAny && errAny.message ? String(errAny.message) : String(err || '');
      const classified = classifyGeminiError(err, msg);
      const requestId: string | null =
        (errAny && (errAny.requestId || errAny['x-request-id'])) as string | null || null;
      const healthResult: VoiceProviderHealthCheckResult = {
        provider: VOICE_GEMINI_PROVIDER_KEY,
        code: classified.code,
        status: classified.status,
        checkedAt,
        responseTimeMs: Date.now() - start,
        errorCategory: classified.errorCategory,
        modelUsed: runtimeConfig.model,
        modelAudioCapable: true,
        httpStatus: classified.httpStatus,
        errorKind: classified.errorKind,
        requestId,
        sanitizedError: classified.sanitizedError,
      };
      logAdminVoiceHealthDiagnostic(healthResult);
      return healthResult;
    }
  }

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
