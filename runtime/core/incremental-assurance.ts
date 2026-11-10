#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V88 — INTELLIGENT INCREMENTAL ASSURANCE. PURE, deterministic. Every change triggers an IMPACT ANALYSIS,
 * only the AFFECTED evidence is invalidated, and intact validations are REUSED when their validity is demonstrated — no
 * mandatory control is ever removed. It COMPOSES existing canonical mechanisms (no second truth-graph / evidence registry
 * / certification engine):
 *   - change-impact-graph.impactOf    — dependency closure + impacted tests (§3/§7 test selection).
 *   - verified-result-cache.lookup    — reuse ⟺ FULL-identity match (inputs+code+deps+config+env) + fresh + provenance (§6).
 *   - evidence-provenance.contentDigest — content hashing / change detection (§4).
 * Verdict vocabulary (§6): VALIDATED_NOW | REVALIDATED | REUSED_VALID_EVIDENCE | INVALIDATED | NOT_MEASURED | BLOCKED.
 * Adaptive depth (§8): L1 targeted, L2 dependency, L3 transversal (contract/primitive/permission/executor/integration),
 * L4 critical (authority/security/governance/inspection/certification/recovery/production) — auto-escalates on anomaly/
 * contradiction/unknown-dependency. FAIL-CLOSED: if reuse validity cannot be established ⇒ INVALIDATED (re-run), and an
 * unknown dependency ⇒ widen the perimeter. It takes no closure decision and creates no authorizer. Dual export.
 */

const IMPACT = require("./change-impact-graph");
const CACHE = require("./verified-result-cache");
const PROV = require("./evidence-provenance");

