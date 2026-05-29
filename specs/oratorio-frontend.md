# Oratorio Desktop Frontend Specification

| Field | Value |
| --- | --- |
| Version | 1.1.0 |
| Status | Living |
| Date | 2026-05-27 |
| Parent Spec | [Oratorio Design](./oratorio-design.md) |

This document is the canonical frontend contract for the Oratorio Desktop
renderer.

The Oratorio Desktop renderer is the project board and compact status surface
for agent work. It is not the DotCraft Desktop agent client. Detailed AppServer
conversation, approval decisions, plan inspection, diff/file/terminal/preview
views, model selection, stop controls, and general follow-up turns belong in
DotCraft Desktop. The Task detail Discussion may expose the narrow
Oratorio-owned `Ask agent` flow for Agent Discussion Turns.

---

## 1. Scope

In scope:

- the board header with Oratorio brand identity and the Settings entry;
- the Kanban board, filters, search, cards, drag-and-drop, and undo feedback;
- the Status-only Task Drawer;
- Settings for implemented local preferences, source status/configuration,
  runtime posture, isolation, and review policy;
- the Electron window chrome that wraps the desktop renderer;
- responsive layout, accessibility, and visual quality for those surfaces.

Out of scope:

- embedded Conversation, Approvals, Plan, Diff, Files, Terminal, or Preview tabs;
- embedded prompt composers, model pickers, or stop buttons;
- general-purpose chat with the AppServer thread;
- coming-soon top-level routes such as Sources, Agents, Rules, or Integrations;
- a full review console inside the Oratorio renderer;
- replacing DotCraft Desktop.

---

## 2. Information Architecture

Default route:

```text
/projects/:workspaceId
```

Task drawer route:

```text
/projects/:workspaceId/tasks/:shortId
```

Task detail route:

```text
/projects/:workspaceId/tasks/:shortId/detail/:stage
```

Settings route:

```text
/settings/:section
```

Legacy routes such as `/queue`, `/items/*`, `/sources`, `/agents`, `/rules`,
and `/integrations` may redirect to the board while compatibility is needed, but
they are not visible navigation entries.

The normal board route has no dedicated navigation rail or vertical divider.
Settings lives in the board header action group beside board actions. The
Oratorio logo and product name live in the board header next to the `Kanban`
mode label.

If a feature does not have a real implemented contract, it is omitted rather
than shown as coming soon.

---

## 2.1 Desktop Shell

Oratorio Desktop uses a custom Electron titlebar instead of native Electron
menus or title chrome. This shell is visible when the Electron preload API is
available; the Oratorio renderer is not a standalone browser product.

The Desktop titlebar owns only window and runtime controls:

- back and forward navigation;
- server status plus restart;
- reload, force reload, DevTools, zoom, and fullscreen diagnostics;
- minimize, maximize or restore, and close window controls.

The titlebar is 36px tall, has no Oratorio logo or title text, and leaves
product identity in the board header. New Task and Settings remain in the board
header action group. The titlebar follows the active Oratorio light or dark
theme after the app loads; startup and error pages may use a safe fallback
theme before the renderer is available.

### 2.2 DotCraft App Binding UX

DotCraft App Binding is surfaced as a compact connection status and consent
flow, not as an embedded DotCraft conversation surface.

Deep-link behavior:

- `oratorio://dotcraft/connect` may restore and foreground Oratorio so the user
  can authorize the app connection.
- `oratorio://dotcraft/bind` must be handled silently when Oratorio is already
  running. It may deliver the handoff to the renderer, but it must not focus or
  foreground the window during DotCraft Welcome first-turn binding.
- Deep links received during cold start or local server startup must be queued
  until the Desktop server URL is available; Oratorio must not inspect or approve
  App Binding requests before the server API can be reached.

The Desktop titlebar may show a DotCraft connection affordance immediately to
the left of the server status control. This affordance indicates the DotCraft
App Binding app connection state only. It does not replace the server/AppServer
health status and does not imply a specific thread binding. The connected state
uses the DotCraft brand icon plus the shared themed tooltip primitive.

The App Binding consent dialog must follow Oratorio modal and density language:

