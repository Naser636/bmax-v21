#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./frontier-sandbox");
const LAB = require("./frontier-lab");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-05 — FRONTIER SANDBOX (real OS isolation + bounded runner)");

// ---- UNIT (injected spawn/sandboxRunner — deterministic, no real execution) ----------------------------------
// detect: bwrap present on PATH ⇒ available; absent ⇒ NONE_FAILCLOSED.
{
  const present = S.detectOsSandbox({ spawn: () => ({ status: 0, stdout: "/usr/bin/bwrap" }) });
  check(present.available === true && present.isolationLevel === "OS_BWRAP", "detect: bwrap on PATH ⇒ OS_BWRAP");
  const absent = S.detectOsSandbox({ spawn: () => ({ status: 1, stdout: "" }) });
  check(absent.available === false && absent.isolationLevel === "NONE_FAILCLOSED", "detect: bwrap absent ⇒ NONE_FAILCLOSED");
}

// budget → prlimit flags.
{
  const f = S.prlimitFlags({ maxCpuSec: 2, maxAddressSpaceBytes: 268435456, maxProcs: 16, maxFileSizeBytes: 1048576, maxOpenFiles: 64 });
  check(f.includes("--cpu=2") && f.includes("--as=268435456") && f.includes("--nproc=16") && f.includes("--fsize=1048576") && f.includes("--nofile=64"), "budget maps to prlimit cpu/as/nproc/fsize/nofile");
  check(S.prlimitFlags({ maxMs: 3000 }).includes("--cpu=3"), "wall budget maxMs ⇒ derived CPU-second ceiling");
}

// FAIL-CLOSED: bwrap unavailable ⇒ no execution, NONE_FAILCLOSED.
{
  let spawned = 0;
  const r = S.runInSandbox(["/usr/bin/echo", "x"], { spawn: () => { spawned++; return { status: 1, stdout: "" }; } });
  check(r.ran === false && r.isolationProven === false && r.isolationLevel === "NONE_FAILCLOSED" && /unconfined/.test(r.reason), "unavailable bwrap ⇒ fail-closed (no execution, NONE_FAILCLOSED)");
  check(S.runInSandbox([], {}).ran === false, "empty argv ⇒ refused");
}

// INJECTED sandboxRunner is NEVER labelled OS_BWRAP (a fixture cannot masquerade as real isolation).
{
  const injected = (argv: any, _o: any) => ({ ran: true, launched: true, exitCode: 0, stdout: "signals:throughput=2", stderr: "", observedEffects: { network: false } });
  const r = S.runInSandbox(["/usr/bin/echo", "ok"], { sandboxRunner: injected });
  check(r.isolationLevel === "INJECTED" && r.isolationProven === false, "injected runner ⇒ isolationLevel INJECTED, NOT OS-proven (no fixture masquerade)");
  // argv is wrapped with prlimit when the budget sets limits
  let seen: any = null;
  S.runInSandbox(["/usr/bin/echo", "ok"], { sandboxRunner: (argv: any) => { seen = argv; return { ran: true, launched: true, exitCode: 0 }; }, budget: { maxCpuSec: 1, maxProcs: 8 } });
  check(seen && seen[0] === "/usr/bin/prlimit" && seen.includes("--cpu=1") && seen.includes("--"), "inner argv is wrapped with prlimit when the budget sets rlimits");
}

