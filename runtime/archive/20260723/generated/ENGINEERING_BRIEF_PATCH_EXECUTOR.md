# ENGINEERING BRIEF

Mission:
Repair the ODG Patch Executor so that it applies real source-code patches instead of only generating runtime artifacts.

Context:
- Mission pipeline, governance and validation are already working.
- Mission execution ends with SUCCESS.
- Only runtime artifacts (reports, certificates, passports, generated files) are produced.
- No source files are modified.

Objective:
Implement the missing engineering execution layer that writes approved patches into the repository.

Constraints:
- Modify only the components required for Patch Executor.
- Do not modify RuntimeAutonomy.
- Do not modify Mission Loader.
- Do not modify Decision Engine.
- Keep all existing contracts compatible.

Definition of Done:
- A mission modifying source code produces an actual git diff.
- Source files are updated.
- Existing tests continue to pass.
- Governance remains green.
