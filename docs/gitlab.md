# GitLab Integration

Connect GitLab when you want Oratorio to bring real GitLab issues and merge requests onto the board. Oratorio can import work, keep cards fresh, show the latest conversation, and, when you allow writes, publish notes, review feedback, review status, and delivered merge requests back to GitLab.

> [!NOTE]
> If you are setting up Oratorio for the first time, start with [Getting Started](/getting-started). This page covers the GitLab-specific pieces. For DotCraft setup, see [Connect to DotCraft](/dotcraft-workspaces); for every Settings field, see [Configuration Reference](/configuration).

## Before You Start

You will need:

- access to the GitLab project you want to connect;
- a GitLab token for each project;
- the same project opened and working in DotCraft;
- a reachable Oratorio server address if you want GitLab webhooks to update the board automatically.

If Oratorio is only running on your laptop and GitLab cannot reach it, that is fine. Manual sync and scheduled sync still work.

## Add The Project In Oratorio

Open **Settings → Credentials → GitLab**.

- Keep the default GitLab endpoint for GitLab.com.
- For a self-managed GitLab server, enter the server's main address. You do not need to add the GitLab API path yourself.
- Turn on **GitLab read sync** to import issues and merge requests.
- Turn on **GitLab writes** only when you want Oratorio to publish notes, review status, or delivered merge requests back to GitLab.

Then open **Settings → Projects** and add a GitLab project row.

- In **GitLab project**, enter the project path as it appears in GitLab, such as a group and project name. Subgroups are supported.
- In **DotCraft workspace**, choose the local folder already opened in DotCraft.
- On the same project card, add the GitLab token and any webhook secret you plan to use.

Save the settings. If Oratorio asks for a restart, restart the local server before testing the connection.

## Create The GitLab Token

For most teams, a **Project Access Token** is the best fit because it is limited to one project. A group token or personal token can also work, but it can reach more than one project, so treat it with extra care.

Use the smallest access that matches what you want Oratorio to do:

| What you want | GitLab access to allow |
|---|---|
| Import issues and merge requests only | read API access |
| Read repository details for review | repository read access |
| Deliver implementation work as a merge request | repository write access |
| Publish notes, discussions, review status, or merge requests | API access |

Oratorio never shows saved token values again. To keep an existing token, leave the field empty. To replace it, paste a new value and save.

## Add A GitLab Webhook

Webhooks are optional, but they make Oratorio react faster when an issue or merge request changes in GitLab.

In GitLab, open the project webhook settings and add a webhook that points to your Oratorio server address followed by /api/v1/sources/gitlab/webhook.

Use the same secret or signing token that you saved on the GitLab project card in Oratorio. Enable events for issues, merge requests, and comments or notes. After saving, use GitLab's test button if available, then check **Settings → Sources** in Oratorio for webhook status.

If the webhook test cannot reach Oratorio, check whether your Oratorio server is available from GitLab. A local-only desktop session usually cannot receive GitLab cloud webhooks directly.

## Sync And Review

Open **Settings → Sources** to see GitLab status.

- Use **Pull now** when you want an immediate import.
- Turn on a schedule if you want Oratorio to check GitLab periodically.
- Use full repair only when you want Oratorio to re-check the whole configured project.

When you review a GitLab merge request from Oratorio:

- **Approve** records a passing Oratorio review status in GitLab.
- **Ask for changes** leaves feedback and records that the Oratorio review still needs work.
- **Reject** records that the work should not move forward.

GitLab does not have the same native review states as GitHub, so Oratorio uses notes and review status to make the decision visible in GitLab.

## Troubleshooting

**No GitLab cards appear.** Check that read sync is on, the project path is correct, the project has a token, and the project is mapped to a DotCraft workspace.

**One project works but another does not.** Each GitLab project needs its own project card and token. Re-open **Settings → Projects** and check the affected card.

**Webhook updates do not arrive.** Confirm the webhook URL is reachable from GitLab, the secret or signing token matches, and the webhook includes issue, merge request, and note events.

**Writes fail.** Confirm GitLab writes are on, the token has the access needed for the action, and the local workspace is a clone of the same GitLab project.

**Delivery cannot create a merge request.** Confirm the token can push branches and create merge requests, and that the target branch accepts new merge requests.

**You changed the GitLab server address.** Re-enter the project tokens after saving. Oratorio treats projects on a different GitLab host as separate connections.
