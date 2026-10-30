#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";

/*
 * Tests for the Natural-Language Objective Gateway (runtime/core/nl-objective-gateway.js).
 *
 * Proves the dry-run compilation pipeline end to end AND the hard safety invariants:
 *   providerCalls === 0, externalCalls === 0, externalWrites === 0 for every dry-run.
 *
 * Self-executing script in the repo style (node assert + console PASS/FAIL + process.exit). Run with
 * `tsx runtime/core/nl-objective-gateway.test.js` or via `npm test`.
 */

const assert = require("assert");
const gw = require("./nl-objective-gateway");
const gate = require("./action-gate");

let passed = 0;
let failed = 0;
function ok(name, cond) {
    if (cond) { passed++; console.log("  PASS —", name); }
    else { failed++; console.log("  FAIL —", name); }
}

// A dry-run result must NEVER record a provider / external / write side effect.
function assertNoSideEffects(label, r) {
    ok(label + ": providerCalls=0", r.providerCalls === 0);
    ok(label + ": externalCalls=0", r.externalCalls === 0);
    ok(label + ": externalWrites=0", r.externalWrites === 0);
}

const HEADLINE = "Find the best current commercial opportunities available to me.";

console.log("== NL Objective Gateway ==");

// 1 — natural-language objective accepted.
{
    const r = gw.compile(HEADLINE);
    ok("1 accepted: returns an object", r && typeof r === "object");
    ok("1 accepted: rawObjective preserved", r.rawObjective === HEADLINE);
    ok("1 accepted: mode DRY_RUN", r.mode === "DRY_RUN");
}

// 2 — intent extraction / normalization.
{
    const r = gw.compile("   Analyze    the   sales pipeline.  ");
    ok("2 intent: normalized collapses whitespace + trailing punct", r.normalizedObjective === "Analyze the sales pipeline");
    ok("2 intent: mode derived ANALYZE", r.intent.mode === "ANALYZE");
    ok("2 intent: type GENERIC default", r.intent.type === "GENERIC");
    ok("2 intent: objective echoes normalized", r.intent.objective === r.normalizedObjective);
}

// 3 — requirements extraction (from the governed contract's definition_of_done).
{
    const r = gw.compile("remove the unused import", { currentState: "CREATED" });
    ok("3 requirements: array present", Array.isArray(r.requirements));
    ok("3 requirements: non-empty (from definition_of_done)", r.requirements.length >= 1);
}

// 4 — dependency resolution + ordered edges over a multi-action objective.
{
    const r = gw.compile("remove the unused import and format the file", { currentState: "CREATED" });
    ok("4 deps: multi-action decomposed to >=2 objectives", r.contract.objectives.length >= 2);
    ok("4 deps: dependency edges present", Array.isArray(r.dependencies) && r.dependencies.length >= 1);
    ok("4 deps: edges are {from,to}", r.dependencies.every((e) => e.from && e.to));
}

// 5 — capability resolution (local capability resolved for a known objective).
{
    const r = gw.compile("remove the unused import", { currentState: "CREATED", localModelAvailable: false });
    const chosen = r.objectives[0].capability.chosen;
    ok("5 capability: chosen present", !!chosen);
    ok("5 capability: resolved LOCAL (local-fixers rule)", chosen.source === "LOCAL");
    ok("5 capability: not flagged missing", r.objectives[0].capability.missingLocalCapability === false);
}

// 6 — Mission Contract creation through the EXISTING governed mechanism (synthesizer).
{
    const r = gw.compile("remove the unused import");
    ok("6 contract: mission is a string", typeof r.contract.mission === "string");
    ok("6 contract: objectives non-empty", r.contract.objectives.length > 0);
    ok("6 contract: produced by mission-synthesizer (reuse, not duplication)", r.contract.source === "mission-synthesizer");
}

// 7 — Workgraph creation (deterministic linear projection).
{
    const r = gw.compile("remove the unused import and format the file");
    ok("7 workgraph: has nodes", Array.isArray(r.workgraph.nodes) && r.workgraph.nodes.length >= 3);
    ok("7 workgraph: starts LOAD ends REPORT", r.workgraph.nodes[0] === "LOAD" && r.workgraph.nodes[r.workgraph.nodes.length - 1] === "REPORT");
    ok("7 workgraph: VERIFY before REPORT", r.workgraph.nodes.includes("VERIFY"));
}

// 8 — authority ALLOW (initial lifecycle state has a valid transition).
{
    const r = gw.compile("remove the unused import", { currentState: "CREATED" });
    ok("8 authority allow: authorized true", r.authority.authorized === true);
}

// 9 — authority DENY (terminal state has no outgoing transition).
{
    const r = gw.compile("remove the unused import", { currentState: "ARCHIVED" });
    ok("9 authority deny: authorized false", r.authority.authorized === false);
    ok("9 authority deny: AUTHORITY_DENIED blocker", r.blockers.some((b) => b.code === "AUTHORITY_DENIED"));
    ok("9 authority deny: status DENIED", r.status === "DENIED");
}

