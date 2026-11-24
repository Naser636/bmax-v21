#!/usr/bin/env node
"use strict";
/*
 * V17.6 — RADAR BUILD PROPOSALS (owner CTO directive V176 2026-11-24 §4). Reads COMMITTED evidence only (no network, no
 * live collection, no model, no provider call), runs runtime/core/odg-radar-build-engine.buildProposals and writes
 * docs/odg/evidence/V176_RADAR_BUILD_PROPOSALS.json. The record is a PROPOSAL input: every contract draft is PROPOSED with
 * authorizedBy null; nothing is authorized or executed here.
 *
 *   npx tsx runtime/bin/odg-v176-radar-build-proposals.ts            write the record
 *   npx tsx runtime/bin/odg-v176-radar-build-proposals.ts --check    recompute from the committed sources; exit 1 on byte drift
 *
 * Freshness input: each source file's last commit time (`git log -1 --format=%ct -- <file>`, read-only local git); "now" =
 * the newest of those epochs, so the record is a function of the committed tree (no wall clock).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const ENGINE = require("../core/odg-radar-build-engine.js");
const REG = require("../core/odg-strategic-register.js");
const CIG = require("../core/change-impact-graph.js");
const GP = require("../core/odg-governance-precedence.js");

const ROOT = path.resolve(__dirname, "..", "..");
const EV = "docs/odg/evidence";
const OUT_REL = `${EV}/V176_RADAR_BUILD_PROPOSALS.json`;
const DECLARED = Object.freeze({
  register: `${EV}/V164_STRATEGIC_REGISTER.json`,
  contracts: `${EV}/V160_AP_WORK_ITEM_CONTRACTS.json`,
  outcome: `${EV}/V175_OUTCOME_LEARNING.json`,
  production: `${EV}/V175_PRODUCTION_METRIC.json`,
  precedence: `${EV}/V175_GOVERNANCE_PRECEDENCE.json`,
  nb1Validation: `${EV}/V175_NB1_CRITERIA_VALIDATION.json`,
  nativeBuild: `${EV}/V175_NATIVE_BUILD_RESULT.json`,
  externalRadar: [`${EV}/CM-RADAR-GATE-CHAIN_STEP2_EVIDENCE.json`],
});
const TEST_REPORT_RE = /TEST_REPORT[^/]*\.json$/;
const sha256 = (s: string): string => crypto.createHash("sha256").update(s).digest("hex");

function loadSources(root: string): any {
  const inputs: any[] = [], epochs: any = {};
  const epochOf = (rel: string): number | undefined => {
    try { const s = execFileSync("git", ["-C", root, "log", "-1", "--format=%ct", "--", rel], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); return s ? Number(s) * 1000 : undefined; } catch { return undefined; }
  };
  const read = (rel: string): any => {
    let txt: string; try { txt = fs.readFileSync(path.join(root, rel), "utf8"); } catch { inputs.push({ source: rel, sha256: null, note: "ABSENT" }); return null; }
    inputs.push({ source: rel, sha256: sha256(txt) }); const e = epochOf(rel); if (e !== undefined) epochs[rel] = e;
    return { path: rel, data: JSON.parse(txt) };
  };
  const src: any = {};
  for (const k of ["register", "contracts", "outcome", "production", "precedence", "nb1Validation", "nativeBuild"]) src[k] = read((DECLARED as any)[k]);
  const names = fs.readdirSync(path.join(root, EV)).sort();
  const latest = REG.latestCheckpointOf(names.filter((f: string) => /_CHECKPOINT_\d+\.json$/.test(f)));
  src.checkpoint = latest ? read(`${EV}/${latest}`) : null;
  src.externalRadar = DECLARED.externalRadar.map(read).filter(Boolean);
  src.testReports = names.filter((f: string) => TEST_REPORT_RE.test(f)).map((f: string) => read(`${EV}/${f}`)).filter(Boolean);
  return { src, inputs, epochs };
}

function compute(root: string): any {
  const { src, inputs, epochs } = loadSources(root);
  const graph = CIG.buildGraph(root);
  const rec = GP.loadRecord(root);
  const nowEpochMs = Math.max(0, ...Object.values(epochs).map(Number));
  const result = ENGINE.buildProposals(src, { graph, nowEpochMs, sourceEpochMs: epochs, classifyPath: (p: string) => GP.classifyPath(rec, p) });
  return {
    "//": "V17.6 — Radar → construction (owner CTO directive V176 §4): internal improvement signals detected from COMMITTED evidence → analysed against existing components (change-impact-graph multiplier) → gated + deduplicated by odg-radar-to-mission-loop (ODG_INTERNAL) → ranked by mission-priority-selector with the register's weights → PROPOSED WORK_ITEM_CONTRACT drafts for the top proposals. PROPOSAL record: nothing authorized, nothing executed, no network. Recompute: npx tsx runtime/bin/odg-v176-radar-build-proposals.ts --check",
    schema: ENGINE.SCHEMA,
    governance: {
      directive: "owner CTO directive V176 2026-11-24 §4 « LE RADAR DEVIENT UN MOTEUR DE CONSTRUCTION » + §6 « aucun changement substantiel des autorités ou permissions canoniques »",
      anchor: "V12.4 I CM-RADAR-GATE-CHAIN / V14.4 phase 1 (RADAR-1 interim of docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json; NOT a V15.0-campaign item; Q-CTR2 open and untouched)",
      radarStageChange: "runtime/core/odg-radar-to-mission-loop.ts: additive ODG_INTERNAL scope (component attachment, internal qualification tier, owner_decision gate kind, opts.seenKeys) — collection, governor, transport, allowlists and grants unchanged",
      egress: "NONE — no live collection; external observations are read from committed, already-ADMITTED Radar evidence",
    },
    rules: ENGINE.RADAR_BUILD_ENGINE_CONTRACT.rules,
    invariants: ENGINE.RADAR_BUILD_ENGINE_CONTRACT.invariants,
    freshness: { nowEpochMs, rule: "now = newest last-commit epoch among the source files (no wall clock); a signal whose source is older than odg-radar-to-mission-loop.FRESHNESS_DAYS is refused EXPIRED" },
    inputs,
    ...result,
    honesty: [
      "every proposal is PROPOSED; authorizedBy null; owner-gated proposals cannot be selected automatically",
      "cost and benefit are NOT_MEASURED unless a committed record measures them; the multiplier is reach (dependents), not benefit",
      "write_set entries are ESTIMATES from a provider-declared table (LINK-1), to be confirmed in the authored contract",
      "outcome-learning findings stay HYPOTHESIS; admitted external facts keep their RETURN_TO_EXPERIMENT application verdict",
      "no committed failing/stale test report exists unless listed in inputs — test health is NOT_MEASURED here, not assumed green",
    ],
  };
}

function render(root: string): string { return JSON.stringify(compute(root), null, 2) + "\n"; }

function main(argv: string[]): number {
  const text = render(ROOT);
  if (argv.includes("--check")) {
    let cur = ""; try { cur = fs.readFileSync(path.join(ROOT, OUT_REL), "utf8"); } catch { process.stderr.write(`MISSING ${OUT_REL}\n`); return 1; }
    if (cur !== text) { process.stderr.write(`DRIFT ${OUT_REL} — recompute with: npx tsx runtime/bin/odg-v176-radar-build-proposals.ts\n`); return 1; }
    process.stdout.write(`OK ${OUT_REL} reproducible\n`); return 0;
  }
  fs.writeFileSync(path.join(ROOT, OUT_REL), text);
  process.stdout.write(`wrote ${OUT_REL}\n`); return 0;
}

module.exports = { DECLARED, OUT_REL, loadSources, compute, render, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
export {};
