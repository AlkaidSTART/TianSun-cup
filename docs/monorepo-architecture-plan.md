# TianSun-cup Monorepo 架构调整方案与落地记录

> 阶段：第一阶段实施完成（架构迁移与验证记录）
> 日期：2026-09-23
> 边界：重组现有应用并统一 HTTP 服务；不扩展产品功能。

## 1. 目标与约束

本次调整将现有前端和后端纳入 npm workspaces monorepo，以 Express 统一提供 API 与静态页面服务，并增加 Docker Compose 和启动脚本。SQLite、现有接口契约与业务行为继续沿用。

明确不新增告警处理、地图数据接入、用户/权限、消息、报表等业务能力；Vue 与 3D 页面中已有的演示/静态数据不应描述为真实后端数据。

## 2. 当前实现概览

| 组成 | 当前路径 | 职责 |
| --- | --- | --- |
| 三维展示 | `apps/pasture-3d/` | 原根目录 Three.js / Vite 工程，包含主页面和 legacy 页面。 |
| Vue 界面 | `apps/pasture-web/` | 原 `app/` Vue 3 + Vite 工程；开发环境 `/api` 代理至 Express。 |
| API 与管理后台 | `services/api/` | Express 路由、原 SQLite store/db、牲畜管理后台静态资源。 |
| 统一工具与部署 | 根目录 | npm workspaces、Dockerfile、Compose、`start.sh`。 |

后端完整接口清单与契约单独维护于[《后端统一接口文档》](backend-api.md)。

## 3. 目录与工作区

```text
apps/pasture-3d/       # Three.js/Vite
apps/pasture-web/      # Vue/Vite
services/api/          # Express + SQLite + 管理后台
  public/              # 原管理后台
  src/                 # Express app、API routers、store、db
  test/                # store 与 HTTP/API 测试
  data/                # 种子 JSON；运行时 SQLite 文件不纳入版本控制

docs/backend-api.md    # 后端统一 API 契约
Dockerfile             # 多阶段前端构建及 Express runtime
compose.yaml           # 单服务部署、SQLite 持久化卷
start.sh               # Compose 启动与命令透传
package.json           # npm workspaces 和根级脚本
package-lock.json      # 唯一 npm 锁文件
```

根工作区包括 `apps/*` 与 `services/*`。依赖统一由根 `package-lock.json` 锁定。

## 4. HTTP 路由布局

- `/api/*`：Express API，统一 JSON 响应与 CORS；详见 API 文档。
- `/`、`/admin/`：原牲畜管理后台，根路径保留兼容。
- `/3d/`：三维主页面；`/3d/legacy.html`：原 legacy 页面。
- `/app/`：Vue 构建产物。

Express 是唯一 HTTP 服务进程，同时托管 API 与前端构建产物，不新增反向代理或业务服务。两个 Vite 工程分别使用 `/3d/`、`/app/` 资源 base 路径。

## 5. 数据与兼容边界

- 继续使用 Node.js 内置 `node:sqlite` 和既有 `livestock`、`todos` 数据表。
- 保留数据库为空时首次导入牲畜种子记录的行为；已有数据不会被种子覆盖。
- Docker 将 SQLite 文件放在 `livestock-data` named volume；种子 JSON 位于独立镜像路径，避免数据卷遮蔽种子文件。
- API 方法、路径、字段、校验、状态码、CORS 与错误 envelope 以 `docs/backend-api.md` 的迁移前兼容基线为准。
- 不以架构调整为由添加产品功能或改变演示数据含义。

## 6. 本地和容器运行入口

| 命令 | 用途 |
| --- | --- |
| `npm run dev:api` | Express 开发服务器（watch） |
| `npm run dev:app` | Vue Vite 开发服务器 |
| `npm run dev:3d` | Three.js Vite 开发服务器 |
| `npm run build` | 构建所有有 build 脚本的 workspace |
| `npm test` | 执行 API store 与 HTTP 集成测试 |
| `npm start` | 启动 API |
| `./start.sh` | 构建并后台启动 Compose 服务 |

`start.sh` 支持透传 `down`、`logs` 等 Compose 命令，不会删除卷或重置数据库。默认主机端口为 `3000`，可通过根 `.env` 的 `PORT` 调整。地图 token 可在构建时通过 `VITE_TIANDITU_TOKEN` 传入；该前端配置会进入客户端构建产物，应按公开客户端配置管理，不放置服务端密钥。

## 7. 架构决策

1. **单仓库 workspace，不拆微服务**：现有应用共享发布和部署，SQLite 单实例匹配当前规模；没有依据增加服务拆分。
2. **Express 托管 API 与静态前端**：只替换 HTTP 层和静态发布入口，沿用 SQLite 数据访问与业务逻辑。
3. **容器内 SQLite + 持久化 volume**：不引入外部数据库；容器按单实例部署，不通过多副本共享 SQLite 文件横向扩容。

## 8. 实施与验证状态

已完成工作区整理、Express 接入、静态路由配置、Dockerfile/Compose/启动脚本以及开发和 API 文档更新。已验证：

- `npm run build`：两个前端构建通过。
- `npm test`：store 测试与 HTTP API 集成测试通过（2 项）。HTTP 测试使用临时 SQLite 文件。
- `docker compose config --quiet` 与 `docker compose build`：通过。
- 通过 `start.sh` 从仓库外目录启动成功；容器 healthcheck 状态为 healthy。
- `/`、`/admin/`、`/3d/`、`/3d/legacy.html`、`/app/`、`/api/health` 均返回 200；逐页引用的静态资源请求成功；未知 API 返回 JSON 404。
- 已使用 Compose `down` 停止容器；未删除 SQLite volume。

构建输出仍提示 3D 源代码引用的 `grass.jpg` 不存在及部分 JS chunk 大于 500 kB。两项均为既有工程警告，本次没有添加资源或改变应用功能来掩盖它们。
