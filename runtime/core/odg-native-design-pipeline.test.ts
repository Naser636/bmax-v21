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
check("lesson reuse: the design prompt carries the DIGEST-1 text of the lessons as EVIDENCE", !!col.digest.text && dl.includes(col.digest.text) && col.digest.included.length >= 1);

// ---- V17.6 DIGEST-1: bounded lesson digest ----
const mkL = (id: string, at: string, kind: string, ck: string[], hint: string) => ({ id, at, kind, caseKinds: ck, hint, provenance: "fixture" });
const p3Like = [mkL("a", "2026-11-24T16:16:37Z", "CORPUS_GAP", ["k1", "k2"], "C".repeat(300)), mkL("b", "2026-11-24T16:16:37Z", "DESIGNS_REJECTED", [], "D".repeat(160)), mkL("c", "2026-11-24T16:40:00Z", "REPAIR_NEEDED", ["undefined@top"], "R5 newer"), mkL("d", "2026-11-24T16:16:37Z", "REPAIR_NEEDED", ["undefined@top"], "R4 older")];
const dgst = P.lessonDigest(p3Like);
check("DIGEST-1: newest first, dedup by (kind, caseKinds) keeps the newest, lines ≤ 200 chars, whole text ≤ 600 chars", dgst.included[0] === "c" && dgst.deduped.join() === "d" && dgst.chars <= 600 && dgst.text.split("\n").every((l: string) => l.length <= 200) && dgst.text.includes("R5 newer") && !dgst.text.includes("R4 older"));
check("DIGEST-1: every considered lesson is accounted for (included / omitted / deduped) — nothing silently dropped", [...dgst.included, ...dgst.omitted, ...dgst.deduped].sort().join() === "a,b,c,d");
const many = Array.from({ length: 40 }, (_, k) => mkL("l" + String(k).padStart(2, "0"), "2026-11-" + String(1 + (k % 28)).padStart(2, "0"), "K" + k, [], "hint number " + k + " " + "x".repeat(80)));
const dm = P.lessonDigest(many);
check("DIGEST-1: bounded regardless of the lesson count (40 lessons ⇒ ≤ 600 chars, the rest omitted), deterministic and order-independent", dm.chars <= 600 && dm.omitted.length > 0 && dm.included.length + dm.omitted.length === 40 && JSON.stringify(P.lessonDigest([...many].reverse())) === JSON.stringify(dm));
check("DIGEST-1: no lessons ⇒ no lesson segment in the prompt", P.lessonDigest([]).text === "" && !P.renderPrompt(P.designPromptSegments(prob, item.currentSource, i1, [], 3)).includes("Lessons from ODG"));
const p3 = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V175_NB2_PROBE_3.json"), "utf8"));
const p3d = P.lessonDigest(p3.lessonsRead.lessons.map((l: any) => ({ ...l, at: p3.run.startedAt })));
check("DIGEST-1 on the REAL PROBE 3 lessons (4 hints injected verbatim there): digest ≤ 600 chars and shorter than the verbatim lesson block", p3d.chars <= 600 && p3d.chars < p3.lessonsRead.lessons.map((l: any) => "  - " + l.hint).join("\n").length && p3d.deduped.length === 1);

// ---- V17.6 ADAPT-1: adaptive per-call timeout ----
const policy = { minMs: 60000, maxMs: 300000, safetyFactor: 3, overheadMs: 15000, charsPerToken: 3 };
const rt = P.measureRate({ ok: true, ms: 900, timings: { evalCount: 16, evalDurationNs: 2e9, promptEvalCount: 20, promptEvalDurationNs: 1e9, loadDurationNs: 5e9 } });
check("measureRate: tokens/s from Ollama counters (eval 8 tok/s, prompt 20 tok/s); model load time excluded", rt.genTokPerS === 8 && rt.promptTokPerS === 20);
check("measureRate: absent / zero counters ⇒ null (not measured); absent prompt counters ⇒ gen rate used for prompt (stated)", P.measureRate({ ok: true, timings: { evalCount: 16, evalDurationNs: 0 } }) === null && P.measureRate({ ok: false }) === null && P.measureRate({ ok: true, timings: { evalCount: 8, evalDurationNs: 1e9 } }).promptTokPerS === 8);
const at1 = P.adaptiveTimeout({ promptChars: 3271, numPredict: 900, rate: rt, policy });
check("adaptiveTimeout: estimate = prompt tokens / prompt rate + numPredict / gen rate; timeout = clamp(3·est + 15 s)", at1.estimateMs === Math.ceil(1000 * (Math.ceil(3271 / 3) / 20 + 900 / 8)) && at1.timeoutMs === 300000 && at1.clamped === true && at1.predictedOverCap === false);
const fast = P.adaptiveTimeout({ promptChars: 300, numPredict: 900, rate: { genTokPerS: 100, promptTokPerS: 1000 }, policy });
check("adaptiveTimeout: a fast model gets a shorter timeout, floored at minMs", fast.timeoutMs === 60000 && fast.estimateMs === 9100);
check("adaptiveTimeout: estimate above maxMs ⇒ predictedOverCap (caller does not send); no rate ⇒ nothing derived", P.adaptiveTimeout({ promptChars: 3000, numPredict: 900, rate: { genTokPerS: 1, promptTokPerS: 5 }, policy }).predictedOverCap === true && P.adaptiveTimeout({ promptChars: 1, numPredict: 1, rate: null, policy }).timeoutMs === null);
check("warm-up prompt is TEMPLATE-clean (0 denylist hits)", P.denylistHits([{ kind: "TEMPLATE", text: P.WARMUP_PROMPT }]).length === 0);

