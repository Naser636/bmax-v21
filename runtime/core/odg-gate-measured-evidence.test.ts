#!/usr/bin/env node
"use strict";
/* V15 — measured gate evidence: legitimate vs unjustified outcomes through the REAL chain/gate. */
const MG = require("./odg-gate-measured-evidence.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ok = (k: string) => ({ condition: k, method: "measured by test fixture " + k, observed: 1, passed: true });
const ALL = MG.KEYS.map(ok); const X = { id: "t", v124Link: "CM-T", significant: true };
check("the 12 keys are the gate's own conditions", MG.KEYS.length === 12 && MG.KEYS.includes("securityValidated"));
check("V15 closure (audit D2): 12 caller measurements incl. review/inspection ⇒ still RETURN 10/12 — review measurements IGNORED, never INTEGRATE without an owner review", (() => { const r = MG.runMeasuredExperiment(X, ALL); return r.chain.verdict === "RETURN_TO_EXPERIMENT" && r.derived.evidence.codeAndDepsReviewed === false && r.derived.evidence.independentInspection === false && r.derived.reviewMeasurementsIgnored === 2 && /OWNER_REVIEW_FAIL \(NO_OWNER_REVIEW\)/.test(r.derived.basis.independentInspection); })());
check("deriveEvidence alone never sets review/inspection true", (() => { const d = MG.deriveEvidence(ALL); return d.evidence.codeAndDepsReviewed === false && d.evidence.independentInspection === false; })());
check("no measurements ⇒ RETURN (nothing asserted), all basis NOT_MEASURED", (() => { const r = MG.runMeasuredExperiment(X, []); return r.chain.verdict === "REJECT" || r.chain.verdict === "RETURN_TO_EXPERIMENT"; })());
check("UNJUSTIFIED pass attempt: caller-asserted evidence booleans are ignored", (() => { const r = MG.runMeasuredExperiment({ ...X, evidence: Object.fromEntries(MG.KEYS.map((k: string) => [k, true])) }, []); return r.callerEvidenceIgnored === true && r.chain.verdict !== "INTEGRATE"; })());
check("LEGITIMATE refusal: security measurement failed ⇒ REJECT (hard stop)", MG.runMeasuredExperiment(X, ALL.map((m: any) => m.condition === "securityValidated" ? { ...m, passed: false } : m)).chain.verdict === "REJECT");
check("LEGITIMATE return: owner review missing ⇒ RETURN_TO_EXPERIMENT", (() => { const r = MG.runMeasuredExperiment(X, ALL.filter((m: any) => m.condition !== "independentInspection")); return r.chain.verdict === "RETURN_TO_EXPERIMENT" && r.chain.softMissing.includes("independentInspection"); })());
check("conflicting measurements for a condition ⇒ false (CONFLICTING)", (() => { const d = MG.deriveEvidence([...ALL, { ...ok("functionalTestsPass"), passed: false }]); return d.evidence.functionalTestsPass === false && /CONFLICTING/.test(d.basis.functionalTestsPass); })());
check("malformed measurements (no method / unknown condition / bad sha / non-boolean passed) are ignored, never count", (() => { const d = MG.deriveEvidence([{ condition: "linkedToV124", passed: true, observed: 1 }, { condition: "made_up", method: "xxxxxxxxxx", observed: 1, passed: true }, { ...ok("baselineRecorded"), artifactSha256: "zz" }, { ...ok("rollbackAvailable"), passed: "yes" }]); return d.malformedIgnored === 4 && d.measuredCount === 0; })());
const ATT = require("./odg-knowledge-attestation.js");
const CAND = "a".repeat(40); const rec = { subject: "x", subjectCommit: CAND, verdict: "ACCEPT" }; const id = ATT.ephemeralIdentity("provider-made-key"); const now = Date.now();
const att = ATT.createAttestation({ purpose: "INSPECTION_RECORD", identity: id, payload: rec, issuedAt: now - 1000, expiresAt: now + 86400000, nonce: "nonce-123456" });
check("owner anchors loaded in-module are EMPTY by design", Array.isArray(MG.INSPECTION_ANCHORS) && MG.INSPECTION_ANCHORS.length === 0);
check("SELF-CERTIFICATION refused: a valid signature by a provider-made key is NOT owner-anchored", (() => { const r = MG.ownerAnchoredReview(rec, { attestation: att, publicKeyPem: id.publicKeyPem }, CAND); return r.ok === false && /KEY_NOT_OWNER_ANCHORED/.test(r.reason); })());
check("no signature at all ⇒ NO_OWNER_SIGNATURE", /NO_OWNER_SIGNATURE/.test(MG.ownerAnchoredReview(rec, null, CAND).reason));
check("V15 closure (audit D3): record not bound to the candidate ⇒ RECORD_NOT_BOUND_TO_CANDIDATE (checked before any signature)", /RECORD_NOT_BOUND_TO_CANDIDATE/.test(MG.ownerAnchoredReview(rec, { attestation: att, publicKeyPem: id.publicKeyPem }, "b".repeat(40)).reason));
check("short / missing candidate commit ⇒ NO_CANDIDATE_COMMIT", /NO_CANDIDATE_COMMIT/.test(MG.ownerAnchoredReview(rec, null, "abc1234").reason) && /NO_CANDIDATE_COMMIT/.test(MG.ownerAnchoredReview(rec, null, undefined).reason));
check("non-ACCEPT record ⇒ refused", /RECORD_VERDICT_NOT_ACCEPT/.test(MG.ownerAnchoredReview({ ...rec, verdict: "REJECT" }, null, CAND).reason));
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-gate-measured-evidence (V15)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
