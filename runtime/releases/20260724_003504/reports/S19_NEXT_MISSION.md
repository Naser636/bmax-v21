# Sprint 19 - Mission Engine

Mission

Implement the first real Mission Engine capability.

Objective

Transform one natural language objective into one MissionPlan.

Inputs

- RuntimeContext
- Constitution
- Roadmap
- Policies
- Standards

Responsibilities

The Mission Engine must:

- understand the objective;
- analyse the repository;
- identify impacted components;
- identify dependencies;
- identify risks;
- determine the smallest valid change;
- determine required validations;
- produce one MissionPlan.

Rules

- No patch generation.
- No execution.
- No Git operations.
- No filesystem modifications outside MissionPlan generation.
- Preserve public APIs.
- Produce one Git patch only.

Output

Only:

1. Unified Git diff
2. Validation checklist
3. Risks

