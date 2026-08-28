// chrome.storage.local 封装：设置、缓存、离线队列

const SETTINGS_KEY = "settings";
const CACHE_KEY = "cache";
const PENDING_KEY = "pending";

export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return data[SETTINGS_KEY] || null;
}

export async function saveSettings(settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getCache() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  return data[CACHE_KEY] || null;
}

export async function saveCache(bookmarks) {
  await chrome.storage.local.set({ [CACHE_KEY]: bookmarks });
}

export async function getPending() {
  const data = await chrome.storage.local.get(PENDING_KEY);
  return data[PENDING_KEY] || [];
}

export async function setPending(list) {
  await chrome.storage.local.set({ [PENDING_KEY]: list });
}

export async function pushPending(bookmark) {
  const pending = await getPending();
  pending.push(bookmark);
  await setPending(pending);
}
