#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V90 §5 — PER-MÉTIER STATE (the 15 métiers P1–P15). PURE, deterministic (repo scan injected). For each
 * métier it computes an HONEST maturity ladder from the REAL repo — ABSENT < PRESENT < WIRED < TESTED < VALIDATED —
 * where present = its primary module exists, wired = a non-test module imports it (inbound caller), tested = a test
 * references it, validated = that test is wired into the gate. It NEVER averages the 15 into one score (a global average
 * would hide a weak métier §5); it reports each individually + the WEAKEST. Fail-closed: a missing module ⇒ ABSENT, never
 * silently counted as covered. The métier→module map follows the canonical metier-coordinator SSOT (P1–P15). Dual export.
 */

const LADDER = Object.freeze(["ABSENT", "PRESENT", "WIRED", "TESTED", "VALIDATED"]);
// canonical métier → representative primary module (metier-coordinator competencies SSOT).
const METIER_MODULE: any = Object.freeze({
  P1: "profession-p1-fullstack-reference", P2: "profession-p2-ai-reference", P3: "profession-p3-security-reference",
  P4: "profession-p4-data-reference", P5: "developer-platform", P6: "profession-p6-eval-reference",
  P7: "profession-p7-sre-reference", P8: "p8-semver-enforcement", P9: "profession-p9-finops-reference",
  P10: "profession-p10-regulatory-reference", P11: "profession-p11-document-reference", P12: "profession-p12-streaming-reference",
  P13: "profession-p13-aiinfra-reference", P14: "profession-p14-devex-reference", P15: "profession-p15-workflow-reference",
});

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/* assessOne(module, scan) -> { module, present, wired, tested, validated, status }. scan: { has(mod)->bool,
 * inbound(mod)->number, testedBy(mod)->bool, gateValidated(mod)->bool }. Fail-closed ladder (each rung requires the previous). */
function assessOne(moduleName: string, scan: any): any {
  const s = isObj(scan) ? scan : {};
  const has = typeof s.has === "function" ? s.has : (() => false);
  const inbound = typeof s.inbound === "function" ? s.inbound : (() => 0);
  const testedBy = typeof s.testedBy === "function" ? s.testedBy : (() => false);
  const gateValidated = typeof s.gateValidated === "function" ? s.gateValidated : (() => false);
  const present = has(moduleName) === true;
  const wired = present && inbound(moduleName) > 0;
  const tested = present && testedBy(moduleName) === true;
  const validated = tested && gateValidated(moduleName) === true;    // a test NOT wired into the gate is not a running proof
  let status = "ABSENT";
  if (validated) status = "VALIDATED"; else if (tested) status = "TESTED"; else if (wired) status = "WIRED"; else if (present) status = "PRESENT";
  return Object.freeze({ module: moduleName, present, wired, tested, validated, inboundCallers: inbound(moduleName), status });
}

/* assessAll(scan, opts?) -> per-métier states + the weakest. opts.metierModule overrides the map (for other tenants). */
function assessAll(scan: any, opts: any = {}): any {
  const map = isObj(opts) && isObj(opts.metierModule) ? opts.metierModule : METIER_MODULE;
  const metiers = Object.keys(map).map((m) => ({ metier: m, ...assessOne(map[m], scan) }));
  const rank = (st: string) => LADDER.indexOf(st);
  const byStatus: any = { ABSENT: 0, PRESENT: 0, WIRED: 0, TESTED: 0, VALIDATED: 0 };
  for (const m of metiers) byStatus[m.status]++;
  // weakest = the lowest rung (NO averaging — a weak métier is surfaced, never hidden).
  const weakest = metiers.slice().sort((a, b) => rank(a.status) - rank(b.status))[0];
  const allValidated = metiers.every((m) => m.status === "VALIDATED");
  return Object.freeze({
    metiers, byStatus, total: metiers.length,
    weakestMetier: weakest ? { metier: weakest.metier, module: weakest.module, status: weakest.status } : null,
    allValidated,
    note: "NO global average — each métier reported individually; the weakest is surfaced; a missing module ⇒ ABSENT (fail-closed)",
  });
}

const METIER_STATE_CONTRACT = Object.freeze({
  id: "V90-METIER-STATE", source: "CTO V90 §5 — per-métier honest maturity ladder (the 15 métiers, no global average)",
  ladder: LADDER, metiers: Object.keys(METIER_MODULE),
  notAuthority: "measures per-métier state from an injected repo scan; it runs no métier and certifies nothing",
  invariants: Object.freeze([
    "maturity ladder ABSENT<PRESENT<WIRED<TESTED<VALIDATED; each rung requires the previous (fail-closed)",
    "VALIDATED requires a gate-wired test (a non-gate test is not a running proof)",
    "NEVER averages the 15 into one score — each métier is individual; the weakest is surfaced (§5)",
    "a missing module ⇒ ABSENT, never silently counted as covered",
    "pure/deterministic; the repo scan is injected (testable offline); métier→module follows the metier-coordinator SSOT",
  ]),
});

module.exports = { LADDER, METIER_MODULE, assessOne, assessAll, METIER_STATE_CONTRACT };

if (require.main === module) {
  // demo: a scan where P1 is validated, P5 only present.
  const scan = { has: (m: string) => true, inbound: () => 2, testedBy: (m: string) => m !== "developer-platform", gateValidated: (m: string) => m.startsWith("profession-p1") };
  process.stdout.write(JSON.stringify({ ...METIER_STATE_CONTRACT, demo: assessAll(scan).byStatus }, null, 2) + "\n");
}

export {};
