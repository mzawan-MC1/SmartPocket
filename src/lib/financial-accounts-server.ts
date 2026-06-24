import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

type EnsureDefaultPersonalAccountsRow = {
  personal_cash_account_id: string | null;
  personal_bank_account_id: string | null;
  created_cash: boolean | null;
  created_bank: boolean | null;
};

function getPlatformFallbackCurrency() {
  return (process.env.NEXT_PUBLIC_DEFAULT_CURRENCY || 'AED').trim().toUpperCase();
}

function normalizeOptionalText(value: unknown, options?: { uppercase?: boolean; maxLength?: number }) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = options?.uppercase ? trimmed.toUpperCase() : trimmed;
  return typeof options?.maxLength === 'number'
    ? normalized.slice(0, options.maxLength)
    : normalized;
}

function maskAccountNumber(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 5 && !/[*Xx]/.test(trimmed)) {
    return `****${digitsOnly.slice(-4)}`;
  }

  return trimmed.slice(0, 64);
}

export function sanitizeFinancialAccountPayload(payload: Record<string, unknown>) {
  const accountType = normalizeOptionalText(payload.account_type)?.toLowerCase();
  const currency = normalizeOptionalText(payload.currency, { uppercase: true, maxLength: 3 });
  const ownershipType = normalizeOptionalText(payload.ownership_type)?.toLowerCase();
  const bankAccountType = normalizeOptionalText(payload.bank_account_type)?.toLowerCase();
  const parsedOpeningBalance = Number(payload.opening_balance ?? 0);

  return {
    name: normalizeOptionalText(payload.name, { maxLength: 120 }),
    account_type: accountType,
    currency: currency || getPlatformFallbackCurrency(),
    opening_balance: Number.isFinite(parsedOpeningBalance) ? parsedOpeningBalance : 0,
    notes: normalizeOptionalText(payload.notes, { maxLength: 1000 }),
    include_in_total: payload.include_in_total !== false,
    is_active: payload.is_active !== false,
    ownership_type: ownershipType === 'shared'
      || ownershipType === 'business'
      || ownershipType === 'other'
      || ownershipType === 'personal'
      ? ownershipType
      : 'personal',
    bank_name: accountType === 'bank' ? normalizeOptionalText(payload.bank_name, { maxLength: 120 }) : null,
    account_holder_name: accountType === 'bank'
      ? normalizeOptionalText(payload.account_holder_name, { maxLength: 120 })
      : null,
    account_number_masked: accountType === 'bank' ? maskAccountNumber(payload.account_number_masked) : null,
    iban: accountType === 'bank' ? normalizeOptionalText(payload.iban, { uppercase: true, maxLength: 34 }) : null,
    swift_bic: accountType === 'bank' ? normalizeOptionalText(payload.swift_bic, { uppercase: true, maxLength: 11 }) : null,
    branch_name: accountType === 'bank' ? normalizeOptionalText(payload.branch_name, { maxLength: 120 }) : null,
    bank_account_type: accountType === 'bank' && (
      bankAccountType === 'current'
      || bankAccountType === 'savings'
      || bankAccountType === 'credit_card'
      || bankAccountType === 'wallet'
      || bankAccountType === 'other'
    )
      ? bankAccountType
      : null,
  };
}

export function validateFinancialAccountInput(input: ReturnType<typeof sanitizeFinancialAccountPayload>) {
  if (!input.name) {
    return 'Account name is required';
  }
  if (!input.account_type) {
    return 'Account type is required';
  }
  if (!input.currency || input.currency.length !== 3) {
    return 'Currency is required';
  }
  if (!['bank', 'credit_card', 'cash', 'savings', 'digital_wallet', 'investment', 'other'].includes(input.account_type)) {
    return 'Unsupported account type';
  }
  if (!['personal', 'shared', 'business', 'other'].includes(input.ownership_type)) {
    return 'Unsupported ownership type';
  }
  if (input.iban && (input.iban.length < 5 || input.iban.length > 34)) {
    return 'IBAN must be between 5 and 34 characters';
  }
  if (input.swift_bic && (input.swift_bic.length < 8 || input.swift_bic.length > 11)) {
    return 'SWIFT/BIC must be between 8 and 11 characters';
  }
  if (input.account_number_masked) {
    const visibleDigits = input.account_number_masked.replace(/[^0-9]/g, '');
    if (visibleDigits.length > 12) {
      return 'Account number must be masked before saving';
    }
  }

  return null;
}

export function logFinancialAccountsServerError(action: string, error: unknown, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : 'Unknown financial account error';
  console.error(`[financial-accounts] ${action}: ${message}`, context || {});
}

export async function ensureDefaultPersonalAccounts(
  userId: string,
  options?: {
    supabase?: SupabaseClient;
    logErrors?: boolean;
  }
) {
  const supabase = options?.supabase || createAdminClient();
  if (!supabase) {
    if (options?.logErrors !== false) {
      logFinancialAccountsServerError('ensure-default-personal-accounts', new Error('Service role client is not configured'), {
        userId,
      });
    }
    return null;
  }

  try {
    const { data, error } = await supabase.rpc('rpc_ensure_default_personal_accounts', {
      p_user_id: userId,
    });

    if (error) {
      throw error;
    }

    const row = (Array.isArray(data) ? data[0] : data) as EnsureDefaultPersonalAccountsRow | null;
    return row || null;
  } catch (error) {
    if (options?.logErrors !== false) {
      logFinancialAccountsServerError('ensure-default-personal-accounts', error, { userId });
    }
    return null;
  }
}
