import {
  getSettings,
  getCache,
  saveCache,
  pushPending,
} from "../lib/store.js";
import {
  addBookmark,
  readBookmarks,
  renderReadme,
  putFile,
  isNetworkError,
  friendlyError,
} from "../lib/github.js";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const settings = await getSettings();
  if (!settings) {
    $("setup-hint").hidden = false;
    $("goto-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
    return;
  }

  $("save-form").hidden = false;
  $("save").addEventListener("click", (e) => {
    e.preventDefault();
    onSave(settings);
  });
  $("open-repo").addEventListener("click", () => {
    chrome.tabs.create({ url: `https://github.com/${settings.owner}/${settings.repo}` });
  });
  $("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  document.addEventListener("click", onSuggestClick);
  $("folder-arrow").addEventListener("click", () => toggleDropdown("folder"));
  $("tags-arrow").addEventListener("click", () => toggleDropdown("tags"));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".combo")) closeDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDropdowns();
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && !tab.url.startsWith("chrome://")) {
    $("url").value = tab.url;
    $("title").value = tab.title || "";
  }

  // 优先从仓库拉最新数据刷新缓存，离线时退回本地缓存
  let cache = await getCache();
  let fetched = false;
  try {
    const { bookmarks } = await readBookmarks(
      settings.token,
      settings.owner,
      settings.repo,
      settings.branch
    );
    await saveCache(bookmarks);
    cache = bookmarks;
    fetched = true;
  } catch {
    // 网络不可用，继续用本地缓存
  }
  fillSuggestions(cache);
  if (!fetched && !(cache && Array.isArray(cache.items) && cache.items.length)) {
    $("suggest-hint").hidden = false;
  }
}

function fillSuggestions(cache) {
  if (!cache || !Array.isArray(cache.items)) return;
  const folderCounts = new Map();
  const tagCounts = new Map();
  for (const item of cache.items) {
    if (item.folder) {
      folderCounts.set(item.folder, (folderCounts.get(item.folder) || 0) + 1);
    }
    for (const tag of item.tags || []) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  const byUsage = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN");
  const folderChips = [...folderCounts.entries()]
    .sort(byUsage)
    .slice(0, 8)
    .map(([f]) => `<button type="button" class="chip" data-suggest="folder" data-value="${escapeHtml(f)}">${escapeHtml(f)}</button>`)
    .join("");
  const tagChips = [...tagCounts.entries()]
    .sort(byUsage)
    .slice(0, 12)
    .map(([t]) => `<button type="button" class="chip" data-suggest="tag" data-value="${escapeHtml(t)}">#${escapeHtml(t)}</button>`)
    .join("");
  $("folder-suggest").innerHTML = folderChips;
  $("folder-suggest").hidden = !folderChips;
  $("tag-suggest").innerHTML = tagChips;
  $("tag-suggest").hidden = !tagChips;
  $("folder-dropdown").innerHTML = [...folderCounts.entries()]
    .sort(byUsage)
    .map(([f]) => `<button type="button" class="opt" data-select="folder" data-value="${escapeHtml(f)}">${escapeHtml(f)}</button>`)
    .join("");
  $("tags-dropdown").innerHTML = [...tagCounts.entries()]
    .sort(byUsage)
    .map(([t]) => `<button type="button" class="opt" data-select="tags" data-value="${escapeHtml(t)}">#${escapeHtml(t)}</button>`)
    .join("");
}

function onSuggestClick(e) {
  const opt = e.target.closest("[data-select]");
  if (opt) {
    fillField(opt.dataset.select, opt.dataset.value);
    closeDropdowns();
    return;
  }
  const chip = e.target.closest("[data-suggest]");
  if (!chip) return;
  fillField(chip.dataset.suggest, chip.dataset.value);
}

function fillField(kind, value) {
  if (kind === "folder") {
    $("folder").value = value;
    return;
  }
  const current = $("tags").value
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!current.includes(value)) {
    current.push(value);
    $("tags").value = current.join(", ");
  }
}

function toggleDropdown(kind) {
  const dropdown = $(`${kind}-dropdown`);
  const wasHidden = dropdown.hidden;
  closeDropdowns();
  dropdown.hidden = !wasHidden;
}

function closeDropdowns() {
  $("folder-dropdown").hidden = true;
  $("tags-dropdown").hidden = true;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function onSave(settings) {
  const url = $("url").value.trim();
  if (!url) return setStatus("没有可收藏的链接", "err");

  const bookmark = {
    id: crypto.randomUUID(),
    url,
    title: $("title").value.trim() || url,
    folder: $("folder").value.trim(),
    tags: $("tags").value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    note: $("note").value.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deleted: false,
    source: "extension",
    snapshot: null,
  };

  setBusy(true);
  setStatus("正在保存…");

  try {
    const result = await addBookmark(settings.token, settings.owner, settings.repo, bookmark, {
      branch: settings.branch,
    });
    try {
      await refreshReadme(settings);
    } catch {
      // README 是派生文件，重建失败不影响书签本身，下次同步会补
    }
    const { bookmarks } = await readBookmarks(
      settings.token,
      settings.owner,
      settings.repo,
      settings.branch
    );
    await saveCache(bookmarks);
    setStatus(result.duplicate ? "已更新已有书签 ✓" : "已收藏 ✓", "ok");
    setBusy(false);
    setTimeout(() => window.close(), 900);
  } catch (err) {
    setBusy(false);
    if (isNetworkError(err)) {
      await pushPending(bookmark);
      setStatus("离线已排队，联网后自动同步", "ok");
    } else {
      setStatus(`保存失败：${friendlyError(err)}`, "err");
    }
  }
}

async function refreshReadme(settings) {
  const { bookmarks } = await readBookmarks(
    settings.token,
    settings.owner,
    settings.repo,
    settings.branch
  );
  await putFile(
    settings.token,
    settings.owner,
    settings.repo,
    "README.md",
    renderReadme(bookmarks, settings.owner, settings.repo),
    { message: "Update README", branch: settings.branch }
  );
}

function setBusy(busy) {
  $("save").disabled = busy;
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}
