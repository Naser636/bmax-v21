/*
 * D1 (review N4 remediation) — ODG NEVER auto-commits. This proves the REAL
 * AutonomyRuntimeAdapter.commitAuthorizedDeliverable is fail-closed on the HUMAN commit gate:
 *   - DEFAULT (no ODG_HUMAN_COMMIT_APPROVED): it creates NO commit for ANY mission (legacy, opted-in,
 *     verified, …) — the validated deliverable stays in the working tree as VALIDATED_PENDING_COMMIT.
 *   - Only an EXPLICIT human opt-in (ODG_HUMAN_COMMIT_APPROVED=1), set out-of-band, authorizes a commit;
 *     the machine §7 guards (acceptance-facts.commitGateDecision) then still apply AFTER the human gate
 *     (opted-in + economic FAILED/MISSING ⇒ still refused; VERIFIED / legacy ⇒ committed).
 *
 * Drives the REAL private method directly (TypeScript `private` is compile-time only) in a throwaway git
 * sandbox. No provider, no network. The gate module closure is copied into the sandbox's runtime/core.
 *
 * Run: node_modules/.bin/tsx src/runtime/live-commit-authorization.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { AutonomyRuntimeAdapter } from "./autonomy-runtime-adapter";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const REPO = process.cwd();
// acceptance-facts.js require closure: itself + mechanical-acceptance + economic-verification + price-resolution
// + economic-unit + state-transition. All must be present for requireCjs(acceptance-facts.js) to load.
const CLOSURE = [
  "acceptance-facts.js", "mechanical-acceptance.js", "economic-verification.js",
  "price-resolution.js", "economic-unit.js", "state-transition.js",
];

function git(dir: string, args: string[]): void { spawnSync("git", args, { cwd: dir, stdio: "ignore" }); }
function commitCount(dir: string): number {
  const r = spawnSync("git", ["rev-list", "--count", "HEAD"], { cwd: dir, encoding: "utf8" });
  return r.status === 0 ? parseInt(r.stdout.trim(), 10) : -1;
}

function sandbox(control: Record<string, unknown> | null, economicVerdict: string | null | undefined): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "live-commit-"));
  fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "app"), { recursive: true });
  for (const f of CLOSURE) fs.copyFileSync(path.join(REPO, "runtime", "core", f), path.join(dir, "runtime", "core", f));
  // The commit path requires a validated SUCCESS mission-report (worker claim) to consider committing.
  fs.writeFileSync(path.join(dir, "runtime", "generated", "mission-report.json"), JSON.stringify({ mission: "M", validated: true, status: "SUCCESS" }));
  // Mission contract (carries the opt-in control flags read by commitGateDecision).
  const contract: Record<string, unknown> = { mission: "M", status: "AUTHORIZED", authorized_paths: ["src/app"] };
  if (control) contract.control = control;
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify(contract));
  // Economic evidence (consistent with the stated verdict), when supplied.
  if (economicVerdict) {
    const r: Record<string, unknown> = { mission: "M", verdict: economicVerdict, violations: [] as string[], gaps: [] as string[], proofs: [] as string[] };
    if (economicVerdict === "FAILED") r.violations = ["LEDGER_IMBALANCE"];
    else if (economicVerdict === "VERIFIED") r.proofs = ["LEDGER_CONSERVED"];
    fs.writeFileSync(path.join(dir, "runtime", "generated", "economic-verification-report.json"), JSON.stringify(r));
  }
  // Seed git with an initial commit, then stage an UNCOMMITTED in-scope change (the "deliverable").
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  fs.writeFileSync(path.join(dir, "src", "app", "deliverable.ts"), "export const x = 1;\n"); // in-scope, uncommitted
  return dir;
}

// Invoke the REAL private method (private is compile-time only; cast through unknown to call it). In
// production the adapter is always `new AutonomyRuntimeAdapter()` ⇒ this.cwd === process.cwd(); the commit
// gate (acceptance-facts, process.cwd()-relative like every release-path reader) relies on that invariant,
// so the test chdirs into the sandbox for the call to reproduce production faithfully.
function commit(dir: string, humanApproved: boolean): boolean {
  const prev = process.cwd();
  const prevEnv = process.env.ODG_HUMAN_COMMIT_APPROVED;
  process.chdir(dir);
  if (humanApproved) process.env.ODG_HUMAN_COMMIT_APPROVED = "1";
  else delete process.env.ODG_HUMAN_COMMIT_APPROVED;
  try {
    const adapter = new AutonomyRuntimeAdapter(dir);
    const spec = { mission: "M", authorized_paths: ["src/app"] };
    return (adapter as unknown as { commitAuthorizedDeliverable: (m: string, s: unknown) => boolean })
      .commitAuthorizedDeliverable("M", spec);
  } finally {
    process.chdir(prev);
    if (prevEnv === undefined) delete process.env.ODG_HUMAN_COMMIT_APPROVED;
    else process.env.ODG_HUMAN_COMMIT_APPROVED = prevEnv;
  }
}

console.log("D1 — ODG NEVER AUTO-COMMITS (HUMAN commit gate on commitAuthorizedDeliverable)");

// === D1 DEFAULT: no human approval ⇒ NO commit for ANY mission (the review-N4 regression guard). ===
// Even the cases that previously committed (economic VERIFIED, legacy) must now be refused with the
// deliverable left UNCOMMITTED in the working tree (⇒ VALIDATED_PENDING_COMMIT downstream).
for (const [label, control, verdict] of [
  ["legacy (no control)", null, null],
  ["opted-in + economic VERIFIED", { economic: true }, "VERIFIED"],
] as [string, Record<string, unknown> | null, string | null][]) {
  const dir = sandbox(control, verdict);
  const before = commitCount(dir);
  const result = commit(dir, /* humanApproved */ false);
  const after = commitCount(dir);
  const porcelain = spawnSync("git", ["status", "--porcelain", "--", "src/app"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  check(result === false, `D1 default — ${label} ⇒ returns false (no auto-commit)`);
  check(after === before, `D1 default — ${label} ⇒ NO new commit created`);
  check(porcelain.length > 0, `D1 default — ${label} ⇒ deliverable stays UNCOMMITTED (pending human)`);
  fs.rmSync(dir, { recursive: true, force: true });
}

// === HUMAN-APPROVED: ODG_HUMAN_COMMIT_APPROVED=1 ⇒ the machine §7 gate applies, exactly as before. ===

// 1 — human-approved + opted-in (control.economic) + economic FAILED ⇒ NOT committed, NO partial mutation.
{
  const dir = sandbox({ economic: true }, "FAILED");
  const before = commitCount(dir);
  const result = commit(dir, true);
  const after = commitCount(dir);
  const porcelain = spawnSync("git", ["status", "--porcelain", "--", "src/app"], { cwd: dir, encoding: "utf8" }).stdout.trim();
  check(result === false, "1. human-approved + economic FAILED ⇒ returns false (machine gate refuses)");
  check(after === before, "1b. NO new commit created (state unchanged — no partial mutation)");
  check(porcelain.length > 0, "1c. the in-scope deliverable remains UNCOMMITTED");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2 — human-approved + opted-in + economic VERIFIED ⇒ committed (gate allows), exactly one new commit.
{
  const dir = sandbox({ economic: true }, "VERIFIED");
  const before = commitCount(dir);
  const result = commit(dir, true);
  const after = commitCount(dir);
  check(result === true, "2. human-approved + economic VERIFIED ⇒ returns true (authorized)");
  check(after === before + 1, "2b. exactly one new commit created");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3 — human-approved + opted-in + MISSING economic evidence ⇒ deny-by-default, NOT committed.
{
  const dir = sandbox({ economic: true }, null);
  const before = commitCount(dir);
  const result = commit(dir, true);
  const after = commitCount(dir);
  check(result === false && after === before, "3. human-approved + economic enforced + missing evidence ⇒ refused, no commit");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4 — human-approved + legacy (no control block) ⇒ commits (machine gate NO-OP), one new commit.
{
  const dir = sandbox(null, null);
  const before = commitCount(dir);
  const result = commit(dir, true);
  const after = commitCount(dir);
  check(result === true && after === before + 1, "4. human-approved + legacy ⇒ commits (machine gate NO-OP)");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — D1 HUMAN COMMIT GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
