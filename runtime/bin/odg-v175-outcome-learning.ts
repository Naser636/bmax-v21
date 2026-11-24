/**
 * V17.5 PRIORITY 4 — OUTCOME LEARNING record. READ-ONLY, offline.
 *
 *   npx tsx runtime/bin/odg-v175-outcome-learning.ts            write docs/odg/evidence/V175_OUTCOME_LEARNING.json
 *   npx tsx runtime/bin/odg-v175-outcome-learning.ts --check    recompute from the committed sources; exit 1 on any byte drift
 *
 * For each closed/graded item in odg-outcome-learning.CLOSED_MISSIONS it gathers, from committed evidence only:
 *   - the PREDICTION at selection time: the strategic register (docs/odg/evidence/V164_STRATEGIC_REGISTER.json) read from git
 *     history — the LATEST register version committed in an ancestor of the experiment's run head whose decision selected
 *     the item (REGISTER_SELECTED); if no such version exists the item was NOT_REGISTER_SELECTED and the register at the run
 *     head is used. The register at the run head is reported as well (selection drift).
 *   - the contract's pre-registered question / PASS rule / hypothesis (V160_AP_WORK_ITEM_CONTRACTS.json), checked to be the
 *     very contract the experiment ran under (odg-authorization-scope.contractSha256 == experiment.contractSha256).
 *   - the REALIZED grade: experiment outcome + the VALIDATE_CRITERIA grade when its record exists AND is bound to the
 *     experiment (odg-authorization-scope.experimentSha256); otherwise PENDING.
 *   - the dispatch: GO trace SELECT (strategic + actionable) and DISPATCHED events, when the run was GO-dispatched.
 * It then calls odg-outcome-learning.learnFromOutcomes (pure). Nothing is fed back into selection.
 *
 * HISTORY-DEPENDENT: reads `git log` / `git show <sha>:path` (read-only) ⇒ --check needs a full clone (CI uses fetch-depth 0).
 * The output carries no HEAD / time, so it is stable while the cited evidence is unchanged; it changes (legitimately) when a
 * new validation record lands (e.g. J2 VALIDATE_CRITERIA). No network, no model, no provider call, no git write.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const OL = require("../core/odg-outcome-learning.js");
const AS = require("../core/odg-authorization-scope.js");

const ROOT = path.resolve(__dirname, "..", "..");
const REG = "docs/odg/evidence/V164_STRATEGIC_REGISTER.json";
const CONTRACTS = "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json";
const OUT = "docs/odg/evidence/V175_OUTCOME_LEARNING.json";

function git(root: string, args: string[]): string { return String(execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })); }
function readJson(root: string, rel: string): any { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); }
function exists(root: string, rel: string): boolean { return fs.existsSync(path.join(root, rel)); }
function selectedId(dec: any): string | null { const s = dec && dec.selected; if (typeof s === "string") return s; if (s && typeof s.id === "string") return s.id; return null; }
function readTrace(root: string, rel: string): any[] { return fs.readFileSync(path.join(root, rel), "utf8").split("\n").filter((l: string) => l.trim()).map((l: string) => JSON.parse(l)); }

function registerSnapshot(root: string, sha: string, id: string): any {
  const reg = JSON.parse(git(root, ["show", `${sha}:${REG}`]));
  const dec = reg.decision || {};
  const ranking = Array.isArray(dec.ranking) ? dec.ranking : [];
  const ri = ranking.findIndex((r: any) => r.id === id);
  const item = (reg.register && Array.isArray(reg.register.items) ? reg.register.items : []).find((i: any) => i.id === id) || null;
  const dirs = (reg.selector && reg.selector.options && reg.selector.options.directions) || {};
  return { reg, dec, ri, rank: ri >= 0 ? ranking[ri] : null, rankN: ranking.length, item, dirs };
}

function gatherSelection(root: string, id: string, runHead: string): any {
  const commits = git(root, ["log", "--format=%H", runHead, "--", REG]).split("\n").filter(Boolean);
  if (!commits.length) return { basis: "NOT_MEASURED", source: `no ${REG} version in the ancestry of ${runHead}` };
  const head = registerSnapshot(root, commits[0], id);
  let selSha: string | null = null;
  for (const c of commits) { const s = registerSnapshot(root, c, id); if (selectedId(s.dec) === id) { selSha = c; break; } }
  const at = selSha ? registerSnapshot(root, selSha, id) : head;
  const crit: any = {};
  const ic = at.item && at.item.criteria ? at.item.criteria : {};
  for (const k of Object.keys(ic)) crit[k] = { status: ic[k].status, value: ic[k].value, rule: ic[k].rule, direction: at.dirs[k] || null };
  const sel = selSha || commits[0];
  return {
    basis: selSha ? "REGISTER_SELECTED" : "NOT_REGISTER_SELECTED",
    registerCommit: sel.slice(0, 12),
    decision: at.dec.decision || null,
    evidenceScore: at.rank ? at.rank.evidenceScore : null, uncertainty: at.rank ? at.rank.uncertainty : null, upperBound: at.rank ? at.rank.upperBound : null,
    rank: at.ri >= 0 ? at.ri + 1 : null, rankN: at.rankN,
    uncertaintyMax: at.dec.thresholds ? at.dec.thresholds.uncertaintyMax : null,
    criteria: crit,
    itemStatusAtSelection: at.item ? at.item.status : null,
    atRunHead: { commit: commits[0].slice(0, 12), decision: head.dec.decision || null, selected: selectedId(head.dec), itemEvidenceScore: head.rank ? head.rank.evidenceScore : null, itemUncertainty: head.rank ? head.rank.uncertainty : null, itemRank: head.ri >= 0 ? head.ri + 1 : null },
    source: [`git show ${sel.slice(0, 12)}:${REG}#decision.ranking[id=${id}]`, `git show ${sel.slice(0, 12)}:${REG}#register.items[id=${id}].criteria`, `git log ${runHead.slice(0, 12)} -- ${REG} (latest ancestor version selecting ${id}${selSha ? "" : ": none"})`],
    _headSnapshot: head,
  };
}

function gatherMission(root: string, m: any, contracts: any): any {
  const exp = readJson(root, m.experiment);
  const runHead = String((exp.run && exp.run.head) || "");
  const sel = gatherSelection(root, m.id, runHead);
  const ci = contracts.contracts.findIndex((c: any) => c.scenario === m.id);
  const c = ci >= 0 ? contracts.contracts[ci] : null;
  const w = c ? c.WORK_ITEM_CONTRACT : {};
  const pr = (w && w.preRegistration) || {};
  const hyp = pr.hypothesis && typeof pr.hypothesis === "object" ? pr.hypothesis : null;
  const parentId = c && c.parent ? c.parent.scenario : null;
  const head = sel._headSnapshot; delete sel._headSnapshot;
  const parentItem = parentId && head ? (head.reg.register.items || []).find((i: any) => i.id === parentId) : null;
  let validatedGrade: string | null = null, validationBound = false, lesson: string | null = null; const rSrc = [`${m.experiment}#outcome`];
  if (exists(root, m.validation)) {
    const v = readJson(root, m.validation);
    validatedGrade = v.scenarioGrade || null; lesson = v.lesson || null;
    validationBound = !!(v.experimentEvidence && v.experimentEvidence.experimentSha256 === AS.experimentSha256(exp));
    rSrc.push(`${m.validation}#scenarioGrade`, `${m.validation}#experimentEvidence.experimentSha256`);
  } else rSrc.push(`${m.validation} ABSENT ⇒ VALIDATE_CRITERIA PENDING`);
  let dispatch: any = { by: "PROVIDER", note: `${m.experiment}#run has no GO dispatch (command run by the provider session)`, source: [`${m.experiment}#run`] };
  if (m.trace && exists(root, m.trace)) {
    const t = readTrace(root, m.trace);
    const s = t.find((x: any) => x.kind === "STEP" && x.step === "SELECT");
    const d = t.find((x: any) => x.kind === "DISPATCHED");
    const sd = s ? s.decision : {};
    const act = sd.actionableSelection || {};
    dispatch = { by: d ? "ODG_GO" : "PROVIDER", runId: d ? d.runId : null, goStrategicDecision: sd.decision || null, goStrategic: selectedId(sd), goActionable: act.proceedingWith || null, actionableResolvedBy: act.resolvedBy || null, dispatched: d ? d.mission : null,
      ownerRecord: typeof act.resolvedBy === "string" ? (act.resolvedBy.match(/docs\/odg\/[A-Za-z0-9_]+\.json/) || [null])[0] : null,
      source: [`${m.trace}#STEP[SELECT].decision.{decision,selected,actionableSelection}`, `${m.trace}#DISPATCHED`] };
  }
  return {
    id: m.id, selection: sel,
    contract: { sha256: exp.contractSha256, bound: !!c && AS.contractSha256(c) === exp.contractSha256, question: pr.question || null, passRule: pr.thresholds ? pr.thresholds.PASS : null,
      hypothesis: hyp ? hyp.main || null : null, refutedIf: hyp ? hyp.refutedIf || null : null, parent: parentId, parentStatus: parentItem ? parentItem.status : null,
      source: [`${CONTRACTS}#contracts[${ci}].WORK_ITEM_CONTRACT.preRegistration`, ...(parentId ? [`git show ${sel.atRunHead.commit}:${REG}#register.items[id=${parentId}].status`] : [])] },
    realized: { experimentOutcome: exp.outcome || null, validatedGrade, validationBound, lesson, source: rSrc },
    dispatch,
  };
}

function build(root: string): string {
  const contracts = readJson(root, CONTRACTS);
  const missions = OL.CLOSED_MISSIONS.map((m: any) => gatherMission(root, m, contracts));
  const rec = OL.learnFromOutcomes(missions);
  const out = { "//": "V17.5 PRIORITY 4 — outcome learning: prediction at selection time vs realized grade for G, H, G2, J2. READ-ONLY report; NOT fed into scoring. Recompute: npx tsx runtime/bin/odg-v175-outcome-learning.ts --check", ...rec,
    sources: [REG + " (git history)", CONTRACTS, ...OL.CLOSED_MISSIONS.flatMap((m: any) => [m.experiment, m.validation, ...(m.trace ? [m.trace] : [])])] };
  return JSON.stringify(out, null, 2) + "\n";
}

function main(): void {
  const text = build(ROOT);
  if (process.argv.includes("--check")) {
    const cur = exists(ROOT, OUT) ? fs.readFileSync(path.join(ROOT, OUT), "utf8") : "";
    if (cur !== text) { process.stderr.write(`CHECK FAILED: ${OUT} differs from a fresh computation\n`); process.exit(1); }
    process.stdout.write(`CHECK OK ${OUT}\n`); return;
  }
  fs.writeFileSync(path.join(ROOT, OUT), text);
  process.stdout.write(`wrote ${OUT}\n`);
}

if (require.main === module) main();
module.exports = { build, gatherMission, gatherSelection };
export {};
