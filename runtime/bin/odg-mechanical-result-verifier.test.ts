#!/usr/bin/env node
"use strict";
/* MECH-1 verifier tests — the committed P1 records verify CONSISTENT; tampered copies are caught (never vacuous). */
const fs = require("fs"), path = require("path"), os = require("os");
const V = require("./odg-mechanical-result-verifier.ts");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0; const check = (n: string, c: boolean) => { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; };
const FILES = ["docs/odg/evidence/V178_P1_MULTI_CANDIDATE_RESULT.json", "docs/odg/evidence/V178_P1_GO_EXECUTE_TRACE.jsonl", "docs/odg/evidence/V178_P1_REPAIR_AGREEMENT_PROVENANCE.json", "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json", "docs/odg/evidence/V164_STRATEGIC_REGISTER.json", "runtime/core/odg-execution-agreement.ts"];
function copyRoot(mut: (root: string) => void): string { const t = fs.mkdtempSync(path.join(os.tmpdir(), "mech-")); for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(t, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(t, f)); } mut(t); return t; }
function editJson(root: string, f: string, fn: (j: any) => void) { const p = path.join(root, f); const j = JSON.parse(fs.readFileSync(p, "utf8")); fn(j); fs.writeFileSync(p, JSON.stringify(j)); }
const R = "docs/odg/evidence/V178_P1_MULTI_CANDIDATE_RESULT.json";
const ok = V.buildRecord(ROOT, "V178-P1");
check("committed P1 records ⇒ CONSISTENT, recomputed FAIL 3/6, all 6 checks ok", ok.verdict === "CONSISTENT" && ok.recomputed.outcome === "FAIL" && ok.recomputed.accepted === 3 && ok.checks.length === 6 && ok.checks.every((c: any) => c.ok));
const bad = (name: string, mut: (r: string) => void, id: string) => { const rec = V.buildRecord(copyRoot(mut), "V178-P1"); check(name, rec.verdict !== "CONSISTENT" && rec.checks.some((c: any) => c.id === id && !c.ok)); };
bad("tampered pass count (passes 4) ⇒ RECOMPUTE fails", (t) => editJson(t, R, (j) => { j.result.passes = 4; }), "RECOMPUTE");
bad("a trial flipped to accepted ⇒ recomputed differs from verdict", (t) => editJson(t, R, (j) => { j.trials[3].accepted.passed = true; }), "RECOMPUTE");
bad("provider calls recorded ⇒ CONTRACT_LIMITS fails", (t) => editJson(t, R, (j) => { j.network.providerCalls = 1; }), "CONTRACT_LIMITS");
bad("model calls over the cap ⇒ CONTRACT_LIMITS fails", (t) => editJson(t, R, (j) => { j.network.modelCalls = 21; }), "CONTRACT_LIMITS");
bad("wrong contract sha ⇒ IDS_TRACES fails", (t) => editJson(t, R, (j) => { j.contractSha256 = "0".repeat(64); }), "IDS_TRACES");
bad("repair code claimed ODG-designed ⇒ PROVENANCE fails", (t) => editJson(t, "docs/odg/evidence/V178_P1_REPAIR_AGREEMENT_PROVENANCE.json", (j) => { j.provenance.integratedCode.odgDesigned = true; }), "PROVENANCE");
bad("trace with a second EXECUTE ⇒ IDS_TRACES fails", (t) => { const p = path.join(t, "docs/odg/evidence/V178_P1_GO_EXECUTE_TRACE.jsonl"); const l = fs.readFileSync(p, "utf8").split("\n").filter(Boolean); const e = l.find((x: string) => /"step":"EXECUTE"/.test(x)); fs.appendFileSync(p, e + "\n"); }, "IDS_TRACES");
{ const rec = V.buildRecord(copyRoot((t) => editJson(t, R, (j) => { for (const tr of j.trials) tr.accepted.passed = true; j.result.passes = 6; j.verdict = "PASS"; j.outcome = "PASS"; })), "V178-P1");
  check("a POSITIVE outcome is never CONSISTENT (MECH-1 not applicable)", rec.verdict === "NOT_APPLICABLE_POSITIVE_OUTCOME"); }
check("deterministic: two builds are byte-identical", JSON.stringify(V.buildRecord(ROOT, "V178-P1")) === JSON.stringify(ok));
if (failures) { process.stdout.write(failures + " failure(s)\n"); process.exit(1); }
process.stdout.write("all odg-mechanical-result-verifier tests pass\n");
export {};
