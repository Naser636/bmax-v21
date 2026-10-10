# ODG — REAL-WORLD LAUNCH ROADMAP (single operational launch plan)

> **Subordinate, non-duplicating.** This is the ONE launch-sequencing plan from site-public-open to a first
> real commercial pilot. It creates NO authority and NO second governance: it is subordinate to the Master
> (FICHE_01–06, FROZEN), FICHE_07 (method), `ODG_MASTER_ROADMAP.md` (resumption/selector), the Runtime
> Constitution, CTO Directives and ROADMAP.json. It **references** detail rather than recopying it:
> config/VPS/probe → `LAUNCH_READINESS.md`; pilot → `FIRST_SUPERVISED_COMMERCIAL_PILOT_RUNSHEET.md`; email →
> `EMAIL_INTAKE_SETUP.md`; capability truth → `ODG_PHASE_A_INVENTORY.md`; contracts → `ODG_SHARED_CONTRACTS_MAP.md`;
> defects → `ODG_DEFECT_REGISTER.md`; decisions → `ODG_DECISION_CHANGELOG.md`.
> Phase order ≠ authorization (DEC-003). Finance FROZEN @P2.3 (DEC-006) — out of scope here. 9 primitives,
> no 10th. PRESERVE SEMANTICS; COMPRESS MECHANISMS. **Absence of evidence = NOT PROVEN, never READY.**
>
> Baseline at authoring: HEAD=origin/main=`082f467`, clean; `odg verify` RC=0; `odg diagnose` RC=0.

## Evidence legend
`PROVEN` (test run this session), `PROVEN LIVE` (real external op observed), `NOT PROVEN`, `BLOCKED BY RESOURCE`
(needs a credential/account/host), `BLOCKED BY POLICY` (needs human/legal authorization), `DEFERRED` (design, out of current scope).

## Per-mission procedure (all missions)
Every mission below runs the FICHE_07 chain: `TRUTH LOCK → INSPECT → REPRODUCE → MEASURE → LOCALIZE → CLASSIFY →
PROVE ROOT CAUSE → MINIMAL CHANGE → BUILD → TEST → REGRESSION → RUNTIME VERIFY → EVIDENCE → COMMIT → CHECKPOINT →
ONE NEXT AUTHORIZED ACTION`. Declare the write-set before editing; no fiches/Master/architecture change; stop at
any human gate. Record evidence via carnet + `ODG_DECISION_CHANGELOG.md` + `odg verify`.

---

## PHASE A — Truth lock & reconciliation — **DONE (PROVEN this session)**
Governance reconciled (DEC-001..007, OD-1/OD-2 closed); APEX A/B1/C/D done/closed; DEF-005 resolved; `odg
verify`/`diagnose` RC=0; published to origin/main. No mission open here. (Ref: `ODG_DECISION_CHANGELOG.md`.)

## PHASE B — Local technical readiness (Claude-executable, no external dep)
| ID | Objective | Observed/evidence | Priority | Write-set | Acceptance | Stop / human gate |
|---|---|---|---|---|---|---|
| RWL-B1 | End-to-end governed commercial chain proof (intake→qualify→quote→mission→delivery→invoice→payment) | **PROVEN** `commercial-journey.test.js` 19 (local, mocks) — INTEGRATION_VERIFIED local | P2 (covered) | — (regression gate only) | — |
| RWL-B2 | Site critical paths (`/site/*`, `POST /api/intake`): method/ctype/size/traversal/validation/errors | **PROVEN** `intake-route` 7, `site-serving` 5, `intake-endpoint` 8 | P2 (covered) | — | — |
| RWL-B3 | Persistence integrity + collision-safe ids (mono-instance) + fail-closed store | **PROVEN** `deployment-readiness` 9; **DEF-011 multi-instance = DEFERRED** | P1 | — (mono done); multi-instance deferred | multi-instance needs design decision |
| RWL-B4 | Data retention / backup / restore procedure for the intake store | **DONE / PROVEN (local)** — `client-store-backup.js` (read-only backup, verify, integrity-restore) + `client-store-backup.test.js` 12/12 (round-trip byte-identical, tamper/corrupt/non-empty-target fail-closed, source not mutated, no secret); procedure in `LAUNCH_READINESS.md`. **Retention/deletion NOT implemented** (no contract) ⇒ human policy RWL-D2 | P1 | `runtime/core/client-store-backup.js` + test; `LAUNCH_READINESS.md` | tested non-destructive export/restore + documented procedure | none (local); retention policy = human (RWL-D2) |
| RWL-B5 | Observability / incident runbook (health, diagnose, alert thresholds, rollback) | **DONE / PROVEN (local)** — `ODG_INCIDENT_RUNBOOK.md`: each signal tied to a real command with observed exit codes (`odg verify`/`diagnose`/`health`/`client launch`); severities, diagnose→contain→recover→verify, rollback/resume, evidence/no-secret, host-dependent thresholds marked **À DÉFINIR** (owner/dependency). No new primitive | **P1** | new runbook doc (`ODG_INCIDENT_RUNBOOK.md`) | signals/severities/incident+rollback steps each tied to a real command | none; numeric SLO thresholds = human/host (RWL-C/E) |
| RWL-B6 | DEF-010 TOCTOU hardening (open-fd read) in delivery packager | **NOT PROVEN** (theoretical, not reproduced) | P2 | `pilot-delivery-packager.js` + test | reproduce-or-classify; minimal fd-read only if a concrete failure is shown | none |
| RWL-B7 | Residual artifact hygiene (stale `mission-context/decision/execution-plan.json`) | harmless residue (gitignored); not divergence-driving | P2 | — (gitignored cleanup) | `odg diagnose` RC=0 preserved; control untouched | none |

