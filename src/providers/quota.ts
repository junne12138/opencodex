import { listCodexAuthAccountsSnapshot } from "../codex/auth-api";
import { isAnthropicInstanceId, configuredAnthropicInstance } from "./anthropic-instance";
import { fetchAnthropicAccountQuota } from "./quota/anthropic-account-quota";
import { resolveEnvValue } from "../config";
import { getAccountCredential, getAccountSet } from "../oauth/store";
import { apiKeyPoolEntryId } from "./api-keys";
import { captureConfigGeneration, sweepExpiredOnWrite } from "../lib/state-store-sweeper";
import { ACCOUNT_QUOTA_TTL_MS, CACHE_TTL_MS } from "./quota-wire";
import { replaceCachedProviderQuotas } from "./quota-routing-cache";
import {
  commitKiroAccountUsageState,
  fetchKiroUsageSnapshot,
  type KiroUsageSnapshot,
  kiroUsageContextForAccount,
} from "./kiro-usage";
import { mapQuotaRoster, readProviderApiKeyQuotas, type ProviderApiKeyQuota } from "./quota-key-accounts";
import type { OcxConfig, OcxProviderConfig } from "../types";
import type { ProviderQuota, QuotaFailureCode } from "./quota-types";
import {
  accountReportCurrent,
  AUTHORITATIVE_EMPTY_QUOTA,
  bumpProviderQuotaInvalidationEpoch,
  captureProviderReportEpochs, providerReportEpochChanged,
  cacheKeyWithAggregationState,
  getProviderQuotaReportCache,
  hasCodexPoolProvider,
  inflight,
  invalidationEpoch,
  isBuiltInChatGptForwardProvider,
  isProviderQuotaReportCurrent,
  LAST_GOOD_MAX_AGE_MS,
  providerQuotaBeforePublishForTests,
  routingEvidence,
  setProviderQuotaReportCache,
  TERMINAL_QUOTA_FAILURE,
  type CodexAuthAccountsSnapshotPromise,
  type ProviderQuotaProbeResult,
  type ProviderQuotaReport,
  type ProviderQuotaResponse,
} from "./quota/report-cache";
import {
  accountCacheKey,
  accountQuotaCache,
  accountQuotaInflight,
  explicitAccountEpoch,
  explicitAccountReader,
  explicitQuotaConfig,
  explicitQuotaDestination,
  explicitQuotaIdentity,
  accountQuotaProbeSkip, getTokenForAccountQuotaProbe,
  hasPassiveAccountQuota,
  hydrateAccountQuotaCache,
  mayCommitAccountQuotaKey,
  mayCommitProviderQuotaKey,
  normalizeAnthropicQuota,
  supportsPerAccountQuota,
  type AccountQuotaCacheEntry,
  type ProviderAccountQuota,
} from "./quota/account-cache";
import {
  fetchAnthropicQuota,
  fetchChatGptForwardQuota,
  fetchCursorQuota,
  fetchKiroQuota,
  fetchMuseKeyQuota,
  fetchPassiveProviderQuota,
  fetchXaiQuota,
} from "./quota/vendor-probes-oauth";
import { fetchCommandCodeQuota, fetchKimiQuota, keyQuotaReaderForProvider } from "./quota/vendor-probes-key";
import { antigravityQuotaDiagnosticIdentity, fetchAntigravityQuota, probeAntigravityUsageQuota } from "./quota/antigravity";
import { customQuotaProviderExtension } from "./quota/custom-quota-extension";

