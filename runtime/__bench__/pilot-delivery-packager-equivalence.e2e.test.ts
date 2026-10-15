#!/usr/bin/env node
/*
 * LOT pilot-delivery-packager — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, READ-ONLY: build:runtime compiles runtime/core/pilot-delivery-packager.ts →
 * runtime/dist/core/pilot-delivery-packager.js; build-dist-closure co-locates its dep (artifact-state.js —
 * a TS port, which itself pulls state-transition.js) in dist/core. packageDelivery(mission,{cwd}) reads a
 * seeded temp cwd and NEVER writes ⇒ fully deterministic ⇒ BYTE-IDENTICAL across the rejection matrix and
 * the ACCEPTED happy path.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/pilot-delivery-packager-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "pilot-delivery-packager.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "pilot-delivery-packager.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT pilot-delivery-packager — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/pilot-delivery-packager.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/pilot-delivery-packager.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "artifact-state.js")), "prerequisite: dep artifact-state.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.packageDelivery === "function" && typeof ts.packageDelivery === "function", "both export packageDelivery");
check(EQ(js.CODE, ts.CODE) && Object.isFrozen(ts.CODE), "CODE vocabulary byte-identical + frozen");

const temps: string[] = [];
function seed(files: Record<string, string>): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "pdp-"));
  temps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(d, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  return d;
}
const M = "DEMO_MISSION";
const both = (cwd: string, mission = M) => [js.packageDelivery(mission, { cwd }), ts.packageDelivery(mission, { cwd })] as const;

// BAD_REQUEST (no cwd needed).
check(EQ(js.packageDelivery("", {}), ts.packageDelivery("", {})) && js.packageDelivery("", {}).rejections[0].code === "BAD_REQUEST", "BAD_REQUEST (empty mission) BYTE-IDENTICAL");

// Baseline inputs missing ⇒ BASELINE_INPUT_MISSING.
{
  const [j, t] = both(seed({}));
  check(EQ(j, t) && j.accepted === false && j.rejections.some((r: any) => r.code === "BASELINE_INPUT_MISSING"), "baseline-missing BYTE-IDENTICAL");
}
// Full baseline but not validated + not proven + no deliverable.
{
  const cwd = seed({
    [`runtime/missions/${M}.json`]: JSON.stringify({ authorizedPaths: ["runtime/generated/evidence"] }),
    "runtime/generated/mission-report.json": JSON.stringify({ mission: M, status: "FAILED", validated: false }),
    "runtime/generated/mission-ledger.json": JSON.stringify([{ mission: M, proven: false, validated: false, state: "OPEN" }]),
    "runtime/generated/patch-execution.json": JSON.stringify({ mission: M, executed: [] }),
  });
  const [j, t] = both(cwd);
  check(EQ(j, t) && j.rejections.some((r: any) => r.code === "NOT_VALIDATED") && j.rejections.some((r: any) => r.code === "NOT_PROVEN_IN_LEDGER") && j.rejections.some((r: any) => r.code === "NO_DELIVERABLE"), "not-validated/not-proven/no-deliverable BYTE-IDENTICAL");
}
// Mission identity mismatch.
{
  const cwd = seed({
    [`runtime/missions/${M}.json`]: JSON.stringify({ authorizedPaths: [] }),
    "runtime/generated/mission-report.json": JSON.stringify({ mission: "OTHER", status: "SUCCESS", validated: true }),
    "runtime/generated/mission-ledger.json": JSON.stringify([]),
    "runtime/generated/patch-execution.json": JSON.stringify({ mission: "OTHER", executed: [] }),
  });
  const [j, t] = both(cwd);
  check(EQ(j, t) && j.rejections.some((r: any) => r.code === "MISSION_IDENTITY_MISMATCH"), "mission-identity-mismatch BYTE-IDENTICAL");
}
// Malformed JSON baseline.
{
  const cwd = seed({
    [`runtime/missions/${M}.json`]: "{bad",
    "runtime/generated/mission-report.json": JSON.stringify({ mission: M, status: "SUCCESS", validated: true }),
    "runtime/generated/mission-ledger.json": JSON.stringify([]),
    "runtime/generated/patch-execution.json": JSON.stringify({ mission: M, executed: [] }),
  });
  const [j, t] = both(cwd);
  check(EQ(j, t) && j.rejections.some((r: any) => r.code === "MALFORMED_JSON"), "malformed-json baseline BYTE-IDENTICAL");
}
// ACCEPTED happy path: validated+proven, one EXECUTED objective with External Research LIVE evidence in scope.
{
  const evidence = { capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ http_status: 200, content_hash: "abc123" }], ranked: [{ provenance_ref: "src#1" }] };
  const cwd = seed({
    [`runtime/missions/${M}.json`]: JSON.stringify({ authorizedPaths: ["runtime/generated/evidence"] }),
    "runtime/generated/mission-report.json": JSON.stringify({ mission: M, status: "SUCCESS", validated: true }),
    "runtime/generated/mission-ledger.json": JSON.stringify([{ mission: M, proven: true, validated: true, state: "ARCHIVED", archived: true }]),
    "runtime/generated/patch-execution.json": JSON.stringify({ mission: M, executed: [{ objectiveId: "o1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "runtime/generated/evidence/o1.json" }] }),
    "runtime/generated/evidence/o1.json": JSON.stringify(evidence),
  });
  const [j, t] = both(cwd);
  check(EQ(j, t), "ACCEPTED happy path BYTE-IDENTICAL JS≡TS");
  check(j.accepted === true && j.deliverable.length === 1 && j.deliverable[0].provenance.kind === "external-research-live" && j.provenanceComplete === true, "ACCEPTED: 1 deliverable, external-research-live provenance, provenanceComplete");
  check(j.humanAuthorizationRequired === true && j.readOnly === true, "ACCEPTED still requires human authorization + readOnly (never auto-handoff)");
  // DRY_RUN evidence ⇒ not acquisition ⇒ rejected.
  const cwd2 = seed({
    [`runtime/missions/${M}.json`]: JSON.stringify({ authorizedPaths: ["runtime/generated/evidence"] }),
    "runtime/generated/mission-report.json": JSON.stringify({ mission: M, status: "SUCCESS", validated: true }),
    "runtime/generated/mission-ledger.json": JSON.stringify([{ mission: M, proven: true, validated: true, state: "ARCHIVED", archived: true }]),
    "runtime/generated/patch-execution.json": JSON.stringify({ mission: M, executed: [{ objectiveId: "o1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "runtime/generated/evidence/o1.json" }] }),
    "runtime/generated/evidence/o1.json": JSON.stringify({ ...evidence, mode: "DRY_RUN", acquired: false }),
  });
  const [j2, t2] = both(cwd2);
  check(EQ(j2, t2) && j2.accepted === false && j2.rejections.some((r: any) => r.code === "DRY_RUN_NOT_ACQUISITION"), "DRY_RUN evidence ⇒ DRY_RUN_NOT_ACQUISITION BYTE-IDENTICAL");
}

for (const d of temps) {
  try {
    fs.rmSync(d, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

console.log(failures === 0 ? "ALL PASS — LOT pilot-delivery-packager EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
