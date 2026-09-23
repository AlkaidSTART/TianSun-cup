# TianSun-cup Monorepo 架构调整方案

> 阶段：方案文档（仅分析与设计）  
> 日期：2026-09-23  
> 边界：本阶段只记录目标架构与迁移步骤，不修改现有应用代码、配置或依赖。

## 1. 目标与约束

### 目标

1. 将仓库统一为 monorepo，明确各应用及共享服务的目录与运行入口。
2. 将当前 Node.js 原生 HTTP 后端统一为 Express 服务，现有 API 路径、数据模型与业务行为保持兼容。
3. 为现有应用补充 Docker 镜像构建、Compose 编排与 `start.sh` 一键启动方案。
4. 保留当前仓库已经实现的功能，不借架构调整增加产品功能。

### 非目标

- 不新增告警处理、地图数据接入、用户/权限、消息、报表等业务能力。
- 不改造现有 SQLite 数据模型或 API 契约，不迁移到其他数据库。
- 不将当前静态演示数据包装成真实实时数据。
- 本文不是实施授权；当前阶段不直接改代码。

## 2. 当前仓库现状

| 组成 | 当前位置 | 当前职责与观察 |
| --- | --- | --- |
| 三维放牧展示 | 根目录 `src/`、`index.html`、`legacy.html` | 根目录独立 Vite 项目，使用 Three.js / three-tile；主页面与 legacy 页面作为两个构建入口。地图、状态等展示有本地演示数据。根 `package.json` 管理其依赖。 |
| Vue 界面 | `app/` | Vue 3 + Vite 项目，包含概览、告警、咨询、草场、牲畜、个人等视图；`livestockApi.ts` 和 `todoApi.ts` 使用 `/api`，开发服务器将该路径代理至 `127.0.0.1:3000`。多个页面展示为本地静态/演示数据，架构调整不应将其宣称为后端真实能力。 |
| 管理后台及 API | `text_backend/` | 当前 `server.js` 用 Node 原生 `http` 提供 API 和 `public/` 管理后台静态文件；`src/store.js`、`src/db.js` 承载 SQLite 读写和业务校验；SQLite 默认位于 `text_backend/data/`。最低 Node 版本要求为 22.5。 |
| 文档与启动说明 | 根 `README.md`、`text_backend/README.md` | 目前需要分别启动后端和 Vue 开发服务器；文档提到的 `ScreenGis` 目录当前不存在，三维 Vite 工程实际位于仓库根目录。 |

### 当前已有 API 范围

应原样保留并回归验证现有接口（包括方法、路径、筛选参数、成功/错误响应形态）。完整路由、字段、校验与响应契约已拆分至[《后端统一接口文档》](backend-api.md)：

- `GET /api/health`
- `GET /api/meta/options`
- 待办：`GET/POST /api/todos`、`PATCH /api/todos/:id`、`PATCH /api/todos/:id/complete`、`DELETE /api/todos/:id`
- 牲畜：`GET /api/livestock`、`GET /api/livestock/:id`、`GET /api/livestock/stats`、`GET /api/livestock/mothers`、`POST /api/livestock`、`PATCH /api/livestock/:id`

当前存储仍为 SQLite，现有 `livestock` 与 `todos` 表、种子数据首次导入、校验规则、排序/筛选行为均属兼容性范围。

## 3. 建议目标目录

以下为目标结构建议，实施时应以搬迁现有文件为主；不因为目录重组新造应用或功能。

```text
TianSun-cup/
├── apps/
│   ├── pasture-3d/          # 从根目录 Vite 三维展示工程迁入
│   │   ├── src/
│   │   ├── index.html
│   │   ├── legacy.html
│   │   └── package.json
│   └── pasture-web/         # 现有 app/ Vue 界面迁入
│       ├── src/
│       ├── index.html
│       └── package.json
├── services/
│   └── api/                 # 现有 text_backend 迁入并改由 Express 托管
│       ├── public/          # 现有牲畜管理后台静态资源
│       ├── src/             # SQLite 与业务存储代码
│       ├── test/
│       ├── server.js        # Express app 与 HTTP 启动入口
│       └── package.json
├── docs/
│   └── monorepo-architecture-plan.md
├── package.json             # workspace 根脚本与统一依赖/工具入口
├── package-lock.json        # 如采用 npm workspaces，统一维护锁文件
├── pnpm-workspace.yaml      # 仅在最终选择 pnpm 时使用；不可与 npm 方案并行维护
├── Dockerfile               # 多阶段构建现有前端并打包 Express 服务
├── compose.yaml             # 单服务应用 + SQLite 数据卷
└── start.sh                 # 本地/服务器的 Compose 启动入口
```

`docs/` 属于文档，不是 workspace package。图片、种子文件等资产随所属应用/服务一起迁移，并保留路径引用。`apps/pasture-3d`、`apps/pasture-web` 的名字仅代表现有两套前端，不表示新增功能。

### 包管理建议

