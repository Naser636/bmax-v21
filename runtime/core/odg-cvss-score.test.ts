#!/usr/bin/env node
"use strict";
/* Tests for odg-cvss-score (CVSS v3.1 base score). PURE. Vectors below have PUBLISHED scores (FIRST.org examples / CVEs). */
const C = require("./odg-cvss-score.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function score(v: string): any { return C.baseScore(v); }

function main(): void {
  // Canonical published scores
  check("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H ⇒ 9.8 CRITICAL", (() => { const r = score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"); return r.baseScore === 9.8 && r.severity === "CRITICAL"; })());
  check("AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H ⇒ 7.5 HIGH", (() => { const r = score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"); return r.baseScore === 7.5 && r.severity === "HIGH"; })());
  check("reflected XSS AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N ⇒ 6.1 MEDIUM", (() => { const r = score("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"); return r.baseScore === 6.1 && r.severity === "MEDIUM" && r.scope === "CHANGED"; })());
  check("scope-changed full impact ...S:C/C:H/I:H/A:H ⇒ 10.0 CRITICAL", (() => { const r = score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"); return r.baseScore === 10.0 && r.severity === "CRITICAL"; })());
  check("no impact AV:N/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N ⇒ 0.0 NONE", (() => { const r = score("CVSS:3.1/AV:N/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N"); return r.baseScore === 0 && r.severity === "NONE"; })());
  check("local low AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N ⇒ 3.3 LOW", (() => { const r = score("CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N"); return r.baseScore === 3.3 && r.severity === "LOW"; })());
  check("Heartbleed-like AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N ⇒ 7.5 HIGH", score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N").baseScore === 7.5);

  // scope changed vs unchanged: PR weight differs (PR:L is 0.68 when S:C, 0.62 when S:U) — same other metrics ⇒ different score
  check("scope changes PR weight (S:C scores ≥ S:U for same PR:L)", score("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:L/I:L/A:L").baseScore >= score("CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:L/A:L").baseScore);

  // sub-scores exposed + scope label
  const r98 = score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
  check("exposes impactSubScore/impact/exploitability + UNCHANGED scope", r98.impactSubScore > 0.91 && r98.impactSubScore < 0.92 && r98.scope === "UNCHANGED" && r98.exploitability > 3.8 && r98.exploitability < 3.9);

  // roundup is the EXACT v3.1 integer-domain function (the classic correctness trap)
  check("roundup exact: 4.00001 ⇒ 4.1 (ceil to one decimal, spec)", C.roundup(4.00001) === 4.1);
  check("roundup exact: 4.0 ⇒ 4.0 (already one-decimal)", C.roundup(4.0) === 4.0);
  check("roundup exact: 6.0070 ⇒ 6.1", C.roundup(6.007) === 6.1);
  check("roundup exact: 10 ⇒ 10.0", C.roundup(10) === 10.0);

  // severity bands
  check("severity bands", C.severityOf(0) === "NONE" && C.severityOf(3.9) === "LOW" && C.severityOf(4.0) === "MEDIUM" && C.severityOf(6.9) === "MEDIUM" && C.severityOf(7.0) === "HIGH" && C.severityOf(8.9) === "HIGH" && C.severityOf(9.0) === "CRITICAL" && C.severityOf(10) === "CRITICAL");

  // fail-closed / honesty
  check("no vector ⇒ NO_VECTOR", C.baseScore(null).code === "NO_VECTOR");
  check("missing metric (no A) ⇒ MISSING_METRIC", C.baseScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H").code === "MISSING_METRIC");
  check("bad metric value (AV:X) ⇒ BAD_METRIC_VALUE", C.baseScore("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").code === "BAD_METRIC_VALUE");
  check("no version ⇒ NO_VERSION", C.baseScore("AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").code === "NO_VERSION");
  check("v3.0 REFUSED (not mis-scored) ⇒ UNSUPPORTED_VERSION", C.baseScore("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").code === "UNSUPPORTED_VERSION");
  check("bad token ⇒ BAD_TOKEN", C.baseScore("CVSS:3.1/AVN/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H").code === "BAD_TOKEN");

  // determinism + frozen + contract
  check("deterministic", JSON.stringify(score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")) === JSON.stringify(r98));
  check("frozen", Object.isFrozen(r98) && Object.isFrozen(r98.metrics));
  check("note: base only, not temporal/environmental, not a vulnerability claim", /NOT a Temporal\/Environmental/.test(r98.note) && /NOT a claim the system is actually vulnerable/.test(r98.note));
  check("contract: base-only, exact roundup, v3.1-only, not-a-vuln-claim",
    C.CVSS_SCORE_CONTRACT.invariants.some((s: string) => /BASE score ONLY/.test(s)) &&
    C.CVSS_SCORE_CONTRACT.invariants.some((s: string) => /Roundup follows the CVSS v3.1 spec EXACTLY/.test(s)) &&
    C.CVSS_SCORE_CONTRACT.invariants.some((s: string) => /v3.1 ONLY/.test(s)) &&
    C.CVSS_SCORE_CONTRACT.invariants.some((s: string) => /NOT a claim the system is actually vulnerable/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-cvss-score (CVSS v3.1 base: published vectors 9.8/7.5/6.1/10.0/0.0/3.3 exact; spec-exact integer roundup; scope-dependent PR + impact; v3.1-only fail-closed; base-only, not a vulnerability claim; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
