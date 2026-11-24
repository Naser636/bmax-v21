#!/usr/bin/env node
"use strict";
/*
 * V17.2 — reproducibility at the record's OWN run head (owner V170: independent recomputation / reproducibility controls).
 *
 * A committed experiment record (V166 G, V168 H) carries `run.head`, the commit its runner executed at. Its features or
 * context citations may legitimately depend on the tree at that commit, so recomputing it on a LATER tree can drift
 * without anything being wrong with the record. checkAtRunHead() therefore:
 *   1. resolves the commit to materialize (resolveRunCommit):
 *        RUN_HEAD               — record.run.head itself, when the runner file exists in that commit;
 *        RECORD_COMMIT_CHILD    — otherwise the commit that first ADDED the record file, ONLY if its first parent is
 *                                 record.run.head (the record's own note: "the commit carrying this record is its child",
 *                                 i.e. the runner was written in the working tree at run.head and committed with it);
 *        anything else          — UNRESOLVED, fail-closed (no guess, no "nearest" commit).
 *   2. materializes that commit in a temporary DETACHED `git worktree` (local objects only — no fetch, no network);
 *   3. places the record under test (the bytes of the file being checked) at its path in that worktree;
 *   4. runs the runner's OWN `--check` of that commit there (its own code version; the recomputation is unchanged);
 *   5. removes the worktree (`git worktree remove --force` + prune) in a finally block.
 * It writes nothing in the caller's tree and never modifies the record. Verdict: CHECK_OK | DRIFT | ERROR.
 *
 * diffLeafPaths() lists the JSON leaf paths where two values differ (used by G to separate context-only drift).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const HEX40 = /^[0-9a-f]{40}$/;

function git(root: string, args: string[]): { ok: boolean; out: string } {
  try { return { ok: true, out: cp.execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() }; }
  catch { return { ok: false, out: "" }; }
}

function resolveRunCommit(repoRoot: string, runHead: any, runnerRel: string, recordRel: string): any {
  if (typeof runHead !== "string" || !HEX40.test(runHead)) return { ok: false, rule: "UNRESOLVED", reason: `record.run.head is not a 40-hex commit (${JSON.stringify(runHead)})` };
  if (!git(repoRoot, ["cat-file", "-e", `${runHead}^{commit}`]).ok) return { ok: false, rule: "UNRESOLVED", runHead, reason: `run head ${runHead} is not in the local object store (offline; no fetch)` };
  if (git(repoRoot, ["cat-file", "-e", `${runHead}:${runnerRel}`]).ok) return { ok: true, rule: "RUN_HEAD", runHead, commit: runHead };
  const added = git(repoRoot, ["log", "--diff-filter=A", "--format=%H", "--", recordRel]);
  const intro = added.ok ? added.out.split("\n").filter(Boolean) : [];
  const first = intro.length ? intro[intro.length - 1] : null;   // oldest commit that added the record
  if (!first) return { ok: false, rule: "UNRESOLVED", runHead, reason: `runner absent at run head and no commit adds ${recordRel}` };
  const parent = git(repoRoot, ["rev-parse", `${first}^1`]);
  if (!parent.ok || parent.out !== runHead) return { ok: false, rule: "UNRESOLVED", runHead, reason: `runner absent at run head; record-introducing commit ${first} has first parent ${parent.out || "?"} ≠ run head` };
  if (!git(repoRoot, ["cat-file", "-e", `${first}:${runnerRel}`]).ok) return { ok: false, rule: "UNRESOLVED", runHead, reason: `runner absent at run head and at record-introducing commit ${first}` };
  return { ok: true, rule: "RECORD_COMMIT_CHILD", runHead, commit: first };
}

/* opts: { repoRoot, recordRel, runnerRel, checkArgs: string[], runHead?, tmpBase?, timeoutMs?, command?: (wt) => [bin, args] } */
function checkAtRunHead(opts: any): any {
  const repoRoot = path.resolve(String(opts.repoRoot));
  let recordBytes: any = null; let record: any = null;
  try { recordBytes = fs.readFileSync(path.join(repoRoot, opts.recordRel)); record = JSON.parse(recordBytes.toString("utf8")); }
  catch (e: any) { return { verdict: "ERROR", reason: `cannot read record ${opts.recordRel}: ${e && e.message}` }; }
  const runHead = opts.runHead !== undefined ? opts.runHead : (record && record.run ? record.run.head : null);
  const res = resolveRunCommit(repoRoot, runHead, opts.runnerRel, opts.recordRel);
  if (!res.ok) return { verdict: "ERROR", ...res };
  const base = fs.mkdtempSync(path.join(opts.tmpBase || os.tmpdir(), "odg-run-head-check-"));
  const wt = path.join(base, "wt");
  let added = false;
  try {
    const add = git(repoRoot, ["worktree", "add", "--detach", "-q", wt, res.commit]);
    if (!add.ok) return { verdict: "ERROR", ...res, reason: `git worktree add --detach ${res.commit} failed` };
    added = true;
    const nm = path.join(repoRoot, "node_modules");
    if (fs.existsSync(nm) && !fs.existsSync(path.join(wt, "node_modules"))) fs.symlinkSync(fs.realpathSync(nm), path.join(wt, "node_modules"), "dir");
    fs.mkdirSync(path.dirname(path.join(wt, opts.recordRel)), { recursive: true });
    fs.writeFileSync(path.join(wt, opts.recordRel), recordBytes);   // the record under test, byte-identical
    const [bin, args] = typeof opts.command === "function" ? opts.command(wt)
      : [path.join(wt, "node_modules", ".bin", "tsx"), [opts.runnerRel, ...(opts.checkArgs || ["--check"])]];
    const r = cp.spawnSync(bin, args, { cwd: wt, encoding: "utf8", timeout: opts.timeoutMs || 15 * 60 * 1000, env: { ...process.env, npm_config_offline: "true" } });
    const stdout = String(r.stdout || "").trim();
    const verdict = r.status === 0 && /CHECK OK/.test(stdout) ? "CHECK_OK" : (r.status === 1 ? "DRIFT" : "ERROR");
    return { verdict, ...res, worktreeCommit: git(wt, ["rev-parse", "HEAD"]).out || null, exitCode: r.status, signal: r.signal || null, stdout, stderrTail: String(r.stderr || "").trim().split("\n").slice(-5).join("\n") };
  } finally {
    if (added) { git(repoRoot, ["worktree", "remove", "--force", wt]); }
    try { fs.rmSync(base, { recursive: true, force: true }); } catch { /* best effort */ }
    git(repoRoot, ["worktree", "prune"]);
  }
}

function diffLeafPaths(a: any, b: any, prefix = ""): string[] {
  const isObj = (v: any) => v !== null && typeof v === "object";
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix || "$"];
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  const out: string[] = [];
  for (const k of keys) out.push(...diffLeafPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  return out;
}

function format(name: string, r: any): string {
  const lines = [`${name} --check-at-run-head: ${r.verdict}`, `  record run.head : ${r.runHead || "?"}`, `  commit used     : ${r.commit || "none"} (rule ${r.rule})`];
  if (r.reason) lines.push(`  reason          : ${r.reason}`);
  if (r.stdout) lines.push(`  runner output   : ${r.stdout.split("\n").join(" | ")}`);
  if (r.verdict === "ERROR" && r.stderrTail) lines.push(`  stderr (tail)   : ${r.stderrTail.split("\n").join(" | ")}`);
  return lines.join("\n") + "\n";
}

module.exports = { resolveRunCommit, checkAtRunHead, diffLeafPaths, format };
export {};
