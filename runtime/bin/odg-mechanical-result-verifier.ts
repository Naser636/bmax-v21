#!/usr/bin/env node
"use strict";

/*
 * V17.8 MECH-1 — DETERMINISTIC MECHANICAL VERIFIER of a NEGATIVE experiment result (owner decision
 * docs/odg/V178_OWNER_DECISION_MECHANICAL_NEGATIVE_VALIDATION.json). It re-derives, from the committed raw records only,
 * the six checks MECH-1 requires (odg-authorization-scope.MECH_REQUIRED_CHECKS) and the outcome; it writes the
 * verification record (the reproducible trace) and, with --check, re-runs and compares byte-for-byte (no drift).
 * It never grades PASS/PARTIAL and certifies nothing: on a positive outcome it refuses (MECH-1 does not apply).
 * Scope: items registered in VERIFIERS (today V178-P1). No network, no model, no clock in the record.
 *
 * Usage:  npx tsx runtime/bin/odg-mechanical-result-verifier.ts <item> [--write | --check]
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const AS = require("../core/odg-authorization-scope.ts");
const { AUTH_EVIDENCE } = require("../core/odg-authorization-evidence-paths.ts");
const ROOT = path.resolve(__dirname, "..", "..");
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const REGISTER = "docs/odg/evidence/V164_STRATEGIC_REGISTER.json";

function readJson(root: string, p: string): any { try { return JSON.parse(fs.readFileSync(path.join(root, p), "utf8")); } catch { return null; } }
function sha256File(root: string, p: string): string | null { try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex"); } catch { return null; } }
const HEX64 = /^[0-9a-f]{64}$/;

/* V178-P1 — multi-candidate run (runtime/bin/odg-v178-p1-multi-candidate-run.ts). */
function verifyP1(root: string): any {
  const RUN = require("./odg-v178-p1-multi-candidate-run.ts");
  const ev = AUTH_EVIDENCE["V178-P1"];
  const tracePath = "docs/odg/evidence/V178_P1_GO_EXECUTE_TRACE.jsonl";
  const provPath = "docs/odg/evidence/V178_P1_REPAIR_AGREEMENT_PROVENANCE.json";
  const r = readJson(root, ev.experiment);
  const contract = RUN.readContract(root);
  const csha = contract ? AS.contractSha256(contract) : null;
  const checks: any[] = [];
  const add = (id: string, ok: boolean, detail: any) => checks.push({ id, ok: !!ok, detail });
  if (!r) { add("RAW_DATA", false, `${ev.experiment} missing or unparsable`); return { checks, recomputed: null, experimentSha256: null, contractSha256: csha }; }
  const trials = Array.isArray(r.trials) ? r.trials : [];
  const tasks = r.taskSet && Array.isArray(r.taskSet.tasks) ? r.taskSet.tasks : [];
  const nTasks = new Set(trials.map((t: any) => t.task)).size;
  const cands = trials.flatMap((t: any) => Array.isArray(t.candidates) ? t.candidates : []);
  const rawOk = trials.length === nTasks * r.budgets.trials && nTasks === r.thresholds.n / r.budgets.trials &&
    cands.length === trials.length * r.budgets.n && cands.every((c: any) => HEX64.test(String(c.sha256)) && (c.codeSha256 === null || HEX64.test(String(c.codeSha256)))) &&
    trials.every((t: any) => t.selection && t.accepted && t.controlT0);
  add("RAW_DATA", rawOk, { trials: trials.length, distinctTasks: nTasks, taskSetEntries: tasks.length, candidates: cands.length, budgetsTrials: r.budgets.trials, budgetsN: r.budgets.n });

  const accepted = trials.filter((t: any) => t.accepted.measured === true && t.accepted.passed === true).length;
  const t0 = trials.filter((t: any) => t.controlT0.passed === true).length;
  const measuredAll = trials.every((t: any) => t.accepted.measured === true);
  const outcome = !measuredAll ? "NOT_MEASURED" : accepted >= r.thresholds.passMinPasses ? "PASS" : "FAIL";
  const selOk = trials.every((t: any) => { const best = Math.max(...t.candidates.map((c: any) => Object.values(c.caseResults || {}).filter(Boolean).length)); const ch = t.candidates.find((c: any) => c.id === t.selection.chosen); return !!ch && ch.excludedReason === null && Object.values(ch.caseResults || {}).filter(Boolean).length === best && t.accepted.candidate === ch.id; });
  add("RECOMPUTE", accepted === r.result.passes && trials.length === r.result.n && t0 === r.result.controlT0.passes && outcome === r.verdict && outcome === r.outcome && selOk,
    { accepted, n: trials.length, controlT0: t0, recomputedOutcome: outcome, recordedVerdict: r.verdict, recordedOutcome: r.outcome, threshold: `PASS ⇔ ≥ ${r.thresholds.passMinPasses}/${r.thresholds.n}`, selectionVisibleMaxAndAcceptedIsChosen: selOk });

  let trace: any[] = [];
  try { trace = fs.readFileSync(path.join(root, tracePath), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l)); } catch { trace = []; }
  const runIds = new Set(trace.map((e: any) => e.runId).filter((x: any) => x && x !== "pending"));
  const exec = trace.filter((e: any) => e.step === "EXECUTE");
  const dt = exec.length === 1 && exec[0].decision && exec[0].decision.dispatchTarget && exec[0].decision.dispatchTarget.target;
  const idsOk = runIds.size === 1 && exec.length === 1 && exec[0].decision.scheduler.mission === "V178-P1" && !!dt && dt.command === "runtime/bin/odg-v178-p1-multi-candidate-run.ts" &&
    JSON.stringify(dt.args) === JSON.stringify([ev.experiment]) && /writes ⊆ target writeSet/.test(String(exec[0].decision.scheduler.reason)) && r.contractSha256 === csha && r.scenario === "V178-P1";
  add("IDS_TRACES", idsOk, { runIds: [...runIds], executeSteps: exec.length, mission: exec[0] && exec[0].decision.scheduler.mission, dispatchCommand: dt && dt.command, writeConfinement: exec[0] && /writes ⊆ target writeSet/.test(String(exec[0].decision.scheduler.reason)), resultContractSha256: r.contractSha256, recomputedContractSha256: csha });

  const net = r.network || {};
  const points = (RUN.POINTS || []).map((p: any) => `${p.model}|${p.temperature}|${p.seed}`);
  const callsInSchedule = (Array.isArray(r.calls) ? r.calls : []).every((c: any) => points.includes(`${c.model}|${c.temperature}|${c.seed}`));
  const limOk = RUN.budgetsMatch(contract) && AS.canon(r.budgets) === AS.canon(RUN.BUDGETS) && net.modelCalls <= r.budgets.maxModelCalls && net.warmupCalls <= r.budgets.maxWarmupCalls &&
    net.providerCalls === 0 && Array.isArray(net.refused) && net.refused.length === 0 && net.capHit === null && callsInSchedule && r.calls.length === net.modelCalls && r.wallMs <= r.budgets.wallMs &&
    r.sandboxProbe && r.sandboxProbe.measured === true && r.sandboxProbe.passed === true;
  add("CONTRACT_LIMITS", limOk, { budgetsMatchContract: RUN.budgetsMatch(contract), modelCalls: net.modelCalls, maxModelCalls: r.budgets.maxModelCalls, warmupCalls: net.warmupCalls, providerCalls: net.providerCalls, refused: net.refused, capHit: net.capHit, callsInPreDeclaredSchedule: callsInSchedule, wallMs: r.wallMs, wallBudgetMs: r.budgets.wallMs, sandboxProbe: r.sandboxProbe });

  const prov = readJson(root, provPath);
  const provOk = r.provenance && r.provenance.actor === "ODG" && r.provenance.providerCalls === 0 && r.provenance.providerEditedGeneratedCode === false &&
    (net.prompts || []).every((p: any) => p.model === r.budgets.model) && !!prov && /^PROVIDER/.test(String(prov.provenance.integratedCode.author)) && prov.provenance.integratedCode.odgDesigned === false &&
    prov.measuredEffect.onFullOracle === "NOT_MEASURED" && /^NOT_REPRODUCED/.test(String(prov.qualification && prov.qualification.verdict)) && fs.existsSync(path.join(root, prov.correction.module));
  add("PROVENANCE", provOk, { experimentActor: r.provenance && r.provenance.actor, providerEditedGeneratedCode: r.provenance && r.provenance.providerEditedGeneratedCode, promptModels: [...new Set((net.prompts || []).map((p: any) => p.model))], correctionModule: prov && prov.correction.module, correctionAuthor: prov && prov.provenance.integratedCode.author, odgDesigned: prov && prov.provenance.integratedCode.odgDesigned, nativeQualification: prov && prov.qualification && prov.qualification.specTests, correctionEffectOnOracle: prov && prov.measuredEffect.onFullOracle });

  const reg = readJson(root, REGISTER);
  const item = reg && reg.register && (reg.register.items || []).find((i: any) => i.id === "V178-P1");
  const regOk = !!item && item.contractRef && item.contractRef.contractSha256 === csha && ev.experiment === RUN.OUT && item.status !== "CLOSED_PASS";
  add("REGISTER_CONSISTENCY", regOk, { registerItem: !!item, registerContractSha256: item && item.contractRef && item.contractRef.contractSha256, authEvidenceExperiment: ev.experiment, runnerOut: RUN.OUT, registerStatusNotClosedPass: !!item && item.status !== "CLOSED_PASS" });

  return { checks, recomputed: { outcome, accepted, n: trials.length, controlT0: t0 }, experimentSha256: AS.experimentSha256(r), contractSha256: csha,
    inputs: [ev.experiment, tracePath, provPath, CONTRACTS, REGISTER].map((p) => ({ path: p, sha256: p === REGISTER ? "(not bound: regenerated view)" : sha256File(root, p) })) };
}

