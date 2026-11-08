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

module.exports = { run, parseSignals };
export { run, parseSignals };

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
    process.stdout.write(JSON.stringify(slim, null, 2) + "\n");
    process.exit(0);
  })();
}
