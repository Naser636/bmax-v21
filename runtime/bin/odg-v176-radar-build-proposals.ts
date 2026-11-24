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
 *   npx tsx runtime/bin/odg-v176-radar-build-proposals.ts --convert-contracts
 *        RB-CONV-1 (owner record docs/odg/V176_OWNER_AUTHORIZATION_BUILD_MISSIONS.json): APPEND the top-N eligible drafts
 *        (ENGINE.CONVERSION_N, batch ENGINE.CONVERSION_BATCH) to V160_AP_WORK_ITEM_CONTRACTS.json as PROPOSED contracts
 *        (authorizedBy null; write_set ESTIMATE). Idempotent per batch; existing entries are never rewritten. Regenerate the
 *        register and this record afterwards (the converted ids then dedup as existing contracts).
 *
 * Freshness input (no wall clock): each source file's epoch, PINNED in the record (inputs[].epochMs) next to its sha256.
 * An input whose content (sha256) is unchanged since the committed record keeps its pinned epoch; only an input whose
 * content changed (or a new input) is re-dated from read-only local git — its last commit time
 * (`git log -1 --format=%ct -- <file>`), or, if it is uncommitted/dirty, the current commit's time (its content postdates
 * that commit). "now" = the newest of those epochs. Why pin instead of re-reading git on --check: the record is usually
 * committed TOGETHER with its regenerated inputs, so their commit time only exists after the commit — re-deriving it made
 * --check drift on every following merge while no input byte had changed. Pinning keeps the record a function of its
 * inputs' CONTENT (any content change still re-dates and drifts), and freshness stays honest: every age is relative to
 * the stated instant freshness.nowEpochMs, with each source's epoch stated beside its hash.
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

/** pinned { source → {sha256, epochMs} } from a previously written record (absent/unparseable ⇒ none pinned). */
function pinnedInputsOf(rec: any): any {
  const out: any = {};
  for (const i of (rec && Array.isArray(rec.inputs) ? rec.inputs : [])) if (i && typeof i.source === "string" && Object.prototype.hasOwnProperty.call(i, "epochMs")) out[i.source] = i;
  return out;
}

/** git-derived epoch of a source: last commit time when clean; the current commit's time when dirty/untracked; undefined without git. */
function gitEpochOf(root: string, rel: string): number | undefined {
  const git = (args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    const dirty = git(["status", "--porcelain", "--", rel]) !== "";
    const s = dirty ? git(["log", "-1", "--format=%ct"]) : git(["log", "-1", "--format=%ct", "--", rel]);
    return s ? Number(s) * 1000 : undefined;
  } catch { return undefined; }
}

/** resolve each input's epoch (pure given derive): reuse the pinned epoch iff the content hash is unchanged, else derive. */
function resolveEpochs(inputs: any[], pinned: any, derive: (rel: string) => number | undefined): any {
  const epochs: any = {};
  for (const i of inputs) {
    if (i.sha256 === null) continue;
    const p = pinned[i.source];
    const e = p && p.sha256 === i.sha256 ? (p.epochMs === null ? undefined : p.epochMs) : derive(i.source);
    i.epochMs = e === undefined ? null : e;
    if (e !== undefined) epochs[i.source] = e;
  }
  return epochs;
}

function readPinned(root: string): any {
  try { return pinnedInputsOf(JSON.parse(fs.readFileSync(path.join(root, OUT_REL), "utf8"))); } catch { return {}; }
}

function loadSources(root: string, pinned: any = readPinned(root), derive: (rel: string) => number | undefined = (rel) => gitEpochOf(root, rel)): any {
  const inputs: any[] = [];
  const read = (rel: string): any => {
    let txt: string; try { txt = fs.readFileSync(path.join(root, rel), "utf8"); } catch { inputs.push({ source: rel, sha256: null, note: "ABSENT" }); return null; }
    inputs.push({ source: rel, sha256: sha256(txt) });
    return { path: rel, data: JSON.parse(txt) };
  };
  const src: any = {};
  for (const k of ["register", "contracts", "outcome", "production", "precedence", "nb1Validation", "nativeBuild"]) src[k] = read((DECLARED as any)[k]);
  const names = fs.readdirSync(path.join(root, EV)).sort();
  const latest = REG.latestCheckpointOf(names.filter((f: string) => /_CHECKPOINT_\d+\.json$/.test(f)));
  src.checkpoint = latest ? read(`${EV}/${latest}`) : null;
  src.externalRadar = DECLARED.externalRadar.map(read).filter(Boolean);
  src.testReports = names.filter((f: string) => TEST_REPORT_RE.test(f)).map((f: string) => read(`${EV}/${f}`)).filter(Boolean);
  const epochs = resolveEpochs(inputs, pinned, derive);
  return { src, inputs, epochs };
}

