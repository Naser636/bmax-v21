#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO — "ODG Autonomous Roadmap Execution & Completion Governance" chantier INTEGRATION. The twelve lots A–L are
 * NOT invented: they formalize the EXISTING canonical ODG_AUTONOMOUS_WORK_PROTOCOL.json (14-step workflow, 9-state ladder
 * PROPOSED→AUTHORIZED→EXECUTING→VERIFIED→ACCEPTED, WIC schema, approval gates). This maps each lot to a canonical
 * component (verified present), a primitive, a program P1–P10, a test and a proof, with a closure criterion — NO
 * duplicate, identifiers/history preserved, satisfied requirements kept with their proof. Read-only audit/integration;
 * no new primitive, no parallel roadmap. Integration is the START of execution, not completion. Run: `odg-governance-chantier-matrix.ts`.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
function present(rel: string): boolean { try { return fs.existsSync(path.join(ROOT, rel)); } catch { return false; } }
function mod(m: string): boolean { return present("runtime/core/" + m + ".ts"); }

const protocolPresent = present("ODG_AUTONOMOUS_WORK_PROTOCOL.json");

// 12 lots A–L derived from the protocol's workflow/states — each bound to an EXISTING canonical component.
const LOTS = [
  { lot: "A", name: "Compass start & continuity", protocolStep: "0,12,13 (compass start/continue/finish)", components: ["roadmap-manager", "roadmap-consolidation"], boussole: "ODG_PROJECT_STATE.md", primitive: "evidence-provenance", program: "P1", test: "runtime/bin/v56-coverage-matrix.test.ts", proof: "Boussole updated+reconciled every directive V52–V69", closure: "Boussole matches real HEAD+ledger at start/continue/finish" },
  { lot: "B", name: "Truth Lock", protocolStep: "1 (verify HEAD/branch/worktree/origin)", components: ["truth-lock", "truth-lock-gate"], primitive: "state-transition", program: "P1", test: "runtime/core/truth-lock-gate.test.ts", proof: "truth-lock run at the start of every directive", closure: "HEAD/branch/worktree/origin verified before any change" },
  { lot: "C", name: "Single work-item selection", protocolStep: "2 (exactly one work item)", components: ["campaign-controller"], primitive: "capability-router", program: "P2", test: "runtime/core/autonomy-persistence.test.ts", proof: "V68 scheduler: dep-order, one-at-a-time, BLOCKED-skip", closure: "one active campaign/work-item; dep-ordered selection" },
  { lot: "D", name: "Work-item contract (PROPOSED)", protocolStep: "3 (author WIC)", components: ["mission-contract-factory", "patch-action-contract"], primitive: "mission-contract-factory", program: "P2", test: "runtime/core/mission-contract-factory.test.ts", proof: "WIC schema in protocol; contract-on-demand", closure: "every work item has a PROPOSED contract (objective/scope/write_set/acceptance/evidence)" },
  { lot: "E", name: "Authorization gate (PROPOSED→AUTHORIZED, external)", protocolStep: "4 (human authorization)", components: ["action-gate", "root-of-trust"], primitive: "action-gate", program: "P1/P8", test: "runtime/bin/v61-odg-authority-separation.test.ts", proof: "V61 no self-authorization; V66 loop stops at PROPOSED without external auth", closure: "no EXECUTING before an external AUTHORIZED decision" },
  { lot: "F", name: "Reproduce + root cause", protocolStep: "5 (reproduce before edit)", components: ["rce-root-cause-intelligence", "rce-assurance-chain"], primitive: "evidence-provenance", program: "P2", test: "runtime/core/rce-assurance-chain.test.ts", proof: "V59 XII repair assurance: fix≠its-own-proof", closure: "root cause established + reproduced before modification" },
  { lot: "G", name: "Checkpoint", protocolStep: "6 (create checkpoint)", components: ["checkpoint-engine", "idempotency-guard"], primitive: "checkpoint-engine", program: "P2", test: "runtime/bin/v68-long-task-reliability.test.ts", proof: "V68 recovery 12/12 no re-run", closure: "recoverable checkpoint exists before execution" },
  { lot: "H", name: "Minimal change in write_set (EXECUTING)", protocolStep: "7 (minimal change, write-confinement)", components: ["patch-executor", "patch-action-contract"], primitive: "patch-executor", program: "P2/P8", test: "runtime/core/patch-executor.test.ts", proof: "patch-executor write-confinement (symlink/'..'/hardlink escapes closed)", closure: "only write_set files touched; no scope expansion" },
  { lot: "I", name: "Verify (build+test+regression+runtime+evidence → VERIFIED)", protocolStep: "8 (verify)", components: ["gates-ledger", "mechanical-acceptance", "evidence-provenance"], primitive: "evidence-provenance", program: "P1", test: "runtime/core/v124-section-coverage.test.ts", proof: "full gate 462/462 PASS; a green build alone is never sufficient", closure: "build+test+regression+runtime+evidence_required all pass" },
  { lot: "J", name: "Structured report", protocolStep: "9 (report)", components: ["shared-report-generator"], primitive: "evidence-provenance", program: "P7", test: "runtime/core/shared-report-evidence.test.ts", proof: "O1 reports across pilots/benchmarks", closure: "structured report (truth-lock/contract/diff/verify/evidence/next) produced" },
  { lot: "K", name: "Acceptance (VERIFIED→ACCEPTED) + commit gate", protocolStep: "10 (human acceptance + commit)", components: ["acceptance-facts", "campaign-closure-ledger", "mechanical-acceptance"], primitive: "state-transition", program: "P1", test: "runtime/core/mechanical-acceptance.test.ts", proof: "ACCEPTED needs acceptance+evidence; approval_gates", closure: "VERIFIED→ACCEPTED only on external acceptance; commit human-gated" },
  { lot: "L", name: "Closure governance (no push without approval)", protocolStep: "11,13 (release gate + compass finish)", components: ["campaign-closure-ledger", "roadmap-consolidation"], primitive: "action-gate", program: "P1/P10", test: "runtime/bin/v58-closure-ledger.test.ts", proof: "push/merge/deploy never performed; closure ledger; register", closure: "push/release only on separate explicit human approval; ledger reflects reality" },
];

