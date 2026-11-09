# V12.4 — Owner Decision Dossier V2: Gate Resolution & Capability Activation (2026-11-09)

**CTO Master Directive V2 §3/§4/§11.** The 15 non-ACCEPTED register items (9 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED — the
16th, `new-language-families`, was closed to ACCEPTED). Each item re-examined per §3 (is it a *real* human blocker, or
resolvable by clarification / integration / internal dependency?). ODG prepares; the owner decides what is reserved to
them. No spending, no secrets, no exposure performed. Truth Lock `main @ e5f3390`; preservation intact.

## §3 re-examination verdict (are any resolvable internally?)

**None of the 15 is internally self-clearable** — each genuinely needs an owner action, external data/credentials, a
protected-path write, a frozen-decision ratification, or hardware/model the owner must authorize. **Maximum internal
preparation is already done** (proposals, options, mechanisms, readiness gates); what remains is the human decision.

## Per-item decision records (14-point structure, condensed)

### 1. `dashboard-tls-exposure` — BLOCKED
Objective: serve the dashboard publicly over TLS. **Decision needed:** confirm public exposure + supply hostname/TLS cert
(OWNER-EXEC). Work done: readiness gate + reverse-proxy templates + `EXPOSURE_RUNBOOK.md` (all 6 controls bar owner
confirmation). Prep remaining: none internal. Risk: public exposure of internal state if misconfigured (mitigated by
fail-closed auth). Accept ⇒ live dashboard; Refuse ⇒ stays local (current, safe). Cost: hosting/cert (owner). Alternative:
keep local-only (no cost). Artifact: readiness probe = READY. **Owner action:** decide + set `ODG_DASHBOARD_EXPOSURE_CONFIRMED=1`, run runbook.

### 2. `structured-roadmap-deps` — BLOCKED
Objective: encode inter-mission deps in the governed ROADMAP. **Decision needed:** authorize a protected-path write
(OWNER-POLICY). Work done: `ROADMAP.proposed.json` preview + dep-planner validation. **Re-examined:** the mission
contracts have **no further honest edges** (the one real edge exists) — adding any would fabricate structure. Prep
remaining: none (nothing honest to add). Accept ⇒ 1 existing edge written to the governed file; Refuse ⇒ no functional
change. Cost: 0. **Owner action:** decide whether the single-edge protected write is worth it (low value — likely decline).

### 3. `campaign-runner-systemd-activation` — BLOCKED
Objective: run the campaign runner as a systemd timer on the VPS. **Decision needed:** privileged host activation
(OWNER-EXEC). Work done: `deploy/odg-mission-runner.{service,timer}` prepared. Prep remaining: none internal (no sudo/
systemd in scope). Accept ⇒ scheduled autonomous runs; Refuse ⇒ manual/foreground only (current). Cost: 0. **Owner
action:** install/enable the unit (privileged).

### 4. `broad-it-independent-eval-set` — BLOCKED · 5. `broad-it-corpus-grow` — IN_PROGRESS
Objective: a representative, **independently-labelled** broad-IT eval set. **Decision needed:** supply external
independently-labelled data (THIRD-PARTY). **Re-examined:** `broad-it-eval.ts` stays NO_DATA because *label independence
from the evaluee* is the requirement — any corpus ODG authors is self-authored and fails `assessLabelIndependence` by
construction. Prep remaining: none (synthetic data cannot satisfy independence). Accept ⇒ broad-IT reports a MEASURED
rate; Refuse ⇒ stays honest NO_DATA. Cost: data sourcing (owner). **Owner action:** provide/authorize an external labelled set.

### 6. `p01-demand-validation` — BLOCKED
Objective: willingness-to-pay validation. **Decision needed:** authorize a lawful demand experiment (OWNER-POLICY).
Work done: `demand-experiment` + `demand-evidence` mechanisms (SIM-capable). Prep remaining: a SIM harness (never a real
signal). Accept ⇒ ≥5 real signals ⇒ DEMAND_VALIDATED; Refuse ⇒ unproven demand. Cost: experiment effort. **Owner action:**
authorize + run the experiment (real signals cannot be fabricated).

### 7. `p01-billing-sandbox` — BLOCKED
Objective: billing with a **real** provider. **Decision needed:** provide real provider credentials (THIRD-PARTY) +
enable (OWNER). Work done: `p01-billing-sandbox` SIM interface + idempotent reconcile. Prep remaining: SIM-provider tests.
Accept ⇒ live billing; Refuse ⇒ SIM only. Cost: provider fees (owner). **Owner action:** supply credentials + authorize go-live.

