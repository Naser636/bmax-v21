#!/usr/bin/env node
"use strict";
/* V17.6 — tests of runtime/bin/odg-v176-scenario-f-run.ts. Deterministic fixture on TEMP dirs only; the real execution is
 * NEVER started against the real tree (ODG_TEST_NO_NATIVE=1 + main() refuses unless a temp root is injected — NB2 incident
 * lesson). No network, no model; temp claim dirs only. The SIMULATED inspection record below is a fixture, not a verdict. */
process.env.ODG_TEST_NO_NATIVE = "1";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const R = require("./odg-v176-scenario-f-run.ts");
const AS = require("../core/odg-authorization-scope.js");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const clone = (o: any) => JSON.parse(JSON.stringify(o));
const sha = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const CF = JSON.parse(fs.readFileSync(path.join(ROOT, R.CONTRACTS), "utf8"));
const F = CF.contracts.find((c: any) => c.scenario === "F");
const silent = async (f: () => Promise<any>) => { const w = process.stdout.write.bind(process.stdout); const out: string[] = []; (process.stdout as any).write = (s: string) => { out.push(String(s)); return true; }; try { return { v: await f(), out: out.join("") }; } finally { (process.stdout as any).write = w; } };
const ORIG_AC = ["decomposition + assignment through odg-agent-supervisor (write-sets declared)", "two independently produced outputs received", "an incompatibility is DETECTED by an ODG check (not by the coordinator)", "integration validated by tests + independent inspection"];

