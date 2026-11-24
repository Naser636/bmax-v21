#!/usr/bin/env node
"use strict";
/* V17.5 NB2 — tests of the shared native-design pipeline stages (offline: NO live model; writes nothing).
 * stage determinism · prompt denylist (no provider algorithm text in TEMPLATE segments) · design selection rule SEL-1 ·
 * authorship ledger · lesson derivation/retrieval/reuse (memory-taxonomy) · diff helpers · sandbox oracle harness. */
const fs = require("fs");
const path = require("path");
const P = require("./odg-native-design-pipeline.js");
const NRI = require("./odg-native-repair-item.js");
const NBS = require("./odg-native-build-sandbox.js");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const item = NRI.designItem(ROOT);
check("designItem: integrated helper + REF-1 reference + ORC-2 corpus (ORC-1 + 16 non-JSON literals)", !!item && item.targetPath === "runtime/core/odg-canonical-json.ts" && item.corpus.length === NRI.ORACLE_INPUTS.length + 16 && !!item.reference);

// ---- S1 PROBLEM: determinism + content ----
const p1 = P.deriveProblem({ ...item, lessonKinds: [] });
const p2 = P.deriveProblem({ ...item, lessonKinds: [] });
check("S1 deterministic: same tree ⇒ byte-identical problem", JSON.stringify(p1) === JSON.stringify(p2));
const fixedHere = !p1.defect;   // after an NB2 integration the helper matches the reference
if (!fixedHere) {
  check("S1: failing cases are exactly the undefined-bearing inputs (toJSON / -0 / non-finite agree with the reference)", p1.failing.length > 0 && p1.failing.every((i: number) => /undefined@/.test(p1.cases[i].kind)) && p1.cases.filter((c: any) => /toJSON|negative-zero|non-finite/.test(c.kind) && !/undefined@/.test(c.kind)).every((c: any) => !c.failing));
  check("S1: reference output that is not valid JSON is EXCLUDED, never asserted (toJSON method object)", p1.excluded.length === 1 && /toJSON/.test(p1.excluded[0].src));
  check("S1: SHOWN = first failing case per kind; the rest held out; partition complete", p1.shown.length === p1.kinds.length && p1.shown.length + p1.heldOut.length === p1.cases.length && p1.shown.every((i: number) => p1.cases[i].failing));
}
// a synthetic module: undefined-in-object only wrong ⇒ only those cases fail
const synth = P.deriveProblem({ ...item, currentSource: "function canonicalJson(v: any): string { if (v === undefined) return 'null'; if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'; if (v !== null && typeof v === 'object') return '{' + Object.keys(v).sort().map((k: string) => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}'; return JSON.stringify(v); }\nmodule.exports = { canonicalJson };\nexport {};\n", lessonKinds: [] });
check("S1 on a synthetic module (labelled fixture): only undefined@object kinds fail", synth.defect === true && synth.failing.every((i: number) => /undefined@object/.test(synth.cases[i].kind)));
const withLesson = P.deriveProblem({ ...item, lessonKinds: ["undefined@object"] });
if (!fixedHere) check("S1 lesson reuse: a lesson kind tag adds ONE more shown failing case carrying that tag", withLesson.shown.length === p1.shown.length + 1 && withLesson.shown.filter((i: number) => !p1.shown.includes(i)).every((i: number) => /undefined@object/.test(withLesson.cases[i].kind)));

// ---- S2 IMPACT ----
const i1 = P.analyseImpact(ROOT, item.targetPath), i2 = P.analyseImpact(ROOT, item.targetPath);
check("S2 deterministic + records consumers (change-impact-graph) and the .test.ts files that load the module", JSON.stringify(i1) === JSON.stringify(i2) && i1.exists === true && Array.isArray(i1.consumers) && i1.impactedTestsTs.includes("runtime/core/odg-canonical-json.test.ts"));