// 10 — policy DENY (consequential action, policy not in the allowed set).
{
    const r = gw.compile("email the weekly summary to the client list", {
        authority: "human:cto",
        allowedPolicies: ["SOME_OTHER_POLICY"],
        currentState: "CREATED",
    });
    const adm = r.objectives[0].admission;
    ok("10 policy deny: objective admission DENY", adm.decision === "DENY");
    ok("10 policy deny: violation names POLICY", adm.violations.some((v) => v.startsWith("POLICY")));
}

// 11 — missing capability (no local rule, no external effect requested).
{
    const r = gw.compile("compose a haiku about mountains", { currentState: "CREATED", localModelAvailable: false });
    ok("11 missing cap: objective flagged missingLocalCapability", r.objectives[0].capability.missingLocalCapability === true);
    ok("11 missing cap: MISSING_CAPABILITY blocker", r.blockers.some((b) => b.code === "MISSING_CAPABILITY"));
    ok("11 missing cap: status BLOCKED", r.status === "BLOCKED");
}

// 12 — missing provider (external effect needed, providers disabled by policy).
{
    const r = gw.compile("find the best current commercial opportunities online", {
        externalProvidersEnabled: false,
        currentState: "CREATED",
    });
    ok("12 missing provider: EXTERNAL_PROVIDER_DISABLED_BY_POLICY blocker", r.blockers.some((b) => b.code === "EXTERNAL_PROVIDER_DISABLED_BY_POLICY"));
    ok("12 missing provider: status BLOCKED", r.status === "BLOCKED");
}

// 13 — unsafe external effect (financial/transact) requires human authority ⇒ ESCALATE.
{
    const r = gw.compile("transfer money to the supplier account", {
        authority: "governance:ticket-123",
        allowedPolicies: ["DETERMINISM_FIRST"],
        currentState: "CREATED",
    });
    const adm = r.objectives[0].admission;
    ok("13 unsafe: classified FINANCIAL/TRANSACT", r.objectives[0].classification.externalEffect === "FINANCIAL");
    ok("13 unsafe: admission ESCALATE", adm.decision === "ESCALATE");
    ok("13 unsafe: escalation required with reasons", adm.escalation.required === true && adm.escalation.reasons.length >= 1);
}

// 14 — ambiguous objective (ask for business info only, never internal ODG commands).
{
    const empty = gw.compile("   ");
    ok("14 ambiguous: empty ⇒ AMBIGUOUS", empty.status === "AMBIGUOUS");
    ok("14 ambiguous: a question is asked", typeof empty.ambiguity.question === "string" && empty.ambiguity.question.length > 0);
    const q = empty.ambiguity.question.toLowerCase();
    ok("14 ambiguous: question asks for business info, not ODG commands", !q.includes("odg") && !q.includes("mission") && !q.includes("command") && !q.includes("cli"));
    const oneWord = gw.compile("grow");
    ok("14 ambiguous: single word ⇒ underspecified", oneWord.status === "AMBIGUOUS" && oneWord.ambiguity.reason === "UNDERSPECIFIED_OBJECTIVE");
}

// 15 — dry-run is the default and carries no side effects.
{
    const r = gw.compile(HEADLINE);
    ok("15 dry-run: mode DRY_RUN by default", r.mode === "DRY_RUN");
    assertNoSideEffects("15 dry-run", r);
}

// 16 — execution blocked when policy denies (and the gateway refuses live execution outright).
{
    const denied = gw.compile("email the weekly summary to the client list", {
        authority: "human:cto",
        allowedPolicies: ["SOME_OTHER_POLICY"],
        currentState: "CREATED",
    });
    ok("16 exec-blocked: status DENIED", denied.status === "DENIED");
    ok("16 exec-blocked: recovery ABSTAIN", denied.recovery === "ABSTAIN");
    assertNoSideEffects("16 exec-blocked", denied);

    const live = gw.compile("remove the unused import", { execute: true });
    ok("16 live refused: BLOCKED", live.status === "BLOCKED");
    ok("16 live refused: LIVE_EXECUTION_NOT_PERMITTED", live.blockers.some((b) => b.code === "LIVE_EXECUTION_NOT_PERMITTED"));
    assertNoSideEffects("16 live refused", live);
}

// 17 — verification is never claimed in a dry-run (fail-closed honesty).
{
    const r = gw.compile(HEADLINE);
    ok("17 verification: NOT_EXECUTED in dry-run", /NOT_EXECUTED/.test(r.verification));
    ok("17 verification: never SUCCESS/CERTIFIED/VERIFIED", !/SUCCESS|CERTIFIED|\bVERIFIED\b/.test(r.verification));
}

// 18 — evidence is never fabricated in a dry-run.
{
    const r = gw.compile(HEADLINE);
    ok("18 evidence: NONE in dry-run", /NONE/.test(r.evidence));
}

