# ODG/BMAX — Backup & Restore Procedure (reference `1ecfe8c`)

Pairs with `REFERENCE_MANIFEST.md`. Covers: copying the bundle to USB (human), and restoring/rebuilding/verifying in an isolated environment.

## A. Operator step — copy to USB (HUMAN, physical; agent cannot do this)
1. On a trusted workstation, insert a reliable USB key of sufficient capacity (bundle ≈ 4.6 MB; pick ≥ 1 GB quality media).
2. Copy the entire `scratchpad/reference-backup/` directory (`bmax-v21-source-1ecfe8c.tar.gz`, `stashes/`, `SHA256SUMS.txt`) to the key.
3. (If the bundle is deemed sensitive) encrypt the copy; store the decryption key SEPARATELY from the USB key — never on it.
4. Re-verify from the USB medium: `cd <usb>/reference-backup && sha256sum -c SHA256SUMS.txt` → expect all `OK`. Only then is Porte C satisfied (`BACKUP_VERIFIED`).
5. Never place private keys, tokens, passwords, or secrets on the USB key.

## B. Restore + rebuild + verify (isolated — NEVER over the work tree or production)
```sh
mkdir -p /tmp/bmax-restore && cd /tmp/bmax-restore
# 1. integrity
sha256sum -c /path/to/reference-backup/SHA256SUMS.txt       # expect all OK
# 2. extract source
tar xzf /path/to/reference-backup/bmax-v21-source-1ecfe8c.tar.gz -C .
# 3. deterministic deps (network to npm registry)
npm ci                                                       # uses bundled package-lock.json
# 4. rebuild runtime dist from source (fingerprint-gated, deterministic)
node scripts/build-runtime-guard.js
# 5. targeted verification
npx tsx runtime/core/decision-precedent-executor.test.ts     # expect 23/23
npx tsx runtime/core/mission-scheduler.test.ts               # expect 27/27
npx tsc --noEmit -p tsconfig.runtime-dist.json               # expect exit 0
```
Expected: dist closure = 98 modules; "Decision Precedent Consultation" executor present; tests green.

## C. Content-identity check (optional, if a git clone is available)
For any file F: `git hash-object <restored>/F` must equal `git rev-parse 1ecfe8c:F`.
Verified at backup time for `runtime/core/decision-precedent.ts`, `runtime/core/capability-executors.ts`, `package-lock.json` → MATCH.

## D. Stash recovery (non-destructive)
The 5 preserved stashes are exported patches under `stashes/`. To inspect/apply ONE in an isolated clone:
```sh
git apply --3way stashes/stash-<i>.patch     # review first; do NOT apply onto production
```
`stashes-index.txt` lists their original descriptions. The live `.git` stash stack is unchanged; these patches are a redundant off-VPS copy.

## E. Failure recovery
- SHA-256 mismatch ⇒ the medium/copy is corrupt: re-copy from source, re-verify; do not trust a failing bundle.
- `npm ci` failure ⇒ network/registry issue or Node/npm version drift (reference: Node v22.22.1, npm 9.2.0); align tooling, retry.
- Build/test failure on a byte-identical restore ⇒ environment/toolchain drift, not source corruption; reconcile tool versions.

## F. Scope boundary (what this does NOT restore)
Code + contracts + lockfile + scripts only. OS, systemd units, service environment (`ODG_TRUTH_LOCK_ENFORCE`, `ODG_CANARY_ALLOWLIST`), databases/volumes, and secrets are human-owned and restored by their own procedures. Restoring this bundle reconstructs the *project source and its reproducible build*, not a full server.
