# V15.0 — Master directive (CTO, 2026-11-22) — registration record

> **Status: PROPOSED.** The directive itself asks for this status at entry ("PROPOSÉE — À RÉCONCILIER AVEC LA VÉRITÉ DU DÉPÔT"). Next state: RECONCILIATION_IN_PROGRESS, then owner adoption.
> **Canonical strategy is unchanged:** Boussole V12.4 (24 missions) plus Boussole V14.4 (`docs/odg/V14_4_ROADMAP.md`, ADOPTED V372) remain in force until the owner formally adopts a succession.
> V15.0 adds **no** new primitive, orchestrator, scheduler, queue, Radar, memory or permission engine (V15.0 §3).
> Not touched by this registration:
> - `runtime/governance/ROADMAP.json`;
> - `docs/odg/v124-consolidated-roadmap.json`;
> - `closure-register.json`;
> - `docs/odg-operational/ODG_MASTER_ROADMAP.md`.
>
> These are protected or hard registers, and changing them needs a separate owner-authorised mission.

## 0. Text received
- The directive was pasted in the session on 2026-11-22. **The pasted text ends at "## 37"**, inside Part XXV, after Phase 8 (§36).
- Everything from §37 onward was not received. Nothing here is inferred for it.
- The full text is not reproduced here. This record captures its structure and its reconciliation.

## 1. Lineage (verified in the repository, 2026-11-22)

| Name in the directive | What the repository actually holds |
|---|---|
| V12.4 | canonical Boussole; `docs/odg/v124-consolidated-roadmap.json`. Missions: 14 ACCEPTED, 6 REVIEW, 2 READY, 1 IN_PROGRESS, 1 BLOCKED |
| V14.4 | `docs/odg/V14_4_ROADMAP.md`, ADOPTED (owner V372); phases 0–8 mapped onto V12.4 missions |
| "V15.0 historique", V16.0, V17.0, V18.0 | **no roadmap document under these names.** What exists: campaign closures `CLOSURE_V15…V18_*_2026-11-09.md` (Radar traceability, resilience, métier E2E), session work V15/V16 of 2026-11-22 (`V15_CLOSURE_DOSSIER.md`, `V16_*`), and `V150_*_LABOUR.json` (V150 economic lots). The "13 V17.0 programmes" and the "V18.0 continuity" text are known only through this directive |
| V372 / V373 | V372 grant `docs/odg/V372_RESEARCH_GRANT.json` (expires 2026-12-22); V373/V374 KI-V2 modules (`odg-knowledge-intelligence`, `odg-knowledge-attestation`, `odg-claim-quote-binding`) |

## 2. Correspondence — V15.0 programmes A–M → existing components
Consumer counts come from `require()` sites outside tests (runtime/core, runtime/bin, scripts). A consumer count is not proof of real use.

