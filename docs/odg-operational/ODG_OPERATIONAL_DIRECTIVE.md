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
