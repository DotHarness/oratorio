# 配置参考

Oratorio 的日常配置入口是 Desktop Renderer 里的 Settings。Settings 写入 Oratorio 管理的 Configuration Overlay，并让 headless backend 在重启后读取新配置。

> [!NOTE]
> 首次使用 Oratorio，请从 [快速开始](/zh/getting-started) 入手。DotCraft 工作区前置条件见 [DotCraft 工作区](/zh/dotcraft-workspaces)。本页是字段参考，不是引导。

## Settings 和 Configuration Overlay

Settings 负责本地 admin 配置，包括：

- GitHub source / repository 和 GitLab source / project 列表；
- GitHub credential presence，以及 GitLab project profile credential presence / write-only secret update；
- DotCraft AppServer / Hub routing；
- source project 到 DotCraft workspace 的映射；
- managed worktree、concurrency、retry、timeout 和 cleanup policy；
- automation policy，例如 source project Auto Review、Draft auto-publish 和 implementation auto-dispatch。

Configuration Overlay 包含非 secret 配置和加密后的 secret value。响应、diagnostics 和 audit record 不返回 plaintext secret。

Settings 中 `Sources` 管理 GitHub/GitLab provider status 与 sync；`Projects` 管理 source project 到 workspace 的 routing；`Agents` 管理 DotCraft/AppServer 连接与 agent guardrail；`Worktree` 管理 managed worktree、调度、重试、清理和 implementation auto-dispatch；`Review` 管理 PR/MR Auto Review 和 Review Draft publish 策略。Settings 不提供独立的 Diagnostics 顶层页面；redacted diagnostics 仍作为本地支持能力存在。旧的 `/settings/advanced` 路由保留为兼容入口，会显示 `Agents`，旧的 `/settings/repositories` 会进入 `Projects`。

`server/appsettings.Local.json` 不在产品路径中加载。正常配置不要依赖它。

## Source project 到 workspace 的映射 {#source-project-to-workspace-mapping}

Settings 会把每个 GitHub repository 或 GitLab project 和一个 DotCraft workspace path 放在同一组配置中。内部会写入：

- `Oratorio:GitHub:Repositories`
- `Oratorio:GitHub:InstallationProfiles`
- `Oratorio:GitLab:Projects`
- `Oratorio:GitLab:ProjectProfiles`
- `Oratorio:DotCraft:RepositoryWorkspaces`

新的 AppServer Run 会根据 Task 的 source project 查找 workspace path。Oratorio 没有 fallback workspace；每个需要 dispatch 的 GitHub repository 或 GitLab project 都必须显式配置映射。GitLab workspace key 使用 `gitlab:<host>/<group/project>`，支持 subgroup path。

Hub 只用于发现 workspace 的 AppServer endpoint。Oratorio 拿到 endpoint 后直接连接对应 AppServer；Hub 不是消息 relay，也不是安全边界。

GitHub App installation 使用 owner profile 管理，而不是一个全局 Installation ID。Settings 会按 GitHub instance 和 repository owner（例如 `github.com/DotHarness`）聚合 profile；同一 owner 下的 repository 共享同一个 installation ID。保存 Project routing 后，Oratorio 会尝试用 GitHub App ID 和 private key 自动探测缺失的 profile；失败不会阻止 routing 保存，用户可以在 profile 行里重试或手动填写 installation ID。旧配置中的单个 `Oratorio:GitHub:InstallationId` 只会在所有 configured repositories 属于同一个 owner 时迁移为 profile；多个 owner 时不会复制旧 ID。

GitLab credential 使用 project profile 管理，而不是一个全局 token。每个 configured GitLab project 的 profile key 是 `gitlab:<host>/<group[/subgroup]/project>`，profile 内包含 `TokenKind`、token、webhook secret 和 Standard Webhooks signing token。Settings 在 `Projects` 页的 GitLab project card 上编辑这些字段；`Credentials` 页只保留 endpoint、read/write/local-bypass 等 provider-level 控制。移除 GitLab project 会在下一次 overlay 保存时移除对应 profile secret；GitLab endpoint host 改变时不会沿用旧 host 的 profile secret。

## Secret 处理

GitHub token、webhook secret、private key，以及 GitLab project profile 内的 token、webhook secret、webhook signing token 只接受 one-shot replace / clear 语义：

- 空 secret input 表示保留已有值；
- replace 会在 server 端加密后写入 Configuration Overlay；
- read、diagnostics、audit record 和 UI 状态只显示 presence 或 redacted value；
- plaintext secret 不会回传给 Desktop Renderer。

Settings 不暴露 auto-start command 或 process argument 输入。

旧配置中的 `Oratorio:GitLab:Token`、`TokenKind`、`WebhookSecret` 和 `WebhookSigningToken` 仍可被 runtime 读取，但仅在完全没有 `ProjectProfiles` 时作为兼容 fallback。Settings 不显示这些旧字段、不自动迁移到 project profile，并会在下一次保存时丢弃这些顶层 GitLab secret。

## 默认状态路径

Oratorio 默认把本地状态保存在 Oratorio state root 下：

```text
<oratorio-state-root>/
  oratorio.db
  config.json
  worktrees/
  logs/
  artifacts/
```

