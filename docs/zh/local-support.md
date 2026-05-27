# 本地能力矩阵

这个矩阵总结当前 Oratorio 哪些能力可以完全本地运行，哪些仍依赖 GitHub/GitLab remote。它是当前实现快照，不是路线图。

| 概念 | 当前能力 | 是否依赖外部 source |
| --- | --- | --- |
| Project (agent work container) | 一个 DotCraft workspace 一对一映射为一个 Project；Oratorio 在本地保存 Project board 和 agent task-management 状态。 | No |
| Local Task | 操作者创建的工作项，包含 title、body、repository、branch、labels、comments、rounds、decisions 和 timeline，全部本地存储。 | No |
| GitHub Issue | 通过 GitHub read sync，并支持 comment write-back 和 implementation delivery。 | GitHub |
| GitLab Issue | 通过 GitLab read sync，并支持 note write-back 和 MR delivery。 | GitLab |
| Pull Request / Merge Request | 当前建模 GitHub pull request 和 GitLab merge request；还没有 first-class local PR/MR 概念。 | GitHub/GitLab |
| Round / Run / Decision / Comment / Timeline | Review cycle、run attempt、operator decision、comment 和 timeline event 都由 Oratorio backend 持有，不依赖外部服务。 | No |
| Board / Card / Status Drawer | Drag-and-drop board、ShortId 和 Status-only Drawer 不需要外部 source。Browser Conversation、Approvals 和 Plan surface 有意不在 Oratorio Desktop 内实现；详细 agent interaction 使用 DotCraft Desktop。 | No |
| Managed worktree (Run isolation) | Backend 为每个 AppServer Run 准备隔离 workspace；当前实现绑定 git。 | Git-only |
| AppServer dispatch / agent round | Thread 通过本地 DotCraft AppServer over stdio/WebSocket 启动、复用和流式同步。 | No |
| Review Draft (structured PR/MR review) | Agent 通过 runtime tool 提交结构化 review draft；inline finding 会区分可应用 code suggestion 与带 reason 的 comment-only finding；GitHub PR 和 GitLab MR 均可发布到对应 source。 | GitHub/GitLab |
| Implementation Draft (auto PR/MR delivery) | Agent 提交结构化 implementation draft；delivery pipeline 可创建 GitHub PR 或 GitLab MR。 | GitHub/GitLab |
| Source Write audit | 每次 write-back，包括 comment/note、review/discussion、status、commit、branch push 和 PR/MR creation，都会被审计。 | GitHub/GitLab |
| Settings / Configuration / Diagnostics / Status | Settings read/write、Configuration Overlay、diagnostics report 和 AppServer/Hub/worktree status 都是 local-only。 | No |
| Mock runner | 不需要 git 或外部服务即可驱动完整 Round / Run lifecycle，适合 rehearsal 和 offline UI work。 | No |

## 读法

- `No` 表示能力可以在没有外部 source remote 的本地模式下工作。
- `GitHub` / `GitLab` / `GitHub/GitLab` 表示能力依赖对应 source adapter 或 credentials。
- `Git-only` 表示能力不一定依赖 GitHub，但当前实现依赖 Git worktree / repository。
