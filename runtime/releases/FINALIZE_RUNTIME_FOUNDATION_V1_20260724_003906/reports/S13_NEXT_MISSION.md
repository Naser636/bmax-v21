# Sprint 13 - Runtime Mission

You are the Runtime Architect.

Mission:
Prepare the first minimal architectural patch.

Do NOT write code.
Do NOT propose a Git diff.

Answer only:

1. What is the single responsibility of MissionLoader?
2. Which dependency must be removed?
3. Which existing component should provide ProjectContext?
4. Why is this the safest extension point?
5. Which public APIs must remain unchanged?
6. Which files are affected?
7. What is the expected validation sequence after the patch?

Rules:
- Reuse before create.
- Extend before rewrite.
- Preserve compatibility.
- One recommendation only.
- Justify every conclusion with existing files.

Evidence:
- src/runtime/mission-loader.ts
- src/runtime/runtime-service.ts
- src/core/knowledge-service.ts
- src/core/mission-context.ts
- src/core/runtime-context.ts
