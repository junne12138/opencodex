/** Optional Business-workspace quota support kept behind a narrow integration seam. */

export const BUSINESS_MONTHLY_CREDITS_LABEL = "Business monthly credits";

const BUSINESS_USAGE_URL = "https://chatgpt.com/backend-api/codex/usage";
const DEFAULT_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export interface BusinessCreditWindow {
  label: typeof BUSINESS_MONTHLY_CREDITS_LABEL;
  percent: number;
  resetAt?: number;
  limit: number;
  used: number;
  remaining: number;
  unit?: string;
}

type QuotaWithCustomWindows = {
  customWindows?: Array<{ label: string; percent: number }>;
};

function finiteNumber(value: unknown): number | undefined {
  const numeric = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : undefined;
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  return numeric !== undefined && numeric >= 0 ? numeric : undefined;
}

function usagePercent(value: unknown): number | undefined {
  const numeric = finiteNumber(value);
  return numeric === undefined ? undefined : Math.max(0, Math.min(100, numeric));
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function codexQuotaUsageUrl(configuredPlan: string | undefined): string {
  return configuredPlan?.trim().toLowerCase().includes("business")
    ? BUSINESS_USAGE_URL
    : DEFAULT_USAGE_URL;
}

export function parseBusinessCreditWindow(
  spendControl: unknown,
): BusinessCreditWindow | null {
  const limit = record(record(spendControl)?.individual_limit);
  const limitValue = nonNegativeNumber(limit?.limit);
  const used = nonNegativeNumber(limit?.used);
  const remaining = nonNegativeNumber(limit?.remaining);
  const percent = usagePercent(limit?.used_percent)
    ?? (limitValue !== undefined && limitValue > 0 && used !== undefined
      ? usagePercent(used / limitValue * 100)
      : undefined);
  const resetAt = nonNegativeNumber(limit?.reset_at);
  if (limitValue === undefined || used === undefined || remaining === undefined || percent === undefined) return null;

  return {
    label: BUSINESS_MONTHLY_CREDITS_LABEL,
    percent,
    ...(resetAt !== undefined ? { resetAt } : {}),
    limit: limitValue,
    used,
    remaining,
    ...(typeof limit?.unit === "string" && limit.unit.trim() ? { unit: limit.unit.trim() } : {}),
  };
}

export function businessCreditUsagePercent(quota: QuotaWithCustomWindows | null): number | undefined {
  return quota?.customWindows?.find(window => window.label === BUSINESS_MONTHLY_CREDITS_LABEL)?.percent;
}
