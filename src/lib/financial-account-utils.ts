export type FinancialAccountOwnershipType = 'personal' | 'shared' | 'business' | 'other';
export type FinancialAccountSystemDefaultType = 'personal_cash' | 'personal_bank';
export type FinancialBankAccountType = 'current' | 'savings' | 'credit_card' | 'wallet' | 'other';
export type FinancialAccountScopeType = 'personal' | 'space';

export type SpaceAccountPermissionLike = {
  id?: string;
  space_id: string;
  can_view_space_transactions?: boolean | null;
  can_add_space_transactions?: boolean | null;
  can_view_balance?: boolean | null;
  can_view_full_history?: boolean | null;
  space?: {
    id?: string;
    name?: string | null;
    color?: string | null;
  } | null;
};

export type FinancialAccountCapabilities = {
  canView: boolean;
  canUseForTransaction: boolean;
  canViewBalance: boolean;
  canEdit: boolean;
  scope: FinancialAccountScopeType;
  spaceId: string | null;
  isSharedWithSpace: boolean;
};

export type FinancialAccountLike = {
  id: string;
  name: string;
  account_type: string;
  currency: string;
  is_active: boolean;
  include_in_total?: boolean | null;
  ownership_type?: string | null;
  is_system_default?: boolean | null;
  system_default_type?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
  user_id?: string | null;
  scope_type?: string | null;
  space_id?: string | null;
  current_balance?: number | null;
  shared_with_spaces?: SpaceAccountPermissionLike[] | null;
  space_account_permissions?: SpaceAccountPermissionLike[] | null;
};

const DEFAULT_PRIORITY: Record<string, number> = {
  personal_cash: 0,
  personal_bank: 1,
};

const ACCOUNT_TYPE_PRIORITY: Record<string, number> = {
  cash: 0,
  bank: 1,
  digital_wallet: 2,
  credit_card: 3,
  savings: 4,
  investment: 5,
  other: 6,
};

const OWNERSHIP_PRIORITY: Record<FinancialAccountOwnershipType, number> = {
  personal: 0,
  shared: 1,
  business: 2,
  other: 3,
};

export function getFinancialAccountOwnershipType(
  account: Pick<FinancialAccountLike, 'ownership_type' | 'include_in_total'>
): FinancialAccountOwnershipType {
  if (
    account.ownership_type === 'personal'
    || account.ownership_type === 'shared'
    || account.ownership_type === 'business'
    || account.ownership_type === 'other'
  ) {
    return account.ownership_type;
  }

  return 'personal';
}

export function isDefaultCashAccount(
  account: Pick<FinancialAccountLike, 'is_system_default' | 'system_default_type'>
) {
  return account.is_system_default === true && account.system_default_type === 'personal_cash';
}

export function isDefaultBankAccount(
  account: Pick<FinancialAccountLike, 'is_system_default' | 'system_default_type'>
) {
  return account.is_system_default === true && account.system_default_type === 'personal_bank';
}

export function isPersonalFinancialAccount(
  account: Pick<FinancialAccountLike, 'ownership_type' | 'include_in_total' | 'scope_type'>
) {
  if (getFinancialAccountScopeType(account) !== 'personal') {
    return false;
  }
  return getFinancialAccountOwnershipType(account) === 'personal';
}

export function getFinancialAccountScopeType(
  account: Pick<FinancialAccountLike, 'scope_type' | 'space_id'>
): FinancialAccountScopeType {
  if (account.scope_type === 'space' || (!!account.space_id && account.scope_type !== 'personal')) {
    return 'space';
  }
  return 'personal';
}

export function isSpaceFinancialAccount(
  account: Pick<FinancialAccountLike, 'scope_type' | 'space_id'>
) {
  return getFinancialAccountScopeType(account) === 'space';
}

export function getSpaceAccountPermissions<T extends FinancialAccountLike>(account: T): SpaceAccountPermissionLike[] {
  return [...(account.shared_with_spaces || []), ...(account.space_account_permissions || [])];
}

