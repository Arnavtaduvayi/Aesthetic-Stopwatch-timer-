import chokidar from "chokidar";
import { spawn } from "node:child_process";

const ROOT = new URL("..", import.meta.url);

const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.DS_Store",
  "**/.cursor/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.cache/**",
  "**/coverage/**",
];

let timer = null;
let running = false;
let pending = false;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function gitStatusPorcelain() {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["status", "--porcelain"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "inherit"],
      shell: false,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString("utf8")));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`git status exited with ${code}`));
    });
  });
}

async function commitAndPush() {
  // Avoid empty commits
  const before = await gitStatusPorcelain();
  if (!before) return;

  await run("git", ["add", "-A"]);

  // If add cleared everything (e.g., only ignored changes), skip commit.
  const afterAdd = await gitStatusPorcelain();
  if (!afterAdd) return;

  await run("git", ["commit", "-m", "update"]);
  await run("git", ["push"]);
}

async function drainQueue() {
  if (running) {
    pending = true;
    return;
  }
  running = true;
  pending = false;
  try {
    await commitAndPush();
  } catch (e) {
    console.error("[auto-git-push] error:", e?.message ?? e);
  } finally {
    running = false;
    if (pending) drainQueue();
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    drainQueue();
  }, 500);
}

const watcher = chokidar.watch(".", {
  cwd: ROOT,
  ignored: IGNORE,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
});

watcher
  .on("add", schedule)
  .on("change", schedule)
  .on("unlink", schedule)
  .on("error", (err) => console.error("[auto-git-push] watcher error:", err));

console.log("[auto-git-push] watching for changes…");

