MISSION: P002
TARGET: runtime/bin/odg-status.js
OBJECTIVE: Replace the placeholder "STATUS : READY" with the official ODG Foundation Dashboard.
READ ONLY:
- runtime/generated/runtime-state.json
- runtime/generated/runtime-status.json
- runtime/generated/capability-registry.json
- runtime/generated/mission-ledger.json
CONSTRAINTS:
- Modify one file only.
- No new architecture.
- No new dependencies.
- Keep CLI compatibility.
OUTPUT:
- Runtime Health
- Validated Capabilities
- Missing Capabilities
- Last Mission
- Next Mission
- Recommended Action
