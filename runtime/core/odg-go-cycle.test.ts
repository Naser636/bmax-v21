#!/usr/bin/env node
"use strict";
/* V16.4 ODG GO — OFFLINE tests of runtime/core/odg-go-cycle.ts with INJECTED ports (no network, no model, no provider,
 * no git, no write outside an in-memory trace). State = the COMMITTED canonical evidence of this tree (deterministic),
 * with fixed ledger/allowlist; the REAL canonical components are exercised (no component mocks). */
const fs = require("fs");
const path = require("path");
const GO = require("./odg-go-cycle.js");
const SS = require("../bin/odg-strategic-select.ts");
const SMR = require("../bin/odg-strategy-mode-run.ts");
const POL = require("./odg-local-model-execution-policy.js");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const rj = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
const clone = (o: any) => JSON.parse(JSON.stringify(o));

const BASE = (() => {
  const src = SS.loadSources(ROOT);
  return {
    // V16.9 Phase 1: the register input is EXACTLY the canonical loader's sources (every key of SS.loadSources except
    // `inputs`), as odg-go.registerSources does — the hand-picked 4-key subset omitted the closure/resolution/checkpoint
    // records, so this core suite's register could disagree with the committed register (the defect Phase 1 fixes).
    inputs: src.inputs, sources: (({ inputs: _i, ...rest }: any) => rest)(src),
    registerEvidence: rj("docs/odg/evidence/V164_STRATEGIC_REGISTER.json"), strategyEvidence: rj("docs/odg/evidence/V164_STRATEGY_MODE_SELECTION.json"),
    radar: { grant: rj("docs/odg/V164_RESEARCH_GRANT_BROAD_ADMISSION.json"), admission: rj("docs/odg/evidence/V164_RADAR_SOURCE_ADMISSION.json") },
    ledger: { proven: ["M0001"], integrity: { ok: true } }, attempts: { count: 7, last: null }, allowlist: { ids: ["M0001"], source: "test" },
    measured: POL.loadMeasuredRegistry("docs/odg/evidence/V155_OLLAMA_CAPABILITY_REGISTRY.json", { root: ROOT }), strategyNow: SMR.loadSources().now,
  };
})();
/* V165: the committed contract G is now AUTHORIZED (owner directive V165 §1). The gate tests below need the
 * UNAUTHORIZED case, so they run on an explicit fixture: G PROPOSED/authorizedBy null, and the committed strategy
 * evidence entry for AP-G set to what the selector returns for a PROPOSED contract (M0 DECISION_REQUIRED, tentative NATIVE). */
const BASE_LIVE = BASE;
/* V16.8: the owner authorized H (V168) and its revised contract extended H's write_set to every file of its experiment
 * path ⇒ the COMMITTED register no longer selects H (CRC-1 0.3 → 0.9; DECISION_REQUIRED J/G — asserted in block 1d).
 * The GO-ACT-1 / gate tests below exercise "strategic item lacks authorization" with H as that item, so they run on an
 * explicit FIXTURE: H as committed before V168 (PROPOSED, authorizedBy null, no authorization/revision/preRegistration,
 * original single-file write_set), with registerEvidence RE-COMPUTED by odg-strategic-select.compute over the fixture
 * sources (self-consistent) — a test fixture, never committed state. */
const BASE_PRE_V168 = (() => {
  const src = SS.loadSources(ROOT);
  const contracts = clone(src.contracts);
  const h = contracts.data.contracts.find((x: any) => x.scenario === "H");
  h.state = "PROPOSED"; h.authorizedBy = null; delete h.authorization; delete h.revisionHistory; delete h.WORK_ITEM_CONTRACT.preRegistration;
  h.WORK_ITEM_CONTRACT.write_set = ["docs/odg/evidence/V160_SCENARIO_H.json"];
  const s = clone(BASE); s.measured = BASE.measured;
  s.sources.contracts = contracts;
  // V16.9: authorizationEvidence {} — this fixture's GO state carries no authorization evidence (mirrored below)
  s.registerEvidence = JSON.parse(JSON.stringify(SS.compute({ ...src, contracts, authorizationEvidence: {} })));
  return s;
})();
const BASE_UNAUTH = (() => {
  const s = clone(BASE_PRE_V168); s.measured = BASE.measured;
  const c = s.sources.contracts.data.contracts.find((x: any) => x.scenario === "G");
  c.state = "PROPOSED"; c.authorizedBy = null; delete c.authorization;
  const m = s.strategyEvidence.missions.find((x: any) => x.id === "AP-G");
  m.current = { ...m.current, mode: "DECISION_REQUIRED", tentativeMode: "NATIVE", rule: "M0", authorizationRequired: true };
  return s;
})();
const KNOW = { ok: true, collection: "pinned", claims: [{ id: "K1", epistemic: "SUPPORTED", isFact: false, useAuthorization: "DESIGN_PROPOSAL", admissible: { trusted: false, verdict: "NOT_A_FACT" } }] };
const TL_PASS = { status: "PASS", ok: true, blocked: false, enforce: true, gitState: { isRepo: true, branch: "main", head: "h", originMain: "h", staged: 0 }, verdict: { detail: "ok" } };
const TL_FAIL = { status: "BLOCKED", ok: false, blocked: true, enforce: true, gitState: { isRepo: true, branch: "feat/x", head: "h", originMain: "h", staged: 0 }, verdict: { detail: "REFUSED — unexpected branch" } };

/* V166 (#933 inspection fix): G's write_set now carries the experiment files, so the COMMITTED register selects H
 * (TIE_EXPLAINED J/G/H, R3). Tests that exercise G's own gate/dispatch path run on an explicit FOCUS fixture where H and J
 * are marked PASS (not selectable) so the selector itself selects G — a test fixture, never committed state. */
function focusG(state: any): any {
  const s = clone(state); s.measured = state.measured;
  for (const id of ["H", "J"]) s.sources.contracts.data.contracts.find((x: any) => x.scenario === id).initialState.status = "PASS";
  return s;
}
function authorizeG(state0: any): any {
  const state = focusG(state0);
  const s = clone(state); s.measured = state.measured;
  const c = s.sources.contracts.data.contracts.find((x: any) => x.scenario === "G");
  c.state = "AUTHORIZED"; c.authorizedBy = "owner (test fixture)";
  return s;
}
/* V16.9 Phase 1 (test harness): the register now derives CLOSE-1 closures from sources.authorizationEvidence. Every
 * fixture's register reads the SAME authorization evidence as that fixture's GO state (state.authorizationEvidence;
 * absent ⇒ {}), as odg-go does in a real run (both from the same committed records) — so a fixture simulating an earlier
 * step (e.g. "H at RUN_CONTROLLED_EXPERIMENTS") is not contradicted by the committed closure records. */
/* V16.9 Phase 1b (R7 proof currency): odg-go readState injects the loader's read-only local-git probes (sources.proofProbes
 * and authorizationEvidence[X].probes). Fixtures are JSON-cloned (functions dropped), so the harness re-injects them here:
 * REAL local git for the committed records + the LABELLED fixture head 'b'×40 (used by the synthetic inspection records
 * below) declared present + ancestor of main. A fixture may set `probes: null` explicitly to test the no-probe refusal. */
