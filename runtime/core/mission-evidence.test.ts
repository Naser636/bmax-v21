#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Adversarial (counter-evidence) proof for the false-success gate: a plausible output
// NEVER masks a non-zero exit code, a missing artifact, or absent/contradictory verification; the record is tamper-
// evident; and the gate is wired OPT-IN into the real campaign loop so a FAILING proof cannot produce a terminal
// ACCEPTED (while a PASSING proof, and the legacy no-proof path, still accept). Pure/deterministic.
"use strict";
const assert = require("assert");
const E = require("./mission-evidence.js");
const L = require("./campaign-loop.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const okAttempt = { command: "node --check x.js", exitCode: 0 };
const cleanProof = (over) => E.buildEvidenceRecord({ mission: { id: "m" }, authorization: { authorized: true, scope: ["x.js"] }, attempts: [okAttempt], artifacts: [{ path: "x.js", sha256: "abc" }], verification: { verified: true, by: "ci", method: "check" }, transition: { to: "ACCEPTED", reason: "ok" }, ...over }, { at: "2026-10-29T00:00:00Z" });

// (1) clean ACCEPTED proof ⇒ acceptable, tamper-evident.
{
  const r = cleanProof();
  ok("clean ACCEPTED proof ⇒ acceptable, digest present, tamper check passes", E.assertAcceptable(r).acceptable === true && typeof r.digest === "string" && E.verifyDigest(r) === true);
}
// (2) COUNTER-EVIDENCE: a non-zero exit cannot be masked by a successful-looking stdout.
{
  const r = E.buildEvidenceRecord({ mission: { id: "m" }, attempts: [{ command: "build", exitCode: 1, stdout: "Build succeeded!" }], verification: { verified: true }, transition: { to: "ACCEPTED" } }, {});
  const g = E.assertAcceptable(r);
  ok("exit!=0 with 'success' stdout ⇒ NOT acceptable (exit code not masked)", g.acceptable === false && g.reasons.some((x) => /non-zero/.test(x)));
}
// (3) deny-by-default: ACCEPTED with no executed command ⇒ not acceptable.
{
  const g = E.assertAcceptable(E.buildEvidenceRecord({ mission: { id: "m" }, verification: { verified: true }, transition: { to: "ACCEPTED" } }, {}));
  ok("ACCEPTED with no executed command ⇒ NOT acceptable (deny-by-default)", g.acceptable === false && g.reasons.some((x) => /without any executed command/.test(x)));
}
// (4) declared artifact missing ⇒ not acceptable (incomplete work).
{
  const g = E.assertAcceptable(E.buildEvidenceRecord({ mission: { id: "m" }, attempts: [okAttempt], artifacts: [{ path: "out.bin", present: false }], verification: { verified: true }, transition: { to: "ACCEPTED" } }, {}));
  ok("declared-missing artifact ⇒ NOT acceptable", g.acceptable === false && g.reasons.some((x) => /artifact/.test(x)));
}
// (5) verification required by default; waived only explicitly.
{
  const noV = E.buildEvidenceRecord({ mission: { id: "m" }, attempts: [okAttempt], artifacts: [{ path: "x", sha256: "a" }], transition: { to: "ACCEPTED" } }, {});
  ok("no independent verification ⇒ NOT acceptable by default; acceptable only when explicitly waived",
     E.assertAcceptable(noV).acceptable === false && E.assertAcceptable(noV, { requireVerification: false }).acceptable === true);
}
// (6) contradiction: verification=verified while a command failed ⇒ not acceptable.
{
  const g = E.assertAcceptable(E.buildEvidenceRecord({ mission: { id: "m" }, attempts: [{ command: "t", exitCode: 2 }], verification: { verified: true }, transition: { to: "ACCEPTED" } }, {}));
  ok("verified=true but a command exited non-zero ⇒ NOT acceptable (contradiction surfaced)", g.acceptable === false && g.reasons.some((x) => /CONTRADICTION/.test(x)));
}
// (7) the gate ONLY guards acceptance — a BLOCKED/FAILED record is always an acceptable record.
{
  ok("BLOCKED/FAILED transition ⇒ acceptable record (gate guards only ACCEPTED)",
     E.assertAcceptable(E.buildEvidenceRecord({ mission: { id: "m" }, transition: { to: "BLOCKED", reason: "owner" } }, {})).acceptable === true &&
     E.assertAcceptable(E.buildEvidenceRecord({ mission: { id: "m" }, transition: { to: "FAILED", reason: "err" } }, {})).acceptable === true);
}
// (8) tamper-evidence: mutating a field after build breaks the digest.
{
  const r = cleanProof(); r.mission.objective = "TAMPERED";
  ok("mutated record ⇒ verifyDigest false (tamper detected)", E.verifyDigest(r) === false);
}
// (9) INTEGRATION: loop with a FAILING proof ⇒ lot NOT ACCEPTED (no false terminal); PASSING proof ⇒ ACCEPTED.
{
  const reg = (over) => ({ version: "ev-itest", items: [{ id: "A", status: "READY", deps: [], priority: 1 }] });
  const failing = { status: "ACCEPTED", evidence: "looks done", proof: E.buildEvidenceRecord({ mission: { id: "A" }, attempts: [{ command: "b", exitCode: 1 }], transition: { to: "ACCEPTED" } }, {}) };
  const r1 = reg(); const o1 = L.runCampaignLoop({ register: r1, execute: () => failing, maxIterations: 3 });
  ok("executor ACCEPTED + FAILING proof ⇒ lot NOT ACCEPTED, loop not falsely COMPLETED", r1.items[0].status !== "ACCEPTED" && o1.campaignComplete === false);
  const passing = { status: "ACCEPTED", evidence: "done", proof: E.buildEvidenceRecord({ mission: { id: "A" }, attempts: [{ command: "node --check", exitCode: 0 }], artifacts: [{ path: "x", sha256: "a" }], verification: { verified: true, by: "ci" }, transition: { to: "ACCEPTED" } }, {}) };
  const r2 = reg(); const o2 = L.runCampaignLoop({ register: r2, execute: () => passing });
  ok("executor ACCEPTED + PASSING proof ⇒ lot ACCEPTED, COMPLETED", r2.items[0].status === "ACCEPTED" && o2.campaignComplete === true);
}
// (10) backward compatibility: ACCEPTED with NO proof ⇒ accepted on the evidence string (legacy path unchanged).
{
  const r = { version: "ev-compat", items: [{ id: "A", status: "READY", deps: [], priority: 1 }] };
  const o = L.runCampaignLoop({ register: r, execute: () => ({ status: "ACCEPTED", evidence: "legacy evidence" }) });
  ok("no proof field ⇒ legacy accept-on-evidence-string unchanged", r.items[0].status === "ACCEPTED" && o.campaignComplete === true);
}

console.log(`\nMISSION-EVIDENCE suite — ${pass} assertions passed. (exit code not maskable; deny-by-default; artifact/verification gates; contradiction; tamper-evident; loop gate opt-in; backward compatible)`);
