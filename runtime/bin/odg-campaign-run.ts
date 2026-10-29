#!/usr/bin/env node
/**
 * odg-campaign-run — the REAL entry point that connects the persistent campaign-loop to an AUTHORIZED, non-fictitious
 * executor over the canonical closure register. This is the integration the diagnosis identified as missing: the
 * loop (campaign-loop.ts) and the selector (campaign-controller.ts) existed and were tested in isolation, but no real
 * launcher drove `load register → validate → reconcile → select → EXECUTE(real) → persist → next` end to end.
 *
 * Fail-closed executor resolution (mandate: never call a fictitious executor in production):
 *  - ODG_CAMPAIGN_EXECUTOR unset / "none"  ⇒ NO executor is authorized ⇒ stop NO_EXECUTOR_AUTHORIZED (does NOT invent
 *    a no-op success). This is the honest production state for the canonical register today: autonomously performing
 *    engineering/governance lots needs a governed executor that is deny-by-default.
 *  - "verification" ⇒ a GENUINE executor: for a lot carrying an `exec` verification spec it runs the REAL
 *    code-execution checker and accepts ONLY on the real expected status; a lot without a spec is WAITING_EXTERNAL
 *    (needs a real executor/owner) — never faked.
 *
 * The register file is the durable checkpoint (persist after each mission ⇒ resume + idempotent re-run). Output is a
 * structured, resumable JSON state. Exit code 0 for any justified stop (NO_EXECUTOR / IDLE_BLOCKED / COMPLETED / …);
 * non-zero only on a real error (register unloadable).
 */
"use strict";

const path = require("path");
const LOOP = require("./../core/campaign-loop.js");
const EXEC = require("./../core/code-execution.js");
const JOURNAL = require("./../core/campaign-journal.js");

/** resolveExecutor(kind): return a REAL execute(lot) function, or null if no authorized executor. Never fictitious. */
function resolveExecutor(kind: string): any {
  if (kind === "verification") {
    return (lot: any) => {
      const spec = lot && lot.exec;
      if (!spec || spec.kind !== "verification" || typeof spec.language !== "string" || typeof spec.content !== "string") {
        return { status: "WAITING_EXTERNAL", reason: "lot has no executable verification spec — needs a real executor/owner action" };
      }
      const want = typeof spec.expectedStatus === "string" ? spec.expectedStatus : "PASS";
      const r = EXEC.runSyntaxCheck({ language: spec.language, content: spec.content });   // REAL subprocess check
      if (r.status === "UNSUPPORTED" || r.status === "BLOCKED") return { status: "WAITING_EXTERNAL", reason: `checker ${r.status}: ${r.reason || ""}` };
      if (r.status === want) return { status: "ACCEPTED", evidence: `real ${spec.language} check ⇒ ${r.status} (expected ${want})` };
      return { status: "FAILED", reason: `real check got ${r.status}, expected ${want}` };
    };
  }
  return null;   // "none" / unknown ⇒ no authorized executor (fail-closed)
}

function run(opts: any = {}): any {
  const registerPath = typeof opts.registerPath === "string" ? opts.registerPath : path.join(process.cwd(), "docs", "odg", "closure-register.json");
  const kind = typeof opts.executor === "string" ? opts.executor : "none";
  const maxIterations = Number.isFinite(opts.maxIterations) ? opts.maxIterations : 100;
  const execFn = resolveExecutor(kind);
  if (!execFn) {
    return { stopped: "NO_EXECUTOR_AUTHORIZED", campaignComplete: false, registerPath, executor: kind,
      reason: "no authorized executor configured (set ODG_CAMPAIGN_EXECUTOR to an authorized real executor, e.g. 'verification'); refusing to run a fictitious executor in production." };
  }
  const result = { registerPath, executor: kind, ...LOOP.runCampaignLoop({ registerPath, execute: execFn, maxIterations }) };
  // OPT-IN durable telemetry: when a journal path is supplied, append this run's metrics (observability across runs).
  // Default (no journalPath) ⇒ no I/O, zero behaviour change.
  if (typeof opts.journalPath === "string" && opts.journalPath) {
    try { JOURNAL.appendRun(opts.journalPath, result, { at: typeof opts.at === "string" ? opts.at : null, head: opts.head }); }
    catch (e: any) { result.journalError = (e && e.message) || String(e); }
  }
  return result;
}

export { resolveExecutor, run };
module.exports = { resolveExecutor, run };

if (require.main === module) {
  const registerPath = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : undefined;
  const executor = process.env.ODG_CAMPAIGN_EXECUTOR || "none";
  const maxIterations = process.env.ODG_CAMPAIGN_MAX_ITER ? parseInt(process.env.ODG_CAMPAIGN_MAX_ITER, 10) : undefined;
  const journalPath = process.env.ODG_CAMPAIGN_JOURNAL || undefined;   // opt-in durable telemetry
  const at = journalPath ? new Date().toISOString() : undefined;       // timestamp only when journaling (bin-level clock)
  let out: any;
  try { out = run({ registerPath, executor, maxIterations, journalPath, at }); }
  catch (e: any) { process.stderr.write(`odg-campaign-run error: ${(e && e.message) || e}\n`); process.exit(1); }
  const slim = { stopped: out.stopped, campaignComplete: !!out.campaignComplete, iterations: out.iterations, executor: out.executor, reason: out.reason, counts: out.summary && out.summary.counts, transitions: out.transitions };
  process.stdout.write(JSON.stringify(slim, null, 2) + "\n");
  process.exit(0);   // a justified stop is NOT an error
}
