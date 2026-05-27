# Oratorio 如何接入 DotCraft

Oratorio 是看板，[DotCraft](https://dotharness.github.io/dotcraft/) 是干活的 AI Agent。两者是相互独立的应用，各负责一半 —— Oratorio 让你看清工作的进展，DotCraft 负责思考、调用工具、产出结果。

本页讲清楚为什么由 DotCraft 担任引擎、你因此获得了什么、以及如何把两者连起来。

## DotCraft 带来什么

DotCraft 是一个住在项目里的 AI Agent。为项目设置过一次之后，这个 Agent 就具备：

- **对话的记忆。** 昨天聊到的内容今天还在，并且只在这个项目内有效。
- **项目专属的 Skill 与插件。** 你（或团队）安装的自定义能力与工具，会随项目一同保留。
- **通过 MCP 调用本地工具。** Agent 可以与数据库、内部服务、文件转换器对话 —— 凡是支持 [Model Context Protocol](https://modelcontextprotocol.io/) 的工具都能接。
- **任你选择的模型。** Anthropic、OpenAI、ChatGPT 订阅、本地的 OpenAI 兼容服务 —— 按需配置。
- **项目级指令。** 在项目根目录放一份 `AGENTS.md`，便能给 Agent 一份随仓库流转的项目上下文。

当 Oratorio 把任务交给 Agent，以上这些都已就位。你不会面对一个冷启动的空白 Agent，而是一位早已熟悉你项目的助手。

## 这对 Oratorio 意味着什么

Oratorio 不打算另起一套 Agent UI。看板、侧边栏、Settings 只关心两件事："什么工作在进行中，以及它的判定结果是什么"。所有 *Agent 形状* 的细节 —— 对话、计划、文件改动、终端输出 —— 都留在 DotCraft 中，一键即可跳转。

这套分工让 Oratorio 保持简洁。也意味着你每接入一个项目，便自带一位配置完毕的 AI Agent 在等待接活 —— Oratorio 只负责派单与记账。

## 怎样把它装好

> [!IMPORTANT]
> 如果是第一次接触 DotCraft，请先走它的五分钟上手 —— 安装、选定项目、配置模型。**在 DotCraft 中能正常对话之后，再来接入 Oratorio。**
>
> → [DotCraft 快速开始 ↗](https://dotharness.github.io/dotcraft/zh/getting-started)

整体流程：

1. **安装 DotCraft。** Release 安装包或源码构建都可以。
2. **在 DotCraft 中打开你的项目。** 首次设置会为项目准备好 Agent 的"家"，让记忆、Skill 与配置都跟着项目走。
3. **选定模型，发一条对话。** 在接入其他东西之前，先确认 Agent 能回应。
4. **在 Oratorio 的 Settings → Projects 中指向同一个项目目录。** 这是 Oratorio 这边唯一的步骤。

完成之后，你每从 Oratorio 看板上交出一张卡片，都会落到一位早已熟悉项目的 Agent 手中。

## 在 Oratorio 中接入

打开 Oratorio Desktop → **Settings → Projects**，添加一条把仓库（或 GitLab 项目）指向项目目录的映射。逐字段说明与边界场景见 [配置参考 → 来源项目到工作区映射](/zh/configuration#source-project-to-workspace-mapping)。

幕后，Oratorio 通过 DotCraft 的 Hub 发现本地 Agent 的服务地址，然后直接与 Agent 通信。你无需操心端口与进程 —— 两个应用会自动找到对方。需要查看或调整桥接状态，可进入 **Settings → Agents**：

![Settings → Agents，展示 DotCraft 桥接与 AppServer 连接](https://github.com/DotHarness/resources/raw/master/oratorio/settings-agents-dark.png)

## 常见问题

- **DotCraft 还没为这个项目设置。** 派发会失败，因为目标项目里还没有 Agent 接收。先在 DotCraft 中打开项目并完成首次设置，再回来重试。
- **模型没配好。** 看似一切就绪，但首次模型调用便失败。请回到 DotCraft 手动发一条对话，确认模型能正常响应。
- **Windows 与 WSL 路径混用。** 请用工具实际看到的路径。从 PowerShell 启动 DotCraft 就用 Windows 路径；从 WSL 启动就用 WSL 路径。

## 继续阅读

- [DotCraft 快速开始 ↗](https://dotharness.github.io/dotcraft/zh/getting-started) —— 安装、模型配置、第一次会话
- [DotCraft 项目级工作区 ↗](https://dotharness.github.io/dotcraft/zh/features/workspace) —— 跟随项目的数据有哪些、配置如何叠加
- [DotCraft 配置参考 ↗](https://dotharness.github.io/dotcraft/zh/developing/configuration) —— 完整字段表
- [Oratorio 配置参考](/zh/configuration) —— 含项目接入字段在内的 Oratorio 配置说明
