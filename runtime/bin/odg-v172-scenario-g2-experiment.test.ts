#!/usr/bin/env node
"use strict";
/* V17.2 — tests of the G2 runner + held-out builder (offline; synthetic data only; NEVER runs on the real data and never
 * builds the real held-out file — that is ODG GO's dispatch). Runs the runner's --selftest (grade rule, arms, vault,
 * synthetic end-to-end core, builder on a synthetic temporary git repo, gate on the live contract), then checks the CLI
 * write confinement (non-declared paths ⇒ exit 3, nothing written) and that neither declared output appears. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const E = require("./odg-v172-scenario-g2-experiment.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const tsx = path.join(ROOT, "node_modules", ".bin", "tsx");
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
const before = { out: exists(E.OUT) ? fs.readFileSync(path.join(ROOT, E.OUT), "utf8") : null, held: exists(E.HELDOUT) ? fs.readFileSync(path.join(ROOT, E.HELDOUT), "utf8") : null };

const st = cp.spawnSync(tsx, [E.SELF, "--selftest"], { cwd: ROOT, encoding: "utf8", timeout: 240000 });
check("--selftest exits 0 with ALL PASS", st.status === 0 && /ALL PASS/.test(String(st.stdout)));
for (const args of [[], ["docs/odg/evidence/OTHER.json"], [E.HELDOUT], ["./" + E.OUT], ["--check", "docs/x.json"], ["--check-at-run-head", "docs/x.json"], ["--bogus", E.OUT]]) {
  const r = cp.spawnSync(tsx, [E.SELF, ...args], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  check(`CLI ${JSON.stringify(args)} ⇒ REFUSED exit 3`, r.status === 3 && /REFUSED/.test(String(r.stdout)));
}
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8")).contracts.find((c: any) => c.scenario === "G2");
check("runner constants equal the frozen G2 preRegistration text", E.constantsMismatch(live).length === 0);
check("gate refuses without an inspection record", E.gate(live, null).ok === false);
check("declared outputs untouched by the tests", (exists(E.OUT) ? fs.readFileSync(path.join(ROOT, E.OUT), "utf8") : null) === before.out && (exists(E.HELDOUT) ? fs.readFileSync(path.join(ROOT, E.HELDOUT), "utf8") : null) === before.held);
process.stdout.write(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}\n`);
process.exitCode = failures === 0 ? 0 : 1;
export {};
