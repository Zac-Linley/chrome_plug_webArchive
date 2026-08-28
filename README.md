# Web Archive 书签

把网页收藏进你自己的 GitHub 私有仓库。Chrome 插件负责录入，Cloudflare 网页负责检索，数据完全由你掌控。

## 三个部件

| 部件 | 位置 | 作用 |
|---|---|---|
| Chrome 插件 | `extension/` | 收藏当前页，写入 GitHub 私有仓库 |
| 搜索网页 | 独立仓库 `Zac-Linley/web-archive-search` | Cloudflare Workers 托管的私有搜索页，仅自己可访问 |
| 数据仓库 | 你的私有 GitHub 仓库 | `data/bookmarks.json` 是唯一数据源 |

## 快速开始

1. 安装插件：打开 `chrome://extensions`，开启开发者模式，加载 `extension/` 目录
2. 打开插件设置：填入 GitHub token，新建或选择私有仓库
3. 部署搜索页：克隆 [web-archive-search](https://github.com/Zac-Linley/web-archive-search)，按其中 README 操作
4. 配置 iOS 快捷指令：按 `docs/ios-shortcut.md` 操作

## 目录结构

```
extension/        Chrome 插件（Manifest V3）
docs/             方案与使用文档
```

## 关联仓库

- 本项目（插件源码与文档）：`Zac-Linley/chrome_plug_webArchive`
- 搜索网页（独立仓库，供 Workers Builds 自动部署）：[Zac-Linley/web-archive-search](https://github.com/Zac-Linley/web-archive-search)
- 书签数据仓库：由插件设置页自动创建

## 方案文档

完整架构见 [docs/architecture.md](docs/architecture.md)。
