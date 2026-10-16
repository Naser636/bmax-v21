#!/usr/bin/env node
/*
 * `odg migrate-ts` — single-command TypeScript migration campaign driver (η3-B78 vertical slice).
 * ================================================================================================
 * ONE launch command, DISTINCT internal validation gates per stage. This slice runs ONLY the
 * `validation-engine` lot (CTO authorisation η3-B78); any other lot is BLOCKED, not silently run.
 *
 * REUSE (no parallel mechanism invented): the gates drive the EXISTING toolchain — `build:runtime`
 * (tsc -p tsconfig.runtime-dist.json), the strict gate (tsc -p tsconfig.runtime-leaves-strict.json
 * --noEmit), the equivalence-bench recipe (git-archive isolated candidate + the lot's *.e2e.test.ts),
 * the lot's historical suites, and the sibling regression benches.
 *
 * CHECKPOINT / RESUME (honest limitation, per η3-B77 §5.6): checkpoint-engine.js persists a SINGLE
 * shared runtime/generated/pipeline-checkpoint.json keyed by ONE mission; reusing it here would CLOBBER
 * an in-flight mission-pipeline checkpoint. For this single-lot slice there is nothing to resume mid-lot
 * that a fresh, deterministic re-run (the candidate is rebuilt from committed HEAD every run) would not
 * safely redo, so NO durable cross-invocation checkpoint is written — a demonstrated limitation, NOT a
 * silent second mechanism. The checkpoint CONTRACT is honoured in spirit: a FAILED/BLOCKED gate is NEVER
 * treated as DONE (RC-2), subsequent gates are marked NOT RUN, and HEAD is revalidated (truthLock) before
 * the run. Multi-lot durable resume needs a dedicated checkpoint namespace = a future CTO decision.
 *
 * The real side effects live behind injectable SEAMS (same pattern as converge-cli.ts) so runMigrateTs()
 * is unit-testable on BOTH success and failure without the heavy real candidate build.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export type GateStatus = "PASS" | "FAIL" | "BLOCKED" | "NOT RUN";
export interface GateResult { gate: string; status: GateStatus; detail: string }
// Truth Lock primitives now live in their canonical home ./truth-lock (V56 CHANTIER 1). Moving these PURE
// symbols out breaks the former circular import (validation-orchestrator depended on this module for them),
// so runMigrateTs can now delegate its gate loop to runGates. RE-EXPORTED verbatim ⇒ every historical
// importer of these symbols from "./migrate-ts-cli" is unchanged; there is ONE canonical Truth Lock.
import { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY } from "./truth-lock";
import type { TruthLock, GitState, TruthLockPolicy } from "./truth-lock";
import { runGates } from "./validation-orchestrator";
export { evaluateTruthLock, DEFAULT_TRUTH_LOCK_POLICY };
export type { TruthLock, GitState, TruthLockPolicy };

export interface MigrateSeams {
  allowedLots: string[];
  truthLock(): TruthLock;
  gate(name: string, lot: string): { status: GateStatus; detail: string };
  log(msg: string): void;
}
export interface MigrateResult { lot: string; truthLock: TruthLock | null; gates: GateResult[]; ok: boolean; exitCode: number }

// The ordered, DISTINCT internal validation gates. STOP on the first non-PASS; the rest are NOT RUN.
export const GATE_SEQUENCE = [
  "build:runtime",
  "strict-gate",
  "equivalence-bench",
  "historical-suites",
  "regressions",
] as const;

/**
 * runMigrateTs(lot, seams) — pure orchestrator. Exit codes: 0 all gates PASS; 1 a gate FAILed;
 * 2 BLOCKED (lot not authorised for this slice, or Truth Lock refused). A FAILED/BLOCKED gate is never
 * recorded as DONE and halts the sequence (remaining gates = NOT RUN).
 */