- connection consent shows the requesting DotCraft workspace/user, app identity,
  expiry, and a short statement that thread access remains a separate DotCraft
  selection;
- thread binding consent, when shown by policy, summarizes the requested thread,
  scopes, and tools with compact badges or rows;
- loading, error, cancel, and approving states remain visible and accessible;
- success, failure, and follow-up messages use the shared Oratorio notice/toast
  style.

---

## 3. Kanban Board

The board title lockup shows the Oratorio logo, a small `Kanban` label, and the
primary title `Oratorio`.

The board owns:

- search;
- repository and assignee filters;
- source and label advanced search qualifiers;
- new local task;
- refresh;
- a top-level view switcher with `Active`, `All`, `Cancelled`, and `Archived`;
- four Active Kanban columns: `todo`, `in_progress`, `in_review`, `done`;
- paged list views for `All`, `Cancelled`, and `Archived`;
- task cards;
- drag-and-drop operations;
- loading, empty, error, reconnect, and undo states.

Column labels:

| TaskStatus | Label |
| --- | --- |
| `todo` | To do |
| `in_progress` | In progress |
| `in_review` | In review |
| `done` | Done |

`cancelled` remains a backend/API TaskStatus projection for rejected and
archived tasks, but it is not rendered as an Active board column. Closed work is
available through explicit list views:

| View | Shape | Source query |
| --- | --- | --- |
| `Active` | Kanban | Active lifecycle states only |
| `All` | List | `includeArchived=true`, newest updated first |
| `Cancelled` | List | `state=rejected`, newest updated first |
| `Archived` | List | `state=archived`, newest updated first |

Closed list views page results and automatically load the next page when the
user scrolls near the end while `nextCursor` is present. Changing view, search,
or filters resets the current list page.

Cards show compact board information only:

- micro-status dot;
- source chip;
- kind chip;
- title;
- one-line brief/summary preview;
- lifecycle/source/check badges;
- updated time.

Cards do not show full source body, raw agent output, worktree paths, or long
technical identifiers.

The Local Task create/edit form keeps task intent first, then routing metadata:

- title and description remain the primary fields;
- repository, labels, assignee, and base branch provide typed input plus
  quick-pick candidates when known data exists;
- `Base branch` is the optional source branch/base ref for task runs, not the
  generated work branch name;
- clicking `Create task` starts a short non-blocking celebration from the
  button position before the create request completes;
- successful task creation shows the actionable notice
  `New task "<title>" created. Click to view details.`;
- clicking that notice opens the created task in the Task Drawer;
- reduced-motion users receive the success notice without animated particles.

### 3.1 Card Visual Contract

Card content composes a small fixed set of element classes; each class has one
visual treatment and may not borrow another class's treatment:

| Element | Role | Treatment |
| --- | --- | --- |
| Source chip | Where the task lives (Local, GitHub repo, GitLab project) | Compact pill with provider icon at the shared chip-icon size |
| Kind chip | Work kind (PR, Issue, Local task) | Compact pill with kind icon at the same chip-icon size as the source chip |
| Status pill | Lifecycle/check state, shown only when it adds signal beyond the column | Themed pill following the status-pill modes below |
| Micro-status dot | Always-on per-card lifecycle indicator | Filled circle at the dot-indicator size token, colored by state |

Source chip and kind chip icons must render at the same optical weight. Both
use the `chip-icon` size token and the global lucide stroke width. Provider
chips for sources without a real glyph (such as Local tasks) must use the
designated Local source icon — never a degenerate one-pixel placeholder or a
shrunken variant.

Card header order, left to right: source chip, kind chip. Stable ShortId remains
available in routes and drawer/detail headers, but is not shown as a board-card
chip. The title sits on its own row beneath the chip row and never shares
horizontal space with chips. The micro-status dot lives on the title row's right
edge and never sits inside the chip row.

Status pills follow one of three visual modes by lifecycle category:

| Category | Examples | Treatment |
| --- | --- | --- |
| Success | `Approved`, `Passing` | Filled success-tint background, on-tint label, optional check icon |
| Attention | `Attention`, `Failed`, `Locked` | Outlined with attention or destructive border + matching icon, neutral surface |
| Neutral | `Discovered`, `Awaiting review`, `Pending` when not redundant | Outlined neutral border, neutral label |

