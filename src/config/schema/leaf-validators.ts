import * as z from "zod/v4";
import { anthropicAccountPoolSchema } from "./anthropic-account-pool";
import { join } from "node:path";
import { isValidProviderName } from "../provider-name";
import {
  modelPinnedEffortsConfigError,
  pinnedReasoningEffortConfigError,
  modelDisplayNamesConfigError,
  autoReviewModelOverridesConfigError,
  autoReviewModelTargetConfigError,
  normalizeNonBlankStringArray,
  normalizeAutoReviewModelOverrides,
  modelCapabilitiesConfigError,
  contextTierRecordConfigError,
  mergeModelCapabilities,
} from "../provider-validation";
import { isValidCodexAccountNamespaceTarget } from "../../codex/account-namespace-match";
import { isCodexAccountPriorityKey } from "../../codex/account-priority";
import { isCodexAccountAutoSwitchThresholdKey, parseCodexAutoSwitchThreshold } from "../../codex/account-auto-switch";
import { parseAccountPriority } from "../../codex/pool-rotation";
import { credentialGroupIssues } from "../../routing/identity-domains";
import { providerDestinationConfigError } from "../../lib/destination-policy";
import { providerEgressConfigError } from "../../lib/provider-egress";
import { redactSecretString } from "../../lib/redact";
import {
  MODEL_ADAPTER_OVERRIDE_ALLOWED,
  pinnedWireAdapter,
  PROVIDER_WEB_SEARCH_BRIDGE_BACKENDS,
  UPSTREAM_HTTP_VERSION_VALUES,
  type OcxProviderConfig,
  type FastWire,
  type ProviderCostOverlay,
  type ProviderQuotaQueryConfig,
} from "../../types";
import { fastWireDeclarationError } from "../../providers/fastwire";
import { getProviderRegistryEntry, providerMatchesRegistryTransport, providerModelWireDefault } from "../../providers/registry";
import { resolveOpenAiVirtualModel } from "../../providers/openai-virtual-models";
import { COST4_RATE_KEYS, isValidCost4Rate } from "../../usage/user-cost-overlays";
import { MAX_COST4_RATE } from "../../usage/expected-prices";
import {
  DECLARABLE_HOSTED_TOOL_TYPES,
  declaredUnsupportedHostedTools,
  isHostedToolUnsupportedForModel,
} from "../../responses/hosted-tool-policy";
import { getConfigDir } from "../paths";
import { COMPACTION_TRIGGERS, validCompactionSourceModels } from "./compaction-triggers";

// The chatgptDesktop leaf lives in its own zod-only module so the `ocx chatgpt` command can explain
// a dropped block without loading this file's provider and account validators.
export { chatgptDesktopConfigIssue, chatgptDesktopSchema } from "./chatgpt-desktop";

