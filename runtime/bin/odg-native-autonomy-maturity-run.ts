#!/usr/bin/env node
"use strict";
/*
 * V15.5 Step 7 — NATIVE AUTONOMY vs PROVIDER WORK runner. READ-ONLY over real repo state; writes ONLY its own artifact
 * (default docs/odg/evidence/V155_NATIVE_AUTONOMY_MATURITY.json). All classification lives in the PURE
 * runtime/core/odg-native-autonomy-maturity.ts (composition over the canonical measures — no second engine).
 *
 * Reads: git log of --ref (default HEAD; read-only git plumbing), <state-root>/runtime/generated/{mission-attempt-log.jsonl,
 * scheduler-audit-chain.json, mission-ledger.json, autonomy/*.json, autonomy-rate.json}, <repo>/docs/odg/**,
 * package.json (test:report list) and the runtime/src TypeScript tree (wiring scan). No network, no model, no write
 * outside --out.
 *
 * Usage: npx tsx runtime/bin/odg-native-autonomy-maturity-run.ts [--state-root DIR] [--now ISO] [--ref REF] [--out PATH] [--no-write]
 *   --state-root: where runtime/generated lives (default: this repo). A worktree has no runtime/generated, so point it at
 *                 the main checkout to READ its live state (read-only).
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const M = require(path.join(ROOT, "runtime", "core", "odg-native-autonomy-maturity.js"));

function arg(name: string, dflt: string | null): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const STATE_ROOT = path.resolve(arg("--state-root", ROOT) as string);
const NOW = arg("--now", new Date().toISOString()) as string;
const REF = arg("--ref", "HEAD") as string;
const OUT = path.resolve(arg("--out", path.join(ROOT, "docs", "odg", "evidence", "V155_NATIVE_AUTONOMY_MATURITY.json")) as string);
const NO_WRITE = process.argv.includes("--no-write");

function readJson(p: string): any { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function gen(rel: string): string { return path.join(STATE_ROOT, "runtime", "generated", rel); }
function nonEmpty(p: string): boolean { try { return fs.statSync(p).size > 2; } catch { return false; } }

// ---- git (read-only) ----------------------------------------------------------------------------------------------
function git(args: string[]): string { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }); }
function readCommits(): any[] | null {
  try {
    const since = new Date(Date.parse(NOW) - 90 * 86400000).toISOString();
    const raw = git(["log", REF, "--since=" + since, "--until=" + NOW, "--format=%H%x1f%cI%x1f%an%x1f%P%x1f%B%x1e"]);
    const out: any[] = [];
    for (const rec of raw.split("\x1e")) {
      const t = rec.replace(/^\n+/, "");
      if (!t.trim()) continue;
      const [sha, at, author, parents, body] = t.split("\x1f");
      const ps = String(parents || "").trim().split(/\s+/).filter(Boolean);
      const merge = ps.length > 1;
      const c: any = { sha, at: new Date(at).toISOString(), author, body: body || "", merge };
      if (merge) {
        const m = /^Merge pull request #(\d+)/.exec(body || "");
        if (m) {
          c.pr = Number(m[1]);
          try { c.prCommitShas = git(["rev-list", "--no-merges", ps[0] + ".." + ps[1]]).split("\n").filter(Boolean); } catch { c.prCommitShas = []; }
        }
      }
      out.push(c);
    }
    return out;
  } catch { return null; }
}

// ---- runtime state -----------------------------------------------------------------------------------------------
function readAttempts(): any[] | null {
  const p = gen("mission-attempt-log.jsonl");
  if (!fs.existsSync(p)) return null;
  return String(fs.readFileSync(p, "utf8")).split("\n").filter(Boolean).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
const attempts = readAttempts();
const auditChain = readJson(gen("scheduler-audit-chain.json"));
const ledger = readJson(gen("mission-ledger.json"));
const ev = (f: string) => readJson(path.join(ROOT, "docs", "odg", "evidence", f));
const supervisorSnapshot = ev("V155_AGENT_SUPERVISOR_SNAPSHOT.json");
const waveEvidence = ev("V155_REAL_WAVE_EVIDENCE.json");
const resumeScenario = ev("V150_SCENARIO_M_RESUME.json");

// evidence files carrying inspection records (deterministic order)
const evidenceDir = path.join(ROOT, "docs", "odg", "evidence");
const evidence = (fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir) : []).filter((n: string) => n.endsWith(".json") && n !== path.basename(OUT)).sort()
  .map((n: string) => ({ file: "docs/odg/evidence/" + n, json: readJson(path.join(evidenceDir, n)) }));

// provider-invoked decisions (ODG code decided; a provider launched the run)
const providerInvokedDecisions: any[] = [];
if (supervisorSnapshot) {
  providerInvokedDecisions.push({ source: "docs/odg/evidence/V155_AGENT_SUPERVISOR_SNAPSHOT.json", kind: "supervisor recovery decisions (REFUSE/RELAUNCH)", count: (supervisorSnapshot.recovery || []).length });
  providerInvokedDecisions.push({ source: "docs/odg/evidence/V155_AGENT_SUPERVISOR_SNAPSHOT.json", kind: "supervisor write-set contention verdicts", count: ((supervisorSnapshot.contention || {}).contentions || []).length });
}
if (waveEvidence) providerInvokedDecisions.push({ source: "docs/odg/evidence/V155_REAL_WAVE_EVIDENCE.json", kind: "wave selection + write-set enforcement in worktree runs (narrative evidence; per-decision count not machine-recorded)", count: null });

// controlled interruption experiments (provider-written harness / provider-killed runs)
const recoveryExperiments: any[] = [];
if (resumeScenario) recoveryExperiments.push({ file: "docs/odg/evidence/V150_SCENARIO_M_RESUME.json", recoveries: (resumeScenario.phases || []).filter((p: any) => (p.reconciled || []).length || (p.takeovers || []).length).length });
if (waveEvidence && waveEvidence.step4_interruption) recoveryExperiments.push({ file: "docs/odg/evidence/V155_REAL_WAVE_EVIDENCE.json#step4_interruption", recoveries: Object.values(waveEvidence.step4_interruption).filter((v: any) => v && typeof v === "object" && Object.keys(v).some((k) => /^next_tick/.test(k))).length });

const proposalSources = {
  frontierRegistry: readJson(gen("autonomy/frontier-proposal-registry.json")),
  selfDiagnosticIncidents: readJson(gen("autonomy/self-diagnostic-incidents.json")),
  nativeProvenance: readJson(path.join(ROOT, "docs", "odg", "native-execution-provenance.json")),
  supervisorSnapshot,
};

// ---- 20-capability specs (CTO list) -------------------------------------------------------------------------------
const T = M.TRIGGER;
const C = (n: string) => "runtime/core/" + n + ".ts";
const capabilitySpecs = [
  { id: "detect-needs", name: "detect needs", components: [C("odg-radar-to-mission-loop"), C("self-diagnostic")], live: { source: "docs/odg/V136_SELF_ORIGINATION.json", trigger: T.PROVIDER_INVOKED } },
  { id: "prioritise", name: "prioritise", components: [C("mission-scheduler"), C("odg-mission-scheduler")], live: { source: "runtime/generated/mission-attempt-log.jsonl", trigger: T.UNATTENDED } },
  { id: "analyse-deps", name: "analyse dependencies", components: [C("dep-planner"), C("change-impact-graph")], live: null, note: "no persisted live run artifact found" },
  { id: "decompose", name: "decompose", components: [C("mission-decomposer"), C("decomposition-planner"), C("odg-mission-decompose-chain")], live: null, note: "no persisted live run artifact found" },
  { id: "skills", name: "skills / capability registry", components: [C("capability-registry")], live: { source: "runtime/generated/autonomy/capability-outcomes.json", trigger: T.PROVIDER_INVOKED } },
  { id: "select-models", name: "select resources / models", components: [C("model-router"), C("odg-model-router")], live: null, note: "model routing is being reworked by another V15.5 step; no live routing log measured here" },
  { id: "allocate-agents", name: "allocate agents", components: [C("odg-mission-orchestrator"), C("writeset-scheduler")], live: { source: "docs/odg/evidence/V155_REAL_WAVE_EVIDENCE.json", trigger: T.PROVIDER_INVOKED } },
  { id: "define-write-sets", name: "define write-sets", components: [C("odg-writeset-contention"), "runtime/bin/odg-schedule-tick.ts"], live: { source: "docs/odg/evidence/V155_REAL_WAVE_EVIDENCE.json", trigger: T.PROVIDER_INVOKED } },
  { id: "execute", name: "execute", components: [C("odg-native-engineering"), C("odg-native-engineering-loop"), C("odg-closed-executor")], live: { source: "attempt-log:PASS", trigger: T.UNATTENDED }, note: "the timer-cadence log holds a real PASS dispatch; the ledger's single actor=ODG entry came from a provider-invoked native run" },
  { id: "supervise", name: "supervise", components: [C("odg-agent-supervisor")], live: { source: "docs/odg/evidence/V155_AGENT_SUPERVISOR_SNAPSHOT.json", trigger: T.PROVIDER_INVOKED } },
  { id: "detect-errors", name: "detect errors", components: [C("rce-signal-collector"), C("self-diagnostic")], live: { source: "docs/odg/evidence/V150_SCENARIO_E_SELF_HEALING.json", trigger: T.EXPERIMENT } },
  { id: "diagnose", name: "diagnose", components: [C("rce-root-cause-intelligence"), C("repair-planner")], live: { source: "docs/odg/evidence/V150_SCENARIO_E_SELF_HEALING.json", trigger: T.EXPERIMENT } },
  { id: "propose-apply-fixes", name: "propose + apply authorized fixes", components: [C("repair-workflow"), C("generative-repair-adapter")], live: { source: "docs/odg/evidence/V150_SCENARIO_E_SELF_HEALING.json", trigger: T.EXPERIMENT }, note: "apply to the REAL repo is OWNER_GATED; only experiment fixtures were repaired" },
  { id: "test", name: "test", components: [C("code-execution"), C("odg-closed-executor")], live: { source: "docs/odg/native-execution-provenance.json", trigger: T.PROVIDER_INVOKED } },
  { id: "independent-inspection", name: "independent inspection", components: [C("evaluator-independence"), C("independent-label-policy")], live: null, note: "recorded inspections are the provider's own subagent, not ODG's evaluator ⇒ not counted as ODG live" },
  { id: "integrate", name: "integrate", components: [C("git-branch-integration")], live: null, note: "integration to main is done by the owner via PR merge" },
  { id: "recover", name: "recover", components: [C("campaign-loop"), C("idempotency-guard"), C("fleet-bridge")], live: { source: "docs/odg/evidence/V150_SCENARIO_M_RESUME.json", trigger: T.EXPERIMENT } },
  { id: "self-measure", name: "self-measure", components: [C("odg-native-autonomy-maturity"), C("autonomy-measure")], live: { source: "runtime/generated/autonomy-rate.json", trigger: T.PROVIDER_INVOKED } },
  { id: "improve-methods", name: "improve methods", components: [C("odg-self-improvement-cycle"), C("odg-behavioral-improvement")], live: null, note: "real-repo self-improvement cycle = OWNER_DECISION_ONLY" },
  { id: "continue-next-mission", name: "continue to next mission", components: [C("odg-native-mission-continuation"), C("continuous-planner")], live: null, note: "resident driver = OWNER_GATED" },
];
const TEST_OVERRIDE: Record<string, string> = { "runtime/bin/odg-schedule-tick.ts": "runtime/bin/odg-schedule-tick-wave.test.ts" };

// ---- component facts: built / tested (in test:report) / wired (required by a non-test file) ------------------------
const pkg = readJson(path.join(ROOT, "package.json")) || {};
const testReport = String((pkg.scripts || {})["test:report"] || "");
function listTs(dirRel: string, acc: string[]): string[] {
  let names: any[] = [];
  try { names = fs.readdirSync(path.join(ROOT, dirRel), { withFileTypes: true }); } catch { return acc; }
  for (const d of names) {
    const rel = dirRel + "/" + d.name;
    if (d.isDirectory()) { if (!/^(dist|generated|node_modules|missions|logs)$/.test(d.name)) listTs(rel, acc); }
    else if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) acc.push(rel);
  }
  return acc;
}
const consumerFiles = ["runtime", "src", "scripts"].reduce((a: string[], d: string) => listTs(d, a), []).sort();
const contents: Record<string, string> = {};
for (const f of consumerFiles) { try { contents[f] = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { /* skip */ } }
const componentFacts: Record<string, any> = {};
for (const s of capabilitySpecs) for (const c of s.components) {
  if (componentFacts[c]) continue;
  const base = path.basename(c, ".ts");
  const testFile = TEST_OVERRIDE[c] || c.replace(/\.ts$/, ".test.ts");
  const re = new RegExp("require\\([^)]*[\\/\"']" + base.replace(/[-.]/g, "\\$&") + "(\\.js)?[\"']");
  const consumers = consumerFiles.filter((f) => f !== c && re.test(contents[f] || ""));
  const isBinEntry = c.startsWith("runtime/bin/");
  componentFacts[c] = {
    built: fs.existsSync(path.join(ROOT, c)),
    tested: fs.existsSync(path.join(ROOT, testFile)) && testReport.includes(testFile), // CI-GATED (ci.yml runs test:report only)
    testFileExists: fs.existsSync(path.join(ROOT, testFile)),
    wired: consumers.length > 0 || (isBinEntry && fs.existsSync(path.join(ROOT, c))),
    consumers: consumers.length,
    testFile,
  };
}
const liveOk: Record<string, boolean> = {};
for (const s of capabilitySpecs) {
  if (!s.live) continue;
  const src = s.live.source;
  if (src === "attempt-log:PASS") liveOk[src] = Array.isArray(attempts) && attempts.some((a: any) => a && a.status === "PASS");
  else if (src.startsWith("runtime/generated/")) liveOk[src] = nonEmpty(path.join(STATE_ROOT, src));
  else liveOk[src] = nonEmpty(path.join(ROOT, src));
}