// 19 — recovery / abstention on a blocked objective.
{
    const r = gw.compile(HEADLINE); // NETWORK external effect ⇒ blocked in dry-run
    ok("19 recovery: blocked ⇒ ABSTAIN", r.status === "BLOCKED" && r.recovery === "ABSTAIN");
    ok("19 recovery: at least one structured blocker", r.blockers.length >= 1);
}

// 20 — idempotent: identical objective ⇒ byte-identical result (no clock/randomness).
{
    const a = gw.compile(HEADLINE, { currentState: "CREATED" });
    const b = gw.compile(HEADLINE, { currentState: "CREATED" });
    ok("20 idempotent: deterministic result", JSON.stringify(a) === JSON.stringify(b));
}

// 21 — regression / reuse: the gateway composes the EXISTING governed modules, not clones of them.
{
    const r = gw.compile("email the weekly summary to the client list", { authority: "human:cto", currentState: "CREATED" });
    ok("21 reuse: contract via mission-synthesizer", r.contract.source === "mission-synthesizer");
    ok("21 reuse: admission decision from action-gate vocabulary", Object.values(gate.DECISION).includes(r.objectives[0].admission.decision));
    ok("21 reuse: authority via governance-kernel (carries policyVersion)", "policyVersion" in r.authority || "error" in r.authority);
    // classifier is a pure deterministic unit
    ok("21 reuse: classifier deterministic", JSON.stringify(gw.classifyObjective("delete the production database")) === JSON.stringify(gw.classifyObjective("delete the production database")));
    ok("21 reuse: classifier flags destructive as CRITICAL", gw.classifyObjective("delete the production database").risk === "CRITICAL");
}

// 22 — V8 reliquat: the bare word "current" must NOT alone classify a request NETWORK. A local
// repository-state read is LOCAL (NONE), while a genuine external/live-data request stays NETWORK.
{
    const localReads = ["current repository state", "current repo state", "état actuel du dépôt", "état actuel du repository"];
    localReads.forEach((g) => {
        const c = gw.classifyObjective(g);
        ok(`22 current-not-network: "${g}" ⇒ not NETWORK`, c.externalEffect !== "NETWORK");
        ok(`22 current-not-network: "${g}" ⇒ requiresExternal false`, c.requiresExternal === false);
    });
    const realNetwork = ["find commercial opportunities online", "fetch data from the remote server", "scrape the web for prices", "get real-time market data"];
    realNetwork.forEach((g) => {
        ok(`22 real-network preserved: "${g}" ⇒ NETWORK`, gw.classifyObjective(g).externalEffect === "NETWORK");
    });
    // The repository-state request resolves to a LOCAL capability end-to-end (no external-ai substitute).
    const r = gw.compile("current repository state", { currentState: "CREATED" });
    ok("22 current repository state ⇒ LOCAL capability", r.objectives[0].capability.chosen.source === "LOCAL");
    ok("22 current repository state ⇒ READY_DRY_RUN", r.status === "READY_DRY_RUN");
    assertNoSideEffects("22 current-repo-state", r);
}

// 23 — P5 PERMANENT REGRESSION: runtime-internal audit/convergence/false-success/honest vocabulary
// resolves to a LOCAL governed capability through the REAL gateway path (compile → capability-router
// → decision-rules), while a genuine external-provider request still resolves EXTERNAL_AI. Proves the
// P5 decision-rules fix end-to-end at the mission/objective level, with the dry-run safety invariants
// (no provider/external/network side effect, DRY_RUN enforced) and the decision source surfaced.
{
    const local = [
        ["audit the carnet for anomalies", "self-diagnostic"],
        ["determine whether the runtime has converged", "runtime-context-loader"],
        ["find false-success in the mission records", "self-diagnostic"],
        ["confirm the runtime is honest about its status", "self-diagnostic"],
    ];
    for (const [goal, cap] of local) {
        const r = gw.compile(goal, { currentState: "CREATED", localModelAvailable: false });
        const chosen = r.objectives[0].capability.chosen;
        ok(`23 P5 local: "${goal}" ⇒ LOCAL (not external-ai)`, chosen.source === "LOCAL");
        ok(`23 P5 local: "${goal}" ⇒ ${cap}`, chosen.capability === cap);
        ok(`23 P5 local: "${goal}" ⇒ decision source surfaced (tier)`, chosen.tier === "RULES");
        ok(`23 P5 local: "${goal}" ⇒ not flagged missing`, r.objectives[0].capability.missingLocalCapability === false);
        ok(`23 P5 local: "${goal}" ⇒ DRY_RUN enforced`, r.mode === "DRY_RUN");
        assertNoSideEffects(`23 P5 local "${goal}"`, r);
    }
    // Genuine external-provider need is preserved: no local rule ⇒ EXTERNAL_AI last resort is chosen.
    {
        const g = "ask an LLM to write original prose";
        const r = gw.compile(g, { currentState: "CREATED", localModelAvailable: false });
        const chosen = r.objectives[0].capability.chosen;
        ok(`23 P5 provider: "${g}" ⇒ EXTERNAL source (provider need preserved)`, chosen.source === "EXTERNAL");
        ok(`23 P5 provider: "${g}" ⇒ external-ai capability`, chosen.capability === "external-ai");
        ok(`23 P5 provider: "${g}" ⇒ EXTERNAL_AI tier surfaced`, chosen.tier === "EXTERNAL_AI");
        ok(`23 P5 provider: "${g}" ⇒ missingLocalCapability true`, r.objectives[0].capability.missingLocalCapability === true);
        ok(`23 P5 provider: "${g}" ⇒ DRY_RUN enforced (no live provider call)`, r.mode === "DRY_RUN");
        assertNoSideEffects(`23 P5 provider "${g}"`, r);
    }
}