/** One definition of "usable secret", shared by the schema and the warnings. */
export function isUsableApiKeySecret(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

export const compactionRoutingSchema = z.object({
  model: z.string().trim().min(1),
  sourceModels: z.array(z.string()).refine(validCompactionSourceModels,
    "sourceModels requires unique exact selectors or provider/* patterns").optional(),
  reasoningEffort: z.string().refine(value => pinnedReasoningEffortConfigError(value) === null).optional(),
  triggers: z.array(z.enum(COMPACTION_TRIGGERS)).nonempty()
    .refine(values => new Set(values).size === values.length, "triggers must not repeat a value")
    .optional(),
}).strict();

/**
 * One phase of Codex's memory pipeline. A present phase must name a model: the GUI's "Off"
 * removes the phase instead of blanking it, so an empty entry would only ever come from a
 * hand-edited file, where failing the write is the honest answer.
 */
export const memoryModelSettingSchema = z.object({
  model: z.string().trim().min(1),
  reasoningEffort: z.string().refine(value => pinnedReasoningEffortConfigError(value) === null).optional(),
}).strict();

export const memoryModelsSchema = z.object({
  extract: memoryModelSettingSchema.optional(),
  consolidation: memoryModelSettingSchema.optional(),
}).strict();

/**
 * Bounds for the opt-in same-target 429 wait-and-retry policy. Single source of truth
 * shared by the config schema, the load-time sanitizer, and the management write
 * boundary. Strict, so an unknown key is rejected at every validation boundary instead
 * of being silently ignored (the load-time sanitizer still degrades unknown keys with a
 * warning before schema validation, so hand-edited configs keep loading).
 */
export const retryOn429PolicySchema = z.object({
  enabled: z.boolean().optional(),
  attempts: z.number().int().min(1).max(20).optional(),
  intervalMs: z.number().int().min(100).max(600_000).optional(),
  // The effective cap for a single wait is MAX_COOLDOWN_MS (10 min) in key-failover.ts;
  // larger configured values would be dead config.
  maxIntervalMs: z.number().int().min(100).max(600_000).optional(),
  respectRetryAfter: z.boolean().optional(),
}).strict();

/**
 * `transientRetryOn5xx` accepts only these keys. `attempts` is a TOTAL send budget shared by
 * both retry layers, so the ceiling is deliberately lower than `retryOn429`'s: 10 total sends
 * against an already-failing provider is already generous.
 */
export const transientRetryOn5xxPolicySchema = z.object({
  enabled: z.boolean().optional(),
  attempts: z.number().int().min(1).max(10).optional(),
}).strict();

/**
 * `retryOnReset` accepts only these keys. `replacements` counts DUPLICATE inferences the
 * operator is willing to risk for one logical request, so the ceiling is two rather than a
 * send budget: this is the one send the proxy otherwise refuses outright, and a third of them
 * says the connection, not the retry policy, is the problem.
 */
export const retryOnResetPolicySchema = z.object({
  enabled: z.boolean().optional(),
  replacements: z.number().int().min(1).max(2).optional(),
}).strict();

const requestPacingRuleSchema = z.object({
  // Keep the RPM-derived timer within the same one-hour bound as minIntervalMs.
  requestsPerMinute: z.number().min(1 / 60).max(60_000).optional(),
  minIntervalMs: z.number().int().min(1).max(3_600_000).optional(),
  maxConcurrentRequests: z.number().int().min(1).optional(),
}).strict().refine(value => value.requestsPerMinute !== undefined
  || value.minIntervalMs !== undefined
  || value.maxConcurrentRequests !== undefined, {
  message: "request pacing rules need requestsPerMinute, minIntervalMs, or maxConcurrentRequests",
});

const requestPacingSchema = z.object({
  enabled: z.boolean(),
  requestsPerMinute: z.number().min(1 / 60).max(60_000).optional(),
  minIntervalMs: z.number().int().min(1).max(3_600_000).optional(),
  maxConcurrentRequests: z.number().int().min(1).optional(),
  models: z.record(z.string().trim().min(1), requestPacingRuleSchema).optional(),
}).strict().refine(value => value.enabled === false
  || value.requestsPerMinute !== undefined
  || value.minIntervalMs !== undefined
  || value.maxConcurrentRequests !== undefined
  || (value.models !== undefined && Object.keys(value.models).length > 0), {
  message: "enabled request pacing needs a provider rule or model override",
});

export function requestPacingConfigError(value: unknown): string | null {
  if (value === undefined) return null;
  const parsed = requestPacingSchema.safeParse(value);
  if (parsed.success) return null;
  return "requestPacing must contain enabled and a valid requestsPerMinute/minIntervalMs/maxConcurrentRequests provider rule or model overrides";
}

/**
 * Bounds for the opt-in passthrough web-search bridge (`providers.<name>.webSearchBridge`,
 * #3761). Strict for the same reason `retryOn429` is: a misspelled key here would silently
 * leave the bridge disarmed while the operator believes they enabled it.
 *
 * `endpoint` names the destination that receives this provider's API key, so it gets the same
 * literal destination assessment `baseUrl` gets (#4519) — see `providerWebSearchBridgeConfigError`
 * below. This schema itself still only shape-checks: it is `.catch(undefined)` at the provider
 * row, and a hand-edited config file never reaches the error function at all. The authorization
 * boundary is therefore `resolveOllamaWebSearchEndpoint`, which runs the same assessment and is
 * the only reader of this field in the tree; config validation is where an operator is told why,
 * not what makes the value safe.
 */
const providerWebSearchBridgeSchema = z.object({
  enabled: z.boolean().optional(),
  backend: z.enum(PROVIDER_WEB_SEARCH_BRIDGE_BACKENDS).optional(),
  maxSearches: z.number().int().min(1).max(10).optional(),
  timeoutMs: z.number().int().min(1_000).max(600_000).optional(),
  endpoint: z.string().min(1).optional(),
}).strict();

export function providerWebSearchBridgeConfigError(
  value: unknown,
  providerName: string,
  provider: Pick<OcxProviderConfig, "allowPrivateNetwork">,
): string | null {
  if (value === undefined) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "webSearchBridge must be a plain object";
  }
  const parsed = providerWebSearchBridgeSchema.safeParse(value);
  if (!parsed.success) {
    return "webSearchBridge accepts only enabled (boolean), backend "
      + `(${PROVIDER_WEB_SEARCH_BRIDGE_BACKENDS.join("|")}), maxSearches (1..10), `
      + "timeoutMs (1000..600000), and endpoint (absolute http(s) URL)";
  }
  const endpoint = parsed.data.endpoint;
  if (endpoint !== undefined) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      return "webSearchBridge.endpoint must be an absolute http(s) URL";
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "webSearchBridge.endpoint must be an absolute http(s) URL";
    }
    // Same classifier baseUrl uses, so a metadata address is refused outright and loopback or
    // private space needs the provider's allowPrivateNetwork opt-in (or a registry entry that is
    // local by definition, which is what keeps a self-hosted Ollama working). Literal-only and
    // synchronous, exactly as at the baseUrl boundary: no DNS is resolved here.
    const destinationError = providerDestinationConfigError(providerName, {
      baseUrl: endpoint,
      allowPrivateNetwork: provider.allowPrivateNetwork,
    });
    if (destinationError) {
      return destinationError.replace(/^baseUrl/, "webSearchBridge.endpoint");
    }
  }
  return null;
}

