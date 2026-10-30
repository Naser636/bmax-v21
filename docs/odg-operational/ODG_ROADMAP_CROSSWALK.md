# ODG ROADMAP CROSSWALK — one canonical operational source, every original commitment traced

> **Authored 2026-10-30** under the CTO "Master Roadmap Consolidation & Historical Execution Audit" mandate
> (Phases A–G). This document does **NOT** replace, shorten, or rewrite any roadmap. It is a **traceability map**:
> it names the single canonical operational source of truth and cross-walks every historical roadmap / program /
> ladder to it, preserving each original identifier and its acceptance criteria. All original roadmaps remain in
> place as **historical authority on their own requirements** (see §A of `ODG_MASTER_ROADMAP.md`).
>
> **Evidence base:** a four-agent read-only audit (Phases A–C) over the working tree, full git history, and all
> branches @ `origin/main` `130fac3`. Independently re-verifiable via the commands cited inline.

---

## 0. THE ONE CANONICAL OPERATIONAL SOURCE OF TRUTH

**Human-readable canonical = `docs/odg-operational/ODG_MASTER_ROADMAP.md` — specifically its section `§Q`
("MASTER ROADMAP CONVERGENCE — SINGLE SOURCE OF TRUTH", line 809), whose `§Q-5` holds the unified P0–P10
phase register.** It already self-declares this role and is the only doc authorized to declare phase status.

**Machine companions (referenced by §Q, never duplicated):**
- `runtime/governance/ROADMAP.json` — the **autonomy-cycle execution manifest** (**11 missions**, verified
  `python -c "len(json.load(...)['missions'])"` = 11) consumed by `src/runtime/autonomy-runtime-adapter.ts`
  (`ROADMAP_MANIFEST`). Authoritative for what the runtime auto-executes. Its prose source is
  `runtime/system/ROADMAP.md` / `runtime/governance/RUNTIME_ROADMAP.md` (see §4).
- `docs/odg/closure-register.json` — the **campaign/lot register** (117 items as of 2026-10-30, P0/P1/P2) consumed
  by `runtime/core/campaign-controller.ts`. Authoritative for engineering/product/security lot status.
- `docs/odg/roadmap-dependencies.json` — the **inter-mission dependency companion** read by
  `runtime/core/roadmap-dep-check.ts` (`checkCanonicalRoadmap` validates the governed ROADMAP.json order against it).
  Non-protected (unlike `runtime/governance/ROADMAP.json`); the subject of the open `structured-roadmap-deps` lot —
  deps are enriched HERE and only the final apply INTO the protected ROADMAP.json is owner-gated. (Distinct from
  `docs/odg/ROADMAP.proposed.json`, the dep-planner *preview* in §5.)

**Frozen authority (never edited operationally):** Master V5 (`docs/odg-master-v5/source/ODG_FINAL_MASTER_V5_FICHE_01..07`)
→ Runtime Constitution → CTO Directives → `runtime/governance/ROADMAP.json`. Authority order per `ODG_MASTER_ROADMAP.md §A`.

These four are DISTINCT tracks reconciled only in prose today; this crosswalk is that reconciliation.

---

## 1. CRITICAL CORRECTION — the §U/§Q compass drift (now fixed)

Two inaccurate statements existed in the compass (`ODG_PROJECT_STATE.md`) and are corrected by this consolidation:
- The header note "**§U is the active engineering section**" — WRONG. `§U` ("CANONICAL CAPABILITY STRATEGY", line 923)
  is a **documentary/additive capability archive** (hosts the V54–V64 §U-CHECKPOINT records), not an active driver.
- A reprise note "**sections A–M only (no §U/§Q)**" — WRONG. The file runs **A–Z (26 sections)**; verify with
  `grep -nE '^## [A-Z]\\. ' docs/odg-operational/ODG_MASTER_ROADMAP.md`.

