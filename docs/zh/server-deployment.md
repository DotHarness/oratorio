# 服务器部署

服务器部署指在一台 Linux 主机上持续运行 **Oratorio 后端**及其依赖的 **DotCraft AppServer**,实现无人值守的来源同步、任务派发与草稿产出。推荐使用 `oratorio/deploy/docker/` 提供的 Docker Compose 栈。

## 核心约束:共享文件系统

Oratorio 会创建 git worktree,并将其**绝对路径**交由 DotCraft 执行。因此,二者在网络层面可以分离,但**必须共享同一文件系统,并挂载到相同路径**(此处为 `/workspace`)。

落实到部署上,只需让两个容器挂载同一个 `/workspace` 卷即可;本仓库提供的 Compose 已完成该配置。

## 快速开始

无需检出 Oratorio 源码,获取 Compose 与 `.env` 模板两个文件即可;容器镜像(Oratorio 与 DotCraft)会自动从 GHCR 拉取。

```bash
mkdir oratorio && cd oratorio
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/docker-compose.yml
curl -O https://raw.githubusercontent.com/DotHarness/oratorio/master/deploy/docker/.env.example

cp .env.example .env          # 填写下方三项必填配置
mkdir -p workspace
git clone https://github.com/owner/myrepo workspace/myrepo   # 将待派发的仓库放入共享卷

docker compose up -d
```

启动后,后端监听 `http://127.0.0.1:5087`(提供 `GET /health` 健康检查),默认仅绑定回环地址。

## 必填配置(`.env`)

| 配置项 | 说明 |
| --- | --- |
| `APPSERVER_TOKEN` | AppServer 的 Bearer Token,两端共用;可通过 `openssl rand -base64 32` 生成 |
| `DOTCRAFT_API_KEY`(及 provider / model) | 供 DotCraft 运行 Agent 调用模型使用 |
| `ORATORIO_REPO0_PROJECT` / `ORATORIO_REPO0_WORKSPACE` | 仓库到共享卷路径的映射(如 `github:owner/myrepo` → `/workspace/myrepo`),每个待派发的仓库各配置一条 |

## 远程访问

所有端口默认仅绑定 `127.0.0.1`,请勿直接暴露至公网。建议通过 SSH 隧道访问:

```bash
ssh -N -L 5087:127.0.0.1:5087 user@your-server
```

随后将 Oratorio Desktop 的后端地址配置为 `http://127.0.0.1:5087`。

> [!NOTE]
> 服务器部署下,请通过 `.env` 或环境变量管理配置:配置写入接口仅接受回环请求,经隧道转发的远程请求将被拒绝。

## 延伸阅读

- [Oratorio 如何接入 DotCraft](/zh/dotcraft-workspaces)
- [配置参考](/zh/configuration)
- [DotCraft 服务器部署 ↗](https://www.dotcraft.net/zh/features/self-hosted/server-deployment)
