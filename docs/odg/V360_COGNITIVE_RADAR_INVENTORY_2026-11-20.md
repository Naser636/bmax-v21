# V360 PRIORITY 1 — Cognitive + Radar inventory & truth (CTO V360 §20/§23)

**Date:** 2026-11-20 · **HEAD:** `85c1c864` · **Authority:** ODG / Boussole V12.4 · **Provider:** Claude Code (bounded)

Status ladder (§23): EXISTING → CONNECTED (real non-test consumer) → OPERATIONAL (runnable: bin or `require.main`) →
MEASURED → EXPERIMENTAL → PROPOSED → BLOCKED → VERIFIED → ACCEPTED. **No capability is called OPERATIONAL on code alone.**
All statuses below are grounded in `require`-greps (consumers named) + runtime-entry checks. Canonical mechanism:
`docs/odg/v124-consolidated-roadmap.json` (directeur "V12.4", additive; programs V234–V238); protected `ROADMAP.json` untouched.
No V12.5, no second brain/Radar, no new primitive.

## Cognitive brain (runtime/core) — all EXIST

**CONNECTED + OPERATIONAL** (real consumers): `world-model` (→cognitive-decision, frontier-radar), `causal-graph`
(→rce-root-cause, cognitive-decision), `cognitive-loop`, `cognitive-decision`, `cognitive-objective-selection`,
`meta-intelligence` (**richly consumed** — 11 consumers incl. compounding-loop, calibration-trust-gate,
frontier-radar-self-improvement), `memory-architecture`, `memory-taxonomy`, `memory-trust-gate`, `compounding-loop`,
`compounding-pattern-library`, `discovery-engine`, `evolution-loop`, `odg-knowledge-acquisition`, `patch-memory`.

**Gaps (EXISTING but not CONNECTED):**
- `knowledge-engine` — **ORPHAN** (only string-label references; never `require`d).
- `learning-loop`, `cognitive-workflow-selection`, `cognitive-campaign-driver` — **self-run only** (no non-test consumer).
  The result→evidence→lesson→reuse learning loop is not wired to a live caller.

## Frontier Radar (runtime/core) — all EXIST; no orphans; all OPERATIONAL (bins/self-run)

**CONNECTED**: `frontier-radar` (heavily), `frontier-radar-store`, `frontier-lab`, `frontier-lab-experiment`,
`research-radar`, `radar-schedule`, `odg-radar-collection-adapter`, `odg-radar-source-provenance`,
`odg-radar-to-mission-loop`, `odg-radar-roadmap`, `odg-radar-video-sources`, `odg-global-opportunity-radar`,
`odg-weekly-radar-scheduler`, `odg-knowledge-acquisition`.

**Self-run only (not CONNECTED):** `frontier-radar-self-improvement` (§3.8 radar auto-evaluation), `frontier-collection`,
`frontier-weekly-report`, `radar-local-capabilities`, `radar-scenario-benchmark`, `radar-realsignal-demonstration`,
`odg-radar-gate-chain`.

### Honest verdict — external collection is **SEAM-ONLY / OWNER_GATED**
The named Radar modules perform **no autonomous network egress**: `frontier-radar.collect()` is fail-closed `AUTH_REQUIRED`
without an injected fetcher; `odg-radar-collection-adapter` → `BLOCKED` / `autonomousEgress: NOT_MEASURED` / `ownerGated:true`;
the global-opportunity/knowledge modules embed **dated, captured** WebSearch/WebFetch records (prior owner-operated runs),
not live calls. A real bounded HTTP client (`bounded-http-client.ts`, HTTPS-only + allowlist + SSRF guard) **exists** and is
wired for live egress **only** in `fr07-live-collection.ts` (self-run, no consumers). So: real bounded collection is a
**demonstrable capability but owner-gated and unwired to the canonical radar** — §3.2 live multi-source coverage is BLOCKED
on an owner-gated runtime binding, not fabricated.

## AQL (§15) — **BLOCKED / ABSENT**
`grep -rn "AQL"` across runtime/docs/scripts = **0 matches**. There is **no canonical AQL definition, formula, or scorer**.
Per §15 ("recover the canonical historical AQL definition; do not modify its meaning without owner validation") and §22
(no fabrication), AQL **cannot be recovered and must not be invented**. Nearest real construct: capability-gated
**autonomy level** (`autonomy-matrix.ts`) — not an intelligence quotient. **AQL requires an owner-provided canonical
definition before any scorer is built.**

## First improvements identified (PROPOSED → to be built + sandbox-validated)
1. **§3.8 Radar self-evaluation wiring** — connect `frontier-radar-self-improvement.assessRadarCycle` into
   `frontier-pipeline` (measure this cycle's precision/noise/miss vs supplied ground truth; PROPOSED tunings only,
   `selfAuthorized:false`; meta-intelligence anti-gaming; fail-closed NOT_MEASURED). *Closes a real connect-gap; reuses
   existing; no egress.* ← first lot.
2. **Learning-loop connect** — wire `learning-loop` (result→evidence→lesson→reuse) to a live caller.
3. **knowledge-engine** — give the orphan a real consumer or retire it.

## Blocked / owner-gated (honest, not hidden)
- AQL definition (owner).
- Live multi-source Radar egress (§3.2) — owner-gated runtime binding of `bounded-http-client`.
- Any security/permission/Truth-Lock/authority change — never self-approved (§13/§22).

*No world-superiority claim (no independent benchmark). 9 primitives, one orchestrator, one Radar, V12.4 canonical — preserved.*
