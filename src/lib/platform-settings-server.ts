import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { normalizePlatformSettings, type PlatformSettingsSnapshot } from '@/lib/platform-settings';
import { createAdminClient } from '@/lib/supabase/admin';

async function readPlatformSettingsWithAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

async function readPlatformSettingsWithAdminClient() {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

export const getPlatformSettingsSnapshot = cache(async (): Promise<PlatformSettingsSnapshot> => {
  noStore();

  try {
    const anonData = await readPlatformSettingsWithAnonClient();
    if (anonData) {
      return normalizePlatformSettings(anonData);
    }
  } catch {}

  try {
    const adminData = await readPlatformSettingsWithAdminClient();
    if (adminData) {
      return normalizePlatformSettings(adminData);
    }
  } catch {}

  return normalizePlatformSettings(null);
});
