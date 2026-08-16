'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Zap, Server, Cloud, Mic, Shield, BarChart3, CheckCircle, XCircle, AlertTriangle, Loader2, RefreshCw, Save, Activity, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Tabs from '@/components/ui/Tabs';
import SettingRow from '@/components/ui/SettingRow';


interface AISettings {
  ai_enabled: boolean;
  ai_mode: 'cloud_only' | 'vps_only' | 'cloud_primary' | 'vps_primary';
  primary_language_provider: string;
  fallback_language_provider: string;
  openrouter_model: string;
  voice_model: string;
  vps_language_model: string;
  vps_ai_base_url: string;
  request_timeout_ms: number;
  max_retries: number;
  confidence_threshold: number;
  require_confirmation: boolean;
  max_audio_seconds: number;
  max_daily_requests_per_user: number;
  enable_auto_fallback: boolean;
  enable_audit_logs: boolean;
  enable_transcript_retention: boolean;
  transcript_retention_days: number;
  openrouter_configured: boolean;
  vps_ai_configured: boolean;
}

interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured' | 'disabled';
  last_checked_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error_category: string | null;
  response_time_ms: number | null;
}

interface AdminStats {
  total_requests: number;
  cloud_requests: number;
  vps_requests: number;
  fallback_requests: number;
  successful_requests: number;
  failed_requests: number;
  confirmed_requests: number;
  active_users: number;
  avg_duration_ms: number;
}

interface ServerAIConfigStatus {
  provider: 'gemini' | 'openrouter' | 'vps_ai' | 'mock';
  geminiApiKeyConfigured: boolean;
  geminiTextModel: string;
  geminiMultimodalModel: string;
  geminiConfigured: boolean;
  openrouterConfigured: boolean;
  openrouterBaseUrlConfigured: boolean;
  supabaseServiceConfigured: boolean;
  vpsConfigured: boolean;
  aiEnabled: boolean;
  mode: 'cloud_only' | 'vps_only' | 'cloud_primary' | 'vps_primary';
  model: string;
  voiceTranscription: {
    ready: boolean;
    configurationReady: boolean;
    code: string;
    gateway: 'gemini' | 'openrouter';
    model: string | null;
    modelSource: string;
    modelAudioCapable: boolean | null;
    maxAudioSeconds: number;
    maxAudioBytes: number;
    supportedAudioFormats: string;
    openrouterConfigured: boolean;
    apiKeyConfigured: boolean;
    baseUrlConfigured: boolean;
    lastHealthCheck: {
      provider: string;
      status: string;
      checkedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      errorCategory: string | null;
      responseTimeMs: number | null;
      modelUsed: string | null;
      modelAudioCapable: boolean | null;
    } | null;
  };
}

const DEFAULT_SETTINGS: AISettings = {
  ai_enabled: true,
  ai_mode: 'cloud_only',
  primary_language_provider: 'openrouter',
  fallback_language_provider: 'vps_ai',
  openrouter_model: 'openai/gpt-4.1-mini',
  voice_model: '',
  vps_language_model: 'llama3',
  vps_ai_base_url: '',
  request_timeout_ms: 20000,
  max_retries: 1,
  confidence_threshold: 0.80,
  require_confirmation: true,
  max_audio_seconds: 120,
  max_daily_requests_per_user: 100,
  enable_auto_fallback: false,
  enable_audit_logs: true,
  enable_transcript_retention: false,
  transcript_retention_days: 30,
  openrouter_configured: false,
  vps_ai_configured: false,
};

// ─── Config Status Check ──────────────────────────────────────────────────────

interface ConfigStatus {
  openrouter: 'configured' | 'missing' | 'test_failed' | 'healthy' | 'checking';
  supabaseServiceKey: 'configured' | 'missing' | 'checking';
  voice: 'configured' | 'missing' | 'test_failed' | 'healthy' | 'checking';
  vps: 'configured' | 'missing' | 'test_failed' | 'healthy' | 'checking';
}

const ACTIVE_PROVIDER_NAMES = new Set(['gemini', 'gemini_voice', 'openrouter', 'openrouter_voice', 'vps_ai']);

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getProviderDisplayName(provider: string) {
  switch (provider) {
    case 'gemini':
      return 'Gemini';
    case 'gemini_voice':
      return 'Gemini Voice';
    case 'openrouter':
      return 'OpenRouter';
    case 'vps_ai':
      return 'VPS AI';
    case 'openrouter_voice':
      return 'OpenRouter Voice';
    default:
      return provider.replace(/_/g, ' ');
  }
}

