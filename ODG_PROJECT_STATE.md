# ODG_PROJECT_STATE — operational compass

> **Durable navigation aid, not an authority.** Strategy and sequencing live in
> `docs/odg-operational/ODG_MASTER_ROADMAP.md` (§U is the active engineering section) and the machine
> manifest `runtime/governance/ROADMAP.json` (never edited without distinct authorization). This file is a
> fast-resume summary; when it disagrees with the roadmap or the Autonomous Work Protocol, THEY win. Refresh
> it each session from the real repo — treat every number below as "last known", re-verified via the planner.

## Last confirmed checkpoint
- **V52 lot @`ddcdf1f`** == `origin/main` (insync), branch `main`, worktree clean, index empty, 5 stashes preserved. (This compass is the following docs commit on top of `ddcdf1f`.)
- Evidence-dated **2026-10-16** (V52). Nine permanent primitives intact; `runtime/governance/ROADMAP.json` unchanged.

## Validated deliveries V37–V52 (one line each; full evidence in the roadmap §U-CHECKPOINTs + engineering memory)
- **V37** CHANGE_IMPACT_GRAPH (`runtime/core/change-impact-graph.ts`) — pure read-only dep/consumer/closure-hazard graph; consumed by migrate-plan.
- **V38** migrate-plan consumes the graph — transitive closure-hazard detection (strengthen-only).
- **V40** SEMANTIC_PARITY (`src/runtime/semantic-parity.ts`) — declared-normalizer parity + fs-write confinement guard.
- **V42** VALIDATION_ORCHESTRATOR (`src/runtime/validation-orchestrator.ts`) — `runGates(spec,seams)`, 5-state, stop-on-first-non-PASS.
- **V44** FAILURE_TRIAGE_AND_BOUNDED_RECOVERY (`src/runtime/failure-triage.ts`) — composition over runGates; PREPARE_NOT_APPLY default; delegated restore only.
- **V46** HERMETIC_ENVIRONMENT (`src/runtime/hermetic-environment.ts`) — toolchain fingerprint + stale-cache BLOCKED + network ENFORCED-only-on-observed + reproducibility. **§U Phase-1 #1–#5 COMPLETE.**
- **V47** 3 JS→TS parity lots: `invoicing` (@`7dd011d`), `budget-contract` (@`7cc1d42`), `client-store-backup` (@`40f5839`); §U-CHECKPOINT V47 added.
- **V48** path-hazard fix+migration: `expert-profile-assembler` (@`6988429`) — REPO_ROOT `__dirname`→`process.cwd()` (proven repo convention); pure/neutral, authority-intersection + §303 invariant preserved.
- **V49** detector refinement (@`5f83a68`): `change-impact-graph` hazard scan now (A) strips comments before the pathHazard regex (reusing the B141 canonical stripper; strings preserved) and (B) reads the dist-safe `.ts` port as reference when present. Removes exactly 2 false positives (`build-recovery-engine`, `capability-registry`), loses zero real hazards (31-assertion test). Scoped to `change-impact-graph` only — migrate-plan's duplicate inline rules unchanged (aligned in V50).
- **V50** planner inline-rule alignment (@`ace03e0`): `src/runtime/migration-campaign.ts` inline hazard rules (pathHazard/dynamicRequire/externalRequire/deps) now REUSE the same V49 canonical `stripComments`+`parseRequiresFromSource` (`scripts/lib/js-require-scan`) instead of raw-`.js` regexes — no duplicate parser, strings/templates preserved verbatim. End-to-end false positives cleared: migrate-plan now recommends `build-recovery-engine`; hazard-blocked **8→7**. Negative tests prove executable + transitive hazards STILL detected (comment-only mention ⇒ not flagged; same token in code ⇒ flagged). Full `npm test` 397 files exit 0. Only residual = the THIRD defect class (literal `REPO_ROOT` token) → fixed in V51.
- **V51** pathHazard derivation fix (@`1194831`): `change-impact-graph.ts` pathHazard now understands the REPO_ROOT DERIVATION — `__dirname` in a path build is always a hazard; `REPO_ROOT` is a hazard ONLY when NOT provably `= process.cwd()` (optional TS type annotation tolerated); any other derivation keeps `__dirname` in code and is still caught (recall never lowered). Clears `expert-profile-assembler` (true→false) and its transitive consumer `mission-context-builder`; migrate-plan hazard-blocked **7→6**. C1–C7 negative/positive tests + stale `epa===true` assertion corrected to `===false`. Full `npm test` 397 files exit 0. **All three detector defect classes now CLOSED.**
- **V52** JS→TS parity lot `mission-context-builder` (@`ddcdf1f`): ODG GATE-A lowest-risk candidate migrated via official `odg migrate-ts` (dual port, .js retained, default unchanged). Deterministic composition (plan + RuntimeContext + inert expertInstance); `authorizedPaths` verbatim passthrough; spawnSync/scan only injectable fallbacks (not exercised by parity). Byte-identical bench (ENG+ECON contexts, null/partial runtime, empty-mission guard, `opts.write` JSON byte-identical in temp cwds, real loadMissionPlan read branch w/o spawn). Gate 5/5 PASS; `tsc` 0; full `npm test` 397 exit 0. Dual ports 56→57; hazard-blocked 6.

