# 开发指南

本文档承接顶层 README 中的开发细节。顶层 README 保持轻量入口；开发命令、构建产物和协作约定集中放在这里。

> [!TIP]
> 文档站本身就在 `docs/`，用 VitePress 构建。在 `docs/` 下运行 `npm install && npm run dev` 即可本地预览。欢迎修改任何已有页面 —— 每篇文档底部都有 **Edit this page on GitHub** 链接，直接跳到对应文件。

## 仓库布局

```text
oratorio/
  desktop/ Electron desktop shell, renderer, and packaging project
  server/   ASP.NET Core headless backend
  specs/    product and frontend behavior specs
  docs/     user, operator, and development docs
  tests/    backend integration tests
```

## 环境要求

- .NET SDK 10.0
- Node.js 和 npm，用于 Electron Desktop
- GitHub App installation 和 private key，仅在本地测试 GitHub sync / write-back 时需要
- DotCraft workspace / AppServer，用于真实 agent Run

## 常用启动命令

推荐的本地入口：

```powershell
.\dev.bat
```

这个脚本会检查 `dotnet` 和 `npm`，安装 desktop dependencies，并运行 `desktop` dev server。Desktop shell 会启动或复用本地 Oratorio headless server。

单独运行 backend：

```powershell
dotnet build Oratorio.sln
dotnet run --project server/Oratorio.Server.csproj
```

单独运行 desktop：

```powershell
cd desktop
npm install
npm run dev
```

## 测试和构建

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

release 脚本会发布 ASP.NET Core server 为 Windows x64 self-contained single-file executable，复制到 `desktop/resources/server`，再构建 Electron desktop package。最终产物位于：

```text
build/release/
  Oratorio*.exe
  server/
    oratorio-server.exe
    appsettings.json
```

运行 packaged desktop executable 会启动本地 Oratorio Desktop。运行 `build/release/server/oratorio-server.exe` 只启动 headless backend；console 会打印 `API`、`Health` 和 headless `Mode`。