A single card must not mix pill modes for the same logical category — for
example, an `Approved` filled pill next to a `Passing` outlined pill is a
regression. Status pills that share a card use the same mode.

The micro-status dot is the always-on per-card lifecycle indicator; the footer
status pill is shown only when it adds signal beyond the card's column. Kanban
card footers therefore hide lifecycle pills that merely restate the column —
`Discovered` in `To do`, `Awaiting review` in `In review`, and `Approved` in
`Done` — relying on the column, the colored dot, and the accent edge instead.
`Running` renders as an animated spinner (no text); `Dispatching`, `Failed`, and
the terminal `Rejected` / `Archived` keep their themed pills. The full lifecycle
pill — including `Discovered`, `Awaiting review`, and `Approved` — remains on the
status drawer and detail page, which are not column-grouped.

Card footers also hide review/check pills that do not add card-level triage
signal. `Not configured` is never shown on cards, and `Pending` is hidden when
the lifecycle state is already `Dispatching` or `Running`. Full check state
remains available in the detail page and status drawer where `oratorio/review`
has enough context.

---

## 4. Status Drawer

The Task Drawer has no tabs. It renders only Status.

Status may show:

- current lifecycle state and TaskStatus;
- latest run kind, attempt, status, progress, and concise summary/error;
- compact thread/worktree identifiers when available;
- task metadata such as repository, branch, assignee, round, source lifecycle,
  HEAD, and last sync;
- compact brief summary;
- counts for review drafts, implementation drafts, follow-ups, source writes,
  and comments;
- board-safe actions such as dispatch, retry, archive, reopen, edit local task,
  re-review PR, and copy task id when backend gates allow them;
- a persistent `Open detail page` action in the drawer overflow menu, routing to
  the existing task detail page for deeper inspection when Status is not enough.

Status must not show:

- AppServer conversation rows;
- AppServer approval cards or approval buttons;
- plan snapshots or plan todos;
- prompt composer, model selector, or stop button;
- embedded Diff, Files, Terminal, or Preview tabs.

The Task detail page, reached through `Open detail page`, may render a compact
Discussion composer with separate `Add comment` and `Ask agent` actions. `Add
comment` records internal operator feedback. `Ask agent` creates an Agent
Discussion Turn only when the backend reports an eligible completed AppServer
thread and no active Discussion Turn. The Status Drawer must not render this
composer; it may only show comment/discussion counts and route operators to the
detail page.

When a GitHub pull request's current head SHA differs from the latest
successful AppServer review analysis run, the Status Drawer and Task detail page
may expose a `Re-review PR` or `Review latest commit` action. This action calls
the Oratorio re-review endpoint directly; it must not be implemented by adding a
comment, creating an Agent Discussion Turn, or recording `requestChanges`.

If operators need execution detail, they use DotCraft Desktop. A future Desktop
handoff button may be added only after a stable deep-link contract exists.

### 4.1 Drawer Section Hierarchy

Drawer sections use one of four section types. Each type has a fixed surface
treatment so a single glance identifies the section's role:

| Type | Purpose | Treatment |
| --- | --- | --- |
| Action | The primary operator action (e.g. `Record decision`, `Dispatch round`) | Accented surface, primary CTA inside; nothing else competes with the CTA |
| State | Current lifecycle / run status (e.g. `Awaiting review`, `mock attempt N`) | Left-edge state-color stripe, status icon, status label |
| Info | Read-only narrative (e.g. `Summary`) | Plain surface, no accent, body text |
| Stats | Compact counts of related artifacts (e.g. `Review artifacts`) | Plain surface, individual counts |

The primary `Action` section must remain reachable when the drawer overflows.
The drawer either pins the primary `Action` section to the bottom of the
scroll container or guarantees the primary CTA stays visible. Secondary
actions like `Add comment` may scroll with content.