// ---- V17.6 HOST-1 ----
const hb = P.hostLoad(0.75, () => ({ loadavg: [6.01, 1, 1], nproc: 8 })), hi = P.hostLoad(0.75, () => ({ loadavg: [6, 1, 1], nproc: 8 }));
check("hostLoad: threshold = nproc × 0.75; above ⇔ loadavg-1m strictly greater; non-numeric load ⇒ above (fail-closed)", hb.threshold === 6 && hb.aboveThreshold === true && hi.aboveThreshold === false && P.hostLoad(0.75, () => ({ loadavg: [], nproc: 8 })).aboveThreshold === true);
const real = P.hostLoad(0.75);
check("hostLoad: default probe reads os.loadavg + nproc", typeof real.load1 === "number" && real.nproc >= 1);

// ---- V17.6 guard: warm-up has its own cap and num_predict, never consumes maxModelCalls ----
(async () => {
  const bodies: any[] = []; const tr = async (_u: string, init: any) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({}) }; };
  const g = P.makeGuard(tr, { maxModelCalls: 1, maxWarmupCalls: 1, warmupNumPredict: 16, numPredict: 900, seed: 1, temperature: 0, wallMs: 60000 });
  await g.fetchImpl(P.OLLAMA_URL, { body: JSON.stringify({ prompt: "w" }), odgWarmup: true });
  let second = false; try { await g.fetchImpl(P.OLLAMA_URL, { body: JSON.stringify({ prompt: "w" }), odgWarmup: true }); } catch { second = true; }
  await g.fetchImpl(P.OLLAMA_URL, { body: JSON.stringify({ prompt: "x" }) });
  check("guard: warm-up uses warmupNumPredict, own cap (2nd refused), does not consume maxModelCalls; the work call still allowed", bodies[0].options.num_predict === 16 && second && g.st.warmupCalls === 1 && g.st.modelCalls === 1 && bodies[1].options.num_predict === 900 && g.st.capHit === "maxWarmupCalls");
  let nonLoop = false; try { await g.fetchImpl("http://10.0.0.2:11434/api/generate", { body: "{}", odgWarmup: true }); } catch { nonLoop = true; }
  check("guard: a warm-up to a non-loopback URL is refused too", nonLoop && g.st.refused.length === 1);
  if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
})();

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

