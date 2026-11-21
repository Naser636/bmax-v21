#!/usr/bin/env node
"use strict";
/* Tests for odg-component-judgment (V361-D P1). Injected signals ⇒ deterministic, zero fs. Proves the 13-status taxonomy
 * is assigned from POSITIVE evidence, ORPHANED_CONFIRMED is NEVER inferred (only explicit confirmation), static-absence ⇒
 * DORMANT/UNKNOWN not orphan, name-signals are LOW confidence, and the distribution/actionable set reconcile. */
const M = require("./odg-component-judgment.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const st = (m: string, sig: any) => M.judgeModule(m, sig).status;

function main(): void {
  // --- each status reachable from its grounded signal ---
  check("dynamic-use signal ⇒ APP_DYNAMIC_CONSUMED (HIGH)", st("a", { dynamicUse: true }) === "APP_DYNAMIC_CONSUMED" && M.judgeModule("a", { dynamicUse: true }).confidence === "HIGH");
  check("app import-context ref ⇒ APP_DYNAMIC_CONSUMED (MEDIUM)", st("a", { appRef: "IMPORT" }) === "APP_DYNAMIC_CONSUMED" && M.judgeModule("a", { appRef: "IMPORT" }).confidence === "MEDIUM");
  check("app DATA-string ref is NOT consumption (falls through)", st("a", { appRef: "STRING", exportsApi: true }) === "MISSING_CONSUMER");
  check("indirect consumer ⇒ INDIRECTLY_CONSUMED", st("a", { indirectConsumer: true }) === "INDIRECTLY_CONSUMED");
  check("owner-gated ⇒ BLOCKED (not orphan)", st("a", { ownerGated: true, exportsApi: false }) === "BLOCKED");
  check("blocked dependency ⇒ BLOCKED", st("a", { blockedDependency: true }) === "BLOCKED");
  check("intentional-dormant registry ⇒ DORMANT_INTENTIONAL", st("a", { intentionalDormant: true }) === "DORMANT_INTENTIONAL");
  check("demonstrator ⇒ DEMONSTRATOR", st("a", { demonstrator: true }) === "DEMONSTRATOR");
  check("superseded registry ⇒ SUPERSEDED (HIGH)", M.judgeModule("a", { supersededByRegistry: true }).confidence === "HIGH" && st("a", { supersededByRegistry: true }) === "SUPERSEDED");
  check("name -v2 ⇒ SUPERSEDED but LOW confidence (lexical only)", st("engine-v2", {}) === "SUPERSEDED" && M.judgeModule("engine-v2", {}).confidence === "LOW");
  check("name -poc ⇒ EXPERIMENTAL LOW", st("x-poc", {}) === "EXPERIMENTAL" && M.judgeModule("x-poc", {}).confidence === "LOW");
  check("require.main + no bin + no export API ⇒ MISSING_ENTRYPOINT (CLI-primary)", st("a", { hasRequireMain: true, binWired: false }) === "MISSING_ENTRYPOINT");
  check("exports API + require.main SELF-DEMO ⇒ MISSING_CONSUMER (demo incidental, not a missing entrypoint)", st("a", { hasRequireMain: true, binWired: false, exportsApi: true }) === "MISSING_CONSUMER");
  check("index/registry member ⇒ LEGITIMATE_LIBRARY", st("a", { indexMember: true }) === "LEGITIMATE_LIBRARY");
  check("exports API, no consumer ⇒ MISSING_CONSUMER (MEDIUM with test)", st("a", { exportsApi: true, hasTest: true }) === "MISSING_CONSUMER" && M.judgeModule("a", { exportsApi: true, hasTest: true }).confidence === "MEDIUM");
  check("no API, no consumer ⇒ DORMANT_ACTIONABLE (not orphan)", st("a", { exportsApi: false }) === "DORMANT_ACTIONABLE");
  check("no grounded signal at all ⇒ UNKNOWN (never defaulted to orphan)", st("a", {}) === "UNKNOWN");

  // --- the core honesty rule: ORPHANED_CONFIRMED is NEVER inferred ---
  check("exports-API + no consumer is NEVER auto-orphan", st("a", { exportsApi: true }) !== "ORPHANED_CONFIRMED");
  check("ORPHANED_CONFIRMED ONLY via explicit confirmation", st("a", { confirmedOrphan: true }) === "ORPHANED_CONFIRMED");
  check("confirmation overrides even an exports-API module (owner is authoritative)", st("a", { confirmedOrphan: true, exportsApi: true }) === "ORPHANED_CONFIRMED");

  // --- precedence: positive consumption beats a name signal; blocked beats missing-consumer ---
  check("dynamic use beats a -v2 name (not mislabelled SUPERSEDED)", st("engine-v2", { dynamicUse: true }) === "APP_DYNAMIC_CONSUMED");
  check("owner-gated API ⇒ BLOCKED, not MISSING_CONSUMER", st("a", { ownerGated: true, exportsApi: true }) === "BLOCKED");

  // --- judge(): distribution + actionable reconcile; confirmedOrphans wiring; no fabricated orphan ---
  const r = M.judge({
    modules: ["lib-i", "api-nc", "dorm", "gate", "demo", "conf", "unk"],
    signals: { "lib-i": { indexMember: true }, "api-nc": { exportsApi: true, hasTest: true }, dorm: { exportsApi: false }, gate: { ownerGated: true }, demo: { demonstrator: true }, unk: {} },
    confirmedOrphans: ["conf"],
  });
  check("judge total reconciles", r.total === 7 && Object.values(r.byStatus).reduce((a: any, b: any) => a + b, 0) === 7);
  check("confirmedOrphans wires ONLY the named module to ORPHANED_CONFIRMED", r.orphanConfirmed === 1 && r.dispositions.find((d: any) => d.module === "conf").status === "ORPHANED_CONFIRMED");
  check("no OTHER module is an orphan (static-absence never confirms)", r.byStatus.ORPHANED_CONFIRMED === 1);
  check("actionable = MISSING_CONSUMER + DORMANT_ACTIONABLE candidates (api-nc, dorm)", r.actionable.indexOf("api-nc") >= 0 && r.actionable.indexOf("dorm") >= 0 && r.actionable.indexOf("gate") < 0 && r.actionable.indexOf("demo") < 0);
  check("module with no signal bundle ⇒ UNKNOWN honestly (not fabricated)", r.dispositions.find((d: any) => d.module === "unk").status === "UNKNOWN");

  // leak fix: a per-module signal bundle CANNOT self-confirm an orphan — only the top-level confirmedOrphans owner set can.
  const rLeak = M.judge({ modules: ["sneak"], signals: { sneak: { confirmedOrphan: true, exportsApi: true } }, confirmedOrphans: [] });
  check("signals[m].confirmedOrphan is STRIPPED (owner set is the only orphan source)", rLeak.dispositions[0].status !== "ORPHANED_CONFIRMED" && rLeak.orphanConfirmed === 0);
  check("ownerGated is MEDIUM confidence (text-marker candidate, not a verified gate)", M.judgeModule("a", { ownerGated: true }).confidence === "MEDIUM");

  check("frozen + contract invariants (no inferred orphan; positive evidence; name=LOW; read-only)", Object.isFrozen(r) &&
    /ORPHANED_CONFIRMED is NEVER inferred/.test(JSON.stringify(M.COMPONENT_JUDGMENT_CONTRACT.invariants)) &&
    /require POSITIVE evidence/.test(JSON.stringify(M.COMPONENT_JUDGMENT_CONTRACT.invariants)) &&
    /auto-activates\/retires\/merges nothing/.test(JSON.stringify(M.COMPONENT_JUDGMENT_CONTRACT.invariants)) &&
    M.STATUSES.length === 13);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-component-judgment (V361-D P1: 13-status per-module disposition over the census decision surface; ORPHANED_CONFIRMED never inferred — only explicit confirmation; consumed/library need positive evidence; name-signals LOW; composes census, fabricates nothing, auto-activates/retires/merges nothing)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
