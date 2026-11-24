#!/usr/bin/env node
"use strict";
/* V17.5 — offline tests for odg-register-dependency-graph (DEPG-1 / CONT-1) and its use by odg-strategic-register
 * (deps[] / depsStated / DEP-1) and mission-priority-selector (eligibility gate, R1_MORE_UNBLOCKING). Synthetic fixtures
 * are labelled; the real committed register is computed in-process. No network, no model. */
const DG = require("./odg-register-dependency-graph.js");
const REG = require("./odg-strategic-register.js");
const SEL = require("./mission-priority-selector.js");
const SS = require("../bin/odg-strategic-select.ts");
const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const CF = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const PIN = "a".repeat(64);
const contract = (L: string, over: any = {}) => ({
  scenario: L, title: L + " — t", state: "PROPOSED", authorizedBy: null,
  initialState: Object.assign({ status: "PARTIAL", evidence: ["e1"], missingForPass: "something internal" }, over.initialState || {}),
  WORK_ITEM_CONTRACT: Object.assign({ objective: "do " + L, scope: "x", write_set: ["docs/odg/evidence/V160_SCENARIO_" + L + ".json"], acceptance_criteria: ["x"], stop_conditions: ["y"] }, over.wic || {}),
  ...(over.parent ? { parent: over.parent } : {}),
});
// FIXTURE (labelled, synthetic): Y produces out/y.json and runtime/bin/y-run.ts; X declares out/y.json as a pinned dataset
// input and its runner requires Y's runner; Z only shares an input no item produces and has a parent lineage to Y.
const fx = (o: any = {}) => {
  const contracts = [
    contract("Y", { wic: { write_set: ["out/y.json", "runtime/bin/y-run.ts"] } }),
    contract("X", { wic: { write_set: ["runtime/bin/x-run.ts", "out/x.json"], preRegistration: { dataset: { control: { file: "out/y.json", sha256: PIN }, corpus: { file: "shared/corpus.ts" } } } } }),
    contract("Z", { parent: { scenario: "Y", relation: "lineage" }, wic: { write_set: ["runtime/core/<placeholder>.ts"], preRegistration: { dataset: { file: "shared/corpus.ts" } } } }),
    contract("W", { wic: { write_set: ["out"] } }),
  ];
  const evidence = { files: { "out/y.json": { exists: o.yExists !== false, sha256: o.ySha || PIN }, "shared/corpus.ts": { exists: true, sha256: "b".repeat(64) }, "runtime/bin/y-run.ts": { exists: true, sha256: "c".repeat(64) }, "runtime/bin/x-run.ts": { exists: true, sha256: "d".repeat(64) } },
    requires: { "runtime/bin/x-run.ts": [{ specifier: "./y-run.js", resolved: "runtime/bin/y-run.ts" }, { specifier: "../core/<placeholder>.js", resolved: "runtime/core/<placeholder>.ts" }] } };
  return { contracts: { path: CF, data: { contracts } }, evidence };
};
const items4 = ["Y", "X", "Z", "W"].map((id) => ({ id, kind: "WORK_ITEM_CONTRACT" }));
const g = DG.deriveDependencyGraph({ ...fx(), items: items4 });

