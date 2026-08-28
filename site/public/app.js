const $ = (id) => document.getElementById(id);

const state = {
  bookmarks: null,
  query: "",
  tag: "",
  folder: "",
  sort: "recent",
};

function init() {
  $("search").addEventListener("input", (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });
  $("sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
  $("folder-filter").addEventListener("change", (e) => {
    state.folder = e.target.value;
    render();
  });
  $("tags").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    state.tag = state.tag === btn.dataset.tag ? "" : btn.dataset.tag;
    renderTags();
    render();
  });
  $("refresh").addEventListener("click", load);
  load();
}

async function load() {
  try {
    const res = await fetch("/api/bookmarks", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.bookmarks = await res.json();
    $("repo-link").href = repoHome();
    renderMeta();
    renderTags();
    renderFolders();
    render();
  } catch (err) {
    $("results").innerHTML = `<div class="error">加载失败：${escapeHtml(err.message || err)}<br /><br />请确认 Worker 已配置 GITHUB_TOKEN 且仓库可访问。</div>`;
    $("count").textContent = "加载失败";
  }
}

function repoHome() {
  if (!state.bookmarks || !state.bookmarks._meta) {
    return "https://github.com/";
  }
  return `https://github.com/${state.bookmarks._meta.owner}/${state.bookmarks._meta.repo}`;
}

function allItems() {
  return (state.bookmarks && Array.isArray(state.bookmarks.items)
    ? state.bookmarks.items
    : []
  ).filter((it) => it && !it.deleted);
}

function renderMeta() {
  const items = allItems();
  $("count").textContent = `${items.length} 条书签`;
  $("updated").textContent = state.bookmarks.updatedAt
    ? `最后更新 ${formatTime(state.bookmarks.updatedAt)}`
    : "";
}

function renderTags() {
  const counts = new Map();
  for (const it of allItems()) {
    for (const t of it.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  $("tags").innerHTML =
    `<button class="chip${state.tag ? "" : " active"}" data-tag="">全部</button>` +
    sorted
      .map(
        ([tag, count]) =>
          `<button class="chip${state.tag === tag ? " active" : ""}" data-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}<span class="count">${count}</span></button>`
      )
      .join("");
}

function renderFolders() {
  const folders = [...new Set(allItems().map((it) => it.folder || "").filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-CN")
  );
  const select = $("folder-filter");
  const current = state.folder;
  select.innerHTML = '<option value="">全部文件夹</option>' + folders
    .map((f) => `<option value="${escapeAttr(f)}">${escapeHtml(f)}</option>`)
    .join("");
  if (folders.includes(current)) select.value = current;
}

function filtered() {
  const items = allItems();
  return items.filter((it) => {
    if (state.tag && !(it.tags || []).includes(state.tag)) return false;
    if (state.folder && it.folder !== state.folder) return false;
    if (!state.query) return true;
    const haystack = [
      it.title,
      it.url,
      it.note,
      it.folder,
      ...(it.tags || []),
    ]
      .filter(Boolean)
      .join("\n")
      .toLowerCase();
    return haystack.includes(state.query);
  });
}

function sorted(items) {
  const list = items.slice();
  if (state.sort === "title") {
    list.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "zh-CN"));
  } else if (state.sort === "updated") {
    list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } else {
    list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }
  return list;
}

function render() {
  const items = sorted(filtered());
  $("empty").hidden = items.length > 0;
  $("results").innerHTML = items
    .map(
      (it) => `
        <article class="item">
          <a class="title" href="${escapeAttr(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title || it.url)}</a>
          <div class="url">${escapeHtml(it.url)}</div>
          <div class="chips-row">
            ${it.folder ? `<span class="folder-chip">${escapeHtml(it.folder)}</span>` : ""}
            ${(it.tags || []).map((t) => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join("")}
            <span class="time">${formatTime(it.createdAt)}</span>
          </div>
          ${it.note ? `<p class="note">${escapeHtml(it.note)}</p>` : ""}
        </article>`
    )
    .join("");
}

function formatTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return "";
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

init();
