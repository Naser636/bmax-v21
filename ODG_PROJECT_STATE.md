# ODG_PROJECT_STATE — operational compass

> **Durable navigation aid, not an authority.** Strategy and sequencing live in
> `docs/odg-operational/ODG_MASTER_ROADMAP.md` (§U is the active engineering section) and the machine
> manifest `runtime/governance/ROADMAP.json` (never edited without distinct authorization). This file is a
> fast-resume summary; when it disagrees with the roadmap or the Autonomous Work Protocol, THEY win. Refresh
> it each session from the real repo — treat every number below as "last known", re-verified via the planner.

## Last confirmed checkpoint
- **V57 C5 DEEP AUDIT (read-only, @`a1bf3a4`→docs):** 9 executors audited deeply; authorization controls proven EFFECTIVE (action-gate/capability-authorization/bash-governor/executors/probes tests all PASS this audit). Findings: (A1 MED-latent) no central authz chokepoint at dispatch — per-capability enforcement (scope≠authority code-enforced; action-gate for Bash; human-grant for External Research; MANUAL_ONLY for Provider); (A2) executor evidence is mtime-only, not commit-traceable (3 absent/2 stale/4 recent). Verdict PARTIAL; canonical A01–A54/166 NOT_ENUMERABLE (no machine manifest). Report: `docs/odg-operational/ODG_V57_C5_DEEP_AUDIT.md`. No runtime/permission/code change.
- **Code tip = V56 CHANTIER 1 @`fa51c1f`** (truth-lock.ts extraction + runMigrateTs→runGates unification; byte-identical golden-proven). == `origin/main` (insync after the V56 docs commit on top), branch `main`, worktree clean, index empty, 5 stashes preserved.
- Evidence-dated **2026-10-16** (V56 five-chantier campaign; see roadmap §U-CHECKPOINT V56). Nine permanent primitives intact; `runtime/governance/ROADMAP.json` unchanged.
- **V56 verdicts:** C1 unified validation DONE (@`fa51c1f`); C2 root-cause authority RESOLVED **+ V54/V55 ERROR CORRECTED** (root-cause-engine EXISTS at `src/runtime/root-cause-engine.ts`, live-wired — NOT absent; canonical = failure-class MAPPING: release-gate→root-cause-engine, runtime-divergence→self-diagnostic); C3 branches PROVEN (failure-triage.test 20/20), LIVE wiring BLOCKED (apply/action-gate perimeter, dossier in roadmap); C4 SEMANTIC_PARITY DEFERRED (53 benches, 0 adopters); C5 re-grade PARTIAL (9 executors + probe/executor tests green in `npm test` 398; 15 "missing" are real unbound missions, several deploy-gated/NL-generated; canonical A01–A54/166 NOT_ENUMERABLE; deep authority/evidence-freshness grade = bounded follow-up).
- Evidence-dated **2026-10-16** (V54 campaign). Nine permanent primitives intact; `runtime/governance/ROADMAP.json` unchanged.
- **V55 PHASE-00B REGISTRY RECONCILIATION (@`40524a0`→docs):** re-enumerated the drifted counts against live sources and added a history-preserving `v55Reconciliation` block to `docs/odg-operational/ODG_OPERATIONAL_CAPABILITY_REGISTER.json` (original 2026-10-11 census preserved verbatim). Verified @HEAD: missions 8→**11**, executors 6→**9**, probes 13→**15**, runtime-caps 169→**177** (15 missing), ledger 979→**1097** (append-only/live). COUNTS ONLY — no status re-grade, canonical A01–A54/166 untouched (NOT_ENUMERABLE), ROADMAP.json unchanged. There is NO automated Phase-00B generator (hand census); register is docs-only, inert to runtime.
- **V54 FIVE-CAPABILITY CAMPAIGN (registered; see roadmap §U-CHECKPOINT V54):** #5 A01–A54/166 certification EXECUTED (read-only, verdict PARTIAL — `docs/odg-operational/ODG_V54_CAPABILITY_CERTIFICATION.md`); #2 root-cause authority = forensic finding (`root-cause-engine` does NOT exist → `self-diagnostic.js` is the sole de-facto authority; PROPOSED canonical, pending ODG); #1 `runMigrateTs→runGates` BLOCKED (circular dep → needs new shared `truth-lock.ts` module = write-set expansion + CTO decision); #3 live-wire triage BLOCKED (apply/action-gate perimeter); #4 SEMANTIC_PARITY retrofit DEFERRED (53 benches, 0 adopters; one-at-a-time, churn-risky).

## Validated deliveries V37–V53 (one line each; full evidence in the roadmap §U-CHECKPOINTs + engineering memory)
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
- **V53** JS→TS parity lot `build-recovery-engine` (@`474f914`): ODG-authorized under a distinct provider-authz/apply contract. Behaviour-preserving port of capability BUILD_GATE_AUTONOMY via official `odg migrate-ts` (dual port, default unchanged); LEAF (self-contained dist). Sensitive surfaces proven BYTE-IDENTICAL, never from a source-preserved branch, with NO real provider call / NO real source mutation: gating (green/false-success-exit-discipline/no-fixer), REAL apply over temp fixtures (recover() end-to-end + `_internal.applyFixers`), snapshot/restore byte-identical rollback, write confinement to `authorizedPaths`, and provider-authorization.json + build-recovery-report.json captured via an fs-write interceptor (real `runtime/generated` untouched) — provider artefact emitted ONLY when `providerAuthorized` (gating decision, never an implicit grant). 28-assertion bench; gate 5/5 PASS; `tsc` 0; full `npm test` 397 exit 0. Dual ports 57→58.