根目录已有 npm `package-lock.json`，而 `app/` 单独有 pnpm 锁文件。为避免 monorepo 中多个包管理器和多个锁文件造成安装结果分叉，建议实施时先确认统一使用 npm workspaces，以根 `package.json`/`package-lock.json` 管理各 package；删改锁文件属于后续代码实施，本阶段不做。若项目维护者希望保留 pnpm，则应统一迁移为 pnpm workspace 并更新 CI/启动文档，不能同时维护两套锁文件。

## 4. 目标请求与静态资源路由

Express 是唯一后端服务和唯一 `/api/*` 入口。建议静态入口明确区分，避免不同前端争用 `/`：

| URL | 内容 | 说明 |
| --- | --- | --- |
| `/api/*` | 现有 API | 路径和响应兼容，不新增 API。 |
| `/admin/` | `text_backend/public/` 当前管理后台 | 保留现有管理后台的 HTML、CSS、JS；调整其静态资源根路径时必须做功能回归。 |
| `/3d/` | 三维展示主入口；另保留 legacy 页面入口 | 当前两套 Vite HTML 入口均需纳入构建和静态发布；不将演示态势改成实时 API 数据。 |
| `/app/` | Vue 界面 | Vite `base` 与资源路径调整后由 Express 静态托管；Vue 当前调用的 `/api` 保持同源可用。 |
| `/` | 简单入口页或重定向至既有默认界面 | 仅作为部署入口选择，不新增业务页面。实施前需决定默认落点；不建议默认为 API 健康检查。 |

这会令管理后台从当前后端根路径 `/` 调整到 `/admin/`。若要求原 URL 不变，可让 `/` 继续提供现有管理后台，再将三维与 Vue 分别放在 `/3d/`、`/app/`；实施前应以部署兼容性作最终选择。不得让 `/` 的内容选择无意中覆盖另一套应用。

生产环境的 Vue、3D 前端由 Vite 构建成静态文件，Express 提供静态托管；开发时仍可使用各 Vite 开发服务器，并将 `/api` 代理到 Express。管理后台继续使用现有静态资源。无需新增 Nginx、反向代理服务或独立 API 服务，除非后续实际部署约束明确要求。

## 5. Express 后端调整原则

1. 将 HTTP 层替换为 Express：JSON 请求体解析、CORS/OPTIONS、路由、静态文件、404 与错误处理中间件由 Express 承担。
2. 把现有 API 路由从 `server.js` 搬入路由模块；数据访问、SQLite 初始化、校验及业务逻辑继续复用 `src/store.js`、`src/db.js`，避免在路由层重写业务。
3. 保持当前请求体 1MB 限制。错误处理维持现有 `ApiError` 状态码、中文消息、响应 JSON 结构及服务器错误日志行为；需特别验证 JSON 格式错误、过大请求、未知 API 和无效静态路径。
4. 保持 `/api/health` 的既有语义、数据库状态信息；不添加新的监控/管理接口。
5. 继续通过环境变量配置 `PORT`、`HOST`、`LIVESTOCK_DB_FILE`、`LIVESTOCK_SEED_FILE`。Docker 环境中数据库路径应指向数据卷内的绝对路径，且种子文件只读挂载/打包，避免重启时覆盖已经创建的数据。
6. CORS 现状允许 `*`。架构迁移阶段为兼容应保留现状；收紧跨域策略属于单独安全/部署变更，不在本任务里顺便更改。
7. 后端仍以 Node.js 22.5+ 为运行基线，运行/测试命令统一纳入 workspace 根脚本。

## 6. Docker 与启动脚本设计

### Dockerfile（建议多阶段）

- **构建阶段**：基于 Node 22，安装 workspace 锁定依赖，分别构建现有 3D Vite 和 Vue 应用。
- **运行阶段**：基于 Node 22 精简镜像，只保留 Express 服务、生产依赖、已构建的静态资源以及必要种子文件。
- 暴露应用端口（默认 `3000`），容器内监听 `0.0.0.0`。
- 以非 root 用户运行；SQLite 文件目录需要对该用户可写。
- 使用 `node --experimental-sqlite` 的现有启动方式时，须确保 Node 运行参数与实际 22.5+ 版本匹配；不因容器化擅自更改数据库实现。

### compose.yaml（建议单应用服务）

服务 `app` 构建上述 Dockerfile，同时运行 Express、现有 API 和已构建的三套静态界面（管理后台、3D、Vue）。端口采用 `${PORT:-3000}:3000` 或等价映射，数据库目录通过命名 volume 持久化到容器内配置的 SQLite 目录。Compose 不启动数据库服务，因为项目当前使用 SQLite；不增加 Redis、反向代理或其他基础设施。

建议配置 `restart: unless-stopped`、环境变量、数据卷和服务健康检查。健康检查使用当前 `/api/health`，仅用于容器健康状态判断，不增加 API 功能。`.env`、数据库文件及敏感地图 token 不写入镜像或版本库；只提供变量说明和示例。

### start.sh（建议行为）

