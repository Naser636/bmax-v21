#!/usr/bin/env node
"use strict";
/* V16.4 strategy-mode run — OFFLINE checks over the COMMITTED evidence (no model, no provider, no network): the evidence
 * re-derives (--check); the pre-registered D criteria are the ones recorded; the grade follows the declared rule; the
 * per-mission decisions satisfy the invariants (provider never executable, HYBRID only decomposable+disjoint). */
const fs = require("fs");
const path = require("path");
const R = require("./odg-strategy-mode-run.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const ev = JSON.parse(fs.readFileSync(path.join(ROOT, R.OUT_REL), "utf8"));
const origWrite = process.stdout.write.bind(process.stdout); let out = "";
(process.stdout as any).write = (s: string) => { out += s; return true; };
const code = R.check();
(process.stdout as any).write = origWrite;
check("--check: committed evidence re-derives from sources + selector", code === 0 && /CHECK OK/.test(out));
check("pre-registration recorded verbatim", JSON.stringify(ev.preRegistration) === JSON.stringify(R.PRE_REGISTERED_D));
check("7 pre-registered criteria D1..D7", ev.preRegistration.criteria.map((c: any) => c.id).join(",") === "D1,D2,D3,D4,D5,D6,D7");
const res = ev.scenarioD.results;
const structuralFail = ["D1", "D2", "D3", "D4", "D5", "D6"].some((k) => res[k] === "FAIL");
check("grade follows the declared rule", ev.scenarioD.grade === (structuralFail ? "FAIL" : res.D7 === "PASS" ? "PASS" : "PARTIAL"));
check("prospective D7 is NOT_MEASURED ⇒ grade is not PASS", res.D7 === "NOT_MEASURED" && ev.scenarioD.grade !== "PASS");
check("no provider / model call", ev.providerCalls === 0 && ev.modelCalls === 0);

const ids = ev.missions.map((m: any) => m.id);
for (const want of ["V159/v159-bugfix-median", "V159/v159-repair-total-length", "V159/v159-refactor-even-squares", "V159/v159-implement-parse-range", "J/v159-implement-parse-range", "J/rle-codec", "J/csv-typed-validator", "J/range-clamp-pipeline", "v161-scenario-f-invoice-pipeline"])
  check(`mission present: ${want}`, ids.includes(want));
check("16 A–P contracts + V17.2 G2/J2 + V17.5 V175-NB1 + V175-NB2 present (AP family = 20)", ev.missions.filter((m: any) => m.family === "AP").length === 20 && ["AP-G2", "AP-J2", "AP-V175-NB1", "AP-V175-NB2"].every((id) => ev.missions.some((m: any) => m.id === id)));
{
  const apC = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8")).contracts;
  const stateOf = (id: string) => (apC.find((c: any) => "AP-" + c.scenario === id) || {}).state;
  check("A–P PROPOSED ⇒ DECISION_REQUIRED (selector never authorizes)", ev.missions.filter((m: any) => m.family === "AP" && stateOf(m.id) !== "AUTHORIZED").every((m: any) => m.current.mode === "DECISION_REQUIRED"));
  check("A–P AUTHORIZED (owner) ⇒ not M0 (the owner's authorization, never the selector's)", ev.missions.filter((m: any) => m.family === "AP" && stateOf(m.id) === "AUTHORIZED").every((m: any) => m.current.rule !== "M0" && m.current.authorizationRequired === false));
  check("AUTHORIZED_FOR_REVISION (G, V165) ⇒ still M0 DECISION_REQUIRED (revision ≠ execution)", ev.missions.filter((m: any) => m.family === "AP" && stateOf(m.id) === "AUTHORIZED_FOR_REVISION").every((m: any) => m.current.rule === "M0" && m.current.mode === "DECISION_REQUIRED"));
}
const sels = ev.missions.flatMap((m: any) => [m.prior, m.current].filter(Boolean));
check("every PROVIDER/HYBRID selection: auth+budget required, not executable, not launched", sels.filter((x: any) => ["PROVIDER", "HYBRID"].includes(x.mode)).every((x: any) => x.authorizationRequired && x.budgetRequired && !x.providerExecutable && x.launchedBySelector === false));
check("every HYBRID selection: decomposable + disjoint + native & delegated parts", sels.filter((x: any) => x.mode === "HYBRID").every((x: any) => x.inputs.decomposable && x.inputs.writeSetDisjoint && x.hybrid.nativeParts.length && x.hybrid.delegatedParts.length));
check("at least one HYBRID derived from real evidence (the §7 gap is exercised)", sels.some((x: any) => x.mode === "HYBRID"));
check("J replay reproduces J's recorded alternatives", ev.jStrategyReplay.length === 8 && ev.jStrategyReplay.every((r: any) => r.reproducesJ));
check("sources are hash-pinned", Object.values(ev.sources).every((s: any) => /^[0-9a-f]{64}$/.test(s.sha256)));
check("retrospective ≠ prospective stated", /RETROSPECTIVE/.test(ev.scenarioD.retrospectiveVsProspective) && /NOT_MEASURED/.test(ev.scenarioD.retrospectiveVsProspective));

process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};