const lots = LOTS.map((l) => {
  const compsPresent = l.components.every(mod);
  const testPresent = present(l.test);
  return { ...l, componentsPresent: compsPresent, testPresent, grounded: compsPresent && testPresent, status: compsPresent && testPresent ? "INTEGRATED_SATISFIED (reuse; proof kept)" : "INTEGRATED_GAP (build needed)" };
});
const allGrounded = lots.every((l: any) => l.grounded);

const out = {
  "//": "Chantier 'ODG Autonomous Roadmap Execution & Completion Governance' — the 12 lots A–L formalize the EXISTING ODG_AUTONOMOUS_WORK_PROTOCOL.json (not invented). Each lot mapped to a present canonical component + primitive + program + test + proof + closure criterion. No duplicate; identifiers/history preserved; satisfied requirements keep their proof. Integration = START of execution, NOT completion. No new primitive, no parallel roadmap.",
  derivedFrom: "ODG_AUTONOMOUS_WORK_PROTOCOL.json", protocolPresent,
  lotCount: lots.length, allGrounded,
  correspondenceMatrix: lots,
  programsCovered: Array.from(new Set(lots.flatMap((l: any) => l.program.split("/")))).sort(),
  honestConclusion: `The 12 governance lots A–L are INTEGRATED into V12.4 by mapping each to an existing canonical component (protocol workflow steps 0–13, 9-state ladder), a primitive, a program, a test and a proof — ${lots.filter((l: any) => l.grounded).length}/${lots.length} fully grounded (component + test present), 0 duplicates created. Satisfied requirements keep their proof (not rebuilt). Documentary integration is the START of ongoing execution under ODG, NOT a completion claim.`,
  invariant: "Lots A–L reuse existing mechanisms; a lot is INTEGRATED_SATISFIED only if its component + test are present; none is declared complete by integration alone. ODG owns execution; provider bounded (V61). No tenth primitive, no parallel roadmap.",
};
fs.writeFileSync(path.join(ROOT, "docs", "odg", "V70_GOVERNANCE_CHANTIER_MATRIX.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ lots: lots.length, allGrounded, protocolPresent, programsCovered: out.programsCovered }, null, 2) + "\n");
export {};
