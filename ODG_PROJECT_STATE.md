# ODG_PROJECT_STATE — operational compass

> **Durable navigation aid, not an authority.** Strategy and sequencing live in
> `docs/odg-operational/ODG_MASTER_ROADMAP.md` (§U is the active engineering section) and the machine
> manifest `runtime/governance/ROADMAP.json` (never edited without distinct authorization). This file is a
> fast-resume summary; when it disagrees with the roadmap or the Autonomous Work Protocol, THEY win. Refresh
> it each session from the real repo — treat every number below as "last known", re-verified via the planner.

## Last confirmed checkpoint
- **V50 code @`ace03e0`** == `origin/main` (insync), branch `main`, worktree clean, index empty, 5 stashes preserved. (This compass is the following docs commit on top of `ace03e0`.)
- Evidence-dated **2026-10-16** (V50). Nine permanent primitives intact; `runtime/governance/ROADMAP.json` unchanged.

## Validated deliveries V37–V50 (one line each; full evidence in the roadmap §U-CHECKPOINTs + engineering memory)
- **V37** CHANGE_IMPACT_GRAPH (`runtime/core/change-impact-graph.ts`) — pure read-only dep/consumer/closure-hazard graph; consumed by migrate-plan.
- **V38** migrate-plan consumes the graph — transitive closure-hazard detection (strengthen-only).
- **V40** SEMANTIC_PARITY (`src/runtime/semantic-parity.ts`) — declared-normalizer parity + fs-write confinement guard.
- **V42** VALIDATION_ORCHESTRATOR (`src/runtime/validation-orchestrator.ts`) — `runGates(spec,seams)`, 5-state, stop-on-first-non-PASS.
- **V44** FAILURE_TRIAGE_AND_BOUNDED_RECOVERY (`src/runtime/failure-triage.ts`) — composition over runGates; PREPARE_NOT_APPLY default; delegated restore only.
- **V46** HERMETIC_ENVIRONMENT (`src/runtime/hermetic-environment.ts`) — toolchain fingerprint + stale-cache BLOCKED + network ENFORCED-only-on-observed + reproducibility. **§U Phase-1 #1–#5 COMPLETE.**
- **V47** 3 JS→TS parity lots: `invoicing` (@`7dd011d`), `budget-contract` (@`7cc1d42`), `client-store-backup` (@`40f5839`); §U-CHECKPOINT V47 added.
- **V48** path-hazard fix+migration: `expert-profile-assembler` (@`6988429`) — REPO_ROOT `__dirname`→`process.cwd()` (proven repo convention); pure/neutral, authority-intersection + §303 invariant preserved.
- **V49** detector refinement (@`5f83a68`): `change-impact-graph` hazard scan now (A) strips comments before the pathHazard regex (reusing the B141 canonical stripper; strings preserved) and (B) reads the dist-safe `.ts` port as reference when present. Removes exactly 2 false positives (`build-recovery-engine`, `capability-registry`), loses zero real hazards (31-assertion test). Scoped to `change-impact-graph` only — migrate-plan's duplicate inline rules unchanged (aligned in V50).
- **V50** planner inline-rule alignment (@`ace03e0`): `src/runtime/migration-campaign.ts` inline hazard rules (pathHazard/dynamicRequire/externalRequire/deps) now REUSE the same V49 canonical `stripComments`+`parseRequiresFromSource` (`scripts/lib/js-require-scan`) instead of raw-`.js` regexes — no duplicate parser, strings/templates preserved verbatim. End-to-end false positives cleared: migrate-plan now recommends `build-recovery-engine`; hazard-blocked **8→7**. Negative tests prove executable + transitive hazards STILL detected (comment-only mention ⇒ not flagged; same token in code ⇒ flagged). Full `npm test` 397 files exit 0. Only residual = the THIRD defect class (literal `REPO_ROOT` token) → next mission #1.

## Last known inventory (via `odg migrate-plan`, 2026-10-16 @ `ace03e0`)
`runtime/core`: **89 .js · 56 dual TS ports · 27 candidates · 6 excluded · 7 hazard-blocked**; `runtime/bin`: 25 JS launchers.
*Note:* V50 aligned migrate-plan's inline rules with V49, so the end-to-end `hazard-blocked` count dropped 8→7 (`build-recovery-engine`
is now the recommended safe lot). Always recompute before selecting a lot; do not treat these counts as current truth.

