# Config Surface

Quota activation reuses the existing next-reset fields without adding a polling configuration key. See the [quota activation contract](providers/openai-tiers.md#public-provider-contract). `src/types/config.ts` defines `anthropicAccountPool.routes` as ordered model rules. `src/oauth/anthropic-model-routes.ts` validates bounded names, full case-sensitive globs and stored account IDs; `src/config/diagnostics.ts` rejects malformed candidate writes. Load retains a malformed hand edit so unrelated providers survive, while the enabled Anthropic selector refuses it locally before dispatch. Saved rules remain inert when the pool is disabled; affinity is process-local. Request logs use only the rule’s 1-based `route:#<n>` position, never its configured name.

Native function-result injection follows [the separate opt-in control contract](transports/streaming-health.md#experimental-native-function-result-injection); this surface does not infer upstream support or alter its defaults.

Native steering follows [the shared WebSocket contract](transports/streaming-health.md#experimental-native-mid-turn-steering); this surface's defaults remain unchanged.

Catalog HTTP acquisition follows the [proxy-routing contract](catalog.md#remote-catalog-http-proxy-routing).

Configuration consumers retain the [refresh-lock ownership boundary](catalog.md#accounts-namespaces-and-pool-rotation); failing to establish a usable matching lock identity does not authorize deleting its path or replacing the refresh callback outcome with a path-probe error. Cooperating lock metadata changes serialize through the existing SQLite mutation transaction; release keeps the descriptor open through identity comparison and any unlink, then closes it. Failed metadata writes remove only a matching owned path after successful coordination; unknown identity, failed probes or unavailable coordination retain the path for stale recovery. Async refresh work holds no metadata transaction.

Explicit Codex CLI installation observation reads only supplied installation paths; it neither discovers nor writes config. See the [read-only observation contract](runtime.md#explicit-codex-cli-installation-observation).

The configuration-only [plaintext V2 contract](subagents.md#plaintext-v2-agent-messages)
is scoped to canonical ChatGPT Responses forwarding; other source-area behavior described here is unchanged. CLI installation inspection reason codes, including Windows deferral, follow the [runtime inspection contract](runtime.md#lifecycle).

Connected-client catalog diagnostics use the [terminal rendering contract](runtime.md#cli-readiness-diagnostics) on the first connection and on every `ocx sync` refresh; stored catalog values are unchanged.

Hub management ingress also selects the [local dashboard address](runtime.md#hub-management-dashboard-address) using its configured port.

Native main reauthentication follows the [CLI JSON output contract](runtime.md#native-main-reauth-json-output).

The Codex restart command follows the [CLI restart scope contract](runtime.md#cli-codex-restart-scope).

`src/cli/account-orca-import.ts` exposes an explicit-source, preview-first local import command. Apply adds pool configuration under the shared mutation lock;
the [source-owned credential contract](codex-home.md#orca-source-owned-account-import) governs deduplication and credential storage separately from Codex config injection.

## Config surface

Custom Responses providers can explicitly enable `preserveResponsesInputItemIds` and `preserveResponsesMessageMetadata`; both default off and accept only booleans. The [replay sanitization contract](transports/responses-wire-shapes.md) keeps ordinary destinations unchanged and preserves xAI custom-call ID repair. `src/config/schema/compaction-recovery.ts` strictly validates opt-in `compactionRecovery`; invalid disk values disable it with a warning, while candidate writes reject them. `src/config/schema/blocked-model-redirects.ts` applies the same read-degrade/write-reject boundary to malformed `blockedModelRedirects` maps. The [failure-only contract](transports/responses-failover.md) leaves provider identity, accounts and client compaction unchanged. `src/cli/config-command.ts` accepts one leading UTF-8 BOM when parsing validate/import input from a file or stdin. JSON syntax and schema validation still run before persistence; BOM characters inside string values remain data.

`skills.catalog_refresh` in the proxy JSON configuration accepts `per_session` (the runtime default when absent) or `per_turn`. The former retains received skills instructions for a conversation; the latter passes through the current catalog. This is separate from Codex's `skills.include_instructions` TOML switch and does not change the live dashboard probe. See the [Responses snapshot contract](transports/responses.md#responses-httpsse).

Google providers may persist `googleToolSchemaPolicy` as `compatible` or `reject-lossy`.
`ocx provider add --google-tool-schema-policy` is one authoring path and is accepted only when the effective adapter is `google`. Omission remains absent in `config.json`; the adapter resolves it to `compatible` in memory. Provider live lifecycle, pacing and public editor CAS are described in [CLI management](cli-management.md#provider-live-operations-and-bounded-editor-input); local auth/path additions retain canonical OpenAI validation before saving.

### OpenCodex home and live process state

`initializePersistedConfigIfMissing` in `src/config.ts` is the create-only path consumed by
`src/cli/init.ts`. It rechecks absence under the existing config-mutation lock and publishes through
`src/config/initialize.ts`: a private descriptor is hardened before secret bytes are written, then
linked without replacing an occupied destination. Existing invalid or unsafe entries are preserved.
The initializer never truncates a staged inode or rolls back by unlinking the destination; cleanup
only removes its own temporary name. Unsupported/denied links and incomplete cleanup fail explicitly,
and publication followed by a later failure can leave a complete config or private residue. Ordinary
`saveConfig` replacement behavior remains unchanged. This protects init-time config bytes, not a
foreign winner's ownership under future uninstall; the existing ownership manifest and global CLI
shim preflight keep their separate contracts.

Initial publication diagnostics distinguish required permission-hardening failures from denied
hard-link publication without exposing raw filesystem causes. Both identify `OPENCODEX_HOME`
as the supported-location recovery path; uncertain publication and cleanup warnings remain in
the CLI. The quickstart documents inspection before retry, private-permission requirements,
and fresh-location examples. Diagnostics do not introduce a fallback or alter file I/O ordering.

`src/config/persisted-mutation.ts` owns schema-valid on-disk mutations under the shared lock.
It rechecks the file before committing, retries a changed snapshot up to three times, and
returns unavailable for missing, invalid, or persistently conflicting config. Its one-shot
test seam and the mutation types remain re-exported through `src/config.ts`. Successful, repaired, and salvaged file loads record their source path in the private WeakMap owned by `src/config/rebase-provenance.ts`; defaults and synthetic objects do not acquire it. This metadata is never serialized. Inventory drift cannot turn a file-backed instance into a synthetic discovery writer. Read publication may use the detached policy projection described by the [catalog contract](catalog.md#shared-catalog), without changing the live merge baseline; changing the resolved config home refuses publication.

`src/config/paths.ts` is the single owner of `OPENCODEX_HOME` expansion and resolution. It exposes
the config directory and `config.json` path and retains the existing cache rule: a relative home is
resolved once for each distinct raw environment value, so a later working-directory change cannot
silently move the active installation.

`src/config/process-state.ts` derives `ocx.pid` and `runtime-port.json` from that resolved directory.
It owns their byte-compatible writes, parsing, expected-PID filters, cheap liveness, full OCX command
identity, and snapshot-guarded removal. `RuntimePortState.attestationSecret` and `siblingOfPort` (the live owner's port, written only by a sibling instance) remain optional,
owner-only state and are validated before a record is returned. `src/config.ts` re-exports the same
symbols for compatibility, but new lifecycle-only callers import the process-state leaf directly.

Replacing config and process-state writes use `src/config/atomic-write.ts`. The leaf preserves the shared
process-wide temp sequence, symlink target resolution, no-follow directory-entry replacement for
externally writable integration directories, real-home test guard, owner manifest, Windows ACL hardening,
scrub-before-unlink failure path, and explicit residual-temp errors. A caller must not replace it with a local temp-and-rename shortcut. Publication failures in
`src/config/persist-unlocked.ts` and `src/config/live-reconcile.ts` follow the [publication-aware rollback contract](gui-and-management-api.md#durable-provider-patch). `src/config/live-reconcile.ts` adopts committed model discovery and disabled selectors together with their scoped live merge baselines. A later manual enable therefore removes the automatic disable instead of having a stale three-way merge restore it. Unrelated live config baselines are not advanced by that adoption.

Owner-registry publication first refuses a directory symlink, applies POSIX mode `0700`, and requires `hardenSecretDir` for the locator directory. On Windows the default secret-directory ACL grants the current owner full control before removing inherited and broad-user access, without elevated-stage reader grants. A hardening failure skips this best-effort publication before any pointer is written.

Windows hardening in the atomic writer is applied once per write, not once per harden call. Both calls stay
`required: true` and still fail the write closed, but the pre-rename call resolves through the
`src/lib/windows-secret-acl.ts` success memo: after the content write the writer re-asserts that the
path still resolves to the object its descriptor holds, then re-attributes the memo to that same
object so the freshness the data write moved does not read as a replacement. A different or unobservable object retires the memo and the pre-rename call performs the full sequence.

> Decision record: [ADR-0016](decisions/ADR-0016-config-surface.md)

`src/types.ts` is the shape; the load/validate pipeline lives in the split config leaves — schema in `src/config/schema/` (`config-schema.ts`, `leaf-validators.ts`) and replace-path persistence in `src/config/persist-unlocked.ts`, with `src/config.ts` as the compatibility facade — and is not reproduced here. What matters for maintainers is which groups exist and who resolves them:

A schema-invalid top-level JSON value is repairable only when it is a non-array object.
`loadConfig` backs up arrays, primitives, and null before using defaults, so the repair merge cannot turn them into a valid config while discarding the original bytes.

`src/config/schema/config-schema.ts` accepts the opt-in `codexAccountPriorityFailback` preference and degrades a malformed value in a loaded file to false without discarding providers, while a write candidate carrying a non-boolean value is rejected. A malformed entry in `codexAccountAutoSwitchThresholds` is dropped on load with a warning and the valid entries are kept, so an unrelated save cannot erase them. Its [routing contract](providers/openai-accounts.md#ongoing-priority-failback) requires quota strategy and a positive threshold.

| Group | Keys | Resolution rule |
| --- | --- | --- |
| Listener | `port`, `hostname` | The listener owns the port; `runtime-port.json` reports where it actually landed. |
| Custom quota | `providers.<name>.quotaQuery` | A custom quota query is validated with its provider so its HTTPS destination stays on the configured provider origin; secret values remain references to an environment variable or local JSON credential file. |
