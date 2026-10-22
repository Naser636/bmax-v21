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

## USB transfer — single version on a physical key (USB-01)

The VPS **cannot** access a USB key; the key is plugged into a **local/transfer computer**. ODG prepares a single,
self-contained, SHA-256-identified transfer **package** on the VPS (gitignored, under
`runtime/generated/operational-backup/transfer/`): `odg-operational-backup-<snapId>.tar.gz` (content-embedded
`manifest.json` + `summary.json` + `RESTORE-FROM-USB.txt`), with `SHA256SUMS` + a non-sensitive `INVENTORY.json`.
The package is **NOT encrypted** — it holds no secrets (export fails-closed on any credential pattern). If
encryption is later required, use a documented tool (e.g. `age`/`gpg`) and never store the key in git/logs.

**Physical-key steps are HUMAN-run** on the transfer computer (adapt device/mount to the real system):

```sh
# 0. (transfer computer) DETECT the key + capacity BEFORE anything. Linux:
lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINT,LABEL        # identify the USB device + mount (e.g. /dev/sdb1 → /media/<user>/<LABEL>)
df -h /media/<user>/<LABEL>                        # confirm free space > ~1 MB (package is ~150 KB)
#   macOS: diskutil list ; mount point under /Volumes/<LABEL>
#   NEVER run mkfs/format/rm on the key without explicitly confirming the device id AND its contents first.

# 1. COPY the package directly onto the key (prefer no permanent copy on the transfer computer).
#    From the transfer computer, pull straight from the VPS to the mounted key:
USB=/media/<user>/<LABEL>          # or /Volumes/<LABEL>
scp <vps-user>@<vps-host>:/home/ubuntu/bmax-v21/runtime/generated/operational-backup/transfer/'odg-operational-backup-*.tar.gz' \
    <vps-user>@<vps-host>:/home/ubuntu/bmax-v21/runtime/generated/operational-backup/transfer/SHA256SUMS \
    <vps-user>@<vps-host>:/home/ubuntu/bmax-v21/runtime/generated/operational-backup/transfer/INVENTORY.json \
    "$USB"/
sync                                # ensure the file is fully flushed/closed before eject

# 2. VERIFY integrity FROM the key (not from a cached copy):
cd "$USB" && sha256sum -c SHA256SUMS        # expect: ... OK
cat INVENTORY.json                          # read the non-sensitive inventory (package sha, file count, hash)

# 3. RESTORE in isolation (on a TRUSTED machine with a clone of bmax-v21 + `npm ci`):
mkdir -p /tmp/odg-usb && tar -xzf "$USB"/odg-operational-backup-*.tar.gz -C /tmp/odg-usb
node runtime/bin/odg-state-backup.js verify  --manifest /tmp/odg-usb/manifest.json          # expect ok:true
node runtime/bin/odg-state-backup.js restore --manifest /tmp/odg-usb/manifest.json --target /tmp/odg-restore
#   compare: `find /tmp/odg-restore -type f | wc -l` == INVENTORY.fileCount (286); spot-check
#   /tmp/odg-restore/runtime/generated/autonomy/self-diagnostic-incidents.json vs the live ledger.
#   NEVER restore onto the live source (the tool refuses runtime/missions, runtime/generated/autonomy, the client store).

# 4. Corruption check (optional): flip a byte in a COPY and confirm sha256sum -c / tar / verify REJECTS it.

# 5. EJECT cleanly, then RE-READ after reconnecting to confirm persistence:
sync && udisksctl unmount -b /dev/sdb1   # (Linux) or: diskutil eject /dev/diskN  (macOS)
#   reconnect → cd "$USB" && sha256sum -c SHA256SUMS  (expect OK)
```

**Single version on the key (Phase D):** the key holds exactly ONE backup — the package + `SHA256SUMS` +
`INVENTORY.json` (+ the embedded `RESTORE-FROM-USB.txt`). Do **not** delete any VPS archive/snapshot/history or
any transfer file until the USB copy has PASSED the integrity (`sha256sum -c`) and restore (`restore`+compare)
checks. Only then may the human delete explicitly-identified temporary transfer files (e.g. `/tmp/odg-usb`,
`/tmp/odg-restore`) — never the VPS operational sources or snapshot history.

**Status:** VPS-side package prep + validation = PASS (extract/verify/corrupt-detect/restore==source proven).
Physical-key read/integrity/restore = **NOT RUN (BLOCKED)** — requires the human + the physical key on the
transfer computer; ODG does not claim the key is tested until `sha256sum -c` + restore-compare succeed **from
the key**.

## Retention & off-VPS copy

- **Retention:** keep the latest verified export under the gitignored backup dir; a human prunes older exports.
- **Off-VPS independent copy:** `BLOCKED` — no independent destination (USB / off-host vault / authorized remote)
  is configured. ODG does **not** claim an off-VPS copy exists until a human provisions a destination and a copy
  is actually verified there (`sha256sum -c` from that medium). No data is sent to any external provider without
  specific authorization. (Same posture as the source-tree backup in `docs/reference-backup/RESTORE.md`.)
