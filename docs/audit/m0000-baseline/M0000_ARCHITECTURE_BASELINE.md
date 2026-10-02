# M0000 — Architecture Compliance: Official Runtime Baseline

**Mission:** M0000 (PRIORITY 0) · **Mode:** AUDIT / read-only
**Canonical definition:** `runtime/system/ROADMAP.md` §PRIORITY 0 → M0000; contract `runtime/missions/M0000.json`
**CTO authorization:** explicit, bounded read-only baseline/cartography pass (no code change, no patch, no provider, no refactor, no migration, no ledger inference).
**HEAD at pass:** 4b8d6e47915a01649a3da5a95272b93a3b7276e3
**Scope of cartography:** `src/runtime` (the canonical target of `runtime/governance/RUNTIME_ROADMAP.md` §OBJECTIF ACTUEL: "Cartographier tous les moteurs de src/runtime"). Adjacent boundaries (`src/core`, `src/contracts`, `src/providers`, `runtime/core`, `runtime/bin`) are inventoried only as dependency edges, not re-mapped.

**Evidence discipline:** every substantive finding cites a concrete repository path (and line where decisive). Roles are grounded in each file's own header/export names, not filenames. Anything not established from source is marked **UNKNOWN/UNRESOLVED**. No ephemeral ledger was read; no historical "proven/archived" state is treated as current certification.

**Inventory extent:** `src/runtime` = 59 files (42 non-test `.ts`, 13 `.test.ts`, `__fixtures__/a4/*.json`, `vnext/`). This baseline maps the 42 non-test production components.

---

## 1. ArchitectureComplianceReport

### 1.1 Architecture shape (evidence-based)
`src/runtime` is a TypeScript mission-execution runtime organized as layered subsystems around a mission lifecycle: **CLI entry → mission domain → planning → execution/kernel → reporting**, with lateral subsystems for **autonomy/recovery**, **provider integration**, and an **additive `vnext/` goal-oriented layer**.

### 1.2 Two-pipeline boundary (decisive compliance fact)
- `tsconfig.json:25-28` — `"@/*": ["./src/*"]`. Therefore `@/core`→`src/core`, `@/contracts`→`src/contracts`, `@/providers`→`src/providers` (all TypeScript under `src/`).
- `src/core` exists (272 top-level files); `runtime/core` exists separately (64 JS files); `src/contracts` (37); `src/providers` (7).
- Launcher routing (`runtime/bin/odg`): `odg mission` → `exec tsx src/runtime/mission-cli.ts` (line 25 — **this** TS pipeline); `odg autonomy` → `runtime/bin/odg-autonomy.js` (line 35); `odg converge` → `runtime/bin/odg-converge.js` (line 51); `health/state/status/verify/freeze` → `runtime/bin/*.js`.
- **Conclusion:** the `src/runtime` TS pipeline is production-reachable via `odg mission`. The `odg autonomy`/`converge` subcommands run the separate `runtime/core` JS pipeline, NOT `src/runtime/autonomy-cli.ts`/`converge-cli.ts`. (Carnet corroboration: `PHASE_0_CARNET.md` P0-CURRENT-008.)

### 1.3 Compliance against the canonical constitution (observational, not a verdict)
- `runtime/system/CONSTITUTION.md` #7 "human approval before implementation" — mirrored in-code by `vnext/constitution-engine.ts` ("a VERIFIER, never a decider") and by the provider gate `provider-activation.ts`.
- ROOT CAUSE #1 (plan must be a function of the mission): `mission-loader.ts:72-86` now resolves objectives per-mission (`resolveObjectives(id,name)`; the global `runtime/brain/MASTER_PLAN.md` at `:66-67` is explicitly the **last-resort legacy** source, `:298-300`). Source evidence shows the defect recorded in P0-CURRENT-007/009 is addressed in the current tree.
- ROOT CAUSE #2 (SUCCESS requires proof): `runtime-reporter.ts:16-26` derives `status` from a default-deny `evaluate()` gate (`:37-73`), not a hardcoded literal. Source evidence shows the defect recorded in P0-CURRENT-007/009 is addressed in the current tree.
- **Note:** these are source-structure observations for the baseline; this M0000 pass performs **no** test execution and issues **no** certification verdict.

