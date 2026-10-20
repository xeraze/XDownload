import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
const repo = (remote.match(/[:/]([^/:]+)\.git$/) || [])[1];
if (!repo) {
  console.error("cannot detect repo name from origin remote:", remote);
  process.exit(1);
}
const siteUrl = `https://xeraze.github.io/${repo}/`;
process.env.BASE_PATH = `/${repo}/`;

execSync("npm run build", { stdio: "inherit" });

const dist = join(process.cwd(), "dist");
if (!existsSync(dist)) {
  console.error("dist not found");
  process.exit(1);
}

const dst = join(tmpdir(), "xdownload-web-gh-pages");
rmSync(dst, { recursive: true, force: true });
cpSync(dist, dst, { recursive: true });

const git = (cmd) => execSync(cmd, { cwd: dst, stdio: ["ignore", "inherit", "inherit"] });

try {
  git("git init -b gh-pages");
} catch {
  git("git init");
  git("git checkout -b gh-pages");
}
git("git add -A");
git('git -c core.autocrlf=false commit --allow-empty -m "deploy"');
git(`git push --force "${remote}" gh-pages`);
console.log("deployed:", siteUrl);
