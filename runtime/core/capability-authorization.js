#!/usr/bin/env node

"use strict";

/*
 * GOVERNED HUMAN-AUTHORIZATION TRANSPORT — explicit human grant for a consequential capability.
 *
 * THE BOUNDARY THIS CLOSES (CTO): the semantic NL entrypoint can genuinely execute READ-ONLY
 * capabilities, but a CONSEQUENTIAL capability (Governed Git Branch Integration / Governed Bash/Linux
 * Command / External Research Acquisition) must be authorized by an EXPLICIT HUMAN grant transported to
 * the governed execution path. A natural-language sentence can NEVER manufacture that authorization.
 *
 * WHAT THIS IS — a thin, pure VALIDATOR + TRANSPORT. It is NOT a second authority system, runtime,
 * primitive, policy, or global switch. The core admission (STATE / CONTRACT / POLICY / AUTHORITY,
 * deny-by-default, human-authority escalation) is DELEGATED verbatim to the EXISTING deterministic gate
 * runtime/core/action-gate.js. This module only adds the two dimensions action-gate does not model:
 *   (1) explicit CAPABILITY identity binding (a grant for capability X never admits capability Y), and
 *   (2) explicit capability SCOPE/limits (the requested action must stay within the granted scope).
 * It then composes action-gate for mission-binding, expiry, revocation and the human-authority gate.
 *
 * INVARIANTS (all fail-closed, deny-by-default):
 *   - explicit capability identity      (grant.capability must equal the requested capability)
 *   - explicit mission binding          (grant.mission must equal the current mission — NO transfer)
 *   - explicit scope/limits             (grant.scope present AND the request stays within it)
 *   - explicit expiry                   (grant.expiresAt finite AND not in the past — never permanent)
 *   - explicit execute permission       (grant.execute === true)
 *   - human-issued only                 (grant.human === true — ODG can never self-authorize)
 *   - revocation honoured               (a revoked grant is denied)
 *   - never global                      (no capability/mission/scope ⇒ denied; a grant authorizes ONLY
 *                                        the one requested action/capability, never everything)
 *   - evidence records EXACTLY the authorization used (capability, mission, issuer, scope, expiry).
 *
 * Pure: no clock, no randomness, no I/O. `now` is injected. Same (request, grant, ctx) ⇒ same decision.
 */

const { evaluateAction, DECISION } = require("./action-gate");

// The consequential capabilities this seam governs, mapped to the conservative action descriptor used
// for the composed action-gate admission and to the EXISTING capability-probes probe that verifies the
// capability's real evidence. Reuses existing capability names + probe names only (no new vocabulary).
// Each consequential capability carries: the conservative action descriptor for the composed action-gate
// admission; the EXISTING capability-executors dispatch id PREFIX (so an authorized objective can be
// assigned the objectiveId the executor matches — reuse, not a new router); the LIVE evidence probe;
// and the SAFE (non-destructive, dry-run/analysis) probe when the capability has one. External Research
// has a genuine safe dry-run probe (zero network); git/bash have none (their proof needs a real/sandbox
// effect), so `safeProbe` is null and a safe-mode run there honestly cannot reach SUCCESS.
const CONSEQUENTIAL_CAPABILITIES = Object.freeze({
    "Governed Git Branch Integration": Object.freeze({ actionClass: "IRREVERSIBLE", risk: "HIGH", reversibility: "R3", executorPrefix: "GIT_BRANCH_INTEGRATION", probe: "git-branch-integrated", safeProbe: null }),
    "Governed Bash/Linux Command": Object.freeze({ actionClass: "WRITE", risk: "HIGH", reversibility: "R2", executorPrefix: "BASH_COMMAND", probe: "bash-command-governed", safeProbe: null }),
    "External Research Acquisition": Object.freeze({ actionClass: "COMMUNICATE", risk: "HIGH", reversibility: "R2", executorPrefix: "EXTERNAL_RESEARCH", probe: "research-acquired", safeProbe: "external-research-dry-run-planned" }),
});

function isConsequentialCapability(capability) {
    return Object.prototype.hasOwnProperty.call(CONSEQUENTIAL_CAPABILITIES, capability);
}

