<div align="center">

![Oratorio](https://github.com/DotHarness/resources/raw/master/oratorio/banner.png)

[English](./README.md) · [文档](./docs/index.md) · [快速开始](./docs/getting-started.md) · [DotCraft](https://github.com/DotHarness/dotcraft)

让 Agent 在看板中与你一同协作项目。

</div>

## 简介

Oratorio 是一个面向 AI Agent 工作的项目看板，由 DotCraft 提供运行能力。它把本地任务、GitHub/GitLab 上的问题和代码合并请求（Issue、PR/MR）放进同一套流程，方便你安排任务、查看进度、审阅结果，并把合适的改动交付回代码平台。

## 亮点

- 一张看板管理所有工作：本地任务、Issue、PR 和 MR 可以放在同一个视图里跟进。
- Agent 可以参与任务管理：在授权后，Agent 可以查看看板、创建本地任务，并把需要审阅的工作排进队列。
- 结果先变成草稿：审阅意见、实现结果和后续任务会先进入 Oratorio，方便检查、修改和取舍。
- 从任务走到交付：实现类任务完成后，可以生成 GitHub PR 或 GitLab MR，并留下清晰的交付记录。
- 执行细节留给 DotCraft：Oratorio 管理任务和状态，DotCraft 负责具体会话、文件改动和运行细节。

## 快速开始

本地开发建议先启动桌面应用：

```powershell
.\dev.bat
```

也可以单独运行 server：

```powershell
dotnet build Oratorio.sln
dotnet run --project server/Oratorio.Server.csproj
```

环境要求、代码平台配置、Release 构建和测试命令见 [开发指南](./docs/development.md)。

## 连接 DotCraft

把 Oratorio 连接到一个 DotCraft 会话中，让 Agent 管理你的看板。

![使用 DotCraft 连接 Oratorio](https://github.com/DotHarness/resources/raw/master/dotcraft/whats-new/app.gif)


## 文档

| 目标 | 文档 |
|------|------|
| 安装、运行并理解第一次本地流程 | [快速开始](./docs/getting-started.md) |
| 构建、测试和参与开发 | [开发指南](./docs/development.md) |
| 配置 Settings、状态路径、GitHub/GitLab 与 DotCraft 路由 | [配置指南](./docs/configuration.md) |
| 配置 GitLab 项目、Token、Webhook 和 MR 交付 | [GitLab 集成配置](./docs/gitlab.md) |
| 查看哪些能力可本地运行，哪些仍依赖外部代码平台 | [本地支持矩阵](./docs/local-support.md) |

## 致谢

本项目受 [openai/symphony](https://github.com/openai/symphony) 启发，构建在 [DotCraft](https://github.com/DotHarness/dotcraft) 之上，由 DotCraft 提供 Agent Harness 与 AppServer runtime。

## License

Apache License 2.0