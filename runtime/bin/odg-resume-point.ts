#!/usr/bin/env node
"use strict";

/*
 * V17.5 PRIORITY 3 — ODG RESUME POINT (« Permettre une reprise immédiate sans reconstituer toute l'histoire »).
 * A deterministic, READ-ONLY VIEW over records that already exist — no new registry, no new state, no network:
 *   - the latest committed checkpoint (LCP-1: docs/odg/evidence/*_CHECKPOINT_<n>.json, highest n);
 *   - the committed strategic register (docs/odg/evidence/V164_STRATEGIC_REGISTER.json: statuses, CLOSE-1 closures,
 *     BREF-1 boussoleRef, CREF-1 contractRef, decision record);
 *   - the WORK_ITEM_CONTRACTs + the owner-scoped step state derived by the canonical odg-authorization-scope over the
 *     committed inspection / experiment / validation records (local-git R7 probes, offline);
 *   - the merged GO traces (docs/odg/evidence/*_GO_EXECUTE_TRACE.jsonl);
 *   - the open owner questions (V175_GOVERNANCE_PRECEDENCE.ownerQuestions with answer null) and the checkpoint's
 *     ownerDecisionsOpen;
 *   - an open-PR snapshot FILE passed in (--prs <file>; default: the committed frozen V175_PR_TIMELINE_SNAPSHOT.json).
 * Output: per tracked item its current step, last GO run, pending inspection/validation, the next action and who takes
 * it; the open owner questions; and the next GO action — so a new session resumes without reconstructing history.
 * `--check` recomputes from the committed files and exits 1 on drift (no network, no timestamps in the record).
 *
 * Honesty: the view rules (RSP-1..RSP-5 below) were written by the technical provider (Claude Code). They decide
 * nothing: no status, step, authorization, selection or score is created or changed here; a divergence between two
 * committed views is REPORTED, never resolved.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const REG = require("../core/odg-strategic-register.js");
const AS = require("../core/odg-authorization-scope.js");
const OCUR = require("../core/odg-observation-currency.js");

const ROOT = path.resolve(__dirname, "..", "..");
const EV = "docs/odg/evidence";
const OUT_REL = `${EV}/V175_RESUME_POINT.json`;
const REGISTER_REL = `${EV}/V164_STRATEGIC_REGISTER.json`;
const CONTRACTS_REL = `${EV}/V160_AP_WORK_ITEM_CONTRACTS.json`;
const PRECEDENCE_REL = `${EV}/V175_GOVERNANCE_PRECEDENCE.json`;
const DEFAULT_PRS_REL = `${EV}/V175_PR_TIMELINE_SNAPSHOT.json`;
const TRACE_RE = /_GO_EXECUTE_TRACE\.jsonl$/;

const RULES = Object.freeze({
  "RSP-1": "tracked items = every WORK_ITEM_CONTRACT item that has an owner authorization block, OR is the register decision's selected/proposed item, OR is named by a committed GO trace (DISPATCHED mission, CYCLE_END selection.workingOn / selection.strategic); every other register item is summarised by status count only (its record stays in the register)",
  "RSP-2": "step state = odg-authorization-scope.deriveAuthorizationScope(contract, records, local-git R7 probes) where, per record kind, the record is (a) the register loader's V<n>_<scenario>_<KIND>.json (register.sourcesUsed.authorizationEvidence), else (b) the contract-declared path (authorization.inspectionRecord; authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.writeSet[0] for the experiment), else (c) V<n>_<short>_<KIND>.json with short = scenario minus a leading 'V<n>-'; when this differs from the register's CLOSE-1 view (closure.currentStep / closed) the divergence is REPORTED (never resolved here)",
  "RSP-3": "last GO run of an item = the committed GO trace cycle with the latest CYCLE_END.endedAt whose dispatchedMissions or selection.workingOn names the item",
  "RSP-4": "next action by current step: CLOSED_* ⇒ none (new mission only); INSPECT_REVISED_CONTRACT ⇒ INDEPENDENT_INSPECTOR commits an inspection record; RUN_CONTROLLED_EXPERIMENTS authorized and never dispatched ⇒ GO --execute dispatches the declared target; RUN_CONTROLLED_EXPERIMENTS already dispatched by GO with no committed experiment record ⇒ PROVIDER collects the runner's record (never re-run: one-shot claim); VALIDATE_CRITERIA ⇒ PROVIDER commits the criteria-validation record (R5b) + INDEPENDENT_INSPECTOR inspects it; no authorized step and contract not AUTHORIZED ⇒ OWNER (PROPOSED → AUTHORIZED); ODG never self-authorizes",
  "RSP-5": "next GO action = the register decision record (strategic choice) + the tracked items whose authorized current step is an EXECUTION step not yet dispatched (what a GO --execute run could dispatch); when there is none, GO has nothing to dispatch and the pending steps are provider / inspector / owner steps (listed)",
});

function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/* loadInputs(root, prsRel) — every committed file the view reads (+ sha256). Pure fs; local git only for R7 probes. */
function loadInputs(root: string, prsRel: string): any {
  const inputs: any[] = [];
  const read = (rel: string, optional = false) => {
    let txt: string;
    try { txt = fs.readFileSync(path.join(root, rel), "utf8"); } catch (e) { if (optional) { inputs.push({ source: rel, sha256: null }); return null; } throw e; }
    inputs.push({ source: rel, sha256: sha256(txt) });
    return txt;
  };
  const evFiles: string[] = fs.readdirSync(path.join(root, EV)).sort();
  const cpName = REG.latestCheckpointOf(evFiles.filter((f: string) => /_CHECKPOINT_\d+\.json$/.test(f)));
  const checkpoint = cpName ? { path: `${EV}/${cpName}`, data: JSON.parse(read(`${EV}/${cpName}`) as string) } : null;
  const register = { path: REGISTER_REL, data: JSON.parse(read(REGISTER_REL) as string) };
  const contracts = { path: CONTRACTS_REL, data: JSON.parse(read(CONTRACTS_REL) as string) };
  const precTxt = read(PRECEDENCE_REL, true);
  const precedence = precTxt ? { path: PRECEDENCE_REL, data: JSON.parse(precTxt) } : null;
  const traces = evFiles.filter((f: string) => TRACE_RE.test(f)).map((f: string) => {
    const rel = `${EV}/${f}`;
    const entries = String(read(rel)).split("\n").filter((l: string) => l.trim()).map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return { path: rel, entries };
  });
  const recordFiles: any = {};
  const readRecord = (rel: string | null) => {
    if (!rel) return null;
    if (Object.prototype.hasOwnProperty.call(recordFiles, rel)) return recordFiles[rel];
    const txt = read(rel, true);
    let d: any = null;
    try { d = txt ? { ...JSON.parse(txt), recordPath: rel } : null; } catch { d = null; }
    return (recordFiles[rel] = d);
  };
  const prsTxt = prsRel ? read(prsRel, true) : null;
  const prs = prsTxt ? { path: prsRel, data: JSON.parse(prsTxt) } : null;
  return { root, evFiles, checkpoint, register, contracts, precedence, traces, readRecord, prs, probes: OCUR.localGitProbes(root), inputs };
}

