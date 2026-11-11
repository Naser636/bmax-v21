# V50 — E4 standard (métier = client-deliverable readiness)

> CTO V50 C2. **E4 = a professional, reproducible deliverable ready to PRESENT to a client — NOT a certification, NOT a sale, NOT client-validated (that is E5).** A métier is E4 only when ALL criteria below are met AND a reproducible demonstrator exists. Modules present + green tests ≠ E4.

## E4 criteria (all required)
1. **Offer & scope** clearly defined.
2. **Reproducible process** (same inputs ⇒ same result, timestamps aside).
3. **Documented inputs/outputs.**
4. **Client-readable report** (via the shared O1 layer).
5. **Traceable evidence** (via O2 → evidence-provenance; independently verifiable digest).
6. **Independent evaluation** (a controller/verifier distinct from the producer).
7. **Error & limits handling** (explicit limits + "what ODG does NOT cover").
8. **Acceptance criteria** (validation conditions stated).
9. **Delivery procedure** (how the deliverable is produced/handed over).
10. **Legal/regulatory readiness** appropriate to the métier (never "certified").

## Reuse (no duplication)
Every E4 demonstrator = (the métier's EXISTING guard/module) → a normalized MetierReport → **O1 shared-report-generator** (+ **O2 shared-evidence-wrapper** → evidence-provenance). No new report/evidence/scoring engine; no 10th primitive.

## E5 (not claimed)
E5 = proven in real client operation (deployment + paying client). **No métier is E5 (0 clients).**
