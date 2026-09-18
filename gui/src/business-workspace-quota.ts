import type { AccountQuota } from "./codex-quota-utils";

export const BUSINESS_MONTHLY_CREDITS_LABEL = "Business monthly credits";

export function businessCreditWindow(quota: AccountQuota | null) {
  return quota?.customWindows?.find(window => window.label === BUSINESS_MONTHLY_CREDITS_LABEL);
}
