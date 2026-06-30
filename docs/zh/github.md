# GitHub 集成

当你希望 Oratorio 把真实的 GitHub Issue 和 Pull Request 拉进看板时，可以接入 GitHub。Oratorio 能同步工作项、保持卡片更新、展示最新讨论；在你允许回写后，还能把评论、Pull Request 审阅、审阅检查和交付出的 Pull Request 写回 GitHub。

> [!NOTE]
> 如果是第一次设置 Oratorio，请先从 [快速开始](/zh/getting-started) 开始。本页只讲 GitHub 相关配置。DotCraft 设置见 [接入 DotCraft](/zh/dotcraft-workspaces)；完整字段说明见 [配置参考](/zh/configuration)。

## 开始之前

你需要准备：

- 目标 GitHub 仓库或组织的访问权限；
- 一个已经安装到目标仓库上的 GitHub App；
- 已经在 DotCraft 中打开并可用的同一个项目；
- 如果想用 Webhook 自动更新看板，还需要一个 GitHub 能访问到的 Oratorio server 地址。

如果 Oratorio 只在你的电脑上本地运行，GitHub 访问不到它，也没关系。手动同步和定时同步仍然可用。

## 创建或复用 GitHub App

GitHub 集成只使用 GitHub App。Oratorio 会用 App 完成 read sync、评论、
Pull Request 审阅、审阅检查和交付 Pull Request。

在拥有仓库的用户或组织下创建 GitHub App，并且只安装到你希望 Oratorio 访问的仓库。

按你想开启的能力，选择尽量小的权限：

| 你想做的事 | GitHub 中需要允许的权限 |
|---|---|
| 导入 Issue 和 Pull Request | Issues read access 与 Pull requests read access |
| 展示 Pull Request 文件和讨论 | Pull requests read access |
| 发布 Issue 评论或 Pull Request 审阅 | Issues write access 与 Pull requests write access |
| 显示 Oratorio 审阅检查 | Checks write access |
| 把实现结果交付成 Pull Request | Contents write access 与 Pull requests write access |

为这个 App 生成 private key。你可以把 private key 粘贴到 Oratorio，也可以让 Oratorio 读取本机上的 private key 文件。

## 在 Oratorio 中添加仓库

打开 **Settings → Projects**，添加一条 GitHub 仓库。

- 在 **GitHub repository** 中填入 owner 和仓库名。
- 在 **DotCraft workspace** 中选择已经交给 DotCraft 使用的本地项目目录。
- 保存设置。

添加仓库后，项目列表下方会出现 **GitHub installation profiles**。同一个 GitHub owner 下面的仓库会共用一条 profile。

点击 detect 按钮，让 Oratorio 自动查找 installation。若自动查找失败，可以从 GitHub App installation 页面复制 Installation ID 并手动填入。

## 填写 GitHub 凭据

打开 **Settings → Credentials → GitHub credentials**。

- GitHub.com 可以保留默认 endpoint。
- 如果使用 GitHub Enterprise，填入你的 GitHub API base 地址。
- 填入 GitHub App ID。
- 填入 private key，或填写 private key path。
- 如果准备使用 Webhook，填入 webhook secret。
- 只有当你希望 Oratorio 写回评论、审阅、检查或交付 Pull Request 时，才打开 **GitHub writes**。

保存设置。如果 Oratorio 提示需要重启，请先重启本地 server，再测试连接。

## 添加 GitHub Webhook

Webhook 不是必需的，但它能让 Oratorio 更快感知 GitHub 中的变化。

在 GitHub App 设置中，添加一个 Webhook 地址：你的 Oratorio server 地址后面接上 /api/v1/sources/github/webhook。

Webhook secret 要和 Oratorio 中保存的值一致。事件建议订阅 Issue、Pull Request、Issue comment、Pull Request review 和 Pull Request review comment。

如果测试无法到达 Oratorio，通常是因为 GitHub 访问不到你的 Oratorio server。本地桌面会话通常不能直接接收 GitHub cloud 发来的 Webhook。

## 同步与审阅

打开 **Settings → Sources** 可以查看 GitHub 状态。

- 想立刻导入时，点击 **Pull now**。
- 想让 Oratorio 定期检查 GitHub，可以开启定时同步。
- 只有在需要重新检查整个仓库时，才使用 full repair。

在 Oratorio 中审阅 GitHub Pull Request 时：

- **通过** 会发布 approval，并记录一条通过的 Oratorio 审阅检查。
- **要求修改** 会发布审阅反馈，并记录这次 Oratorio 审阅仍需处理。
- **作废** 会记录这项工作不应继续推进。

<img src="https://github.com/DotHarness/resources/raw/master/oratorio/github-review.png" alt="Oratorio GitHub App 在 Pull Request 中发布内联审阅意见，并追加已修复的跟进评论" />

当 implementation draft 准备好后，只要 GitHub writes 已开启且 GitHub App 权限足够，Oratorio 还可以推送分支并创建 Pull Request。

## 排查

**看不到 GitHub 卡片。** 检查仓库是否已在 **Settings → Projects** 中添加、凭据是否已保存，以及 **Settings → Sources** 是否显示 GitHub 可以读取。

**Installation profile 缺失。** 确认 GitHub App 已安装到仓库 owner 下。然后回到 **Settings → Projects** 点击 detect，或手动填写 Installation ID。

**Webhook 没有更新。** 确认 Webhook 地址能被 GitHub 访问、webhook secret 一致，并且 App 订阅了 Issue 和 Pull Request 相关事件。

**回写失败。** 确认 GitHub writes 已开启，并且 App 拥有本次操作需要的写入权限。

**无法创建 Pull Request。** 确认 App 可以写入仓库内容、本地 workspace 是同一个 GitHub 仓库的 clone，并且目标分支允许新的 Pull Request。
