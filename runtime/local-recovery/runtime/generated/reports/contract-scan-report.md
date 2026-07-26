# Runtime Contract Scan Report

- Generated: 2026-07-25T23:31:10.470Z
- Missions on disk: 56
- Executable contracts: 52
- Proven capabilities: 46
- Executable & not yet proven (queue): 6

## Executable mission queue (deterministic order)
- **AUTONOMOUS_EXECUTION_WITH_FALLBACK** — EXECUTE_THE_ASSIGNED_ENGINEERING_MISSION  _(requires provider)_
- **PERSISTENT_AUTONOMY_CONTROLLER_V1** — EXECUTE_THE_ASSIGNED_MISSION  _(requires provider)_
- **PROVIDER_FAILOVER_TO_OPENAI** — USE_OPENAI_PROVIDER_IF_CLAUDE_IS_UNAVAILABLE  _(requires provider)_
- **PROVIDER_RESILIENCE_FOUNDATION_V1** — REPLACE_FAIL_FAST_PROVIDER_EXECUTION_BY_A_RESILIENCE_LOOP  _(requires provider)_
- **RUNTIME_EVOLUTION_PROGRAM_V1** — DISCOVER_ALL_PENDING_RUNTIME_MISSIONS  _(requires provider)_
- **RUNTIME_SELF_EVOLUTION_V1** — ANALYZE_THE_COMPLETE_RUNTIME  _(requires provider)_

## Incomplete / non-executable contracts
- **MASTER_PLAN_V1** → `SKIPPED` — file is an orchestration plan, not a leaf mission contract
- **RETIRE_LEGACY_RUNTIME** → `NEEDS_CONTRACT` — mission contract declares no objectives (Mission Loader guard)
- **RUNTIME_PROVIDER_ORCHESTRATOR_M3.pack** → `SKIPPED` — file is an evidence pack, not a mission contract
- **RUNTIME_PROVIDER_REGISTRY_M4.pack** → `SKIPPED` — file is an evidence pack, not a mission contract