(async () => {
  // 1. contract: criteria verbatim, owner binding, plan, pins, dispatch target, write_set
  {
    const w = F.WORK_ITEM_CONTRACT; const pr = w.preRegistration;
    check("contract F: acceptance_criteria unchanged (verbatim, 4) and copied into preRegistration.criteria C1–C4 and revisionHistory.originalCriteria", JSON.stringify(w.acceptance_criteria) === JSON.stringify(ORIG_AC) && ["C1", "C2", "C3", "C4"].every((k, i) => pr.criteria[k].text === ORIG_AC[i]) && JSON.stringify(F.revisionHistory[F.revisionHistory.length - 1].originalCriteria) === JSON.stringify(ORIG_AC));
    check("F: AUTHORIZED_FOR_REVISION, authorizedBy quotes the owner record verbatim, source bound to V176 BUILD_MISSIONS only", F.state === "AUTHORIZED_FOR_REVISION" && /J'autorise GO à sélectionner et exécuter les missions internes de construction de la roadmap/.test(F.authorizedBy) && /Construire les vagues GO parallèles sur des zones d'écriture indépendantes/.test(F.authorizedBy) && AS.ownerSourceCheck("F", F.authorization.source).ok === true && F.authorization.executionAuthorized === false);
    check("binding: F shares the record only with its declared family V176-BUILD-MISSIONS (NB3); J's record never covers F; F's never covers J / J2 / NB2", AS.OWNER_SOURCES.F.family === "V176-BUILD-MISSIONS" && AS.ownerSourceCheck("V176-NB3", F.authorization.source).ok === true && AS.ownerSourceCheck("F", "docs/odg/V176_OWNER_AUTHORIZATION_J.json").ok === false && AS.ownerSourceCheck("J", F.authorization.source).ok === false && AS.ownerSourceCheck("J2", F.authorization.source).ok === false && AS.ownerSourceCheck("V175-NB2", F.authorization.source).ok === false && AS.ownerSourceCheck("F", F.authorization.source + " docs/odg/V176_OWNER_AUTHORIZATION_J.json").ok === false);
    const plan = R.planOf(F);
    check("plan from the pre-registration: fixture id + sha = the runner's fixture; caps k 3 / rounds 3 / 300000 ms / HOST-1 0.75", plan.ok && pr.dataset.fixture === R.FIXTURE_ID && pr.dataset.fixtureSha256 === R.FIXTURE_SHA256 && plan.caps.k === 3 && plan.caps.maxRounds === 3 && plan.caps.maxRunWallMs === 300000 && plan.caps.hostIdleFactor === 0.75);
    check("every pin equals the current tree (runner, odg-go-wave, composed modules, V161 record)", plan.pins.length === 7 && plan.pins.every((p: any) => sha(path.join(ROOT, p.file)) === p.sha256) && plan.pins.some((p: any) => p.file === R.SELF) && plan.pins.some((p: any) => p.file === "runtime/core/odg-go-wave.ts"));
    const t = F.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS;
    check("dispatch target = this runner, args/writeSet [V176_F_EXPERIMENT.json] ⊆ write_set; write_set lists every built file (runner + test, odg-go-wave + test) + OUT", t.command === R.SELF && JSON.stringify(t.args) === JSON.stringify([R.OUT]) && JSON.stringify(t.writeSet) === JSON.stringify([R.OUT]) && JSON.stringify(w.write_set) === JSON.stringify([R.SELF, "runtime/bin/odg-v176-scenario-f-run.test.ts", "runtime/core/odg-go-wave.ts", "runtime/core/odg-go-wave.test.ts", R.OUT]));
    check("FIXTURE-CAP-1 pre-registered; open points state V161 natural detection OPEN and GO wiring as remaining delivery step", /FIXTURE-CAP-1/.test(pr.gradeCap) && /min\(mechanicalGrade, PARTIAL\)/.test(pr.decisionRule) && w.openPoints.some((x: string) => /^OPEN: V161/.test(x)) && w.openPoints.some((x: string) => /REMAINING DELIVERY STEP/.test(x)));
    const sc = AS.deriveAuthorizationScope(F, {});
    check("scope: R2 validated ⇒ current step INSPECT_REVISED_CONTRACT (authorized, INDEPENDENT_INSPECTION), execution NOT authorized", sc.applicable && sc.validatedSteps.some((v: any) => v.step === "REVISE_CONTRACT") && sc.currentStep === "INSPECT_REVISED_CONTRACT" && sc.currentStepAuthorized === true && sc.executionAuthorized === false);
    check("revisionAuthorSessionId f-revision-v176-r2 (revision 2 after inspection REJECT); stale write_set recorded in revision 1", F.revisionHistory.length === 2 && F.revisionHistory[1].revisionAuthorSessionId === "f-revision-v176-r2" && JSON.stringify(F.revisionHistory[1].originalCriteria) === JSON.stringify(ORIG_AC) && JSON.stringify(F.revisionHistory[0].previousWriteSet) === JSON.stringify(["docs/odg/evidence/V160_SCENARIO_F.json", "runtime/bin/odg-v160-scenario-f-run.ts"]));
    check("source never writes the prior record", !/writeFileSync\([^)]*PRIOR/.test(fs.readFileSync(path.join(ROOT, R.SELF), "utf8")));
  }
  // 2. grading (pure, pre-registered) on synthetic runs
  {
    const rcpt = (id: string, pid: number) => ({ id, ok: true, commit: id.toLowerCase().padEnd(40, "0"), branch: "wave/r1/" + id, scratch: "scratch/r1/" + id, producerPid: pid });
    const good = { selection: { mode: "PARALLEL", wave: ["W-PARSE", "W-TOTAL"] }, supervisor: { assignments: [{ item: "W-PARSE", outcome: "ASSIGNED", writeSet: ["src/parse-line.js"] }, { item: "W-TOTAL", outcome: "ASSIGNED", writeSet: ["src/invoice-total.js"] }] },
      rounds: [{ round: 1, dispatch: { mode: "PARALLEL", receipts: [rcpt("W-PARSE", 11), rcpt("W-TOTAL", 12)], concurrentOverlapMs: 5 }, detection: { findings: [{ kind: "WRITESET_VIOLATION", items: ["W-TOTAL"], detectedBy: "git diff --name-only ⊄ declared write-set" }, { kind: "CHECK_FAILED", items: ["W-PARSE"], detectedBy: "declared post-receipt check iface (process exit code)" }] }, integration: { status: "INTEGRATION_REFUSED", checks: [] } },
        { round: 2, dispatch: { mode: "PARALLEL", receipts: [] }, detection: { findings: [] }, integration: { status: "INTEGRATED_VALIDATED", checks: [{ id: "integration", exitCode: 0 }], unionOk: true } }] };
    check("all criteria met ⇒ mechanicalGrade PASS, outcome capped PARTIAL (FIXTURE-CAP-1); C4 inspection part PENDING → R5b", R.gradeF(good, []).mechanicalGrade === "PASS" && R.gradeF(good, []).outcome === "PARTIAL" && /FIXTURE-CAP-1/.test(R.gradeF(good, []).cap) && /PENDING/.test(R.gradeF(good, []).criteria.C4.inspection));
    const noInteg = clone(good); noInteg.rounds[1].integration.status = "INTEGRATION_CHECK_FAILED";
    check("integration not validated ⇒ mechanicalGrade PARTIAL ⇒ PARTIAL", R.gradeF(noInteg, []).mechanicalGrade === "PARTIAL" && R.gradeF(noInteg, []).outcome === "PARTIAL");
    const oneDetected = clone(good); oneDetected.rounds[0].detection.findings = oneDetected.rounds[0].detection.findings.slice(0, 1);
    check("a planted incompatibility NOT detected ⇒ C3 not met ⇒ FAIL", R.gradeF(oneDetected, []).criteria.C3.met === false && R.gradeF(oneDetected, []).outcome === "FAIL");
    const coord = clone(good); coord.rounds[0].detection.findings.forEach((f: any) => { f.detectedBy = "coordinator flag"; });
    check("a finding not produced by git / a check exit code ⇒ C3 not met", R.gradeF(coord, []).criteria.C3.met === false);
    const samePid = clone(good); samePid.rounds[0].dispatch.receipts[1].producerPid = 11;
    check("receipts from the same producer process ⇒ C2 not met", R.gradeF(samePid, []).criteria.C2.met === false);
    const serial = clone(good); serial.selection.mode = "SERIAL";
    check("no PARALLEL wave ⇒ C1 not met", R.gradeF(serial, []).criteria.C1.met === false);
    const wsMismatch = clone(good); wsMismatch.supervisor.assignments[0].writeSet = ["src"];
    check("supervisor write-set ≠ declared ⇒ C1 not met", R.gradeF(wsMismatch, []).criteria.C1.met === false);
    check("an incident ⇒ NOT_MEASURED", R.gradeF(good, ["cap hit"]).outcome === "NOT_MEASURED");
  }
  // 3. CLI gate + one-shot + the real fixture run on a TEMP root (never the real tree)
  {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "odg-v176-f-t-")));
    const claimDir = path.join(tmp, "claims");
    for (const p of [R.CONTRACTS, ...R.planOf(F).pins.map((x: any) => x.file)]) { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.copyFileSync(path.join(ROOT, p), path.join(tmp, p)); }
    const HEAD = "a".repeat(40);
    const probes = { label: "TEST FIXTURE", mainRef: "fixture-main", commitExists: (s: string) => s === HEAD, isAncestorOfMain: (s: string) => s === HEAD, fileSha256: (rel: string) => { try { return sha(path.join(tmp, rel)); } catch { return null; } } };
    const BUSY = () => ({ loadavg: [99, 99, 99], nproc: 8, meminfo: "MemTotal: 16000000 kB\nMemAvailable: 12000000 kB\n" });
    const run = (argv: string[], o: any = {}) => silent(() => R.main(argv, { root: tmp, claimDir, probes, allowUnderTest: true, loadProbe: R.IDLE, tmpRoot: tmp, ...o }));
    check("wrong / extra argument ⇒ exit 3", (await run(["docs/odg/evidence/V161_SCENARIO_F.json"])).v === 3 && (await run([R.OUT, "--x"])).v === 3);
    check("real tree refused under test (ODG_TEST_NO_NATIVE, or ALREADY_RECORDED once F's execution is committed)", [2, 4].includes((await silent(() => R.main([R.OUT], { allowUnderTest: true }))).v));
    const na = await run([R.OUT]);
    check("no inspection record ⇒ NOT_AUTHORIZED (exit 2), nothing written, no claim", na.v === 2 && /INSPECT_REVISED_CONTRACT/.test(na.out) && !fs.existsSync(path.join(tmp, R.OUT)) && !fs.existsSync(claimDir));
    const insp = { scenario: "F", verdict: "ACCEPT", contractSha256: AS.contractSha256(F), inspector: "SIMULATED (test fixture)", inspectorSessionId: "sim-inspector-f-01", authorSessionId: F.revisionHistory[F.revisionHistory.length - 1].revisionAuthorSessionId, inspectedHeadSha: HEAD, inspectedPr: 999 };
    fs.writeFileSync(path.join(tmp, R.INSPECTION), JSON.stringify(insp));
    const busy = await run([R.OUT], { loadProbe: BUSY });
    check("SIMULATED inspection ACCEPT + busy host ⇒ HOST_BUSY exit 5, no claim, nothing written", busy.v === 5 && /HOST_BUSY/.test(busy.out) && !fs.existsSync(path.join(tmp, R.OUT)) && R.existingClaims(claimDir).length === 0);
    fs.mkdirSync(claimDir, { recursive: true });
    fs.writeFileSync(path.join(claimDir, "0123456789abcdef-F-runner.claim"), "{}");
    const cl = await run([R.OUT]);
    check("an existing F-RUNNER claim ⇒ ALREADY_CLAIMED exit 4, nothing written", cl.v === 4 && /ALREADY_CLAIMED/.test(cl.out) && !fs.existsSync(path.join(tmp, R.OUT)));
    fs.rmSync(path.join(claimDir, "0123456789abcdef-F-runner.claim"));
    fs.writeFileSync(path.join(claimDir, "0123456789abcdef-F.claim"), "{}");   // GO's own GO-ORD-2 claim for this dispatch
    const ok = await run([R.OUT]);
    const rec = fs.existsSync(path.join(tmp, R.OUT)) ? JSON.parse(fs.readFileSync(path.join(tmp, R.OUT), "utf8")) : null;
    check("GO's own <16hex>-F.claim does NOT refuse the runner (J-runner lesson) ⇒ record written + F-runner claim (O_EXCL)", !!rec && rec.contractSha256 === AS.contractSha256(F) && R.existingClaims(claimDir).length === 1 && R.existingClaims(claimDir)[0] === `${AS.contractSha256(F).slice(0, 16)}-F-runner.claim`);
    check("fixture run (temp root) ⇒ outcome mechanically graded = gradeF(record); 0 model / provider calls; temp dir removed; no absolute temp path", !!rec && rec.outcome === (rec.stage === "RUN" ? R.gradeF(rec, []).outcome : "NOT_MEASURED") && rec.network.modelCalls === 0 && rec.network.providerCalls === 0 && rec.tempDirRemoved === true && !JSON.stringify(rec).includes(os.tmpdir() + "/odg-v176-f-"));
    if (rec && rec.stage === "RUN") {
      const r1 = rec.rounds[0];
      check("fixture: wave {W-PARSE, W-TOTAL} PARALLEL; W-PARSE-LOCALE excluded WRITESET_OVERLAP, W-NOTES WRITESET_UNKNOWN", JSON.stringify(rec.selection.wave) === JSON.stringify(["W-PARSE", "W-TOTAL"]) && rec.selection.mode === "PARALLEL" && /^WRITESET_OVERLAP/.test(rec.selection.excluded.find((x: any) => x.id === "W-PARSE-LOCALE").reason) && /^WRITESET_UNKNOWN/.test(rec.selection.excluded.find((x: any) => x.id === "W-NOTES").reason));
      check("fixture round 1: both planted incompatibilities detected after receipt (+ overlap + merge conflict)", ["WRITESET_VIOLATION", "OVERLAPPING_WRITES", "MERGE_CONFLICT", "CHECK_FAILED"].every((k) => r1.detection.findings.some((f: any) => f.kind === k)) && r1.detection.merge.status === "CONFLICT");
      check("fixture: offending re-dispatched, final round INTEGRATED_VALIDATED; oracle fails on the base; mechanicalGrade PASS, outcome PARTIAL (cap)", rec.rounds.length === 2 && rec.rounds[1].integration.status === "INTEGRATED_VALIDATED" && rec.oracleSelfTest.failsOnBase === true && rec.mechanicalGrade === "PASS" && rec.outcome === "PARTIAL");
      check("timing recorded report-only (both modes measured)", rec.timing.parallelMs.length >= 1 && rec.timing.serialMs.length >= 1 && typeof rec.timing.speedup === "number");
    } else check("fixture run recorded a precondition ⇒ NOT_MEASURED", !!rec && rec.outcome === "NOT_MEASURED");
    const again = await run([R.OUT]);
    check("second invocation ⇒ ALREADY_RECORDED exit 4", again.v === 4 && /ALREADY_RECORDED/.test(again.out));
    fs.rmSync(path.join(tmp, R.OUT));
    const claimed = await run([R.OUT]);
    check("record removed but F-runner claim present ⇒ ALREADY_CLAIMED", claimed.v === 4 && /ALREADY_CLAIMED/.test(claimed.out));
    const tampered = clone(F); tampered.WORK_ITEM_CONTRACT.preRegistration.dataset.pins[1].sha256 = "0".repeat(64);
    const tp = await R.runScenarioF({ root: tmp, plan: R.planOf(tampered), loadProbe: R.IDLE, tmpRoot: tmp, label: "TEST" });
    check("pin mismatch ⇒ NOT_MEASURED, no dispatch", tp.outcome === "NOT_MEASURED" && tp.stage === "PRECONDITION" && /pinned sha256 differs/.test(tp.outcomeReason));
    const fx = clone(F); fx.WORK_ITEM_CONTRACT.preRegistration.dataset.fixtureSha256 = "1".repeat(64);
    check("fixture sha ≠ the runner's fixture ⇒ planOf refuses", R.planOf(fx).ok === false);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.stdout.write(failures ? `${failures} FAILED\n` : "ALL PASS — odg-v176-scenario-f-run\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { process.stdout.write("NOT OK - threw " + String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