| V15.0 programme | Existing components (all PRESENT) | V14.4 phase / V12.4 anchor | Real state |
|---|---|---|---|
| A Intelligence & metacognition | `odg-hybrid-reasoning`, `world-model`, per-axis intelligence (#838–#847) | 2 | several axes NOT_MEASURED on real data |
| B Cognitive memory | `memory-trust-gate` (5 core consumers), `mission-context-builder`, `knowledge-engine` (bin consumers only) | 2 | trust gate wired; reuse gain NOT_MEASURED |
| C World Radar / KI V2 | `odg-radar-gate-chain`, `odg-knowledge-intelligence`, `odg-knowledge-attestation` (owner-anchored, #867/#871), `odg-claim-quote-binding`, `bounded-http-client` (kill-switch #870), `research-governor` (EXACT grants #876) | 1, I `CM-RADAR-GATE-CHAIN` (READY; steps 1–2 merged; companion update owner-gated) | live collection works (V16 run 1: 9×200) |
| D Native autonomy | `odg-native-engineering` (4), `odg-execution-routing`, `odg-resident-driver` (L0) | 3, E `CM-V234-RESIDENT-DRIVER` (IN_PROGRESS) | L0 only; L1 disabled (dossier §4e) |
| E Orchestration | `odg-mission-orchestrator` (4), `mission-scheduler` (7 bin), `odg-writeset-contention` | 3, F `CM-V237-ORCHESTRATION` (REVIEW) | single chain; queue of read-only canaries exhausted |
| F Routing | `odg-execution-routing`, `odg-model-intelligence`, local Ollama models | 3 | calibrated pForPlanner 0.8 (V328) |
| G Self-healing | `build-recovery-engine`, `odg-open-mission-recovery`, `checkpoint-engine` (10 bin) | 0 / D continuity (ACCEPTED) | repair-apply on the real repo is owner-gated |
| H Performance | throughput baseline V12.4, SLO SLIs r2 (#872) | 4, K `CM-BENCHMARK-AUDIT` (REVIEW) | SLO = working reference, not enforced |
| I Living graph | `change-impact-graph` (3), `odg-component-census` | 0–1 | census: 287 surface → 0 confirmed orphans (#847) |
| J Multimodality | `odg-multimodal-ingest` | 5, P `CM-MULTIMODAL-VIDEO` (BLOCKED) | BLOCKED (resources) |
| K Security | gate (#865/#871), Truth Lock, bwrap launcher (#864/#868/#873), anchor audit (#870/#875) | transverse | residual: provider-writable local refs; review-only anchor pinning |
| L Excellence | `odg-sandbox-integration-gate`, `odg-improvement-chain`, `excellence-coverage` | 7 | gate RUN4 10/12 (owner review missing) |
| M Simplification | `odg-component-census`, eval-trio specialization registry (#846) | — | no new duplicate found this session |

**Radar V2 lots 1–5 (§13.19):**
- **Lot 1** (claims, corroboration, integrity): largely built in V373/V374, with owner anchoring in #867/#871.
- **Lot 2** (four-dimension qualification): to be verified against the existing `odg-knowledge-intelligence` axes before any build.
- **Lots 3–5** (gap detection, real-use demonstration, continuous evolution): NOT_STARTED as V15.0 lots.

## 3. Phases 0–8 (§28–§36) → V14.4 phases
V15.0 phases 0–8 refine the V14.4 phases. Phase 0 ("truth and preservation") is satisfied for 2026-11-22 by:
- `V15_CLOSURE_DOSSIER.md`;
- `V16_PERMISSION_INVENTORY.md`;
- this record.

Facts as of this registration: HEAD `b931cae6`, Truth Lock 928/928, 0 open PRs, and branch protection (strict required check, admins enforced, 0 required reviews).

**Phase 1 deliverables still due:**
- the generated correspondence register (V14.4 §3: produced by `odg-mission-crosswalk`, `capability-traceability` and `odg-component-census` under a WORK_ITEM_CONTRACT, not written by hand);
- a dormant-capability report re-run on the current HEAD.

## 4. What V15.0 requires that the governance does not allow the provider to do alone
- Adopting V15.0, or changing the Boussole, `ROADMAP.json` or the V12.4 companion statuses, needs an owner decision.
- Every work item needs a human-authorised WORK_ITEM_CONTRACT (`ODG_AUTONOMOUS_WORK_PROTOCOL.json`). V15.0 asks ODG to "create its contracts". That is compatible, as long as the contracts stay PROPOSED until authorised.
- L1 and above, systemd, deploy, root and new egress hosts stay owner-gated (V16 inventory).

## 5. Proposed first lot (PROPOSED — needs owner authorisation)
`WIC-V150-PHASE1-CORRESPONDENCE` (`docs/odg/WIC_V150_PHASE1_CORRESPONDENCE.json`):
- generate the V12.4 → component → consumer → test → evidence register with the existing modules;
- re-run the census on HEAD;
- list the dormant capabilities.

It is read-only on the code, and its output is one generated evidence file. This lot is chosen first because V15.0 §5.1 and §7 make "verify what exists and is used" the precondition for building anything, and because it feeds Radar V2 Lot 3 (gap detection).