const OCUR = require("./odg-observation-currency.js");
const REAL_PROBES = OCUR.localGitProbes(ROOT);
const FIXTURE_HEAD = "b".repeat(40);
const TEST_PROBES = Object.freeze({ label: "TEST FIXTURE — real local git + fixture head 'b'×40 declared present/ancestor", mainRef: REAL_PROBES.mainRef,
  commitExists: (x: string) => x === FIXTURE_HEAD || REAL_PROBES.commitExists(x), isAncestorOfMain: (x: string) => x === FIXTURE_HEAD || REAL_PROBES.isAncestorOfMain(x), fileSha256: (r: string) => REAL_PROBES.fileSha256(r) });
function mirrorAuthEvidence(st: any): any {
  if (!st || !st.sources) return st;
  const ae: any = {};
  for (const [k, v] of Object.entries(st.authorizationEvidence || {}) as any) ae[k] = v && typeof v === "object" && !("probes" in v) ? { ...v, probes: TEST_PROBES } : v;
  return { ...st, authorizationEvidence: ae, sources: { ...st.sources, proofProbes: TEST_PROBES, authorizationEvidence: st.authorizationEvidence || {} } };
}
function mkPorts(o: any = {}): any {
  const trace: any[] = o.trace || [];
  let t = 1_000_000;
  const calls = { readState: 0, dispatch: 0, provider: 0, writes: [] as string[], isolation: 0 };
  const ports: any = {
    now: o.now || (() => (t += 5)),
    truthLock: () => o.tl || TL_PASS,
    readState: () => { calls.readState++; return mirrorAuthEvidence(o.state || BASE_UNAUTH); },
    knowledge: () => KNOW,
    stopRequested: o.stopRequested || (() => ({ stop: false })),
    trace: { append: (e: any) => trace.push(JSON.parse(JSON.stringify(e))), readPrior: () => trace.slice() },
    writeSummary: (x: any) => { GO.assertConfinedWrite("/virtual/out/go-cycle.json", "/virtual/out", ["/virtual/main/runtime/generated"], path); calls.writes.push("/virtual/out/go-cycle.json"); },
    isolation: o.isolation || ((_n: any) => { calls.isolation++; return { ok: true, workspace: "/virtual/scratch" }; }),
    dispatchNative: (n: any, c: any) => { calls.dispatch++; (calls as any).dispatched = ((calls as any).dispatched || []).concat([{ mission: n.mission, target: c && c.dispatchTarget ? c.dispatchTarget : null }]); return o.dispatchResult || { verified: true, detail: "fixture PASS" }; },
    launchProvider: () => { calls.provider++; throw new Error("provider must never be launched"); },
  };
  return { ports, trace, calls };
}
const stepsOf = (tr: any[]) => tr.filter((e) => e.kind === "STEP");
const stepIn = (tr: any[], s: string) => tr.find((e) => e.kind === "STEP" && e.step === s);

