#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V12 §2–§3 — UNIFIED EXTERNAL-INPUT INGESTION GATE. PURE, deterministic, fail-closed. This is the genuinely
 * MISSING wiring (not a rebuild): the per-voie mechanisms already exist (broad-it-eval-ingest for an eval set,
 * demand-evidence/p01-billing-sandbox for demand/billing, evidence-provenance for provenance, independent-label-policy
 * for label independence, audit-log for the keyed tamper-evident chain). This gate COMPOSES them into ONE path that runs
 * the cross-cutting controls §3 demands on ANY authorized external input, BEFORE any downstream measurement:
 *   format validation → provenance+integrity (evidence-provenance.verifyProvenance) → duplicate detection (content
 *   digest) → REAL-vs-SYNTHETIC separation → label independence (eval sets) → audit record → accept/reject.
 *
 * THE LOAD-BEARING INVARIANT (§3, "Ne jamais transformer une simulation en preuve réelle"): a SYNTHETIC input can NEVER
 * be admitted as REAL; and an input DECLARED real whose provenance is self-authored / not independent of the evaluee is
 * REJECTED (never silently downgraded to a synthetic PASS, never allowed to yield a MEASURED/real verdict). Only a
 * REAL_ADMITTED input (declared real + independent provenance + integrity verified + not a duplicate) is eligible to
 * unblock a MEASURED/real register item. It reimplements no transport, grants no authority, and writes nothing (the
 * caller persists the returned auditRecord and applies ONLY an admitted input — rollback = do not apply a REJECTED one).
 * Dual export.
 */

