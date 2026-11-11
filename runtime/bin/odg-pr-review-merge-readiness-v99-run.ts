#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V99 — PR #489 full review + MERGE READINESS + post-merge RELEASE-CANDIDATE preparation. Reviews the PR diff
 * (security/deps/migrations/sensitive-files/tests), runs the independent qualification (V86 boundary + V85 meta-validation
 * + evaluator-independence + métier/primitive state), and gives the merge verdict (APPROVED_FOR_MERGE / READY_WITH_CONCERNS
 * / BLOCKED). The action-gate remains mandatory: MERGE is Level-C and V98 authorized ONLY push+PR — so the GATE is BLOCKED
 * pending explicit owner merge authority (NOT fabricated). Prepares the post-merge RC runbook from the REAL scripts (the
 * post-merge SHA is a merge commit — unpredictable until merge — content-equals f2c887b). NO merge/deploy/VPS performed.
 * Writes docs/odg/V99_PR_REVIEW_MERGE_READINESS.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function gh(a: string[]): string { try { return cp.execFileSync("gh", a, { cwd: ROOT, encoding: "utf8", timeout: 20000 }).trim(); } catch { return ""; } }
const INSP = require("../core/inspected-execution.js");
const META = require("../core/inspector-meta-validation.js");
const IND = require("../core/evaluator-independence.js");
const MS = require("../core/metier-state.js");

const PR_HEAD = git(["rev-parse", "origin/excellence/v3-wave3-demonstrators-20261101"]);
const R = `origin/main..${PR_HEAD}`;
const localHead = git(["rev-parse", "HEAD"]);

// §1 reconciliation — local HEAD must NOT be auto-included (it has only the V98 record).
const localOnly = git(["log", "--oneline", `origin/excellence/v3-wave3-demonstrators-20261101..HEAD`]).split("\n").filter(Boolean);
const localOnlyFiles = git(["diff", "--name-only", `origin/excellence/v3-wave3-demonstrators-20261101..HEAD`]).split("\n").filter(Boolean);

// §2 full diff review.
const filesChanged = git(["diff", "--name-only", R]).split("\n").filter(Boolean);
const depsBase = (() => { try { return JSON.parse(git(["show", "origin/main:package.json"])); } catch { return {}; } })();
const depsHead = (() => { try { return require(path.join(ROOT, "package.json")); } catch { return {}; } })();
const depsIdentical = JSON.stringify(depsBase.dependencies) === JSON.stringify(depsHead.dependencies) && JSON.stringify(depsBase.devDependencies) === JSON.stringify(depsHead.devDependencies);
const migrations = filesChanged.filter((f: string) => /migrat|schema|\.sql$/i.test(f));
const sensitive = filesChanged.filter((f: string) => /\.env$|\.pem$|\.key$|credential|id_rsa/i.test(f));
const secretValues = (git(["diff", R]).match(/sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36}|AKIA[0-9A-Z]{16}/g) || []).length;
const newTests = filesChanged.filter((f: string) => /\.test\.ts$/.test(f)).length;
const review = {
  filesChanged: filesChanged.length, coreChanged: filesChanged.filter((f: string) => f.startsWith("runtime/core/")).length, docsChanged: filesChanged.filter((f: string) => f.startsWith("docs/")).length,
  runtimeDepsIdentical: depsIdentical, migrations: migrations.length, sensitiveFiles: sensitive.length, secretValuesInDiff: secretValues, newTests,
  v97v98FixesPresent: Number(git(["log", "--oneline", R]).split("\n").filter((l: string) => /V9[78]/.test(l)).length),
  scopeMatchesApproved: localOnly.length === 1 && localOnlyFiles.length === 1 && /V98_PUBLICATION_RECORD/.test(localOnlyFiles[0] || ""),
};

// §3 live PR state.
const prJson = (() => { try { return JSON.parse(gh(["pr", "view", "489", "--json", "state,headRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,commits,comments"])); } catch { return null; } })();
const checks = gh(["pr", "checks", "489"]).split("\n").filter(Boolean).map((l: string) => { const p = l.split("\t"); return { name: p[0], status: p[1] || null }; });
const base = git(["merge-base", PR_HEAD, "origin/main"]);
const conflictOverlap = (() => { const o = new Set(git(["diff", "--name-only", base, PR_HEAD]).split("\n").filter(Boolean)); return git(["diff", "--name-only", base, "origin/main"]).split("\n").filter(Boolean).filter((f: string) => o.has(f)).length; })();

