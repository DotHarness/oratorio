# GitLab Integration

Oratorio can sync GitLab issues and merge requests onto the board. When writes are enabled, it can publish notes, MR discussions, commit statuses, and deliver implementation drafts as GitLab MRs.

> [!NOTE]
> This page covers GitLab-specific setup — tokens, webhooks, the merge gate. The general [Configuration Reference](/configuration) covers Settings and the Configuration Overlay; the [DotCraft Workspaces](/dotcraft-workspaces) page covers the agent runtime prerequisite. Each GitLab project still needs a workspace mapping before dispatch can target it.

## Tokens and Permissions

GitLab v1 uses token-based setup and does not include an OAuth connection flow. Oratorio stores tokens in GitLab project profiles; each configured project needs its own profile. Prefer a project access token when possible because its blast radius is limited to one project. Group access tokens and personal access tokens also work, but they can cover more projects and may be entered into multiple project profiles.

Recommended minimum scopes:

- Read sync: `read_api`, with project read access for the token identity.
- Repository read and delivery: `read_repository` and `write_repository`.
- Notes, discussions, commit statuses, and MR creation: `api`.

GitLab writes appear in GitLab as the target project profile's token identity. Settings only shows whether each project profile has a token; plaintext is never returned after save.

## Endpoint and Project Path

GitLab.com can use the default endpoint:

```text
https://gitlab.com
```

For self-managed GitLab, use the instance root URL:

```text
https://gitlab.company.example
```

The GitLab API URL is derived from the endpoint as `<endpoint>/api/v4`; Desktop settings only need the instance root URL.

Project paths use GitLab's path-with-namespace:

```text
group/project
group/subgroup/project
```

The Projects page stores GitLab projects as canonical source keys, for example:

```text
gitlab:gitlab.company.example/group/subgroup/project
```

This key is used for DotCraft workspace routing so GitHub and GitLab projects with the same `group/project` display remain unambiguous.

The GitLab project card is also the profile editing surface. Each profile key is:

```text
gitlab:<host>/<group[/subgroup]/project>
```

The profile contains:

- token kind label, such as `projectAccessToken`, `groupAccessToken`, or `personalAccessToken`;
- GitLab API token;
- webhook secret token;
- Standard Webhooks signing token.

Removing a GitLab project removes its profile secrets on the next Settings save. Changing the GitLab endpoint host does not carry old-host profile secrets to the new host; configure new profiles for the new instance.

## Webhooks

Use the Oratorio server GitLab webhook endpoint as the GitLab webhook URL:

```text
/api/v1/sources/gitlab/webhook
```

Two verification modes are supported:

- Secret token read from the matching project profile and checked against GitLab's `X-Gitlab-Token`.
- Standard Webhooks signing token read from the matching project profile, preferred for signed deployments.

The webhook payload must include a project path. Oratorio selects that project's profile first, then verifies signing headers or `X-Gitlab-Token`. A configured project with no profile or no matching secret returns `403`.

Local webhook bypass is available for local development only.

## Scheduled Sync

Settings > Sources can enable scheduled pulls separately for GitHub and GitLab.
Schedules are off by default; when one is enabled, the first automatic pull runs
at `now + interval` and does not fire immediately.

- The default interval is 5 minutes.
- Valid intervals range from 1 minute to 24 hours.
- Scheduled sync only runs incremental sync; Full repair stays manual.
- If provider read capability is unavailable, the switch is disabled and points
  the operator to complete read-sync setup first.
- Background schedule failures appear only inside the affected provider card and
  do not raise global toast notifications.

## Commit Status Merge Gate

For GitLab MRs, Oratorio approve/request changes/reject decisions write the `oratorio/review` commit status:

- approve writes a success status;
- request changes or reject writes a failed status;
- re-review does not write GitLab status.

To block merges until Oratorio review passes, configure the GitLab project to require the `oratorio/review` status check or external status gate.

## Known Limits

- Oratorio v1 does not call the GitLab MR Approval API.
- Request changes appears in GitLab as a note plus failed commit status; it is not the same as GitHub's review state.
- Publishing one Oratorio Review Draft to GitLab can create multiple GitLab MR discussions.
- GitLab webhook creation is still configured manually in GitLab.

## Troubleshooting

- Missing token: Sources shows read/write capability as missing credentials.
- Invalid endpoint: verify that the endpoint has no userinfo, query, or fragment; diagnostics show the sanitized URL.
- Missing project: confirm the GitLab project path is configured in Settings > Projects.
- Missing profile: configure the project profile token on the GitLab project card. The provider may show `partial` when some projects work and others are missing profiles.
- Missing workspace route: map the canonical GitLab key to a local DotCraft workspace in Projects.
- Failed sync: Sources shows recent failed projects and errors.
- Failed write: Task detail Source Write audit and Sources diagnostics show recent GitLab write failures.
- Failed delivery: confirm the token has `write_repository` and `api`, the local workspace is a clone of the target GitLab project, and the target branch can be pushed. After fixing permissions, retrying delivery reuses completed commits and branch pushes, then creates only the missing MR.
