#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V59 Lot 2 (§4.A) — §-LEVEL CONSOLIDATION INVARIANT TESTS for the NEEDS_LOCAL_BUILD parts that have concrete
 * canonical modules: VII (memory trust), XII (autonomous repair assurance), XV (observability / result-status honesty).
 * Each asserts the real functional invariant with nominal + violation cases. The parts I §5–§6, IV §16–§20 and XXV §105
 * are NOT covered here: their closure needs the FROZEN Master's enumerations (26 capabilities / 12 dimensions + 10
 * responsibilities / F01–F40) which are NOT_RECOVERABLE — enumerating them would be fabrication (forbidden). Documented
 * as a canonical-source dependency in the closure ledger. Fail-closed.
 */

const MT = require("../core/memory-trust-gate.js");
const RCE = require("../core/rce-assurance-chain.js");
const CT = require("../core/certification-traceability.js");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// ── VII §29–§33 — Memory/knowledge integrity: a memory is TRUSTED only if fresh + attributed + trusted author ──
const mem = { id: "m1", provenance: "mission:M1", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "capability" };
check("VII: fresh + attributed + trusted author ⇒ TRUSTED", MT.assessMemoryTrust(mem, { asOf: 100, trustedAuthors: ["ODG"] }).trusted === true);
check("VII: past validUntil ⇒ STALE (not trusted)", MT.assessMemoryTrust(mem, { asOf: 300, trustedAuthors: ["ODG"] }).verdict === "STALE");
check("VII: unknown author ⇒ UNATTRIBUTED (fail-closed)", MT.assessMemoryTrust({ id: "m2", provenance: "x", authoredBy: "MYSTERY" }, { asOf: 1, trustedAuthors: ["ODG"] }).verdict === "UNATTRIBUTED");
check("VII: validUntil but no asOf ⇒ INSUFFICIENT_SIGNAL (cannot assume fresh)", MT.assessMemoryTrust(mem, { trustedAuthors: ["ODG"] }).verdict === "INSUFFICIENT_SIGNAL");

// ── XII §51–§56 — Autonomous repair assurance: the fix is never its own proof (fail-to-pass ∧ pass-to-pass ∧ adversarial ∧ independent) ──
const indep = { builder: { id: "b" }, verifier: { id: "v" } };
const retain = RCE.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], adversarial: { ran: true, passed: true }, actors: indep });
check("XII: fail-to-pass + pass-to-pass + independent + adversarial ⇒ RETAIN", retain.decision === "RETAIN" && retain.gates.failToPass === "PASS");
const regress = RCE.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: false }], actors: indep });
check("XII: a previously-passing test now failing ⇒ ROLLBACK (regression shield)", regress.decision === "ROLLBACK" && regress.gates.passToPass === "REGRESSION");
const advFail = RCE.assessRepair({ reproduction: { beforeFix: false, afterFix: true }, passToPass: [{ id: "t", beforeFix: true, afterFix: true }], adversarial: { ran: true, passed: false }, actors: indep });
check("XII: adversarial failure ⇒ ROLLBACK (fix is not its own proof)", advFail.decision === "ROLLBACK");

// ── XV §66–§70 — Observability / result-status honesty: readiness ≠ certification; fail-closed on missing input ──
const NOW = "2026-09-01T00:00:00Z";
const base: any = { gatedSuites: ["audit-log", "evidence-provenance"], evidence: { "7": { state: "APPROVED", responsible: "CTO", artifact: "policy.md" }, "8": { state: "DRAFTED" } }, now: NOW };
const trace = CT.buildTraceability(base);
check("XV: traceability built ⇒ status NOT_CERTIFIED (readiness ≠ certification)", trace.ok === true && trace.certificationStatus === "NOT_CERTIFIED");
check("XV: no `now` ⇒ INVALID_INPUT (fail-closed, no fabricated freshness)", CT.buildTraceability({}).code === "INVALID_INPUT");

process.stdout.write(`\n${failures === 0 ? "ALL PASS — V59 Lot 2 consolidation invariants (VII/XII/XV; I/IV/XXV blocked on NOT_RECOVERABLE Master enumerations)" : failures + " FAIL"}\n`);
process.exit(failures === 0 ? 0 : 1);
export {};
