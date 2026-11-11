#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V91 §3 — EXECUTABLE DEPLOYMENT PLAN. Built from the REAL repo + CI workflow + git state. The GitHub/CI
 * chain uses the ACTUAL commands (package.json scripts + .github/workflows/ci.yml) — no invented jobs. The VPS chain is
 * fully enumerated in order but every VPS-specific element is OWNER_GATED / NOT_MEASURED (no VPS access; nothing
 * invented — no address/service/path/db/secret/config). Backup/rollback completes the V90 strategy with restorability
 * checks. Read-only: NOTHING is executed, pushed or deployed. Writes docs/odg/V91_DEPLOYMENT_PLAN.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
const pkg = (() => { try { return require(path.join(ROOT, "package.json")); } catch { return { scripts: {} }; } })();
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const head = git(["rev-parse", "--short", "HEAD"]);
const behindMain = git(["rev-list", "--count", "HEAD..origin/main"]);
const ciPresent = fs.existsSync(path.join(ROOT, ".github", "workflows", "ci.yml"));

// ---- §3.1 GitHub/CI chain — REAL commands (from package.json + ci.yml). status EXECUTABLE (command known) / GATED (needs owner go).
const buildCmd = pkg.scripts && pkg.scripts["build:runtime"] ? "npm run build:runtime" : "NOT_MEASURED (no build:runtime script)";
const githubChain = [
  { step: 1, name: "initial state & source branch", command: `git status --porcelain; git rev-parse --abbrev-ref HEAD`, expected: `clean tree on ${branch}@${head}`, status: "EXECUTABLE", stopIf: "dirty tree or wrong branch" },
  { step: 2, name: "history & sync check", command: `git fetch origin; git rev-list --count HEAD..origin/main`, expected: `know divergence (currently behind-main=${behindMain} ⇒ rebase/merge needed before a PR to main)`, status: "EXECUTABLE", stopIf: "unexpected divergence" },
  { step: 3, name: "pre-push incremental controls (V88)", command: `npx tsx runtime/bin/odg-incremental-assurance-run.ts`, expected: "impacted controls selected; critical ⇒ full", status: "EXECUTABLE", stopIf: "BLOCKED decision" },
  { step: 4, name: "full release gate", command: `npm run test:report`, expected: "all suites PASS (full regression at release)", status: "EXECUTABLE", stopIf: "any FAIL/BLOCKED/NOT_RUN" },
  { step: 5, name: "typecheck + build", command: `npx tsc --noEmit -p tsconfig.json; ${buildCmd}`, expected: "tsc 0 errors; runtime dist built", status: "EXECUTABLE", stopIf: "tsc error or build failure" },
  { step: 6, name: "artefact retention", command: "preserve docs/odg/*.json registers + gate output as the release evidence bundle", expected: "evidence bundle retained", status: "EXECUTABLE", stopIf: "missing evidence" },
  { step: 7, name: "push (OWNER-GATED, Level-C)", command: `git push origin ${branch}  # fast-forward on the feature branch`, expected: "feature branch updated (+commits)", status: "OWNER_GATED", stopIf: "non-ff / rejected" },
  { step: 8, name: "PR to main (OWNER-GATED)", command: `gh pr create --base main --head ${branch}  # main is protected`, expected: "PR open; CI required", status: "OWNER_GATED", stopIf: "PR checks fail" },
  { step: 9, name: "CI (required check)", command: "GitHub Actions ci.yml: npm ci → build:runtime → tsc → classified gate", expected: `required check "build + typecheck + parity + tests" green`, status: ciPresent ? "EXECUTABLE_IN_CI" : "NOT_MEASURED", stopIf: "CI red" },
  { step: 10, name: "review results", command: "review CI logs + gate classification", expected: "no genuine failure", status: "OWNER_GATED", stopIf: "any red" },
  { step: 11, name: "promotion (merge — OWNER-GATED)", command: "gh pr merge (protected: enforce_admins + required PR + required check)", expected: "merged to main", status: "OWNER_GATED", stopIf: "protection not satisfied" },
  { step: 12, name: "post-merge controls", command: `git fetch origin; git rev-list --count origin/main..HEAD`, expected: "HEAD reconciled with main; post-merge gate green", status: "OWNER_GATED", stopIf: "divergence/regression" },
];

