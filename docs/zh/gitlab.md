# GitLab 集成

当你希望 Oratorio 把真实的 GitLab Issue 和 Merge Request 拉进看板时，可以接入 GitLab。Oratorio 能同步工作项、保持卡片更新、展示最新讨论；在你允许回写后，还能把留言、审阅反馈、审阅状态和交付出的 Merge Request 写回 GitLab。

> [!NOTE]
> 如果是第一次设置 Oratorio，请先从 [快速开始](/zh/getting-started) 开始。本页只讲 GitLab 相关配置。DotCraft 设置见 [接入 DotCraft](/zh/dotcraft-workspaces)；完整字段说明见 [配置参考](/zh/configuration)。

## 开始之前

你需要准备：

- 目标 GitLab 项目的访问权限；
- 每个项目各自的 GitLab Token；
- 已经在 DotCraft 中打开并可用的同一个项目；
- 如果想用 Webhook 自动更新看板，还需要一个 GitLab 能访问到的 Oratorio server 地址。

如果 Oratorio 只在你的电脑上本地运行，GitLab 访问不到它，也没关系。手动同步和定时同步仍然可用。

## 在 Oratorio 中添加项目

打开 **Settings → Credentials → GitLab**。

- GitLab.com 可以保留默认地址。
- 自建 GitLab 填入 GitLab 服务器主页地址即可，不需要自己补 GitLab API 路径。
- 打开 **GitLab read sync**，用于导入 Issue 和 Merge Request。
- 只有当你希望 Oratorio 写回留言、审阅状态或交付 Merge Request 时，才打开 **GitLab writes**。

然后进入 **Settings → Projects**，添加一条 GitLab 项目。

- 在 **GitLab project** 中填入 GitLab 里看到的项目路径。带 subgroup 的路径也支持。
- 在 **DotCraft workspace** 中选择已经交给 DotCraft 使用的本地项目目录。
- 在同一张项目卡片上填入 GitLab Token，以及你准备给 Webhook 使用的 secret 或 signing token。

保存设置。如果 Oratorio 提示需要重启，请先重启本地 server，再测试连接。

## 创建 GitLab Token

大多数团队优先使用 **Project Access Token**，因为它只作用于一个项目。Group Token 或 Personal Token 也能用，但范围更大，需要更谨慎地保存和分发。

按你想开启的能力，选择尽量小的权限：

| 你想做的事 | GitLab 中需要允许的访问 |
|---|---|
| 只导入 Issue 和 Merge Request | read API access |
| 读取仓库信息用于审阅 | repository read access |
| 把实现结果交付成 Merge Request | repository write access |
| 发布留言、讨论、审阅状态或 Merge Request | API access |

Oratorio 保存后不会再显示 Token 明文。想保留原值就留空；想替换就粘贴新值并保存。

## 添加 GitLab Webhook

Webhook 不是必需的，但它能让 Oratorio 更快感知 GitLab 中的变化。

在 GitLab 项目的 Webhook 设置中，添加一个地址：你的 Oratorio server 地址后面接上 /api/v1/sources/gitlab/webhook。

Webhook 使用的 secret 或 signing token，要和 Oratorio 项目卡片中保存的值一致。事件建议开启 Issue、Merge Request、comment 或 note 相关事件。保存后，如果 GitLab 提供测试按钮，可以先测试一次，再回到 Oratorio 的 **Settings → Sources** 查看状态。

如果测试无法到达 Oratorio，通常是因为 GitLab 访问不到你的 Oratorio server。本地桌面会话通常不能直接接收 GitLab cloud 发来的 Webhook。

## 同步与审阅

打开 **Settings → Sources** 可以查看 GitLab 状态。

- 想立刻导入时，点击 **Pull now**。
- 想让 Oratorio 定期检查 GitLab，可以开启定时同步。
- 只有在需要重新检查整个项目时，才使用 full repair。

在 Oratorio 中审阅 GitLab Merge Request 时：

- **通过** 会在 GitLab 中记录一条通过的 Oratorio 审阅状态。
- **要求修改** 会留下反馈，并记录这次 Oratorio 审阅仍需处理。
- **作废** 会记录这项工作不应继续推进。

GitLab 的原生审阅状态和 GitHub 不完全一样，所以 Oratorio 会用留言和审阅状态把你的决定显示在 GitLab 中。

## 排查

**看不到 GitLab 卡片。** 检查 read sync 是否开启、项目路径是否正确、项目是否填了 Token，以及项目是否映射到了 DotCraft workspace。

**一个项目能用，另一个不能。** 每个 GitLab 项目都需要自己的项目卡片和 Token。回到 **Settings → Projects** 检查对应卡片。

**Webhook 没有更新。** 确认 Webhook 地址能被 GitLab 访问、secret 或 signing token 一致，并且事件包含 Issue、Merge Request 和 note。

**回写失败。** 确认 GitLab writes 已开启、Token 权限足够，并且本地 workspace 是同一个 GitLab 项目的 clone。

**无法创建 Merge Request。** 确认 Token 可以推送分支并创建 Merge Request，目标分支也允许新的 Merge Request。

**修改了 GitLab server 地址。** 保存后请重新填写项目 Token。Oratorio 会把不同 GitLab host 上的项目视为不同连接。
