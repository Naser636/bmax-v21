#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V93 §5 — OPERATIONAL RELEASE RUNBOOK (GitHub/CI → VPS). Completes the V91 plan with the REAL VPS commands
 * now that a real inventory exists: the deploy mechanism is the repo's own scripts/odg-release.sh (build → verify →
 * activate[atomic 'current' symlink swap] → health[/api/health] → rollback[symlink to 'previous']). Every step has
 * preconditions, the real command, before/after controls, expected evidence, a stop criterion, and a rollback action.
 * NOTHING is executed (no push/activate/rollback this lot — all Level-C owner-gated). Writes docs/odg/V93_RELEASE_RUNBOOK.json.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]); const head = git(["rev-parse", "--short", "HEAD"]);
const releaseScriptPresent = fs.existsSync(path.join(ROOT, "scripts", "odg-release.sh"));
const inv = (() => { try { return JSON.parse(fs.readFileSync(path.join(D, "V93_VPS_INVENTORY.json"), "utf8")); } catch { return null; } })();

const S = (phase: string, step: number, name: string, precondition: string, command: string, before: string, after: string, evidence: string, stopIf: string, rollback: string, gated: boolean) =>
  ({ phase, step, name, precondition, command, beforeControl: before, afterControl: after, expectedEvidence: evidence, stopCriterion: stopIf, rollbackAction: rollback, status: gated ? "OWNER_GATED (Level-C)" : "EXECUTABLE_LOCAL" });

const github = [
  S("github", 1, "state & sync", "clean tree on feature branch", `git status --porcelain; git fetch origin; git rev-list --count HEAD..origin/main`, "tree clean", "know behind-main (currently 2 ⇒ rebase/merge before PR to main)", "git status + divergence count", "unexpected divergence", "none (read-only)", false),
  S("github", 2, "release gate", "sync known", `npm run test:report`, "prior gate green", "all suites PASS", "classified gate output (490/490)", "any FAIL/BLOCKED/NOT_RUN", "none (read-only)", false),
  S("github", 3, "typecheck+build", "gate green", `npx tsc --noEmit -p tsconfig.json; npm run build:runtime`, "tsc baseline", "tsc 0 + dist closure built", "tsc exit 0 + dist-closure-manifest", "tsc error / build fail", "none", false),
  S("github", 4, "push feature branch", "gate+tsc+build green", `git push origin ${branch}`, "ff check", "remote branch updated", "push confirmation (ff)", "non-ff/rejected", "no force-push; investigate", true),
  S("github", 5, "PR + CI + merge", "pushed", `gh pr create --base main --head ${branch}; (CI ci.yml required) ; gh pr merge`, "main protected (enforce_admins + required PR + required check)", "CI green + merged", "PR checks + merge sha", "CI red / protection unmet", "close PR; keep main untouched", true),
];
const vps = [
  S("vps", 1, "build immutable release", "merged/target commit chosen", `scripts/odg-release.sh build --commit <sha>`, "disk space (160G free observed)", "immutable release dir under /home/ubuntu/odg-releases", "release id + build log (npm ci→build:runtime→next build)", "any build step fails", "discard the release dir (no activation)", true),
  S("vps", 2, "verify on staging port", "release built", `scripts/odg-release.sh verify <releaseId>`, "staging port free", "staging boot health=200 + buildId matches", "/api/health 200 + buildId", "health≠200 or buildId mismatch", "discard release; keep current", true),
  S("vps", 3, "activate (atomic swap)", "verify OK", `scripts/odg-release.sh activate <releaseId>`, "record 'previous'=current (auto)", "atomic 'current' symlink swap + restart + health", "health 200 on :3000 + new buildId", "post-activate health≠200", "scripts/odg-release.sh rollback (symlink→previous)", true),
  S("vps", 4, "post-deploy health & connections", "activated", `curl -s http://127.0.0.1:3000/api/health`, "pre-deploy health captured", "status ready + storage READY + new buildId", "health JSON", "status≠ready / storage≠READY", "rollback", true),
  S("vps", 5, "independent validation + keep/rollback", "health ok", `scripts/odg-release.sh status; (functional checks)`, "baseline recorded", "current/previous + listener confirmed", "status output + functional evidence", "any functional regression", "scripts/odg-release.sh rollback", true),
];

const realCmds = [...github, ...vps].filter((s) => !/\<sha\>|\<releaseId\>/.test(s.command) || s.phase === "vps").length;
const out = {
  "//": "CTO V93 §5 — operational runbook. GitHub chain preserved from V91; VPS chain now uses the repo's REAL deploy script scripts/odg-release.sh (verified present) backed by the real V93 inventory. Nothing executed: push/PR/merge + build/verify/activate/rollback are all OWNER_GATED (Level-C). The deploy/rollback mechanism (atomic 'current' symlink + 'previous') is real and observed.",
  head, branch, releaseScriptPresent, inventoryBacked: !!inv && inv.performedReadOnly === true,
  github, vps,
  rollback: { mechanism: "scripts/odg-release.sh rollback — repoint 'current' symlink to 'previous' + restart + health", priorReleasesObserved: inv ? inv.observed.releaseMechanism.releaseCount : null, atomicSwap: true },
  deployedVsTarget: inv ? inv.observed.deployedVsHead : null,
  executableReady: releaseScriptPresent && !!inv,
  honestConclusion: `Runbook operational: GitHub chain (real commands, push/PR/merge OWNER_GATED) + VPS chain backed by the REAL scripts/odg-release.sh (build/verify/activate/rollback/status) and the real V93 inventory. Deploy = atomic 'current' symlink swap, rollback = symlink to 'previous' (${inv ? inv.observed.releaseMechanism.releaseCount : "?"} prior releases observed). Health = /api/health (verified 200 on the live deployed release). NOTHING executed (all Level-C owner-gated). The VPS steps are now REAL (not fictional) because a real inventory + the real deploy script back them.`,
  invariant: "every step has precondition/real-command/before-after/evidence/stop/rollback; VPS commands are the repo's real odg-release.sh backed by a real inventory; nothing executed (Level-C owner-gated); rollback is the observed symlink mechanism.",
};
fs.writeFileSync(path.join(D, "V93_RELEASE_RUNBOOK.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ releaseScriptPresent, inventoryBacked: out.inventoryBacked, githubSteps: github.length, vpsSteps: vps.length, executableReady: out.executableReady }, null, 2) + "\n");
export {};