export function runMigrateTs(lot: string, seams: MigrateSeams): MigrateResult {
  if (!seams.allowedLots.includes(lot)) {
    seams.log(`BLOCKED: lot "${lot}" is not authorised for this slice (allowed: ${seams.allowedLots.join(", ") || "none"}). STOP — request a new CTO authorisation.`);
    return { lot, truthLock: null, gates: [], ok: false, exitCode: 2 };
  }
  const tl = seams.truthLock();
  seams.log(`Truth Lock: HEAD=${tl.head} branch=${tl.branch} — ${tl.detail}`);
  if (!tl.ok) {
    seams.log("BLOCKED: Truth Lock refused — repository state is not safe to run. STOP (no write, no overwrite).");
    return { lot, truthLock: tl, gates: [], ok: false, exitCode: 2 };
  }
  // Gate sequencing is DELEGATED to the generic orchestrator runGates (V56 CHANTIER 1 unification): one
  // stop-on-first-non-PASS engine, no duplicated loop. runGates is driven with NO truthLock seam (the Truth
  // Lock is already enforced above, preserving this path's exact gates:[]-on-refusal shape) and NO log seam
  // (runMigrateTs keeps its own progress-line format below). Migrate gates only ever return PASS/FAIL/BLOCKED,
  // so runGates' stop-on-FAIL/BLOCKED coincides with the historical stop-on-non-PASS (golden-proven parity).
  const spec = { gates: GATE_SEQUENCE.map((name) => ({ name, required: true })) };
  const report = runGates(spec, {
    gate: (name: string) => {
      const r = seams.gate(name, lot);
      return { status: r.status as "PASS" | "FAIL" | "BLOCKED", detail: r.detail };
    },
  });
  // Map runGates' GateReport[] back to this path's canonical MigrateResult.gates, preserving the historical
  // "NOT RUN" label + skipped-detail string BYTE-IDENTICALLY (an executed migrate gate is only PASS/FAIL/BLOCKED).
  const gates: GateResult[] = report.gates.map((g) =>
    g.executed
      ? { gate: g.gate, status: g.status as GateStatus, detail: g.detail }
      : { gate: g.gate, status: "NOT RUN" as GateStatus, detail: "skipped after an earlier non-PASS gate (no false DONE)" },
  );
  for (const g of gates) {
    if (g.status !== "NOT RUN") seams.log(`  ${g.status.padEnd(8)} ${g.gate} — ${g.detail}`);
  }
  const ok = gates.length === GATE_SEQUENCE.length && gates.every((g) => g.status === "PASS");
  return { lot, truthLock: tl, gates, ok, exitCode: ok ? 0 : 1 };
}

// --------------------------------------------------------------------------------------------------
// Real seams — the actual campaign side effects. Builds ONE isolated candidate (git-archive of committed
// HEAD + overlay of ONLY the authorised write-set source files) and runs every gate against it. The real
// repo is never written; the historical .js is never touched. Offline: npm ci is NOT run (node_modules is
// reused from the repo via symlink) — this is an OFFLINE candidate validation, never a network install.
// --------------------------------------------------------------------------------------------------
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

