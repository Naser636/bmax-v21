// @ts-nocheck
/*
 * η3-B107 — FRONT-DOOR-B COORDINATED CUTOVER SWITCH.
 *
 * Qualifies the adapter's coordinated A/B runtime switch in isolation, with marker-writing entry stubs
 * and a controllable ensure stub (no heavy real pipeline). Proves, through the public runPipeline():
 *   - PUBLISHED DEFAULT unchanged: no env ⇒ the JS entry (runtime/bin/odg-run.js), no ODG_STAGE_BASE;
 *   - ODG_RUNTIME=ts (same switch as front door A) ⇒ the COMPILED entry + ODG_STAGE_BASE=runtime/dist/core,
 *     after the freshness-guard ensure succeeds;
 *   - an explicit ODG_RUNTIME_ENTRY pin WINS over ODG_RUNTIME=ts (this is the stub-tests' protection);
 *   - NO SILENT FALLBACK: ODG_RUNTIME=ts with a FAILING ensure ⇒ pipeline fails and NEITHER entry runs;
 *   - reversible rollback: unset ⇒ JS entry again.
 *
 * Out-of-tree sandboxes; touches no dev-tree file. Exit 0=PASS, 1=FAIL.
 */
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const REPO = process.cwd();
let failures = 0;
function check(c: boolean, l: string) { if (c) console.log("  PASS " + l); else { failures++; console.log("  FAIL " + l); } }
const sandboxes: string[] = [];

function buildWs(ensureExit: number): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-b107-coord-"));
  sandboxes.push(sb);
  for (const d of ["bin", "dist/bin", "dist/core", "generated", "missions"]) fs.mkdirSync(path.join(sb, "runtime", d), { recursive: true });
  // Entry stubs record WHICH entry ran and the stage base they saw.
  fs.writeFileSync(path.join(sb, "runtime/bin/odg-run.js"), "require('fs').writeFileSync('ENTRY_MARK','JS:'+(process.env.ODG_STAGE_BASE||'NONE'));process.exit(0);\n");
  fs.writeFileSync(path.join(sb, "runtime/dist/bin/odg-run.js"), "require('fs').writeFileSync('ENTRY_MARK','TS:'+(process.env.ODG_STAGE_BASE||'NONE'));process.exit(0);\n");
  // Verifier stub (refreshVerifyEvidence shells to it on success) + controllable ensure stub.
  fs.writeFileSync(path.join(sb, "runtime/bin/odg-verify.js"), "process.exit(0);\n");
  fs.writeFileSync(path.join(sb, "runtime/bin/odg-ensure-ts-runtime.sh"), `#!/usr/bin/env bash\nexit ${ensureExit}\n`);
  fs.chmodSync(path.join(sb, "runtime/bin/odg-ensure-ts-runtime.sh"), 0o755);
  fs.writeFileSync(path.join(sb, "runtime/missions/M.json"), JSON.stringify({
    mission: "M", version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", requires_engineering: false, authorized_paths: [],
    objectives: [{ id: "o1", goal: "x", done_when: ["d"], authorization: { eligible: true, authorized: true } }],
    definition_of_done: ["d"],
  }));
  return sb;
}
const mark = (sb: string) => { const p = path.join(sb, "ENTRY_MARK"); return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null; };
function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const keys = ["ODG_RUNTIME", "ODG_RUNTIME_ENTRY", "ODG_STAGE_BASE"];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) { saved[k] = process.env[k]; delete process.env[k]; }
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { fn(); } finally { for (const k of keys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

console.log("η3-B107 — FRONT-DOOR-B COORDINATED CUTOVER SWITCH");
try {
  // 1. PUBLISHED DEFAULT (no env) ⇒ JS entry, no stage base.
  withEnv({}, () => {
    const sb = buildWs(0);
    const out: any = new AutonomyRuntimeAdapter(sb).runPipeline("M");
    check(out.pipelineOk === true, "default: pipeline OK");
    check(mark(sb) === "JS:NONE", "default (no env) ⇒ JS entry, no ODG_STAGE_BASE (published default unchanged)");
  });

  // 2. ODG_RUNTIME=ts + ensure OK ⇒ compiled entry + injected stage base.
  withEnv({ ODG_RUNTIME: "ts" }, () => {
    const sb = buildWs(0);
    const out: any = new AutonomyRuntimeAdapter(sb).runPipeline("M");
    check(out.pipelineOk === true, "ODG_RUNTIME=ts: pipeline OK after freshness-guard ensure");
    check(mark(sb) === "TS:runtime/dist/core", "ODG_RUNTIME=ts ⇒ COMPILED entry + ODG_STAGE_BASE=runtime/dist/core (coordinated full-TS)");
  });

  // 3. explicit ODG_RUNTIME_ENTRY pin WINS over ODG_RUNTIME=ts (the stub-tests' protection).
  withEnv({ ODG_RUNTIME: "ts", ODG_RUNTIME_ENTRY: "runtime/bin/odg-run.js" }, () => {
    const sb = buildWs(1); // ensure would FAIL, but the pin must bypass ensure entirely
    const out: any = new AutonomyRuntimeAdapter(sb).runPipeline("M");
    check(out.pipelineOk === true, "pin: pipeline OK (ensure bypassed)");
    check(mark(sb) === "JS:NONE", "ODG_RUNTIME_ENTRY pin ⇒ JS entry even under ODG_RUNTIME=ts (intent preserved, no stage base)");
  });

  // 4. NO SILENT FALLBACK: ODG_RUNTIME=ts + ensure FAILS ⇒ pipeline fails, NEITHER entry runs.
  withEnv({ ODG_RUNTIME: "ts" }, () => {
    const sb = buildWs(1);
    const out: any = new AutonomyRuntimeAdapter(sb).runPipeline("M");
    check(out.pipelineOk === false, "ODG_RUNTIME=ts + failing ensure ⇒ pipeline NOT ok");
    check(mark(sb) === null, "failing ensure ⇒ NEITHER entry executed (no silent fallback to JS)");
  });

  // 5. REVERSIBLE ROLLBACK: unset ⇒ JS entry again.
  withEnv({}, () => {
    const sb = buildWs(0);
    new AutonomyRuntimeAdapter(sb).runPipeline("M");
    check(mark(sb) === "JS:NONE", "rollback: unset ODG_RUNTIME ⇒ JS entry again (reversible)");
  });
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch {} }
}

console.log(failures === 0 ? "ALL PASS — ADAPTER COORDINATED CUTOVER" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
