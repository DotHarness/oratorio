# Configuration Reference

Oratorio's day-to-day configuration entry point is Settings in the Desktop Renderer. Settings writes the Oratorio-managed Configuration Overlay, which the headless backend reads after restart.

> [!NOTE]
> If you are setting up Oratorio for the first time, start with [Getting Started](/getting-started). For the DotCraft workspace prerequisite, see [DotCraft Workspaces](/dotcraft-workspaces). This page is the field reference, not the walkthrough.

## Settings and Configuration Overlay

Settings manages local admin configuration, including:

- GitHub source/repository and GitLab source/project lists;
- GitHub credential presence plus GitLab project profile credential presence
  and write-only secret updates;
- DotCraft AppServer / Hub routing;
- source-project-to-DotCraft-workspace mappings;
- managed worktree, concurrency, retry, timeout, and cleanup policy;
- automation policy, such as source project Auto Review, Draft auto-publish, and implementation auto-dispatch.

The Configuration Overlay contains non-secret configuration plus encrypted secret values. Responses, diagnostics, and audit records do not return plaintext secrets.

In Settings, `Sources` manages GitHub/GitLab provider status and sync; `Projects` manages source project workspace routing; `Agents` manages DotCraft/AppServer connection and agent guardrails; `Worktree` manages managed worktrees, scheduling, retries, cleanup, and implementation auto-dispatch; `Review` manages PR/MR Auto Review and Review Draft publication policy. Settings does not expose a standalone Diagnostics top-level page; redacted diagnostics remains available as a local support capability. The legacy `/settings/advanced` route remains as a compatibility entry and shows `Agents`; legacy `/settings/repositories` opens `Projects`.

`server/appsettings.Local.json` is not loaded by the product path. Do not use it for normal configuration.

## Source Project to Workspace Mapping {#source-project-to-workspace-mapping}

Settings groups each GitHub repository or GitLab project with a DotCraft workspace path. Internally this writes:

- `Oratorio:GitHub:Repositories`
- `Oratorio:GitHub:InstallationProfiles`
- `Oratorio:GitLab:Projects`
- `Oratorio:GitLab:ProjectProfiles`
- `Oratorio:DotCraft:RepositoryWorkspaces`

New AppServer Runs look up the workspace path from the Task source project. Oratorio has no fallback workspace; every GitHub repository or GitLab project that should dispatch work needs an explicit mapping. GitLab workspace keys use `gitlab:<host>/<group/project>` and support subgroup paths.

Hub is used only to discover the workspace AppServer endpoint. After Oratorio receives an endpoint, it connects directly to that AppServer. Hub is not a message relay or security boundary.

GitHub App installations are managed as owner profiles rather than one global Installation ID. Settings groups profiles by GitHub instance and repository owner, such as `github.com/DotHarness`; repositories under the same owner share that installation ID. After Project routing is saved, Oratorio tries to detect missing profiles with the configured GitHub App ID and private key. Detection failure does not block routing saves, and users can retry or manually enter the installation ID on the profile row. A legacy single `Oratorio:GitHub:InstallationId` is migrated only when all configured repositories belong to one owner; multi-owner configurations do not copy the old ID across owners.

GitLab credentials are managed as project profiles rather than one global token.
Each configured GitLab project's profile key is
`gitlab:<host>/<group[/subgroup]/project>`, and the profile carries
`TokenKind`, token, webhook secret, and Standard Webhooks signing token fields.
Settings edits those fields on the GitLab project card in `Projects`;
`Credentials` keeps only provider-level endpoint, read/write, and local-bypass
controls. Removing a GitLab project removes its profile secrets on the next
overlay save. Changing the GitLab endpoint host does not carry old-host profile
secrets to the new host.

## Secret Handling

GitHub tokens, webhook secrets, private keys, plus GitLab project profile tokens, webhook secrets, and webhook signing tokens use one-shot replace / clear semantics:

- an empty secret input keeps the existing value;
- replace encrypts the value on the server before writing the Configuration Overlay;
- reads, diagnostics, audit records, and UI state show only presence or redacted values;
- plaintext secrets are never returned to the Desktop Renderer.

Settings does not expose auto-start command or process argument inputs.

Legacy `Oratorio:GitLab:Token`, `TokenKind`, `WebhookSecret`, and
`WebhookSigningToken` values are still read by runtime, but only as a fallback
when no `ProjectProfiles` exist. Settings does not show those legacy fields,
does not auto-migrate them into project profiles, and drops them on the next
save.

## Default State Paths

Oratorio stores local state under the Oratorio state root by default:

