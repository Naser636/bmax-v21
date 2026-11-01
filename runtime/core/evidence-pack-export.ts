#!/usr/bin/env node
/**
 * evidence-pack-export — emit a compliance-evidence-pack in a documented, stable, MACHINE-READABLE shape that
 * an external OSCAL / GRC tool can consume (an OSCAL assessment-results-LIKE structure: observations +
 * findings). CAPABILITY_GAP_REGISTER_V1.md G-08 (P3; D09 interop).
 *
 * HONEST SCOPE: this is an **OSCAL-INTEROP SHAPE**, NOT a schema-validated OSCAL document and NOT OSCAL-native
 * (`oscalNative:false`). Critically, it emits NO "satisfied" / "compliant" status — the source pack asserts
 * technical EVIDENCE/READINESS, not conformity, so the export preserves that: statuses are drawn only from
 * {OBSERVED, GAP, NOT_ASSESSED, INFO, REMEDIATION}. It NEVER upgrades a gap or a NOT_ASSESSED into a pass, and
 * carries the pack's disclaimer verbatim.
 *
 * MAPPING (compliance-evidence-pack → interop shape):
 *   - gaps[]            → findings, status GAP (not-satisfied)
 *   - results[] with "NOT_ASSESSED" → findings, status NOT_ASSESSED; other results[] → observations (OBSERVED)
 *   - facts[]           → notes, kind INFO (sourced context)
 *   - recommendations[] → notes, kind REMEDIATION (advisory)
 *   - subject           → { repoName, sourceCommit, sbomComponents, provenanceSigned }
 *
 * FAIL-CLOSED: a non-pack input (wrong/absent `_type`, or missing the required arrays) ⇒ INVALID_PACK (never
 * a hollow export). ADDITIVE (does NOT modify compliance-evidence-pack). PURE (no fs/net/clock). NO new
 * primitive. Dual export (ESM + CJS).
 */
"use strict";

const SCHEMA = "odg.evidence-pack-export.v1";
const PACK_TYPE = "odg/compliance-evidence-pack/v1";
const STATUSES = Object.freeze(["OBSERVED", "GAP", "NOT_ASSESSED", "INFO", "REMEDIATION"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function strArr(v: any): string[] { return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; }

function exportPack(pack: any): any {
  if (!isObj(pack) || pack._type !== PACK_TYPE || !Array.isArray(pack.results) || !Array.isArray(pack.gaps)) {
    return { ok: false, code: "INVALID_PACK", reason: `a compliance-evidence-pack ({ _type: "${PACK_TYPE}", results[], gaps[] }) is required` };
  }
  const observations: any[] = [];
  const findings: any[] = [];
  const notes: any[] = [];

  strArr(pack.results).forEach((r, i) => {
    if (/NOT_ASSESSED/.test(r)) findings.push({ id: `R${i + 1}`, status: "NOT_ASSESSED", title: r.split(":")[0] || "result", detail: r });
    else observations.push({ id: `O${i + 1}`, status: "OBSERVED", detail: r });
  });
  strArr(pack.gaps).forEach((g, i) => findings.push({ id: `G${i + 1}`, status: "GAP", title: g.split(/[—-]/)[0].trim() || "gap", detail: g }));
  strArr(pack.facts).forEach((f, i) => notes.push({ id: `F${i + 1}`, kind: "INFO", detail: f }));
  strArr(pack.recommendations).forEach((rec, i) => notes.push({ id: `REC${i + 1}`, kind: "REMEDIATION", detail: rec }));

  const subject = {
    repoName: pack.repoName || null,
    sourceCommit: pack.sourceCommit || null,
    sbomComponents: isObj(pack.sbom) && Array.isArray(pack.sbom.components) ? pack.sbom.components.length : null,
    provenanceSigned: pack.signature != null,
  };

  // Honesty invariant check (belt-and-braces): assert no emitted status is a satisfied/compliant pass.
  const emitted = [...observations, ...findings].map((x) => x.status);
  const illegal = emitted.filter((s) => !STATUSES.includes(s) || /SATISF|COMPLIAN|PASS|CERT/i.test(s));

  return {
    ok: true,
    export: {
      schema: SCHEMA,
      format: "OSCAL-INTEROP-SHAPE",
      oscalNative: false,
      note: "OSCAL assessment-results-LIKE shape for downstream GRC/OSCAL tooling; NOT a schema-validated OSCAL document. No 'satisfied/compliant' status is emitted — the source asserts evidence/readiness, not conformity.",
      subject,
      statusesUsed: Array.from(new Set(emitted)),
      observations,
      findings,
      notes,
      counts: { observations: observations.length, findings: findings.length, gaps: findings.filter((f) => f.status === "GAP").length, notAssessed: findings.filter((f) => f.status === "NOT_ASSESSED").length, notes: notes.length },
      disclaimer: typeof pack.disclaimer === "string" ? pack.disclaimer : null,
      illegalStatuses: illegal, // MUST be empty — present only so a regression surfaces loudly
    },
  };
}

// Minimal structural validity check for the interop export (deny-by-default).
function isInteropExport(x: any): boolean {
  return isObj(x) && x.schema === SCHEMA && x.oscalNative === false && Array.isArray(x.observations) && Array.isArray(x.findings) && Array.isArray(x.notes) &&
    Array.isArray(x.illegalStatuses) && x.illegalStatuses.length === 0 &&
    [...x.observations, ...x.findings].every((e: any) => isObj(e) && STATUSES.includes(e.status));
}

export { exportPack, isInteropExport, STATUSES, SCHEMA, PACK_TYPE };
module.exports = { exportPack, isInteropExport, STATUSES, SCHEMA, PACK_TYPE };

if (require.main === module) {
  const C = require("./compliance-evidence-pack.js");
  const pack = C.buildEvidencePack({ repoName: "demo", lockPackages: { "left-pad": "2.0.0" }, artifactName: "a", artifactBytes: "x" });
  const res = exportPack(pack);
  process.stdout.write(JSON.stringify({ ok: res.ok, counts: res.export.counts, oscalNative: res.export.oscalNative, valid: isInteropExport(res.export) }, null, 2) + "\n");
}