/* recordPathFor(kind, contract, register, evFiles) — RSP-2 record discovery (a) register loader, (b) contract-declared, (c) short id. */
const KIND_SUFFIX: any = { inspection: "CONTRACT_INSPECTION", experiment: "EXPERIMENT", validation: "CRITERIA_VALIDATION" };
function recordPathFor(kind: string, contract: any, register: any, evFiles: string[]): { path: string | null; basis: string } {
  const sc = String(contract.scenario);
  const reg = arr(register.register && register.register.sourcesUsed && register.register.sourcesUsed.authorizationEvidence).find((x: any) => x.scenario === sc);
  if (reg && reg[kind]) return { path: reg[kind], basis: "REGISTER_LOADER" };
  const a = contract.authorization || {};
  const declared = kind === "inspection" ? a.inspectionRecord : kind === "experiment" && isObj(a.dispatchTargets) && isObj(a.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS) ? arr(a.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.writeSet)[0] : null;
  if (typeof declared === "string" && evFiles.includes(path.basename(declared))) return { path: declared, basis: "CONTRACT_DECLARED" };
  const short = sc.replace(/^V\d+-/, "");
  const re = new RegExp(`^V(\\d+)_${short.replace(/[^A-Za-z0-9]/g, "")}_${KIND_SUFFIX[kind]}\\.json$`);
  const c = evFiles.filter((f) => re.test(f)).sort((x, y) => Number(re.exec(x)![1]) - Number(re.exec(y)![1]));
  if (c.length) return { path: `${EV}/${c[c.length - 1]}`, basis: "SHORT_ID_PATTERN" };
  return { path: null, basis: "NONE" };
}