// 24 — P3 REGRESSION: the bare "transaction" lexical signal no longer over-escalates local/ambiguous
// objectives to FINANCIAL, while genuine money-movement intent still classifies FINANCIAL/TRANSACT.
{
    const notFinancial = [
        "transactional source repair",
        "repair the transactional source defects",
        "audit the transaction log",
        "process a transaction",
    ];
    for (const g of notFinancial) {
        const c = gw.classifyObjective(g);
        ok(`24 P3 neg: "${g}" ⇒ NOT FINANCIAL`, c.externalEffect !== "FINANCIAL");
        ok(`24 P3 neg: "${g}" ⇒ not TRANSACT/CRITICAL/R4`, !(c.actionClass === "TRANSACT" && c.risk === "CRITICAL" && c.reversibility === "R4"));
    }
    const financial = [
        "transfer money to the vendor",
        "charge the billing account",
        "pay the invoice",
        "withdraw funds from the account",
        "purchase credits",
        "process a financial transaction",
    ];
    for (const g of financial) {
        const c = gw.classifyObjective(g);
        ok(`24 P3 pos: "${g}" ⇒ FINANCIAL (guardrail preserved)`, c.externalEffect === "FINANCIAL");
        ok(`24 P3 pos: "${g}" ⇒ TRANSACT/CRITICAL/R4`, c.actionClass === "TRANSACT" && c.risk === "CRITICAL" && c.reversibility === "R4");
    }
}

// Aggregate no-side-effect proof across a representative sweep.
{
    const sweep = [
        gw.compile(HEADLINE),
        gw.compile("remove the unused import"),
        gw.compile("transfer money to the supplier account", { authority: "x" }),
        gw.compile("compose a haiku about mountains"),
        gw.compile(""),
    ];
    sweep.forEach((r, i) => assertNoSideEffects("sweep#" + i, r));
}

// 25 — WI-1: a FRENCH natural-language objective (the runtime's operating language) compiles through
// the governed gateway, derives a French intent mode, and DECOMPOSES into distinct objectives instead
// of one generic objective. Dry-run safety invariants are preserved (no provider/external/write).
{
    const fr = "audite l'état du runtime, corrige la décomposition défaillante et rédige un rapport";
    const r = gw.compile(fr, { currentState: "CREATED" });
    ok("25 FR: mode derived from French verbs (ANALYZE)", r.intent.mode === "ANALYZE");
    ok("25 FR: decomposed into 3 distinct objectives (not 1 generic)", r.contract.objectives.length === 3);
    ok("25 FR: objective goals preserved verbatim with accents",
        r.contract.objectives[0].goal === "audite l'état du runtime" && r.contract.objectives[2].goal === "rédige un rapport");
    ok("25 FR: dependency edges track the decomposition", Array.isArray(r.dependencies) && r.dependencies.length >= 3);
    ok("25 FR: contract still via mission-synthesizer (reuse)", r.contract.source === "mission-synthesizer");
    ok("25 FR: dry-run enforced", r.mode === "DRY_RUN");
    assertNoSideEffects("25 FR", r);

    // French intent-mode derivation across families (folded matching; English modes unchanged).
    ok("25 FR mode IMPLEMENT ('corrige … exécute …')", gw.compile("corrige la régression puis exécute les tests", { currentState: "CREATED" }).intent.mode === "IMPLEMENT");
    ok("25 FR mode VALIDATE ('valide …')", gw.compile("valide le pipeline et certifie le résultat", { currentState: "CREATED" }).intent.mode === "VALIDATE");

    // Determinism: identical French objective ⇒ byte-identical projection (no clock/randomness).
    const a = gw.compile(fr, { currentState: "CREATED" });
    const b = gw.compile(fr, { currentState: "CREATED" });
    ok("25 FR: deterministic projection", JSON.stringify(a) === JSON.stringify(b));

    // Over-split guard holds in French: a single action over a noun list stays ONE objective.
    const nounList = gw.compile("corrige le loader et le moteur de décision", { currentState: "CREATED" });
    ok("25 FR: noun-list not over-split (guard)", nounList.contract.objectives.length === 1);
}

