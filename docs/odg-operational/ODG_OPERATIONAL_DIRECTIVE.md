# ODG OPERATIONAL DIRECTIVE

> Compiled operational projection. NOT a Constitution, NOT the Master, NOT a Roadmap, NOT a new
> authority, NOT an autonomous authorization. It is a traceable working interface that lets Claude
> Code execute a future mission while respecting the authoritative sources and their limits.
> It never becomes a new source of truth.

## 1. IDENTITY & STATUS
- **Nature:** compiled operational projection (non-authoritative). `[REPO]`
- **Status:** does not create, replace, or override any authority. `[AUTHORIZATION: P0-CURRENT-065]`
- **Source manifest:** `docs/odg-operational/ODG_OPERATIONAL_MANIFEST.json` (26 sources, 4 base contradictions). `[REPO]`
- **Generation HEAD:** `5e16de1c0ffc6aa6e279138a908e687d64176226` (branch `runtime/mission-context-builder`). `[REPO]`
- **Manifest commit:** `31ecd11`. P0-CURRENT-065 commit: `5e16de1`. `[REPO]`
- **Generated timestamp:** `2026-10-03T00:15:34Z` (observed at compile). `[REPO]`
- **METHOD_IDENTITY_STATUS:** OBSERVED_REPOSITORY_METHOD; 'V5' LABEL NOT PRESENT AS A REPOSITORY ARTIFACT; C-03 REMAINS UNKNOWN. `[UNKNOWN: C-03]`

## 2. AUTHORITY & SOURCE RULES
Compilation source order (from P0-CURRENT-065 — a **compilation** rule, NOT the truth hierarchy): `[AUTHORIZATION: P0-CURRENT-065]`
`MASTER > GOVERNANCE/AUTHORITY > METHOD > ROADMAP > CURRENT AUTHORIZATION > REPOSITORY TRUTH > EVIDENCE > EXECUTION PLAN`
- **Master** — `runtime/brain/MASTER_PLAN.md` (semantic authority, by name). `[MASTER]`
- **Governance/Authority** — `runtime/governance/constitution/RUNTIME_CONSTITUTION.md` + `runtime/constitution/runtime-constitution.json` (active in governance-kernel), `docs/CONSTITUTION_EDG_v1.md` (EDG perimeter), `runtime/governance/directives/CTO_DIRECTIVES.md`, `state-machine.json`. `[GOVERNANCE]`
- **Method** — `docs/METHODE_DE_TRAVAIL.md` (observed). `[METHOD]`
- **Roadmap** — `runtime/governance/ROADMAP.json` (execution roadmap of record). `[ROADMAP]`
- **Current Authorization** — Phase-0 closure + `P0-CURRENT-064`/`-065`. `[AUTHORIZATION]`
- **Repository Truth** — HEAD/branch/worktree (observed, not authority). `[REPO]`
- **Evidence** — `docs/audit/truth-lock/*`, `docs/audit/phase-0/*`, `runtime/evidence/evidence-ledger.json` (bounded to scope). `[EVIDENCE]`
- **Execution Plan** — per-mission, lowest precedence. `[METHOD]`
**No projection (including this file) can create authority or an authorization.** Cross-tier *truth* precedence beyond this compilation rule is `[UNKNOWN]` where not explicitly declared by sources.

## 3. MASTER SEMANTIC INVARIANTS
`[MASTER]` / reaffirmed by `[AUTHORIZATION: P0-CURRENT-065]`, not created here:
- exactly **9 permanent runtime primitives**; **no 10th primitive**.
- semantic separation of concerns preserved.
- the **Master is the semantic authority**.
- **verified reality + evidence prevail** over documentary assertion for establishing truth.
- **repository truth ≠ authority**; **evidence ≠ authorization**; **historical ≠ current**.
- `PLANNED ≠ AUTHORIZED ≠ EXECUTED ≠ VERIFIED ≠ ACCEPTED ≠ RELEASED` (kept distinct).
- **reuse before creating**; **minimal change**; **no strategic drift**.

## 4. METHOD (observed golden loop)
Compiled from `docs/METHODE_DE_TRAVAIL.md` (observed method; see §1 METHOD_IDENTITY_STATUS). `[METHOD]` / `[UNKNOWN: C-03]`
`TRUTH LOCK → REPRODUCE → MEASURE → LOCALIZE → CLASSIFY → PROVE ROOT CAUSE → MINIMAL CHANGE → BUILD → TEST → REGRESSION → RUNTIME VERIFY → EVIDENCE → COMMIT → CHECKPOINT → ONE NEXT AUTHORIZED ACTION`