// Capability → EXISTING executor spec adapter. `field` is the patch key the capability-executor already
// reads (git_branch_integration / bash_command / research_acquisition); `fromScope` builds that spec
// STRICTLY from the HUMAN grant's scope (the privileged parameters come from the human, NEVER the
// sentence); `requestedScope` projects a carried spec back into grant-scope shape so the authorization
// gate can verify the concrete request stays WITHIN the grant (scope containment at execution). The
// network/live flag defaults OFF (scope.live===true to arm it) so the transported spec is dry-run/safe
// by default; a live effect still self-gates in the executor (fail-closed) and, for research, additionally
// requires an operator-injected fetcher that cannot survive JSON transport.
const SPEC_ADAPTERS = Object.freeze({
    "External Research Acquisition": Object.freeze({
        field: "research_acquisition",
        fromScope(scope) {
            const live = scope.live === true;
            const spec = {
                authorized: true,
                execute: live, // the capability's LIVE/network flag — armed ONLY when the human set scope.live
                source_allowlist: Array.isArray(scope.planned_sources) ? scope.planned_sources : [],
                objective: typeof scope.objective === "string" ? scope.objective : null,
                items: Array.isArray(scope.items) ? scope.items : [],
            };
            // The live fetcher is NAMED explicitly by the human grant (never defaulted, never from the
            // sentence) and only when LIVE; per-request byte/time limits ride alongside, bounded here.
            if (live && typeof scope.fetcher === "string") spec.fetcher = scope.fetcher;
            if (live && Number.isFinite(scope.max_bytes)) spec.maxBytes = scope.max_bytes;
            if (live && Number.isFinite(scope.timeout_ms)) spec.timeoutMs = scope.timeout_ms;
            return spec;
        },
        requestedScope(v) {
            return { objective: v && v.objective, planned_sources: (v && v.source_allowlist) || [] };
        },
    }),
    "Governed Git Branch Integration": Object.freeze({
        field: "git_branch_integration",
        fromScope(scope) {
            return {
                target: scope.target,
                source: scope.source,
                execute: scope.live === true,
                authorization: { allow_protected: scope.allow_protected === true },
            };
        },
        requestedScope(v) {
            return { target: v && v.target, source: v && v.source };
        },
    }),
    "Governed Bash/Linux Command": Object.freeze({
        field: "bash_command",
        fromScope(scope) {
            return { command: scope.command, execute: scope.live === true };
        },
        requestedScope(v) {
            return { command: v && v.command };
        },
    }),
});

// Build the EXISTING capability-executor spec from a human grant's scope. Returns { field, value } or
// null when the capability has no adapter. Pure; invents nothing beyond what the grant scope declares.
function buildExecutorSpec(capability, grantScope) {
    const a = SPEC_ADAPTERS[capability];
    if (!a || !isPlainObject(grantScope)) return null;
    return { field: a.field, value: a.fromScope(grantScope) };
}

// Project a carried executor spec value back into grant-scope shape for the containment check.
function requestedScopeOf(capability, specValue) {
    const a = SPEC_ADAPTERS[capability];
    if (!a || !isPlainObject(specValue)) return undefined;
    return a.requestedScope(specValue);
}

function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}
function nonEmptyString(v) {
    return typeof v === "string" && v.trim().length > 0;
}

// A VALID, minimal C03 expected transition for the composed action-gate STATE check (reuses the exact
// shape the NL gateway already proves valid). The seam is a dry admission decision — this transition
// declares the governed next step (PLANNED → PREPARED), it performs nothing.
function plannedToPrepared() {
    return {
        state_before: { lifecycle: "PLANNED" },
        action: "PREPARE",
        observed_effect: "consequential action authorized (admission only)",
        state_after: { lifecycle: "PREPARED" },
        state_version_before: 1,
        state_version_after: 2,
        difference: { lifecycle: { before: "PLANNED", after: "PREPARED" } },
        evidence_refs: ["capability-authorization:admission"],
        verification_status: "UNVERIFIED",
    };
}

