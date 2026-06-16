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
  primary_stt_provider: string;
  fallback_stt_provider: string;
  openrouter_model: string;
  vps_language_model: string;
  cloud_stt_model: string;
  vps_stt_model: string;
  vps_ai_base_url: string;
  vps_stt_base_url: string;
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
  cloud_stt_configured: boolean;
  vps_ai_configured: boolean;
  vps_stt_configured: boolean;
}

interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'offline' | 'not_configured';
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
  openrouterConfigured: boolean;
  supabaseServiceConfigured: boolean;
  cloudSpeechConfigured: boolean;
  vpsConfigured: boolean;
  aiEnabled: boolean;
  mode: 'cloud_only' | 'vps_only' | 'cloud_primary' | 'vps_primary';
  model: string;
}

const DEFAULT_SETTINGS: AISettings = {
  ai_enabled: true,
  ai_mode: 'cloud_only',
  primary_language_provider: 'openrouter',
  fallback_language_provider: 'vps_ai',
  primary_stt_provider: 'cloud_stt',
  fallback_stt_provider: 'vps_stt',
  openrouter_model: 'openai/gpt-4.1-mini',
  vps_language_model: 'llama3',
  cloud_stt_model: 'whisper-1',
  vps_stt_model: 'whisper',
  vps_ai_base_url: '',
  vps_stt_base_url: '',
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
  cloud_stt_configured: false,
  vps_ai_configured: false,
  vps_stt_configured: false,
};

// ─── Config Status Check ──────────────────────────────────────────────────────

interface ConfigStatus {
  openrouter: 'configured' | 'missing' | 'test_failed' | 'healthy' | 'checking';
  supabaseServiceKey: 'configured' | 'missing' | 'checking';
  cloudSpeech: 'configured' | 'missing' | 'test_failed' | 'healthy' | 'checking';
  vps: 'configured' | 'missing' | 'test_failed' | 'healthy' | 'checking';
}

