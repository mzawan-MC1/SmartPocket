'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { toast } from 'sonner';
import { CreditCard, Users, Save, Edit2, Loader2, RefreshCw, Gift, UserCog, BarChart3 } from 'lucide-react';
import { formatCurrencyText } from '@/lib/currency-formatting';
import { getIntlLocale } from '@/lib/locale';
import {
  calculateEquivalentMonthlyCost,
  calculateYearlyBilledPrice,
  calculateYearlySavingAmount,
  normalizeDiscountPercent,
  normalizeWholeMoneyAmount,
} from '@/lib/subscription/pricing';


interface Plan {
  id: string;
  plan_code: string;
  plan_name: string;
  description: string;
  price_amount: number;
  billing_interval: string;
  yearly_discount_percent: number;
  trial_duration_days: number;
  monthly_ai_credits: number;
  daily_ai_request_limit: number;
  monthly_voice_seconds: number;
  monthly_receipt_extractions: number;
  receipt_intelligence_enabled: boolean;
  text_ai_enabled: boolean;
  voice_ai_enabled: boolean;
  ai_history_enabled: boolean;
  ai_history_retention_days: number;
  managed_people_enabled: boolean;
  shared_spaces_enabled: boolean;
  standard_reports_enabled: boolean;
  family_reports_enabled: boolean;
  is_active: boolean;
  display_order: number;
}

interface UserSubRow {
  user_id: string;
  email: string;
  full_name: string;
  plan_name: string;
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  notes: string | null;
  credits_consumed: number;
  credits_allocated: number;
  provider_managed: boolean;
  provider_name: string | null;
  provider_subscription_id: string | null;
  billing_interval: string | null;
  price_amount: number;
  yearly_discount_percent: number;
  billing_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  last_override_action: string | null;
  last_override_at: string | null;
}

interface AdminStats {
  total_subscribers: number;
  trialing: number;
  active: number;
  expired: number;
  total_credits_consumed: number;
  total_voice_seconds: number;
  total_receipt_extractions: number;
  estimated_cost_usd: number;
}

const PLAN_COLORS: Record<string, string> = {
  free_trial: 'bg-info-soft text-info',
  personal: 'bg-accent/10 text-accent',
  family: 'bg-positive-soft text-positive',
};

function formatAdminDateRange(start: string | null, end: string | null) {
  if (!start && !end) return '—';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const startText = start ? formatter.format(new Date(start)) : '—';
  const endText = end ? formatter.format(new Date(end)) : '—';
  return `${startText} - ${endText}`;
}

function formatAdminDate(value: string | null, locale: string) {
  if (!value) return '—';

  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getSubscriptionSource(user: UserSubRow) {
  if (user.provider_managed) {
    return {
      label: 'Provider-managed',
      tone: 'bg-accent/10 text-accent',
    };
  }

  if (user.plan_code === 'free_trial') {
    return {
      label: 'Free trial',
      tone: 'bg-info-soft text-info',
    };
  }

  return {
    label: 'Manual assignment',
    tone: 'bg-warning-soft text-warning',
  };
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? 'bg-accent' : 'bg-secondary'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-1'}`} />
    </button>
  );
}

