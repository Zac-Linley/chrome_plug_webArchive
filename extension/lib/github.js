// GitHub REST API 封装
// 负责：token 校验、仓库创建/接管、数据读写、冲突重试、inbox 合并、README 生成

const API_BASE = "https://api.github.com";
const USER_AGENT = "web-archive-extension";

export function emptyBookmarks() {
  return { schemaVersion: 1, updatedAt: null, items: [] };
}

export function normalizeBookmarks(data) {
  if (!data || typeof data !== "object") return emptyBookmarks();
  return {
    schemaVersion: data.schemaVersion || 1,
    updatedAt: data.updatedAt || null,
    items: Array.isArray(data.items) ? data.items : [],
  };
}

function encodeBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function parseRepoSpec(input) {
  if (input && typeof input === "object") {
    return { owner: input.owner, repo: input.repo };
  }
  let s = String(input || "").trim();
  if (!s) throw new Error("请输入仓库，格式如 owner/repo");
  s = s.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/\/+$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("仓库格式应为 owner/repo 或完整 GitHub 链接");
  return { owner: parts[0], repo: parts.slice(1).join("/") };
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

async function request(token, path, { method = "GET", body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || `GitHub API ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function isNetworkError(err) {
  return (
    err instanceof TypeError ||
    err?.name === "AbortError" ||
    err?.status === 0 ||
    err?.status === undefined
  );
}

// ---------- 用户与仓库 ----------

export async function getCurrentUser(token) {
  const user = await request(token, "/user");
  return { login: user.login, name: user.name || user.login };
}

export async function listRepos(token) {
  const repos = await request(token, "/user/repos?per_page=100&sort=updated");
  return repos.map((r) => ({
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
  }));
}

export async function createRepo(token, name) {
  const repo = await request(token, "/user/repos", {
    method: "POST",
    body: {
      name,
      private: true,
      auto_init: true,
      description: "Web Archive 书签数据仓库",
    },
  });
  return { owner: repo.owner.login, repo: repo.name, branch: repo.default_branch };
}

export async function getRepo(token, spec) {
  const { owner, repo } = parseRepoSpec(spec);
  const r = await request(token, `/repos/${owner}/${repo}`);
  return { owner: r.owner.login, repo: r.name, branch: r.default_branch };
}

// ---------- 文件操作 ----------

export async function getFile(token, owner, repo, path, branch) {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  try {
    const data = await request(
      token,
      `/repos/${owner}/${repo}/contents/${encodePath(path)}${ref}`
    );
    return { sha: data.sha, content: decodeBase64(data.content), size: data.size };
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

export async function putFile(token, owner, repo, path, content, { sha, message, branch } = {}) {
  const body = { message: message || `Update ${path}`, content: encodeBase64(content) };
  if (sha) body.sha = sha;
  if (branch) body.branch = branch;
  return request(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body,
  });
}

export async function listDir(token, owner, repo, path, branch) {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : "";
  try {
    return await request(
      token,
      `/repos/${owner}/${repo}/contents/${encodePath(path)}${ref}`
    );
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

export async function deleteFile(token, owner, repo, path, sha, message) {
  return request(token, `/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: "DELETE",
    body: { message: message || `Delete ${path}`, sha },
  });
}

// ---------- 读改写（带冲突重试） ----------

async function updateJsonFile(
  token,
  owner,
  repo,
  path,
  mutate,
  { message, branch, maxAttempts = 4 } = {}
) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const file = await getFile(token, owner, repo, path, branch);
    const current = file ? JSON.parse(file.content) : null;
    const next = await mutate(current);
    if (next === null || next === undefined) return { changed: false };
    const nextText = JSON.stringify(next, null, 2) + "\n";
    if (file && file.content === nextText) return { changed: false };
    try {
      await putFile(token, owner, repo, path, nextText, {
        sha: file && file.sha,
        message,
        branch,
      });
      return { changed: true };
    } catch (err) {
      lastErr = err;
      if (err.status === 409 && attempt < maxAttempts) continue;
      throw err;
    }
  }
  throw lastErr || new Error("写入失败");
}

// ---------- 书签数据 ----------

export async function readBookmarks(token, owner, repo, branch) {
  const file = await getFile(token, owner, repo, "data/bookmarks.json", branch);
  if (!file) return { bookmarks: emptyBookmarks(), sha: null };
  let parsed;
  try {
    parsed = JSON.parse(file.content);
  } catch {
    parsed = emptyBookmarks();
  }
  return { bookmarks: normalizeBookmarks(parsed), sha: file.sha };
}

export async function addBookmark(token, owner, repo, bookmark, { branch } = {}) {
  return updateJsonFile(
    token,
    owner,
    repo,
    "data/bookmarks.json",
    (current) => {
      const bm = normalizeBookmarks(current);
      bm.items = bm.items.filter((it) => it && it.id !== bookmark.id);
      bm.items.unshift(bookmark);
      bm.updatedAt = bookmark.updatedAt || new Date().toISOString();
      return bm;
    },
    {
      message: `Add bookmark: ${String(bookmark.title || bookmark.url).slice(0, 60)}`,
      branch,
    }
  );
}