`Stats` sections de-emphasise zero counts: the digit `0` and its label render
in a muted text color and one weight lighter than active counts. Non-zero
counts render with the standard text color and may take on a category accent
when relevant (e.g. unresolved comments tint with attention).

Drawer section header icons follow the same `chip-icon` size token as card
chips. Stacking identical neutral surfaces with identical icon weight for
sections of different types is a regression — each section type must read
distinctly.

---

## 5. Task Detail Page

The Task detail page is the deeper review surface reached from the drawer's
`Open detail page` action and from any deep link. It is in scope for the
Oratorio Desktop renderer; deeper agent execution surfaces remain in DotCraft
Desktop.

### 5.1 Routing

The detail route is `/projects/:workspaceId/tasks/:shortId/detail/:stage`,
where `:stage` is one of `intake`, `analysis`, `review`, `decision`, or
`closed`.

- The selected stage must match the URL `:stage` segment exactly. Mounting
  the detail page must not silently override the URL with
  `defaultReviewStage(item)`.
- When the route has no `:stage` segment, the renderer falls back to
  `defaultReviewStage(item)` and replaces the URL with the resolved stage.
- Changing tabs inside the page updates the URL; refreshing or sharing the
  URL lands on the same stage.

### 5.2 Header

The detail page header is a single-title surface:

- the breadcrumb row contains source chip, kind chip, ShortId, repo path,
  and the current status pill — never the title;
- the page title renders once as an `H1` beneath the breadcrumb;
- the metadata row beneath the title shows branch, assignee, round, and last
  sync time as compact icon + label pairs at the `metadata-icon` size.

Duplicating the task title inside the breadcrumb is a regression.

### 5.3 Sub-pill row

The chip row in the detail page header carries four conceptual classes; each
class renders with a distinct visual treatment:

| Class | Examples | Treatment |
| --- | --- | --- |
| Source | `Local`, GitHub icon + `dotcraft/server`, GitLab icon + project | Provider chip with provider icon at `chip-icon` size |
| Repo | `dotcraft/server` | Plain text chip in monospace; rendered only when the source resolves to a multi-repo provider |
| ID | `task:seed-auth-review` | Monospace chip, no icon, neutral surface |
| Status | `Attention`, `In review`, `Awaiting review` | Status pill following §3.1 pill modes |

The four classes must not collapse into one visually identical chip style.

### 5.4 Review stage stepper

The five-stage stepper is the page's primary status visualization:

- **Completed** stages render as a filled node in the success accent with a
  centered checkmark glyph.
- **Current** stage renders as a filled node in the primary accent with a
  soft outer halo or pulse; the surrounding ring is visibly thicker than the
  completed node ring.
- **Pending** stages render as an outlined empty node in the muted/neutral
  color, no fill.
- The **connector line** fills with the success accent up to the current
  stage; pending segments stay neutral.

Each node shows the stage name and a per-stage status sublabel
(e.g. `Succeeded`, `Completed`, `In progress`, `Open`, `Pending`).

### 5.5 Decision actions

The detail page's primary decision actions are `Approve`, `Request changes`,
and `Reject`. They follow a strict visual hierarchy:

- `Approve` is the primary affirmative — filled primary CTA, leftmost in the
  action row, widest button in the row.
- `Request changes` is the secondary feedback action — outlined neutral
  button, sitting next to `Approve`.
- `Reject` is the terminal destructive action — outlined destructive style,
  separated from the other two by a gap or divider so a careless
  click on `Approve` cannot land on `Reject`.

The decision action panel is sticky to the bottom of the detail page when
the page content overflows the viewport. Scrolling never hides the primary
decision actions.

### 5.6 Empty states

Detail page empty states (no decisions, no comments, no follow-ups, no
timeline) render with a muted lucide icon at the `empty-state-icon` size
above the empty-state copy. Plain-text empty states without an icon are a
regression for the detail page.

### 5.7 Review finding resolution

The review stage renders published review findings (design §5.7). Each finding
shows its resolution state:

- open findings render at full emphasis;
- resolved findings render visibly de-emphasized (muted surface, reduced
  emphasis) with a resolution chip showing the kind (`Fixed` or `Dismissed`),
  the resolver (`agent` or `operator`), and the optional note;
