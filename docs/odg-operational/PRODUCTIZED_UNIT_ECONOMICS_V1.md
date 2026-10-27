# ODG — Productized offer: measured unit economics (V19, 2026-10-27)

V18 assumed a productized net factor of 0.56. V19 **measures** the prototype and recomputes from real numbers. **€500k
NET stays the TARGET; nothing achieved; human-hours + hourly cost are HYPOTHESIS; SASU IS/PFU simplified (expert-
comptable).** Modules: `assurance-pilot-runner` (prototype), `assurance-pilot-metrics` (suite 9), bench
`scripts/assurance-pilot-bench.ts`.

## Measurement (reproducible)
`tsx scripts/assurance-pilot-bench.ts` over synthetic 40-dependency fixtures (process.hrtime): **~0.27–0.34 ms machine
time per dossier (~3,000–3,700 runs/s)**, ~15.5 findings/run. ⇒ **the analysis (SBOM/deps/license/provenance/tests/
Art.50) costs effectively €0 in machine time.** The prototype runs reproducibly, fail-closed on bad input, with a
provenance seal + audit-chained run (assurance-pilot-runner suite 9).

## The honest correction: human time dominates, not machine
Automation makes the *analysis* free, but a SERVICE delivery still needs human scoping + interpretation + readout +
verification + report finalisation. Delivery cost = **human-hours × hourly cost** (machine ≈ €0). So V18's 0.05 delivery
rate / 0.56 net factor was **optimistic**; the MEASURED unit economics (human time included, SASU levies) are:

| price (HT) | human-hrs @ €50 | margin | **measured net factor** | net / delivery | deliveries for €500k NET |
|---|---|---|---|---|---|
| €1,500 | 7 | 77% | **0.44** | €655 | **764** |
| €3,000 | 10 | 83% | **0.48** | €1,436 | **349** |
| €8,000 | 16 | 90% | **0.53** | €4,224 | **119** |
| €15,000 | 30 | 90% | **0.53** | €7,920 | **64** |

(Measured net factor **0.44–0.53 < V18's assumed 0.56** — correction downward, honestly.)

## What this means for €500k NET
- €500k NET needs **64 (high-value €15k) to 764 (entry €1.5k) delivered engagements** in 12 months — i.e. **~5–10/month
  at high value**, which **exceeds the solo delivery ceiling (~3–4/month)**. **The free machine does NOT close the gap:
  human delivery time is the binding constraint.** ⇒ still requires a **team / subcontractors** (capacity) or a **true
  self-serve product** (below), plus volume + time.
- **True self-serve SaaS** (client runs it, human ≈ 0 per delivery) would push the net factor toward the measured
  machine cost (≈ €0 delivery) — the only path to a high net factor at scale — BUT requires product build + support +
  maintenance (a dev + opex decision, not yet done; capability question). Prototype proves the *engine* is cheap; it
  does not prove a maintainable self-serve product exists.

## Profiles compared on MEASURED cost (vs V18 assumptions)
At €8k/16h the measured net factor (0.53) is close to V18's SASU-direct (0.48) and below productized-SASU (0.56) — i.e.
**“productized service” ≠ “zero delivery cost”** until it becomes self-serve. The structural ranking holds (SASU > micro;
avoid stacking), but the productization lever only fully pays off as a **self-serve product**, not an automated service.

## €500k NET plan update (measured)
Net/delivery and deliveries-needed are now MEASURED-grounded (table above). Capacity gap: at €15k/engagement, 64
deliveries = ~5.3/month > solo 3–4 ⇒ **1–2 subcontractors** (cost + working capital) OR the self-serve product. Pipeline
to support 64 high-value signings is large (per revenue-schedule conversions) and remains **unvalidated (NO_DATA)**.
Categories kept separate: **measured** (machine cost, throughput), **hypothesis** (human-hours, hourly cost, conversions,
IS/PFU), **unknown** (real demand, real delivery hours on a live client, true self-serve feasibility).

## Next
Highest-impact remaining internal step: tighten the human-hours estimate by scripting more of the report assembly
(reduce human minutes per dossier) — re-measure, re-run metrics. Self-serve product, SASU, subcontractors, outreach =
human/dev/expert decisions. Nothing published/sent; €0.
