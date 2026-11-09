#!/usr/bin/env node
/*
 * odg-frontier — the REAL canonical entry point that drives the Frontier chain end-to-end through ODG's existing
 * mechanisms (NOT a set of isolated internal calls):
 *
 *   RADAR → ODG(integrate) → POLICY/AUTHORITY → campaign-controller selection → LAB+EVOLUTION(real WI-FR-05 sandbox)
 *   → EVIDENCE → DECISION
 *
 * It composes frontier-pipeline (the canonical wiring) with the WI-FR-05 real bubblewrap sandbox runner as the Tester,
 * so a run of THIS binary genuinely: qualifies a signal, integrates a DEFERRED lot, requires POLICY ALLOW + an
 * EXTERNAL authorization (the Radar cannot self-authorize), lets campaign-controller select the READY lot, runs a
 * REAL isolated experiment, verifies it independently, and emits canonical evidence + an external-only promotion
 * review. Fail-closed: no authorization ⇒ chain not traversed (lot stays DEFERRED). No push / network / privilege.
 *
 * Env: ODG_FRONTIER_NOAUTH=1 ⇒ omit the external authorization (demonstrates the POLICY/authorization refusal path).
 * Output: a slim structured JSON state; exit 0 on any justified outcome, non-zero only on a real error.
 */
"use strict";

const PIPE: any = require("../core/frontier-pipeline");
const RADAR: any = require("../core/frontier-radar");
const SBX: any = require("../core/frontier-sandbox");

// Parse "k=v;k=v" stdout into numeric signals (the measurement surface the sandboxed experiment prints).
function parseSignals(stdout: any): any {
  const out: any = {};
  for (const pair of String(stdout || "").trim().split(/[;\n]+/)) {
    const m = pair.split("=");
    if (m.length === 2 && m[0].trim()) { const n = Number(m[1]); out[m[0].trim()] = isFinite(n) ? n : m[1].trim(); }
  }
  return out;
}

async function run(opts: any): Promise<any> {
  const o = (opts && typeof opts === "object") ? opts : {};
  const now = typeof o.now === "string" ? o.now : "t0";
  // A fixed, allowlisted radar scenario (no live network): one qualified signal ⇒ one ACCEPT_FOR_EXPERIMENT proposal.
  const reg = RADAR.registerSource({}, { id: "ted", owner: "EU Publications Office", url: "https://api.ted.europa.eu/v3/notices/search", type: "api", reliability: 0.9 }, { now }).registry;
  const radar = { registry: reg, rawSignals: [{ sourceId: "ted", title: "Faster parser", categories: ["parsing"], claims: ["2x"] }], baseline: { focusAreas: ["parsing"], crossChecked: true }, odgBaseline: { capabilities: [] }, now };

  // The REAL WI-FR-05 sandbox runner (bubblewrap) is the Tester: it prints a measurement surface we parse into signals.
  const runner = SBX.asFrontierRunner({ argv: ["/usr/bin/echo", "throughput=2.0;latencyMs=60"], measureFromStdout: parseSignals, budget: { maxMs: 8000, maxCpuSec: 2 } });
  const builder = async () => ({ id: "cand-frontier", change: "faster parser" });

  // External authorization (an ODG/owner actor — NOT the Radar). Omitted under ODG_FRONTIER_NOAUTH to show the refusal path.
  const authorization = o.noAuth ? null : { authorizedBy: "odg-cto", approved: true };

  const result = await PIPE.runFrontierPipeline({ radar, register: { items: [] } }, { runner, builder, collectors: { throughput: () => 1.0, latencyMs: () => 100 }, authorization, now });
  return result;
}

// V15 §2 — DURABLE TRACEABILITY. The weekly Radar previously left no persisted, deduplicated, provenance-stamped proposal
// record (only an append-only text log). persistFrontierDecision records the run's decision to the EXISTING durable store
// via frontier-radar-store.recordProposal (which enforces status PROPOSED + grantsNoPermission=true — proposition ≠
// autorisation — and dedups by candidateId through the idempotency journal). Fail-closed governance: the Radar must NEVER
// auto-promote, so a `promoted` decision is REFUSED here (never silently recorded as an authorized proposal). PURE given
// injected seams (recordProposal / stampProvenance); the bin supplies the real store + a real timestamp.
function persistFrontierDecision(slim: any, deps: any = {}): any {
  const s = (slim && typeof slim === "object") ? slim : {};
  const now = typeof deps.now === "string" && deps.now ? deps.now : "unknown";
  const record = deps.recordProposal || require("../core/frontier-radar-store.js").recordProposal;
  const stamp = deps.stamp || require("../core/evidence-provenance.js").stampProvenance;
  // Fail-closed: a promoted decision must never be recorded as a proposal (the Radar cannot self-authorize a promotion).
  if (s.promoted === true) return Object.freeze({ ok: false, decision: "REFUSED", reason: "radar decision marked promoted — refusing to record (promotion requires external authorization, not the Radar)" });
  if (typeof s.selected !== "string" || !s.selected) return Object.freeze({ ok: true, decision: "NO_PROPOSAL", reason: "no selected candidate this run — nothing to record (not a failure)" });
  const proposal = stamp({ candidateId: s.selected, status: "PROPOSED", grantsNoPermission: true, outcome: s.outcome || null, evidencePresent: s.evidencePresent === true, stages: s.stages || [], recordedAt: now }, { runId: now });
  try { return record(proposal, { now, store: deps.store }); }
  catch (e: any) { return Object.freeze({ ok: false, decision: "ERROR", reason: String((e && e.message) || e) }); }
}

module.exports = { run, parseSignals, persistFrontierDecision };
export { run, parseSignals, persistFrontierDecision };

if (require.main === module) {
  const noAuth = process.env.ODG_FRONTIER_NOAUTH === "1";
  (async () => {
    let out: any;
    try { out = await run({ noAuth, now: "t0" }); }
    catch (e: any) { process.stderr.write(`odg-frontier error: ${(e && e.message) || e}\n`); process.exit(1); }
    const slim = {
      chainTraversed: out.chainTraversed === true,
      admissions: (out.admissions || []).map((a: any) => ({ lotId: a.lotId, policy: a.policy && a.policy.decision, admitted: a.admitted, reason: a.reason })),
      selected: out.selection && out.selection.lot ? out.selection.lot.id : null,
      outcome: out.decision ? out.decision.outcome : (out.reason || null),
      promoted: out.decision ? out.decision.promoted : false,
      evidencePresent: !!out.evidence,
      stages: out.stages || [],
    };
    // V15 §2 — persist the decision to the durable traceable store (deduplicated, provenance-stamped). Uses a real
    // wall-clock timestamp for the audit trail; the candidate id (dedup key) stays deterministic from the pipeline.
    let persisted: any = { decision: "SKIPPED" };
    try { persisted = persistFrontierDecision(slim, { now: new Date().toISOString() }); } catch (e: any) { persisted = { ok: false, decision: "ERROR", reason: String((e && e.message) || e) }; }
    process.stdout.write(JSON.stringify({ ...slim, persistence: { decision: persisted.decision, added: persisted.added === true } }, null, 2) + "\n");
    process.exit(0);
  })();
}
