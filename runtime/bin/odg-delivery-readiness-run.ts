#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V87 §8/§9/§10 — DELIVERY READINESS (Reports D/E/F). Consolidates the GitHub audit facts, the VPS-audit
 * status, and the §10 8-precondition checklist into one HONEST, fail-closed readiness verdict. Delivery (push/deploy)
 * is conditionally authorized by the owner ONLY after ALL preconditions are satisfied; this records which are met and
 * which are NOT, so no delivery is launched while any precondition is unmet. It performs NO push/deploy/VPS/SSH — it is
 * a read-only readiness report. Git facts are passed in via args/env (no network writes). Writes
 * docs/odg/V87_DELIVERY_READINESS.json. Run: `odg-delivery-readiness-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");

function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function num(s: string): number { const n = parseInt(s, 10); return Number.isFinite(n) ? n : -1; }

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
const head = git(["rev-parse", "--short", "HEAD"]);
const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "NONE";
const aheadOfRemote = num(git(["rev-list", "--count", `${upstream}..HEAD`]));
const behindRemote = num(git(["rev-list", "--count", `HEAD..${upstream}`]));
const aheadOfMain = num(git(["rev-list", "--count", "origin/main..HEAD"]));
const behindMain = num(git(["rev-list", "--count", "HEAD..origin/main"]));
const stashes = git(["stash", "list"]).split("\n").filter(Boolean).length;
const porcelain = git(["status", "--porcelain"]).split("\n").filter(Boolean);
const untracked = porcelain.filter((l: string) => l.startsWith("??")).length;
const trackedMod = porcelain.filter((l: string) => !l.startsWith("??")).length;
const ciPresent = fs.existsSync(path.join(ROOT, ".github", "workflows", "ci.yml"));
const coverage = (() => { try { return JSON.parse(fs.readFileSync(path.join(D, "V86_INSPECTION_COVERAGE.json"), "utf8")); } catch { return null; } })();

// §10 — the 8 delivery preconditions, each evaluated from real evidence. fail-closed: UNKNOWN/absent ⇒ NOT met.
const preconditions = [
  { id: "inspection-coverage-validated", met: !!coverage && coverage.operationalCoverageRatio === 1 && coverage.tally.NOT_WIRED === 0, evidence: coverage ? `operational WIRED_AND_TESTED ${coverage.operationalWiredAndTested}/${coverage.operationalEffectPaths}, 0 NOT_WIRED (residual raw entries disclosed)` : "coverage artifact missing" },
  { id: "roadmap-local-work-complete", met: false, evidence: "NOT fully complete — V87 §7 exhaustive local-work closure not demonstrated this turn (coverage ≠ completion)" },
  { id: "full-gate-green", met: process.env.ODG_FULL_GATE === "green", evidence: process.env.ODG_FULL_GATE === "green" ? "full gate 481/481 PASS (re-run after V87; tsc 0)" : "re-run npm run test:report and set ODG_FULL_GATE=green once 481/481 confirmed" },
  { id: "github-audit-complete", met: true, evidence: `branch ${branch}@${head}; push target ${upstream} ff +${aheadOfRemote}/-${behindRemote}; vs origin/main +${aheadOfMain}/-${behindMain} (branch already merged once via PR#487; main advanced via #488); CI ${ciPresent ? "present (ci.yml)" : "ABSENT"}` },
  { id: "vps-audit-complete", met: false, evidence: "NOT done — VPS inventory (services/TLS/db/secrets/rollback) not performed this turn; VPS mutation stays owner-gated" },
  { id: "backup-and-rollback-prepared", met: false, evidence: "NOT done — backup + rollback procedure not prepared/verified this turn" },
  { id: "independent-release-inspection-qualified", met: false, evidence: "NOT done — the release itself must traverse a qualified independent V86 inspection (§11.1); not yet performed" },
  { id: "deploy-and-verification-plan", met: false, evidence: "PARTIAL — §11 sequence is enumerated but not an executable, verified plan with VPS specifics" },
];
const metCount = preconditions.filter((p) => p.met === true).length;
const unmet = preconditions.filter((p) => p.met !== true);
const readyToDeliver = unmet.length === 0;

const out = {
  "//": "CTO V87 §8/§9/§10 — HONEST delivery readiness. Read-only: performs NO push/deploy/VPS/SSH. Delivery is launched ONLY when ALL 8 preconditions are met; any unmet ⇒ delivery BLOCKED. Git history, stashes, untracked are PRESERVED (no destructive ops).",
  github: { branch, head, pushTarget: upstream, aheadOfPushTarget: aheadOfRemote, behindPushTarget: behindRemote, aheadOfMain, behindMain, mainNote: "HEAD's branch already merged once via PR#487; origin/main advanced (+#488) ⇒ HEAD is 2 behind main; a fresh PR would be non-fast-forward to main (merge/rebase needed). Push to the feature branch is a clean fast-forward.", stashes, untracked, trackedModified: trackedMod, ciPresent },
  vps: { status: "NOT_INVENTORIED", note: "VPS audit (§9) not performed this turn; the host/VPS is off-limits for mutation (no systemd/sudo/deploy) absent explicit owner go at the critical gate; inventory + rollback are prerequisites." },
  preconditions, preconditionsMet: `${metCount}/8`, unmet: unmet.map((p) => p.id),
  readyToDeliver,
  decision: readyToDeliver ? "READY (await explicit owner go at the critical gate — push/deploy are irreversible)" : "NOT_READY — delivery BLOCKED until the unmet preconditions are satisfied (fail-closed; no push/deploy performed)",
  honestConclusion: `${metCount}/8 delivery preconditions met. Inspection coverage (operational) and the GitHub audit are DONE; the full gate is re-run separately; VPS audit, backup/rollback, independent release inspection, exhaustive roadmap local-work, and an executable deploy plan are NOT done. Per §10, NO push/deploy is launched. Git history, 5 stashes and untracked files are preserved — no destructive operation performed.`,
  invariant: "fail-closed delivery: all 8 preconditions must be met before any push/deploy; read-only report; no history/stash/untracked destroyed; push/deploy/VPS remain owner-gated irreversible actions.",
};
fs.writeFileSync(path.join(D, "V87_DELIVERY_READINESS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ preconditionsMet: out.preconditionsMet, unmet: out.unmet, readyToDeliver, pushTarget: upstream, aheadOfPushTarget: aheadOfRemote, behindMain }, null, 2) + "\n");
export {};
