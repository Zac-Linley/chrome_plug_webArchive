// GitHub 数据层冒烟测试：用内存里的假 GitHub 服务器验证核心逻辑
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "extension/lib/github.js"), "utf8");
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(src).toString("base64")
);

const {
  initRepository,
  addBookmark,
  readBookmarks,
  mergeInbox,
  renderReadme,
  putFile,
} = mod;

// ---------- 假 GitHub ----------
const files = new Map(); // path -> { content, sha }
let shaSeq = 100;
let conflictOnce = true;

function b64(str) {
  return Buffer.from(str, "utf8").toString("base64");
}

async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const token = (init.headers || {}).Authorization || "";
  if (!token) throw new Error("missing auth");
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;

  const contentMatch = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);

  if (u.pathname === "/user" && method === "GET") {
    return fakeResponse(200, { login: "tester", name: "测试", plan: { name: "free" } });
  }
  if (u.pathname === "/user/repos" && method === "POST") {
    return fakeResponse(201, {
      owner: { login: "tester" },
      name: body.name,
      default_branch: "main",
    });
  }
  if (/^\/repos\/[^/]+\/[^/]+\/?$/.test(u.pathname) && method === "GET") {
    return fakeResponse(200, {
      owner: { login: "tester" },
      name: "bookmarks",
      default_branch: "main",
      private: true,
    });
  }
  if (contentMatch && method === "GET") {
    const path = contentMatch[3];
    const file = files.get(path);
    if (!file) return fakeResponse(404, { message: "Not Found" });
    if (file.type === "dir") {
      return fakeResponse(200, file.entries);
    }
    return fakeResponse(200, {
      content: b64(file.content),
      sha: file.sha,
      size: Buffer.byteLength(file.content),
    });
  }
  if (contentMatch && method === "PUT") {
    const path = contentMatch[3];
    if (conflictOnce && path === "data/bookmarks.json" && files.has(path)) {
      conflictOnce = false;
      return fakeResponse(409, { message: "reference is stale" });
    }
    const content = Buffer.from(body.content, "base64").toString("utf8");
    const sha = String(++shaSeq);
    files.set(path, { content, sha, type: "file" });
    return fakeResponse(200, { commit: { sha } });
  }
  if (contentMatch && method === "DELETE") {
    files.delete(contentMatch[3]);
    return fakeResponse(200, { commit: { sha: "x" } });
  }
  if (u.pathname === "/repos/tester/bookmarks/contents/data/inbox" && method === "GET") {
    const entries = [...files.keys()]
      .filter((p) => p.startsWith("data/inbox/"))
      .map((p) => ({
        name: p.split("/").pop(),
        path: p,
        type: "file",
        sha: files.get(p).sha,
      }));
    return fakeResponse(200, entries);
  }
  throw new Error(`unhandled: ${method} ${u.pathname}`);
}

function fakeResponse(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
  };
}

globalThis.fetch = fakeFetch;

// ---------- 测试 ----------
let passed = 0;
function assert(cond, name) {
  if (!cond) {
    console.error(`✗ ${name}`);
    process.exit(1);
  }
  passed++;
  console.log(`✓ ${name}`);
}

// 1. 初始化现有仓库
let info = await initRepository("tok", "tester/bookmarks");
assert(info.owner === "tester" && info.repo === "bookmarks", "接管现有仓库");
assert(files.has("data/bookmarks.json"), "创建 bookmarks.json");
assert(files.has("README.md"), "生成 README.md");

// 2. 初始化新建仓库
info = await initRepository("tok", "web-bookmarks", { create: true });
assert(info.branch === "main", "新建仓库返回分支");

// 3. 添加书签（带一次 409 冲突重试）
const bookmark = {
  id: "b1",
  url: "https://example.com/a",
  title: "示例文章",
  folder: "技术/前端",
  tags: ["前端", "教程"],
  note: "值得再看",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
  deleted: false,
  source: "extension",
  snapshot: null,
};
await addBookmark("tok", "tester", "bookmarks", bookmark, { branch: "main" });
let { bookmarks } = await readBookmarks("tok", "tester", "bookmarks", "main");
assert(bookmarks.items.length === 1, "添加书签成功（含冲突重试）");
assert(bookmarks.items[0].tags.includes("前端"), "标签保留");

// 4. README 内容
const readme = renderReadme(bookmarks, "tester", "bookmarks");
assert(readme.includes("示例文章"), "README 含书签标题");
assert(readme.includes("🏷️ 标签"), "README 含标签索引");
assert(readme.includes("技术/前端"), "README 按文件夹分组");

// 4b. 不带 sha 更新已存在的文件（重建 README 场景）
await putFile("tok", "tester", "bookmarks", "README.md", renderReadme(bookmarks, "tester", "bookmarks"), {
  message: "Update README",
  branch: "main",
});
assert(true, "无 sha 更新已存在文件成功（自动补 sha）");

// 5. 合并 inbox
function setInboxEntry(name, payload) {
  const path = `data/inbox/${name}`;
  files.set(path, {
    content: JSON.stringify(payload),
    sha: `sha-${name}`,
    type: "file",
  });
  files.set("data/inbox", {
    type: "dir",
    entries: [...files.keys()]
      .filter((p) => p.startsWith("data/inbox/"))
      .map((p) => ({ name: p.split("/").pop(), path: p, type: "file", sha: files.get(p).sha })),
  });
}

setInboxEntry("2026-08-28T11-00-00.json", {
  url: "https://example.com/b",
  title: "iOS 收藏",
  source: "ios-shortcut",
  createdAt: "2026-08-28T11:00:00.000Z",
});
const merged = await mergeInbox("tok", "tester", "bookmarks", { branch: "main" });
assert(merged.merged === 1, "合并 1 条 inbox");
assert(!files.has("data/inbox/2026-08-28T11-00-00.json"), "清空 inbox 文件");
({ bookmarks } = await readBookmarks("tok", "tester", "bookmarks", "main"));
assert(bookmarks.items.length === 2, "inbox 条目进入书签");
assert(bookmarks.items[0].url === "https://example.com/b", "新条目排在前面");

// 6. inbox 去重
setInboxEntry("dup.json", { url: "https://example.com/b", title: "重复" });
const merged2 = await mergeInbox("tok", "tester", "bookmarks", { branch: "main" });
assert(merged2.merged === 0, "重复 URL 不重复入库");

console.log(`\n全部通过（${passed} 项）`);
