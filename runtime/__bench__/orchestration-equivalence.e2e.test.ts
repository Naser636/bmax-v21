// @ts-nocheck
/*
 * LOT η1-B1 — ORCHESTRATION EQUIVALENCE: legacy .js vs compiled dist .js (pipeline-builder/stage-effect/
 * checkpoint-engine). Phase-03 TS migration drift guard.
 * =====================================================================================================
 *
 * η1-A found the legacy runtime/core/{pipeline-builder,stage-effect,checkpoint-engine}.js are NOT shims of
 * the compiled modules (the header comment claiming "tsx-delegating shim" is stale/false): legacy and
 * compiled are TWO independent byte-equivalent implementations. Until a single-canonical-source cutover,
 * they can DRIFT. This bench asserts OBSERVED BEHAVIOURAL equivalence — NOT source-file equality and NOT
 * identity of compiled output — by exercising each module's real surface (legacy vs compiled) and comparing
 * the deterministic results, stripping volatile fields (timestamps, git/context/patch summaries).
 *
 * Mechanism: each module is loaded in a CHILD `node` process (cwd = a throwaway git sandbox with
 * runtime/generated) via its ABSOLUTE path — legacy from runtime/core, compiled from runtime/dist/core —
 * and a scripted probe prints a JSON summary. Equivalence = deep-equal summaries. Default stage base
 * (ODG_STAGE_BASE unset) is used so pipeline-builder's exported array reproduces the historical literals.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/orchestration-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function sandbox(): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-orch-equiv-"));
  sandboxes.push(sb);
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\n");
  fs.writeFileSync(path.join(sb, "seed.txt"), "seed\n");
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
/** Run a probe snippet in a child node process; MOD is require()'d from `modAbs`. Returns parsed JSON. */
function probe(modAbs: string, snippet: string, cwd: string): any {
  const code = `const MOD=require(${JSON.stringify(modAbs)});${snippet}`;
  const r = spawnSync("node", ["-e", code], { cwd, encoding: "utf8", env: { ...process.env, ODG_VERBOSE: "" } });
  const out = (r.stdout || "").trim();
  const m = out.match(/@@([\s\S]*)@@/); // delimit to ignore any import-time console noise
  if (!m) throw new Error(`probe produced no @@...@@ payload (status ${r.status}):\n${out}\n${r.stderr || ""}`);
  return JSON.parse(m[1]);
}
const legacy = (name: string) => path.join(REPO, "runtime", "core", `${name}.js`);
const compiled = (name: string) => path.join(REPO, "runtime", "dist", "core", `${name}.js`);

console.log("LOT η1-B1 — ORCHESTRATION EQUIVALENCE (legacy vs compiled: pipeline-builder/stage-effect/checkpoint-engine)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  for (const m of ["pipeline-builder", "stage-effect", "checkpoint-engine"]) {
    check(fs.existsSync(compiled(m)), `prerequisite: compiled ${m}.js present`);
  }

  // ---- pipeline-builder: exported stage array (default base) must be behaviourally identical ------
  {
    const snippet = `process.stdout.write("@@"+JSON.stringify(MOD)+"@@")`;
    const sbL = sandbox(); const aL = probe(legacy("pipeline-builder"), snippet, sbL);
    const sbC = sandbox(); const aC = probe(compiled("pipeline-builder"), snippet, sbC);
    check(Array.isArray(aL) && aL.length === 13, `pipeline-builder: legacy exports 13-stage array`);
    check(JSON.stringify(aL) === JSON.stringify(aC), "pipeline-builder: legacy and compiled exported arrays are IDENTICAL (default base)");
    // artifact behaviour: both write the SAME runtime-pipeline.json content.
    const artL = fs.readFileSync(path.join(sbL, "runtime", "generated", "runtime-pipeline.json"), "utf8");
    const artC = fs.readFileSync(path.join(sbC, "runtime", "generated", "runtime-pipeline.json"), "utf8");
    check(artL === artC, "pipeline-builder: runtime-pipeline.json artifact content identical (behavioural, not file-identity)");
  }

  // ---- stage-effect: STAGE_OUTPUTS map + stageEffectOk/artifactNonEmpty behaviour ----------------
  {
    const snippet = `
      const gen=require("path").join(process.cwd(),"runtime","generated");
      require("fs").writeFileSync(require("path").join(gen,"present.json"),"{}");
      require("fs").writeFileSync(require("path").join(gen,"empty.json"),"");
      const names=Object.keys(MOD.STAGE_OUTPUTS);
      const okByStage={}; for(const n of names) okByStage[n]=MOD.stageEffectOk(n,gen);
      const unknown=MOD.stageEffectOk("__NoSuchStage__",gen);
      const nePresent=MOD.artifactNonEmpty(require("path").join(gen,"present.json"));
      const neEmpty=MOD.artifactNonEmpty(require("path").join(gen,"empty.json"));
      process.stdout.write("@@"+JSON.stringify({outputs:MOD.STAGE_OUTPUTS,okByStage,unknown,nePresent,neEmpty})+"@@")`;
    const vL = probe(legacy("stage-effect"), snippet, sandbox());
    const vC = probe(compiled("stage-effect"), snippet, sandbox());
    check(JSON.stringify(vL.outputs) === JSON.stringify(vC.outputs), "stage-effect: STAGE_OUTPUTS map identical");
    check(JSON.stringify(vL.okByStage) === JSON.stringify(vC.okByStage), "stage-effect: stageEffectOk per-stage results identical");
    check(vL.unknown === vC.unknown && vL.nePresent === vC.nePresent && vL.neEmpty === vC.neEmpty, "stage-effect: unknown-stage + artifactNonEmpty(present/empty) identical");
  }

  // ---- checkpoint-engine: scripted state transitions (volatile fields stripped) ------------------
  {
    const snippet = `
      const strip=(cp)=>{const c=JSON.parse(JSON.stringify(cp));
        delete c.startedAt; delete c.updatedAt; delete c.finishedAt; delete c.context; delete c.patch; delete c.changedFiles;
        // rollback.head is the throwaway repo's baseline commit SHA (a function of commit time): it legitimately
        // differs between the two INDEPENDENT sandboxes and is the sole non-deterministic field. Normalise ONLY
        // that value to a stable sentinel — keep the rollback object and rollback.dirtyAtStart compared.
        if(c.rollback && typeof c.rollback==="object") c.rollback.head="<normalized-head>";
        if(Array.isArray(c.stages)) c.stages=c.stages.map(s=>{const t={...s}; delete t.startedAt; delete t.updatedAt; delete t.finishedAt; return t;});
        return c;};
      let cp=MOD.begin("EQUIV_M",["A","B"]).cp; // begin() returns {cp, resumeIndex}
      cp=MOD.stageRunning(cp,0); cp=MOD.stageDone(cp,0);
      cp=MOD.stageRunning(cp,1); cp=MOD.stageFailed(cp,1,"boom");
      process.stdout.write("@@"+JSON.stringify(strip(cp))+"@@")`;
    const cL = probe(legacy("checkpoint-engine"), snippet, sandbox());
    const cC = probe(compiled("checkpoint-engine"), snippet, sandbox());
    check(cL.mission === "EQUIV_M" && Array.isArray(cL.stages) && cL.stages.length === 2, "checkpoint-engine: legacy produces the scripted 2-stage checkpoint");
    check(JSON.stringify(cL) === JSON.stringify(cC), "checkpoint-engine: legacy and compiled state transitions IDENTICAL (timestamps/git/context stripped)");
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η1-B1 ORCHESTRATION EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
