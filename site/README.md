# Web Archive 搜索网页

Cloudflare Workers 托管的私有书签搜索页。数据来自 GitHub 私有仓库的 `data/bookmarks.json`，网页只读。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 填入 GITHUB_TOKEN
npm run dev
```

## 部署

1. 编辑 `wrangler.jsonc`，把 `REPO_OWNER`、`REPO_NAME` 换成你的数据仓库
2. 登录并配置密钥：

```bash
npx wrangler login
npx wrangler secret put GITHUB_TOKEN   # 交互式输入，不会出现在命令行里
```

3. 部署：

```bash
npm run deploy
```

部署完成后会得到一个 `*.workers.dev` 地址，直接打开即可使用。

## 本地测试

```bash
node scripts/smoke-worker.mjs
```

## 加访问控制（Cloudflare Access）

网页默认公开，请务必加上私有访问，否则任何人都能打开搜索页看到你的书签：

1. 打开 Cloudflare 控制台 → Zero Trust → Access → Applications
2. 创建 Self-hosted 应用，域名填你的 `*.workers.dev` 地址
3. 策略选「Include → Everyone → Emails」，填你自己的邮箱
4. 认证方式默认邮箱一次性验证码即可

加完后，打开网页会先要求邮箱验证码登录。

## 自动部署（Workers Builds）

1. 把本目录推到独立的 GitHub 仓库（可以私有）
2. Cloudflare 控制台 → Workers & Pages → Workers Builds → 连接该仓库
3. 设置构建命令：`npm install && npm run deploy`（或直接连接后按提示配置）

以后 push 即自动重新部署。注意构建环境里的 `GITHUB_TOKEN` 需要用 CI secret 方式配置，别写进仓库。