### 8. `p0e-audit-log-keyed-integrity` — BLOCKED
Objective: keyed-HMAC + tip-anchor audit integrity. **Decision needed:** HMAC key custody (OWNER-POLICY, no secret
invented). Work done: **mechanism proven** (keyed-HMAC + tip-anchor + NUL-fix, 20 assertions) + `AUDIT_LOG_KEY_MANAGEMENT_
OPTIONS.md` (4 options + default). Prep remaining: none (no secret fabricated). Accept ⇒ forgery-resistant chain; Refuse ⇒
keyless (current). Cost: KMS if chosen (owner). Alternative: restricted key file (no cost). **Owner action:** choose key custody + provision the key.

### 9. `adr-166-capabilities-reconciliation` — BLOCKED
Objective: resolve §115 recover-166 vs frozen DEC-V60-166-RETIREMENT. **Decision needed:** CTO ratification
(OWNER-POLICY). Work done: `ADR-166-...-PROPOSAL.md` (PROPOSED, preserves the frozen decision, recommends affirming
retirement + delivering coverage via enumerable substitutes). Prep remaining: none (ODG won't override a frozen
decision). Accept proposal ⇒ contradiction closed; Refuse ⇒ supply a canonical-166 source (the only path to literal
recovery). Cost: 0. **Owner action:** ratify the ADR (or supply the 166 source).

### 10. `historical-roadmap-excellence-28jul-recover` — BLOCKED
Objective: recover the original 28-Jul roadmap doc. **Decision needed:** supply the original source (THIRD-PARTY). Prep
remaining: none (verbatim is NOT_RECOVERABLE; ODG will not fabricate it). Cost: 0. **Owner action:** provide the source if it exists.

### 11. `eleven-profession-program-definition` · 12. `master-unified-campaign` — IN_PROGRESS
Objective: canonical 11-profession / 99-specialty definition + master unified campaign scope. **Decision needed:** CTO
establishes the canonical source + scope (OWNER-POLICY). Work done: extensive prep (`ELEVEN_PROFESSIONS_*`,
`ODG_MASTER_UNIFIED_REGISTER_V1`). **Re-examined:** the directive forbids assuming the governance D-map = the profession
map; no canonical source exists in-repo. Prep remaining: none honest (would assume forbidden equivalence). Cost: 0.
**Owner action:** establish the canonical 11-profession source + confirm campaign scope.

### 13. `golden-path-scaffolder-poc` · 14. `commercial-ops-substrate-h3` — DEFERRED
Objective: productize the O8 scaffolder PoC / build the CRM substrate. **Decision needed:** owner productization/scope
decision (OWNER-POLICY). Work done: prototype preserved (`poc/o8-golden-path`). Prep remaining: technical prototype can be
advanced; productization is the owner's. Cost: 0 internal. **Owner action:** decide whether to productize.

### 15. `p0-autonomy-measure-slice3-delegate-provenance` — DEFERRED
Objective: honest provenance for historical odg-delegate missions. **Decision needed:** authorize deeper (risky)
delegate-path work. Work done: forensic diagnosis (the "safe stamp" is unsafe; needs an execution-chain contract +
empirical smoke). Prep remaining: the deep fix is risky autonomy-pipeline surgery — deferred for sound engineering
reasons. Cost: 0. **Owner action:** authorize the deep delegate-path work (or keep deferred).

## §4/§8 — Strategic decisions (prepared, owner-reserved)

- **Pricing ratification:** per-métier proposed prices are set vs observed competitor pricing (`MARKET_INTELLIGENCE_15_METIERS`). **Owner action:** ratify.
- **R5 / CLIENT_VALIDATED:** all 15 métiers TECHNICALLY_READY; R5 needs a **real client** (contracts/billing/delivery). **Owner action:** acquire a first client.
- **Faster local model (§8, researched, no download):** qwen2.5-coder:7b Q4 CPU ≈ 8-15 tok/s (measured ~9). A **smaller
  `qwen2.5-coder:1.5B` or `:3B`** would be *faster* on CPU for the small governed repairs (lower quality — acceptable for
  simple defects); `codestral:22b` is higher-quality but needs more RAM. **Download = owner decision.** Sourced:
  artificialanalysis.ai, llm-bench.io, runaihome.com, promptquorum.com. **Owner action:** decide whether to `ollama pull`
  a smaller model (faster) and/or a larger one (higher quality) — a tradeoff, no cost, but a download decision.
- **Accelerator hardware:** a GPU would raise inference to ~20-30+ tok/s — **purchase = owner decision** (none requested here).

## Honest conclusion

The 15 dependencies + the strategic decisions are **fully prepared**: proposals, options, mechanisms, readiness gates,
and sourced research are in place. **Every remaining step is a human decision or an external input** — ODG has driven each
to its last non-privileged point and will not fabricate the missing human act. On any owner action, ODG runs the item's
resume test and flips it to ACCEPTED with evidence.
