# Route B/C Supplier-Readiness Ladder (Study V3 §C, 2026-10-22)

What ODG must PROVE to become a credible supplier/partner on the two scale routes, and the verifiable milestone ladder from internal proof → external reference → delivery capacity → channel access. No outreach performed; no partner interest claimed.

## Public partnership entry conditions (FACT — recap from `09`/`12`)
SI/OEM programs typically require: **≥2 certified employees + ≥2 validated customer references**, annual-revenue thresholds, NDA + partner agreement, ongoing training; OEM licensor revenue-share **20–35%** (self-host source-code 10–20%). Insurance/professional-liability is commonly required for delivery engagements (exact 2026 terms per-vendor NOT public — REQUIREMENTS_UNKNOWN).

## Route B — SI / subcontracting: what ODG must prove
| Must prove | Status today | Evidence that would close it |
|---|---|---|
| Runs on a client's codebase (not just own) | **CONTROLLED_FIXTURE_VERIFIED** (f5cf850); real repo BLOCKED (consent) | R2 on a consented external repo |
| ≥2 customer references | **0** | R4 ×2 accepted engagements |
| Independent review / sign-off | spec only (R3) | a real independent reviewer validates a pack |
| Delivery capacity (concurrent) | solo+1 reviewer | reviewer/pod arrangement |
| Insurance / professional liability | none | a policy appropriate to deliverables |
| Honest assurance (no false success) | **R1 closed** (DEF-GAMMA) + fixture tamper-guard | maintained |

## Route C — OEM / embed: what ODG must prove
| Must prove | Status today | Evidence that would close it |
|---|---|---|
| Packaged, embeddable evidence engine (SDK/API) | engine proven, **not packaged** | a stable embeddable interface + docs |
| Reproducible, tamper-evident outputs a partner can trust | **fixture-verified** (SBOM+provenance+tamper+parity) | maintained + SLSA L2 (G-SLSA) |
| SLSA L2 signing (managed/keyless) | **BLOCKED** (self-signed L1) | managed signing infra |
| Multi-tenant / per-customer isolation | not demonstrated | isolation proof |
| Support + SLA | none | support model + (G8) recovery |
| Commercial terms (rev-share 20–35%) | HYP | a signed OEM agreement |

## Verifiable milestone ladder (internal → channel) — falsifiable
1. **M0 Internal engine proof** — own-repo evidence pack. ✓ DONE.
2. **M1 Controlled-fixture proof** — harness on a synthetic external repo. ✓ **CONTROLLED_FIXTURE_VERIFIED (f5cf850)**.
3. **M2 Real external-repo proof (R2)** — on a consented repo. **BLOCKED_BY_DEPENDENCY** (owner consent). Protocol/checklist in `11`.
4. **M3 Independent review (R3)** — a reviewer validates an M2 pack. Gated by M2.
5. **M4 First accepted reference (R4)** — one delivered+accepted engagement. Gated by M2+M3+consent.
6. **M5 Second reference** — reaches the ≥2-reference program bar.
7. **M6 Partner qualification** — meet SI/OEM program requirements (refs+certs+NDA+insurance).
8. **M7 First signed partner** — 1 SI subcontract OR 1 OEM embed (future-authorized outreach).
9. **M8 Channel ramp** — the $1M→$10M trajectory (Y2–3 for $10M).

**Falsifiable gates:** if M2 fails (engine can't handle real external repos) → fix engine before any sales claim. If, after authorized outreach, no partner proceeds past M7 → Route C/B scale is falsified for now → fall back to direct diagnostics (ceiling ~$1M). $10M/Y1 requires M7–M8 to occur in Year-1 with a large pre-existing channel — **not credible**; $10M is the M8 outcome in Y2–3.

## What is NOT yet true (no overclaim)
No partner contacted or interested; no external repo accessed; no reference exists; no insurance/certs; SLSA L2 blocked; $10M unproven and Y1-infeasible. M1 (controlled fixture) is the only NEW proof this cycle — real-world credibility still requires M2→M4.