## Last known inventory (via `odg migrate-plan`, 2026-10-16 @ `ddcdf1f`)
`runtime/core`: **89 .js · 57 dual TS ports · 26 candidates · 6 excluded · 6 hazard-blocked**; `runtime/bin`: 25 JS launchers.
*Note (V52 GATE-4 recalculation):* NO further neutral/independent lot is auto-migratable without a distinct authorization. The planner's
top safe lot is `build-recovery-engine` (explicitly out of scope — provider-authz/autonomous-apply). Every other safe candidate is either in a
forbidden perimeter directly (provider: `local-model-manager`/`provider-sandbox`/`fleet-bridge`; finance/DEC-006: `payments`/`price-resolution`/
`economic-verification`/`quote`/`finance-sim`/`finance-paper`/`live-cost-metering`; authz/security: `action-gate`/`capability-authorization`/
`patch-action-contract`/`bash-command-governor`) or pulls one into its dist CLOSURE (`acceptance-facts`/`mechanical-acceptance`/`fleet-collector`
→ price-resolution; `capability-router` → action-gate+bash-command-governor+local-model-manager+provider-sandbox; `capability-executors` 923L).
Each ⇒ a distinct per-perimeter authorized mission. Always recompute before selecting a lot.

## Blockers + the four open cross-cutting follow-ups (NONE closed by V46–V48)
1. Re-express `runMigrateTs` on top of `runGates` (V42) with a byte-identical proof — touches the LIVE gate path; separate authorization.
2. Decide the canonical root-cause authority per failure-class (self-diagnostic vs root-cause-engine) before live-wiring triage.
3. Live-wire `failure-triage` into a real recovery loop (currently composition-only, PREPARE_NOT_APPLY).
4. Retrofit the ~47 equivalence benches onto the SEMANTIC_PARITY contract (large, one-at-a-time).
- **Detector status (V49+V50+V51): ALL THREE defect classes CLOSED.** `change-impact-graph` (V49 comment-strip + .ts-reference;
  V51 REPO_ROOT derivation) AND `migration-campaign.ts` inline rules (V50) are comment-safe + derivation-aware via the same
  canonical `stripComments`+`parseRequiresFromSource`. Proven by the 38-assertion graph test (A/B/C blocks) + migration-campaign
  negative tests, zero recall loss. End-to-end migrate-plan hazard-blocked 8→7 (V50) →6 (V51). Genuine hazards all KEPT
  (patch-proposal-apply path.join(__dirname), capability-factory dynamic-require, email-gateway external, local-autonomy transitive).

