# GitHub Integration

Connect GitHub when you want Oratorio to bring real GitHub issues and pull requests onto the board. Oratorio can import work, keep cards fresh, show the latest discussion, and, when you allow writes, publish comments, pull request reviews, review checks, and delivered pull requests back to GitHub.

> [!NOTE]
> If you are setting up Oratorio for the first time, start with [Getting Started](/getting-started). This page covers the GitHub-specific pieces. For DotCraft setup, see [Connect to DotCraft](/dotcraft-workspaces); for every Settings field, see [Configuration Reference](/configuration).

## Before You Start

You will need:

- access to the GitHub repository or organization you want to connect;
- a GitHub App installed on the repositories Oratorio should use;
- the same project opened and working in DotCraft;
- a reachable Oratorio server address if you want GitHub webhooks to update the board automatically.

If Oratorio is only running on your laptop and GitHub cannot reach it, that is fine. Manual sync and scheduled sync still work.

## Create Or Reuse A GitHub App

Use a GitHub App when you want the full integration. A token can be enough for read-only importing, but Oratorio needs a GitHub App for comments, pull request reviews, review checks, and delivered pull requests.

Create the app under the user or organization that owns the repositories. Install it only on the repositories you want Oratorio to access.

Use the smallest set of permissions that matches what you want Oratorio to do:

| What you want | GitHub permission to allow |
|---|---|
| Import issues and pull requests | Issues read access and pull requests read access |
| Show pull request files and discussion | Pull requests read access |
| Publish issue comments or pull request reviews | Issues write access and pull requests write access |
| Show an Oratorio review check | Checks write access |
| Deliver implementation work as a pull request | Contents write access and pull requests write access |

Generate a private key for the app. You can paste the private key into Oratorio or point Oratorio at a private key file on disk.

## Add The Repository In Oratorio

Open **Settings → Projects** and add a GitHub repository row.

- In **GitHub repository**, enter the owner and repository name.
- In **DotCraft workspace**, choose the local folder already opened in DotCraft.
- Save the settings.

After you add a repository, Oratorio shows **GitHub installation profiles** below the project list. A profile is shared by repositories under the same GitHub owner.

Click the detect button to let Oratorio find the installation automatically. If detection cannot find it, paste the Installation ID from the GitHub App installation page.

## Fill GitHub Credentials

Open **Settings → Credentials → GitHub credentials**.

- Keep the default endpoint for GitHub.com.
- For GitHub Enterprise, enter the GitHub API base address for your server.
- Enter the GitHub App ID.
- Add the private key or private key path.
- Add the webhook secret if you plan to use webhooks.
- Turn on **GitHub writes** only when you want Oratorio to publish comments, reviews, checks, or delivered pull requests.

Save the settings. If Oratorio asks for a restart, restart the local server before testing the connection.

## Add A GitHub Webhook

Webhooks are optional, but they make Oratorio react faster when an issue or pull request changes in GitHub.

In the GitHub App settings, add a webhook that points to your Oratorio server address followed by /api/v1/sources/github/webhook.

Use the same webhook secret you saved in Oratorio. Subscribe to issue, pull request, issue comment, pull request review, and pull request review comment events.

If the webhook test cannot reach Oratorio, check whether your Oratorio server is available from GitHub. A local-only desktop session usually cannot receive GitHub cloud webhooks directly.

## Sync And Review

Open **Settings → Sources** to see GitHub status.

- Use **Pull now** when you want an immediate import.
- Turn on a schedule if you want Oratorio to check GitHub periodically.
- Use full repair only when you want Oratorio to re-check the whole configured repository.

When you review a GitHub pull request from Oratorio:

- **Approve** publishes an approval and records a passing Oratorio review check.
- **Ask for changes** publishes review feedback and records that the Oratorio review still needs work.
- **Reject** records that the work should not move forward.

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/github-review.png" alt="An Oratorio GitHub App review with an inline finding and a resolved follow-up comment on a pull request" />

When an implementation draft is ready, Oratorio can also push a branch and open a pull request, as long as GitHub writes are enabled and the app has the right repository access.

## Troubleshooting

**No GitHub cards appear.** Check that the repository is listed in **Settings → Projects**, credentials are saved, and **Settings → Sources** shows GitHub as ready to read.

**Installation profile is missing.** Confirm the GitHub App is installed on the repository owner. Then return to **Settings → Projects** and click detect again, or paste the Installation ID manually.

**Webhook updates do not arrive.** Confirm the webhook URL is reachable from GitHub, the webhook secret matches, and the app is subscribed to issue and pull request events.

**Writes fail.** Confirm GitHub writes are on, Oratorio is using GitHub App credentials rather than only a token, and the app has write access for the action.

**Delivery cannot create a pull request.** Confirm the app can write repository contents, the local workspace is a clone of the same GitHub repository, and the target branch accepts new pull requests.