// Default scope containment: every key the request asks for must be present in the grant and "covered".
// string ⇒ equal; number ⇒ requested <= granted (a numeric limit); array ⇒ requested ⊆ granted; object
// ⇒ recurse. An empty/absent requested scope is covered (the capability itself is already bound). A
// requested key ABSENT from the grant, or a value outside the grant, is OUT OF SCOPE (fail-closed).
function defaultScopeSatisfied(grantScope, requested) {
    if (requested === undefined || requested === null) return true;
    if (!isPlainObject(grantScope)) return false;
    if (!isPlainObject(requested)) return false;
    for (const k of Object.keys(requested)) {
        if (!Object.prototype.hasOwnProperty.call(grantScope, k)) return false;
        const g = grantScope[k];
        const r = requested[k];
        if (Array.isArray(r)) {
            if (!Array.isArray(g)) return false;
            if (!r.every((x) => g.includes(x))) return false;
        } else if (typeof r === "number") {
            if (typeof g !== "number" || r > g) return false;
        } else if (isPlainObject(r)) {
            if (!defaultScopeSatisfied(g, r)) return false;
        } else {
            if (g !== r) return false;
        }
    }
    return true;
}

function deny(code, detail, extra) {
    return Object.freeze({ decision: DECISION.DENY, code, detail, ...(extra || {}) });
}

/**
 * authorizeCapability(request, grant, ctx) -> frozen decision record.
 *
 * request: { capability, mission, requestedScope?, contract?, policy? } — WHAT is being requested.
 * grant:   { capability, mission, scope, expiresAt, execute, human, issuer?, id? } — the HUMAN grant,
 *          an EXPLICIT input (never synthesized from a sentence; this module does not read any sentence).
 * ctx:     { now, revokedGrants?, scopeSatisfied?, allowedPolicies?, revokedAuthorities? }.
 *          `now` (epoch ms) is REQUIRED — without a clock, expiry cannot be checked, so absence is DENY
 *          (fail-closed; the seam never invents a clock).
 *
 * Returns { decision: ALLOW | DENY | ESCALATE, code, detail, evidence?, authority?, gate? }.
 */
