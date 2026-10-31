#!/usr/bin/env node

// agent -> ODG : reads a response envelope, correlates it with its request,
// validates + analyzes the proposal (reusing existing scripts), gates via
// governance, and records evidence. Runs with cwd = repository root.
//
// MIGRATION-READINESS seam (V65): the two child-process calls, the clock, the
// governance gate and the ledger write are the module's only impure points.
// They are exposed as OPTIONAL injected seams on collect(requestId, opts) so a
// hermetic JS/TS parity bench can drive the whole flow with NO real subprocess,
// clock, governance read or ledger write. Every seam DEFAULTS to the real
// implementation ⇒ production behaviour is byte-for-byte unchanged.

const { spawnSync }: any = require("child_process");
const envelope: any = require("./fleet-envelope");
const { authorizeMission }: any = require("./governance-kernel");

let recordMission: any = null;
try {
  ({ recordMission } = require("./mission-ledger"));
} catch {
  recordMission = null;
}

function fail(request: any, requestId: any, reason: any, nowIso: any): any {
  if (request) {
    request.status = envelope.STATUS.FAILED;
    request.failedAt = nowIso();
    request.reason = reason;
    envelope.writeJson(envelope.requestPath(requestId), request);
  }
  return { requestId, status: envelope.STATUS.FAILED, reason };
}

function collect(requestId: any, opts?: any): any {
  const o = opts && typeof opts === "object" ? opts : {};
  // Injected seams — each defaults to the real implementation (production unchanged).
  const spawn = typeof o.spawn === "function" ? o.spawn : spawnSync;
  const nowIso = () => (typeof o.nowIso === "string" && o.nowIso) ? o.nowIso : new Date().toISOString();
  const authorize = typeof o.authorize === "function" ? o.authorize : authorizeMission;
  const record = ("record" in o) ? o.record : recordMission; // may be null (no ledger writer)

  if (!requestId) {
    throw new Error("Missing requestId");
  }

  const request = envelope.readJsonSafe(envelope.requestPath(requestId));
  const response = envelope.readJsonSafe(envelope.responsePath(requestId));

  // Correlation: a matching request must exist.
  if (!request) {
    return { requestId, status: envelope.STATUS.FAILED, reason: "No correlated request" };
  }
  if (!response) {
    return fail(request, requestId, "No response found", nowIso);
  }
  if (response.requestId !== requestId) {
    return fail(request, requestId, "RequestId mismatch", nowIso);
  }

  const check = envelope.validateResponse(response);
  if (!check.valid) {
    return fail(request, requestId, "Invalid response: " + check.missing.join(", "), nowIso);
  }

  const proposalJson = JSON.stringify(response.proposal);

  // Spawn-CLI dual-port (CTO Track B): DEFAULT the compiled-TS ports under runtime/dist/llm; ODG_RUNTIME=js
  // selects the JS rollback ports under runtime/llm. Both are proven observationally identical by
  // spawn-cli-llm-parity.test.js. The injected `spawn` seam in tests matches by substring (response-parser/
  // proposal-analyzer), so this base switch is parity-safe.
  const LLM_BASE = "runtime/dist/llm"; // ZERO-JS: the compiled dist LLM workers (ODG_RUNTIME=js rollback retired)

  // Reuse response-parser : validates required fields + writes proposal.json.
  const parsed = spawn("node", [`${LLM_BASE}/response-parser.js`, proposalJson], {
    encoding: "utf8"
  });
  if (parsed.status !== 0) {
    return fail(request, requestId, "response-parser rejected proposal", nowIso);
  }

  // Reuse proposal-analyzer : writes proposal-analysis.json.
  const analyzed = spawn("node", [`${LLM_BASE}/proposal-analyzer.js`], {
    encoding: "utf8"
  });
  if (analyzed.status !== 0) {
    return fail(request, requestId, "proposal-analyzer failed", nowIso);
  }

  // Governance gate before declaring the exchange validated.
  const governance = authorize(request.mission);
  if (!governance.authorized) {
    return fail(request, requestId, "Governance refused", nowIso);
  }

  request.status = envelope.STATUS.VALIDATED;
  request.validatedAt = nowIso();
  envelope.writeJson(envelope.requestPath(requestId), request);

  // Surface whether the evidence-ledger write actually happened: recordMission is default-deny (it may skip with
  // {skipped:true,reason:...} for an unproven/not-accepted mission) and could throw. Previously both were silently
  // swallowed and the collector still returned VALIDATED, implying a ledger entry that may not exist. Capture the
  // outcome into evidenceRecorded so a caller is not misled; a skip/throw is warned, never fatal (non-blocking).
  let evidenceRecorded: any = { attempted: false };
  if (record) {
    try {
      const rec = record(request.mission);
      const skipped = !!(rec && typeof rec === "object" && rec.skipped);
      evidenceRecorded = { attempted: true, recorded: !skipped, reason: skipped ? (rec.reason || "skipped") : null };
      if (skipped) { try { process.stderr.write(`[ODG][fleet-collector] evidence NOT recorded for ${request.mission}: ${rec.reason || "skipped"} (exchange still VALIDATED by governance)\n`); } catch { /* best-effort */ } }
    } catch (e: any) {
      evidenceRecorded = { attempted: true, recorded: false, reason: `record threw: ${(e && e.message) || e}` };
      try { process.stderr.write(`[ODG][fleet-collector] evidence record threw for ${request.mission}: ${(e && e.message) || e}\n`); } catch { /* best-effort */ }
    }
  }

  return {
    requestId,
    status: envelope.STATUS.VALIDATED,
    mission: request.mission,
    evidenceRecorded,
    actions: response.proposal.actions.length
  };
}

module.exports = { collect };

if (require.main === module) {
  const requestId = process.argv[2];
  const r = collect(requestId);
  console.log("======================================");
  console.log("FLEET COLLECTOR");
  console.log("======================================");
  console.log("RequestId :", r.requestId);
  console.log("Status    :", r.status);
  if (r.reason) console.log("Reason    :", r.reason);
  if (r.status === envelope.STATUS.VALIDATED) {
    console.log("Mission   :", r.mission);
    console.log("Actions   :", r.actions);
  }
  console.log("======================================");
  process.exit(r.status === envelope.STATUS.VALIDATED ? 0 : 1);
}

export {};