// ---- next progression sequence (curated; filtered by the computed ladder) ----------------------------------------
const progressionSteps = [
  { capability: "independent-inspection", target: "EXERCISED_LIVE", step: "persist evaluator-independence verdicts from the mission pipeline's validation stage to an append-only runtime/generated log (one row per verdict), so ODG's own independent check becomes countable instead of the provider subagent's", gating: "INTERNAL" },
  { capability: "recover", target: "EXERCISED_LIVE", step: "make odg-schedule-tick write an explicit attempt-log reason when it reclaims a stale ledger claim / re-admits a mission whose prior run was interrupted (INTERRUPTED_PRIOR_RUN), so a real unattended recovery is recorded when it happens", gating: "INTERNAL (code); occurrence on the live timer is unforced" },
  { capability: "decompose", target: "EXERCISED_LIVE", step: "run odg-mission-decompose-chain read-only over one real ROADMAP mission and commit the decomposition evidence artifact", gating: "INTERNAL" },
  { capability: "analyse-deps", target: "EXERCISED_LIVE", step: "persist the dep-planner layer plan the wave tick already computes into wave-summary/attempt-log so dependency analysis leaves a live trace", gating: "INTERNAL" },
  { capability: "propose-apply-fixes", target: "EXERCISED_LIVE", step: "apply ONE ODG-proposed deterministic repair to the real repo through repair-workflow under an owner-authorized write-set, committed with an 'ODG-Native-Actor: ODG' provenance trailer (would also move counter 5 off 0)", gating: "OWNER_GATED (real-repo write)" },
  { capability: "continue-next-mission", target: "EXERCISED_LIVE", step: "enable the resident driver so odg-native-mission-continuation picks the next mission without a provider", gating: "OWNER_GATED (resident driver / systemd)" },
  { capability: "improve-methods", target: "EXERCISED_LIVE", step: "run odg-self-improvement-cycle against the real repo", gating: "OWNER_GATED (OWNER_DECISION_ONLY)" },
];

