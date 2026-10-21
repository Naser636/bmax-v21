# ODG CAPABILITY COVERAGE — §V-B excellence method generalized across the real portfolio

**Purpose.** Apply the canonical **§V-B CAPABILITY-EXCELLENCE LOOP** (per-capability dossier: identity · domain · contract/invariants · real consumers · failure modes · domain-appropriate evaluation criteria · authoritative reference · baseline→after · migration-readiness) across the WHOLE existing capability portfolio, **reusing existing evidence** — not re-auditing. This is a coverage INDEX that points to evidence; it does not restate the audits.

**Scope & honesty.** The real, enumerable capability surface is **28**: **10** executors (`capability-executors.js EXECUTORS[]` / `CAPABILITY_EFFECT`) + **18** probes (`capability-probes.js PROBES`). *(Correction 2026-10-20: V57–V59 assessed **9** executors; a **10th** — "Implement Via Local Provider" (Stage-6) — was added, STUB/REAL-proven ⇒ 25. **Reconciliation 2026-10-21 (G1, HEAD `8eb93b1`):** the probe registry grew **15→18** — the Day-2 autonomy campaign (`43d52b6`) added 3 fail-closed semantic probes `synthetic-deliverable-written`, `provider-activation-orchestrated`, `implement-local-verified` for the 3 consequential executors that had none. Dual-port verified (`.ts`=`.js`=18). Surface is therefore **28**.)* The 10 `CAPABILITY_EFFECT` entries at HEAD: observational×3 (Connectivity Audit, Clean Workspace, Governed Observability Verification), consequential×7 (ODG Synthetic Deliverable, ODG Spec Author, Governed Git Branch Integration, Governed Bash/Linux Command, External Research Acquisition, Provider Activation, Implement Via Local Provider). The canonical "166 / A01–A54" objective is RETIRED (DEC-V60) and NOT reintroduced. Evidence base: V57 executor deep-audit (`ODG_V57_C5_DEEP_AUDIT.md`), V58 probe grading (`ODG_V58_PROBE_CAPABILITY_GRADING.md`), V59 individual grading (`ODG_V59_CAPABILITY_GRADING.md`), and the improvement log (§V-B-LOG B1–B7 in `ODG_MASTER_ROADMAP.md`). Evaluation-criteria framing follows the roadmap §Q-7 register (ISO/IEC 25010:2023 Reliability/Security; NIST SSDF; OWASP ASVS; SLSA/in-toto) — mapped, never claimed as certification.

**Coverage summary (evidence-based, no fabrication).** The 24 surface assessed at V57/V58/V59 are declared · bound · executable · tested, controls EFFECTIVE (exercised by passing tests); the 10th executor (Implement Via Local Provider) is covered by the Stage-6 STUB/REAL proofs (see `STAGE6_*` reports) ⇒ **25 total**. Cross-cutting improvements applied to ALL executors (evidence provenance B1, dispatch-authorization invariant B2) and to the build/type gate consumer (B4), recurrence (B3/B7), triage coherence (B5), learn-portfolio (B6). **No further per-capability demonstrated gap is currently open.** Remaining is a reference-level NON-ENUMERABLE canonical layer (retired) and two migration items blocked with precise causes.

## Executors (10) — domain · improvement · demonstrated gap · migration-readiness
| Capability | Domain | Assessed | Improvement (B-log) | Open gap | Migration (dual-port) |
|---|---|---|---|---|---|
| ODG Synthetic Deliverable | governed file write | V57 (authority-enforced; confineSyntheticTarget scope≠authority) | B1 provenance · B2 dispatch-invariant | none | via capability-executors (BLOCKED: `__filename` re-exec + clock, V64p) |
| ODG Spec Author | governed spec write | V57 (determinism re-derived) | B1 · B2 | none | same (BLOCKED) |
| Governed Git Branch Integration | VCS integrate/push | V57 (fail-closed DRY_RUN default) | B1 · B2 | none | dep dual-ported; module via capability-executors (BLOCKED) |
| Governed Bash/Linux Command | sandboxed command | V57 (observed-isolation) | B1 · B2 · **module dual-ported V64i** | none | DONE (`.ts` parity) |
| Clean Workspace | read-only scan | V57/V58 (deletes nothing; run-ownership) | B1 · B2 | none | via capability-executors (BLOCKED) |
| Governed Observability Verification | autonomy signal re-derive | V57/V58 (structural honesty) | B1 · B2 | none | same (BLOCKED) |
| External Research Acquisition | network acquisition | V57/V58 (dry-run default; provenance) | B1 · B2 | none | same (BLOCKED) |
| Connectivity Audit | reachability probe | V57 (reachability≠acquisition) | B1 · B2 | none | same (BLOCKED) |
| Provider Activation | live provider call | V57 (MANUAL_ONLY; provider-live-call-gate) | B2 (structural) | none | same (BLOCKED) |
| Implement Via Local Provider | Stage-6 local-model code generation | STUB-proven (22 assertions, both ports) + REAL live proof (`qwen2.5-coder:3b`, add/mul behaviour-verified) — ONE task/ONE model, NO general-reliability claim | §Q-7 reliability-mapped | real-reliability SLO (no volume) | via capability-executors (BLOCKED, same hazard) |

