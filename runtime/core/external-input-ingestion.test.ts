#!/usr/bin/env node
"use strict";

const I = require("./external-input-ingestion");
const PROV = require("./evidence-provenance.js");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// helper: build a stamped envelope with a given human provenanceDescriptor.
// embed the human provenanceDescriptor INSIDE the object before stamping so its integrity is covered by the content digest.
function stamp(payload: any, descriptor: any): any { return PROV.stampProvenance({ ...payload, provenanceDescriptor: descriptor }, {}); }
const INDEP = { author: "acme-labs", independentOfEvaluee: true, sourceRef: "https://acme/dataset/v1", labellingMethod: "human-third-party", devValidationSeparated: true };
const SELF = { author: "odg", independentOfEvaluee: false, sourceRef: "self", labellingMethod: "odg-self" };

// (1) REAL admission: declared real + independent provenance + integrity ok ⇒ REAL_ADMITTED, unblocks the eval items.
{
  const payload = { cases: [{ id: "c1", label: "PASS" }] };
  const d = I.ingestExternalInput({ kind: "EVAL_SET", declaredReal: true, stamped: stamp(payload, INDEP), payload });
  check(d.verdict === "REAL_ADMITTED" && d.tag === "REAL", "declared-real + independent provenance ⇒ REAL_ADMITTED");
  check(d.unblocks.includes("broad-it-independent-eval-set"), "REAL eval-set admission unblocks the broad-it item");
  check(d.controls.provenance && d.controls.labelIndependence === true, "integrity + label-independence controls passed");
}

// (2) THE LOAD-BEARING INVARIANT: declared real but SELF-authored provenance ⇒ REJECTED (never a synthetic PASS, never real).
{
  const payload = { cases: [{ id: "c1", label: "PASS" }] };
  const d = I.ingestExternalInput({ kind: "EVAL_SET", declaredReal: true, stamped: stamp(payload, SELF), payload });
  check(d.verdict === "REJECTED" && d.tag === "NONE", "declared-real + self-authored provenance ⇒ REJECTED (simulation never admitted as real)");
  check(d.unblocks.length === 0, "a rejected input unblocks nothing");
  check(/not independent of the evaluee/i.test(JSON.stringify(d.reasons)), "reason names the independence failure");
}

// (3) SYNTHETIC admission: honestly declared synthetic ⇒ SYNTHETIC_ADMITTED, but unblocks NOTHING.
{
  const payload = { signals: [{ kind: "LOI" }] };
  const d = I.ingestExternalInput({ kind: "DEMAND_SIGNAL", declaredReal: false, stamped: stamp(payload, SELF), payload });
  check(d.verdict === "SYNTHETIC_ADMITTED" && d.tag === "SYNTHETIC", "declared-synthetic ⇒ SYNTHETIC_ADMITTED");
  check(d.unblocks.length === 0, "SYNTHETIC unblocks NOTHING (can never produce a real verdict)");
  check(/SIM only|never produce a MEASURED/i.test(d.note), "note states SIM-only, never real");
}

// (4) a SYNTHETIC input can never be promoted to REAL even with independent-looking provenance (declaredReal governs the tag).
{
  const payload = { signals: [{ kind: "LOI" }] };
  const d = I.ingestExternalInput({ kind: "DEMAND_SIGNAL", declaredReal: false, stamped: stamp(payload, INDEP), payload });
  check(d.tag === "SYNTHETIC" && d.unblocks.length === 0, "declared-synthetic stays SYNTHETIC regardless of provenance; no unblock");
}

// (5) DUPLICATE detection: same content digest already seen ⇒ REJECTED.
{
  const payload = { transactions: [{ amount: 10 }] };
  const s = stamp(payload, INDEP);
  const seen = new Set([s.provenance.contentSha256]);
  const d = I.ingestExternalInput({ kind: "BILLING_PROOF", declaredReal: true, stamped: s, payload }, { seenDigests: seen });
  check(d.verdict === "REJECTED" && /duplicate/i.test(JSON.stringify(d.reasons)), "already-seen content digest ⇒ REJECTED (idempotent)");
}

// (6) INTEGRITY: a tampered stamped payload (digest mismatch) ⇒ REJECTED.
{
  const payload = { clientRef: "X", deliverables: ["a"] };
  const s = stamp(payload, INDEP);
  s.clientRef = "TAMPERED";   // mutate after stamping ⇒ content digest no longer matches
  const d = I.ingestExternalInput({ kind: "CLIENT_DOSSIER", declaredReal: true, stamped: s, payload });
  check(d.verdict === "REJECTED" && d.controls.provenance === false, "tampered artifact (digest mismatch) ⇒ REJECTED");
}

// (7) FORMAT fail-closed: unknown kind / missing field / non-boolean declaredReal ⇒ REJECTED.
check(I.ingestExternalInput({ kind: "NONSENSE", declaredReal: true, stamped: stamp({}, INDEP), payload: {} }).verdict === "REJECTED", "unknown kind ⇒ REJECTED");
check(I.ingestExternalInput({ kind: "EVAL_SET", declaredReal: "yes", stamped: stamp({ cases: [] }, INDEP), payload: { cases: [] } }).verdict === "REJECTED", "non-boolean declaredReal ⇒ REJECTED");
check(I.ingestExternalInput({ kind: "EVAL_SET", declaredReal: true, stamped: stamp({}, INDEP), payload: {} }).verdict === "REJECTED", "missing required field (cases) ⇒ REJECTED");

// (8) unstamped envelope ⇒ REJECTED (no provenance to verify).
check(I.ingestExternalInput({ kind: "EVAL_SET", declaredReal: true, stamped: { cases: [] }, payload: { cases: [] } }).verdict === "REJECTED", "unstamped envelope ⇒ REJECTED");

// (9) unblocksFor maps kinds to the expected register items.
check(I.unblocksFor("DEMAND_SIGNAL").includes("p01-demand-validation") && I.unblocksFor("BILLING_PROOF").includes("p01-billing-sandbox"), "unblocksFor maps kinds to the right register items");
check(I.unblocksFor("ZZZ").length === 0, "unknown kind unblocks nothing");

// (10) contract invariants present.
check(/SYNTHETIC input can NEVER be tagged REAL|never admitted as real proof/i.test(JSON.stringify(I.EXTERNAL_INPUT_INGESTION_CONTRACT.invariants)), "contract: simulation never admitted as real");
check(/ONLY a REAL_ADMITTED input unblocks/i.test(JSON.stringify(I.EXTERNAL_INPUT_INGESTION_CONTRACT.invariants)), "contract: only REAL unblocks");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 EXTERNAL-INPUT INGESTION GATE\n");
process.exit(failures === 0 ? 0 : 1);

export {};