function compute(root: string, pinned?: any): any {
  const { src, inputs, epochs } = loadSources(root, pinned === undefined ? readPinned(root) : pinned);
  const graph = CIG.buildGraph(root);
  const rec = GP.loadRecord(root);
  const nowEpochMs = Math.max(0, ...Object.values(epochs).map(Number));
  const result = ENGINE.buildProposals(src, { graph, nowEpochMs, sourceEpochMs: epochs, classifyPath: (p: string) => GP.classifyPath(rec, p), artifactExists: (p: string) => fs.existsSync(path.join(root, p)) });
  return {
    "//": "V17.6 — Radar → construction (owner CTO directive V176 §4): internal improvement signals detected from COMMITTED evidence → analysed against existing components (change-impact-graph multiplier) → gated + deduplicated by odg-radar-to-mission-loop (ODG_INTERNAL) → ranked by mission-priority-selector with the register's weights → PROPOSED WORK_ITEM_CONTRACT drafts for the top proposals. PROPOSAL record: nothing authorized, nothing executed, no network. Recompute: npx tsx runtime/bin/odg-v176-radar-build-proposals.ts --check",
    schema: ENGINE.SCHEMA,
    governance: {
      directive: "owner CTO directive V176 2026-11-24 §4 « LE RADAR DEVIENT UN MOTEUR DE CONSTRUCTION » + §6 « aucun changement substantiel des autorités ou permissions canoniques »",
      anchor: "V12.4 I CM-RADAR-GATE-CHAIN / V14.4 phase 1 (RADAR-1 of docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json, resolved V176: Q-CTR2 answered STAGE by PREC-1; NOT a V15.0-campaign item)",
      radarStageChange: "runtime/core/odg-radar-to-mission-loop.ts: additive ODG_INTERNAL scope (component attachment, internal qualification tier, owner_decision gate kind, opts.seenKeys) — collection, governor, transport, allowlists and grants unchanged",
      egress: "NONE — no live collection; external observations are read from committed, already-ADMITTED Radar evidence",
    },
    rules: ENGINE.RADAR_BUILD_ENGINE_CONTRACT.rules,
    invariants: ENGINE.RADAR_BUILD_ENGINE_CONTRACT.invariants,
    freshness: { nowEpochMs, rule: "now = newest source epoch (no wall clock); each source's epoch is pinned in inputs[].epochMs and re-dated from local git (last commit time; current commit time if uncommitted) only when its sha256 changes; a signal whose source is older than odg-radar-to-mission-loop.FRESHNESS_DAYS is refused EXPIRED" },
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

/** RB-CONV-1 — compute the conversion against the CURRENT sources (pure engine call) and return the new contracts text. */
function convert(root: string, opts?: any): any {
  const rec = compute(root);
  const text = JSON.stringify(rec, null, 2) + "\n";
  const cRel = (DECLARED as any).contracts;
  const contracts = JSON.parse(fs.readFileSync(path.join(root, cRel), "utf8"));
  let regIds: string[] = [];
  try { const r = JSON.parse(fs.readFileSync(path.join(root, (DECLARED as any).register), "utf8")); regIds = (r.register && Array.isArray(r.register.items) ? r.register.items : []).map((it: any) => String(it.id)); } catch { regIds = []; }
  const asOf = (() => { try { return execFileSync("git", ["-C", root, "rev-parse", "--short=8", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } })();
  const res = ENGINE.convertToContracts(rec, contracts, Object.assign({ registerItemIds: regIds, sourceRecord: OUT_REL, sourceRecordSha256: sha256(text), asOf: asOf ? `base ${asOf} (V17.6 R2C)` : null }, opts || {}));
  return { res, contractsRel: cRel, contractsText: JSON.stringify(res.data, null, 2) + "\n" };
}

function main(argv: string[]): number {
  if (argv.includes("--convert-contracts")) {
    const { res, contractsRel, contractsText } = convert(ROOT);
    if (res.status === "CONVERTED") fs.writeFileSync(path.join(ROOT, contractsRel), contractsText);
    process.stdout.write(JSON.stringify({ status: res.status, batch: res.batch, appended: res.appended.map((c: any) => c.scenario), skipped: res.skipped, cut: res.cut, notConvertedEligible: res.notConvertedEligible || [] }, null, 2) + "\n");
    return 0;
  }
  const text = render(ROOT);
  if (argv.includes("--check")) {
    let cur = ""; try { cur = fs.readFileSync(path.join(ROOT, OUT_REL), "utf8"); } catch { process.stderr.write(`MISSING ${OUT_REL}\n`); return 1; }
    if (cur !== text) { process.stderr.write(`DRIFT ${OUT_REL} — recompute with: npx tsx runtime/bin/odg-v176-radar-build-proposals.ts\n`); return 1; }
    process.stdout.write(`OK ${OUT_REL} reproducible\n`); return 0;
  }
  fs.writeFileSync(path.join(ROOT, OUT_REL), text);
  process.stdout.write(`wrote ${OUT_REL}\n`); return 0;
}

module.exports = { DECLARED, OUT_REL, loadSources, resolveEpochs, pinnedInputsOf, gitEpochOf, compute, render, convert, main };
if (require.main === module) process.exit(main(process.argv.slice(2)));
export {};
