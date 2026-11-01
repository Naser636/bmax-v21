#!/usr/bin/env node
/**
 * cra-evidence-demonstrator — ONE composed, end-to-end CRA/SBOM evidence run for profession P3
 * (Cybersecurity & Secure Software Engineering). CTO Master Campaign V3, Wave-1 integrated demonstrator.
 *
 * It ORCHESTRATES already-MERGED, independently-validated modules — it adds NO new capability and NO new
 * primitive. The composition is the deliverable: a single call wiring the five steps a CRA-deadline
 * (Reg. (EU) 2024/2847) buyer needs, with a coherent honest verdict + a CI-meaningful gate:
 *   1. SBOM + license-policy audit over REAL manifests        → sbom-audit-service.auditManifests / auditExitCode
 *   2. CRA compliance-evidence pack (SBOM+attestation+SLSA/AI-Act/robustness framing) → compliance-evidence-pack.buildEvidencePack
 *   3. seal SBOM+confinement+health into a tamper-evident bundle → golden-path-evidence-bundle.makeBundle
 *   4. emit an OSCAL-interop-shape export for downstream GRC    → evidence-pack-export.exportPack
 *   5. compose one verdict: CRA_EVIDENCE_PREPARED (+ciGate, policyClean/needsReview, bundleAttested, gaps, export)
 *
 * HONEST SCOPE (preserved from every constituent): this is technical EVIDENCE / READINESS preparation, NOT
 * CRA conformity, NOT certification, NOT legal advice, and NOT a vulnerability scan (no offline CVE feed —
 * CVE scanning is explicitly NOT_PERFORMED). The verdict is NEVER "CONFORMANT"/"CERTIFIED"/"PASS". FAIL-CLOSED:
 * a HIGH license-policy finding ⇒ ciGate=1 (the build should fail); UNKNOWN/conditional licenses ⇒ needsReview
 * (never assumed safe); zero components / unattested dimensions ⇒ explicit gaps and bundleAttested:false.
 *
 * PURE: all inputs (manifest sources, lockPackages, confinement, health, buildRef, signer) are passed in — no
 * fs / net / clock. ADDITIVE (modifies none of the composed modules). Dual export (ESM + CJS). Deterministic.
 */
"use strict";

const SBOM = require("./sbom-audit-service.js");
const CEP = require("./compliance-evidence-pack.js");
const GP = require("./golden-path-evidence-bundle.js");
const EXP = require("./evidence-pack-export.js");

const SCHEMA = "odg.cra-evidence-demonstrator.v1";
const VERDICT = Object.freeze({ PREPARED: "CRA_EVIDENCE_PREPARED", INCOMPLETE: "CRA_EVIDENCE_INCOMPLETE" });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * runCraEvidence(input) — compose the five steps. input:
 *   { sources:[{content,ecosystem,file}], target?, lockPackages?, repoName?, sourceCommit?, artifactName?,
 *     artifactBytes?, signer?, aiAct?, robustnessCases?, finishedAt?, buildRef?, confinement?, health?,
 *     key?, revision?, runId?, spawn? }
 * Returns a single composed, honest result. NEVER throws on bad input (fail-closed).
 */
