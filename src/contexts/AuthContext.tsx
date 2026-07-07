'use client';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase/client';
import { buildAuthCallbackUrl } from '@/lib/auth/urls';

// #region debug-point home-first-visit-blank:auth-report
function reportHomeFirstVisitBlankEvent(payload: Record<string, unknown>) {
  try {
    if (process.env.NEXT_PUBLIC_SP_DEBUG !== '1') return;
    if (typeof window === 'undefined') return;

    const url =
      process.env.NEXT_PUBLIC_SP_DEBUG_URL
      || `http://${window.location.hostname}:7777/event`;
    if (!url) return;

    const body = JSON.stringify({
      sessionId: 'home-first-visit-blank',
      ts: Date.now(),
      source: 'AuthContext',
      ...payload,
    });

    if ('sendBeacon' in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {}
}
// #endregion debug-point home-first-visit-blank:auth-report

type SignUpMetadata = {
  fullName?: string;
  avatarUrl?: string;
};

export type SignUpResult = {
  user: Session['user'] | null;
  session: Session | null;
  requiresEmailVerification: boolean;
};

export type AuthUserProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

const AuthContext = createContext<any>({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<AuthUserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [supabase] = useState(() => createClient());

  const refreshUserProfile = useCallback(async (userId?: string | null) => {
    const nextUserId = userId || user?.id;
    if (!nextUserId) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, full_name, avatar_url')
      .eq('id', nextUserId)
      .maybeSingle();

    if (error) throw error;

    const nextProfile = data
      ? {
          id: data.id,
          full_name: data.full_name || null,
          avatar_url: data.avatar_url || null,
        }
      : null;

    setProfile(nextProfile);
    return nextProfile;
  }, [supabase, user?.id]);

  const patchUserProfile = useCallback((patch: Partial<AuthUserProfile>) => {
    setProfile((current) => {
      if (!current && !user?.id) return current;
      return {
        id: current?.id || user?.id || '',
        full_name: patch.full_name !== undefined ? patch.full_name ?? null : current?.full_name || null,
        avatar_url: patch.avatar_url !== undefined ? patch.avatar_url ?? null : current?.avatar_url || null,
      };
    });
  }, [user?.id]);

  const refreshUserProfileSafely = useCallback(async (userId?: string | null) => {
    try {
      if (userId) {
        await refreshUserProfile(userId);
      } else {
        setProfile(null);
      }
    } catch (error: unknown) {
      reportHomeFirstVisitBlankEvent({
        point: 'loadUserProfile',
        errorName: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setProfile(null);
    }
  }, [refreshUserProfile]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession()
      .then(async ({ data: { session } }: { data: { session: Session | null } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        // Unblock app readiness as soon as auth session is known.
        setLoading(false);
        await refreshUserProfileSafely(session?.user?.id ?? null);
      })
      .catch((error: unknown) => {
        reportHomeFirstVisitBlankEvent({
          point: 'getSession',
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    // Listen for auth changes
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      await refreshUserProfileSafely(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, [refreshUserProfileSafely, supabase.auth]);

  // Email/Password Sign Up
  const signUp = async (
    email: string,
    password: string,
    metadata: SignUpMetadata = {},
    nextPath?: string | null
  ): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: metadata.fullName || '',
          avatar_url: metadata.avatarUrl || ''
        },
        emailRedirectTo: buildAuthCallbackUrl(nextPath)
      }
    });
    if (error) throw error;

    // Assign free trial via server-side API after signup
    // The DB trigger handles this automatically on user_profiles insert,
    // but we call the API as a belt-and-suspenders measure.
    try {
      if (data?.user?.id) {
        await fetch('/api/subscription/init-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // Non-fatal — DB trigger handles it
    }

    return {
      user: data.user,
      session: data.session,
      requiresEmailVerification: !data.session,
    };
  };

  // Sign Out
  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  // Get Current User
  const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  };

  // Check if Email is Verified
  const isEmailVerified = () => {
    return user?.email_confirmed_at !== null;
  };

  // Get User Profile from Database
  const getUserProfile = async () => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  };

  const value = useMemo(() => ({
    user,
    session,
    profile,
    loading,
    signUp,
    signOut,
    getCurrentUser,
    isEmailVerified,
    getUserProfile,
    refreshUserProfile,
    patchUserProfile,
  }), [getCurrentUser, getUserProfile, isEmailVerified, loading, patchUserProfile, profile, refreshUserProfile, session, signOut, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
