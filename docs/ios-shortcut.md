# iOS 快捷指令：添加到书签

快捷指令只做一件事：把当前分享的网页写进仓库的 `data/inbox/` 目录，插件下次同步时自动合并入库。这样 iOS 端不需要处理 JSON 合并和冲突。

## 前置条件

- 已完成插件设置，GitHub token 拥有该仓库的写权限
- token 需要在快捷指令里再填一次（只存在你的设备上）

## 创建快捷指令步骤

1. 打开「快捷指令」App，新建快捷指令
2. 添加操作「接收快捷指令输入」，类型设为 URL 和文本（分享菜单里会自动带过来）
3. 用「从输入中获取 URL」和「从输入中获取名称」拆出链接和标题
4. 添加「文本」操作，内容粘贴下面的 JSON 模板，把其中 `URL`、`TITLE`、`CREATED_AT` 替换为对应的魔术变量
5. 对这段 JSON 执行「Base64 编码」
6. 添加「获取 URL 内容」，方法选 PUT，URL 填：

```
https://api.github.com/repos/<owner>/<repo>/contents/data/inbox/<YYYY-MM-DDTHH-mm-ss>.json
```

   文件名用当前日期时间生成，保证唯一。

7. 请求头填三项：
   - `Authorization`：`Bearer <你的 token>`
   - `Accept`：`application/vnd.github+json`
   - `Content-Type`：`application/json`
8. 请求体粘贴下面的 PUT 请求模板（`CONTENT` 替换为第 5 步的 Base64 结果）
9. 收尾加一个「显示通知」，提示收藏成功
10. 快捷指令设置里开启「在共享表单中显示」，并勾选 Safari 等 App

## JSON 模板（第 4 步用）

```json
{
  "url": "URL",
  "title": "TITLE",
  "source": "ios-shortcut",
  "createdAt": "CREATED_AT"
}
```

## PUT 请求体（第 8 步用）

```json
{
  "message": "Add from iOS Shortcuts",
  "content": "CONTENT"
}
```

## 说明

- 收藏后书签不会立刻出现在网页里，要等插件下次同步（打开插件或重启浏览器触发）
- 如需立即入库，可在快捷指令最后用「打开 URL」打开插件的收藏页；或接受稍后同步
- token 泄露风险等同于插件端，请使用只针对该仓库的细粒度 token
