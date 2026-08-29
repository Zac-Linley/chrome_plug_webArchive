# 方案定稿：Web Archive 书签

## 定位

- 插件和快捷指令**只用于收藏录入**，保持轻量
- 搜索和浏览在**私有网页**完成，不塞进插件
- 数据存在**自己的 GitHub 私有仓库**，随时可导出、可迁移

## 数据流

```
Chrome 插件 ──写入──> GitHub 私有仓库（唯一数据源）──读取──> Cloudflare 搜索网页
iOS 快捷指令 ──> /api/add（Worker 抓标题并直接合并）──> data/bookmarks.json
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
        ├── page.md       ← 正文提取（markdown）
        └── page.html     ← 网页存档（完整 HTML）
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
- 同一链接重复收藏时自动更新已有记录（插件、Worker 均按 URL 去重）
- 删除采用软删除（`deleted: true`），搜索网页提供删除按钮（依赖 Cloudflare Access 登录态）
- 本地 `chrome.storage.local` 缓存数据，离线时进入待同步队列，联网后自动补推
- `data/inbox/` 作为兼容入口保留，插件同步时按 URL 去重合并

## 安全

- GitHub token 只存在两处：插件本地存储、Cloudflare Worker 的 secret
- 搜索网页整体套 Cloudflare Access（邮箱验证码登录），只有你能打开，接口同样被保护
- 搜索页前端永远不接触 token

## 部件拆分

### Chrome 插件（extension/）

- 弹窗：收藏当前页，填文件夹、标签、备注
- 快照：可选保存 HTML + Markdown（Readability 提取正文 + Turndown 转 Markdown），上传到 `snapshots/<id>/`
- 设置页：token 校验、新建/复用仓库、仓库初始化
- 后台：启动时合并 inbox、补推离线队列、重建 README

### 搜索网页（独立仓库 Zac-Linley/web-archive-search）

- 静态页面：关键词搜索（标题/URL/标签/备注/文件夹）、标签筛选、文件夹分组、删除书签、标签管理（重命名/合并/删除）
- Worker 接口：`/api/bookmarks` 读取数据（60 秒缓存）、`/api/add` 快捷指令入库、`/api/delete` 软删除、`/api/tags/*` 标签管理
- 写入成功后自动重建 README，仓库门面始终最新
- 部署：Workers 静态资源 + secret 存储 token，Workers Builds 接仓库自动部署

站点源码已拆分为独立仓库 [web-archive-search](https://github.com/Zac-Linley/web-archive-search)，部署步骤见该仓库 README。

### iOS 快捷指令（docs/ios-shortcut.md）

- 分享菜单把链接发到 Worker 的 `/api/add`，Worker 抓取标题后直接合并入库（按 URL 去重），无需等待插件
- 有现成的已签名快捷指令文件，推荐直接导入使用

## 开发状态

- [x] 方案定稿
- [x] GitHub 数据层（读写、冲突重试、inbox 合并、README 生成）
- [x] Chrome 插件（弹窗录入、设置页、后台同步）
- [x] 搜索网页（Worker 接口 + 静态搜索页，已通过模拟测试）
- [x] iOS 快捷指令（现成文件 + /api/add 直接入库）
- [x] 网页删除书签（软删除，Access 登录态）
- [x] 网页标签管理（重命名/合并/删除）
- [x] Worker 写入后自动重建 README
- [x] 快照功能（HTML + Markdown，不含截图）

## 上线前需要你操作的事

1. 在 GitHub 生成 token（repo 权限）
2. 安装插件并在设置页初始化数据仓库
3. 部署搜索页（独立仓库 [web-archive-search](https://github.com/Zac-Linley/web-archive-search)）并配置 Cloudflare Access
4. 按 `docs/ios-shortcut.md` 创建快捷指令

## 测试

```bash
node scripts/smoke-github.mjs   # 数据层：建仓、添加、冲突重试、inbox 合并
node site/scripts/smoke-worker.mjs  # Worker 测试已随 site/ 拆分到独立仓库
```