function runCraEvidence(input: any): any {
  if (!isObj(input)) {
    return { ok: false, schema: SCHEMA, verdict: VERDICT.INCOMPLETE, code: "INVALID_INPUT", reason: "input object required", basis: "EVIDENCE_PREP_NOT_CONFORMITY" };
  }
  const gaps: string[] = [];
  const steps: any = {};

  // STEP 1 — SBOM + license-policy audit over REAL manifests (multi-ecosystem; fail-closed on unknown).
  const target = typeof input.target === "string" ? input.target : "commercial-closed";
  const audit = SBOM.auditManifests(Array.isArray(input.sources) ? input.sources : [], { target, name: input.repoName || "target", licenseByName: input.licenseByName });
  steps.audit = audit;
  let ciGate = 2; // fail-closed default: an unrecognizable/empty audit must not read as a clean 0
  let policyClean = false, needsReview = false, componentCount = 0;
  if (audit && audit.ok) {
    ciGate = SBOM.auditExitCode(audit.audit);
    policyClean = audit.audit.policyClean === true;
    needsReview = audit.audit.needsReview === true;
    componentCount = audit.audit.componentCount || 0;
    if (!policyClean) gaps.push("license-policy: at least one HIGH-severity (non-adoptable) license finding — build should FAIL (ciGate=1).");
    if (needsReview) gaps.push("license-policy: UNKNOWN/conditional license(s) require manual review (not assumed safe).");
    if (componentCount === 0) gaps.push("SBOM: zero components parsed from the supplied manifests.");
  } else {
    gaps.push(`SBOM/license audit did not run: ${audit && audit.code ? audit.code : "NO_AUDIT"} (${audit && audit.reason ? audit.reason : "no manifests?"}).`);
  }

  // STEP 2 — CRA compliance-evidence pack (SBOM + in-toto attestation + SLSA/AI-Act/robustness framing).
  const pack = CEP.buildEvidencePack({
    lockPackages: input.lockPackages || {},
    repoName: input.repoName, sourceCommit: input.sourceCommit,
    artifactName: input.artifactName, artifactBytes: input.artifactBytes,
    signer: input.signer, aiAct: input.aiAct, robustnessCases: input.robustnessCases, finishedAt: input.finishedAt,
  });
  steps.pack = pack;
  const packSbomComponents = isObj(pack) && isObj(pack.sbom) && Array.isArray(pack.sbom.components) ? pack.sbom.components.length : 0;

  // STEP 3 — seal SBOM + confinement + health into a tamper-evident golden-path bundle.
  // Feed the richer multi-ecosystem audit SBOM when present; else the pack's npm-lockfile SBOM.
  const sbomForBundle = audit && audit.ok && isObj(audit.sbom) ? audit.sbom : (isObj(pack) ? pack.sbom : null);
  const bundle = GP.makeBundle({
    sbom: { sbom: sbomForBundle, audit: audit && audit.ok ? { componentCount } : null },
    buildRef: input.buildRef, confinement: input.confinement, health: input.health,
    key: input.key, revision: input.revision, runId: input.runId, spawn: input.spawn,
  });
  steps.bundle = bundle;
  const bundleAttested = !!(bundle && bundle.ok && bundle.bundle && bundle.bundle.attested === true);
  if (!(bundle && bundle.ok)) gaps.push(`golden-path bundle incomplete: missing ${bundle && Array.isArray(bundle.missing) ? bundle.missing.join(", ") : "unknown"}.`);
  else if (!bundleAttested) gaps.push("golden-path bundle sealed but attested:false — a present-but-not-attested dimension (see bundle.bundle.reasons).");

  // STEP 4 — OSCAL-interop-shape export for downstream GRC/OSCAL tooling (emits NO satisfied/compliant status).
  const exported = EXP.exportPack(pack);
  steps.export = exported;
  const interopOk = !!(exported && exported.ok && EXP.isInteropExport(exported.export));
  if (!interopOk) gaps.push("evidence-pack export did not produce a valid interop shape.");

  // STEP 5 — composed verdict. ALWAYS evidence/readiness, NEVER conformity/certification.
  const verdict = VERDICT.PREPARED; // "prepared" regardless of gaps; gaps + ciGate carry the honest signal
  return {
    ok: true,
    schema: SCHEMA,
    verdict,
    basis: "EVIDENCE_PREP_NOT_CONFORMITY",
    ciGate,                 // 1 = policy violation (build should fail); 0 = clean/needs-review-only; 2 = audit unavailable (fail-closed)
    summary: {
      componentCount,
      packSbomComponents,
      policyClean,
      needsReview,
      bundleAttested,
      interopExport: interopOk,
      cveScan: "NOT_PERFORMED",
      gapCount: gaps.length,
    },
    gaps,
    interopExport: interopOk ? exported.export : null,
    steps,
    note: "Composed CRA/SBOM evidence run over REAL manifests: license-policy gate + CRA pack + sealed golden-path bundle + OSCAL-interop export. Technical EVIDENCE/READINESS only — NOT CRA conformity, NOT certification, NOT legal advice, NOT a CVE scan. ciGate=1 means a HIGH license finding should fail the build.",
  };
}

/**
 * verifyCraEvidence(result, opts) — re-verify the tamper-evident artifacts produced by runCraEvidence:
 * the sealed golden-path bundle (provenance) and the compliance pack's attestation. opts.key for a keyed seal;
 * opts.artifactBytes / opts.publicKeyPem for the pack's attestation. Fail-closed.
 */
function verifyCraEvidence(result: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  if (!isObj(result) || result.schema !== SCHEMA || !isObj(result.steps)) {
    return { ok: false, reason: "not a cra-evidence-demonstrator result", basis: "EVIDENCE_PREP_NOT_CONFORMITY" };
  }
  const checks: any = {};
  // bundle re-verification (tamper-evidence)
  const b = result.steps.bundle;
  checks.bundle = (b && b.ok && b.bundle) ? GP.verifyBundle(b.bundle, { key: o.key }) : { ok: false, reason: "no sealed bundle to verify" };
  // pack attestation re-verification
  const p = result.steps.pack;
  checks.pack = p ? CEP.verifyPack(p, { artifactBytes: o.artifactBytes, publicKeyPem: o.publicKeyPem }) : { ok: false, reason: "no pack to verify" };
  const ok = checks.bundle.ok === true && checks.pack.ok === true;
  return { ok, checks, basis: "EVIDENCE_PREP_NOT_CONFORMITY", note: "Re-verifies tamper-evidence of the sealed bundle + pack attestation. Verification of evidence integrity, NOT of CRA conformity." };
}

export { runCraEvidence, verifyCraEvidence, SCHEMA, VERDICT };
module.exports = { runCraEvidence, verifyCraEvidence, SCHEMA, VERDICT };
