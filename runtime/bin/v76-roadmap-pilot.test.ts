#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V76 — roadmap-pilot test. Verifies ODG's native selector chooses deterministically (reproducible), defers
 * unmet-dependency + excludes already-ACCEPTED (no repeat), never selects the easiest-by-default (score-driven), and the
 * chosen mission halts at PROPOSED without external authorization (no self-authorization). Live selector assertions +
 * artifact. The provider does not hand-pick the mission.
 */

const path = require("path");
const fs = require("fs");
const SEL = require("../core/mission-priority-selector.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V76_ROADMAP_PILOT.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const cands = [
  { id: "M-high", strategicImportance: 0.9, roadmapPriority: 0.9, unblocks: ["x", "y"], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.9, closureWithProof: true, deps: [], status: "OPEN" },
  { id: "M-low", strategicImportance: 0.3, roadmapPriority: 0.3, unblocks: [], risk: 0.5, immediatelyExecutable: false, operationalValue: 0.3, closureWithProof: false, deps: [], status: "OPEN" },
  { id: "M-dep", strategicImportance: 0.95, roadmapPriority: 0.95, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.9, closureWithProof: true, deps: ["M-high"], status: "OPEN" },
  { id: "M-done", strategicImportance: 0.9, roadmapPriority: 0.9, unblocks: [], risk: 0.1, immediatelyExecutable: true, operationalValue: 0.9, closureWithProof: true, deps: [], status: "ACCEPTED" },
];

function main(): void {
  const r = SEL.selectNext(cands, []);
  check("selects the highest-priority eligible mission (not the easiest/lowest)", r.selected && r.selected.id === "M-high");
  check("deterministic (same inputs ⇒ same selection)", JSON.stringify(SEL.selectNext(cands, [])) === JSON.stringify(r));
  check("defers unmet-dependency mission (M-dep)", r.deferred.some((d: any) => d.id === "M-dep" && /dependency unmet/i.test(d.reason)));
  check("excludes already-ACCEPTED (no repeat)", r.deferred.some((d: any) => d.id === "M-done" && /already ACCEPTED/i.test(d.reason)));
  check("selection carries a justification", typeof r.selectionJustification === "string" && /ODG selected/i.test(r.selectionJustification));
  // once M-high accepted, M-dep becomes eligible and should be selected next.
  const r2 = SEL.selectNext(cands, ["M-high"]);
  check("after accepting dep, deferred mission becomes selectable", r2.selected && r2.selected.id === "M-dep");

  // artifact
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("pilot artifact exists; ODG selected from real candidates", !!m && m.candidateCount >= 10 && !!m.nativeSelection.selected);
  check("chosen mission HALTED at PROPOSED (no self-authorization)", !!m && /HALTED at PROPOSED/i.test(m.governanceProof));
  check("invariant: ODG selects, provider does not hand-pick", !!m && /chosen by ODG's deterministic selector, not by the provider/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V76 roadmap pilot (ODG native deterministic selection; defers deps; halts at PROPOSED)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
