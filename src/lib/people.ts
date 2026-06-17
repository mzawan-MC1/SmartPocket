'use client';
import { createClient } from '@/lib/supabase/client';
import { getClientReferenceData } from '@/lib/reference-data/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RelationshipType = 'spouse' | 'child' | 'parent' | 'sibling' | 'friend' | 'relative' | 'colleague' | 'client' | 'other';
export type SpaceRole = 'owner' | 'manager' | 'contributor' | 'viewer' | 'dependent';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';
export type ReimbursementStatus = 'pending' | 'partially_paid' | 'settled' | 'waived' | 'cancelled';
export type PersonTransactionType =
  | 'money_received' |'money_returned' |'expense_from_held' |'expense_paid_by_user' |'expense_paid_by_person' |'reimbursement_due_to_user' |'reimbursement_due_to_person' |'reimbursement_received' |'reimbursement_paid' |'settlement' |'adjustment';

export interface ManagedPerson {
  id: string;
  owner_id: string;
  space_id: string | null;
  full_name: string;
  aliases?: string[];
  relationship: RelationshipType;
  email: string | null;
  phone: string | null;
  phone_e164?: string | null;
  phone_country_code?: string | null;
  phone_display?: string | null;
  photo_url: string | null;
  notes: string | null;
  preferred_currency: string;
  is_active: boolean;
  is_archived: boolean;
  linked_user_id: string | null;
  created_at: string;
  updated_at: string;
  // computed from view
  money_held?: number;
  person_owes_user?: number;
  user_owes_person?: number;
  total_received?: number;
  total_returned?: number;
  total_expenses?: number;
}

export interface Space {
  id: string;
  owner_id: string;
  name: string;
  space_type: 'personal' | 'family' | 'household' | 'child' | 'friend' | 'custom';
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  id: string;
  space_id: string;
  user_id: string;
  role: SpaceRole;
  joined_at: string;
}

export interface SpaceInvitation {
  id: string;
  space_id: string;
  invited_by: string;
  email: string;
  role: SpaceRole;
  status: InvitationStatus;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface PersonLedgerEntry {
  id: string;
  person_id: string;
  owner_id: string;
  entry_type: PersonTransactionType;
  amount: number;
  currency: string;
  description: string;
  transaction_id: string | null;
  reference_id: string | null;
  reference_type: string | null;
  notes: string | null;
  entry_date: string;
  is_deleted: boolean;
  created_at: string;
}

export interface Reimbursement {
  id: string;
  owner_id: string;
  person_id: string;
  transaction_id: string | null;
  ledger_entry_id: string | null;
  amount: number;
  currency: string;
  owed_by: string;
  owed_to: string;
  status: ReimbursementStatus;
  due_date: string | null;
  description: string;
  notes: string | null;
  amount_paid: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // joined
  person?: { full_name: string; relationship: RelationshipType };
}

export interface ReimbursementPayment {
  id: string;
  reimbursement_id: string;
  owner_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  notes: string | null;
  created_at: string;
}

export interface Settlement {
  id: string;
  owner_id: string;
  person_id: string;
  amount: number;
  currency: string;
  settlement_date: string;
  payment_method: string;
  receiving_account_id: string | null;
  description: string;
  notes: string | null;
  attachment_url: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  // joined
  person?: { full_name: string; relationship: RelationshipType };
  receiving_account?: { name: string };
}

export interface PersonBalance {
  person_id: string;
  owner_id: string;
  full_name: string;
  preferred_currency: string;
  total_received: number;
  total_returned: number;
  total_expenses: number;
  money_held: number;
  person_owes_user: number;
  user_owes_person: number;
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : null;
}

async function resolveFallbackCurrency(preferredCurrency?: string | null) {
  const normalized = normalizeCurrencyCode(preferredCurrency);
  if (normalized) {
    return normalized;
  }

  try {
    const referenceData = await getClientReferenceData();
    if (referenceData.platformDefaultCurrency) {
      return referenceData.platformDefaultCurrency;
    }
  } catch {
    // Keep writes resilient even if shared reference data is temporarily unavailable.
  }

  return 'USD';
}

// ─── Managed People ───────────────────────────────────────────────────────────

export async function getManagedPeople(includeArchived = false): Promise<ManagedPerson[]> {
  const supabase = createClient();
  let query = supabase
    .from('managed_people')
    .select('*')
    .order('full_name', { ascending: true });

  if (!includeArchived) {
    query = query.eq('is_archived', false);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Fetch balances
  const people = (data || []) as ManagedPerson[];
  const { data: balances } = await supabase
    .from('person_balances')
    .select('*');
  const { data: aliases } = await supabase
    .from('person_aliases')
    .select('person_id, alias');

  const balanceMap = new Map(
    ((balances || []) as PersonBalance[]).map((b) => [b.person_id, b] as const)
  );
  const aliasMap = new Map<string, string[]>();
  for (const alias of ((aliases || []) as Array<{ person_id: string; alias: string }>)) {
    const current = aliasMap.get(alias.person_id) || [];
    current.push(alias.alias);
    aliasMap.set(alias.person_id, current);
  }

  return people.map((p) => {
    const bal: PersonBalance | undefined = balanceMap.get(p.id);
    return {
      ...p,
      aliases: aliasMap.get(p.id) || [],
      money_held: bal?.money_held ?? 0,
      person_owes_user: bal?.person_owes_user ?? 0,
      user_owes_person: bal?.user_owes_person ?? 0,
      total_received: bal?.total_received ?? 0,
      total_returned: bal?.total_returned ?? 0,
      total_expenses: bal?.total_expenses ?? 0,
    };
  });
}

export async function getManagedPerson(id: string): Promise<ManagedPerson | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('managed_people')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;

  const { data: bal } = await supabase
    .from('person_balances')
    .select('*')
    .eq('person_id', id)
    .single();

  return {
    ...data,
    money_held: bal?.money_held ?? 0,
    person_owes_user: bal?.person_owes_user ?? 0,
    user_owes_person: bal?.user_owes_person ?? 0,
    total_received: bal?.total_received ?? 0,
    total_returned: bal?.total_returned ?? 0,
    total_expenses: bal?.total_expenses ?? 0,
  } as ManagedPerson;
}

export async function createManagedPerson(payload: Partial<ManagedPerson>): Promise<ManagedPerson> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const insertPayload = { ...payload, owner_id: user.id };

