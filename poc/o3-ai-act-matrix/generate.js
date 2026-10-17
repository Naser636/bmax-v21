#!/usr/bin/env node
"use strict";
/*
 * O3 PoC — AI Act / ISO 42001 requirements → evidence → gap matrix GENERATOR (deterministic, offline).
 *
 * Maps each THEME-level requirement (requirements.json — real framework names, no fabricated clause text) to
 * the REPO's actual technical evidence where it genuinely exists, and grades readiness. This is READINESS
 * ASSISTANCE, not legal advice / conformity assessment / certification. Pure + fail-closed: a malformed
 * requirements file THROWS (no partial matrix). No network, no new dependency, no runtime mutation.
 *
 * Status vocab: VERIFIED (repo tech evidence present + testable) · PARTIAL (tech readiness, needs human/org/
 * legal completion) · GAP (expected evidence absent) · BLOCKED (external body required) · NOT_ASSESSED
 * (cannot verify from available sources — records what would verify it).
 *
 * Run: node poc/o3-ai-act-matrix/generate.js [out.json]
 */
const fs = require("fs");
const path = require("path");

// Repo evidence map: theme → {evidence refs that ACTUALLY exist in this repo, readiness status}.
// Only claims evidence that is real; everything else is GAP/NOT_ASSESSED/BLOCKED (fail-closed on absence).
const REPO_ROOT = path.resolve(__dirname, "..", "..");
function exists(rel) { return fs.existsSync(path.join(REPO_ROOT, rel)); }

function evidenceFor(reqId) {
  switch (reqId) {
    case "R-LOG": return guard(["runtime/core/evidence-provenance.js", "runtime/core/mission-ledger.js"], "PARTIAL",
      "evidence-provenance stamps {sourceCommit,treeDirty,contentSha256,capturedAtRun}; mission-ledger append-only. Tech record-keeping present; retention/PII policy = org/legal.");
    case "R-HUMAN": return guard(["runtime/core/action-gate.js", "runtime/core/capability-authorization.js"], "PARTIAL",
      "deny-by-default action-gate + fail-closed human-authorization gate for consequential capabilities (proven by action-gate-live.test.js / capability-authorization.test.js). Oversight PROCEDURE = org.");
    case "R-ACC": return guard(["runtime/core/action-gate.js", "runtime/core/dispatch-authorization-invariant.test.js", "runtime/core/provider-sandbox.js"], "PARTIAL",
      "deny-by-default + dispatch-authorization-invariant (OWASP ASVS fail-secure) + sandbox. Accuracy/robustness per-system = engagement.");
    case "R-INTEG": return guard(["runtime/core/evidence-provenance.js", "runtime/dist/dist-closure-manifest.json"], "PARTIAL",
      "build provenance + sha256 closure manifest + lockfile-derived CycloneDX SBOM (O2 PoC). Tool-complete inventory + SLSA builder attestation = SPEC.");
    case "R-INCID": return guard(["runtime/core/self-diagnostic.js", "runtime/core/incident-recurrence.js"], "PARTIAL",
      "self-diagnostic (expected-vs-observed→incident) + incident-recurrence (FROZEN_LOOP). Post-market monitoring org process = engagement.");
    case "R-TRANS": return guard(["docs/odg-operational/DEPLOYMENT.md", "docs/odg-operational/ODG_CAPABILITY_ENGINEERING_AND_OPPORTUNITY_GATE.md"], "PARTIAL",
      "operational/technical documentation exists; per-AI-system technical-doc set = engagement.");
    case "R-DATA": return { refs: [], status: "GAP", note: "no system-specific data-governance evidence in this repo; per-client data provenance/quality controls required." };
    case "R-RISK": return { refs: [], status: "NOT_ASSESSED", note: "org risk-management process not represented in this repo; verify risk tier (legal) + produce records." };
    case "R-GOV": return { refs: [], status: "NOT_ASSESSED", note: "AIMS policy/roles/internal-audit are organizational; not derivable from code." };
    case "R-CONF": return { refs: [], status: "BLOCKED", note: "formal conformity/certification requires a competent/accredited body — NOT ODG." };
    default: return { refs: [], status: "NOT_ASSESSED", note: "no mapping." };
  }
}
function guard(refs, statusIfPresent, note) {
  const present = refs.filter(exists);
  if (present.length === 0) return { refs: [], status: "GAP", note: "expected repo evidence ABSENT: " + refs.join(", ") };
  return { refs: present, status: statusIfPresent, note: note + (present.length < refs.length ? " [some refs missing: " + refs.filter((r) => !present.includes(r)).join(",") + "]" : "") };
}

function generate(reqDoc) {
  if (!reqDoc || !Array.isArray(reqDoc.requirements)) throw new Error("malformed requirements: .requirements[] required");
  const rows = reqDoc.requirements.map((r) => {
    const e = evidenceFor(r.id);
    return {
      id: r.id, theme: r.theme, frameworks: r.frameworks, category: r.category,
      applicability: r.applicability, expectedEvidence: r.expectedEvidence,
      repoEvidence: e.refs, status: e.status, note: e.note,
      sourceVerification: r.sourceVerification,
      nextAction: e.status === "VERIFIED" ? "maintain + evidence-link" :
        e.status === "PARTIAL" ? "complete org/legal/specialist portion; bind per-system evidence" :
        e.status === "GAP" ? "produce the expected evidence" :
        e.status === "BLOCKED" ? "engage the competent/accredited body (external)" :
        "verify applicability against official text; gather evidence",
      acceptance: "status + repoEvidence + sourceVerification all present and consistent; no fabricated clause/evidence",
    };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  const summary = rows.reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {});
  return { kind: "o3-ai-act-iso42001-readiness-matrix/1", disclaimer: "Readiness assistance only — NOT legal advice, conformity assessment, or certification; ODG is not a certifier. Framework clause text NOT reproduced; verify official sources per engagement.", frameworks: reqDoc.frameworks, summary, rows };
}

if (require.main === module) {
  const reqDoc = JSON.parse(fs.readFileSync(path.join(__dirname, "requirements.json"), "utf8"));
  const matrix = generate(reqDoc);
  const out = process.argv[2] || path.join(__dirname, "matrix.out.json");
  fs.writeFileSync(out, JSON.stringify(matrix, null, 2));
  process.stdout.write("O3 matrix: " + matrix.rows.length + " requirements · " + JSON.stringify(matrix.summary) + " → " + out + "\n");
}
module.exports = { generate };