export function isSharedWithAnySpace<T extends FinancialAccountLike>(account: T) {
  return getSpaceAccountPermissions(account).length > 0;
}

export function isSharedWithSpace<T extends FinancialAccountLike>(account: T, spaceId: string) {
  return getSpaceAccountPermissions(account).some((permission) => permission.space_id === spaceId);
}

export function getAccountCapabilities<T extends FinancialAccountLike>(
  account: T,
  options?: {
    selectedSpaceId?: string | null;
  }
): FinancialAccountCapabilities {
  const scope = getFinancialAccountScopeType(account);
  const selectedSpaceId = options?.selectedSpaceId || null;
  const permissions = getSpaceAccountPermissions(account);
  const matchingPermission = selectedSpaceId
    ? permissions.find((permission) => permission.space_id === selectedSpaceId) || null
    : null;

  if (scope === 'space') {
    return {
      canView: true,
      canUseForTransaction: true,
      canViewBalance: true,
      canEdit: true,
      scope,
      spaceId: account.space_id || null,
      isSharedWithSpace: false,
    };
  }

  return {
    canView: true,
    canUseForTransaction: matchingPermission?.can_add_space_transactions === true,
    canViewBalance: matchingPermission
      ? matchingPermission.can_view_balance === true
      : true,
    canEdit: true,
    scope,
    spaceId: null,
    isSharedWithSpace: permissions.length > 0,
  };
}

export function getAccountsSharedWithSpaces<T extends FinancialAccountLike>(accounts: T[]) {
  return sortFinancialAccounts(
    accounts.filter((account) => account.is_active && getFinancialAccountScopeType(account) === 'personal' && isSharedWithAnySpace(account))
  );
}

export function getSpaceOwnedFinancialAccounts<T extends FinancialAccountLike>(accounts: T[], spaceId?: string | null) {
  return sortFinancialAccounts(
    accounts.filter((account) => {
      if (!account.is_active || getFinancialAccountScopeType(account) !== 'space') {
        return false;
      }
      if (!spaceId) return true;
      return account.space_id === spaceId;
    })
  );
}

export function getSpaceTransactionEligibleAccounts<T extends FinancialAccountLike>(accounts: T[], spaceId: string) {
  return sortFinancialAccounts(
    accounts.filter((account) => {
      const capabilities = getAccountCapabilities(account, { selectedSpaceId: spaceId });
      if (!account.is_active || !capabilities.canView) {
        return false;
      }
      if (capabilities.scope === 'space') {
        return capabilities.spaceId === spaceId;
      }
      return capabilities.canUseForTransaction;
    })
  );
}

export function getActivePersonalFinancialAccounts<T extends FinancialAccountLike>(accounts: T[]) {
  return sortFinancialAccounts(
    accounts.filter((account) => account.is_active && isPersonalFinancialAccount(account))
  );
}

export function getDefaultPersonalAccount<T extends FinancialAccountLike>(
  accounts: T[],
  defaultType: FinancialAccountSystemDefaultType
) {
  return (
    sortFinancialAccounts(
      accounts.filter(
        (account) => account.is_active && account.is_system_default === true && account.system_default_type === defaultType
      )
    )[0] || null
  );
}

export function getPreferredTransactionAccount<T extends FinancialAccountLike>(
  accounts: T[],
  transactionType: 'income' | 'expense'
) {
  const personalAccounts = getActivePersonalFinancialAccounts(accounts);
  if (personalAccounts.length === 0) return null;

  if (transactionType === 'expense') {
    return (
      getDefaultPersonalAccount(personalAccounts, 'personal_cash')
      || personalAccounts.find((account) => account.account_type === 'cash')
      || getDefaultPersonalAccount(personalAccounts, 'personal_bank')
      || personalAccounts[0]
      || null
    );
  }

  return (
    getDefaultPersonalAccount(personalAccounts, 'personal_bank')
    || personalAccounts.find((account) => account.account_type === 'bank')
    || getDefaultPersonalAccount(personalAccounts, 'personal_cash')
    || personalAccounts[0]
    || null
  );
}

