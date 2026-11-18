#!/usr/bin/env node
"use strict";
/* V301 — tests for odg-c6-certification-ingest (deny-by-default ingest of the owner's in-session 8-test evidence).
 * Asserts: runs nothing; certified ONLY with all 8 canonical tests passed+evidence AND all session-isolation markers;
 * any missing/failed test or unmet marker ⇒ BLOCKED; composes the harness 8 tests. */
const I = require("./odg-c6-certification-ingest.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const all8 = () => I.CANONICAL_NS.map((n: number) => ({ n, pass: true, evidence: `probe#${n}: real in-session output` }));
const goodSession = { netnsOnlyLo: true, canonicalInvisible: true, workWritable: true, noAnthropicKey: true };

function main() {
  check("composes the harness: exactly 8 canonical tests", I.CANONICAL_NS.length === 8 && JSON.stringify(I.CANONICAL_NS) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8]));

  // full genuine evidence ⇒ certified PASS.
  const ok = I.ingestCertification({ tests: all8(), session: goodSession });
  check("all 8 pass + evidence + session isolated ⇒ CERTIFIED, C6 PASS", ok.certified === true && ok.c6Status === "PASS" && ok.certifiedTests.length === 8 && ok.sessionIsolated === true);

  // deny-by-default: empty ⇒ BLOCKED.
  check("deny-by-default: empty results ⇒ NOT certified, C6 BLOCKED", I.ingestCertification({}).certified === false && I.ingestCertification({}).c6Status === "BLOCKED");

  // a single failing test ⇒ BLOCKED.
  const oneFail = all8(); oneFail[3] = { n: 4, pass: false, evidence: "claude invocation did not run" };
  check("any test not passed ⇒ BLOCKED (lists it)", (() => { const r = I.ingestCertification({ tests: oneFail, session: goodSession }); return r.certified === false && r.failedOrMissing.includes(4); })());

  // a missing test ⇒ BLOCKED.
  const missing = all8().filter((t: any) => t.n !== 5);
  check("a missing in-session result ⇒ BLOCKED", (() => { const r = I.ingestCertification({ tests: missing, session: goodSession }); return r.certified === false && r.failedOrMissing.includes(5); })());

  // a test passed but with NO evidence ⇒ BLOCKED (evidence required, no fabrication-by-flag).
  const noEvidence = all8(); noEvidence[0] = { n: 1, pass: true, evidence: "" };
  check("pass flag WITHOUT evidence ⇒ BLOCKED (no certification by flag alone)", I.ingestCertification({ tests: noEvidence, session: goodSession }).certified === false);

  // all 8 pass but session NOT isolated ⇒ BLOCKED (a host run cannot certify, even with 8 'passes').
  check("8 passes but session-isolation marker false ⇒ BLOCKED (host run ≠ in-session)", I.ingestCertification({ tests: all8(), session: { ...goodSession, netnsOnlyLo: false } }).certified === false && /real isolated session/.test(I.ingestCertification({ tests: all8(), session: { ...goodSession, netnsOnlyLo: false } }).remainingAction));
  check("missing session markers entirely ⇒ BLOCKED", I.ingestCertification({ tests: all8() }).certified === false);
  check("required session markers = netnsOnlyLo/canonicalInvisible/workWritable/noAnthropicKey", JSON.stringify(I.REQUIRED_SESSION_MARKERS) === JSON.stringify(["netnsOnlyLo", "canonicalInvisible", "workWritable", "noAnthropicKey"]));

  // remainingAction actionable when blocked; null when certified; determinism + frozen + contract.
  check("remainingAction null on PASS, actionable on BLOCK", ok.remainingAction === null && typeof I.ingestCertification({}).remainingAction === "string");
  check("deterministic + frozen", JSON.stringify(I.ingestCertification({ tests: all8(), session: goodSession })) === JSON.stringify(ok) && Object.isFrozen(ok) && Object.isFrozen(ok.perTest));
  check("contract: RUNS NOTHING + deny-by-default + all-8+markers + composes-harness + no-manual-status invariants", I.C6_CERTIFICATION_INGEST_CONTRACT.invariants.some((i: string) => /RUNS NOTHING/.test(i)) && I.C6_CERTIFICATION_INGEST_CONTRACT.invariants.some((i: string) => /deny-by-default/.test(i)) && I.C6_CERTIFICATION_INGEST_CONTRACT.invariants.some((i: string) => /no second certification source/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-c6-certification-ingest (V301: deny-by-default ingest of the owner's in-session 8-test evidence; certified ONLY with all 8 canonical tests passed+evidence AND real session-isolation markers; runs nothing, fabricates nothing; composes the harness; feeds C6 PASS → canonical gate)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
