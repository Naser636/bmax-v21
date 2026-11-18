#!/usr/bin/env node
"use strict";
/* V291 — INTEGRATION proof that the REAL mission path automatically discovers + reuses an existing capability BEFORE
 * building new. It drives the canonical decision-engine STAGE SCRIPT as a subprocess (the live entry: mission-plan.json
 * → decision.json) with a seeded patch-memory precedent, and asserts the decision-engine ITSELF (via WAKE-1's
 * capability-router consultation) reuses the precedent — WITHOUT any manual call to the V287 demonstrator. Proves §5:
 * automatic invocation; §9: discovered vs USED (reuseCount incremented); provenance honesty (retained author / UNKNOWN,
 * never faked ODG); contract-supplied patch never overridden; malformed/insufficient precedent EXCLUDED; no-precedent ⇒
 * deterministic verbatim fallthrough (no fabricated reuse); missing plan ⇒ fail-closed. Real components only; no mocks. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const REPO = process.cwd();
const TSX = path.join(REPO, "node_modules", ".bin", "tsx");
const DE = path.join(REPO, "runtime", "core", "decision-engine.ts");
const PM = require("./patch-memory.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

/** Seed precedents (via the REAL patch-memory API, cwd-relative store) then run the REAL decision-engine in that cwd. */
function runDecision(plan: any, seeds: any[]): any {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-de-reuse-"));
  const prev = process.cwd();
  try {
    process.chdir(dir);
    for (const s of seeds) PM.record(s);               // writes dir/runtime/generated/autonomy/patch-memory.json
  } finally { process.chdir(prev); }
  if (plan !== undefined) { fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true }); fs.writeFileSync(path.join(dir, "runtime", "generated", "mission-plan.json"), JSON.stringify(plan)); }
  const r = spawnSync(TSX, [DE], { cwd: dir, encoding: "utf8", timeout: 60000 });
  let decision: any = null, decisionRaw: string | null = null, store: any = null;
  try { decisionRaw = fs.readFileSync(path.join(dir, "runtime", "generated", "decision.json"), "utf8"); decision = JSON.parse(decisionRaw as string); } catch { /* none */ }
  try { store = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "autonomy", "patch-memory.json"), "utf8")); } catch { /* none */ }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return { status: r.status, stderr: String(r.stderr || ""), decision, decisionRaw, store, hadDecision: decisionRaw !== null };
}
const sig = (goal: string, id: string) => PM.signature({ goal, objectiveId: id });
const obj = (d: any, id: string) => d.decision.objectives.find((o: any) => o.id === id);

function main() {
  // ---- A. automatic reuse-before-build on the REAL path ----
  const A = runDecision(
    { mission: "M", mode: "eng", priority: "P1", authorizedPaths: ["src/"], objectives: [{ id: "OBJ_REUSE", goal: "G1" }, { id: "OBJ_NEW", goal: "ZZZ-no-precedent" }] },
    [{ signature: sig("G1", "OBJ_REUSE"), edits: [{ target: "src/x.ts", content: "REUSED" }], authoredBy: "ODG_CAPABILITY" }]);
  check("decision-engine ran on the real path (exit 0, decision.json produced)", A.status === 0 && A.hadDecision && A.decision.status === "READY");
  check("AUTOMATIC reuse: an existing precedent is discovered + attached by decision-engine ITSELF (no V287 demo call)", JSON.stringify(obj(A, "OBJ_REUSE").patch) === JSON.stringify([{ target: "src/x.ts", content: "REUSED" }]));
  check("provenance RETAINED, never faked: reused patch keeps its original author (ODG_CAPABILITY)", obj(A, "OBJ_REUSE").authoredBy === "ODG_CAPABILITY");
  check("USED (not merely discovered): the precedent's reuseCount is incremented in the store", A.store && A.store.entries[sig("G1", "OBJ_REUSE")] && A.store.entries[sig("G1", "OBJ_REUSE")].reuseCount >= 1);
  check("no-precedent objective passes through VERBATIM (build path, no fabricated reuse)", obj(A, "OBJ_NEW").patch === undefined && obj(A, "OBJ_NEW").authoredBy === undefined);

  // ---- B. no precedent anywhere ⇒ deterministic verbatim fallthrough (byte-identical) ----
  const planB = { mission: "M", mode: "eng", priority: "P1", objectives: [{ id: "O1", goal: "nope-A" }, { id: "O2", goal: "nope-B" }] };
  const B1 = runDecision(planB, []); const B2 = runDecision(planB, []);
  check("no precedent ⇒ NO objective gains a patch (no fabricated reuse)", B1.decision.objectives.every((o: any) => o.patch === undefined));
  check("deterministic: identical plan + empty memory ⇒ byte-identical decision.json", B1.decisionRaw === B2.decisionRaw);

  // ---- C. a contract-supplied patch is NEVER overridden by memory; provenance = CONTRACT ----
  const C = runDecision(
    { mission: "M", objectives: [{ id: "OBJ_REUSE", goal: "G1", patch: [{ target: "src/own.ts", content: "FROM_CONTRACT" }] }] },
    [{ signature: sig("G1", "OBJ_REUSE"), edits: [{ target: "src/x.ts", content: "REUSED" }], authoredBy: "ODG_CAPABILITY" }]);
  check("contract-supplied patch is preserved (memory never overrides a contract action) + authoredBy CONTRACT", JSON.stringify(obj(C, "OBJ_REUSE").patch) === JSON.stringify([{ target: "src/own.ts", content: "FROM_CONTRACT" }]) && obj(C, "OBJ_REUSE").authoredBy === "CONTRACT");

  // ---- D. provenance UNKNOWN when the precedent retained no author (never requalified as ODG) ----
  const D = runDecision(
    { mission: "M", objectives: [{ id: "OBJ_ANON", goal: "GA" }] },
    [{ signature: sig("GA", "OBJ_ANON"), edits: [{ target: "src/a.ts", content: "X" }] }]);
  check("precedent with no retained author ⇒ reused but authoredBy UNKNOWN (never faked ODG)", JSON.stringify(obj(D, "OBJ_ANON").patch) === JSON.stringify([{ target: "src/a.ts", content: "X" }]) && obj(D, "OBJ_ANON").authoredBy === "UNKNOWN");

  // ---- E. an insufficient/malformed precedent is EXCLUDED (exclusion on bad evidence) ----
  const E = runDecision(
    { mission: "M", objectives: [{ id: "OBJ_BAD", goal: "GB" }] },
    [{ signature: sig("GB", "OBJ_BAD"), edits: [{ target: "src/b.ts", content: "c", diff: "d" }] }]);  // both content+diff ⇒ not reusable
  check("malformed precedent (content AND diff) ⇒ EXCLUDED, no patch attached (fail-closed)", obj(E, "OBJ_BAD").patch === undefined);

  // ---- F. missing mission-plan.json ⇒ fail-closed ----
  const F = runDecision(undefined, []);
  check("missing mission-plan.json ⇒ exit 1 + STOP, no decision.json (fail-closed)", F.status === 1 && /STOP: mission-plan\.json missing/.test(F.stderr) && F.hadDecision === false);

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — decision-engine capability-reuse INTEGRATION (V291: the REAL mission path [decision-engine stage, WAKE-1 capability-router] AUTOMATICALLY discovers + reuses an existing precedent before building — provenance retained/UNKNOWN never faked, reuseCount proves effective USE, contract patch never overridden, malformed precedent excluded, no-precedent ⇒ deterministic verbatim fallthrough, missing plan ⇒ fail-closed; real subprocess, no V287 demonstrator, no mocks)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
