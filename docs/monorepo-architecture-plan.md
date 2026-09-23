# TianSun-cup Monorepo 架构调整方案
> 阶段：第一阶段实施完成（架构迁移与验证记录）
> 日期：2026-09-23
> 边界：仅重组现有应用并统一 HTTP 服务；不扩展产品功能。
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
- 迁移以现有功能为边界；演示数据和本地静态数据仍按原用途保留。
## 2. 当前实现概览
| 组成 | 当前路径 | 职责 |
| --- | --- | --- |
| 三维展示 | `apps/pasture-3d/` | 原根目录 Three.js / Vite 工程；主页面与 legacy 页面分别构建。 |
| Vue 界面 | `apps/pasture-web/` | 原 `app/` Vue 3 + Vite 工程；开发环境 `/api` 代理至 Express。 |
| API 与管理后台 | `services/api/` | Express 路由、原 SQLite store/db、原管理后台静态资源。 |
| 统一工具与部署 | 根目录 | npm workspaces、Dockerfile、Compose、`start.sh`。 |
API 路径、方法、响应 envelope 与现有业务校验以[《后端统一接口文档》](backend-api.md)为准。三维展示及 Vue 页面中未接入 API 的演示内容仍是演示数据。
## 3. 实际目录与工作区
```text
apps/pasture-3d/       # Three.js/Vite
apps/pasture-web/      # Vue/Vite
services/api/          # Express + SQLite + 管理后台
  public/              # 原管理后台
  src/                 # app、API routers、store、db
  test/                # store 与 HTTP/API 测试
  data/                # SQLite 忽略文件、种子 JSON 跟踪
docs/backend-api.md    # 后端统一 API 契约
Dockerfile             # 多阶段前端构建及 Express runtime
compose.yaml           # 单服务部署、SQLite 持久化卷
start.sh               # Compose 启动与命令透传
package.json           # npm workspaces 和根级脚本
package-lock.json      # 唯一 npm 锁文件
```
npm workspaces 包含 `apps/*` 与 `services/*`。旧 Vue pnpm 锁文件不再作为仓库包管理入口；依赖统一由根 `package-lock.json` 锁定。
## 4. HTTP 路由布局
- `/api/*`：Express API，统一 JSON 响应及 CORS；详见独立接口文档。
- `/`、`/admin/`：原牲畜管理后台，根路径保留兼容。
- `/3d/`：三维主页面；`/3d/legacy.html`：原 legacy 页面。
- `/app/`：Vue 构建产物。
Express 作为唯一服务进程，同时托管 API 与构建产物，不新增反向代理或业务服务。两个 Vite 项目分别使用 `/3d/`、`/app/` 资源 base 路径。
## 5. 数据与兼容边界
- 继续使用 Node.js 内置 `node:sqlite` 与原 `livestock`、`todos` 数据表。
- 保留数据库为空时首次导入牲畜种子记录的行为，不在已有数据上重灌。
- Docker 将数据库置于 `livestock-data` named volume；种子 JSON 放在镜像独立路径，避免 volume 遮蔽种子文件。
- API 的方法、路径、字段、校验、状态码、CORS、错误 envelope 不以重构为由改变。
- 不添加告警、地图数据接入、用户权限、消息、报表等未实现能力。
## 6. 运行入口
根级脚本：
| 命令 | 用途 |
| --- | --- |
| `npm run dev:api` | Express 开发服务器（watch） |
| `npm run dev:app` | Vue Vite 开发服务器 |
| `npm run dev:3d` | Three.js Vite 开发服务器 |
| `npm run build` | 构建所有具备 build 脚本的 workspace |
| `npm test` | 执行 API store 与 HTTP 集成测试 |
| `npm start` | 启动 API |
生产/容器启动使用 `./start.sh`，默认执行 `docker compose up -d --build`；也可将 `down`、`logs` 等参数透传给 Compose。主机端口通过 `.env` 中 `PORT` 设置。脚本不删除卷、不重置数据库。
容器内 Express 监听 3000，Docker healthcheck 使用 `/api/health`。地图 token 通过构建参数 `VITE_TIANDITU_TOKEN` 传入，不应提交实际密钥。
## 7. 架构决策
1. **单仓库 workspace，不拆微服务**：当前应用共享发布与部署，SQLite 单实例足够匹配现状；增加服务拆分没有现有需求依据。
2. **Express 托管 API 与静态前端**：只替换 HTTP 层和静态发布入口，复用 SQLite 数据访问与业务逻辑。
3. **容器内 SQLite + 持久化 volume**：保持现有存储，无外部数据库依赖；部署按单实例使用，不将共享 SQLite 文件用于横向扩容。
## 8. 实施与验证状态
已完成工作区迁移、Express 接入、静态入口配置、Dockerfile/Compose/启动脚本，以及开发和 API 文档更新。验证命令：
```bash
npm ci
npm run build
npm test
```
HTTP 集成测试使用临时 SQLite 文件，验证健康检查、种子牲畜列表、待办创建、无效 JSON 错误 envelope 与未知 API 路由；不会改写仓库本地数据库。
验收重点仍包括容器实际构建/启动、健康检查和各静态页面资源可达。构建目前有三维工程中原有 `grass.jpg` 引用缺失警告和大型 chunk 提示；不是此次架构新增的运行功能，不能通过引入新资产或拆分产品代码来掩盖。若 Docker 环境不可用，应在交付时明确标注未验证。
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
