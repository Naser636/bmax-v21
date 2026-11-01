#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves charter-record (G-02): seal a tamper-evident charter binding a verdict
// to its probe/method/ground-truth, normalizing BOTH engine shapes (mechanical-acceptance + reality-gate),
// fail-closed and honest — INVALID_CHARTER on missing subject/method/unrecognized-verdict, grounded:false
// recorded EXPLICITLY when no oracle is declared (never a fabricated verified-against-truth), the verdict is
// NEVER mutated/upgraded, and a tampered seal is caught. Pure/deterministic (hermetic revision injected).
"use strict";
const assert = require("assert");
const C = require("./charter-record.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const REV = { commit: "test0000", treeDirty: false, available: true };

// (1) FAIL-CLOSED: missing subject / method / unrecognized verdict ⇒ INVALID_CHARTER.
{
  ok("missing subject ⇒ INVALID_CHARTER", C.makeCharter({ method: "m", verdict: { verdict: "ACCEPT" }, revision: REV }).code === "INVALID_CHARTER");
  ok("missing method ⇒ INVALID_CHARTER", C.makeCharter({ subject: "s", verdict: { verdict: "ACCEPT" }, revision: REV }).code === "INVALID_CHARTER");
  ok("unrecognized verdict shape ⇒ INVALID_CHARTER (never coerced to a pass)",
     C.makeCharter({ subject: "s", method: "m", verdict: { foo: 1 }, revision: REV }).code === "INVALID_CHARTER");
  ok("verdict with a non-member verdict string ⇒ INVALID_CHARTER", C.makeCharter({ subject: "s", method: "m", verdict: { verdict: "MAYBE" }, revision: REV }).code === "INVALID_CHARTER");
}

// (2) mechanical-acceptance verdict normalized; reasons collected from rejections/blocks/unknowns/proofs.
{
  const ma = { verdict: "REJECT", rejections: ["out-of-scope diff"], blocks: [], unknowns: [], proofs: ["build green"] };
  const r = C.makeCharter({ subject: "mission-1", method: "mechanical-acceptance", groundTruth: { source: "acceptanceCriteria[]", independent: false }, verdict: ma, revision: REV });
  ok("mechanical-acceptance ⇒ engine tagged, outcome REJECT, reasons include REJECT: and PROOF:",
     r.ok && r.charter.verdict.engine === "mechanical-acceptance" && r.charter.verdict.outcome === "REJECT" &&
     r.charter.verdict.reasons.some((x) => /^REJECT: /.test(x)) && r.charter.verdict.reasons.some((x) => /^PROOF: /.test(x)));
  ok("grounded:true when a ground-truth source is declared", r.charter.grounded === true && r.charter.groundTruth.source === "acceptanceCriteria[]");
}

// (3) reality-gate GateResult and classify() shapes both normalize to engine=reality-gate.
{
  const gr = { granted: true, awarded: "TEST_VERIFIED", requested: "TEST_VERIFIED", reasons: ["all required rungs evidenced"], blocked: false };
  const a = C.makeCharter({ subject: "m", method: { probe: "gate" }, verdict: gr, revision: REV });
  ok("GateResult ⇒ engine reality-gate, outcome TEST_VERIFIED, granted carried", a.ok && a.charter.verdict.engine === "reality-gate" && a.charter.verdict.outcome === "TEST_VERIFIED" && a.charter.verdict.granted === true);
  const cl = { state: "NOT_VERIFIED", reasons: ["no verification state evidenced"] };
  const b = C.makeCharter({ subject: "m", method: "classify", verdict: cl, revision: REV });
  ok("classify() ⇒ engine reality-gate, outcome NOT_VERIFIED", b.ok && b.charter.verdict.engine === "reality-gate" && b.charter.verdict.outcome === "NOT_VERIFIED");
}

// (4) HONESTY: no ground truth ⇒ grounded:false recorded EXPLICITLY (never a fabricated verified-against-truth).
{
  const r = C.makeCharter({ subject: "m", method: "ad-hoc", verdict: { verdict: "ACCEPT" }, revision: REV });
  ok("no groundTruth ⇒ ok but grounded:false, groundTruth:null, note says ungrounded (not verified-against-truth)",
     r.ok && r.charter.grounded === false && r.charter.groundTruth === null && /ungrounded/.test(r.note));
  const bad = C.makeCharter({ subject: "m", method: "x", groundTruth: { independent: true }, verdict: { verdict: "ACCEPT" }, revision: REV });
  ok("groundTruth present without a source ⇒ INVALID_CHARTER", bad.code === "INVALID_CHARTER");
}

// (5) the charter NEVER mutates or upgrades the verdict (REJECT stays REJECT).
{
  const r = C.makeCharter({ subject: "m", method: "x", verdict: { verdict: "REJECT", rejections: ["x"] }, revision: REV });
  ok("verdict outcome preserved verbatim (no upgrade)", r.charter.verdict.outcome === "REJECT");
}

// (6) TAMPER-EVIDENCE: altering a sealed charter ⇒ verifyCharter fails; intact ⇒ ok.
{
  const r = C.makeCharter({ subject: "m", method: "x", groundTruth: { source: "corpus" }, verdict: { verdict: "ACCEPT", proofs: ["p"] }, revision: REV });
  ok("intact charter verifies", C.verifyCharter(r.charter).ok === true);
  const tampered = JSON.parse(JSON.stringify(r.charter));
  tampered.verdict.outcome = "REJECT"; // flip the recorded verdict after sealing
  ok("altered sealed charter ⇒ verifyCharter fails (tamper detected)", C.verifyCharter(tampered).ok === false);
  const notCharter = C.verifyCharter({ provenance: r.charter.provenance, schema: "other" });
  ok("non-charter object ⇒ verify fails", notCharter.ok === false);
}

// (7) DETERMINISM + keyed seal: identical inputs+revision ⇒ identical digest; keyed stamp needs the key to verify.
{
  const base = { subject: "m", method: "x", groundTruth: { source: "s" }, verdict: { verdict: "ACCEPT" }, revision: REV };
  const a = C.makeCharter(base); const b = C.makeCharter(base);
  ok("deterministic seal: identical inputs+revision ⇒ identical contentSha256", a.charter.provenance.contentSha256 === b.charter.provenance.contentSha256);
  const keyed = C.makeCharter({ ...base, key: "SECRET" });
  ok("keyed charter verifies WITH key, fails WITHOUT key (fail-closed)",
     C.verifyCharter(keyed.charter, { key: "SECRET" }).ok === true && C.verifyCharter(keyed.charter).ok === false);
}

console.log(`\ncharter-record: ${pass} assertions passed`);
