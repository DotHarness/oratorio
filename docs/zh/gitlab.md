# GitLab 集成

Oratorio 支持把 GitLab issue 和 merge request 作为 Task 同步到看板，并在启用写入后发布 note、MR discussion、commit status，以及把 implementation draft 交付为 GitLab MR。

> [!NOTE]
> 本页只涉及 GitLab 特定的配置 —— token、webhook、合并 gate。Settings 和 Configuration Overlay 的通用说明见 [配置参考](/zh/configuration)；agent 运行时前置条件见 [DotCraft 工作区](/zh/dotcraft-workspaces)。每个 GitLab project 在被 dispatch 之前仍需要一条工作区映射。

## Token 和权限

GitLab v1 使用 token 配置，不包含 OAuth 连接流程。Oratorio 按 GitLab project profile 保存 token；每个 configured project 都需要自己的 profile。推荐优先使用 project access token，因为它的影响范围只覆盖单个项目；group access token 或 personal access token 可用，但影响范围更大，可以把同一个 token 填到多个 project profile 中。

建议最小权限：

- 读同步：`read_api`，并且 token 身份能读取目标 project。
- 代码读取和交付：`read_repository` 与 `write_repository`。
- note、discussion、commit status 和 MR 创建：`api`。

GitLab 写入会以目标 project profile 的 token 身份出现在 GitLab 中。Settings 只显示每个 project profile 的 token 是否存在；保存后不会回显明文。

## Endpoint 和项目路径

GitLab.com 可使用默认 endpoint：

```text
https://gitlab.com
```

self-managed GitLab 使用实例根 URL，例如：

```text
https://gitlab.company.example
```

GitLab API URL 由 endpoint 自动派生为 `<endpoint>/api/v4`；Desktop 设置只需要配置实例根 URL。

项目路径使用 GitLab 的 path-with-namespace：

```text
group/project
group/subgroup/project
```

Settings 的 Projects 页会把 GitLab project 保存为 canonical source key，例如：

```text
gitlab:gitlab.company.example/group/subgroup/project
```

这个 key 用于 DotCraft workspace routing，避免 GitHub 和 GitLab 出现相同 `group/project` 时产生歧义。

GitLab project card 同时也是 profile 编辑入口。每个 profile key 是：

```text
gitlab:<host>/<group[/subgroup]/project>
```

profile 包含：

- token kind label，例如 `projectAccessToken`、`groupAccessToken` 或 `personalAccessToken`；
- GitLab API token；
- webhook secret token；
- Standard Webhooks signing token。

移除 GitLab project 会在下一次 Settings 保存时移除对应 profile secret。修改 GitLab endpoint host 后，旧 host 的 profile secret 不会带到新 host，需要重新配置 profile。

## Webhook

GitLab webhook URL 是 Oratorio server 的 GitLab webhook endpoint：

```text
/api/v1/sources/gitlab/webhook
```

支持两种验证模式：

- secret token：从匹配 project profile 读取并校验 GitLab 的 `X-Gitlab-Token`。
- Standard Webhooks signing token：从匹配 project profile 读取，优先使用，适合需要签名验证的部署。

Webhook payload 必须包含 project path。Oratorio 会先按 payload project 选择 profile，再验证 signing headers 或 `X-Gitlab-Token`。configured project 缺少 profile 或缺少对应 secret 时会返回 `403`。

本地开发可以启用 local webhook bypass，但只应在本机测试环境使用。

## 定时同步

Settings 的 Sources 页可以为 GitHub 和 GitLab 分别开启定时拉取。默认关闭；
开启后第一次自动拉取会发生在 `当前时间 + 间隔`，不会立刻发起请求。

- 默认间隔是 5 分钟。
- 可配置范围是 1 分钟到 24 小时。
- 定时同步只运行 incremental sync；Full repair 仍然只能手动触发。
- 如果 provider 的 read capability 不可用，开关会禁用，并提示先完成读同步配置。
- 后台定时失败只显示在对应 provider 卡片内，不会弹全局 toast。

## Commit Status Merge Gate

Oratorio 对 GitLab MR 的 approve/request changes/reject 决策会写入 `oratorio/review` commit status：

- approve 写入成功状态；
- request changes 或 reject 写入失败状态；
- re-review 不写 GitLab 状态。

如果希望 GitLab 阻止未通过 Oratorio review 的 MR 合并，可以在 GitLab 项目设置中把 `oratorio/review` 作为需要通过的 status check 或外部状态门禁。

## 已知限制

- Oratorio v1 不调用 GitLab MR Approval API。
- request changes 在 GitLab 中表现为 note 和失败 commit status，不等同于 GitHub 的 review state。
- Review Draft 发布到 GitLab 时，一个 Oratorio draft 可能创建多个 GitLab MR discussions。
- GitLab webhook 创建仍需在 GitLab 项目中手动配置。

## 排查

- 缺少 token：Sources 页会显示 read/write capability 缺少 credential。
- endpoint 错误：检查 endpoint 不包含 userinfo、query 或 fragment；diagnostics 会显示清理后的 URL。
- project 未配置：确认 Settings 的 Projects 中包含 GitLab project path。
- profile 缺失：在 Settings 的 GitLab project card 上配置 project profile token；provider 可能显示 `partial`，表示部分 project 可用、部分 project 缺 profile。
- workspace 未映射：在 Projects 页把 canonical GitLab key 映射到本地 DotCraft workspace。
- sync 失败：Sources 页会显示最近失败项目和错误信息。
- write 失败：Task detail 的 Source Write audit 和 Sources 页 diagnostics 会显示最近 GitLab write failure。
- delivery 失败：确认 token 有 `write_repository` 和 `api`，本地 workspace 是目标 GitLab project 的 clone，并且目标 branch 可 push。修正权限后重试 delivery 会复用已经完成的 commit 和 branch push，只补建缺失的 MR。
