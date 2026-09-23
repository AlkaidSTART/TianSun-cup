# TianSun-cup 智慧放牧系统

本仓库采用 npm workspaces 管理现有前端和统一 API 服务：

- `apps/pasture-3d`：Three.js / Vite 三维放牧展示，包含主页面和 legacy 页面。
- `apps/pasture-web`：Vue 3 / Vite 界面。
- `services/api`：Express API、SQLite 数据层及现有牲畜管理后台静态资源。
- `docs/monorepo-architecture-plan.md`：目标架构和本次落地说明。
- `docs/backend-api.md`：现有后端 API 的独立契约文档。

本次调整仅重组现有代码并统一 HTTP 服务；页面中原有的演示/静态数据仍为演示数据，不代表新增了后端业务能力。

## 环境要求

- Node.js `>=22.5`（使用内置 `node:sqlite`）
- npm
- 容器启动需要 Docker Engine 和 Docker Compose 插件

## 安装、构建与测试

在仓库根目录执行：

```bash
npm ci
npm run build
npm test
```

`npm run build` 会构建两个前端；API 使用 Node.js 直接运行，不需要单独编译。

## 本地开发

先启动 API：

```bash
npm run dev:api
```

另开终端启动需要调试的前端：

```bash
npm run dev:app  # Vue Vite，默认 http://localhost:5173
npm run dev:3d   # 三维 Vite
```

Vue 开发服务器将 `/api` 代理到 `http://127.0.0.1:3000`。三维前端地图 token 可通过 `apps/pasture-3d/.env` 中的 `VITE_TIANDITU_TOKEN` 配置；未配置时不影响构建，但地图服务可能无法按预期加载。API 默认监听 `0.0.0.0:3000`，支持 `HOST`、`PORT`、`LIVESTOCK_DB_FILE` 和 `LIVESTOCK_SEED_FILE` 环境变量。

## Docker Compose 启动

复制 `.env.example` 为 `.env`，按需设置端口和地图 token，然后运行：

```bash
./start.sh
```

启动成功后，各入口为：

| 内容 | 地址路径 |
| --- | --- |
| 牲畜管理后台（兼容默认入口） | `/` 或 `/admin/` |
| 三维主页面 | `/3d/` |
| 三维 legacy 页面 | `/3d/legacy.html` |
| Vue 界面 | `/app/` |
| API 健康检查 | `/api/health` |

默认端口为 `3000`。要停止服务可运行 `./start.sh down`；Compose 数据卷 `livestock-data` 用于持久化 SQLite 数据。**不要执行 `docker compose down -v`，除非明确要删除数据库卷。**

## API 与数据

现有 API 路径、字段、校验规则和响应格式见 [`docs/backend-api.md`](docs/backend-api.md)。默认 SQLite 文件位于 `services/api/data/tiansun.sqlite`；首次启动且数据库中没有牲畜记录时，会从 `services/api/data/livestock.seed.json` 导入种子记录。容器中数据库位于持久化卷，种子文件独立于该卷。
