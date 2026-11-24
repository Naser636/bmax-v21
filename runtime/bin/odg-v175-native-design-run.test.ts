#!/usr/bin/env node
"use strict";
/* V17.5 NB2 — tests of the native-design runner (offline: fake-Ollama transport behind the real loopback guard; real
 * bwrap sandbox when available; writes nothing). selftest · CLI refusals · contract = ODG-rules derivation + owner binding ·
 * end-to-end: stage order, SEL-1 choice, repair with an ODG-observed hint, authorship ledger, lessons written by run 1
 * and READ by run 2 (prompt hint + extra shown case), denylist-clean prompts actually sent. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("./odg-v175-native-design-run.js");
const P = require("../core/odg-native-design-pipeline.js");
const AS = require("../core/odg-authorization-scope.js");
const NBS = require("../core/odg-native-build-sandbox.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const run = (args: string[], timeout = 300000) => cp.spawnSync(tsx, [R.SELF, ...args], { cwd: ROOT, encoding: "utf8", timeout });

(async () => {
  // ---- CLI ----
  const st = run(["--selftest"]);
  process.stdout.write(String(st.stdout).split("\n").filter(Boolean).map((l: string) => "  | " + l).join("\n") + "\n");
  check("--selftest passes", st.status === 0);
  check("non-declared output path ⇒ REFUSED exit 3", run(["docs/odg/evidence/OTHER.json"]).status === 3);
  const existed = fs.existsSync(path.join(ROOT, R.OUT));
  const na = run([R.OUT]);
  check("declared output, no inspection ⇒ NOT_AUTHORIZED exit 2, record not created", na.status === 2 && /NOT_AUTHORIZED/.test(na.stdout) && fs.existsSync(path.join(ROOT, R.OUT)) === existed);
  check("--probe refuses an output inside the repo", run(["--probe", "--out", path.join(ROOT, "x.json")]).status === 3);

  // ---- contract ----
  const c = R.readContract(ROOT);
  const derived = R.contractFor(ROOT);
  if (derived) check("V160 entry V175-NB2: origin + WORK_ITEM_CONTRACT = ODG-rules derivation from this tree", !!c && JSON.stringify(c.origin) === JSON.stringify(derived.origin) && JSON.stringify(c.WORK_ITEM_CONTRACT) === JSON.stringify(derived.WORK_ITEM_CONTRACT));
  else check("after integration: no failing case ⇒ no new contract derived (item satisfied)", derived === null);
  const sc = AS.deriveAuthorizationScope(c, {});
  check("V175-NB2 bound to the V175 owner record via family V175-NATIVE-LOOP: REVISE validated, INSPECT current, nothing executable", sc.applicable === true && sc.currentStep === "INSPECT_REVISED_CONTRACT" && sc.executionAuthorized === false && c.authorization.executionAuthorized === false);
  check("gate refuses without an inspection record", R.gate(c, null, null).ok === false);
  const H = JSON.parse(fs.readFileSync(path.join(ROOT, R.CONTRACTS), "utf8")).contracts.find((x: any) => x.scenario === "H");
  const hnb = JSON.parse(JSON.stringify(H)); hnb.authorization.source = c.authorization.source;
  check("family sharing is explicit: the V175 record still cannot authorize H; NB2 citing V171 too ⇒ refused", AS.deriveAuthorizationScope(hnb, {}).applicable === false && AS.ownerSourceCheck("V175-NB2", c.authorization.source + " + docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json").ok === false && AS.ownerSourceCheck("V175-NB1", c.authorization.source).ok === true);
  const t = c.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS;
  check("dispatch target = this runner, writeSet = [result record] ⊆ write_set; native patch write set = helper + ODG test", t.command === R.SELF && JSON.stringify(t.writeSet) === JSON.stringify([R.OUT]) && c.WORK_ITEM_CONTRACT.write_set.includes(R.SELF) && JSON.stringify(c.WORK_ITEM_CONTRACT.nativePatchWriteSet) === JSON.stringify(["runtime/core/odg-canonical-json.ts", "runtime/core/odg-canonical-json-extended.test.ts"]));

  // ---- end-to-end with a fake model (LABELLED fixture answers; real sandbox) ----
  const probe = NBS.probeSandbox();
  if (!derived) { process.stdout.write("SKIP - end-to-end: defect already integrated\n"); }
  else if (!(probe && probe.ok === true)) { process.stdout.write("SKIP - sandbox unavailable\n"); }
  else {
    // D1 = arrays-only fix (passes fewer); D2 = objects-only fix (passes more) ⇒ SEL-1 picks D2, then repair (hint) ⇒ RIGHT
    const OBJ_ONLY = "function canonicalJson(value: any): string {\n  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';\n  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().filter((k: string) => value[k] !== undefined).map((k: string) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';\n  return JSON.stringify(value);\n}\nmodule.exports = { canonicalJson };\nexport {};\n";
    const F1 = R.makeFake({ impl: { "Design alpha": [R.FIX_WRONG], "Design beta": [OBJ_ONLY] }, repair: R.FIX_RIGHT });
    const r1 = await R.runNativeDesign({ root: ROOT, label: "TEST", transport: F1.fake, extraLessons: [], lessonProvenance: "TEST run1" });
    const s1 = (id: string) => r1.selection.scores.find((s: any) => s.design === id);
    check("run1: SEL-1 picks D2 (more oracle cases passed, measured in the sandbox) — not the model", r1.selection.chosen === "D2" && s1("D2").oraclePassed > s1("D1").oraclePassed && s1("D1").oracleExecuted && /SEL-1/.test(r1.selection.rule));
    check("run1: chosen implementation repaired with an ODG-observed hint ⇒ PASS (1 design + 2 impl + ≥1 repair calls)", r1.verdict === "PASS" && r1.rounds[0].repairs >= 1 && r1.network.modelCalls === 3 + r1.rounds[0].repairs && r1.repairTrace.length >= 1 && r1.repairTrace.every((x: any) => typeof x.kind === "string"));
    check("run1: stage order in prompts = S3 design → S4 implement D1, D2 → S5 repair", r1.prompts[0].stage === "S3 design" && r1.prompts[1].stage === "S4 implement D1" && r1.prompts[2].stage === "S4 implement D2" && /^S5 repair D2/.test(r1.prompts[3].stage));
    check("run1: every SENT prompt has 0 TEMPLATE denylist hits; the repair hint never carries a held-out expected value", r1.prompts.every((p: any) => p.denylistHits.length === 0) && (() => { const rp = F1.prompts.slice(3).join("\n"); return r1.problem.heldOut.every((i: number) => !rp.includes("for input " + r1.problem.cases[i].src + " ")); })());
    check("run1: authorship ledger — problem/selection/tests ODG_RULES, design/implementation/repair LOCAL_MODEL, corpus/plumbing PROVIDER, integration NOT_INTEGRATED", r1.authorship.problem.by === "ODG_RULES" && r1.authorship.selection.by === "ODG_RULES" && r1.authorship.testsOracle.by === "ODG_RULES" && r1.authorship.design.by === "LOCAL_MODEL" && r1.authorship.implementation.by === "LOCAL_MODEL" && /LOCAL_MODEL/.test(r1.authorship.repair.by) && r1.authorship.corpus.by === "PROVIDER" && r1.authorship.plumbing.by === "PROVIDER" && r1.authorship.integration.by === "NOT_INTEGRATED");
    check("run1: patch = MODIFIED helper (local model, design D2) + ADDED test (ODG rules); applies", r1.patch.files[0].change === "MODIFIED" && r1.patch.files[0].authoredBy === "LOCAL_MODEL" && r1.patch.files[0].design === "D2" && r1.patch.files[1].authoredBy === "ODG_RULES" && r1.patch.gitApplyCheck.ok === true);
    check("run1: the repair prompt shows the FAILED attempt (the S4 implementation of D2) as EVIDENCE", F1.prompts[3].includes("<<<ATTEMPT") && F1.prompts[3].includes(".filter((k: string) => value[k] !== undefined)") && r1.prompts[3].segments.some((x: any) => x.kind === "EVIDENCE" && /failed generation/.test(x.source)));
    check("run1: impact analysed and recorded (change-impact-graph)", r1.impact && r1.impact.exists === true && Array.isArray(r1.impact.consumers));
    const kinds = r1.lessons.find((l: any) => l.value.kind === "REPAIR_NEEDED");
    check("run1: lessons written into the record (REPAIR_NEEDED with case kinds, CONSOLIDATED; CORPUS_GAP from NB1's prior acceptance)", !!kinds && kinds.consolidated === true && kinds.value.caseKinds.length >= 1 && r1.lessons.some((l: any) => l.value.kind === "CORPUS_GAP" && /V175_NATIVE_BUILD_RESULT/.test(l.value.priorRun)));
    // run 2 READS run 1's lessons
    const F2 = R.makeFake({ impl: { "Design alpha": [R.FIX_RIGHT], "Design beta": [R.FIX_RIGHT] } });
    const r2 = await R.runNativeDesign({ root: ROOT, label: "TEST", transport: F2.fake, extraLessons: [{ record: r1, provenance: "TEST run1" }] });
    check("run2: lessons read (memory-taxonomy CONSOLIDATED) = run1's lessons", r2.lessonsRead.reusedIds.length === r1.lessons.length && r1.lessons.every((l: any) => r2.lessonsRead.reusedIds.includes(l.id)));
    check("run2: every lesson hint appears in the design prompt actually sent", r1.lessons.every((l: any) => F2.prompts[0].includes(l.value.hint)));
    check("run2: lesson case kinds add shown cases (mechanical reuse) vs run1", r2.problem.shown.length > r1.problem.shown.length);
    const r3 = await R.runNativeDesign({ root: ROOT, label: "TEST", transport: R.makeFake({ impl: { "Design alpha": [R.FIX_RIGHT], "Design beta": [R.FIX_RIGHT] } }).fake, extraLessons: [{ record: { ...r1, verdict: "NOT_MEASURED", lessons: undefined }, provenance: "x" }] });
    check("run3: lessons from a NOT_MEASURED record are RAW ⇒ not reused", r3.lessonsRead.lessons.length === 0 && r3.problem.shown.length === r1.problem.shown.length);
    // a refused (non-loopback) transport path ⇒ NOT_MEASURED
    const g = P.makeGuard(F2.fake, R.BUDGETS); let refused = false; try { await g.fetchImpl("http://10.0.0.1:11434/api/generate", { body: "{}" }); } catch { refused = true; }
    check("guard refuses a non-loopback URL and records it", refused && g.st.refused.length === 1);
  }
  if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
})();
export {};