## Blockers + the four open cross-cutting follow-ups (NONE closed by V46–V48)
1. Re-express `runMigrateTs` on top of `runGates` (V42) with a byte-identical proof — touches the LIVE gate path; separate authorization.
2. Decide the canonical root-cause authority per failure-class (self-diagnostic vs root-cause-engine) before live-wiring triage.
3. Live-wire `failure-triage` into a real recovery loop (currently composition-only, PREPARE_NOT_APPLY).
4. Retrofit the ~47 equivalence benches onto the SEMANTIC_PARITY contract (large, one-at-a-time).
- **Detector status (V49+V50):** `change-impact-graph` (V49) AND `migration-campaign.ts` inline rules (V50) are now BOTH
  comment-safe via the same canonical `stripComments`+`parseRequiresFromSource` — proven by 31-assertion + migration-campaign
  negative tests, zero recall loss. Residual (i) is CLOSED: migrate-plan end-to-end dropped the 2 proven false positives (8→7
  blocked). ONE residual remains: (ii) a THIRD defect class — the pathHazard regex keys on the literal
  token `REPO_ROOT`, so a port that exports a `process.cwd()`-safe variable NAMED `REPO_ROOT` (for byte-parity, e.g.
  `expert-profile-assembler.ts`) still flags; this keeps `mission-context-builder` blocked. Fixing (ii) = regex understands
  the derivation (safe when `= process.cwd()`), with negative tests; never weaken recall.

## Next missions, in order, with entry conditions
1. ~~**PLANNER INLINE-RULE ALIGNMENT.**~~ **DONE in V50 (@`ace03e0`)** — migration-campaign inline rules now reuse the canonical
   `stripComments`+`parseRequiresFromSource`; end-to-end false positives cleared (blocked 8→7); negative tests prove executable +
   transitive recall; full `npm test` 397 files exit 0. (The `.ts`-reference half of V49 is a no-op for the inline rules because
   candidates are JS-only by definition — only comment-stripping applies to a candidate's own source.) **Next actionable = #2.**
2. **PATHHAZARD DERIVATION (the third defect class) — NEXT.** Scope: `change-impact-graph.ts` + `migration-campaign.ts` + tests.
   Make the pathHazard predicate SAFE when the root var is assigned from `process.cwd()` (so a parity-preserving `REPO_ROOT =
   process.cwd()` port is not flagged), while still flagging any `__dirname`-derived root. Unblocks `expert-profile-assembler`'s
   consumers (`mission-context-builder`). Entry: negative tests; never clear a real `__dirname` derivation.
3. **patch-proposal-apply port** — GENUINE hazard `path.join(__dirname,"patch-executor.js")` (line 88). AUTHORIZATION/APPLY
   perimeter (marshals provider proposals into patch-executor, `spawnSync`). Entry: distinct authorization; the apply authority
   (patch-executor) and authorizedPaths/Action-Contract gate must be provably unchanged; dist-safe executor-path resolution.
4. **build-recovery-engine port** — already `process.cwd()`-safe (η3-B42); its false flag is now cleared END-TO-END (V49 detector
   + V50 planner) and migrate-plan RECOMMENDS it as the next safe lot. Perimeter: build-recovery + reads `provider-authorization.json` +
   `spawnSync` builds. Entry: distinct authorization (recommendation ≠ authorisation — still must be added to LOT_WRITE_SET).
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
- Strategy/sequencing authority: `docs/odg-operational/ODG_MASTER_ROADMAP.md` — §U (active), §U-CHECKPOINT V34→V50.
- Execution interface: `ODG_AUTONOMOUS_WORK_PROTOCOL.json`, `CLAUDE.md`, `AGENTS.md`.
- Engineering memory (per-mission learnings SSOT): `migration-campaign-planner-v20.md` (+ `MEMORY.md` index).
- Capabilities are read-only COMPOSITIONS of the nine primitives — never a tenth primitive, never a parallel engine/registry/checkpoint.