function PlanEditor({ plan, onSave, onCancel }: { plan: Plan; onSave: (p: Plan) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<Plan>({ ...plan });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof Plan, val: any) => setForm(f => ({ ...f, [key]: val }));
  const normalizedMonthlyPrice = normalizeWholeMoneyAmount(form.price_amount);
  const normalizedDiscount = normalizeDiscountPercent(form.yearly_discount_percent);
  const calculatedYearlyPrice = form.plan_code === 'free_trial'
    ? 0
    : calculateYearlyBilledPrice(normalizedMonthlyPrice, normalizedDiscount);
  const yearlySavingAmount = form.plan_code === 'free_trial'
    ? 0
    : calculateYearlySavingAmount(normalizedMonthlyPrice, normalizedDiscount);
  const equivalentMonthlyPrice = form.plan_code === 'free_trial'
    ? 0
    : calculateEquivalentMonthlyCost(calculatedYearlyPrice);

  const handleSave = async () => {
    if (!Number.isInteger(form.monthly_receipt_extractions) || form.monthly_receipt_extractions < 0) {
      toast.error('Receipt Documents / Month must be a non-negative whole number.');
      return;
    }
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="card p-5 border-2 border-accent/30 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-700 text-foreground">Edit: {plan.plan_name}</h3>
        <div className={`px-2 py-0.5 rounded-full text-xs font-600 ${PLAN_COLORS[plan.plan_code] || 'bg-secondary text-muted-foreground'}`}>
          {plan.plan_code}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Plan Name</label>
          <input className="input-base text-sm" value={form.plan_name} onChange={e => set('plan_name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Price (AED)</label>
          <input type="number" min="0" step="1" className="input-base text-sm" value={form.price_amount} onChange={e => set('price_amount', parseInt(e.target.value, 10) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Billing Interval</label>
          <input
            className="input-base text-sm opacity-80"
            value={form.billing_interval}
            disabled
            readOnly
          />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Yearly Discount (%)</label>
          <input type="number" min="0" max="100" step="1" className="input-base text-sm" value={form.yearly_discount_percent} onChange={e => set('yearly_discount_percent', parseInt(e.target.value, 10) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Trial Duration (days)</label>
          <input type="number" min="0" className="input-base text-sm" value={form.trial_duration_days} onChange={e => set('trial_duration_days', parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Monthly AI Credits</label>
          <input type="number" min="0" className="input-base text-sm" value={form.monthly_ai_credits} onChange={e => set('monthly_ai_credits', parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Daily Request Limit</label>
          <input type="number" min="0" className="input-base text-sm" value={form.daily_ai_request_limit} onChange={e => set('daily_ai_request_limit', parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Monthly Voice Seconds</label>
          <input type="number" min="0" className="input-base text-sm" value={form.monthly_voice_seconds} onChange={e => set('monthly_voice_seconds', parseInt(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Receipt Documents / Month</label>
          <input type="number" min="0" step="1" className="input-base text-sm" value={form.monthly_receipt_extractions} onChange={e => set('monthly_receipt_extractions', Number.parseInt(e.target.value, 10) || 0)} />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Stored quota does not grant access unless Receipt Intelligence is enabled.
          </p>
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">AI History Retention (days)</label>
          <input type="number" min="0" className="input-base text-sm" value={form.ai_history_retention_days} onChange={e => set('ai_history_retention_days', parseInt(e.target.value) || 30)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-600 text-foreground mb-1">Description</label>
          <textarea className="input-base text-sm resize-none" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </div>
      </div>

      {form.plan_code !== 'free_trial' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-secondary/35 p-3">
            <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">Monthly Price</p>
            <p className="mt-1 text-sm font-700 text-foreground">AED {normalizedMonthlyPrice}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/35 p-3">
            <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">Yearly Discount</p>
            <p className="mt-1 text-sm font-700 text-foreground">{normalizedDiscount}%</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/35 p-3">
            <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">Calculated Yearly Price</p>
            <p className="mt-1 text-sm font-700 text-foreground">AED {calculatedYearlyPrice}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">AED {equivalentMonthlyPrice} equivalent / month</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/35 p-3">
            <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">Customer Saves</p>
            <p className="mt-1 text-sm font-700 text-positive">AED {yearlySavingAmount} / year</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['text_ai_enabled', 'Text AI'],
          ['voice_ai_enabled', 'Voice AI'],
          ['receipt_intelligence_enabled', 'Receipt Intelligence'],
          ['ai_history_enabled', 'AI History'],
          ['managed_people_enabled', 'Managed People'],
          ['shared_spaces_enabled', 'Shared Spaces'],
          ['standard_reports_enabled', 'Standard Reports'],
          ['family_reports_enabled', 'Family Reports'],
          ['is_active', 'Active'],
        ] as [keyof Plan, string][]).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-2 bg-secondary/50 rounded-lg px-3 py-2">
            <span className="text-xs text-foreground">{label}</span>
            <Toggle value={!!form[key]} onChange={v => set(key, v)} />
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save Plan
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </div>
  );
}

export default function AdminSubscriptionsPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [users, setUsers] = useState<UserSubRow[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'plans' | 'users' | 'stats'>('plans');
  const [promoUserId, setPromoUserId] = useState('');
  const [promoCredits, setPromoCredits] = useState(50);
  const [promoNotes, setPromoNotes] = useState('');
  const [grantingPromo, setGrantingPromo] = useState(false);
  const [changePlanUserId, setChangePlanUserId] = useState('');
  const [changePlanCode, setChangePlanCode] = useState('personal');
  const [changePlanInterval, setChangePlanInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [changingPlan, setChangingPlan] = useState(false);

  const supabase = createClient();
  const locale = getIntlLocale(language);
  const editablePlans = plans.filter((plan) => plan.plan_code === 'free_trial' || plan.billing_interval !== 'yearly');
  const assignablePlans = plans.filter((plan) => plan.is_active);
  const assignableIntervals = assignablePlans
    .filter((plan) => plan.plan_code === changePlanCode)
    .map((plan) => plan.billing_interval)
    .filter((interval): interval is 'monthly' | 'yearly' => interval === 'monthly' || interval === 'yearly');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, statsRes] = await Promise.all([
        supabase.from('subscription_plans').select('*').order('display_order'),
        supabase.rpc('get_subscription_admin_stats'),
      ]);

      if (plansRes.data) setPlans(plansRes.data);
      if (statsRes.data) setStats(statsRes.data as AdminStats);

      // Keep manual admin assignment intact, then overlay provider-managed billing metadata.
      const { data: subData } = await supabase
        .from('user_subscriptions')
        .select(`
          user_id, status, trial_ends_at,
          subscription_plans!inner(plan_name, plan_code, price_amount, yearly_discount_percent, billing_interval),
          user_profiles!inner(email, full_name),
          ai_usage_cycles(credits_consumed, credits_allocated)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (subData) {
        const userIds = subData.map((row: any) => row.user_id).filter(Boolean);
        const [billingRes, overrideRes] = userIds.length > 0
          ? await Promise.all([
              supabase
                .from('billing_subscriptions')
                .select(`
                  user_id,
                  provider,
                  provider_subscription_id,
                  billing_interval,
                  status,
                  current_period_start,
                  current_period_end,
                  cancel_at_period_end,
                  updated_at
                `)
                .in('user_id', userIds)
                .order('updated_at', { ascending: false }),
              supabase
                .from('billing_admin_override_logs')
                .select(`
                  target_user_id,
                  action_type,
                  created_at
                `)
                .in('target_user_id', userIds)
                .order('created_at', { ascending: false }),
            ])
          : [{ data: [], error: null }, { data: [], error: null }];

        if (billingRes.error) {
          throw billingRes.error;
        }

        if (overrideRes.error) {
          throw overrideRes.error;
        }

        const latestBillingByUser = new Map<string, any>();
        for (const billingRow of billingRes.data || []) {
          if (!latestBillingByUser.has(billingRow.user_id)) {
            latestBillingByUser.set(billingRow.user_id, billingRow);
          }
        }

        const latestOverrideByUser = new Map<string, any>();
        for (const overrideRow of overrideRes.data || []) {
          if (!latestOverrideByUser.has(overrideRow.target_user_id)) {
            latestOverrideByUser.set(overrideRow.target_user_id, overrideRow);
          }
        }

        const rows: UserSubRow[] = subData.map((row: any) => {
          const billingRow = latestBillingByUser.get(row.user_id);
          const overrideRow = latestOverrideByUser.get(row.user_id);

          return {
            user_id: row.user_id,
            email: row.user_profiles?.email || '—',
            full_name: row.user_profiles?.full_name || '—',
            plan_name: row.subscription_plans?.plan_name || '—',
            plan_code: row.subscription_plans?.plan_code || '—',
            status: row.status,
            trial_ends_at: row.trial_ends_at,
            notes: null,
            credits_consumed: row.ai_usage_cycles?.[0]?.credits_consumed ?? 0,
            credits_allocated: row.ai_usage_cycles?.[0]?.credits_allocated ?? 0,
            price_amount: Number(row.subscription_plans?.price_amount ?? 0),
            yearly_discount_percent: Number(row.subscription_plans?.yearly_discount_percent ?? 0),
            provider_managed: Boolean(billingRow?.provider_subscription_id),
            provider_name: billingRow?.provider ?? null,
            provider_subscription_id: billingRow?.provider_subscription_id ?? null,
            billing_interval: billingRow?.billing_interval ?? row.subscription_plans?.billing_interval ?? null,
            billing_status: billingRow?.status ?? null,
            current_period_start: billingRow?.current_period_start ?? null,
            current_period_end: billingRow?.current_period_end ?? null,
            cancel_at_period_end: Boolean(billingRow?.cancel_at_period_end),
            last_override_action: overrideRow?.action_type ?? null,
            last_override_at: overrideRow?.created_at ?? null,
          };
        });
        setUsers(rows);
      }
    } catch (err) {
      toast.error('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePlan = async (plan: Plan) => {
    const { error } = await supabase
      .from('subscription_plans')
      .update({
        plan_name: plan.plan_name,
        description: plan.description,
        price_amount: plan.price_amount,
        billing_interval: plan.billing_interval,
        yearly_discount_percent: plan.yearly_discount_percent,
        trial_duration_days: plan.trial_duration_days,
        monthly_ai_credits: plan.monthly_ai_credits,
        daily_ai_request_limit: plan.daily_ai_request_limit,
        monthly_voice_seconds: plan.monthly_voice_seconds,
        monthly_receipt_extractions: plan.monthly_receipt_extractions,
        receipt_intelligence_enabled: plan.receipt_intelligence_enabled,
        text_ai_enabled: plan.text_ai_enabled,
        voice_ai_enabled: plan.voice_ai_enabled,
        ai_history_enabled: plan.ai_history_enabled,
        ai_history_retention_days: plan.ai_history_retention_days,
        managed_people_enabled: plan.managed_people_enabled,
        shared_spaces_enabled: plan.shared_spaces_enabled,
        standard_reports_enabled: plan.standard_reports_enabled,
        family_reports_enabled: plan.family_reports_enabled,
        is_active: plan.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', plan.id);

    if (error) { toast.error('Failed to save plan: ' + error.message); return; }
    toast.success('Plan saved');
    setEditingPlan(null);
    loadData();
  };

  const handleGrantPromo = async () => {
    if (!promoUserId.trim()) { toast.error('Enter a user ID'); return; }
    setGrantingPromo(true);
    try {
      const { error } = await supabase.rpc('admin_grant_promotional_credits', {
        p_admin_id: user?.id,
        p_user_id: promoUserId.trim(),
        p_credits: promoCredits,
        p_notes: promoNotes || 'Admin promotional grant',
      });
      if (error) throw error;
      toast.success(`Granted ${promoCredits} credits`);
      setPromoUserId(''); setPromoNotes('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant credits');
    } finally {
      setGrantingPromo(false);
    }
  };

  const handleChangePlan = async () => {
    if (!changePlanUserId.trim()) { toast.error('Enter a user ID'); return; }
    setChangingPlan(true);
    try {
      const { error } = await supabase.rpc('admin_change_user_plan', {
        p_admin_id: user?.id,
        p_user_id: changePlanUserId.trim(),
        p_plan_code: changePlanCode,
        p_billing_interval: changePlanInterval,
      });
      if (error) throw error;
      toast.success('Plan changed successfully');
      setChangePlanUserId('');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change plan');
    } finally {
      setChangingPlan(false);
    }
  };

  useEffect(() => {
    if (!assignableIntervals.includes(changePlanInterval)) {
      setChangePlanInterval(assignableIntervals.includes('monthly') ? 'monthly' : (assignableIntervals[0] || 'monthly'));
    }
  }, [assignableIntervals, changePlanInterval]);

  const tabs = [
    { id: 'plans', label: 'Plans', icon: CreditCard },
    { id: 'users', label: 'Subscribers', icon: Users },
    { id: 'stats', label: 'Usage Stats', icon: BarChart3 },
  ] as const;

  return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-700 text-foreground tracking-tight">Plans & Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage subscription plans, user access, and AI credit grants</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl w-fit">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-600 transition-all ${
                  activeTab === tab.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Plans Tab */}
            {activeTab === 'plans' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{editablePlans.length} editable plan families</p>
                  <button onClick={loadData} className="btn-secondary text-xs flex items-center gap-1.5">
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
                {editablePlans.map(plan => (
                  <div key={plan.id}>
                    {editingPlan === plan.id ? (
                      <PlanEditor plan={plan} onSave={handleSavePlan} onCancel={() => setEditingPlan(null)} />
                    ) : (
                      <div className="card-elevated p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`px-2.5 py-1 rounded-full text-xs font-700 ${PLAN_COLORS[plan.plan_code] || 'bg-secondary text-muted-foreground'}`}>
                              {plan.plan_name}
                            </div>
                            {!plan.is_active && (
                              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Inactive</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-700 text-foreground">
                              {plan.price_amount === 0
                                ? 'Free'
                                : `${formatCurrencyText(plan.price_amount, {
                                    currencyCode: 'AED',
                                    locale,
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}/${plan.billing_interval}`}
                            </span>
                            <button
                              onClick={() => setEditingPlan(plan.id)}
                              className="btn-secondary text-xs flex items-center gap-1 py-1.5 px-3"
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">{plan.description}</p>
                        {plan.plan_code !== 'free_trial' ? (
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                            <div className="bg-secondary/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Monthly Price</p>
                              <p className="text-sm font-700 text-foreground mt-0.5">AED {normalizeWholeMoneyAmount(plan.price_amount)}</p>
                            </div>
                            <div className="bg-secondary/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Yearly Discount</p>
                              <p className="text-sm font-700 text-foreground mt-0.5">{normalizeDiscountPercent(plan.yearly_discount_percent)}%</p>
                            </div>
                            <div className="bg-secondary/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Calculated Yearly Price</p>
                              <p className="text-sm font-700 text-foreground mt-0.5">AED {calculateYearlyBilledPrice(plan.price_amount, plan.yearly_discount_percent)}</p>
                            </div>
                            <div className="bg-secondary/50 rounded-lg p-2.5">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Customer Saves</p>
                              <p className="text-sm font-700 text-positive mt-0.5">AED {calculateYearlySavingAmount(plan.price_amount, plan.yearly_discount_percent)}</p>
                            </div>
                          </div>
                        ) : null}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                          <div className="bg-secondary/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">AI Credits/mo</p>
                            <p className="text-sm font-700 text-foreground mt-0.5">{plan.monthly_ai_credits}</p>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Daily Requests</p>
                            <p className="text-sm font-700 text-foreground mt-0.5">{plan.daily_ai_request_limit}</p>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Voice min/mo</p>
                            <p className="text-sm font-700 text-foreground mt-0.5">{Math.round(plan.monthly_voice_seconds / 60)}</p>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Receipt docs/mo</p>
                            <p className="text-sm font-700 text-foreground mt-0.5">{plan.monthly_receipt_extractions}</p>
                          </div>
                          <div className="bg-secondary/50 rounded-lg p-2.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trial days</p>
                            <p className="text-sm font-700 text-foreground mt-0.5">{plan.trial_duration_days}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {plan.text_ai_enabled && <span className="text-[10px] bg-positive-soft text-positive px-2 py-0.5 rounded-full font-600">Text AI</span>}
                          {plan.voice_ai_enabled && <span className="text-[10px] bg-positive-soft text-positive px-2 py-0.5 rounded-full font-600">Voice AI</span>}
                          {plan.receipt_intelligence_enabled && <span className="text-[10px] bg-positive-soft text-positive px-2 py-0.5 rounded-full font-600">Receipt Intelligence</span>}
                          {plan.ai_history_enabled && <span className="text-[10px] bg-info-soft text-info px-2 py-0.5 rounded-full font-600">AI History</span>}
                          {plan.managed_people_enabled && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-600">Managed People</span>}
                          {plan.shared_spaces_enabled && <span className="text-[10px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-600">Shared Spaces</span>}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                {/* Grant promo credits */}
                <div className="card-elevated p-5">
                  <h3 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
                    <Gift size={15} className="text-accent" /> Grant Promotional Credits
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      className="input-base text-sm"
                      placeholder="User ID (UUID)"
                      value={promoUserId}
                      onChange={e => setPromoUserId(e.target.value)}
                    />
                    <input
                      type="number"
                      min="1"
                      className="input-base text-sm"
                      placeholder="Credits"
                      value={promoCredits}
                      onChange={e => setPromoCredits(parseInt(e.target.value) || 1)}
                    />
                    <input
                      className="input-base text-sm"
                      placeholder="Notes (optional)"
                      value={promoNotes}
                      onChange={e => setPromoNotes(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={handleGrantPromo}
                    disabled={grantingPromo}
                    className="btn-primary text-sm mt-3 flex items-center gap-1.5"
                  >
                    {grantingPromo ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                    Grant Credits
                  </button>
                </div>

                {/* Change user plan */}
                <div className="card-elevated p-5">
                  <h3 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
                    <UserCog size={15} className="text-accent" /> Change User Plan
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      className="input-base text-sm"
                      placeholder="User ID (UUID)"
                      value={changePlanUserId}
                      onChange={e => setChangePlanUserId(e.target.value)}
                    />
                    <select
                      className="input-base text-sm"
                      value={changePlanCode}
                      onChange={e => setChangePlanCode(e.target.value)}
                    >
                      {editablePlans.filter(p => p.is_active).map(p => (
                        <option key={p.plan_code} value={p.plan_code}>{p.plan_name}</option>
                      ))}
                    </select>
                    <select
                      className="input-base text-sm"
                      value={changePlanInterval}
                      onChange={e => setChangePlanInterval(e.target.value as 'monthly' | 'yearly')}
                    >
                      {assignableIntervals.map((interval) => (
                        <option key={interval} value={interval}>{interval}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleChangePlan}
                    disabled={changingPlan}
                    className="btn-primary text-sm mt-3 flex items-center gap-1.5"
                  >
                    {changingPlan ? <Loader2 size={14} className="animate-spin" /> : <UserCog size={14} />}
                    Change Plan
                  </button>
                </div>

                {/* Subscriber list */}
                <div className="card-elevated overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h3 className="text-sm font-700 text-foreground">Subscribers ({users.length})</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-secondary/30">
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">User</th>
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Plan</th>
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Subscription Source</th>
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Status</th>
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Billing Period</th>
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Credits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => {
                          const source = getSubscriptionSource(u);

                          return (
                            <tr key={u.user_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                              <td className="px-4 py-3">
                                <p className="font-600 text-foreground text-xs">{u.full_name}</p>
                                <p className="text-[11px] text-muted-foreground">{u.email}</p>
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-600 ${PLAN_COLORS[u.plan_code] || 'bg-secondary text-muted-foreground'}`}>
                                    {u.plan_name}
                                  </span>
                                  <p className="text-[11px] text-muted-foreground capitalize">
                                    {u.billing_interval || 'none'}
                                  </p>
                                  {u.price_amount > 0 ? (
                                    <p className="text-[11px] font-700 text-foreground">
                                      {formatCurrencyText(u.price_amount, {
                                        currencyCode: 'AED',
                                        locale,
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0,
                                      })}
                                    </p>
                                  ) : null}
                                  {u.billing_interval === 'yearly' && u.yearly_discount_percent > 0 ? (
                                    <p className="text-[11px] text-positive">
                                      Save {u.yearly_discount_percent}%
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1.5">
                                  <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-600 ${source.tone}`}>
                                    {source.label}
                                  </span>
                                  {u.provider_name ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      Provider: <span className="text-foreground">{u.provider_name}</span>
                                    </p>
                                  ) : null}
                                  {u.provider_subscription_id ? (
                                    <p className="text-[11px] break-all text-muted-foreground">
                                      External ID: <span className="text-foreground">{u.provider_subscription_id}</span>
                                    </p>
                                  ) : null}
                                  {u.last_override_action ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      Last admin override: {u.last_override_action} on {formatAdminDate(u.last_override_at, locale)}
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1">
                                  <span className={`block text-xs font-600 capitalize ${
                                    u.status === 'active' ? 'text-positive' :
                                    u.status === 'trialing' ? 'text-info' :
                                    u.status === 'past_due' ? 'text-warning' :
                                    'text-negative'
                                  }`}>{u.status}</span>
                                  {u.billing_status && u.billing_status !== u.status ? (
                                    <span className={`block text-[11px] capitalize ${
                                      u.billing_status === 'active' ? 'text-positive' :
                                      u.billing_status === 'trialing' ? 'text-info' :
                                      u.billing_status === 'past_due' ? 'text-warning' :
                                      'text-muted-foreground'
                                    }`}>
                                      Billing: {u.billing_status}
                                    </span>
                                  ) : null}
                                  {u.trial_ends_at ? (
                                    <span className="block text-[11px] text-muted-foreground">
                                      Trial ends: {formatAdminDate(u.trial_ends_at, locale)}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1">
                                  <p className="text-xs text-foreground">
                                    {formatAdminDateRange(u.current_period_start, u.current_period_end)}
                                  </p>
                                  {u.billing_interval ? (
                                    <p className="text-[11px] capitalize text-muted-foreground">
                                      Interval: {u.billing_interval}
                                    </p>
                                  ) : null}
                                  {u.current_period_end ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      Renewal: {formatAdminDate(u.current_period_end, locale)}
                                    </p>
                                  ) : null}
                                  {u.cancel_at_period_end ? (
                                    <p className="text-[11px] text-warning">
                                      Cancels at period end
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-3 align-top">
                                <div className="space-y-1">
                                  <span className="block text-xs text-foreground">{u.credits_consumed}/{u.credits_allocated}</span>
                                  <span className={`block text-[11px] ${
                                    u.credits_allocated > 0 && u.credits_consumed >= u.credits_allocated
                                      ? 'text-warning'
                                      : 'text-muted-foreground'
                                  }`}>
                                    Remaining: {Math.max(0, u.credits_allocated - u.credits_consumed)}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {users.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No subscribers yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Stats Tab */}
            {activeTab === 'stats' && stats && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Total Subscribers', value: stats.total_subscribers, color: 'text-foreground' },
                    { label: 'Trialing', value: stats.trialing, color: 'text-info' },
                    { label: 'Active', value: stats.active, color: 'text-positive' },
                    { label: 'Expired', value: stats.expired, color: 'text-negative' },
                    { label: 'Credits Consumed (mo)', value: stats.total_credits_consumed, color: 'text-foreground' },
                    { label: 'Receipt Docs (mo)', value: stats.total_receipt_extractions, color: 'text-foreground' },
                    {
                      label: 'Est. AI Cost (mo)',
                      value: formatCurrencyText(stats.estimated_cost_usd || 0, {
                        currencyCode: 'USD',
                        locale,
                      }),
                      color: 'text-foreground',
                    },
                  ].map(s => (
                    <div key={s.label} className="card-elevated p-4">
                      <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-xl font-700 ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Stats reflect current billing month. Estimated AI cost is based on provider token usage recorded in the credit ledger.
                </p>
              </div>
            )}
          </>
        )}
      </div>
  );
}
