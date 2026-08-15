// ─── AI Provider Config ──────────────────────────────────────────────────────
// Central configuration for AI providers.
// Step 1 preparation: Support provider-switch foundation between Gemini (direct)
// and OpenRouter (disabled future fallback). No endpoint migration yet.
// All existing ai-gateway.ts providers remain fully functional.

export type AIProviderName = 'gemini' | 'openrouter' | 'vps_ai' | 'mock';
export type STTProviderName = 'cloud_stt' | 'vps_stt' | 'mock';

export interface GeminiModelConfig {
  fast: string;
  reasoning: string;
  multimodal: string;
}

export interface AIProviderConfig {
  provider: AIProviderName;
  openrouter: {
    enabled: boolean;
    apiKey: string | undefined;
    baseUrl: string;
    defaultModel: string;
    voiceModel: string | undefined;
  };
  gemini: {
    apiKey: string | undefined;
    baseUrl: string | undefined;
    models: GeminiModelConfig;
  };
  stt: {
    primary: STTProviderName;
    fallback: STTProviderName;
  };
  language: {
    primary: AIProviderName;
    fallback: AIProviderName;
  };
  runtime: {
    enabled: boolean;
    mode: 'cloud_only' | 'vps_only' | 'cloud_primary' | 'vps_primary';
    mockMode: boolean;
    requestTimeoutMs: number;
    maxRetries: number;
    confidenceThreshold: number;
    maxDailyRequestsPerUser: number;
    maxTextLength: number;
    maxAudioSeconds: number;
    enableAutoFallback: boolean;
    enableTranscriptRetention: boolean;
  };
}

function readEnv(key: string, fallback?: string): string | undefined {
  if (typeof process === 'undefined' || !process.env) return fallback;
  const val = process.env[key];
  if (val === undefined || val === null || val === '') return fallback;
  return val;
}
function readEnvBool(key: string, fallback: boolean): boolean {
  const raw = readEnv(key);
  if (raw === undefined) return fallback;
  const s = String(raw).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}
function readEnvInt(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && Number.isInteger(n) ? n : fallback;
}
function readEnvFloat(key: string, fallback: number): number {
  const raw = readEnv(key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveAIProviderConfig(): AIProviderConfig {
  // AI_PROVIDER: intended new default = 'gemini'. Fallback = 'openrouter' (disabled)
  const envProviderRaw = readEnv('AI_PROVIDER', 'gemini')?.toLowerCase();
  const provider: AIProviderName =
    envProviderRaw === 'gemini' || envProviderRaw === 'openrouter' || envProviderRaw === 'vps_ai'
      ? (envProviderRaw as AIProviderName)
      : 'gemini';

  const envModeRaw = readEnv('AI_MODE', 'cloud_only')?.toLowerCase();
  const runtimeMode: AIProviderConfig['runtime']['mode'] =
    envModeRaw === 'cloud_only' ||
    envModeRaw === 'vps_only' ||
    envModeRaw === 'cloud_primary' ||
    envModeRaw === 'vps_primary'
      ? envModeRaw
      : 'cloud_only';

  const openrouterEnabled = readEnvBool('OPENROUTER_ENABLED', false);

  const defaultPrimary = provider === 'gemini' ? 'gemini' : 'openrouter';
  const defaultFallback: AIProviderName = 'vps_ai';
  const envPrimary = readEnv('PRIMARY_LANGUAGE_PROVIDER', defaultPrimary)?.toLowerCase();
  const envFallback = readEnv('FALLBACK_LANGUAGE_PROVIDER', defaultFallback)?.toLowerCase();

  return {
    provider,
    openrouter: {
      enabled: openrouterEnabled,
      apiKey: readEnv('OPENROUTER_API_KEY'),
      baseUrl: readEnv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1') as string,
      defaultModel: readEnv('OPENROUTER_MODEL', 'openai/gpt-4.1-mini') as string,
      voiceModel: readEnv('OPENROUTER_VOICE_MODEL'),
    },
    gemini: {
      apiKey: readEnv('GEMINI_API_KEY'),
      baseUrl: readEnv('GEMINI_BASE_URL'),
      models: {
        fast: readEnv('GEMINI_FAST_MODEL', 'gemini-3.5-flash-lite') as string,
        reasoning: readEnv('GEMINI_REASONING_MODEL', 'gemini-3.5-flash') as string,
        multimodal: readEnv('GEMINI_MULTIMODAL_MODEL', 'gemini-3.5-flash') as string,
      },
    },
    stt: {
      primary: (readEnv('PRIMARY_STT_PROVIDER', 'cloud_stt') as STTProviderName) ?? 'cloud_stt',
      fallback: (readEnv('FALLBACK_STT_PROVIDER', 'vps_stt') as STTProviderName) ?? 'vps_stt',
    },
    language: {
      primary:
        envPrimary === 'gemini' || envPrimary === 'openrouter' || envPrimary === 'vps_ai'
          ? (envPrimary as AIProviderName)
          : defaultPrimary,
      fallback:
        envFallback === 'gemini' || envFallback === 'openrouter' || envFallback === 'vps_ai'
          ? (envFallback as AIProviderName)
          : defaultFallback,
    },
    runtime: {
      enabled: readEnvBool('AI_ENABLED', true),
      mode: runtimeMode,
      mockMode: readEnvBool('AI_MOCK_MODE', false),
      requestTimeoutMs: readEnvInt('AI_REQUEST_TIMEOUT_MS', 20000),
      maxRetries: readEnvInt('AI_MAX_RETRIES', 1),
      confidenceThreshold: readEnvFloat('AI_CONFIDENCE_THRESHOLD', 0.8),
      maxDailyRequestsPerUser: readEnvInt('AI_MAX_DAILY_REQUESTS_PER_USER', 100),
      maxTextLength: readEnvInt('AI_MAX_TEXT_LENGTH', 2000),
      maxAudioSeconds: readEnvInt('AI_MAX_AUDIO_SECONDS', 120),
      enableAutoFallback: readEnvBool('AI_ENABLE_AUTO_FALLBACK', false),
      enableTranscriptRetention: readEnvBool('AI_ENABLE_TRANSCRIPT_RETENTION', false),
    },
  };
}

// Singleton cache (per server process / server module)
let cachedConfig: AIProviderConfig | undefined;
export function getAIConfig(): AIProviderConfig {
  if (cachedConfig) return cachedConfig;
  cachedConfig = resolveAIProviderConfig();
  return cachedConfig;
}

// Convenience helpers
export function isGeminiPrimary(): boolean {
  return getAIConfig().language.primary === 'gemini';
}
export function isOpenRouterEnabled(): boolean {
  return getAIConfig().openrouter.enabled;
}
export function getGeminiModels(): GeminiModelConfig {
  return getAIConfig().gemini.models;
}

// Reset cache (useful for unit tests or runtime env tampering)
export function resetAIConfigCache(): void {
  cachedConfig = undefined;
}
