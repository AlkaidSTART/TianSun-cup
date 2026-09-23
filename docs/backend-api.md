# 后端统一接口文档

> 状态：以当前 `text_backend` 实现为基线的接口契约；后续 monorepo/Express 迁移应保持兼容。  
> 日期：2026-09-23  
> 说明：本文拆分记录后端统一 API，不代表本阶段已改造后端；本阶段仅产出文档。

## 1. 范围与兼容原则

统一后端由 Express 提供 HTTP 服务，但此文列出的业务接口当前由 `text_backend/server.js` 的原生 Node HTTP 服务提供。迁移框架时，路由、数据字段、校验、状态码、消息与错误响应应以现有实现为准。

覆盖范围仅包括当前已有的：健康检查、选项元数据、牲畜档案与待办事项。三维展示及 Vue 界面中的本地演示数据不因此变为后端 API，也不在此增加接口。

- 基础路径：`/api`
- 数据格式：JSON（UTF-8）
- 请求体上限：1 MiB
- CORS：当前允许任意来源 `*`；允许方法 `GET,POST,PATCH,PUT,DELETE,OPTIONS`，允许请求头 `Content-Type,Authorization`。
- 成功响应统一为 `{ "code": 0, "message": "...", "data": ... }`。
- 失败响应统一为 `{ "code": <HTTP 状态码>, "message": "...", "data": null, "details": ... }`；无字段级错误时不返回 `details`。
- HTTP 成功状态通常为 `200`，创建资源为 `201`；`code` 成功时为 `0`，失败时与 HTTP 状态码相同。
- `OPTIONS` 预检当前返回 `204`。

## 2. 接口总表

| 方法 | 路径 | 用途 | 查询参数 / 请求体 |
| --- | --- | --- | --- |
| GET | `/api/health` | 服务与 SQLite 状态 | 无 |
| GET | `/api/meta/options` | 表单选项 | 无 |
| GET | `/api/livestock` | 查询牲畜列表 | `q`、`status`、`sourceType` 可选 |
| GET | `/api/livestock/:id` | 查询单个牲畜档案 | 路径参数 `id` |
| GET | `/api/livestock/stats` | 后台牲畜统计 | 无 |
| GET | `/api/livestock/mothers` | 查询符合条件的已建档母畜 | 无 |
| POST | `/api/livestock` | 新建牲畜档案 | 牲畜档案 JSON |
| PATCH | `/api/livestock/:id` | 更新牲畜档案 | 牲畜档案字段 JSON |
| PUT | `/api/livestock/:id` | 更新牲畜档案（当前兼容别名） | 牲畜档案字段 JSON |
| GET | `/api/todos` | 查询待办事项 | `date=YYYY-MM-DD` 可选 |
| POST | `/api/todos` | 新建待办事项 | 待办 JSON |
| PATCH | `/api/todos/:id` | 更新待办事项 | 待办字段 JSON |
| PATCH | `/api/todos/:id/complete` | 标记待办为已完成 | 无 |
| DELETE | `/api/todos/:id` | 删除待办事项 | 无 |

路径中的 `:id` 应进行 URL 编码。牲畜耳标号查找会去除首尾空格、转大写并将空白替换为短横线；待办 ID 为正整数。

## 3. 通用响应与错误

### 成功示例

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

不同写接口会返回对应中文成功消息，例如“待办事项已创建”“牲畜档案已更新”。读取接口默认消息为 `ok`。

### 校验失败示例

```json
{
  "code": 400,
  "message": "待办事项校验失败",
  "data": null,
  "details": {
    "date": "日期格式不正确"
  }
}
```

当前已知常见错误：

| HTTP | 含义 / 典型消息 |
| --- | --- |
| 400 | 字段校验失败、日期格式错误、JSON 无效、路径格式错误 |
| 403 | 静态资源路径越界（非业务 API） |
| 404 | 接口不存在、牲畜/待办档案不存在、页面不存在 |
| 413 | 请求体超过 1MB 限制 |
| 500 | 未预期的服务器错误，响应消息为“服务器内部错误”，服务端记录错误日志 |

未知 `/api` 路径返回 404，消息为“接口不存在”。Express 迁移中应确保其 JSON 404/error middleware 不把 API 错误变成 HTML 错误页。

## 4. 健康检查与元数据

### `GET /api/health`