---

## 2. ResponsibilityInventory
Single apparent responsibility per non-test component, grounded in header/export evidence. All paths under `src/runtime/`.

### CLI / entry layer
| Component | Single responsibility | Evidence |
|---|---|---|
| `mission-cli.ts` | Unified single-mission CLI entrypoint (`odg mission <MISSION>`); plans then routes LOCAL/PROVIDER/LOCAL-PIPELINE | header L1-3; `main()` L202; `process.exit(main())` L264 |
| `autonomy-cli.ts` | CLI entrypoint `odg autonomy` (src/runtime variant) | header; `main()` L35 |
| `converge-cli.ts` | CLI entrypoint `odg converge` / routed convergence | header; guard L267-268 |

### Mission domain
| Component | Single responsibility | Evidence |
|---|---|---|
| `mission-intent.ts` | Mission intent type + `createMissionIntent`/`validateMissionIntent` | exports L1-29 |
| `mission-loader.ts` | Load a mission → per-mission `objectiveSpecs` (contract-first; legacy global last) | `MissionLoader` L62; `load()` L72-86 |
| `mission-orchestrator.ts` | Build the `ExecutionPlan` from a loaded mission | `MissionOrchestrator` L33 |
| `mission-engine.ts` | Mission engine over system-loader + runtime-state | `MissionEngine` L4 |
| `mission-migration.ts` | Migration registry: which missions run on which route (`MIGRATED_MISSIONS`, `isExecutableMission`, `provenMissions`) | exports L23-153 |

### Planning / execution core
| Component | Single responsibility | Evidence |
|---|---|---|
| `execution-planner.ts` | Turn plan steps into `TechnicalPlan`/`TechnicalStep` | `ExecutionPlanner` L22 |
| `autonomous-planner.ts` | Planning model abstraction | `AutonomousPlanner` L10 |
| `runtime-kernel.ts` | Kernel: engine + executor + context composition | `RuntimeKernel` L5 |
| `runtime-executor.ts` | Execute a mission plan; register steps; produce report input | `RuntimeExecutor` L14 |
| `local-mission-runner.ts` | LOCAL route runner (UNIFY_RUNTIME_EXECUTION OBJ-002) | header; `LocalMissionRunner` L21 |
| `implementation-engine.ts` | Generate report from plan/steps; `generateReport` | `ImplementationEngine` L30 |

### Runtime state / context / support
| Component | Single responsibility | Evidence |
|---|---|---|
| `runtime-context.ts` | Runtime context (state+engine+system) | `RuntimeContext` L5 |
| `runtime-state.ts` | Mission runtime state machine | `RuntimeState` L4 |
| `runtime-types.ts` | Shared `RuntimeStatus`/`RuntimeMetadata` types | L1-2 |
| `system-loader.ts` | Load the `RuntimeSystem` (governance/system inputs) | `SystemLoader` L16 |
| `execution-memory.ts` | Append/read `ExecutionRecord`s | `ExecutionMemory` L8 |
| `event-bus.ts` | In-process event publish/subscribe | `EventBus` L10 |
| `capability-registry.ts` | Register/lookup `Capability` | `CapabilityRegistry` L6 |
| `runtime-reporter.ts` | Derive terminal `status` via default-deny proof gate | `RuntimeReporter` L12; `evaluate()` L37 |