## 5. ROADMAP
`[ROADMAP]` / `[AUTHORIZATION: P0-CURRENT-065 (C-04)]`
- `runtime/governance/ROADMAP.json` = **execution roadmap of record** (self-declared official machine-readable single ordered list): `M0000, M0001, M0002, CLEAN_RUNTIME_WORKSPACE, PROVIDER_ENABLED_SMOKE_V1, UNIFY_RUNTIME_EXECUTION, DYNAMIC_MISSION_CONTRACT_FACTORY, AUTONOMOUS_CONTRACT_EVOLUTION`.
- Do **NOT** merge with `missions.json`; `missions.json` = **distinct registry, non-roadmap**.
- **Phase 0 is CLOSED**; no post-Phase-0 action may be invented or inferred. Roadmap order stays governed.

## 6. CURRENT AUTHORIZATION
`[AUTHORIZATION]`
- Phase-0 closure: `P0-CURRENT-063` (closure) + `P0-CURRENT-064` (accept as final, no further action).
- `P0-CURRENT-065`: C-02 (constitutions by perimeter), C-04 (ROADMAP.json of record / missions.json distinct), C-06 (compilation hierarchy).
- **C-03 UNKNOWN** (method label). **No post-Phase-0 mission is currently authorized.**

## 7. REPOSITORY TRUTH (observed at compile — NOT semantic authority)
`[REPO]`
- path `/home/ubuntu/bmax-v21`; branch `runtime/mission-context-builder`; HEAD `5e16de1…`; worktree clean (before this file).
- manifest commit `31ecd11`; Phase-0 checkpoint tag `odg-phase0-closed → fd67bee925476066ffd56262d094f458e8672844`.
- live `runtime/generated/mission-ledger.json` + `pipeline-checkpoint.json` are **ephemeral**, not durable proof.

## 8. EVIDENCE & PROOF
`[EVIDENCE]`
- evidence is **bounded by its scope**; historical ≠ current proof.
- mission ARCHIVED ≠ objective proven; build green ≠ system correct; provider SELECTED ≠ provider EXECUTED; durable proof ≠ independent proof.
- every certification MUST state its scope (cf. Phase-0 bounded verdicts).

## 9. PROHIBITIONS
`[MASTER]/[GOVERNANCE]/[AUTHORIZATION]` — Claude Code MUST NOT:
- create a new primitive (no 10th); create a second kernel/runtime.
- modify Master/Constitution/Roadmap/CTO authority without explicit authorization.
- invent an authorization; silently resolve a contradiction; turn UNKNOWN into VERIFIED.
- treat historical as current without validation; run an old roadmap in parallel.
- enlarge the write set; delete code without a safety proof; certify beyond the evidence; bypass a STOP gate.

## 10. EXECUTION PROTOCOL (per future mission)
`[METHOD]`
`TRUTH LOCK → AUTHORIZED SCOPE → REPRODUCE → MEASURE → LOCALIZE → ROOT CAUSE → MINIMAL CHANGE → BUILD → TEST → REGRESSION → RUNTIME VERIFY → EVIDENCE → COMMIT → CHECKPOINT → ONE NEXT AUTHORIZED ACTION`

## 11. WRITE-SET / CHANGE CONTROL
`[METHOD]` — each mission must declare: authorized files; symbols/surfaces; mutable state; blast radius; rollback/recovery; stop condition; expected evidence. **Any mutation outside the declared set ⇒ STOP.**

## 12. VERIFICATION / RELEASE LEVELS
`[METHOD]/[EVIDENCE]` — distinguish: structural · semantic · behavioral · runtime · objective · adversarial · economic · independent/external. **Never use a lower proof level to certify a higher one.**

## 13. CHECKPOINT CONTRACT
`[METHOD]` — every closure must provide: Master/source identity · campaign/mission · HEAD · objective · proven · changed · not proven · failed · unknown · regression · worktree · status · next authorized action · stop condition.

## 14. CURRENT KNOWN LIMITATIONS
`[UNKNOWN]` (from manifest/audit; nothing invented to fill gaps):
- **C-03**: `docs/METHODE_DE_TRAVAIL.md` vs baseline copy; "Méthode V5" NOT a repo artifact → UNKNOWN.
- **GAP_MAP**: no tracked file → absent.
- **Truth Snapshot**: no tracked file under that name (closest: `PHASE_0_TRUTH_CERTIFICATE.md`).
- **Final Master**: no distinct tracked artifact under that name (closest: `MASTER_PLAN.md`).
- cross-tier *truth* precedence (beyond the compilation rule); EDG↔Runtime constitution precedence (C-02 conflict-on-same-perimeter ⇒ CTO_DECISION_REQUIRED); role of `missions.json` as authority (requires explicit proof).