export function getPreferredDocumentAccount<T extends FinancialAccountLike>(
  accounts: T[],
  transactionType: 'income' | 'expense',
  currency?: string | null
) {
  const personalAccounts = getActivePersonalFinancialAccounts(accounts);
  if (personalAccounts.length === 0) return null;

  const normalizedCurrency = (currency || '').trim().toUpperCase();
  const preferred = getPreferredTransactionAccount(personalAccounts, transactionType);

  if (normalizedCurrency) {
    if (preferred && preferred.currency === normalizedCurrency) {
      return preferred;
    }

    const matchingDefault = sortFinancialAccounts(
      personalAccounts.filter(
        (account) =>
          account.currency === normalizedCurrency
          && (
            (transactionType === 'expense' && isDefaultCashAccount(account))
            || (transactionType === 'income' && isDefaultBankAccount(account))
          )
      )
    )[0];
    if (matchingDefault) return matchingDefault;

    const matchingByType = sortFinancialAccounts(
      personalAccounts.filter(
        (account) =>
          account.currency === normalizedCurrency
          && (
            (transactionType === 'expense' && account.account_type === 'cash')
            || (transactionType === 'income' && account.account_type === 'bank')
          )
      )
    )[0];
    if (matchingByType) return matchingByType;

    const matchingCurrency = sortFinancialAccounts(
      personalAccounts.filter((account) => account.currency === normalizedCurrency)
    )[0];
    if (matchingCurrency) return matchingCurrency;
  }

  return preferred;
}

export function getFinancialAccountDisplayLabel(
  account: Pick<FinancialAccountLike, 'name' | 'currency' | 'is_system_default' | 'system_default_type'>,
  options?: {
    includeCurrency?: boolean;
    includeDefaultLabel?: boolean;
  }
) {
  const parts = [account.name];

  if (options?.includeDefaultLabel) {
    if (isDefaultCashAccount(account)) {
      parts.push('Default Cash');
    } else if (isDefaultBankAccount(account)) {
      parts.push('Default Bank');
    }
  }

  if (options?.includeCurrency) {
    parts.push(account.currency);
  }

  return parts.join(' · ');
}

export function sortFinancialAccounts<T extends FinancialAccountLike>(accounts: T[]) {
  return [...accounts].sort((left, right) => {
    const leftOwnership = getFinancialAccountOwnershipType(left);
    const rightOwnership = getFinancialAccountOwnershipType(right);
    const ownershipDelta = OWNERSHIP_PRIORITY[leftOwnership] - OWNERSHIP_PRIORITY[rightOwnership];
    if (ownershipDelta !== 0) return ownershipDelta;

    const leftActive = left.is_active ? 0 : 1;
    const rightActive = right.is_active ? 0 : 1;
    if (leftActive !== rightActive) return leftActive - rightActive;

    const leftDefault = left.is_system_default ? (DEFAULT_PRIORITY[left.system_default_type || ''] ?? 9) : 9;
    const rightDefault = right.is_system_default ? (DEFAULT_PRIORITY[right.system_default_type || ''] ?? 9) : 9;
    if (leftDefault !== rightDefault) return leftDefault - rightDefault;

    const leftType = ACCOUNT_TYPE_PRIORITY[left.account_type || 'other'] ?? 99;
    const rightType = ACCOUNT_TYPE_PRIORITY[right.account_type || 'other'] ?? 99;
    if (leftType !== rightType) return leftType - rightType;

    const leftSort = Number(left.sort_order ?? 0);
    const rightSort = Number(right.sort_order ?? 0);
    if (leftSort !== rightSort) return leftSort - rightSort;

    const leftCreated = left.created_at || '';
    const rightCreated = right.created_at || '';
    if (leftCreated !== rightCreated) return leftCreated.localeCompare(rightCreated);

    return left.name.localeCompare(right.name);
  });
}