  let result = await supabase
    .from('managed_people')
    .insert(insertPayload)
    .select()
    .single();

  if (result.error && shouldRetryWithoutPhoneNormalizationColumns(result.error)) {
    const { phone_e164, phone_country_code, phone_display, ...legacyPayload } = insertPayload;
    result = await supabase
      .from('managed_people')
      .insert(legacyPayload)
      .select()
      .single();
  }

  if (result.error) throw result.error;

  await logActivity(user.id, 'person_created', 'managed_people', result.data.id, null, { full_name: result.data.full_name });
  return result.data as ManagedPerson;
}

export async function updateManagedPerson(id: string, payload: Partial<ManagedPerson>): Promise<ManagedPerson> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let result = await supabase
    .from('managed_people')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (result.error && shouldRetryWithoutPhoneNormalizationColumns(result.error)) {
    const { phone_e164, phone_country_code, phone_display, ...legacyPayload } = payload;
    result = await supabase
      .from('managed_people')
      .update(legacyPayload)
      .eq('id', id)
      .select()
      .single();
  }

  if (result.error) throw result.error;

  await logActivity(user.id, 'person_updated', 'managed_people', id, null, payload);
  return result.data as ManagedPerson;
}

export async function archiveManagedPerson(id: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('managed_people')
    .update({ is_archived: true, is_active: false })
    .eq('id', id);
  if (error) throw error;

  await logActivity(user.id, 'person_archived', 'managed_people', id, null, null);
}

export async function findOrCreatePerson(
  fullName: string,
  relationship: RelationshipType = 'other',
  options?: { spaceId?: string; notes?: string }
): Promise<{ person: ManagedPerson; created: boolean }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const trimmed = fullName.trim();

  // 1. Search by exact full_name (case-insensitive)
  const { data: exactMatch } = await supabase
    .from('managed_people')
    .select('*')
    .eq('owner_id', user.id)
    .ilike('full_name', trimmed)
    .eq('is_archived', false)
    .limit(1);

  if (exactMatch && exactMatch.length > 0) {
    return { person: exactMatch[0] as ManagedPerson, created: false };
  }

  // 2. Search aliases (case-insensitive)
  const { data: aliasMatch } = await supabase
    .from('person_aliases')
    .select('person_id, managed_people(*)')
    .ilike('alias', trimmed)
    .limit(1);

  if (aliasMatch && aliasMatch.length > 0) {
    const mp = (aliasMatch[0] as any).managed_people;
    if (mp && !mp.is_archived) {
      return { person: mp as ManagedPerson, created: false };
    }
  }

  // 3. Fuzzy search — partial name match
  const { data: fuzzyMatch } = await supabase
    .from('managed_people')
    .select('*')
    .eq('owner_id', user.id)
    .ilike('full_name', `%${trimmed}%`)
    .eq('is_archived', false)
    .limit(3);

  if (fuzzyMatch && fuzzyMatch.length === 1) {
    // Only auto-match if exactly one fuzzy result
    return { person: fuzzyMatch[0] as ManagedPerson, created: false };
  }

  // 4. Create new person
  const newPerson = await createManagedPerson({
    full_name: trimmed,
    relationship,
    space_id: options?.spaceId || null,
    notes: options?.notes || null,
  });

  return { person: newPerson, created: true };
}

