#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P10 = require("./profession-p10-regulatory-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P10 — EU REGULATORY/ASSURANCE REFERENCE (E2/E3)");

// E2: declared activities ⇒ roles; a legitimate statement passes, an overclaim is refused; nothing presented as certified.
{
  const r = P10.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P10" && r.prep.roles.length >= 1 && r.prep.overclaimsRefused >= 1 && r.prep.certified === false && r.degraded === false, "E2: roles classified, >=1 overclaim refused, NOT_CERTIFIED, not degraded");
}

// E3: an overclaiming statement ⇒ REFUSED.
{
  const p = P10.buildEvidencePrep({ developsOrPlacesAiSystemUnderOwnName: true }, ["Our product is ISO 27001 certified."]);
  check(p.overclaimsRefused === 1 && p.statements[0].verdict.ok === false, "E3: 'ISO 27001 certified' claim ⇒ refused");
}

// deny-by-default: no declared activity ⇒ UNDETERMINED (no asserted obligation).
{
  const p = P10.buildEvidencePrep({}, []);
  check(p.undetermined === true && p.roles.length === 0, "deny-by-default: no activity ⇒ UNDETERMINED, no roles asserted");
}

// a legitimate factual statement must NOT be refused.
{
  const p = P10.buildEvidencePrep({ developsOrPlacesAiSystemUnderOwnName: true }, ["We documented ISO 27001-aligned controls and prepared evidence."]);
  check(p.overclaimsRefused === 0, "legitimate prep statement is NOT over-refused");
}

check(P10.P10_REGULATORY_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P10 REGULATORY REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
