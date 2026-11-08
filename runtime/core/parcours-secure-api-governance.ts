#!/usr/bin/env node
"use strict";

/*
 * WI-INT-34 — INTER-MÉTIER PARCOURS: P3 → P8 → P15 → P6. PURE, deterministic. Integrates P3 (security/license
 * gate, REUSES license-policy) and P8 (API-contract validation) into a GOVERNED P15 workflow whose result is
 * judged by P6 (quality-harness). A security violation or an API incompatibility BLOCKS the workflow (fail-
 * closed). Synthetic inputs; no external vulnerability scanner or connector is claimed. Both P3 and P8 are
 * genuinely CONSUMED in one validated inter-métier parcours. Dual export.
 */

const LP = require("./license-policy");
const WF = require("./workflow-engine");
const QH = require("./quality-harness");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const DENIED_LICENSES = Object.freeze(["GPL-3.0", "GPL-2.0", "AGPL-3.0", "SSPL-1.0"]); // copyleft/denied (synthetic policy)

// P3: security/license gate over a declared dependency list (reuses license-policy for classification).
function securityGate(deps: any): any {
  const violations: any[] = [];
  for (const d of arr(deps)) {
    if (!isObj(d) || typeof d.name !== "string") continue;
    const lic = typeof d.license === "string" ? d.license : "";
    let copyleft = DENIED_LICENSES.includes(lic);
    try { const c = LP.classifyLicense(lic); if (JSON.stringify(c).toLowerCase().indexOf("copyleft") >= 0) copyleft = true; } catch (e) { /* classification best-effort */ }
    if (copyleft) violations.push({ dep: d.name, license: lic, rule: "copyleft/denied license" });
  }
  return Object.freeze({ ok: violations.length === 0, violations: Object.freeze(violations) });
}

// P8: API-contract validation of an exchange against a declared contract (version + required in/out fields).
function validateApiExchange(contract: any, exchange: any): any {
  const c = isObj(contract) ? contract : {}; const e = isObj(exchange) ? exchange : {};
  const errors: string[] = [];
  if (typeof c.version === "string" && e.version !== c.version) errors.push(`version mismatch: contract ${c.version} != exchange ${e.version}`);
  const inObj = isObj(e.in) ? e.in : {};
  for (const f of arr(c.requiredIn).filter((x: any) => typeof x === "string")) if (!(f in inObj) || inObj[f] === undefined || inObj[f] === null) errors.push(`missing input field '${f}'`);
  const outObj = isObj(e.out) ? e.out : {};
  for (const f of arr(c.requiredOut).filter((x: any) => typeof x === "string")) if (!(f in outObj) || outObj[f] === undefined || outObj[f] === null) errors.push(`missing output field '${f}'`);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors.sort()) });
}

/** runSecureApiGovernance(input) -> report. input: { deps, contract, exchange }. */
function runSecureApiGovernance(input: any): any {
  const i = isObj(input) ? input : {};
  const sec = securityGate(i.deps);                 // P3
  const api = validateApiExchange(i.contract, i.exchange); // P8
  // P15 governed workflow: security → api → integrate; a failed gate blocks the chain (fail-closed)
  const inject: any = {};
  if (!sec.ok) inject.security = "error";
  if (!api.ok) inject.api = "error";
  const run = WF.runProcess({ id: "secure-api", steps: [{ id: "security" }, { id: "api", deps: ["security"] }, { id: "integrate", deps: ["api"] }] }, { inject });
  // P6 quality over the composed result
  const testResults: any = { "p3.security": sec.ok ? "pass" : "fail", "p8.api": api.ok ? "pass" : "fail", "p15.workflow": run.status === "COMPLETED" ? "pass" : "fail" };
  const keys = Object.keys(testResults);
  const p6 = QH.qualityReport({ testResults, requiredTests: keys, ranTests: keys });
  const verdict = (sec.ok && api.ok && run.status === "COMPLETED") ? "READY" : "BLOCKED";
  return Object.freeze({
    verdict,
    p3: Object.freeze({ ok: sec.ok, violations: sec.violations }),
    p8: Object.freeze({ ok: api.ok, errors: api.errors }),
    p15: Object.freeze({ status: run.status, evidence: run.evidence || Object.freeze([]) }),
    p6: p6.verdict,
  });
}

const PARCOURS_SECURE_API_CONTRACT = Object.freeze({
  id: "WI-INT-34-SECURE-API-GOVERNANCE",
  source: "Inter-métier P3 (license/security gate, reuses license-policy) → P8 (API-contract validation) → P15 workflow → P6 quality",
  notAuthority: "pure composition over synthetic inputs; no external vulnerability scanner/connector claimed; reuses license-policy",
  invariants: Object.freeze([
    "pure/deterministic: deps+contract+exchange in → governed report out",
    "P3 blocks on a copyleft/denied license; P8 blocks on version mismatch / missing required field",
    "a P3 or P8 failure injects a workflow error ⇒ the governed workflow BLOCKS (fail-closed) ⇒ verdict BLOCKED",
    "P3 and P8 are both consumed in one validated inter-métier parcours; honest synthetic scope",
  ]),
});

module.exports = { PARCOURS_SECURE_API_CONTRACT, securityGate, validateApiExchange, runSecureApiGovernance };

if (require.main === module) { process.stdout.write(JSON.stringify(PARCOURS_SECURE_API_CONTRACT, null, 2) + "\n"); }

export {};
