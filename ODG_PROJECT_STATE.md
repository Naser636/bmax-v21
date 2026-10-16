# ODG_PROJECT_STATE — operational compass

> **Durable navigation aid, not an authority.** Strategy and sequencing live in
> `docs/odg-operational/ODG_MASTER_ROADMAP.md` (§U is the active engineering section) and the machine
> manifest `runtime/governance/ROADMAP.json` (never edited without distinct authorization). This file is a
> fast-resume summary; when it disagrees with the roadmap or the Autonomous Work Protocol, THEY win. Refresh
> it each session from the real repo — treat every number below as "last known", re-verified via the planner.

## Last confirmed checkpoint
- **HEAD `5f83a68`** == `origin/main` (insync — this doc update is the following commit), branch `main`, worktree clean, 5 stashes preserved.
- Evidence-dated **2026-10-16** (V49). Nine permanent primitives intact; `runtime/governance/ROADMAP.json` unchanged.

## Validated deliveries V37–V49 (one line each; full evidence in the roadmap §U-CHECKPOINTs + engineering memory)
- **V37** CHANGE_IMPACT_GRAPH (`runtime/core/change-impact-graph.ts`) — pure read-only dep/consumer/closure-hazard graph; consumed by migrate-plan.
- **V38** migrate-plan consumes the graph — transitive closure-hazard detection (strengthen-only).
- **V40** SEMANTIC_PARITY (`src/runtime/semantic-parity.ts`) — declared-normalizer parity + fs-write confinement guard.
- **V42** VALIDATION_ORCHESTRATOR (`src/runtime/validation-orchestrator.ts`) — `runGates(spec,seams)`, 5-state, stop-on-first-non-PASS.
- **V44** FAILURE_TRIAGE_AND_BOUNDED_RECOVERY (`src/runtime/failure-triage.ts`) — composition over runGates; PREPARE_NOT_APPLY default; delegated restore only.
- **V46** HERMETIC_ENVIRONMENT (`src/runtime/hermetic-environment.ts`) — toolchain fingerprint + stale-cache BLOCKED + network ENFORCED-only-on-observed + reproducibility. **§U Phase-1 #1–#5 COMPLETE.**
- **V47** 3 JS→TS parity lots: `invoicing` (@`7dd011d`), `budget-contract` (@`7cc1d42`), `client-store-backup` (@`40f5839`); §U-CHECKPOINT V47 added.
- **V48** path-hazard fix+migration: `expert-profile-assembler` (@`6988429`) — REPO_ROOT `__dirname`→`process.cwd()` (proven repo convention); pure/neutral, authority-intersection + §303 invariant preserved.
- **V49** detector refinement (@`5f83a68`): `change-impact-graph` hazard scan now (A) strips comments before the pathHazard regex (reusing the B141 canonical stripper; strings preserved) and (B) reads the dist-safe `.ts` port as reference when present. Removes exactly 2 false positives (`build-recovery-engine`, `capability-registry`), loses zero real hazards (31-assertion test). Scoped to `change-impact-graph` only — migrate-plan's duplicate inline rules unchanged (see next missions).

## Last known inventory (via `odg migrate-plan`, 2026-10-16 @ `5f83a68`)
`runtime/core`: **89 .js · 56 dual TS ports · 27 candidates · 6 excluded · 8 hazard-blocked**; `runtime/bin`: 25 JS launchers.
*Note:* V49 fixed the `change-impact-graph` detector, but migrate-plan's `hazard-blocked` count is UNCHANGED because the
planner (`src/runtime/migration-campaign.ts`) carries DUPLICATE inline hazard rules on the raw `.js` — aligning those is the
next mission. Always recompute before selecting a lot; do not treat these counts as current truth.

