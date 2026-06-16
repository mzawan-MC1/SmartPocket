'use client';
import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { toast } from 'sonner';

interface FeatureToggle {
  key: string;
  label: string;
  description: string;
  value: boolean;
}

export default function AdminFeaturesPage() {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState<FeatureToggle[]>([
    { key: 'feature_managed_people', label: 'Managed People', description: 'Allow users to manage finances for family, friends, and others', value: true },
    { key: 'feature_shared_spaces', label: 'Shared Spaces', description: 'Allow users to create shared financial spaces (Family, Household, etc.)', value: true },
    { key: 'feature_invitations', label: 'Space Invitations', description: 'Allow users to invite others to their spaces with role-based access', value: true },
    { key: 'feature_reimbursements', label: 'Reimbursements', description: 'Track money owed between users and managed people', value: true },
    { key: 'feature_settlements', label: 'Settlements', description: 'Record settlement payments to clear reimbursements', value: true },
  ]);

  useEffect(() => {
    getPlatformSettings().then((settings) => {
      if (settings) {
        setFeatures((prev) => prev.map((f) => ({
          ...f,
          value: settings[f.key] !== undefined ? Boolean(settings[f.key]) : f.value,
        })));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = (key: string) => {
    setFeatures((prev) => prev.map((f) => f.key === key ? { ...f, value: !f.value } : f));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, boolean> = {};
      features.forEach((f) => { payload[f.key] = f.value; });
      await savePlatformSettings(payload);
      toast.success('Feature toggles saved');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-700 text-foreground">Phase 2 Feature Toggles</h1>
            <p className="text-sm text-muted-foreground">Enable or disable Phase 2 modules platform-wide</p>
          </div>
        </div>

        <div className="card divide-y divide-border">
          {loading ? (
            <div className="p-6 animate-pulse space-y-4">
              {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 bg-muted rounded" />)}
            </div>
          ) : (
            features.map((feature) => (
              <div key={feature.key} className="flex items-center justify-between p-5">
                <div className="flex-1 min-w-0 me-4">
                  <p className="text-sm font-600 text-foreground">{feature.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                </div>
                <button
                  onClick={() => toggle(feature.key)}
                  className={`flex-shrink-0 transition-colors ${feature.value ? 'text-accent' : 'text-muted-foreground'}`}
                  aria-label={`Toggle ${feature.label}`}
                >
                  {feature.value ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
  );
}
