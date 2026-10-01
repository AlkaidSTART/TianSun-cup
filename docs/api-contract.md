# 后端接口文档（三端统一契约）

> 状态：目标契约。第 1–8 章为**已实现并已验证**的接口；第 9 章为**本期新增待开发**接口；第 10 章为移动端新页面的响应需求；第 11 章为验收与实现清单。
> 基线：`docs/backend-api.md`（迁移前兼容基线）。本文在其基础上补齐草场分区、告警、遥测、问诊四组能力，并把移动端演示页面所依赖的数据正式纳入后端契约。
> 更新：2026-10-01

## 0. 范围与三端分工

| 端 | 工作区 | 是否需要后端 | 本期范围 |
| --- | --- | --- | --- |
| Web 大屏 | `apps/pasture-3d` | **否** | 维持纯前端演示数据（分区几何、轨迹、事件流均由固定种子在浏览器内生成），后端不提供接口。本文第 12 章仅登记其数据结构作为未来对口参考。 |
| 后台管理 | `apps/pasture-admin` | 是 | 只读概览 + 用户管理，全部为已实现接口。 |
| H5 / 小程序 / App | `apps/pasture-web` | 是 | 已有「牲畜档案」「待办事项」为真实接口；「草场」「告警」「牲畜定位与指标」「问诊」本期由演示数据转为真实接口。 |

统一约束：三个前端都由同一个 Express 进程托管（`/admin/`、`/3d/`、`/app/`），API 基础路径 `/api`，数据格式 JSON（UTF-8），请求体上限 1 MiB。

**认证分级**：除 `/api/health`、`/api/meta/options`、`/api/auth/login` 外，全部接口要求登录。第 9 章新增接口中，除 `/api/alerts/*/handle` 与 `/api/consultations/*` 写操作外，其余沿用既有的「普通用户仅见本人数据、管理员可见全部」归属规则。

## 1. 术语裁决（草场）

项目里存在两套并存的草场概念，本期**两套都保留并建立显式映射**，不迁移已有数据：

| 概念 | 编号 | 来源 | 用途 | 权威方 |
| --- | --- | --- | --- | --- |
| 管理单元（草场） | `P-A-01`、`P-A-02`、`P-A-03` | `livestock.pasture_id`、移动端草场页、后台 | 牲畜档案归属、载畜压力统计、轮换待办 | 后端 `pastures` 表（第 9.1 节） |
| 生态分区 | `area-a`…`area-d` | `apps/pasture-3d/src/config.js` `AREAS` | 3D 大屏几何、禁牧判定 | 3D 前端常量，本期不迁入后端 |

映射关系（写入 `pastures.area_code` 字段，一个管理单元属于一个生态分区；生态分区与管理的对应为多对一，`area-d` 禁牧区不对应任何管理单元）：

| 管理单元 | 名称 | 生态分区 `area_code` |
| --- | --- | --- |
| `P-A-01` | 东沟草场 | `area-a` |
| `P-A-02` | 北坡草场 | `area-b` |
| `P-A-03` | 河谷草场 | `area-c` |

字段命名统一：管理单元在主键位置用 `pastureId` / `pastureName`（沿用现有 `livestock` 字段），生态分区的字段名一律为 `areaCode`，且在本文中**只出现在附录与说明性文字里**，不出现在任何接口响应中——3D 不接后端，其他端不需要该字段。

## 2. 通用约定

### 2.1 响应信封

- 成功：`{ "code": 0, "message": "...", "data": ... }`
- 失败：`{ "code": <HTTP 状态码>, "message": "...", "data": null, "details": ... }`，无字段级错误时不返回 `details`。
- HTTP 成功状态通常 `200`，创建资源 `201`；`code` 成功为 `0`，失败等于 HTTP 状态码。
- `OPTIONS` 预检返回 `204`。
- 列表接口一律返回**裸数组**，不使用 `{items, total}` 包装（与现有 `/api/livestock`、`/api/todos` 保持一致）；分页见 2.3。

### 2.2 常见错误码

| HTTP | 含义 / 典型消息 |
| --- | --- |
| 400 | 字段校验失败、日期/时间格式错误、JSON 无效、路径格式错误 |
| 401 | 未登录、会话失效或密码错误 |
| 403 | 非管理员访问账号管理；首次登录未改密；浏览器写请求缺少 `X-Requested-With` |
| 404 | 接口不存在、档案/待办/告警/问诊不存在、非本人记录 |
| 409 | 账号重名、重复初始化管理员 |
| 413 | 请求体超过 1MB |
| 429 | 15 分钟内登录错误次数过多 |
| 500 | 未预期的服务器错误，消息为“服务器内部错误” |

**已知可观测行为（实测确认，客户端必须容忍）**：业务路由用 `router.use(requireAuth)` 对整个挂载前缀生效，认证先于路由匹配执行。因此对**未知 `/api/*` 路径**：

| 请求 | 实测结果 |
| --- | --- |
| 未认证，`GET` 或 `POST /api/不存在` | `401 请先登录` |
| 已认证，`GET /api/不存在` | `404 接口不存在` |
| 已认证，`POST /api/不存在` 且请求体非法 JSON | `404 接口不存在`（未注册的路径没有 body parser，不会抢先报解析错误） |

移动端 `http.ts` 对 `401` 的处理是清会话并跳登录页——未登录时访问打错的接口路径会表现为“被登出”。客户端不应依赖未知路径返回 404，未知接口一律按已文档化的路径调用。

