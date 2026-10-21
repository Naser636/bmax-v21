# ODG/BMAX — Reference Version Manifest (A–Z campaign, Phase B/C/D)

**Status:** `REFERENCE_CANDIDATE` + `BACKUP_RESTORE_VERIFIED` (bundle-level, isolated).
**Authored under:** CTO MASTER ROADMAP "ODG/BMAX — De la version de référence au déploiement contrôlé" (Phases A–D). Contract `REFERENCE_VERSION_AND_BACKUP`.

## Reference identity
- **Commit (reference):** `1ecfe8c3b59614ab3e628c219668e8042839e98d` (`main`, == `origin/main`, fetch-confirmed, 0↔0).
- **Tree:** `b2a5d543680e86f9dcf6db4923d27a7c0c7b8fa1`.
- **Tracked files:** 2848 · tracked source size ≈ 2.5 MB (excl. `.git`, `node_modules`, `runtime/generated`).
- **Gates at this commit:** G7 `FORMALIZE_SCHEDULER_IDLE_OBSERVABILITY_DELTA` ACCEPTED · G9 `PROVE_READONLY_PRECEDENT_REUSE` ACCEPTED · G9↔G10 `INTEGRATE_DECISION_PRECEDENT_CAPABILITY` AUTHORIZED (live read-only precedent executor) · G10 mechanism VERIFIED on an isolated real unit; fleet-wide NOT_MEASURABLE · G8 BLOCKED_BY_DEPENDENCY (host reboot/recovery, human-gated).

## Toolchain actually used (reproducibility)
- Node.js **v22.22.1**, npm **9.2.0**, TypeScript **5.9.3**.
- `package.json`: 6 dependencies, 9 devDependencies (`engines` unset).
- **`package-lock.json` tracked** (257 KB) ⇒ deterministic dependency reinstall via `npm ci`.
- Runtime dist is **regenerable + fingerprint-gated** (`scripts/build-runtime-guard.js` → `tsc -p tsconfig.runtime-dist.json` + `build-dist-closure.js`); SKIP when inputs unchanged. Dist is therefore NOT bundled (reliably reconstructable from source). Closure = 98 modules.

## Backup bundle (off-VPS copy — see RESTORE.md)
Location (this VPS, pre-USB): `scratchpad/reference-backup/` (NOT committed; copy to USB by a human).
- `bmax-v21-source-1ecfe8c.tar.gz` — `git archive` of the reference tree (2848 files, 4,299,412 bytes). SHA-256 `1b0b74c9614924061fe270152dfa63d12769aa282c31ea20c229c94bc4af1e56`.
- `stashes/stash-{0..4}.patch` + `stashes-index.txt` — the 5 preserved stashes exported as patches (non-destructive; originals untouched in `.git`).
- `SHA256SUMS.txt` — manifest over all bundle members. Total bundle ≈ 4.6 MB.
- **Excluded by design:** `node_modules`, caches, `runtime/generated/*` (regenerable), logs, and ALL secrets/tokens/keys (none in bundle).

## Validation criteria for this reference
1. `git` HEAD == `origin/main` == reference commit, worktree clean, stashes preserved.
2. Bundle SHA-256 verifies; extracted content git-blob-identical to the reference commit.
3. `npm ci` (from bundled lockfile) + `node scripts/build-runtime-guard.js` reproduce dist.
4. Targeted tests pass on the restored tree.

## Restore verification evidence (Phase D — isolated)
- SHA-256 `sha256sum -c`: **7/7 OK**.
- Content integrity vs `1ecfe8c`: `decision-precedent.ts`, `capability-executors.ts`, `package-lock.json` → **git-blob MATCH**.
- Dist rebuilt from restored source: closure 98, new "Decision Precedent Consultation" executor present.
- Targeted tests on restored tree: `decision-precedent-executor` **23/23**, `mission-scheduler` **27/27**.
- Restore+build+test elapsed ≈ **11 s** (deps provided via existing install; from-scratch `npm ci` is the documented reinstall step and needs network).

## Reproducibility limits (honest)
- Restore test used a symlinked existing `node_modules`; a cold restore must run `npm ci` (network to the npm registry) first — deterministic via the bundled lockfile but not exercised offline here.
- The code bundle is NOT a full server backup: OS, systemd units, service env (incl. `ODG_TRUTH_LOCK_ENFORCE`/`ODG_CANARY_ALLOWLIST`), any database/volumes, and secrets have their own (human-owned) procedures and are out of this bundle's scope.
- **Physical USB write + off-site custody = HUMAN/physical-gated** (agent has no USB/physical access): `BLOCKED_BY_DEPENDENCY` until an operator copies `scratchpad/reference-backup/` to a verified, optionally-encrypted USB key and re-verifies SHA-256 from that medium (Porte C).
