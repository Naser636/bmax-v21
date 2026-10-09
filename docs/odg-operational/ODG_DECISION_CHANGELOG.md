# ODG — DECISION & CHANGE CHANGELOG (permanent, documentary)

> Traceable journal of CTO decisions and semantically-important changes. **Documentary only — grants NO
> permission, creates NO runtime memory / authority registry / primitive, and does NOT modify the frozen
> Master.** Authority order unchanged (Master FICHE_01–06 → Runtime Constitution → CTO Directives → ROADMAP.json).
> Git holds the exact diffs; this journal records the WHY, the decision and the consequences, and references
> commits for technical detail. Companion to `ODG_MASTER_ROADMAP.md` and `ODG_DEFECT_REGISTER.md`.
>
> Entry kinds are labelled: **[CTO-DECISION]** (issued by the CTO), **[CANONICAL]** (a rule from the fiches),
> **[TECH-CHANGE]** (a repo change), **[FINDING]** (a technical observation), **[HYPOTHESIS]** (unconfirmed).
> Status ∈ PROPOSED · ACCEPTED · REJECTED · SUPERSEDED · UNVERIFIED. Dates are only given when verifiable.

## CTO decisions (this reconciliation, 2026-10-09)

### DEC-001 — FICHE_07 is the canonical method authority [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: FICHE_07 (method chain, FICHE_07:6) is canonical. The roadmap §C table is a **subordinate
  explanatory mapping** only; it may not omit, replace or contradict any canonical step/stop-state.
- Source: FICHE_07:6; reconciled in `ODG_MASTER_ROADMAP.md` §C. Checkpoint: `fede03a`. Evidence: §C now quotes
  the FICHE_07 chain verbatim + terminal `ONE NEXT AUTHORIZED ACTION` / `UNKNOWN|BLOCKED`.
- Affects: all future missions use the FICHE_07 chain. Reopen if FICHE_07 is itself amended by an authorized Master change.

### DEC-002 — Phase 0 / Truth Lock is an OPERATIONAL requirement, not a six-fiches rule [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: Truth Lock / Phase-0 precedence comes from the repo protocol + carnet, NOT from the six fiches;
  it must not be presented as an explicit fiches rule.
- Source: `ODG_AUTONOMOUS_WORK_PROTOCOL.json`, `CLAUDE.md`, `docs/audit/phase-0/current/PHASE_0_CARNET.md`
  (grep of the six fiches for "phase 0" = empty — see roadmap note §7 of the reconciliation report).
- Affects: the resumption sequence (roadmap §B) keeps Truth-Lock-first, labelled operational. Reopen if a future
  authorized Master edit inscribes it in the fiches.

### DEC-003 — Roadmap order ≠ authorization [CTO-DECISION / CANONICAL] — ACCEPTED (2026-10-09)
- Decision: selecting the next step (roadmap §H) is never permission to develop or ACTIVATE a capability;
  the §I human gates + canonical contracts gate activation.
- Source: `ODG_V5_ROADMAP_WITH_WORK_METHOD.md:20,551`. Checkpoint: `fede03a` (invariant added to roadmap header).
- Affects: next-mission selection never auto-activates; activation needs explicit authorization.

### DEC-004 — Frozen fiches are not edited for ordinary historical changes [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: FICHE_01–06 stay frozen/canonical; ordinary evolutions are logged here and linked to reference
  docs, never written into the fiches.
- Source: this mission §2.D; Master framing "FINAL · FROZEN · CANONICAL". Evidence: reconciliation edits touched
  only operational docs (git status of `docs/odg-master-v5` empty at `fede03a`).
- Affects: all documentation work. Reopen only via an authorized Master-amendment mission.

### DEC-005 — No security control restored/removed without proof + intent + authorization [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: evaluate any prior control change by intent/contract; do not auto-restore a deliberately-removed
  protection nor remove a still-required one without a separately authorized mission.
- Source: this mission §2.E; linked `ODG_DEFECT_REGISTER.md` DEF-006 (authorizeMission non-exploitable),
  DEF-007 (resolver-off-route intentional). Checkpoint: `fede03a` (lesson added to register).
- Affects: security-touching missions require an explicit authorized scope.

## Confirmed changes (repo-verified; production NOT claimed)

| ID | Checkpoint | Date | Change (semantic) | Status | Evidence |
|---|---|---|---|---|---|
| CHG-COMMERCIAL | `985c836`→`b94bc85` | 2026-10-09 | governed commercial OS: intake, `odg client` CLI, email (IMAP/SMTP, send off), quote, invoicing, payments, delivery packager, site `/api/intake` route | TESTED_LOCALLY | per-module suites; `commercial-journey.test.js` 19 |
| CHG-D52CED8 | `d52ced8` | 2026-10-09 | delivery packager symlink confinement (DEF-001) | ACCEPTED (local) | `pilot-delivery-packager.test.js` 13a-d |
| CHG-D77F174 | `d77f174` | 2026-10-09 | **LOCAL INTEGRATION fix**: same-origin site serving + configurable persistent store + collision-safe ids (DEF-002/003/004) | TESTED_LOCALLY (**production NOT verified**) | `deployment-readiness.test.js` 9, `site-serving.test.ts` 5; `odg verify` RC=0 |
| CHG-71A2BE2 | `71a2be2` | 2026-10-09 | registered `ODG_MASTER_ROADMAP.md` + `ODG_DEFECT_REGISTER.md` | ACCEPTED | docs-only; `odg verify` RC=0 |
| CHG-FEDE03A | `fede03a` | 2026-10-09 | reconciled roadmap method chain + canonical invariants with FICHE_07/Master | ACCEPTED | docs-only; citations verified |

> `d77f174` is explicitly a LOCAL integration repair; DEPLOYMENT_VERIFIED = none (no deploy performed).

## Open decisions (pending CTO)
- **OD-1** [HYPOTHESIS→PROPOSED] Replace the roadmap §C mapping table with the FICHE_07 chain only, or keep the
  subordinate table? Current: kept as subordinate mapping (DEC-001). Reopen = CTO preference.
- **OD-2** [PROPOSED] Elevate Phase-0 precedence to a canonical fiches rule? Current: operational-only (DEC-002).
  Requires an authorized Master-amendment decision.

## Non-verifiable / limits
- Decisions from conversations PRIOR to the commit history visible in this repo are **not fully recoverable**;
  only repo-verifiable checkpoints and this session's CTO decisions are recorded. Earlier periods = UNVERIFIED.
- No dates are asserted beyond those verifiable from Git (`git log`) or the current session date (2026-10-09).