**非 API 路径**：`/api` 之外未知路径同样返回 JSON（错误 middleware 对所有路径统一输出信封），消息为「页面不存在」。

### 2.3 分页与筛选参数（新增接口统一）

第 9 章新增的列表接口支持统一分页参数，且**省略时按各自默认值返回**，保证旧客户端不改代码也能用：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | int ≥ 1 | `1` | 页码 |
| `pageSize` | int 1–200 | `50` | 每页条数，超过 200 按 200 处理 |

分页响应仍为数组。是否还有下一页由客户端判断 `data.length === pageSize`。**已有接口（`/api/livestock`、`/api/todos`）本期不引入分页**，避免破坏现有客户端。

### 2.4 时间与坐标

- 时间戳统一 ISO 8601 UTC（`2026-10-01T06:30:00.000Z`）；只有日期语义的字段用 `YYYY-MM-DD`，只有时间语义的用 `HH:mm`。
- 坐标统一 WGS84 十进制度，经度在前：`[longitude, latitude]`；单独字段名为 `longitude` / `latitude`。
- 多边形一律为**首尾不重复**的顶点数组：`[[lon, lat], ...]`。

### 2.5 移动端平台约定（沿用）

| 端 | 凭证 | 额外要求 |
| --- | --- | --- |
| H5 / 后台（浏览器） | `HttpOnly; SameSite=Strict` Cookie，`Path=/api` | 非 GET 请求须带 `X-Requested-With: TianSun` |
| 微信小程序 | `Authorization: Bearer <token>` | 请求头 `X-Client-Platform: mp-weixin` |
| 原生 App | `Authorization: Bearer <token>` | 请求头 `X-Client-Platform: app-plus` |

会话默认 7 天。退出、停用账号、重置或修改密码都会撤销原会话。

## 3. 已实现接口总表

| 方法 | 路径 | 用途 | 认证 |
| --- | --- | --- | --- |
| GET | `/api/health` | 服务与 SQLite 状态 | 公开 |
| GET | `/api/meta/options` | 表单选项（含草场） | 公开 |
| POST | `/api/auth/login` | 登录 | 公开 |
| GET | `/api/auth/me` | 当前用户 | 登录 |
| POST | `/api/auth/logout` | 退出并撤销会话 | 登录 |
| POST | `/api/auth/password` | 修改本人密码并轮换会话 | 登录 |
| GET | `/api/users` | 账号列表 | 管理员 |
| POST | `/api/users` | 创建账号 | 管理员 |
| PATCH | `/api/users/:id` | 更新显示名 / 启用状态 | 管理员 |
| POST | `/api/users/:id/reset-password` | 重置密码，临时密码只返回一次 | 管理员 |
| GET | `/api/livestock` | 牲畜列表（`q`、`status`、`sourceType`） | 登录 |
| GET | `/api/livestock/stats` | 牲畜统计 | 登录 |
| GET | `/api/livestock/mothers` | 可作母畜的已建档个体 | 登录 |
| GET | `/api/livestock/:id` | 单个档案 | 登录 |
| POST | `/api/livestock` | 新建档案 | 登录 |
| PATCH / PUT | `/api/livestock/:id` | 更新档案 | 登录 |
| GET | `/api/todos` | 待办列表（`date`） | 登录 |
| POST | `/api/todos` | 新建待办 | 登录 |
| PATCH | `/api/todos/:id` | 更新待办 | 登录 |
| PATCH | `/api/todos/:id/complete` | 标记完成 | 登录 |
| DELETE | `/api/todos/:id` | 删除待办 | 登录 |

**路由挂载顺序注意**：`/api/livestock/stats` 与 `/api/livestock/mothers` 必须在 `/api/livestock/:id` 之前注册，否则会被当作耳标号匹配。新增接口同样遵守「静态段先于参数段」。

## 4. 健康检查与元数据