let measuredRef: any = null;
try { measuredRef = { ref: REF, sha: git(["rev-parse", REF]).trim() }; } catch { measuredRef = { ref: REF, sha: null }; }

const report = M.buildReport({
  now: NOW, measuredRef, arcFromPr: 870,
  attempts, auditChain: Array.isArray(auditChain) ? auditChain : null, ledger,
  commits: readCommits(), evidence, proposalSources, supervisorSnapshot, recoveryExperiments, providerInvokedDecisions,
  capabilitySpecs, componentFacts, liveOk, progressionSteps,
});
const out = { ...report, reproduce: "npx tsx runtime/bin/odg-native-autonomy-maturity-run.ts --state-root <main checkout> --now " + NOW + " --ref " + (measuredRef.sha || REF), stateRoot: path.relative(ROOT, STATE_ROOT) === "" ? "." : "<main checkout> (read-only)" };
if (!NO_WRITE) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n"); }
const c = report.counters;
process.stdout.write(JSON.stringify({
  nativeDecisions30d: c["1_nativeDecisions"].value, nativeExecutions30d: c["2_nativeExecutions"].dispatchedByOdgRunner, ledgerActorOdg30d: c["2_nativeExecutions"].ledgerActorOdg,
  providerCommits30d: c["3_providerDelegated"].last30d && c["3_providerDelegated"].last30d.providerAttributedCommits, providerPrs30d: c["3_providerDelegated"].last30d && c["3_providerDelegated"].last30d.providerDelegatedPrs,
  proposed: c["4_correctionsProposedByOdg"].value, builtByOdg: c["5_correctionsBuiltByOdg"].value, inspectionRounds: c["6_independentValidations"].recordedInspectionRounds,
  unattendedRecoveries: c["7_autonomousRecoveries"].unattendedLive, ladder: report.capabilityLadder.byLevel, artifact: NO_WRITE ? null : path.relative(ROOT, OUT),
}, null, 2) + "\n");
export {};
