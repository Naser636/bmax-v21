#!/usr/bin/env node
"use strict";
/* V135 seed D — GRANT / PERMISSION / OWNER-GATE MAP (the 4th canonical V135 governance component, completing A traceability,
 * B safety-fmea, C allowed/denied action tests). This is a PURE, deterministic, fail-closed CONSISTENCY VALIDATOR, not a new
 * registry: it cross-checks a proposed grant map against the ACTUAL canonical authority (local-work-mandate — the owner's
 * standing grant) so that a claimed grant the owner never gave CANNOT pass, and a Level-C action can never be marked granted.
 *
 * buildGrantMap({ granted, ownerGated, levelCDenied, riskGates }, mandate) -> frozen map + violations. mandate is the
 * local-work-mandate module (injected, not hardcoded — the provider cannot widen authority). Rules (every one fail-closed):
 *   - granted[]      : each string MUST be permitted by mandate.permits(cap).permitted===true  (else GRANT_NOT_BACKED).
 *   - levelCDenied[] : each string MUST classify as "C" AND MUST NOT be permitted                (else LEVELC_LEAK — critical).
 *   - ownerGated[]   : each {id, unblocks, requiredOwnerAction, provenance} all non-empty        (else OWNERGATE_INCOMPLETE).
 *   - riskGates[]    : each {mode, residualRisk in MEDIUM/HIGH/CRITICAL, acceptance:"REQUIRED"}  (else RISKGATE_MALFORMED).
 * ok === (violations.length === 0). Malformed input ⇒ ok=false (never throws). Output Object.frozen + deterministic. */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyStrOrList(v: any): boolean { return nonEmptyStr(v) || (Array.isArray(v) && v.length > 0 && v.every(nonEmptyStr)); }
const RESIDUAL_RISK = Object.freeze(["MEDIUM", "HIGH", "CRITICAL"]);