### Autonomy / recovery
| Component | Single responsibility | Evidence |
|---|---|---|
| `autonomous-execution-engine.ts` | Autonomous Execution With Fallback (capability) | header; `AUTONOMOUS_EXECUTION_ENGINE_V1` L42 |
| `autonomous-execution-adapter.ts` | I/O ports for the execution engine | header; class L66 |
| `autonomy-runtime-adapter.ts` | Integration glue for `@/core/runtime-autonomy` | header; class L113 |
| `persistent-autonomy-controller.ts` | Persistent autonomy controller (capability); consolidated root cause | header; `..._V1` L47 |
| `persistent-autonomy-controller-adapter.ts` | I/O ports for the controller | header; class L69 |
| `root-cause-engine.ts` | Diagnose release-gate root cause → `RootCauseReport`/`CorrectiveMission` | `RootCauseEngine` L169 |
| `snapshot-engine.ts` | Capture runtime/git snapshot | `SnapshotEngine` L65; `SNAPSHOT_ENGINE_V1` L19 |

### Provider integration
| Component | Single responsibility | Evidence |
|---|---|---|
| `provider-activation.ts` | Seam activating Provider Registry + Orchestrator; `activateAndExecute` | header; fn L182; `readProviderPolicy` L328 |
| `provider-failover-engine.ts` | Provider selection + failover orchestration | header; `runMissionWithFailover` L168 |
| `patch-engine.ts` | Provider patch intake edge (`ProviderPatchEngine`) | header; class L69 |

### vnext/ (additive layer — self-labeled ADDITIVE/DORMANT)
| Component | Single responsibility | Evidence |
|---|---|---|
| `vnext/index.ts` | Additive extension surface | header |
| `vnext/activation.ts` | Declarative activation (DORMANT by default) | header; `DEFAULT_VNEXT_CONFIG_PATH` L59 |
| `vnext/goal.ts` | Goal layer + `deriveIntent`/`synthesizeMission` | header; exports L62-88 |
| `vnext/strategy-engine.ts` | Strategy interfaces + `SingleStrategyEngine` | header; L50-62 |
| `vnext/resource.ts` | Resource abstraction | header; `Resource` L59 |
| `vnext/resource-registry.ts` | Resource registry + factory seam | header; `ResourceRegistry` L102 |
| `vnext/resource-config.ts` | Resource config catalog (declaration-only) | header; L17-69 |
| `vnext/resource-allocation-engine.ts` | Resource allocation decisions | header; class L73 |
| `vnext/constitution-engine.ts` | Verifier of runtime decisions vs a constitution | header; `ConstitutionEngine` L104 |
| `vnext/goal-oriented-pipeline.ts` | Additive composition (`runGoalOriented`); does NOT replace the kernel | header; fn L103 |

**Responsibility collisions observed (for later phases, not resolved here):** two autonomy/converge entrypoint families exist — `src/runtime/{autonomy-cli,converge-cli}.ts` vs `runtime/bin/odg-{autonomy,converge}.js`; the launcher drives the JS ones (§1.2). Classification below.

---

## 3. DependencyReport

### 3.1 Internal edges (within `src/runtime`; `A -> B` means A imports B)
```
autonomous-execution-adapter   -> autonomous-execution-engine
autonomy-cli                   -> autonomy-runtime-adapter
autonomy-runtime-adapter       -> patch-engine, root-cause-engine
converge-cli                   -> autonomy-runtime-adapter, mission-migration
execution-planner              -> mission-intent, autonomous-planner
implementation-engine          -> execution-planner, runtime-reporter, mission-intent, runtime-context
local-mission-runner           -> mission-orchestrator, runtime-kernel, mission-intent
mission-cli                    -> autonomy-runtime-adapter, mission-orchestrator, mission-intent,
                                  local-mission-runner, mission-migration, converge-cli
mission-engine                 -> system-loader, runtime-state
mission-loader                 -> mission-intent
mission-orchestrator           -> mission-loader, mission-intent
persistent-autonomy-controller -> autonomous-execution-engine, root-cause-engine
persistent-autonomy-ctrl-adptr -> persistent-autonomy-controller
provider-activation            -> provider-failover-engine
runtime-context                -> runtime-state, mission-engine, system-loader
runtime-executor               -> mission-loader, mission-intent, mission-orchestrator, execution-planner,
                                  execution-memory, event-bus, runtime-context, mission-engine,
                                  capability-registry, runtime-reporter, runtime-state, implementation-engine
runtime-kernel                 -> mission-engine, runtime-executor, runtime-context
runtime-state                  -> runtime-types, system-loader
root-cause-engine / snapshot-engine -> runtime-types
vnext/goal-oriented-pipeline   -> ../capability-registry, vnext/goal, vnext/constitution-engine
vnext/goal                     -> vnext/strategy-engine
vnext/strategy-engine          -> ../mission-intent, vnext/resource
vnext/resource-allocation-engine, vnext/resource-registry -> vnext/resource
vnext/resource-config          -> vnext/resource-registry
vnext/resource                 -> ../runtime-state
```
- **Execution hub:** `runtime-executor.ts` (12 internal imports) is the most-connected node; `runtime-kernel.ts` → `runtime-executor` → (`mission-orchestrator`→`mission-loader`→`mission-intent`) is the core lifecycle chain. **Sink/leaf types:** `runtime-types.ts`, `mission-intent.ts` (no internal imports; widely imported).
- **No import cycles observed** among these edges (vnext depends inward on core via `../`; core does not import vnext — one-directional, consistent with "ADDITIVE").

