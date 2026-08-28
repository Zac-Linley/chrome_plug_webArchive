// 搜索网页 Worker：
// - /api/bookmarks 读取 GitHub 私有仓库数据（60 秒缓存）
// - 其余请求交给静态资源（搜索页面本身）

const API_BASE = "https://api.github.com";

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (url.pathname === "/api/bookmarks") {
      return handleBookmarks(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleBookmarks(request, env, ctx) {
  if (request.method !== "GET") {
    return json({ error: "method not allowed" }, { status: 405 });
  }
  if (!env.GITHUB_TOKEN) {
    return json({ error: "GITHUB_TOKEN 未配置，请先执行 wrangler secret put GITHUB_TOKEN" }, { status: 500 });
  }
  if (!env.REPO_OWNER || !env.REPO_NAME || env.REPO_OWNER === "your-github-username") {
    return json({ error: "仓库未配置，请在 wrangler.jsonc 里填写 REPO_OWNER / REPO_NAME" }, { status: 500 });
  }

  const branch = env.REPO_BRANCH || "main";
  const cacheKey = `https://${request.headers.get("host")}/api/bookmarks`;
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `${API_BASE}/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/data/bookmarks.json?ref=${encodeURIComponent(branch)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          "User-Agent": "web-archive-search",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!res.ok) {
      return json({ error: `GitHub 读取失败：HTTP ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const bookmarks = JSON.parse(decodeBase64(data.content));
    bookmarks._meta = { owner: env.REPO_OWNER, repo: env.REPO_NAME };
    const response = json(bookmarks, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return json({ error: `读取失败：${err.message || err}` }, { status: 500 });
  }
}
