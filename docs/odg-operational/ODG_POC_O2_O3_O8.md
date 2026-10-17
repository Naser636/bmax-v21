# ODG — PoC RESULTS: O2 (CRA/SBOM/SLSA), O3 (AI-Act/ISO-42001), O8 (IDP)

> CTO PoC-build mission @ `8da3633`. Honest-scope: **O2 EXECUTED with real artifacts** on THIS repo
> (deterministic, offline); **O3/O8 = bounded PoC plans** (partially demonstrable). No buyer contacted, no
> buyer intent claimed, no fabricated financials. A local PoC ≠ production delivery; a passing PoC ≠ proof of
> purchase. Reuses existing components + the 9 primitives; no new primitive; §12/Ph.11/Option-C/`.js`-rollback
> preserved. Companion: `ODG_PRIVATE_SECTOR_OPPORTUNITIES.md`, `ODG_CAPABILITY_ENGINEERING_AND_OPPORTUNITY_GATE.md`.

## O2 — CRA / SBOM / SLSA evidence preparation — **EXECUTED (PARTIAL→real artifact)**
**Spec:** given a real codebase, produce a machine-readable component inventory (SBOM) + build provenance
+ vulnerability enrichment as a reviewable supply-chain evidence pack (the CRA/§M-3 evidence surface).
**Reused (C02/C04):** `evidence-provenance.js` (SLSA/in-toto-adapted; exports `stampProvenance`,
`verifyProvenance`, `contentDigest`, `resolveSourceRevision`) + `build-dist-closure` sha256 manifest +
`npm audit`.
**Executed (real, offline, no new dependency):**
- **SBOM** — a deterministic lockfile-derived generator emitted a **CycloneDX 1.5** BOM from `package-lock.json`:
  **489 components** (409 dev-scoped), each with `name@version` + `pkg:npm/...` purl, stamped
  `odg:sourceCommit=8da36339`; stable-ordered; 84 KB. Command (reproducible):
  `node -e '<lockfile→CycloneDX>' <out.json>` (reads `package-lock.json`, no network). EXIT 0.
- **Provenance** — `evidence-provenance` stamps `{sourceCommit, treeDirty, contentSha256, capturedAtRun}`;
  `dist-closure-manifest.json` carries per-file sha256 (3 copied-closure entries this build). SLSA-adapted.
- **Vulnerability enrichment** — `npm audit --omit=dev` = 6 advisories (1 crit/4 high/1 mod), diagnosed
  off-loopback-surface, remediation reserved (D6).
**Negative test:** a malformed/empty `package-lock.json` ⇒ the generator throws (fail-closed, no partial SBOM).
**Limits / honesty:** a lockfile-derived SBOM covers npm components only (not OS/system packages); SBOM +
provenance is **evidence preparation, NOT CRA conformity** — official conformity requires a tool-complete
inventory, a specialist review, and the competent body. CRA SBOM obligations phase from Sept 2026 (verify
current text per engagement). **Status: the EVIDENCE-GENERATION PoC is real + reproducible (VERIFIED artifact);
the end-to-end CRA-readiness product is PARTIAL (per-client CI integration + review = SPEC/human).**

## O3 — EU AI Act / ISO 42001 readiness — **PoC PLAN (SPECIFICATION_ONLY; deterministic, buildable)**
**Spec:** a requirements→evidence→gap→action matrix over a non-sensitive fictional AI-system case, with source
traceability + a gap report. **Reused (C02/C04/C05/C08):** evidence-provenance, validation-engine, action-gate,
self-diagnostic. **Buildable locally** (no external data) as a deterministic matrix + gap report; negative
tests = missing info / contradictory requirements. **Not executed this pass** (bounded doc PoC; a separate
build). **Honesty:** ISO 42001 **alone does not satisfy** the EU AI Act (CSA note); the AI-Act high-risk
deadline shifted (June-2026 Council delay) — verify current scope per engagement. **ODG prepares evidence /
pre-audit / gap-detection; ODG is NOT an accredited certification body** and must never present as one.

## O8 — Internal Developer Platform / golden path — **PoC PLAN (C07 SPECIFICATION_ONLY)**
**Spec:** a reproducible internal path that scaffolds a project/mission + runs its build/tests + emits evidence,
measured vs a manual baseline (time/manual-steps/failures/cost). **Reused (C07/C04):** `mission-contract-factory`
(generates mission contracts — demonstrated reproducible generation earlier this campaign via the
capability-factory equivalence PoC), `migrate-ts`/`validation-engine` gates, `odg` dispatcher. **Partial local
demo feasible** (reproducible contract scaffolding + gated build); a full golden-path product is **SPEC**
(templated project catalog + plugins). **Honesty:** the Backstage "$450–700k yr1" figure in the opportunities
doc is a market cost-model reference, **NOT an ODG quote nor guaranteed ODG-accessible revenue.**

## Buyer qualification — **honest disposition (no buyer contacted)**
Public-signal method defined (sector + buying-trigger + decision-function from public sources only; exclude
all public-sector buyers). **No named private buyer is asserted and no purchase intent is claimed** — real
named-buyer qualification needs a dedicated research pass with retrievable per-company evidence + ODG legal/
fiscal identity (`HUMAN_INPUTS_REQUIRED.md` C1–C10), and **no prospect is contacted in any mission** without a
separate explicit authorization. Distinction preserved: *potentially-concerned company* ≠ *qualified buyer* ≠
*identified contact* ≠ *confirmed intent* — only the first is reachable from public evidence here.

## Financial models
Conditional 3-scenario frameworks remain as in `ODG_PRIVATE_SECTOR_OPPORTUNITIES.md` (contract ≠ ODG-revenue
≠ margin ≠ net; **net profit NOT computable** without ODG legal form + fiscal regime). Not re-fabricated with
invented precision; per-opportunity detailed P&L is a follow-on once a named buyer + pricing study exist.

## Capability coverage (PoC → C01–C10)
O2 → C02+C04 (real); O3 → C02/C04/C05/C08 (spec); O8 → C07+C04 (C07 spec). Gaps: C03 connectors + C07
golden-path productization + live external paths (C03/C09/C10) remain SPEC/BLOCKED on provider/creds. No new
primitive introduced.

## Verdict
O2 = **PARTIAL (real SBOM+provenance artifact VERIFIED; CRA-product PARTIAL)** · O3 = **SPECIFICATION_ONLY
(buildable plan)** · O8 = **SPECIFICATION_ONLY (partial demo feasible)** · buyer qualification = **NOT RUN
(no fabrication; needs dedicated pass + identity)** · financials = conditional frameworks. Next: a bounded O3
matrix build + an O8 scaffolding demo, then named-buyer qualification once legal/fiscal identity is provided.