// ---- prompts: denylist ----
const prob = fixedHere ? synth : p1;
const lessons = [{ id: "lesson:x", hint: "A previous build needed 1 repair(s).", caseKinds: [] }];
const dseg = P.designPromptSegments(prob, item.currentSource, i1, lessons, 3);
const iseg = P.implementPromptSegments(prob, item.currentSource, i1, lessons, { id: "D1", summary: "s", steps: ["x"] }, { verifyError: "for input [undefined] the output is still wrong (expected [null])." });
const tseg = P.implementPromptSegments(prob, item.currentSource, i1, [], { id: "D1", summary: "s", steps: [] }, { typeError: "x.ts:1 Parameter implicitly has an 'any' type" });
check("denylist: design + implement + repair + typefix prompts have 0 TEMPLATE hits", P.denylistHits(dseg).length === 0 && P.denylistHits(iseg).length === 0 && P.denylistHits(tseg).length === 0);
check("denylist: every segment is TEMPLATE or EVIDENCE; EVIDENCE segments name their source", [...dseg, ...iseg].every((s: any) => s.kind === "TEMPLATE" || (s.kind === "EVIDENCE" && typeof s.source === "string" && s.source.length > 0)));
const hinted = [...dseg.slice(0, 2), { kind: "TEMPLATE", text: "Hint: filter out keys whose value is undefined and map undefined to null in arrays." }];
check("denylist: a provider algorithm hint in TEMPLATE text is detected", P.denylistHits(hinted).length >= 2);
const allTemplate = [...dseg, ...iseg, ...tseg].filter((s: any) => s.kind === "TEMPLATE").map((s: any) => s.text).join("\n");
check("denylist: no algorithm words anywhere in the template text (undefined / null / filter / sort / JSON.stringify / Object.keys)", !/undefined|null|filter|sort|JSON\.stringify|Object\.keys|omit|skip|drop/i.test(allTemplate));
check("prompt evidence carries the executed shown cases with expected values, never a held-out expected value", (() => {
  const txt = P.renderPrompt(dseg);
  const shownOk = prob.shown.every((i: number) => txt.includes("input: " + prob.cases[i].src) && txt.includes("expected return value: " + JSON.stringify(prob.cases[i].expect)));
  const heldNoExpect = prob.cases.filter((c: any) => !prob.shown.includes(c.i)).every((c: any) => !txt.includes("input: " + c.src + "\n"));
  return shownOk && heldNoExpect;
})());
check("prompt rendering deterministic", P.renderPrompt(dseg) === P.renderPrompt(P.designPromptSegments(prob, item.currentSource, i1, lessons, 3)));

// ---- S3 parseDesigns ----
const pd = P.parseDesigns("Sure:\n```json\n[{\"summary\":\"a\",\"steps\":[\"1\",\"2\",\"3\",\"4\",\"5\",\"6\"],\"files\":[\"x.ts\"]},{\"summary\":\"b\"},{\"nope\":1},{\"summary\":\"c\"},{\"summary\":\"d\"}]\n```");
check("S3 parseDesigns: first JSON array, ids D1..Dn by ODG, ≤3 designs, ≤5 steps, invalid entries dropped", pd.length === 3 && pd.map((d: any) => d.id).join() === "D1,D2,D3" && pd[0].steps.length === 5 && pd[2].summary === "c" && P.parseDesigns("no json").length === 0);

