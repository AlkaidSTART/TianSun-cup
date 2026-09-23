# TianSun-cup 智慧放牧系统

本仓库采用 npm workspaces 管理前端和统一 API 服务：

- `apps/pasture-web`：H5 端，uni-app（Vue 3 + Vite）跨端应用，可构建 H5 与微信小程序。
- `apps/pasture-admin`：后台管理端，Vite 构建的牲畜档案管理界面。
- `apps/pasture-3d`：Web 大屏端，Three.js / Vite 三维放牧监测，包含主页面和 legacy 页面。
- `services/api`：Express API 与 SQLite 数据层，仅负责接口和静态资源托管，不再保存前端源码。
- `docs/monorepo-architecture-plan.md`：目标架构和本次落地说明。
- `docs/backend-api.md`：现有后端 API 的独立契约文档。

本次调整重组了现有代码并统一 HTTP 服务；页面中原有的演示/静态数据仍为演示数据，不代表新增了后端业务能力。

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

`npm run build` 会构建 H5 端、后台管理端和 Web 大屏端；API 使用 Node.js 直接运行，不需要单独编译。

微信小程序构建：

```bash
npm run build:mp-weixin --workspace @tiansun/pasture-web
```

构建产物位于 `apps/pasture-web/dist/build/mp-weixin`，使用微信开发者工具导入该目录即可。

## 本地开发

先启动 API：

```bash
npm run dev:api
```

另开终端按需启动要调试的 web 端：

```bash
npm run dev:h5     # H5（uni-app），默认 http://localhost:5173/app/
npm run dev:admin  # 后台管理，默认 http://localhost:5174/admin/
npm run dev:screen # Web 大屏（Three.js），默认 http://localhost:5175/3d/
```

`dev:app` 与 `dev:3d` 仍保留为兼容别名，分别等价于 `dev:h5` 和 `dev:screen`。三个开发服务器端口固定，可同时运行。

微信小程序开发：

```bash
npm run dev:mp-weixin --workspace @tiansun/pasture-web
```

随后使用微信开发者工具导入 `apps/pasture-web/dist/dev/mp-weixin`。

H5 和后台开发服务器都会将 `/api` 代理到 `http://127.0.0.1:3000`，可通过 `API_PROXY_TARGET` 覆盖。Web 大屏地图 token 可通过 `apps/pasture-3d/.env` 中的 `VITE_TIANDITU_TOKEN` 配置；未配置时不影响构建，但地图服务可能无法按预期加载。API 默认监听 `0.0.0.0:3000`，支持 `HOST`、`PORT`、`LIVESTOCK_DB_FILE` 和 `LIVESTOCK_SEED_FILE` 环境变量。

“牲畜”页面可新增牲畜档案，“我的”页面可新增待办事项；数据会通过 API 写入 SQLite。主页“今日代办”会自动筛选并展示当天事项。

## Docker Compose 启动

复制 `.env.example` 为 `.env`，按需设置端口和地图 token，然后运行：

```bash
./start.sh
```

Windows PowerShell 使用等价脚本：

```powershell
.\start.ps1
```

如果本机执行策略阻止脚本运行，可执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

启动成功后，各入口为：

| 内容 | 地址路径 |
| --- | --- |
| 管理后台（兼容默认入口） | `/` 或 `/admin/` |
| Web 大屏主页面 | `/3d/` |
| Web 大屏 legacy 页面 | `/3d/legacy.html` |
| H5 界面 | `/app/` |
| API 健康检查 | `/api/health` |

默认端口为 `3000`。要停止服务可运行 `./start.sh down`；Compose 数据卷 `livestock-data` 用于持久化 SQLite 数据。**不要执行 `docker compose down -v`，除非明确要删除数据库卷。**

## API 与数据

现有 API 路径、字段、校验规则和响应格式见 [`docs/backend-api.md`](docs/backend-api.md)。默认 SQLite 文件位于 `services/api/data/tiansun.sqlite`；首次启动且数据库中没有牲畜记录时，会从 `services/api/data/livestock.seed.json` 导入种子记录。容器中数据库位于持久化卷，种子文件独立于该卷。
