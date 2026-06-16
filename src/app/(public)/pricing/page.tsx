'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, Loader2, Zap, Mic, Users, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

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
  managed_people_enabled: boolean;
  shared_spaces_enabled: boolean;
  standard_reports_enabled: boolean;
  family_reports_enabled: boolean;
  is_active: boolean;
  display_order: number;
}

function planFeatures(plan: Plan): string[] {
  const features: string[] = [];
  features.push(`${plan.monthly_ai_credits} AI credits/month`);
  features.push(`${plan.daily_ai_request_limit} AI requests/day`);
  features.push(`${Math.round(plan.monthly_voice_seconds / 60)} voice minutes/month`);
  if (plan.text_ai_enabled) features.push('Text AI (Smart Entry)');
  if (plan.voice_ai_enabled) features.push('Voice AI transcription');
  if (plan.ai_history_enabled) features.push('AI request history');
  if (plan.managed_people_enabled) features.push('Managed People');
  if (plan.shared_spaces_enabled) features.push('Shared Spaces');
  if (plan.standard_reports_enabled) features.push('Standard reports');
  if (plan.family_reports_enabled) features.push('Family reports');
  features.push('Manual finance entry (always available)');
  return features;
}

function planCTA(plan: Plan): string {
  if (plan.plan_code === 'free_trial') return 'Start Free Trial';
  if (plan.plan_code === 'personal') return 'Get Personal';
  if (plan.plan_code === 'family') return 'Get Family';
  return 'Get Started';
}

function planHighlighted(plan: Plan): boolean {
  return plan.plan_code === 'personal';
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order')
      .then(({ data }: { data: Plan[] | null }) => {
        if (data) setPlans(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="py-16 px-4 flex items-center justify-center min-h-[400px]">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-700 text-foreground mb-4">Simple, transparent pricing</h1>
          <p className="text-lg text-muted-foreground">Start free, upgrade when you need more</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const highlighted = planHighlighted(plan);
            const features = planFeatures(plan);
            const voiceMin = Math.round(plan.monthly_voice_seconds / 60);
            return (
              <div
                key={plan.id}
                className={`card-elevated p-6 relative ${highlighted ? 'border-accent border-2 shadow-card-md' : ''}`}
              >
                {highlighted && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-700 bg-accent text-accent-foreground px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <div className="mb-6">
                  <h2 className="text-lg font-700 text-foreground">{plan.plan_name}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  <div className="mt-4">
                    {plan.price_amount === 0 ? (
                      <span className="text-3xl font-800 text-foreground">Free</span>
                    ) : (
                      <>
                        <span className="text-3xl font-800 text-foreground">${plan.price_amount}</span>
                        <span className="text-sm text-muted-foreground ml-1">/{plan.billing_interval}</span>
                      </>
                    )}
                  </div>
                  {plan.trial_duration_days > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-info font-600">
                      <Clock size={12} />
                      {plan.trial_duration_days}-day free trial
                    </div>
                  )}
                </div>

                {/* AI highlights */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="flex items-center gap-1 text-[11px] bg-accent/10 text-accent px-2 py-0.5 rounded-full font-600">
                    <Zap size={10} /> {plan.monthly_ai_credits} credits
                  </span>
                  {plan.voice_ai_enabled && (
                    <span className="flex items-center gap-1 text-[11px] bg-positive-soft text-positive px-2 py-0.5 rounded-full font-600">
                      <Mic size={10} /> {voiceMin} min voice
                    </span>
                  )}
                  {plan.managed_people_enabled && (
                    <span className="flex items-center gap-1 text-[11px] bg-info-soft text-info px-2 py-0.5 rounded-full font-600">
                      <Users size={10} /> Family
                    </span>
                  )}
                </div>

                <ul className="space-y-2.5 mb-6">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check size={14} className="text-positive flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up-login"
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-600 transition-all ${
                    highlighted ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  {planCTA(plan)}
                  <ArrowRight size={14} />
                </Link>
              </div>
            );
          })}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-8">
          Free Trial includes 2 months of AI access. No credit card required. Manual finance features always available.
        </p>
      </div>
    </div>
  );
}
