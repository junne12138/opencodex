import { providerRelativeSendPathConfigError } from "../config/provider-relative-send-path";
import { contextTierRecordConfigError, modelCapabilitiesConfigError } from "../config/provider-validation";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { initialModelSelection } from "../providers/initial-model-selection";
import { extractAccountId } from "../oauth/chatgpt";
import { formatErrorResponse } from "../bridge";
import {
  codexAutoStartEnabled,
  modelPreferHostedToolsConfigError,
  providerModelCostsConfigError,
  providerWebSearchBridgeConfigError,
  requestPacingConfigError,
  retryOn429PolicyConfigError,
  retryOnResetPolicyConfigError,
  sanitizeModelCostsForDisplay,
} from "../config";
import {
  apiKeyTransportConfigError,
  projectContextConfigError,
  autoReviewModelOverridesConfigError,
  autoReviewModelTargetConfigError,
  booleanRecordConfigError,
  providerReasoningPinsConfigError,
  modelAdapterRecordConfigError,
  nonBlankStringArrayConfigError,
  positiveIntegerConfigError,
  positiveIntegerRecordConfigError,
  providerBaseUrlConfigError,
  providerHeadersConfigError,
  const quotaQueryError = providerQuotaQueryConfigError(raw.quotaQuery, typed.baseUrl);
  if (quotaQueryError) return `provider ${JSON.stringify(redactSecretString(name))} ${quotaQueryError}`;
