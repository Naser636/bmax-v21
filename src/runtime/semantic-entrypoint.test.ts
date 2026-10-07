/*
 * SEMANTIC MISSION ENTRYPOINT — natural intent → governed mission → execution (focused lock).
 *
 * Proves the seam in runtime/bin/odg-objective.js: a human natural-language objective is INTERPRETED by
 * the existing governed gateway and, only when the projection is CLEAN, ROUTED to the EXISTING unified
 * entrypoint (odg mission → mission-cli) — the user never needs a mission/file/pipeline name. A governed
 * boundary (ambiguous / unknown-capability / authorization) STOPS before any execution. No second
 * runtime, no second authority: execution is delegated verbatim and all downstream gates still apply.
 *
 * Side effects are injected (io: existsSync/writeFileSync/mkdirSync/spawnSync/log), so routing and
 * contract-materialization are asserted WITHOUT running the heavy pipeline or writing to the real repo.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/semantic-entrypoint.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
const seam = require_(path.join(REPO, "runtime", "bin", "odg-objective.js")) as {
  decide: (raw: string, opts?: unknown) => { action: string; status: string; mission?: string; contract?: { mission: string }; question?: string; blockers?: { code: string }[] };
  materializeContract: (d: unknown, io: unknown) => { missionFile: string; reused: boolean };
  run: (raw: string, opts: { execute?: boolean }, io: unknown) => number;
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// An injectable io that records side effects instead of performing them.
function recorder(over?: Record<string, unknown>) {
  const calls = { writes: [] as { file: string; content: string }[], spawns: [] as { cmd: string; args: string[] }[], logs: [] as string[], mkdirs: [] as string[] };
  const io: Record<string, unknown> = {
    existsSync: () => false,
    writeFileSync: (file: string, content: string) => { calls.writes.push({ file, content }); },
    mkdirSync: (dir: string) => { calls.mkdirs.push(dir); },
    spawnSync: (cmd: string, args: string[]) => { calls.spawns.push({ cmd, args }); return { status: 0 }; },
    log: (s: string) => { calls.logs.push(s); },
    print: () => {},
    ...(over || {}),
  };
  return { io, calls };
}

console.log("SEMANTIC MISSION ENTRYPOINT — INTENT → GOVERNED MISSION → EXECUTION");

// === 1. Valid intent ⇒ EXECUTE decision with a resolved governed mission. ========================
{
  const d = seam.decide("audit the runtime state");
  check(d.action === "EXECUTE" && d.status === "READY_DRY_RUN", "valid intent ⇒ EXECUTE (READY_DRY_RUN)");
  check(d.mission === "AUDIT_THE_RUNTIME_STATE" && !!d.contract && d.contract.mission === d.mission, "valid intent resolves to a governed contract (name derived from intent)");
}

// === 2. Ambiguous intent ⇒ ASK (never execute). =================================================
{
  const d = seam.decide("fix");
  check(d.action === "ASK" && d.status === "AMBIGUOUS", "ambiguous intent ⇒ ASK");
  check(typeof d.question === "string" && d.question.length > 0, "ambiguous intent returns a business clarification question");
}

// === 3. Unknown intent (no capability) ⇒ STOP (BLOCKED), never execute. ==========================
{
  const d = seam.decide("zxcv qwerty asdf plugh");
  check(d.action === "STOP" && d.status === "BLOCKED", "unknown intent ⇒ STOP (BLOCKED)");
  check((d.blockers || []).some((b) => b.code === "MISSING_CAPABILITY"), "unknown intent names MISSING_CAPABILITY");
}

// === 4. Authorization boundary ⇒ STOP (DENIED); run(--execute) performs NO side effect. ==========
{
  const d = seam.decide("delete the production database");
  check(d.action === "STOP" && d.status === "DENIED", "authorization boundary ⇒ STOP (DENIED)");
  const { io, calls } = recorder();
  const code = seam.run("delete the production database", { execute: true }, io);
  check(code === 2, "run --execute on a denied intent exits 2 (not executed)");
  check(calls.spawns.length === 0, "denied intent ⇒ NEVER routes to execution (zero spawn)");
  check(calls.writes.length === 0, "denied intent ⇒ writes NO contract (no state)");
}

// === 5. Execution routing ⇒ synthesize on-demand contract + delegate to odg mission. ============
{
  const { io, calls } = recorder(); // existsSync:false ⇒ on-demand synthesis
  const code = seam.run("format the source files", { execute: true }, io);
  check(code === 0, "valid intent --execute returns the delegated pipeline exit code");
  check(calls.writes.length === 1 && /runtime\/missions\/FORMAT_THE_SOURCE_FILES\.json$/.test(calls.writes[0].file), "on-demand governed contract written to runtime/missions/<id>.json");
  const written = JSON.parse(calls.writes[0].content);
  check(written.mission === "FORMAT_THE_SOURCE_FILES" && Array.isArray(written.objectives) && written.objectives.length > 0, "written contract is the gateway's governed Mission-Loader contract");
  check(calls.spawns.length === 1 && calls.spawns[0].cmd === "node_modules/.bin/tsx" && calls.spawns[0].args[0] === "src/runtime/mission-cli.ts" && calls.spawns[0].args[1] === "FORMAT_THE_SOURCE_FILES", "delegates execution verbatim to the EXISTING unified entrypoint (odg mission <id>)");
}

// === 6. Resolve-to-existing ⇒ reuse a governed contract, never clobber it. =======================
{
  const { io, calls } = recorder({ existsSync: () => true }); // contract already present
  const code = seam.run("format the source files", { execute: true }, io);
  check(code === 0, "existing-contract path still routes to execution");
  check(calls.writes.length === 0, "an existing governed contract is REUSED, never overwritten");
  check(calls.spawns.length === 1 && calls.spawns[0].args[1] === "FORMAT_THE_SOURCE_FILES", "reused contract is routed to odg mission by its resolved name");
}

// === 7. Default (no --execute) preserves the pure dry-run contract exactly. ======================
{
  let printed = "";
  const io = { print: (s: string) => { printed += s; }, spawnSync: () => { throw new Error("must not execute in dry-run"); }, writeFileSync: () => { throw new Error("must not write in dry-run"); } };
  const code = seam.run("audit the runtime state", { execute: false }, io);
  check(code === 0, "dry-run of a clean intent exits 0 (unchanged contract)");
  const parsed = JSON.parse(printed);
  check(parsed.mode === "DRY_RUN" && parsed.status === "READY_DRY_RUN", "dry-run prints the governed projection and never executes");
}

console.log(failures === 0 ? "ALL PASS — SEMANTIC MISSION ENTRYPOINT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
