# V121 — ODG OWNER-READINESS DOSSIER (final blocker resolution)

> **Status:** owner-facing action dossier. NOT a competing registry — it references the canonical
> `docs/odg/closure-register.json` and the canonical compass `ODG_PROJECT_STATE.md`; it overwrites neither.
> **Authority:** ODG. **Scope:** the 15 non-ACCEPTED closure-register items at HEAD `74ddcbf`.
> **Truth-lock:** every "DONE locally" claim below is backed by a named repository artifact. Nothing here
> fabricates external data, labels, market inputs, credentials, or a historical original.

## 0. Headline

After an individual audit of all 15 non-ACCEPTED items, **zero are closable to ACCEPTED locally today**:
each requires a genuine external input, an owner decision, an owner-provisioned secret, owner-executed VPS
action, a protected-path authorization, a lost original, or is an intentional portfolio DEFERRAL. The
engineering **preparation is already DONE** for essentially every owner-gated item (readiness gates,
protocols, mechanisms, templates, runbooks all exist and are ACCEPTED). What remains is **owner input**.

Distribution (reconciled against the real register): **412 ACCEPTED · 9 BLOCKED · 3 IN_PROGRESS · 3 DEFERRED = 427.**

---

## 1. Per-item audit (Phase 3)

Legend — Blocker type: EXT=external data · OWN=owner decision · SEC=owner secret · VPS=owner VPS op ·
PROT=protected-path auth · LOST=lost source · DEF=intentional deferral. "Prep" = local preparation already shipped.

### P0 items
1. **historical-roadmap-excellence-28jul-recover** — BLOCKED · LOST.
   - Done locally: independently re-verified — the ORIGINAL 28-July roadmap is **absent from the entire working tree AND the full git history** (only references-to-absence + a CTO-supplied reconstruction `docs/odg-operational/ODG_MASTER_ROADMAP_EXCELLENCE_OPERATIONNELLE_RECONSTRUCTION_V1.md`, explicitly labelled NOT the original).
   - Missing: the original document itself (owner may hold it off-repo), OR an explicit owner decision to adopt the reconstruction as the working substitute.
   - Closure test: original supplied + content diff vs reconstruction recorded; OR owner decision logged.
   - Actor: OWNER. Risk if wrong: presenting a reconstruction as the original = fabrication (forbidden). Closable now: NO.
2. **p0e-audit-log-keyed-integrity** — BLOCKED · SEC.
   - Done locally: keyed-HMAC + signed-tail + tip-anchor **mechanism is implemented** in `runtime/core/audit-log.ts` (19 assertions; backward-compatible). It closes full-rewrite + tail-truncation forgery **once a secret the attacker cannot reproduce is supplied**.
   - Missing: an owner-provisioned HMAC key in secure config (NOT in repo/chat).
   - Closure test: with a real key set, a full-rewrite and a tail-truncation both fail `verifyChain`; without the key a keyless chain is honestly marked unverifiable.
   - Actor: OWNER (key provisioning + rotation policy). Risk: a committed/logged secret = exposure. Closable now: NO.
3. **p0-autonomy-measure-slice3-delegate-provenance** — DEFERRED · DEF/technical.
   - Done locally: read-only deep diagnosis — `odg-delegate` writes no `patch-execution.json`; the delegate path reaches `recordMission` via `odg-converge → AutonomyRuntimeAdapter.archive`, whose own patch-executor would overwrite a naive stamp. A safe fix needs an execution-chain contract + a real empirical delegate run.
   - Missing: a designed execution-chain provenance contract + an empirical delegate execution to measure. Deferred (not a false blocker; genuinely harder than a stamp).
   - Actor: ODG (future slice) — no owner input required, but out of this campaign's bounded scope. Closable now: NO (DEFERRED, honest).