## Last known inventory (via `odg migrate-plan`, 2026-10-16 @ `474f914`)
`runtime/core`: **89 .js · 58 dual TS ports · 25 candidates · 6 excluded · 6 hazard-blocked**; `runtime/bin`: 25 JS launchers.
*Note:* After V53, EVERY remaining safe candidate is in a forbidden perimeter (each needs a DISTINCT per-perimeter ODG authorization, like V53 was for build-recovery-engine). Planner's next pick is `local-model-manager` (PROVIDER). By perimeter: PROVIDER = `local-model-manager`/`provider-sandbox`/`fleet-bridge`; FINANCE/DEC-006 = `payments`/`price-resolution`/`economic-verification`/`quote`/`finance-sim`/`finance-paper`/`live-cost-metering`; AUTHZ/SECURITY = `action-gate`/`capability-authorization`/`patch-action-contract`/`bash-command-governor`; CLOSURE-sensitive = `acceptance-facts`/`mechanical-acceptance`/`fleet-collector` (→price-resolution), `capability-router` (→action-gate+bash-command-governor+provider), `capability-executors` (923L). Plus 6 hazard-blocked (genuine `__dirname`/dynamic-require). Always recompute before selecting a lot.

## Blockers + the four open cross-cutting follow-ups (V54 campaign dispositions)
1. **`runMigrateTs → runGates` — DONE (V56 @`fa51c1f`).** Extracted `src/runtime/truth-lock.ts` (single canonical SoT), broke the cycle, runMigrateTs now delegates to runGates; byte-identical golden bench + live gate 5/5 + 398-file suite green.
2. **Canonical root-cause authority — RESOLVED (V56) + V54/V55 ERROR CORRECTED.** PRIOR CLAIM "root-cause-engine absent" was FALSE (checked only `runtime/core/`). It EXISTS at `src/runtime/root-cause-engine.ts` (tested, live-wired into the autonomy execution/controller adapters). Canonical = a failure-class MAPPING, not one engine: release-gate/BLOCKED-mission → `src/runtime/root-cause-engine.ts`; runtime expected-vs-observed divergence → `runtime/core/self-diagnostic.js`. Both exist/tested/wired; NO new engine, NO primitive.
3. **Live-wire `failure-triage` — branches PROVEN (V56, failure-triage.test 20/20); LIVE wiring BLOCKED (apply/action-gate perimeter).** Decision dossier in roadmap §U-CHECKPOINT V56. Distinct CTO authorization required (unintended source-mutation / provider-authz risk). Not crossed.
4. **SEMANTIC_PARITY retrofit — DEFERRED (re-confirmed V56).** 53 `*-equivalence.e2e.test.ts` benches; 0 import `semantic-parity`. One-bench-at-a-time mission (churn-risky; zero behavioural gain). No bench modified.
5. **Capability certification + re-grade — V54 cert PARTIAL; V55 counts reconciled; V56 bounded re-grade; V57 DEEP executor audit PARTIAL.** V57 (`ODG_V57_C5_DEEP_AUDIT.md`): 9 executors deeply audited (authority EFFECTIVE via passing tests; evidence mtime-only, 3 absent/2 stale/4 recent). Canonical A01–A54/166 NOT_ENUMERABLE. STILL OPEN: (A1) a dispatch-level authorization invariant (CTO code+design); (A2/A3) commit-traceable evidence provenance + refresh (writes runtime/generated); deep per-PROBE + per-CAPABILITY grade; (A4) a CTO-authored canonical manifest to make A01–A54/166 enumerable.
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
4. ~~**build-recovery-engine port.**~~ **DONE in V53 (@`474f914`)** — ODG-authorized under a distinct provider-authz/apply
   contract. Ported via official `odg migrate-ts` (dual port, LEAF). All sensitive surfaces proven BYTE-IDENTICAL with NO real
   provider call / NO real source mutation: gating (incl. false-success exit discipline), REAL apply over temp fixtures,
   snapshot/restore rollback, write confinement to authorizedPaths, provider-authorization.json + report captured via an
   fs-write interceptor (real runtime/generated untouched; provider artefact emitted ONLY when providerAuthorized — a gating
   decision, never an implicit grant). 28-assertion bench; gate 5/5; full `npm test` 397 exit 0. Dual ports 57→58.
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
- Strategy/sequencing authority: `docs/odg-operational/ODG_MASTER_ROADMAP.md` — §U (active), §U-CHECKPOINT V34→V57.
- Canonical Truth Lock SoT: `src/runtime/truth-lock.ts` (V56). Root-cause authorities: `src/runtime/root-cause-engine.ts` (release-gate class) + `runtime/core/self-diagnostic.js` (runtime-divergence class).
- V54 capability certification: `docs/odg-operational/ODG_V54_CAPABILITY_CERTIFICATION.md` (read-only; PARTIAL; register drift logged).
- Execution interface: `ODG_AUTONOMOUS_WORK_PROTOCOL.json`, `CLAUDE.md`, `AGENTS.md`.
- Engineering memory (per-mission learnings SSOT): `migration-campaign-planner-v20.md` (+ `MEMORY.md` index).
- Capabilities are read-only COMPOSITIONS of the nine primitives — never a tenth primitive, never a parallel engine/registry/checkpoint.