- finding tallies on the review surface count open findings only; resolved
  findings stay visible for audit and are not silently removed.

When backend gates allow, the detail page exposes an operator `Resolve` control
on an open finding and a `Reopen` control on a resolved finding; resolving
prompts for the `Fixed`/`Dismissed` kind and an optional note. These controls
are detail-page only. The Status Drawer must not render resolve/reopen controls;
it may only surface open-finding counts and route operators to the detail page,
consistent with the Discussion composer rule in §4.

---

## 6. Settings

Settings is the only non-board navigation destination.

Allowed Settings content:

- General local preferences such as theme;
- Repository cards that combine GitHub repository identity, DotCraft workspace
  path, workspace/AppServer health, and a desktop folder picker when available;
- GitHub installation profiles grouped by GitHub instance and owner inside
  Project routing, with detected/manual status, retry detection, and manual
  installation ID override;
- GitLab project profiles inside Project routing, keyed by canonical
  `gitlab:<instance>/<group[/subgroup]/project>` project keys, with token kind,
  token, webhook secret, signing token, and missing-profile status;
- Source provider cards that show GitHub/GitLab read status, manual sync,
  Full repair, scheduled incremental sync, next run, and provider-local
  background failures;
- Credentials presence and write-only password-style inputs with show/hide
  controls that never echo stored plaintext;
- Agents configuration for DotCraft bridge status, AppServer endpoint
  discovery, Hub discovery, approval policy, and run timeout;
- Worktree configuration for managed worktrees, concurrency, retry, cleanup,
  and implementation auto-dispatch policy;
- Review configuration for PR Auto Review triggers and Review Draft
  auto-publish policy.

Settings must never render stored token, webhook secret, private key, or private
key path values. It may render write-only inputs whose typed values are cleared
after the save response. Empty secret inputs leave existing values unchanged.
Auto-start command and process argument inputs are not Settings content.
The legacy global GitHub Installation ID is not Settings content. GitHub
installation IDs appear only as owner profiles in Project routing.
Legacy global GitLab token, webhook secret, and signing-token fields are not
Settings content. GitLab credentials appear only on GitLab Project routing
cards, and changing the GitLab endpoint host clears old project profiles from
the draft with restart/impact copy.

Configuration saves that require process restart show a pending restart banner at
the top of Settings. Desktop builds offer a restart button through the desktop
bridge when available; test or preview contexts without the bridge show the
manual restart requirement. Saving settings must not use a native confirmation
dialog.

Settings actions use one compact visual language. Group-level actions such as
`Start server`, `Discard`, and `Save` live in the Settings group header action
area. Row controls are reserved for status, form controls, toggles, and
read-only values. Page-level refresh uses an icon-only action with
accessible label/title text, matching the board toolbar instead of rendering a
large text button.
Settings row controls must not expose browser-native select menus or native
number spinners. Single-choice controls use the Oratorio themed listbox/dropdown
vocabulary, with accessible labels, keyboard navigation, visible focus,
disabled, highlighted, and selected states. Numeric editing uses the themed
compact stepper input; time-based values compose that stepper with a themed unit
dropdown. Display labels may be human-readable, but configuration values, API
payloads, and the Configuration Overlay shape remain unchanged.
The DotCraft bridge `Start server` action is visible whenever the bridge
status is not connected or any configured workspace inventory row is not
connected.

Review Settings manage repository allowlists with compact cards rather than
per-repository switches. Each allowlist card shows the included repository
count, selected repositories, row-level remove actions, and a `Manage` action.
`Manage` opens a searchable checkbox dialog sourced only from configured source
projects. Dialog saves update the Settings draft only; the page-level
`Save` action still commits configuration to the backend. The Review Settings
dialog must not invent project metadata such as per-project last-indexed times
unless that data is available in the Settings API.

Repository Settings must not expose a fallback workspace. Every AppServer run
must resolve its workspace from the item repository's configured mapping.

---

## 7. Visual Rules