### P1 items
4. **dashboard-tls-exposure** — BLOCKED · OWN+VPS.
   - Done locally: readiness gate `runtime/core/dashboard-exposure-readiness.ts`, token provision `dashboard-token-provision.ts`, exposure audit `exposure-audit.ts`, TLS/proxy templates + rollback runbook `docs/odg/deploy/EXPOSURE_RUNBOOK.md`. Live probe returns NOT_READY until owner acts.
   - Missing: owner exposure decision (`ODG_DASHBOARD_EXPOSURE_CONFIRMED=1`), a real hostname + valid TLS cert, `ODG_DASHBOARD_TOKEN` in secure config, and execution of the gated activation.
   - Closure test: readiness probe READY + authenticated loopback smoke + public TLS handshake, per the runbook.
   - Actor: OWNER (decision + cert + token + activation). Risk: premature public exposure of an internal service. Closable now: NO.
5. **structured-roadmap-deps** — BLOCKED · PROT.
   - Done locally: proposal/preview `roadmap-schema-proposal.ts` + `roadmap-deps-preview-validation.ts`. Honest finding: the 11 ROADMAP.json mission contracts declare **no explicit inter-deps beyond the ONE already encoded** in `roadmap-dependencies.json` (`DEPLOY_BMAX ← VPS_DEPLOYMENT_READINESS`). **Adding any further edge would FABRICATE roadmap structure** — so there is nothing more to add honestly; only the apply of the existing single edge INTO the protected `ROADMAP.json` remains.
   - Missing: owner authorization to edit the protected `ROADMAP.json` (apply the one validated edge), OR an owner decision that the companion `roadmap-dependencies.json` suffices.
   - Closure test: dep-planner validates the applied ROADMAP.json; no cycle; consumers unaffected.
   - Actor: OWNER (protected-path auth). Risk: editing a governed source of truth without authorization. Closable now: NO.

### P2 items
6. **broad-it-corpus-grow** — IN_PROGRESS · EXT.
   - Done locally: corpus 11/12 categories covered (0.9167), dev/heldout leakage-disjoint, accuracy 1.0 on the narrow surface. broadIT stays **NO_DATA solely because labels are self-authored** (`independentlyLabelled=false`). Adding more self-authored cases does NOT change the verdict.
   - Missing: independent (third-party or real-upstream) labels — see item 7.
7. **broad-it-independent-eval-set** — BLOCKED · EXT.
   - Done locally: admission policy `runtime/core/independent-label-policy.ts` (`admitEvalSet` — rejects self-authored labels; requires sourceRef + dev/validation separation).
   - Missing: a real independently-labelled broad-IT set (third-party labels or merged-PR/upstream test-suite verdicts) with traceable provenance. ODG must NOT fabricate or self-certify labels.
   - Closure test: `admitEvalSet` admits the supplied set; broadIT recomputes a real VERIFIED_SUCCESS_RATE.
   - Actor: OWNER/EXTERNAL (supply labels). Risk: self-certified labels = inflated metric. Closable now: NO (preserve NO_DATA).
8. **campaign-runner-systemd-activation** — BLOCKED · OWN(VPS go-live).
   - Done locally: the runner's Truth-Lock main-only refusal is **correct and intended safety** (branch=main + HEAD==origin/main + clean tree) — "DÉJÀ SATISFAIT (safety works)". It activates only from a canonical-safe main checkout; not bypassed.
   - Missing: owner decision to go live as a system timer (operational).
   - Closure test: timer enabled on an authorized host from a safe checkout; health/stop/restart observed.
   - Actor: OWNER (VPS/systemd go-live). Risk: force-activation would be an artificial success. Closable now: NO.
9. **p01-demand-validation** — BLOCKED · OWN(lawful outreach).
   - Done locally: pre-registered protocol + fail-closed WTP validator `runtime/core/demand-experiment.ts` (0 real signals present; nothing fabricated).
   - Missing: owner-authorized lawful outreach/landing to collect ≥5 REAL verified WTP signals, under privacy/consumer-protection compliance.
   - Closure test: ≥5 provenance-verified WTP signals admitted by the validator.
   - Actor: OWNER (authorize compliant outreach). Risk: unapproved outreach / privacy breach. Closable now: NO.
