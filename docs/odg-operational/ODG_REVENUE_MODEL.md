# ODG Revenue Model — Reconciliation Assurance (and shared-core offers)

**As of:** 2026-10-25 · **Status:** MODEL / PROJECTION ONLY · **Realised revenue to date: €0** (0 contacts, 0 proposals sent, 0 contracts, 0 invoices, 0 cash)

> Pipeline-stage discipline (never conflated): **hypothesis** → **buy-signal** → **qualified prospect** →
> **meeting** → **proposal sent** → **contract signed** → **invoice issued** → **cash collected**. A projection is
> not revenue. No figure below is earned money. All inputs are assumptions, flagged as such.

---

## 1. Unit economics (assumptions — to confirm)

| Input | Prudent | Central | Favorable | Note |
|-------|---------|---------|-----------|------|
| Effective day rate (delivery) | €800 | €1,000 | €1,200 | FR data/finance consulting band |
| Pilot delivery effort (person-days) | 10 | 8 | 6 | intake→config→runs→verify→review |
| Pilot delivery cost | €8,000 | €8,000 | €7,200 | rate × days |
| Pilot price (fixed) | €6,000 | €9,000 | €12,000 | § offer; central ≈ cost + margin |
| Pilot gross margin | **−€2,000** | **+€1,000** | **+€4,800** | prudent pilot can be loss-leading |
| Recurring price / month | €1,500 | €2,500 | €4,000 | managed structured reconciliation |
| Recurring delivery cost / month | €1,200 | €1,000 | €800 | automation lowers cost over time |
| Capacity (parallel delivery streams) | 1 | 1→2 | 2 | no parallelism until repeatable |

Compute cost of the implemented product is **≈ €0** (plain Node, no paid service) — delivery cost is **labour**, not infra.

## 2. Funnel conversion assumptions (illustrative — NOT observed)

These are planning assumptions, not measured rates. We have **no** funnel data yet.

| Stage | Prudent | Central | Favorable |
|-------|---------|---------|-----------|
| Qualified prospects reached (6 months) | 10 | 20 | 30 |
| → meetings (25% / 35% / 45%) | 2 | 7 | 13 |
| → proposals sent (50%) | 1 | 3 | 6 |
| → pilots signed (30% / 40% / 50%) | 0–1 | 1 | 3 |
| → recurring conversion (40% of pilots) | 0 | 0–1 | 1 |

## 3. Scenarios (6-month horizon)

**Formulas:** pilotCA = pilotsSigned × pilotPrice; recurringCA = recurringClients × monthlyPrice × monthsActive;
CA(invoiced) only counts signed+delivered; cash(collected) lags invoicing (assume 30–45 day terms).

| Metric | Prudent | Central | Favorable |
|--------|---------|---------|-----------|
| Pilots signed | 0–1 | 1 | 3 |
| Pilot CA (if signed+delivered) | €0–6,000 | €9,000 | €36,000 |
| Recurring clients (end of horizon) | 0 | 0–1 | 1–2 |
| Recurring CA (partial months) | €0 | €0–7,500 | €12,000–24,000 |
| **CA invoiced (6 mo)** | **€0–6,000** | **€9,000–16,500** | **€48,000–60,000** |
| Cash collected (lag) | €0–6,000 | €6,000–12,000 | €36,000–50,000 |
| Delivery cost | €0–8,000 | €8,000–10,000 | €22,000–30,000 |
| Acquisition cost (time, no paid ads) | own time | own time | own time |

**Honest reading:** the prudent scenario can be break-even-or-loss (a pilot priced below cost to win the first
reference). Revenue is **entirely conditional** on reaching real qualified buyers — which has **not happened** (see
`ODG_PRIVATE_BUYER_VALIDATION.md`). Nothing here is bankable until a signed contract exists.

## 4. Three-offer interaction (shared core)

Offers A (agent/workflow reliability), B (AI governance/eval assurance), C (document reconciliation) share one
engineering core (ingest/contracts/independent-verification/audit). Selling the shared capability **once** means a
pilot in any domain partly de-risks the others. But: **only C has a proven, reproducible demonstrator today**;
A and B readiness is being inventoried (see capability matrix). Do not price A/B pilots until their demonstrators
pass the same GATE 5 bar as C.

## 5. Risks & blockers to revenue

- **Access to buyers** — no verified contacts; outreach not sent (and not authorized to send).
- **Unstructured extraction gap** — many real reconciliation jobs arrive as PDFs/scans; our OCR/LLM path is
  interface-only. A prospect needing that cannot be served until it is built + verified (needs paid provider auth).
- **Capacity** — one delivery stream; a second concurrent pilot is not yet feasible.
- **Legal/admin prerequisites** — billing capacity, insurance, DPA (see `ODG_ADMIN_LEGAL_CHECKLIST_FR.md`) must be
  resolved before invoicing real clients.
- **Trust/reference** — no case study yet; first pilot likely discounted.

## 6. What would move this from projection to revenue (next real steps)

1. Source real buy-signals from public sources (web-research pass — authorized, not yet run here).
2. Qualify → book a discovery call (human/CTO decision to contact).
3. Scope a structured-data pilot, send the proposal (CTO authorization required to send).
4. Resolve billing capacity + DPA before invoicing.
5. Deliver, verify independently, invoice, collect.
