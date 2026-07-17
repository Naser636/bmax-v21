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
