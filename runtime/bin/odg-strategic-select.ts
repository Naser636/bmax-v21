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
  return { contracts, v150, cp8, scenarioEvidence, laterEvidence, inputs };
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
      "4 of 10 criteria (blocker/repetition reduction, reliability/quality, speed/efficiency, reusability) are NOT_MEASURED for every item: no evidence field supports them; they enter only as uncertainty",
      "strategicValue and capabilityGain come from V150 summary.top10NextInternal, itself a provider research ranking (V150 meta.generator) made before F/G/J were executed",
      "CP8 is read from the unmerged branch origin/docs/v163-checkpoint-8 when it is not on main; its sha256 is in inputs, so a CP8 change is detected as drift",
      "dependency edges between items: none are stated in the evidence, so R1 (unblocking) never discriminates",
      "the leaders' uncertainty (0.5) sits exactly AT uncertaintyMax (0.5, strict '>'): with uncertaintyMax 0.4 the same record is DECISION_REQUIRED (see sensitivity) — the selection is not robust to that provider-chosen threshold",
      "CP8_CAPABILITY_GAP items (ODG's own capability gaps): only evidenceLevel is derivable, every other criterion is NOT_MEASURED (uncertainty 0.9), so under uncertaintyMax 0.5 none can be the choice until benefit criteria are measured; the GAP_LINKS dedupe table and OWN-2 were written by the provider; no authorization was created or inferred",
      "if G is the choice: CP8 records that one of G's acceptance criteria (admissible() true for a SUPPORTED item) cannot be met as worded — its next step needs a contract-criterion revision, which requires authorization like any contract change",
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