// ── edge derivation ──
check("DATASET_INPUT X→Y via the pinned dataset file; CODE_IMPORT X→Y via the runner require", g.edges.some((e: any) => e.from === "X" && e.to === "Y" && e.kind === "DATASET_INPUT" && e.via === "out/y.json") && g.edges.some((e: any) => e.from === "X" && e.to === "Y" && e.kind === "CODE_IMPORT" && e.via === "runtime/bin/y-run.ts"));
check("every edge cites a source path#field and a producer-side pointer", g.edges.length > 0 && g.edges.every((e: any) => typeof e.source === "string" && /#/.test(e.source) && typeof e.targetSource === "string" && e.targetSource.length > 0 && typeof e.satisfiedBasis === "string"));
check("lineage (contract.parent) is NOT a dependency; a shared input no item produces is NOT a dependency; placeholders never match", !g.edges.some((e: any) => e.from === "Z"));
check("no self-edges", g.edges.every((e: any) => e.from !== e.to));
check("pinned + committed ⇒ satisfied ⇒ deps would be empty (nothing to unblock)", g.edges.filter((e: any) => e.from === "X").every((e: any) => e.satisfied) && g.byItem.X.unsatisfiedDeps.length === 0 && g.byItem.Y.fanOut === 1 && g.byItem.Y.blockingFanOut === 0);
const gm = DG.deriveDependencyGraph({ ...fx({ ySha: "e".repeat(64) }), items: items4 });
check("sha256 ≠ pin ⇒ DATASET_INPUT unsatisfied (the runner would refuse) ⇒ Y blocks X", gm.edges.find((e: any) => e.kind === "DATASET_INPUT").satisfied === false && /≠ pinned/.test(gm.edges.find((e: any) => e.kind === "DATASET_INPUT").satisfiedBasis) && gm.byItem.Y.blockingDependents.join() === "X");
const ga = DG.deriveDependencyGraph({ ...fx({ yExists: false }), items: items4 });
check("input not committed ⇒ unsatisfied", ga.edges.find((e: any) => e.kind === "DATASET_INPUT").satisfied === false && /not committed/.test(ga.edges.find((e: any) => e.kind === "DATASET_INPUT").satisfiedBasis));
check("determinism: same input ⇒ byte-identical graph; input order does not matter", JSON.stringify(DG.deriveDependencyGraph({ ...fx(), items: items4 })) === JSON.stringify(g)
  && (() => { const r = fx(); r.contracts.data.contracts.reverse(); const t = (gg: any) => JSON.stringify(gg.edges.map((e: any) => [e.from, e.to, e.kind, e.via, e.satisfied])); return t(DG.deriveDependencyGraph({ ...r, items: items4 })) === t(g); })());
// ── contention is separate ──
check("CONT-1: W's 'out' directory overlaps Y's and X's outputs ⇒ WRITESET_OVERLAP pairs, and none becomes an edge", g.contention.pairs.some((p: any) => p.reason === "WRITESET_OVERLAP" && [p.a, p.b].sort().join() === "W,Y") && !g.edges.some((e: any) => e.from === "W" || e.to === "W"));
check("CONT-1: a placeholder write_set is UNKNOWN (fail-closed) and counted, never a dependency", g.contention.unknownWriteSets.join() === "Z" && g.contention.unknownPairs === 3);
// ── uniform application over every item kind ──
check("non-contract kinds ⇒ dependencyGraph NOT_MEASURED with a reason (no invented edge)", (() => { const gg = DG.deriveDependencyGraph({ ...fx(), items: items4.concat([{ id: "T1", kind: "V150_TOP10_ITEM" }, { id: "GAP", kind: "CP8_CAPABILITY_GAP" }]) }); return ["T1", "GAP"].every((k) => gg.byItem[k].status === "NOT_MEASURED" && /declare no inputs/.test(gg.byItem[k].reason) && gg.byItem[k].fanOut === 0); })());

// ── register integration (fixture) ──
const v150 = { sectionsStatus: [{ id: "§45", status: "PARTIALLY_VALIDATED", title: "§45 — BATTERIE DE DÉMONSTRATION DE L'AUTONOMIE" }], summary: { top10NextInternal: [], alsoInternal: [], ownerGated: [] } };
const srcs = (o: any = {}) => { const x = fx(o); return { contracts: x.contracts, v150: { path: "v150.json", data: v150 }, cp8: null, scenarioEvidence: [], dependencyEvidence: x.evidence }; };
const R = REG.buildRegister(srcs());
const ri = (reg: any, id: string) => reg.items.find((x: any) => x.id === id);
check("register: only X's DATASET_INPUT (can fail) is a stated prerequisite ⇒ DEP-1 MEASURED 1/1 (source = its pointer); the CODE_IMPORT edge is recorded but structural only; deps []", ri(R, "X").criteria.dependencyAvailability.status === "MEASURED" && ri(R, "X").criteria.dependencyAvailability.value === 1 && ri(R, "X").depsStated.length === 1 && ri(R, "X").depsStated[0].kind === "ITEM_DATASET_INPUT" && ri(R, "X").criteria.dependencyAvailability.rule === "DEP-1" && ri(R, "X").criteria.dependencyAvailability.source.every((s: string) => /#/.test(s)) && ri(R, "X").deps.length === 0 && ri(R, "X").dependencyEdges.length === 2 && /structural CODE_IMPORT/.test(ri(R, "X").depsNote));
// #969 inspection: a contract whose ONLY edge is CODE_IMPORT keeps DEP-1 NOT_MEASURED (satisfied-by-construction is not availability).
{ const x = fx(); x.contracts.data.contracts[1].WORK_ITEM_CONTRACT.preRegistration = undefined;
  const RC = REG.buildRegister({ contracts: x.contracts, v150: { path: "v150.json", data: v150 }, cp8: null, scenarioEvidence: [], dependencyEvidence: x.evidence });
  check("VISIBLE OUTCOME CHANGE (#969): CODE_IMPORT-only item ⇒ DEP-1 stays NOT_MEASURED, deps [], edge still counted in Y's fanOut", ri(RC, "X").criteria.dependencyAvailability.status === "NOT_MEASURED" && ri(RC, "X").deps.length === 0 && ri(RC, "X").dependencyEdges.length === 1 && ri(RC, "X").dependencyEdges[0].kind === "CODE_IMPORT" && RC.dependencyGraph.fanOut.Y.fanOut === 1); }
check("stale write_sets: a write_set .ts entry that is not committed is recorded (limit), contract untouched", (() => { const x = fx(); (x.evidence.files as any)["runtime/bin/x-run.ts"] = { exists: false, sha256: null }; const gg = DG.deriveDependencyGraph({ ...x, items: items4 }); return gg.staleWriteSets.some((w: any) => w.item === "X" && w.file === "runtime/bin/x-run.ts" && /write_set\[0\]/.test(w.source)); })());
check("register: an item with no edge keeps DEP-1 NOT_MEASURED (absence is not availability)", ri(R, "Y").criteria.dependencyAvailability.status === "NOT_MEASURED" && ri(R, "Z").criteria.dependencyAvailability.status === "NOT_MEASURED");
check("register: fan-out exposed (register.dependencyGraph.fanOut + item.dependencyGraph)", R.dependencyGraph.fanOut.Y.fanOut === 1 && R.dependencyGraph.fanOut.Y.dependents.join() === "X" && ri(R, "Y").dependencyGraph.fanOut === 1);
const RM = REG.buildRegister(srcs({ ySha: "e".repeat(64) }));
check("VISIBLE OUTCOME CHANGE (cause: X's pinned control file no longer matches): DEP-1 of X = 0/1, deps [Y] ⇒ the selector's REUSED gate defers X and R1 counts Y unblocks 1",
  ri(RM, "X").criteria.dependencyAvailability.value === 0 && ri(RM, "X").deps.join() === "Y"
  && (() => { const d = SEL.selectNextExplained(REG.toSelectorCandidates(RM), { weights: REG.WEIGHTS, directions: REG.DIRECTIONS }); return d.excluded.some((e: any) => e.id === "X" && /dependency unmet/.test(e.reason)) && d.ranking.find((r: any) => r.id === "Y").unblocks === 1; })());
// STATED_TEXT: the existing 'scenario X' statement now enters DEP-1 uniformly (it used to fill deps only).
const RS = REG.buildRegister({ ...srcs(), contracts: { path: CF, data: { contracts: [contract("D"), contract("I", { initialState: { missingForPass: "needs scenario D first" } })] } } });
check("VISIBLE OUTCOME CHANGE (cause: 'needs scenario D first' is a stated dependency; D PARTIAL does not state completion): I deps [D] as before AND DEP-1 now MEASURED 0/1 (was NOT_MEASURED)", ri(RS, "I").deps.join() === "D" && ri(RS, "I").criteria.dependencyAvailability.status === "MEASURED" && ri(RS, "I").criteria.dependencyAvailability.value === 0 && ri(RS, "I").dependencyEdges[0].kind === "STATED_TEXT");
// R1 can now discriminate: two tied candidates, one of which another item is blocked on.
{
  const cand = (id: string, deps: string[] = []) => ({ id, status: "PARTIAL", deps, criteria: { a: { status: "MEASURED", value: 0.7 } } });
  const d = SEL.selectNextExplained([cand("P1"), cand("P2"), { ...cand("Q", ["P2"]), criteria: { a: { status: "MEASURED", value: 0.1 } } }], { weights: { a: 1 } });
  check("R1_MORE_UNBLOCKING resolves a tie from a blocking deps edge (selector unchanged)", d.decision === "TIE_EXPLAINED" && d.selected.id === "P2" && d.resolvedBy === "R1_MORE_UNBLOCKING");
}

// ── real committed register (in-process) ──
const ROOT = path.resolve(__dirname, "..", "..");
const sources = SS.loadSources(ROOT);
const rec = SS.compute(sources);
const reg = rec.register;
const kinds = Array.from(new Set(reg.items.map((it: any) => it.kind))).sort();
check("uniform: every register item kind is enumerated and every item carries a dependencyGraph (DERIVED for contracts, NOT_MEASURED + reason otherwise)", kinds.join() === "CP8_CAPABILITY_GAP,CP8_METHOD_CARD,V150_ALSO_INTERNAL,V150_OWNER_GATED,V150_TOP10_ITEM,WORK_ITEM_CONTRACT"
  && reg.items.every((it: any) => it.dependencyGraph && (it.kind === "WORK_ITEM_CONTRACT" ? it.dependencyGraph.status === "DERIVED" : it.dependencyGraph.status === "NOT_MEASURED" && typeof it.dependencyGraph.reason === "string")));
const E = reg.dependencyGraph.edges;
check("real: 4 edges — J2→J DATASET_INPUT (controlReference V161_SCENARIO_J.json, sha256 = pin), G2→G and G2→H CODE_IMPORT, V175-NB1→V175-NB2 CODE_IMPORT (NB1's rules-authored test requires the helper NB2 repairs) — all satisfied", E.length === 4
  && E.some((e: any) => e.from === "V175-NB1" && e.to === "V175-NB2" && e.kind === "CODE_IMPORT" && e.via === "runtime/core/odg-canonical-json.ts" && e.satisfied)
  && E.some((e: any) => e.from === "J2" && e.to === "J" && e.kind === "DATASET_INPUT" && /controlReference\.file$/.test(e.source) && e.satisfied)
  && E.some((e: any) => e.from === "G2" && e.to === "G" && e.kind === "CODE_IMPORT" && e.satisfied) && E.some((e: any) => e.from === "G2" && e.to === "H" && e.kind === "CODE_IMPORT" && e.satisfied));
check("real: fan-out J=1 (J2), G=1 (G2), H=1 (G2); blockingFanOut 0 everywhere ⇒ deps [] everywhere (R1 has nothing to count yet)", reg.dependencyGraph.fanOut.J.fanOut === 1 && reg.dependencyGraph.fanOut.G.fanOut === 1 && reg.dependencyGraph.fanOut.H.fanOut === 1 && reg.items.every((it: any) => it.deps.length === 0));
check("VISIBLE OUTCOME CHANGE (cause: J2→J DATASET_INPUT satisfied, pin checked): J2 dependencyAvailability NOT_MEASURED → MEASURED 1", reg.items.find((it: any) => it.id === "J2").criteria.dependencyAvailability.value === 1);
check("#969: G2's only edges are CODE_IMPORT (structural) ⇒ G2 dependencyAvailability stays NOT_MEASURED; G/H fanOut still exposed", reg.items.find((it: any) => it.id === "G2").criteria.dependencyAvailability.status === "NOT_MEASURED" && reg.dependencyGraph.dep1Kinds.join() === "DATASET_INPUT,STATED_TEXT");
check("real: stale write_sets disclosed — J and F list odg-v160 runners that are not committed (J2 imports the odg-v161 ones)", ["J", "F"].every((k) => reg.dependencyGraph.staleWriteSets.some((w: any) => w.item === k && /odg-v160-scenario-[jf]-run\.ts$/.test(w.file))));
check("real: strategic decision unchanged — SELECTED J (J2's +0.1 does not reach the leader)", rec.decisionRecord.decision === "SELECTED" && rec.decisionRecord.selected === "J");
check("real: CP8 capability gaps keep DEP-2 (not re-derived)", reg.items.filter((it: any) => it.kind === "CP8_CAPABILITY_GAP").every((it: any) => it.criteria.dependencyAvailability.rule === "DEP-2"));
check("no dependency STATED ≠ no dependency: every edge-less WORK_ITEM_CONTRACT without another stated prerequisite is NOT_MEASURED with a 'no dependency stated' reason; independenceStated is empty (never inferred)", reg.dependencyGraph.independenceStated.length === 0 && reg.items.filter((it: any) => it.kind === "WORK_ITEM_CONTRACT" && it.depsStated.length === 0).every((it: any) => it.criteria.dependencyAvailability.status === "NOT_MEASURED" && /no dependency stated/.test(it.criteria.dependencyAvailability.reason)));
check("uniform DEP-1 over all items: every MEASURED dependencyAvailability cites a failable prerequisite (owner authorization / OTHER_WORK / DATASET_INPUT / STATED_TEXT / DEP-2 owner question), never CODE_IMPORT", reg.items.length === reg.items.filter((it: any) => it && it.id).length && reg.items.length >= 58 && /* V17.5: 59 with V175-NB1 — not hard-coded */ reg.items.filter((it: any) => it.criteria.dependencyAvailability.status === "MEASURED").every((it: any) => it.depsStated.length > 0 && it.depsStated.every((d: any) => d.kind !== "ITEM_CODE_IMPORT")));
const GO = require("./odg-go-cycle.js");
check("GO SELECT trace view: dependencyView projects the register's deps/fanOut read-only (J: fanOut 1 ← J2; J2: dependsOn J, DEP-1 1)", (() => { const j = GO.dependencyView(reg.items.find((x: any) => x.id === "J")), j2 = GO.dependencyView(reg.items.find((x: any) => x.id === "J2")); return j.fanOut === 1 && j.dependents.join() === "J2" && j.deps.length === 0 && j2.dependsOn.join() === "J" && j2.dependencyAvailability.value === 1 && GO.dependencyView(null) === null; })());
// ── no-circularity + reproducibility ──
const inputs = sources.inputs.map((i: any) => i.source);
// (V164_GO_CYCLE.json is a PRE-EXISTING BLK-2 benefit input of the register — declared BLOCKER_FIELDS — not a DEPG-1 input.)
const depgFiles = Object.keys(sources.dependencyEvidence.files).concat(Object.keys(sources.dependencyEvidence.requires));
check("no-circularity: the committed register output and the GO cycle record are not DEPG-1 inputs (files stat'd/parsed); the register output is never a loader input", !inputs.includes("docs/odg/evidence/V164_STRATEGIC_REGISTER.json") && depgFiles.length > 0 && !depgFiles.some((p: string) => /V164_(STRATEGIC_REGISTER|GO_CYCLE)\.json$/.test(p)));
check("no-circularity: the graph is independent of selector output (derived before selection; same graph from the bare register builder)", JSON.stringify(REG.buildRegister(sources).dependencyGraph) === JSON.stringify(reg.dependencyGraph));
check("reproducible: two computations byte-identical; --check OK against the committed record", JSON.stringify(SS.compute(SS.loadSources(ROOT))) === JSON.stringify(rec) && SS.main(["--check", "--root", ROOT]) === 0);

if (f) { process.stdout.write(`\n${f} FAILED\n`); process.exit(1); }
process.stdout.write("\nALL PASS — odg-register-dependency-graph (DEPG-1 edges cite sources, uniform over item kinds, NOT_MEASURED preserved, contention separate, no circularity, reproducible)\n");
export {};
