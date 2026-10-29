# Gate-12 Decision Brief — La Porte du Soleil / F10 — 2026-10-24

ODG as sole orchestrator. **€0 spent/committed this mission.** One decision is required to advance; everything
independent of it is done and verified. Status tags are strict.

## The single decision
Authorize a **real, fail-closed, ≤€250-capped benchmark** on **5 representative shots**, plus **provision an export
tool** (ffmpeg — non-privileged, see below). ODG executes it end-to-end; no technical work goes to the CTO.

## VERIFIED (checked against the live repo this session)
- Truth Lock: HEAD `28c15a5` ≡ origin/main; clean outside `docs/` + compass; **5 stashes intact**; F7/F8/F9/F10
  present; dashboard `:3000` live; **0 media files**.
- Preparation suites: **22/22 green on re-run** (not taken on faith) — shot-list, 260 visual prompts, voice bible,
  continuity ledger (0 contradictions), 49-scene conductor, dramatic-function gate (49/49), scene transitions
  (0 contradictions), anti-slideshow, cost model, AV edit plan, runner + 4 gates + inactive adapter.
- Fail-closed controls ENFORCED by existing code (benchmark-authorization-check 21/21): paid generation BLOCKED by
  default; `BudgetLedger` refuses any cap-crossing spend; ≤8 attempts; runner dry-run stays €0 / no real media /
  real-gen BLOCKED; non-dry-run refused without explicit auth.
- Benchmark cost is **tiny**: worst-case exposure (8 attempts/shot, incl. ±5% FX and +20% VAT) = **€13.75** —
  the €250 ceiling is a hard-stop, ~18× above the realistic worst case.

## ESTIMATED (sourced + dated; NOT quotes, NOT actual costs)
- Prices observed **2026-10-24** (pricing-register): video Runway Gen-4 Turbo $0.05/s (hero Gen-4.5 $0.12/s),
  image Flux dev $0.025, FR voice ElevenLabs $0.182/1k (emotion) / Google $0.004/1k (cheapest). FX 1 USD≈€0.92.
- 5-shot benchmark: **expected €3.57 (base) / €4.50 (w/ FX+VAT)**; **worst-case €10.91 / €13.75**. Per-shot price,
  expected attempts (1/yield), failed-gens, and worst-case are itemised in `benchmark-cost-estimate-f10.json`.
- Full-film generation (prior): ~€70–140 monetary band (yield-robust), excluding human time.

## UNPROVEN (needs real media + human; cannot be asserted now)
- All visual/vocal/artistic quality; the **7.5/10** target (no real human review has occurred — none is claimed).
- **Yields** (video 0.35–0.40, still 0.55, voice 0.70) are pre-set assumptions the benchmark will MEASURE.
- The ~33 min of hold/reuse coverage reading as quality screen time.
- The **60:00±120 s** runtime — provable only by measuring a real exported file (none exists).

## BLOCKED (until authorization / capability)
- Real generation, Gate 3 (real-media quality + measured €/usable-sec), Gate 4 (real export + duration) —
  BLOCKED on explicit financial authorization.
- **Export tool:** ffmpeg/ffprobe ABSENT; no user-space fallback present. **Correction to earlier framing:** it
  does NOT need a privileged install — a non-privileged `ffmpeg-static` npm binary (or a static build to
  `~/.local/bin`) is €0, no sudo. Status BLOCKED only because provisioning (a network fetch) awaits authorization;
  it is not a system/root change.
- **Provider-enforcement caveat:** if a provider cannot technically guarantee a per-call hard stop at the
  authorized amount, that gate is BLOCKED; enforcement is then ODG-side pre-call only. **Prepaid-credit providers
  (e.g. MiniMax $1,000 min) are INELIGIBLE** for a €250-capped test — prefer true pay-as-you-go (Runway/Replicate).

## The exact ask (minimal)
1. **Financial authorization** to run the 5-shot benchmark with a hard ceiling (proposed €250; realistic worst
   case €13.75). Pre-set acceptance: identity ≥4/5, €/usable-sec ≤€1.20, human ≥7.5/10, ≤8 attempts, ledger hard-stop.
2. **Permission to provision ffmpeg non-privilegedly** (`ffmpeg-static`, €0, no sudo) for export + duration measure.
3. Expected evidence ODG returns: real files + sha256, measured yields + €/usable-sec, acceptance verdicts, a real
   60:00±120 s export passing `exportDurationGate`, and a human 7.5/10 read.

**Pipeline/test success ≠ film completion.** The film is NOT done until a real file exists, its integrity is
checked, its 60-minute duration is measured, and AV quality is validated on real media.

## Single best next action
Grant (1)+(2). On grant, ODG wires the pay-as-you-go adapter, runs the capped benchmark, and reports MEASURED
results. Absent grant, no further gate-12-independent work materially changes this decision.
