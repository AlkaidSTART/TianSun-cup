# TianSun-cup 智慧放牧系统

- `app`：Vue 3 + Vite 小程序端界面。
- `text_backend`：零依赖 Node.js 后端、SQLite 数据库、牲畜档案与待办事项 API、Web 管理后台。
- `ScreenGis`：三维可视化展示端。

## 本地联调

需要 Node.js 22.5 或更高版本。

先启动后端：

```bash
cd text_backend
npm start
```

再启动小程序端：

```bash
cd app
pnpm install
pnpm dev
```

浏览器访问 Vite 输出的地址，“牲畜”页面可新增牲畜档案，“我的”页面可新增待办事项；数据会通过 API 写入 SQLite。主页“今日代办”会自动筛选并展示当天事项。