// asFrontierRunner — the Frontier Lab interface; fail-closed throws so the Lab ABORTS when isolation is unproven.
{
  void (async () => {
    // NOTE: asFrontierRunner's SUCCESS path is proven only with REAL bwrap below — an INJECTED fixture is (by design)
    // never isolationProven, so the runner correctly fail-closes on it. Here we only prove the fail-closed throw.
    let threw = false;
    try { await (S.asFrontierRunner({ argv: ["/usr/bin/echo", "x"], spawn: () => ({ status: 1, stdout: "" }) }))({ budget: {} }); } catch { threw = true; }
    check(threw === true, "asFrontierRunner THROWS when isolation unavailable/unproven ⇒ the Frontier Lab ABORTS (fail-closed)");

    // ---- REAL OS ISOLATION (adversarial) — only when bubblewrap is genuinely available; else SKIPPED (honest) ----
    const det = S.detectOsSandbox({});
    if (!det.available) {
      console.log("  SKIP (real-OS) - bubblewrap not available in this environment — isolation NOT claimed (honest)");
    } else {
      const ok = S.runInSandbox(["/usr/bin/echo", "REAL_OK"], { timeoutMs: 5000 });
      check(ok.ran === true && ok.isolationProven === true && ok.isolationLevel === "OS_BWRAP" && /REAL_OK/.test(ok.stdout), "REAL bwrap: confined echo runs, isolation PROVEN via --info-fd launch handshake");
      check(ok.controls.noNetwork === true && ok.controls.clearedEnv === true && ok.controls.nonPrivileged === true && ok.controls.allowlistBindsOnly === true, "REAL bwrap: enforced controls (no-network, cleared-env, non-privileged, allowlist binds)");
      // ADVERSARIAL 1: a host secret file is NOT readable inside the sandbox.
      const secret = S.runInSandbox(["/usr/bin/cat", "/home/ubuntu/.claude/settings.json"], { timeoutMs: 5000 });
      check(secret.isolationProven === true && !/akabi|permissions|defaultMode/.test(secret.stdout) && /No such file|not open|not found/i.test(secret.stderr + secret.stdout), "REAL bwrap ADVERSARIAL: host secret file is NOT readable inside the sandbox");
      // ADVERSARIAL 2: writing into the real repo path escapes NOTHING (path not bound ⇒ fails; no file created).
      const esc = S.runInSandbox(["/usr/bin/touch", "/home/ubuntu/bmax-v21/FR05_ESCAPE_PROOF"], { timeoutMs: 5000 });
      const leaked = require("fs").existsSync("/home/ubuntu/bmax-v21/FR05_ESCAPE_PROOF");
      check(esc.isolationProven === true && leaked === false, "REAL bwrap ADVERSARIAL: cannot write into the real repo (no filesystem escape)");
      if (leaked) { try { require("fs").unlinkSync("/home/ubuntu/bmax-v21/FR05_ESCAPE_PROOF"); } catch {} }
      // the real runner drops into the Frontier Lab as the Tester role (and returns the exact Lab runner shape).
      const labRunner = S.asFrontierRunner({ argv: ["/usr/bin/echo", "ok"], measureFromStdout: () => ({ throughput: 2.0, latencyMs: 60 }) });
      const direct = await labRunner({ budget: { maxMs: 5000, maxCpuSec: 2 } });
      check(direct && direct.afterSignals.throughput === 2.0 && direct.productionTouched === false && direct.isolation === "OS_BWRAP" && direct.cost && typeof direct.cost.ms === "number", "REAL asFrontierRunner returns the Lab runner shape {afterSignals,raw,cost,productionTouched} with OS_BWRAP isolation");
      const spec = { id: "fr05-exp", proposalRef: "cand:x", touchesProduction: false, budget: { maxMs: 5000, maxCpuSec: 2 }, config: { sense: { throughput: "higher", latencyMs: "lower" } }, hypothesis: { hypothesis: "h", problem: "p", expectedOutcome: "o", refutationConditions: [{ metric: "latencyMs", field: "after", op: ">", value: 200 }], successCriteria: [{ metric: "throughput", field: "after", op: ">=", value: 1.5 }] } };
      const lab = await LAB.runLabExperiment(spec, { collectors: { throughput: () => 1.0, latencyMs: () => 100 }, runner: labRunner, now: 1 });
      check(lab.ok === true && lab.experiment.status === "DECIDED" && lab.experiment.decision.decision === "READY_FOR_REVIEW", "REAL sandbox runner drops into the Frontier Lab as the Tester role (end-to-end)");
    }

    console.log(failures === 0 ? "ALL PASS — WI-FR-05 FRONTIER SANDBOX" : `FAILURES: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);
  })();
}
export {};
