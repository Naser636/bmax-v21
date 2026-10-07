/*
 * SEMANTIC MISSION ENTRYPOINT — natural intent → governed mission → execution (focused lock).
 *
 * Proves the REPAIRED seam in runtime/bin/odg-objective.js: a human natural-language objective is
 * INTERPRETED by the existing governed gateway and, only when the projection is CLEAN, re-keyed onto a
 * BOUNDED governed identifier (NEVER the raw sentence) and ROUTED to the EXISTING unified entrypoint
 * (odg mission → mission-cli). A governed boundary (ambiguous / unknown-capability / authorization)
 * STOPS before any execution. Crucially, a green pipeline is NOT reported as SUCCESS on its own — the
 * seam requires a real per-objective evidence binding, else PARTIAL / BLOCKED with the exact reason.
 * No second runtime, no second authority: execution is delegated verbatim and all downstream gates apply.
 *
 * Side effects are injected (io: existsSync/writeFileSync/mkdirSync/spawnSync/log), so routing, verdict
 * and contract-materialization are asserted WITHOUT running the heavy pipeline or writing the real repo.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/semantic-entrypoint.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
type Contract = { mission: string; objectives: { id: string; goal: string }[]; authorized_paths?: string[]; verify?: { evidence?: string }[]; synthesizedFrom?: string };
type Decision = { action: string; status: string; mission?: string; contract?: Contract; question?: string; blockers?: { code: string }[]; result?: { intent?: { mode?: string }; normalizedObjective?: string } };
const seam = require_(path.join(REPO, "runtime", "bin", "odg-objective.js")) as {
  decide: (raw: string, opts?: unknown) => Decision;
  materializeContract: (d: unknown, io: unknown) => { missionFile: string; reused: boolean };
  run: (raw: string, opts: { execute?: boolean }, io: unknown) => number;
  boundedMissionId: (result: unknown) => string;
  contractHasEvidenceBinding: (c: unknown) => boolean;
  classifyOutcome: (d: unknown, exit: number) => { verdict: string; code: number; reason: string };
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

console.log("SEMANTIC MISSION ENTRYPOINT — INTENT → GOVERNED MISSION → EXECUTION (repaired)");

// === 1. Natural intent decomposition ⇒ EXECUTE with STRUCTURED objectives on a BOUNDED id. ========
// The raw sentence is NEVER the identifier: the mission id is a bounded NL_<MODE>_<hash>, and the
// multi-action intent is decomposed into one objective per action, each re-keyed off the bounded id.
{
  const d = seam.decide("audit the runtime state and audit the mission ledger");
  check(d.action === "EXECUTE" && d.status === "READY_DRY_RUN", "valid multi-action intent ⇒ EXECUTE (READY_DRY_RUN)");
  check(/^NL_[A-Z]+_[0-9A-F]{8}$/.test(d.mission || ""), "resolved id is a BOUNDED governed id NL_<MODE>_<hash>");
  check(!/AUDIT_THE_RUNTIME_STATE_AND/.test(d.mission || ""), "the raw NL sentence is NEVER used as the mission identifier");
  check(!!d.contract && d.contract.mission === d.mission, "the governed contract is re-keyed onto the bounded id");
  const objs = (d.contract && d.contract.objectives) || [];
  check(objs.length === 2, "the intent is decomposed into one objective per action (2)");
  check(objs.every((o) => new RegExp(`^${d.mission}_\\d+$`).test(o.id)), "every objective id is re-keyed off the bounded id (no sentence leak)");
  check((d.contract && d.contract.synthesizedFrom) === "AUDIT_THE_RUNTIME_STATE_AND_AUDIT_THE_MISSION_LEDGER", "the readable label is preserved as synthesizedFrom (traceability)");
}

// === 2. Bounded id is deterministic and carries the governed intent mode. =========================
{
  const a = seam.boundedMissionId({ intent: { mode: "ANALYZE" }, normalizedObjective: "audit the runtime state" });
  const b = seam.boundedMissionId({ intent: { mode: "ANALYZE" }, normalizedObjective: "audit the runtime state" });
  const c = seam.boundedMissionId({ intent: { mode: "ANALYZE" }, normalizedObjective: "format the source files" });
  check(a === b, "same intent ⇒ same bounded id (deterministic / resolve-to-existing stable)");
  check(a !== c, "different objectives ⇒ different bounded ids");
  check(a.startsWith("NL_ANALYZE_") && a.length <= 20, "bounded id carries the intent mode and stays short (bounded)");
}

// === 3. Ambiguous intent ⇒ ASK (never execute). =================================================
{
  const d = seam.decide("fix");
  check(d.action === "ASK" && d.status === "AMBIGUOUS", "ambiguous intent ⇒ ASK");
  check(typeof d.question === "string" && (d.question || "").length > 0, "ambiguous intent returns a business clarification question");
  check(d.mission === undefined, "ambiguous intent resolves NO mission id");
}

// === 4. Unknown intent (no capability) ⇒ STOP (BLOCKED), never execute. ==========================
{
  const d = seam.decide("zxcv qwerty asdf plugh");
  check(d.action === "STOP" && d.status === "BLOCKED", "unknown intent ⇒ STOP (BLOCKED)");
  check((d.blockers || []).some((b) => b.code === "MISSING_CAPABILITY"), "unknown intent names MISSING_CAPABILITY");
}

// === 5. Authorization boundary ⇒ STOP (DENIED); run(--execute) performs NO side effect. ==========
{
  const d = seam.decide("delete the production database");
  check(d.action === "STOP" && d.status === "DENIED", "authorization boundary ⇒ STOP (DENIED)");
  const { io, calls } = recorder();
  const code = seam.run("delete the production database", { execute: true }, io);
  check(code === 2, "run --execute on a denied intent exits 2 (not executed)");
  check(calls.spawns.length === 0, "denied intent ⇒ NEVER routes to execution (zero spawn)");
  check(calls.writes.length === 0, "denied intent ⇒ writes NO contract (no state)");
}

// === 6. New bounded mission synthesis ⇒ write a BOUNDED contract + delegate to odg mission. =======
{
  const { io, calls } = recorder(); // existsSync:false ⇒ on-demand synthesis
  const d = seam.decide("format the source files");
  const code = seam.run("format the source files", { execute: true }, io);
  check(calls.writes.length === 1 && new RegExp(`runtime/missions/${d.mission}\\.json$`).test(calls.writes[0].file), "bounded governed contract written to runtime/missions/<BOUNDED_ID>.json");
  const written = JSON.parse(calls.writes[0].content);
  check(written.mission === d.mission && !/FORMAT_THE_SOURCE_FILES/.test(written.mission), "written contract id is the BOUNDED id, not the sentence slug");
  check(Array.isArray(written.objectives) && written.objectives.length > 0, "written contract carries the gateway's governed objectives");
  check(calls.spawns.length === 1 && calls.spawns[0].cmd === "node_modules/.bin/tsx" && calls.spawns[0].args[0] === "src/runtime/mission-cli.ts" && calls.spawns[0].args[1] === d.mission, "delegates execution verbatim to the EXISTING unified entrypoint (odg mission <BOUNDED_ID>)");
  // Zero-evidence false-success prevention: the synthesized read-only contract has no evidence binding,
  // so a green pipeline (spawn status 0) must NOT be reported SUCCESS.
  check(code === 3, "green pipeline over an evidence-free synthesized mission ⇒ PARTIAL (not SUCCESS)");
}

// === 7. Existing-mission resolution ⇒ reuse a governed contract, never clobber it. ================
{
  const { io, calls } = recorder({ existsSync: () => true }); // contract already present
  const d = seam.decide("format the source files");
  const code = seam.run("format the source files", { execute: true }, io);
  check(calls.writes.length === 0, "an existing governed contract is REUSED, never overwritten");
  check(calls.spawns.length === 1 && calls.spawns[0].args[1] === d.mission, "reused contract is routed to odg mission by its bounded resolved id");
  check(code === 3, "reused evidence-free mission still ⇒ PARTIAL on a green pipeline (no false SUCCESS)");
}

// === 8. Zero-evidence false-success prevention — classifyOutcome is a function of REAL evidence. ===
{
  const evidenceFree = { contract: { mission: "NL_ANALYZE_DEADBEEF", objectives: [{ id: "x", goal: "g" }] } };
  const greenNoEvidence = seam.classifyOutcome(evidenceFree, 0);
  check(greenNoEvidence.verdict === "PARTIAL" && greenNoEvidence.code === 3, "exit 0 + no evidence binding ⇒ PARTIAL (not SUCCESS)");
  check(/NO_OBJECTIVE_EVIDENCE_BINDING/.test(greenNoEvidence.reason), "PARTIAL names the exact reason (NO_OBJECTIVE_EVIDENCE_BINDING)");
  check(seam.contractHasEvidenceBinding(evidenceFree.contract) === false, "a contract with no authorized_paths and no verify-evidence has NO evidence binding");

  const pipelineFailed = seam.classifyOutcome({ contract: { authorized_paths: ["src/x.ts"], objectives: [] } }, 1);
  check(pipelineFailed.verdict === "BLOCKED" && pipelineFailed.code === 3, "non-zero pipeline exit ⇒ BLOCKED (never SUCCESS)");
}

// === 9. Real execution routing with evidence ⇒ SUCCESS only when validated against a binding. =====
{
  const engineering = { contract: { mission: "NL_IMPLEMENT_CAFEF00D", authorized_paths: ["src/runtime/x.ts"], objectives: [{ id: "x", goal: "g" }] } };
  check(seam.contractHasEvidenceBinding(engineering.contract) === true, "authorized_paths is a genuine evidence binding");
  const ok = seam.classifyOutcome(engineering, 0);
  check(ok.verdict === "SUCCESS" && ok.code === 0, "validated pipeline (exit 0) + evidence binding ⇒ SUCCESS");

  const verifyBound = { contract: { mission: "NL_ANALYZE_F00DCAFE", verify: [{ evidence: "runtime-health-probe" }], objectives: [{ id: "x", goal: "g" }] } };
  check(seam.contractHasEvidenceBinding(verifyBound.contract) === true, "verify[].evidence is a genuine evidence binding");
  check(seam.classifyOutcome(verifyBound, 0).verdict === "SUCCESS", "verify-evidence-bound mission validated ⇒ SUCCESS");
}

// === 10. Default (no --execute) preserves the pure dry-run and surfaces the bounded id. ===========
{
  let printed = "";
  const io = { print: (s: string) => { printed += s; }, spawnSync: () => { throw new Error("must not execute in dry-run"); }, writeFileSync: () => { throw new Error("must not write in dry-run"); } };
  const code = seam.run("audit the runtime state", { execute: false }, io);
  check(code === 0, "dry-run of a clean intent exits 0");
  const parsed = JSON.parse(printed);
  check(parsed.mode === "DRY_RUN" && parsed.status === "READY_DRY_RUN", "dry-run prints the governed projection and never executes");
  check(/^NL_[A-Z]+_[0-9A-F]{8}$/.test(parsed.resolvedMission || ""), "dry-run surfaces the BOUNDED routing id (never the raw sentence)");
}

console.log(failures === 0 ? "ALL PASS — SEMANTIC MISSION ENTRYPOINT (repaired)" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
