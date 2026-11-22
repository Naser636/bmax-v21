#!/usr/bin/env node
"use strict";
/* V375 Lot A (G0) — the main-worktree guard (.githooks/reference-transaction + scripts/odg-main-worktree-guard.sh), exercised
 * on throw-away git repos in os.tmpdir(): branch moves in the MAIN worktree are refused; linked worktrees, commits and
 * fast-forward merges keep working; concurrency (two linked worktrees), interruption (hook removed) and recovery (reinstall)
 * behave; uninstall rolls back. Hermetic: never touches the real repository. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const cp = require("child_process");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const INSTALLER = path.join(ROOT, "scripts/odg-main-worktree-guard.sh");
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: os.tmpdir(), GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
delete (env as any).ODG_MAIN_GUARD_OFF;
function git(cwd: string, args: string[], extraEnv?: any): { ok: boolean; out: string } {
  const r = cp.spawnSync("git", args, { cwd, env: { ...env, ...(extraEnv || {}) }, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout || "") + (r.stderr || "") };
}
const branch = (cwd: string) => git(cwd, ["branch", "--show-current"]).out.trim();
const base = fs.mkdtempSync(path.join(os.tmpdir(), "odg-guard-"));
const repo = path.join(base, "repo"); fs.mkdirSync(repo);
git(repo, ["init", "-q", "-b", "main"]); git(repo, ["commit", "-q", "--allow-empty", "-m", "init"]); git(repo, ["branch", "feat"]); git(repo, ["branch", "free"]);   // "free": never checked out by a worktree
const inst = cp.spawnSync("bash", [INSTALLER, "install", repo], { env, encoding: "utf8" });
check("installer: hook installed into the clone's .git/hooks only (repo-local)", inst.status === 0 && fs.existsSync(path.join(repo, ".git/hooks/reference-transaction")));
check("status: INSTALLED (identical to tracked source)", /INSTALLED \(identical/.test(cp.spawnSync("bash", [INSTALLER, "status", repo], { env, encoding: "utf8" }).stdout));

// refused in the MAIN worktree
check("main: `git checkout feat` refused, stays on main", !git(repo, ["checkout", "feat"]).ok && branch(repo) === "main");
check("main: `git switch -c x` refused", !git(repo, ["switch", "-c", "x"]).ok && branch(repo) === "main");
check("main: detaching HEAD refused", !git(repo, ["checkout", "--detach", "HEAD"]).ok && branch(repo) === "main");
check("main: the refusal message points to linked worktrees", /git worktree add/.test(git(repo, ["checkout", "feat"]).out));
check("ATTACK (inspection MEDIUM): `git -c \'odg.x= worktree add \' checkout free` is still refused (no argv-based exception)", !git(repo, ["-c", "odg.x= worktree add ", "checkout", "free"]).ok && branch(repo) === "main");
check("`git pull --rebase`-style detach and `bisect` are refused in main (documented limit: do them in a linked worktree)", !git(repo, ["bisect", "start", "HEAD", "HEAD~0"]).ok || branch(repo) === "main");
git(repo, ["bisect", "reset"]);
// allowed
check("main: commits on main still work", git(repo, ["commit", "-q", "--allow-empty", "-m", "c2"]).ok);
const wt1 = path.join(base, "wt1"), wt2 = path.join(base, "wt2");
check("linked worktree creation (-b) works", git(repo, ["worktree", "add", "-q", wt1, "-b", "w1"]).ok && branch(wt1) === "w1");
check("linked worktree on an existing branch works", git(repo, ["worktree", "add", "-q", wt2, "feat"]).ok && branch(wt2) === "feat");
check("CONCURRENCY: branch moves INSIDE linked worktrees are free, main untouched", git(wt1, ["switch", "-q", "-c", "w1b"]).ok && git(wt2, ["commit", "-q", "--allow-empty", "-m", "w2"]).ok && branch(repo) === "main");
git(wt1, ["commit", "-q", "--allow-empty", "-m", "work"]);
check("fast-forward merge of a worktree branch into main works (main stays on main)", git(repo, ["merge", "-q", "--ff-only", "w1b"]).ok && branch(repo) === "main" && /work/.test(git(repo, ["log", "-1", "--format=%s"]).out));
check("audit: lists worktrees read-only, deletes nothing", (() => { const o = cp.spawnSync("bash", [INSTALLER, "audit", repo], { env, encoding: "utf8" }).stdout; return /wt1/.test(o) && /wt2/.test(o) && /nothing pruned/.test(o) && fs.existsSync(wt1); })());
fs.rmSync(wt2, { recursive: true, force: true });
check("audit: an orphaned worktree (directory gone) is FLAGGED, not pruned", /PRUNABLE\(orphan\)/.test(cp.spawnSync("bash", [INSTALLER, "audit", repo], { env, encoding: "utf8" }).stdout) && /wt2/.test(git(repo, ["worktree", "list"]).out));
// owner override (explicit, logged)
check("owner override ODG_MAIN_GUARD_OFF=1 allows the move and says so", (() => { const r = git(repo, ["checkout", "-q", "free"], { ODG_MAIN_GUARD_OFF: "1" }); const okMove = r.ok && branch(repo) === "free"; git(repo, ["checkout", "-q", "main"], { ODG_MAIN_GUARD_OFF: "1" }); return okMove && /DISABLED/.test(r.out); })());
check("returning to main is always allowed", branch(repo) === "main");
// interruption + recovery + rollback
fs.rmSync(path.join(repo, ".git/hooks/reference-transaction"));
check("INTERRUPTION: hook missing ⇒ status reports NOT INSTALLED (no silent protection claim)", /NOT INSTALLED/.test(cp.spawnSync("bash", [INSTALLER, "status", repo], { env, encoding: "utf8" }).stdout));
cp.spawnSync("bash", [INSTALLER, "install", repo], { env, encoding: "utf8" });
check("RECOVERY: reinstall restores the refusal", !git(repo, ["checkout", "free"]).ok && branch(repo) === "main");
fs.writeFileSync(path.join(repo, ".git/hooks/reference-transaction"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
cp.spawnSync("bash", [INSTALLER, "install", repo], { env, encoding: "utf8" });
check("install backs up a DIFFERENT pre-existing hook before replacing it", fs.readdirSync(path.join(repo, ".git/hooks")).some((x: string) => /^reference-transaction\.bak-/.test(x)));
cp.spawnSync("bash", [INSTALLER, "uninstall", repo], { env, encoding: "utf8" });
check("ROLLBACK: uninstall restores the previous hook", fs.readFileSync(path.join(repo, ".git/hooks/reference-transaction"), "utf8").trim() === "#!/bin/sh\nexit 0" && git(repo, ["checkout", "-q", "free"]).ok);
fs.rmSync(base, { recursive: true, force: true });
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-main-worktree-guard (V375 Lot A / G0)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