const VERIFIERS: any = Object.freeze({ "V178-P1": verifyP1 });
const OUT: any = Object.freeze({ "V178-P1": "docs/odg/evidence/V178_P1_MECHANICAL_VERIFICATION.json" });

function buildRecord(root: string, item: string): any {
  const v = VERIFIERS[item](root);
  const allOk = v.checks.length === AS.MECH_REQUIRED_CHECKS.length && v.checks.every((c: any) => c.ok);
  const negative = v.recomputed && ["FAIL", "NOT_MEASURED"].includes(v.recomputed.outcome);
  return { schema: "odg-mechanical-verification/1", item, rule: "MECH-1", ownerRecord: AS.MECH_OWNER_RECORD, verifier: "runtime/bin/odg-mechanical-result-verifier.ts",
    reproduce: `npx tsx runtime/bin/odg-mechanical-result-verifier.ts ${item} --check`, contractSha256: v.contractSha256, experimentSha256: v.experimentSha256,
    verdict: allOk && negative ? "CONSISTENT" : (!negative ? "NOT_APPLICABLE_POSITIVE_OUTCOME" : "INCONSISTENT"), recomputed: v.recomputed, checks: v.checks, inputs: v.inputs,
    limits: ["validates the RECORDING of a negative result only; certifies no success; not an independent inspection", "register status is a regenerated view (not hash-bound)"] };
}

