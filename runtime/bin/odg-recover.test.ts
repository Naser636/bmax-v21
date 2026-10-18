#!/usr/bin/env node
/*
 * ODG Recovery Planner — the 5 required scenarios (TS_RECOVERY_PATH). Pure, hermetic (no real spawn/build).
 * Proves the recovery decision is honest and FAIL-CLOSED: it never returns a success action it cannot
 * substantiate, and it names the minimal prerequisite when nothing can run.
 */

"use strict";

import assert from "node:assert";
import { planRecovery, probeEnvironment, executeRecovery, RecoveryProbe } from "./odg-recover";

let passed = 0;
function ok(name: string, cond: boolean): void { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
const P = (o: Partial<RecoveryProbe>): RecoveryProbe => ({ distPresent: false, distValid: false, toolchainPresent: false, committedJsPresent: false, ...o });

console.log("odg-recover — 5 recovery scenarios");
// 1 — normal TS runtime (dist present + valid) → USE_DIST (TS-origin).
{ const r = planRecovery(P({ distPresent: true, distValid: true, toolchainPresent: true, committedJsPresent: true }));
  ok("1 dist present+valid ⇒ USE_DIST (tsOrigin)", r.action === "USE_DIST" && r.tsOrigin === true); }
// 2 — compiled absent, rebuild tool available → REBUILD_THEN_USE (TS-origin).
{ const r = planRecovery(P({ distPresent: false, toolchainPresent: true, committedJsPresent: true }));
  ok("2 dist absent + toolchain ⇒ REBUILD_THEN_USE (tsOrigin)", r.action === "REBUILD_THEN_USE" && r.tsOrigin === true); }
// 3 — dependencies absent (no dist, no toolchain) but committed JS present → FALLBACK_SOURCE_JS (irreducible).
{ const r = planRecovery(P({ distPresent: false, toolchainPresent: false, committedJsPresent: true }));
  ok("3 no dist + no toolchain + committed JS ⇒ FALLBACK_SOURCE_JS (not tsOrigin)", r.action === "FALLBACK_SOURCE_JS" && r.tsOrigin === false); }
// 4 — invalid compiled artifact + toolchain → REBUILD_THEN_USE (rebuild from .ts).
{ const r = planRecovery(P({ distPresent: true, distValid: false, toolchainPresent: true, committedJsPresent: true }));
  ok("4 dist present but INVALID + toolchain ⇒ REBUILD_THEN_USE", r.action === "REBUILD_THEN_USE"); }
// 5 — recovery itself impossible (nothing available) → FAIL_CLOSED, names the minimal prerequisite, no false success.
{ const r = planRecovery(P({ distPresent: false, toolchainPresent: false, committedJsPresent: false }));
  ok("5 nothing available ⇒ FAIL_CLOSED", r.action === "FAIL_CLOSED");
  ok("5 FAIL_CLOSED names the minimal prerequisite", typeof r.prerequisite === "string" && /committed bare-node artifact|toolchain/.test(r.prerequisite!));
  ok("5 FAIL_CLOSED is never a success action", r.action !== "USE_DIST" && r.action !== "REBUILD_THEN_USE" && r.action !== "FALLBACK_SOURCE_JS"); }

// honest-ordering invariant: valid dist always wins; absent-dist never silently claims USE_DIST.
{ const r = planRecovery(P({ distPresent: true, distValid: false, toolchainPresent: false, committedJsPresent: true }));
  ok("invalid dist + no toolchain ⇒ FALLBACK_SOURCE_JS (never USE_DIST on invalid dist)", r.action === "FALLBACK_SOURCE_JS"); }

// probeEnvironment is deterministic over an injected fs (no real disk needed).
{ const io = { existsSync: (p: string) => /dist\/bin\/odg-run\.js$|dist-closure-manifest\.json$|node_modules\/\.bin\/tsc$|runtime\/bin\/odg-run\.js$/.test(p) };
  const probe = probeEnvironment("/x", io);
  ok("probeEnvironment (injected fs): full healthy env", probe.distPresent && probe.toolchainPresent && probe.committedJsPresent);
  ok("healthy env ⇒ USE_DIST", planRecovery(probe).action === "USE_DIST"); }

// ── executeRecovery: action→entry→env→exit mapping, and the fail-closed NO-false-success invariant ──
console.log("odg-recover — executeRecovery (spawn seam, no real build/child)");
// A recording spawn stub: npm build returns `buildStatus`; node run returns `runStatus`.
function stubSpawn(buildStatus: number, runStatus: number | null) {
  const calls: any[] = [];
  const spawn = (cmd: string, args: string[], opts: any): any => {
    calls.push({ cmd, args, env: opts && opts.env });
    if (cmd === "npm") return { status: buildStatus };
    return { status: runStatus };
  };
  return { spawn, calls, runCall: () => calls.find((c) => c.cmd === "node") };
}

// A — USE_DIST: spawns the DIST entry with the base env, exit mirrors child status.
{ const s = stubSpawn(0, 0);
  const r = executeRecovery("/x", { spawn: s.spawn, probe: P({ distPresent: true, distValid: true, toolchainPresent: true, committedJsPresent: true }), env: { PATH: "/p" } });
  ok("A USE_DIST spawns dist entry", s.runCall()?.args[0] === "runtime/dist/bin/odg-run.js");
  ok("A USE_DIST does NOT set ODG_RUNTIME=js", r.env.ODG_RUNTIME === undefined);
  ok("A exit mirrors child status 0", r.exitCode === 0 && r.action === "USE_DIST"); }

// B — THE BUG FIX: REBUILD_THEN_USE where the rebuild FAILS but committed JS exists → MUST spawn the
//     committed JS with ODG_RUNTIME=js (not exit 0 having spawned nothing).
{ const s = stubSpawn(1 /* build fails */, 0 /* fallback run ok */);
  const r = executeRecovery("/x", { spawn: s.spawn, probe: P({ distPresent: false, toolchainPresent: true, committedJsPresent: true }), env: {} });
  ok("B rebuild-fail FALLS THROUGH to spawn the committed JS (not a silent exit 0)", s.runCall()?.args[0] === "runtime/bin/odg-run.js");
  ok("B fallback sets ODG_RUNTIME=js", s.runCall()?.env.ODG_RUNTIME === "js");
  ok("B action re-planned to FALLBACK_SOURCE_JS and something WAS spawned", r.action === "FALLBACK_SOURCE_JS" && r.spawned === "runtime/bin/odg-run.js");
  ok("B exit mirrors the fallback child status (0), proven by a real spawn", r.exitCode === 0); }

// C — rebuild fails AND no committed JS → FAIL_CLOSED exit 2 with ZERO run spawns (honest refusal).
{ const s = stubSpawn(1, 0);
  const r = executeRecovery("/x", { spawn: s.spawn, probe: P({ distPresent: false, toolchainPresent: true, committedJsPresent: false }), env: {} });
  ok("C rebuild-fail + no JS ⇒ exit 2", r.exitCode === 2 && r.action === "FAIL_CLOSED");
  ok("C FAIL_CLOSED spawns NO run entry (no false success)", s.runCall() === undefined && r.spawned === null); }

// D — FAIL_CLOSED from the start (nothing available) → exit 2, zero spawns at all.
{ const s = stubSpawn(0, 0);
  const r = executeRecovery("/x", { spawn: s.spawn, probe: P({}), env: {} });
  ok("D nothing available ⇒ FAIL_CLOSED exit 2, zero spawns", r.exitCode === 2 && s.calls.length === 0); }

// E — FALLBACK_SOURCE_JS directly (no toolchain, committed JS) → spawns JS, exit mirrors child.
{ const s = stubSpawn(0, 3);
  const r = executeRecovery("/x", { spawn: s.spawn, probe: P({ committedJsPresent: true }), env: {} });
  ok("E direct FALLBACK spawns committed JS with ODG_RUNTIME=js", s.runCall()?.args[0] === "runtime/bin/odg-run.js" && s.runCall()?.env.ODG_RUNTIME === "js");
  ok("E exit mirrors child status 3", r.exitCode === 3); }

// F — child spawn returns null status (crashed) → exit 1 (never 0).
{ const s = stubSpawn(0, null);
  const r = executeRecovery("/x", { spawn: s.spawn, probe: P({ distPresent: true, distValid: true }), env: {} });
  ok("F null child status ⇒ exit 1 (never a false 0)", r.exitCode === 1); }

console.log(`\nODG-RECOVER — ${passed} assertions passed.`);
