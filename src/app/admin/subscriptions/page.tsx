'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { CreditCard, Users, Save, Edit2, Loader2, RefreshCw, Gift, UserCog, BarChart3 } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface Plan {
  id: string;
  plan_code: string;
  plan_name: string;
  description: string;
  price_amount: number;
  billing_interval: string;
  trial_duration_days: number;
  monthly_ai_credits: number;
  daily_ai_request_limit: number;
  monthly_voice_seconds: number;
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
  credits_consumed: number;
  credits_allocated: number;
}

interface AdminStats {
  total_subscribers: number;
  trialing: number;
  active: number;
  expired: number;
  total_credits_consumed: number;
  total_voice_seconds: number;
  estimated_cost_usd: number;
}

const PLAN_COLORS: Record<string, string> = {
  free_trial: 'bg-info-soft text-info',
  personal: 'bg-accent/10 text-accent',
  family: 'bg-positive-soft text-positive',
};

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

  const handleSave = async () => {
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
          <label className="block text-xs font-600 text-foreground mb-1">Price (USD)</label>
          <input type="number" min="0" step="0.01" className="input-base text-sm" value={form.price_amount} onChange={e => set('price_amount', parseFloat(e.target.value) || 0)} />
        </div>
        <div>
          <label className="block text-xs font-600 text-foreground mb-1">Billing Interval</label>
          <select className="input-base text-sm" value={form.billing_interval} onChange={e => set('billing_interval', e.target.value)}>
            <option value="none">None (free)</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
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
          <label className="block text-xs font-600 text-foreground mb-1">AI History Retention (days)</label>
          <input type="number" min="0" className="input-base text-sm" value={form.ai_history_retention_days} onChange={e => set('ai_history_retention_days', parseInt(e.target.value) || 30)} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-600 text-foreground mb-1">Description</label>
          <textarea className="input-base text-sm resize-none" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['text_ai_enabled', 'Text AI'],
          ['voice_ai_enabled', 'Voice AI'],
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
  const [changingPlan, setChangingPlan] = useState(false);

  const supabase = createClient();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, statsRes] = await Promise.all([
        supabase.from('subscription_plans').select('*').order('display_order'),
        supabase.rpc('get_subscription_admin_stats'),
      ]);

      if (plansRes.data) setPlans(plansRes.data);
      if (statsRes.data) setStats(statsRes.data as AdminStats);

      // Load user subscriptions with profile info
      const { data: subData } = await supabase
        .from('user_subscriptions')
        .select(`
          user_id, status, trial_ends_at,
          subscription_plans!inner(plan_name, plan_code),
          user_profiles!inner(email, full_name),
          ai_usage_cycles(credits_consumed, credits_allocated)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (subData) {
        const rows: UserSubRow[] = subData.map((row: any) => ({
          user_id: row.user_id,
          email: row.user_profiles?.email || '—',
          full_name: row.user_profiles?.full_name || '—',
          plan_name: row.subscription_plans?.plan_name || '—',
          plan_code: row.subscription_plans?.plan_code || '—',
          status: row.status,
          trial_ends_at: row.trial_ends_at,
          credits_consumed: row.ai_usage_cycles?.[0]?.credits_consumed ?? 0,
          credits_allocated: row.ai_usage_cycles?.[0]?.credits_allocated ?? 0,
        }));
        setUsers(rows);
      }
    } catch (err) {
      toast.error('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSavePlan = async (plan: Plan) => {
    const { error } = await supabase
      .from('subscription_plans')
      .update({
        plan_name: plan.plan_name,
        description: plan.description,
        price_amount: plan.price_amount,
        billing_interval: plan.billing_interval,
        trial_duration_days: plan.trial_duration_days,
        monthly_ai_credits: plan.monthly_ai_credits,
        daily_ai_request_limit: plan.daily_ai_request_limit,
        monthly_voice_seconds: plan.monthly_voice_seconds,
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
                  <p className="text-sm text-muted-foreground">{plans.length}/3 plans configured</p>
                  <button onClick={loadData} className="btn-secondary text-xs flex items-center gap-1.5">
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
                {plans.map(plan => (
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
                              {plan.price_amount === 0 ? 'Free' : `$${plan.price_amount}/${plan.billing_interval}`}
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
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trial days</p>
                            <p className="text-sm font-700 text-foreground mt-0.5">{plan.trial_duration_days}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {plan.text_ai_enabled && <span className="text-[10px] bg-positive-soft text-positive px-2 py-0.5 rounded-full font-600">Text AI</span>}
                          {plan.voice_ai_enabled && <span className="text-[10px] bg-positive-soft text-positive px-2 py-0.5 rounded-full font-600">Voice AI</span>}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      {plans.filter(p => p.is_active).map(p => (
                        <option key={p.plan_code} value={p.plan_code}>{p.plan_name}</option>
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
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Status</th>
                          <th className="text-left px-4 py-2.5 text-xs font-600 text-muted-foreground">Credits</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.user_id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-600 text-foreground text-xs">{u.full_name}</p>
                              <p className="text-[11px] text-muted-foreground">{u.email}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${PLAN_COLORS[u.plan_code] || 'bg-secondary text-muted-foreground'}`}>
                                {u.plan_name}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-600 capitalize ${
                                u.status === 'active' ? 'text-positive' :
                                u.status === 'trialing' ? 'text-info' :
                                'text-negative'
                              }`}>{u.status}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs text-foreground">{u.credits_consumed}/{u.credits_allocated}</span>
                            </td>
                          </tr>
                        ))}
                        {users.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No subscribers yet</td>
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
                    { label: 'Est. AI Cost (mo)', value: `$${(stats.estimated_cost_usd || 0).toFixed(4)}`, color: 'text-foreground' },
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
