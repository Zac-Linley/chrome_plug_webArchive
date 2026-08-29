# Web Archive 书签 · Chrome 插件

Manifest V3 插件，功能只有一个：把当前网页收藏进你的 GitHub 私有仓库。

## 安装

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 点「加载已解压的扩展程序」，选择本目录
4. 点击插件图标 → 设置，填入 GitHub token 并初始化仓库

## 使用

- 点击插件图标（或快捷键 Alt+B）收藏当前页
- 填写文件夹（如 `技术/前端`）、标签（逗号分隔）、备注
- 勾选「保存网页快照」后，会把页面正文存为 Markdown、整页存为 HTML，上传到仓库 `snapshots/<id>/`
- 保存后数据写入仓库 `data/bookmarks.json`，README 自动重建
- 离线时会进入本地队列，联网后自动补推

## 目录

```
manifest.json        MV3 清单
background.js        后台：右键收藏、启动同步、合并 inbox
lib/github.js        GitHub API 封装（读改写 + 冲突重试）
lib/store.js         本地存储（设置、缓存、离线队列）
popup/               收藏弹窗
options/             设置页（token、仓库）
vendor/              Readability + Turndown（快照提取用）
icons/               图标
```
