# Draft Commercial Assets + Falsification Register (Study V4, 2026-10-22)

DRAFTS only — no external contact. **Every claim matches demonstrated capability**; limits disclosed; "readiness/evidence" never "compliance/certification/guarantee." Finalize wording with legal review (`18` Stage A) before any use.

## 1. Positioning (one line)
"Reproducible, provenance-bound **software evidence** — SBOM, build-provenance, licence/dependency risk, parity & reproducibility — delivered as a fast, human-reviewed diagnostic. We produce the evidence; your experts (and ours) sign the opinion."

## 2. Capability statement (honest)
- **Proven:** CycloneDX SBOM generation; in-toto/SLSA **L1** provenance (sign+verify, tamper-evident); byte-stable reproducibility; JS/TS parity evidence; licence/dependency-risk flagging; validation with a closed false-success class (DEF-GAMMA). Demonstrated on ODG's own repo + a controlled synthetic external fixture (`CONTROLLED_FIXTURE_VERIFIED`).
- **Explicit limits:** SLSA **L2 BLOCKED** (self-signed L1 only); real external-repo proof **pending** (R2); independent human sign-off **pending** (R3); **no references yet** (R4); outputs are **readiness/evidence, not certification or a security guarantee**; not a pentest.

## 3. Pricing architecture (envisaged — NOT buyer-validated)
Land → expand. Evidence-Pack diagnostic €5–8k; standard 5-day pack €10–20k; deep €25–40k (vs tech-DD comparables $10–150k). Recurring assurance retainer €4–25k/mo. OEM/embed licensor share 20–35%. SI-subcontract effective €800–1,200/day. All ENVISAGED; a buyer has validated none.

## 4. Statement-of-Work / proposal outline (template)
Parties/scope (1 repo/product) · explicit exclusions (no certification/pentest/remediation/runtime access) · required inputs + **written read-only consent + NDA** · deliverables (`15`) · acceptance criteria (SBOM reconciles; provenance verifies; reproducible; R3 ACCEPT) · timeline (3–5d) · price + payment milestones · liability cap + insurance clause · data-handling/retention · IP (client owns findings) · readiness-not-compliance disclaimer.

## 5. Due-diligence / security response pack (for enterprise buyers)
Pre-answered: data handling (read-only clone, retention, deletion); no secret exfiltration (offline, no network egress — ODG egress is in fact BLOCKED); access scope + least privilege; evidence integrity (provenance + digests); subprocessors (none/named); the honest limits list (§2); insurance status (to be bound). Flags where ODG must still mature: SOC2/ISO (none), SLSA L2 (blocked), references (R4 pending).

## 6. Customer qualification checklist
Named budget · dated trigger (deal/CRA deadline/audit) · repo-access consent obtainable · decision-maker identified · acceptable liability frame · deliverable fits the Evidence-Pack scope. (No prospect qualified today.)

## 7. Delivery checklist
Consent + NDA signed → read-only clone → SBOM → provenance → licence/risk → reproducibility/parity → debt signal → draft memo → **R3 independent review** → client acceptance → deletion per retention terms.

## 8. Partner value proposition (OEM/SI — draft)
"Embed a reproducible, tamper-evident software-evidence engine into your assurance/DD/compliance offering; you own the client, delivery and brand; we supply the engine + updates at a 20–35% licensor share. Differentiator: provenance-bound, reproducible, false-success-guarded evidence." (Hypothesis; no partner contacted/confirmed.)

## 9. Risk / assumptions / falsification register (consolidated)
| Assumption (what must be true for €10M) | Falsifying test (cheapest) | If falsified |
|---|---|---|
| Engine runs on real external code | **R2 on a public OSS repo (€0)** | fix engine before any sale |
| A reviewer validates packs (R3) | one peer review of an R2 pack | staff/contract a reviewer |
| Buyers pay for evidence packs | first direct diagnostic close (future outreach) | reprice / re-scope offer |
| An anchor OEM/SI partner adopts+ramps in Y1 | 1 qualified partner conversation (future) | execute contingency (ceiling ~€1–3M) |
| €100k suffices to build €10M delivery | tranche-gated spend vs run-rate | seek further funding / partner-funded GTM |
| Recurring retention holds | post-first-client cohort | adjust ARR model |
**Unverified/labelled:** every price (envisaged), every partner (uncontacted), every reference (none), conversion (NOT_MEASURABLE), €10M (target, unproven). **Do not present any as validated.**

## 10. Decisions requiring human/CTO sign-off (per §14)
CTO signature: any spend (€10k/€100k tranches), contract signing, partner outreach, public deployment, insurance binding. Human legal review: SOW/liability/claim wording before first paid deal. Human technical review: R3 sign-off. ODG may execute under existing authority: internal engineering (R2 on public repo, product packaging), documentary preparation, the controlled-fixture/tests.