/* goRuns(traces) — one summary per committed GO cycle (CYCLE_END), ordered by endedAt then file. */
function goRuns(traces: any[]): any[] {
  const out: any[] = [];
  for (const t of traces) {
    const ends = t.entries.filter((e: any) => e.kind === "CYCLE_END");
    ends.forEach((e: any, k: number) => {
      const sel = isObj(e.selection) ? e.selection : null;
      const nextSel = [...t.entries].reverse().find((x: any) => x.kind === "STEP" && x.step === "NEXT_SELECTION" && x.runId === e.runId);
      out.push({ trace: t.path, cycle: k + 1, runId: e.runId || null, status: e.status, endedAt: e.endedAt || null, dispatchedMissions: arr(e.dispatchedMissions), strategic: sel ? sel.strategic : null, workingOn: sel ? sel.workingOn : null, idempotent: e.idempotent === true, duplicateOf: e.duplicateOf || null,
        nextAfterCurrent: nextSel && isObj(nextSel.decision) && isObj(nextSel.decision.nextAfterCurrent) ? { decision: nextSel.decision.nextAfterCurrent.decision, selected: nextSel.decision.nextAfterCurrent.selected, proposed: nextSel.decision.nextAfterCurrent.proposed } : null,
        ownerSelectionRecord: (t.entries.find((x: any) => x.kind === "OWNER_SELECTION_CLAIMED" && x.runId === e.runId) || {}).record || null });
    });
  }
  return out.sort((a, b) => (String(a.endedAt) < String(b.endedAt) ? -1 : String(a.endedAt) > String(b.endedAt) ? 1 : a.trace < b.trace ? -1 : 1));
}

function compactRef(b: any): any {
  if (!b) return null;
  return { status: b.status, v124MissionId: b.v124MissionId, v124Section: b.v124Section, v144Phase: b.v144Phase, v150RequirementIds: arr(b.v150RequirementIds), ...(b.status === "NOT_MEASURED" ? { reason: b.reason } : b.fieldReasons ? { fieldReasons: b.fieldReasons } : {}) };
}