## Probes (18) — all PURE fail-closed `(ctx)=>{ok,detail}`, V58/V59 graded (+3 reconciled 2026-10-21)
**+3 Day-2 semantic evidence probes (`43d52b6`), graded by `capability-probes.test.ts` (fail-closed: legit evidence ACCEPTED; absent/empty/no-op/unverified ⇒ BLOCKED), both ports:** `synthetic-deliverable-written` (bytes>0 + sha256 + authoredBy), `provider-activation-orchestrated` (honest decision + classification), `implement-local-verified` (status=EXECUTED && verified). They close the Day-1 gap #1 (the 3 consequential executors that lacked a semantic probe). No open gap.
- **Evidence/freshness probes** (`clean-workspace-scanned`, `autonomy-observability-verified`, `external-research-dry-run-planned`, `spec-schema-valid`, `research-acquired`, `git-branch-integrated`, `bash-command-governed`): run-ownership mtime + per-source provenance. Assessed V58; no gap.
- **Gate probes** (`build-green`, `typescript-green`): content-derived BY DESIGN; freshness is the CONSUMER's job — hardened at validation-engine **B4** (run-ownership `freshGatesOk`). No gap.
- **Structural probes** (`legacy-runtime-retired`, `samurai-output-mode`, `single-runtime-entrypoint`, `capability-probes-finalized`, `fleet-request-validated`, `internet-reachable`): current-source fs reads; V58 graded; no gap.
- Host module `capability-probes` is dual-ported (`.ts` + equivalence bench); probes layer migration DONE.

## Migration readiness (re-evaluated on current evidence)
- **DONE (dual-ported, parity-proven):** bash-command-governor, action-gate, capability-authorization, state-transition, economic chain, + the probes host — the authorization/admission/command surface and the FINANCE/§6B chain.
- **UNBLOCKED + MIGRATED (V65):** `fleet-collector` — the migration-readiness seam (§7B: inject spawn/clock/governance/ledger, real defaults) was implemented, `.js` seamed + `.ts` dual-ported, gate 5/5 (equivalence JS≡TS across every branch). Dual ports 76→77.
- **MIGRATED (V66):** `capability-executors` (940L) — dual-ported, parity-proven. §7 A/B/C migration-readiness seams (`_seams`: spawn/clock/dns/http, default real — production unchanged) + a robust self-worker entry (resolves the canonical `.js` from `__dirname`, mapping `.ts`/dist→`.js`). `.ts` = `@ts-nocheck` faithful transliteration; the hermetic equivalence bench injects spawn/dns/http/clock and proves dispatch + helpers + `runAudit`/`httpGetBounded`/`governedHttpGet` + 5 executor branches byte-identical JS≡TS (zero normalization). Gate 5/5. The 8 executors now reach `.ts`. **MIGRATION CAMPAIGN COMPLETE** — no safe candidate remains; the 6 hazard-blocked lots (`patch-proposal-apply`, `capability-factory`, …) are redesign-gated, not bounded fixes.

## Limits & next prioritized lots
- **Limit:** the canonical A01–A54/166 layer stays NON-ENUMERABLE (retired; not certified). Per-capability deep authority/policy re-grade beyond V57/V58 is DEFERRED (no demonstrated defect to justify it).
- **Next (only if evidence demonstrates a gap):** (1) a governed `capability-executors` redesign (inject `__filename`/entry-path + clock) to unblock 8 executors' migration — a CTO design mission; (2) a `fleet-collector` spawn-seam redesign. No artificial per-capability edits.

