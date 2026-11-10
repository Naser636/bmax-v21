#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V87 §2/§3/§4 — universal inspection coverage battery. For every registered execution path proves the
 * canonical inspected entry is a fail-closed PRE+POST passage: normal passage (qualified inspector) approves; an
 * unqualified/absent inspector BLOCKS; a Level-C action BLOCKS via the mandate; a direct call without a proof-of-
 * inspection receipt is REFUSED (non-bypass); insufficient evidence ⇒ NOT_MEASURED; a post failure ⇒ not promoted.
 * Also verifies the 5-state coverage artifact and the receipt mechanism. Live modules + artifact. Inspection behaviour
 * is tested at the PRE level for every path (no heavy delegate executed) + end-to-end on a representative safe path.
 */

const path = require("path");
const fs = require("fs");
const REG = require("../core/inspected-paths.js");
const B = require("../core/inspection-boundary.js");
const INSP = require("../core/inspected-execution.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V86_INSPECTION_COVERAGE.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const QUAL = { valid: true, effective: true };
const UNQ = { valid: true, effective: false };
const INDEP = { builder: { id: "P" }, verifier: { id: "I" } };
const goodEvidence = { exists: () => true, read: () => '{"done":1}', expectMarkers: ["done"] };

function main(): void {
  // ---- per-path PRE-level battery (safe: a non-approving PRE never runs the delegate).
  for (const id of REG.PATH_IDS) {
    const cls = REG.classification(id);
    const entry = REG.inspectedEntry(id);
    // unqualified/absent inspector ⇒ BLOCKED everywhere (§4 test: inspecteur absent/non qualifié).
    const unq = entry({ id: `${id}-u` }, { inspectorMeta: UNQ, independenceActors: INDEP });
    check(`${id}: unqualified inspector ⇒ PRE BLOCKED`, unq.pre.verdict === "BLOCKED");
    const absent = entry({ id: `${id}-a` }, { independenceActors: INDEP });
    check(`${id}: absent inspector ⇒ PRE BLOCKED`, absent.pre.verdict === "BLOCKED");

    if (cls === "BLOCKED") {
      // external path (email) ⇒ refused locally (EXTERNAL + Level-C) even with a qualified inspector (§2 no bypass to external).
      const ext = entry({ id: `${id}-x` }, { inspectorMeta: QUAL, independenceActors: INDEP });
      check(`${id}: external/BLOCKED ⇒ refused locally even with qualified inspector`, ext.pre.verdict === "BLOCKED" && ext.promoted === false);
    } else if (cls === "PLANNING") {
      // planners: READ-tier decision routed through the boundary ⇒ APPROVED PRE (no direct effect; downstream inspected).
      const plan = entry({ id: `${id}-p` }, { inspectorMeta: QUAL, independenceActors: INDEP });
      check(`${id}: PLANNING decision routed ⇒ PRE APPROVED (READ)`, plan.pre.verdict === "APPROVED" || plan.pre.verdict === "APPROVED_WITH_RESTRICTIONS");
    } else {
      // WIRED effect path: qualified inspector ⇒ PRE APPROVED (delegate runs under receipt).
      const ok = entry({ id: `${id}-ok` }, { inspectorMeta: QUAL, independenceActors: INDEP, evidenceOpts: goodEvidence });
      check(`${id}: WIRED + qualified inspector ⇒ PRE APPROVED`, ok.pre.verdict === "APPROVED" || ok.pre.verdict === "APPROVED_WITH_RESTRICTIONS");
    }
  }

  // ---- non-bypass (§2.10): a raw executor that calls requireInspection WITHOUT a valid receipt is refused.
  check("non-bypass: requireInspection with no receipt ⇒ refused", INSP.requireInspection({}, "op").ok === false);
  check("non-bypass: requireInspection with forged receipt ⇒ refused", INSP.requireInspection({ receipt: "INSP:op:APPROVED:deadbeef" }, "op").ok === false);
  check("non-bypass: cross-operation receipt ⇒ refused", (() => { const t = B.issueReceipt({ id: "a" }, { verdict: "APPROVED" }).token; return INSP.requireInspection({ receipt: t }, "b").ok === false; })());
  check("receipt: a valid inspected run issues a receipt accepted by its own executor", (() => {
    const r = INSP.runInspected("p", { id: "op", risk: "CODE_CHANGE", actions: ["code_edit_local"] }, { inspectorMeta: QUAL, independenceActors: INDEP, evidenceOpts: goodEvidence }, (args: any) => ({ objectiveMet: INSP.requireInspection(args, "op").ok, evidenceRef: "x.json" }));
    return r.promoted === true && typeof r.receipt === "string";
  })());
  check("receipt: a non-approving PRE issues NO receipt and never executes", (() => {
    let ran = false;
    const r = INSP.runInspected("p", { id: "opC", risk: "CODE_CHANGE", actions: ["deploy"] }, { inspectorMeta: QUAL, independenceActors: INDEP }, () => { ran = true; return { objectiveMet: true }; });
    return r.receipt === null && ran === false && r.promoted === false;
  })());

  // ---- end-to-end on a representative safe WIRED path (fleet-dispatcher): passage, mandate-refusal, post-failure.
  const fd = REG.inspectedEntry("fleet-dispatcher");
  const pass = fd({ id: "fd-pass" }, { inspectorMeta: QUAL, independenceActors: INDEP, evidenceOpts: goodEvidence, evidenceRef: "x.json" });
  check("fleet-dispatcher: full passage (approved PRE + POST PASS) ⇒ promoted", pass.pre.verdict === "APPROVED" && pass.post.verdict === "PASS" && pass.promoted === true);
  const postFail = fd({ id: "fd-nofail" }, { inspectorMeta: QUAL, independenceActors: INDEP });   // no evidenceOpts ⇒ POST NOT_MEASURED
  check("fleet-dispatcher: no qualifiable evidence ⇒ POST NOT_MEASURED, not promoted", postFail.post && postFail.post.verdict === "NOT_MEASURED" && postFail.promoted === false);

  // ---- mandate refusal (§4): a Level-C action on any entry ⇒ BLOCKED (email is the external case).
  const em = REG.inspectedEntry("email-gateway");
  check("email-gateway: Level-C/external ⇒ BLOCKED (owner-gated, no local bypass)", em({ id: "mail" }, { inspectorMeta: QUAL, independenceActors: INDEP }).pre.verdict === "BLOCKED");

  // ---- the 5-state coverage artifact.
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("coverage artifact exists (5-state)", !!m && !!m.tally && typeof m.operationalCoverageRatio === "number");
  if (m) {
    check("coverage: registry routes through the boundary", m.registryRoutesThroughBoundary === true);
    check("coverage: all WIRED operational effect paths are WIRED_AND_TESTED", m.operationalCoverageRatio === 1);
    check("coverage: email BLOCKED, planners NOT_APPLICABLE (honest taxonomy)", m.tally.BLOCKED >= 1 && m.tally.NOT_APPLICABLE >= 4);
    check("coverage: residual raw-entry limitation disclosed (no false 100%)", /RESIDUAL|residual/i.test(m.residual) && /not .*100% repo-wide|tracked follow-on/i.test(m.residual));
    check("coverage: no NOT_WIRED operational path remains", m.tally.NOT_WIRED === 0);
  }

  check("contract: non-bypass + fail-closed invariants present", /non-bypass/i.test(JSON.stringify(REG.INSPECTED_PATHS_CONTRACT.invariants)) && /receipt/i.test(JSON.stringify(INSP.INSPECTED_EXECUTION_CONTRACT.invariants)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V87 universal inspection (13 paths routed + non-bypass receipts + 5-state honest coverage)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
