# Fleet Bridge

The Fleet Bridge is the autonomous link between the **ODG Runtime** and
**Claude Code**. It closes the loop of the existing Fleet file-mailbox protocol.

## Protocol position

```
fleet-dispatcher.js   ODG  -> requests/<id>.json   (PENDING)
fleet-bridge.js       requests -> Claude Code -> responses/<id>.json   (ANSWERED)   <-- this component
fleet-collector.js    responses -> validate + governance   (VALIDATED / FAILED)
```

Status lifecycle (defined in `fleet-envelope.js`, unchanged):

```
PENDING -> DELIVERED -> ANSWERED -> VALIDATED
                     \-> FAILED
```

## What it does

- Watches `runtime/generated/fleet/requests/` (`fs.watch` + poll fallback + startup scan).
- Selects only `PENDING` requests that have no response yet.
- **Exactly-once, multi-instance safe**: claims each request with an atomic
  `O_EXCL` lock file in `runtime/generated/fleet/locks/` *before* any work.
  Any number of Bridge instances may run at once — only one wins each claim.
  Stale locks (older than `lockTtlMs`) are reclaimed after a crash.
- Invokes Claude Code (`claude -p --output-format json …`) with the request's
  instruction + engineering brief, bounded by `timeoutMs`, with `maxRetries`.
- Extracts a structured `{ mission, summary, actions[] }` proposal and writes a
  response envelope that `fleet-collector.js` consumes verbatim.
- Marks the request `ANSWERED` (success) or `FAILED` (with a reason).
- Logs every exchange as JSONL to `runtime/generated/fleet/bridge.log`.

It **reuses** `fleet-envelope.js` only and does **not** modify the wire protocol
(`fleet-envelope.js`, `fleet-dispatcher.js`, `fleet-collector.js`).

## Configuration — `runtime/connectors/fleet-bridge.json`

| key | meaning |
|---|---|
| `command`, `args` | how to invoke Claude Code |
| `timeoutMs` | per-invocation timeout |
| `maxRetries` | extra attempts after the first failure |
| `backoffMs` | delay between attempts |
| `pollMs` | watch-mode poll interval |
| `lockTtlMs` | age after which a lock is considered stale/reclaimable |
| `logFile`, `locksDir` | exchange log and lock directory |

`FLEET_BRIDGE_MOCK=1` returns a canned proposal without calling the CLI —
used for offline, deterministic validation.

## Run

```bash
# Watch continuously (autonomous):
node runtime/core/fleet-bridge.js

# Drain all pending requests once, then exit:
node runtime/core/fleet-bridge.js --once
```

## Validation

```bash
# 1. Offline end-to-end (no real Claude call):
FLEET_BRIDGE_MOCK=1 node runtime/core/fleet-bridge.js --once

# 2. A response envelope was produced and the request advanced:
cat runtime/generated/fleet/responses/FLEET_BRIDGE_V1-002.json
node -e "console.log(require('./runtime/generated/fleet/requests/FLEET_BRIDGE_V1-002.json').status)"  # ANSWERED

# 3. Feed it through the existing collector:
node runtime/core/fleet-collector.js FLEET_BRIDGE_V1-002   # VALIDATED

# 4. Idempotency — re-run, nothing reprocessed:
FLEET_BRIDGE_MOCK=1 node runtime/core/fleet-bridge.js --once

# 5. Audit log:
cat runtime/generated/fleet/bridge.log

# 6. (Optional, live) real round-trip:
node runtime/core/fleet-dispatcher.js FLEET_SMOKE && node runtime/core/fleet-bridge.js --once
```

## Pipeline integration

The Fleet exchange is wired into the ODG execution pipeline as a single stage,
`runtime/core/fleet-stage.js`, positioned by `pipeline-builder.js` **before
"Decision Engine"**:

```
… Knowledge Engine → [Fleet Bridge] → Decision Engine → …
```

- **One-shot only.** The stage drives `Dispatcher → Bridge (drainOnce) → Collector`
  and returns; it never starts watch mode. Watch mode (`node fleet-bridge.js`)
  remains reserved for standalone daemon deployments.
- **Single enable/disable authority.** `pipeline-builder.js` only *positions*
  the stage. Whether it runs is decided entirely inside `fleet-stage.js`, from:
  `ODG_FLEET` env var  >  `runtime/connectors/fleet-pipeline.json`  >  default **OFF**.
  When disabled the stage prints `Fleet: DISABLED (skipped)` and exits 0 — an
  inert no-op, so the pipeline behaves exactly as before.
- **Exit-code policy** (`fleet-pipeline.json`):
  - `failOpen: true` (default) — Dispatcher/Bridge/Collector failures log a
    warning and exit 0; the pipeline continues (non-blocking).
  - `failOpen: false` — any failure exits 1; `odg-run.js` STOPs the mission.

### Config — `runtime/connectors/fleet-pipeline.json`

| key | default | meaning |
|---|---|---|
| `enabled` | `false` | run the Fleet exchange during the pipeline |
| `failOpen` | `true` | Fleet failures are non-blocking |

`ODG_FLEET=on|off` overrides `enabled` at runtime.

### Pipeline validation

```bash
# Builder positions the stage (always present, inert when disabled):
node runtime/core/pipeline-builder.js
node -e "console.log(require('./runtime/generated/runtime-pipeline.json').map(s=>s[0]))"

# Disabled (default) — inert no-op, exit 0:
node runtime/core/fleet-stage.js FLEET_PIPE_TEST

# Enabled, offline: Dispatcher → Bridge → Collector → VALIDATED:
ODG_FLEET=on FLEET_BRIDGE_MOCK=1 node runtime/core/fleet-stage.js FLEET_PIPE_TEST

# Full pipeline smoke, enabled end-to-end:
ODG_FLEET=on FLEET_BRIDGE_MOCK=1 node runtime/bin/odg-run.js FLEET_PIPE_TEST
```