const VERDICT = Object.freeze(["VALIDATED_NOW", "REVALIDATED", "REUSED_VALID_EVIDENCE", "INVALIDATED", "NOT_MEASURED", "BLOCKED"]);
const CHANGE_KINDS = Object.freeze(["function", "contract", "permission", "inspector", "executor", "config", "doc", "dependency", "unknown"]);
// §8 depth per change kind (fail-closed: unknown ⇒ L4).
const DEPTH_FOR: any = Object.freeze({ doc: 1, function: 1, dependency: 2, contract: 3, executor: 3, permission: 4, inspector: 4, config: 3, unknown: 4 });

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function digest(x: any): string { return PROV.contentDigest(x); }
// conservative normalization for format-only detection — strips ONLY provably-inert trailing whitespace + blank lines.
// NEVER strips comments/tokens (a "semantic change hidden by identical format" must still change the RAW digest).
function normalizeInert(s: string): string { return String(s).split("\n").map((l) => l.replace(/[ \t]+$/,"")).filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n"); }

/* classifyChange(change) -> { kind, depth, semantic }. semantic ∈ NONE | FORMAT_ONLY | DOC_ONLY | FUNCTIONAL.
 * FUNCTIONAL whenever the raw content digest changed and it is not a pure doc/whitespace change — fail-closed to FUNCTIONAL. */
function classifyChange(change: any): any {
  const c = isObj(change) ? change : {};
  const kind = CHANGE_KINDS.includes(c.kind) ? c.kind : "unknown";
  let depth = DEPTH_FOR[kind] || 4;
  if (c.anomaly === true || c.contradiction === true || c.unknownDependency === true) depth = 4;   // auto-escalate (§8)
  const prior = c.prior && typeof c.prior.content === "string" ? c.prior.content : null;
  const next = c.next && typeof c.next.content === "string" ? c.next.content : null;
  let semantic = "FUNCTIONAL";
  if (prior !== null && next !== null) {
    if (digest(prior) === digest(next)) semantic = "NONE";
    else if (digest(normalizeInert(prior)) === digest(normalizeInert(next))) semantic = (kind === "doc") ? "DOC_ONLY" : "FORMAT_ONLY";
    else semantic = (kind === "doc") ? "DOC_ONLY" : "FUNCTIONAL";
  } else if (kind === "doc") semantic = "DOC_ONLY";
  return Object.freeze({ kind, depth, semantic });
}

/* impactClosure(change, opts) -> { modules, tests, widened }. Uses the supplied closure when present; otherwise computes
 * via change-impact-graph. Fail-closed: an unknown dependency widens the perimeter (modules/tests marked widened). */
function impactClosure(change: any, opts: any = {}): any {
  const c = isObj(change) ? change : {};
  const o = isObj(opts) ? opts : {};
  let modules = arr(c.impactedModules).slice();
  let tests = arr(c.impactedTests).slice();
  let widened = false;
  if ((modules.length === 0 || tests.length === 0) && typeof o.root === "string" && typeof c.changedModule === "string") {
    try { const rep = IMPACT.impactOf(o.root, c.changedModule); modules = Array.from(new Set(modules.concat(rep.transitiveClosure, rep.consumers))); tests = Array.from(new Set(tests.concat(rep.impactedTests))); if (rep.closureHazards && (rep.closureHazards.dynamicRequire || rep.closureHazards.externalRequire)) widened = true; } catch { widened = true; }
  }
  if (c.changedModule && !modules.includes(c.changedModule)) modules.push(c.changedModule);
  if (c.unknownDependency === true) widened = true;               // §3 — widen prudently when a dependency is unknown
  return Object.freeze({ modules: Array.from(new Set(modules)).sort(), tests: Array.from(new Set(tests)).sort(), widened });
}

/* evidenceVerdict(e, change, closure, cls) -> { id, verdict, cause }. The §5/§6 core decision per prior evidence. */
function evidenceVerdict(e: any, change: any, closure: any, cls: any): any {
  const ev = isObj(e) ? e : {};
  const id = ev.id || null;
  // contradiction ⇒ BLOCKED (§11 contradictory evidence blocks).
  if (ev.contradiction === true) return { id, verdict: "BLOCKED", cause: "contradictory evidence ⇒ BLOCKED (never reused)" };
  // missing identity/provenance ⇒ cannot establish reuse validity ⇒ fail-closed NOT_MEASURED (must re-run).
  if (!isObj(ev.identity) || typeof ev.provenance !== "string" || !ev.provenance) return { id, verdict: "NOT_MEASURED", cause: "no full identity/provenance ⇒ reuse validity undemonstrable ⇒ re-run (fail-closed)" };
  // inspector-version change invalidates evidence that depended on it (§9).
  if (cls.kind === "inspector" && ev.inspectorDependent === true) return { id, verdict: "INVALIDATED", cause: "inspector changed ⇒ its meta-validation + dependent certifications invalidated (§9)" };
  // the changed module itself, or anything in its impact closure, is invalidated with the specific §5 cause.
  const inClosure = closure.modules.includes(ev.forModule);
  const isChanged = ev.forModule === change.changedModule;
  if (isChanged || inClosure) {
    const cause = isChanged
      ? `${cls.kind} '${change.changedModule}' changed ⇒ its own evidence/tests invalidated (§5)`
      : `'${ev.forModule}' is in the impact closure of '${change.changedModule}' (${cls.kind}) ⇒ transitively invalidated (§5)`;
    // a DOC_ONLY change to a doc artifact does not invalidate FUNCTIONAL evidence of the same module (§4/§12).
    if (cls.semantic === "DOC_ONLY" && isChanged && ev.evidenceKind !== "doc") return { id, verdict: "REUSED_VALID_EVIDENCE", cause: "doc-only change ⇒ functional evidence unaffected (reused with provenance)" };
    return { id, verdict: "INVALIDATED", cause };
  }
  // identity digest must still match what was validated (content/deps/config/env unchanged).
  const identityNow = CACHE.identityDigest(ev.identity);
  if (identityNow === null) return { id, verdict: "NOT_MEASURED", cause: "identity incomplete ⇒ cannot verify reuse ⇒ re-run (fail-closed)" };
  if (typeof ev.identityDigest === "string" && ev.identityDigest !== identityNow) return { id, verdict: "INVALIDATED", cause: "evidence identity digest changed ⇒ stale ⇒ invalidated" };
  if (ev.stale === true) return { id, verdict: "INVALIDATED", cause: "evidence marked stale/expired ⇒ refuse reuse (§6)" };
  // demonstrated reuse: outside impact closure + identity intact + provenance + inspector still qualified.
  if (ev.inspectorDependent === true && ev.inspectorQualified !== true) return { id, verdict: "INVALIDATED", cause: "dependent inspector not currently qualified ⇒ cannot reuse (§9)" };
  return { id, verdict: "REUSED_VALID_EVIDENCE", cause: "exact identity + provenance + outside impact closure + inspector qualified ⇒ reused (§6)" };
}

/* assess(change, priorEvidence, opts) -> the full incremental decision. */
function assess(change: any, priorEvidence: any, opts: any = {}): any {
  const c = isObj(change) ? change : {};
  const cls = classifyChange(c);
  const closure = impactClosure(c, opts);
  const evidence = arr(priorEvidence).map((e) => evidenceVerdict(e, c, closure, cls));
  const invalidated = evidence.filter((e) => e.verdict === "INVALIDATED");
  const reused = evidence.filter((e) => e.verdict === "REUSED_VALID_EVIDENCE");
  const blocked = evidence.filter((e) => e.verdict === "BLOCKED");
  const notMeasured = evidence.filter((e) => e.verdict === "NOT_MEASURED");

  // §7 — minimal sufficient test set: impacted tests ∪ tests of invalidated/not-measured evidence; mandatory tests at L≥3/4 always kept.
  const fromImpact = closure.tests.slice();
  const fromInvalid = invalidated.concat(notMeasured).map((e: any) => `${e.id}`);
  let testsToRun = Array.from(new Set(fromImpact.concat(fromInvalid)));
  // mandatory controls never skipped (§8/§10): security/permission/governance/inspection/certification/recovery at depth≥3.
  const mandatory = arr(c.mandatoryTests);
  if (cls.depth >= 3) testsToRun = Array.from(new Set(testsToRun.concat(mandatory)));

  // FAIL-CLOSED BROADENING (§8/§10/§14): the engine must NEVER select ZERO controls for a real change or a transversal/
  // critical/widened case — an empty selection on such a change is a false-optimization DEFECT, not a win. L4 ⇒ full
  // control; L3 or widened with nothing precise ⇒ full control; a FUNCTIONAL change with no determinable tests ⇒ widen.
  let fullSuite = false;
  // §8 — only L1 (targeted) and L2 (dependency) are REDUCIBLE tiers. L3 transversal (shared contract/primitive/executor/
  // integration) and L4 critical (authority/security/governance/inspection/certification/recovery/production) run the
  // FULL control perimeter — a core-contract impact set cannot be trusted as narrow (fail-closed; no under-minimization).
  if (cls.depth >= 3) fullSuite = true;
  if (closure.widened && testsToRun.length === 0) fullSuite = true;                       // unknown dependency ⇒ widen
  if (cls.semantic === "FUNCTIONAL" && testsToRun.length === 0) fullSuite = true;         // real change, no determinable tests ⇒ widen
  if (fullSuite) testsToRun = ["<FULL_SUITE>"];                                           // signal: run the full gate (never 0 on a real/critical change)

  // tests avoided = prior tests whose evidence was REUSED and which are NOT otherwise required.
  const runSet = new Set(testsToRun);
  const testsAvoided = fullSuite ? [] : reused.map((e: any) => `${e.id}`).filter((t: string) => !runSet.has(t));

  // overall: BLOCKED if any contradiction; else REVALIDATED/VALIDATED when re-runs needed; REUSED when nothing to run.
  let overall: string;
  if (blocked.length > 0) overall = "BLOCKED";
  else if (notMeasured.length > 0 && testsToRun.length === 0) overall = "NOT_MEASURED";
  else if (testsToRun.length === 0 && reused.length > 0) overall = "REUSED_VALID_EVIDENCE";
  else if (invalidated.length === 0 && reused.length > 0) overall = "REVALIDATED";
  else overall = "VALIDATED_NOW";

  return Object.freeze({
    change: cls, closure,
    evidence, counts: { invalidated: invalidated.length, reused: reused.length, blocked: blocked.length, notMeasured: notMeasured.length },
    testsToRun: testsToRun.sort(), testsAvoided: testsAvoided.sort(), fullSuite,
    depthLevel: cls.depth, widened: closure.widened || fullSuite,
    // BLOCKED (contradiction) always wins over a fullSuite re-run signal (fail-closed; a contradiction is never promoted).
    overall: blocked.length > 0 ? "BLOCKED" : (fullSuite ? "VALIDATED_NOW" : overall),
    metrics: { testsSelected: testsToRun.length, testsAvoided: testsAvoided.length, evidenceReused: reused.length, evidenceInvalidated: invalidated.length },
    note: "only AFFECTED evidence invalidated; intact validations reused with provenance; no mandatory control removed; fail-closed on undemonstrable reuse / unknown dependency",
  });
}

const INCREMENTAL_ASSURANCE_CONTRACT = Object.freeze({
  id: "V88-INCREMENTAL-ASSURANCE",
  source: "CTO V88 — intelligent incremental assurance (impact analysis → targeted invalidation → demonstrated reuse)",
  verdicts: VERDICT, changeKinds: CHANGE_KINDS, depthLevels: Object.freeze([1, 2, 3, 4]),
  reuses: Object.freeze(["change-impact-graph.impactOf", "verified-result-cache.lookup/identityDigest", "evidence-provenance.contentDigest"]),
  notAuthority: "computes impact + reuse/invalidation decisions; it runs no test, certifies nothing, grants no authority",
  invariants: Object.freeze([
    "every change ⇒ impact analysis; ONLY affected evidence invalidated; independent components' evidence not touched",
    "reuse (REUSED_VALID_EVIDENCE) ⟺ exact identity + provenance + outside impact closure + inspector still qualified; else re-run",
    "fail-closed: undemonstrable reuse ⇒ INVALIDATED/NOT_MEASURED; unknown dependency ⇒ widen the perimeter",
    "a semantic change is caught (raw digest differs); only provably-inert whitespace/doc changes are FORMAT_ONLY/DOC_ONLY",
    "no mandatory control removed (security/permission/governance/inspection kept at depth≥3); depth auto-escalates on anomaly/contradiction/unknown",
    "a reused proof keeps its provenance/history and is NEVER presented as a newly executed test",
    "pure/deterministic; composes existing mechanisms; no second evidence registry / truth graph / certification engine",
  ]),
});

module.exports = { VERDICT, CHANGE_KINDS, DEPTH_FOR, classifyChange, impactClosure, evidenceVerdict, assess, INCREMENTAL_ASSURANCE_CONTRACT };

if (require.main === module) {
  const demo = assess(
    { changedModule: "a", kind: "function", impactedModules: ["a", "b"], impactedTests: ["a.test.ts", "b.test.ts"],
      prior: { content: "function f(){return 1}" }, next: { content: "function f(){return 2}" } },
    [
      { id: "a.test.ts", forModule: "a", identity: { inputs: 1, code: "x", deps: 1, config: 1, env: 1 }, provenance: "p" },
      { id: "z.test.ts", forModule: "z", identity: { inputs: 1, code: "y", deps: 1, config: 1, env: 1 }, provenance: "p", identityDigest: CACHE.identityDigest({ inputs: 1, code: "y", deps: 1, config: 1, env: 1 }) },
    ]);
  process.stdout.write(JSON.stringify({ ...INCREMENTAL_ASSURANCE_CONTRACT, demo: { overall: demo.overall, run: demo.testsToRun, avoided: demo.testsAvoided, counts: demo.counts } }, null, 2) + "\n");
}

export {};