## PHASE C — External providers & dependencies (interfaces local; live = human)
For each: interface/contract EXISTS and config is fail-closed (PROVEN local); live = NOT PROVEN until a human
supplies credentials. Config detail → `LAUNCH_READINESS.md`.
| ID | Provider | Interface (existing) | Local status | Live status | Human input required |
|---|---|---|---|---|---|
| RWL-C1 | Hosting / VPS (same-origin Next app) | `src/app/*`, `src/app/api/intake`, `src/app/site/[...slug]` | PROVEN (build + routes) | **BLOCKED BY RESOURCE** (no host) | provision a mono-instance VPS |
| RWL-C2 | Domain / DNS / TLS | n/a (host-level) | — | **BLOCKED BY RESOURCE** | domain + TLS cert |
| RWL-C3 | Email IMAP/SMTP | `email-gateway.js` (injected, fail-closed) | PROVEN 18 (mocks); send OFF | **NOT CONFIGURED** (DEF-008) | IMAP/SMTP creds in env; `EMAIL_SEND_ENABLED` + grant to send |
| RWL-C4 | Payments | `payments.js` (HMAC webhook, idempotent) | PROVEN 14; TEST_MODE | **NOT CONFIGURED** | provider + `PAYMENT_WEBHOOK_SECRET`; live only with `PAYMENT_LIVE_ENABLED=1` |
| RWL-C5 | Persistent store | `client-intake.storeState` (`ODG_CLIENT_STORE`) | PROVEN (config/prod-block) | **BLOCKED BY RESOURCE** | writable persistent path on host |

## PHASE D — Security, data & compliance
| ID | Objective | Observed | Priority | Human/legal gate |
|---|---|---|---|---|
| RWL-D1 | Secrets via env only, min permissions, no secret in logs/persistence | PARTIAL-PROVEN (connector/intake/paper tests assert no-secret-persist) | P1 | — (local audit extends coverage) |
| RWL-D2 | Data protection / retention / deletion / access control (personal data from intake) | **NOT PROVEN** (no retention/deletion policy) | **P1** | policy decision = human |
| RWL-D3 | French invoicing legal: mandatory mentions, SIREN/VAT, **e-invoicing/Factur-X** | **BLOCKED BY POLICY** (DEF-009) — engine computes amounts only, certifies NO compliance | P0-for-invoicing | **human/accountant/lawyer sign-off** (mandatory before real issuance) |
| RWL-D4 | Payment/refund/error terms | NOT PROVEN | P1 | human (terms) |

## PHASE E — Preproduction & end-to-end proof (needs a host)
| ID | Objective | Status | Gate |
|---|---|---|---|
| RWL-E1 | Isolated preprod deploy + post-deploy probe (`LAUNCH_READINESS.md` §VPS curl probe + `odg client launch`), error/recovery, independent evidence, rollback test | **BLOCKED BY RESOURCE** (DEF-012: reachability never asserted by repo) | human: deploy to preprod; run probe |

## PHASE F — Supervised commercial pilot
| ID | Objective | Status | Gate |
|---|---|---|---|
| RWL-F1 | First pilot per `FIRST_SUPERVISED_COMMERCIAL_PILOT_RUNSHEET.md`: real qualified client + written scope + measurable acceptance; delivery via governed packager; human validations | **BLOCKED BY RESOURCE/POLICY** (no client; human-brokered) | human: supply client+scope; approve offer/price/handoff/invoice/payment/closure |

## PHASE G — Public-open authorization gate (evidence-based)
| ID | Objective | Status | Gate |
|---|---|---|---|
| RWL-G1 | Final launch gate: no unresolved critical defect in scope; critical paths e2e-verified; prod config validated; security/restore verified; integrations-actually-used tested with evidence; legal reviewed by owners; observability/alerts/rollback ready; costs/deps documented; residual limits explicitly accepted; **explicit human open authorization** | **NOT PROVEN** (depends on B–F) | **human authorization** — absence of evidence = NOT PROVEN, never READY |