返回服务状态、服务名、存储类型、数据库文件名及服务端时间：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ok",
    "service": "tiansun-livestock-backend",
    "storage": "sqlite",
    "database": "tiansun.sqlite",
    "time": "2026-09-23T00:00:00.000Z"
  }
}
```

`time` 为运行时生成的 ISO 时间，示例值仅用于说明字段格式。

### `GET /api/meta/options`

`data` 字段包含：

- `sourceTypes`：`purchased`（购入）、`born`（生产）
- `statuses`：`normal`（正常）、`attention`（需关注）、`abnormal`（异常）、`offline`（离线）
- `pastures`：当前选项 `P-A-01` 东沟草场、`P-A-02` 北坡草场、`P-A-03` 河谷草场
- `breeds`：九龙牦牛、麦洼牦牛、藏绵羊、高原山羊
- `sexes`：`female`（母）、`male`（公）

牧场、品种、状态等当前为后端代码中的固定选项；本接口不代表动态牧场管理能力。

## 5. 牲畜档案 API

### 牲畜记录字段

`GET /api/livestock`、`GET /api/livestock/:id` 与创建/更新返回的记录字段如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 耳标号，规范化后唯一 |
| `species` | string | 物种；未传时默认“牦牛” |
| `breed` | string | 品种，必填 |
| `sex` | `female` / `male` | 性别 |
| `sourceType` | `purchased` / `born` | 来源类型 |
| `motherId` | string / null | 母畜耳标号；生产来源必填 |
| `birthDate` | string / null | 出生日期 |
| `purchaseDate` | string / null | 购入日期 |
| `supplier` | string / null | 供应商（购入来源可填） |
| `purchasePrice` | number / null | 购入价格；无法转换为有限数值时存为 null |
| `pastureId` | string | 草场 ID，必须在当前选项内 |
| `pastureName` | string | 根据 `pastureId` 填充的草场名称 |
| `owner` | string | 牧户；未传时默认“未分配” |
| `status` | string | `normal`、`attention`、`abnormal`、`offline` 之一；非法或未传时默认为 `normal` |
| `temperature` | number / null | 体温数据 |
| `heartRate` | number / null | 心率数据 |
| `steps` | number / null | 步数数据 |
| `rumination` | number / null | 反刍数据 |
| `lastReportAt` | string / null | 最近上报时间 |
| `notes` | string | 备注，未传时为空字符串 |
| `createdAt` | ISO datetime | 创建时间 |
| `updatedAt` | ISO datetime | 更新时间 |


字段仅描述当前实现返回的 JSON，不承诺前端展示的数据都来自该记录。

### `GET /api/livestock`

可选查询参数：

- `q`：不区分大小写匹配耳标号、品种、物种、牧户、草场名、母畜耳标号。
- `status`：按状态精确筛选。
- `sourceType`：按来源精确筛选。

多个条件同时提供时为 AND。默认按 `updatedAt` 倒序，再按耳标号倒序。返回完整记录数组；当前没有分页参数。

示例：`GET /api/livestock?q=SC-2026&status=normal&sourceType=born`

### `GET /api/livestock/:id`

按规范化后的耳标号查询单个档案。不存在时返回 `404`，消息“未找到该牲畜档案”。

### `GET /api/livestock/stats`

返回统计对象：

```json
{
  "total": 0,
  "online": 0,
  "normal": 0,
  "attention": 0,
  "abnormal": 0,
  "offline": 0,
  "born": 0,
  "purchased": 0,
  "female": 0,
  "male": 0
}
```

`online` 为状态不等于 `offline` 的记录数量；其他字段分别统计对应状态、来源和性别。这里的示例数字为占位说明。

### `GET /api/livestock/mothers`

返回可作为生产来源母畜的摘要数组。只包含已建档、性别为母、具有出生日期且已达到 24 月龄的牲畜。字段为 `id`、`species`、`breed`、`birthDate`、`pastureId`、`pastureName`、`owner`、`status`；按耳标号升序。

### `POST /api/livestock`

请求体字段与记录字段大体相同。必需字段：`id`、`breed`、`sex`、`sourceType`、`pastureId`；依来源类型还需提供日期/母畜。

校验与默认行为：

- `id` 去空格后转大写、空白换成 `-`；长度 4–32，仅允许大写字母、数字、短横线，且不可重复。
- `sourceType` 仅允许 `purchased` 或 `born`；`sex` 仅允许 `female` 或 `male`。
- `pastureId` 必须是元数据接口列出的现有草场 ID。
- `born`：必须选择已建档、性别为母、至少 24 月龄的 `motherId`，且 `birthDate` 需为可解析日期。
- `purchased`：`purchaseDate` 需为可解析日期；`supplier`、`purchasePrice` 可选。
- `species` 默认“牦牛”，`owner` 默认“未分配”，非法/缺省 `status` 默认为 `normal`；数值型监测字段不能转换为有限数值时变为 `null`。
- 成功返回 `201`，消息“牲畜档案已创建”，`data` 为新记录。

示例（生产来源）：

```json
{
  "id": "SC-2026-00521",
  "species": "牦牛",
  "breed": "九龙牦牛",
  "sex": "female",
  "sourceType": "born",
  "motherId": "SC-2022-00068",
  "birthDate": "2026-09-17",
  "pastureId": "P-A-01",
  "owner": "扎西",
  "notes": "顺产，母畜状态正常"
}
```

校验失败返回 `400`、“牲畜档案校验失败”，`details` 按字段名给出错误。

### `PATCH /api/livestock/:id` 与 `PUT /api/livestock/:id`

当前服务对这两个方法执行相同的更新逻辑；文档与客户端主用 `PATCH`，迁移时仍应兼容已有的 `PUT` 行为。

合并已有记录与请求字段后重新校验并更新。路径 `id` 指向已有记录；请求体中的 `id` 不用于改变主键。未找到时 `404`、“未找到该牲畜档案”；成功时消息“牲畜档案已更新”。字段校验与创建一致。

## 6. 待办事项 API

### 待办记录字段与类型

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | SQLite 自增 ID 的字符串形式 |
| `type` | string | `rotation`、`inspection`、`vaccination`、`maintenance`、`device`、`custom` |
| `date` | string | `YYYY-MM-DD` |
| `time` | string | `HH:mm`，24 小时制 |
| `title` | string | 事项名称，1–60 个字符（首尾空格会去除） |
| `detail` | string | 备注，最多 240 个字符，未传时为空字符串 |
| `status` | string | 新建为“待办”，完成后为“已完成” |
| `tone` | `warn` / `ok` | 新建为 `warn`，完成后为 `ok` |
| `createdAt` | ISO datetime | 创建时间 |
| `updatedAt` | ISO datetime | 更新时间 |

### `GET /api/todos`

可选参数 `date=YYYY-MM-DD`，筛选某日事项。日期必须是有效日历日期。传 `date` 时按时间升序、ID 升序；不传时按日期升序、时间升序、ID 升序。返回完整数组。

### `POST /api/todos`

请求体：

```json
{
  "type": "inspection",
  "date": "2026-09-23",
  "time": "09:30",
  "title": "巡查东沟草场",
  "detail": "记录草场情况"
}
```

校验：`type` 必须是上列六种类型之一；日期需是有效 `YYYY-MM-DD`；时间需符合 `HH:mm`；`title` 必填且不超过 60 字符；`detail` 不超过 240 字符。创建时服务端设置 `status="待办"`、`tone="warn"` 与时间戳，客户端传入的状态/tone 不作为创建状态依据。成功返回 `201`、消息“待办事项已创建”。

### `PATCH /api/todos/:id`

更新现有事项的日期、时间、标题、详情。实际校验时使用现有记录的 `type`，因此该接口不改变类型。成功消息“待办事项已更新”。不存在或 ID 无效时返回 `404`、“未找到该待办事项”。

### `PATCH /api/todos/:id/complete`

将现有事项设为 `status="已完成"`、`tone="ok"` 并更新 `updatedAt`。重复调用仍返回已完成记录。不存在时返回 404。成功消息“待办事项已完成”。

### `DELETE /api/todos/:id`

删除现有事项，成功消息“待办事项已删除”，`data` 仅返回被删记录的 ID：

```json
{ "id": "12" }
```

不存在或无效 ID 时返回 `404`、“未找到该待办事项”。

## 7. Express 统一实现映射

以下是目标实现组织建议，不增加 API：

```text
services/api/
├── src/
│   ├── app.js                 # Express middleware 与路由挂载
│   ├── routes/
│   │   ├── health.js          # /api/health、/api/meta/options
│   │   ├── livestock.js       # /api/livestock/**
│   │   └── todos.js           # /api/todos/**
│   ├── middleware/
│   │   └── error-handler.js   # ApiError、JSON 404、统一错误响应
│   ├── store.js               # 现有业务/SQLite 操作，原则上不改业务
│   └── db.js                  # 现有 SQLite 初始化
└── server.js                  # 监听 PORT/HOST
```

模块名称是建议，不是必须的实现约束。关键是单一 Express app 统一挂载全部现有 API，并在静态资源 fallback 前先处理 `/api`，以确保未知 API 返回 JSON 404，而不是 HTML。

## 8. API 兼容验收清单

- [ ] 路由清单中的方法、路径与查询参数均可用，未知路由为 JSON 404。
- [ ] 成功 envelope、中文消息、HTTP 状态码和空值语义与迁移前一致。
- [ ] 无效 JSON、超过 1 MiB 请求体、字段级校验错误符合本文响应结构。
- [ ] 牲畜查询过滤组合、排序、ID 规范化及唯一校验一致。
- [ ] 生产来源母畜存在性、性别、24 月龄检查一致。
- [ ] 待办日期筛选和排序、完成状态、删除返回字段一致。
- [ ] API 仍使用相同 SQLite 数据库/种子数据配置，并保证 Docker 卷持久化。
- [ ] CORS、OPTIONS 行为与迁移前兼容。

## 9. 维护说明

若后续产品需求变更 API，应同步更新本文并提供迁移/兼容说明。仅搬迁目录、替换 HTTP 框架或增加 Compose 启动，不应导致 API 清单和业务字段无故变化。
