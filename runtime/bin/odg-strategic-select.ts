#!/usr/bin/env node
"use strict";

/*
 * V16.4 §3/§11 — ODG STRATEGIC SELECT. Loads the canonical sources, builds the strategic register
 * (core/odg-strategic-register), runs ODG's EXISTING selector through its explained entry point
 * (core/mission-priority-selector.selectNextExplained) and writes docs/odg/evidence/V164_STRATEGIC_REGISTER.json:
 * register + criteria rules + ranking + decision record (selected / tied / justification / uncertainty / inputs sha256 /
 * repo HEAD). `--check` recomputes from the committed sources and exits 1 on drift. The decision is a PROPOSAL record:
 * nothing is executed or authorized here. No network, no model, no provider call.
 *
 * Scenario pass criteria (V16.4 §10 B and C) are PRE-REGISTERED below (PRE_REGISTRATION) and were written before the
 * first run of this bin; the grading function applies them mechanically to the computed record.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const REG = require("../core/odg-strategic-register.js");
const SEL = require("../core/mission-priority-selector.js");
const OCUR = require("../core/odg-observation-currency.js");   // V16.9 Phase 1b — proof-currency probes (read-only local git)
const DEPG = require("../core/odg-register-dependency-graph.js");   // V17.5 — which committed files DEPG-1 needs
const { parseRequiresFromSource } = require("../../scripts/lib/js-require-scan");   // the canonical require parser (change-impact-graph composes it)

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_REL = "docs/odg/evidence/V164_STRATEGIC_REGISTER.json";
const CONTRACTS_REL = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const V150_REL = "docs/odg/evidence/V150_TRACEABILITY_MATRIX.json";
const CP8_REL = "docs/odg/evidence/V163_CHECKPOINT_8.json";
const CP8_REF = "origin/docs/v163-checkpoint-8";
const EVIDENCE_DIR_REL = "docs/odg/evidence";

const PRE_REGISTRATION = Object.freeze({
  writtenBefore: "the first execution of this bin (provider-authored; not edited after seeing results)",
  B: Object.freeze({
    scenario: "V16.4 §10 B — ODG determines importance and benefit",
    PASS: "b1 every criterion value of every register item is MEASURED with a rule id + ≥1 source pointer, or NOT_MEASURED with a rule id + reason; b2 no NOT_MEASURED value contributes to any evidence score (its weight goes to uncertainty); b3 every item status has ≥1 source pointer; b4 mean measured-weight share over the SELECTABLE ranked candidates ≥ 0.5",
    PARTIAL: "b1–b3 hold but b4 fails (importance/benefit mostly unmeasured)",
    FAIL: "any of b1–b3 violated",
  }),
  C: Object.freeze({
    scenario: "V16.4 §10 C — ODG selects a relevant mission",
    PASS: "c1 the record is reproducible (two computations byte-identical; --check recomputes it from the committed sources); c2 not id-ordered: shuffling candidate order AND relabelling ids (reverse order) leaves the decision on the same underlying item; c3 any tie/uncertainty is explained (tiedSet + explanation, and proposedResolutionRule when no declared rule resolves); c4 no requiresOwnerAuthorization item is selected; c5 decision is SELECTED or TIE_EXPLAINED (a resolved proposal) on an item whose status is selectable",
    PARTIAL: "c1–c4 hold but c5 fails (decision DECISION_REQUIRED / NO_ELIGIBLE: ODG explained why it cannot choose)",
    FAIL: "any of c1–c4 violated",
  }),
});

function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

/* loadSources(root) — reads the canonical files; CP8 from the repo file if present, else from the CP8 branch via git show. */
function loadSources(root: string): any {
  const inputs: any[] = [];
  const read = (rel: string) => { const txt = fs.readFileSync(path.join(root, rel), "utf8"); inputs.push({ source: rel, sha256: sha256(txt) }); return { path: rel, data: JSON.parse(txt) }; };
  const contracts = read(CONTRACTS_REL);
  const v150 = read(V150_REL);
  let cp8: any = null;
  if (fs.existsSync(path.join(root, CP8_REL))) cp8 = read(CP8_REL);
  else {
    try {
      const txt = execFileSync("git", ["-C", root, "show", `${CP8_REF}:${CP8_REL}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      inputs.push({ source: `git:${CP8_REF}:${CP8_REL}`, sha256: sha256(txt) });
      cp8 = { path: `git:${CP8_REF}:${CP8_REL}`, data: JSON.parse(txt) };
    } catch { inputs.push({ source: `git:${CP8_REF}:${CP8_REL}`, sha256: null, note: "UNAVAILABLE — CP8-derived fields absent" }); }
  }
  const scenarioEvidence: any[] = [];
  for (const f of fs.readdirSync(path.join(root, EVIDENCE_DIR_REL)).filter((f: string) => /_SCENARIO_[A-P][_.]/.test(f) && f.endsWith(".json")).sort()) {
    const rel = `${EVIDENCE_DIR_REL}/${f}`;
    let data: any;
    try { data = JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { continue; }
    if (!REG.scenarioLetter(data)) continue;
    inputs.push({ source: rel, sha256: sha256(fs.readFileSync(path.join(root, rel), "utf8")) });
    scenarioEvidence.push({ path: rel, data });
  }
  // LAND-1 inputs: merged V164+ evidence files (not this register's own output) carrying a top-level gapRef.
  const laterEvidence: any[] = [];
  for (const f of fs.readdirSync(path.join(root, EVIDENCE_DIR_REL)).filter((f: string) => /^V(16[4-9]|1[7-9]\d)_.*\.json$/.test(f)).sort()) {
    const rel = `${EVIDENCE_DIR_REL}/${f}`;
    if (rel === OUT_REL) continue;
    let txt: string, data: any;
    try { txt = fs.readFileSync(path.join(root, rel), "utf8"); data = JSON.parse(txt); } catch { continue; }
    if (!data || typeof data.gapRef !== "string") continue;
    inputs.push({ source: rel, sha256: sha256(txt) });
    laterEvidence.push({ path: rel, data: { gapRef: data.gapRef } });
  }
  // V16.9 Phase 1 — LCP-1: every committed checkpoint, the latest discovered by number (not hard-coded).
  const evFiles: string[] = fs.readdirSync(path.join(root, EVIDENCE_DIR_REL)).sort();
  const checkpointNames = evFiles.filter((f: string) => /_CHECKPOINT_\d+\.json$/.test(f));
  const latestCheckpoint = REG.latestCheckpointOf(checkpointNames);
  const checkpoints: any[] = [];
  for (const f of checkpointNames.filter((f: string) => REG.cpNumber(f) > REG.cpNumber(CP8_REL)).sort((a: string, b: string) => REG.cpNumber(a) - REG.cpNumber(b))) {
    const rel = `${EVIDENCE_DIR_REL}/${f}`;
    let txt: string, data: any;
    try { txt = fs.readFileSync(path.join(root, rel), "utf8"); data = JSON.parse(txt); } catch { continue; }
    inputs.push({ source: rel, sha256: sha256(txt) });
    checkpoints.push({ path: rel, data: { prs: Array.isArray(data.prs) ? data.prs : [], ...Object.fromEntries(Object.keys(data).filter((k) => /^mission[A-P]$/.test(k)).map((k) => [k, data[k]])) } });
  }
  // CLOSE-1 inputs: per scenario X, the committed V<n>_X_CONTRACT_INSPECTION / _EXPERIMENT / _CRITERIA_VALIDATION records
  // (highest V<n> when several) — the records odg-authorization-scope R3/R4/R5b bind to the contract.
  // V16.9 Phase 1b — R7 / RES-1 proof-currency probes (read-only local git + file hashes of THIS root), injected here.
  const proofProbes = OCUR.localGitProbes(root);
  const authorizationEvidence: any = {};
  const KINDS: any = { inspection: "CONTRACT_INSPECTION", experiment: "EXPERIMENT", validation: "CRITERIA_VALIDATION" };
  for (const x of contracts.data.contracts) {
    if (!x || typeof x.authorization !== "object" || x.authorization === null) continue;
    const L = String(x.scenario);
    const ev: any = {};
    for (const [k, suffix] of Object.entries(KINDS) as any) {
      const re = new RegExp(`^V(\\d+)_${L}_${suffix}\\.json$`);
      const cand = evFiles.filter((f: string) => re.test(f)).sort((a: string, b: string) => Number(re.exec(a)![1]) - Number(re.exec(b)![1]));
      if (!cand.length) { ev[k] = null; continue; }
      const rel = `${EVIDENCE_DIR_REL}/${cand[cand.length - 1]}`;
      try { const txt = fs.readFileSync(path.join(root, rel), "utf8"); inputs.push({ source: rel, sha256: sha256(txt) }); ev[k] = { ...JSON.parse(txt), recordPath: rel }; } catch { ev[k] = null; }
    }
    authorizationEvidence[L] = ev;
  }
  // RES-1 inputs: committed evidence files carrying a top-level resolvesRegisterItem.
  const resolutionEvidence: any[] = [];
  for (const f of evFiles.filter((f: string) => f.endsWith(".json"))) {
    const rel = `${EVIDENCE_DIR_REL}/${f}`;
    if (rel === OUT_REL) continue;
    let txt: string, data: any;
    try { txt = fs.readFileSync(path.join(root, rel), "utf8"); if (!txt.includes('"resolvesRegisterItem"')) continue; data = JSON.parse(txt); } catch { continue; }
    if (!data || typeof data.resolvesRegisterItem !== "string") continue;
    inputs.push({ source: rel, sha256: sha256(txt) });
    resolutionEvidence.push({ path: rel, data: { resolvesRegisterItem: data.resolvesRegisterItem, date: data.date, resolution: data.resolution, fixedBy: data.fixedBy, reproTests: data.reproTests, inspection: data.inspection } });
  }
  // BLK-2 / REL-2 / DEP-2 inputs: the declared CP8-or-later benefit evidence files (CP8 itself is already loaded above).
  const benefitEvidence: any[] = [];
  const benefitFiles = Array.from(new Set(REG.BLOCKER_FIELDS.concat(REG.PR_RECORD_FIELDS).map((b: any) => b.file).concat(latestCheckpoint ? [latestCheckpoint] : []))).filter((f: any) => f !== path.basename(CP8_REL)).sort() as string[];
  for (const f of benefitFiles) {
    const rel = `${EVIDENCE_DIR_REL}/${f}`;
    let txt: string;
    try { txt = fs.readFileSync(path.join(root, rel), "utf8"); } catch { inputs.push({ source: rel, sha256: null, note: "UNAVAILABLE — BLK-2/REL-2/DEP-2 records from it absent" }); continue; }
    inputs.push({ source: rel, sha256: sha256(txt) });
    benefitEvidence.push({ path: rel, data: JSON.parse(txt) });
  }
  // V17.5 DEPG-1 inputs: existence + sha256 of every declared dataset file / write_set file, and the relative requires of
  // every committed .ts/.js write_set file (canonical parser), resolved to repo paths. Committed tree only; no register,
  // selector or GO output is read (NO-CIRCULARITY).
  const dependencyEvidence = loadDependencyEvidence(root, contracts, inputs);
  const seen = new Set<string>();
  const uniqInputs = inputs.filter((i: any) => (seen.has(i.source) ? false : (seen.add(i.source), true)));
  inputs.length = 0; inputs.push(...uniqInputs);
  return { contracts, v150, cp8, scenarioEvidence, laterEvidence, benefitEvidence, checkpointNames, checkpoints, authorizationEvidence, resolutionEvidence, proofProbes, dependencyEvidence, inputs };
}

/* loadDependencyEvidence(root, contracts, inputs) — DEPG-1 file facts { files:{path:{exists, sha256}}, requires:{path:[{specifier, resolved}]} }. */
function loadDependencyEvidence(root: string, contracts: any, inputs: any[]): any {
  const req = DEPG.dependencyEvidenceRequest(contracts);
  const files: any = {}, requires: any = {};
  const isFile = (rel: string) => { try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; } };
  const fact = (rel: string) => { if (files[rel]) return files[rel]; if (rel === OUT_REL || !isFile(rel)) return (files[rel] = { exists: false, sha256: null }); return (files[rel] = { exists: true, sha256: sha256(fs.readFileSync(path.join(root, rel), "utf8")) }); };
  for (const rel of req.stat) fact(rel);
  for (const rel of req.parse) {
    if (!files[rel] || !files[rel].exists) continue;
    const txt = fs.readFileSync(path.join(root, rel), "utf8");
    inputs.push({ source: rel, sha256: sha256(txt) });
    const out: any[] = [];
    for (const spec of parseRequiresFromSource(txt).literal.slice().sort()) {
      if (!/^\.\.?\//.test(spec)) continue;
      const j = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      const cands = /\.js$/.test(j) ? [j, j.replace(/\.js$/, ".ts")] : /\.ts$/.test(j) ? [j] : [j + ".ts", j + ".js", j];
      const hit = cands.find((c) => !c.startsWith("..") && isFile(c));
      if (!hit) continue;
      fact(hit);
      out.push({ specifier: spec, resolved: hit });
    }
    requires[rel] = out;
  }
  return { files, requires, request: req };
}

const SELECTOR_OPTIONS = Object.freeze({ weights: REG.WEIGHTS, directions: REG.DIRECTIONS });

function decide(register: any): any { return SEL.selectNextExplained(REG.toSelectorCandidates(register), SELECTOR_OPTIONS); }
function underlyingChoice(d: any): string | null { return d.selected ? d.selected.id : d.proposed ? d.proposed.id : null; }

/* invariance probe for c2: shuffle + relabel ids in reverse order; the decision must land on the same item. */
function idInvariance(register: any, base: any): any {
  const cands = REG.toSelectorCandidates(register);
  const ids = cands.map((c: any) => c.id).sort();
  const relabel: any = {}; ids.forEach((id: string, i: number) => { relabel[id] = "Z" + String(ids.length - i).padStart(3, "0"); });
  const back: any = Object.fromEntries(Object.entries(relabel).map(([a, b]) => [b, a]));
  const moved = cands.map((c: any) => ({ ...c, id: relabel[c.id], deps: c.deps.map((d: string) => relabel[d] || d) })).reverse();
  const d2 = SEL.selectNextExplained(moved, SELECTOR_OPTIONS);
  const c2 = underlyingChoice(d2);
  const sameTied = JSON.stringify((d2.tiedSet || []).map((x: string) => back[x]).sort()) === JSON.stringify((base.tiedSet || []).slice().sort());
  return { decisionUnderRelabel: d2.decision, choiceUnderRelabel: c2 ? back[c2] : null, sameDecision: d2.decision === base.decision && (c2 ? back[c2] : null) === underlyingChoice(base), sameTiedSet: sameTied };
}

function sensitivity(register: any): any[] {
  const cands = REG.toSelectorCandidates(register);
  return [{ epsilon: 0.02, uncertaintyMax: 0.4 }, { epsilon: 0.05, uncertaintyMax: 0.5 }, { epsilon: 0.0001, uncertaintyMax: 0.5 }].map((t) => {
    const d = SEL.selectNextExplained(cands, { ...SELECTOR_OPTIONS, ...t });
    return { ...t, decision: d.decision, choice: underlyingChoice(d), tiedSet: d.tiedSet || [] };
  });
}

function grade(register: any, decision: any, reproducible: boolean, inv: any): any {
  const items = register.items;
  const b1 = items.every((it: any) => Object.values(it.criteria).every((c: any) => c.status === "MEASURED" ? (typeof c.rule === "string" && Array.isArray(c.source) && c.source.length > 0 && typeof c.value === "number") : (c.status === "NOT_MEASURED" && c.value === null && typeof c.rule === "string" && typeof c.reason === "string")));
  const b2 = decision.ranking.every((r: any) => r.breakdown.every((b: any) => b.status === "MEASURED" || (b.contribution === 0 && b.uncertaintyContribution === b.weight)));
  const b3 = items.every((it: any) => Array.isArray(it.statusSource) && it.statusSource.length > 0);
  const sel = decision.ranking.filter((r: any) => r.autoSelectable);
  const meanShare = sel.length ? Number((sel.reduce((s: number, r: any) => s + r.measuredWeightShare, 0) / sel.length).toFixed(4)) : 0;
  const b4 = meanShare >= 0.5;
  const B = !(b1 && b2 && b3) ? "FAIL" : b4 ? "PASS" : "PARTIAL";
  const c1 = reproducible;
  const c2 = inv.sameDecision && inv.sameTiedSet;
  const c3 = decision.decision === "SELECTED" ? true : decision.decision === "TIE_EXPLAINED" ? (Array.isArray(decision.tiedSet) && decision.tiedSet.length > 1 && typeof decision.tieExplanation === "string" && !!decision.resolvedBy) : decision.decision === "DECISION_REQUIRED" ? typeof decision.proposedResolutionRule === "string" && (typeof decision.tieExplanation === "string" || typeof decision.uncertaintyExplanation === "string") : decision.decision === "NO_ELIGIBLE";
  const chosen = decision.selected ? items.find((it: any) => it.id === decision.selected.id) : null;
  const c4 = !chosen || chosen.requiresOwnerAuthorization !== true;
  const c5 = (decision.decision === "SELECTED" || decision.decision === "TIE_EXPLAINED") && !!chosen && !Object.prototype.hasOwnProperty.call(SEL.EXPLAINED_DEFAULTS.nonSelectableStatuses, chosen.status);
  const C = !(c1 && c2 && c3 && c4) ? "FAIL" : c5 ? "PASS" : "PARTIAL";
  return {
    B: { grade: B, checks: { b1, b2, b3, b4 }, meanMeasuredWeightShareOverSelectable: meanShare },
    C: { grade: C, checks: { c1, c2, c3, c4, c5 }, idInvariance: inv },
  };
}

function gitHead(root: string): string | null { try { return execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; } }

/* compute(sources) — the deterministic part of the record (everything --check compares). */
function compute(sources: any): any {
  const register = REG.buildRegister(sources);
  const decision = decide(register);
  const again = JSON.stringify(decide(REG.buildRegister(sources))) === JSON.stringify(decision);
  const inv = idInvariance(register, decision);
  const chosenId = underlyingChoice(decision);
  const chosen = chosenId ? register.items.find((it: any) => it.id === chosenId) : null;
  return {
    "//": "V16.4 §3/§11 — ODG strategic register + explained selection. PROPOSAL record: the selected item still needs PROPOSED → AUTHORIZED before EXECUTING; nothing was executed. Rules, weights and thresholds were written by the technical provider (Claude Code) and are declared below; ODG's components (odg-strategic-register + mission-priority-selector.selectNextExplained) applied them.",
    schema: "ODG_V164_STRATEGIC_REGISTER/1",
    preRegistration: PRE_REGISTRATION,
    inputs: sources.inputs,
    register,
    selector: { component: "runtime/core/mission-priority-selector.ts selectNextExplained (selectNext unchanged)", options: { weights: SELECTOR_OPTIONS.weights, directions: SELECTOR_OPTIONS.directions, ...SEL.EXPLAINED_DEFAULTS }, contract: SEL.STRATEGIC_SELECTION_CONTRACT },
    decision,
    decisionRecord: {
      decision: decision.decision,
      selected: decision.selected ? decision.selected.id : null,
      proposed: decision.proposed ? decision.proposed.id : null,
      tiedSet: decision.tiedSet || [],
      resolvedBy: decision.resolvedBy || null,
      justification: decision.justification,
      uncertainty: decision.selected ? decision.selected.uncertainty : decision.proposed ? decision.proposed.uncertainty : null,
      choiceNextStep: chosen ? chosen.nextStep : null,
      ownerAuthorizationRequired: decision.ownerAuthorizationRequired.map((x: any) => x.id),
      authorizationState: "PROPOSAL — not authorized, not executed",
    },
    sensitivity: sensitivity(register),
    grading: grade(register, decision, again, inv),
    honestLimits: [
      "criterion rules, equal weights, epsilon 0.02 and uncertaintyMax 0.5 were written by the provider, not derived from a canonical owner source — ODG applies them; the owner may replace them",
      "4 of 10 criteria (blocker/repetition reduction, reliability/quality, speed/efficiency, reusability) are NOT_MEASURED for every non-capability-gap item: no evidence field supports them; they enter only as uncertainty",
      "strategicValue and capabilityGain come from V150 summary.top10NextInternal, itself a provider research ranking (V150 meta.generator) made before F/G/J were executed",
      "CP8 is read from main (merged #926); the fallback to origin/docs/v163-checkpoint-8 applies only when it is absent; its sha256 is in inputs, so a CP8 change is detected as drift",
      "owner-authorization flags of CP8_CAPABILITY_GAP items encode the CP8 (pre-V165) state; the owner authorizations of directive V165 (docs/odg/V165_OWNER_AUTHORIZATION.json) are NOT reflected in those flags; contract states ARE read live (e.g. G AUTHORIZED per V165 §1)",
      "V17.5 DEPG-1: item→item dependency edges are now derived from explicit committed evidence (contract preRegistration.dataset files that are another item's declared output, relative requires of committed write_set files into another item's write_set, the existing 'scenario X' statements); see register.dependencyGraph (edges, fanOut, contention). Only WORK_ITEM_CONTRACT items declare inputs, so every other kind is NOT_MEASURED for edges; deps[] holds only UNSATISFIED edges (the selector gate defers on them), so R1 discriminates only when some item is still blocked on another — with every derived edge satisfied, R1 still has nothing to count; contract.parent lineage and shared inputs no item produces are not dependencies",
      "the leaders' uncertainty (0.5) sits exactly AT uncertaintyMax (0.5, strict '>'): with uncertaintyMax 0.4 the same record is DECISION_REQUIRED (see sensitivity) — the selection is not robust to that provider-chosen threshold",
      "CP8_CAPABILITY_GAP items (ODG's own capability gaps): V16.7 adds BLK-2 (attributed blocker records in CP8-or-later evidence), REL-2 (counted inspection REJECTs in PR records the gap cites) and DEP-2 (linked owner question still open in the latest checkpoint); a gap with no attributed record keeps NOT_MEASURED. AUT/CAP/STR/SPD/REU/CRC stay NOT_MEASURED for every gap, so the best-measured gap still carries uncertainty ≥ 0.7 > uncertaintyMax 0.5 and none can be the choice; the GAP_LINKS dedupe table, the blocker anchors (constrained to the gap's own CP8 text), the declared record fields and OWN-2 were written by the provider; no authorization was created or inferred",
      "if G is the choice: CP8 records that one of G's acceptance criteria (admissible() true for a SUPPORTED item) cannot be met as worded — its next step needs a contract-criterion revision, which requires authorization like any contract change",
      "V16.9 Phase 1: CLOSE-1 derives CLOSED_<grade> from the committed criteria-validation records through odg-authorization-scope (G ⇒ CLOSED_PARTIAL, H ⇒ CLOSED_FAIL; earlier statuses kept in statusHistory); RES-1 marks CP8-GAP-canonicalDefectsJ RESOLVED_BY_EVIDENCE from a provider-written resolution record (V169_J_CANONICAL_DEFECTS_FIX.json) transcribing #940 — that record was not independently inspected; CLOSED_*/RESOLVED_BY_EVIDENCE are non-selectable (mission-priority-selector defaults). With G no longer selectable the earlier J/G DECISION_REQUIRED becomes SELECTED J by 0.025 over F (epsilon 0.02; J's uncertainty 0.5 sits AT uncertaintyMax): not robust — see sensitivity",
      "V16.9 Phase 1: the latest checkpoint is discovered by number (LCP-1 ⇒ V168_CHECKPOINT_10.json); CP10 has no ownerQuestions field, so DEP-2 finds no re-listed owner question: CP8-GAP-4-authorizeProvider dependencyAvailability moves 0 → NOT_MEASURED (the other owner-question-linked gaps were already NOT_MEASURED under CP9); CP10.ownerDecisions (which still lists 'provider spend ceiling') is not read — the rule was not widened; contradictions (CTR-1..3) are reported in register.contradictions and never auto-resolved; the declared BLOCKER_FIELDS / PR_RECORD_FIELDS still stop at CP9 (CTR-3, reported, not extended)",
    ],
  };
}

function main(argv: string[]): number {
  const root = (() => { const i = argv.indexOf("--root"); return i >= 0 ? path.resolve(argv[i + 1]) : ROOT; })();
  const out = (() => { const i = argv.indexOf("--out"); return i >= 0 ? path.resolve(argv[i + 1]) : path.join(root, OUT_REL); })();
  const sources = loadSources(root);
  const rec = compute(sources);
  if (argv.includes("--check")) {
    let committed: any;
    try { committed = JSON.parse(fs.readFileSync(out, "utf8")); } catch (e: any) { process.stderr.write(`--check: cannot read ${out}: ${e.message}\n`); return 1; }
    const { generatedAtHead, ...rest } = committed;
    const a = JSON.stringify(rest), b = JSON.stringify(JSON.parse(JSON.stringify(rec)));
    if (a !== b) {
      const drift = Object.keys(rec).filter((k) => JSON.stringify(rest[k]) !== JSON.stringify((rec as any)[k]));
      process.stderr.write(`--check: DRIFT in [${drift.join(", ")}] — recompute differs from ${path.relative(root, out)}\n`);
      return 1;
    }
    process.stdout.write(`--check: OK (no drift) decision=${rec.decisionRecord.decision} selected=${rec.decisionRecord.selected} proposed=${rec.decisionRecord.proposed}\n`);
    return 0;
  }
  fs.writeFileSync(out, JSON.stringify({ ...rec, generatedAtHead: gitHead(root) }, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ out: path.relative(root, out), items: rec.register.itemCount, statusCounts: rec.register.statusCounts, decision: rec.decisionRecord, B: rec.grading.B.grade, C: rec.grading.C.grade }, null, 2) + "\n");
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { loadSources, compute, grade, idInvariance, main, PRE_REGISTRATION, OUT_REL };
export {};
