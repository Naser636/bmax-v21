# ODG — TS Recovery Artifact: decision analysis (2026-10-18)

## Proven facts (this campaign, disposable clones, non-destructive)
- **Compiled dist boots Node-only**: a clone with `runtime/dist` kept but **node_modules removed AND all source `runtime/{core,bin}/*.js` removed** ran `node runtime/dist/bin/odg-run.js RUNTIME_SELF_AUDIT` → **exit 0** and `odg-status` → **exit 0**. ⇒ dist is a self-sufficient, toolchain-free recovery substrate (builtins-only closure).
- **Source `.js` boots Node-only** (prior proof): clone with ZERO dist + ZERO node_modules → `node runtime/bin/odg-run.js` → exit 0 (147 source `.js`).
- **Reproducible**: `build:runtime` (build-runtime-guard) fingerprints all inputs (tsconfig.runtime-dist + build-dist-closure + every runtime/{core,bin} .ts/.js) → identical inputs ⇒ byte-identical dist; the closure manifest is written ONLY on a fully successful build (stale/partial never persists).
- **Fundamental limit**: `node` executes JavaScript, NOT TypeScript ⇒ ANY no-toolchain recovery MUST be committed JavaScript (source `.js` or compiled dist `.js`). This cannot be removed, only chosen.

## Options
| | A — keep source `.js` (status quo) | B — version compiled dist | C — neither committed |
|---|---|---|---|
| No-toolchain recovery | ✅ (proven) | ✅ (proven) | ❌ unavailable |
| Removes the 125 hand-written JS redundancy | ❌ (they ARE the redundancy) | ✅ (.ts canonical; dist is generated) | n/a |
| Cost | dual maintenance via equivalence benches | **commit ~94 generated files; un-gitignore; re-sync dist on every .ts change; divergence risk if not rebuilt** | breaks recovery |
| Reversibility | n/a | medium (revert commit + restore .gitignore) | n/a |

## Recommendation
**B is the only option that removes the hand-written JS redundancy while preserving node-only recovery**, and it is technically PROVEN + reproducible. BUT it is a consequential, debatable repo-architecture change (committing build output; ongoing sync discipline enforced by the fingerprint guard in CI). Per the mandate §3, the **artifact mechanism requires explicit CTO ACCEPTANCE before any source-`.js` removal**; committing dist WITHOUT the accepted removal plan would add the generated-in-git cost with no benefit yet. **⇒ PREPARED, awaiting CTO acceptance of the tradeoff. NOT executed this campaign. NO rollback removed; .gitignore unchanged.**

## Prepared contract (PROPOSED — needs CTO acceptance to AUTHORIZE)
- write-set: `.gitignore` (un-ignore `runtime/dist`), `runtime/dist/**` (versioned artifact), a CI/build staleness gate, `ODG_PROJECT_STATE.md`, + per-batch the removed source `.js`.
- gates per removal batch: consumer map (§4 inventory) + equivalence bench (re-run green) + node-only recovery test (dist) + tsc both + build + reversible revert.
- invariant: dist must equal `build:runtime` output (fingerprint) at commit time — a stale committed dist is REJECTED.