### 3.2 External / cross-package dependencies
- **Node builtins:** `node:fs` (21×), `node:path` (14×), `node:child_process` (5×), `node:os` (3×), `node:module` (1×).
- **Cross-package (all resolve to `src/*` via `@/*`):** `@/core/runtime-autonomy` (3×, in mission-cli, autonomy-cli, converge-cli), `@/core/provider-registry`, `@/core/provider-orchestrator`, `@/core/documentation-engine`; `@/contracts/*` (release, documentation, provider-adapter, provider-capability, provider-registry, provider-orchestrator, runtime-autonomy); `@/providers/*` (provider-factory, provider-availability, claude-provider-adapter, openai-provider-adapter, provider-port).
- **Runtime data inputs (filesystem, read by code):** `runtime/brain/MASTER_PLAN.md` (legacy last-resort objectives, mission-loader), `runtime/missions/<id>.json` (mission contracts, mission-loader L117/159/191/246), `runtime/config/provider-policy.json` (provider-activation L328), `runtime/config/vnext.json` (vnext/activation L59), `runtime/config/resources.json` (vnext/resource-config L20), `runtime/constitution/runtime-constitution.json` (vnext/constitution-engine L64).
- **Boundary note:** `src/runtime` depends ON `src/core`/`src/contracts`/`src/providers`; the `runtime/core` JS pipeline is a *separate* executable surface reached only through `runtime/bin/*.js` (not imported by `src/runtime`).

---

## 4. ContractInventory
Public contract surface exposed/consumed by `src/runtime` (interfaces/types are the in-code contracts).

### 4.1 Core mission/runtime contracts (exported by `src/runtime`)
- `mission-intent.ts`: `MissionExecutionMode`, `MissionIntent` (+ `createMissionIntent`, `validateMissionIntent`).
- `mission-loader.ts`: `ObjectiveSpec`, `MissionPolicies`, `VerifyRequirement`, `MissionContract`, `RuntimeMission`.
- `mission-orchestrator.ts`: `ExecutionStep`, `PlanDependency`, `ExecutionPlan`.
- `execution-planner.ts`: `TechnicalStep`, `TechnicalPlan`.
- `runtime-reporter.ts`: `RuntimeReport` (`status: "SUCCESS" | "FAILED"`).
- `runtime-types.ts`: `RuntimeStatus`, `RuntimeMetadata`.
- `implementation-engine.ts`: `ImplementationState`, `ImplementationCheckpoint`, `ImplementationPlan`.
- `local-mission-runner.ts`: `LocalMissionResult`.
- `capability-registry.ts`: `Capability`. `event-bus.ts`: `RuntimeEvent`, `RuntimeEventHandler`. `execution-memory.ts`: `ExecutionRecord`.