export async function mergeInbox(token, owner, repo, { branch, now = new Date() } = {}) {
  const dir = await listDir(token, owner, repo, "data/inbox", branch);
  const entries = dir.filter(
    (item) => item.type === "file" && item.name.endsWith(".json")
  );
  if (!entries.length) return { merged: 0, cleared: 0 };

  const added = [];
  for (const item of entries) {
    const file = await getFile(token, owner, repo, item.path, branch);
    if (!file) continue;
    try {
      const entry = JSON.parse(file.content);
      if (!entry || !entry.url) continue;
      added.push({
        id: crypto.randomUUID(),
        url: String(entry.url),
        title: entry.title || entry.url,
        folder: entry.folder || "",
        tags: Array.isArray(entry.tags) ? entry.tags.map(String) : [],
        note: entry.note || "",
        createdAt: entry.createdAt || now.toISOString(),
        updatedAt: now.toISOString(),
        deleted: false,
        source: entry.source || "shortcut",
        snapshot: null,
      });
    } catch {
      // 跳过格式错误的文件
    }
  }

  let merged = 0;
  if (added.length) {
    const result = await updateJsonFile(
      token,
      owner,
      repo,
      "data/bookmarks.json",
      (current) => {
        const bm = normalizeBookmarks(current);
        const existing = new Set(bm.items.map((it) => it.url));
        const fresh = added.filter((it) => !existing.has(it.url));
        merged = fresh.length;
        bm.items = [...fresh, ...bm.items];
        bm.updatedAt = now.toISOString();
        return bm;
      },
      { message: `Merge ${added.length} inbox item(s)`, branch }
    );
    merged = result.changed ? merged : 0;
  }

  let cleared = 0;
  for (const item of entries) {
    try {
      await deleteFile(token, owner, repo, item.path, item.sha, "Clear inbox");
      cleared++;
    } catch {
      // 清理失败不影响主数据
    }
  }
  return { merged, cleared };
}

// ---------- 仓库初始化 ----------

export async function initRepository(token, spec, { create = false } = {}) {
  let info;
  if (create) {
    info = await createRepo(token, spec);
  } else {
    info = await getRepo(token, spec);
  }

  const existing = await getFile(token, info.owner, info.repo, "data/bookmarks.json", info.branch);
  if (!existing) {
    await putFile(token, info.owner, info.repo, "data/bookmarks.json", JSON.stringify(emptyBookmarks(), null, 2) + "\n", {
      message: "Init bookmarks.json",
      branch: info.branch,
    });
  }

  const readme = await getFile(token, info.owner, info.repo, "README.md", info.branch);
  if (!readme || create) {
    const current = existing
      ? normalizeBookmarks(JSON.parse(existing.content))
      : emptyBookmarks();
    await putFile(token, info.owner, info.repo, "README.md", renderReadme(current, info.owner, info.repo), {
      message: "Update README",
      branch: info.branch,
    });
  }

  return info;
}

// ---------- README 生成 ----------

function escapeMarkdown(s) {
  return String(s || "").replace(/([\\[\]()#*_`~|])/g, "\\$1");
}

function formatTime(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("zh-CN");
  } catch {
    return String(iso);
  }
}

export function renderReadme(bookmarks, owner, repo) {
  const bm = normalizeBookmarks(bookmarks);
  const items = bm.items.filter((it) => it && !it.deleted);
  const lines = [];
  lines.push("# 📚 Web Archive 书签目录");
  lines.push("");
  lines.push(`> 共 **${items.length}** 条书签 · 最后更新：${formatTime(bm.updatedAt)}`);
  lines.push("");
  lines.push("> 本文件由插件自动生成，请勿手改。数据源：[data/bookmarks.json](data/bookmarks.json)");
  lines.push("");

  const folders = {};
  for (const it of items) {
    const key = it.folder && it.folder.trim() ? it.folder : "未分类";
    (folders[key] ||= []).push(it);
  }
  for (const folder of Object.keys(folders).sort((a, b) => a.localeCompare(b, "zh-CN"))) {
    lines.push(`## 📁 ${folder}`);
    lines.push("");
    const list = folders[folder].slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    for (const it of list) {
      const tags = (it.tags || []).map((t) => `\`#${t}\``).join(" ");
      const note = it.note ? ` — ${escapeMarkdown(it.note)}` : "";
      const title = escapeMarkdown(it.title || it.url);
      const link = it.url ? `[${title}](${it.url})` : title;
      lines.push(`- ${link} ${tags}${note}`);
    }
    lines.push("");
  }

  const counts = new Map();
  for (const it of items) for (const t of it.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  if (counts.size) {
    lines.push("## 🏷️ 标签");
    lines.push("");
    for (const [tag, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const q = encodeURIComponent(tag);
      lines.push(`- [\`#${tag}\`](https://github.com/${owner}/${repo}/search?q=${q}&type=code)（${count}）`);
    }
    lines.push("");
  }

  const recent = items.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 10);
  if (recent.length) {
    lines.push("## 🕘 最近添加");
    lines.push("");
    for (const it of recent) {
      const tags = (it.tags || []).map((t) => `\`#${t}\``).join(" ");
      const title = escapeMarkdown(it.title || it.url);
      const link = it.url ? `[${title}](${it.url})` : title;
      lines.push(`- ${link} ${tags}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`_生成于 ${formatTime(new Date().toISOString())}_`);
  return lines.join("\n");
}
