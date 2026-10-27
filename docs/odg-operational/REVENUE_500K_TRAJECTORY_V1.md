# ODG — €500k gap-closure trajectory (V1, 2026-10-27)

`runtime/core/revenue-target-path.ts` (suite 8) solves what a track mix must SCALE to in order to reach the target in
**signed bookings** within the period, then reports the honest consequences. **€500k is a TARGET; conversions/prices are
HYPOTHESIS (not tuned); pipeline empty (NO_DATA).** Signed ≠ cashed ≠ net (see V17 net-cash layer).

## Result — scaling the A+B+C mix to SIGNED ≥ €500k
Base mix (A-small 40 prospects/mo @€2.5k · B 14/mo @€10k · C 7/mo @€22k+€1.5k/mo) signs ~€91k. To reach **signed €500k**:
| metric | value |
|---|---|
| scale factor | **5.49×** |
| signed bookings | €500,000 |
| **cashed within 12-month horizon** | **€447,975** (signed−cash gap €52,025 — lag) |
| total prospects / month | **~335** |
| peak signings / month | ~7 |
| solo signing ceiling | 4/mo ⇒ **~1 subcontractor needed** |
| concentration | MEDIUM |

## Honest reading
- Reaching **signed €500k** requires **5.49× the modest base** → **~335 prospects/month** and **~7 signings/month peak**,
  which **exceeds the solo delivery ceiling (4/mo) ⇒ ≥1 subcontractor + working capital.**
- **Cash within the 12-month horizon is ~€448k, below the €500k signed** (lag defers ~€52k past month 12).
- This is a **hybrid** requirement (direct volume + subcontracted delivery), not solo-achievable at the base profile.
- **Levers if real results lag:** raise contract value (fewer signings for the same signed), add partner/subcontract
  capacity, lift recurring, or improve conversion (the paid-pilot wedge). Each is HYPOTHESIS — measure, don't assume.

## Caveat (V17 supersedes the target definition)
This trajectory targets **signed** bookings. The CTO's V17 mandate redefines the objective as **€500k NET CASH collected
in 12 months** (payments received − costs/commissions/subcontract/unpaid, taxes shown separately) — a **stricter** bar:
net cash ≪ signed. See `NET_CASH_PLAN_500K_V1` for the net-cash build-up and the (larger) gap it implies.
