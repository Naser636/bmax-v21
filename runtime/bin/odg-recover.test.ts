#!/usr/bin/env node
/*
 * ODG Recovery Planner — the 5 required scenarios (TS_RECOVERY_PATH). Pure, hermetic (no real spawn/build).
 * Proves the recovery decision is honest and FAIL-CLOSED: it never returns a success action it cannot
 * substantiate, and it names the minimal prerequisite when nothing can run.
 */

"use strict";

import assert from "node:assert";
import { planRecovery, probeEnvironment, RecoveryProbe } from "./odg-recover";

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

console.log(`\nODG-RECOVER — ${passed} assertions passed.`);