10. **p01-billing-sandbox** — BLOCKED · OWN+SEC(paid provider).
    - Done locally: sandbox billing cycle proven `runtime/core/p01-billing-sandbox.ts` (invoice→payment→reconcile, idempotent, no prod charge). Depends on item 9 (validated demand) first.
    - Missing: owner authorization + a paid provider account/credentials in secure config; follows real demand.
    - Closure test: a real provider sandbox-then-live cycle with idempotency + reconciliation, owner-authorized.
    - Actor: OWNER (account + credentials + spend authorization). Risk: real spend / payment processing. Closable now: NO.
11. **eleven-profession-program-definition** — IN_PROGRESS · EXT.
    - Done locally: read-only recovery sweep — **NO canonical definition** of eleven professions × nine specialties × 99 targets exists anywhere; the only 11-structure is the governance D1-D8+H1-H3 domain map, which the directive FORBIDS equating to professional businesses without an explicit source.
    - Missing: an owner/external canonical source defining the 11 professions / 9 specialties / 99 targets with dated provenance.
    - Actor: OWNER/EXTERNAL (supply the canonical definition). Risk: inventing a taxonomy = fabrication. Closable now: NO.
12. **master-unified-campaign** — IN_PROGRESS · EXT.
    - Done locally: Wave 0 done — canonical `ODG_MASTER_UNIFIED_REGISTER_V1.md` (references+absorbs P1/P2 with provenance; does not overwrite the register). Waves W1-W7 pending.
    - Missing: W2 (11 market dossiers) + W3 (99 experts/synthesis) require **verifiable dated external market research**; W1/W4 autonomy/domain builds depend on it.
    - Actor: OWNER/EXTERNAL (supply verifiable dated market data). Risk: fabricated market data. Closable now: NO.
13. **golden-path-scaffolder-poc** — DEFERRED · DEF.
    - Done locally: `poc/o8-golden-path/scaffold.ts` (deny-by-default admit + scaffold + mission-contract + sha256 provenance), tests 13/13. Capability = SPECIFICATION_ONLY; **intentionally preserved, not productized** (portfolio decision).
    - Missing: an owner productization decision (if ever). Actor: OWNER (optional). Closable now: N/A (intentional DEFERRAL).
14. **commercial-ops-substrate-h3** — DEFERRED · DEF.
    - Done locally: internal single-tenant commercial-ops substrate (CRM mechanics), all tests passing; CRM/ERP **explicitly disclaimed** as a product. TO_CONSOLIDATE.
    - Missing: an owner productization decision. Actor: OWNER (optional). Closable now: N/A (intentional DEFERRAL).

### V4 item
15. **adr-166-capabilities-reconciliation** — BLOCKED · OWN(decision).
    - Done locally: traceability matrix `docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md` §0.1 + decision changelog `DEC-V60-166-RETIREMENT` recorded. The conflict (recover-166 vs retirement) is surfaced.
    - Missing: an owner decision to reconcile §115 recover-166 against DEC-V60-166-RETIREMENT.
    - Actor: OWNER (ADR decision). Risk: an unauthorized capability reinstatement/retirement. Closable now: NO.

---

## 2. Cross-blocker dependency map (Phase 10)

