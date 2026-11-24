#!/usr/bin/env node
"use strict";
/* V17.2 — tests of runtime/core/odg-run-head-check.ts on a throw-away FIXTURE git repo (offline, local objects only):
 * a toy runner whose output depends on the tree reproduces at its run head but drifts on a later tree; both resolution
 * rules (RUN_HEAD, RECORD_COMMIT_CHILD); fail-closed on unknown / malformed heads and on a tampered record; the
 * temporary worktree is always removed and the record under test is never modified. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const RHC = require("./odg-run-head-check.js");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-rhc-test-"));
const git = (repo: string, args: string[]) => cp.execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const write = (repo: string, rel: string, s: string) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), s); };
const commit = (repo: string, msg: string) => { git(repo, ["add", "-A"]); git(repo, ["commit", "-q", "-m", msg]); return git(repo, ["rev-parse", "HEAD"]); };
const worktrees = (repo: string) => git(repo, ["worktree", "list", "--porcelain"]).split("\n").filter((l: string) => l.startsWith("worktree ")).length;

/* toy runner: record = {value: <data.txt>, run: {head}}; --check compares (head normalized to the recorded one) */
const RUNNER = `const fs=require("fs"),path=require("path");const R=__dirname;const OUT=path.join(R,"rec.json");
const cur=(()=>{try{return JSON.parse(fs.readFileSync(OUT,"utf8"))}catch{return null}})();
const res={value:fs.readFileSync(path.join(R,"data.txt"),"utf8").trim()};
const text=(h)=>JSON.stringify({...res,run:{head:h}},null,2)+"\\n";
if(process.argv.includes("--check")){const same=cur!==null&&JSON.stringify(cur,null,2)+"\\n"===text(cur.run&&cur.run.head);process.stdout.write(same?"CHECK OK\\n":"CHECK FAILED\\n");process.exitCode=same?0:1;}
else{const h=require("child_process").execFileSync("git",["-C",R,"rev-parse","HEAD"],{encoding:"utf8"}).trim();fs.writeFileSync(OUT,text(h));}
`;
const nodeCmd = (args: string[]) => (wt: string) => [process.execPath, [path.join(wt, "runner.js"), ...args]];

try {
  /* repo A — rule RUN_HEAD: runner committed at run head; record written there and committed in a child; tree moves on */
  const A = path.join(tmp, "a"); fs.mkdirSync(A); git(A, ["init", "-q"]);
  write(A, "runner.js", RUNNER); write(A, "data.txt", "v1\n"); const h1 = commit(A, "runner + data v1");
  cp.execFileSync(process.execPath, [path.join(A, "runner.js")]); commit(A, "record");
  write(A, "data.txt", "v2\n"); commit(A, "data moves on");
  const recBefore = fs.readFileSync(path.join(A, "rec.json"), "utf8");
  check("fixture: plain --check on the later tree DRIFTS (the problem being fixed)", cp.spawnSync(process.execPath, [path.join(A, "runner.js"), "--check"]).status === 1);
  const wtBefore = worktrees(A);
  const r = RHC.checkAtRunHead({ repoRoot: A, recordRel: "rec.json", runnerRel: "runner.js", command: nodeCmd(["--check"]), tmpBase: tmp });
  check("RUN_HEAD: CHECK_OK at the record's own run head", r.verdict === "CHECK_OK" && r.rule === "RUN_HEAD" && r.commit === h1 && r.worktreeCommit === h1);
  check("temporary worktree removed afterwards", worktrees(A) === wtBefore && fs.readdirSync(tmp).filter((n: string) => n.startsWith("odg-run-head-check-")).length === 0);
  check("record under test not modified; caller tree untouched", fs.readFileSync(path.join(A, "rec.json"), "utf8") === recBefore && git(A, ["status", "--porcelain"]) === "");

  /* tampered record ⇒ DRIFT (the check is not vacuous) */
  const rec = JSON.parse(recBefore); rec.value = "forged"; write(A, "rec.json", JSON.stringify(rec, null, 2) + "\n");
  const t = RHC.checkAtRunHead({ repoRoot: A, recordRel: "rec.json", runnerRel: "runner.js", command: nodeCmd(["--check"]), tmpBase: tmp });
  check("tampered record ⇒ DRIFT at run head", t.verdict === "DRIFT" && t.commit === h1);
  write(A, "rec.json", recBefore);

  /* fail-closed resolution */
  check("unknown run head ⇒ ERROR UNRESOLVED (no fetch, no guess)", RHC.checkAtRunHead({ repoRoot: A, recordRel: "rec.json", runnerRel: "runner.js", runHead: "f".repeat(40), command: nodeCmd(["--check"]), tmpBase: tmp }).verdict === "ERROR");
  check("malformed run head ⇒ UNRESOLVED", RHC.resolveRunCommit(A, "HEAD", "runner.js", "rec.json").rule === "UNRESOLVED" && RHC.resolveRunCommit(A, null, "runner.js", "rec.json").ok === false);
  check("absent record ⇒ ERROR", RHC.checkAtRunHead({ repoRoot: A, recordRel: "nope.json", runnerRel: "runner.js", tmpBase: tmp }).verdict === "ERROR");

  /* repo B — rule RECORD_COMMIT_CHILD: runner + record committed together in the child of run head */
  const B = path.join(tmp, "b"); fs.mkdirSync(B); git(B, ["init", "-q"]);
  write(B, "data.txt", "w1\n"); const b0 = commit(B, "data only");
  write(B, "runner.js", RUNNER); cp.execFileSync(process.execPath, [path.join(B, "runner.js")]); const b1 = commit(B, "runner + record");
  write(B, "data.txt", "w2\n"); commit(B, "data moves on");
  const rb = RHC.resolveRunCommit(B, b0, "runner.js", "rec.json");
  check("RECORD_COMMIT_CHILD: runner absent at run head ⇒ record-introducing child used", rb.ok && rb.rule === "RECORD_COMMIT_CHILD" && rb.commit === b1);
  const cb = RHC.checkAtRunHead({ repoRoot: B, recordRel: "rec.json", runnerRel: "runner.js", command: nodeCmd(["--check"]), tmpBase: tmp });
  check("RECORD_COMMIT_CHILD: CHECK_OK", cb.verdict === "CHECK_OK" && cb.commit === b1);
  /* a run head that is NOT the parent of the record-introducing commit ⇒ refused */
  check("child rule only when first parent == run head", RHC.resolveRunCommit(B, git(B, ["rev-parse", "HEAD"]), "missing.js", "rec.json").ok === false);

  /* diffLeafPaths */
  check("diffLeafPaths: exact leaf paths", JSON.stringify(RHC.diffLeafPaths({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { b: 2, c: [1, 3] }, d: 1 })) === JSON.stringify(["a.b", "a.c.1"]));
  check("diffLeafPaths: equal ⇒ []", RHC.diffLeafPaths({ x: [1, { y: 2 }] }, { x: [1, { y: 2 }] }).length === 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exitCode = failures === 0 ? 0 : 1;
export {};
