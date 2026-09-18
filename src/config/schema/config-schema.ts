import { MAIN_ACCOUNT_HARD_LOCK_MIN_PERCENT } from "../../codex/quota-types";
import * as z from "zod/v4";
import { anthropicAccountPoolSchema } from "./anthropic-account-pool";
import { compactionRecoverySchema } from "./compaction-recovery";
import { blockedModelRedirectsSchema } from "./blocked-model-redirects";
import {
  agentTaskRecoverySchema,
  catalogAutoRefreshSchema,
  clientConnectionSchema,
  CODEX_ACCOUNT_PIN_PATTERN,
  codexAccountPrioritiesSchema,
  salvageCodexAccountAutoSwitchThresholds,
  codexPoolSchema,
  codexQuotaAutoRefreshSchema,
  credentialGroupsSchema,
  hubConfigSchema,
  providerConfigSchema,
  quotaResetNotifySchema,
  remoteGuiConfigSchema,
  runtimeRoleSchema,
  spendSchema,
  chatgptDesktopSchema,
  skillsConfigSchema,
  configuredCodexPoolAccountIds,
  apiKeyEntrySchema,
  asideProfileSyncSchema,
  clientIntegrationsSchema,
  CODEX_ACCOUNT_NAMESPACE_ACCOUNT_ID_COLLISION_ERROR,
  codexAccountNamespacesSchema,
  modelPinnedEffortsSchema,
  compactionRoutingSchema,
  memoryModelSettingSchema,
  memoryModelsSchema,
  modelPreferHostedToolsConfigError,
  providerModelCostsConfigError,
  providerRelativeSendPathConfigError,
} from "./leaf-validators";
import { isValidProviderName, hasOwnProvider } from "../provider-name";
import {
  apiKeyTransportConfigError,
  booleanRecordConfigError,
  modelAdapterRecordConfigError,
  modelDisplayNamesConfigError,
  nonBlankStringArrayConfigError,
  positiveIntegerConfigError,
  positiveIntegerRecordConfigError,
  providerBaseUrlConfigError,
  providerHeadersConfigError,
    const quotaQueryError = providerQuotaQueryConfigError(
      (provider as { quotaQuery?: unknown }).quotaQuery,
      provider.baseUrl,
    );
    if (quotaQueryError) {
      ctx.addIssue({
        code: "custom",
        path: ["providers", redactSecretString(name), "quotaQuery"],
        message: quotaQueryError,