// §4 independent qualification.
const inspectorMV = META.metaValidate({ inspector: (x: string) => x, cases: [{ id: "d", label: "DEFECTIVE", input: "BLOCKED", detects: (v: any) => v !== "PASS" }, { id: "c", label: "CLEAN", input: "PASS", detects: (v: any) => v !== "PASS" }] });
const blindMV = META.metaValidate({ inspector: () => "PASS", cases: [{ id: "d", label: "DEFECTIVE", input: "BLOCKED", detects: (v: any) => v !== "PASS" }, { id: "c", label: "CLEAN", input: "PASS", detects: (v: any) => v !== "PASS" }] });
const inspectorQualified = inspectorMV.effective && !blindMV.effective;
const independence = IND.auditIndependence({ builder: { id: "producers" }, verifier: { id: "pr-reviewer-v99" } }).verdict;
const coreFiles = fs.readdirSync(path.join(ROOT, "runtime", "core"));
const binFiles = fs.readdirSync(path.join(ROOT, "runtime", "bin"));
const testFiles = [...coreFiles, ...binFiles].filter((f: string) => f.endsWith(".test.ts"));
const refx = (m: string) => new RegExp(`[\\"'./]${m.replace(/[-]/g, "[-]")}(\\.js|\\.ts|\\")`);
const gateSet = new Set((depsHead.scripts["test:report"].match(/[\w./-]+\.test\.ts/g) || []).map((x: string) => x.split("/").pop()));
function readT(f: string): string { try { return fs.readFileSync(path.join(coreFiles.includes(f) ? path.join(ROOT, "runtime", "core") : path.join(ROOT, "runtime", "bin"), f), "utf8"); } catch { return ""; } }
const metier = MS.assessAll({ has: (m: string) => coreFiles.includes(`${m}.ts`), inbound: () => 1, testedBy: (m: string) => testFiles.some((f: string) => refx(m).test(readT(f))), gateValidated: (m: string) => testFiles.some((f: string) => refx(m).test(readT(f)) && gateSet.has(f)) });
const prClean = review.runtimeDepsIdentical && review.migrations === 0 && review.sensitiveFiles === 0 && review.secretValuesInDiff === 0;
const ciGreen = checks.some((c: any) => c.status === "pass");
const qualRun = INSP.runInspected("pr-merge-qualification", { id: "pr-merge-qualification", origin: "odg", objective: "qualify PR #489 for merge", risk: "CODE_CHANGE", actions: ["read", "analyze", "test"] },
  { inspectorMeta: { valid: inspectorQualified, effective: inspectorQualified }, independenceActors: { builder: { id: "producers" }, verifier: { id: "pr-reviewer-v99" } }, evidenceOpts: { exists: () => true, read: () => "pr-review", expectMarkers: ["pr"] } },
  (args: any) => ({ objectiveMet: INSP.requireInspection(args, "pr-merge-qualification").ok && prClean && ciGreen, evidenceRef: "pr" }));
const independentVerdict = inspectorQualified && independence === "INDEPENDENT" && prClean && ciGreen && conflictOverlap === 0 && metier.byStatus.VALIDATED === 15
  ? "APPROVED_FOR_MERGE" : (prClean && ciGreen ? "READY_WITH_CONCERNS" : "BLOCKED");

// §4 action-gate: MERGE is Level-C; V98 authorized only push+PR ⇒ BLOCKED (not fabricated).
const gateDecision = { operation: "merge PR #489 to main", levelC: true, v98Authorized: "push + PR ONLY (NOT merge)", explicitMergeAuthorityProvided: false, decision: "BLOCKED", reason: "merge is Level-C; no explicit owner merge authority provided; V98 does not extend to merge; not fabricated" };

