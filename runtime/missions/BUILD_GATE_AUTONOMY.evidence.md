# Evidence — BUILD_GATE_AUTONOMY

Capability: the Build/TypeScript gate is now **autonomous**. A red gate no longer stops the runtime;
the Validation Engine delegates to a new **Build Recovery Engine** that repairs locally in a bounded,
evidence-guarded loop and authorizes the Provider only as a last resort.

## Deliverables

| Artifact | Role |
| --- | --- |
| `runtime/core/build-recovery-engine.js` | The engine: collect → classify → fix (allow-list, in-scope) → rebuild → loop-while-improving → hand back / authorize Provider. |
| `runtime/config/build-recovery.json` | ODG-owned allow-list of authorized local fixers, commands, iteration cap. |
| `runtime/core/validation-engine.js` | Now **delegates** a red `build=false`/`typescript=false` gate instead of `exit(1)`. |
| `runtime/core/build-recovery-engine.test.js` | 18 assertions across the 3 contract paths. |
| `runtime/missions/BUILD_GATE_AUTONOMY.json` | Mission contract (objectives, authorized paths, `build-green`/`typescript-green` probes). |

## Not touched (constraints honored)

Roadmap, Scheduler, Mission Engine — none modified. The only source fix outside the engine is the
duplicate-key overwrite the engine itself repaired (see below).

## Contract loop (as implemented)

1. run the build / typecheck;
2. collect every TypeScript error;
3. classify each by Root Cause;
4. apply **only** authorized local fixers, **only** inside the mission's `authorized_paths`;
5. re-run the build automatically;
6. continue **while** the total error count strictly decreases;
7. hand control back when `build && typescript` are green — **or**, only when no improvement is
   demonstrated, authorize the Provider.

**Safety invariant:** every iteration is snapshotted and rolled back if the error count did not
strictly decrease. The engine can never make the tree worse — worst case is "no net change, Provider
authorized". Fixers therefore stay pragmatic (line-local text transforms) without risk.

### Authorized fixers (allow-list)

- `TS6133` unused-import → remove the unused import specifier only (never a side-effecting local).
- `TS2304 / TS2551 / TS2552` undefined-symbol → apply the compiler's own "Did you mean 'Y'?" rename.
- `TS2783` duplicate-property-overwrite → move `{ X, ...rest }` → `{ ...rest, X }` so the explicit
  value wins.

## Proof

### 1. Engine repaired a real error in the tree (1 iteration)

`src/runtime/autonomy-runtime-adapter.ts:572` had `TS2783` — `this.writeJson(FAILOVER_REPORT, { mission, ...report })`
silently overwrote the explicit `mission`. The engine classified it (`duplicate-property-overwrite`)
and rewrote it to `{ ...report, mission }`; `tsc --noEmit` then exit 0.

```
{ "iterations": 1, "improved": true, "typescript": true, "build": true,
  "rootCauses": ["duplicate-property-overwrite"],
  "modifiedFiles": ["src/runtime/autonomy-runtime-adapter.ts"] }
```

### 2. Unit test — all three contract paths (18/18 assertions)

- **green recovery** — authorized in-scope fix → loop converges → Provider NOT authorized.
- **provider escalation** — no authorized fixer → no improvement → tree rolled back byte-for-byte →
  Provider authorized.
- **scope guard** — a fixable error outside `authorized_paths` is left untouched and escalates.

`node runtime/core/build-recovery-engine.test.js` → `BUILD RECOVERY ENGINE — 18 assertions passed.`

### 3. End-to-end pipeline — delegation + promotion

`./runtime/bin/odg-run.js BUILD_GATE_AUTONOMY` with a red persisted gate delegated, recovered green,
and printed **only** the required summary:

```
Root Cause      : (none)
Fichier(s)      : (none)
Itérations Build: 0
Build           : true
TypeScript      : true
Validation      : PASSED
Mission promue  : true
```

Lifecycle → `RELEASED`, Ledger → `ARCHIVED`, `PIPELINE SUCCESS`.

### 4. End-to-end — escalation through the real Validation Engine

With an unfixable in-scope `TS2322` present, the Validation Engine delegated, demonstrated no
improvement, printed `Validation: BLOCKED`, `Mission promue: false`, `Provider: AUTHORIZED`, exited 1,
and wrote `runtime/generated/provider-authorization.json` (`authorized: true`). The Provider is
authorized **only** on this path — never on a green gate (the engine clears any stale authorization
on success).