/* buildResumePoint(I) — the deterministic view (everything --check compares). */
function buildResumePoint(I: any): any {
  const R = I.register.data.register;
  const dr = I.register.data.decisionRecord || {};
  const items: any[] = arr(R && R.items);
  const byId = new Map(items.map((it: any) => [it.id, it]));
  const contracts: any[] = arr(I.contracts.data.contracts);
  const runs = goRuns(I.traces);
  const traceNamed = new Set<string>();
  for (const r of runs) { for (const m of r.dispatchedMissions) traceNamed.add(m); if (r.workingOn) traceNamed.add(r.workingOn); if (r.strategic) traceNamed.add(r.strategic); }
  const tracked = items.filter((it: any) => it.kind === "WORK_ITEM_CONTRACT").filter((it: any) => {
    const c = contracts.find((x: any) => String(x.scenario) === it.id);
    return (c && isObj(c.authorization)) || it.id === dr.selected || it.id === dr.proposed || traceNamed.has(it.id);
  });
  const dispatchedBy = (id: string) => runs.filter((r) => r.dispatchedMissions.includes(id));
  const trackedOut = tracked.map((it: any) => {
    const ci = contracts.findIndex((x: any) => String(x.scenario) === it.id);
    const c = contracts[ci];
    let scope: any = null, records: any = null, divergence: any = null;
    if (c && isObj(c.authorization)) {
      records = {};
      const ev: any = { probes: I.probes };
      for (const k of ["inspection", "experiment", "validation"]) { const p = recordPathFor(k, c, I.register.data, I.evFiles); records[k] = p; ev[k] = I.readRecord(p.path); }
      const s = AS.deriveAuthorizationScope(c, ev);
      scope = s.applicable ? { currentStep: s.currentStep, currentStepKind: s.currentStepKind, currentStepAuthorized: s.currentStepAuthorized, nextStep: s.nextStep, validatedSteps: s.validatedSteps.map((v: any) => v.step), reason: s.reason, contractSha256: s.contractSha256 } : { applicable: false, reason: s.reason };
      const regClosed = !!(it.closure && it.closure.closed);
      const regStep = it.closure && !it.closure.closed ? it.closure.currentStep || null : null;
      const viewClosed = s.applicable && s.currentStep === null;
      if (regClosed !== viewClosed || (!regClosed && regStep !== (s.applicable ? s.currentStep : null))) divergence = { register: regClosed ? `closed (${it.status})` : `current step ${regStep}`, registerSource: `${REGISTER_REL}#register.items[id=${it.id}].closure`, view: viewClosed ? "all steps validated" : `current step ${s.currentStep}`, viewBasis: Object.fromEntries(Object.entries(records).map(([k, v]: any) => [k, `${v.basis}${v.path ? ": " + v.path : ""}`])), note: "REPORTED, not resolved: the register's CLOSE-1 loader and the contract-declared records disagree (RSP-2); a loader/record-name fix needs its own reviewed change" };
    }
    const lastRun = [...runs].reverse().find((r) => r.dispatchedMissions.includes(it.id) || r.workingOn === it.id) || null;
    const closed = /^CLOSED_/.test(String(it.status));
    const pending: any[] = [];
    let next: any;
    if (closed) next = { actor: "NONE", action: `closed (${it.status}, CLOSE-1 ${it.closure && it.closure.record}) — further work only as a NEW mission (no re-grade, no re-run)` };
    else if (scope && scope.currentStep === "INSPECT_REVISED_CONTRACT") { pending.push({ kind: "INSPECTION", of: `contract ${String(scope.contractSha256).slice(0, 12)}`, reason: scope.reason }); next = { actor: "INDEPENDENT_INSPECTOR", action: `inspect the revised contract (sha ${scope.contractSha256}) and commit the inspection record` }; }
    else if (scope && scope.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && scope.currentStepAuthorized) {
      const d = dispatchedBy(it.id);
      next = d.length ? { actor: "PROVIDER", action: `GO already dispatched ${it.id} (${d[d.length - 1].trace} run ${d[d.length - 1].runId}); collect the runner's experiment record into a result PR — never re-run (one-shot claim)` }
        : { actor: "GO", action: `GO --execute dispatches the declared target ${c && c.authorization && c.authorization.dispatchTargets && c.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS ? c.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS.command : "(none declared)"}` };
    } else if (scope && scope.currentStep === "VALIDATE_CRITERIA") {
      pending.push({ kind: "VALIDATION", of: records && records.experiment && records.experiment.path, reason: scope.reason });
      pending.push({ kind: "INSPECTION", of: "the criteria-validation result (R5b independent inspection)", reason: "required before CLOSE-1 can close the item" });
      next = { actor: "PROVIDER + INDEPENDENT_INSPECTOR", action: `commit the criteria-validation record (R5b) bound to contract ${String(scope.contractSha256).slice(0, 12)} and experiment ${records && records.experiment && records.experiment.path}, then an independent inspection — never auto-graded` };
    } else if (scope && scope.currentStep && !scope.currentStepAuthorized) next = { actor: "OWNER", action: `current step ${scope.currentStep} is NOT authorized (${scope.reason})` };
    else if (!scope || scope.applicable === false) next = c && c.state === "AUTHORIZED" && c.authorizedBy ? { actor: "GO", action: "contract AUTHORIZED — GO may work on it (GO-ACT-1)" } : { actor: "OWNER", action: `${it.id} contract ${c ? c.state : "?"} → AUTHORIZED (authorizedBy) — ODG never self-authorizes` };
    else next = { actor: "UNKNOWN", action: `current step ${scope.currentStep}` };
    return {
      id: it.id, title: it.title, registerStatus: it.status, contractState: it.contractState || null,
      boussoleRef: compactRef(it.boussoleRef), contractSha256: it.contractRef ? it.contractRef.contractSha256 : null, ownerRecord: it.contractRef ? it.contractRef.ownerRecord : null,
      currentStep: closed ? null : scope ? scope.currentStep : null, scope, records, ...(divergence ? { divergence } : {}),
      lastGoRun: lastRun ? { trace: lastRun.trace, runId: lastRun.runId, status: lastRun.status, endedAt: lastRun.endedAt, dispatched: lastRun.dispatchedMissions.includes(it.id) } : null,
      pending, next, source: [`${REGISTER_REL}#register.items[id=${it.id}]`, ...(ci >= 0 ? [`${CONTRACTS_REL}#contracts[${ci}]`] : [])],
    };
  });
  // owner questions / decisions open
  const oq = I.precedence ? arr(I.precedence.data.ownerQuestions).map((q: any, i: number) => ({ q, i })).filter(({ q }) => q && q.answer === null).map(({ q, i }) => ({ id: q.id, blocking: q.blocking === true, interimApplied: q.interimApplied || null, question: q.question, source: `${PRECEDENCE_REL}#ownerQuestions[${i}]` })) : [];
  const cp = I.checkpoint;
  const cpOpen = cp ? arr(cp.data.ownerDecisionsOpen).map((t: any, i: number) => ({ text: String(t), source: `${cp.path}#ownerDecisionsOpen[${i}]`, asRecordedAt: cp.data.checkpoint || null })) : [];
  const cpVsNow = cp ? Object.keys(cp.data).filter((k) => /^mission[A-Z0-9]+$/.test(k) && isObj(cp.data[k])).sort().map((k) => {
    const id = k.replace(/^mission/, "");
    const it: any = byId.get(id);
    const st = String(cp.data[k].status || "");
    const now = it ? it.status : null;
    return { item: id, checkpointStatus: st, registerStatus: now, superseded: !!now && !st.startsWith(now), source: `${cp.path}#${k}.status` };
  }) : [];
  // open PRs
  const prList = I.prs ? (Array.isArray(I.prs.data) ? I.prs.data : arr(I.prs.data.prs)) : [];
  const openPrs = I.prs ? { snapshot: I.prs.path, snapshotAt: Array.isArray(I.prs.data) ? null : I.prs.data.snapshotAt || null, window: Array.isArray(I.prs.data) ? null : I.prs.data.window || null, open: prList.filter((p: any) => String(p.state).toUpperCase() === "OPEN").map((p: any) => ({ number: p.number, title: p.title, headRefName: p.headRefName || null })).sort((a: any, b: any) => a.number - b.number), note: "frozen snapshot passed in (no network); refresh by passing --prs <file> written from `gh pr list --json number,title,headRefName,state`" } : { status: "NOT_MEASURED", reason: "no PR snapshot file" };
  // next GO action
  const dispatchable = trackedOut.filter((t: any) => t.next.actor === "GO");
  const strategic: any = dr.selected ? byId.get(dr.selected) : dr.proposed ? byId.get(dr.proposed) : null;
  const strategicContract = strategic ? contracts.find((x: any) => String(x.scenario) === strategic.id) : null;
  const lastRun = runs.length ? runs[runs.length - 1] : null;
  const nextGoAction = {
    rule: "RSP-5",
    strategic: { decision: dr.decision || null, item: strategic ? strategic.id : null, contractState: strategic ? strategic.contractState || null : null, boussoleRef: strategic ? compactRef(strategic.boussoleRef) : null,
      ownerAuthorizationNeeded: strategic && strategicContract && !(strategicContract.state === "AUTHORIZED" && strategicContract.authorizedBy) && !isObj(strategicContract.authorization) ? `owner — ${strategic.id} ${strategicContract.state} → AUTHORIZED (authorizedBy)` : null, source: `${REGISTER_REL}#decisionRecord` },
    dispatchable: dispatchable.map((t: any) => ({ item: t.id, action: t.next.action })),
    verdict: dispatchable.length ? `GO --execute could dispatch: ${dispatchable.map((t: any) => t.id).join(", ")}` : "no tracked item has an authorized, not-yet-dispatched EXECUTION step ⇒ a GO --execute run has nothing to dispatch; the pending steps are provider / inspector / owner steps (see trackedItems[].next)",
    pendingNonGo: trackedOut.filter((t: any) => t.next.actor !== "GO" && t.next.actor !== "NONE").map((t: any) => ({ item: t.id, actor: t.next.actor, action: t.next.action })),
    lastGoRun: lastRun ? { trace: lastRun.trace, runId: lastRun.runId, status: lastRun.status, endedAt: lastRun.endedAt, strategic: lastRun.strategic, workingOn: lastRun.workingOn, nextAfterCurrent: lastRun.nextAfterCurrent } : null,
  };
  const statusCounts: any = {};
  for (const it of items) statusCounts[it.status] = (statusCounts[it.status] || 0) + 1;
  return {
    "//": "V17.5 PRIORITY 3 — resume point: a deterministic VIEW over committed records (no new registry). Read trackedItems[].next and nextGoAction first; every value cites its source. Recompute: npx tsx runtime/bin/odg-resume-point.ts [--prs <file>] ; verify: --check.",
    schema: "ODG_RESUME_POINT/1",
    rules: RULES,
    inputs: I.inputs,
    checkpoint: cp ? { path: cp.path, checkpoint: cp.data.checkpoint || null, date: cp.data.date || null, headAtCheckpoint: cp.data.headAtCheckpoint || null, nextPriority: cp.data.nextPriority || null, rule: "LCP-1" } : null,
    boussole: { canonical: "V12.4", precedence: R && R.boussole ? R.boussole.precedence : null, coverage: R && R.boussole ? R.boussole.coverage : null, source: `${REGISTER_REL}#register.boussole` },
    trackedItems: trackedOut,
    otherRegisterItems: { count: items.length - trackedOut.length, statusCounts, note: "not tracked by RSP-1 — see the register for each record" },
    ownerQuestionsOpen: oq,
    ownerDecisionsOpenAtCheckpoint: cpOpen,
    checkpointVsRegister: cpVsNow,
    openPrs,
    goRuns: runs.map((r) => ({ trace: r.trace, cycle: r.cycle, runId: r.runId, status: r.status, endedAt: r.endedAt, dispatched: r.dispatchedMissions, strategic: r.strategic, workingOn: r.workingOn, ownerSelectionRecord: r.ownerSelectionRecord })),
    nextGoAction,
  };
}