## Blockers + the four open cross-cutting follow-ups (NONE closed by V46–V48)
1. Re-express `runMigrateTs` on top of `runGates` (V42) with a byte-identical proof — touches the LIVE gate path; separate authorization.
2. Decide the canonical root-cause authority per failure-class (self-diagnostic vs root-cause-engine) before live-wiring triage.
3. Live-wire `failure-triage` into a real recovery loop (currently composition-only, PREPARE_NOT_APPLY).
4. Retrofit the ~47 equivalence benches onto the SEMANTIC_PARITY contract (large, one-at-a-time).
- **Detector status (V49):** `change-impact-graph` is FIXED (comments stripped before the pathHazard regex; `.ts` port read
  as reference) — proven by a 31-assertion test, zero recall loss. TWO residuals remain: (i) `migration-campaign.ts` carries
  DUPLICATE inline hazard rules on raw `.js` that independently reproduce both false positives — so migrate-plan end-to-end is
  unchanged until those are aligned (next mission #1); (ii) a THIRD defect class — the pathHazard regex keys on the literal
  token `REPO_ROOT`, so a port that exports a `process.cwd()`-safe variable NAMED `REPO_ROOT` (for byte-parity, e.g.
  `expert-profile-assembler.ts`) still flags; this keeps `mission-context-builder` blocked. Fixing (ii) = regex understands
  the derivation (safe when `= process.cwd()`), with negative tests; never weaken recall.

## Next missions, in order, with entry conditions
1. **PLANNER INLINE-RULE ALIGNMENT (complementary write-set to V49; highest leverage).** Scope: `src/runtime/migration-campaign.ts`
   (+ its test) ONLY. Its inline hazard rules (lines ~126–142) regex the raw `.js` with no comment-stripping and no `.ts`
   preference — duplicating the logic V49 fixed in `change-impact-graph`. Align them to the SAME discipline (reuse the canonical
   `stripComments` + `.ts`-reference), so migrate-plan end-to-end drops the 2 proven false positives. Entry: negative tests that
   every genuine executable/dynamic/external/transitive hazard is STILL blocked; `migration-campaign` + `migrate-plan`
   regression. Do NOT weaken recall; do NOT fold the logic into a shared helper without an ODG write-set decision.
2. **PATHHAZARD DERIVATION (the third defect class).** Scope: `change-impact-graph.ts` (+ migration-campaign after #1) + tests.
   Make the pathHazard predicate SAFE when the root var is assigned from `process.cwd()` (so a parity-preserving `REPO_ROOT =
   process.cwd()` port is not flagged), while still flagging any `__dirname`-derived root. Unblocks `expert-profile-assembler`'s
   consumers (`mission-context-builder`). Entry: negative tests; never clear a real `__dirname` derivation.
3. **patch-proposal-apply port** — GENUINE hazard `path.join(__dirname,"patch-executor.js")` (line 88). AUTHORIZATION/APPLY
   perimeter (marshals provider proposals into patch-executor, `spawnSync`). Entry: distinct authorization; the apply authority
   (patch-executor) and authorizedPaths/Action-Contract gate must be provably unchanged; dist-safe executor-path resolution.
4. **build-recovery-engine port** — already `process.cwd()`-safe (η3-B42); its detector flag is cleared by V49 (comment-only),
   but migrate-plan still blocks it until mission #1. Perimeter: build-recovery + reads `provider-authorization.json` +
   `spawnSync` builds. Entry: distinct authorization.
5. **Per-perimeter clusters (each its own authorization):** FINANCE/DEC-006 (`payments`, `quote`, `price-resolution`, `cost-accounting`,
   `budget-ledger`, `live-cost-metering`, `economic-verification`, `finance-*`; also unblocks closure-sensitive `mechanical-acceptance`/
   `acceptance-facts`/`fleet-collector`), PROVIDER (`local-model-manager`, `provider-sandbox`, `provider-live-call-gate`, `ollama-control-plane`,
   `fleet-bridge`), AUTHORIZATION/SECURITY (`action-gate`, `capability-authorization`, `patch-action-contract`, `bash-command-governor`),
   EXTERNAL-COMMS (`email-gateway`).

## Exact resume command
```bash
cd /home/ubuntu/bmax-v21 && git fetch origin && git status --porcelain=v1   # Truth Lock: expect clean, HEAD==origin/main
./runtime/bin/odg migrate-plan                                              # recompute the REAL inventory + next lot
# For a parity lot <L>: add it to LOT_WRITE_SET + LOT_HISTORICAL in src/runtime/migrate-ts-cli.ts and to
# tsconfig.runtime-dist.json "include", create runtime/core/<L>.ts + runtime/__bench__/<L>-equivalence.e2e.test.ts, then:
./runtime/bin/odg migrate-ts <L>                                            # 5-gate proof (index MUST be empty first)
node_modules/.bin/tsc -p tsconfig.json --noEmit && git diff --check         # whole-program strict TS + whitespace
```
Parity-lot recipe = 4 edits/lot (`core/<L>.ts` + equivalence bench + tsconfig-runtime-dist include + LOT_WRITE_SET/LOT_HISTORICAL).

## References
- Strategy/sequencing authority: `docs/odg-operational/ODG_MASTER_ROADMAP.md` — §U (active), §U-CHECKPOINT V34→V47.
- Execution interface: `ODG_AUTONOMOUS_WORK_PROTOCOL.json`, `CLAUDE.md`, `AGENTS.md`.
- Engineering memory (per-mission learnings SSOT): `migration-campaign-planner-v20.md` (+ `MEMORY.md` index).
- Capabilities are read-only COMPOSITIONS of the nine primitives — never a tenth primitive, never a parallel engine/registry/checkpoint.