### 4.2 Autonomy / recovery / provider contracts
- `autonomous-execution-engine.ts`: versioned contract (`AUTONOMOUS_EXECUTION_CONTRACT_VERSION = "1.0.0"`), `ExecutionCapability`, `AutonomousExecutionPorts`, `FailureClassification`, `ExecutionCycle`, `ExecutiveStatus`.
- `persistent-autonomy-controller.ts`: versioned contract (`..._CONTRACT_VERSION = "1.0.0"`), `RecoveryStrategy`, `PersistentAutonomyPorts`, `ConsolidatedRootCause`, `ControllerCycle`.
- `root-cause-engine.ts`: `RELEASE_GATE_ORDER`, `ReleaseGateName`, `RootCause`, `RootCauseReport`, `CorrectiveMission`, `RootCauseStatus`.
- `provider-activation.ts`: `ProviderPolicy`, `ActivationMission`, `ActivationEvidence`. `provider-failover-engine.ts`: `FailoverMissionReport`, `FailoverRunResult/Options`. `patch-engine.ts`: `PatchStatus`, `PatchReceipt`.
- `snapshot-engine.ts`: `GitSnapshot`, `RuntimeSnapshot`.

### 4.3 vnext contracts
`Goal`, `MissionDraft` (goal.ts); `Strategy`, `StrategyEngine` (strategy-engine.ts); `Resource`, `ResourceRequest`, `ResourceAllocation`, `ProviderAvailabilityProbe` (resource.ts); `AllocationPolicy/Decision` (resource-allocation-engine.ts); `Constitution`, `RuntimeDecision`, `ConstitutionVerdict` (constitution-engine.ts); `ExecutionOutcome`, `ValidationOutcome`, `PipelineTrace` (goal-oriented-pipeline.ts).

### 4.4 External contract packages & file contracts (consumed, not owned here)
- `src/contracts/*` (37 files) — the formal contract package imported via `@/contracts/*` (release, documentation, provider-*). **Not re-enumerated** (outside `src/runtime` scope).
- JSON mission contracts under `runtime/missions/*.json` (e.g. `runtime/missions/M0000.json`, read this pass) — the data contract consumed by `mission-loader`.

---