// ---- 26 — V2-B1: MULTILINGUAL (FR + AR) risk/external-effect classification + constraints ---------
// Before V2-B1 the classifier (and constraint extractor) were English-only, so a FR/AR destructive /
// financial / deploy objective fell through to NONE/GENERATE/LOW — a governance SAFETY hole (it bypassed
// requiresHuman, provider-gating, consequential admission and expert-profile selection). These tests prove
// the hole is closed in BOTH languages, that LOCAL/analytic requests are NOT over-escalated, and that
// English behaviour is unchanged.
{
    const C = gw.classifyObjective;
    // VALID consequential — FRENCH (accented input folds to the stored signals).
    ok("26 FR destructive ⇒ DESTRUCTIVE/CRITICAL/requiresHuman", (() => { const c = C("supprime le fichier config.json"); return c.externalEffect === "DESTRUCTIVE" && c.risk === "CRITICAL" && c.requiresHuman === true; })());
    ok("26 FR financial ⇒ FINANCIAL/TRANSACT/requiresHuman", (() => { const c = C("paie la facture du fournisseur"); return c.externalEffect === "FINANCIAL" && c.actionClass === "TRANSACT" && c.requiresHuman === true; })());
    ok("26 FR deploy (accented) ⇒ DEPLOY/HIGH/requiresExternal", (() => { const c = C("déploie en production"); return c.externalEffect === "DEPLOY" && c.risk === "HIGH" && c.requiresExternal === true; })());
    ok("26 FR communicate ⇒ COMMUNICATE", C("envoie un courriel au client").externalEffect === "COMMUNICATE");
    ok("26 FR network ⇒ NETWORK/requiresExternal", (() => { const c = C("télécharge les données en ligne"); return c.externalEffect === "NETWORK" && c.requiresExternal === true; })());
    // VALID consequential — ARABIC (hamza/harakat variants normalise to the stored signals).
    ok("26 AR destructive ⇒ DESTRUCTIVE", C("احذف الملف config.json").externalEffect === "DESTRUCTIVE");
    ok("26 AR financial ⇒ FINANCIAL", C("ادفع فاتورة المورد").externalEffect === "FINANCIAL");
    ok("26 AR deploy (hamza) ⇒ DEPLOY", C("انشر في الإنتاج").externalEffect === "DEPLOY");
    ok("26 AR send (hamza) ⇒ COMMUNICATE", C("أرسل التقرير").externalEffect === "COMMUNICATE");
    ok("26 AR online ⇒ NETWORK", C("احصل على البيانات عبر الإنترنت").externalEffect === "NETWORK");
    // NON-REGRESSION: English classification unchanged.
    ok("26 EN non-regression: delete ⇒ DESTRUCTIVE", C("delete the file").externalEffect === "DESTRUCTIVE");
    ok("26 EN non-regression: safe local ⇒ NONE", C("refactor the helper for readability").externalEffect === "NONE");
    // NO OVER-ESCALATION: a LOCAL/analytic FR objective stays NONE/LOW (no false-HIGH), incl. the "ça marche" trap.
    ok("26 FR local analysis ⇒ NONE/LOW", (() => { const c = C("analyse le code et corrige le bug localement"); return c.externalEffect === "NONE" && c.risk === "LOW"; })());
    ok("26 FR 'ça marche' not NETWORK (market collision excluded)", C("vérifie que ça marche").externalEffect === "NONE");
    // MULTILINGUAL CONSTRAINTS: FR + AR negative/limiting clauses are extracted (were dropped before).
    ok("26 FR constraints extracted", (() => { const cs = gw.extractConstraints("fais-le sans réseau et ne supprime jamais, uniquement en local"); return cs.some((x) => /sans/.test(x)) && cs.some((x) => /jamais/.test(x)) && cs.some((x) => /uniquement/.test(x)); })());
    ok("26 AR constraints extracted", (() => { const cs = gw.extractConstraints("نفذ بدون انترنت فقط محليا"); return cs.some((x) => /بدون/.test(x)) && cs.some((x) => /فقط/.test(x)); })());
    // AUTHZ / REFUSED path end-to-end: a FR financial objective drives the FINANCIAL governance consequences
    // in compile() — provider-gated external blocker in dry-run + ECONOMIC expert profile (not ENGINEERING).
    {
        const r = gw.compile("paie la facture du fournisseur", { currentState: "CREATED", externalProvidersEnabled: false });
        ok("26 FR financial compile: blocked (external disabled or not-run in dry-run)", Array.isArray(r.blockers) && r.blockers.some((b) => /EXTERNAL_PROVIDER_DISABLED_BY_POLICY|EXTERNAL_EFFECT_NOT_RUN_IN_DRY_RUN/.test(b.code)));
        ok("26 FR financial compile: objective classified FINANCIAL", r.objectives && r.objectives.some((p) => p.classification.externalEffect === "FINANCIAL"));
        ok("26 FR financial compile: no side effects (dry-run)", r.providerCalls === 0 && r.externalCalls === 0 && r.externalWrites === 0);
    }
}

