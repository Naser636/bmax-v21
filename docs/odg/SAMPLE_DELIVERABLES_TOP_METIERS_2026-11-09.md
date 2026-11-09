# V12.4 — Sample Deliverables for the Top Métiers (CTO Market Intelligence §3/§6, 2026-11-09)

**Concrete demonstrations produced by running ODG's real métier modules on SYNTHETIC inputs** — what a client would
actually receive. Gate-tested, reproducible (`runReferenceProject` per métier). **Synthetic, not E5** (no real client,
no live system); real engagements (pentest, certified assurance) stay owner-gated. This proves the top offers are real,
not slideware.

## P10 — Regulatory / AI-Act evidence prep (ranked #1; €1–3B FR audit wave)

Running `profession-p10-regulatory-reference.runReferenceProject()` on a synthetic AI system:
```
role classified:  PROVIDER        (via ai-act-in-force role classification)
obligation families (7): risk & quality management (proportionate to risk tier) · technical documentation &
  record-keeping · transparency / instructions for use · human oversight · accuracy/robustness/cybersecurity ·
  data governance · post-market monitoring
honesty: source-cite-or-refuse; NO certification claimed (NOT_CERTIFIED); overclaim ⇒ refused
```
**Offer:** a compliance-evidence-prep dossier (**€1,500–5,000** positioned vs DPO €6–18k/yr + RGPD €3–15k). **Demo = the
above, reproducible in-gate.** It prepares evidence; it does **not** certify (honest — certification is a notified body's act).

## P3 — Security repo-scan (ranked #3; PME budgets €15–30k/yr)

Running `profession-p3-security-reference.scanProject(syntheticProject())`:
```
findings: { licenseViolations: [], secretsFound: [], injectionVulns: [], unpinnedDeps: [], sbomPresent: true }
verdict: clean=true · severity=NONE · adversarialDetected=false
composes: license-policy + secret-patterns + injection-sanitize
honesty: SYNTHETIC project, level E2; a real pentest (E5) is owner-gated NOT_RUN
```
**Offer:** a productized repo-scan report (**€900–2,500**, below the human-audit floor via automation). **Demo = the above
scan**, which on a planted-defect synthetic repo returns the violations (the E3 adversarial case, gate-tested). It is an
automated scan, **not** a manual pentest (honest scope).

## P8 / P15 / P6 (ranked #2/#4/#5) — demonstrations

- **P8 API/E-invoicing:** `api-contract` + `einvoice*` reject malformed/DOCTYPE/ENTITY payloads and validate Factur-X
  structure (gate-tested). Offer: conformance check + integration **€1,500–6,000** (billing provider owner-gated).
- **P15 Automation/Workflow:** `profession-p15-workflow-reference.orchestrate` runs a workflow with approval gates +
  flaky/error handling (E3 missing-approval case, gate-tested). Offer: automation **€3,000–20,000**/process.
- **P6 Quality/AI-Eval:** `profession-p6-eval-reference.evaluate` + eval-significance + benchmark-contamination score a
  synthetic corpus and refuse a contaminated/insignificant result (gate-tested). Offer: eval-run report **€1,200–4,000**.

## Honest framing

Every demo runs on **synthetic data**, is **reproducible in the gate**, and carries its **own honesty note** (not E5, no
cert, synthetic). They demonstrate the **engineering capability** behind each offer — they are **not** sold deliveries and
**no client exists**. Turning a demo into a paid engagement requires the owner (contract, real input, billing, delivery).
Proposed prices are positioned vs the **observed** competitor pricing in `MARKET_INTELLIGENCE_15_METIERS_2026-11-09.md`.
