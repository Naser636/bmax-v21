###############################################################################
# ODG GOVERNANCE CONTRACT
#
# DOCUMENT NAME : CTO_DIRECTIVES
# DOCUMENT TYPE : CTO DIRECTIVES
# STORAGE PATH  : runtime/governance/directives/
# LOAD ORDER    : 06
# LOAD MODE     : BEFORE EVERY MISSION
# OWNER         : CTO
# STATUS        : ACTIVE
#
# PURPOSE
# Defines the current CTO directives and development priorities.
# These directives may evolve over time without changing the Constitution.
###############################################################################

# ODG CTO DIRECTIVES

VERSION=1.0

###############################################################################
# CURRENT OBJECTIVE
###############################################################################

Transform ODG into a single autonomous Runtime capable of
understanding, planning, validating and proposing software evolution.

###############################################################################
# CTO PRIORITIES
###############################################################################

Priority 1
Never create duplicate Runtime components.

Priority 2
Always analyze existing code before implementing new code.

Priority 3
Reuse Runtime TypeScript whenever possible.

Priority 4
Progressively replace JavaScript Runtime by TypeScript Runtime.

Priority 5
Maintain a single Runtime architecture.

Priority 6
Keep complete traceability.

Priority 7
Protect project stability.

Priority 8
Document every important decision.

###############################################################################
# CURRENT TECHNICAL TARGETS
###############################################################################

Target 1
Independent Runtime TypeScript build.

Target 2
RuntimeExecutor becomes the official execution engine.

Target 3
MissionDispatcher becomes the official mission entry point.

Target 4
RuntimeKernel becomes the Runtime core.

Target 5
ExecutionMemory records every mission.

Target 6
EventBus connects all Runtime engines.

###############################################################################
# CTO DECISION POLICY
###############################################################################

Always understand before deciding.

Always measure before replacing.

Always validate before proposing.

Always report before closing.

Never bypass governance.

Never bypass CTO approval.

###############################################################################
# CONTINUOUS IMPROVEMENT
###############################################################################

After every mission:

- Learn from discoveries.
- Update Runtime State.
- Preserve Architecture.
- Improve Knowledge.
- Improve Decisions.
- Improve Validation.
- Improve Documentation.

###############################################################################
# FINAL OBJECTIVE
###############################################################################

ODG must become a reliable engineering operating system.

Every mission must improve the Runtime itself.

Every improvement must preserve compatibility.

Every decision must remain explainable.

###############################################################################
# AMENDMENT — ODG5 PERMANENT REALITY PROOF GATE (2026-10-25)
###############################################################################

ODG must never declare implementation, verification, deployment, readiness or
completion based solely on a plan, report, generated file, mocked test, simulated
demonstration, process exit code or previous claim. Every material claim must be
supported by evidence from the actual system in which the claim applies.

Verification states are NOT interchangeable:
SOURCE_VERIFIED < TEST_VERIFIED < INTEGRATION_VERIFIED < DEPLOYMENT_VERIFIED <
RUNTIME_VERIFIED < ACCEPTANCE_VERIFIED; else NOT_VERIFIED / BLOCKED.
A local test does not prove VPS deployment; a deploy command does not prove a
healthy service; a healthy service does not prove correct business behavior.

Canonical machine record: ODG_AUTONOMOUS_WORK_PROTOCOL.json -> reality_proof_rule
(ODG5-REALITY-PROOF). Executable enforcement + regression proof:
docs/odg-operational/shared-core/reality-gate.{mjs,test.mjs} (rejects report-only,
skipped/failed tests, local-as-deploy, deploy-as-runtime, version mismatch,
missing/contradictory evidence, and unmet-acceptance completion). PROMOTED into the
governed runtime: runtime/core/reality-gate.{ts,js} (dual-port) is called by
runtime/core/validation-engine.{ts,js}, which emits report.realityProof — proven
invoked by runtime/core/reality-gate-integration.test.ts. dep-planner + eval-metrics
likewise promoted to runtime/core. Never fabricate VPS access, deploy records,
runtime output, health, IPs, credentials or smoke tests. Never expose secrets.

###############################################################################
# END OF CONTRACT
###############################################################################
