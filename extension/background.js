// 后台服务：右键收藏、启动时补推离线队列、合并 inbox、重建 README

import {
  addBookmark,
  mergeInbox,
  readBookmarks,
  renderReadme,
  putFile,
  isNetworkError,
} from "./lib/github.js";
import { getSettings, getPending, setPending, saveCache } from "./lib/store.js";

async function flushPending() {
  const settings = await getSettings();
  if (!settings) return;

  const pending = await getPending();
  const kept = [];
  for (const bookmark of pending) {
    try {
      await addBookmark(settings.token, settings.owner, settings.repo, bookmark, {
        branch: settings.branch,
      });
    } catch (err) {
      if (isNetworkError(err)) return; // 离线，保持队列等下次
      kept.push(bookmark); // 其他错误：保留，避免数据丢失
    }
  }

  try {
    await mergeInbox(settings.token, settings.owner, settings.repo, {
      branch: settings.branch,
    });
  } catch (err) {
    if (isNetworkError(err)) return;
  }

  try {
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
    await saveCache(bookmarks);
  } catch {
    // README 重建失败不影响数据
  }

  await setPending(kept);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "save-page",
      title: "收藏此页到 Web Archive",
      contexts: ["page"],
    });
  });
  flushPending();
});

chrome.runtime.onStartup.addListener(flushPending);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "save-page") return;
  if (chrome.action && chrome.action.openPopup) {
    chrome.action.openPopup().catch(() => {});
  }
});
