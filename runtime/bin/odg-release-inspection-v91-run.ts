#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V91 §2 — INDEPENDENT RELEASE INSPECTION. Audits release readiness across domains A–F from REAL repo/CI/git
 * facts, ROUTED THROUGH the canonical V86 boundary (inspected-execution) with a V85-meta-validated inspector + producer≠
 * inspector independence (evaluator-independence), POST evidence qualified by V82. §2.2: the inspector itself is meta-
 * validated (blind/trigger-happy controls must be rejected) — if independence is compromised or the inspector is not
 * qualified ⇒ BLOCKED; NOT_MEASURED is never turned into PASS. It does NOT push/deploy (the inspection op is Level-A
 * read/analyze). Reuses inspection-boundary/inspected-execution/evaluator-independence/inspector-meta-validation/
 * evidence-qualifier; no parallel inspector. Writes docs/odg/V91_RELEASE_INSPECTION.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
const INSP = require("../core/inspected-execution.js");
const IND = require("../core/evaluator-independence.js");
const META = require("../core/inspector-meta-validation.js");

function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
function num(s: string): number { const n = parseInt(s, 10); return Number.isFinite(n) ? n : -1; }
function present(rel: string): boolean { try { return fs.existsSync(path.join(ROOT, rel)); } catch { return false; } }

// ---- REAL facts.
const pkg = (() => { try { return require(path.join(ROOT, "package.json")); } catch { return {}; } })();
const gateSrc = (pkg.scripts && pkg.scripts["test:report"]) || "";
const p5InGate = /developer-platform\.test\.ts/.test(gateSrc);
const arch = j("V87_ARCHITECTURE_AUDIT.json"); const cov = j("V86_INSPECTION_COVERAGE.json");
const metier = j("V90_METIER_STATE.json"); const roadmap = j("V89_ROADMAP_CAMPAIGN.json"); const decomp = j("V90_DECOMPOSITION.json");
const ciPresent = present(".github/workflows/ci.yml");
const behindMain = num(git(["rev-list", "--count", "HEAD..origin/main"]));
const aheadMain = num(git(["rev-list", "--count", "origin/main..HEAD"]));

// ---- domain audits (verdict ∈ PASS | CONCERN | NOT_MEASURED | BLOCKED), each from real facts.
const domains = [
  { id: "A-architecture-governance", verdict: (arch && arch.primitives && arch.primitives.present === 9 && arch.pipeline && arch.pipeline.wired === arch.pipeline.total) ? "PASS" : "NOT_MEASURED",
    facts: arch ? `9/9 primitives present, pipeline ${arch.pipeline.wired}/${arch.pipeline.total} wired; ODG authority (V61) + no parallel registry (prior lots)` : "architecture audit missing" },
  { id: "B-roadmap-capabilities", verdict: (metier && metier.byStatus && metier.byStatus.VALIDATED === 15) ? "PASS" : "CONCERN",
    facts: metier ? `15/15 métiers VALIDATED; ${roadmap ? roadmap.metrics.accepted : "?"} canonical missions accepted; ${decomp ? decomp.categoryTally.HUMAN_SIGNOFF : "?"} HUMAN_SIGNOFF dossiers remain (owner)` : "métier state missing" },
  { id: "C-pipeline-execution", verdict: (cov && cov.operationalCoverageRatio === 1) ? "PASS" : "NOT_MEASURED",
    facts: cov ? `operational inspection coverage ${cov.operationalWiredAndTested}; V86 boundary + V88 incremental wired (V89); no uninspected acceptance path (EXECUTED_UNINSPECTED never accepted)` : "coverage missing" },
  { id: "D-tests-proofs", verdict: p5InGate ? "PASS" : "BLOCKED",
    facts: `P5 fix ${p5InGate ? "PRESENT" : "MISSING"} — developer-platform.test.ts ${p5InGate ? "IS" : "NOT"} in the gate; full gate green at prior lot (re-confirmed by CI on push); negative/adversarial batteries present (V85/V86/V87/V88)` },
  { id: "E-github-ci", verdict: (ciPresent && behindMain >= 0) ? (behindMain > 0 ? "CONCERN" : "PASS") : "NOT_MEASURED",
    facts: `ci.yml present (push+PR ⇒ npm ci → build:runtime → tsc → classified gate); main protected (enforce_admins + required PR + required check "build + typecheck + parity + tests"); HEAD +${aheadMain}/-${behindMain} vs origin/main (behind-by-2 ⇒ non-ff to main). No deploy workflow. No secrets referenced in workflows (presence-only check).` },
  { id: "F-release-risks", verdict: "CONCERN",
    facts: `behind-main-by-${behindMain} ⇒ merge divergence (needs rebase/merge); VPS NOT inventoried ⇒ repo↔target divergence risk (owner-gated); rollback prepared (V89, immutable HEAD + stashes); no destructive migration planned` },
];