const fastWireSchema = z.object({
  kind: z.string(),
  canonicalToWire: z.record(z.string().trim(), z.string().trim()),
  foreignCallerTiers: z.string(),
  betas: z.array(z.string().trim()).optional(),
}).strict().superRefine((fastWire, ctx) => {
  const error = fastWireDeclarationError({ fastWire });
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(fastWire => fastWire as FastWire);

const modelDisplayNamesSchema = z.unknown().superRefine((value, ctx) => {
  const error = modelDisplayNamesConfigError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => {
  const labels = Object.create(null) as Record<string, string>;
  for (const [modelId, displayName] of Object.entries(value as Record<string, string>)) {
    labels[modelId] = displayName;
  }
  return labels;
});

const pinnedReasoningEffortSchema = z.unknown().superRefine((value, ctx) => {
  const error = pinnedReasoningEffortConfigError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => value as string);

export const modelPinnedEffortsSchema = z.unknown().superRefine((value, ctx) => {
  const error = modelPinnedEffortsConfigError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => Object.fromEntries(
  Object.entries(value as Record<string, string>).map(([key, effort]) => [key.trim(), effort]),
));

const autoReviewModelSchema = z.unknown().superRefine((value, ctx) => {
  const error = autoReviewModelTargetConfigError(value, "autoReviewModel", true);
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
});

const autoReviewModelOverridesSchema = z.unknown().superRefine((value, ctx) => {
  const error = autoReviewModelOverridesConfigError(value, "autoReviewModelOverrides", true);
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => normalizeAutoReviewModelOverrides(value));

const modelCapabilitiesSchema = z.unknown().superRefine((value, ctx) => {
  const error = modelCapabilitiesConfigError(value);
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => mergeModelCapabilities(undefined, value));

/**
 * Per-provider egress fields, validated by the resolver the transports themselves use.
 *
 * Calling `providerEgressConfigError` rather than restating the accepted forms keeps one
 * definition of a usable value: a proxy the config loader admits is one the transport can
 * carry, and a value rejected here is rejected at request time for the identical reason.
 * Each field is checked on its own because neither depends on the other's value to be
 * well-formed; how they combine is decided per request against the destination.
 */
const providerProxySchema = z.unknown().superRefine((value, ctx) => {
  const error = providerEgressConfigError({ proxy: value as string | null | undefined });
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => value as string | null | undefined);

const providerNoProxySchema = z.unknown().superRefine((value, ctx) => {
  const error = providerEgressConfigError({ noProxy: value as string | string[] | undefined });
  if (error) ctx.addIssue({ code: "custom", message: error });
}).transform(value => value as string | string[] | undefined);

/**
 * Zod schema for one provider entry: known fields are validated strictly while unknown
 * fields pass through (preserved for runtime extensions).
 */
export const providerConfigSchema = z.object({
  anthropicAccountPool: anthropicAccountPoolSchema,
  // Raw diagnostics/writes reject malformed provenance; tolerant loads preserve the custom row.
  anthropicOAuthInstance: z.literal("anthropic2").optional().catch(undefined),
  modelCapabilities: modelCapabilitiesSchema.optional(),
  modelContextTiers: z.unknown().superRefine((value, ctx) => {
    const error = contextTierRecordConfigError(value);
    if (error) ctx.addIssue({ code: "custom", message: error });
  }).optional().transform(value => value as OcxProviderConfig["modelContextTiers"]),
  pinnedReasoningEffort: pinnedReasoningEffortSchema.optional(),
  modelPinnedReasoningEfforts: modelPinnedEffortsSchema.optional(),
  // Validated rather than left to passthrough: an unrecognized strategy would otherwise
  // load silently and then be ignored at selection time, which reads as a broken feature
  // rather than a rejected setting.
  apiKeyPoolStrategy: z.enum(["round-robin", "fill-first", "quota"]).optional(),
  autoReviewModel: autoReviewModelSchema.optional(),
  autoReviewModelOverrides: autoReviewModelOverridesSchema.optional(),
  adapter: z.string().min(1),
  baseUrl: z.string().min(1),
  quotaQuery: z.custom<ProviderQuotaQueryConfig>(() => true).optional(),