// ---- S4 SEL-1 ----
const sc = (o: any) => ({ design: "D?", generated: true, oracleExecuted: true, writeSetOk: true, oraclePassed: 10, oracleTotal: 33, typecheckOk: true, callersAffected: 0, diffLines: 10, ...o });
check("SEL-1: oracle passed dominates diff size", P.selectDesign([sc({ design: "D1", oraclePassed: 30, diffLines: 2 }), sc({ design: "D2", oraclePassed: 33, diffLines: 40 })]).chosen === "D2");
check("SEL-1: write-set violation loses even with a better oracle; all violating ⇒ no choice", P.selectDesign([sc({ design: "D1", writeSetOk: false, oraclePassed: 33 }), sc({ design: "D2", oraclePassed: 20 })]).chosen === "D2" && P.selectDesign([sc({ design: "D1", writeSetOk: false })]).chosen === null);
check("SEL-1: tie on oracle ⇒ typecheck, then callers affected, then diff lines, then id", P.selectDesign([sc({ design: "D1", typecheckOk: false }), sc({ design: "D2" })]).chosen === "D2" && P.selectDesign([sc({ design: "D1", callersAffected: 3 }), sc({ design: "D2", callersAffected: 0, diffLines: 50 })]).chosen === "D2" && P.selectDesign([sc({ design: "D2", diffLines: 5 }), sc({ design: "D1", diffLines: 5 })]).chosen === "D1");
check("SEL-1: order-independent (shuffled input ⇒ same choice)", P.selectDesign([sc({ design: "D3", diffLines: 4 }), sc({ design: "D1", oraclePassed: 9 }), sc({ design: "D2", diffLines: 6 })]).chosen === P.selectDesign([sc({ design: "D2", diffLines: 6 }), sc({ design: "D3", diffLines: 4 }), sc({ design: "D1", oraclePassed: 9 })]).chosen);
const s1 = P.scoreCandidate({ design: { id: "D1", files: ["runtime/core/other.ts"], changesExportedApi: false }, writeSet: [item.targetPath], currentSource: item.currentSource, tsSource: "function f(x: any): string { return ''; }\nmodule.exports = { f };\nexport {};\n", oracle: { executed: true, passed: 1, total: 2 }, typecheck: { ok: true }, impact: { consumers: ["a", "b"], impactedTestsTs: ["t"] } });
check("scoreCandidate: file outside the write set ⇒ writeSetOk false; renamed export ⇒ apiChanged, callers affected = consumers + tests", s1.writeSetOk === false && s1.apiChanged === true && s1.callersAffected === 3);
const s2 = P.scoreCandidate({ design: { id: "D2", files: [], changesExportedApi: false }, writeSet: [item.targetPath], currentSource: item.currentSource, tsSource: item.currentSource, oracle: { executed: true, passed: 2, total: 2 }, typecheck: { ok: true }, impact: { consumers: ["a"], impactedTestsTs: [] } });
check("scoreCandidate: same exports ⇒ 0 callers affected; empty files list defaulted to the target; diffLines 0 for identical", s2.apiChanged === false && s2.callersAffected === 0 && s2.filesDefaulted === true && s2.diffLines === 0);

// ---- authorship ledger ----
const L = P.authorshipLedger({ denylistHits: [], designsBy: "LOCAL_MODEL", model: "m", designCount: 3, chosen: "D2", implementedBy: "LOCAL_MODEL", generation: 4, repairs: 1 });
check("ledger: problem ODG_RULES (no provider algorithm), corpus PROVIDER, design + implementation LOCAL_MODEL, selection + tests ODG_RULES, plumbing PROVIDER, integration NOT_INTEGRATED", L.problem.by === "ODG_RULES" && L.problem.providerAlgorithmTextInPrompts === false && L.corpus.by === "PROVIDER" && L.design.by === "LOCAL_MODEL" && L.implementation.by === "LOCAL_MODEL" && L.selection.by === "ODG_RULES" && L.testsOracle.by === "ODG_RULES" && L.plumbing.by === "PROVIDER" && L.integration.by === "NOT_INTEGRATED" && /LOCAL_MODEL/.test(L.repair.by));
check("ledger: a denylist hit is reported as a VIOLATION", P.authorshipLedger({ denylistHits: [1], repairs: 0 }).problem.providerAlgorithmTextInPrompts === "VIOLATION");