function main(argv: string[]): number {
  if (argv[0] === "--check") { let rc = 0; for (const it of Object.keys(VERIFIERS)) rc = Math.max(rc, main([it, "--check"])); return rc; }   // all items
  if (argv[0] === "--write") { let rc = 0; for (const it of Object.keys(VERIFIERS)) rc = Math.max(rc, main([it, "--write"])); return rc; }   // all items — the pre-open gate regenerates with `--write` alone
  const item = argv[0];
  if (!VERIFIERS[item]) { process.stdout.write(`usage: odg-mechanical-result-verifier.ts <${Object.keys(VERIFIERS).join("|")}> [--write|--check]\n`); return 2; }
  const rec = buildRecord(ROOT, item); const text = JSON.stringify(rec, null, 2) + "\n";
  if (argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT[item]), text);
  if (argv.includes("--check")) { let cur = ""; try { cur = fs.readFileSync(path.join(ROOT, OUT[item]), "utf8"); } catch { cur = ""; } const same = cur === text; process.stdout.write(`--check: ${same ? "OK (reproduced byte-for-byte)" : "DRIFT"} verdict ${rec.verdict}\n`); return same ? 0 : 1; }
  process.stdout.write(`${item}: ${rec.verdict} ${rec.checks.map((c: any) => `${c.id}:${c.ok ? "ok" : "FAIL"}`).join(" ")} recomputed ${JSON.stringify(rec.recomputed)}\n`);
  return rec.verdict === "CONSISTENT" ? 0 : 1;
}

module.exports = { buildRecord, verifyP1, VERIFIERS, OUT };
if (require.main === module) process.exit(main(process.argv.slice(2)));
export {};
