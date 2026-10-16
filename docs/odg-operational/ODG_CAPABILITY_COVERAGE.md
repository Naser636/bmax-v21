# ODG CAPABILITY COVERAGE — §V-B excellence method generalized across the real portfolio

**Purpose.** Apply the canonical **§V-B CAPABILITY-EXCELLENCE LOOP** (per-capability dossier: identity · domain · contract/invariants · real consumers · failure modes · domain-appropriate evaluation criteria · authoritative reference · baseline→after · migration-readiness) across the WHOLE existing capability portfolio, **reusing existing evidence** — not re-auditing. This is a coverage INDEX that points to evidence; it does not restate the audits.

**Scope & honesty.** The real, enumerable capability surface is **24**: 9 executors (`capability-executors.js EXECUTORS[]`) + 15 probes (`capability-probes.js PROBES`). The canonical "166 / A01–A54" objective is RETIRED (DEC-V60) and NOT reintroduced. Evidence base: V57 executor deep-audit (`ODG_V57_C5_DEEP_AUDIT.md`), V58 probe grading (`ODG_V58_PROBE_CAPABILITY_GRADING.md`), V59 individual grading (`ODG_V59_CAPABILITY_GRADING.md`), and the improvement log (§V-B-LOG B1–B7 in `ODG_MASTER_ROADMAP.md`). Evaluation-criteria framing follows the roadmap §Q-7 register (ISO/IEC 25010:2023 Reliability/Security; NIST SSDF; OWASP ASVS; SLSA/in-toto) — mapped, never claimed as certification.

**Coverage summary (evidence-based, no fabrication).** All 24 are ASSESSED (V57/V58/V59): declared · bound · executable · tested, controls EFFECTIVE (exercised by passing tests). Cross-cutting improvements applied to ALL executors (evidence provenance B1, dispatch-authorization invariant B2) and to the build/type gate consumer (B4), recurrence (B3/B7), triage coherence (B5), learn-portfolio (B6). **No further per-capability demonstrated gap is currently open.** Remaining is a reference-level NON-ENUMERABLE canonical layer (retired) and two migration items blocked with precise causes.

## Executors (9) — domain · improvement · demonstrated gap · migration-readiness
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

## Probes (15) — all PURE fail-closed `(ctx)=>{ok,detail}`, V58/V59 graded
- **Evidence/freshness probes** (`clean-workspace-scanned`, `autonomy-observability-verified`, `external-research-dry-run-planned`, `spec-schema-valid`, `research-acquired`, `git-branch-integrated`, `bash-command-governed`): run-ownership mtime + per-source provenance. Assessed V58; no gap.
- **Gate probes** (`build-green`, `typescript-green`): content-derived BY DESIGN; freshness is the CONSUMER's job — hardened at validation-engine **B4** (run-ownership `freshGatesOk`). No gap.
- **Structural probes** (`legacy-runtime-retired`, `samurai-output-mode`, `single-runtime-entrypoint`, `capability-probes-finalized`, `fleet-request-validated`, `internet-reachable`): current-source fs reads; V58 graded; no gap.
- Host module `capability-probes` is dual-ported (`.ts` + equivalence bench); probes layer migration DONE.

## Migration readiness (re-evaluated on current evidence)
- **DONE (dual-ported, parity-proven):** bash-command-governor, action-gate, capability-authorization, state-transition, economic chain, + the probes host — the authorization/admission/command surface and the FINANCE/§6B chain.
- **UNBLOCKED + MIGRATED (V65):** `fleet-collector` — the migration-readiness seam (§7B: inject spawn/clock/governance/ledger, real defaults) was implemented, `.js` seamed + `.ts` dual-ported, gate 5/5 (equivalence JS≡TS across every branch). Dual ports 76→77.
- **PREREQUISITE ADVANCED (V65 §7A):** `capability-executors` (930L) — the ENTRY-PATH risk is RESOLVED: both self-re-exec workers now use a CONTROLLABLE self-entry (`env ODG_SELF_WORKER_ENTRY` / `opts.selfEntry`, default `__filename` — production unchanged, cwd-independent); proven a compiled/dist caller or hermetic bench can re-exec the canonical `.js` from any cwd. REMAINING for the full dual-port (distinct larger lot): a hermetic equivalence bench must inject network (dns/http) + the provider-activation/self-reexec spawns and NORMALIZE the `new Date()` volatiles (ranAt/fetched_at — the established bench-normalization pattern, not a build hazard). 8 executors reach `.ts` only through this module. The planner still heuristically flags `__filename`+spawn (honest; the §7C equivalence gate, not the planner, is the migration authority).

## Limits & next prioritized lots
- **Limit:** the canonical A01–A54/166 layer stays NON-ENUMERABLE (retired; not certified). Per-capability deep authority/policy re-grade beyond V57/V58 is DEFERRED (no demonstrated defect to justify it).
- **Next (only if evidence demonstrates a gap):** (1) a governed `capability-executors` redesign (inject `__filename`/entry-path + clock) to unblock 8 executors' migration — a CTO design mission; (2) a `fleet-collector` spawn-seam redesign. No artificial per-capability edits.