(async () => {
  // 1. ordering + uniform trace entries on the committed state (unauthorized G)
  {
    const { ports, trace, calls } = mkPorts();
    const r = await GO.runGoCycle({ mode: "DRY" }, ports);
    const st = stepsOf(trace);
    check("10 steps run in the canonical order", st.map((e) => e.step).join(",") === GO.STEPS.join(","));
    check("every STEP entry carries step/inputsSha256/decision/rationale/decidedBy/startedAt/endedAt", st.every((e) => ["step", "inputsSha256", "decision", "rationale", "decidedBy", "startedAt", "endedAt"].every((k) => e[k] !== undefined && e[k] !== null) && /^[0-9a-f]{64}$/.test(e.inputsSha256)));
    check("trace starts with CYCLE_START and ends with CYCLE_END", trace[0].kind === "CYCLE_START" && trace[trace.length - 1].kind === "CYCLE_END");
    check("unauthorized G ⇒ HALTED_AT_AUTHORIZATION_GATE", r.status === "HALTED_AT_AUTHORIZATION_GATE");
    const sel = stepIn(trace, "SELECT").decision;
    check("TIE_EXPLAINED propagated verbatim (pre-V168 H fixture: tiedSet J/G/H resolved by R3 ⇒ H, no id pick)", sel.decision === "TIE_EXPLAINED" && sel.selected === "H" && sel.tiedSet.join(",") === "J,G,H" && sel.resolvedBy === "R3_LOWER_RISK");
    check("SELECT consistent with the (fixture-recomputed) register decision", sel.consistentWithCommittedRegisterEvidence === true);
    check("STRATEGY = M0 DECISION_REQUIRED (tentative NATIVE), consistent with committed evidence", stepIn(trace, "STRATEGY").decision.mode === "DECISION_REQUIRED" && stepIn(trace, "STRATEGY").decision.rule === "M0" && stepIn(trace, "STRATEGY").decision.consistentWithCommittedStrategyEvidence === true);
    const au = stepIn(trace, "AUTHORIZE");
    check("intelligence-loop halts at PROPOSED (AUTHORIZE stage, proposedOnly)", au.status === "HALTED_AT_GATE" && au.decision.intelligenceLoop.stage === "AUTHORIZE" && au.decision.intelligenceLoop.proposedOnly === true && au.decision.selfAuthorized === false);
    check("scheduler eligibility: G NOT_PRE_AUTHORIZED, M0001 ALREADY_PROVEN", au.decision.schedulerEligibility.some((e: any) => e.mission === sel.selected && /NOT_PRE_AUTHORIZED/.test(e.reason)) && au.decision.schedulerEligibility.some((e: any) => e.mission === "M0001" && /ALREADY_PROVEN/.test(e.reason)));
    check("EXECUTE: NOTHING_EXECUTED, no dispatch, no provider", stepIn(trace, "EXECUTE").status === "NOTHING_EXECUTED" && calls.dispatch === 0 && calls.provider === 0 && r.dispatchCalls === 0 && r.providerLaunched === 0);
    const nx = stepIn(trace, "NEXT_SELECTION").decision;
    check("prepared mission recorded with contract + decomposition + strategy + authorizationNeeded", nx.preparedMission.id === sel.selected && !!nx.preparedMission.contract.objective && !!nx.preparedMission.decomposition && !!nx.preparedMission.strategy && /PROPOSED → AUTHORIZED/.test(nx.preparedMission.authorizationNeeded));
    check("next-after-current selection recorded (selector, not id order)", typeof nx.nextAfterCurrent.decision === "string" && nx.nextAfterCurrent.selected !== sel.selected);
    check("summary written through the confined writer", calls.writes.length === 1);
  }
  // 1b. committed state after V165: the owner authorized REVISION + INSPECTION of G's contract, NOT execution
  //     ("lancer les expériences contrôlées après validation de ce contrat") ⇒ state AUTHORIZED_FOR_REVISION
  {
    const g = BASE_LIVE.sources.contracts.data.contracts.find((x: any) => x.scenario === "G");
    check("committed contract G is AUTHORIZED_FOR_REVISION by the owner (V165 §1), executionAuthorized false", g.state === "AUTHORIZED_FOR_REVISION" && /^OWNER/.test(String(g.authorizedBy)) && /V165/.test(String(g.authorizedBy)) && g.authorization && g.authorization.executionAuthorized === false);
    // runnable isolated scratch is provided by the default ports (isolation ok + dispatchNative available)
    const { ports, trace, calls } = mkPorts({ state: focusG(BASE_LIVE) });
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, ports);
    check("focus fixture: the selector selects G", stepIn(trace, "SELECT").decision.selected === "G");
    const au = stepIn(trace, "AUTHORIZE");
    check("committed state + EXECUTE + runnable scratch ⇒ G NOT dispatched (revision-only authorization never opens execution)", calls.dispatch === 0 && calls.provider === 0 && r.status === "HALTED_AT_AUTHORIZATION_GATE" && au.decision.selectedAuthorized === false && au.decision.selfAuthorized === false);
    check("committed state ⇒ STRATEGY stays M0 DECISION_REQUIRED for G", stepIn(trace, "STRATEGY").decision.rule === "M0" && stepIn(trace, "STRATEGY").decision.mode === "DECISION_REQUIRED");
    // V166 scoped authorization reported at AUTHORIZE (no inspection record committed ⇒ experiments not authorized)
    const sc = au.decision.scopedAuthorization;
    check("V166: AUTHORIZE reports scoped state — INSPECT_REVISED_CONTRACT AUTHORIZED (provider/docs work, not native dispatch), next RUN_CONTROLLED_EXPERIMENTS NOT authorized", !!sc && sc.currentStep === "INSPECT_REVISED_CONTRACT" && sc.currentStepAuthorized === true && /not native dispatch/.test(sc.report) && sc.nextStep === "RUN_CONTROLLED_EXPERIMENTS" && sc.nextStepAuthorized === false && sc.executionAuthorized === false && /scoped/.test(stepIn(trace, "NEXT_SELECTION").decision.preparedMission.authorizationNeeded));
  }
  // committed authorization evidence, exactly as odg-go readState loads it (AUTH_EVIDENCE paths; absent ⇒ null)
  const optJ = (rel: string) => { try { return rj(rel); } catch { return null; } };
  const COMMITTED_AUTH_EV = {
    G: { inspection: optJ("docs/odg/evidence/V166_G_CONTRACT_INSPECTION.json"), experiment: optJ("docs/odg/evidence/V166_G_EXPERIMENT.json"), validation: optJ("docs/odg/evidence/V166_G_CRITERIA_VALIDATION.json") },
    H: { inspection: optJ("docs/odg/evidence/V168_H_CONTRACT_INSPECTION.json"), experiment: optJ("docs/odg/evidence/V168_H_EXPERIMENT.json"), validation: optJ("docs/odg/evidence/V168_H_CRITERIA_VALIDATION.json") },
  };
  const BASE_LIVE_EV = (() => { const s = clone(BASE_LIVE); s.measured = BASE_LIVE.measured; s.authorizationEvidence = COMMITTED_AUTH_EV; return s; })();
  // fixture: H at its RUN_CONTROLLED_EXPERIMENTS step (inspection recorded; experiment + validation not yet) — the state GO
  // actually acted on in the V168 native dispatch (#946). Labelled fixture, derived from the committed records.
  const BASE_H_AT_RUN = (() => { const s = clone(BASE_LIVE_EV); s.measured = BASE_LIVE.measured; s.authorizationEvidence = { ...COMMITTED_AUTH_EV, H: { ...COMMITTED_AUTH_EV.H, experiment: null, validation: null } }; return s; })();
  // 1d. V16.8 COMMITTED state (no fixture): H AUTHORIZED_FOR_REVISION (V168) with its revised contract ⇒ the register
  //     decision is DECISION_REQUIRED (J/G tie), kept verbatim (no id pick) ⇒ HALTED_DECISION_REQUIRED, nothing dispatched
  {
    const h = BASE_LIVE.sources.contracts.data.contracts.find((x: any) => x.scenario === "H");
    check("committed contract H is AUTHORIZED_FOR_REVISION by the owner (V168), executionAuthorized false", h.state === "AUTHORIZED_FOR_REVISION" && /V168/.test(String(h.authorizedBy)) && h.authorization && h.authorization.executionAuthorized === false && /V168_OWNER_AUTHORIZATION_H\.json/.test(h.authorization.source));
    const { ports, trace, calls } = mkPorts({ state: BASE_H_AT_RUN });
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, ports);
    const sel = stepIn(trace, "SELECT").decision;
    // V16.9 Phase 1: G's committed criteria-validation record closes G (CLOSE-1 ⇒ CLOSED_PARTIAL, non-selectable), so the
    // pre-Phase-1 J/G tie (which kept a CLOSED mission selectable) no longer occurs — the selector SELECTS J.
    check("H-at-RUN fixture (G CLOSED_PARTIAL by its committed closure record): SELECT = SELECTED J (no J/G tie), consistent with the committed register, no id pick", sel.decision === "SELECTED" && sel.selected === "J" && sel.tiedSet.length === 0 && sel.consistentWithCommittedRegisterEvidence === true);
    // V16.8 fix (GO-ACT-1 applies when the strategic selection is UNDECIDED): ODG proceeds with the best AUTHORIZED item (H)
    // and records the undecided strategic choice as an owner/ODG request; no dispatch without --allow-unsandboxed-target.
    check("H-at-RUN fixture ⇒ strategic J (not actionable: PROPOSED) kept, GO proceeds with the authorized item H (GO-ACT-1; authorization evidence as odg-go loads it, experiment/validation removed), owner request for J's authorization, no dispatch without --allow-unsandboxed-target, no provider", r.status !== "HALTED_DECISION_REQUIRED" && sel.workingOn === "H" && sel.ownerRequest && sel.ownerRequest.item === "J" && /J PROPOSED → AUTHORIZED/.test(String(sel.ownerRequest.authorizationNeeded)) && calls.dispatch === 0 && calls.provider === 0);
  }
  // 1d'. COMMITTED state after H's criteria validation (#947): H CLOSED (all 4 steps validated) ⇒ nothing actionable ⇒ halt
  {
    const { ports, trace, calls } = mkPorts({ state: BASE_LIVE_EV });
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, ports);
    const sel = stepIn(trace, "SELECT").decision;
    // V16.9 Phase 1: G and H are CLOSED (CLOSE-1) ⇒ the selector SELECTS J; J is PROPOSED ⇒ halt at the authorization gate
    // with an owner request for J (previously: HALTED_DECISION_REQUIRED on a J/G tie that kept closed G selectable).
    check("committed state (G, H closed) ⇒ SELECTED J, HALTED_AT_AUTHORIZATION_GATE, owner request for J's authorization, nothing actionable, no dispatch", r.status === "HALTED_AT_AUTHORIZATION_GATE" && sel.decision === "SELECTED" && sel.selected === "J" && !!sel.ownerRequest && sel.ownerRequest.item === "J" && /J PROPOSED → AUTHORIZED/.test(String(sel.ownerRequest.authorizationNeeded)) && calls.dispatch === 0);
  }
  // 1e. strategic UNDECIDED and NO authorized item ⇒ still HALTED_DECISION_REQUIRED (no arbitrary pick)
  {
    const s = clone(BASE_LIVE_EV); s.measured = BASE_LIVE.measured;
    // labelled fixture: G AND H de-authorized (no authorization block ⇒ no CLOSE-1 closure, nothing actionable) so the
    // strategic selection is the undecided J/G tie this test needs (V16.9: with the committed closures it is decided).
    for (const id of ["H", "G"]) { const c = s.sources.contracts.data.contracts.find((x: any) => x.scenario === id); c.state = "PROPOSED"; c.authorizedBy = null; delete c.authorization; }
    const { ports, trace, calls } = mkPorts({ state: s });
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, ports);
    check("strategic undecided + no authorized item ⇒ HALTED_DECISION_REQUIRED, nothing selected, no dispatch", r.status === "HALTED_DECISION_REQUIRED" && stepIn(trace, "SELECT").decision.workingOn === null && calls.dispatch === 0);
  }
  // 1c. V166: committed state + a valid inspection ACCEPT record ⇒ the experiments step is derived-authorized and dispatches
  //     only through the existing NATIVE + isolated path; any defect in the record ⇒ no dispatch
  {
    const AS = require("./odg-authorization-scope.js");
    const g = BASE_LIVE.sources.contracts.data.contracts.find((x: any) => x.scenario === "G");
    const rec = (o: any = {}) => ({ scenario: "G", verdict: "ACCEPT", contractSha256: AS.contractSha256(g), inspector: "independent inspector (test fixture)", inspectorSessionId: "inspector-sid-test", authorSessionId: g.revisionHistory[g.revisionHistory.length - 1].revisionAuthorSessionId, inspectedHeadSha: "b".repeat(40), ...o });
    const withEv = (inspection: any) => { const s = focusG(BASE_LIVE); s.authorizationEvidence = { G: { inspection, experiment: null } }; return s; };
    const ok = mkPorts({ state: withEv(rec()) });
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, ok.ports);
    const au = stepIn(ok.trace, "AUTHORIZE").decision;
    const ex = stepIn(ok.trace, "EXECUTE").decision;
    check("V166: ACCEPT record bound to the current contract sha ⇒ RUN_CONTROLLED_EXPERIMENTS derived-authorized; STRATEGY leaves M0 (NATIVE)", au.scopedAuthorization.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && au.scopedAuthorization.executionAuthorized === true && au.selectedAuthorized === true && au.selfAuthorized === false && stepIn(ok.trace, "STRATEGY").decision.rule !== "M0" && stepIn(ok.trace, "STRATEGY").decision.mode === "NATIVE" && ok.calls.provider === 0);
    check("GO-DT-1: committed G declares no dispatch target ⇒ NO_DISPATCH_TARGET, 0 dispatch even with a runnable isolated scratch (G.json present ⇒ no fallback to odg-run G)", ok.calls.dispatch === 0 && ok.calls.isolation === 0 && ex.dispatchTarget && ex.dispatchTarget.ok === false && ex.dispatchTarget.code === "NO_DISPATCH_TARGET" && r.status === "HALTED_AT_AUTHORIZATION_GATE" && /NO_DISPATCH_TARGET/.test(stepIn(ok.trace, "EXECUTE").rationale) && stepIn(ok.trace, "NEXT_SELECTION").decision.preparedMission.dispatchTarget.code === "NO_DISPATCH_TARGET");
    // a FIXTURE revision of G declaring a target (sha re-bound in the fixture inspection — never committed)
    const withTarget = (tgt: any) => { const s = focusG(BASE_LIVE); const c = s.sources.contracts.data.contracts.find((x: any) => x.scenario === "G"); c.authorization.dispatchTargets = { RUN_CONTROLLED_EXPERIMENTS: tgt }; s.authorizationEvidence = { G: { inspection: rec({ contractSha256: AS.contractSha256(c) }), experiment: null } }; return s; };
    const good = { command: "runtime/bin/odg-v166-scenario-g-experiment.ts", args: ["docs/odg/evidence/V166_G_EXPERIMENT.json"], writeSet: ["docs/odg/evidence/V166_G_EXPERIMENT.json"] };
    {
      const p = mkPorts({ state: withTarget(good) });
      const rr = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      const dt = stepIn(p.trace, "EXECUTE").decision.dispatchTarget;
      check("GO-DT-1: declared target WITHOUT the unsandboxed opt-in ⇒ UNSANDBOXED_TARGET_NOT_OPTED_IN, 0 dispatch, limit recorded (out-of-scratch writes NOT CONFINED)", p.calls.dispatch === 0 && rr.status === "HALTED_AT_AUTHORIZATION_GATE" && dt.code === "UNSANDBOXED_TARGET_NOT_OPTED_IN" && dt.unsandboxedOptIn === false && /NOT CONFINED/.test(dt.sandbox.outOfScratchWrites) && /out-of-scratch writes/.test(GO.DISPATCH_TARGET_RULE));
    }
    for (const mode of ["DRY", "EXECUTE"]) {
      const p = mkPorts({ state: withTarget(good) });
      const rr = await GO.runGoCycle({ mode, allowUnsandboxedTarget: true }, p.ports);
      const d = (p.calls as any).dispatched || [];
      check(`GO-DT-1 ${mode}: declared target ⇒ exactly that command dispatched (NATIVE + isolated)`, mode === "DRY" ? (p.calls.dispatch === 0 && rr.status === "DRY_COMPLETE" && /declared target runtime\/bin\/odg-v166-scenario-g-experiment\.ts/.test(stepIn(p.trace, "EXECUTE").decision.scheduler.reason)) : (p.calls.dispatch === 1 && d.length === 1 && d[0].mission === "G" && d[0].target.command === good.command && d[0].target.args.join(" ") === good.args.join(" ") && rr.status === "EXECUTED_PASS" && p.trace.some((e: any) => e.kind === "DISPATCHED" && e.dispatchTarget && e.dispatchTarget.command === good.command)));
    }
    for (const [name, tgt] of [["command outside write_set", { ...good, command: "runtime/bin/odg-run.ts" }], ["target writeSet outside write_set", { ...good, writeSet: ["runtime/generated/x.json"] }], ["'..' escape", { ...good, command: "runtime/bin/../bin/odg-run.ts" }], ["absolute command", { ...good, command: "/usr/bin/env" }], ["arg starting with '-'", { ...good, args: ["--eval"] }], ["command starting with '-'", { ...good, command: "-e" }]] as any[]) {
      const p = mkPorts({ state: withTarget(tgt) });
      const rr = await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: true }, p.ports);
      const dt = stepIn(p.trace, "EXECUTE").decision.dispatchTarget;
      check(`GO-DT-1: ${name} ⇒ refused, 0 dispatch`, p.calls.dispatch === 0 && rr.status === "HALTED_AT_AUTHORIZATION_GATE" && dt && dt.ok === false && /OUTSIDE_WRITE_SET|INVALID_DISPATCH_TARGET/.test(dt.code));
    }
    for (const [name, bad] of [["sha mismatch (contract edited after inspection)", rec({ contractSha256: "0".repeat(64) })], ["REJECT", rec({ verdict: "REJECT" })], ["inspector session = author session", rec({ inspectorSessionId: g.revisionHistory[g.revisionHistory.length - 1].revisionAuthorSessionId })], ["no record", null]] as any[]) {
      const p = mkPorts({ state: withEv(bad) });
      const rr = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      check(`V166: ${name} ⇒ G NOT dispatched, M0 kept`, p.calls.dispatch === 0 && rr.status === "HALTED_AT_AUTHORIZATION_GATE" && stepIn(p.trace, "STRATEGY").decision.rule === "M0" && stepIn(p.trace, "AUTHORIZE").decision.scopedAuthorization.executionAuthorized === false);
    }
  }
  // 2. --execute on unauthorized work: still no dispatch
  {
    const { ports, trace, calls } = mkPorts();
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, ports);
    check("EXECUTE mode + unauthorized ⇒ gate holds, dispatchNative never called", r.status === "HALTED_AT_AUTHORIZATION_GATE" && calls.dispatch === 0 && stepIn(trace, "EXECUTE").status === "NOTHING_EXECUTED");
  }
  // 3. authorized NATIVE: DRY ⇒ WOULD_DISPATCH (no call); EXECUTE ⇒ exactly one dispatch; re-run ⇒ deduped
  {
    const S = authorizeG(BASE);
    const a = mkPorts({ state: S });
    const rd = await GO.runGoCycle({ mode: "DRY" }, a.ports);
    check("authorized + NATIVE + DRY ⇒ WOULD_DISPATCH, dispatch not called", stepIn(a.trace, "EXECUTE").status === "WOULD_DISPATCH" && a.calls.dispatch === 0 && rd.status === "DRY_COMPLETE");
    check("authorized ⇒ intelligence loop passes AUTHORIZE (external authorization only)", stepIn(a.trace, "AUTHORIZE").decision.selectedAuthorized === true && stepIn(a.trace, "STRATEGY").decision.mode === "NATIVE");
    const shared: any[] = [];
    const b = mkPorts({ state: S, trace: shared });
    const r1 = await GO.runGoCycle({ mode: "EXECUTE" }, b.ports);
    check("authorized + NATIVE + isolated + EXECUTE ⇒ exactly one dispatch, EXECUTED_PASS", b.calls.dispatch === 1 && r1.status === "EXECUTED_PASS" && shared.some((e) => e.kind === "DISPATCHED" && e.mission === "G"));
    check("GO-DT-1: plain AUTHORIZED contract keeps the existing path (no dispatch target required/passed)", (b.calls as any).dispatched[0].target === null && stepIn(b.trace, "EXECUTE").decision.dispatchTarget === null);
    const c = mkPorts({ state: S, trace: shared });
    const r2 = await GO.runGoCycle({ mode: "EXECUTE" }, c.ports);
    check("re-run with the same state: (runId, mission) already dispatched ⇒ NOT dispatched again", c.calls.dispatch === 0 && r2.runId === r1.runId && stepIn(shared.slice(shared.lastIndexOf(shared.filter((e: any) => e.kind === "CYCLE_START").pop())), "EXECUTE").status === "NOTHING_EXECUTED");
    const d = mkPorts({ state: S, isolation: () => ({ ok: false, reason: "no --scratch" }) });
    await GO.runGoCycle({ mode: "EXECUTE" }, d.ports);
    check("authorized but NOT isolated ⇒ refused (NO_ISOLATED_WORKSPACE), no dispatch", d.calls.dispatch === 0 && /NO_ISOLATED_WORKSPACE|no eligible|AUTHORIZATION_DENIED/.test(stepIn(d.trace, "EXECUTE").decision.scheduler.reason));
    const e = mkPorts({ state: S, dispatchResult: { verified: false, detail: "fixture FAIL" } });
    const re = await GO.runGoCycle({ mode: "EXECUTE" }, e.ports);
    check("failed execution ⇒ EXECUTED_FAIL + nextStrategyAfterFailure recorded (not executed)", re.status === "EXECUTED_FAIL" && !!stepIn(e.trace, "EXECUTE").decision.nextStrategyAfterFailure);
  }
  // 4. idempotent dry re-run
  {
    const shared: any[] = [];
    const r1 = await GO.runGoCycle({ mode: "DRY" }, mkPorts({ trace: shared }).ports);
    const s2 = clone(BASE_UNAUTH); s2.measured = BASE.measured; s2.attempts = { count: 9999, last: { status: "IDLE" } };   // volatile attempt-log growth
    const r2 = await GO.runGoCycle({ mode: "DRY" }, mkPorts({ trace: shared, state: s2 }).ports);
    check("re-run on the same state ⇒ same runId + decisionsDigest, idempotent=true, duplicateOf set", r2.runId === r1.runId && r2.decisionsDigest === r1.decisionsDigest && r2.idempotent === true && r2.duplicateOf && r2.duplicateOf.cycleSeq === 1 && r2.cycleSeq === 2);
    const s3 = authorizeG(BASE);
    const r3 = await GO.runGoCycle({ mode: "DRY" }, mkPorts({ trace: shared, state: s3 }).ports);
    check("changed state ⇒ different runId, not idempotent", r3.runId !== r1.runId && r3.idempotent === false);
  }
  // 5. stops: STOP port mid-cycle, canonical emergency stop, deadline, max steps, truth-lock refusal
  {
    let n = 0;
    const a = mkPorts({ stopRequested: () => ({ stop: ++n > 3, reason: "STOP_FILE", source: "/virtual/out/STOP" }) });
    const r = await GO.runGoCycle({ mode: "DRY" }, a.ports);
    const stop = a.trace.find((e: any) => e.kind === "STOP");
    check("STOP request mid-cycle ⇒ STOPPED after 3 steps, STOP entry before step 4, CYCLE_END STOPPED", r.status === "STOPPED" && stepsOf(a.trace).length === 3 && stop && stop.beforeStep === GO.STEPS[3] && stop.reason === "STOP_FILE" && a.trace[a.trace.length - 1].status === "STOPPED");
    process.env.ODG_SCHEDULER_STOP = "1";
    const b = mkPorts();
    const rb = await GO.runGoCycle({ mode: "DRY" }, b.ports);
    delete process.env.ODG_SCHEDULER_STOP;
    check("ODG_SCHEDULER_STOP=1 ⇒ STOPPED before TRUTH_LOCK, nothing read", rb.status === "STOPPED" && rb.stop.reason === "EMERGENCY_STOP" && stepsOf(b.trace).length === 0 && b.calls.readState === 0);
    let t = 0;
    const c = mkPorts({ now: () => (t += 400) });
    const rc = await GO.runGoCycle({ mode: "DRY", deadlineMs: 3000 }, c.ports);
    check("deadline ⇒ STOPPED (DEADLINE) with trace", rc.status === "STOPPED" && rc.stop.reason === "DEADLINE" && stepsOf(c.trace).length < 10 && c.trace.some((e: any) => e.kind === "STOP"));
    const d = mkPorts();
    const rd = await GO.runGoCycle({ mode: "DRY", maxSteps: 4 }, d.ports);
    check("max steps 4 ⇒ STOPPED (MAX_STEPS) after exactly 4 steps", rd.status === "STOPPED" && rd.stop.reason === "MAX_STEPS" && stepsOf(d.trace).length === 4);
    const e = mkPorts({ tl: TL_FAIL });
    const re = await GO.runGoCycle({ mode: "EXECUTE" }, e.ports);
    check("Truth-Lock refusal ⇒ STARTUP_REFUSED, state never read, nothing dispatched", re.status === "STARTUP_REFUSED" && e.calls.readState === 0 && e.calls.dispatch === 0 && stepsOf(e.trace).length === 1);
  }
  // 6. DECISION_REQUIRED (uncertainty above max) ⇒ no pick, downstream steps skipped
  {
    const s = clone(BASE_UNAUTH); s.measured = BASE.measured;
    s.sources.v150.data.summary.top10NextInternal = []; s.sources.v150.data.summary.alsoInternal = [];   // strategic criteria unmeasured ⇒ uncertainty > max
    const a = mkPorts({ state: s });
    const r = await GO.runGoCycle({ mode: "EXECUTE" }, a.ports);
    const sel = stepIn(a.trace, "SELECT").decision;
    check("uncertain leader ⇒ DECISION_REQUIRED kept, selected=null, proposed recorded (no pick)", sel.decision === "DECISION_REQUIRED" && sel.selected === null && sel.proposed === "H");
    check("DECISION_REQUIRED ⇒ HALTED_DECISION_REQUIRED, DECOMPOSE/STRATEGY skipped, no dispatch", r.status === "HALTED_DECISION_REQUIRED" && stepIn(a.trace, "DECOMPOSE").status === "SKIPPED" && stepIn(a.trace, "STRATEGY").status === "SKIPPED" && a.calls.dispatch === 0);
  }
  // 8. V166 GO-ACT-1: strategic vs actionable selection (authorization = feasibility, priority = ranking)
  {
    const AS = require("./odg-authorization-scope.js");
    const contractIn = (s: any, id: string) => s.sources.contracts.data.contracts.find((x: any) => x.scenario === id);
    const plainAuth = (s0: any, ids: string[]) => { const s = clone(s0); s.measured = s0.measured; for (const id of ids) { const c = contractIn(s, id); c.state = "AUTHORIZED"; c.authorizedBy = "owner (test fixture)"; delete c.authorization; } return s; };
    const g = contractIn(BASE_LIVE, "G");
    const accept = { scenario: "G", verdict: "ACCEPT", contractSha256: AS.contractSha256(g), inspector: "independent inspector (test fixture)", inspectorSessionId: "inspector-sid-test", authorSessionId: g.revisionHistory[g.revisionHistory.length - 1].revisionAuthorSessionId, inspectedHeadSha: FIXTURE_HEAD };   // V16.9 R7: was 'c'×40 (never checked); now the harness-declared fixture head
    const liveWithAccept = (() => { const s = clone(BASE_PRE_V168); s.measured = BASE_LIVE.measured; s.authorizationEvidence = { G: { inspection: accept, experiment: null } }; return s; })();
    // V16.9 R7: the SAME record with an undeclared, non-existent head ('c'×40) ⇒ WRONG_COMMIT ⇒ G NOT actionable, nothing dispatched
    {
      const ghost = (() => { const s = clone(BASE_PRE_V168); s.measured = BASE_LIVE.measured; s.authorizationEvidence = { G: { inspection: { ...accept, inspectedHeadSha: "c".repeat(40) }, experiment: null } }; return s; })();
      const p = mkPorts({ state: ghost });
      const r = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      const sel = stepIn(p.trace, "SELECT").decision;
      const au = stepIn(p.trace, "AUTHORIZE").decision.scopedAuthorization;
      check("R7 in GO: inspection citing a NON-EXISTENT inspectedHeadSha ⇒ G stays at INSPECT_REVISED_CONTRACT (WRONG_COMMIT), experiments NOT authorized, no dispatch, no provider", sel.workingOn === "G" && au.currentStep === "INSPECT_REVISED_CONTRACT" && au.executionAuthorized === false && /R7 proof currency WRONG_COMMIT/.test(au.reason) && p.calls.dispatch === 0 && p.calls.provider === 0 && r.status === "HALTED_AT_AUTHORIZATION_GATE" && !p.trace.some((e: any) => e.kind === "DISPATCHED"));
      const np = (() => { const s = clone(BASE_PRE_V168); s.measured = BASE_LIVE.measured; s.authorizationEvidence = { G: { inspection: accept, experiment: null, probes: null } }; return s; })();
      const q = mkPorts({ state: np });
      await GO.runGoCycle({ mode: "EXECUTE" }, q.ports);
      const aq = stepIn(q.trace, "AUTHORIZE").decision.scopedAuthorization;
      check("R7 in GO: same valid record but NO probe injected ⇒ not verifiable ⇒ INSPECT not validated, experiments NOT authorized (fail-closed)", aq.currentStep === "INSPECT_REVISED_CONTRACT" && aq.executionAuthorized === false && /NO_PROBE/.test(aq.reason) && q.calls.dispatch === 0);
    }
    // 8a strategic H unauthorized + G scoped-authorized (RUN_CONTROLLED_EXPERIMENTS derived) ⇒ actionable G, owner request for H
    for (const mode of ["DRY", "EXECUTE"]) {
      const p = mkPorts({ state: liveWithAccept });
      const r = await GO.runGoCycle({ mode }, p.ports);
      const sel = stepIn(p.trace, "SELECT").decision;
      check(`GO-ACT ${mode}: strategicSelection kept verbatim (pre-V168 H fixture: TIE_EXPLAINED J/G/H ⇒ H, consistent with its register)`, sel.selected === "H" && sel.strategicSelection.selected === "H" && sel.strategicSelection.decision === "TIE_EXPLAINED" && sel.consistentWithCommittedRegisterEvidence === true);
      check(`GO-ACT ${mode}: actionableSelection = G (scoped step authorized), workingOn G, H excluded as NOT_AUTHORIZED_NOW`, sel.actionableSelection.item === "G" && sel.workingOn === "G" && sel.actionableSelection.proceedingWithActionable === true && sel.actionableSelection.basis.basis === "SCOPED_STEP_AUTHORIZED" && sel.actionableSelection.basis.step === "RUN_CONTROLLED_EXPERIMENTS" && sel.actionableSelection.selection.excludedNotAuthorizedNow.includes("H"));
      check(`GO-ACT ${mode}: owner request recorded for H ("owner — H PROPOSED"), rule text + provider authorship recorded`, !!sel.ownerRequest && sel.ownerRequest.item === "H" && /^owner — H PROPOSED/.test(sel.ownerRequest.authorizationNeeded) && sel.actionableSelection.rule === GO.ACTIONABLE_RULE && /ODG works on the best item it is allowed to do, and asks the owner for the best item overall/.test(sel.actionableSelection.rule) && /provider/.test(sel.actionableSelection.authoredBy) && stepIn(p.trace, "NEXT_SELECTION").decision.ownerRequest.item === "H" && r.selection.ownerRequest.item === "H");
      check(`GO-ACT ${mode}: G proceeds through STRATEGY (NATIVE) / AUTHORIZE (scoped) / EXECUTE (fail-closed NO_DISPATCH_TARGET: committed G declares none); H never dispatched`, stepIn(p.trace, "STRATEGY").decision.missionId === "AP-G" && stepIn(p.trace, "STRATEGY").decision.mode === "NATIVE" && stepIn(p.trace, "AUTHORIZE").decision.scopedAuthorization.executionAuthorized === true && !p.trace.some((e: any) => e.kind === "DISPATCHED" && e.mission === "H") && p.calls.provider === 0 && p.calls.dispatch === 0 && r.status === "HALTED_AT_AUTHORIZATION_GATE" && stepIn(p.trace, "EXECUTE").decision.dispatchTarget.code === "NO_DISPATCH_TARGET");
    }
    // 8b committed G (no inspection record yet; H pre-V168 fixture): G's current step INSPECT_REVISED_CONTRACT is authorized provider/docs work ⇒ G worked on, REPORTED, never dispatched
    {
      const p = mkPorts({ state: BASE_PRE_V168 });
      const r = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      const sel = stepIn(p.trace, "SELECT").decision;
      check("GO-ACT committed G + pre-V168 H fixture: strategic H, actionable G (INSPECT_REVISED_CONTRACT, provider/docs), owner request H, no dispatch", sel.selected === "H" && sel.workingOn === "G" && sel.actionableSelection.basis.step === "INSPECT_REVISED_CONTRACT" && sel.actionableSelection.basis.executionAuthorized === false && sel.ownerRequest.item === "H" && p.calls.dispatch === 0 && r.status === "HALTED_AT_AUTHORIZATION_GATE" && /not native dispatch/.test(stepIn(p.trace, "AUTHORIZE").decision.scopedAuthorization.report));
    }
    // 8c both unauthorized ⇒ halt as today (strategic item kept, owner request recorded, nothing dispatched)
    {
      const p = mkPorts({ state: BASE_UNAUTH });
      const r = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      const sel = stepIn(p.trace, "SELECT").decision;
      check("GO-ACT both unauthorized ⇒ no actionable item, workingOn H, HALTED_AT_AUTHORIZATION_GATE, owner request H, no dispatch", sel.actionableSelection.item === null && sel.workingOn === "H" && sel.actionableSelection.proceedingWithActionable === false && sel.ownerRequest.item === "H" && r.status === "HALTED_AT_AUTHORIZATION_GATE" && p.calls.dispatch === 0 && stepIn(p.trace, "AUTHORIZE").decision.intelligenceLoop.proposedOnly === true);
    }
    // 8d strategic authorized ⇒ same as today (actionable = strategic, no owner request)
    {
      const S = plainAuth(BASE_UNAUTH, ["H", "G"]);
      const p = mkPorts({ state: S });
      const r = await GO.runGoCycle({ mode: "DRY" }, p.ports);
      const sel = stepIn(p.trace, "SELECT").decision;
      check("GO-ACT strategic H authorized ⇒ actionable = strategic (sameAsStrategic), no owner request, works on H", sel.selected === "H" && sel.workingOn === "H" && sel.actionableSelection.selection.sameAsStrategic === true && sel.actionableSelection.proceedingWithActionable === false && sel.ownerRequest === null && stepIn(p.trace, "AUTHORIZE").decision.selectedAuthorized === true && r.selection.ownerRequest === null && p.calls.dispatch === 0);
    }
    // 8e owner-gated never actionable (even with an AUTHORIZED contract)
    {
      const S = plainAuth(BASE_UNAUTH, ["G"]);
      const cg = contractIn(S, "G"); cg.WORK_ITEM_CONTRACT.objective = String(cg.WORK_ITEM_CONTRACT.objective) + " — requires a production deploy";
      const reg = require("./odg-strategic-register.js").buildRegister(S.sources);
      const itG = reg.items.find((it: any) => it.id === "G");
      const a = GO.actionabilityOf(S, itG);
      check("GO-ACT owner-gated item (OWN-1) with AUTHORIZED contract ⇒ NOT actionable", itG.requiresOwnerAuthorization === true && a.actionable === false && /owner-gated/.test(a.reason));
      const p = mkPorts({ state: S });
      const r = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      const sel = stepIn(p.trace, "SELECT").decision;
      check("GO-ACT owner-gated never auto-selected as actionable ⇒ halt as today, no dispatch", sel.actionableSelection.item !== "G" && sel.workingOn !== "G" && p.calls.dispatch === 0 && r.status === "HALTED_AT_AUTHORIZATION_GATE");
      check("GO-ACT PROPOSED is never actionable", GO.actionabilityOf(BASE_UNAUTH, { id: "H", requiresOwnerAuthorization: false }).actionable === false);
    }
    // 8f ties propagate: J and G both authorized and tied (secondary rules cannot isolate) ⇒ actionable DECISION_REQUIRED kept, no id pick, halt
    {
      const S = plainAuth(BASE_UNAUTH, ["J", "G"]);
      const p = mkPorts({ state: S });
      const r = await GO.runGoCycle({ mode: "EXECUTE" }, p.ports);
      const as = stepIn(p.trace, "SELECT").decision.actionableSelection;
      check("GO-ACT tie J/G among actionable ⇒ DECISION_REQUIRED propagated verbatim (tiedSet J,G), no pick, H kept, no dispatch", as.selection.decision === "DECISION_REQUIRED" && as.selection.tiedSet.join(",") === "J,G" && as.item === null && stepIn(p.trace, "SELECT").decision.workingOn === "H" && p.calls.dispatch === 0 && r.status === "HALTED_AT_AUTHORIZATION_GATE");
    }
  }
  // 7. writer confinement + provider never launched (source scan)
  {
    const t = (fn: () => void) => { try { fn(); return null; } catch (e: any) { return String(e.message); } };
    check("write into main checkout runtime/generated ⇒ FORBIDDEN_WRITE", /FORBIDDEN_WRITE/.test(String(t(() => GO.assertConfinedWrite("/main/runtime/generated/x.json", "/main/runtime/generated", ["/main/runtime/generated"], path)))));
    check("write into main checkout runtime/dist ⇒ FORBIDDEN_WRITE", /FORBIDDEN_WRITE/.test(String(t(() => GO.assertConfinedWrite("/main/runtime/dist/a.js", "/out", ["/main/runtime/dist"], path)))));
    check("write outside the out dir ⇒ WRITE_OUTSIDE_OUT_DIR", /WRITE_OUTSIDE_OUT_DIR/.test(String(t(() => GO.assertConfinedWrite("/out-evil/x", "/out", [], path)))));
    check("'..' escape is resolved and refused", /WRITE_OUTSIDE_OUT_DIR/.test(String(t(() => GO.assertConfinedWrite("/out/../etc/x", "/out", [], path)))));
    check("write inside the out dir is allowed", t(() => GO.assertConfinedWrite("/out/go-trace.jsonl", "/out", ["/main/runtime/generated"], path)) === null);
    const src = fs.readFileSync(path.join(__dirname, "odg-go-cycle.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    check("core has no child_process / fs / network / provider launch", !/require\(["'](child_process|fs|https?|net)["']\)/.test(src) && !/claude\s+-p|launchProvider|spawn\(/.test(src));
  }
  // 9. V16.9 Phase 1b — GO RESUME after a deadline stop (+ default deadline). Labelled fixture: G focus + a declared
  //    dispatch target (as in GO-DT-1) so EXECUTE really dispatches (fixture dispatch port, nothing runs).
  {
    const AS = require("./odg-authorization-scope.js");
    check("default deadline raised 120000 → 900000 ms (DEADLINE_HISTORY records old/new/cause)", GO.DEFAULTS.deadlineMs === 900000 && GO.DEADLINE_HISTORY.oldMs === 120000 && GO.DEADLINE_HISTORY.newMs === 900000 && /180\.1 s/.test(GO.DEADLINE_HISTORY.cause));
    const hTrace = fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V168_H_GO_EXECUTE_TRACE.jsonl"), "utf8").split("\n").filter(Boolean).map((l: string) => JSON.parse(l));
    const hr = GO.resumeFromTrace(hTrace);
    check("resumeFromTrace(committed H trace): STOPPED on DEADLINE before EVIDENCE ⇒ resumable, first incomplete step EVIDENCE, 8 completed, H dispatched", hr.resumable === true && hr.firstIncompleteStep === "EVIDENCE" && hr.completedSteps.length === 8 && hr.stop.reason === "DEADLINE" && hr.dispatched.join() === "H");
    const g = BASE_LIVE.sources.contracts.data.contracts.find((x: any) => x.scenario === "G");
    const good = { command: "runtime/bin/odg-v166-scenario-g-experiment.ts", args: ["docs/odg/evidence/V166_G_EXPERIMENT.json"], writeSet: ["docs/odg/evidence/V166_G_EXPERIMENT.json"] };
    const mk = (extraProven: string[] = []) => { const s = focusG(BASE_LIVE); const c = s.sources.contracts.data.contracts.find((x: any) => x.scenario === "G"); c.authorization.dispatchTargets = { RUN_CONTROLLED_EXPERIMENTS: good };
      s.authorizationEvidence = { G: { inspection: { scenario: "G", verdict: "ACCEPT", contractSha256: AS.contractSha256(c), inspector: "fixture", inspectorSessionId: "inspector-sid-test", authorSessionId: g.revisionHistory[g.revisionHistory.length - 1].revisionAuthorSessionId, inspectedHeadSha: FIXTURE_HEAD }, experiment: null } };
      s.ledger = { ...s.ledger, proven: s.ledger.proven.concat(extraProven) }; return s; };
    // reference: one uninterrupted EXECUTE cycle on a fresh trace
    const ref = mkPorts({ state: mk() });
    const rref = await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: true }, ref.ports);
    // run 1: the clock jumps past the deadline while EXECUTE runs (like H: 180 s > 120 s) ⇒ STOPPED before EVIDENCE
    const trace: any[] = [];
    let t = 1_000_000; let jumped = false;
    const p1 = mkPorts({ state: mk(), trace, now: () => { if (!jumped && p1.calls.dispatch > 0) { jumped = true; t += 200_000; } return (t += 5); } });
    const r1 = await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: true, deadlineMs: 120000 }, p1.ports);
    check("resume fixture run 1: EXECUTE dispatched once, then DEADLINE before EVIDENCE ⇒ STOPPED (8 steps)", r1.status === "STOPPED" && r1.stop.reason === "DEADLINE" && p1.calls.dispatch === 1 && stepsOf(trace).length === 8 && /before EVIDENCE/.test(r1.stop.source));
    // run 2: --resume on the SAME state ⇒ resumes at EVIDENCE, EXECUTE carried over, NEVER re-dispatched
    const n1 = trace.length;
    const p2 = mkPorts({ state: mk(), trace });
    const r2 = await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: true, resume: true }, p2.ports);
    const t2 = trace.slice(n1);
    const rsm = t2.find((e: any) => e.kind === "RESUME");
    const st2 = stepsOf(t2);
    check("resume run 2: RESUME entry resumed=true (state digest unchanged), first incomplete step EVIDENCE, reason recorded", !!rsm && rsm.resumed === true && rsm.firstIncompleteStep === "EVIDENCE" && rsm.priorRunId === rsm.runId && /state digest unchanged/.test(rsm.reason));
    check("resume run 2: EXECUTE NOT re-run — carried over (CARRIED_OVER_NOT_REDISPATCHED, EXECUTED_PASS), 0 dispatch call in this run, no DISPATCHED entry", p2.calls.dispatch === 0 && !t2.some((e: any) => e.kind === "DISPATCHED") && st2.find((e: any) => e.step === "EXECUTE").resumed.mode === "CARRIED_OVER_NOT_REDISPATCHED" && st2.find((e: any) => e.step === "EXECUTE").status === "EXECUTED_PASS");
    check("resume run 2: completed pure steps re-derived IDENTICAL, EVIDENCE + NEXT_SELECTION run fresh, cycle completes (10 steps, EXECUTED_PASS)", ["PROBLEMS_OPPORTUNITIES", "SELECT", "DECOMPOSE", "STRATEGY", "AUTHORIZE"].every((x) => st2.find((e: any) => e.step === x).resumed.mode === "REDERIVED_IDENTICAL") && !st2.find((e: any) => e.step === "EVIDENCE").resumed && st2.length === 10 && r2.status === "EXECUTED_PASS" && r2.resume.resumed === true && r2.resume.carriedOver.join() === "EXECUTE");
    check("resume run 2: decisions digest = the uninterrupted reference cycle's digest (idempotence preserved)", r2.decisionsDigest === rref.decisionsDigest && rref.status === "EXECUTED_PASS" && ref.calls.dispatch === 1);
    // run 3: --resume after a COMPLETE cycle ⇒ nothing to resume ⇒ fresh; same runId ⇒ dispatch guard ⇒ still 0 dispatch
    const n2 = trace.length;
    const p3 = mkPorts({ state: mk(), trace });
    await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: true, resume: true }, p3.ports);
    const rs3 = trace.slice(n2).find((e: any) => e.kind === "RESUME");
    check("resume after a complete cycle ⇒ not resumable (reason recorded) ⇒ fresh cycle; the (runId, G) dispatch guard still refuses a 2nd dispatch", rs3.resumed === false && /completed all 10 steps|not STOPPED/.test(rs3.reason) && p3.calls.dispatch === 0);
    // run 4: interrupted cycle, state CHANGED (ledger proven set differs ⇒ new runId) ⇒ fresh, says why (DRY: nothing dispatched)
    const tr4 = trace.slice(0, n1);
    const p4 = mkPorts({ state: mk(["M0099"]), trace: tr4 });
    await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: false, resume: true }, p4.ports);
    const rs4 = tr4.find((e: any) => e.kind === "RESUME");
    check("resume with a CHANGED state digest ⇒ fresh cycle, RESUME says 'state digest changed', no step marked resumed", rs4.resumed === false && /state digest changed/.test(rs4.reason) && !stepsOf(tr4.slice(n1)).some((e: any) => e.resumed));
    // run 5: killed DURING EXECUTE after DISPATCHED (no EXECUTE step, no CYCLE_END) ⇒ resumed at EXECUTE, mission NOT re-dispatched
    const cut = trace.findIndex((e: any) => e.kind === "DISPATCHED");
    const tr5 = trace.slice(0, cut + 1);
    const plan5 = GO.resumeFromTrace(tr5);
    const p5 = mkPorts({ state: mk(), trace: tr5 });
    await GO.runGoCycle({ mode: "EXECUTE", allowUnsandboxedTarget: true, resume: true }, p5.ports);
    check("killed after DISPATCHED (no CYCLE_END) ⇒ resumable at EXECUTE; EXECUTE re-runs but the (runId, G) guard refuses re-dispatch (0 dispatch)", plan5.resumable === true && plan5.firstIncompleteStep === "EXECUTE" && plan5.dispatched.join() === "G" && p5.calls.dispatch === 0 && tr5.find((e: any) => e.kind === "RESUME").resumed === true);
    // run 6: resume requested on an empty trace ⇒ fresh
    const p6 = mkPorts({ state: mk() });
    await GO.runGoCycle({ mode: "DRY", resume: true }, p6.ports);
    check("resume on an empty trace ⇒ not resumable ⇒ fresh cycle (reason recorded)", p6.trace.find((e: any) => e.kind === "RESUME").resumed === false && /no prior GO cycle/.test(p6.trace.find((e: any) => e.kind === "RESUME").reason));
  }
  if (failures) { process.stdout.write(`\n${failures} FAILED\n`); process.exit(1); }
  process.stdout.write("\nall odg-go-cycle tests passed\n");
})().catch((e) => { process.stdout.write(`NOT OK - threw ${e && e.stack}\n`); process.exit(1); });
export {};
