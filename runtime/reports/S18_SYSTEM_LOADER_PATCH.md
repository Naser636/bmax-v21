# Runtime Mission

Implement the first real Runtime capability.

Goal:
Replace the placeholder SystemLoader by a real implementation.

Scope:
- Modify only existing Runtime components required for this capability.
- Preserve all public APIs.
- No wrapper classes.
- No refactoring.
- One Git patch only.

Implementation requirements:

1. Read:
   - runtime/system/CONSTITUTION.md
   - runtime/system/ROADMAP.md
   - runtime/system/POLICIES.md
   - runtime/system/STANDARDS.md

2. Build one immutable ProjectState object.

3. RuntimeContext must expose this ProjectState.

4. All Runtime services must consume RuntimeContext instead of reading files directly.

Validation:

- npx tsc --noEmit
- npm run build
- ./runtime/bin/odg verify

Output ONLY:

1. Unified Git diff
2. Validation checklist
3. Risks
