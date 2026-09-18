---
title: Provider Configuration
description: Provider entries, authentication, endpoints, model catalogs, quotas, context caps, and provider-specific options.
---

A provider tells opencodex where a model lives, which wire adapter it speaks, and how requests are
authenticated.

## Initial model selection

New non-OAuth connections wait for a reliable model list before exposing models. If that list contains at least 20 distinct Models-tab rows, all model switches start OFF; the provider itself stays ACTIVE. OAuth and ChatGPT-login connections keep their defaults, based on the effective authentication mode.

This runs only for a new provider registration. Existing selections survive updates, re-login and key replacement. After initialization, enable the models you need in Models or with the CLI below; the separate new-model-arrival policy is unchanged. Replace `<model-id>` with an ID from the list.

```sh
ocx models live --provider openrouter
ocx models enable '<model-id>'
ocx models disable '<model-id>'
ocx models provider openrouter on
```

After GUI registration or OAuth login, the confirmation dialog lets you open the Models page. CLI registration and login print model-management commands; JSON includes structured next steps. `--no-wait` reports pending login, not completion. Start the proxy with `ocx start` before using live model commands.

## Z.ai Coding Plan quota endpoints

The Z.ai quota probe recognizes the international coding Chat base
`https://api.z.ai/api/coding/paas/v4`, the documented
[Claude Code Anthropic base](https://docs.z.ai/devpack/tool/claude)
`https://api.z.ai/api/anthropic`, and the documented
[Codex Responses base](https://docs.z.ai/devpack/tool/codex)
`https://api.z.ai/api/v1`. All three read quota from the international monitor with
Bearer authentication; this does not change the inference URL or imply different
quota consumption between adapters. Existing BigModel CN monitor selection remains
separate. Full request URLs such as `/api/v1/responses` are not provider base URLs.

## Provider-related top-level fields

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `providers` | `Record<string, OcxProviderConfig>` | — | Map of provider name to provider config. |
| `openaiProviderTierVersion?` | `2` | set by migration | Marks the single option-aware OpenAI projection as complete. |
| `disabledModels?` | `string[]` | — | Models hidden from Codex's catalog and `/v1/models`, but not blocked from direct proxy calls. A routed id is removed from listings. An account-qualified native id hides only that selector row; a bare native GPT id hides the bare row and every account-selector row for that model. The dashboard Models page exposes only routed and bare native rows; use this configuration field directly to hide one selector-qualified row. |
| `providerContextCaps?` | `Record<string, number>` | `{}` | Active provider context limits. Ordinary windows are lowered; native models with a supported long window can expand only up to their own supported ceiling. |
| `providerContextCapValues?` | `Record<string, number>` | `{}` | Last selected provider limits, retained while disabled. These values do not activate a cap. An enabled value takes precedence over a remembered value. |
| `contextCapValue?` | `number` | `350000` | Default used on first enable. A later enable restores the selected provider value. Updating the global value with `setAll: true` changes enabled caps only; `setAll: true` without a value enables all configured providers at the current global value. |
| `codexAccounts?` | `CodexAccount[]` | `[]` | ChatGPT/Codex pool account metadata managed by Codex Auth. Secrets live separately in `codex-accounts.json`. |
| `pausedCodexAccountIds?` | `string[]` | `[]` | Accounts excluded from Pool selection until resumed, including the main `__main__` account when paused. Manual pause and resume also update existing main and pool entries for the same account and workspace. |
| `creditCodexAccountIds?` | `string[]` | `[]` | Accounts allowed to keep serving from ChatGPT credits after a usage limit, including the main `__main__` account. Upstream does not refuse an account that holds credits at 100%; it serves the request and draws the balance. Spending is opt-in: an account not listed here is skipped by selection while one of its usage windows (weekly or monthly, only monthly on 30-day plans, or the 5-hour window) reads 100% with its reset still ahead, and returns once that reset passes. A weekly or monthly reading without a reset time does not hold the account; a 5-hour reading at 100% without a reset holds it only while that reading is still fresh. When no other account is available, automatic selection finds none rather than spending credits. An unlisted `__main__` is also refused, like a hard-lock refusal, when a request names it or carries its credential. Listing `__main__` does not lift the main-account hard lock (on by default at 98%), which still stops the main login first; turn the lock off to let the main account spend credits (a lock at 100% still stops it at 100%). New accounts start unlisted. Managed by the **Use credits** switch in the Codex Auth header and the **Use credits after limit** switch in each account card's **⋯** menu. |
| `codexQuotaAutoRefresh?` | `Record<string, object>` | `{}` | Per-Codex-login-account opt-in for automatic `fiveHour` and `weekly` window activation in Pool mode; Direct mode does not run this worker. In Providers/Codex Auth **Advanced settings**, one control enables or disables both supported windows across all current main and added accounts. New accounts are not opted in automatically. Enable skips windows absent from live WHAM data; disable also clears stale enabled windows. The UI reuses granular `/api/settings` writes, reconciles partial failures, and retries the original ON/OFF intent without replacing unrelated settings or completed reset markers. The API still rejects enabling an unavailable window with HTTP 409. At a reported reset time, opencodex sends one minimal non-stored Codex message using that account's quota and persists the activated timestamp. This does not apply to API-key providers. |
| `codexAccountNamespaces?` | `Record<string, string>` | — | Optional map from an arbitrary public model selector to a stored Codex account target. When account-qualified picker rows are enabled, each selector whose target is present adds separate `<selector>/<native-openai-model>` rows to the Codex picker; each row uses only that account. With any selector active, bare native rows are hidden in the picker, but their ids remain routable and listed by raw `/v1/models` unless explicitly disabled. |
| `codexAccountPickerEnabled?` | `boolean` | off when the map is empty | Controls whether eligible `codexAccountNamespaces` mappings generate account-qualified Codex picker rows. `true` allows mapped rows to appear. If omitted with a non-empty map, it is treated as enabled for backward compatibility; if the map is empty, it is off. `false` hides generated rows and restores bare native picker rows without deleting mappings or disabling exact `<selector>/<native-openai-model>` routing. |
| `activeCodexAccountId?` | `string` | — | Manually selected Pool account for the next request. Selection clears thread affinity; in-flight requests keep captured credentials. |
| `codexAccountPriorities?` | `Record<string, number>` | — | Per-account selection order for the Codex pool: account id → integer from `-100` to `100`, **higher is used earlier**, absent means `0`. This is an ordering boundary, not an eligibility one: selection narrows the already-eligible accounts to the highest tier that still has quota headroom, and `accountPoolStrategy` then picks within that tier. A tier is skipped only when every member is at or above its own nonzero effective usage threshold (account override or global default), cooling down, soft-avoided, paused, or needs reauthentication — unknown quota never drains a tier. Ordering never makes an ineligible account selectable and by default, never re-binds a thread that already has an account. The main `__main__` account participates on equal terms, which is how the Codex Desktop login can be set to drain last. With no entries the pool behaves exactly as before. A malformed map is ignored with a console warning (ordering off, no config repair). Managed by `ocx account priority` and the Codex Auth page. |
| `activeCodexAccountPinned?` | `string` | — | Account id the operator last selected by hand. While set, a higher `codexAccountPriorities` tier cannot preempt it until the pin is released by drain, exclusion, deletion, or an explicit failover/promotion away. Ordinary round-robin movement inside the capped tier does not release it. Writing any `codexAccountPriorities` entry also releases the pin, so a pin made before an order existed cannot outrank one set afterward. `GET /api/codex-auth/active` reports both whether the effective account is pinned (`pinned`) and the account carrying the ceiling (`pinnedAccountId`). |
| `codexAccountPriorityFailback?` | `boolean` | `false` | Opt-in return of ongoing Codex Pool tasks to a usable higher-priority account under the `quota` strategy. Requests trigger a background quota refresh at most once every five minutes, including failed refresh attempts. When recent quota observations show headroom, the next request may rebind even if its current account is below the threshold. This explicit preference can discard a warm prompt cache; it does not change default cache affinity. No requests means no polling. Manual pins, model access, cooldowns, pauses and reauthentication exclusions still apply; in-flight requests keep their captured account. Requires the current source account's effective threshold to be positive (an override of 0 disables it; a positive override works with global 0); exact account routes and Direct mode are unchanged. |
| `autoSwitchThreshold?` | `number` | `80` | Usage threshold for placing new/unbound work. `quota` can re-evaluate unbound tasks on their next request once usage crosses this threshold. Bound tasks keep their account past the threshold by default (`pool.cacheAffinity`); they leave only when that account is exhausted or otherwise cannot serve, and then only for an account with genuine quota headroom and strictly lower usage. Set `pool.cacheAffinity: false` to re-evaluate bound tasks at this threshold, still only onto such a destination. `fill-first` uses it only as the drain point for unbound assignment; normal `round-robin` selection does not use it. The score uses the hottest known 5h, weekly, or 30d quota window. `0` disables usage-based proactive switching only, not unbound assignment or failure recovery. |
| `codexAccountAutoSwitchThresholds?` | `Record<string, number>` | — | Per-account overrides for `autoSwitchThreshold`: account id → integer from `0` to `100`. An absent entry inherits the global value; `0` disables usage-driven switching only when that account is the source. `quota` uses the current source account's effective threshold for bound-task re-evaluation and unbound switching. Fill-first drain and selection-order tier headroom are evaluated against each account's own effective threshold; main-account pins and subagent fallback also use the relevant account's effective threshold. Supports the main `__main__` account. A malformed map is ignored with a warning. Managed by each account card on the Codex Auth page; disabling an override removes its entry. Enabling the override copies the current global threshold into a fixed account value. The override, including `0`, takes precedence over later global changes. Disabling it sends `threshold: null`, removes the entry, and restores inheritance of the current global threshold and future global changes. |
| `accountPoolStrategy?` | `"quota" \| "round-robin" \| "fill-first" \| "reset-first"` | `"quota"` | Assignment strategy for new/unbound Codex requests. A request is unbound when it has no live (parent thread id, quota scope) affinity; a visible existing task can become unbound after proxy restart or affinity reset. `quota` picks the lowest-usage eligible account when no active account exists, keeps an eligible active account below `autoSwitchThreshold`, and after the threshold may move an unbound request. Bound tasks follow `pool.cacheAffinity` (on by default): they stay until the account is exhausted (known usage at 100%) or otherwise cannot serve, and then may rebind only to an account with genuine quota headroom and strictly lower usage. Set the flag `false` to proactively rebind a bound task at the threshold, still only onto such a destination. `round-robin` distributes unbound requests evenly; `fill-first` keeps assigning unbound requests to the active account until cooldown, unavailability, or the configured drain threshold.  `reset-first`: Prefer the nearest future 5-hour or weekly reset among accounts below the usage threshold. Bound tasks follow the configured affinity policy. Independent model quotas use quota ordering. Monthly resets do not determine this ordering. |
| `pool.cacheAffinity?` | `boolean` | `true` | Cache-affinity ordering for bound Codex threads, independent of `pool.kernel`. On by default; omitting the key or setting `true` keeps a bound task on its account until that account genuinely cannot serve. Only an explicit `false` restores threshold-based rebinding of bound tasks. A live binding outranks quota headroom: `quota` does not move the thread merely because usage crossed `autoSwitchThreshold`. The thread still leaves if that account cannot serve — paused, unusable, or genuinely exhausted (known usage at 100%) — and then only to an account with genuine quota headroom and strictly lower usage. Under either setting, an account with unknown usage is never chosen as a destination for a bound task, so when every account sits above the threshold the task stays put. Affinity is a reordering, not a pin. |
| `pool.credentialGroups?` | `Array<{ id: string; credentials: string[]; note?: string }>` | `[]` | Accepted and validated, but not yet consumed by routing: declaring a group changes no routing decision until a consuming layer lands. Operator-declared quota domains: groups of credentials that demonstrably share one upstream usage limit. Members of one group count once toward available capacity, and a quota refusal inside a group is not answered by rotating to another member — the limit is the same, so the move would pay a cold prefix for zero new capacity. Declared groups speak only to quota; sharing a limit says nothing about prompt-cache compatibility, which is classified separately. Each member is written provider-qualified as `"<provider>:<credential-id>"`, because a credential id means something only inside its provider; the provider segment accepts the usual aliases (`chatgpt:` and `codex:` both mean OpenAI). Group ids must be unique, `credentials` must be non-empty, and a credential may appear in at most one group — an ambiguous declaration is rejected on write and dropped with a warning on load rather than resolved by whichever group is listed first, since that would merge two unrelated quota domains. A malformed list costs only the grouping: `pool.kernel` and `pool.cacheAffinity` are preserved. Absent or empty means no declared grouping, so an unconfigured install behaves exactly as before. |
| `accountPoolStickyLimit?` | `number` | `1` | New/unbound task assignments retained on one round-robin selection before advancing; the counter advances when a task is bound, not after an upstream success. Range 1–100. |
| `upstreamFailoverThreshold?` | `number` | `3` | Consecutive transient failures before future new sessions fail over. Set `0` to disable. For regular Responses and native compact sends, proven pre-connection DNS/TCP reachability failures are tracked at the provider-host level: they never affect account health, account cooldowns, thread/session affinity, active-account selection, or Pool routing, and never count toward this threshold. |
| `upstreamHostCircuitThreshold?` | `number` | `0` | Opt-in circuit threshold for proven pre-connection DNS/TCP failures on native OpenAI forward Responses and compact sends. `0` disables it; `1`–`20` opens a 30-second provider-origin cooldown after that many terminal logical requests. While open, requests receive `503` with `Retry-After` before account selection or upstream send; after cooldown, one half-open request is admitted. Timeouts and HTTP responses never count, and any HTTP response closes the circuit. Applies only to Codex Pool routing with no pinned account; it is inert for `codexAccountMode: "direct"` and account-qualified selectors. |
| `maxUpstreamBodyBytes?` | `number` | `0` | Opt-in ceiling, in bytes, on a serialized native Responses **passthrough** body. `0` or omitted disables it — no limit is inferred for any destination. When set, a built body above the ceiling is refused locally before the send: streaming turns receive a terminal `response.failed` / `context_length_exceeded` so the client compacts instead of resending, and non-streaming turns receive a `413` naming the size, the number of embedded `input_image` items, and roughly how many megabytes of image data they represent. Checked at every build and rebuild point, including OAuth-refresh replay and alternate-account retry. Translated adapter paths are not covered. There is deliberately no default: the only measured ceiling here belongs to the WebSocket transport, which already falls back to HTTP for oversized turns, so a default would refuse requests that currently succeed. Set it when your gateway has a known request-size limit and you would rather see an actionable local error than an opaque upstream failure. |
| `maxInboundBodyBytes?` | `number` | `0` | Opt-in ceiling, in bytes, on a decompressed **inbound** data-plane request body — the mirror of `maxUpstreamBodyBytes` above. `0` or omitted keeps the built-in 256 MiB default. Raise it when a large-context session can no longer compact: Codex replays the whole history to the compaction model, so on the 922k-token opt-in window the compaction request is itself the one that crosses the limit, and the session is stuck at the only operation that would have shrunk it. Clamped to 1 MiB–512 MiB. The ceiling is not negotiable: the reader materializes the body several times over (wire bytes, decoded bytes, the decoded string, and the parsed object graph), so peak memory is a multiple of whatever is admitted, and an unbounded value would be a memory exhaustion lever. Applies to `/v1/responses`, `/v1/responses/compact`, `/v1/chat/completions`, and `/v1/messages`. The listener's accept size is fixed when the proxy binds, so a change takes effect on restart. A body above the limit is refused locally with HTTP 413 and `code: "inbound_body_too_large"`, which is deliberately distinct from the `context_length_exceeded` 413 a provider size refusal produces. |
| `modelCacheTtlMs?` | `number` | `300000` | Freshness window for the per-provider `/models` cache. |
| `cacheRetention?` | `"none" \| "short" \| "long"` | `"short"` | Anthropic prompt-cache policy: disabled, 5-minute ephemeral, or 1-hour extended. |
| `tokenGuardian?` | `OcxTokenGuardianConfig` | off | Optional proactive OAuth refresh and Codex-account warmup policy. |

Across these strategies, each account's effective threshold is its `codexAccountAutoSwitchThresholds` entry when present, otherwise global `autoSwitchThreshold`. A zero override disables only proactive usage switching; startup binding, hard-lock, cooldown, entitlement checks, and failure recovery remain enforced.

Setting an account's switching threshold to `0` does not disable main-account hard-lock, startup
protection, cooldowns, or model eligibility checks. In Pool mode, a pinned caller credential that
matches the observed main account cannot bypass that account's applicable cooldown: an eligible
Pool alternative is used, or the request is rejected. Unrelated caller credentials do not inherit
the main account's cooldown; explicit Direct behavior is unchanged.

Selector names are user-chosen public labels; opencodex assigns no account-role semantics to them.
`codexAccountNamespaces` keys are 1–64 characters, starting and ending with an
ASCII letter or number, with letters, numbers, `.`, `_`, or `-` inside. Reserved JavaScript object
names are rejected. Each value is a valid pool-account id (never internal `__main__`) or `"@main"`
for the Codex Desktop account. Provider and reserved `openai` / `combo` / `policy` collisions are
checked case-insensitively; a namespaced combo or routing-profile alias cannot reuse a selector as
its namespace prefix, and configured pool ids or selector targets also cannot reuse a selector. Keep
raw account ids and emails private; the selector is the public name. See [Routing Configuration](/reference/configuration/routing/)
for exact-selection behavior and precedence.

The Codex Auth dashboard control owns maps that have an explicit `codexAccountPickerEnabled` field.
Enabling an empty managed map creates privacy-safe selectors; later account additions extend that map
even while picker rows are hidden, without renaming existing selectors. A hand-written map that omits
the flag remains manual and is never auto-expanded. Deleting an account keeps its mapping so exact
routes fail closed while it is missing; adding the same account id again restores the existing public
selector instead of allocating a new one.

## Reserved OpenAI providers

`openai` and `openai-apikey` are fixed reserved ids. `openai.codexAccountMode` is `"pool"` by default
and selects across the main plus added accounts; `"direct"` uses only the current caller/main login.
API uses only its configured API key or key pool. Use a bare model or `openai-apikey/<model>`; there
is no cross-route credential fallback. API GPT-5.6 rows carry 1,050,000 context / 922,000 max input
metadata, and Pro virtual ids rewrite to the base wire model with `reasoning.mode: "pro"`.

`openaiProviderTierVersion: 2` marks the current single-provider projection. Before migrating a
shipped v1 config, opencodex creates `config.json.pre-openai-tiers-v2.bak` without replacing a
differing backup and rewrites known legacy namespaced selected ids to bare ids.

### GPT-6 Astra, Sol, Luna and Astra Minor

`gpt-6-astra` uses the Codex-login route; `openai-apikey/gpt-6-astra` uses your API key.
Availability still depends on the upstream account. Native Astra keeps the shipped Codex defaults:
272,000 context, `low` reasoning, and the `low`/`medium`/`high`/`xhigh`/`max`/`ultra` ladder.
Its Fast catalog description is **2x speed**; that is not the billing multiplier.

Set `providerContextCaps.openai` to `922000` to opt the native group into long context; Astra
stops at its own **872,000** ceiling. Per-model `providers.openai.modelContextWindows`
and `modelAutoCompactTokenLimits` can narrow its window and soft compaction budget. For example,
`modelAutoCompactTokenLimits: { "gpt-6-astra": 700000 }` lowers the long-window default of 784,800.
An explicit smaller provider cap or target limit still wins, including native-alias combos.

The API row has 1,050,000 context, 922,000 maximum input, 128,000 maximum output, text/image input,
and API reasoning efforts through `max`. OpenCodex's routed synthetic Ultra control retains its
existing wire-effort mapping; it is not an additional API effort. There is no Astra `-pro` alias.
Use the existing `fastMode` setting, or Codex's `service_tier = "fast"` with
`[features].fast_mode = true`; API `fast` and `priority` are accepted Fast spellings.

[GPT-6 Sol and Luna](https://openai.com/index/introducing-gpt-6-sol-and-luna/) (announced
September 22, 2026) are Codex-login natives: `gpt-6-sol` and `gpt-6-luna`, shown as **GPT-6-Sol**
and **GPT-6-Luna**. Like Astra they are listed on every install and are not gated on an account
roster; if your account cannot use them yet, the request still goes out and you see the upstream
error. Their metadata comes from the Codex `/models` roster, which serves these two rows only to
`client_version` **0.155.0 or later**; opencodex ships a copy of those rows, so they appear even
when your installed Codex catalog predates them.

| Model | Default context | Opt-in ceiling | Default effort | Reasoning ladder |
| --- | ---: | ---: | --- | --- |
| `gpt-6-sol` | 272,000 | 872,000 | `medium` | `low` through `ultra` |
| `gpt-6-luna` | 272,000 | 872,000 | `medium` | `low` through `max` (no `ultra`) |

[GPT-6.1 Sol](https://openai.com/index/introducing-gpt-6-1-sol/) (announced September 29, 2026)
is the upgrade to GPT-6 Sol; Astra and Luna did not get a 6.1 release. It is listed as
`gpt-6.1-sol` (**GPT-6.1-Sol**), ungated like Sol, and its row comes from the Codex catalog, where
it needs `client_version` **0.153.0 or later** and is the Codex default. GPT-6 Sol stays listed.

| Model | Default context | Opt-in ceiling | Default effort | Reasoning ladder |
| --- | ---: | ---: | --- | --- |
| `gpt-6.1-sol` | 272,000 | 872,000 | `low` | `low` through `ultra` |

The same `providerContextCaps.openai`, `modelContextWindows` and `modelAutoCompactTokenLimits`
levers apply as for Astra. On the OpenAI API (`openai-apikey`), `gpt-6.1-sol` has 1,050,000
context, 922,000 maximum input, 128,000 maximum output and efforts `low` through `max`, priced
at $2 input, $0.10 cached input and $10 output per 1M tokens (prompts over 272K bill at the
long-context rate). GitHub Copilot, OpenRouter, Vercel AI Gateway, Kilo and OpenCode Zen also
list it.

When OpenAI ships a GPT model that this release does not know yet, add it through config instead of
waiting for an update, the same way a new Claude id goes under `providers.anthropic.models`:

```json
{
  "providers": {
    "openai": {
      "adapter": "openai-responses",
      "authMode": "forward",
      "baseUrl": "https://chatgpt.com/backend-api/codex",
      "models": ["gpt-6-nova"]
    }
  }
}
```

Each bare `gpt-*` id listed there on the Codex-login provider appears as a native model (here
**GPT-6-Nova**) with GPT-6.1 Sol's reasoning ladder, default effort and modalities, a 272,000-token default context
and an 872,000-token opt-in ceiling. Raise or narrow it with `modelContextWindows`, for example
`"modelContextWindows": { "gpt-6-nova": 872000 }`. It is never account-gated: if your account
cannot use the model, the request still goes out and you see the upstream error. Ids that are
already built in are ignored, and removing an id from the list removes the model. A combo
`nativeAlias` cannot point at a configured id.

`gpt-6-astra-minor` (**GPT-6-Astra-Minor**) is an unreleased Astra variant. It is account-gated:
it stays hidden, and requests for it are refused locally, until an authenticated Codex roster for
your account lists it. When it appears it uses Astra's context, ladder and modalities.

Pricing checked September 5, 2026:

| Astra API (USD per million tokens) | Input | Cached input | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| Standard, up to 272k input | 10 | 1 | 12.5 | 50 |
| Standard, above 272k input | 20 | 2 | 25 | 75 |
| Fast, up to 272k input | 20 | 2 | 25 | 100 |
| Fast, above 272k input | 40 | 4 | 50 | 150 |

The [API price table](https://developers.openai.com/api/docs/pricing) reprices the **whole request**
above 272k, counting cached tokens toward the threshold. Fast and long-context rates combine;
this also applies to the published GPT-5.6 API rows and their Pro virtual selections.

All built-in dollar estimates use **API-reference prices**, including Codex-login routes.
Astra and GPT-5.6 therefore use the same API base/cache rates, **2x Fast** multiplier, and
published long-context bands on `openai` and `openai-apikey`. The two Daybreak Blue selectors
follow the Sol API reference. These are comparison estimates, not invoices or credit-balance
predictions. Explicit provider/model price overrides still take precedence.

## Provider namespace aliases

Providers can expose a built-in shorthand, such as `agy` for `google-antigravity`. A configured provider name or explicit alias claims that shorthand case-insensitively; a different provider's built-in shorthand is then suppressed in both catalog names and alias routing. For example, configuring a provider named `agy` keeps Google's models under `google-antigravity/<model>`, while `agy/<model>` selects the configured provider. Canonical provider names still require an exact case match, and unrecognized prefixes retain the existing model-routing fallback.

## Provider entries (`OcxProviderConfig`)

| Field | Type | Meaning |
| --- | --- | --- |
| `adapter` | `string` | One of `openai-chat`, `openai-responses`, `anthropic`, `claude-cli`, `google`, `kiro`, `cursor`, `ollama-native`, `azure-openai` (or alias `azure`), `codebuddy`, `qoder`. |
| `baseUrl` | `string` | Upstream API base URL. Most built-in fixed endpoints ignore a mismatch; collision-safe key presets preserve an older same-named custom destination. |
| `proxy?` | `string \| null` | Per-provider egress route. Omit it to inherit the global proxy decision; use `"direct"` or `null` to force direct egress; or provide an absolute `http://`, `https://`, `socks5://`, or `socks5h://` proxy URL. An empty string is rejected. |
| `noProxy?` | `string \| string[]` | Destinations this provider reaches directly, using `NO_PROXY` host-pattern syntax. A match bypasses both this provider's own proxy and an inherited global proxy. |
| `quotaQuery?` | `object` | Optional custom-provider usage probe displayed by `ocx provider quota` and the Providers overview. It accepts a same-origin HTTPS `url`, `GET` or `POST`, secret references in `headers` and a flat JSON `body`, response dot paths, a target `window`, and optional `unit`, `label`, and `timeoutMs`. See [Custom quota queries](/guides/providers/#custom-quota-queries). |
