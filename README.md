# TianSun-cup 智慧放牧系统

- `app`：Vue 3 + Vite 小程序端界面。
- `text_backend`：零依赖 Node.js 后端、SQLite 数据库、牲畜档案 API 与 Web 管理后台。
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

浏览器访问 Vite 输出的地址，进入“牲畜”页面即可新增牲畜档案。生产来源必须选择已建档母畜，新增数据会通过 API 同步到 <http://localhost:3000/> 管理后台。
