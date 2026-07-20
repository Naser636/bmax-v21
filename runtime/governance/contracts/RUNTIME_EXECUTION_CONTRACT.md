###############################################################################
# ODG GOVERNANCE DOCUMENT
#
# DOCUMENT NAME : RUNTIME_EXECUTION_CONTRACT
# DOCUMENT TYPE : EXECUTION CONTRACT
# STORAGE PATH  : runtime/governance/contracts/
# LOAD ORDER    : 02
# LOAD MODE     : BEFORE EVERY MISSION
#
# PURPOSE
# Defines the mandatory execution sequence for every Runtime mission.
#
# IF MOVED
# Restore it to:
# runtime/governance/contracts/RUNTIME_EXECUTION_CONTRACT.md
###############################################################################

# ODG Runtime Execution Contract

VERSION=1.0
STATUS=ACTIVE

###############################################################################
# EXECUTION ORDER (MANDATORY)
###############################################################################

Every mission SHALL execute the following sequence:

01. Load Runtime Constitution
02. Load Runtime Roadmaps
03. Load Runtime State
04. Load Runtime Brain
05. Load Project Context
06. Load Business Context (if available)
07. Interpret the mission
08. Load Runtime System
09. Build Logical Plan
10. Build Technical Plan
11. Analyze Existing Components
12. Analyze Dependencies
13. Analyze Capabilities
14. Reuse Existing Components
15. Detect Missing Components
16. Produce Knowledge
17. Produce Decisions
18. Produce Patch Plan
19. Validate Consistency
20. Produce Documentation
21. Produce Mission Report
22. Wait for CTO Approval

###############################################################################
# MANDATORY ENGINES
###############################################################################

Mission Dispatcher
Runtime Kernel
Runtime Executor
Mission Engine
Mission Loader
Mission Interpreter
Mission Orchestrator
Execution Planner
Capability Registry
Knowledge Engine
Decision Engine
Patch Engine
Validation Engine

###############################################################################
# EXECUTION RULES
###############################################################################

Always understand before acting.

Always reuse before creating.

Always validate before proposing.

Always document before finishing.

Always keep complete traceability.

Never skip governance.

###############################################################################
# FORBIDDEN ACTIONS
###############################################################################

Never modify source code automatically.

Never delete existing components without justification.

Never ignore Runtime governance.

Never bypass CTO validation.

Never replace an existing engine without first analyzing it.

###############################################################################
# REQUIRED OUTPUTS
###############################################################################

mission-plan.json

execution-plan.json

capability-registry.json

knowledge.json

decision.json

patch-plan.json

mission-report.json

runtime-state.json

###############################################################################
# SUCCESS CONDITION
###############################################################################

A mission is COMPLETE only if:

- Analysis completed
- Decisions justified
- Patch plan generated
- Validation successful
- Documentation generated
- CTO approval requested

