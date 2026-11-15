#!/usr/bin/env node
"use strict";
/*
 * IMP-P3-SSDF-SLSA (V189-A contract, owner-authorized block) — P3 Supply-chain: a crosswalk of NIST SSDF (SP 800-218)
 * practice groups → REAL ODG controls or an honest GAP, plus an SLSA build-track tier assessed ONLY from supplied
 * evidence. PURE, deterministic. Fail-closed: a practice with no mapped control ⇒ GAP; an SLSA tier is claimed only when
 * its evidence is present — higher tiers are NEVER claimed by omission.
 *
 * Acceptance (contract): each SSDF practice maps to a REAL control or honest GAP; SLSA tier claimed only with evidence;
 * higher tiers NOT claimed.
 */

// SSDF practice groups (SP 800-218) → the ODG control that realizes them (or null ⇒ GAP). Mappings are to EXISTING modules.
const SSDF_MAP = Object.freeze([
  { group: "PO", name: "Prepare the Organization", control: "governance-path-write-guard + sovereign-delegation (authority boundaries, deny-by-default)" },
  { group: "PS", name: "Protect the Software", control: "audit-integrity-analysis (keyed-HMAC + tip-anchor tamper-evidence) + evidence-provenance (sha256)" },
  { group: "PW", name: "Produce Well-Secured Software", control: "closed-executor (no eval/new Function) + patch-executor write-confinement + multi-ecosystem SBOM" },
  { group: "RV", name: "Respond to Vulnerabilities", control: "cra-remediation-engine (no invented CVE) + owasp-agentic-matrix" },
]);

// SLSA build track L0..L3 — each level's evidence requirement. A level is MET only if its evidence flag is true.
const SLSA_LEVELS = Object.freeze([
  { level: 1, requires: "provenance", label: "provenance exists (build process documented)" },
  { level: 2, requires: "signedProvenance", label: "signed provenance from a hosted build service" },
  { level: 3, requires: "hardenedBuilder", label: "hardened, isolated build platform (non-falsifiable provenance)" },
]);

function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* crosswalk({controlsPresent, slsaEvidence}) -> SSDF mapping + SLSA tier. controlsPresent: {PO,PS,PW,RV:boolean}
 * (does ODG actually have the control operational?); slsaEvidence: {provenance,signedProvenance,hardenedBuilder:bool}. */
function crosswalk(input: any): any {
  const i = input && typeof input === "object" ? input : {};
  const present = i.controlsPresent && typeof i.controlsPresent === "object" ? i.controlsPresent : {};
  const ssdf = SSDF_MAP.map((m: any) => Object.freeze({
    group: m.group, name: m.name, control: m.control,
    status: present[m.group] === true ? "MAPPED_REAL_CONTROL" : "GAP",
    note: present[m.group] === true ? "control operational" : "control named but not confirmed operational ⇒ honest GAP (not claimed satisfied)",
  }));

  // SLSA: walk levels in order; stop at the first whose evidence is absent — higher levels are NOT claimed.
  const ev = i.slsaEvidence && typeof i.slsaEvidence === "object" ? i.slsaEvidence : {};
  let attained = 0; const ladder: any[] = [];
  for (const L of SLSA_LEVELS) {
    const met = ev[L.requires] === true;
    ladder.push({ level: L.level, requires: L.requires, met, label: L.label });
    if (met && attained === L.level - 1) attained = L.level; // only contiguous from L1
  }
  const slsa = Object.freeze({ attainedLevel: attained, ladder: Object.freeze(ladder), note: attained === 0 ? "SLSA L0 — no provenance evidence supplied; NO higher tier claimed" : `SLSA L${attained} claimed ONLY on supplied evidence; higher tiers NOT claimed by omission` });

  const gaps = ssdf.filter((s: any) => s.status === "GAP").map((s: any) => s.group);
  return Object.freeze({
    metier: "P3", ssdf: Object.freeze(ssdf), slsa, gaps: Object.freeze(gaps),
    honesty: "each SSDF group maps to a NAMED real control or an honest GAP (named ≠ operational unless confirmed); the SLSA tier is attained ONLY from supplied evidence — higher tiers are never claimed by omission.",
  });
}

const SSDF_SLSA_CROSSWALK_CONTRACT = Object.freeze({
  id: "IMP-P3-SSDF-SLSA",
  purpose: "P3 — SSDF practice→real-control-or-GAP crosswalk + evidence-gated SLSA tier",
  invariants: Object.freeze([
    "each SSDF group maps to a REAL control or an honest GAP (not claimed satisfied by omission)",
    "SLSA tier claimed ONLY with supplied evidence; higher tiers NEVER claimed by omission (contiguous from L1)",
    "deterministic; read-only; no new engine; mappings point at EXISTING modules",
  ]),
});

module.exports = { SSDF_MAP, SLSA_LEVELS, crosswalk, SSDF_SLSA_CROSSWALK_CONTRACT };
export {};
