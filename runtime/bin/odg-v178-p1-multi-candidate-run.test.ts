#!/usr/bin/env node
"use strict";
/* V17.8 P1 — tests of the multi-candidate runner + the V178-P1 / V178-P2 contract bindings. Offline: FAKE transports behind the
 * real loopback guard, FAKE code runner (child node process standing in for bwrap); NEVER invokes a NATIVE path with a real
 * output (no model call, no benchmark run, nothing written). */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("./odg-v178-p1-multi-candidate-run.js");
const M2 = require("./odg-local-model-benchmark.js");
const PIPE = require("../core/odg-native-design-pipeline.js");
const AS = require("../core/odg-authorization-scope.js");
const EP = require("../core/odg-authorization-evidence-paths.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

(async () => {
  const D = readJson("docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json");
  const c1 = D.contracts.find((c: any) => c.scenario === "V178-P1");
  const c2 = D.contracts.find((c: any) => c.scenario === "V178-P2");
  // ---- binding ----
  for (const [c, out, insp] of [[c1, R.OUT, R.INSPECTION], [c2, M2.P2_OUT, M2.P2_INSPECTION]] as any) {
    const sc = AS.deriveAuthorizationScope(c, {});
    check(`${c.scenario}: AUTHORIZED_FOR_REVISION, bound to the build-missions record (family V176-BUILD-MISSIONS); REVISE validated, INSPECT current, nothing executable`, c.state === "AUTHORIZED_FOR_REVISION" && c.authorization.executionAuthorized === false && sc.applicable === true && sc.currentStep === "INSPECT_REVISED_CONTRACT" && sc.executionAuthorized === false && AS.OWNER_SOURCES[c.scenario].family === "V176-BUILD-MISSIONS");
    check(`${c.scenario}: AC1–AC6 kept verbatim (= revision originalCriteria) + AC7; write_set concrete (estimate replaced) and contains the dispatch writeSet; author session p12-v178`, JSON.stringify(c.WORK_ITEM_CONTRACT.acceptance_criteria.slice(0, 6)) === JSON.stringify(c.revisionHistory[0].originalCriteria) && /^AC7/.test(c.WORK_ITEM_CONTRACT.acceptance_criteria[6]) && c.WORK_ITEM_CONTRACT.write_set_estimate.estimate === false && c.WORK_ITEM_CONTRACT.write_set.includes(out) && c.revisionHistory[0].revisionAuthorSessionId === "p12-v178" && c.binding.status === "BOUND");
    check(`${c.scenario}: evidence paths declared (inspection / experiment = dispatch output / validation)`, EP.AUTH_EVIDENCE[c.scenario].inspection === insp && EP.AUTH_EVIDENCE[c.scenario].experiment === out && JSON.stringify(c.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.writeSet) === JSON.stringify([out]));
    check(`${c.scenario}: preRegistration complete (metric/baseline/dataset/decisionRule/thresholds) + caps.maxRunWallMs declared (GO-DTO-1)`, ["metric", "baseline", "dataset", "decisionRule", "thresholds"].every((k) => !!c.WORK_ITEM_CONTRACT.preRegistration[k]) && Number.isFinite(c.WORK_ITEM_CONTRACT.preRegistration.caps.maxRunWallMs) && /BEFORE the first work call/.test(c.WORK_ITEM_CONTRACT.preRegistration.thresholds.NOT_MEASURED));
    check(`${c.scenario}: exclusive — citing the V175 record too ⇒ refused; P3 (unbound) has no owner source`, AS.ownerSourceCheck(c.scenario, c.authorization.source + " + docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json").ok === false && AS.ownerSourceCheck("V178-P3", c.authorization.source).ok === false);
  }
  check("P3 untouched: still PROPOSED, authorizedBy null, UNBOUND (P4–P7 bound by V19)", D.contracts.filter((c: any) => /^V178-P3$/.test(c.scenario)).every((c: any) => c.state === "PROPOSED" && c.authorizedBy === null && c.binding.status === "UNBOUND"));
  check("P1 pre-registration enforced: contract budgets + thresholds = runner's; tampering ⇒ gate refuses", R.budgetsMatch(c1) && (() => { const t = JSON.parse(JSON.stringify(c1)); t.WORK_ITEM_CONTRACT.preRegistration.thresholds.declared.passMinPasses = 3; return R.budgetsMatch(t) === false && /pre-registration/.test(R.gate(t, null, null).reason); })() && R.gate(c1, null, null).ok === false);
  check("P2 pre-registration enforced: contract budgets = P2_BUDGETS; tampering ⇒ refused; with the committed inspection (V178_P2_CONTRACT_INSPECTION.json ACCEPT, #1014) the untampered contract is authorized", (() => { const t = JSON.parse(JSON.stringify(c2)); t.WORK_ITEM_CONTRACT.budgets.maxCalls = 500; return /pre-registration/.test(M2.p2Gate(ROOT, t).reason); })() && M2.p2Gate(ROOT, c2).ok === (() => { try { const i = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V178_P2_CONTRACT_INSPECTION.json"), "utf8")); return i.contractSha256 === require("../core/odg-authorization-scope.js").contractSha256(c2);   /* p2Gate reads the inspection only; a second run is refused separately (ALREADY_RECORDED) */ } catch { return false; } })());   // authorized ⇔ the committed inspection is bound to the CURRENT contract sha (rev 2 re-inspection lands in its own PR)
  check("P1 schedule: 3 trials × 4 points, t0 point shared; maxModelCalls = 2 tasks × (1 + 3×3)", R.SCHEDULE.length === 3 && R.SCHEDULE.every((s: any) => s.length === 4 && s[0].temperature === 0 && s[0].seed === 42) && R.BUDGETS.maxModelCalls === 2 * (1 + 3 * 3) && R.POINTS.length === 10);

  // ---- end-to-end with fakes ----
  const WRONG = "export function parseRange(spec: string): number[] { return []; }\n";
  const RIGHT = "export function parseRange(spec: string): number[] {\n  const out = new Set<number>();\n  if (spec.trim() === \"\") return [];\n  for (const raw of spec.split(\",\")) {\n    const it = raw.trim();\n    const m = /^(\\d+)(?:-(\\d+))?$/.exec(it);\n    if (!m) throw new Error(\"malformed: \" + it);\n    const a = Number(m[1]); const b = m[2] === undefined ? a : Number(m[2]);\n    if (b < a) throw new Error(\"malformed: \" + it);\n    for (let i = a; i <= b; i++) out.add(i);\n  }\n  return [...out].sort((x, y) => x - y);\n}\n";
  const CHUNK = "function chunk(arr, size) {\n  if (!Number.isInteger(size) || size <= 0) throw new RangeError('size');\n  const out = [];\n  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));\n  return out;\n}\nmodule.exports = { chunk };\n";
  const TAMPER = "const fs = require('fs');\n" + RIGHT;
  // the seed-1101 sample (trial 1) is a TAMPERING candidate that would pass; the others are right only at temperature 1.0
  const T = R.fakeTransport((prompt: string, o: any) => /parseRange/.test(prompt) ? "```ts\n" + (o.seed === 1101 ? TAMPER : o.temperature === 1 ? RIGHT : WRONG) + "```" : "```js\n" + CHUNK + "```");
  const r = await R.runP1({ root: ROOT, label: "TEST", transport: T.fake, codeRunner: R.fakeRunner, loadProbe: R.IDLE });
  const pr = r.trials.filter((t: any) => t.task === "impl-ts-parse-range");
  check("e2e: PASS 6/6; tampering candidate excluded before selection; parseRange chosen = the temperature-1.0 candidate (visible cases decide)", r.verdict === "PASS" && r.result.passes === 6 && pr[0].selection.excluded.length === 1 && pr[0].candidates.find((c: any) => c.seed === 1101).excludedReason && pr.every((t: any) => t.candidates.find((c: any) => c.id === t.selection.chosen).temperature === 1 && t.selection.decidedBy === "visiblePassed"));
  check("e2e: control t0 arm recorded (3/6, descriptive) — the V155-comparable decode reproduces the baseline shape", r.result.controlT0.passes === 3);
  check("e2e: hidden cases never in selection: every candidate's caseResults keys ⊆ the visible split", r.trials.every((t: any) => t.candidates.every((c: any) => Object.keys(c.caseResults || {}).every((k: string) => t.split.visible.includes(Number(k))))));
  check("e2e: every sent call is a pre-declared point; t0 sent once per task (reused); calls ≤ cap; loopback only", T.calls.every((c: any) => R.POINTS.some((p: any) => p.temperature === c.temperature && p.seed === c.seed)) && T.calls.length === 20 && r.network.modelCalls === 20 && r.network.refused.length === 0);
  const Tw = R.fakeTransport((prompt: string) => /parseRange/.test(prompt) ? "```ts\n" + WRONG + "```" : "```js\n" + CHUNK + "```");
  const rw = await R.runP1({ root: ROOT, label: "TEST", transport: Tw.fake, codeRunner: R.fakeRunner, loadProbe: R.IDLE });
  check("e2e: a model that never solves parseRange ⇒ FAIL 3/6 (= baseline, not above) — recorded, not NOT_MEASURED", rw.verdict === "FAIL" && rw.result.passes === 3);
  const rb = await R.runP1({ root: ROOT, label: "TEST", transport: Tw.fake, codeRunner: R.fakeRunner, loadProbe: () => ({ loadavg: [7, 7, 7], nproc: 8 }) });
  const rs = await R.runP1({ root: ROOT, label: "TEST", transport: Tw.fake, codeRunner: () => ({ ran: false, reason: "no bwrap" }), loadProbe: R.IDLE });
  check("e2e: busy host / sandbox unavailable BEFORE the first call ⇒ NOT_MEASURED with 0 work calls", rb.verdict === "NOT_MEASURED" && /HOST-1/.test(rb.reason) && rs.verdict === "NOT_MEASURED" && /sandbox/.test(rs.reason) && !rb.network?.modelCalls);
  check("rules exported: SAMPLE-1 / XSEL-1 recorded in the result", r.rules.sample === PIPE.SAMPLE_RULE && r.rules.select === PIPE.XSEL_RULE);
  if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
})();
export {};