## PHASE H — Verified Autonomy & Trust Program (tracks A–L)
> Trust/autonomy track, consolidated here (not a 2nd roadmap). **References** existing docs/tests; does NOT
> duplicate §G-APEX of `ODG_MASTER_ROADMAP.md` nor the commercial phases above. Status ∈ legend. No new primitive.
| Track | Objective | Status (honest) | Evidence / reference | Next gate |
|---|---|---|---|---|
| A | Repo truth & inventory | **PROVEN** | Truth Lock this session (HEAD=`f88f2a1` clean); `ODG_PHASE_A_INVENTORY.md`; master §D state index | — |
| B | Demonstrated defects, source repairs | **PARTIAL** | `ODG_DEFECT_REGISTER.md` DEF-001..013 guarded; **DEF-014 VERIFIED** — OD-3 fix `2aa6dab` now **published in `origin/main`** (ancestor of HEAD `581d1f1`; tested LOCAL; see CHG-OD-3/CHG-OD-4) | `npm run build`/`odg verify` not re-run; live end-to-end loop NOT PROVEN |
| C | File/write/delete safety | **PARTIAL** | PROVEN: `scope-observer`, `action-gate`, `patch-executor-governance-guard`, RWL-B4 backup/restore 12/12; retention/deletion **NOT PROVEN** (RWL-D2) | human retention policy |
| D | Real provider execution chain | **PARTIAL** | links wired+tested (patch-engine `objective.patch`→patch-executor→validation→lifecycle→ledger); eng. RELEASE needs human commit; **DEF-014** blocks autonomous continue | DEF-014 + commit gate |
| E | Runtime wake-up & wiring | **PARTIAL** | PROVEN local: `odg-state`/`odg health` READY (169 caps); live **provider spawn hazard** (`runViaProvider`); VPS wake **BLOCKED BY RESOURCE** (RWL-C1) | host (RWL-C1) |
| F | Autonomy / resume / blocked-mission handling | **PARTIAL** | PROVEN: NO_RELEASE defer (D2/S4), checkpoint/resume, persistent-controller; **BLOCKED-halt = DEF-014 VERIFIED** — defer-on-BLOCKED fixed; `2aa6dab` **published in `origin/main`** (ancestor of HEAD `581d1f1`; tested LOCAL; see CHG-OD-4); live end-to-end loop NOT PROVEN | prove live end-to-end autonomy loop (still NOT PROVEN) |
| G | Evidence-based learning | **PROVEN** | APEX-B1; `capability-learning`/`patch-memory`/post-release suites; learning never self-grants (master §G.B) | — |
| H | Observability & audit | **PARTIAL** | `ODG_INCIDENT_RUNBOOK.md` (RWL-B5) PROVEN local; numeric SLO **NOT PROVEN** (needs host); cockpit NOT PROVEN | host; track I |
| I | ODG terminal cockpit | **NOT PROVEN** | audit pending (reuse existing logs/events; Ink optional; text-mode first; crypto event-chain only if justified) | design audit |
| J | Global verification & regressions | **PARTIAL** | **Historical (pre-fix capture 2026-10-09 22:52):** full 372-suite gate under PROVEN network isolation (`bwrap --unshare-net`; loopback-only, egress `ENETUNREACH`) at an earlier HEAD → **371/372 PASS**; the 1 exception `runtime/core/bash-command-governor.test.js` was **BLOCKED_BY_ISOLATION** (needs nested bubblewrap, denied inside the outer sandbox). **Later fix:** that suite was corrected by `602257a` (governed-bash fail-closed on sandbox launch failure); its **host** test now passes **52/52** (host evidence 2026-10-10). **Outstanding:** the full 372-suite gate has **NOT** been rerun at the corrected HEAD `581d1f1` — Track J is **NOT claimed 372/372**. **`npm run build` / `odg verify` still NOT run.** Artifacts: `/home/ubuntu/.cache/track-j-gate/gate-*` (historical). | rerun full 372 gate at HEAD `581d1f1`; run `odg verify`/build gate |
| K | Preproduction | **BLOCKED BY RESOURCE** | RWL-E1 / DEF-012 (no deploy performed) | host + probe |
| L | Real pilot & public open | **BLOCKED BY RESOURCE/POLICY** | RWL-F1 / RWL-G1 | human: client + open authz |

---

## Dependency order & P0 rationale
Independent, Claude-executable, high-value-now ⇒ **P1 next**: **RWL-B4** (retention/backup/restore) and
**RWL-B5** (incident runbook) — they fill real gaps with no external dependency and de-risk every later phase.
Everything that unblocks the most downstream steps (RWL-C1 host, RWL-D3 legal, RWL-F1 client) is **human/
resource-gated**, so the single highest-leverage unlock is a **CTO/human decision** to provision a host + a real
client; until then, local P1 missions proceed independently. A blocked mission never halts independent ones.

## Convergence loop (after this roadmap is accepted)
Per `ODG_MASTER_ROADMAP.md` §H: truth-lock → pick the first unsatisfied, dependency-met, non-human-gated mission
(currently RWL-B4 or RWL-B5) → run FICHE_07 → record evidence/checkpoint → continue; stop only at a real blocker
or human gate; never bypass a human gate; never edit frozen fiches/Master/architecture to ease execution.