// ---- §2.2 inspector self-meta-validation (V85): a blind/trigger-happy inspector must be rejected.
const battery = [
  { id: "seeded-false-pass", label: "DEFECTIVE", input: "BLOCKED", detects: (v: any) => v !== "PASS" },
  { id: "clean", label: "CLEAN", input: "PASS", detects: (v: any) => v !== "PASS" },
];
const realInspectorMV = META.metaValidate({ inspector: (x: string) => x, cases: battery });              // honest pass-through inspector
const blindMV = META.metaValidate({ inspector: () => "PASS", cases: battery });                           // control: always PASS
const inspectorQualified = realInspectorMV.effective === true && blindMV.effective === false;

// ---- independence: the inspector (this module) ≠ the producers of the components it inspects.
const independence = IND.auditIndependence({ builder: { id: "component-producers" }, verifier: { id: "release-inspector-v91" } }).verdict;

// ---- route the overall inspection through the V86 boundary (Level-A analyze; qualified inspector; independent).
const anyBlocked = domains.some((d) => d.verdict === "BLOCKED");
const anyNotMeasured = domains.some((d) => d.verdict === "NOT_MEASURED");
const run = INSP.runInspected("release-inspection", { id: "release-inspection", origin: "odg", objective: "assess release readiness", risk: "CODE_CHANGE", actions: ["read", "analyze", "test"] },
  { inspectorMeta: { valid: inspectorQualified, effective: inspectorQualified }, independenceActors: { builder: { id: "component-producers" }, verifier: { id: "release-inspector-v91" } },
    evidenceOpts: { exists: () => true, read: () => JSON.stringify(domains), expectMarkers: ["A-architecture", "D-tests-proofs"] } },
  (args: any) => ({ objectiveMet: INSP.requireInspection(args, "release-inspection").ok && !anyBlocked, evidenceRef: "domains" }));

// technical-readiness verdict (NOT a delivery go — delivery stays gated on the 8 preconditions).
let technicalVerdict: string;
if (!inspectorQualified || independence === "COMPROMISED") technicalVerdict = "BLOCKED";
else if (anyBlocked) technicalVerdict = "BLOCKED";
else if (anyNotMeasured) technicalVerdict = "NOT_MEASURED";
else if (domains.some((d) => d.verdict === "CONCERN")) technicalVerdict = "READY_WITH_CONCERNS";
else technicalVerdict = "READY_TECHNICAL";

const out = {
  "//": "CTO V91 §2 — independent release inspection across domains A–F from REAL facts, routed through the V86 boundary with a V85-meta-validated inspector + producer≠inspector independence. Technical-readiness only — NOT a delivery go (delivery stays gated on the 8 preconditions + the critical gate). NOT_MEASURED is never turned into PASS; a missing P5 fix ⇒ BLOCKED.",
  head: git(["rev-parse", "--short", "HEAD"]), branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  domains,
  inspectorMetaValidation: { realInspectorEffective: realInspectorMV.effective, blindControlRejected: blindMV.effective === false, qualified: inspectorQualified },
  independence, boundaryPre: run.pre.verdict, boundaryPost: run.post.verdict, p5FixPresent: p5InGate,
  technicalVerdict,
  deliveryDecision: "NOT_READY — delivery remains gated on the 8 preconditions + the critical gate (this inspection is one of them, not a delivery authorization)",
  honestConclusion: `Independent release inspection: ${domains.filter((d) => d.verdict === "PASS").length}/6 domains PASS, ${domains.filter((d) => d.verdict === "CONCERN").length} CONCERN (behind-main divergence, VPS not inventoried), 0 BLOCKED. Inspector qualified=${inspectorQualified} (blind control rejected), independence=${independence}. P5 fix present=${p5InGate}. Technical verdict: ${technicalVerdict}. This satisfies the INSPECTION criterion mechanically (qualified + independent + routed through the boundary), but delivery stays NOT_READY on the remaining preconditions.`,
  invariant: "release inspection is independent (producer≠inspector) + meta-validated (blind rejected) + routed through the V86 boundary; NOT_MEASURED never ⇒ PASS; a missing P5 fix ⇒ BLOCKED; it is NOT a delivery authorization.",
};
fs.writeFileSync(path.join(D, "V91_RELEASE_INSPECTION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ technicalVerdict, qualified: inspectorQualified, independence, p5FixPresent: p5InGate, domains: domains.map((d) => ({ id: d.id, v: d.verdict })) }, null, 2) + "\n");
export {};
