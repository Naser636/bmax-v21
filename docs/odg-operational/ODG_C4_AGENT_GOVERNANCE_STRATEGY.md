# C4 — AI Agent Governance / Evidence Layer — Strategic Analysis (PREPARED; €0)

CTO V3 §2. Research + analysis only; no product built, no outreach, no spend. Labels: `OBSERVATION` (sourced) /
`ESTIMATION` / `HYPOTHÈSE` / `INCONNU`. Honest split required: what ODG has DEMONSTRATED-IN-ODG vs what is
NOT-YET-CLIENT-VALIDATED.

## Costly problem + regulatory driver (why someone pays)
`OBSERVATION` (EU AI Act guidance, 2026): high-risk obligations activate **Aug 2, 2026** (stand-alone systems pushed
to **Dec 2, 2027** via the Digital Omnibus). Autonomous-agent requirements: **append-only, exportable audit trail**
(Art. 19, ≥6-month retention), **auditable decision-logic documentation**, **structured human oversight +
intervention points**, and **stop/correct/override controls**. Non-compliance for high-risk systems carries
regulatory + liability exposure. This is a real, dated, external forcing function — not a hypothesized need.

## Buyers (who is accountable)
`OBSERVATION`: deployed AI systems route to a **business owner (Accountable)**, **technical team (Responsible)**,
**security/CISO (Consulted)**, **senior management (Informed)**; high-risk assets additionally route to **Legal +
CISO**. Most enterprises are **deployers** (apply a third-party model) and still carry significant obligations. ⇒
**Primary buyer = CISO / AI-governance / compliance / legal owners in regulated enterprises** (finance, health, gov,
critical infra). Budget sits in risk/compliance, not eng tooling — higher willingness-to-pay than dev tools.

## Competitors + pricing (primary + secondary)
`OBSERVATION`: eval/observability layer is **commoditized** — Langfuse (primary page): Hobby free / Core $29 / Pro
$199 / Enterprise $2,499/mo, OSS self-host; Arize/Braintrust/Confident AI $50–$249/mo. Governance layer: Arthur $0,
Microsoft $15/user, IBM $3,500–$6,450/mo; Datadog LLM-Obs $20–100K/yr. **90+ vendors, consolidating** (Cisco→Galileo
→Splunk, Apr 2026). **Underserved segment (`ESTIMATION`):** audit-grade, *regulator-exportable*, **no-false-success**
governance for AUTONOMOUS agents — most tools do tracing/evals/monitoring, fewer provide fail-closed admission control
+ tamper-evident evidence + an independent verification verdict as a first-class, exportable compliance artifact.

## ODG differentiation — HONEST split
**DEMONSTRATED-IN-ODG (real, this program):** evidence-gated verdicts that never pass on a green build alone
(validation-engine, no-false-success); fail-closed deny-by-default admission (action-gate, capability-authorization
human gates); tamper-evident provenance (evidence-provenance sha256/sourceCommit, mission-ledger append-only);
structured human-oversight + stop/override (governance-kernel, truth-lock); reproducible audit checkpoints (compass).
These map 1:1 onto the four EU-AI-Act autonomous-agent requirements above.
**NOT-YET-CLIENT-VALIDATED (`INCONNU`):** that an external buyer will pay for this as a product; integration with
*third-party* agent frameworks (ODG governs ITS OWN runtime, not arbitrary external agents yet); SOC2/ISO27001 posture;
multi-tenant isolation; enterprise support; that our verdict is accepted by auditors/regulators. The moat is real
internally; its *commercial* value is unproven.

## Minimal credible product (MVP) — `HYPOTHÈSE`
A "governance + evidence adapter" that wraps a customer's existing agent runtime to produce: (1) an append-only,
exportable (narrative + JSON) audit trail per agent action; (2) fail-closed admission policy with human-intervention
points; (3) an independent pass/fail verdict with tamper-evident evidence; (4) a regulator-ready documentation export
mapped to EU-AI-Act articles. Reuses ODG's validation-engine / action-gate / evidence-provenance / mission-ledger —
but requires a NEW generic ingestion boundary for third-party agents (ODG's are first-party today) = the main build.

## Integration / security / compliance requirements (gating a credible offer)
SSO/RBAC/SCIM, SOC2 + ISO27001 (table stakes — cf. Langfuse Pro/Enterprise), data residency, multi-tenant isolation,
self-host option (regulated buyers demand it), SLA + named support, legal-reviewed DPA. `INCONNU`: certification
cost/time.

## Cost + time to a credible offer — `ESTIMATION` (explicit, not a commitment)
Not a €0 move. To reach a design-partner-ready MVP: a third-party-agent ingestion boundary + export mapping +
multi-tenant hardening + a security/compliance baseline + ≥1 design partner. `ESTIMATION`: **multi-month build +
enterprise sales motion + capital**; SOC2 alone is typically months + several €10k. Long sales cycle (CISO/legal).

## Verdict (C4)
Highest ceiling (enterprise $2.5K–$100K/yr) and ODG's strongest, genuinely-differentiated moat, with a REAL dated
regulatory driver (EU AI Act) and a clear buyer (CISO/compliance). BUT it is **product-build + enterprise-GTM +
capital + certification** gated, and the commercial value is **not client-validated**. **Recommendation:** treat C4
as a tracked **strategic bet**, not a near-term execution — the next non-€0 decision is a *product+GTM+capital*
commitment, OR a single design-partner conversation (CTO-gated outreach). C1 remains the near-term, low-risk,
feasibility-proven move; C4 is the larger, slower, higher-upside option worth a deliberate CTO decision.