function ConfigStatusPanel({
  health,
  serverConfig,
}: {
  health: ProviderHealth[];
  serverConfig: ServerAIConfigStatus | null;
}) {
  const openrouterHealth = health.find(h => h.provider === 'openrouter');
  const vpsAiHealth = health.find(h => h.provider === 'vps_ai');
  const voiceHealth = serverConfig?.voiceTranscription?.lastHealthCheck;

  const isCloudOnly = serverConfig?.mode === 'cloud_only';

  let geminiStatus: ConfigStatus['openrouter'] = 'checking';
  if (serverConfig) {
    if (!serverConfig.geminiConfigured) geminiStatus = 'missing';
    else {
      const geminiHealth = health.find(h => h.provider === 'gemini');
      if (geminiHealth?.status === 'healthy') geminiStatus = 'healthy';
      else if (geminiHealth?.status === 'offline' || geminiHealth?.status === 'degraded') geminiStatus = 'test_failed';
      else geminiStatus = 'configured';
    }
  }

  let openrouterStatus: ConfigStatus['openrouter'] = 'checking';
  if (serverConfig) {
    if (!serverConfig.openrouterConfigured) openrouterStatus = 'missing';
    else if (openrouterHealth?.status === 'healthy') openrouterStatus = 'healthy';
    else if (openrouterHealth?.status === 'offline' || openrouterHealth?.status === 'degraded') openrouterStatus = 'test_failed';
    else openrouterStatus = 'configured';
  }

  let supabaseStatus: ConfigStatus['supabaseServiceKey'] = 'checking';
  if (serverConfig) {
    supabaseStatus = serverConfig.supabaseServiceConfigured ? 'configured' : 'missing';
  }

  let voiceStatus: ConfigStatus['voice'] = 'checking';
  if (serverConfig) {
    if (!serverConfig.voiceTranscription?.configurationReady) {
      const code = serverConfig.voiceTranscription?.code;
      if (
        code === 'openrouter_provider_unavailable'
        || code === 'openrouter_auth_failed'
        || code === 'gemini_provider_unavailable'
        || code === 'gemini_auth_failed'
        || code === 'gemini_request_timeout'
        || code === 'gemini_rate_limited'
        || code === 'gemini_model_missing'
        || code === 'voice_model_audio_unsupported'
      ) {
        voiceStatus = 'configured';
      } else {
        voiceStatus = 'missing';
      }
    } else if (voiceHealth?.status === 'healthy') {
      voiceStatus = 'healthy';
    } else if (voiceHealth?.status === 'offline' || voiceHealth?.status === 'degraded') {
      voiceStatus = 'test_failed';
    } else {
      voiceStatus = 'configured';
    }
  }

  let vpsStatus: ConfigStatus['vps'] = 'checking';
  if (serverConfig) {
    if (isCloudOnly) {
      vpsStatus = 'configured';
    } else if (!serverConfig.vpsConfigured) {
      vpsStatus = 'missing';
    } else if (vpsAiHealth?.status === 'healthy') {
      vpsStatus = 'healthy';
    } else if (
      vpsAiHealth?.status === 'offline' ||
      vpsAiHealth?.status === 'degraded'
    ) {
      vpsStatus = 'test_failed';
    } else {
      vpsStatus = 'configured';
    }
  }

  const statusMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    healthy:          { color: 'text-positive', icon: <CheckCircle size={14} />, label: 'Healthy' },
    configured:       { color: 'text-info',     icon: <CheckCircle size={14} />, label: 'Configured' },
    missing:          { color: 'text-muted-foreground', icon: <AlertTriangle size={14} />, label: 'Missing' },
    test_failed:      { color: 'text-negative', icon: <XCircle size={14} />, label: 'Test Failed' },
    checking:         { color: 'text-warning',  icon: <Loader2 size={14} className="animate-spin" />, label: 'Checking…' },
    disabled:         { color: 'text-muted-foreground', icon: <AlertTriangle size={14} />, label: 'Disabled' },
  };

  const geminiRowStatus = statusMap[geminiStatus];
  const orStatus = statusMap[openrouterStatus];
  const sbStatus = statusMap[supabaseStatus];
  const voiceRowStatus = statusMap[voiceStatus];
  const vpsRowStatus = statusMap[vpsStatus];

  const gateway = serverConfig?.voiceTranscription.gateway;
  const gatewayLabel = gateway ? capitalize(gateway) : '';

  return (
    <div className="card p-5 mb-4">
      <h3 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
        <Shield size={16} className="text-accent" />
        Configuration Status
      </h3>
      {serverConfig && (
        <div className="mb-3 text-xs text-muted-foreground">
          Mode: <span className="text-foreground font-600">{serverConfig.mode}</span> · Primary:{' '}
          <span className="text-foreground font-600">{capitalize(serverConfig.provider)}</span> · Text:{' '}
          <span className="text-foreground font-600">{serverConfig.geminiTextModel || 'Not set'}</span> · Multimodal:{' '}
          <span className="text-foreground font-600">{serverConfig.geminiMultimodalModel || 'Not set'}</span>
        </div>
      )}
      {serverConfig?.voiceTranscription && (
        <div className="mb-3 rounded-xl border border-border/60 bg-secondary/35 p-3 text-xs text-muted-foreground">
          <div className="grid gap-1 sm:grid-cols-2">
            <div>
              Gateway: <span className="font-600 text-foreground">{gatewayLabel}</span>
            </div>
            {gateway === 'openrouter' && (
              <div>
                OpenRouter configured: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.openrouterConfigured ? 'Yes' : 'No'}</span>
              </div>
            )}
            {gateway === 'gemini' && (
              <div>
                Gemini API Key Configured: <span className="font-600 text-foreground">{serverConfig.geminiApiKeyConfigured ? 'Yes' : 'No'}</span>
              </div>
            )}
            <div>
              Voice model: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.model || 'Missing'}</span>
            </div>
            <div>
              Model source: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.modelSource}</span>
            </div>
            <div>
              Audio capable: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.modelAudioCapable === null ? 'Unknown' : serverConfig.voiceTranscription.modelAudioCapable ? 'Yes' : 'No'}</span>
            </div>
            <div>
              Voice ready (config): <span className="font-600 text-foreground">{serverConfig.voiceTranscription.configurationReady ? 'Yes' : 'No'}</span>
            </div>
            <div>
              Voice ready: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.ready ? 'Yes' : 'No'}</span>
            </div>
            <div>
              Status code: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.code}</span>
            </div>
            <div>
              Max audio: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.maxAudioSeconds}s / {(serverConfig.voiceTranscription.maxAudioBytes / (1024 * 1024)).toFixed(0)} MB</span>
            </div>
            {gateway === 'openrouter' && (
              <div>
                OpenRouter key: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.apiKeyConfigured ? 'Configured' : 'Missing'}</span>
              </div>
            )}
            {gateway === 'openrouter' && (
              <div>
                Base URL: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.baseUrlConfigured ? 'Configured' : 'Missing'}</span>
              </div>
            )}
            <div>
              Last health: <span className="font-600 text-foreground">{voiceHealth?.status || 'Not checked'}</span>
            </div>
          </div>
          <div className="mt-1">
            Supported audio: <span className="font-600 text-foreground">{serverConfig.voiceTranscription.supportedAudioFormats}</span>
          </div>
          {voiceHealth?.errorCategory && (
            <div className="mt-1">
              Health detail: <span className="font-600 text-foreground">{voiceHealth.errorCategory}</span>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <span className="text-sm text-foreground">Gemini API Key</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${geminiRowStatus.color}`}>
            {geminiRowStatus.icon}
            {serverConfig?.geminiConfigured ? 'Configured' : 'Missing'}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <span className="text-sm text-foreground">OpenRouter API Key (Legacy Fallback)</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${orStatus.color}`}>
            {orStatus.icon}
            {serverConfig?.openrouterConfigured ? (serverConfig.provider === 'openrouter' ? 'Configured' : 'Disabled') : 'Missing'}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <span className="text-sm text-foreground">Supabase Service Key</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${sbStatus.color}`}>
            {sbStatus.icon}
            {sbStatus.label}
          </span>
        </div>
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <span className="text-sm text-foreground">Voice transcription</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${voiceRowStatus.color}`}>
            {voiceRowStatus.icon}
            {voiceRowStatus.label}
          </span>
        </div>
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-foreground">{isCloudOnly ? 'VPS Providers (not required in Cloud Only)' : 'VPS Providers'}</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${vpsRowStatus.color}`}>
            {vpsRowStatus.icon}
            {vpsRowStatus.label}
          </span>
        </div>
      </div>
      {voiceHealth && (
        <p className="text-xs text-muted-foreground mt-3">
          Last voice health check: {voiceHealth.status} {voiceHealth.checkedAt ? `at ${new Date(voiceHealth.checkedAt).toLocaleString()}` : ''}
          {voiceHealth.errorCategory ? ` (${voiceHealth.errorCategory})` : ''}
        </p>
      )}
      <p className="text-xs text-muted-foreground mt-3">
        Secrets are set as server-only environment variables. Use the Health tab to run live connection tests.
      </p>
    </div>
  );
}

function ProviderHealthBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    healthy:        { color: 'bg-positive-soft text-positive', icon: <CheckCircle size={12} />, label: 'Healthy' },
    degraded:       { color: 'bg-warning-soft text-warning',   icon: <AlertTriangle size={12} />, label: 'Degraded' },
    offline:        { color: 'bg-negative-soft text-negative', icon: <XCircle size={12} />, label: 'Offline' },
    not_configured: { color: 'bg-muted text-muted-foreground', icon: <AlertTriangle size={12} />, label: 'Missing' },
    configured:     { color: 'bg-positive-soft text-positive', icon: <CheckCircle size={12} />, label: 'Configured' },
    disabled:       { color: 'bg-muted text-muted-foreground', icon: <AlertTriangle size={12} />, label: 'Disabled' },
    not_required:   { color: 'bg-muted text-muted-foreground', icon: <AlertTriangle size={12} />, label: 'Not required' },
  };
  const s = map[status] || map.not_configured;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-600 ${s.color}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

type VoiceCardStatusTone = 'healthy' | 'degraded' | 'offline' | 'missing' | 'not_configured' | 'disabled' | 'not_required';
function resolveVoiceCardBadge(
  configurationReady: boolean | undefined,
  liveHealth: { status?: string | null } | undefined,
  providerVoiceCode: string | undefined
): VoiceCardStatusTone {
  if (configurationReady === false) {
    if (providerVoiceCode === 'gemini_model_missing' || providerVoiceCode === 'voice_model_missing') return 'missing';
    return 'missing';
  }
  const h = liveHealth?.status;
  if (h === 'healthy') return 'healthy';
  if (h === 'degraded') return 'degraded';
  if (h === 'offline') return 'offline';
  if (h === 'not_configured') return 'not_configured';
  return 'not_configured';
}