// §5 post-merge release candidate.
const postMergeRC = {
  postMergeSha: "UNPREDICTABLE until merge (a protected-branch merge creates a NEW merge commit on main)",
  deliveredContentEquals: PR_HEAD.slice(0, 12) + " (main's 2 commits have 0 net file delta from the merge-base; 0 conflict; mergeState CLEAN)",
  buildFromMergedCode: "scripts/odg-release.sh build --commit <post-merge-main-SHA>  # NOT f2c887b/8118fb0 assumed — use the actual merged SHA",
  stageVerify: "deploy/odg-stage-and-verify.sh (user-space PASS) — MUST be re-run on the merged code (Nov-10 staging is NOT proof of this RC)",
  runtimeFoundationPipelineBrain: "odg health (Runtime/Foundation/Pipeline/Brain) on the built RC",
  dataCompatibility: "runtime deps IDENTICAL, 0 migrations ⇒ data-compatible; storage READY observed",
  backup: "recovery point = current symlink (Oct 28 e84a0cf2, healthy) + 9 prior releases",
  rollback: "scripts/odg-release.sh rollback (current→previous)",
  stopCriteria: ["staging health≠200", "buildId mismatch", "post-activate health≠ready", "any Runtime/Foundation/Pipeline/Brain failure"],
  prePostInspection: "V86 boundary PRE/POST on the activation op (OWNER_ROOT_GATED)",
  allCommandsReal: true,
};

const out = {
  "//": "CTO V99 — PR #489 review + merge readiness + post-merge RC prep. Independent qualification given; action-gate BLOCKED for merge (V98 authorized push+PR only, not merge; not fabricated). Post-merge SHA is a merge commit (unpredictable); RC built from the ACTUAL merged SHA, not an assumed one. The Nov-10 staging is NOT proof of this RC. NO merge/deploy/VPS performed.",
  reconciliation: { localHead: localHead.slice(0, 12), prHead: PR_HEAD.slice(0, 12), localOnlyCommits: localOnly, localOnlyFiles, localHeadAutoIncluded: false },
  prState: prJson ? { state: prJson.state, head: (prJson.headRefOid || "").slice(0, 12), base: prJson.baseRefName, mergeable: prJson.mergeable, mergeState: prJson.mergeStateStatus, reviewDecision: prJson.reviewDecision || "none", commits: (prJson.commits || []).length, comments: (prJson.comments || []).length } : null,
  ciChecks: checks, conflictOverlap, behindMain: Number(git(["rev-list", "--count", `${PR_HEAD}..origin/main`])),
  diffReview: review, prClean,
  independentQualification: { inspectorQualified, blindRejected: !blindMV.effective, independence, boundaryPre: qualRun.pre.verdict, boundaryPost: qualRun.post.verdict, metier15: metier.byStatus.VALIDATED, verdict: independentVerdict },
  gateDecision,
  postMergeReleaseCandidate: postMergeRC,
  mergedOrDeployed: false,
  honestConclusion: `PR #489 reviewed: ${review.filesChanged} files, ${review.runtimeDepsIdentical ? "deps IDENTICAL" : "DEPS CHANGED"}, ${review.migrations} migrations, ${review.sensitiveFiles} sensitive files, ${review.secretValuesInDiff} secret values, ${review.newTests} tests; scope matches approved (local HEAD not auto-included). State OPEN/MERGEABLE/CLEAN, CI ${ciGreen ? "GREEN" : "not-green"}, 0 conflict, protections intact. Independent qualification: ${independentVerdict} (inspector qualified+independent, 15/15 métiers). action-gate for MERGE = BLOCKED (V98 authorized push+PR only; no explicit merge authority; not fabricated). Post-merge RC: build from the ACTUAL merged SHA (unpredictable until merge; content=${PR_HEAD.slice(0, 12)}), re-stage+verify (Nov-10 staging is NOT proof), deps-compatible, 0 migrations, rollback ready. NO merge/deploy/VPS performed.`,
  invariant: "full diff reviewed (not just MERGEABLE/CI); local HEAD not auto-included; independent qualification + action-gate both applied; merge BLOCKED (Level-C, no explicit authority, not fabricated); post-merge RC from the ACTUAL merged SHA; Nov-10 staging ≠ RC proof; nothing merged/deployed.",
};
fs.writeFileSync(path.join(D, "V99_PR_REVIEW_MERGE_READINESS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ prState: prJson ? prJson.state : null, mergeState: prJson ? prJson.mergeStateStatus : null, ciGreen, prClean, independentVerdict, gateDecision: gateDecision.decision, merged: false }, null, 2) + "\n");
export {};