### `GET /api/health`（公开）

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ok",
    "service": "tiansun-livestock-backend",
    "storage": "sqlite",
    "database": "tiansun.sqlite",
    "time": "2026-10-01T00:00:00.000Z"
  }
}
```

### `GET /api/meta/options`（公开）

`data` 字段：`sourceTypes`、`statuses`、`pastures`、`breeds`、`sexes`。

- `sourceTypes`：`purchased`（购入）、`born`（生产）
- `statuses`：`normal`（正常）、`attention`（需关注）、`abnormal`（异常）、`offline`（离线）
- `pastures`：**本期改为读 `pastures` 表**，`[{ id, name }]`，默认仍是 `P-A-01` 东沟草场、`P-A-02` 北坡草场、`P-A-03` 河谷草场；`id` 集合与顺序及 `name` 文案必须与迁移前一致，否则会破坏 `livestock.pasture_id` 的既有校验
- `breeds`：九龙牦牛、麦洼牦牛、藏绵羊、高原山羊（仍为后端常量）
- `sexes`：`female`（母）、`male`（公）

> 移动端现状：`LivestockView.vue`、`ProfileView.vue` 各自硬编码了品种与草场选项，本期应改为消费本接口。

## 5. 账号与认证

### `POST /api/auth/login`（公开）

请求体 `{ "username", "password" }`。用户名 3–32 位字母/数字/`._-`，不区分大小写；密码 10–128 字符。

- 浏览器：设置 `Set-Cookie: tiansun_session=...; Path=/api; HttpOnly; SameSite=Strict`，响应 `data` 为 `{ expiresAt, user }`，**不返回令牌**。
- 小程序 / App（带 `X-Client-Platform`）：响应 `data` 为 `{ token, expiresAt, user }`。

`user` 结构：`{ id, username, displayName, role, isActive, mustChangePassword, createdAt, updatedAt }`，`role` 为 `admin` / `operator`。

失败：`401 账号或密码错误`；15 分钟内同「来源地址 + 用户名」连续失败 5 次后 `429 登录尝试次数过多，请 15 分钟后重试`。

### `GET /api/auth/me`（登录）

返回当前 `user` 对象。移动端据此判断登录态与 `mustChangePassword`。

### `POST /api/auth/logout`（登录）

撤销当前会话并清除 Cookie，`data` 为 `{ loggedOut: true }`，消息「已退出登录」。

### `POST /api/auth/password`（登录）

请求体 `{ "currentPassword", "newPassword" }`。成功撤销该用户全部旧会话并签发新会话；浏览器返回 `{ expiresAt, user }`，Bearer 客户端返回 `{ token, expiresAt, user }`。当前密码错误返回 `400 当前密码不正确`。

### 账号管理（管理员）

- `GET /api/users` → `user` 数组，管理员排前，其余按用户名不区分大小写升序。响应**不包含**任何密码字段。
- `POST /api/users`：`{ username, displayName, password, role }`，`role` 默认 `operator`；新账号 `mustChangePassword = true`（首次登录强制改密）。重名返回 `409 该登录账号已存在`。
- `PATCH /api/users/:id`：`{ displayName?, isActive? }`。禁止停用当前登录管理员；系统始终保留至少一个启用的管理员。
- `POST /api/users/:id/reset-password`：不接受请求体，响应 `{ user, temporaryPassword }`，`temporaryPassword` 仅此一次返回；不能对自己使用（返回 `400 请使用修改密码功能更改自己的密码`）。

## 6. 牲畜档案

### 记录字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 耳标号，规范化后唯一 |
| `userId` | string | 归属账号；客户端提交无效，创建时自动归当前登录用户 |
| `accountName` | string | 归属账号显示名（列表联查） |
| `species` | string | 物种，未传默认「牦牛」 |
| `breed` | string | 品种，必填 |
| `sex` | `female` / `male` | 性别 |
| `sourceType` | `purchased` / `born` | 来源类型 |
| `motherId` | string / null | 母畜耳标号；`born` 必填 |
| `birthDate` | string / null | 出生日期 |
| `purchaseDate` | string / null | 购入日期 |
| `supplier` | string / null | 供应商（仅 `purchased`） |
| `purchasePrice` | number / null | 购入价（仅 `purchased`） |
| `pastureId` | string | 草场 ID，须为 `/api/meta/options` 中的现有值 |
| `pastureName` | string | 由 `pastureId` 填充 |
| `owner` | string | 牧户，未传默认「未分配」 |
| `status` | string | `normal` / `attention` / `abnormal` / `offline`，非法或未传为 `normal` |
| `temperature` | number / null | 体温 |
| `heartRate` | number / null | 心率 |
| `steps` | number / null | 步数 |
| `rumination` | number / null | 反刍 |
| `lastReportAt` | string / null | 最近上报时间 |
| `notes` | string | 备注，未传为空串 |
| `createdAt` / `updatedAt` | ISO datetime | 时间戳 |

监测类字段（`temperature`、`heartRate`、`steps`、`rumination`、`lastReportAt`）在档案接口中是可写字段，代表**当前值**；本期第 9.3 节新增遥测接口后，这些字段由遥测写入路径维护为「最新一条」，档案接口不再需要客户端手工填。

### `GET /api/livestock`（登录）

筛选参数（同时提供为 AND）：`q`（不区分大小写匹配耳标号/品种/物种/牧户/草场名/母畜耳标号）、`status`、`sourceType`。默认按 `updatedAt` 倒序、`id` 倒序。返回完整数组，无分页。

### `GET /api/livestock/:id`（登录）

按规范化耳标号查询。不存在或非本人返回 `404 未找到该牲畜档案`。

### `GET /api/livestock/stats`（登录）

```json
{ "total": 0, "online": 0, "normal": 0, "attention": 0, "abnormal": 0, "offline": 0,
  "born": 0, "purchased": 0, "female": 0, "male": 0 }
```

`online` = 状态不等于 `offline` 的条数。普通用户仅统计本人记录。后台管理端首页与牲畜页统计卡片直接消费本接口；移动端 `livestockApi.stats()` 已声明但**从未被调用**，接入告警/草场页后应一并启用。

### `GET /api/livestock/mothers`（登录）

返回 `{ id, species, breed, birthDate, pastureId, pastureName, owner, status }` 数组，仅含已建档、雌性、有出生日期且满 24 月龄者，按 `id` 升序。移动端新建档案时用于母畜下拉。

### `POST /api/livestock`（登录）

必需字段：`id`、`breed`、`sex`、`sourceType`、`pastureId`；按来源追加日期/母畜。

校验与默认：
- `id` 去空格转大写、空白换 `-`；长度 4–32，仅大写字母/数字/短横线，不可重复。
- `sourceType` 仅 `purchased` / `born`；`sex` 仅 `female` / `male`。
- `pastureId` 必须存在于 `/api/meta/options`。
- `born`：`motherId` 须为已建档、雌性、满 24 月龄的**可见范围内**个体；`birthDate` 须为可解析日期。
- `purchased`：`purchaseDate` 须为可解析日期；`supplier`、`purchasePrice` 可选。
- 成功 `201`，消息「牲畜档案已创建」。

校验失败返回 `400 牲畜档案校验失败`，`details` 按字段名给出错误。

### `PATCH /api/livestock/:id`、`PUT /api/livestock/:id`（登录）

两者当前执行相同更新逻辑。合并既有记录与请求体后重新校验；路径 `id` 指向已有记录，请求体 `id` 不用于改主键。成功消息「牲畜档案已更新」，未找到返回 `404 未找到该牲畜档案`。

## 7. 待办事项

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | SQLite 自增 ID 的字符串形式 |
| `userId` / `accountName` | string | 归属账号及其显示名 |
| `type` | string | `rotation`、`inspection`、`vaccination`、`maintenance`、`device`、`custom` |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:mm`，24 小时制 |
| `title` | string | 1–60 字符（首尾空格去除） |
| `detail` | string | ≤240 字符，未传为空串 |
| `status` | string | 新建「待办」，完成「已完成」 |
| `tone` | `warn` / `ok` | 新建 `warn`，完成 `ok` |
| `createdAt` / `updatedAt` | ISO datetime | 时间戳 |

