import {
  getCurrentUser,
  listRepos,
  initRepository,
  isNetworkError,
} from "../lib/github.js";
import { getSettings, saveSettings } from "../lib/store.js";

const $ = (id) => document.getElementById(id);

let token = "";
let repos = [];

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  if (settings) {
    $("token").value = settings.token;
    $("new-name").value = settings.repo;
    token = settings.token;
    $("user-info").textContent = `当前账号：${settings.owner}`;
    $("open-repo").hidden = false;
    $("open-repo").href = `https://github.com/${settings.owner}/${settings.repo}`;
  }

  $("verify").addEventListener("click", onVerify);
  $("init").addEventListener("click", onInit);

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener("change", onModeChange);
  });
  onModeChange();
});

function onModeChange() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  $("new-name").disabled = mode !== "create";
  $("existing-repo").disabled = mode !== "existing";
}

async function onVerify() {
  token = $("token").value.trim();
  if (!token) return setStatus("请先填写 token", "err");
  setStatus("正在验证…");
  try {
    const user = await getCurrentUser(token);
    repos = await listRepos(token);
    $("user-info").textContent = `✓ 已验证：${user.name}（@${user.login}）`;
    const select = $("existing-repo");
    select.innerHTML =
      '<option value="">选择仓库…</option>' +
      repos
        .map((r) => `<option value="${escapeHtml(r.fullName)}">${escapeHtml(r.fullName)}</option>`)
        .join("");
    select.disabled = false;
    setStatus("token 有效，可以继续", "ok");
  } catch (err) {
    setStatus(isNetworkError(err) ? "网络不可用" : `验证失败：${err.message || err}`, "err");
  }
}

async function onInit() {
  if (!token) return setStatus("请先验证 token", "err");
  const mode = document.querySelector('input[name="mode"]:checked').value;
  let spec;
  if (mode === "create") {
    spec = $("new-name").value.trim();
    if (!spec) return setStatus("请填写新仓库名", "err");
    if (!/^[a-zA-Z0-9._-]+$/.test(spec)) {
      return setStatus("仓库名只能包含字母、数字、点、下划线、连字符", "err");
    }
  } else {
    spec = $("existing-repo").value;
    if (!spec) return setStatus("请选择现有仓库", "err");
  }

  setStatus("正在初始化仓库…");
  $("init").disabled = true;
  try {
    const info = await initRepository(token, spec, { create: mode === "create" });
    await saveSettings({
      token,
      owner: info.owner,
      repo: info.repo,
      branch: info.branch,
    });
    $("open-repo").hidden = false;
    $("open-repo").href = `https://github.com/${info.owner}/${info.repo}`;
    setStatus(`✓ 已就绪：${info.owner}/${info.repo}`, "ok");
  } catch (err) {
    setStatus(isNetworkError(err) ? "网络不可用" : `初始化失败：${err.message || err}`, "err");
  } finally {
    $("init").disabled = false;
  }
}

function setStatus(text, kind) {
  const el = $("status");
  el.textContent = text;
  el.className = "status" + (kind ? " " + kind : "");
}

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
