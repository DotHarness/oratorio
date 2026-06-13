# 快速开始

Oratorio 是一张看板，让你把工作交给 AI Agent，并跟进它的进展。真正干活的 Agent 来自 [DotCraft](https://www.dotcraft.net/) —— 一个住在你项目里的 AI，它记得每次对话、学会项目专属的 Skill 与插件、通过 MCP 连接你的本地工具，并接到你选定的模型。

本指南带你从安装走到第一次完整的"交活与审阅"，大约十五分钟 —— 五分钟用于 DotCraft（如果还没装），剩下属于 Oratorio。

> [!IMPORTANT]
> **请先为你的项目设置好 DotCraft。** Oratorio 负责看板，DotCraft 才是接活的 Agent。跳过第 1 步，你只会得到一张没人接活的看板。

## 1. 为项目设置好 DotCraft

安装 [DotCraft](https://www.dotcraft.net/)，在 DotCraft 中打开你的项目，完成首次设置 —— 选定模型，发一条测试对话，比如"读一下这个项目的 README，告诉我它是做什么的"。这一步走完，你的项目里就住着一个可用的 AI Agent。

如果是第一次接触 DotCraft，请先按它的指南走一遍：

- [DotCraft 快速开始 ↗](https://www.dotcraft.net/zh/getting-started)
- [Oratorio 如何接入 DotCraft](/zh/dotcraft-workspaces)

**测试对话没跑通之前，先别继续。** Agent 必须先在 DotCraft 中可被对话，Oratorio 才能把工作交给它。

## 2. 安装 Oratorio

最便捷的方式是从 Release 安装：

| 平台 | 文件 |
|------|------|
| Windows | [GitHub Releases](https://github.com/DotHarness/oratorio/releases) 中的 `Oratorio-*.exe` |

如果选择源码构建，请先安装 [.NET 10 SDK](https://dotnet.microsoft.com/download) 与 Node.js，并把 [DotCraft](https://github.com/DotHarness/dotcraft) clone 到 `oratorio/` 同级目录下（Oratorio 直接引用 DotCraft SDK），然后在 Oratorio 仓库根目录运行：

```powershell
.\dev.bat
```

`dev.bat` 会安装桌面依赖、构建后端，并以开发模式启动 Oratorio Desktop。

## 3. 首次启动

Oratorio Desktop 启动时会显示一个简短的启动画面，等待本地 server 预热。

![Oratorio 启动中](https://github.com/DotHarness/resources/raw/master/oratorio/launch-overlay-light.png)

启动画面淡出后，你会看到一张空白看板。

![Oratorio 初始空看板](https://github.com/DotHarness/resources/raw/master/oratorio/board-light.png)

看板包含四列，对应工作的自然流转：**新任务**、**派发中**、**进行中**、**等待审阅**。每张卡片都会从左向右走 —— Agent 接手、完成，最后回到你手里。

## 4. 在 Oratorio 中接入项目

点击 **Settings** 齿轮，进入 **Projects**，添加你在第 1 步设置好的项目。**唯一必填项是项目目录**，指向你在 DotCraft 中使用的同一目录。

![Settings → Projects，添加仓库与项目目录的表单](https://github.com/DotHarness/resources/raw/master/oratorio/settings-projects-light.png)

到此为止：一次接入，一次保存。

> [!TIP]
> 想看逐字段的配置说明？参见 [配置参考 → 来源项目到工作区映射](/zh/configuration#source-project-to-workspace-mapping)。你也可以接入多个项目 —— 每个仓库或 GitLab 项目独占一行。

## 5. 拉入真实工作（可选）

如果希望 Oratorio 镜像真实的 Issue 与 PR，在 Settings → Credentials 中填入工作来源凭据：

- **GitHub** —— 完整连接建议使用 GitHub App。见 [GitHub 集成](/zh/github)。
- **GitLab** —— 在每个 GitLab 项目卡片上填入 Token。见 [GitLab 集成](/zh/gitlab)。

![Settings → Credentials，包含 GitHub 与 GitLab 字段](https://github.com/DotHarness/resources/raw/master/oratorio/settings-credentials-light.png)

只是想先把看板玩起来？跳过这一步即可 —— 自己写一张本地任务，流程完全一样。

## 6. 写下第一张任务卡

在看板上点击 **新建任务**（如果上一步接入了 GitHub 或 GitLab，也可以等同步把真实的 Issue 拉下来）。填入标题、简短描述、并选定你在第 4 步接入的项目。

![新建任务对话框，包含标题、描述、来源项目、标签、Assignee 与基础分支](https://github.com/DotHarness/resources/raw/master/oratorio/create-task-dialog-light.png)

一张卡片会出现在**新任务**列。点开它，侧边栏滑出 —— 这里展示 Agent 当前的工作状态、相关链接、以及看板内可用的操作。想看完整对话？一键跳进 DotCraft。

## 7. 交给 Agent，审阅结果 {#dispatch}

把卡片拖入**派发中**列。背后发生的事情：

1. Agent 拿到一份独立的项目副本，安全地开展工作。
2. DotCraft 在那个副本里接过任务。
3. 进展实时回流到侧边栏。

卡片会自己走过 **派发中 → 进行中 → 等待审阅**。当它落入**等待审阅**，点开它。

![任务详情，展示总结与建议](https://github.com/DotHarness/resources/raw/master/oratorio/task-detail-review-dark.png)

你会看到 Agent 完成了什么：一份书面总结、可一键应用的逐行代码建议、以及需要你判断的留言。三种决策可选：

- **通过** —— 接受这次工作。对 GitHub PR 写入 approval；对 GitLab MR 把 Commit Status 标记为通过。
- **要求修改** —— 把留言回灌给 Agent，让它再来一轮。
- **作废** —— 这次工作不收。Commit Status 标记为失败。

选一个，卡片会移入完成区域（或按你的筛选条件移出视野）。

![任务上记录的决策](https://github.com/DotHarness/resources/raw/master/oratorio/task-detail-decision-light.png)

至此，一个完整的循环走完了 —— 你提任务，Agent 干活，你拍板。

## 8. 接下来去哪

| 你想做的 | 文档 |
|---|---|
| 看完整的 Settings 参考 | [配置参考](/zh/configuration) |
| 配置 GitHub 仓库、Webhook 与回写 | [GitHub 集成](/zh/github) |
| 配置 GitLab 项目、Webhook 与回写 | [GitLab 集成](/zh/gitlab) |
| 了解哪些能力可离线运行、哪些依赖 GitHub / GitLab | [本地能力矩阵](/zh/local-support) |
| 构建、测试与贡献代码 | [开发指南](/zh/development) |
| 理解 Oratorio 如何接入 DotCraft | [Oratorio 如何接入 DotCraft](/zh/dotcraft-workspaces) |

## 排查

**派发时报"项目未连接"。** 项目还未在 Settings 中接入，或接入目录中没有为 DotCraft 设置过的项目。请回到第 1 步（在 DotCraft 中打开）与第 4 步（Settings → Projects）确认。

**Agent 启动后第一次模型调用就失败。** 项目已接入 DotCraft，但模型本身还没配好。回到 DotCraft 手动发一条消息，确认模型能正常响应。

**Settings 改了不生效。** 部分配置只在本地 server 重启之后才生效。点击 Settings 顶栏中的 **Restart server** 按钮。

**保存的密码或 Token 看不到。** 这是预期行为。Settings 只显示某项是否已保存，从不回显具体值。要替换就填入新值；要保留就让字段为空。