- `GET /api/todos?date=YYYY-MM-DD`：可选筛选某日。带 `date` 时按时间升序、ID 升序；不带时按日期、时间、ID 升序。日期非法返回 `400 日期格式不正确`。
- `POST /api/todos`：`{ type, date, time, title, detail }`；`status` / `tone` 由服务端按类型元数据设定，客户端传入无效。成功 `201`，消息「待办事项已创建」。
- `PATCH /api/todos/:id`：更新日期/时间/标题/详情。校验使用既有记录的 `type`，**该接口不改变类型**。消息「待办事项已更新」。
- `PATCH /api/todos/:id/complete`：置 `status=已完成`、`tone=ok`，幂等。消息「待办事项已完成」。
- `DELETE /api/todos/:id`：`data` 为 `{ "id": "12" }`，消息「待办事项已删除」。

> 移动端「我的」页的轮换待办表单把 `amount`、`from`、`to`、`area`、`herd`、`vaccine`、`deviceId` 折叠进 `title` / `detail` 文本。本期**不新增结构化列**；若后续需要按目标草场统计轮换，再单开迁移。

## 8. 静态资源与路由

| 路径 | 内容 |
| --- | --- |
| `/`、`/admin/` | 后台管理端（`/` 为兼容入口） |
| `/3d/`、`/3d/legacy.html` | Web 大屏主页面与 legacy 页面（纯静态，不调后端 API） |
| `/app/` | H5 构建产物 |
| `/api/health` | 健康检查 |

静态中间件 `fallthrough: true`；非 API 的未知路径返回 JSON 404「页面不存在」，路径越界返回 403。

---

## 9. 本期新增接口

四组能力对应移动端四个演示页面。归属规则如下，**告警是唯一例外**：

| 接口组 | 普通用户可见范围 | 管理员 |
| --- | --- | --- |
| 草场分区 `pastures` | 全局（分区本身不归属账号），`currentLoad` 按本人可见牲畜计算 | 全部 |
| 告警 `alerts` | 本人牲畜产生的告警 **+ 全局草场压力告警** | 全部 |
| 遥测 `telemetry` | 仅本人牲畜 | 全部 |
| 问诊 `consultations` | 仅本人发起的 | 全部 |

草场压力告警没有归属账号（它由分区承载状况产生，不属于任何牧户），因此对**所有账号可见**，且任何账号都可以标记处理。其归属在库内记为系统哨兵值，普通账号的可见范围为「本人 `user_id` **或** 该哨兵值」。这是刻意的设计：把草场告警藏起来会让移动端告警页的「载畜压力偏高」条目凭空消失。

### 9.1 草场分区 `pastures`

新增 SQLite 表 `pastures`（复数 + snake_case）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | TEXT PK | `P-A-01` / `P-A-02` / `P-A-03` |
| `name` | TEXT | 东沟草场 / 北坡草场 / 河谷草场 |
| `area_code` | TEXT | 生态分区映射：`area-a` / `area-b` / `area-c`（见第 1 章） |
| `area_size` | REAL | 面积（亩），默认 320 / 210 / 280 |
| `quality` | TEXT | `excellent`（优良）/ `fair`（一般）/ `poor`（较差）/ `closed`（禁牧） |
| `capacity` | INTEGER | 载畜上限（头），默认 60 / 48 / 55 |
| `sort_order` | INTEGER | 展示顺序 |
| `created_at` / `updated_at` | TEXT | 时间戳 |

建表与种子（默认三行）走迁移文件，与现有 `db.js` 的 `CREATE TABLE IF NOT EXISTS` 与首次种子导入同一模式。`livestock.pasture_id` 不加外键约束，避免破坏既有数据；校验改为查 `pastures` 表。

`areaCode` 不出现在任何响应中——它只是后端用于把管理单元对回 3D 生态分区的内部映射。

#### `GET /api/pastures`

返回分区列表，含**实时载畜**。`data` 为数组：