// The authorised write-set source files overlaid onto the committed-HEAD candidate for the validation-engine lot.
const LOT_WRITE_SET: Record<string, string[]> = {
  "validation-engine": [
    "runtime/core/validation-engine.ts",
    "runtime/__bench__/validation-engine-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
    "tsconfig.runtime-leaves-strict.json",
  ],
  // local-test-gate lot (CTO authorisation V9). Leaf module (no internal ./requires); the compiled
  // .ts is self-contained in dist. The strict-gate's leaves config is unchanged (it is not a dist
  // pipeline leaf), so the port is type-checked by the tsconfig.runtime-dist compile alone.
  "local-test-gate": [
    "runtime/core/local-test-gate.ts",
    "runtime/__bench__/local-test-gate-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // governance-kernel lot (CTO authorisation V10). Leaf module (only `fs`); compiled .ts is
  // self-contained in dist. Not a strict-leaves config member, so the port is type-checked by the
  // tsconfig.runtime-dist compile. Adding it to dist also gives the dist consumers (mission-ledger,
  // mission-lifecycle) a compiled `./governance-kernel` target.
  "governance-kernel": [
    "runtime/core/governance-kernel.ts",
    "runtime/__bench__/governance-kernel-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // research-ranking lot (CTO standing delegation V11). Pure leaf (no requires); self-contained in dist.
  "research-ranking": [
    "runtime/core/research-ranking.ts",
    "runtime/__bench__/research-ranking-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // connectivity-classifier lot (CTO standing delegation V11). Pure leaf; self-contained in dist.
  "connectivity-classifier": [
    "runtime/core/connectivity-classifier.ts",
    "runtime/__bench__/connectivity-classifier-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // local-fixers lot (CTO standing delegation V12). Leaf (only `fs`); self-contained in dist.
  "local-fixers": [
    "runtime/core/local-fixers.ts",
    "runtime/__bench__/local-fixers-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // decision-rules lot (CTO standing delegation V12). Pure leaf; self-contained in dist. Recognition
  // table only — authorization is unchanged (recognition is NOT authorization, as the .js documents).
  "decision-rules": [
    "runtime/core/decision-rules.ts",
    "runtime/__bench__/decision-rules-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // idempotency-guard lot (CTO standing delegation V13). Pure leaf; self-contained in dist. Consumed by
  // the dist-built patch-executor ⇒ dist include also gives it a compiled ./idempotency-guard target.
  "idempotency-guard": [
    "runtime/core/idempotency-guard.ts",
    "runtime/__bench__/idempotency-guard-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // scope-observer lot (CTO standing delegation V13). Leaf (fs + cwd-relative git; NO __dirname). A
  // validation-engine EVIDENCE dependency ⇒ dist include gives the dist consumer a compiled target.
  "scope-observer": [
    "runtime/core/scope-observer.ts",
    "runtime/__bench__/scope-observer-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // state-transition lot (CTO authorisation V15). Pure leaf (C03 STATE validator); self-contained in
  // dist. Widely consumed (mission-lifecycle/action-gate/capability-probes/... dist-built) ⇒ dist
  // include gives those compiled consumers a compiled ./state-transition target.
  "state-transition": [
    "runtime/core/state-transition.ts",
    "runtime/__bench__/state-transition-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // runtime-model lot (CTO authorisation V17). Pure leaf (deterministic, root-relative, no writes);
  // self-contained in dist. Consumed by the dist-built capability-registry ⇒ dist include gives it a
  // compiled ./runtime-model target.
  "runtime-model": [
    "runtime/core/runtime-model.ts",
    "runtime/__bench__/runtime-model-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // autonomy-measure lot (CTO authorisation V18). Pure deterministic leaf (no I/O); self-contained in
  // dist. Consumed by dist-built final-report + autonomy-rate ⇒ dist include gives a compiled target.
  "autonomy-measure": [
    "runtime/core/autonomy-measure.ts",
    "runtime/__bench__/autonomy-measure-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // capability-metrics lot (CTO authorisation V19). First NON-leaf port: requires ./autonomy-store, which
  // build-dist-closure co-locates (historical .js) in dist so the compiled module resolves it. Module
  // scope via `export {};`. record() keeps its real timestamp (non-deterministic, compared normalised).
  "capability-metrics": [
    "runtime/core/capability-metrics.ts",
    "runtime/__bench__/capability-metrics-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "specification-loader": [
    "runtime/core/specification-loader.ts",
    "runtime/__bench__/specification-loader-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "autonomy-store": [
    "runtime/core/autonomy-store.ts",
    "runtime/__bench__/autonomy-store-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "runtime-context-loader": [
    "runtime/core/runtime-context-loader.ts",
    "runtime/__bench__/runtime-context-loader-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "fleet-envelope": [
    "runtime/core/fleet-envelope.ts",
    "runtime/__bench__/fleet-envelope-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "economic-unit": [
    "runtime/core/economic-unit.ts",
    "runtime/__bench__/economic-unit-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "intake-endpoint": [
    "runtime/core/intake-endpoint.ts",
    "runtime/__bench__/intake-endpoint-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "post-release-learning": [
    "runtime/core/post-release-learning.ts",
    "runtime/__bench__/post-release-learning-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "autonomy-rate": [
    "runtime/core/autonomy-rate.ts",
    "runtime/__bench__/autonomy-rate-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "patch-memory": [
    "runtime/core/patch-memory.ts",
    "runtime/__bench__/patch-memory-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "opportunity-policy": [
    "runtime/core/opportunity-policy.ts",
    "runtime/__bench__/opportunity-policy-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "economic-extractor": [
    "runtime/core/economic-extractor.ts",
    "runtime/__bench__/economic-extractor-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "artifact-state": [
    "runtime/core/artifact-state.ts",
    "runtime/__bench__/artifact-state-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "pilot-delivery-packager": [
    "runtime/core/pilot-delivery-packager.ts",
    "runtime/__bench__/pilot-delivery-packager-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "client-intake": [
    "runtime/core/client-intake.ts",
    "runtime/__bench__/client-intake-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "capability-learning": [
    "runtime/core/capability-learning.ts",
    "runtime/__bench__/capability-learning-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "world-model": [
    "runtime/core/world-model.ts",
    "runtime/__bench__/world-model-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "mission-synthesizer": [
    "runtime/core/mission-synthesizer.ts",
    "runtime/__bench__/mission-synthesizer-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "git-branch-integration": [
    "runtime/core/git-branch-integration.ts",
    "runtime/__bench__/git-branch-integration-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "self-diagnostic": [
    "runtime/core/self-diagnostic.ts",
    "runtime/__bench__/self-diagnostic-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "fleet-dispatcher": [
    "runtime/core/fleet-dispatcher.ts",
    "runtime/__bench__/fleet-dispatcher-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "mission-contract-factory": [
    "runtime/core/mission-contract-factory.ts",
    "runtime/__bench__/mission-contract-factory-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "objective-attribution": [
    "runtime/core/objective-attribution.ts",
    "runtime/__bench__/objective-attribution-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  "capability-probes": [
    "runtime/core/capability-probes.ts",
    "runtime/__bench__/capability-probes-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // invoicing lot (CTO standing delegation V47). Pure leaf (only fs/path/crypto builtins, deps=0 per the
  // planner); the compiled .ts is self-contained in dist. Not a strict-leaves config member, so the port is
  // type-checked by the tsconfig.runtime-dist compile alone.
  "invoicing": [
    "runtime/core/invoicing.ts",
    "runtime/__bench__/invoicing-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // budget-contract lot (CTO standing delegation V47). Pure/deterministic (transport-only; no
  // reserve/spend/meter/enforce — NOT the finance perimeter); sole dep economic-unit.ts is already a dist
  // port, co-located by build-dist-closure. Type-checked by the tsconfig.runtime-dist compile.
  "budget-contract": [
    "runtime/core/budget-contract.ts",
    "runtime/__bench__/budget-contract-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // client-store-backup lot (CTO standing delegation V47). READ-ONLY backup + integrity-verified restore
  // (no network, no secrets, no retention/deletion — neutral perimeter). Sole dep client-intake.ts is
  // already a dist port, co-located (with its own ports) by build-dist-closure. Type-checked by the
  // tsconfig.runtime-dist compile.
  "client-store-backup": [
    "runtime/core/client-store-backup.ts",
    "runtime/__bench__/client-store-backup-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // expert-profile-assembler lot (CTO standing delegation V48). Pure, READ-ONLY, zero internal deps; neutral
  // perimeter (computes a §302/§303 authority INTERSECTION — subset-only — and reports profile status; grants
  // nothing, enforces nothing). The ONE reason it was dist-hazard-blocked — REPO_ROOT = path.resolve(
  // __dirname,"..","..") — is fixed in the port by the repo's proven process.cwd() root convention
  // (capability-registry.ts / build-recovery-engine.js η3-B42); equal to the __dirname-root in the verified
  // launch context. Type-checked by the tsconfig.runtime-dist compile.
  "expert-profile-assembler": [
    "runtime/core/expert-profile-assembler.ts",
    "runtime/__bench__/expert-profile-assembler-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // mission-context-builder lot (V52, ODG GATE A lowest-risk candidate). Deterministic composition of the
  // Mission Loader plan + RuntimeContext + an inert read-only expertInstance; authorizedPaths is a verbatim
  // passthrough (no enforcement). Both internal deps (expert-profile-assembler, runtime-context-loader) are
  // already dual-ported + in the dist include, so the compiled .ts's require()s resolve to compiled siblings.
  "mission-context-builder": [
    "runtime/core/mission-context-builder.ts",
    "runtime/__bench__/mission-context-builder-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // build-recovery-engine lot (V53, ODG provider-authz/apply contract). LEAF (fs/path/child_process only;
  // self-contained in dist). Behaviour-preserving port of capability BUILD_GATE_AUTONOMY — the sensitive
  // gating + APPLY branches, scope confinement, snapshot/restore, false-success exit discipline and the
  // provider-authorization / report artefacts are proven byte-identical by the equivalence bench WITHOUT
  // any real provider call or real source mutation (injected seams + temp fixtures + fs-write capture).
  "build-recovery-engine": [
    "runtime/core/build-recovery-engine.ts",
    "runtime/__bench__/build-recovery-engine-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // provider-sandbox lot (V62, ODG bounded provider-perimeter authz). Pure argv construction
  // (parseCommand/buildBwrapArgs) + a fail-closed runProvider whose sandbox run is INJECTED
  // (sandboxRunner) — NO real provider, NO network, NO secrets. Reuses the unmodified
  // ./bash-command-governor (.js, co-located in dist by build-dist-closure); that module is NOT touched.
  "provider-sandbox": [
    "runtime/core/provider-sandbox.ts",
    "runtime/__bench__/provider-sandbox-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // local-model-manager lot (V63, PROVIDER perimeter — consumer of provider-sandbox). Thin env-driven
  // abstraction; complete() delegates fail-closed to the dual-ported ./provider-sandbox. NO provider
  // activated by porting; tests inject the sandbox runner (no real binary/network/secret).
  "local-model-manager": [
    "runtime/core/local-model-manager.ts",
    "runtime/__bench__/local-model-manager-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // capability-router lot (V63, PROVIDER perimeter — routes Memory→Rules→Local-LLM→External-AI). Pure
  // deterministic routing; reuses co-located patch-memory/decision-rules/capability-metrics + dual-ported
  // local-model-manager; localModelAvailable is injectable. No provider activated by porting.
  "capability-router": [
    "runtime/core/capability-router.ts",
    "runtime/__bench__/capability-router-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // fleet-bridge lot (V63, PROVIDER perimeter — last PROVIDER candidate). The LIVE claude spawn is
  // fail-closed behind provider-live-call-gate (ODG_PROVIDER_LIVE) + a FLEET_BRIDGE_MOCK short-circuit;
  // the bench proves parity via MOCK + gate-refusal + pure fns + atomic claim — NO real provider/network/spend.
  // ./fleet-envelope and ./provider-live-call-gate are NOT modified (co-located in dist).
  "fleet-bridge": [
    "runtime/core/fleet-bridge.ts",
    "runtime/__bench__/fleet-bridge-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // payments lot (V64 FINANCE/DEC-006, bounded semantics-preserving). Verification-first reconciliation:
  // HMAC webhook verify + idempotency + card-data refusal + invoice reconciliation via dual-ported ./invoicing.
  // NO real money/network/secret-exposure; outbound charges DISABLED; tests use synthetic env + temp cwds.
  "payments": [
    "runtime/core/payments.ts",
    "runtime/__bench__/payments-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // quote lot (V64 FINANCE/DEC-006, bounded semantics-preserving). Governed quote lifecycle; totals reuse
  // invoicing.computeTotals; external emission + acceptance remain HUMAN acts (deny-by-default). No real
  // money/network/secret; caller-supplied figures never invented.
  "quote": [
    "runtime/core/quote.ts",
    "runtime/__bench__/quote-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // price-resolution lot (V64 FINANCE/DEC-006, bounded semantics-preserving). Pure/deterministic economic
  // valuation (declared PriceRule → EXACT BigInt money from observed usage); UNKNOWN-never-0; DERIVED≠OBSERVED;
  // ships ZERO rates. Reuses the dual-ported ./economic-unit. No clock/I/O/money/network.
  "price-resolution": [
    "runtime/core/price-resolution.ts",
    "runtime/__bench__/price-resolution-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // economic-verification lot (V64 FINANCE/DEC-006, bounded semantics-preserving). Pure/deterministic
  // arbitration: verdict (VERIFIED/FAILED/INCOMPLETE/UNKNOWN) over economic FACTS; deny-by-default;
  // "no false economic success" (UNKNOWN never 0; non-OK valuation with a value ⇒ VIOLATION). Reuses the
  // dual-ported ./price-resolution. No I/O/money/network.
  "economic-verification": [
    "runtime/core/economic-verification.ts",
    "runtime/__bench__/economic-verification-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // finance-sim lot (V64 FINANCE/DEC-006). SIMULATION-ONLY: deterministic long/flat baseline + no-look-ahead
  // + integer-minor P&L via economic-unit; NO network/execution/real-money. Reuses mechanical-acceptance VERDICT.
  "finance-sim": [
    "runtime/core/finance-sim.ts",
    "runtime/__bench__/finance-sim-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
  // finance-paper lot (V64 FINANCE/DEC-006). PAPER-ONLY virtual portfolio from finance-sim positions;
  // fail-closed decisions gate; fictitious orders (executed:false); fees/slippage are labelled ASSUMPTIONS.
  "finance-paper": [
    "runtime/core/finance-paper.ts",
    "runtime/__bench__/finance-paper-equivalence.e2e.test.ts",
    "tsconfig.runtime-dist.json",
  ],
};
// The lot's historical suites (replayed against the unchanged .js) and the sibling regression benches.
const LOT_HISTORICAL: Record<string, string[]> = {
  "validation-engine": [
    "src/runtime/validation-engine-recorded-noop.test.ts",
    "src/runtime/validation-engine-probe-freshness.test.ts",
  ],
  // The lot's existing behavioural suite, replayed against the UNCHANGED historical .js.
  "local-test-gate": [
    "runtime/core/local-test-gate.test.js",
  ],
  "governance-kernel": [
    "runtime/core/governance-kernel.test.js",
  ],
  "research-ranking": [
    "runtime/core/research-ranking.test.js",
  ],
  "connectivity-classifier": [
    "runtime/core/connectivity-classifier.test.js",
  ],
  "local-fixers": [
    "runtime/core/local-fixers.test.js",
  ],
  "decision-rules": [
    "runtime/core/decision-rules.test.js",
  ],
  "idempotency-guard": [
    "runtime/core/idempotency-guard.test.js",
  ],
  "scope-observer": [
    "runtime/core/scope-observer.test.js",
  ],
  "state-transition": [
    "runtime/core/state-transition.test.js",
  ],
  "runtime-model": [
    "runtime/core/runtime-model.test.js",
  ],
  "autonomy-measure": [
    "runtime/core/autonomy-measure.test.js",
  ],
  "capability-metrics": [
    "runtime/core/capability-metrics.test.js",
  ],
  // specification-loader has no historical .test.js in the repo; the equivalence bench is its proof.
  "specification-loader": [],
  // autonomy-store has no dedicated historical .test.js; the equivalence bench is its proof.
  "autonomy-store": [],
  // runtime-context-loader has no dedicated historical .test.js; the equivalence bench is its proof.
  "runtime-context-loader": [],
  // fleet-envelope has no dedicated historical .test.js; the equivalence bench is its proof.
  "fleet-envelope": [],
  "economic-unit": [
    "runtime/core/economic-unit.test.js",
  ],
  "intake-endpoint": [
    "runtime/core/intake-endpoint.test.js",
  ],
  "post-release-learning": [
    "runtime/core/post-release-learning.test.js",
  ],
  "autonomy-rate": [
    "runtime/core/autonomy-rate.test.js",
  ],
  "patch-memory": [
    "runtime/core/patch-memory.test.js",
  ],
  "opportunity-policy": [
    "runtime/core/opportunity-policy.test.js",
  ],
  "economic-extractor": [
    "runtime/core/economic-extractor.test.js",
  ],
  "artifact-state": [
    "runtime/core/artifact-state.test.js",
  ],
  "pilot-delivery-packager": [
    "runtime/core/pilot-delivery-packager.test.js",
  ],
  "client-intake": [
    "runtime/core/client-intake.test.js",
  ],
  "capability-learning": [
    "runtime/core/capability-learning.test.js",
  ],
  "world-model": [
    "runtime/core/world-model.test.js",
  ],
  "mission-synthesizer": [
    "runtime/core/mission-synthesizer.test.js",
  ],
  "git-branch-integration": [
    "runtime/core/git-branch-integration.test.js",
  ],
  "self-diagnostic": [
    "runtime/core/self-diagnostic.test.js",
  ],
  // fleet-dispatcher has no dedicated historical .test.js; the equivalence bench is its proof.
  "fleet-dispatcher": [],
  "mission-contract-factory": [
    "runtime/core/mission-contract-factory.test.js",
  ],
  "objective-attribution": [
    "runtime/core/objective-attribution.test.js",
  ],
  "capability-probes": [
    "runtime/core/capability-probes.test.js",
  ],
  "invoicing": [
    "runtime/core/invoicing.test.js",
  ],
  "budget-contract": [
    "runtime/core/budget-contract.test.js",
  ],
  "client-store-backup": [
    "runtime/core/client-store-backup.test.js",
  ],
  "expert-profile-assembler": [
    "runtime/core/expert-profile-assembler.test.js",
  ],
  "mission-context-builder": [
    "runtime/core/mission-context-builder.test.js",
    "runtime/core/mission-context-builder.expert.test.js",
  ],
  "build-recovery-engine": [
    "runtime/core/build-recovery-engine.test.js",
  ],
  "provider-sandbox": [
    "runtime/core/provider-sandbox.test.js",
  ],
  "local-model-manager": [
    "runtime/core/local-model-manager.test.js",
  ],
  "capability-router": [
    "runtime/core/capability-router.test.js",
  ],
  "fleet-bridge": [
    "runtime/core/fleet-bridge.test.js",
  ],
  "payments": [
    "runtime/core/payments.test.js",
  ],
  "quote": [
    "runtime/core/quote.test.js",
  ],
  "price-resolution": [
    "runtime/core/price-resolution.test.js",
  ],
  "economic-verification": [
    "runtime/core/economic-verification.test.js",
  ],
  "finance-sim": [
    "runtime/core/finance-sim-walkforward.test.js",
  ],
  "finance-paper": [
    "runtime/core/finance-paper.test.js",
  ],
};
const REGRESSION_BENCHES = [
  "runtime/__bench__/capability-registry-equivalence.e2e.test.ts",
  "runtime/__bench__/dist-closure-relocation.e2e.test.ts",
  "runtime/__bench__/project-context-engine-equivalence.e2e.test.ts",
  "runtime/__bench__/fleet-stage-equivalence.e2e.test.ts",
  "runtime/__bench__/mission-lifecycle-equivalence.e2e.test.ts",
];

function sh(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { code: r.status === null ? 1 : r.status, out: (r.stdout || "") + (r.stderr || "") };
}

// Gather the observable git facts for the Truth Lock policy (real repo). Any git failure degrades to a
// safe, refusing state rather than throwing.
function gatherGitState(): GitState {
  function g(args: string[]): string | null {
    const r = spawnSync("git", args, { cwd: REPO, encoding: "utf8" });
    return r.status === 0 ? (r.stdout || "").trim() : null;
  }
  const head = g(["rev-parse", "HEAD"]);
  if (head === null) return { isRepo: false, branch: "?", head: "?", originMain: null, staged: 0 };
  const branch = g(["rev-parse", "--abbrev-ref", "HEAD"]) || "?";
  const originMain = g(["rev-parse", "origin/main"]);
  const stagedOut = g(["diff", "--cached", "--name-only"]);
  const staged = stagedOut ? stagedOut.split("\n").filter(Boolean).length : 0;
  return { isRepo: true, branch, head, originMain, staged };
}

export function realSeams(): MigrateSeams {
  let candidate = "";
  let lockedHead = ""; // HEAD confirmed by truthLock; re-validated right before the sensitive git-archive.
  const tsx = path.join(REPO, "node_modules", ".bin", "tsx");
  const tsc = path.join(REPO, "node_modules", ".bin", "tsc");
  return {
    allowedLots: Object.keys(LOT_WRITE_SET),
    truthLock(): TruthLock {
      const tl = evaluateTruthLock(gatherGitState());
      if (tl.ok) lockedHead = tl.head;
      return tl;
    },
    gate(name: string, lot: string): { status: GateStatus; detail: string } {
      try {
        if (name === "build:runtime") {
          // RE-VALIDATE the invariants right before the sensitive op (a captured HEAD is not a
          // revalidation — η3-B79 §5): HEAD must still equal the one Truth Lock confirmed, and the
          // index must still be empty. Refuse (BLOCKED) rather than archive an unexpected state.
          const now = gatherGitState();
          const reTl = evaluateTruthLock(now);
          if (!reTl.ok) return { status: "BLOCKED", detail: "Truth Lock re-validation failed before archive: " + reTl.detail };
          if (now.head !== lockedHead) return { status: "BLOCKED", detail: `HEAD changed since Truth Lock (${lockedHead.slice(0, 8)} → ${now.head.slice(0, 8)}) — refuse to archive a shifted reference` };
          // Build the isolated candidate: git archive HEAD + overlay ONLY the authorised write-set.
          candidate = fs.mkdtempSync(path.join(os.tmpdir(), "odg-migrate-ts-"));
          const tar = spawnSync("bash", ["-c", `git archive HEAD | tar -x -C ${JSON.stringify(candidate)}`], { cwd: REPO, encoding: "utf8" });
          if (tar.status !== 0) return { status: "FAIL", detail: "git archive failed: " + (tar.stderr || "") };
          for (const rel of LOT_WRITE_SET[lot]) fs.cpSync(path.join(REPO, rel), path.join(candidate, rel));
          fs.symlinkSync(path.join(REPO, "node_modules"), path.join(candidate, "node_modules"));
          const b = sh(tsc, ["-p", "tsconfig.runtime-dist.json"], candidate);
          const emitted = fs.existsSync(path.join(candidate, "runtime", "dist", "core", `${lot}.js`));
          return b.code === 0 && emitted
            ? { status: "PASS", detail: `build:runtime EXIT 0, dist/core/${lot}.js emitted (OFFLINE candidate; npm ci NOT run)` }
            : { status: "FAIL", detail: `build rc=${b.code}, emitted=${emitted}` };
        }
        if (name === "strict-gate") {
          const r = sh(tsc, ["-p", "tsconfig.runtime-leaves-strict.json", "--noEmit"], candidate);
          return r.code === 0 ? { status: "PASS", detail: "strict gate EXIT 0" } : { status: "FAIL", detail: "strict gate rc=" + r.code + " " + r.out.slice(0, 200) };
        }
        if (name === "equivalence-bench") {
          const r = sh(tsx, [`runtime/__bench__/${lot}-equivalence.e2e.test.ts`], candidate);
          return r.code === 0 ? { status: "PASS", detail: "equivalence bench ALL PASS" } : { status: "FAIL", detail: "bench rc=" + r.code + " " + r.out.slice(-200) };
        }
        if (name === "historical-suites") {
          for (const t of LOT_HISTORICAL[lot]) {
            const r = sh(tsx, [t], candidate);
            if (r.code !== 0) return { status: "FAIL", detail: `${t} rc=${r.code}` };
          }
          return { status: "PASS", detail: `${LOT_HISTORICAL[lot].length} historical suite(s) green vs unchanged .js` };
        }
        if (name === "regressions") {
          for (const t of REGRESSION_BENCHES) {
            const r = sh(tsx, [t], candidate);
            if (r.code !== 0) return { status: "FAIL", detail: `${t} rc=${r.code}` };
          }
          return { status: "PASS", detail: `${REGRESSION_BENCHES.length} regression bench(es) green` };
        }
        return { status: "BLOCKED", detail: "unknown gate" };
      } catch (e: any) {
        return { status: "FAIL", detail: "gate threw: " + String(e && e.message || e) };
      } finally {
        // best-effort cleanup only AFTER the last gate
        if (name === "regressions" && candidate) { try { fs.rmSync(candidate, { recursive: true, force: true }); } catch { /* best-effort */ } }
      }
    },
    log(msg: string): void { console.log(msg); },
  };
}

function renderReport(res: MigrateResult): string {
  const lines = [
    "======================================",
    "ODG migrate-ts — TS migration campaign",
    "======================================",
    `Lot       : ${res.lot}`,
    res.truthLock ? `Truth Lock: HEAD=${res.truthLock.head} branch=${res.truthLock.branch}` : "Truth Lock: (not run)",
    "Gates     :",
    ...res.gates.map((g) => `  ${g.status.padEnd(8)} ${g.gate} — ${g.detail}`),
    `Outcome   : ${res.ok ? "ALL PASS" : "NOT COMPLETE"} (exit ${res.exitCode})`,
    "======================================",
  ];
  return lines.join("\n");
}

// Only run main() when invoked directly (tsx entrypoint), never when imported by the unit test.
const isMain = (() => { try { return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname); } catch { return false; } })();
if (isMain) {
  const lot = process.argv[2] || "validation-engine";
  const seams = realSeams();
  const res = runMigrateTs(lot, seams);
  console.log(renderReport(res));
  process.exit(res.exitCode);
}
