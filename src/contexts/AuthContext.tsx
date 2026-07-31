'use client';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '../lib/supabase/client';
import { buildAuthCallbackUrl } from '@/lib/auth/urls';

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
  const userIdRef = useRef<string | null>(null);
  const lastAppliedSessionKeyRef = useRef<string | null>(null);
  const profileRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const profileRefreshUserIdRef = useRef<string | null>(null);
  const profileRefreshTokenRef = useRef<symbol | null>(null);

  const refreshUserProfile = useCallback(async (userId?: string | null) => {
    const nextUserId = userId ?? userIdRef.current;
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

    if (userIdRef.current === nextUserId) {
      setProfile(nextProfile);
    }
    return nextProfile;
  }, [supabase]);

  const patchUserProfile = useCallback((patch: Partial<AuthUserProfile>) => {
    setProfile((current) => {
      if (!current && !userIdRef.current) return current;
      return {
        id: current?.id || userIdRef.current || '',
        full_name: patch.full_name !== undefined ? patch.full_name ?? null : current?.full_name || null,
        avatar_url: patch.avatar_url !== undefined ? patch.avatar_url ?? null : current?.avatar_url || null,
      };
    });
  }, []);

  const refreshUserProfileSafely = useCallback(async (userId?: string | null) => {
    const targetUserId = userId ?? userIdRef.current;
    try {
      if (targetUserId) {
        await refreshUserProfile(targetUserId);
      } else {
        setProfile(null);
      }
    } catch {
      if (!targetUserId || userIdRef.current === targetUserId) {
        setProfile(null);
      }
    }
  }, [refreshUserProfile]);

  const scheduleProfileRefresh = useCallback((nextUserId: string | null) => {
    if (!nextUserId) {
      profileRefreshInFlightRef.current = null;
      profileRefreshUserIdRef.current = null;
      setProfile(null);
      return;
    }

    if (profileRefreshInFlightRef.current && profileRefreshUserIdRef.current === nextUserId) {
      return;
    }

    window.setTimeout(() => {
      if (userIdRef.current !== nextUserId) {
        return;
      }

      if (profileRefreshInFlightRef.current && profileRefreshUserIdRef.current === nextUserId) {
        return;
      }

      profileRefreshUserIdRef.current = nextUserId;
      const refreshToken = Symbol(nextUserId);
      profileRefreshTokenRef.current = refreshToken;
      const refreshPromise = refreshUserProfileSafely(nextUserId).finally(() => {
        if (profileRefreshTokenRef.current === refreshToken) {
          profileRefreshInFlightRef.current = null;
          profileRefreshUserIdRef.current = null;
          profileRefreshTokenRef.current = null;
        }
      });

      profileRefreshInFlightRef.current = refreshPromise;
    }, 0);
  }, [refreshUserProfileSafely]);

  const applySession = useCallback((nextSession: Session | null) => {
    const nextUser = nextSession?.user ?? null;
    const nextUserId = nextUser?.id ?? null;
    const nextSessionKey = nextSession?.access_token
      ? `${nextUserId || 'anonymous'}:${nextSession.access_token}`
      : `signed-out:${nextUserId || 'anonymous'}`;

    if (lastAppliedSessionKeyRef.current === nextSessionKey) {
      if (!nextUserId) {
        setLoading(false);
      }
      return false;
    }

    lastAppliedSessionKeyRef.current = nextSessionKey;
    userIdRef.current = nextUserId;
    setSession(nextSession);
    setUser(nextUser);
    setLoading(false);

    if (!nextUserId) {
      profileRefreshInFlightRef.current = null;
      profileRefreshUserIdRef.current = null;
      profileRefreshTokenRef.current = null;
      setProfile(null);
      return true;
    }

    scheduleProfileRefresh(nextUserId);
    return true;
  }, [scheduleProfileRefresh]);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }: { data: { session: Session | null } }) => {
        applySession(session);
      })
      .catch(() => {
        lastAppliedSessionKeyRef.current = 'signed-out:anonymous';
        userIdRef.current = null;
        profileRefreshInFlightRef.current = null;
        profileRefreshUserIdRef.current = null;
        profileRefreshTokenRef.current = null;
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, nextSession: Session | null) => {
      applySession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, [applySession, supabase.auth]);

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
