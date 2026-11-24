#!/usr/bin/env node
"use strict";
/* V17.6 — tests of runtime/bin/odg-v176-scenario-j-run.ts. FAKE model only; the NATIVE path is NEVER started against the
 * real tree (ODG_TEST_NO_NATIVE=1 + main() refuses unless a fake transport AND a temp root are injected — NB2 incident
 * lesson: a test must never be able to start the authorized real experiment). No network; temp claim dirs only. */
process.env.ODG_TEST_NO_NATIVE = "1";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const R = require("./odg-v176-scenario-j-run.ts");
const AS = require("../core/odg-authorization-scope.js");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const clone = (o: any) => JSON.parse(JSON.stringify(o));
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const CF = JSON.parse(fs.readFileSync(path.join(ROOT, R.CONTRACTS), "utf8"));
const J = CF.contracts.find((c: any) => c.scenario === "J");
const silent = async (f: () => Promise<any>) => { const w = process.stdout.write.bind(process.stdout); const out: string[] = []; (process.stdout as any).write = (s: string) => { out.push(String(s)); return true; }; try { return { v: await f(), out: out.join("") }; } finally { (process.stdout as any).write = w; } };

(async () => {
  // 1. contract: criteria verbatim, plan, pins, dispatch target, write_set, never V161
  {
    const plan = R.planOf(J);
    check("contract J: acceptance_criteria unchanged (verbatim, 3) and copied into preRegistration.criteria C1–C3", J.WORK_ITEM_CONTRACT.acceptance_criteria.length === 3 && ["C1", "C2", "C3"].every((k, i) => J.WORK_ITEM_CONTRACT.preRegistration.criteria[k].text === J.WORK_ITEM_CONTRACT.acceptance_criteria[i]) && J.WORK_ITEM_CONTRACT.acceptance_criteria[0] === "stop triggered by NO_PROGRESS_IDENTICAL_REGENERATION or NO_QUALIFIED on a real task");
    check("plan = V161's tasks × 2 trials, caps declared, HOST-1 factor", plan.ok && JSON.stringify(plan.tasks) === JSON.stringify(["v159-implement-parse-range", "rle-codec", "csv-typed-validator", "range-clamp-pipeline"]) && plan.trials === 2 && plan.caps.maxRunWallMs === 10800000 && plan.caps.maxModelCallsTotal === 200 && plan.caps.hostIdleFactor === 0.75);
    check("every pin equals the current tree (V161 runner, corpus, V161 record, this runner)", plan.pins.length === 4 && plan.pins.every((p: any) => sha(path.join(ROOT, p.file)) === p.sha256) && plan.pins.some((p: any) => p.file === R.SELF));
    const t = J.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS;
    check("dispatch target = this runner, args/writeSet [V176_J_EXPERIMENT.json] ⊆ write_set; V161 record not in any write set", t.command === R.SELF && JSON.stringify(t.args) === JSON.stringify([R.OUT]) && JSON.stringify(t.writeSet) === JSON.stringify([R.OUT]) && JSON.stringify(J.WORK_ITEM_CONTRACT.write_set) === JSON.stringify([R.SELF, R.OUT]) && !J.WORK_ITEM_CONTRACT.write_set.some((w: string) => /V161|odg-v160/.test(w)));
    const sc = AS.deriveAuthorizationScope(J, {});
    check("scope: R2 validated (revision + preRegistration) ⇒ current step INSPECT_REVISED_CONTRACT, execution NOT authorized (no inspection)", sc.applicable && sc.validatedSteps.some((v: any) => v.step === "REVISE_CONTRACT") && sc.currentStep === "INSPECT_REVISED_CONTRACT" && sc.executionAuthorized === false);
    check("source never writes the prior record (no V161 path in a write call)", !/writeFileSync\([^)]*PRIOR/.test(fs.readFileSync(path.join(ROOT, R.SELF), "utf8")) && !/V161_SCENARIO_J\.json"\)?\s*,/.test(fs.readFileSync(path.join(ROOT, R.SELF), "utf8").split("const PRIOR")[1].split("\n").slice(1).join("\n")));
  }
  // 2. grading (pure, pre-registered): the committed V161 rows ⇒ PARTIAL (matches the CP8 grade)
  {
    const prior = JSON.parse(fs.readFileSync(path.join(ROOT, R.PRIOR), "utf8"));
    const plan = R.planOf(J);
    const g = R.gradeRows(prior.rows, plan, []);
    check("V161 rows graded by the pre-registered rule ⇒ PARTIAL (C1 not met as worded, C2 ∧ C3 met) — same as CP8", g.outcome === "PARTIAL" && g.criteria.C1.met === false && g.criteria.C2.met === true && g.criteria.C3.met === true && g.criteria.C3.n === 8 && g.criteria.C3.defaultPasses === 0 && g.criteria.C3.alternativePasses === 0);
    check("replication check on the V161 rows ⇒ REPRODUCED (report-only)", R.replicationCheck(g, prior).verdict === "REPRODUCED");
    const np = clone(prior.rows); np[0].default.stopReason = "NO_PROGRESS_IDENTICAL_REGENERATION";
    check("a NO_PROGRESS_IDENTICAL_REGENERATION default stop with an executed alternative ⇒ C1 met ⇒ PASS", R.gradeRows(np, plan, []).outcome === "PASS");
    const nr = clone(prior.rows); nr[2].alternative.executionStatus = "NOT_RUN";
    check("a NOT_RUN alternative ⇒ NOT_MEASURED", R.gradeRows(nr, plan, []).outcome === "NOT_MEASURED");
    check("fewer rows than planned ⇒ NOT_MEASURED; an incident ⇒ NOT_MEASURED; a cap / transport error in a row ⇒ NOT_MEASURED", R.gradeRows(prior.rows.slice(0, 7), plan, []).outcome === "NOT_MEASURED" && R.gradeRows(prior.rows, plan, ["x"]).outcome === "NOT_MEASURED" && R.gradeRows(prior.rows.map((r: any, i: number) => (i === 1 ? { ...r, capHit: "perTrialWallMs" } : r)), plan, []).outcome === "NOT_MEASURED" && R.gradeRows(prior.rows.map((r: any, i: number) => (i === 1 ? { ...r, transportErrors: 1 } : r)), plan, []).outcome === "NOT_MEASURED");
    const noAlt = clone(prior.rows).map((r: any) => ({ ...r, selection: { ...r.selection, strategy: "NO_ALTERNATIVE" }, alternative: null }));
    check("ODG stops but no alternative executed ⇒ FAIL (C2 not met)", R.gradeRows(noAlt, plan, []).outcome === "FAIL");
    check("a different measured outcome ⇒ replication NOT_REPRODUCED (grade unchanged)", R.replicationCheck(R.gradeRows(np, plan, []), prior).verdict === "NOT_REPRODUCED");
  }
  // 3. network guard
  {
    const seen: string[] = []; const t = async (u: string, init: any) => { seen.push(u + " " + (init.body || "")); return { ok: true, status: 200, json: async () => ({}) }; };
    const g = R.makeGuard(t, { maxRunWallMs: 1e9, maxModelCallsTotal: 2 });
    const refused = async (u: string, m = "POST") => { try { await g.fetchImpl(u, { method: m, body: "{}" }); return false; } catch { return true; } };
    check("guard refuses non-loopback, https, other port/path, query, GET generate", (await refused("http://10.0.0.1:11434/api/generate")) && (await refused("https://127.0.0.1:11434/api/generate")) && (await refused("http://127.0.0.1:11435/api/generate")) && (await refused("http://127.0.0.1:11434/api/pull")) && (await refused("http://127.0.0.1:11434/api/generate?x=1")) && (await refused("http://127.0.0.1:11434/api/generate", "GET")) && g.st.refused.length === 6 && seen.length === 0);
    await g.fetchImpl("http://127.0.0.1:11434/api/tags", { method: "GET" });
    await g.fetchImpl("http://127.0.0.1:11434/api/generate", { method: "POST", body: JSON.stringify({ options: { seed: 1, temperature: 0.9 } }) });
    check("allowlisted calls pass; seed 42 / temperature 0 forced on generate", seen.length === 2 && /"seed":42/.test(seen[1]) && /"temperature":0/.test(seen[1]) && g.st.tagsCalls === 1 && g.st.modelCalls === 1);
    await g.fetchImpl("http://127.0.0.1:11434/api/generate", { method: "POST", body: "{}" });
    check("maxModelCallsTotal cap ⇒ refused + capHit recorded", (await refused("http://127.0.0.1:11434/api/generate")) && g.st.capHit === "maxModelCallsTotal");
  }
  // 4. CLI gate + one-shot on a TEMP root (never the real tree); fake transport only
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-v176-j-")));
    const claimDir = path.join(tmp, "claims");
    for (const p of [R.CONTRACTS, ...R.planOf(J).pins.map((x: any) => x.file)]) { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.copyFileSync(path.join(ROOT, p), path.join(tmp, p)); }
    const HEAD = "a".repeat(40);
    const probes = { label: "TEST FIXTURE", mainRef: "fixture-main", commitExists: (s: string) => s === HEAD, isAncestorOfMain: (s: string) => s === HEAD, fileSha256: (rel: string) => { try { return sha(path.join(tmp, rel)); } catch { return null; } } };
    const BUSY = () => ({ loadavg: [99, 99, 99], nproc: 8 });
    const fake = R.makeFake(() => "module.exports = function parseRange(s) { return s.split(',').map(Number); };");
    const run = (argv: string[], o: any = {}) => silent(() => R.main(argv, { root: tmp, claimDir, probes, allowUnderTest: true, transport: fake.fake, loadProbe: R.IDLE, ...o }));
    check("wrong / extra argument ⇒ exit 3", (await run(["docs/odg/evidence/V161_SCENARIO_J.json"])).v === 3 && (await run([R.OUT, "--x"])).v === 3);
    check("real tree refused under test (ODG_TEST_NO_NATIVE) even with allowUnderTest", (await silent(() => R.main([R.OUT], { allowUnderTest: true, transport: fake.fake }))).v === 2 && (await silent(() => R.main([R.OUT], { root: tmp, allowUnderTest: true }))).v === 2);
    const na = await run([R.OUT]);
    check("no inspection record ⇒ NOT_AUTHORIZED (exit 2), nothing written, no claim", na.v === 2 && /INSPECT_REVISED_CONTRACT/.test(na.out) && !fs.existsSync(path.join(tmp, R.OUT)) && !fs.existsSync(claimDir));
    const insp = { scenario: "J", verdict: "ACCEPT", contractSha256: AS.contractSha256(J), inspector: "SIMULATED (test fixture)", inspectorSessionId: "sim-inspector-j-01", authorSessionId: J.revisionHistory[J.revisionHistory.length - 1].revisionAuthorSessionId, inspectedHeadSha: HEAD, inspectedPr: 999 };
    fs.writeFileSync(path.join(tmp, R.INSPECTION), JSON.stringify(insp));
    const busy = await run([R.OUT], { loadProbe: BUSY });
    check("SIMULATED inspection ACCEPT + busy host ⇒ HOST_BUSY exit 5, no claim, nothing written", busy.v === 5 && /HOST_BUSY/.test(busy.out) && !fs.existsSync(path.join(tmp, R.OUT)) && R.existingClaims(claimDir).length === 0);
    fs.mkdirSync(claimDir, { recursive: true }); fs.writeFileSync(path.join(claimDir, "0123456789abcdef-J.claim"), "{}");
    const cl = await run([R.OUT]);
    check("an existing GO claim for J ⇒ ALREADY_CLAIMED exit 4, nothing written", cl.v === 4 && /ALREADY_CLAIMED/.test(cl.out) && !fs.existsSync(path.join(tmp, R.OUT)));
    fs.rmSync(path.join(claimDir, "0123456789abcdef-J.claim"));
    const pr = R.planOf(J);
    // fixture plan size: keep the full plan (8 trials, fake model, real sandbox) — the run is FAKE, never a result
    const ok = await run([R.OUT]);
    const rec = fs.existsSync(path.join(tmp, R.OUT)) ? JSON.parse(fs.readFileSync(path.join(tmp, R.OUT), "utf8")) : null;
    check("FAKE-model run on the temp root ⇒ record written with contractSha256 + outcome + one-shot claim (O_EXCL) created", !!rec && rec.contractSha256 === AS.contractSha256(J) && ["PASS", "PARTIAL", "FAIL", "NOT_MEASURED"].includes(rec.outcome) && R.existingClaims(claimDir).length === 1 && R.existingClaims(claimDir)[0] === `${AS.contractSha256(J).slice(0, 16)}-J-runner.claim` && rec.network.providerCalls === 0 && rec.network.refused.length === 0);
    check("FAKE run: either 8 rows graded, or a recorded precondition (e.g. no sandbox) ⇒ NOT_MEASURED; prior record untouched", !!rec && ((rec.stage === "RUN" && rec.rows.length === pr.tasks.length * pr.trials) || (rec.stage === "PRECONDITION" && rec.outcome === "NOT_MEASURED")) && sha(path.join(tmp, R.PRIOR)) === sha(path.join(ROOT, R.PRIOR)));
    if (rec && rec.stage === "RUN") check("FAKE run: only allowlisted URLs; identical regenerations ⇒ outcome mechanically graded (not upgraded)", fake.seen.every((s: string) => s === "GET http://127.0.0.1:11434/api/tags" || s === "POST http://127.0.0.1:11434/api/generate") && rec.outcome === R.gradeRows(rec.rows, pr, []).outcome);
    const again = await run([R.OUT]);
    check("second invocation ⇒ ALREADY_RECORDED exit 4 (record unchanged)", again.v === 4 && /ALREADY_RECORDED/.test(again.out));
    fs.rmSync(path.join(tmp, R.OUT));
    const claimed = await run([R.OUT]);
    check("record removed but J-runner claim present ⇒ ALREADY_CLAIMED (a re-run needs a new owner decision)", claimed.v === 4 && /ALREADY_CLAIMED/.test(claimed.out));
    const tampered = clone(J); tampered.WORK_ITEM_CONTRACT.preRegistration.dataset.pins[0].sha256 = "0".repeat(64);
    const tp = await R.runScenarioJ({ root: tmp, plan: R.planOf(tampered), transport: fake.fake, loadProbe: R.IDLE, label: "TEST" });
    check("pin mismatch ⇒ NOT_MEASURED, no trial, no model call", tp.outcome === "NOT_MEASURED" && tp.rows.length === 0 && tp.network.modelCalls === 0 && /pinned sha256 differs/.test(tp.outcomeReason));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(failures ? `${failures} FAILED\n` : "ALL PASS — odg-v176-scenario-j-run\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { process.stdout.write("NOT OK - threw " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