## Next missions, in order, with entry conditions
1. ~~**PLANNER INLINE-RULE ALIGNMENT.**~~ **DONE in V50 (@`ace03e0`)** — migration-campaign inline rules now reuse the canonical
   `stripComments`+`parseRequiresFromSource`; end-to-end false positives cleared (blocked 8→7); negative tests prove executable +
   transitive recall; full `npm test` 397 files exit 0. (The `.ts`-reference half of V49 is a no-op for the inline rules because
   candidates are JS-only by definition — only comment-stripping applies to a candidate's own source.) **Next actionable = #2.**
2. ~~**PATHHAZARD DERIVATION (third defect class).**~~ **DONE in V51 (@`1194831`)** — `change-impact-graph.ts` pathHazard now
   understands the REPO_ROOT derivation (safe when `= process.cwd()`; `__dirname`-derived still flagged); `change-impact-graph.ts`
   write-set only (the planner needed NO edit — no JS-only candidate's OWN source uses REPO_ROOT; `expert-profile-assembler` is
   already ported, and `mission-context-builder`'s block was purely transitive via `impactOf`). C1–C7 negative/positive tests;
   full `npm test` 397 files exit 0. Unblocked `mission-context-builder` end-to-end (blocked 7→6). **All detector defects CLOSED.**
   **GATE-2 recalculation (V51):** the two candidates affected by V49–V51 — `build-recovery-engine` and `mission-context-builder` —
   are BOTH HELD for distinct authorization (perimeters below); no neutral/safe leaf candidate was auto-migratable.
3. **patch-proposal-apply port** — GENUINE hazard `path.join(__dirname,"patch-executor.js")` (line 88). AUTHORIZATION/APPLY
   perimeter (marshals provider proposals into patch-executor, `spawnSync`). Entry: distinct authorization; the apply authority
   (patch-executor) and authorizedPaths/Action-Contract gate must be provably unchanged; dist-safe executor-path resolution.
4. **build-recovery-engine port — HELD (distinct authorization required).** Hazard-free end-to-end (V49+V50) and migrate-plan
   RECOMMENDS it, BUT it is capability `BUILD_GATE_AUTONOMY`: `spawnSync` builds, AUTO-APPLIES source fixes (`writeFileSync`),
   reads `provider-authorization.json` and AUTHORIZES the paid Provider. Provider-authorization + autonomous-apply perimeter =
   human-decision boundary; NOT auto-migrated in GATE 2. Entry: distinct ODG authorization (recommendation ≠ authorisation).
4b. ~~**mission-context-builder port.**~~ **DONE in V52 (@`ddcdf1f`)** — ODG explicitly authorized (GATE A lowest-risk). Ported via
   official `odg migrate-ts` (dual port). `authorizedPaths` confirmed a verbatim passthrough (no enforcement); spawnSync/scan are
   injectable fallbacks source-preserved and NOT exercised; parity proven byte-identical incl. `opts.write` JSON + real read branch.
   Gate 5/5 PASS; full `npm test` 397 exit 0. Dual ports 56→57.
   **GATE-4 recalculation (V52):** NO further neutral/independent lot remains auto-migratable — all remaining safe candidates sit in a
   forbidden perimeter (provider/finance/authz/security) directly or via dist closure (see inventory note). Each needs a distinct ODG mission.
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
- Strategy/sequencing authority: `docs/odg-operational/ODG_MASTER_ROADMAP.md` — §U (active), §U-CHECKPOINT V34→V52.
- Execution interface: `ODG_AUTONOMOUS_WORK_PROTOCOL.json`, `CLAUDE.md`, `AGENTS.md`.
- Engineering memory (per-mission learnings SSOT): `migration-campaign-planner-v20.md` (+ `MEMORY.md` index).
- Capabilities are read-only COMPOSITIONS of the nine primitives — never a tenth primitive, never a parallel engine/registry/checkpoint.
