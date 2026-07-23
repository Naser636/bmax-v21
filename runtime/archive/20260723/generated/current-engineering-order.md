# CTO ENGINEERING ORDER #002

ENGINEER
ODG Runtime

MISSION

Analyze the engineering order before producing any patch.

MANDATORY EXECUTION PIPELINE

1. Read Engineering Order
2. Analyze current implementation
3. Compare with expected implementation
4. Detect missing capabilities
5. Produce implementation strategy
6. Produce Patch Plan
7. Estimate risks
8. Wait for CTO approval

OUTPUTS

runtime/generated/implementation-analysis.json
runtime/generated/implementation-strategy.json
runtime/generated/patch-plan.json
runtime/generated/risk-analysis.json

RULES

Never write code directly.

Never modify source files.

Always explain why each capability is required.

Always preserve compatibility.

Always wait for CTO approval.

SUCCESS

The Runtime understands HOW to evolve before proposing any implementation.

STATUS

READY_FOR_ANALYSIS

