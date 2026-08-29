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

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && !tab.url.startsWith("chrome://")) {
    $("url").value = tab.url;
    $("title").value = tab.title || "";
  }

  const cache = await getCache();
  fillSuggestions(cache);
}

function fillSuggestions(cache) {
  if (!cache || !Array.isArray(cache.items)) return;
  const folders = new Set();
  const tags = new Set();
  for (const item of cache.items) {
    if (item.folder) folders.add(item.folder);
    for (const tag of item.tags || []) tags.add(tag);
  }
  $("folder-list").innerHTML = [...folders].map((f) => `<option value="${escapeHtml(f)}"></option>`).join("");
  $("tag-list").innerHTML = [...tags].map((t) => `<option value="${escapeHtml(t)}"></option>`).join("");
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