export async function searchPeople(query: string): Promise<ManagedPerson[]> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  // Search by name
  const { data: byName } = await supabase
    .from('managed_people')
    .select('*')
    .eq('owner_id', user.id)
    .ilike('full_name', `%${trimmed}%`)
    .eq('is_archived', false)
    .limit(10);

  // Search by alias
  const { data: byAlias } = await supabase
    .from('person_aliases')
    .select('person_id, managed_people(*)')
    .ilike('alias', `%${trimmed}%`)
    .limit(5);

  const aliasMatches = (byAlias || [])
    .map((a: any) => a.managed_people)
    .filter((p: any) => p && !p.is_archived);

  // Merge and deduplicate
  const all = [...(byName || []), ...aliasMatches] as ManagedPerson[];
  const seen = new Set<string>();
  return all.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

export async function addPersonAlias(personId: string, alias: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('person_aliases')
    .insert({ person_id: personId, alias: alias.trim() });
  if (error) throw error;
}

export async function recordMoneyReceived(
  personId: string,
  amount: number,
  currency: string,
  description: string,
  entryDate?: string
): Promise<PersonLedgerEntry> {
  // Money received from a managed person is recorded as held balance,
  // NOT as personal income. This keeps personal finances unaffected.
  return addLedgerEntry({
    person_id: personId,
    entry_type: 'money_received',
    amount,
    currency,
    description,
    entry_date: entryDate || new Date().toISOString().slice(0, 10),
  });
}

// ─── Person Ledger ────────────────────────────────────────────────────────────

export async function getPersonLedger(personId: string): Promise<PersonLedgerEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('person_ledger_entries')
    .select('*')
    .eq('person_id', personId)
    .eq('is_deleted', false)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as PersonLedgerEntry[];
}

export async function addLedgerEntry(payload: {
  person_id: string;
  entry_type: PersonTransactionType;
  amount: number;
  currency?: string;
  description: string;
  transaction_id?: string | null;
  notes?: string;
  entry_date?: string;
}): Promise<PersonLedgerEntry> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const currency = await resolveFallbackCurrency(payload.currency);

  const { data, error } = await supabase
    .from('person_ledger_entries')
    .insert({
      ...payload,
      owner_id: user.id,
      created_by: user.id,
      currency,
      entry_date: payload.entry_date || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity(user.id, 'ledger_entry_added', 'person_ledger_entries', data.id, null, {
    person_id: payload.person_id,
    entry_type: payload.entry_type,
    amount: payload.amount,
  });

  return data as PersonLedgerEntry;
}

// ─── Reimbursements ───────────────────────────────────────────────────────────

export async function getReimbursements(filters?: {
  personId?: string;
  status?: ReimbursementStatus;
}): Promise<Reimbursement[]> {
  const supabase = createClient();
  let query = supabase
    .from('reimbursements')
    .select(`*, person:managed_people(full_name, relationship)`)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (filters?.personId) query = query.eq('person_id', filters.personId);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Reimbursement[];
}

export async function createReimbursement(payload: {
  person_id: string;
  transaction_id?: string | null;
  ledger_entry_id?: string | null;
  amount: number;
  currency?: string;
  owed_by: string;
  owed_to: string;
  description: string;
  notes?: string;
  due_date?: string | null;
}): Promise<Reimbursement> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const currency = await resolveFallbackCurrency(payload.currency);

  const { data, error } = await supabase
    .from('reimbursements')
    .insert({ ...payload, owner_id: user.id, created_by: user.id, currency })
    .select()
    .single();
  if (error) throw error;

  await logActivity(user.id, 'reimbursement_created', 'reimbursements', data.id, null, {
    person_id: payload.person_id,
    amount: payload.amount,
    owed_by: payload.owed_by,
  });

  return data as Reimbursement;
}

