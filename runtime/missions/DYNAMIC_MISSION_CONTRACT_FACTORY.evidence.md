# Evidence — DYNAMIC_MISSION_CONTRACT_FACTORY

Capability: **Contract On Demand**. The Runtime can execute **any** new mission without a pre-written
contract. When an unknown mission is requested, the Mission Contract Factory synthesizes a complete,
Mission-Loader-conformant contract and the pipeline resumes immediately — removing the dependency on a
closed list of pre-authored contracts.

## Deliverables

| Artifact | Role |
| --- | --- |
| `runtime/core/mission-contract-factory.js` | New `generateForMission(root, id, {write})` (on-demand for an arbitrary id), `isOnDemandEnabled(root)` (policy/env gate), enriched `buildContract` (adds `permissions`, `lifecycle`, `policies`, `evidence`). |
| `runtime/core/mission-loader.js` | Unknown mission → generate → validate → **resume** (was a hard STOP). Strict STOP preserved when on-demand is disabled. |
| `runtime/policies/runtime-policies.json` | New `contractOnDemand` governance block (enabled + registered capabilities). |
| `runtime/core/mission-contract-factory.test.js` | +16 assertions (39 total) — on-demand for a non-roadmap id, reuse untouched, full contract shape, policy/env gate. |

## Contract shape generated (objectifs, lifecycle, permissions, engineering mode, evidence, policies, authorized paths)

`buildContract` reuses the canonical schema from `mission-synthesizer.toContract` (single schema
source) and enriches it with:

- **objectives** — at least one `{id, goal, done_when}` (Mission Loader guard);
- **lifecycle** — the governance state chain `CREATED … ARCHIVED` (mirrors `state-machine.json`);
- **permissions** — `{engineering, authorizedPaths, network:false}`;
- **engineering mode** — `mode` + `requires_engineering` derived from the entry/hints;
- **evidence** — the runtime artifacts the run is expected to produce;
- **policies** — `DETERMINISM_FIRST`, `REUSE_BEFORE_CREATE`, `LOCAL_FIRST` (existing vocabulary);
- **authorized paths** — explicit paths, else `runtime/**` when engineering, else none.

## Backward compatibility

An already-executable contract is **reused byte-for-byte** (`generateForMission` returns
`{reused:true}` and never overwrites). Existing contracts and every existing runner are unchanged.

## Governance

Generation is authorized by `runtime/policies/runtime-policies.json → contractOnDemand.enabled`
(default `true`), overridable with `ODG_CONTRACT_ON_DEMAND` (`0`/`false` restores the strict
STOP-for-authoring behaviour). Deterministic: `buildContract` has no wall-clock/randomness, so
regenerating an identical mission never churns the tree.

## Proof

```
# unit
node runtime/core/mission-contract-factory.test.js
→ MISSION CONTRACT FACTORY — 39 assertions passed.

# end-to-end via the Mission Loader (the pipeline choke point)
node runtime/core/mission-loader.js DEMO_ONDEMAND_UNKNOWN_MISSION
→ MISSION LOADER — CONTRACT ON DEMAND … synthesized one automatically … Resuming the normal pipeline
→ Objectives : 1  Status : READY_FOR_EXECUTION  (mission-plan.json written)

ODG_CONTRACT_ON_DEMAND=0 node runtime/core/mission-loader.js DEMO_ONDEMAND_STRICT_MISSION
→ BLOCKED: no mission contract … (strict behaviour preserved)
```