使用 `ORATORIO_STATE_ROOT` 可以把状态目录放到应用目录之外。packaged 或 embedded host 也可以通过 `ORATORIO_CONFIG_PATH`、`ORATORIO_STATE_ROOT` 和 `Oratorio:Settings:ConfigPath` 定位 state 或 overlay；这些是高级启动定位器，不是普通配置入口。

## Automatic PR/MR Review

`Automation.AutoReviewRepositories` 控制哪些 source project 会自动触发 PR/MR review。GitHub 可使用 `owner/name` 或 canonical source key；GitLab 使用 canonical source key，例如 `gitlab:gitlab.example/group/project`。每个 configured source project 有两种状态：

- `Off`：不自动 review；
- `Auto review`：启用后新出现的 open non-draft PR/MR 自动排队 `reviewAnalysis` run，之后每次 head SHA 变化自动 re-review。

首次启用 source project 时，Oratorio 会 baseline 当时已有的 open non-draft PR/MR，不回扫历史。Auto Review 与手动 `reReview` 语义一致：supersede 当前 round、创建下一轮、排只读 AppServer review run，不写 GitHub/GitLab decision。

Auto Review 不使用 label 触发；Issue 和 local task 的 implementation auto-dispatch allow/block label 逻辑保持独立。

PR/MR review run 必须由 agent 调用 `oratorio.SubmitReviewDraft`。没有发现问题时也要提交 summary-only draft：计数全为 `0`，`comments: []`。Review Draft 默认使用克制的英文工程化文案：summary 用 `Reviewed`、`Outcome`、`Scope checked`、`Notes` 分段；inline comment 优先 actionable bug 和 investigation flag，避免 FYI 噪音。`RED` 表示较可能影响 correctness、security、data loss 或核心 workflow 的 bug；`YELLOW` 表示需要调查的 flag、maintainability risk 或置信度较低的问题。Inline comment 必须二选一：提供可发布为 GitHub/GitLab native suggested change 的 `suggestionReplacement`，或提供 `commentOnlyReason`（如需要人工判断、改动范围更大、无法安全 anchor 等）。`suggestionCount` 由服务端按 accepted concrete code suggestions 重算，不统计 prose-only finding。Inline comment 必须锚到 diff 中可评论的 changed/context line；如果 agent 提交的 path、side、line 或 range 可被修正，tool 会以 `reviewDraftAnchorNotCommentable` 失败并返回可用 ranges，要求 agent 重新提交。Summary-only draft 不需要读取 source diff；如果 diff 暂不可用或 provider 没返回文件 patch，inline comments 会保留为 skipped warnings。若 run 完成时没有 Review Draft，Oratorio 会以 `reviewDraftRequired` 标记失败，不自动合成结论。

Settings 中 Auto Review allowlist 以 `Manage` 弹窗管理。弹窗只列出已经配置的 source projects，支持搜索和勾选；弹窗保存只更新 Settings draft，仍需点击页面 `Save` 写入配置。

## Draft auto-publish

Settings 以 source project allowlist card 和 `Manage` 弹窗管理 Draft auto-publish。至少选择一个 source project 时，Settings 会在 draft 中写入 `Automation.AutoReviewPublishEnabled=true` 和对应的 `Automation.AutoReviewPublishRepositories`；全部移除时会写入 disabled 和空 allowlist。

publish allowlist 只控制 Review Draft 发布，不控制是否自动触发 review。读取旧配置时，只有 `Automation.AutoReviewPublishEnabled=true` 且在 allowlist 中的 source project 会显示在 publish allowlist card 中。

Settings 中 Draft auto-publish allowlist 也通过 `Manage` 弹窗管理，并可在 allowlist card 上直接删除已选 source project。删除最后一个 publish project 会把 draft 中的 `Automation.AutoReviewPublishEnabled` 同步置为 `false`。

这个配置不会：

- approve pull request 或 merge request；
- request changes；
- merge；
- resolve Oratorio Task；
- 绕过 Source Write audit。

自动发布仍然受 stale head、warning、skipped comment 和 write configuration gate 约束。

## Implementation auto-dispatch labels

`Automation.AutoDispatchAllowLabels` 和 `Automation.AutoDispatchBlockLabels` 通过 Settings 的标签控件管理。标签是自由输入，保存前会去掉首尾空白并按大小写不敏感去重。

allow labels 为空时表示所有未被 block 的 eligible GitHub/GitLab Issue 或 local task 都可以参与 implementation auto-dispatch。block labels 中任一匹配都会阻止自动 dispatch。

## 配置生效

Settings save 会返回 restart-required signature。当前配置写入不会热更新整个 configuration root；需要重启 Oratorio server 才能保证新配置完整生效。Desktop build 在可用时会提供 restart button；没有 desktop bridge 的上下文应显示手动重启要求。

## 故障排查

### AppServer Run 找不到 workspace

确认 Task 的 source project 已在 Settings 中映射到 DotCraft workspace path，并且该 workspace 已能通过 Hub 或显式 AppServer endpoint 发现。

### Secret 保存后看不到明文

这是预期行为。Settings 只显示 secret presence；明文不会从 server 读回。

### 修改配置后行为没变

重启 Oratorio server。Configuration Overlay 写入后不会热更新所有启动级配置。
