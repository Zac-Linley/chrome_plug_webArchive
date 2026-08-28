# 方案定稿：Web Archive 书签

## 定位

- 插件和快捷指令**只用于收藏录入**，保持轻量
- 搜索和浏览在**私有网页**完成，不塞进插件
- 数据存在**自己的 GitHub 私有仓库**，随时可导出、可迁移

## 数据流

```
Chrome 插件 ──写入──> GitHub 私有仓库（唯一数据源）──读取──> Cloudflare 搜索网页
iOS 快捷指令 ──> data/inbox/ ──插件下次同步合并──> data/bookmarks.json
```

## 仓库目录结构（数据仓库）

```
bookmarks/                ← 仓库名自选
├── README.md             ← 自动生成的书签目录（GitHub 首页可浏览）
├── data/
│   ├── bookmarks.json    ← 唯一权威数据，插件读写
│   └── inbox/            ← iOS 快捷指令写入入口（每条一个文件，避免并发冲突）
└── snapshots/            ← 可选快照，后续版本支持
    └── <bookmark-id>/
        ├── page.md
        ├── page.html
        └── page.png
```

## 数据模型（bookmarks.json）

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-08-28T10:00:00.000Z",
  "items": [
    {
      "id": "uuid",
      "url": "https://example.com",
      "title": "示例",
      "folder": "技术/前端",
      "tags": ["前端", "教程"],
      "note": "备注",
      "createdAt": "2026-08-28T10:00:00.000Z",
      "updatedAt": "2026-08-28T10:00:00.000Z",
      "deleted": false,
      "source": "extension",
      "snapshot": null
    }
  ]
}
```

## 同步与冲突

- 写入采用 GitHub Contents API 的「读 → 改 → 写」流程，携带文件 sha
- 冲突（409）时自动重试，最多 4 次，个人使用几乎不会触发
- 删除采用软删除（`deleted: true`），避免同步误恢复
- 本地 `chrome.storage.local` 缓存数据，离线时进入待同步队列，联网后自动补推
- inbox 条目按 URL 去重，避免重复收藏

## 安全

- GitHub token 只存在两处：插件本地存储、Cloudflare Worker 的 secret
- 搜索网页整体套 Cloudflare Access（邮箱验证码登录），只有你能打开，接口同样被保护
- 搜索页前端永远不接触 token

## 部件拆分

### Chrome 插件（extension/）

- 弹窗：收藏当前页，填文件夹、标签、备注
- 设置页：token 校验、新建/复用仓库、仓库初始化
- 后台：启动时合并 inbox、补推离线队列、重建 README

### 搜索网页（site/）

- 静态页面：关键词搜索（标题/URL/标签/备注/文件夹）、标签筛选、文件夹分组
- Worker 接口 `/api/bookmarks`：读取私有仓库数据，60 秒缓存
- 部署：Workers 静态资源 + secret 存储 token，Workers Builds 接仓库自动部署

### iOS 快捷指令（docs/ios-shortcut.md）

- 分享菜单接收 URL 与标题，写一条 inbox 文件，等插件下次同步合并

## 开发状态

- [x] 方案定稿
- [x] GitHub 数据层（读写、冲突重试、inbox 合并、README 生成）
- [x] Chrome 插件（弹窗录入、设置页、后台同步）
- [x] 搜索网页（Worker 接口 + 静态搜索页，已通过模拟测试）
- [x] iOS 快捷指令文档
- [ ] 快照功能（后续版本）

## 上线前需要你操作的事

1. 在 GitHub 生成 token（repo 权限）
2. 安装插件并在设置页初始化数据仓库
3. 部署搜索页（`site/README.md`）并配置 Cloudflare Access
4. 按 `docs/ios-shortcut.md` 创建快捷指令

## 测试

```bash
node scripts/smoke-github.mjs   # 数据层：建仓、添加、冲突重试、inbox 合并
node scripts/smoke-worker.mjs   # Worker：路由、缓存、数据读取
```