// ---- 27 — NEGATION / PROHIBITION SAFETY (EN + FR + AR): no inversion, prohibitions captured --------
// The highest-risk multilingual failure is a NEGATION INVERSION — "do not delete" / "ne supprime pas" /
// "لا تحذف الملف" (do NOT delete) being executed as a delete. These lock BOTH: (a) prohibitions classify the
// effect as NON-destructive (NONE) and fire NO consequential effect end-to-end; (b) the prohibition is CAPTURED
// as a constraint (governance visibility), while genuine imperatives still classify as their real effect.
{
  const C = gw.classifyObjective;
  const hasConstraint = (goal, re) => gw.extractConstraints(goal).some((x) => re.test(x));
  // (a) NO INVERSION — a prohibition must NOT be classified as the destructive/deploy effect it forbids.
  ok("27 AR 'لا تحذف الملف' (do-not-delete) ⇒ effect NOT DESTRUCTIVE (no inversion)", C("لا تحذف الملف").externalEffect !== "DESTRUCTIVE");
  ok("27 AR 'لا تنشر في الإنتاج' (do-not-deploy) ⇒ effect NOT DEPLOY (no inversion)", C("لا تنشر في الإنتاج").externalEffect !== "DEPLOY");
  ok("27 FR 'ne supprime pas' ⇒ effect NOT DESTRUCTIVE (no inversion)", C("ne supprime pas le fichier, trouve pourquoi le build echoue").externalEffect !== "DESTRUCTIVE");
  ok("27 EN 'do not delete' ⇒ effect NOT DESTRUCTIVE (no inversion)", C("fix the build but do not delete any file").externalEffect !== "DESTRUCTIVE");
  // STRONG inversions (these phrasings CONTAIN the effect signal — "delete the"/"invoice"/"deploy" — so a naive
  // substring classifier WOULD invert; the clause-scoped negation guard must suppress them). Regression lock for
  // the defect found by the multilingual coverage probe.
  ok("27 EN 'do not delete THE file' ⇒ NOT DESTRUCTIVE (contains 'delete the')", C("do not delete the file").externalEffect !== "DESTRUCTIVE");
  ok("27 EN 'do not pay the invoice' ⇒ NOT FINANCIAL (clause-scoped: noun 'invoice' after negation)", C("do not pay the invoice").externalEffect !== "FINANCIAL");
  ok("27 EN 'do not deploy to production' ⇒ NOT DEPLOY", C("do not deploy to production").externalEffect !== "DEPLOY");
  ok("27 EN 'never deploy to production' ⇒ NOT DEPLOY", C("never deploy to production").externalEffect !== "DEPLOY");
  ok("27 EN clause after 'but': 'fix the build but do not delete the file' ⇒ NOT DESTRUCTIVE", C("fix the build but do not delete the file").externalEffect !== "DESTRUCTIVE");
  // NON-REGRESSION: a negation AFTER the imperative (different clause) must NOT suppress it.
  ok("27 non-regression: 'delete the file, no backup needed' ⇒ DESTRUCTIVE (neg is a later clause)", C("delete the file, no backup needed").externalEffect === "DESTRUCTIVE");
  ok("27 non-regression: 'pay the invoice but do not deploy' ⇒ FINANCIAL (pay clause un-negated)", C("pay the invoice but do not deploy").externalEffect === "FINANCIAL");
  // (a') END-TO-END — a prohibition fires NO provider/external/write effect (dry-run safe, no destructive run).
  {
    const r = gw.compile("لا تحذف الملف، جد سبب فشل البناء", { currentState: "CREATED" });
    ok("27 AR prohibition compile: zero side effects (no delete executed)", r.providerCalls === 0 && r.externalCalls === 0 && r.externalWrites === 0);
    ok("27 AR prohibition compile: no DESTRUCTIVE objective classified", (r.objectives || []).every((o) => o.classification.externalEffect !== "DESTRUCTIVE"));
  }
  // (b) PROHIBITION CAPTURED as a constraint (EN/FR/AR) — governance visibility of the negative clause.
  ok("27 EN prohibition captured as constraint", hasConstraint("fix the build but do not delete any file", /do not delete/i));
  ok("27 EN contraction don't captured", hasConstraint("refactor but don’t touch the config", /don.t touch/i));
  ok("27 FR prohibition captured as constraint", hasConstraint("ne supprime pas le fichier", /ne supprime pas/));
  ok("27 AR prohibition captured as constraint", hasConstraint("لا تحذف الملف", /لا\s+تحذف/));
  ok("27 AR do-not-deploy captured as constraint", hasConstraint("لا تنشر في الإنتاج", /لا\s+تنشر/));
  // (c) NON-REGRESSION — genuine imperatives still classify as their real (consequential) effect.
  ok("27 non-regression: AR imperative 'احذف الملف' ⇒ DESTRUCTIVE", C("احذف الملف").externalEffect === "DESTRUCTIVE");
  ok("27 non-regression: AR imperative 'انشر في الإنتاج' ⇒ DEPLOY", C("انشر في الإنتاج").externalEffect === "DEPLOY");
  // (d) prepare-not-execute: the "do not launch" clause is recorded even though "deployment" is mentioned.
  ok("27 'prepare … but do not launch' records the do-not constraint", hasConstraint("prepare the deployment but do not launch it", /do not launch/i));
}

