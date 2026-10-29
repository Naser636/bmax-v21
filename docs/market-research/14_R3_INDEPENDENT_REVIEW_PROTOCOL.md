# R3 — Independent Review Protocol (Study V3, 2026-10-22)

Operational protocol for the independent review that must sit between ODG's generated evidence and any client-facing opinion. **R3 is NOT completed by this document and NO reviewer sign-off is fabricated.** The mechanical layer is demonstrably executable (proven on the M1 controlled fixture, commit `f5cf850`); the human-opinion layer remains **unstaffed → BLOCKED_BY_DEPENDENCY (reviewer + engagement)**.

## Reviewer independence & decision traceability
- **Independence:** the reviewer MUST NOT be the author/generator of the evidence. Acceptable: a separate qualified human; or, for the *mechanical* layer only, a separate ODG instance re-running the harness — but the **opinion/sign-off is a human act**, never ODG's.
- **Traceability:** each review records reviewer identity, inputs reviewed (artifact digests), checks run with results, severities, decision (ACCEPT / ACCEPT-WITH-CONDITIONS / REJECT), and rationale, bound to the artifact sha256. No decision without this record.

## Per-deliverable validation criteria
| Deliverable | Validation | Reject if |
|---|---|---|
| **SBOM (CycloneDX)** | every lockfile package with a version appears; purls well-formed; malformed entries skipped not dropped-silently; component count matches lockfile | missing/extra components; counts don't reconcile |
| **Provenance (in-toto/SLSA)** | signature verifies against the public key; artifact sha256 matches subject; SBOM digest rebind matches; **tamper ⇒ verify fails** | signature invalid; digest mismatch; SBOM rebind inconsistent |
| **Reproducibility** | regenerate the SBOM → byte-identical digest (modulo declared volatile fields) | non-deterministic output |
| **Licence / dependency risk** | copyleft (GPL/AGPL/LGPL) flagged; unknown-licence surfaced; no false "all clear" | a copyleft/unknown dep unflagged |
| **Tech-debt signal** | deterministic, re-runnable; stated as a signal, not a guarantee | presented as exhaustive/authoritative |

## Unknown-licence & dependency-risk handling
Unknown or unresolved licences are **surfaced as risk, never silently passed as compliant**. Dependency risks (copyleft, abandoned, known-CVE where data exists) are listed with severity; absence of CVE data is stated as a limitation, not "no vulnerabilities."

## Blocking errors / missing evidence
Any of these ⇒ the pack cannot be ACCEPTED until resolved or explicitly accepted-with-conditions by the reviewer: invalid/absent signature; artifact-digest mismatch; non-reproducible output; unreconciled SBOM counts; a false-success symptom (empty/no-op pack presented as complete). A missing input ⇒ REJECT with the exact gap named.

## Claim limits (mandatory wording discipline)
The review output may assert **"evidence produced / readiness assessed"** only. It may **NOT** assert regulatory **compliance**, **certification**, or a **security guarantee**. CRA/AI-Act/ISO-42001 wording = "readiness input," never "conformity." Liability wording and (if delivery) insurance are prerequisites before any paid engagement.

## Mechanical-layer dry-run (authorized internal verification — already evidenced)
The M1 controlled-fixture test (`src/runtime/r2-evidence-pack-fixture.test.ts`, `f5cf850`) already executes the mechanical checks above and ALL PASS: SBOM reconciliation, provenance sign+verify+**tamper-fail**, reproducibility, dual-port parity, licence-risk flagging, false-success negatives. This is the reproducible acceptance harness a reviewer re-runs. **It is NOT a human sign-off and NOT a client validation.**

## Status
- Mechanical review layer: **EXECUTABLE / demonstrated on M1**.
- Human independent opinion + sign-off: **BLOCKED_BY_DEPENDENCY** (a qualified reviewer + a real engagement to review). Not simulated.