- Board mode does not reserve a rail column.
- The Oratorio logo and product name remain visible in the board header.
- The Settings icon remains in the board header action group.
- Board toolbar controls align to a shared control height.
- Dense toolbars use icons with accessible labels.
- Cards and drawers use compact, scan-friendly rows.
- Settings form controls share the board toolbar control language for borders,
  radius, hover, focus, pressed, disabled, selected, and light/dark states.
- Avoid marketing hero sections, decorative gradients, and placeholder feature
  pages.
- Text must not overflow its container at desktop or mobile widths.
- Light and dark themes keep the same structure and density.
- Shell, sidebar, Settings groups, and modal surfaces may use the shared
  light glass recipe: semi-transparent surfaces, subtle backdrop blur, thin
  borders, and soft highlights. The effect must stay low-strength so dense
  board content and Settings rows remain crisp; task cards and content-heavy
  cards should not become blurred glass panels by default.
- Scrollbars inside the Desktop renderer use theme tokens in both light and dark
  themes. Vertical and horizontal scrollbars remain thin, low-contrast, and
  visually secondary to content; native bright tracks or arrow buttons must not
  appear inside the app shell.
- Board column and horizontal board scrollbars are visually hidden until the
  user hovers, focuses, presses, or drags over the board scroll area. Other
  Settings, drawer, and modal scroll containers keep the normal app scrollbar
  treatment.

### 7.1 Icon System

The icon system is `lucide-react`. Inline SVGs that visually duplicate lucide
glyphs at different stroke widths are a regression — re-use the lucide icon.

- Default `strokeWidth` is `1.75` across the renderer. Individual icons may
  not override this without a documented reason in the surrounding component.
- Icon size tokens by role:

| Token | Size | Role |
| --- | --- | --- |
| `dot-indicator` | 8px | Card micro-status dot |
| `chip-icon` | 14px | Source/kind chip icon, status pill icon |
| `metadata-icon` | 14px | Detail page metadata row (branch, assignee, round, sync) |
| `button-icon` | 16px | Button leading/trailing icons |
| `section-header-icon` | 16px | Drawer and detail section header icons |
| `empty-state-icon` | 24px | Empty-state illustration glyph |
| `stepper-node-icon` | 12px | Checkmark or status glyph inside a stepper node |

Mixing sizes for the same role (for example, a 16px source chip icon next to
a 10px kind chip icon) is a regression. New icon roles add a new token rather
than borrowing an existing one with a one-off override.

### 7.2 Accent Palette

The accent palette has fixed semantic roles. Accents must not be repurposed
for decorative gradients or unrelated emphasis.

| Accent | Roles |
| --- | --- |
| Primary (blue) | CTAs, active tab, current stepper node, focus rings, selected filter |
| Success (green) | Completed lifecycle states, passing checks, completed stepper nodes, success pills |
| Attention (amber) | States the operator must react to (`Attention`, `Awaiting review`); outlined-color pills |
| Destructive (red) | Reject CTA, terminal failures, destructive outlined buttons |
| Neutral (zinc/slate) | All other surfaces, text, and borders |

The status pill catalogue lives in §3.1. The drawer section type catalogue
lives in §4.1. The stepper visual contract lives in §5.4.

---

## 8. Validation

A frontend change is acceptance-ready when:

- it matches this document and does not revive out-of-scope embedded agent
  surfaces;
- `cd desktop && npm run build` passes;
- `cd desktop && npm test` passes when tests are affected;
- the board renders without framework overlays or console errors;
- the board header shows logo plus `Oratorio`, and the old rail divider is not
  present;
- the Kanban title and filter toolbar are visually aligned;
- opening a task shows a Status-only drawer;
- card source chip and kind chip icons render at the same optical weight
  (no mismatched tiny/large icons in a single card row);
- status pills follow the §3.1 mode rules — a card does not mix filled
  success pills with outlined success pills for the same category;
- the Task detail page renders the stage named by the URL `:stage` segment
  and does not always render the Decision panel;
- the Task detail page title appears once below the breadcrumb, never
  inside it;
- decision actions follow the §5.5 hierarchy and the decision panel is
  sticky to the bottom when the page overflows;
- the drawer primary action remains reachable when content overflows;
- detail page empty states render with the §5.6 empty-state icon.