## Operational & commercial capabilities (added post-V66; registered 2026-10-20, evidence-backed)
Pure, dual-ported (`.ts`+`.js`), test-proven leaf capabilities added during the VPS-reliability + revenue campaigns.
Each: declared · bound · tested (tests listed) · dual-port parity · no governance/protected path. Not in the legacy
registry JSON (see reconciliation below) — this index is the truthful surface.
| Capability | Domain | Evidence (tests, all green) | Consumers | Gap |
|---|---|---|---|---|
| `exposure-audit` + `odg-exposure-check` | P3 security — loopback/exposure drift (read-only) | 5/5 + parity | `odg-monitor.timer`, `odg health §G` | none (remediation reserved) |
| `maintenance-alerts` + `odg-maintenance-check` | P5 ops — health/disk/mem/NRestarts/backup/release alerts | 5/5 + parity | `odg-monitor.timer`, `odg health §G` | none (notification channel human) |
| `supervision-summary` | observability — odg-health §G read-only summary | 6/6 + parity | `odg health` (both ports) | none |
| `mission-attempt-log` (§17) | observability/SLO — runId + total run duration + recovery duration | 16/16 + parity | both mission routes | real-mission volume (0 real) |
| `revenue-model` (+`targetPlan`) | commercial — rentability/scenarios/capacity math | 7/7 + parity | revenue docs, detector | conversion = hypothesis (no data) |
| `enterprise-lead-grade` | commercial — A/B/C/REJECTED evidence grade + anti-scam | 5/5 + parity | `opportunity-detector` | — |
| `opportunity-detector` | commercial — normalize→dedupe→grade→rank (reuses the 3 above) | 7/7 + parity | real collection (2026-10-19/20) | egress-gated: autonomous scheduling not wired |

**SRE benchmark (sourced 2026, Google SRE — golden signals latency/traffic/errors/saturation + error budgets):**
ODG HAS latency (`latency-measure`), errors (mission outcomes + maintenance CRIT), saturation (disk/mem), recovery/
rollback (P1/P1b LIVE). **GAP [sourced]:** no **error-budget / burn-rate** computation. Value is **gated on real
mission volume** (0 real operational missions today ⇒ building it now would run on synthetic data) ⇒ **planned lot,
not executed on fake data**. Sources: sre.google/workbook, n-ix SRE 2026 (consultés 2026-10-20).

## Registry reconciliation (RECONCILIATION_V1, 2026-10-20 — read-only, no rebuild)
**Measured** (`capability-registry.json`, 2026-10-19 snapshot): **186 "capabilities"** (plain strings) + **24
missingCapabilities** (objects = undone roadmap missions). Classification of the 186: **182 = `runtime/missions/*.json`
mission ids**, **0 = executor names, 0 = probe ids**, **4 = orphans**. ⇒ **registry ∩ real capability surface = ∅.**
**Role clarified:** `capability-registry.json` is effectively a **MISSION registry** (mission ids, incl. archived),
**NOT** a capability registry. It is **not** the authoritative capability surface — THIS index + per-module tests are.

**Orphans traced (NOT deleted — origin/status established):** all 4 are real PAST missions whose source JSON no
longer exists but whose artifacts/ledger persist —
- `AUDIT_RUNTIME_CAPABILITIES_FOR_PRUNING`, `IMPLEMENT_ODG_DOCTOR_COMMAND`: completed/archived (passports +
  certificates in `runtime/generated/mission-artifacts/`).
- `NL_ANALYZE_C3F758CF`: NL-gateway ephemeral analysis mission (convergence-report, PHASE_0_CARNET).
- `TEST_CONSEQUENTIAL_EXEC_GATE`: a TEST mission (`consequential-executor-gate.test.ts`; known stale-test residue).
Keep (no deletion without a bounded contract establishing safety).

## Relationships (missions ↔ executors ↔ probes ↔ leaf) — the honest layering
- **Missions** (`runtime/missions/*.json`, ROADMAP.json, registry JSON's 186) = *units of work*; they are PLANNED/
  EXECUTED/ARCHIVED, and DRIVE capabilities — they are not themselves capabilities.
- **Executors (10)** = the governed *action* surface a mission can invoke (write/spec/git/bash/scan/observe/research/
  connectivity/provider/local-gen).
- **Probes (15)** = pure fail-closed *readiness/evidence* checks consumed by validation/acceptance.
- **Leaf capabilities (7)** = pure operational/commercial *computation* modules (exposure/maintenance/supervision/
  §17 telemetry/revenue-model/lead-grade/opportunity-detector), consumed by CLIs/timers/docs — distinct from the
  executor/probe dispatch surface, not in any machine registry yet.
**Authoritative capability surface today = 25 (10+15) + 7 leaf = 32**, all declared·bound·tested (coverage above);
the registry JSON remains a disjoint mission layer. Rebuilding/renaming it is a **separate bounded lot** (not here).
