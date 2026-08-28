// 导入旧剪藏 markdown（标题 + 链接 + 备注 格式）到 bookmarks.json
// 用法：node scripts/import-clips.mjs <仓库目录> <owner> <repo> [文件夹名]
import { readdirSync, readFileSync, renameSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const githubLib = pathToFileURL(join(scriptDir, "..", "extension", "lib", "github.js")).href;
const { renderReadme } = await import(githubLib);

const repoDir = process.argv[2];
const owner = process.argv[3];
const repo = process.argv[4];
const folder = process.argv[5] || "旧收藏";

if (!repoDir || !owner || !repo) {
  console.error("用法：node scripts/import-clips.mjs <仓库目录> <owner> <repo> [文件夹名]");
  process.exit(1);
}

const files = readdirSync(repoDir).filter(
  (f) => f.endsWith(".md") && !f.startsWith(".")
);

const items = [];
for (const f of files) {
  const text = readFileSync(join(repoDir, f), "utf8");
  const title =
    (text.match(/^#\s+(.+)$/m) || [])[1]?.trim() || basename(f, ".md");
  const linkMatch =
    text.match(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/) ||
    text.match(/https?:\/\/[^\s)\]>]+/);
  const url = linkMatch ? linkMatch[2] || linkMatch[1] || linkMatch[0] : "";
  const note = (text.match(/备注[:：]\s*(.+)$/m) || [])[1]?.trim() || "";
  const date =
    execSync(
      `git -C ${JSON.stringify(repoDir)} log -1 --format=%cI -- ${JSON.stringify(f)}`,
      { encoding: "utf8" }
    ).trim() || new Date().toISOString();

  items.push({
    id: crypto.randomUUID(),
    url,
    title,
    folder,
    tags: [],
    note,
    createdAt: date,
    updatedAt: date,
    deleted: false,
    source: "legacy-clip",
    snapshot: null,
  });
}

const bookmarks = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  items: items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
};

mkdirSync(join(repoDir, "data"), { recursive: true });
mkdirSync(join(repoDir, "archive"), { recursive: true });
for (const f of files) {
  renameSync(join(repoDir, f), join(repoDir, "archive", f));
}

writeFileSync(
  join(repoDir, "data/bookmarks.json"),
  JSON.stringify(bookmarks, null, 2) + "\n"
);
writeFileSync(
  join(repoDir, "README.md"),
  renderReadme(bookmarks, owner, repo) + "\n"
);

console.log(`导入 ${items.length} 条，缺失链接 ${items.filter((i) => !i.url).length} 条`);
for (const it of items) {
  console.log(`  ${it.createdAt.slice(0, 10)}  ${it.title}  ${it.url}`);
}
