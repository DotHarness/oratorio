# 服务器部署

服务器部署指在一台 Linux 主机上持续运行一套专用的 **Oratorio 后端**和
**DotCraft AppServer**，用于无人值守的 source sync、PR review dispatch
和 draft generation。推荐入口是 Oratorio CLI。

```bash
curl -fsSL https://dotharness.github.io/oratorio/install.sh | bash
oratorio server init
```

安装脚本会从 GitHub Releases 下载 Linux x64 的 `oratorio` CLI，并校验
release checksum。之后由 CLI 创建和管理 Docker Compose review stack。

## CLI 会创建什么

`oratorio server init` 会创建一套独立 review stack：

```text
oratorio-review/
  docker-compose.yml
  .env
  oratorio.config.json
  workspace/
  secrets/
```

这套 stack 包含：

- 一个 Oratorio backend container；
- 一个专门用于 review 工作的 DotCraft AppServer container；
- 一个被两个 container 共同挂载的 `/workspace`；
- 一个由 CLI 管理的 server-side `oratorio.config.json`。

这套 review stack 默认和你已有的 QQ 机器人、聊天机器人或其他业务
DotCraft container 隔离。

## 核心约束：共享文件系统

Oratorio 会创建 Git worktree，并把 worktree 的绝对路径交给 DotCraft。
因此 Oratorio 和 DotCraft 必须在同一个绝对路径下看到同一份 workspace。
CLI 生成的 stack 会把宿主机 `workspace/` 同时挂到两个 container 的
`/workspace`。

多个仓库不需要多个 container。一套 stack 可以通过多条 workspace route
review 多个仓库：

```bash
oratorio server add-repo github:owner/repo-a
oratorio server add-repo github:owner/repo-b
```

每个仓库会 clone 到 `workspace/<owner>__<repo>`，并在
`oratorio.config.json` 中映射到 `/workspace/<owner>__<repo>`。

## 首次运行

`oratorio server init` 会依次询问：

- DotCraft provider、model 和 API key；
- GitHub read token；
- 一个或多个 GitHub repository；
- 是否开启 Auto Review；
- 可选的 GitHub App 配置，用于 review write-back。

CLI 会使用服务器上已有的 Git 凭据执行 `git clone`；它不会把 GitHub API
token 写进 Git remote。

Stack 启动后，CLI 会输出 SSH tunnel 命令：

```bash
ssh -N -L 5087:127.0.0.1:5087 user@your-server
```

然后在 Oratorio Desktop 中把 backend URL 设置为：

```text
http://127.0.0.1:5087
```

## 日常运维

常用命令：

```bash
oratorio server doctor
oratorio server status
oratorio server logs --follow
oratorio server restart
oratorio server upgrade
```

`doctor` 会检查 Docker、Docker Compose、Git、必要 secret、仓库 checkout、
workspace route 和 Oratorio health。

## 配置归属

服务器部署下，配置由服务器侧 CLI 和文件管理：

- `.env` 存放模型 key、AppServer token、GitHub token 等 secret；
- `oratorio.config.json` 存放 source list、workspace route 和 automation policy；
- Oratorio Desktop remote mode 只读展示 server-admin 配置。

CLI 生成的 Docker stack 会设置 `Oratorio:Settings:Writable=false`，所以即使
SSH tunnel 让请求看起来来自 loopback，Desktop 也不能误写 server-admin 配置。

## 手动 Compose 配置

高级用户仍可手动使用 Compose 模板：

```bash
mkdir oratorio && cd oratorio
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/.env.example
cp .env.example .env
```

如果要配置多个仓库，优先使用 `oratorio.config.json`，不要手写很长的
environment variable 数组。

## 延伸阅读

- [Oratorio 如何接入 DotCraft](/zh/dotcraft-workspaces)
- [配置参考](/zh/configuration)
- [GitHub 集成](/zh/github)
