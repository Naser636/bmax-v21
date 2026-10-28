#!/usr/bin/env node
/**
 * code-mission-intake — V45 Lot A: wires project-signal-detector into a real routing DECISION, composed with
 * code-execution's actual toolchain/checker support. Detection genuinely CHANGES the route:
 *   EXECUTE            — detected primary language has a verified ODG checker AND its toolchain is available
 *                        (JS/TS/Python) ⇒ route to the real code-execution path.
 *   ROUTE_UNSUPPORTED  — a language IS detected but ODG has no executable checker / no toolchain (Go/Rust/Java/…)
 *                        ⇒ truthfully not actionable here ⇒ subcontract/partner (axis D), NOT faked.
 *   ABSTAIN            — no language detected / ambiguous ⇒ honest no-op with a next action.
 *
 * Reuses the existing detector + executor (no new registry/orchestrator). Pure/deterministic; the toolchain probe is
 * injectable for tests. Nothing is executed here — this returns the ROUTE; code-execution runs the check.
 */
"use strict";

const DET = require("./project-signal-detector.js");
const EXEC = require("./code-execution.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/**
 * routeCodeMission(repo, opts?): detect → resolve against ODG's real checker support → routing decision.
 * opts.toolchain overrides the probe (tests). Returns { route, language, reason, nextAction, detection }.
 */
function routeCodeMission(repo: any, opts: any = {}): any {
  const detection = DET.detectSignals(repo);
  if (!detection.ok) return { ok: false, code: "INVALID_INPUT", detail: detection.detail };

  const toolchain = isObj(opts.toolchain) ? opts.toolchain : EXEC.detectToolchain(opts.runner ? { runner: opts.runner } : {});
  const primary = detection.primaryLang;
  const hasChecker = !!EXEC.LANG_SPEC[primary];
  const toolchainOk = toolchain[primary] === true;

  let route: string, reason: string, nextAction: string;
  if (detection.languages.length === 0) {
    route = "ABSTAIN"; reason = "no language detected (ambiguous/unknown repo)"; nextAction = "request a manifest or clearer inputs; do not proceed";
  } else if (hasChecker && toolchainOk) {
    route = "EXECUTE"; reason = `${primary} has a verified ODG checker and its toolchain is available`; nextAction = `code-execution.runSyntaxCheck({ language: "${primary}", content })`;
  } else {
    route = "ROUTE_UNSUPPORTED"; reason = hasChecker ? `${primary} checker exists but no toolchain in this runtime` : `${primary} has no verified ODG executable checker — detection only`; nextAction = "route to axis-D subcontracting/partner (a prime with the toolchain); ODG does NOT fake execution";
  }
  return {
    ok: true, route, language: primary, confidence: detection.languages[0] ? detection.languages[0].confidence : 0,
    toolchainAvailable: toolchainOk, hasChecker, frameworks: detection.frameworks, domains: detection.domains,
    reason, nextAction,
    detection: { odgActionableBuild: detection.odgActionable, capabilityResolution: detection.capabilityResolution },
    note: "Detection drives the route. EXECUTE = ODG can run a real syntax/type CHECK (JS/TS/Python). ROUTE_UNSUPPORTED = detected but not executable here (no faked execution). A check is a verification capability, NOT full build/delivery.",
  };
}

export { routeCodeMission };
module.exports = { routeCodeMission };

if (require.main === module) {
  process.stdout.write(JSON.stringify(routeCodeMission({ files: ["src/app.ts"], manifests: { "package.json": {} } }), null, 2) + "\n");
}
