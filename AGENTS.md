# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Shape

Oratorio is an agent-addressable project board with two cooperating processes:

- **`server/Oratorio.Server.csproj`** — ASP.NET Core 10 (net10.0) headless backend. Owns durable state in SQLite (EF Core), source sync (GitHub/GitLab), DotCraft AppServer dispatch, review/implementation/follow-up drafts, worktree management, and the `/api/v1/*` + realtime board stream endpoints. Consumes `DotCraft.Sdk` from NuGet.
- **`desktop/`** — Electron + React 19 + Vite + TypeScript renderer. `electron-vite` splits the project into `src/main` (Electron main), `src/preload`, and `src/renderer/src` (React). The desktop shell launches/reuses the local backend via `OratorioServerManager` and talks to it over HTTP + WebSocket. Tests use Vitest with jsdom.
- **`tests/Oratorio.Server.Tests/`** — xUnit + `Microsoft.AspNetCore.Mvc.Testing` integration tests against the real `Program`.

Specs in `specs/` are the contracts. `oratorio-design.md` owns product/backend behavior; `oratorio-frontend.md` owns the renderer contract. Read these before changing review lifecycle, drawer scope, or source-provider semantics — they encode boundaries that the code follows but does not re-explain.

## Common Commands

```powershell
.\dev.bat                                                 # Recommended entry: installs desktop deps, runs electron-vite dev, which starts/reuses local backend
dotnet build Oratorio.sln                                 # Build backend + tests
dotnet run --project server\Oratorio.Server.csproj        # Backend only
dotnet test tests\Oratorio.Server.Tests                   # All backend tests
dotnet test tests\Oratorio.Server.Tests --filter <Name>   # Single test or class
cd desktop; npm install; npm run dev                      # Desktop only
cd desktop; npm test                                      # All renderer tests (vitest run --pool=forks)
cd desktop; npx vitest run path/to/file.test.tsx          # Single renderer test file
.\build.bat                                               # Release: publishes server as Windows x64 self-contained single-file, copies into desktop/resources/server, builds Electron installer
```

Release outputs land in `build/release/` (`Oratorio*.exe` installer plus `server/oratorio-server.exe`). `build.bat` deletes `build/` and `desktop/resources/server/` at the start — do not leave manual artifacts there.

## Backend Architecture

`server/Program.cs` is the composition root and wires every service explicitly. Layout:

- **`Api/`** — `OratorioEndpoints.cs` maps the HTTP API; `Contracts.cs` / `Mapping.cs` are the wire DTOs and mapping helpers; `OratorioApiException` carries HTTP status to the global error middleware.
- **`Data/`** — `OratorioDbContext` (SQLite), `OratorioEntities`, `OratorioEnums`, and `TaskStatusMapping`. Schema is applied at startup by `OratorioSchemaMigrator.ApplyAsync()`, not EF migrations. `OratorioSeeder` only runs when `Oratorio:SeedData` is true.
- **`Domain/Services/`** — `OratorioService` (the main board orchestrator), draft services (`ReviewDraftService`, `ImplementationDraftService`, `FollowUpDraftService`, `DiscussionTurnService`), `TaskBoardPlacementService`, `TaskShortIdAllocator`, settings/diagnostics, and the worker hosts (`MockRunWorker`, `DiscussionTurnWorker`, `ImplementationAutoDispatchWorker`, `AutoReviewDispatchWorker`, `WorktreeCleanupWorker`).
- **`Sources/`** — `ISourceProvider` with `GitHubSourceProvider` and `GitLabSourceProvider`, `SourceProviderRegistry`, `SourceSyncSchedulerService/Worker`, and `SourceWriteCanonicalKinds`. Any new external work source plugs in here.
- **`GitHub/`** + **`GitLab/`** — provider adapters: credential resolvers, API clients, sync coordinators/workers, write services. Both feed the same Task lifecycle; do not branch the rest of the system on provider.
- **`DotCraft/`** — bridge to the DotCraft AppServer (`AppServerRunCoordinator`, `AppServerRunWorker`, `AppServerPromptBuilder`, `DotCraftAppServerClient`, endpoint resolver, process manager) plus `WorktreeManager` and `OratorioAppBindingService` (handles the `oratorio://` protocol handoff).
- **`Realtime/`** — `BoardEventBroker` + `BoardStreamEndpoint` for the WebSocket push to the renderer; `DrawerStateService` and `DrawerPayloadSanitizer` shape the compact drawer payloads.