// ---- S6 lessons ----
const rec = { scenario: "V175-NB2", verdict: "PASS", problem: { targetPath: item.targetPath, defect: true, kinds: ["undefined@array"], priorAcceptance: { record: "docs/odg/evidence/V175_NATIVE_BUILD_RESULT.json" } }, rounds: [{ executionStatus: "EXECUTED", repairs: 2 }], repairTrace: [{ kind: "undefined@object" }, { kind: "undefined@array" }], selection: { chosen: "D2", scores: [{ design: "D1", oracleTotal: 33, oraclePassed: 20, oracleExecuted: true }, { design: "D2", oracleTotal: 33, oraclePassed: 33, oracleExecuted: true }] } };
const ls = P.deriveLessons(rec, "fixture");
check("deriveLessons: REPAIR_NEEDED (kinds from the repair trace) + DESIGNS_REJECTED + CORPUS_GAP, all memory-taxonomy 'engineering' records, CONSOLIDATED (executed)", ls.length === 3 && ls.every((l: any) => l.family === "engineering" && l.consolidated === true && l.provenance === "fixture") && JSON.stringify(ls.find((l: any) => l.value.kind === "REPAIR_NEEDED").value.caseKinds) === JSON.stringify(["undefined@array", "undefined@object"]));
check("deriveLessons: deterministic ids; a NOT_MEASURED / unexecuted run yields only RAW lessons", JSON.stringify(P.deriveLessons(rec, "fixture")) === JSON.stringify(ls) && P.deriveLessons({ ...rec, verdict: "NOT_MEASURED" }, "f").every((l: any) => l.consolidated === false));
check("deriveLessons: hints carry case kinds and counts, never an algorithm (denylist-clean except the kind names)", ls.every((l: any) => !/filter|omit|skip|drop|JSON\.stringify|Object\.keys|\bsort/i.test(l.value.hint)));
const col = P.collectLessons([{ record: { ...rec, lessons: ls }, provenance: "x" }, { record: { ...rec, verdict: "NOT_MEASURED" }, provenance: "y" }]);
check("collectLessons: memory-taxonomy retrieve keeps only CONSOLIDATED lessons (RAW ones from an unexecuted run dropped), dedup by id, kinds exported", col.lessons.length === 3 && col.considered === 6 && JSON.stringify(col.kinds) === JSON.stringify(["undefined@array", "undefined@object"]));
const nb1 = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V175_NATIVE_BUILD_RESULT.json"), "utf8"));
check("collectLessons over the REAL NB1 record: 0 repairs ⇒ no lesson (nothing invented)", P.collectLessons([{ record: nb1, provenance: "nb1" }]).lessons.length === 0);
const dl = P.renderPrompt(P.designPromptSegments(prob, item.currentSource, i1, col.lessons, 3));
check("lesson reuse: the design prompt carries the lesson hints as EVIDENCE", col.lessons.every((l: any) => dl.includes(l.hint)));

// ---- diff helpers ----
const rd = P.replaceFileDiff(item.targetPath, item.currentSource, item.currentSource.replace("canonicalJson(value: any)", "canonicalJson(value: any /* x */)"));
check("replaceFileDiff applies with git apply --check on this tree", P.gitApplyCheck(ROOT, rd).ok === true);
check("changedLines: LCS-based removed+added count", P.changedLines("a\nb\nc", "a\nx\nc") === 2 && P.changedLines("a", "a") === 0);
check("exportedNames: parse-only module.exports names", JSON.stringify(P.exportedNames(item.currentSource)) === JSON.stringify(["canonicalJson"]) && P.exportedNames("const x = 1;") === null);

// ---- sandbox oracle harness (real bwrap when available) ----
const probe = NBS.probeSandbox();
if (probe && probe.ok === true) {
  const harness = P.harnessSource(item.sandboxFile, item.exportName, prob.cases.map((c: any) => c.src));
  const cur = P.oracleRun({ [item.sandboxFile]: P.transpile(item.currentSource).js, [P.HARNESS_FILE]: harness }, prob);
  check("oracleRun (sandbox): the current module's failing set equals PROB-1's (host-graded)", cur.executed === true && JSON.stringify(cur.failingIdx) === JSON.stringify(prob.failing) && cur.passed === prob.cases.length - prob.failing.length);
} else process.stdout.write("SKIP - sandbox unavailable: " + String(probe && probe.reason) + "\n");
check("pipeline contract lists 6 stages + reused canonical components", P.NATIVE_DESIGN_PIPELINE_CONTRACT.stages.length === 6 && P.NATIVE_DESIGN_PIPELINE_CONTRACT.reuses.includes("native-project-builder.buildProject"));

if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
export {};