```json
[
  {
    "id": "P-A-01",
    "name": "东沟草场",
    "quality": "excellent",
    "qualityLabel": "优良",
    "areaSize": 320,
    "capacity": 60,
    "currentLoad": 45,
    "pressure": 0.75,
    "coverage": 0.75,
    "overloaded": false,
    "tone": "ok"
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `currentLoad` | int | 当前归属该草场且在可见范围内的牲畜数（`livestock.pasture_id` 计数），不含 `offline` 状态者 |
| `pressure` | number | `currentLoad / capacity`，保留两位小数 |
| `coverage` | number | 植被覆盖度 0–1；**本期为后端按分区维护的静态值**（默认 0.75 / 0.58 / 0.82，对应东沟/北坡/河谷），无传感来源 |
| `overloaded` | bool | 是否超过承载阈值（`pressure > 0.80`） |
| `tone` | `ok` / `warn` | `overloaded` 或 `quality = 'poor'/'closed'` 时为 `warn`，否则 `ok` |

排序按 `sort_order`。移动端草场页与首页「草场分区」表、后台概览均消费本接口。

#### `GET /api/pastures/:id`

返回单个分区，多一个字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `metrics` | object | `{ coverage, grassHeight, soilMoisture }`，对应移动端草场详情「植被覆盖度 / 草层高度 / 土壤湿度」，单位分别为 0–1、厘米、0–1 |

同样为后端维护的静态值，无传感来源，接口语义与文档必须如实标注。不存在返回 `404 未找到该草场`。

#### `GET /api/pastures/pressure?days=7`

近 N 日分区压力时序，供首页「近 7 日草场压力」柱图。

- `days`：1–30，默认 `7`
- 响应按日升序，`data` 为 `[{ date: "2026-09-25", averagePressure: 0.56, zones: [{ pastureId, pressure }] }]`
- **本期数据来源**：新增 `pasture_pressure_daily` 表，每次 `GET /api/pastures` 计算出的压力按日 upsert 快照；历史日期无快照时返回 `null`，客户端跳过该柱。这是新增的写入路径，必须与读路径同一个事务。

#### `GET /api/pastures/carrying-capacity`

承载压力总览，供首页 KPI「草场压力指数」与后台概览卡：

```json
{
  "averagePressure": 0.75,
  "peakPressure": 0.94,
  "peakPastureId": "P-A-02",
  "peakPastureName": "北坡草场",
  "overloadedCount": 1,
  "zoneCount": 3
}
```

`averagePressure` 为各分区 `pressure` 的算术平均，保留两位小数。

> `GET /api/meta/options` 的 `pastures` 改为读本表，`id` 集合与顺序不变。

### 9.2 告警 `alerts`

新增 SQLite 表 `alerts`：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | 同 `todos`，对外字符串化 |
| `user_id` | TEXT | 归属账号 |
| `type` | TEXT | `temperature`（异常/体温）/ `pressure`（需关注/载畜压力）/ `device`（离线） |
| `severity` | TEXT | `bad` / `warn` / `off` |
| `target_type` | TEXT | `livestock` 或 `pasture` |
| `target_id` | TEXT | 耳标号或草场 ID |
| `title` | TEXT | 如「SC-2026-00286 · 体温偏高」 |
| `detail` | TEXT | 如「40.7℃ · 河谷草场 P-A-03 · 已持续 2 分钟」 |
| `status` | TEXT | `pending`（待处理）/ `handling`（处理中）/ `resolved`（已处理） |
| `triggered_at` | TEXT | 触发时间 |
| `handled_by` / `handled_at` | TEXT / NULL | 处理人与处理时间 |
| `created_at` / `updated_at` | TEXT | 时间戳 |

告警记录字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 字符串化自增 ID |
| `userId` / `accountName` | string | 归属账号及其显示名 |
| `type` | string | `temperature` / `pressure` / `device` |
| `severity` | string | `bad` / `warn` / `off` |
| `targetType` | `livestock` / `pasture` | 触发对象类型 |
| `targetId` | string | 触发对象 ID |
| `title` | string | 标题 |
| `detail` | string | 详情 |
| `status` | string | `pending` / `handling` / `resolved` |
| `statusLabel` | string | 「待处理」/「处理中」/「已处理」 |
| `triggeredAt` | ISO datetime | 触发时间 |
| `handledBy` / `handledAt` | string / null | 处理人显示名与时间 |
| `createdAt` / `updatedAt` | ISO datetime | 时间戳 |

#### `GET /api/alerts`

| 参数 | 说明 |
| --- | --- |
| `type` | 按 `temperature` / `pressure` / `device` 精确筛选 |
| `severity` | `bad` / `warn` / `off` |
| `status` | `pending` / `handling` / `resolved`；传 `open` 等价于 `pending,handling` |
| `targetId` | 按触发对象筛选 |
| `date` | `YYYY-MM-DD`，按 `triggeredAt` 的自然日筛选 |
| `page` / `pageSize` | 见 2.3，默认 `1` / `50` |

排序：`triggeredAt` 倒序、`id` 倒序。移动端告警页的「全部 / 异常 / 需关注 / 离线」四个筛选分别对应不传 `severity`、`severity=bad`、`severity=warn`、`severity=off`。

#### `GET /api/alerts/summary`

供告警页「处理进度」与首页「今日告警」KPI：

```json
{ "total": 3, "pending": 1, "handling": 1, "resolved": 1, "resolvedRate": 0.33, "bySeverity": { "bad": 1, "warn": 1, "off": 1 } }
```

`resolvedRate = resolved / total`，保留两位小数，`total = 0` 时为 `0`。可选 `date` 参数限定自然日，缺省为当天。

#### `GET /api/alerts/rules`

返回当前生效的告警阈值，供告警页右下表：

```json
{
  "temperatureAbove": 40.0,
  "pressureAbove": 0.80,
  "reportTimeoutMinutes": 30,
  "units": { "temperature": "℃", "pressure": "", "reportTimeoutMinutes": "min" }
}
```

**本期为后端常量配置，只读**，不提供写入接口。

#### `PATCH /api/alerts/:id/handle`

请求体 `{ "status": "handling" | "resolved" }`，**只允许这两个值**；`resolved` 时写入 `handledBy` / `handledAt`。不传或非法返回 `400 告警状态不正确`。

- 管理员与普通账号均可处理草场压力告警（见 9 章开头的归属表）；普通账号处理**他人**牲畜的告警返回 `404 未找到该告警`。
- 幂等：重复置为同一状态返回当前记录。
- 成功消息「告警已标记为处理中」/「告警已处理」。
- **不提供** `POST /api/alerts` 与 `DELETE`：告警由服务端规则产生，客户端不可伪造或删除。

> 告警产生：本期告警由规则引擎在遥测写入（9.3）与草场压力快照（9.1）时同步求值生成，这是与接口同等重要的新代码路径，实现时必须覆盖测试。

### 9.3 牲畜遥测与实时定位 `telemetry`

新增 SQLite 表 `livestock_telemetry`（时序）：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `livestock_id` | TEXT NOT NULL | 耳标号（不加外键，沿用档案删除语义） |
| `recorded_at` | TEXT NOT NULL | 采样时间 |
| `longitude` / `latitude` | REAL | WGS84 |
| `temperature` | REAL | 体温 |
| `heart_rate` | INTEGER | 心率 |
| `steps` | INTEGER | 步数（区间累计值或瞬时值由数据源决定，接口不做换算） |
| `rumination` | INTEGER | 反刍 |
| `health_status` | TEXT | `normal` / `attention` / `abnormal` |
| `source` | TEXT | `device` / `manual` / `seed` |

索引 `(livestock_id, recorded_at DESC)`。

#### `POST /api/telemetry`

设备或端上报一个采样点。请求体：

```json
{
  "livestockId": "SC-2026-00286",
  "recordedAt": "2026-10-01T06:30:00.000Z",
  "longitude": 102.013,
  "latitude": 33.028,
  "temperature": 40.7,
  "heartRate": 62,
  "steps": 2340,
  "rumination": 42,
  "healthStatus": "abnormal"
}
```

- 必需：`livestockId`、`recordedAt`（ISO 或 `YYYY-MM-DD HH:mm:ss`，服务端统一转 ISO）、`longitude`、`latitude`。
- 校验：`livestockId` 必须存在于**可见范围内**的档案，否则 `404 未找到该牲畜档案`；经纬度须在合法范围（经度 −180…180，纬度 −90…90），否则 `400 遥测数据校验失败`。
- 写入时序后**同步更新** `livestock` 档案上的 `temperature`、`heart_rate`、`steps`、`rumination`、`last_report_at`（仅当该采样时间晚于 `last_report_at`）与 `status`（由 `healthStatus` 映射：`normal→normal`、`attention→attention`、`abnormal→abnormal`），并据 9.2 规则求值生成/关闭告警。整个过程在一个事务内。
- 成功 `201`，消息「遥测数据已接收」，`data` 为写入的采样点。

> 本接口当前**没有鉴权之外的来源校验**（无设备密钥）。生产前必须补设备级凭证或限定为内网/回环调用；实现时在代码注释与本表下方同时留出这一约束，不得默认它对公网安全。

#### `GET /api/telemetry/latest`

移动端首页地图点位数据源。参数：`pastureId`（可选）、`status`（可选，档案状态）、`page` / `pageSize`（见 2.3，默认 1 / 200）。

`data` 为数组，每项：

```json
{
  "livestockId": "SC-2026-00286",
  "status": "abnormal",
  "statusLabel": "异常",
  "owner": "扎西",
  "pastureId": "P-A-03",
  "pastureName": "河谷草场",
  "longitude": 102.013,
  "latitude": 33.028,
  "temperature": 40.7,
  "heartRate": 62,
  "steps": 2340,
  "rumination": 42,
  "recordedAt": "2026-10-01T06:30:00.000Z",
  "staleMinutes": 2
}
```

`staleMinutes` 为距 `recordedAt` 的分钟数。无遥测记录的牲畜**不出现**在该数组中；客户端需自行与 `/api/livestock` 对比补「无数据」态。

#### `GET /api/telemetry/:livestockId`

单畜时序。参数：

| 参数 | 说明 |
| --- | --- |
| `from` / `to` | ISO 时间，闭区间；缺省为最近 24 小时 |
| `metric` | `temperature` / `heartRate` / `steps` / `rumination`；传了则只回该指标，字段名同参数名 |
| `limit` | 1–1000，默认 200，按时间倒序取 |

`data` 为按时间升序的采样点数组；`metric` 缺省时返回完整采样点对象。区间跨度上限 31 天，超出返回 `400 查询区间不能超过 31 天`。用于首页抽屉的体温曲线与移动端牲畜详情。

#### `GET /api/telemetry/summary`

供首页 KPI「在线牲畜 / 健康状态 / 今日告警」与「今日健康分布」：

```json
{
  "total": 128,
  "online": 128,
  "offline": 0,
  "normal": 121,
  "attention": 5,
  "abnormal": 2,
  "onlineRate": 1.0,
  "healthRate": 0.945,
  "reportingWithinMinutes": 30
}
```

`offline` 为档案 `status = 'offline'` 或 `staleMinutes > reportingWithinMinutes` 者；`healthRate = normal / total`。

> 与 `/api/livestock/stats` 的区别：`livestock/stats` 统计**档案**维度（来源、性别），本接口统计**实时**维度（在线率、健康率、上报新鲜度）。两者都保留，移动端首页用后者。

### 9.4 问诊 `consultations`

新增两张表：

`consultations`：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | 对外字符串化；同时生成人类可读编号 `code` |
| `code` | TEXT UNIQUE | 如 `VC-20261001-014` |
| `user_id` | TEXT | 提问的牧户账号 |
| `livestock_id` | TEXT NULL | 关联耳标号（可空） |
| `pasture_id` | TEXT NULL | 关联草场（可空） |
| `symptoms` | TEXT | 症状标签，JSON 数组字符串 |
| `description` | TEXT | 补充描述 |
| `status` | TEXT | `open` / `answered` / `closed` |
| `doctor_name` | TEXT | 接诊兽医显示名 |
| `created_at` / `updated_at` | TEXT | 时间戳 |

`consultation_messages`：

| 列 | 类型 | 说明 |
| --- | --- | --- |
| `id` | INTEGER PK AUTOINCREMENT | |
| `consultation_id` | INTEGER NOT NULL | |
| `role` | TEXT | `doctor` / `user` |
| `author_name` | TEXT | 显示名 |
| `text` | TEXT | 消息正文，≤1000 字符 |
| `created_at` | TEXT | 时间戳 |

索引 `(consultation_id, created_at)`。

#### `GET /api/consultations`

参数：`status`、`page` / `pageSize`（默认 1 / 20）。普通用户只看本人；管理员看全部。按 `created_at` 倒序。`data` 为摘要数组：

```json
{ "id": "14", "code": "VC-20261001-014", "livestockId": "SC-2026-00107",
  "title": "SC-2026-00107 · 反刍减少", "summary": "建议观察采食量，已恢复正常",
  "status": "answered", "statusLabel": "已回复", "doctorName": "张医生",
  "messageCount": 3, "createdAt": "2026-10-01T04:12:00.000Z", "updatedAt": "2026-10-01T05:02:00.000Z" }
