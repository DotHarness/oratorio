# Local Support Matrix

This table summarizes which parts of Oratorio already work in a fully local setup and which parts still assume a GitHub/GitLab remote. It is a snapshot of the current implementation, not a forward-looking roadmap.

| Concept | Current capability | External source dependency |
| --- | --- | --- |
| Project (agent work container) | One DotCraft workspace maps one-to-one to one Project; Oratorio stores the project board and agent task-management state locally. | No |
| Local Task | Operator-created work items with title, body, repository, branch, labels, comments, rounds, decisions, and timeline, all stored locally. | No |
| GitHub Issue | Read-synced from GitHub and supports comment write-back plus implementation delivery. | GitHub |
| GitLab Issue | Read-synced from GitLab and supports note write-back plus MR delivery. | GitLab |
| Pull Request / Merge Request | GitHub pull requests and GitLab merge requests are modeled; there is no first-class local PR/MR concept today. | GitHub/GitLab |
| Round / Run / Decision / Comment / Timeline | Review cycles, run attempts, operator decisions, comments, and timeline events are owned by the Oratorio backend without any external dependency. | No |
| Board / Card / Status Drawer | Drag-and-drop board, ShortId, and the Status-only Drawer work without an external source. Browser Conversation, Approvals, and Plan surfaces are intentionally out of scope; use DotCraft Desktop for detailed agent interaction. | No |
| Managed worktree (Run isolation) | The backend prepares an isolated workspace for each AppServer Run; the current implementation is bound to git. | Git-only |
| AppServer dispatch / agent round | Threads are started, reused, and streamed through the local DotCraft AppServer over stdio/WebSocket. | No |
| Review Draft (structured PR/MR review) | Agents submit structured review drafts through a runtime tool; inline findings distinguish applicable code suggestions from reasoned comment-only findings; GitHub PRs and GitLab MRs can publish to their source. | GitHub/GitLab |
| Implementation Draft (auto PR/MR delivery) | Agents submit structured implementation drafts; the delivery pipeline can create a GitHub PR or GitLab MR. | GitHub/GitLab |
| Source Write audit | Every write-back (comment/note, review/discussion, status, commit, branch push, PR/MR creation) is audited. | GitHub/GitLab |
| Settings / Configuration / Diagnostics / Status | Settings read/write, the Configuration Overlay, diagnostics report, and AppServer/Hub/worktree status are all local-only. | No |
| Mock runner | Drives the full Round/Run lifecycle without git or any external service, useful for rehearsals and offline UI work. | No |

## How to Read It

- `No` means the capability works without an external source remote.
- `GitHub` / `GitLab` / `GitHub/GitLab` means the capability depends on the corresponding source adapter or credentials.
- `Git-only` means the capability does not necessarily depend on GitHub, but the current implementation depends on a Git worktree / repository.
