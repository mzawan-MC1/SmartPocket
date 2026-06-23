import type { PublicSubscriptionPlan, SupportedBillingInterval } from '@/lib/subscription/types';

export function normalizeWholeMoneyAmount(value: number | string | null | undefined) {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
  return Math.max(0, Math.round(Number.isFinite(numericValue) ? numericValue : 0));
}

export function normalizeDiscountPercent(value: number | string | null | undefined) {
  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
  const roundedValue = Math.round(Number.isFinite(numericValue) ? numericValue : 0);
  return Math.min(100, Math.max(0, roundedValue));
}

export function calculateYearlyBilledPrice(monthlyPrice: number | string | null | undefined, yearlyDiscountPercent: number | string | null | undefined) {
  const normalizedMonthlyPrice = normalizeWholeMoneyAmount(monthlyPrice);
  const normalizedDiscount = normalizeDiscountPercent(yearlyDiscountPercent);
  return Math.round(normalizedMonthlyPrice * 12 * (1 - normalizedDiscount / 100));
}

export function calculateYearlySavingAmount(monthlyPrice: number | string | null | undefined, yearlyDiscountPercent: number | string | null | undefined) {
  const normalizedMonthlyPrice = normalizeWholeMoneyAmount(monthlyPrice);
  return (normalizedMonthlyPrice * 12) - calculateYearlyBilledPrice(normalizedMonthlyPrice, yearlyDiscountPercent);
}

export function calculateEquivalentMonthlyCost(yearlyPrice: number | string | null | undefined) {
  return Math.round(normalizeWholeMoneyAmount(yearlyPrice) / 12);
}

export function isSelectablePaidInterval(interval: SupportedBillingInterval) {
  return interval === 'monthly' || interval === 'yearly';
}

export function getPlanFamilyKey(plan: Pick<PublicSubscriptionPlan, 'planCode'>) {
  return plan.planCode;
}

export function buildPlanPricingDetails(input: {
  billingInterval: SupportedBillingInterval;
  priceAmount: number | string | null | undefined;
  monthlyBasePriceAmount?: number | string | null | undefined;
  yearlyDiscountPercent?: number | string | null | undefined;
}) {
  const billedPriceAmount = normalizeWholeMoneyAmount(input.priceAmount);
  const monthlyBasePriceAmount = normalizeWholeMoneyAmount(
    input.monthlyBasePriceAmount ?? (input.billingInterval === 'monthly' ? billedPriceAmount : 0)
  );
  const yearlyDiscountPercent = normalizeDiscountPercent(input.yearlyDiscountPercent);
  const equivalentMonthlyPriceAmount = input.billingInterval === 'yearly'
    ? calculateEquivalentMonthlyCost(billedPriceAmount)
    : monthlyBasePriceAmount;
  const yearlySavingAmount = input.billingInterval === 'yearly'
    ? calculateYearlySavingAmount(monthlyBasePriceAmount, yearlyDiscountPercent)
    : 0;

  return {
    billedPriceAmount,
    monthlyBasePriceAmount,
    yearlyDiscountPercent,
    equivalentMonthlyPriceAmount,
    yearlySavingAmount,
  };
}

export function groupPlansByFamily(plans: PublicSubscriptionPlan[]) {
  return plans.reduce<Record<string, PublicSubscriptionPlan[]>>((accumulator, plan) => {
    const key = getPlanFamilyKey(plan);
    accumulator[key] = accumulator[key] || [];
    accumulator[key].push(plan);
    return accumulator;
  }, {});
}

export function getPlanForInterval(
  familyPlans: PublicSubscriptionPlan[],
  interval: SupportedBillingInterval
) {
  return familyPlans.find((plan) => plan.billingInterval === interval) || null;
}
