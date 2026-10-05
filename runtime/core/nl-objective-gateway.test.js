#!/usr/bin/env node
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

console.log("");
console.log(`Gateway tests: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, `${failed} gateway assertion(s) failed`);
console.log("ALL GATEWAY TESTS PASSED");