export async function recordReimbursementPayment(
  reimbursementId: string,
  amount: number,
  paymentMethod = 'cash',
  notes?: string
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get current reimbursement
  const { data: reimb, error: fetchErr } = await supabase
    .from('reimbursements')
    .select('*')
    .eq('id', reimbursementId)
    .single();
  if (fetchErr) throw fetchErr;

  // Record payment
  const { error: payErr } = await supabase
    .from('reimbursement_payments')
    .insert({
      reimbursement_id: reimbursementId,
      owner_id: user.id,
      created_by: user.id,
      amount,
      currency: reimb.currency,
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: paymentMethod,
      notes: notes || null,
    });
  if (payErr) throw payErr;

  // Update amount_paid and status
  const newAmountPaid = Number(reimb.amount_paid) + amount;
  const remaining = Number(reimb.amount) - newAmountPaid;
  const newStatus: ReimbursementStatus =
    remaining <= 0 ? 'settled' : newAmountPaid > 0 ? 'partially_paid' : 'pending';

  const { error: updateErr } = await supabase
    .from('reimbursements')
    .update({ amount_paid: newAmountPaid, status: newStatus })
    .eq('id', reimbursementId);
  if (updateErr) throw updateErr;

  await logActivity(user.id, 'reimbursement_payment_recorded', 'reimbursements', reimbursementId, null, {
    amount,
    new_status: newStatus,
  });
}

export async function updateReimbursementStatus(id: string, status: ReimbursementStatus): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('reimbursements')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

// ─── Settlements ──────────────────────────────────────────────────────────────

export async function getSettlements(personId?: string): Promise<Settlement[]> {
  const supabase = createClient();
  let query = supabase
    .from('settlements')
    .select(`
      *,
      person:managed_people(full_name, relationship),
      receiving_account:financial_accounts(name)
    `)
    .eq('is_deleted', false)
    .order('settlement_date', { ascending: false });

  if (personId) query = query.eq('person_id', personId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Settlement[];
}

export async function createSettlement(payload: {
  person_id: string;
  amount: number;
  currency?: string;
  settlement_date: string;
  payment_method?: string;
  receiving_account_id?: string | null;
  description: string;
  notes?: string;
  reimbursement_ids?: string[];
}): Promise<Settlement> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const currency = await resolveFallbackCurrency(payload.currency);

  const { data, error } = await supabase
    .from('settlements')
    .insert({
      person_id: payload.person_id,
      owner_id: user.id,
      created_by: user.id,
      amount: payload.amount,
      currency,
      settlement_date: payload.settlement_date,
      payment_method: payload.payment_method || 'cash',
      receiving_account_id: payload.receiving_account_id || null,
      description: payload.description,
      notes: payload.notes || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Create allocations if reimbursement IDs provided
  if (payload.reimbursement_ids && payload.reimbursement_ids.length > 0) {
    const allocations = payload.reimbursement_ids.map((rid) => ({
      settlement_id: data.id,
      reimbursement_id: rid,
      amount: payload.amount / payload.reimbursement_ids!.length,
    }));
    await supabase.from('settlement_allocations').insert(allocations);

    // Mark linked reimbursements as settled
    for (const rid of payload.reimbursement_ids) {
      await updateReimbursementStatus(rid, 'settled');
    }
  }

  // Add ledger entry
  await addLedgerEntry({
    person_id: payload.person_id,
    entry_type: 'settlement',
    amount: payload.amount,
    currency,
    description: payload.description || 'Settlement',
    entry_date: payload.settlement_date,
  });

  await logActivity(user.id, 'settlement_created', 'settlements', data.id, null, {
    person_id: payload.person_id,
    amount: payload.amount,
  });

  return data as Settlement;
}

// ─── Spaces ───────────────────────────────────────────────────────────────────

export async function getSpaces(): Promise<Space[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('spaces')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Space[];
}

export async function createSpace(payload: Partial<Space>): Promise<Space> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('spaces')
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;

  // Add owner as member
  await supabase.from('space_members').insert({
    space_id: data.id,
    user_id: user.id,
    role: 'owner',
  });

  return data as Space;
}

export async function inviteToSpace(spaceId: string, email: string, role: SpaceRole): Promise<SpaceInvitation> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('space_invitations')
    .insert({
      space_id: spaceId,
      invited_by: user.id,
      email,
      role,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity(user.id, 'member_invited', 'space_invitations', data.id, null, { email, role });
  return data as SpaceInvitation;
}

export async function getSpaceInvitations(spaceId: string): Promise<SpaceInvitation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('space_invitations')
    .select('*')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SpaceInvitation[];
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('space_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);
  if (error) throw error;
}

// ─── Activity Logging ─────────────────────────────────────────────────────────

export async function logActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
): Promise<void> {
  const supabase = createClient();
  try {
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      previous_value: previousValue,
      new_value: newValue,
    });
  } catch {
    // Non-critical — don't throw
  }
}

