# V12.4 — V11: ODG native selection cycle, exercised LIVE (2026-11-09)

Per V11 §1, ODG selected using its OWN canonical mechanisms (not an arbitrary provider choice). All selectors were run
live this cycle; §7 applies (no internally-executable mission) — and that conclusion is **proven by ODG's own
selection**, not asserted.

## ODG native selectors — run live, results

| Native mechanism | Result |
|---|---|
| `capability-map.buildCapabilityMap` (gaps) | **370 real capabilities, 0 gaps** (no PROPOSED register mission to build) |
| register backlog (canonical) | **15 open: 9 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED** — every one owner-gated (dossier V2, re-verified V7.1/V9/V11) |
| manifest phases | **10 PROPOSED (PHASE-1..10)** — program-level *headers* ("recognition/decomposition only, no capability executed"); 32 reuse pointers already map to BUILT modules ⇒ decomposing+executing would duplicate or fabricate |
| `odg-frontier` (Radar→Integrate→Policy→Selection→Lab+Evolution sandbox→Evidence→Decision), run live | **selected** `frontier-prop:cand:a108ed914e71670c`; ran the real governed chain; **outcome PROMOTION_REVIEW, promoted=false** — by design "the Radar **cannot self-authorize**"; requires an **EXTERNAL** authorization to promote |

**Net:** ODG's own selection terminates at an **owner/external authorization gate** on every path. That is correct
fail-closed governance (no auto-promotion, no self-authorization), NOT a defect — and I did **not** passively wait for the
weekly Radar (§7): I ran it now, and it too holds at external review.

## §7 — precise explanation (open missions / cause / technically-resolvable? / owner decision / unblock)

| Mission | Status | Why blocked (exact) | Technically resolvable by ODG alone? | Unblocking action (owner) |
|---|---|---|---|---|
| dashboard-tls-exposure | BLOCKED | needs public exposure confirm + hostname/TLS cert | No (no public exposure, no secret) | confirm + provide cert; set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1` |
| campaign-runner-systemd-activation | BLOCKED | persistent privileged/systemd go-live on a synced-main checkout | No (proven 14/14 on main; go-live is operational/owner) | enable a `--user` timer on a dedicated main checkout |
| structured-roadmap-deps | BLOCKED | protected-path write; no further *honest* edge exists | No (adding an edge would fabricate structure) | authorize the single-edge protected write (low value) |
| broad-it-independent-eval-set / corpus-grow | BLOCKED / IN_PROGRESS | requires **label-independent** external data (self-authored fails `assessLabelIndependence` by construction) | No (synthetic cannot satisfy independence) | provide/authorize an external labelled set |
| p01-demand-validation | BLOCKED | real willingness-to-pay signals (cannot be fabricated) | No (SIM harness ready) | authorize + run a lawful demand experiment |
| p01-billing-sandbox | BLOCKED | real provider credentials | No (SIM interface ready) | supply credentials + authorize go-live |
| p0e-audit-log-keyed-integrity | BLOCKED | HMAC key custody (no secret invented) | **Mechanism already DONE** (keyed-HMAC + tip-anchor, 20 assertions) — only key custody remains | choose key custody + provision the key |
| adr-166-capabilities-reconciliation | BLOCKED | contradiction vs a FROZEN decision | No (ODG won't override a frozen decision) | ratify the ADR (or supply the canonical-166 source) |
| historical-roadmap-excellence-28jul-recover | BLOCKED | original source is NOT_RECOVERABLE | No (will not fabricate verbatim) | provide the source if it exists |
| eleven-profession-program-definition | IN_PROGRESS | no canonical 11-profession source in-repo | No (would assume a forbidden D-map≡profession-map equivalence) | establish the canonical source |
| master-unified-campaign | IN_PROGRESS | CTO must set the unified scope | No | confirm campaign scope |
| golden-path-scaffolder-poc | DEFERRED | productization decision | Prototype can advance; productization is owner's | decide to productize |
| commercial-ops-substrate-h3 | DEFERRED | CRM substrate scope | Owner scope | decide to productize |
| p0-autonomy-measure-slice3-delegate-provenance | DEFERRED | deep delegate-path surgery is risky | Deferred for sound engineering reasons | authorize the deep work (or keep deferred) |

**Single most unblocking owner action:** provide ONE real external input (a label-independent eval set, OR real
demand/billing signals, OR a first client) — that converts the P-track items from SIM/NO_DATA to MEASURED and is the gate
to R5/CLIENT_VALIDATED. Everything ODG can do without a human act is already done (max internal preparation), re-verified
this cycle by running ODG's own selectors.

## Closure
No mission fabricated. ODG's selection was exercised natively + live (incl. the Radar, not passively awaited). The cycle
is recorded in the Boussole; the frontier candidate is held at PROMOTION_REVIEW for external authorization.