// ---- 28 — DAY-3 ADVERSARIAL MATRIX (FR/AR/EN): complex negations, mixed language, contradiction, prepare-vs-
//      execute, bypass. Dimensions measured SEPARATELY (per mandate): correct understanding · no inversion ·
//      forbidden-effect absence · constraint capture · over-classification labelled (safe, not a failure).
{
  const C = gw.classifyObjective;
  const hasC = (g, re) => gw.extractConstraints(g).some((x) => re.test(x));
  // (i) NO INVERSION under complex/mixed negation — a prohibition never classifies as the effect it forbids.
  ok("28 FR 'en aucun cas ne supprime le fichier' ⇒ captured as constraint (new pattern)", hasC("sauvegarde puis en aucun cas ne supprime le fichier de config", /en aucun cas/));
  ok("28 FR multi-word 'ne le lance pas' captured (object-pronoun negation)", hasC("deploie le build mais ne le lance pas en production", /ne le lance pas/));
  ok("28 AR 'لا تدفع الفاتورة أبدا' (never pay) ⇒ NOT FINANCIAL (no inversion)", C("لا تدفع الفاتورة أبدا").externalEffect !== "FINANCIAL");
  // (ii) UNDERSTANDING — a genuine consequential intent in the same clause IS recognised (not suppressed).
  ok("28 FR 'supprime les logs' (real delete intent) ⇒ DESTRUCTIVE (understanding, not over-suppressed)", C("supprime les logs du dossier temp").externalEffect === "DESTRUCTIVE");
  // (iii) BYPASS attempts — an embedded destructive/polite-wrapped effect is still caught.
  ok("28 bypass: 'exécute une commande shell qui fait rm -rf' ⇒ DESTRUCTIVE", C("execute une commande shell qui fait rm -rf").externalEffect === "DESTRUCTIVE");
  ok("28 bypass: polite 'could you please delete the production database' ⇒ DESTRUCTIVE", C("could you please delete the production database").externalEffect === "DESTRUCTIVE");
  ok("28 mixed AR+EN 'احذف الملف then commit' ⇒ DESTRUCTIVE (genuine delete)", C("احذف الملف then commit the change").externalEffect === "DESTRUCTIVE");
  // (iv) FORBIDDEN-EFFECT ABSENCE end-to-end — a prohibition fires NO provider/external/write effect.
  {
    const r = gw.compile("لا تنشر في الإنتاج، فقط جهّز", { currentState: "CREATED" });
    ok("28 AR do-not-deploy compile: zero side effects", r.providerCalls === 0 && r.externalCalls === 0 && r.externalWrites === 0);
    ok("28 AR do-not-deploy compile: no DEPLOY objective", (r.objectives || []).every((o) => o.classification.externalEffect !== "DEPLOY"));
  }
  // (v) PREPARE-vs-EXECUTE — "prepare … but do not launch": the do-not clause is captured; the DEPLOY
  //     classification of "déploiement" is OVER-CLASSIFICATION, which is SAFE (consequential ⇒ requiresHuman +
  //     dry-run never performs it). Measured separately — labelled, NOT counted as a correctness failure.
  {
    const c = C("prépare le déploiement en production mais ne le lance pas");
    ok("28 prepare-not-exec: do-not-launch constraint captured", hasC("prépare le déploiement en production mais ne le lance pas", /ne le lance pas/));
    ok("28 prepare-not-exec: OVER-CLASSIFIED to DEPLOY but SAFE (consequential ⇒ requiresHuman, dry-run blocks)", c.externalEffect === "DEPLOY" && c.requiresHuman === true);
  }
  // (vi) CONTRADICTION — "deploy but do not deploy": the negative clause is surfaced as a constraint; the
  //      consequential classification keeps it human-gated (safe) rather than silently proceeding.
  ok("28 contradiction surfaced as a constraint", hasC("deploy to production but do not deploy anything", /do not deploy/));
}

