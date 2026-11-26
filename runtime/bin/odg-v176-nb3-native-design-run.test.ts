#!/usr/bin/env node
"use strict";
/* V17.6 NB3 — tests of the NB3 runner (the NB2 runner under NB3's contract profile + the DIV-1 repair-diversity ladder).
 * Offline: FAKE model transports behind the real loopback guard; real bwrap sandbox when available; writes nothing.
 * NEVER invokes the NATIVE CLI path (no real output path is ever passed to the runner). */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const R = require("./odg-v176-nb3-native-design-run.js");
const NB2 = require("./odg-v175-native-design-run.js");
const P = require("../core/odg-native-design-pipeline.js");
const AS = require("../core/odg-authorization-scope.js");
const NBS = require("../core/odg-native-build-sandbox.js");
const EP = require("../core/odg-authorization-evidence-paths.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const inLadder = (calls: any[]) => calls.every((c: any) => P.allowedCallOptions(R.DIVERSITY, R.BUDGETS.model).some((a: any) => a.model === c.model && a.temperature === c.temperature && a.seed === c.seed));

(async () => {
  // ---- pre-registration: budgets = NB2's + diversity only; schedule fixed; no larger registered model ----
  const { diversity, ...rest } = R.BUDGETS;
  check("budgets = NB2's budgets unchanged (same maxModelCalls / wallMs / ADAPT-1 / HOST-1 / DIGEST-1) + diversity", JSON.stringify(rest) === JSON.stringify(NB2.BUDGETS) && !!diversity && R.BUDGETS.maxModelCalls === 12);
  check("DIV-1 escalation: the committed V155 registry lists no AVAILABLE model larger than qwen2.5-coder:7b ⇒ escalationModels []", JSON.stringify(P.largerModels(readJson(R.REGISTRY), R.BUDGETS.model)) === "[]" && R.DIVERSITY.escalationModels.length === 0);
  check("ladder over 3 designs: BASE, 2 SAMPLING, DESIGN_SWITCH, 2 SAMPLING, DESIGN_SWITCH, 2 SAMPLING; maxVariations = length − 1", (() => { const l = P.diversityLadder(R.DIVERSITY, ["D1", "D2", "D3"], R.BUDGETS.model); return l.map((p: any) => p.kind).join() === "BASE,SAMPLING,SAMPLING,DESIGN_SWITCH,SAMPLING,SAMPLING,DESIGN_SWITCH,SAMPLING,SAMPLING" && R.DIVERSITY.maxVariations === l.length - 1; })());

  // ---- contract (canonical file) ----
  const c = R.readContract(ROOT);
  const derived = R.contractFor(ROOT);
  check("V160 entry V176-NB3 exists, AUTHORIZED_FOR_REVISION, executionAuthorized false", !!c && c.state === "AUTHORIZED_FOR_REVISION" && c.authorization.executionAuthorized === false && c.authorization.by === "OWNER");
  // reference.copies carry LINE numbers (REF-1 provenance) that move whenever an unrelated edit shifts a copy — compared by file only
  const noLines = (o: any) => JSON.stringify({ ...o, reference: { ...o.reference, copies: o.reference.copies.map((x: string) => x.replace(/:\d+$/, "")) } });
  if (derived) check("entry origin (copies by file) + WORK_ITEM_CONTRACT = ODG-rules derivation from this tree (same target / oracle as NB2)", noLines(c.origin) === noLines(derived.origin) && JSON.stringify(c.WORK_ITEM_CONTRACT) === JSON.stringify((() => { const w = JSON.parse(JSON.stringify(derived.WORK_ITEM_CONTRACT)); const rev2 = c.revisionHistory[1]; if (!rev2) return w; const added = c.WORK_ITEM_CONTRACT.write_set.filter((f: string) => !rev2.original.write_set.includes(f)); w.write_set = c.WORK_ITEM_CONTRACT.write_set.filter((f: string) => w.write_set.includes(f) || added.includes(f)); w.preRegistration = { ...w.preRegistration, rerun: c.WORK_ITEM_CONTRACT.preRegistration.rerun }; return JSON.stringify(rev2.original.write_set) === JSON.stringify(derived.WORK_ITEM_CONTRACT.write_set) ? w : null; })()));   // = the ODG-rules derivation + exactly the documented rev-2 (NB3-FIX-1) delta
  const nb2 = NB2.readContract(ROOT);
  check("criteria NOT weakened: AC1–AC6 = NB2's verbatim (all PROB-1 cases + strict typecheck + apply), + AC7; same origin digest as NB2", JSON.stringify(c.WORK_ITEM_CONTRACT.acceptance_criteria.slice(0, 6)) === JSON.stringify(nb2.WORK_ITEM_CONTRACT.acceptance_criteria) && /^AC7/.test(c.WORK_ITEM_CONTRACT.acceptance_criteria[6]) && c.origin.evidenceDigest === nb2.origin.evidenceDigest);
  check("NOT_MEASURED only before the first work call (stop conditions + thresholds inherited from NB2)", c.WORK_ITEM_CONTRACT.stop_conditions.some((x: string) => /BEFORE the first work call ⇒ NOT_MEASURED, AFTER it ⇒ a FAILED generation/.test(x)) && /BEFORE the first work call/.test(c.WORK_ITEM_CONTRACT.preRegistration.thresholds.NOT_MEASURED));
  check("schedule pre-registered in the contract: budgets.diversity = runner DIVERSITY; preRegistration.diversitySchedule + hypothesis", R.budgetsMatch(c) && !!c.WORK_ITEM_CONTRACT.preRegistration.diversitySchedule && /H-NB3/.test(c.WORK_ITEM_CONTRACT.preRegistration.hypothesis));
  const t = c.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS;
  check("dispatch target = NB3 runner → V176_NB3_NATIVE_DESIGN_RESULT.json (writeSet = [result] ⊆ write_set)", t.command === R.SELF && JSON.stringify(t.args) === JSON.stringify([R.OUT]) && JSON.stringify(t.writeSet) === JSON.stringify([R.OUT]) && c.WORK_ITEM_CONTRACT.write_set.includes(R.OUT) && R.OUT === "docs/odg/evidence/V176_NB3_NATIVE_DESIGN_RESULT.json");
  check("revisionHistory: rev 1 author session nb3-v176 (original criteria recorded); rev 2 = NB3-FIX-1 RERUN-1 under the owner decision, criteria unchanged", c.revisionHistory.length === 2 && c.revisionHistory[0].revisionAuthorSessionId === "nb3-v176" && c.revisionHistory[0].originalCriteria.length === 6 && c.revisionHistory[1].revisionAuthorSessionId === "v19-nb3-fix1" && /V19_OWNER_DECISION_NB3_RERUN/.test(c.revisionHistory[1].authorizedBy) && JSON.stringify(c.revisionHistory[1].originalCriteria) === JSON.stringify(c.WORK_ITEM_CONTRACT.acceptance_criteria));
  check("evidence paths declared (single map for GO + register)", EP.AUTH_EVIDENCE["V176-NB3"].inspection === R.INSPECTION && EP.AUTH_EVIDENCE["V176-NB3"].experiment === R.OUT && /V176_NB3_CRITERIA_VALIDATION\.json$/.test(EP.AUTH_EVIDENCE["V176-NB3"].validation));

  // ---- owner binding (exclusive) ----
  const sc = AS.deriveAuthorizationScope(c, {});
  check("bound to V176 build missions: REVISE validated, INSPECT current, nothing executable", sc.applicable === true && sc.currentStep === "INSPECT_REVISED_CONTRACT" && sc.executionAuthorized === false);
  check("exclusive: NB3 citing NB1/NB2's V175 record ⇒ refused; NB2 / NB1 citing the build-missions record ⇒ refused; V175-NATIVE-LOOP still shared by NB1+NB2 only", AS.ownerSourceCheck("V176-NB3", c.authorization.source + " + docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json").ok === false && AS.ownerSourceCheck("V175-NB2", nb2.authorization.source + " + " + c.authorization.source).ok === false && AS.ownerSourceCheck("V175-NB1", nb2.authorization.source).ok === true && Object.keys(AS.OWNER_SOURCES).filter((k: string) => AS.OWNER_SOURCES[k].family === "V175-NATIVE-LOOP").join() === "V175-NB1,V175-NB2");
  const H = readJson(NB2.CONTRACTS).contracts.find((x: any) => x.scenario === "H");
  const h2 = JSON.parse(JSON.stringify(H)); h2.authorization.source = c.authorization.source;
  check("the build-missions record cannot authorize a scenario not bound to it (H) — sharing only by declared family", AS.deriveAuthorizationScope(h2, {}).applicable === false && AS.ownerSourceCheck("H", c.authorization.source).ok === false);
  check("gate refuses without an inspection record", R.gate(c, null, null).ok === false);
  const tampered = JSON.parse(JSON.stringify(c)); tampered.WORK_ITEM_CONTRACT.budgets.diversity.maxVariations = 20;
  check("gate refuses a contract whose budgets/schedule differ from the runner's (pre-registration enforced)", R.budgetsMatch(tampered) === false && /budgets/.test(R.gate(tampered, null, null).reason));

  // ---- end-to-end with FAKE transports (fixtures, NOT native results) ----
  const probe = NBS.probeSandbox();
  if (!derived) process.stdout.write("SKIP - end-to-end: defect already integrated\n");
  else if (!(probe && probe.ok === true)) process.stdout.write("SKIP - sandbox unavailable\n");
  else {
    // NB2's failure mode reproduced: temperature 0 ⇒ the SAME wrong code every time; a sampled call ⇒ the right code.
    const F2 = R.fakeBySampling(); const r2 = await NB2.runNativeDesign({ root: ROOT, label: "TEST", transport: F2.fake, loadProbe: NB2.IDLE });
    check("control (NB2 profile, same fake): stalls NO_PROGRESS_IDENTICAL_REGENERATION ⇒ FAIL", r2.verdict === "FAIL" && r2.rounds.every((x: any) => x.repairStopReason === "NO_PROGRESS_IDENTICAL_REGENERATION") && r2.diversity === undefined);
    const F3 = R.fakeBySampling(); const r3 = await R.runNb3({ root: ROOT, label: "TEST", transport: F3.fake, loadProbe: NB2.IDLE });
    check("NB3 (same fake): the stall is detected and DIV-1 advances to a SAMPLING point ⇒ PASS", r3.verdict === "PASS" && r3.diversity.transitions.length === 1 && r3.diversity.transitions[0].reason === "IDENTICAL_REGENERATION" && r3.diversity.transitions[0].kind === "SAMPLING" && r3.diversity.events.some((e: any) => e.kind === "STALL_IDENTICAL_REGENERATION"));
    check("NB3: every sent call is a pre-registered point and records (model, temperature, seed); within maxModelCalls", inLadder(F3.calls) && r3.network.modelCalls <= R.BUDGETS.maxModelCalls && r3.generations.every((g: any) => typeof g.temperature === "number" && typeof g.seed === "number" && g.model === R.BUDGETS.model) && r3.diversity.callsByPoint.length >= 1);
    check("NB3 record: scenario V176-NB3, runner = NB3 runner, lessons provenance = NB3 OUT", r3.scenario === "V176-NB3" && r3.run.runner === R.SELF && r3.lessons.every((l: any) => l.provenance === R.OUT));
    const Fn = R.fakeBySampling({ never: true }); const rn = await R.runNb3({ root: ROOT, label: "TEST", transport: Fn.fake, loadProbe: NB2.IDLE });
    const ladderN = rn.diversity.ladder.length;
    check("never-right model: ladder walked to exhaustion, FAIL (not NOT_MEASURED), no call past the schedule, within the cap", rn.verdict === "FAIL" && rn.diversity.exhausted === true && rn.diversity.transitions.length === ladderN - 1 && /DIV-1 ladder exhausted/.test(rn.reason) && rn.network.modelCalls <= R.BUDGETS.maxModelCalls && inLadder(Fn.calls));
    check("never-right model: design switch happened in SEL-1 order (rank 2 after rank 1's sampling points)", rn.diversity.transitions.filter((x: any) => x.kind === "DESIGN_SWITCH").map((x: any) => x.design).join() === rn.selection.ranking.slice(1).join());
    // NB3-FIX-1 (inspection REJECT of run 6382ec04): after a DESIGN_SWITCH the switched design's S4 implementation is REUSED (no
    // call), and every "S5 repair <D>" prompt follows a generation/reuse of THAT design (never D1's failed attempt carried over)
    {
      const sw = rn.diversity.transitions.filter((x: any) => x.kind === "DESIGN_SWITCH").map((x: any) => x.design);
      const reused = rn.diversity.events.filter((e: any) => e.kind === "DESIGN_SWITCH_REUSED_S4").map((e: any) => e.design);
      check("NB3-FIX-1: every switched design with an S4 implementation is reused first (DESIGN_SWITCH_REUSED_S4)", sw.length > 0 && sw.filter((d: string) => rn.selection && rn.design && rn.generations.some((g: any) => g.design === d && /^S4 /.test(g.stage) && g.ok)).every((d: string) => reused.includes(d)));
      const firstOf = (d: string) => Math.min(...rn.generations.filter((g: any) => g.design === d).map((g: any) => g.promptI || Infinity));
      const repairOk = rn.prompts.filter((p: any) => /^S5 repair (D\d+)/.test(p.stage)).every((p: any) => { const d = ((/^S5 repair (D\d+)/.exec(p.stage) || [])[1]) as string; return d === rn.selection.chosen || reused.includes(d) || firstOf(d) < p.i; });
      check("NB3-FIX-1: no S5 repair prompt of a switched design before that design was generated or reused (its attempt is its own)", repairOk);
    }
    // the SAME total cap binds the diversity walk: a 5-call profile stops on the cap
    const small = { ...R.PROFILE, budgets: { ...R.BUDGETS, maxModelCalls: 5 } };
    const Fc = R.fakeBySampling({ never: true }); const rc = await NB2.runNativeDesign({ root: ROOT, label: "TEST", transport: Fc.fake, loadProbe: NB2.IDLE, profile: small });
    check("cap binds the walk: maxModelCalls 5 ⇒ ≤ 5 work calls sent, FAIL with the cap recorded", Fc.calls.length <= 5 && rc.network.modelCalls <= 5 && rc.verdict === "FAIL" && rc.network.capHit === "maxModelCalls");
  }
  if (failures) { process.stdout.write(`${failures} failure(s)\n`); process.exit(1); }
})();
export {};