```

`title` 由关联对象 + 首个症状服务端拼装；`summary` 取最后一条消息前 60 字。`days` 参数可选（默认 30），对应移动端「最近 30 天」。

#### `POST /api/consultations`

```json
{ "symptoms": ["体温偏高", "反刍减少"], "description": "SC-2026-00286，今天 14:20 体温 40.7℃…",
  "livestockId": "SC-2026-00286", "pastureId": null }
```

- `symptoms` 与 `description` **至少一项非空**，否则 `400 请至少选择一项症状或填写描述`。
- `livestockId` 传入时必须存在于可见范围内的档案，否则 `400 未找到该牲畜`.
- 服务端生成 `code` 并创建首条 `doctor` 问候消息；`status = 'open'`。
- 成功 `201`，消息「问诊已提交」，返回摘要 + `messages` 数组。

#### `GET /api/consultations/:id`

返回详情，含 `messages` 按时间升序。非本人（且非管理员）返回 `404 未找到该问诊`。

#### `POST /api/consultations/:id/messages`

```json
{ "text": "体温是今早测的还是昨晚？" }
```

- `text` 必填、≤1000 字符。
- 本人只能以 `user` 角色发言；管理员（兽医）以 `doctor` 角色发言并置 `status = 'answered'`。
- 成功 `201`，消息「已发送」，返回新消息对象 `{ id, role, authorName, text, createdAt }`。
- 已 `closed` 的问诊返回 `400 该问诊已关闭`。

> **本期不实现**自动兽医回复。移动端 `ConsultationView.vue` 里 `setTimeout` 生成的假医生回复必须删除，改为真实轮询或由管理员在后台回复；本期先做「提交后展示等待状态 + 轮询 `GET /api/consultations/:id`」。

#### `PATCH /api/consultations/:id`

管理员关闭问诊：`{ "status": "closed" }`。普通用户不可调用（`403`）。

## 10. 移动端页面 → 接口对照（验收用）

| 页面 / 组件 | 现状 | 本期数据来源 |
| --- | --- | --- |
| `DashboardView.vue` KPI 卡（在线牲畜 / 健康状态 / 今日告警） | 硬编码 128 / 94.5% / 03 | `GET /api/telemetry/summary`、`GET /api/alerts/summary` |
| 同上「草场压力指数」 | 硬编码 0.75 | `GET /api/pastures/carrying-capacity` |
| 同上地图点位 `dots[]` | 硬编码 10 条 | `GET /api/telemetry/latest` |
| 同上抽屉（步数 / 心率 / 反刍） | 硬编码 2,340 / 62 / 42 | `GET /api/telemetry/latest` 对应项 |
| 同上「需要立即关注」 | 硬编码 3 条 | `GET /api/alerts?status=open&pageSize=3` |
| 同上「今日健康分布」 | 硬编码 121 / 5 / 2 | `GET /api/telemetry/summary` |
| 同上「草场分区」表 | 硬编码 3 行 | `GET /api/pastures` |
| 同上「近 7 日草场压力」 | 硬编码柱高 | `GET /api/pastures/pressure?days=7` |
| `AlertsView.vue` 列表与筛选 | 硬编码 3 条 | `GET /api/alerts` |
| 同上「处理进度」 | 硬编码 67% | `GET /api/alerts/summary` |
| 同上「告警规则」表 | 硬编码 | `GET /api/alerts/rules` |
| 同上「标记已处理」 | toast | `PATCH /api/alerts/:id/handle` |
| `PastureView.vue` 全页 | 硬编码 3 个分区 | `GET /api/pastures`；详情 `GET /api/pastures/:id` |
| `LivestockView.vue` 品种/草场下拉 | 本地硬编码 | `GET /api/meta/options` |
| 同上 CSV 导出 | 客户端拼接 | 保持不变（本地导出，不新增后端接口） |
| `ProfileView.vue` 待办 | 已接 | `GET/PATCH/POST/DELETE /api/todos` |
| 同上「示范区信息」 | 硬编码只读 | 本期保持硬编码（静态宣传信息，不入库） |
| 同上通知 / 服务 / 安全行 | 硬编码 | 本期保持硬编码，不新增通知接口 |
| `ConsultationView.vue` 提交问诊 | toast | `POST /api/consultations` |
| 同上问诊记录 | 硬编码 2 条 | `GET /api/consultations` |
| 同上聊天 | 本地假回复 | `GET /api/consultations/:id` + `POST /api/consultations/:id/messages` |

后台管理端与本文档的差异：后台目前**不调用**任何写接口（新增/编辑/删除牲畜）。本期不改后台，`GET /api/livestock` 等只读接口继续满足其需求；后台错误文案中「请在 text_backend 目录运行 npm start 后重试」已过期，属前端文案修正，不在本契约范围。

## 11. 待实现清单与验收

### 11.1 实现顺序（每步独立可测）

1. `pastures` 表 + 迁移 + 种子；`/api/meta/options` 改读该表且输出不变。
2. `GET /api/pastures`、`/api/pastures/:id`、`/api/pastures/carrying-capacity`。
3. `pasture_pressure_daily` 表 + `GET /api/pastures/pressure`。
4. `livestock_telemetry` 表 + `POST /api/telemetry`（含写回档案 + 事务）。
5. `GET /api/telemetry/latest`、`/api/telemetry/:livestockId`、`/api/telemetry/summary`。
6. `alerts` 表 + 规则引擎（在遥测写入与压力快照时求值）。
7. `GET /api/alerts`、`/api/alerts/summary`、`/api/alerts/rules`、`PATCH /api/alerts/:id/handle`。
8. `consultations` + `consultation_messages` 表与四个接口。

### 11.2 测试要求

每个新增接口在 `services/api/test/` 下有对应断言，覆盖：

- 归属隔离：普通用户读不到他人数据，返回 404 而非 403；管理员可见全部。
- 信封与状态码：成功 `code: 0`，创建 `201`，校验失败 `400` 且 `details` 按字段名。
- 边界：非法 `pageSize` 截断到 200；`pressure` 在 `capacity = 0`（禁牧）时的取值（定义为 `0`，`overloaded = false`）；`staleMinutes` 跨天计算；`from`/`to` 超 31 天；空 `symptoms` + 空 `description`。
- 幂等：`PATCH /api/alerts/:id/handle` 重复调用；`/api/todos/:id/complete` 重复调用。
- 事务：`POST /api/telemetry` 失败时档案字段与告警表**都不**改变。
- 路由顺序：`/api/pastures/pressure`、`/api/alerts/summary` 不被参数路由吞掉。
- `GET /api/meta/options` 的 `pastures` 与迁移前逐字节等价（`id`、`name`、顺序）。

### 11.3 兼容验收清单

- [ ] 第 1–8 章全部接口在实现后行为不变，`docs/backend-api.md` 的清单仍成立。
- [ ] `/api/livestock`、`/api/todos` 未引入分页，旧客户端不改代码可用。
- [ ] `GET /api/meta/options` 的 `pastures` 输出与迁移前一致。
- [ ] `/api/health` 与静态路由（`/`、`/admin/`、`/3d/`、`/app/`）不受影响。
- [ ] 3D 大屏不产生任何 `/api` 请求（本期待保持）。
- [ ] `npm test` 全绿；`node --check` 覆盖新增文件。

## 12. 附录：3D 大屏数据结构登记（本期不实现）

大屏维持纯前端演示，以下结构记录自 `apps/pasture-3d/src/`，仅作为将来若接入后端时的对口参考，**不是接口契约**：

- 生态分区：`{ id, name, quality, capacity, color, polygon }`（`config.js` `AREAS`，4 个：area-a 优良 / area-b 一般 / area-c 较差 / area-d 禁牧）
- 牧户与定居点：`OWNERS`、`HERDER_SITES`（含 `settlement{longitude,latitude}`、`restZone{id,areaId,polygon}`）
- 活动范围：`HERDER_ACTIVITY_RANGES`（`{ id, ownerId, areaId, restZoneId, polygon }`，仅用于校验不上屏）
- 牲畜：60 头，含 `profile` / `device{deviceId,deviceType,protocol,lastSeenAt}` / `telemetry{recordedAt,healthStatus,metrics{bodyTemperature{value,unit,normalRange},heartRate,rumination},location{longitude,latitude,coordinateSystem:'WGS84'}}`
- 轨迹：每头每日 8 个路点，时段 `outbound 6h / grazing 7h / returning 17h / resting 18h`
- 事件流：`{ hour, kind: 'offline'|'recover'|'overflow'|'prohibited', text }`，72 小时（2026-09-17 起）

若将来接入，建议落在独立的只读聚合接口（如 `/api/screen/*`），与三端的业务接口分组隔离。