function main(argv: string[]): number {
  const root = (() => { const i = argv.indexOf("--root"); return i >= 0 ? path.resolve(argv[i + 1]) : ROOT; })();
  const prsRel = (() => { const i = argv.indexOf("--prs"); return i >= 0 ? path.relative(root, path.resolve(argv[i + 1])) : DEFAULT_PRS_REL; })();
  const out = (() => { const i = argv.indexOf("--out"); return i >= 0 ? path.resolve(argv[i + 1]) : path.join(root, OUT_REL); })();
  const rec = buildResumePoint(loadInputs(root, prsRel));
  const txt = JSON.stringify(rec, null, 2) + "\n";
  if (argv.includes("--check")) {
    let committed: string;
    try { committed = fs.readFileSync(out, "utf8"); } catch (e: any) { process.stderr.write(`--check: cannot read ${out}: ${e.message}\n`); return 1; }
    if (committed !== txt) {
      const c = JSON.parse(committed);
      const drift = Object.keys(rec).filter((k) => JSON.stringify(c[k]) !== JSON.stringify((rec as any)[k]));
      process.stderr.write(`--check: DRIFT in [${drift.join(", ")}] — recompute differs from ${path.relative(root, out)}\n`);
      return 1;
    }
    process.stdout.write(`--check: OK (no drift) tracked=${rec.trackedItems.length} next=${rec.nextGoAction.verdict.slice(0, 80)}\n`);
    return 0;
  }
  if (argv.includes("--stdout")) { process.stdout.write(txt); return 0; }
  fs.writeFileSync(out, txt);
  process.stdout.write(JSON.stringify({ out: path.relative(root, out), tracked: rec.trackedItems.map((t: any) => `${t.id}:${t.registerStatus}${t.currentStep ? "@" + t.currentStep : ""}→${t.next.actor}`), ownerQuestionsOpen: rec.ownerQuestionsOpen.map((q: any) => q.id), next: rec.nextGoAction.verdict }, null, 2) + "\n");
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { RULES, OUT_REL, loadInputs, buildResumePoint, goRuns, recordPathFor, main };
export {};
