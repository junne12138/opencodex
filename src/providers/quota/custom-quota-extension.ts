import type { OcxProviderConfig } from "../../types";
import { customQuotaQueryEligible, fetchCustomProviderQuota } from "../custom-quota";
import { report, TERMINAL_QUOTA_FAILURE, type ProviderQuotaProbeResult } from "./report-cache";

/** Narrow optional seam between provider quota dispatch and configurable probes. */
export const customQuotaProviderExtension = {
  eligible(provider: OcxProviderConfig): boolean {
    return customQuotaQueryEligible(provider);
  },

  async probe(name: string, provider: OcxProviderConfig): Promise<ProviderQuotaProbeResult | undefined> {
    if ((provider.authMode ?? "key") !== "key" || !customQuotaQueryEligible(provider)) return undefined;
    const result = await fetchCustomProviderQuota(name, provider);
    if (result?.kind === "terminal") return TERMINAL_QUOTA_FAILURE;
    return result?.kind === "quota"
      ? report(name, "custom:quota-query", result.quota)
      : null;
  },
} as const;