// ---- V17.6 NB3 DIV-1: bounded repair-diversity ladder (fake generators only; no model) ----
(async () => {
  const SPEC = { base: { temperature: 0, seed: 42 }, sampling: [{ temperature: 0.5, seed: 1042 }, { temperature: 0.9, seed: 2042 }], designSwitch: true, escalationModels: ["big:14b"], maxVariations: 20 };
  const L = P.diversityLadder(SPEC, ["D2", "D1"], "m:7b");
  check("DIV-1 ladder order: sampling on rank 1 → design switch (SEL-1 order) + its sampling → model escalation last", L.map((x: any) => `${x.kind}:${x.design}:${x.model}:${x.temperature}`).join() === "BASE:D2:m:7b:0,SAMPLING:D2:m:7b:0.5,SAMPLING:D2:m:7b:0.9,DESIGN_SWITCH:D1:m:7b:0,SAMPLING:D1:m:7b:0.5,SAMPLING:D1:m:7b:0.9,MODEL_ESCALATION:D2:big:14b:0");
  check("DIV-1 allowedCallOptions: distinct (model, temperature, seed) points incl. the base", P.allowedCallOptions(SPEC, "m:7b").length === 4);
  check("largerModels: parameterSize-ordered, AVAILABLE only, strictly larger", JSON.stringify(P.largerModels({ registry: { models: [{ id: "a", available: true, parameterSize: "7.6B" }, { id: "b", available: true, parameterSize: "14B" }, { id: "c", available: false, parameterSize: "32B" }, { id: "d", available: true, parameterSize: "494.03M" }] } }, "a")) === "[\"b\"]" && Math.abs(P.paramB("494.03M") - 0.49403) < 1e-9);
  // guard: a declared point is applied + recorded; an undeclared point is refused before sending
  const sent: any[] = [];
  const tr = async (_u: string, init: any) => { const b = JSON.parse(init.body); sent.push(b); return { ok: true, json: async () => ({ response: "x" }) }; };
  const caps = { maxModelCalls: 3, wallMs: 60000, seed: 42, temperature: 0, numPredict: 10, allowedCallOptions: P.allowedCallOptions(SPEC, "m:7b") };
  const g = P.makeGuard(tr, caps);
  const a = await P.ollamaGenerate(g.fetchImpl, { model: "m:7b", prompt: "p", timeoutMs: 5000, callOptions: { temperature: 0.5, seed: 1042 } });
  const b = await P.ollamaGenerate(g.fetchImpl, { model: "m:7b", prompt: "p", timeoutMs: 5000, callOptions: { temperature: 0.7, seed: 1 } });
  const c0 = await P.ollamaGenerate(g.fetchImpl, { model: "m:7b", prompt: "p", timeoutMs: 5000 });
  check("guard DIV-1: declared point applied + recorded; undeclared point refused (not sent, not counted); no override ⇒ base", a.ok && !b.ok && c0.ok && sent.length === 2 && sent[0].options.temperature === 0.5 && sent[0].options.seed === 1042 && sent[1].options.temperature === 0 && g.st.modelCalls === 2 && g.st.refused.length === 1 && g.st.prompts[0].temperature === 0.5 && g.st.prompts[1].seed === 42 && !("odgCallOptions" in sent[0]));
  // diverseGenerate: a generator that repeats itself at temperature 0 and changes when sampled
  const mk = (sha: string, i: number, extra: any = {}) => ({ i, content: sha, sandboxContentSha256: sha, ...extra });
  const runDG = async (gen: (pt: any, n: number) => any, ctlSpec: any, seenInit: string[], cands: any = {}) => {
    const ctl = P.makeDiversityController(ctlSpec, ["D1", "D2"], "m:7b"); const seen = new Set(seenInit); const ev: any[] = []; let n = 0; const pts: any[] = [];
    const r = await P.diverseGenerate({ controller: ctl, seen, events: ev, candidateFor: (d: string) => cands[d] || null, generate: async (pt: any) => { n++; pts.push(pt); return gen(pt, n); } });
    return { r, ctl, ev, n, pts };
  };
  const x1 = await runDG((pt: any, n: number) => mk(pt.temperature > 0 ? "NEW" : "OLD", n), { ...SPEC, escalationModels: [], maxVariations: 8 }, ["OLD"]);
  check("diverseGenerate breaks an identical-regeneration stall: 1 stall → SAMPLING point → novel content (2 generate calls)", x1.r.gen.content === "NEW" && x1.r.stalls === 1 && x1.n === 2 && x1.ctl.st.transitions.length === 1 && x1.ctl.st.transitions[0].kind === "SAMPLING" && x1.ev[0].kind === "STALL_IDENTICAL_REGENERATION");
  const x2 = await runDG((_pt: any, n: number) => mk("OLD", n), { ...SPEC, escalationModels: [], maxVariations: 8 }, ["OLD"], { D2: mk("S4-D2", 99) });
  check("diverseGenerate: on reaching the design switch the next design's S4 implementation is reused first (no generate call)", x2.r.gen.content === "S4-D2" && x2.r.reusedS4 === true && x2.n === 3 && x2.ev.some((e: any) => e.kind === "DESIGN_SWITCH_REUSED_S4"));
  const x3 = await runDG((_pt: any, n: number) => mk("OLD", n), { ...SPEC, escalationModels: [], maxVariations: 2 }, ["OLD"]);
  check("diverseGenerate: bounded — maxVariations 2 ⇒ 3 generate calls, exhausted, the identical generation returned (buildProject then stops NO_PROGRESS)", x3.r.exhausted === true && x3.n === 3 && x3.r.gen.content === "OLD" && x3.ctl.st.transitions.length === 2);
  const x4 = await runDG((pt: any, n: number) => pt.temperature === 0 ? mk("OLD", n, { notSent: true }) : mk("NEW", n), { ...SPEC, escalationModels: [], maxVariations: 8 }, ["OLD"]);
  check("diverseGenerate: a predicted-identical (not sent) generation is a stall with its own event kind", x4.ev[0].kind === "STALL_PREDICTED_IDENTICAL_NOT_SENT" && x4.ctl.st.transitions[0].reason === "PREDICTED_IDENTICAL" && x4.r.gen.content === "NEW");
  const x5 = await runDG(() => null, { ...SPEC, escalationModels: [], maxVariations: 8 }, ["OLD"]);
  check("diverseGenerate: a FAILED generation is not a stall (no advance; buildProject keeps its retry budget)", x5.r.gen === null && x5.ctl.st.transitions.length === 0);
  // NB3-FIX-1 regression (inspection REJECT of NB3 run 6382ec04): S4 contents pre-seeded in `seen` must NOT block the S4 reuse
  {
    const ctl = P.makeDiversityController({ ...SPEC, escalationModels: [], maxVariations: 8 }, ["D1", "D2"], "m:7b");
    const seen = new Set(["OLD", "S4-D2"]); const reusedS4 = new Set<string>(); const ev: any[] = []; let n = 0;
    const r = await P.diverseGenerate({ controller: ctl, seen, reusedS4, events: ev, candidateFor: (d: string) => (d === "D2" ? mk("S4-D2", 99) : null), generate: async () => { n++; return mk("OLD", n); } });
    check("NB3-FIX-1: with reusedS4 tracked, the switched design's S4 implementation is reused even though S4 contents are pre-seeded in seen", r.gen && r.gen.content === "S4-D2" && reusedS4.has("S4-D2") && ev.some((e: any) => e.kind === "DESIGN_SWITCH_REUSED_S4"));
    const ctl2 = P.makeDiversityController({ ...SPEC, escalationModels: [], maxVariations: 8 }, ["D1", "D2"], "m:7b"); ctl2.st.switchUsed = new Set();
    const r2 = await P.diverseGenerate({ controller: ctl2, seen: new Set(["OLD", "S4-D2"]), reusedS4: new Set(["S4-D2"]), events: [], candidateFor: (d: string) => (d === "D2" ? mk("S4-D2", 99) : null), generate: async () => mk("OLD", 1) });
    check("NB3-FIX-1: an S4 implementation already reused in S5 is not reused twice", !(r2.gen && r2.gen.content === "S4-D2" && r2.reusedS4 === true));
  }
  check("DIV-1 template plumbing unchanged: TEMPLATE segments still denylist-clean", P.denylistHits(P.implementPromptSegments(p1, item.currentSource, P.analyseImpact(ROOT, item.targetPath), [], { id: "D1", summary: "s", steps: [] }, { verifyError: "x", attemptSource: "y" })).length === 0);
  // ---- V17.8 P1: SAMPLE-1 multi-candidate generation + XSEL-1 execution-based selection (fake transport only) ----
  {
    const SPEC = { points: [{ model: "m:7b", temperature: 0, seed: 42 }, { model: "m:7b", temperature: 0.6, seed: 1101 }, { model: "m:7b", temperature: 0.8, seed: 2101 }] };
    const sentOpts: any[] = [];
    const tr = async (_u: string, init: any) => { const b = JSON.parse(init.body); sentOpts.push(b.options); return { ok: true, json: async () => ({ response: "code t=" + b.options.temperature + " s=" + b.options.seed }) }; };
    const g = P.makeGuard(tr, { maxModelCalls: 10, wallMs: 60000, seed: 42, temperature: 0, numPredict: 10, allowedCallOptions: SPEC.points });
    const gen = async (p: any) => { const r = await P.ollamaGenerate(g.fetchImpl, { model: p.model, prompt: "x", timeoutMs: 5000, callOptions: { temperature: p.temperature, seed: p.seed } }); return r.ok ? { ok: true, text: r.response } : { ok: false, reason: r.reason }; };
    const s1 = await P.sampleCandidates(SPEC, { n: 3, schedule: SPEC.points, generate: gen });
    const bad = await P.sampleCandidates(SPEC, { n: 2, schedule: [SPEC.points[0], { model: "m:7b", temperature: 0.7, seed: 5 }], generate: gen });
    const callsBefore = sentOpts.length;
    const viaGuard = await P.ollamaGenerate(g.fetchImpl, { model: "m:7b", prompt: "x", timeoutMs: 5000, callOptions: { temperature: 0.7, seed: 5 } });
    check("V178-P1/AC1: n candidates drawn exactly from the declared schedule (params + sha recorded); an undeclared point is refused by sampleCandidates (no call) AND by the guard", s1.ok && s1.candidates.length === 3 && s1.candidates.map((c: any) => `${c.temperature}/${c.seed}`).join() === "0/42,0.6/1101,0.8/2101" && sentOpts.slice(0, 3).map((o: any) => `${o.temperature}/${o.seed}`).join() === "0/42,0.6/1101,0.8/2101" && s1.candidates.every((c: any) => /^[0-9a-f]{64}$/.test(c.sha256)) && bad.ok === false && /not pre-declared/.test(bad.refused) && callsBefore === 3 && !viaGuard.ok && sentOpts.length === 3);
    const cand = (id: string, sha: string, res: any, extra: any = {}) => ({ id, sha256: sha, ok: true, compileOk: true, codeLines: 5, caseResults: res, ...extra });
    const visible = [0, 2, 4];
    const A = cand("C1", "aa", { 0: true, 2: false, 4: true, 1: true, 3: true }), Bc = cand("C2", "bb", { 0: true, 2: true, 4: true, 1: false, 3: false }), Cc = cand("C3", "cc", { 0: false, 2: false, 4: false, 1: true, 3: true });
    const sel1 = P.selectByExecution([A, Bc, Cc], visible);
    const flipHidden = (c: any) => ({ ...c, caseResults: { ...c.caseResults, 1: !c.caseResults[1], 3: !c.caseResults[3] } });
    const sel2 = P.selectByExecution([A, Bc, Cc].map(flipHidden), visible);
    check("V178-P1/AC2: selection uses only visible-case results — flipping every hidden-case result never changes the choice or ranking", sel1.chosen === "C2" && sel1.decidedBy === "visiblePassed" && JSON.stringify(sel1.ranking) === JSON.stringify(sel2.ranking) && sel1.chosen === sel2.chosen && /never consulted/.test(P.XSEL_RULE));
    const T1 = cand("C1", "11", { 0: true, 2: true, 4: true }, { excludedReason: P.tamperCheck("const fs = require('fs'); fs.writeFileSync('x.test.ts', '')") });
    const T2 = cand("C2", "22", { 0: true, 2: true, 4: true }, { excludedReason: P.tamperCheck("function f() {}", ["runtime/core/odg-native-oracle-harness.js"]) });
    const ok3 = cand("C3", "33", { 0: true, 2: false, 4: false });
    const sel3 = P.selectByExecution([T1, T2, ok3], visible);
    check("V178-P1/AC3: a candidate touching a test/evaluator path (code reference or declared file) is excluded BEFORE selection, even with more visible passes", !!T1.excludedReason && !!T2.excludedReason && P.tamperCheck("function chunk(a, s) { return a; }") === null && sel3.chosen === "C3" && sel3.excluded.length === 2 && !sel3.ranking.includes("C1"));
    const X = cand("C9", "ff", { 0: true }), Y = cand("C1", "0f", { 0: true });
    const order1 = P.selectByExecution([X, Y], [0]), order2 = P.selectByExecution([Y, X], [0]);
    const s2 = await P.sampleCandidates(SPEC, { n: 3, schedule: SPEC.points, generate: async (p: any) => ({ ok: true, text: "fixed " + p.seed }) });
    const s3 = await P.sampleCandidates(SPEC, { n: 3, schedule: SPEC.points, generate: async (p: any) => ({ ok: true, text: "fixed " + p.seed }) });
    check("V178-P1/AC4: with fixed transport outputs the selection is deterministic — same candidates ⇒ same sha256s; input order and candidate id never decide (content sha tie-break)", JSON.stringify(s2.candidates) === JSON.stringify(s3.candidates) && order1.chosen === "C1" && order2.chosen === "C1" && order1.decidedBy === "sha256 (content tie-break)");
    check("V178-P1: VIS-1 split = even indices visible, odd hidden", JSON.stringify(P.visibleSplit(7)) === JSON.stringify({ rule: P.visibleSplit(7).rule, visible: [0, 2, 4, 6], hidden: [1, 3, 5] }));
  }
  // ---- V17.8 P6 FROZEN-1: sha-pinned evaluators (anti-reward-hacking) ----
  {
    const files: any = { "runtime/core/odg-canonical-json-extended.test.ts": "test-v1", "runtime/core/odg-native-oracle-harness.js": "harness-v1" };
    const rf = (f: string) => (f in files ? files[f] : null);
    const pin = P.pinEvaluators(Object.keys(files), rf);
    check("V178-P6/AC1: a candidate editing a pinned test is refused before execution", pin.ok && /FROZEN-1/.test(String(P.refusePinnedWrites(["runtime/core/odg-canonical-json.ts", "runtime/core/./x/../odg-canonical-json-extended.test.ts"], pin.pins))) && P.refusePinnedWrites(["runtime/core"], pin.pins) !== null && P.refusePinnedWrites(["/repo/runtime/core/odg-canonical-json-extended.test.ts"], pin.pins) !== null && P.refusePinnedWrites(["/repo/runtime/core/odg-canonical-json-extended.test.ts"], pin.pins, { root: "/repo" }) !== null && P.refusePinnedWrites(["/elsewhere/x.js"], pin.pins, { root: "/repo" }) === null);   // inspection fix: absolute paths never silently relativised
    const ok0 = P.verifyPins(pin.pins, rf).ok; files["runtime/core/odg-canonical-json-extended.test.ts"] = "test-v2-edited";
    const after = P.verifyPins(pin.pins, rf);
    check("V178-P6/AC2: a changed pin sha between selection and acceptance fails the run", ok0 === true && after.ok === false && after.changed.length === 1 && after.changed[0].file === "runtime/core/odg-canonical-json-extended.test.ts");
    check("P6: an unreadable evaluator is never pinned empty (refused); a deleted pin fails verification", P.pinEvaluators(["nope.test.ts"], rf).ok === false && P.verifyPins([{ file: "gone.js", sha256: "x" }], rf).ok === false && P.verifyPins([], rf).ok === false);
    // AC3 — NB2 held-out behaviour unchanged (inspection fix: exercise the REAL NB2 path, not only pure helpers). The NB2 runner
    // runs with the fake transport that reproduced NB2's failure mode; its verdict + stall reason are the historical ones; the
    // evaluator files (harness + NB2's extended oracle test) are pinned before and verify unchanged after; NB2's model write-set
    // (the module under repair) is not refused by the freeze; held-out cases never appear in any prompt.
    {
      const NBS = require("./odg-native-build-sandbox.js");
      const probe = NBS.probeSandbox();
      if (!(probe && probe.ok === true)) process.stdout.write("SKIP - V178-P6/AC3 needs the native build sandbox (NOT an ok)\n");
      else {
        const NB2 = require("../bin/odg-v175-native-design-run.js"); const R3 = require("../bin/odg-v176-nb3-native-design-run.js");
        const ROOT2 = path.resolve(__dirname, "..", "..");
        const evalFiles = ["runtime/core/odg-canonical-json-extended.test.ts", "runtime/core/odg-native-design-pipeline.ts"].filter((f) => fs.existsSync(path.join(ROOT2, f)));
        const rf2 = (f: string) => { try { return fs.readFileSync(path.join(ROOT2, f), "utf8"); } catch { return null; } };
        const pins2 = P.pinEvaluators(evalFiles, rf2);
        const F2 = R3.fakeBySampling(); const r2 = await NB2.runNativeDesign({ root: ROOT2, label: "TEST", transport: F2.fake, loadProbe: NB2.IDLE });
        const v2 = P.verifyPins(pins2.pins, rf2);
        const hiddenNeverShown = (r2.prompts || []).every((pr: any) => !(pr.segments || []).some((sg: any) => /held-out|hidden/i.test(String(sg.source || ""))));
        check("V178-P6/AC3: existing NB2 held-out behaviour is unchanged (regression test)", pins2.ok && v2.ok && r2.verdict === "FAIL" && r2.rounds.every((x: any) => x.repairStopReason === "NO_PROGRESS_IDENTICAL_REGENERATION") && r2.diversity === undefined && P.refusePinnedWrites(["runtime/core/odg-canonical-json.ts"], pins2.pins) === null && hiddenNeverShown);
      }
    }
  }
  if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
})();
export {};
