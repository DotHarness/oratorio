# Development Guide

This guide holds the development details that used to live in the top-level README. The README stays lightweight; build commands, release outputs, and collaboration rules live here.

> [!TIP]
> The docs site itself lives in `docs/` and is built with VitePress. Run `npm install && npm run dev` from `docs/` to preview locally. Editing existing pages is welcome — the **Edit this page on GitHub** link in the footer of every doc takes you straight to the right file.

## Repository Layout

```text
oratorio/
  desktop/ Electron desktop shell, renderer, and packaging project
  server/   ASP.NET Core headless backend
  specs/    product and frontend behavior specs
  docs/     user, operator, and development docs
  tests/    backend integration tests
```

## Requirements

- .NET SDK 10.0
- Node.js and npm for Electron Desktop
- A GitHub App installation and private key only when testing GitHub sync or write-back locally
- A DotCraft workspace / AppServer for real agent Runs

## Common Start Commands

Recommended local entry point:

```powershell
.\dev.bat
```

The script checks for `dotnet` and `npm`, installs desktop dependencies, and runs the `desktop` dev server. The desktop shell starts or reuses the local Oratorio headless server.

Run only the backend:

```powershell
dotnet build Oratorio.sln
dotnet run --project server/Oratorio.Server.csproj
```

Run only the desktop app:

```powershell
cd desktop
npm install
npm run dev
```

## Tests and Builds

Backend:

```powershell
dotnet build Oratorio.sln
dotnet test tests/Oratorio.Server.Tests
```

Desktop:

```powershell
cd desktop
npm run build
npm test
```

Release build:

```powershell
.\build.bat
```

The release script publishes the ASP.NET Core server as a Windows x64 self-contained single-file executable, copies it into `desktop/resources/server`, and builds the Electron desktop package. Final outputs:

```text
build/release/
  Oratorio*.exe
  server/
    oratorio-server.exe
    appsettings.json
```

Run the packaged desktop executable for the local Oratorio Desktop app. Run `build/release/server/oratorio-server.exe` to start only the headless backend; the console prints `API`, `Health`, and headless `Mode`.