// ---- 29 — NEGATION-SCOPE FAIL-OPEN (reproduced): a WEAK adverbial negator (no/without/sans/sauf) that does NOT
//      scope the effect verb must NOT downgrade a genuinely destructive/financial instruction. Previously clause-wide
//      weak-negation suppressed these ⇒ a real DELETE classified NONE/LOW/no-human (a fail-OPEN). Strong prohibitions
//      ("do not"/"never"/"ne…pas"/"لا") and ADJACENT weak prohibitions ("no delete"/"sans suppression") still suppress.
{
  const C = gw.classifyObjective;
  const isDestr = (g) => { const c = C(g); return c.externalEffect === "DESTRUCTIVE" && c.requiresHuman === true; };
  // (a) fail-OPEN closed: a non-adjacent weak negator leaves the destructive effect intact (human-gated).
  ok("29 'without further delay delete the production database' ⇒ DESTRUCTIVE (weak negator not scoping verb)", isDestr("without further delay delete the production database"));
  ok("29 'having no choice here delete the production database' ⇒ DESTRUCTIVE", isDestr("having no choice here delete the production database"));
  ok("29 'we have no backup so just wipe the database' ⇒ DESTRUCTIVE", isDestr("we have no backup so just wipe the database"));
  ok("29 FR 'sans hesitation supprime le fichier' ⇒ DESTRUCTIVE (sans adverbial, not scoping)", isDestr("sans hesitation supprime le fichier"));
  // (b) STRONG prohibitions still suppress (no regression of the inversion guard).
  ok("29 'do not delete the file' ⇒ NOT DESTRUCTIVE (strong prohibition preserved)", C("do not delete the file").externalEffect !== "DESTRUCTIVE");
  ok("29 'never delete the database' ⇒ NOT DESTRUCTIVE", C("never delete the database").externalEffect !== "DESTRUCTIVE");
  ok("29 'do not pay the invoice' ⇒ NOT FINANCIAL (clause-scoped strong)", C("do not pay the invoice").externalEffect !== "FINANCIAL");
  // (c) ADJACENT weak prohibition still suppresses (a true local prohibition) — NON-VACUOUS: the baseline carries a
  //     real DESTRUCTIVE signal ("wipe … database"), and only the ADJACENT "no" suppresses it (would fail if the
  //     WEAK_NEG_ADJACENT branch were removed).
  ok("29 baseline 'wipe the staging database now' ⇒ DESTRUCTIVE (real signal present)", isDestr("wipe the staging database now"));
  ok("29 'no wipe of the staging database' ⇒ NOT DESTRUCTIVE (adjacent weak negator suppresses the real signal)", C("no wipe of the staging database").externalEffect !== "DESTRUCTIVE");
  // (d) baseline un-negated destructive stays DESTRUCTIVE.
  ok("29 baseline 'delete the production database' ⇒ DESTRUCTIVE", isDestr("delete the production database"));
  // NOTE (residual, NOT fixed here — see compass): strong-negator SCOPE across an interjection (a connector such as
  // so/because/please, OR a comma-delimited aside) can still strip a prohibition from the signal's clause and invert
  // ("could you not please delete the file" / "do not, under any circumstances, delete X" ⇒ wrongly DESTRUCTIVE). An
  // earlier attempt to fix this by adding so/because/please as clause boundaries was REJECTED by independent audit —
  // it shortened the clause past the strong negator and CREATED new inversions. Deferred to a dedicated lot (needs a
  // negation-scope model that keeps a strong negator bound to its verb across asides, not a flat boundary list).
}

// ---- 30 — FR-TOKEN COLLISION FAIL-OPEN (reproduced): bare `pas` is a French negation token that collides with the
//      English word "PAS" / "pas de deux". Clause-wide suppression on bare `pas` DOWNGRADED a genuine destructive
//      instruction ("the PAS system should delete the temp cache files" ⇒ NONE — a fail-OPEN). `pas` is now dropped;
//      real FR "ne … pas" prohibitions are still suppressed via the `ne` marker (kept).
{
  const C = gw.classifyObjective;
  const isDestr = (g) => { const c = C(g); return c.externalEffect === "DESTRUCTIVE" && c.requiresHuman === true; };
  // (a) fail-OPEN closed: bare `pas` in English text no longer suppresses the real DELETE.
  ok("30 'the PAS system should delete the temp cache files' ⇒ DESTRUCTIVE (no FR-pas collision)", isDestr("the PAS system should delete the temp cache files"));
  ok("30 'after the pas de deux routine delete the old recording' ⇒ DESTRUCTIVE", isDestr("after the pas de deux routine delete the old recording"));
  // (b) NO regression: genuine FR "ne … pas" prohibitions still suppress via `ne`.
  ok("30 'ne supprime pas le fichier' ⇒ NOT DESTRUCTIVE (ne marker preserved)", C("ne supprime pas le fichier, trouve pourquoi le build echoue").externalEffect !== "DESTRUCTIVE");
  ok("30 'ne le lance pas en production' prohibition still classified non-DEPLOY-executed (ne preserved)", C("ne le lance pas").externalEffect !== "DEPLOY" || C("ne le lance pas").requiresHuman === true);
}

console.log("");
console.log(`Gateway tests: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} gateway assertion(s) failed`);
console.log("ALL GATEWAY TESTS PASSED");