function buildGrantMap(map: any, mandate: any): any {
  const violations: Array<{ code: string; item: string; detail: string }> = [];
  // Fail-closed on a non-object map: a null/garbage input must never pass vacuously.
  if (!isObj(map)) violations.push({ code: "MAP_MALFORMED", item: String(map), detail: "grant map is not an object — cannot validate (fail-closed)" });
  const m = isObj(map) ? map : {};
  // A present-but-wrong-TYPE field is malformed input, not an empty section — flag it so it cannot pass vacuously (fail-closed),
  // matching the module invariant "malformed input ⇒ ok=false". Absent (undefined) fields are a legitimately-empty section.
  for (const f of ["granted", "ownerGated", "levelCDenied", "riskGates"]) {
    if (m[f] !== undefined && !Array.isArray(m[f])) violations.push({ code: "MAP_MALFORMED", item: f, detail: "field '" + f + "' is present but not an array — malformed (fail-closed)" });
  }
  const granted = Array.isArray(m.granted) ? m.granted : [];
  const ownerGated = Array.isArray(m.ownerGated) ? m.ownerGated : [];
  const levelCDenied = Array.isArray(m.levelCDenied) ? m.levelCDenied : [];
  const riskGates = Array.isArray(m.riskGates) ? m.riskGates : [];
  const hasPermits = isObj(mandate) && typeof mandate.permits === "function";
  const hasClassify = isObj(mandate) && typeof mandate.classifyAction === "function";
  if (!hasPermits || !hasClassify) violations.push({ code: "NO_AUTHORITY_SOURCE", item: "mandate", detail: "local-work-mandate (permits + classifyAction) not provided — cannot verify any grant (fail-closed)" });

  // granted: every claimed permission MUST be backed by the owner's mandate — a grant ODG asserts for itself cannot pass.
  for (const cap of granted) {
    if (!nonEmptyStr(cap)) { violations.push({ code: "GRANT_MALFORMED", item: String(cap), detail: "granted entry is not a non-empty string" }); continue; }
    if (hasPermits && mandate.permits(cap).permitted !== true) violations.push({ code: "GRANT_NOT_BACKED", item: cap, detail: "claimed grant is NOT permitted by the owner's standing mandate (would be self-authorization)" });
  }
  // levelCDenied: every entry MUST be a Level-C action AND MUST NOT be permitted — a Level-C leak is the critical failure.
  for (const act of levelCDenied) {
    if (!nonEmptyStr(act)) { violations.push({ code: "LEVELC_MALFORMED", item: String(act), detail: "levelCDenied entry is not a non-empty string" }); continue; }
    if (hasClassify && mandate.classifyAction(act) !== "C") violations.push({ code: "LEVELC_MISCLASSIFIED", item: act, detail: "listed as Level-C-denied but does not classify as C in the mandate" });
    if (hasPermits && mandate.permits(act).permitted === true) violations.push({ code: "LEVELC_LEAK", item: act, detail: "a Level-C action is permitted by the grant map — owner authority bypass (critical)" });
  }
  // ownerGated: each owner-gate must carry what, why, the required owner action, and provenance — no bare gate.
  for (const g of ownerGated) {
    const id = isObj(g) && nonEmptyStr(g.id) ? g.id : "(unnamed)";
    if (!isObj(g) || !nonEmptyStr(g.id) || !nonEmptyStrOrList(g.unblocks) || !nonEmptyStr(g.requiredOwnerAction) || !nonEmptyStr(g.provenance))
      violations.push({ code: "OWNERGATE_INCOMPLETE", item: id, detail: "owner-gate missing id / unblocks / requiredOwnerAction / provenance" });
  }
  // riskGates: FMEA residuals that REQUIRE owner acceptance — each must name the mode, a MEDIUM+ residual, acceptance REQUIRED.
  for (const r of riskGates) {
    const mode = isObj(r) && nonEmptyStr(r.mode) ? r.mode : "(unnamed)";
    if (!isObj(r) || !nonEmptyStr(r.mode) || !RESIDUAL_RISK.includes(r.residualRisk) || r.acceptance !== "REQUIRED")
      violations.push({ code: "RISKGATE_MALFORMED", item: mode, detail: "risk-gate missing mode / MEDIUM+ residualRisk / acceptance:'REQUIRED'" });
  }

  const ok = violations.length === 0;
  return Object.freeze({
    ok,
    counts: Object.freeze({ granted: granted.length, ownerGated: ownerGated.length, levelCDenied: levelCDenied.length, riskGates: riskGates.length, violations: violations.length }),
    granted: Object.freeze([...granted]),
    ownerGated: Object.freeze(ownerGated.map((g: any) => Object.freeze({ ...g }))),
    levelCDenied: Object.freeze([...levelCDenied]),
    riskGates: Object.freeze(riskGates.map((r: any) => Object.freeze({ ...r }))),
    violations: Object.freeze(violations.map((v) => Object.freeze(v))),
    invariant: "a grant is valid only if the owner's standing mandate backs it; Level-C never granted; every owner-gate carries provenance + required owner action; FMEA MEDIUM+ residuals require explicit owner acceptance (fail-closed).",
  });
}

const GRANT_PERMISSION_MAP_CONTRACT = Object.freeze({
  id: "V135-GRANT-OWNERGATE-MAP",
  purpose: "Cross-check a grant/permission/owner-gate map against the canonical owner authority (local-work-mandate) — fail-closed.",
  reuses: ["local-work-mandate (permits + classifyAction — the owner's standing grant)", "safety-fmea residuals (risk-gates)", "CAPABILITY_GAP_REGISTER_V1 OG-01..OG-08 (owner-gated frontier)"],
  notARegistry: "it does not create authority or a parallel registry; it validates a map against the authority ODG already has.",
});

module.exports = { buildGrantMap, GRANT_PERMISSION_MAP_CONTRACT, RESIDUAL_RISK };
export {};