function shouldRetryWithoutPhoneNormalizationColumns(error: { message?: string; details?: string | null }) {
  const details = `${error.message || ''} ${error.details || ''}`.toLowerCase();
  return (
    details.includes('phone_e164') ||
    details.includes('phone_country_code') ||
    details.includes('phone_display')
  );
}

// ─── Person Reports ───────────────────────────────────────────────────────────

export async function getPersonReport(personId: string, dateFrom?: string, dateTo?: string) {
  const supabase = createClient();

  let ledgerQuery = supabase
    .from('person_ledger_entries')
    .select('*')
    .eq('person_id', personId)
    .eq('is_deleted', false)
    .order('entry_date', { ascending: false });

  if (dateFrom) ledgerQuery = ledgerQuery.gte('entry_date', dateFrom);
  if (dateTo) ledgerQuery = ledgerQuery.lte('entry_date', dateTo);

  const results = await Promise.all([
    ledgerQuery,
    supabase.from('reimbursements').select('*').eq('person_id', personId).eq('is_deleted', false),
    supabase.from('settlements').select('*').eq('person_id', personId).eq('is_deleted', false),
    supabase.from('person_balances').select('*').eq('person_id', personId).single(),
  ]);

  const ledgerData = results[0].data;
  const reimbursementsData = results[1].data;
  const settlementsData = results[2].data;
  const balanceData = results[3].data;

  return {
    ledger: (ledgerData || []) as PersonLedgerEntry[],
    reimbursements: (reimbursementsData || []) as Reimbursement[],
    settlements: (settlementsData || []) as Settlement[],
    balance: balanceData as PersonBalance | null,
  };
}

// ─── Dashboard Summary ────────────────────────────────────────────────────────

export async function getPeopleDashboardSummary() {
  const supabase = createClient();
  const {
    data: platformSettings,
  } = await supabase
    .from('platform_settings')
    .select('default_currency')
    .maybeSingle();
  const defaultCurrency = normalizeCurrencyCode(platformSettings?.default_currency) || 'USD';

  const { data: balances } = await supabase
    .from('person_balances')
    .select('*');

  const allBalances = (balances || []) as PersonBalance[];

  const groupByCurrency = (
    getAmount: (balance: PersonBalance) => number
  ) => {
    const grouped = new Map<string, number>();
    for (const balance of allBalances) {
      const amount = Math.max(0, getAmount(balance));
      if (!amount) continue;
      const currency = normalizeCurrencyCode(balance.preferred_currency) || defaultCurrency;
      grouped.set(currency, (grouped.get(currency) || 0) + amount);
    }
    return Array.from(grouped.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((left, right) => left.currency.localeCompare(right.currency, 'en', { sensitivity: 'base' }));
  };

  const { data: pendingReimb } = await supabase
    .from('reimbursements')
    .select('amount, amount_paid, currency')
    .in('status', ['pending', 'partially_paid'])
    .eq('is_deleted', false);

  const pendingReimbGrouped = new Map<string, number>();
  for (const reimbursement of ((pendingReimb || []) as Array<{ amount: number | string; amount_paid: number | string; currency: string | null }>)) {
    const amount = Number(reimbursement.amount) - Number(reimbursement.amount_paid);
    if (amount <= 0) continue;
    const currency = normalizeCurrencyCode(reimbursement.currency) || defaultCurrency;
    pendingReimbGrouped.set(currency, (pendingReimbGrouped.get(currency) || 0) + amount);
  }

  return {
    totalHeldByCurrency: groupByCurrency((balance) => Number(balance.money_held || 0)),
    totalOwedToUserByCurrency: groupByCurrency((balance) => Number(balance.person_owes_user || 0)),
    totalOwedByUserByCurrency: groupByCurrency((balance) => Number(balance.user_owes_person || 0)),
    pendingReimbByCurrency: Array.from(pendingReimbGrouped.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((left, right) => left.currency.localeCompare(right.currency, 'en', { sensitivity: 'base' })),
    peopleCount: allBalances.length,
  };
}
