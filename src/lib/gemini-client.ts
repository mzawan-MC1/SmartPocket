// ─── Gemini Client (Step 1 preparation only) ─────────────────────────────────
// Server-side only. Never import this from browser components.
// Initializes GoogleGenAI client from @google/genai.
// No endpoint migration / call routing yet: ai-gateway.ts keeps OpenRouter active.
// OpenRouter remains as disabled fallback (OPENROUTER_ENABLED=false).

import { GoogleGenAI } from '@google/genai';
import {
  getAIConfig,
  type AIProviderConfig,
  type GeminiModelConfig,
} from './ai-provider-config';

export interface GeminiClientHandle {
  readonly client: GoogleGenAI | null;
  readonly configured: boolean;
  readonly models: GeminiModelConfig;
  readonly apiKeyPresent: boolean;
  getModels: () => GeminiModelConfig;
  isConfigured: () => boolean;
  getConfig: () => AIProviderConfig;
  /** Low-level accessor: returns raw client, or throws helpful if missing key */
  requireClient: (reasonLabel?: string) => GoogleGenAI;
}

// Lazy singleton
let cachedClient: GoogleGenAI | null = null;
let cachedConfigSnapshot: { key: string | undefined; baseUrl: string | undefined } | undefined;

function makeClient(apiKey: string, baseUrl?: string): GoogleGenAI {
  const opts: ConstructorParameters<typeof GoogleGenAI>[0] = {
    apiKey,
  };
  if (baseUrl && baseUrl.length > 0) {
    // @ts-expect-error - GoogleGenAI options accept baseUrl in recent builds, TS may lag
    opts.baseUrl = baseUrl;
  }
  return new GoogleGenAI(opts);
}

function resolveInternal(): GeminiClientHandle {
  const cfg = getAIConfig();
  const key = cfg.gemini.apiKey;
  const baseUrl = cfg.gemini.baseUrl;

  const snapshotChanged =
    !cachedConfigSnapshot ||
    cachedConfigSnapshot.key !== key ||
    cachedConfigSnapshot.baseUrl !== baseUrl;

  if (snapshotChanged) {
    cachedClient = key && key.length > 0 ? makeClient(key, baseUrl) : null;
    cachedConfigSnapshot = { key, baseUrl };
  }

  const configured = Boolean(cachedClient);

  return {
    client: cachedClient,
    configured,
    models: cfg.gemini.models,
    apiKeyPresent: Boolean(cfg.gemini.apiKey && cfg.gemini.apiKey.length > 0),
    getModels: () => cfg.gemini.models,
    isConfigured: () => configured,
    getConfig: () => cfg,
    requireClient: (reasonLabel?: string): GoogleGenAI => {
      if (!cachedClient) {
        const hint = reasonLabel ? ` (needed for ${reasonLabel})` : '';
        throw new Error(
          `Gemini client is not configured${hint}. ` +
            `Set GEMINI_API_KEY environment variable. ` +
            `Currently AI_PROVIDER=${cfg.provider} and language.primary=${cfg.language.primary}.`,
        );
      }
      return cachedClient;
    },
  };
}

export function getGeminiClient(): GeminiClientHandle {
  return resolveInternal();
}

export function resetGeminiClientCache(): void {
  cachedClient = null;
  cachedConfigSnapshot = undefined;
}