**Reality:** the genuinely active execution program is **`§K` AUTONOMY FIRST** (phases 00–13, line 167 — "sole active
development priority"); **`§Q`** is the convergence SSOT + P0–P10 register; **`§G` APEX SOVEREIGN** (line 123) is an
explicitly *future* program. `§M` holds the reconciled η3 execution sequence.

---

## 2. THREE DISTINCT "F" NAMESPACES (letter-collision only — do not conflate)

| Namespace | Where | Meaning | Status |
|---|---|---|---|
| **FND-F** (foundation) | `docs/FEUILLE_DE_ROUTE.md` L49-63 (+ frozen dup `baseline/sprint12/`) | Sprint-12-era foundation gates **F0–F12** (F0 Préparation … F10 **Baseline**, F11 **Health Check**, F12 Freeze + 8 GATES + 11 VALIDATION) | Program abandoned mid-F2 (only F2 Typage ever ✅), never formally closed; substantively satisfied by §K/§Q — banner-closed by this consolidation (see §4) |
| **SEC-F** (security lots) | `docs/odg/closure-register.json` ids | POST-V107 2026-10-30 defect-fix lot tags: **F1c** `validation-deliverable-target-explicit`; **F2a/F2b** `odg-health-failvisible-{capability-registry,sources}`; **F2c** `odg-health-lastmission-failvisible`; **F3b** `code-exec-ts-single-file-confine`; (F2b build) `p0-build-guard-per-file-completeness` | ALL ACCEPTED + MERGED to main (PR #268). "F1/F2 closed with proof." |
| **FILM-F** (creative drafts) | `docs/film-factory/` | Screenplay/timeline version numbers: **F10** = FROZEN screenplay draft v37 (SHA-verified each resume); **F11** = PROPOSED film timeline | Creative versions; FILM-F10/F11 mean the OPPOSITE of FND-F10/F11 |

## 3. THREE DISTINCT "P" NUMBERINGS

- **§Q P0–P10** — the phase register inside `ODG_MASTER_ROADMAP.md §Q-5` (P0 prerequisites … P10 certification).
- **closure-register / V46 P0/P1/P2** — priority tiers in `docs/odg/closure-register.json` + `V46_MASTER_COMPLETION_REGISTER.md`.
- **V5-campaign "Phase 1..5"** — the V5 implementation-roadmap phases (`docs/odg-master-v5/`), executed July-2026.

"P1/P2" therefore means three different things depending on source — always qualify it.

---

## 4. CROSSWALK — every discovered roadmap/program → canonical disposition (original IDs preserved)

| Original artifact (source) | Original IDs | Disposition on the canonical source | Evidence |
|---|---|---|---|
| `ODG_MASTER_ROADMAP.md` §K AUTONOMY FIRST | Phases 00–13 | **CANONICAL active program.** The live execution ladder. | line 167 |
| `ODG_MASTER_ROADMAP.md` §Q convergence | P0–P10 | **CANONICAL register (SSOT).** | line 809 |
| `ODG_MASTER_ROADMAP.md` §G APEX SOVEREIGN | A–J sub-phases | FUTURE (not executed; ambition preserved). | line 123 |
| `ODG_MASTER_ROADMAP.md` §M-2 / §M-3 | TS-migration / cutover ladders | **SUPERSEDED** by ZERO-JS convergence (0 tracked internal `.js`; verify `git ls-files 'runtime/core/*.js'` = 0). Genuinely done. | L562/L570 |
| `ODG_MASTER_ROADMAP.md` Phase 04 / DEC-V60-166 | A01–A54 / "166 caps" | **RETIRED** (set non-enumerable by construction; only endpoints A01/A54 exist). | L272 |
| `runtime/governance/ROADMAP.json` | M0000-M0002, UNIFY_RUNTIME_EXECUTION, …, DEPLOY_BMAX_DASHBOARD_PROD_V1 | **CANONICAL machine execution manifest** (**11 missions**; 10 executed/proven, DEPLOY_BMAX_DASHBOARD_PROD_V1 owner-gated — consistent with the master's own §X.6 CM-3 "11 canonical missions, 10/11 complete"). | audit B2 (count corrected by Phase-F audit: 11, not 12) |
| `runtime/system/ROADMAP.md` + `runtime/governance/RUNTIME_ROADMAP.md` | prose behind ROADMAP.json | **STALE-STATUS source docs** — mirror the 11 missions but carry obsolete `READY`/`SYSTEM_READY`/`COMPLETE` assertions the master's §N-1 flags as violating §C status discipline. Disposition: treat ROADMAP.json as the authoritative status; these prose mirrors must NOT be cited for status (owner may banner/retire them — not auto-executed, so inert). | Phase-F audit OMISSION |
| `docs/odg/closure-register.json` | 112 P0/P1/P2 lot ids | **CANONICAL machine lot register** (102 ACCEPTED, 0 false-success found; 7 BLOCKED/2 DEFERRED/1 IN_PROGRESS all owner/external-gated). | audit B1 |
| `runtime/missions/ROADMAP_PHASE_1..5_*.json` (FOUNDATION/RUNTIME_KERNEL/ENGINEERING/FLEET_AND_PROVIDERS/ENTERPRISE) | Phase 1–5 missions | **SUPERSEDED legacy** — self-build missions executed once (2026-07), orphaned (no parent program), not wired into the autonomy adapter. Preserved as history. | audit B2 |
| `runtime/missions/MASTER_PLAN_V1.json` | ROADMAP_01..06 | **DANGLING orchestrator** — only ROADMAP_01 (RUNTIME_STABILIZATION_V1) exists; 5 sub-roadmaps never authored; no objectives; never in ledger. Disposition: RETIRE or re-author (owner decision; not auto-executed, so inert/harmless). | audit B2; `runtime/reports/CORRECTIVE_QUEUE_ROOT_CAUSE.md` |
| `runtime/missions/RUNTIME_EVOLUTION_PROGRAM_V1 / MASTER_AUTONOMY_V1 / PLATFORM_BOOTSTRAP / UNIFY_RUNTIME_EXECUTION_1` | — | **SUPERSEDED legacy** (July-2026; replaced by the `odg autonomy` selectNextMission loop). Preserved as history. | audit B2 |
| `runtime/missions/pending/*` (7) | FIX_* nominations | **STALE/ERRONEOUS queue** — 2 already EXECUTED+ARCHIVED, 2 target now-proven missions, 2 ERRONEOUS (`.pack` artifacts mis-nominated, can never load), 1 blocked on MASTER_PLAN_V1. No `FIX_*.json` ever authored ⇒ none loadable (deferral correct by design). Safe computer-side cleanup candidate (pending/ pruning). | audit B2 |
| `docs/FEUILLE_DE_ROUTE.md` (+ `baseline/sprint12/`) | **FND-F0–F12**, 8 GATES, 11 VALIDATION | **CLOSED/SUPERSEDED** — abandoned mid-F2; substantively satisfied: F2 Typing → ZERO-JS; F6 Pipeline → 13/13; F11 Health → `odg health`; F1 Audit → §K-01 forensic + V5 closeout. Banner added (see §5). Original preserved. | audit B3 |
| `docs/ROADMAP.md` | V1 foundation + Sprint 3–12+ ladder | **STALE** (flagged by §Q-2); Sprint 6-12+ never mapped. Banner added. Preserved. | audit B3 |
| `docs/FOUNDATION_STATUS.md` | foundation-v2 "Next: Sprint 6" | **HISTORICAL** snapshot; dangling forward-pointer. Banner added. Preserved. | audit B3 |
| `docs/odg-master-v5/` (FROZEN Master FICHE 01-07 + V5 roadmap + closeout) | A01–A54, V5 Phase 1-5 | **FROZEN authority** — untouched; authority on "what must be true". V5 closeout PROVEN @`160695b` (counts historical). | audit B3 |
| `docs/odg-operational/ODG_REAL_WORLD_LAUNCH_ROADMAP.md` | RWL A1…G1 | Launch program: A done; B mostly local; C–G **owner/resource-gated** (TLS/DNS, email, payments, e-invoicing). Maps to §K Ph12/13, §Q P8/P9. | audit B3 |
| `docs/odg-operational/ODG_CAMPAIGN_RISK_ROADMAP.md` | W1–W9, G1–G8 | W1-W7 done; W8/W9 owner-gated (auth/paid). | audit B3 |
| `docs/odg-operational/ODG_VPS_RELIABILITY_ROADMAP.md` | VPS P1–P6 | P2 local PASS; off-host owner-gated. Maps §Q P7. | audit B3 |

---

## 5. ORPHAN / FORGOTTEN COMMITMENTS — dispositions (no ACTIVE commitment left untraced)

1. **FND-F program** (`docs/FEUILLE_DE_ROUTE.md`) — no register id / no mission. **Disposition:** banner-close (see §4); every F item mapped to its §K/§Q equivalent above. No original requirement lost.
2. **`docs/ROADMAP.md` Sprint 6–12+** — **Disposition:** stale banner; superseded by ODG runtime governance.
3. **`docs/FOUNDATION_STATUS.md` "Next: Sprint 6"** — **Disposition:** historical banner.
4. **"ODG MASTER ROADMAP D'EXCELLENCE OPÉRATIONNELLE (28 July 2026)"** — **NOT LOCATED** anywhere (working tree + full git history; `grep -ri "excellence opérationnelle\|28 juillet\|28 july 2026"` → 0). Closest real artifact is **§X "MASTER ROADMAP OF OPERATIONAL EXCELLENCE — DOCUMENTARY INTEGRATION"** (`ODG_MASTER_ROADMAP.md` L1164, an English documentary audit section dated 2026-10-17). **Determination:** either never authored as a standalone 28-July French document, or an informal name for §X. Recorded here as **referenced-but-absent**; requires owner confirmation if a distinct document is expected.
5. **`§S` "default stays JS"** — stale body text vs the zero-JS reality (TS is now default). Reconcile in a future §S edit (body trim under its SUPERSEDED banner).

**CTO_DIRECTIVES standing commitments** (`runtime/governance/directives/CTO_DIRECTIVES.md`, 3rd link in the authority chain): its **Technical Targets 1–6** (T2 RuntimeExecutor = the official execution engine; T3 MissionDispatcher = entry point; T4 RuntimeKernel = core; T5 ExecutionMemory records every mission; T6 EventBus connects engines) and **Priorities 1–8** are standing architectural commitments. Disposition: **satisfied-by-construction and tracked by the machine companions** — the runtime embodies T2–T6 (see `runtime/core/` + the §K autonomy ladder), Priority 4 (JS→TS) = the ZERO-JS convergence rows above, and the ODG5 Reality-Proof amendment maps to the reality-gate / integration-state discipline in §6. No separate roadmap artifact; they are authority on their own requirements and are not re-numbered here (preserved, per §A).

**€500k commercial-objective family** (`REVENUE_500K_PLAN_V1/V2.md`, `FINANCIAL_PLAN_500K_V1.md`, `NET_CASH_PLAN_500K_V1.md`, `PATHS_TO_500K_V1.md`, `GO_TO_MARKET_V1.md`, `ODG_HIGH_TICKET_ENGINE.md`, `ODG_30_DAY_B2B_REVENUE_CAMPAIGN_V1.md`): these are **commercial plans/analyses, not engineering roadmaps** — the reproducible model lives in `runtime/core/revenue-scenarios.ts`/`revenue-schedule.ts` and the executable commercial surface is tracked by the P-01 + commercial register lots. Disposition: **IN SCOPE as commercial-plan references (out of the engineering-roadmap SSOT boundary)**; their execution is owner/external-gated (real outreach, billing, send-gates). Named here so the boundary is explicit — no commitment is lost or silently dropped.

**Derivative / snapshot / report artifacts** (no lost commitment; listed for completeness per the Phase-F audit):
`docs/odg-operational/ODG_TOOL_EXCELLENCE_AND_ROADMAP_COMPLETION_V1_REPORT.md` → maps to §Y "ODG TOOL EXCELLENCE
FIRST"; `docs/odg/ROADMAP.proposed.json` → the non-governed dep-planner preview (owner-gated apply into the protected
ROADMAP.json); `baseline/foundation-v2/ROADMAP.md` → frozen dup of `docs/ROADMAP.md` (parallel to `baseline/sprint12/`);
`docs/audit/phase-0/PHASE_0_ROADMAP_CONVERGENCE_SUMMARY.md` → a Phase-0 audit summary. All derivative/historical.

**Deleted/history-only artifacts** (recoverable from git, not on main; preserved as history, no action): `R0001_RUNTIME_ROADMAP_EXECUTOR_REPORT.md`, `ODG_FOUNDATION_REPORT.txt` (deleted `4db663b`); `runtime/mission-standard/generated/*`, `runtime/archive/*`, `runtime/local-recovery/*` roadmap sets (migrated/vault-removed).

---

## 6. GOVERNANCE INVARIANTS (Phase E) — verified by this consolidation

- **One operational SSOT:** `ODG_MASTER_ROADMAP.md §Q` + its two machine companions; this crosswalk reconciles all others to it.
- **No contradictory roadmap:** every legacy ladder is dispositioned (canonical / superseded / retired / history / owner-gated) above.
- **No mission without a parent:** flagged — the orphaned ROADMAP_PHASE_1..5 + MASTER_PLAN_V1 are marked superseded/dangling (inert, not auto-selected); owner decides retire-vs-rehome.
- **No ACCEPTED without evidence:** audit B1 found 0 false-success among 102 ACCEPTED (50+ impl+test files verified).
- **No circular dependency:** audit B1 found none among ACCEPTED; only two benign dep-on-open edges.
- **Delivery ≠ integration ≠ acceptance:** the closure-register `integration` blocks (added 2026-10-30) distinguish PUSHED/PR_OPEN/MERGED/VERIFIED/ACCEPTED.
- **Nine permanent primitives preserved; no tenth introduced.** Original roadmaps preserved as historical authority.

---

## 7. REMAINING OPEN WORK (ordered; Phase G execution plan)

**Computer-side, in progress this session** (frontier-recon defects, each a governed PR):
1. Governor path-form classification bypass — PR #270 (MERGED/pending CI).
2. Toolchain-probe strictness + einvoice batch error count — PR #271.
3. Behaviour/integration execution confinement — PR #272.

**Computer-side, safe, available next** (not owner-gated):
- `runtime/missions/pending/` queue pruning (retract the 2 erroneous `.pack` nominations + 2 stale already-executed + 2 now-proven) — mechanical, governance-adjacent (verify write-guard).
- WEAK register items: strip stale BLOCKED fields from `p0-deploy-artifact-header-reconcile` (done in this consolidation); annotate `business-coverage-matrix-22` + `product-program-decision-gate` as decision-records (no code capability claimed).
- `§S` body-text reconciliation vs zero-JS (doc).

**OWNER-GATED (not computer-side — require a single privileged/external/policy action each):**
dashboard TLS public exposure · systemd timer activation on the VPS · structured deps into the protected `runtime/governance/ROADMAP.json` · hadolint/other compiler installs · P-01 demand-validation outreach · P-01 real billing provider · independent broad-IT eval labels.

**Do NOT start the Local Intelligence Engine program** until P1/P2 + this audit are complete and the CTO priority order is respected (per mandate).
