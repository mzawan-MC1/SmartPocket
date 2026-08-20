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
  multimodalFallback: string;
  translation: string;
  voice: string;
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
    voiceRequestTimeoutMs: number;
    documentRequestTimeoutMs: number;
    voiceHealthTimeoutMs: number;
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
        fast: (readEnv('GEMINI_TEXT_MODEL') || readEnv('GEMINI_FAST_MODEL', 'gemini-2.5-flash-lite')) as string,
        reasoning: readEnv('GEMINI_REASONING_MODEL', 'gemini-3.5-flash') as string,
        multimodal: readEnv('GEMINI_MULTIMODAL_MODEL', 'gemini-3.5-flash-lite') as string,
        multimodalFallback: readEnv('GEMINI_MULTIMODAL_FALLBACK_MODEL', 'gemini-3.1-flash-lite') as string,
        translation: (readEnv('GEMINI_TRANSLATION_MODEL') ||
          readEnv('GEMINI_TEXT_MODEL') ||
          readEnv('GEMINI_FAST_MODEL', 'gemini-3.5-flash-lite')) as string,
        voice: (readEnv('GEMINI_VOICE_MODEL') ||
          readEnv('GEMINI_MULTIMODAL_MODEL') ||
          readEnv('GEMINI_FAST_MODEL', 'gemini-3.5-flash-lite')) as string,
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
      voiceRequestTimeoutMs: readEnvInt('AI_VOICE_REQUEST_TIMEOUT_MS', 45000),
      documentRequestTimeoutMs: readEnvInt('AI_DOCUMENT_REQUEST_TIMEOUT_MS', 60000),
      voiceHealthTimeoutMs: readEnvInt('AI_VOICE_HEALTH_TIMEOUT_MS', 30000),
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
// ─── Dedicated per-usage Gemini model selectors (Hybrid Routing) ──────────────
// Each helper reads its dedicated environment variable first, then falls back to
// the documented default. This guarantees predictable hybrid routing:
//   • Smart-Entry text parsing     → GEMINI_TEXT_MODEL         (default gemini-2.5-flash-lite)
//   • Content translation (Articles/Blogs/Categories/FAQs) → GEMINI_TRANSLATION_MODEL (default gemini-3.5-flash-lite)
//   • Receipt OCR / Document upload → GEMINI_MULTIMODAL_MODEL (default gemini-3.5-flash-lite)
//   • Voice transcription           → GEMINI_VOICE_MODEL       (default gemini-3.5-flash-lite)
export function getGeminiTextModel(): string {
  return normalizeGeminiModel(getAIConfig().gemini.models.fast || 'gemini-2.5-flash-lite') || 'gemini-2.5-flash-lite';
}
export function getGeminiTranslationModel(): string {
  const cfg = getAIConfig();
  const explicit = normalizeGeminiModel(cfg.gemini.models.translation || '');
  const textFallback = normalizeGeminiModel(cfg.gemini.models.fast || '');
  const multimodalFallback = normalizeGeminiModel(cfg.gemini.models.multimodal || '');
  if (explicit) return explicit;
  if (textFallback) return textFallback;
  if (multimodalFallback) return multimodalFallback;
  return 'gemini-3.5-flash-lite';
}
export function getGeminiMultimodalModel(): string {
  const cfg = getAIConfig();
  const explicit = normalizeGeminiModel(cfg.gemini.models.multimodal || '');
  const fallback = normalizeGeminiModel(cfg.gemini.models.multimodalFallback || '');
  const textFallback = normalizeGeminiModel(cfg.gemini.models.fast || '');
  if (explicit) return explicit;
  if (fallback) return fallback;
  if (textFallback) return textFallback;
  return 'gemini-3.5-flash-lite';
}
export function getGeminiMultimodalFallbackModel(): string {
  const cfg = getAIConfig();
  const fallback = normalizeGeminiModel(cfg.gemini.models.multimodalFallback || '');
  const explicit = normalizeGeminiModel(cfg.gemini.models.multimodal || '');
  if (fallback) return fallback;
  if (explicit) return explicit;
  return 'gemini-3.1-flash-lite';
}
export function getGeminiVoiceModel(): string {
  const cfg = getAIConfig();
  const explicit = normalizeGeminiModel(cfg.gemini.models.voice || '');
  const multimodalFallback = normalizeGeminiModel(cfg.gemini.models.multimodal || '');
  const multimodalAlt = normalizeGeminiModel(cfg.gemini.models.multimodalFallback || '');
  if (explicit) return explicit;
  if (multimodalFallback) return multimodalFallback;
  if (multimodalAlt) return multimodalAlt;
  return 'gemini-3.5-flash-lite';
}
export function isGeminiConfiguredForContentTranslation(): boolean {
  const cfg = getAIConfig();
  return Boolean(cfg.gemini.apiKey && cfg.gemini.apiKey.length > 0 && cfg.runtime.enabled);
}
export function normalizeGeminiModel(rawModel: string): string {
  let s = String(rawModel ?? '').trim();
  if (!s) return s;
  while (s.startsWith('models/')) {
    s = s.slice('models/'.length);
  }
  return s;
}
export function resolveGeminiTranslationModel(): string {
  return getGeminiTranslationModel();
}
export type ContentTranslationProviderName = 'gemini' | 'openrouter';
export function resolveContentTranslationProvider(): ContentTranslationProviderName {
  const cfg = getAIConfig();
  const primary = cfg.language.primary;
  if (primary === 'gemini' && isGeminiConfiguredForContentTranslation()) return 'gemini';
  if (primary === 'openrouter' && cfg.openrouter.enabled) return 'openrouter';
  if (primary === 'gemini' && cfg.openrouter.enabled) return 'openrouter';
  if (isGeminiConfiguredForContentTranslation()) return 'gemini';
  if (cfg.openrouter.enabled) return 'openrouter';
  return 'gemini';
}
export function getContentTranslationModel(provider: ContentTranslationProviderName): string {
  const cfg = getAIConfig();
  if (provider === 'openrouter') return cfg.openrouter.defaultModel;
  return resolveGeminiTranslationModel();
}

// Reset cache (useful for unit tests or runtime env tampering)
export function resetAIConfigCache(): void {
  cachedConfig = undefined;
}
