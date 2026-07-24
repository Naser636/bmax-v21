# Sprint 23 - Patch Engine

Mission

Implement the first real Patch Engine capability.

Objective

Transform one validated MissionPlan into one minimal PatchPlan.

Input

- RuntimeContext
- KnowledgeModel
- MissionPlan

Output

- One immutable PatchPlan

Patch Engine responsibilities

- Reuse before create.
- Compute the minimal change.
- Identify impacted files.
- Prepare rollback.
- Prepare validation plan.
- Estimate risks.

Constraints

- Do NOT modify source code.
- Do NOT apply patches.
- Do NOT execute Git operations.
- Do NOT execute builds.

Deliverables ONLY

1. PatchPlan
2. Unified Git diff
3. Validation checklist
4. Risks
5. Rollback plan

Wait for CTO approval before execution.