function authorizeCapability(request, grant, ctx) {
    ctx = isPlainObject(ctx) ? ctx : {};

    // Fail-closed preconditions on the request itself.
    if (!isPlainObject(request) || !nonEmptyString(request.capability) || !nonEmptyString(request.mission)) {
        return deny("MALFORMED_REQUEST", "request must declare a capability and a mission");
    }
    if (!isConsequentialCapability(request.capability)) {
        // Only consequential capabilities are governed by this human-authorization seam. A non-
        // consequential (read-only) capability must never be routed here — fail closed if it is.
        return deny("NOT_CONSEQUENTIAL", `"${request.capability}" is not a consequential capability governed by human authorization`);
    }
    if (!Number.isFinite(ctx.now)) {
        return deny("NO_CLOCK", "no trusted clock supplied (ctx.now); expiry cannot be validated");
    }

    // 1) Grant must be present. Absence ⇒ BLOCKED (the semantic entrypoint never fabricates it).
    if (!isPlainObject(grant)) {
        return deny("NO_AUTHORIZATION", "no human authorization grant supplied for a consequential capability");
    }
    // 2) Human-issued only — ODG can never self-authorize.
    if (grant.human !== true) {
        return deny("NOT_HUMAN_ISSUED", "authorization is not human-issued (grant.human !== true); ODG cannot self-authorize");
    }
    // 3) Explicit capability identity — a grant for one capability never admits another, nor is global.
    if (!nonEmptyString(grant.capability)) {
        return deny("NO_CAPABILITY", "grant declares no capability identity (an authorization is never global)");
    }
    if (grant.capability !== request.capability) {
        return deny("CAPABILITY_MISMATCH", `grant authorizes "${grant.capability}", not the requested "${request.capability}"`);
    }
    // 4) Explicit mission binding — no transfer to another mission.
    if (!nonEmptyString(grant.mission)) {
        return deny("NO_MISSION", "grant declares no mission binding (an authorization is never global)");
    }
    if (grant.mission !== request.mission) {
        return deny("MISSION_MISMATCH", `grant is bound to mission "${grant.mission}", not current mission "${request.mission}" (no transfer)`);
    }
    // 5) Explicit execute permission.
    if (grant.execute !== true) {
        return deny("EXECUTE_NOT_PERMITTED", "grant does not permit execution (grant.execute !== true)");
    }
    // 6) Explicit expiry — never permanent.
    if (!Number.isFinite(grant.expiresAt)) {
        return deny("NO_EXPIRY", "grant declares no expiry (an authorization can never be permanent)");
    }
    if (grant.expiresAt < ctx.now) {
        return deny("EXPIRED", `grant expired (expiresAt ${grant.expiresAt} < now ${ctx.now})`);
    }
    // 7) Revocation — a revoked grant (by id or capability) is denied.
    const grantId = nonEmptyString(grant.id) ? grant.id : `GRANT:${grant.capability}`;
    const revoked = Array.isArray(ctx.revokedGrants) ? ctx.revokedGrants : [];
    if (revoked.includes(grantId) || revoked.includes(grant.capability)) {
        return deny("REVOKED", `grant "${grantId}" is revoked`);
    }
    // 8) Explicit scope/limits — never global; the requested action must stay within the granted scope.
    if (!isPlainObject(grant.scope) || Object.keys(grant.scope).length === 0) {
        return deny("NO_SCOPE", "grant declares no scope/limits (an authorization is never unbounded)");
    }
    const scopeSatisfied = typeof ctx.scopeSatisfied === "function" ? ctx.scopeSatisfied : defaultScopeSatisfied;
    if (!scopeSatisfied(grant.scope, request.requestedScope)) {
        return deny("SCOPE_EXCEEDED", "the requested action exceeds the granted scope");
    }

    // 9) Compose the EXISTING action-gate for the authoritative admission (state/contract/policy/
    // authority + deny-by-default + human-authority escalation). The grant becomes the action's
    // authority object; action-gate re-validates mission-binding, expiry and revocation itself.
    const reg = CONSEQUENTIAL_CAPABILITIES[request.capability];
    const authority = {
        id: grantId,
        principal: nonEmptyString(grant.issuer) ? grant.issuer : "human",
        mission: grant.mission,
        capability: grant.capability,
        expiresAt: grant.expiresAt,
        human: true,
        scope: grant.scope,
    };
    const action = {
        principal: authority.principal,
        verb: request.capability,
        target: request.mission,
        actionClass: reg.actionClass,
        risk: reg.risk,
        reversibility: reg.reversibility,
        criticality: reg.risk,
        contract: isPlainObject(request.contract) ? request.contract : { id: request.mission },
        policy: nonEmptyString(request.policy) ? request.policy : "DETERMINISM_FIRST",
        authority,
        expectedTransition: plannedToPrepared(),
    };
    const gate = evaluateAction(action, {
        missionId: request.mission,
        now: ctx.now,
        allowedPolicies: ctx.allowedPolicies,
        revokedAuthorities: ctx.revokedAuthorities,
    });
    if (gate.decision !== DECISION.ALLOW) {
        return Object.freeze({
            decision: gate.decision,
            code: gate.decision === DECISION.ESCALATE ? "ESCALATE_TO_HUMAN" : "ADMISSION_DENIED",
            detail: (gate.violations && gate.violations.join("; ")) || (gate.escalation && gate.escalation.reasons.join("; ")) || "action-gate denied",
            gate: gate.evidence,
        });
    }

    // 10) ALLOW — record EXACTLY the authorization used (the evidence artifact the caller persists).
    const evidence = Object.freeze({
        decision: DECISION.ALLOW,
        capability: request.capability,
        mission: request.mission,
        issuer: authority.principal,
        grantId,
        scope: grant.scope,
        requestedScope: request.requestedScope !== undefined ? request.requestedScope : null,
        expiresAt: grant.expiresAt,
        execute: true,
        human: true,
        probe: reg.probe,
        usedAt: ctx.now,
        gate: gate.evidence,
    });
    return Object.freeze({
        decision: DECISION.ALLOW,
        code: "AUTHORIZED",
        detail: "human authorization valid for this capability, mission and scope",
        evidence,
        authority,
        probe: reg.probe,
        safeProbe: reg.safeProbe,
        executorPrefix: reg.executorPrefix,
    });
}

module.exports = {
    authorizeCapability,
    isConsequentialCapability,
    defaultScopeSatisfied,
    buildExecutorSpec,
    requestedScopeOf,
    CONSEQUENTIAL_CAPABILITIES,
    SPEC_ADAPTERS,
};

// Read-only CLI: print the governed consequential-capability registry; mutates nothing.
if (require.main === module) {
    process.stdout.write(JSON.stringify({ seam: "capability-authorization", consequential: CONSEQUENTIAL_CAPABILITIES }, null, 2) + "\n");
}