## 5. ExtensionPointInventory
Declared seams/ports that admit alternative implementations (the system's designed extension points).

- **Dependency-injection ports (interfaces):** `AutonomousExecutionPorts` (autonomous-execution-engine), `PersistentAutonomyPorts` (persistent-autonomy-controller), `AutonomyRuntimePorts` (autonomy-runtime-adapter), `PipelineSeams` (vnext/goal-oriented-pipeline), `ConvergeSeams` (converge-cli).
- **Function-type seams:** `ExecutionExecutor` (autonomous-execution-adapter L41), `PersistentExecutor` (persistent-autonomy-controller-adapter L44), `ResourceFactory`/`defaultResourceFactory` (vnext/resource-registry L57/95).
- **Strategy/verifier seams:** `StrategyEngine` interface + `SingleStrategyEngine` (strategy-engine); `ConstitutionEngine` verifier (constitution-engine); `ProviderAvailabilityProbe` (resource.ts).
- **Provider adapter seam:** `@/providers/{claude-provider-adapter,openai-provider-adapter,provider-factory,provider-port}` wired through `provider-activation.ts` / `provider-failover-engine.ts` (pluggable providers).
- **Capability/event/registry seams:** `CapabilityRegistry` (register capabilities), `EventBus` (publish/subscribe), `ResourceRegistry` (register resources).
- **Config-file extension seams:** `runtime/config/provider-policy.json`, `runtime/config/vnext.json`, `runtime/config/resources.json`, `runtime/constitution/runtime-constitution.json`; legacy objective source `runtime/brain/MASTER_PLAN.md`.
- **Mission route extension:** `mission-migration.ts` `MIGRATED_MISSIONS` + `isExecutableMission`/`provenMissions` select execution route per mission.
- **vnext activation seam:** `VNEXT_FEATURES` + `loadVNextActivation`/`isVNextEnabled`/`withVNext` (dormant-by-default additive features).

---

## 6. Canonical/current vs simplified/legacy (only where source evidence supports it)
| Item | Classification | Source evidence |
|---|---|---|
| `mission-loader.ts` objective resolution | **CURRENT** (per-mission objectiveSpecs, contract-first) | L72-86, L80; legacy global is explicit last resort L79, L298-300 |
| `runtime/brain/MASTER_PLAN.md` as objective source | **LEGACY** (last-resort only) | mission-loader L66-67 comment "legacy global … ONLY as a last resort" |
| `runtime-reporter.ts` SUCCESS | **CURRENT** (derived default-deny gate) | L16-26, L37-73 |
| `src/runtime/mission-cli.ts` | **CURRENT / production** entry for `odg mission` | `runtime/bin/odg:25` |
| `src/runtime/{autonomy-cli,converge-cli}.ts` | **ALTERNATE, not launcher-wired** (launcher uses `runtime/bin/odg-{autonomy,converge}.js`) | `runtime/bin/odg:35,51`; src CLIs have own `main()`/guard |
| `vnext/*` | **ADDITIVE / DORMANT by default** (does not replace kernel) | self-labeled headers; `vnext/activation.ts:62` DEFAULT dormant; one-directional deps (§3.1) |

---

## 7. Unresolved / UNKNOWN (not inferred)
1. **UNRESOLVED:** whether repo-root `odg`/`odg.js` wrappers route `odg mission`/autonomy differently than `runtime/bin/odg` (bounded unknown, consistent with P0-CURRENT-008). Not inspected this pass.
2. **UNKNOWN:** runtime *behavioral* equivalence/semantics of any component — this pass read structure only; no execution, no test run. Behavior is not asserted from source shape.
3. **UNKNOWN:** whether `src/runtime/autonomy-cli.ts` / `converge-cli.ts` are reachable by ANY production entrypoint (they are not reached by `runtime/bin/odg`). Dead-vs-alternate is UNRESOLVED without an entrypoint rescan.
4. **UNKNOWN:** current proven/validated *state* of any mission (M0001/M0002/UNIFY_RUNTIME_EXECUTION etc.) — deliberately not derived (ledger excluded; historical proven/archived ≠ current certification).
5. **NOT ENUMERATED (boundary):** full contents of `src/core` (272), `src/contracts` (37), `src/providers` (7), `runtime/core` (64) — inventoried only as dependency edges per M0000 `src/runtime` scope.

---

## 8. Definition-of-Done assessment (contract `runtime/missions/M0000.json`)
| DoD / objective | Status in this baseline |
|---|---|
| ARCHITECTURE_COMPLIANCE_REPORT — "Runtime architectural baseline captured" | **Produced** (§1) |
| RESPONSIBILITY_INVENTORY — "Each component's single responsibility recorded" | **Produced** for all 42 non-test components (§2) |
| DEPENDENCY_REPORT — "Internal and external dependencies inventoried" | **Produced** (§3) |
| CONTRACT_INVENTORY — "Public contracts inventoried" | **Produced** for `src/runtime`; external packages referenced, not re-enumerated (§4) |
| EXTENSION_POINT_INVENTORY — "Extension points inventoried" | **Produced** (§5) |
| DoD "Official Runtime baseline established" | **Met for `src/runtime`** at HEAD 4b8d6e4 (read-only) |
| DoD "No source code modified (read-only mission)" | **Met** — only this audit document created; no `src/`/`runtime/` code touched |
| completion "Mission ledger updated with a proven M0000 entry" | **NOT performed** — ledger update is out of the CTO-authorized read-only scope and the ledger is excluded by instruction; recorded here as a deliberate boundary, not a completion claim |

**Baseline verdict:** the five canonical M0000 deliverables are produced for the `src/runtime` scope with per-finding evidence paths; the read-only DoD items are met. The ledger-update completion item is intentionally **out of scope** and is **not** claimed. This document is a baseline/evidence record, **not** a certification of any mission.