```text
<oratorio-state-root>/
  oratorio.db
  config.json
  worktrees/
  logs/
  artifacts/
```

Use `ORATORIO_STATE_ROOT` to place state outside the application directory. Packaged or embedded hosts may also use `ORATORIO_CONFIG_PATH`, `ORATORIO_STATE_ROOT`, and `Oratorio:Settings:ConfigPath` to locate state or an alternate overlay. These are advanced startup locators, not the normal settings entry point.

## Automatic PR/MR Review

`Automation.AutoReviewRepositories` controls which source projects automatically trigger PR/MR review. GitHub may use `owner/name` or a canonical source key; GitLab uses a canonical source key such as `gitlab:gitlab.example/group/project`. Each configured source project has two states:

- `Off`: do not auto review;
- `Auto review`: after enablement, newly observed open non-draft PRs/MRs queue a `reviewAnalysis` run, and each later head SHA change queues a re-review.

When a source project is first enabled, Oratorio baselines the currently open non-draft PRs/MRs and does not backfill historical reviews. Auto Review matches manual `reReview`: supersede the current round, create the next round, queue a read-only AppServer review run, and do not write a GitHub/GitLab decision.

Auto Review does not use labels. GitHub Issue and local task implementation auto-dispatch allow/block labels remain separate.

PR/MR review runs must call `oratorio.SubmitReviewDraft`. Clean reviews still submit a summary-only draft with all counts set to `0` and `comments: []`. Each inline comment must either provide `suggestionReplacement` that can be published as a native GitHub/GitLab suggested change, or provide `commentOnlyReason` for findings that need human judgment, a larger change, unsafe anchoring, investigation only, or a left-side/deletion anchor. The server derives `suggestionCount` from accepted concrete code suggestions and does not count prose-only findings. Inline comments must anchor to commentable changed/context lines in the diff; when an agent-submitted path, side, line, or range is correctable, the tool fails with `reviewDraftAnchorNotCommentable` and returns available ranges so the agent can resubmit. Summary-only drafts do not require source diff reads; when diff data or a provider file patch is unavailable, inline comments are preserved as skipped warnings. If a run completes without any Review Draft, Oratorio fails it with `reviewDraftRequired` instead of synthesizing a conclusion.

In Settings, the Auto Review allowlist is managed through a `Manage` dialog. The dialog lists only configured source projects, supports search and checkbox selection, and saves back to the Settings draft; the page-level `Save` action still writes configuration.

## Draft Auto-Publish

Settings manages Draft auto-publish with a source project allowlist card and `Manage` dialog. When at least one source project is selected, Settings writes `Automation.AutoReviewPublishEnabled=true` plus the selected `Automation.AutoReviewPublishRepositories` into the draft; when all projects are removed, it writes disabled with an empty allowlist.

The publish allowlist controls Review Draft publication only, not whether reviews are automatically triggered. When reading older configuration, only source projects with `Automation.AutoReviewPublishEnabled=true` and an allowlist entry appear in the publish allowlist card.

In Settings, the Draft auto-publish allowlist is also managed through a `Manage` dialog, and selected source projects can be removed directly from the allowlist card. Removing the final publish project also sets `Automation.AutoReviewPublishEnabled=false` in the draft.

This setting never:

- approves a pull request or merge request;
- requests changes;
- merges;
- resolves an Oratorio Task;
- bypasses Source Write audit.

Automatic publication still respects stale-head, warning, skipped-comment, and write-configuration gates.

## Implementation Auto-Dispatch Labels

`Automation.AutoDispatchAllowLabels` and `Automation.AutoDispatchBlockLabels` are managed with Settings label controls. Labels are free-form values; Settings trims surrounding whitespace and de-duplicates case-insensitively before saving.

An empty allow-label list means every unblocked eligible GitHub/GitLab Issue or local task may participate in implementation auto-dispatch. Any matching block label prevents automatic dispatch.

## Applying Configuration

Settings saves return a restart-required signature. Configuration writes do not hot-apply the full configuration root; restart the Oratorio server to ensure new startup-level configuration takes effect. Desktop builds show a restart button when the desktop bridge is available; contexts without the bridge should show a manual restart requirement.

## Troubleshooting

### AppServer Run Cannot Find a Workspace

Confirm that the Task source project is mapped to a DotCraft workspace path in Settings and that the workspace can be discovered through Hub or an explicit AppServer endpoint.

### A Saved Secret Is Not Visible

That is expected. Settings shows only secret presence; plaintext is never read back from the server.

### Configuration Changes Did Not Affect Behavior

Restart the Oratorio server. The Configuration Overlay is written durably, but startup-level configuration is not fully hot-reloaded.