export default function AdminAISettingsPage() {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [serverConfig, setServerConfig] = useState<ServerAIConfigStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'providers' | 'health' | 'usage'>('general');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();

      const [settingsRes, healthRes, statsRes, configRes] = await Promise.all([
        supabase.from('ai_settings').select('*').eq('singleton_key', 'global').single(),
        supabase.from('ai_provider_health').select('*'),
        supabase.rpc('get_ai_admin_stats', { p_period: 'today' }),
        fetch('/api/admin/ai/config-status', { method: 'GET' }),
      ]);

      if (settingsRes.data) setSettings({ ...DEFAULT_SETTINGS, ...settingsRes.data });
      if (healthRes.data) setHealth(healthRes.data);
      if (statsRes.data) setStats(statsRes.data as AdminStats);
      if (configRes.ok) {
        const json = (await configRes.json()) as ServerAIConfigStatus;
        setServerConfig(json);
      } else {
        setServerConfig(null);
      }
    } catch (err) {
      toast.error('Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (serverConfig?.mode === 'cloud_only') {
      setSettings((prev) => (prev.enable_auto_fallback ? { ...prev, enable_auto_fallback: false } : prev));
    }
  }, [serverConfig?.mode]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('ai_settings')
        .update({
          ai_enabled: settings.ai_enabled,
          ai_mode: settings.ai_mode,
          primary_language_provider: settings.primary_language_provider,
          fallback_language_provider: settings.fallback_language_provider,
          openrouter_model: settings.openrouter_model,
          voice_model: settings.voice_model || null,
          vps_language_model: settings.vps_language_model,
          vps_ai_base_url: settings.vps_ai_base_url,
          request_timeout_ms: settings.request_timeout_ms,
          max_retries: settings.max_retries,
          confidence_threshold: settings.confidence_threshold,
          require_confirmation: settings.require_confirmation,
          max_audio_seconds: settings.max_audio_seconds,
          max_daily_requests_per_user: settings.max_daily_requests_per_user,
          enable_auto_fallback: settings.enable_auto_fallback,
          enable_audit_logs: settings.enable_audit_logs,
          enable_transcript_retention: settings.enable_transcript_retention,
          transcript_retention_days: settings.transcript_retention_days,
          updated_at: new Date().toISOString(),
        })
        .eq('singleton_key', 'global');

      if (error) throw error;
      toast.success('AI settings saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestProvider = async (provider: string) => {
    setTestingProvider(provider);
    const displayName = getProviderDisplayName(provider);
    try {
      const response = await fetch('/api/ai/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const result = await response.json();
      if (result.status === 'healthy') {
        toast.success(`${displayName}: Connection successful`, {
          description: typeof result.responseTimeMs === 'number' ? `${result.responseTimeMs}ms` : undefined,
        });
      } else if (result.status === 'disabled') {
        toast.warning(`${displayName}: Disabled${result.errorCategory ? ` (${result.errorCategory})` : ''}`);
      } else if (result.status === 'not_configured') {
        toast.warning(`${displayName}: Not configured — set environment variables on the server`, {
          description: typeof result.errorCategory === 'string' ? result.errorCategory : undefined,
        });
      } else {
        const detail =
          (result.diagnostic?.sanitizedError as string | undefined) ||
          (result.errorCategory as string | undefined) ||
          (typeof result.diagnostic?.errorKind === 'string' ? result.diagnostic.errorKind : undefined) ||
          (typeof result.httpStatus === 'number' ? `HTTP ${result.httpStatus}` : undefined) ||
          undefined;
        toast.error(`${displayName}: ${String(result.code || result.status || 'Test Failed')}`, {
          description: detail,
        });
      }
      await loadData();
    } catch {
      toast.error(`Test failed for ${displayName}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleRunHealthChecks = async () => {
    try {
      await fetch('/api/ai/health');
      await loadData();
      toast.success('Health checks completed');
    } catch {
      toast.error('Health check failed');
    }
  };

  const update = (key: keyof AISettings, value: unknown) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const TABS = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'providers', label: 'Providers', icon: Server },
    { id: 'health', label: 'Health', icon: Activity },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
  ] as const;

  const isCloudOnlyMode = serverConfig?.mode === 'cloud_only';
  const providerHealthRows = health.filter((item) => ACTIVE_PROVIDER_NAMES.has(item.provider));

  const openrouterEnvDisabled = !(serverConfig?.provider === 'openrouter' || (serverConfig?.openrouterConfigured && serverConfig?.mode !== 'cloud_only'));
  const openrouterFlagDisabled = (() => {
    const orHealth = providerHealthRows.find(r => r.provider === 'openrouter');
    if (orHealth?.status === 'disabled') return true;
    if (serverConfig?.provider !== 'openrouter' && serverConfig?.provider === 'gemini') {
      return serverConfig.openrouterConfigured === false ? true : !orHealth;
    }
    return false;
  })();
  const isOpenRouterDisabled = openrouterEnvDisabled || openrouterFlagDisabled || Boolean(serverConfig && serverConfig.provider !== 'openrouter' && !serverConfig.openrouterConfigured);

  const normalizeHealth = (provider: string, row: ProviderHealth | undefined): ProviderHealth | undefined => {
    if (!row) return undefined;
    if ((provider === 'openrouter' || provider === 'openrouter_voice') && isOpenRouterDisabled) {
      return { ...row, status: 'disabled', last_error_category: 'openrouter_disabled' };
    }
    if (provider === 'vps_ai' && isCloudOnlyMode) {
      return { ...row, status: 'disabled', last_error_category: 'cloud_only_mode' };
    }
    return row;
  };

  const geminiHealth = normalizeHealth('gemini', providerHealthRows.find((item) => item.provider === 'gemini'));
  const geminiVoiceHealth = normalizeHealth('gemini_voice', providerHealthRows.find((item) => item.provider === 'gemini_voice'));
  const openrouterHealth = normalizeHealth('openrouter', providerHealthRows.find((item) => item.provider === 'openrouter'));
  const openrouterVoiceHealth = normalizeHealth('openrouter_voice', providerHealthRows.find((item) => item.provider === 'openrouter_voice'));
  const vpsAiHealth = normalizeHealth('vps_ai', providerHealthRows.find((item) => item.provider === 'vps_ai'));

  const allProviders: Array<'gemini' | 'gemini_voice' | 'openrouter' | 'openrouter_voice' | 'vps_ai'> = ['gemini', 'gemini_voice', 'openrouter', 'openrouter_voice', 'vps_ai'];
  const overallEligibleProviders = allProviders.filter(p => {
    if (p === 'openrouter' || p === 'openrouter_voice') return !isOpenRouterDisabled;
    if (p === 'vps_ai') return !isCloudOnlyMode;
    return true;
  });
  const healthyProviderCount = overallEligibleProviders.filter(p => {
    if (p === 'gemini') return geminiHealth?.status === 'healthy';
    if (p === 'gemini_voice') return geminiVoiceHealth?.status === 'healthy';
    if (p === 'openrouter') return openrouterHealth?.status === 'healthy';
    if (p === 'openrouter_voice') return openrouterVoiceHealth?.status === 'healthy';
    if (p === 'vps_ai') return vpsAiHealth?.status === 'healthy';
    return false;
  }).length;
  const geminiProvidersGood = ['gemini', 'gemini_voice'].every(p => {
    const h = p === 'gemini' ? geminiHealth : geminiVoiceHealth;
    return h?.status === 'healthy';
  });
  const openrouterEnabled = !isOpenRouterDisabled;

  const voiceGateway = serverConfig?.voiceTranscription.gateway;
  const voiceLabel = voiceGateway === 'gemini' ? 'Gemini Voice Ready' : 'OpenRouter Voice Ready';
  const voiceHealthLabel = voiceGateway === 'gemini' ? 'Gemini Voice Health' : 'OpenRouter Voice Health';

  const checklistItems = [
    { id: 'supabase', label: 'Supabase Service Role Key Configured', done: Boolean(serverConfig?.supabaseServiceConfigured) },
    { id: 'gemini-key', label: 'Gemini API Key Configured', done: Boolean(serverConfig?.geminiApiKeyConfigured) },
    { id: 'gemini-text', label: 'Gemini Text Model Configured', done: Boolean(serverConfig?.geminiTextModel) },
    { id: 'gemini-multimodal', label: 'Gemini Multimodal Model Configured', done: Boolean(serverConfig?.geminiMultimodalModel) },
    { id: 'gemini-connection', label: 'Gemini Connection Verified', done: geminiHealth?.status === 'healthy', unverified: !geminiHealth || geminiHealth.status === 'not_configured' },
    { id: 'voice-ready', label: voiceLabel, done: Boolean(serverConfig?.voiceTranscription.configurationReady) },
    { id: 'voice-health', label: voiceHealthLabel, done: (voiceGateway === 'gemini' ? geminiVoiceHealth?.status : openrouterVoiceHealth?.status) === 'healthy', unverified: !(voiceGateway === 'gemini' ? geminiVoiceHealth : openrouterVoiceHealth) },
    { id: 'ai-enabled', label: 'AI Enabled', done: Boolean(serverConfig?.aiEnabled && settings.ai_enabled) },
    { id: 'confirmation', label: 'Confirmation Enabled', done: settings.require_confirmation },
    { id: 'provider-health', label: 'Provider Health Overall', done: overallEligibleProviders.length > 0 ? healthyProviderCount === overallEligibleProviders.length : false },
  ];

  const checklistComplete = checklistItems.filter((item) => item.done).length;
  const overallStatus =
    checklistComplete === checklistItems.length
      ? { tone: 'ready' as const, label: 'Ready' }
      : checklistComplete >= 3
        ? { tone: 'warning' as const, label: 'Partially configured' }
        : { tone: 'error' as const, label: 'Action required' };

  const renderSwitch = (checked: boolean, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={checked}
      className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-muted'
      }`}
    >
      <span className={`absolute left-1 text-[10px] font-700 uppercase ${checked ? 'text-white/80' : 'text-muted-foreground'}`}>
        {checked ? 'On' : 'Off'}
      </span>
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-8' : 'translate-x-1'
        }`}
      />
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
      <div className="w-full page-section">
        <PageHeader
          title="AI Settings"
          description={
            serverConfig?.provider === 'gemini'
              ? 'Smart Pocket AI currently uses Google Gemini as the primary provider. OpenRouter is available as a legacy fallback.'
              : 'Configure Smart Pocket AI providers, connection health, confirmation rules, and usage controls without exposing server secrets.'
          }
          badge={<StatusBadge status={overallStatus.tone} label={overallStatus.label} />}
          actions={
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save
            </button>
          }
        />

        <SectionCard
          title="Setup Checklist"
          description={`${checklistComplete} of ${checklistItems.length} completed`}
          action={<StatusBadge status="info" label={serverConfig?.mode === 'cloud_only' ? 'Cloud Only' : (serverConfig?.mode || settings.ai_mode)} />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {checklistItems.map((item) => {
              const isUnverified = (item as any).unverified;
              const badgeStatus = isUnverified ? 'info' : (item.done ? 'ready' : 'warning');
              const badgeLabel = isUnverified ? 'Unverified' : (item.done ? 'Done' : 'Pending');
              const desc = isUnverified
                ? 'Run health checks or test connection to verify.'
                : item.done ? 'Configured and available.' : 'Needs attention before full AI readiness.';
              return (
                <div key={item.id} className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 flex items-start gap-3">
                  <StatusBadge status={badgeStatus} label={badgeLabel} />
                  <div className="min-w-0">
                    <p className="text-sm font-700 text-foreground">{item.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <div className="p-4 bg-info-soft border border-info/20 rounded-2xl flex items-start gap-3">
          <Shield size={16} className="text-info mt-0.5 flex-shrink-0" />
          <p className="text-sm text-info">
            API keys and service credentials remain server-only. This page reads safe configuration status from protected endpoints and runs connection tests on the server.
          </p>
        </div>

        <Tabs items={TABS} activeId={activeTab} onChange={setActiveTab} />

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <ConfigStatusPanel health={health} serverConfig={serverConfig} />
            <SectionCard title="AI Assistant" description="Base assistant availability and core transaction-entry behavior.">
              <SettingRow
                label="Enable AI Assistant"
                description="Allow users to enter transactions using voice or text AI."
                control={renderSwitch(settings.ai_enabled, () => update('ai_enabled', !settings.ai_enabled))}
              />
            </SectionCard>

            <SectionCard title="Provider Mode" description="Choose how Smart Pocket routes requests between cloud and VPS providers.">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Operating Mode</label>
                  <select
                    value={settings.ai_mode}
                    onChange={e => update('ai_mode', e.target.value)}
                    className="input-base text-sm w-full max-w-md"
                  >
                    <option value="cloud_primary">Cloud Primary, VPS Fallback</option>
                    <option value="vps_primary">VPS Primary, Cloud Fallback</option>
                    <option value="cloud_only">Cloud Only</option>
                    <option value="vps_only">VPS Only</option>
                  </select>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Confirmation & Safety" description="Control review requirements and fallback behavior.">
              <SettingRow
                label="Require Confirmation"
                description="Always show a confirmation preview before records are created."
                control={renderSwitch(settings.require_confirmation, () => update('require_confirmation', !settings.require_confirmation))}
              />
              <SettingRow
                label="Automatic Fallback"
                description="Try a secondary provider if the primary provider fails."
                helper={isCloudOnlyMode ? 'Available after a secondary provider is configured.' : undefined}
                disabled={isCloudOnlyMode}
                control={renderSwitch(
                  settings.enable_auto_fallback,
                  () => {
                    if (!isCloudOnlyMode) update('enable_auto_fallback', !settings.enable_auto_fallback);
                  },
                  isCloudOnlyMode
                )}
              />
            </SectionCard>

            <SectionCard title="Limits & Performance" description="Request timing, retries, confidence, and usage boundaries.">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Timeout (ms)</label>
                  <input
                    type="number"
                    value={settings.request_timeout_ms}
                    onChange={e => update('request_timeout_ms', parseInt(e.target.value))}
                    className="input-base text-sm w-full"
                    min={5000} max={60000} step={1000}
                  />
                </div>
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Max Retries</label>
                  <input
                    type="number"
                    value={settings.max_retries}
                    onChange={e => update('max_retries', parseInt(e.target.value))}
                    className="input-base text-sm w-full"
                    min={0} max={3}
                  />
                </div>
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Confidence Threshold</label>
                  <input
                    type="number"
                    value={settings.confidence_threshold}
                    onChange={e => update('confidence_threshold', parseFloat(e.target.value))}
                    className="input-base text-sm w-full"
                    min={0.5} max={1.0} step={0.05}
                  />
                </div>
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Max Audio (sec)</label>
                  <input
                    type="number"
                    value={settings.max_audio_seconds}
                    onChange={e => update('max_audio_seconds', parseInt(e.target.value))}
                    className="input-base text-sm w-full"
                    min={10} max={300}
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Daily Request Limit per User</label>
                  <input
                    type="number"
                    value={settings.max_daily_requests_per_user}
                    onChange={e => update('max_daily_requests_per_user', parseInt(e.target.value))}
                    className="input-base text-sm w-full"
                    min={1} max={1000}
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Audit & Retention" description="Operational logging and transcript storage rules.">
              <SettingRow
                label="Enable Audit Logs"
                description="Log AI requests for platform diagnostics without storing raw audio."
                control={renderSwitch(settings.enable_audit_logs, () => update('enable_audit_logs', !settings.enable_audit_logs))}
              />
              <SettingRow
                label="Retain Transcripts"
                description="Store voice transcripts so admins can review and users can remove them later."
                control={renderSwitch(
                  settings.enable_transcript_retention,
                  () => update('enable_transcript_retention', !settings.enable_transcript_retention)
                )}
              />
                {settings.enable_transcript_retention && (
                  <div className="max-w-xs">
                    <label className="text-sm font-700 text-foreground mb-1.5 block">Retention Period (days)</label>
                    <input
                      type="number"
                      value={settings.transcript_retention_days}
                      onChange={e => update('transcript_retention_days', parseInt(e.target.value))}
                      className="input-base text-sm w-full"
                      min={1} max={365}
                    />
                  </div>
                )}
            </SectionCard>
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* 1. Gemini Text (Primary) */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Cloud size={18} className="text-positive" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">Gemini Text</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Primary Google Gemini language provider</p>
                  </div>
                </div>
                <StatusBadge status={serverConfig?.geminiConfigured ? 'configured' : 'missing'} />
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Set <code className="bg-muted px-1 rounded text-xs">GOOGLE_API_KEY</code> or{' '}
                  <code className="bg-muted px-1 rounded text-xs">GEMINI_API_KEY</code> as a server environment variable.
                  Keys are never stored in the database.
                </p>
              </div>
              <div className="space-y-3 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Primary provider</span>
                  <StatusBadge status={serverConfig?.provider === 'gemini' ? 'ready' : 'info'} label={serverConfig?.provider === 'gemini' ? 'Primary' : capitalize(serverConfig?.provider || '')} />
                </div>
                <div>
                  Text Model: <span className="font-700 text-foreground">{serverConfig?.geminiTextModel || 'Not configured'}</span>
                </div>
                <div>
                  API Key: <span className="font-700 text-foreground">{serverConfig?.geminiApiKeyConfigured ? 'Configured' : 'Missing'}</span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{geminiHealth?.status || 'Not checked'}</span>
                  {geminiHealth?.response_time_ms && <span className="ml-2">{geminiHealth.response_time_ms}ms</span>}
                </p>
                <button onClick={() => handleTestProvider('gemini')} disabled={testingProvider === 'gemini'} className="btn-secondary text-sm">
                  {testingProvider === 'gemini' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Connection
                </button>
              </div>
              {geminiHealth && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                  {geminiHealth.last_checked_at && (
                    <span>Checked: {new Date(geminiHealth.last_checked_at).toLocaleString()}</span>
                  )}
                  {geminiHealth.last_success_at && (
                    <span className="text-positive">Last success: {new Date(geminiHealth.last_success_at).toLocaleString()}</span>
                  )}
                  {geminiHealth.last_failure_at && (
                    <span className="text-negative">Last failure: {new Date(geminiHealth.last_failure_at).toLocaleString()}</span>
                  )}
                  {geminiHealth.last_error_category && (
                    <span className="text-negative">Error: {geminiHealth.last_error_category}</span>
                  )}
                </div>
              )}
            </div>

            {/* 2. Gemini Multimodal & Voice */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic size={18} className="text-info" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">Gemini Multimodal & Voice</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Multimodal and voice transcription gateway</p>
                  </div>
                </div>
                <StatusBadge
                  status={resolveVoiceCardBadge(
                    serverConfig?.voiceTranscription.configurationReady,
                    geminiVoiceHealth,
                    serverConfig?.voiceTranscription.code
                  )}
                />
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Voice and multimodal processing use the configured gateway. Gemini uses its API key directly.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/60 bg-secondary/35 p-3 text-xs text-muted-foreground">
                <div>
                  Gateway: <span className="font-700 text-foreground">{voiceGateway ? capitalize(voiceGateway) : 'Not set'}</span>
                </div>
                <div>
                  Multimodal Model: <span className="font-700 text-foreground">{serverConfig?.geminiMultimodalModel || 'Missing'}</span>
                </div>
                <div>
                  Gemini API Key: <span className="font-700 text-foreground">{serverConfig?.geminiApiKeyConfigured ? 'Configured' : 'Missing'}</span>
                </div>
                <div>
                  Voice model: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.model || 'Missing'}</span>
                </div>
                <div>
                  Audio Capable: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.modelAudioCapable === null ? 'Unknown' : serverConfig?.voiceTranscription.modelAudioCapable ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  Voice Ready (config): <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.configurationReady ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  Voice Ready (live): <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.ready ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  Status code: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.code || 'unknown'}</span>
                </div>
                <div>
                  Max audio: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.maxAudioSeconds || settings.max_audio_seconds}s / {((serverConfig?.voiceTranscription.maxAudioBytes || 0) / (1024 * 1024)).toFixed(0)} MB</span>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground px-1">
                Supported audio: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.supportedAudioFormats || 'Not available'}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">
                    {voiceGateway === 'gemini'
                      ? (geminiVoiceHealth?.status || serverConfig?.voiceTranscription.lastHealthCheck?.status || 'Not checked')
                      : (serverConfig?.voiceTranscription.lastHealthCheck?.status || openrouterVoiceHealth?.status || 'Not checked')}
                  </span>
                </p>
                <button
                  onClick={() => handleTestProvider(voiceGateway === 'gemini' ? 'gemini_voice' : 'openrouter_voice')}
                  disabled={testingProvider === (voiceGateway === 'gemini' ? 'gemini_voice' : 'openrouter_voice')}
                  className="btn-secondary text-sm"
                >
                  {testingProvider === (voiceGateway === 'gemini' ? 'gemini_voice' : 'openrouter_voice') ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Voice
                </button>
              </div>
              {((voiceGateway === 'gemini' && geminiVoiceHealth) || (voiceGateway !== 'gemini' && openrouterVoiceHealth)) && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                  {(() => {
                    const h = voiceGateway === 'gemini' ? geminiVoiceHealth : openrouterVoiceHealth;
                    if (!h) return null;
                    return (
                      <>
                        {h.last_checked_at && <span>Checked: {new Date(h.last_checked_at).toLocaleString()}</span>}
                        {h.last_success_at && <span className="text-positive">Last success: {new Date(h.last_success_at).toLocaleString()}</span>}
                        {h.last_failure_at && <span className="text-negative">Last failure: {new Date(h.last_failure_at).toLocaleString()}</span>}
                        {h.last_error_category && <span className="text-negative">Error: {h.last_error_category}</span>}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 3. OpenRouter (Legacy Fallback) */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Cloud size={18} className="text-accent" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">OpenRouter (Legacy Fallback)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Legacy cloud language model provider</p>
                  </div>
                </div>
                {!openrouterEnabled ? (
                  <StatusBadge status="info" label="Disabled" />
                ) : (
                  <StatusBadge status={serverConfig?.openrouterConfigured ? 'configured' : 'missing'} />
                )}
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Set <code className="bg-muted px-1 rounded text-xs">OPENROUTER_API_KEY</code> and{' '}
                  <code className="bg-muted px-1 rounded text-xs">OPENROUTER_BASE_URL</code> as server environment variables.
                  Keys are never stored in the database.
                </p>
              </div>
              <div>
                <label className="text-sm font-700 text-foreground mb-1.5 block">Active model (legacy)</label>
                <input
                  type="text"
                  value={settings.openrouter_model || ''}
                  onChange={e => update('openrouter_model', e.target.value)}
                  placeholder="openai/gpt-4.1-mini"
                  className="input-base text-sm w-full"
                  disabled={!openrouterEnabled}
                />
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                OpenRouter configured: <span className="font-700 text-foreground">{!openrouterEnabled ? 'Disabled' : serverConfig?.openrouterConfigured ? 'Yes' : 'No'}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{!openrouterEnabled ? 'Disabled' : (openrouterHealth?.status || 'Not checked')}</span>
                </p>
                <button onClick={() => handleTestProvider('openrouter')} disabled={testingProvider === 'openrouter' || !openrouterEnabled || isOpenRouterDisabled} className="btn-secondary text-sm">
                  {testingProvider === 'openrouter' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Connection
                </button>
              </div>
            </div>

            {/* 4. OpenRouter Voice (Legacy Fallback) */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic size={18} className="text-info" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">OpenRouter Voice (Legacy Fallback)</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Legacy voice transcription through OpenRouter gateway</p>
                  </div>
                </div>
                {isOpenRouterDisabled ? (
                  <StatusBadge status="disabled" label="Disabled" />
                ) : (
                  <StatusBadge
                    status={
                      serverConfig?.voiceTranscription.ready
                        ? 'healthy'
                        : serverConfig?.voiceTranscription.code === 'openrouter_provider_unavailable'
                          || serverConfig?.voiceTranscription.code === 'openrouter_auth_failed'
                          || serverConfig?.voiceTranscription.code === 'voice_model_audio_unsupported'
                          ? 'test_failed'
                          : 'missing'
                    }
                  />
                )}
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  {isOpenRouterDisabled
                    ? 'OpenRouter is disabled globally via OPENROUTER_ENABLED=false. Voice fallback through this legacy gateway is inactive.'
                    : 'Legacy voice transcription reuses the existing <code className="bg-muted px-1 rounded text-xs">OPENROUTER_API_KEY</code> and <code className="bg-muted px-1 rounded text-xs">OPENROUTER_BASE_URL</code>.'}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Voice model (legacy)</label>
                  <input
                    type="text"
                    value={settings.voice_model || ''}
                    onChange={e => update('voice_model', e.target.value)}
                    placeholder={settings.openrouter_model || 'google/gemini-2.5-flash'}
                    className="input-base text-sm w-full"
                    disabled={isOpenRouterDisabled || voiceGateway !== 'openrouter'}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Leave blank to reuse the general OpenRouter model.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-border/60 bg-secondary/35 p-3 text-xs text-muted-foreground">
                  <div>
                    Gateway: <span className="font-700 text-foreground">{isOpenRouterDisabled ? 'Disabled' : voiceGateway ? capitalize(voiceGateway) : 'openrouter'}</span>
                  </div>
                  <div>
                    OpenRouter configured: <span className="font-700 text-foreground">{isOpenRouterDisabled ? 'Disabled' : serverConfig?.voiceTranscription.openrouterConfigured ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    Legacy voice model: <span className="font-700 text-foreground">{settings.voice_model || settings.openrouter_model || 'Not set'}</span>
                  </div>
                  <div>
                    Model source: <span className="font-700 text-foreground">{isOpenRouterDisabled ? 'N/A' : serverConfig?.voiceTranscription.modelSource || 'none'}</span>
                  </div>
                  <div>
                    Legacy status: <span className="font-700 text-foreground">{isOpenRouterDisabled ? 'Disabled' : serverConfig?.voiceTranscription.ready ? 'Ready' : 'Not ready'}</span>
                  </div>
                  <div>
                    Max recording: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.maxAudioSeconds || settings.max_audio_seconds}s</span>
                  </div>
                  {!isOpenRouterDisabled && (
                    <>
                      <div>
                        Audio capable: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.modelAudioCapable === null ? 'Unknown' : serverConfig?.voiceTranscription.modelAudioCapable ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        Voice ready: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.ready ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        Last health check: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.lastHealthCheck?.status || 'Not checked'}</span>
                      </div>
                      <div>
                        Supported formats: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.supportedAudioFormats || 'Not available'}</span>
                      </div>
                      <div>
                        Status code: <span className="font-700 text-foreground">{serverConfig?.voiceTranscription.code || 'unknown'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{isOpenRouterDisabled ? 'Disabled' : (openrouterVoiceHealth?.status || serverConfig?.voiceTranscription.lastHealthCheck?.status || 'Not checked')}</span>
                </p>
                <button onClick={() => handleTestProvider('openrouter_voice')} disabled={testingProvider === 'openrouter_voice' || isOpenRouterDisabled} className="btn-secondary text-sm">
                  {testingProvider === 'openrouter_voice' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Voice
                </button>
              </div>
            </div>

            {/* 5. VPS AI (Unchanged) */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Server size={18} className="text-warning" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">VPS AI</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Self-hosted language provider</p>
                  </div>
                </div>
                <StatusBadge status={isCloudOnlyMode ? 'not_required' : serverConfig?.vpsConfigured ? 'configured' : 'missing'} />
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Set <code className="bg-muted px-1 rounded text-xs">LOCAL_AI_BASE_URL</code>,{' '}
                  <code className="bg-muted px-1 rounded text-xs">LOCAL_AI_MODEL</code>, and optionally{' '}
                  <code className="bg-muted px-1 rounded text-xs">LOCAL_AI_AUTH_TOKEN</code> as server environment variables.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Endpoint URL</label>
                  <input
                    type="text"
                    value={settings.vps_ai_base_url || ''}
                    onChange={e => update('vps_ai_base_url', e.target.value)}
                    placeholder="http://your-vps:11434/v1"
                    className="input-base text-sm w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Active model</label>
                  <input
                    type="text"
                    value={settings.vps_language_model || ''}
                    onChange={e => update('vps_language_model', e.target.value)}
                    placeholder="llama3"
                    className="input-base text-sm w-full"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{isCloudOnlyMode ? 'Not required' : (vpsAiHealth?.status || 'Not checked')}</span>
                </p>
                <button onClick={() => handleTestProvider('vps_ai')} disabled={testingProvider === 'vps_ai' || isCloudOnlyMode} className="btn-secondary text-sm">
                  {testingProvider === 'vps_ai' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Connection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={handleRunHealthChecks}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
              >
                <RefreshCw size={14} />
                Run Health Checks
              </button>
            </div>

            {allProviders.map(providerKey => {
              const raw = providerHealthRows.find(r => r.provider === providerKey);
              const h = normalizeHealth(providerKey, raw);
              const testDisabled = testingProvider === providerKey || (providerKey === 'vps_ai' && isCloudOnlyMode) || ((providerKey === 'openrouter' || providerKey === 'openrouter_voice') && isOpenRouterDisabled);
              return (
                <div key={providerKey} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-700 text-foreground">{getProviderDisplayName(providerKey)}</p>
                      {h?.response_time_ms && (
                        <p className="text-xs text-muted-foreground">{h.response_time_ms}ms response time</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ProviderHealthBadge status={h?.status || 'not_configured'} />
                      <button
                        onClick={() => handleTestProvider(providerKey)}
                        disabled={testDisabled}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-600 hover:bg-muted/80 disabled:opacity-50 transition-colors"
                      >
                        {testingProvider === providerKey ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Zap size={12} />
                        )}
                        Test
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {h?.last_checked_at && (
                      <span>Checked: {new Date(h.last_checked_at).toLocaleString()}</span>
                    )}
                    {h?.last_success_at && (
                      <span className="text-positive">Last success: {new Date(h.last_success_at).toLocaleString()}</span>
                    )}
                    {h?.last_failure_at && (
                      <span className="text-negative">Last failure: {new Date(h.last_failure_at).toLocaleString()}</span>
                    )}
                    {h?.last_error_category && (
                      <span className="text-negative">Error: {h.last_error_category}</span>
                    )}
                    {!h && (
                      <span className="col-span-2 text-muted-foreground italic">No health data yet. Run health checks.</span>
                    )}
                  </div>
                </div>
              );
            })}

            {providerHealthRows.length === 0 && (
              <div className="card p-8 text-center mt-4">
                <Activity size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No health data yet. Run health checks to see provider status.</p>
              </div>
            )}
          </div>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-xl flex items-start gap-2">
              <Shield size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Aggregate usage statistics only. No personal names, merchants, transaction details, or transcripts are shown here.
              </p>
            </div>

            {stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Requests Today', value: stats.total_requests, icon: BarChart3, color: 'text-accent' },
                  { label: 'Successful', value: stats.successful_requests, icon: CheckCircle, color: 'text-positive' },
                  { label: 'Failed', value: stats.failed_requests, icon: XCircle, color: 'text-negative' },
                  { label: 'Cloud Requests', value: stats.cloud_requests, icon: Cloud, color: 'text-info' },
                  { label: 'VPS Requests', value: stats.vps_requests, icon: Server, color: 'text-warning' },
                  { label: 'Fallback Used', value: stats.fallback_requests, icon: RefreshCw, color: 'text-muted-foreground' },
                  { label: 'Confirmed', value: stats.confirmed_requests, icon: CheckCircle, color: 'text-positive' },
                  { label: 'Active Users', value: stats.active_users, icon: Users, color: 'text-accent' },
                  { label: 'Avg Response', value: `${stats.avg_duration_ms}ms`, icon: Clock, color: 'text-muted-foreground' },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="card p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon size={16} className={item.color} />
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                      <p className="text-xl font-700 text-foreground">{item.value}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card p-8 text-center">
                <BarChart3 size={32} className="text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No usage data yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
  );
}