The lifecycle (Discovered → Dispatching → Running → AwaitingReview → Approved/Rejected/Failed, with Reopen/Retry) is defined in `specs/oratorio-design.md` §3. State transitions live in `OratorioService` and the dispatch/review services — keep them aligned with the spec rather than introducing new states locally.

### State paths and configuration

`Program.cs` resolves the database via `Oratorio:DatabasePath` → `ORATORIO_DATABASE_PATH` env → `OratorioStatePaths.ResolveDefaultDatabasePath(...)` (which respects `ORATORIO_STATE_ROOT`). The configuration overlay is resolved similarly via `ORATORIO_CONFIG_PATH` / `Oratorio:Settings:ConfigPath` and loaded into `IConfiguration` at startup. Settings written through the API land in that overlay; `server/appsettings.Local.json` is intentionally not loaded by the product path (see `docs/en/configuration.md`).

Secrets in the overlay are encrypted via `ConfigurationSecretProtector`. All secret APIs use replace-or-keep semantics (empty input = keep existing, never echo plaintext back). Source-project-to-workspace routing is required for every dispatchable repo/project — there is no fallback workspace.

## Desktop Architecture

`desktop/electron.vite.config.ts` defines three build targets:

- `src/main/index.ts` — Electron main process. Manages window, tray, theme/backdrop, protocol handler for `oratorio://`, and spawns the local `OratorioServerManager` (which runs either the dev `dotnet` build or the packaged `resources/server/oratorio-server.exe`).
- `src/preload/` — preload bridge.
- `src/renderer/src/` — React app. Entry is `main.tsx` → `App.tsx` → `shell/AppShell.tsx` (HashRouter). Views (`BoardView`, `TaskDrawer`, `TaskDetailPage`, `SettingsView`, `QueueView`, `ItemDetailView`, `LocalTaskFormDialog`) sit under `views/`. Shared primitives are in `components/primitives/` and feature components in `components/{board,drawer,feedback,filters,review}/`. `hooks/useBoardStream.ts` subscribes to the backend WebSocket; `lib/sortOrder.ts` applies streamed board events into local state.

The renderer is intentionally narrow — board, cards, status-only drawer, settings. Detailed AppServer conversation, approvals, plan inspection, diff/file/terminal/preview views belong in DotCraft Desktop, not here. Don't add those surfaces.

`src/renderer/src/api.ts` resolves the backend base URL from `VITE_ORATORIO_API_URL` or runtime config and exposes `apiGet/Post/Put/Patch`. CORS in `Program.cs` only allows file:// and loopback ports 5173/5174/5177 — keep the dev server on one of those.

## Testing

- Backend tests run against the real `Program` via `WebApplicationFactory`; they touch SQLite (in-memory or temp file) and exercise the full HTTP API. When adding endpoints, add a matching API test in `tests/Oratorio.Server.Tests/`.
- Renderer tests run under jsdom with `setupTests.ts`. `src/renderer/src/__mocks__/api.ts` mocks the API surface — keep it in sync when adding fields the tests rely on.
- `npm run build` runs `tsc -b` before `electron-vite build`, so TypeScript errors fail the build. Run `tsc -b` (or `npm run build`) before claiming a renderer change is done.

## Preview Screenshots

`scripts/screenshot.preview.mjs` drives a Playwright + headless Chromium pass against an isolated seeded backend and prints PNGs to `.craft/preview/shots/` (gitignored). Companion config: `desktop/vite.preview.config.ts` (runs the renderer on `127.0.0.1:5174`, a CORS-allowed port). One-time setup: install playwright inside `desktop/` (`npm install --no-save playwright && npx playwright install chromium`); the script resolves `playwright` from `desktop/node_modules` via `createRequire`.

## Working In This Repo

- The DotCraft SDK is consumed from NuGet as `DotCraft.Sdk`; no sibling `dotcraft/` checkout is required for builds.
- `desktop/resources/server/` is build output — do not commit it (it is gitignored) and do not edit files inside it; they are overwritten by `build.bat`.
- `.scratch/` is the local Markdown issue tracker for agent-driven feature work (`.scratch/<feature-slug>/PRD.md` + `issues/`). It is gitignored. Feature work is expected to land there before code.
- Avoid introducing new top-level renderer routes — the frontend spec calls out that absent features should be omitted, not shown as "coming soon".