function ConfigStatusPanel({
  health,
  serverConfig,
}: {
  health: ProviderHealth[];
  serverConfig: ServerAIConfigStatus | null;
}) {
  const openrouterHealth = health.find(h => h.provider === 'openrouter');
  const cloudSttHealth = health.find(h => h.provider === 'cloud_stt');
  const vpsAiHealth = health.find(h => h.provider === 'vps_ai');
  const vpsSttHealth = health.find(h => h.provider === 'vps_stt');

  const isCloudOnly = serverConfig?.mode === 'cloud_only';

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

  let cloudSpeechStatus: ConfigStatus['cloudSpeech'] = 'checking';
  if (serverConfig) {
    if (!serverConfig.cloudSpeechConfigured) cloudSpeechStatus = 'missing';
    else if (cloudSttHealth?.status === 'healthy') cloudSpeechStatus = 'healthy';
    else if (cloudSttHealth?.status === 'offline' || cloudSttHealth?.status === 'degraded') cloudSpeechStatus = 'test_failed';
    else cloudSpeechStatus = 'configured';
  }

  let vpsStatus: ConfigStatus['vps'] = 'checking';
  if (serverConfig) {
    if (isCloudOnly) {
      vpsStatus = 'configured';
    } else if (!serverConfig.vpsConfigured) {
      vpsStatus = 'missing';
    } else if (vpsAiHealth?.status === 'healthy' || vpsSttHealth?.status === 'healthy') {
      vpsStatus = 'healthy';
    } else if (
      vpsAiHealth?.status === 'offline' ||
      vpsAiHealth?.status === 'degraded' ||
      vpsSttHealth?.status === 'offline' ||
      vpsSttHealth?.status === 'degraded'
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
  };

  const orStatus = statusMap[openrouterStatus];
  const sbStatus = statusMap[supabaseStatus];
  const sttStatus = statusMap[cloudSpeechStatus];
  const vpsRowStatus = statusMap[vpsStatus];

  return (
    <div className="card p-5 mb-4">
      <h3 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
        <Shield size={16} className="text-accent" />
        Configuration Status
      </h3>
      {serverConfig && (
        <div className="mb-3 text-xs text-muted-foreground">
          Mode: <span className="text-foreground font-600">{serverConfig.mode}</span> · Model:{' '}
          <span className="text-foreground font-600">{serverConfig.model}</span>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between py-2 border-b border-border/50">
          <span className="text-sm text-foreground">OpenRouter API Key</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${orStatus.color}`}>
            {orStatus.icon}
            {orStatus.label}
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
          <span className="text-sm text-foreground">Cloud Speech-to-Text</span>
          <span className={`flex items-center gap-1.5 text-xs font-600 ${sttStatus.color}`}>
            {sttStatus.icon}
            {sttStatus.label}
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
  };
  const s = map[status] || map.not_configured;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-600 ${s.color}`}>
      {s.icon}
      {s.label}
    </span>
  );
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
          primary_stt_provider: settings.primary_stt_provider,
          fallback_stt_provider: settings.fallback_stt_provider,
          openrouter_model: settings.openrouter_model,
          vps_language_model: settings.vps_language_model,
          cloud_stt_model: settings.cloud_stt_model,
          vps_stt_model: settings.vps_stt_model,
          vps_ai_base_url: settings.vps_ai_base_url,
          vps_stt_base_url: settings.vps_stt_base_url,
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
    try {
      const response = await fetch('/api/ai/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });

      const result = await response.json();
      if (result.status === 'healthy') {
        toast.success(`${provider}: Connection successful`);
      } else if (result.status === 'not_configured') {
        toast.warning(`${provider}: Not configured — set environment variables on the server`);
      } else {
        toast.error(`${provider}: ${result.status}`);
      }
      await loadData();
    } catch {
      toast.error(`Test failed for ${provider}`);
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
  const openrouterHealth = health.find((item) => item.provider === 'openrouter');
  const vpsAiHealth = health.find((item) => item.provider === 'vps_ai');
  const cloudSttHealth = health.find((item) => item.provider === 'cloud_stt');
  const vpsSttHealth = health.find((item) => item.provider === 'vps_stt');
  const hasHealthyProvider = health.some((item) => item.status === 'healthy');

  const checklistItems = [
    { id: 'supabase', label: 'Supabase server key', done: Boolean(serverConfig?.supabaseServiceConfigured) },
    { id: 'openrouter-key', label: 'OpenRouter key', done: Boolean(serverConfig?.openrouterConfigured) },
    { id: 'openrouter-connection', label: 'OpenRouter connection', done: openrouterHealth?.status === 'healthy' },
    { id: 'ai-enabled', label: 'AI enabled', done: Boolean(serverConfig?.aiEnabled && settings.ai_enabled) },
    { id: 'confirmation', label: 'Confirmation enabled', done: settings.require_confirmation },
    { id: 'provider-health', label: 'Provider health', done: hasHealthyProvider },
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
          description="Configure Smart Pocket AI providers, connection health, confirmation rules, and usage controls without exposing server secrets."
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
            {checklistItems.map((item) => (
              <div key={item.id} className="rounded-2xl border border-border bg-secondary/35 px-4 py-3 flex items-start gap-3">
                <StatusBadge status={item.done ? 'ready' : 'warning'} label={item.done ? 'Done' : 'Pending'} />
                <div className="min-w-0">
                  <p className="text-sm font-700 text-foreground">{item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.done ? 'Configured and available.' : 'Needs attention before full AI readiness.'}
                  </p>
                </div>
              </div>
            ))}
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
            {/* OpenRouter */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Cloud size={18} className="text-accent" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">OpenRouter</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Cloud language model provider</p>
                  </div>
                </div>
                <StatusBadge status={serverConfig?.openrouterConfigured ? 'configured' : 'missing'} />
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Set <code className="bg-muted px-1 rounded text-xs">OPENROUTER_API_KEY</code> and{' '}
                  <code className="bg-muted px-1 rounded text-xs">OPENROUTER_BASE_URL</code> as server environment variables.
                  Keys are never stored in the database.
                </p>
              </div>
              <div>
                <label className="text-sm font-700 text-foreground mb-1.5 block">Active model</label>
                <input
                  type="text"
                  value={settings.openrouter_model || ''}
                  onChange={e => update('openrouter_model', e.target.value)}
                  placeholder="openai/gpt-4.1-mini"
                  className="input-base text-sm w-full"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{openrouterHealth?.status || 'Not checked'}</span>
                </p>
                <button onClick={() => handleTestProvider('openrouter')} disabled={testingProvider === 'openrouter'} className="btn-secondary text-sm">
                  {testingProvider === 'openrouter' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Connection
                </button>
              </div>
            </div>

            {/* VPS AI */}
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

            {/* Cloud STT */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic size={18} className="text-info" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">Cloud Speech-to-Text</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Cloud transcription provider</p>
                  </div>
                </div>
                <StatusBadge status={serverConfig?.cloudSpeechConfigured ? 'configured' : 'missing'} />
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Set <code className="bg-muted px-1 rounded text-xs">CLOUD_STT_API_KEY</code>,{' '}
                  <code className="bg-muted px-1 rounded text-xs">CLOUD_STT_BASE_URL</code>, and{' '}
                  <code className="bg-muted px-1 rounded text-xs">CLOUD_STT_MODEL</code> as server environment variables.
                </p>
              </div>
              <div>
                <label className="text-sm font-700 text-foreground mb-1.5 block">Active model</label>
                <input
                  type="text"
                  value={settings.cloud_stt_model || ''}
                  onChange={e => update('cloud_stt_model', e.target.value)}
                  placeholder="whisper-1"
                  className="input-base text-sm w-full"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{cloudSttHealth?.status || 'Not checked'}</span>
                </p>
                <button onClick={() => handleTestProvider('cloud_stt')} disabled={testingProvider === 'cloud_stt'} className="btn-secondary text-sm">
                  {testingProvider === 'cloud_stt' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Test Connection
                </button>
              </div>
            </div>

            {/* VPS STT */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Mic size={18} className="text-positive" />
                  <div>
                    <h3 className="text-sm font-700 text-foreground">VPS Speech-to-Text</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Self-hosted transcription provider</p>
                  </div>
                </div>
                <StatusBadge status={isCloudOnlyMode ? 'not_required' : serverConfig?.vpsConfigured ? 'configured' : 'missing'} />
              </div>
              <div className="p-3 bg-muted/50 rounded-xl mb-3">
                <p className="text-xs text-muted-foreground">
                  Set <code className="bg-muted px-1 rounded text-xs">LOCAL_STT_BASE_URL</code>,{' '}
                  <code className="bg-muted px-1 rounded text-xs">LOCAL_STT_MODEL</code>, and optionally{' '}
                  <code className="bg-muted px-1 rounded text-xs">LOCAL_STT_AUTH_TOKEN</code> as server environment variables.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Endpoint URL</label>
                  <input
                    type="text"
                    value={settings.vps_stt_base_url || ''}
                    onChange={e => update('vps_stt_base_url', e.target.value)}
                    placeholder="http://your-vps:9000"
                    className="input-base text-sm w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-700 text-foreground mb-1.5 block">Active model</label>
                  <input
                    type="text"
                    value={settings.vps_stt_model || ''}
                    onChange={e => update('vps_stt_model', e.target.value)}
                    placeholder="whisper"
                    className="input-base text-sm w-full"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Latest health: <span className="font-700 text-foreground">{isCloudOnlyMode ? 'Not required' : (vpsSttHealth?.status || 'Not checked')}</span>
                </p>
                <button onClick={() => handleTestProvider('vps_stt')} disabled={testingProvider === 'vps_stt' || isCloudOnlyMode} className="btn-secondary text-sm">
                  {testingProvider === 'vps_stt' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
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

            {health.map(h => (
              <div key={h.provider} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-700 text-foreground capitalize">{h.provider.replace('_', ' ')}</p>
                    {h.response_time_ms && (
                      <p className="text-xs text-muted-foreground">{h.response_time_ms}ms response time</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ProviderHealthBadge status={h.status} />
                    <button
                      onClick={() => handleTestProvider(h.provider)}
                      disabled={testingProvider === h.provider}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-foreground text-xs font-600 hover:bg-muted/80 disabled:opacity-50 transition-colors"
                    >
                      {testingProvider === h.provider ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Zap size={12} />
                      )}
                      Test
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  {h.last_checked_at && (
                    <span>Checked: {new Date(h.last_checked_at).toLocaleString()}</span>
                  )}
                  {h.last_success_at && (
                    <span className="text-positive">Last success: {new Date(h.last_success_at).toLocaleString()}</span>
                  )}
                  {h.last_failure_at && (
                    <span className="text-negative">Last failure: {new Date(h.last_failure_at).toLocaleString()}</span>
                  )}
                  {h.last_error_category && (
                    <span className="text-negative">Error: {h.last_error_category}</span>
                  )}
                </div>
              </div>
            ))}

            {health.length === 0 && (
              <div className="card p-8 text-center">
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