- **Shared "independent labels" input** unlocks TWO items together: `broad-it-independent-eval-set` → then `broad-it-corpus-grow` recomputes a real rate. One owner/external supply resolves both.
- **Shared "owner VPS session"** can batch (each keeping its OWN scope, NOT a blanket grant): dashboard exposure activation (item 4) + campaign-runner systemd go-live (item 8) + the real reboot (post-reboot evidence per `ODG_HOST_REBOOT_DRILL_RUNBOOK.md`). Sequence: backup → reboot → verify health → activate services.
- **Sequential chain**: `p01-demand-validation` (item 9) must precede `p01-billing-sandbox` (item 10) — don't provision a paid provider before demand is validated.
- **Independent, single owner decision each** (no batching): `historical-roadmap` (supply/accept), `adr-166` (ADR decision), `structured-roadmap-deps` (protected-path edit auth), `p0e audit key` (secret provisioning), `eleven-profession` + `master-unified` (external data).
- **No action needed** (intentional DEFERRALS): `golden-path-scaffolder-poc`, `commercial-ops-substrate-h3`, `p0-autonomy-measure-slice3` (ODG future slice).

Each sensitive operation keeps a **separate explicit scope** — security secrets, financial authorization,
public exposure, and protected-path edits are NEVER merged into one blanket approval.

---

## 3. Owner Action Pack (Phase 11) — grouped, prioritized

**A. Documents / historical sources to supply**
- `historical-roadmap-excellence-28jul-recover`: supply the original 28-July roadmap if held off-repo, OR explicitly accept the reconstruction (`…RECONSTRUCTION_V1.md`) as the working substitute. (Prep: reconstruction + crosswalk DONE.)
- `adr-166`: record the ADR decision (recover-166 vs DEC-V60-166-RETIREMENT). (Prep: traceability matrix + changelog DONE.)

**B. Independent datasets / external research to obtain**
- Broad-IT independent labels (unlocks `broad-it-independent-eval-set` + `broad-it-corpus-grow`): third-party labels or merged-PR/upstream verdicts, with provenance + dev/validation split. (Prep: `admitEvalSet` admission policy DONE.)
- `eleven-profession-program-definition`: a canonical, dated source for 11 professions × 9 specialties × 99 targets. (Prep: read-only recovery sweep DONE — confirmed none exists.)
- `master-unified-campaign` W2/W3: verifiable dated market research (11 dossiers, 99 experts). (Prep: Wave 0 register DONE.)
- All external research MUST flow through the research-governor + budget + safety + cycle controls (M4–M9); no ungranted egress; no fabricated sources/dates.

**C. Security decisions / secrets to provision (secure channel, NEVER chat)**
- `p0e-audit-log-keyed-integrity`: provision an HMAC key in secure config + a rotation policy. (Prep: keyed-HMAC + tip-anchor mechanism DONE, 19 assertions.)

**D. VPS operations requiring owner execution** (owner-run; ODG performs none)
- `dashboard-tls-exposure`: set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1` + hostname + TLS cert + `ODG_DASHBOARD_TOKEN`; run the gated activation per `EXPOSURE_RUNBOOK.md`.
- `campaign-runner-systemd-activation`: enable the system timer from a canonical-safe main checkout.
- Real VPS reboot: follow `ODG_HOST_REBOOT_DRILL_RUNBOOK.md` (backup → reboot → verify health → collect post-reboot evidence). V107 supervision + controlled restart remain VALIDATED — do not reopen.

**E. Protected roadmap authorization**
- `structured-roadmap-deps`: authorize applying the ONE validated edge (`DEPLOY_BMAX ← VPS_DEPLOYMENT_READINESS`) into the protected `ROADMAP.json`, OR accept the companion `roadmap-dependencies.json` as sufficient. (Prep: proposal + preview-validation DONE; no further honest edges exist.)

**F. Legal / demand / financial sandbox decisions**
- `p01-demand-validation`: authorize compliant lawful outreach to collect ≥5 real WTP signals. (Prep: protocol + fail-closed validator DONE.)
- `p01-billing-sandbox` (after F-demand): authorize + supply paid-provider credentials for a sandbox-then-live cycle. (Prep: sandbox cycle DONE.)

---

## 4. Truth-lock statement

No external data/labels/market inputs/credentials were fabricated. No VPS/production/root/network/spend
operation was performed. No protected path was edited. No competing registry was created (this dossier
references the canonical register and compass). All 15 statuses retained honestly; none force-closed.
