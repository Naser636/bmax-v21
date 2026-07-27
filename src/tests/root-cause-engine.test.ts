import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  RootCauseEngine,
  ROOT_CAUSE_ENGINE_VERSION,
  RELEASE_GATE_ORDER,
} from "@/runtime/root-cause-engine";

/**
 * Build a throwaway git repo with a controllable evidence surface so the engine's diagnosis is
 * deterministic and independent of the live repository state.
 */
function scratchRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rce-"));
  const git = (cmd: string) =>
    execSync(`git ${cmd}`, { cwd: dir, stdio: ["ignore", "pipe", "ignore"] });
  git("init -q");
  git("config user.email t@t.t");
  git("config user.name t");
  fs.mkdirSync(path.join(dir, "runtime/generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime/generated/mission-artifacts/history"), { recursive: true });
  return dir;
}

function writeVerify(dir: string, gates: Record<string, boolean>): void {
  fs.writeFileSync(
    path.join(dir, "runtime/generated/runtime-verify.json"),
    JSON.stringify({ generatedAt: "2026-01-01T00:00:00.000Z", ...gates }, null, 2),
  );
}

// --- metadata ------------------------------------------------------------
{
  const dir = scratchRepo();
  writeVerify(dir, { build: true, typescript: true, gitClean: true });
  const report = new RootCauseEngine({ cwd: dir }).diagnose("SOME_MISSION");
  console.assert(report.version === ROOT_CAUSE_ENGINE_VERSION, "version tag");
  console.assert(
    typeof report.generatedAt === "string" && !Number.isNaN(Date.parse(report.generatedAt)),
    "generatedAt is ISO",
  );
}

// --- all green (with proof) -> NO_BLOCKER --------------------------------
{
  const dir = scratchRepo();
  writeVerify(dir, { build: true, typescript: true, gitClean: true });
  fs.writeFileSync(
    path.join(dir, "runtime/generated/mission-report.json"),
    JSON.stringify({ mission: "OK_MISSION" }),
  );
  const report = new RootCauseEngine({ cwd: dir }).diagnose("OK_MISSION");
  console.assert(report.status === "NO_BLOCKER", "all green -> NO_BLOCKER");
  console.assert(report.blockingGates.length === 0, "no blocking gates");
  console.assert(report.rootCause === null, "no root cause when green");
  console.assert(report.correctiveMission === null, "no corrective mission when green");
}

// --- missing validation evidence -> EVIDENCE_MISSING ---------------------
{
  // No runtime-verify.json (build/typescript/gitClean unobservable), but the Documentation Proof
  // IS present, so there is no red gate — only unobservable ones.
  const dir = scratchRepo();
  fs.writeFileSync(
    path.join(dir, "runtime/generated/mission-report.json"),
    JSON.stringify({ mission: "SOME_MISSION" }),
  );
  const report = new RootCauseEngine({ cwd: dir }).diagnose("SOME_MISSION");
  console.assert(report.status === "EVIDENCE_MISSING", "missing evidence -> EVIDENCE_MISSING");
  console.assert(report.gates.build === null, "unobservable gate is null");
  console.assert(report.gates.documentationProofPresent === true, "proof gate observable and green");
}

// --- gitClean root cause: bookkeeping churn ------------------------------
{
  const dir = scratchRepo();
  const ledger = "runtime/generated/mission-artifacts/history/history.md";
  fs.writeFileSync(path.join(dir, ledger), "v1\n");
  execSync("git add -A && git commit -q -m init", { cwd: dir, stdio: "ignore" });
  fs.writeFileSync(path.join(dir, ledger), "v1\nv2\n"); // tracked modification
  writeVerify(dir, { build: true, typescript: true, gitClean: false });

  const report = new RootCauseEngine({ cwd: dir }).report("BLOCKED_MISSION");

  console.assert(report.status === "DIAGNOSED", "red gate -> DIAGNOSED");
  console.assert(report.rootCause?.gate === "gitClean", "root cause is gitClean");
  console.assert(
    report.rootCause?.responsibleComponent.evidenceProducer.includes("odg-verify.js"),
    "gitClean producer is odg-verify.js",
  );
  console.assert(
    (report.rootCause?.evidence.bookkeepingModified as string[]).includes(ledger),
    "ledger identified as bookkeeping churn",
  );
  console.assert(
    report.minimalPatch?.filesToModify.includes(".gitignore") &&
      report.minimalPatch?.filesToModify.includes(ledger),
    "patch untracks the ledger via .gitignore",
  );
  console.assert(report.minimalPatch?.applied === false, "patch is proposed, never applied");
  console.assert(
    report.correctiveMission?.mission === "RESOLVE_GIT_CLEAN_GATE",
    "corrective mission named for the gate",
  );
  console.assert(
    report.correctiveMission?.mode === "ENGINEERING" &&
      report.correctiveMission?.requiresEngineering === true,
    "corrective mission is an engineering mission",
  );

  // OBJ-001: the artifact is written to the gitignored generated tree.
  const artifact = path.join(dir, "runtime/generated/root-cause-report.json");
  console.assert(fs.existsSync(artifact), "root-cause-report.json written");
  const persisted = JSON.parse(fs.readFileSync(artifact, "utf8"));
  console.assert(persisted.rootCause.gate === "gitClean", "persisted artifact matches diagnosis");
  console.assert(
    fs.existsSync(path.join(dir, "runtime/generated/corrective-mission.json")),
    "corrective-mission.json mirrored",
  );

  // Writing under runtime/generated/ must not create tracked churn.
  const trackedAfter = execSync("git diff --name-only", { cwd: dir, encoding: "utf8" }).trim();
  console.assert(!trackedAfter.includes("root-cause-report.json"), "artifact is not a tracked file");
}

// --- gate priority: build wins over gitClean -----------------------------
{
  const dir = scratchRepo();
  writeVerify(dir, { build: false, typescript: true, gitClean: false });
  const report = new RootCauseEngine({ cwd: dir }).diagnose("BUILD_MISSION");
  console.assert(report.rootCause?.gate === "build", "build precedes gitClean in gate order");
  console.assert(
    report.blockingGates[0] === "build" && report.blockingGates.includes("gitClean"),
    "both red gates reported, build first",
  );
  console.assert(
    RELEASE_GATE_ORDER.indexOf("build") < RELEASE_GATE_ORDER.indexOf("gitClean"),
    "gate order sanity",
  );
}

// --- documentationProofPresent when no artifact exists -------------------
{
  const dir = scratchRepo();
  writeVerify(dir, { build: true, typescript: true, gitClean: true });
  // No mission-report.json / mstd artifact -> proof gate red.
  const report = new RootCauseEngine({ cwd: dir }).diagnose("NOPROOF_MISSION");
  console.assert(report.rootCause?.gate === "documentationProofPresent", "proof gate red");
  console.assert(
    report.minimalPatch?.filesToModify.includes("runtime/generated/mission-report.json"),
    "patch points at the mission report",
  );
}

// --- render is a Markdown brief ------------------------------------------
{
  const dir = scratchRepo();
  writeVerify(dir, { build: false, typescript: true, gitClean: true });
  const engine = new RootCauseEngine({ cwd: dir });
  const md = engine.render(engine.diagnose("R_MISSION"));
  console.assert(md.startsWith("# Root Cause Report"), "render header");
  console.assert(md.includes("Responsible component"), "render lists responsible component");
}

console.log("Root Cause Engine OK");
