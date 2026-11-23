#!/usr/bin/env node
"use strict";
/* V16.1 scenario J — OFFLINE checks with INJECTED generators (no Ollama, no network). Model "outputs" are fixed strings
 * written in this test; they are evaluated through the native-build sandbox seam with an injected plain-node child runner
 * (deterministic, no bwrap dependency in CI). Covers: the ODG stop fires on identical regeneration; the alternative is
 * chosen per the stated rule; both-fail ⇒ escalation RECORD only (no provider call); alternative pass ⇒ no escalation;
 * decomposition freezes verified parts; sandbox unavailable ⇒ NOT_RUN; committed evidence re-derives (--check). */
const cp = require("child_process");
const path = require("path");
const fs = require("fs");
const J = require("./odg-v161-scenario-j-run.ts");
const POL = require("../core/odg-local-model-execution-policy.js");
const NBS = require("../core/odg-native-build-sandbox.js");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// plain node child standing in for bwrap (only the fixed strings of this test are executed)
const nodeRunner = (program: string) => { const r = cp.spawnSync(process.execPath, ["-"], { input: program, encoding: "utf8", timeout: 30000 }); return { ran: true, exitOk: r.status === 0, stdout: r.stdout || "", reason: r.status === 0 ? undefined : String(r.stderr || "").slice(-300) }; };
const NOW = Date.parse("2026-11-23T18:00:00Z");   // pinned: the committed V155 registry is fresh at this instant
const measured = POL.loadMeasuredRegistry();

function ctxWith(gen: (model: string, f: any, n: number) => string | null, sandboxDeps: any = { sandboxRunner: nodeRunner, sandboxProbe: () => ({ ok: true }) }): any {
  let n = 0; const log: any[] = [];
  return { log, sandboxDeps, measured, now: NOW, calls: () => n,
    generatorFor: (model: string) => async (f: any) => { n++; log.push([model, f.path]); const c = gen(model, f, n); return c === null ? { ok: false } : { ok: true, content: c }; } };
}
const WRONG = "module.exports = () => null;";