const PROV = require("./evidence-provenance.js");
const LABEL = require("./independent-label-policy.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// The authorized input kinds and the register items a REAL admission of each would unblock (no synthetic ever unblocks).
const INPUT_KINDS = Object.freeze({
  EVAL_SET: Object.freeze({ required: ["cases"], unblocks: Object.freeze(["broad-it-independent-eval-set", "broad-it-corpus-grow"]), needsLabelIndependence: true, deepHarness: "broad-it-eval-ingest.measureOnEvalSet" }),
  DEMAND_SIGNAL: Object.freeze({ required: ["signals"], unblocks: Object.freeze(["p01-demand-validation"]), needsLabelIndependence: false, deepHarness: "demand-evidence.assessDemand" }),
  BILLING_PROOF: Object.freeze({ required: ["transactions"], unblocks: Object.freeze(["p01-billing-sandbox"]), needsLabelIndependence: false, deepHarness: "p01-billing-sandbox.reconcile" }),
  CLIENT_DOSSIER: Object.freeze({ required: ["clientRef", "deliverables"], unblocks: Object.freeze(["R5-CLIENT_VALIDATED (all 15 métiers)"]), needsLabelIndependence: false, deepHarness: "commercial-pipeline (provider-proof gated)" }),
});

const REAL = "REAL", SYNTHETIC = "SYNTHETIC", NONE = "NONE";

/**
 * provenanceIndependent(provenance, kind) -> { ok, reasons[] }. For an EVAL_SET it reuses the strict
 * independent-label-policy; for the other kinds it applies the SAME core rule (author is not the evaluee + a positive
 * independentOfEvaluee flag + a traceable sourceRef) so a self-authored "real" input cannot pass. Deny-by-default.
 */
function provenanceIndependent(provenance: any, kind: any): any {
  if (kind === "EVAL_SET") { const a = LABEL.assessLabelIndependence(provenance); return { ok: a.independent === true, reasons: a.reasons || [] }; }
  const reasons: string[] = [];
  if (!isObj(provenance)) return { ok: false, reasons: ["no provenance descriptor"] };
  const author = String(provenance.author || "").trim().toLowerCase();
  if (!nonEmptyStr(author)) reasons.push("missing provenance author");
  if (LABEL.SELF_AUTHORS.includes(author) || author === "odg" || author.startsWith("odg:")) reasons.push(`authored by the evaluee (${provenance.author}) — self-certification not allowed`);
  if (provenance.independentOfEvaluee !== true) reasons.push("independentOfEvaluee not positively true");
  if (!nonEmptyStr(provenance.sourceRef)) reasons.push("missing traceable sourceRef");
  return { ok: reasons.length === 0, reasons };
}

/**
 * ingestExternalInput(envelope, opts?) -> decision. envelope = { kind, declaredReal:boolean, stamped, payload }.
 * `stamped` is the input stamped by evidence-provenance.stampProvenance (carries provenance.contentSha256). opts:
 * { seenDigests?: Set<string>, verifyKey?: string (to verify a keyed stamp — never created here), now?: string }.
 * FAIL-CLOSED verdicts: REAL_ADMITTED | SYNTHETIC_ADMITTED | REJECTED. Pure (no IO); returns an auditRecord to persist.
 */
function ingestExternalInput(envelope: any, opts: any = {}): any {
  const reasons: string[] = [];
  const controls: any = { format: false, provenance: false, duplicate: false, realSyntheticSeparation: false, labelIndependence: null };
  const env = isObj(envelope) ? envelope : {};
  const kind = String(env.kind || "");
  const spec = (INPUT_KINDS as any)[kind];
  const now = nonEmptyStr(opts.now) ? opts.now : "unknown";

  // (1) FORMAT — known kind + required payload fields + an explicit boolean declaredReal (no defaulting a claim).
  if (!spec) reasons.push(`unknown input kind: ${kind || "(none)"}`);
  if (typeof env.declaredReal !== "boolean") reasons.push("declaredReal must be an explicit boolean (real vs synthetic must be declared)");
  const payload = isObj(env.payload) ? env.payload : null;
  if (spec) { if (!payload) reasons.push("missing payload"); else for (const f of spec.required) if (!(f in payload)) reasons.push(`payload missing required field: ${f}`); }
  controls.format = reasons.length === 0;

  // (2) PROVENANCE + INTEGRITY — the stamped envelope's content digest must verify (tamper detection). Reuse
  //     evidence-provenance; a keyed stamp requires opts.verifyKey (we never mint a key here). No stamp ⇒ reject.
  let contentSha256: any = null;
  if (controls.format) {
    const vp = PROV.verifyProvenance(env.stamped, opts.verifyKey ? { key: opts.verifyKey } : undefined);
    controls.provenance = vp.ok === true;
    if (!vp.ok) reasons.push(`provenance/integrity: ${vp.reason}`);
    else contentSha256 = env.stamped.provenance.contentSha256;
  }

  // (3) DUPLICATE DETECTION — by content digest against the supplied seen-set (idempotent ingestion).
  if (controls.provenance) {
    const seen = opts.seenDigests instanceof Set ? opts.seenDigests : null;
    const dup = !!(seen && contentSha256 && seen.has(contentSha256));
    controls.duplicate = !dup;
    if (dup) reasons.push(`duplicate input (content digest ${contentSha256} already ingested)`);
  }

  // (4) REAL↔SYNTHETIC SEPARATION — the load-bearing invariant. A declared-real input MUST have independent provenance;
  //     a self-authored "real" input is REJECTED (never downgraded to a synthetic pass). A declared-synthetic input is
  //     admitted but can NEVER be tagged REAL.
  let tag = NONE;
  if (controls.provenance && controls.duplicate) {
    if (env.declaredReal === true) {
      const ind = provenanceIndependent(env.stamped && env.stamped.provenanceDescriptor, kind);
      // provenanceDescriptor = the human-meaningful provenance (author/independentOfEvaluee/sourceRef/labellingMethod),
      // distinct from the integrity provenance stamp. Required for a REAL claim.
      controls.realSyntheticSeparation = ind.ok === true;
      if (spec && spec.needsLabelIndependence) controls.labelIndependence = ind.ok === true;
      if (!ind.ok) { reasons.push("declared REAL but provenance is not independent of the evaluee: " + ind.reasons.join("; ") + " — REJECTED (a simulation must never be admitted as real proof)"); }
      else tag = REAL;
    } else {
      controls.realSyntheticSeparation = true;   // honestly declared synthetic
      tag = SYNTHETIC;
    }
  }

  const admitted = reasons.length === 0 && (tag === REAL || tag === SYNTHETIC);
  const verdict = !admitted ? "REJECTED" : (tag === REAL ? "REAL_ADMITTED" : "SYNTHETIC_ADMITTED");
  const unblocks = verdict === "REAL_ADMITTED" && spec ? [...spec.unblocks] : [];   // ONLY a REAL admission unblocks
  const auditRecord = Object.freeze({ at: now, kind, declaredReal: env.declaredReal === true, verdict, tag, contentSha256, controls: Object.freeze({ ...controls }), reasonCount: reasons.length, nextHarness: spec ? spec.deepHarness : null });

  return Object.freeze({
    verdict, admitted, tag, kind, contentSha256,
    unblocks: Object.freeze(unblocks),
    controls: Object.freeze(controls),
    reasons: Object.freeze(reasons),
    auditRecord,
    note: tag === SYNTHETIC ? "admitted as SYNTHETIC — eligible for SIM only; can NEVER produce a MEASURED/real verdict or unblock a real item" : (tag === REAL ? "admitted as REAL — eligible to run the deep harness and unblock the listed items" : "rejected — not applied (rollback = no state change)"),
  });
}

/** unblocksFor(kind) -> the register ids a REAL admission of this kind would unblock (documentation/dossier helper). */
function unblocksFor(kind: any): string[] { const s = (INPUT_KINDS as any)[String(kind)]; return s ? [...s.unblocks] : []; }

const EXTERNAL_INPUT_INGESTION_CONTRACT = Object.freeze({
  id: "V124-EXTERNAL-INPUT-INGESTION",
  source: "CTO V12 §2–§3 — unified ingestion gate for authorized real external inputs",
  reuses: Object.freeze(["evidence-provenance.verifyProvenance (integrity)", "independent-label-policy.assessLabelIndependence (eval-set label independence)", "broad-it-eval-ingest (eval deep harness)", "demand-evidence / p01-billing-sandbox (demand/billing deep harness)", "audit-log (caller persists the returned auditRecord to the keyed chain)"]),
  notAuthority: "runs the cross-cutting ingestion controls and returns a verdict + auditRecord; writes nothing, mints no key, grants no authority, invents no data",
  invariants: Object.freeze([
    "fail-closed: unknown kind / missing fields / unstamped / tampered / duplicate ⇒ REJECTED",
    "a SYNTHETIC input can NEVER be tagged REAL; a declared-REAL input with non-independent provenance is REJECTED, never downgraded to a synthetic PASS (a simulation is never admitted as real proof)",
    "ONLY a REAL_ADMITTED input unblocks a register item (SYNTHETIC unblocks nothing)",
    "provenance + integrity verified via evidence-provenance (content digest; keyed stamp needs the key, never minted here)",
    "duplicate detection by content digest (idempotent ingestion); pure — no IO, the caller persists the auditRecord and applies only an admitted input (rollback = do not apply a REJECTED one)",
  ]),
});

module.exports = { INPUT_KINDS, ingestExternalInput, provenanceIndependent, unblocksFor, EXTERNAL_INPUT_INGESTION_CONTRACT };

if (require.main === module) {
  // demo: a synthetic input declared real with self-authored provenance ⇒ REJECTED (the invariant in action).
  // provenanceDescriptor is embedded BEFORE stamping so its integrity is covered by the digest (the REJECT below is for
  // non-independence, not a digest artifact).
  const stamped = PROV.stampProvenance({ cases: [{ id: "c1", label: "PASS" }], provenanceDescriptor: { author: "odg", independentOfEvaluee: false, sourceRef: "self", labellingMethod: "odg-self" } }, {});
  const d = ingestExternalInput({ kind: "EVAL_SET", declaredReal: true, stamped, payload: { cases: [{ id: "c1" }] } });
  process.stdout.write(JSON.stringify({ ...EXTERNAL_INPUT_INGESTION_CONTRACT, demo: { verdict: d.verdict, unblocks: d.unblocks, simNeverReal: d.verdict === "REJECTED" } }, null, 2) + "\n");
}

export {};