// ---- §3.2 VPS chain — enumerated in order; every VPS-specific element OWNER_GATED/NOT_MEASURED (nothing invented).
const vpsStep = (step: number, name: string) => ({ step, name, precondition: "owner grants read-only VPS access", command: "NOT_MEASURED (no VPS access; no address/service/path/db/secret invented)", expected: "NOT_MEASURED", evidence: "to capture during inventory", stopIf: "any mismatch vs the released version", recovery: "abort + keep current VPS state", status: "OWNER_GATED" });
const vpsChain = [
  "target environment verification", "services & dependencies", "runtime compatibility", "configurations",
  "secrets presence (no disclosure)", "databases & migrations", "TLS & network", "pre-backup",
  "restorability verification", "delivery preparation", "controlled (re)start", "health checks",
  "connection checks", "log inspection", "post-deploy functional tests", "independent validation", "keep-or-rollback decision",
].map((n, i) => vpsStep(i + 1, n));

// ---- §3.3 backup/rollback completion.
const backupRollback = {
  scope: ["git history (append-only, immutable commits)", "5 stashes (uncommitted experiments)", "6 untracked artefacts", "docs/odg/* canonical registers"],
  integrity: `recovery point = HEAD ${head} (immutable sha); verifiable via git cat-file -e ${head}`,
  restorationTest: "git worktree add + checkout <sha> into a sibling dir (cp -al drill) ⇒ verify build+gate on the restored copy — EXECUTABLE locally, not yet executed this lot",
  dataConsistency: "NOT_MEASURED (VPS/db out of scope; owner-gated)",
  migrationState: "NONE planned (no real migration in scope)",
  rollbackOrder: ["stop new deploy", "restore prior artifact/commit on VPS (owner-gated)", "git: feature branch untouched; main revert via PR if needed (no force-push)", "re-run health checks"],
  triggers: ["CI red post-merge", "health check fail", "connection/dependency failure", "contradictory post-deploy evidence"],
  postRestoreTests: "re-run full gate + health checks on the restored state",
  restorabilityProven: false,          // honest: restoration DRILL not executed this lot (no destructive op)
};

const githubExecutableLocally = githubChain.filter((s) => s.status === "EXECUTABLE").length;
const out = {
  "//": "CTO V91 §3 — executable deployment plan from the REAL repo/CI/git. GitHub chain uses actual commands (no invented jobs); push/merge/CI-promotion are OWNER_GATED (Level-C). VPS chain fully ordered but every VPS specific is OWNER_GATED/NOT_MEASURED (no VPS access; nothing invented). Read-only: nothing executed/pushed/deployed.",
  github: { branch, head, behindMain: Number(behindMain), ciPresent, chain: githubChain, locallyExecutableSteps: githubExecutableLocally, ownerGatedSteps: githubChain.filter((s) => /OWNER_GATED/.test(s.status)).length },
  vps: { chain: vpsChain, allOwnerGated: vpsChain.every((s) => s.status === "OWNER_GATED"), note: "no VPS fact invented; inventory is the prerequisite (owner-gated access)" },
  backupRollback,
  executablePlanComplete: false,
  honestConclusion: `GitHub/CI chain is built from REAL commands: ${githubExecutableLocally} steps locally executable (status/sync/incremental/gate/tsc+build/artefacts), push/PR/CI/merge/post-merge OWNER_GATED (Level-C). VPS chain is fully ordered (17 steps) but every VPS specific is OWNER_GATED/NOT_MEASURED — no address/service/path/db/secret invented. Backup/rollback scope+order+triggers defined; restorability drill EXECUTABLE locally but NOT yet run. EXECUTABLE_DEPLOYMENT_PLAN is therefore NOT fully satisfied (VPS specifics + restorability drill pending) — honest.`,
  invariant: "GitHub steps use real commands (no invented jobs); VPS specifics OWNER_GATED/NOT_MEASURED (nothing invented); a present backup ≠ a proven-restorable backup; plan not declared complete while essential steps are unverified.",
};
fs.writeFileSync(path.join(D, "V91_DEPLOYMENT_PLAN.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ githubExecutableLocally, githubOwnerGated: out.github.ownerGatedSteps, vpsAllOwnerGated: out.vps.allOwnerGated, executablePlanComplete: out.executablePlanComplete }, null, 2) + "\n");
export {};
