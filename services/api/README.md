# 统一 API 服务

本 package 是仓库唯一的后端 HTTP 服务，由 Express 提供现有 API，并保留现有牲畜管理后台。

- 开发：在仓库根目录运行 `npm run dev:api`
- 启动：在仓库根目录运行 `npm start`
- 测试：在仓库根目录运行 `npm test`
- 默认地址：`http://localhost:3000`
- 默认数据库：`services/api/data/tiansun.sqlite`
- 首次初始化种子：`services/api/data/livestock.seed.json`

需要 Node.js `>=22.5`，因为 SQLite 使用 Node.js 内置的 `node:sqlite`。数据库为空时首次启动会导入种子牲畜记录；已有数据不会被种子覆盖。

支持的运行环境变量：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | HTTP 监听地址 |
| `PORT` | `3000` | HTTP 监听端口 |
| `LIVESTOCK_DB_FILE` | `services/api/data/tiansun.sqlite` | SQLite 数据文件路径 |
| `LIVESTOCK_SEED_FILE` | `services/api/data/livestock.seed.json` | 首次导入的数据源 |

完整接口列表、请求/响应和错误契约见 [`../../docs/backend-api.md`](../../docs/backend-api.md)。整体目录、开发和容器入口见根目录 [`../../README.md`](../../README.md)。
