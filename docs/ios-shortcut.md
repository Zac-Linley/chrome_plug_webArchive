# iOS 快捷指令：添加到书签

快捷指令只做一件事：把当前分享的网页写进仓库的 `data/inbox/` 目录，插件下次同步时自动合并入库。这样 iOS 端不需要处理 JSON 合并和冲突。

> **推荐直接用现成的快捷指令文件**：`Add to Web Archive.shortcut` 已签名，从 Mac 拖进快捷指令 App 或通过 AirDrop/iCloud 传到手机即可导入。它会调用 Worker 的 `/api/add`，Worker 抓取标题后**直接合并入库**，不需要等插件同步。
>
> 以下手动步骤保留供参考（旧版流程，写入 inbox 后需插件同步；如果按旧版手建，注意发请求时要带 `X-Add-Key` 请求头）。

> 下面按英文系统界面标注操作名（括号里是中文名），方便对照查找。

## 前置条件

- 已完成插件设置，GitHub token 拥有该仓库的写权限
- token 需要在快捷指令里再填一次（只存在你的设备上）

## 创建快捷指令步骤

1. 打开「快捷指令」App，新建快捷指令
2. 点右上角 **ⓘ（Details）**，打开 **Show in Share Sheet**（在共享表单中显示）
3. 返回画布，顶部会自动出现一个 **Receive ... from ...**（接收…来自…）输入块——这是自动生成的，**不用在操作列表里搜**；点它把输入类型设为 URL 和 Text（保持 Anything 也可以）
4. 用 **Get URLs from Input**（从输入中获取 URL）和 **Get Name**（获取名称，英文就叫 Get Name，没有 "from Input"）拆出链接和标题
5. 添加 **Text**（文本）操作，内容粘贴下面的 JSON 模板，把其中 `URL`、`TITLE`、`CREATED_AT` 替换为对应的魔术变量
6. 对这段 JSON 执行 **Base64 Encode**（Base64 编码）
7. 添加 **Get Contents of URL**（获取 URL 内容），Method 选 PUT，URL 填：

```
https://api.github.com/repos/<owner>/<repo>/contents/data/inbox/<YYYY-MM-DDTHH-mm-ss>.json
```

   文件名用当前日期时间生成，保证唯一。

8. 请求头填三项：
   - `Authorization`：`Bearer <你的 token>`
   - `Accept`：`application/vnd.github+json`
   - `Content-Type`：`application/json`
9. 请求体粘贴下面的 PUT 请求模板（`CONTENT` 替换为第 6 步的 Base64 结果）
10. 收尾加一个 **Show Notification**（显示通知），提示收藏成功
11. 如果第 3 步画布顶部没出现输入块：先随便添加一个操作（比如 Text），再回到 ⓘ 里把 Show in Share Sheet 关掉重开一次

> 分享菜单里要看到这个快捷指令，前提是第 2 步的 Show in Share Sheet 已开启，并在分享时选择它。

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

- 使用现成的快捷指令（走 `/api/add`）时立即入库，无需等待
- token 泄露风险等同于插件端，请使用只针对该仓库的细粒度 token