## 15. PROVENANCE MAP
- §1 Identity ← `[REPO]` + `[AUTHORIZATION]` + `[UNKNOWN: C-03]`
- §2 Authority/order ← `[AUTHORIZATION: P0-CURRENT-065]` + source paths
- §3 Invariants ← `[MASTER]` (+ reaffirmed `[AUTHORIZATION]`)
- §4 Method ← `[METHOD: docs/METHODE_DE_TRAVAIL.md]` + `[UNKNOWN: C-03]`
- §5 Roadmap ← `[ROADMAP: runtime/governance/ROADMAP.json]` + `[AUTHORIZATION: C-04]`
- §6 Authorization ← `[AUTHORIZATION: PHASE_0_CARNET P0-063/064/065]`
- §7 Repo truth ← `[REPO]`
- §8 Evidence ← `[EVIDENCE: truth-lock/phase-0/evidence-ledger]`
- §9 Prohibitions ← `[MASTER]/[GOVERNANCE]/[AUTHORIZATION]`
- §10–13 ← `[METHOD]`
- §14 ← `[UNKNOWN]` (manifest/audit)

## 16. FINAL OPERATING RULE
**MASTER FROZEN. REPOSITORY OPEN. PROOF BEGINS.**
This Directive is a compiled, traceable working interface. It never becomes a new source of truth.

---

## 17. POST-GENERATION RECONCILIATION ADDENDUM (non-authoritative)
`[REPO]/[AUTHORIZATION: CTO operational-governance reconciliation]`

> This addendum is appended AFTER the compiled projection above. It does NOT rewrite the
> compiled body (§1–§16), which is preserved verbatim as generated at HEAD `5e16de1`. It
> records facts that became true in the repository AFTER that generation. Like the rest of
> this file it creates NO authority and NO authorization.

**Reconciliation HEAD:** `32072e1` (branch `runtime/mission-context-builder`).

**Obsolete generation-time statements now superseded by repository fact.** `[REPO]`
- §1 / §15 `METHOD_IDENTITY_STATUS` and §14 C-03 stated: "'V5' LABEL NOT PRESENT AS A
  REPOSITORY ARTIFACT" / "'Méthode V5' NOT a repo artifact → UNKNOWN". This was true at
  generation HEAD `5e16de1`. It is **no longer true**: the V5 working-reference artifacts
  are now committed in the repository:
  - `docs/odg-master-v5/source/ODG_V5_ROADMAP_WITH_WORK_METHOD.md` (commit `943beee`,
    reconciled `32072e1`).
  - `docs/odg-master-v5/source/ODG_FINAL_MASTER_DETAILED_V5_FICHE_07_METHODE_DE_TRAVAIL.md`
    (commit `90e926f`).
  The C-03 "method label" UNKNOWN is therefore reduced to a naming/provenance question only;
  it is NOT upgraded to VERIFIED here.

**Authority rule (unchanged, restated to remove ambiguity).** `[AUTHORIZATION]`
- `runtime/governance/ROADMAP.json` REMAINS the single execution roadmap of record
  (C-04). It is NOT modified by this reconciliation; no P0-07x entry is injected into it.
- `ODG_V5_ROADMAP_WITH_WORK_METHOD.md` is a **working reference / detail roadmap**, NOT a
  second execution roadmap and NOT a competing authority.
- `ODG_FINAL_MASTER_DETAILED_V5_FICHE_07_METHODE_DE_TRAVAIL.md` is available as an
  **operational work-method reference**. It does NOT replace `RUNTIME_CONSTITUTION` /
  `docs/CONSTITUTION_EDG_v1.md` / the Master, and creates no new governance system.

**Durable state record (post-Phase-0).** `[EVIDENCE]`
- P0-069 / C03 = last ACCEPTED runtime change: commit `3957835`
  (`runtime/core/state-transition.js` + test); CHECKPOINTED and CTO-ACCEPTED.
- P0-070 = analysis EXECUTED (read-only, session); conclusion:
  **"INTEGRATION NOT CURRENTLY REQUIRED"**. LIMITATION: no independent durable artifact was
  produced for P0-070 beyond this record and the reconciliation note in the V5 roadmap
  (`32072e1`); EXECUTED, NOT VERIFIED, NOT ACCEPTED.
- P0-070 therefore produced **NO P0-071 write-set**. P0-071 (C03 producer/consumer
  integration) and all later P0-07x remain **NOT AUTHORIZED**; each requires a separate CTO
  authorization carrying a concrete write-set.

**This addendum is NOT an authorization of P0-071 or of any post-Phase-0 implementation
mission.** Per §6 above, no post-Phase-0 implementation mission is currently authorized.
