# 牧场数据后端

`text_backend` 提供牲畜档案、待办事项 REST API 和 Web 管理后台，默认端口为 `3000`。

服务使用 Node.js 内置 HTTP 与 SQLite 模块，无需安装第三方依赖：

- 运行数据库：`data/tiansun.sqlite`
- 初始种子数据：`data/livestock.seed.json`
- 首次启动且数据库为空时，种子数据会自动导入 SQLite
- 后续新增、修改的数据只会写入 SQLite，不再写回 JSON

> SQLite 使用 Node.js 内置的 `node:sqlite`，需要 Node.js `22.5` 或更高版本。

## 启动

```bash
cd text_backend
npm start
```

开发时可启用文件监听：

```bash
npm run dev
```

启动后访问：

- 管理后台：<http://localhost:3000/>
- 健康检查：<http://localhost:3000/api/health>

小程序端开发服务器已配置 `/api` 代理到 `http://127.0.0.1:3000`，先启动本服务，再启动 `app` 即可联调。

## 数据库配置

可通过环境变量修改运行参数：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 服务端口 |
| `HOST` | `0.0.0.0` | HTTP 服务监听地址 |
| `LIVESTOCK_DB_FILE` | `data/tiansun.sqlite` | SQLite 数据库文件路径 |
| `LIVESTOCK_SEED_FILE` | `data/livestock.seed.json` | 首次启动导入的数据源 |

数据库表 `livestock` 包含耳标号、品种、性别、来源类型、母畜关系、购入信息、草场、健康状态和创建/更新时间等字段，并为状态、来源、母畜、草场和更新时间建立了索引。

数据库表 `todos` 保存 App 端新增的待办事项，包含类型、日期、时间、标题、详情、状态和创建/更新时间；按 `todo_date` 与 `todo_time` 建立组合索引，支持快速筛选当天事项。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 服务与数据库健康检查 |
| GET | `/api/todos` | 查询待办事项，支持 `date=YYYY-MM-DD` 筛选当天数据 |
| POST | `/api/todos` | 新增待办事项并写入 SQLite |
| GET | `/api/meta/options` | 来源、状态、草场、品种等选项 |
| GET | `/api/livestock` | 查询牲畜列表，支持 `q`、`status`、`sourceType` |
| GET | `/api/livestock/:id` | 查询单个牲畜档案 |
| GET | `/api/livestock/stats` | 后台统计 |
| GET | `/api/livestock/mothers` | 可选择的已建档适繁母畜 |
| POST | `/api/livestock` | 新增牲畜档案 |
| PATCH | `/api/livestock/:id` | 更新牲畜档案 |

新增生产来源示例：

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

`sourceType` 只允许：

- `born`：生产来源，`motherId` 必填，后端会校验母畜存在、性别为母且达到适繁月龄。
- `purchased`：购入来源，`purchaseDate` 必填，可填写供应商和购入价格。

新增后的数据会立即写入 SQLite，并出现在管理后台列表、来源构成和健康概况中。

## 部署说明

- SQLite 适合当前单机演示和乡镇级部署；多实例或高并发场景建议替换为 PostgreSQL/MySQL，接口结构无需变化。
- 备份时可直接复制 `data/tiansun.sqlite`，备份前建议先停止服务或执行 SQLite 在线备份。
- 跨域默认允许 `*`，生产环境可按实际域名收紧 `Access-Control-Allow-Origin`。
- 小程序正式发布时，需要将 `app/.env` 中的 `VITE_API_BASE_URL` 配置为已备案的 HTTPS 接口地址。