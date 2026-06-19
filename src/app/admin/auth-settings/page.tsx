'use client';
import React, { useState, useEffect } from 'react';
import { Shield, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';


type AuthSettings = {
  email_password_enabled: boolean;
  google_oauth_enabled: boolean;
  apple_oauth_enabled: boolean;
  magic_link_enabled: boolean;
  require_email_verification: boolean;
  password_min_length: number;
  session_duration: number;
};

type AuthMethod = {
  key: keyof AuthSettings;
  label: string;
  desc: string;
  required: boolean;
};

export default function AdminAuthSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [settings, setSettings] = useState<AuthSettings>({
    email_password_enabled: true,
    google_oauth_enabled: false,
    apple_oauth_enabled: false,
    magic_link_enabled: false,
    require_email_verification: true,
    password_min_length: 8,
    session_duration: 30,
  });
  const methods: AuthMethod[] = [
    { key: 'email_password_enabled', label: 'Email & Password', desc: 'Allow users to sign in with email and password', required: false },
    { key: 'google_oauth_enabled', label: 'Google OAuth', desc: 'Requires Google Cloud Console setup in Supabase', required: false },
    { key: 'apple_oauth_enabled', label: 'Apple Sign In', desc: 'Requires Apple Developer account setup in Supabase', required: false },
    { key: 'magic_link_enabled', label: 'Magic Link (Passwordless)', desc: 'Users sign in via a one-time email link', required: false },
  ];

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings((s) => ({
            ...s,
            email_password_enabled: data.email_password_enabled ?? s.email_password_enabled,
            google_oauth_enabled: data.google_oauth_enabled ?? s.google_oauth_enabled,
            apple_oauth_enabled: data.apple_oauth_enabled ?? s.apple_oauth_enabled,
            magic_link_enabled: data.magic_link_enabled ?? s.magic_link_enabled,
            require_email_verification: data.require_email_verification ?? s.require_email_verification,
            password_min_length: data.password_min_length ?? s.password_min_length,
          }));
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await savePlatformSettings({
        email_password_enabled: settings.email_password_enabled,
        google_oauth_enabled: settings.google_oauth_enabled,
        apple_oauth_enabled: settings.apple_oauth_enabled,
        magic_link_enabled: settings.magic_link_enabled,
        require_email_verification: settings.require_email_verification,
        password_min_length: settings.password_min_length,
      });
      setSaved(true);
      toast.success('Auth settings saved');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-accent" /></div>
    );
  }

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Authentication Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configure sign-in methods and security policies</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Shield size={15} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        </div>

        {/* Sign-in Methods */}
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Sign-in Methods</h2>
          {methods.map((method) => (
            <div key={method.key} className="flex items-center justify-between p-3 rounded-xl border border-border">
              <div>
                <p className="text-sm font-600 text-foreground">{method.label}</p>
                <p className="text-xs text-muted-foreground">{method.desc}</p>
              </div>
              <button
                onClick={() => !method.required && setSettings((s) => ({ ...s, [method.key]: !s[method.key] }))}
                disabled={method.required}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  settings[method.key] ? 'bg-accent' : 'bg-muted'
                } ${method.required ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                aria-label={`Toggle ${method.label}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${
                  settings[method.key] ? 'start-5' : 'start-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>

        {/* Security Settings */}
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Security Policy</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Minimum password length</label>
              <input
                type="number"
                min="6"
                max="32"
                value={settings.password_min_length}
                onChange={(e) => setSettings((s) => ({ ...s, password_min_length: parseInt(e.target.value) }))}
                className="input-base w-24 font-tabular"
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Session duration (days)</label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.session_duration}
                onChange={(e) => setSettings((s) => ({ ...s, session_duration: parseInt(e.target.value) }))}
                className="input-base w-24 font-tabular"
              />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl border border-border">
            <div>
              <p className="text-sm font-600 text-foreground">Email verification required</p>
              <p className="text-xs text-muted-foreground">Users must verify email before accessing the app</p>
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, require_email_verification: !s.require_email_verification }))}
              className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${settings.require_email_verification ? 'bg-accent' : 'bg-muted'}`}
              aria-label="Toggle email verification"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${settings.require_email_verification ? 'start-5' : 'start-0.5'}`} />
            </button>
          </div>
        </div>

        {/* OAuth Setup Guide */}
        <div className="card-elevated p-5 border-l-4 border-accent">
          <h3 className="text-sm font-700 text-foreground mb-2">OAuth Setup Instructions</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p><strong className="text-foreground">Google OAuth:</strong> Go to Google Cloud Console → Create OAuth 2.0 credentials → Add redirect URI: <code className="bg-muted px-1 rounded">{process.env.NEXT_PUBLIC_SITE_URL}/api/auth/callback</code></p>
            <p><strong className="text-foreground">Apple Sign In:</strong> Go to Apple Developer → Certificates, IDs &amp; Profiles → Create Service ID → Configure Sign In with Apple</p>
            <p>Then add credentials in Supabase Dashboard → Authentication → Providers</p>
            <p className="mt-2 text-warning font-600">⚠️ Note: Toggling providers here saves the preference to platform_settings. The actual OAuth provider must still be enabled in Supabase Dashboard → Authentication → Providers.</p>
          </div>
        </div>
      </div>
  );
}
