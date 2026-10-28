#!/usr/bin/env node
/**
 * code-health-service — V54 Chantier C (C1+C2): the FIRST productized offer built STRICTLY from proven capabilities.
 * It packages ODG's real multi-language syntax/type CHECK (code-execution) + the bounded repair harness into ONE
 * usable, deliverable service with an evidence-based report — no certification/guarantee claims, no external exposure.
 *
 * C1 OFFER (honest, scoped): input = a set of self-contained source files (JS/TS/Python); output = a Code Health
 * Report (per-file PASS/FAIL/UNSUPPORTED with real tool evidence) + optional bounded repair RESULT for files that
 * ship with a failing acceptance command. Controls: isolated workspace, argv-array tools, timeouts, no network, no
 * secrets. Limits: a CHECK is not an audit/certification; UNSUPPORTED languages are declared, not faked.
 *
 * C2 JOURNEY (realizable parts implemented here; the rest declared NOT_IMPLEMENTED, not faked): validate inputs →
 * run checks → produce deliverable + evidence/limits. Onboarding/billing/public hosting are owner-gated and out of
 * scope for this module. Reuses code-execution + repair-workflow (no new primitive). Pure/deterministic given a runner.
 */
"use strict";

const EXEC = require("./code-execution.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const OFFER = Object.freeze({
  id: "code-health-check-v1",
  name: "Code Health Check (syntax/type verification + evidence report)",
  client: "teams wanting fast, evidence-backed syntax/type verification of JS/TS/Python files in CI or review",
  problem: "broken or non-compiling files reach review/CI; teams want an objective, reproducible pass/fail with proof",
  inputs: "a set of self-contained source files { path, language (JavaScript|TypeScript|Python), content }",
  deliverable: "a Code Health Report: per-file status (PASS/FAIL/UNSUPPORTED/BLOCKED) with the real tool used + error detail; a summary; explicit limits",
  controls: ["isolated mkdtemp workspace", "argv-array tools (no shell)", "timeout + output cap", "no network", "no secrets", "temp cleanup"],
  limits: [
    "a CHECK is NOT an audit, security review, certification, or correctness guarantee",
    "TypeScript single-file check is reliable only for self-contained files (imports need project context)",
    "languages without a local toolchain are reported UNSUPPORTED, never faked",
  ],
  deliveryTimeCost: "seconds per file on local toolchain; €0 infra (no paid service)",
  risks: ["false FAIL on TS files with external imports", "UNSUPPORTED for stacks lacking a toolchain"],
  successCriteria: ["0 false PASS on broken inputs", "every PASS reproducible by the named tool", "clear UNSUPPORTED/limits"],
  priceHypothesis: "HYPOTHESIS ONLY — not validated: a low per-run or per-seat price; demand unmeasured (no sale, €0 collected)",
  journey: {
    offerPresentation: "IMPLEMENTED (this OFFER record)",
    inputValidation: "IMPLEMENTED",
    missionExecution: "IMPLEMENTED (runHealthCheck)",
    deliverableProduction: "IMPLEMENTED (report)",
    evidenceAndLimits: "IMPLEMENTED",
    onboarding: "NOT_IMPLEMENTED (owner-gated)",
    billing: "NOT_IMPLEMENTED (owner-gated; test env only before real use)",
    publicHosting: "NOT_IMPLEMENTED (owner-gated; no public exposure)",
  },
  commercialState: "PREPARED internal offer only — NO lead, NO proposal sent, NO contract, NO invoice, NO cash. €500k target unmet.",
});

const SUPPORTED = ["JavaScript", "TypeScript", "Python"];

/**
 * runHealthCheck(input, opts?): execute the realizable product journey over the supplied files and return the
 * Code Health Report (the deliverable) + evidence. opts.runner / opts.toolchain injectable (tests). Fail-closed.
 */
function runHealthCheck(input: any, opts: any = {}): any {
  if (!isObj(input) || !Array.isArray(input.files)) return { ok: false, code: "INVALID_INPUT", reason: "input { files: [{path, language, content}] } required" };
  if (input.files.length === 0) return { ok: false, code: "INVALID_INPUT", reason: "at least one file required" };
  if (input.files.length > 200) return { ok: false, code: "INVALID_INPUT", reason: "too many files (bounded at 200 per run)" };
  const runner = typeof opts.runner === "function" ? opts.runner : undefined;
  const toolchain = isObj(opts.toolchain) ? opts.toolchain : EXEC.detectToolchain(runner ? { runner } : {});

  const perFile: any[] = [];
  const counts = { PASS: 0, FAIL: 0, UNSUPPORTED: 0, BLOCKED: 0 };
  for (const f of input.files) {
    if (!isObj(f) || typeof f.path !== "string" || typeof f.content !== "string") { perFile.push({ path: (f && f.path) || "?", status: "BLOCKED", detail: "each file needs { path, language, content }" }); counts.BLOCKED++; continue; }
    const language = String(f.language || "");
    if (!SUPPORTED.includes(language)) { perFile.push({ path: f.path, language, status: "UNSUPPORTED", detail: `no verified checker for '${language || "(none)"}'` }); counts.UNSUPPORTED++; continue; }
    const available = toolchain[language] === true;
    const r = EXEC.runSyntaxCheck({ language, filename: f.path, content: f.content, toolchainAvailable: available, ...(runner ? { runner } : {}) });
    const status = r.status; // PASS | FAIL | UNSUPPORTED | BLOCKED
    (counts as any)[status] = ((counts as any)[status] || 0) + 1;
    perFile.push({ path: f.path, language, status, tool: (EXEC.LANG_SPEC[language] && EXEC.LANG_SPEC[language].bin) || null, detail: r.detail || r.reason || "", stderr: r.stderr });
  }
  const checked = counts.PASS + counts.FAIL;
  return {
    ok: true,
    report: {
      offerId: OFFER.id,
      total: input.files.length, counts,
      healthy: counts.FAIL === 0 && counts.PASS > 0,
      checkAccuracyBasis: `${checked} files executed against their real toolchain; ${counts.UNSUPPORTED} unsupported, ${counts.BLOCKED} blocked (excluded from pass/fail)`,
      perFile,
      limits: OFFER.limits,
      note: "Evidence-based syntax/type CHECK report. NOT an audit/certification/guarantee. UNSUPPORTED/BLOCKED are declared, never counted as PASS. No file content is retained after the run; nothing is sent anywhere.",
    },
  };
}

export { OFFER, runHealthCheck, SUPPORTED };
module.exports = { OFFER, runHealthCheck, SUPPORTED };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ offer: OFFER.id, journey: OFFER.journey }, null, 2) + "\n");
}
