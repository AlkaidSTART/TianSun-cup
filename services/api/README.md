# 统一 API 服务

本 package 是仓库唯一的后端 HTTP 服务，由 Express 提供现有 API，并托管 `apps/` 下三个 web 端的构建产物（H5、管理后台、Web 大屏）。前端源码不在本 package 内。

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

## 登录初始化与数据存储

首次启动（包括 `./start.ps1` 启动 Docker）后，必须创建首位管理员；不会生成默认密码：

```powershell
# 本地运行，密码会在终端中隐藏输入
npm run auth:bootstrap --workspace @tiansun/api -- --username admin --display-name 管理员

# Docker：在已运行的 app 容器中操作同一持久化数据库
docker compose exec app npm run auth:bootstrap --workspace @tiansun/api -- --username admin --display-name 管理员
```

该命令只能执行一次；已有牲畜与待办会在同一个 SQLite 事务中归属首位管理员。随后登录 `/admin/` 创建用户（初始密码需首次登录修改）。不要将密码写入命令行参数或 `.env`。

账号、加盐 `scrypt` 密码哈希、会话令牌哈希、业务记录均保存在 `LIVESTOCK_DB_FILE` 指向的 SQLite 文件中。默认本地路径为 `services/api/data/tiansun.sqlite`；Docker 路径为 `/app/services/api/data/tiansun.sqlite`，由 `livestock-data` 数据卷持久化。**升级前请备份数据库及其 WAL 文件/数据卷**。浏览器端使用 `HttpOnly; SameSite=Strict` 会话 Cookie，微信小程序和原生 App 在本地保存 Bearer 令牌；均不保存密码。生产环境须通过 HTTPS 提供登录和业务 API。所有牲畜、待办 API 均需登录；普通用户只可访问自己名下的记录，管理员可访问全部。3D 演示页仍公开，但不读取私有业务 API。
