# ODG Operational-State Backup & Verified Restore

Durable, integrity-verified export + verify + **isolated** restore for ODG's **gitignored operational state**
(the incident ledger + autonomy outcomes + local mission contracts). It REUSES the proven
`runtime/core/client-store-backup.js` `verify`/`restore` engine (no duplicated integrity/restore logic; no new
primitive). Tool: `runtime/bin/odg-state-backup.{ts,js}` (TS port is the default via dist; `.js` twin is the
`ODG_RUNTIME=js` rollback). Tests: `runtime/bin/odg-state-backup.test.ts` (19 assertions).

## What is (and isn't) backed up

| Class | Data | In this backup? |
|---|---|---|
| Authoritative, NOT reconstructible | `runtime/generated/autonomy/*.json` (incident ledger `self-diagnostic-incidents.json`, `capability-outcomes.json`, `patch-memory.json`) | **YES** |
| Local decisions, partly non-reconstructible | `runtime/missions/*.json` (local mission contracts incl. `presentStateAcceptance` probes) | **YES** |
| Reconstructible | the rest of `runtime/generated/**` (per-run plan/execution/report, dist, logs, scans) | No — regenerable |
| Versioned | all `runtime/core` + `runtime/bin` code, tests, docs | No — in git |
| Sensitive / separate | the client store (`/var/lib/odg/clients`, `$ODG_CLIENT_STORE`) | No — its own `odg-backup` |
| Secrets / keys / `.env` | — | No — scanned + refused (fail-closed) |

## Commands

```
# EXPORT (read-only on source) → an IMMUTABLE, timestamped snapshot (never overwrites a prior one)
node runtime/bin/odg-state-backup.js export [--out <dir>]
#   → <out>/snapshots/<createdAtMs>-<hash8>/{manifest.json (content-embedded, integrity-hashed), summary.json}
#   → <out>/latest.json  (atomic pointer: {snapshot, manifest, manifestHash, createdAtMs})
#   default <out> = runtime/generated/operational-backup (gitignored). Writes are atomic (tmp+rename).
#   A snapshot id already present with DIFFERING content ⇒ SNAPSHOT_COLLISION (refused, prior kept).

# VERIFY (recompute per-file sha256 + manifestHash; detects tamper/truncation/invalid)
node runtime/bin/odg-state-backup.js verify --manifest <out>/snapshots/<id>/manifest.json

# RESTORE into an EXPLICIT, isolated, empty target (refuses live source/prod + non-empty w/o --force)
node runtime/bin/odg-state-backup.js restore --manifest <out>/snapshots/<id>/manifest.json --target <empty-dir> [--force]
```

**Durability / history:** each export is a DISTINCT immutable snapshot (`<createdAtMs>-<hash8>`); a new export
never destroys a prior archive, and writes are atomic (a crash mid-write cannot corrupt a prior good snapshot).
`latest.json` always points at the newest. Resolve the newest manifest with
`node -e 'console.log(require("./runtime/generated/operational-backup/latest.json").manifest)'`.

## Safety (fail-closed)

- `export` is **read-only** on the source (pure read + hash); it never mutates the ledger/contracts.
- A credential-pattern match in any scoped file ⇒ `export` **REFUSES** (`SECRET_DETECTED`) — secrets are never embedded.
- `restore` **refuses** the repo root / live source dirs (`runtime/generated/autonomy`, `runtime/missions`) and the
  client store as a target; refuses a non-empty target unless `--force`; rejects dangerous manifest paths
  (absolute or `..`); the engine fail-closes on any integrity mismatch / invalid manifest.
- The full content archive is **gitignored** (it lives under `runtime/generated/`). Only this tool, its tests,
  this doc, and a non-sensitive summary are versioned — the repo never holds a full copy of the operational data.

## Recovery after a fresh clone or loss of local operational files

1. `git clone` + `npm ci` + `npm run build:runtime` — restores all **code/mechanisms** (incident lifecycle,
   reconciliation bridge, cross-mission guard, this backup tool). A fresh clone has an **empty** operational
   ledger by design (local runtime history is not versioned).
2. To recover the **operational state**, obtain a previously-exported `manifest.json` (from the gitignored
   backup dir or an off-VPS copy — see below), then:
   `node runtime/bin/odg-state-backup.js verify --manifest <manifest>` → must be `ok:true`.
   `node runtime/bin/odg-state-backup.js restore --manifest <manifest> --target /tmp/odg-restore` (isolated) →
   inspect, then a human copies the verified files back into place (no implicit overwrite of live state).

## Example non-sensitive summary (schema — NO content)

```json
{
  "schema": "operational-state-backup/summary/1",
  "version": 1,
  "createdAtMs": 0,
  "components": ["runtime/generated/autonomy", "runtime/missions"],
  "fileCount": 285,
  "totalBytes": 732984,
  "manifestHash": "<sha256 over (path,sha256) pairs>",
  "perComponent": [
    { "component": "runtime/generated/autonomy", "files": 3 },
    { "component": "runtime/missions", "files": 282 }
  ],
  "exclusions": ["reconstructible runtime/generated/**", "client store", "node_modules/.git", "secrets/.env/keys"]
}
```

## Retention & off-VPS copy

- **Retention:** keep the latest verified export under the gitignored backup dir; a human prunes older exports.
- **Off-VPS independent copy:** `BLOCKED` — no independent destination (USB / off-host vault / authorized remote)
  is configured. ODG does **not** claim an off-VPS copy exists until a human provisions a destination and a copy
  is actually verified there (`sha256sum -c` from that medium). No data is sent to any external provider without
  specific authorization. (Same posture as the source-tree backup in `docs/reference-backup/RESTORE.md`.)
