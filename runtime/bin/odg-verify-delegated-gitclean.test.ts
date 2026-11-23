// @ts-nocheck — V16.1 delegate↔verify contradiction fix: regression suite (runs under tsx).
/*
 * odg-delegate proves the provider's UNCOMMITTED patch in-scope (scopeClean) + non-protected (protectedClean) on ONE
 * observation, then passes EXACTLY those paths to odg-verify (`--delegated-path=<p>`). This suite proves, against the
 * COMPILED dist verifier in hermetic temp git repos:
 *   - an in-scope uncommitted patch (the proven paths only) ⇒ gitClean=true, exit 0;
 *   - ANY other dirty path (tracked edit, sibling untracked file in the same new dir, rename half) ⇒ gitClean=false;
 *   - an empty/invalid proven list tolerates NOTHING; a git failure ⇒ false (fail-closed);
 *   - WITHOUT the flag (Release Manager / local pipeline / adapter refresh) the gate is the unchanged default: same
 *     keys, same verdict as `git status --porcelain -- <gitCleanExcludes()>`, no gitCleanScope field.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const V_DIST = path.join(REPO, "runtime", "dist", "bin", "odg-verify.js");
console.log("ODG-VERIFY delegated-patch gitClean — tolerates ONLY the proven in-scope paths (dist port)");
ok("prerequisite: compiled dist odg-verify present", fs.existsSync(V_DIST));
const V = require(V_DIST);

// --- pure verdict -------------------------------------------------------------------------------
const Z = (...recs) => recs.join("\0") + "\0";
ok("proven untracked path only ⇒ clean", V.delegatedGitClean(Z("?? docs/a.md"), ["docs/a.md"]).gitClean === true);
ok("proven modified path only ⇒ clean", V.delegatedGitClean(Z(" M docs/a.md"), ["docs/a.md"]).gitClean === true);
{
  const r = V.delegatedGitClean(Z("?? docs/a.md", " M src/x.ts"), ["docs/a.md"]);
  ok("an out-of-scope dirty path ⇒ NOT clean, named in residual", r.gitClean === false && r.residual.includes("src/x.ts"));
}
ok("rename with an unproven source side ⇒ NOT clean", V.delegatedGitClean(Z("R  docs/a.md", "src/old.ts"), ["docs/a.md"]).gitClean === false);
ok("rename with both sides proven ⇒ clean", V.delegatedGitClean(Z("R  docs/a.md", "docs/old.md"), ["docs/a.md", "docs/old.md"]).gitClean === true);
ok("empty proven list tolerates nothing", V.delegatedGitClean(Z("?? docs/a.md"), []).gitClean === false);
ok("empty-string proven entry tolerates nothing", V.delegatedGitClean(Z("?? docs/a.md"), [""]).gitClean === false);
ok("non-array proven list tolerates nothing", V.delegatedGitClean(Z("?? docs/a.md"), null).gitClean === false);
ok("malformed record is never tolerated", V.delegatedGitClean("x\0", ["x"]).gitClean === false);
ok("prefix is NOT a match (docs/a.md does not cover docs/a.md.bak)", V.delegatedGitClean(Z("?? docs/a.md.bak"), ["docs/a.md"]).gitClean === false);
ok("clean tree ⇒ clean", V.delegatedGitClean("", ["docs/a.md"]).gitClean === true);
ok("parseDelegatedPaths: absent flag ⇒ null (default gate)", V.parseDelegatedPaths(["M1", "--report-only"]) === null);
ok("parseDelegatedPaths: repeated flag ⇒ exact list", JSON.stringify(V.parseDelegatedPaths(["--delegated-path=a b.md", "--delegated-path=c"])) === JSON.stringify(["a b.md", "c"]));
ok("parseDelegatedPaths: empty value ⇒ [''] (tolerates nothing, never 'no flag')", JSON.stringify(V.parseDelegatedPaths(["--delegated-path="])) === JSON.stringify([""]));

// --- behavioural, CLI, hermetic temp repo ------------------------------------------------------------
const GENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
function git(dir, args) { return cp.execFileSync("git", args, { cwd: dir, encoding: "utf8", env: GENV }); }
function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "delegated-gitclean-"));
  git(dir, ["init", "-q"]);
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\nruntime/generated/\n");
  // Stub build/tsc gates GREEN so only gitClean decides the exit code (npx resolves the local bin first).
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "t", version: "0.0.0", scripts: { build: "true" } }));
  fs.mkdirSync(path.join(dir, "node_modules", ".bin"), { recursive: true });
  fs.writeFileSync(path.join(dir, "node_modules", ".bin", "tsc"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "x.ts"), "export const x = 1;\n");
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  git(dir, ["add", "-A"]); git(dir, ["commit", "-qm", "init"]);
  return dir;
}
function runCli(dir, extra) {
  const r = cp.spawnSync(process.execPath, [V_DIST, ...extra], { cwd: dir, encoding: "utf8", env: { ...process.env, npm_config_yes: "false" } });
  const v = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "runtime-verify.json"), "utf8"));
  return { status: r.status, v };
}
function defaultPorcelainClean(dir) {
  const ex = V.gitCleanExcludes();
  return git(dir, ["status", "--porcelain", "--", ...ex]).trim().length === 0;
}
const DEFAULT_KEYS = ["build", "documentationProofPresent", "generatedAt", "generatedContracts", "generatedContractsValid", "gitClean", "mission", "typescript"];

const dirs = [];
try {
  const d = mkRepo(); dirs.push(d);
  fs.mkdirSync(path.join(d, "docs", "new"), { recursive: true });
  fs.writeFileSync(path.join(d, "docs", "new", "note.md"), "# note\n");

  // A — in-scope uncommitted patch passes (build/tsc stubbed green).
  let r = runCli(d, ["--delegated-path=docs/new/note.md"]);
  ok("A: in-scope uncommitted patch ⇒ gitClean=true", r.v.gitClean === true && r.v.build === true && r.v.typescript === true);
  ok("A: exit 0 (verify passes on the delegated patch)", r.status === 0);
  ok("A: evidence records DELEGATED_PATCH scope + proven list", r.v.gitCleanScope && r.v.gitCleanScope.mode === "DELEGATED_PATCH" && r.v.gitCleanScope.provenInScope.join() === "docs/new/note.md" && r.v.gitCleanScope.residualDirty.length === 0);

  // B — a sibling untracked file in the same NEW directory (collapsed as 'docs/new/' by default porcelain) is NOT tolerated.
  fs.writeFileSync(path.join(d, "docs", "new", "smuggled.md"), "x\n");
  r = runCli(d, ["--delegated-path=docs/new/note.md"]);
  ok("B: unproven sibling in the same untracked dir ⇒ gitClean=false, exit 1", r.v.gitClean === false && r.status === 1 && r.v.gitCleanScope.residualDirty.includes("docs/new/smuggled.md"));
  fs.unlinkSync(path.join(d, "docs", "new", "smuggled.md"));

  // C — an out-of-scope TRACKED edit still fails.
  fs.writeFileSync(path.join(d, "src", "x.ts"), "export const x = 2;\n");
  r = runCli(d, ["--delegated-path=docs/new/note.md"]);
  ok("C: out-of-scope tracked edit ⇒ gitClean=false, exit 1", r.v.gitClean === false && r.status === 1 && r.v.gitCleanScope.residualDirty.includes("src/x.ts"));

  // D — other callers (no flag): unchanged default gate — same verdict as the default porcelain, same keys, no scope field.
  r = runCli(d, []);
  ok("D: no flag ⇒ default verdict (dirty tree ⇒ false) identical to `git status --porcelain -- <excludes>`", r.v.gitClean === false && r.v.gitClean === defaultPorcelainClean(d));
  ok("D: no flag ⇒ evidence keys byte-identical to the pre-V16.1 shape (no gitCleanScope)", JSON.stringify(Object.keys(r.v).sort()) === JSON.stringify(DEFAULT_KEYS));
  git(d, ["checkout", "-q", "--", "src/x.ts"]);
  r = runCli(d, []);
  ok("D: no flag + only the uncommitted patch ⇒ STILL gitClean=false (default gate not widened)", r.v.gitClean === false && r.status === 1 && !("gitCleanScope" in r.v));

  // E — default clean tree unchanged.
  fs.rmSync(path.join(d, "docs"), { recursive: true, force: true });
  r = runCli(d, []);
  ok("E: no flag + clean tree ⇒ gitClean=true, exit 0, default keys", r.v.gitClean === true && r.status === 0 && JSON.stringify(Object.keys(r.v).sort()) === JSON.stringify(DEFAULT_KEYS));

  // F — default artifact excludes keep applying in delegated mode (compass is not counted), nothing else is widened.
  fs.writeFileSync(path.join(d, "ODG_PROJECT_STATE.md"), "compass\n");
  fs.writeFileSync(path.join(d, "docs.md"), "x\n");
  r = runCli(d, ["--delegated-path=docs.md"]);
  ok("F: delegated mode keeps the standard artifact excludes (compass ignored) ⇒ clean", r.v.gitClean === true);

  // G — empty flag value tolerates nothing.
  r = runCli(d, ["--delegated-path="]);
  ok("G: --delegated-path= (empty) ⇒ gitClean=false (tolerates nothing)", r.v.gitClean === false && r.status === 1);

  // H — git failure ⇒ fail-closed, in delegated mode.
  const nogit = fs.mkdtempSync(path.join(os.tmpdir(), "delegated-gitclean-nogit-")); dirs.push(nogit);
  fs.mkdirSync(path.join(nogit, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(nogit, "package.json"), JSON.stringify({ name: "t", version: "0.0.0", scripts: { build: "true" } }));
  fs.mkdirSync(path.join(nogit, "node_modules", ".bin"), { recursive: true });
  fs.writeFileSync(path.join(nogit, "node_modules", ".bin", "tsc"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const rr = cp.spawnSync(process.execPath, [V_DIST, "--delegated-path=a.md"], { cwd: nogit, encoding: "utf8", env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(nogit), npm_config_yes: "false" } });
  const vv = JSON.parse(fs.readFileSync(path.join(nogit, "runtime", "generated", "runtime-verify.json"), "utf8"));
  ok("H: not a git repo ⇒ gitClean=false (fail-closed), exit 1", vv.gitClean === false && rr.status === 1);
} finally {
  for (const x of dirs) { try { fs.rmSync(x, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(`\nodg-verify delegated gitClean — ${passed} assertions passed.`);
