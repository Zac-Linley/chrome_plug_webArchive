// Worker 冒烟测试：模拟 env、GitHub API 与 caches，验证路由和数据读取
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "site/src/worker.js"), "utf8");
const worker = (await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"))).default;

let passed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error(`✗ ${name}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${name}`);
}

// ---------- 模拟 ----------
const cacheStore = new Map();
globalThis.caches = {
  default: {
    match: async (key) => cacheStore.get(key) || null,
    put: async (key, res) => cacheStore.set(key, res),
  },
};

const bookmarksPayload = {
  schemaVersion: 1,
  updatedAt: "2026-08-28T10:00:00.000Z",
  items: [{ id: "1", url: "https://example.com", title: "示例", tags: ["前端"] }],
};

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("/contents/data/bookmarks.json")) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: Buffer.from(JSON.stringify(bookmarksPayload), "utf8").toString("base64"),
      }),
    };
  }
  throw new Error(`unexpected fetch: ${u}`);
};

const env = {
  GITHUB_TOKEN: "test-token",
  REPO_OWNER: "tester",
  REPO_NAME: "bookmarks",
  REPO_BRANCH: "main",
  ASSETS: {
    fetch: async (req) => new Response(`static:${new URL(req.url).pathname}`, { status: 200 }),
  },
};
const ctx = { waitUntil: () => {} };

// ---------- 测试 ----------
const health = await worker.fetch(new Request("https://test/api/health"), env, ctx);
assert(health.status === 200, "/api/health 返回 200");

const data = await worker.fetch(new Request("https://test/api/bookmarks"), env, ctx);
assert(data.status === 200, "/api/bookmarks 返回 200");
const body = await data.json();
assert(body.items.length === 1 && body._meta.owner === "tester", "返回书签数据并附带仓库信息");
assert(cacheStore.size === 1, "结果写入缓存");

const cached = await worker.fetch(new Request("https://test/api/bookmarks"), env, ctx);
assert(cached.status === 200, "第二次请求命中缓存");

const missing = await worker.fetch(new Request("https://test/nope"), env, ctx);
assert((await missing.text()) === "static:/nope", "非 API 路径交给静态资源");

const badMethod = await worker.fetch(new Request("https://test/api/bookmarks", { method: "POST" }), env, ctx);
assert(badMethod.status === 405, "非 GET 返回 405");

const badRepo = await worker.fetch(
  new Request("https://test/api/bookmarks"),
  { ...env, REPO_OWNER: "your-github-username" },
  ctx
);
assert(badRepo.status === 500, "未配置仓库时返回错误提示");

console.log(`\n全部通过（${passed} 项）`);