- 解析脚本所在仓库目录，使其可从任意当前目录调用。
- 检查 Docker Engine 与 Compose 插件是否可用；不可用时打印明确错误并退出。
- 默认构建并后台启动 Compose 服务，透传参数以允许维护者执行 `down`、`logs` 等 Compose 操作（具体参数接口在实施时确定）。
- 启动成功后打印管理后台、三维界面、Vue 界面、健康检查的本地访问路径。
- 不删除 volume、不执行数据库重置、不在启动时覆盖已有 SQLite 数据。
- 若保留本地开发启动模式，应由 README 单独说明；`start.sh` 默认定义为容器化启动入口，避免隐式执行依赖安装或破坏开发环境。

## 7. 关键决策（ADR 摘要）

### ADR-001：采用单仓库多 package，而非拆仓/微服务

- **决策**：保留一个 Git 仓库，按 `apps/` 和 `services/` 组织现有两套前端与一个后端。
- **理由**：目标是统一工程结构和启动部署；当前系统体量小、共享发布、SQLite 单机存储，没有现有证据支持拆成多个服务。
- **代价**：根工作区依赖与锁文件需要统一；应用需明确静态发布路径。

### ADR-002：使用 Express 托管现有 API 与静态产物

- **决策**：Express 为唯一后端 HTTP 层，同时发布现有静态 UI 构建产物。
- **理由**：符合统一后端要求，Compose 可保持单服务部署，不额外引入网关层。
- **代价**：需要迁移现有原生 HTTP 路由及静态文件安全逻辑，并配置多前端静态路径和 Vite `base`。
- **约束**：只替换 HTTP 框架，不重写业务存储和 API 契约。

### ADR-003：容器内保留 SQLite，使用 Docker volume 持久化

- **决策**：不引入外部数据库；数据库文件在容器数据目录，挂载持久化卷。
- **理由**：与当前实现和单机演示/部署方式一致，改造范围最小。
- **代价**：单实例写入和扩容边界保持不变；不得通过多个应用副本共享 SQLite 文件来横向扩容。

## 8. 迁移步骤（后续实施顺序）

1. **基线盘点**：记录现有 `npm run build`、Vue `pnpm build`、后端 `npm test` 结果；确认 3D 当前打包入口与资源引用，确认管理后台静态路径。
2. **建立工作区**：选定唯一包管理器，创建 workspace 配置，将根项目、`app/`、`text_backend/` 映射到目标目录；先确保搬迁前后构建命令可复现。
3. **Express 替换 HTTP 层**：添加 Express 依赖，拆分 app/server 与路由，逐一迁移现有路由和错误处理；保持 store/db 不变，跑现有测试并增加 API 兼容回归测试。
4. **静态资源统一发布**：设置 `/admin/`、`/3d/`、`/app/` 构建输出/静态目录，解决多入口与 Vite `base`；验证 CSS、JS、图片、地图贴图等路径。
5. **容器化**：增加多阶段 Dockerfile 与 Compose 数据卷、环境变量、健康检查；验证首次初始化、重启后数据保留和种子数据不会重复覆盖。
6. **启动脚本与文档**：补齐 `start.sh`、根 README 的安装/开发/测试/构建/容器启动说明和路由表。
7. **验收**：从空环境构建镜像并启动，检查各静态入口、现有 API、CRUD、筛选、母畜校验、SQLite 持久化及错误响应；与迁移前行为对比。

每一步出现行为差异时先解决兼容问题，不以“架构整理”为由改业务规则。

## 9. 验收清单

- [ ] 仓库只有一个明确的 workspace 与锁文件策略，根级命令可安装、构建和测试所有 package。
- [ ] Express 成为唯一后端 HTTP 服务，现有 API 路径/方法/字段/校验/状态码/响应 envelope 与错误语义兼容。
- [ ] SQLite 表结构、种子导入行为及已有数据可持久化；容器重建/重启不丢数据。
- [ ] 管理后台、3D 主页面及 legacy 页面、Vue 界面可由文档规定的 URL 访问，静态资源完整加载。
- [ ] 开发态 Vue `/api` 代理仍能连接 Express。
- [ ] Compose 从干净环境可构建启动，健康检查通过；`start.sh` 可从仓库外目录调用。
- [ ] 启动/部署过程不触发数据库清理或重置，不依赖手工进入子目录逐个启动服务。
- [ ] 没有新增产品功能；演示数据仍清楚保持为演示/静态数据。

## 10. 待实施时确认项

1. 默认入口 `/` 最终保留当前管理后台，还是跳转到既有 3D/Vue 界面？推荐暂时兼容当前 `/` 管理后台，并将新增静态入口分别置于 `/3d/` 与 `/app/`。
2. Docker 部署端口是否继续默认为 `3000`？本文按当前后端默认值规划。
3. 生产环境是否需要单独配置可信源 CORS？本轮建议保持当前 `*` 以避免无关行为变更。

以上选项不阻塞当前方案文档；进入代码实施前应确认 URL 默认落点及部署环境变量。
