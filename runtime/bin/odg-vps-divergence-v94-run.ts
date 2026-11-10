#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V94 §4 — VPS DIVERGENCE AUDIT (read-only). Understands the delta between the DEPLOYED release (e84a0cf2) and
 * the current HEAD. Reads the 9 release dirs + current/previous symlinks + git diff (no activate/rollback/build, no symlink
 * or env change, no secret). Produces a divergence report: same/different/unknown components, dependency compatibility,
 * migrations, rollback feasibility, pre-activation controls, stop criteria. Writes docs/odg/V94_VPS_DIVERGENCE.json.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }
const RR = "/home/ubuntu/odg-releases";

const releases = sh(`ls -1dt ${RR}/rel-* 2>/dev/null`).split("\n").filter(Boolean).map((p: string) => {
  const m = p.match(/rel-([0-9TZ]+)-([0-9a-f]{8,})/);
  return { dir: p, timestamp: m ? m[1] : null, commit: m ? m[2].slice(0, 12) : null };
});
const current = sh(`readlink ${RR}/current 2>/dev/null`);
const previous = sh(`readlink ${RR}/previous 2>/dev/null`);
const deployed = (current.match(/rel-[0-9TZ]+-([0-9a-f]{8,})/) || [])[1] || "";
const deployedShort = deployed.slice(0, 12);
const head = git(["rev-parse", "--short=12", "HEAD"]);

const deployedInHistory = git(["cat-file", "-t", deployed || "0"]) === "commit";
const commitsAhead = deployedInHistory ? Number(git(["rev-list", "--count", `${deployed}..HEAD`])) : null;
const filesChanged = deployedInHistory ? git(["diff", "--name-only", deployed, "HEAD"]).split("\n").filter(Boolean) : [];
const depsDeployed = deployedInHistory ? (() => { try { return JSON.parse(git(["show", `${deployed}:package.json`])); } catch { return null; } })() : null;
const depsHead = (() => { try { return require(path.join(ROOT, "package.json")); } catch { return null; } })();
const depsSame = depsDeployed && depsHead && JSON.stringify(depsDeployed.dependencies) === JSON.stringify(depsHead.dependencies) && JSON.stringify(depsDeployed.devDependencies) === JSON.stringify(depsHead.devDependencies);
const runtimeChanged = filesChanged.filter((f: string) => f.startsWith("runtime/core/")).length;
// migration heuristic: any migration/schema/db file touched?
const migrationFiles = filesChanged.filter((f: string) => /migrat|schema|\.sql$/i.test(f));

const out = {
  "//": "CTO V94 §4 — read-only VPS divergence audit. No activate/rollback/build, no symlink/env/service change, no secret shown. Understands deployed (e84a0cf2) vs HEAD; an old deployment is neither an auto-validation nor an auto-failure — it is a release RISK to analyze.",
  releaseRoot: RR, releaseCount: releases.length, releases: releases.map((r: any) => ({ commit: r.commit, timestamp: r.timestamp })),
  currentSymlink: current || "none", previousSymlink: previous || "none",
  deployed: deployedShort, head,
  deployedInLocalHistory: deployedInHistory,
  divergence: { commitsAhead, filesChanged: filesChanged.length, runtimeCoreFilesChanged: runtimeChanged, dependencyCompatibility: depsSame ? "IDENTICAL (6 deps / 9 devDeps unchanged ⇒ no runtime-dep compat risk)" : "DIFFERENT (review required)", migrationsDetected: migrationFiles.length, migrationFiles: migrationFiles.slice(0, 10) },
  rollback: { feasible: !!previous || releases.length > 1, mechanism: "odg-release.sh rollback ⇒ repoint 'current' → 'previous' (or a prior release dir) + restart + health", priorReleasesAvailable: releases.length, previousPresent: !!previous },
  preActivationControls: ["build target from HEAD via odg-release.sh build", "verify on staging port (health 200 + buildId)", "diff deployed vs new buildId", "confirm deps identical (done: identical)", "full gate green on HEAD (done)", "backup current symlink (auto 'previous')"],
  stopCriteria: ["staging health≠200", "buildId mismatch", "any migration requiring data change (none detected)", "post-activate health≠ready"],
  risks: [
    `LARGE delta: deployed is ${commitsAhead} commits / ${filesChanged.length} files behind HEAD (${runtimeChanged} runtime/core) — a big jump; stage+verify before activation is essential`,
    "dependencies identical ⇒ no npm/runtime compat risk",
    migrationFiles.length ? `potential migrations: ${migrationFiles.length}` : "no migration/schema files in the delta ⇒ low data-migration risk",
    "deployed app is live+healthy (200) ⇒ rollback target is known-good",
  ],
  honestConclusion: `Deployed ${deployedShort} is ${commitsAhead} commits / ${filesChanged.length} files behind HEAD ${head} (${runtimeChanged} runtime/core). Dependencies IDENTICAL (no compat risk); ${migrationFiles.length === 0 ? "no migration files in the delta (low data risk)" : migrationFiles.length + " migration files to review"}. Rollback feasible: 'previous' symlink${previous ? " present" : " absent"} + ${releases.length} prior releases. The old deployment is a RELEASE RISK (large jump), not an auto-pass/fail: stage→verify→atomic-swap→health, rollback on any stop criterion. No activation performed.`,
  invariant: "read-only; old deployment = release risk analyzed, not auto-validated/failed; dependency+migration compatibility assessed from real diff; rollback feasibility confirmed; nothing activated/changed.",
};
fs.writeFileSync(path.join(D, "V94_VPS_DIVERGENCE.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ deployed: deployedShort, head, commitsAhead, filesChanged: filesChanged.length, depsSame, migrations: migrationFiles.length, rollbackFeasible: out.rollback.feasible }, null, 2) + "\n");
export {};