(async () => {
  const tasks = J.buildTasks();
  const pr = tasks.find((t: any) => t.id === "v159-implement-parse-range");
  const rle = tasks.find((t: any) => t.id === "rle-codec");
  check("4 evidence-picked tasks (parse-range + 3 hard-corpus)", tasks.length === 4 && tasks.every((t: any) => typeof t.selectedBecause === "string" && t.selectedBecause.length > 20));

  // intermediate oracle soundness: reference files pass every sub-problem's own cases (host-graded cases form)
  const subsOk = tasks.filter((t: any) => t.oracle).every((t: any) => t.oracle.subproblems.every((s: any) => { const files: any = {}; for (const a of s.spec.architecture) files[a.path] = t.reference[a.path]; return NBS.runIsolated(files, NBS.serializableTest(s.spec), { runner: nodeRunner }).verified === true; }));
  check("intermediate oracles: the reference passes every sub-problem's cases", subsOk);
  check("whole-task test: reference passes, broken fails (parse-range)", NBS.runIsolated(pr.reference, { kind: "source", source: pr.wholeTestSource }, { runner: nodeRunner }).verified === true && NBS.runIsolated(pr.broken, { kind: "source", source: pr.wholeTestSource }, { runner: nodeRunner }).verified === false);

  // 1. ODG stop fires on identical regeneration (decided inside native-project-builder, not by this runner)
  const c1 = ctxWith(() => WRONG);
  const d1 = await J.runDefault(pr, c1);
  check("default = calibrated policy through the cycle (3b, maxRepair 1, measured overlay)", d1.model === "qwen2.5-coder:3b" && d1.maxRepair === 1);
  check("identical regeneration ⇒ ODG stop NO_PROGRESS_IDENTICAL_REGENERATION", d1.accepted === false && d1.stopReason === "NO_PROGRESS_IDENTICAL_REGENERATION" && /ODG/.test(d1.stopDecidedBy));

  // 2. selection rule (pure)
  const pol3b = { model: "qwen2.5-coder:3b", maxRepair: 1 };
  const failStop = { accepted: false, executionStatus: "EXECUTED", stopReason: "REPAIR_BUDGET_EXHAUSTED" };
  check("R0 accepted ⇒ NONE", J.selectAlternative({ accepted: true, executionStatus: "EXECUTED", stopReason: null }, rle, pol3b).strategy === "NONE");
  check("R1 NOT_RUN ⇒ NOT_RUN", J.selectAlternative({ accepted: false, executionStatus: "NOT_RUN", stopReason: "NOT_RUN_NO_SANDBOX" }, rle, pol3b).strategy === "NOT_RUN");
  check("R2 no ODG stop ⇒ NONE (fail-closed)", J.selectAlternative({ accepted: false, executionStatus: "EXECUTED", stopReason: null }, rle, pol3b).rule === "R2");
  const s3 = J.selectAlternative(failStop, rle, pol3b);
  check("R3 intermediate oracle ⇒ DECOMPOSED with the SAME model/maxRepair", s3.strategy === "DECOMPOSED_INTERMEDIATE_VERIFICATION" && s3.model === pol3b.model && s3.maxRepair === 1);
  const s4 = J.selectAlternative({ ...failStop, stopReason: "NO_PROGRESS_IDENTICAL_REGENERATION" }, pr, pol3b);
  check("R4 no oracle ⇒ LARGER_MODEL_REPAIR_DEPTH (7b, maxRepair 3)", s4.strategy === "LARGER_MODEL_REPAIR_DEPTH" && s4.model === "qwen2.5-coder:7b" && s4.maxRepair === 3);
  check("R5 already max-local and no oracle ⇒ NO_ALTERNATIVE", J.selectAlternative(failStop, pr, { model: "qwen2.5-coder:7b", maxRepair: 3 }).strategy === "NO_ALTERNATIVE");
  check("invariant: the alternative never repeats the default", [s3, s4].every((s: any) => s.strategy !== "DEFAULT_CALIBRATED_POLICY"));

  // 3. both fail ⇒ evidence-gated escalation RECORD only (no provider call: every generation went to the injected local generator)
  const c3 = ctxWith(() => WRONG);
  const r3 = await J.runTrial(pr, 1, c3);
  check("both fail: alternative LARGER_MODEL executed and failed", r3.selection.strategy === "LARGER_MODEL_REPAIR_DEPTH" && r3.alternative.executionStatus === "EXECUTED" && r3.alternative.accepted === false && r3.alternative.model === "qwen2.5-coder:7b");
  check("both fail ⇒ escalation record CREATED, provider NOT called", r3.escalation.escalate === true && r3.escalation.delegationState === "CREATED" && r3.escalation.providerCalled === false && r3.escalation.attribution === "CLAUDE_CODE_PROVIDER");
  check("all generations went to local models only", c3.log.every((x: any) => /^qwen2\.5-coder:(3b|7b)$/.test(x[0])) && c3.log.some((x: any) => x[0] === "qwen2.5-coder:7b"));

  // 4. alternative passes ⇒ no escalation
  const c4 = ctxWith((model: string, f: any) => (model === "qwen2.5-coder:7b" && f.path === "f.js" ? pr.reference["f.js"] : model === "qwen2.5-coder:7b" ? "module.exports = (x) => [];" : WRONG));
  const r4 = await J.runTrial(pr, 1, c4);
  check("larger-model alternative passes ⇒ no escalation", r4.default.accepted === false && r4.alternative.accepted === true && r4.escalation.escalate === false);

  // 5. decomposition: default stops (identical), decomposed alternative localises + freezes verified parts and passes the WHOLE test
  const c5 = ctxWith((_m: string, f: any, n: number) => (n <= 8 ? WRONG : rle.reference[f.path]));
  const r5 = await J.runTrial(rle, 1, c5);
  check("rle: default stopped by ODG (identical regeneration)", r5.default.stopReason === "NO_PROGRESS_IDENTICAL_REGENERATION" && r5.default.modelCalls === 8);
  check("rle: DECOMPOSED alternative selected (R3) and accepted on the whole-task test", r5.selection.rule === "R3" && r5.alternative.accepted === true && r5.alternative.wholeTaskTest.verified === true && r5.escalation.escalate === false);
  check("rle: verified parts frozen — one model call per sub-problem", r5.alternative.modelCalls === 4 && r5.alternative.verifiedCount === 4);
  const c5b = ctxWith(() => WRONG);
  const r5b = await J.runTrial(rle, 1, c5b);
  check("rle: decomposed failure is LOCALISED (chain stops at the first sub-problem) ⇒ escalation record", r5b.alternative.firstFailure === "parse.js" && r5b.alternative.wholeTaskTest.status === "NOT_EVALUATED" && r5b.escalation.delegationState === "CREATED");

  // 6. sandbox unavailable ⇒ NOT_RUN (no alternative, no escalation, NOT_MEASURABLE)
  const c6 = ctxWith(() => WRONG, { sandboxRunner: () => ({ ran: false, reason: "bwrap missing (test)" }), sandboxProbe: () => ({ ok: false, reason: "bwrap missing (test)" }) });
  const r6 = await J.runTrial(rle, 1, c6);
  check("sandbox unavailable ⇒ default NOT_RUN, stop NOT_RUN_NO_SANDBOX", r6.default.executionStatus === "NOT_RUN" && r6.default.stopReason === "NOT_RUN_NO_SANDBOX");
  check("sandbox unavailable ⇒ selection NOT_RUN, nothing executed, no escalation", r6.selection.strategy === "NOT_RUN" && r6.alternative === null && r6.escalation.decided === false);
  check("sandbox unavailable ⇒ classification NOT_MEASURABLE", /^NOT_MEASURABLE/.test(J.classify([r6], null)) && /^NOT_MEASURABLE/.test(J.classify([], "sandbox unavailable")));

  // 7. committed evidence re-derives
  const evPath = path.join(ROOT, "docs", "odg", "evidence", "V161_SCENARIO_J.json");
  if (fs.existsSync(evPath)) {
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), path.join(__dirname, "odg-v161-scenario-j-run.ts"), "--check"], { encoding: "utf8" });
    check("committed V161_SCENARIO_J.json re-derives (--check)", r.status === 0 && /CHECK OK/.test(r.stdout));
    const ev = JSON.parse(fs.readFileSync(evPath, "utf8"));
    check("evidence: providerCalls 0 and every escalation is a CREATED record", ev.summary.overall.providerCalls === 0 && ev.rows.every((x: any) => x.escalation.escalate !== true || x.escalation.delegationState === "CREATED"));
  } else check("committed V161_SCENARIO_J.json present", false);

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall scenario-J checks passed\n");
  process.exit(failures ? 1 : 0);
})().catch((e) => { process.stderr.write(String((e && e.stack) || e) + "\n"); process.exit(1); });
export {};
