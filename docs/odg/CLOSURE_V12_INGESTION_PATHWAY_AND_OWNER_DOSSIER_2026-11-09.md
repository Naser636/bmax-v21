# V12.4 — V12: External-Input Ingestion Pathway + Minimal Owner Dossier (2026-11-09)

ODG prepared EVERYTHING in its own capability; the owner is asked for ONLY the indispensable real input.

## §1 — Reconciliation (15 open ≡ 2 DÉJÀ SATISFAIT + 13 owner decisions; no id lost)
- **DÉJÀ SATISFAIT (2):** `structured-roadmap-deps` (no further honest edge), `campaign-runner-systemd-activation` (safety
  gate correct; go-live operational). **13 real owner decisions:** dashboard-tls-exposure · broad-it-independent-eval-set ·
  broad-it-corpus-grow · p01-demand-validation · p01-billing-sandbox · p0e-audit-log-keyed-integrity ·
  adr-166-capabilities-reconciliation · historical-roadmap-excellence-28jul-recover · eleven-profession-program-definition ·
  master-unified-campaign · golden-path-scaffolder-poc · commercial-ops-substrate-h3 · p0-autonomy-measure-slice3-delegate-provenance.

## §2–§3 — The MISSING wiring built: a unified ingestion gate (reuses, does not rebuild)
`runtime/core/external-input-ingestion.ts` (PURE, gate suite **#402**, 25 assertions). The per-voie mechanisms already
existed (`broad-it-eval-ingest`, `demand-evidence`, `p01-billing-sandbox`, `independent-label-policy`,
`evidence-provenance`, `audit-log`); this gate COMPOSES them into ONE path running the §3 cross-cutting controls on ANY
authorized input, BEFORE any downstream measurement:
format validation → provenance+integrity (`evidence-provenance.verifyProvenance`) → duplicate detection (content digest)
→ **REAL↔SYNTHETIC separation** → label independence (eval sets, `independent-label-policy`) → audit record → accept/reject.

**Load-bearing invariant (proven by test, §3 "ne jamais transformer une simulation en preuve réelle"):** a SYNTHETIC
input can **never** be tagged REAL; a declared-REAL input with self-authored/non-independent provenance is **REJECTED**
(never silently downgraded to a synthetic PASS); and **ONLY a REAL_ADMITTED input unblocks a register item** (synthetic
unblocks nothing). Verdicts: `REAL_ADMITTED | SYNTHETIC_ADMITTED | REJECTED`. Pure: it writes nothing, mints no key,
invents no data — the caller persists the returned `auditRecord` (to the keyed `audit-log` chain) and applies ONLY an
admitted input (rollback = do not apply a REJECTED one). Proven controls: tamper (digest mismatch) ⇒ REJECT; duplicate ⇒
REJECT; unknown kind / missing field / non-boolean declaredReal / unstamped ⇒ REJECT.

## §4 — Existing mechanisms verified present (NOT rebuilt)
- `evidence-provenance`: contentDigest/stampProvenance/verifyProvenance (sha256 + optional keyed-HMAC; keyed stamp needs
  the key — never minted). `independent-label-policy`: assessLabelIndependence + admitEvalSet (deny-by-default).
  `broad-it-eval-ingest`: the eval deep harness (runs the REAL checker vs external labels). `demand-evidence`/
  `p01-billing-sandbox`: demand/billing deep harness (SIM until real provider proof). `p0e-audit-log` keyed-HMAC +
  tip-anchor: **mechanism already complete (20 assertions)** — only key custody is owner. **None reconstructed.**

## §6 — MINIMAL OWNER DOSSIER (the only indispensable real inputs)

For each voie: the exact input, its exact format (the ingestion envelope), expected proofs, items unblocked, and the
automatic checks ODG runs on receipt (fail-closed).

### Voie A — Independent eval set  → unblocks `broad-it-independent-eval-set`, `broad-it-corpus-grow`
- **Input:** a third-party-labelled broad-IT eval set (ODG must NOT be the labeller).
- **Format (envelope):** `{ kind:"EVAL_SET", declaredReal:true, stamped: stampProvenance({ cases:[{id,partition:"dev"|"validation",language,content,label:"PASS"|"FAIL"}], provenanceDescriptor:{ author:"<third-party>", independentOfEvaluee:true, sourceRef:"<url/citation>", labellingMethod:"human-third-party|upstream-test-suite", devValidationSeparated:true } }) }`.
- **Expected proof:** a MEASURED broad-IT rate from the REAL checker run vs the external labels (confusion reported).
- **ODG auto-checks:** label independence (not self-authored), dev/validation disjoint (no leakage), provenance+integrity, dedup, then runs the deep harness. Fail ⇒ stays honest NO_DATA.

### Voie B — Real demand OR billing signals  → unblocks `p01-demand-validation` / `p01-billing-sandbox`
- **Input:** ≥5 real willingness-to-pay signals (LOI/pre-order/paid pilot) OR real provider billing transactions.
- **Format:** `{ kind:"DEMAND_SIGNAL", declaredReal:true, stamped: stampProvenance({ signals:[{kind,party,amountEur,date,evidenceRef}], provenanceDescriptor:{author,independentOfEvaluee:true,sourceRef} }) }` (or `kind:"BILLING_PROOF"` with `transactions:[...]` + a real provider reference).
- **Expected proof:** DEMAND_VALIDATED (≥5 validating-class signals) / reconciled billing with provider proof.
- **ODG auto-checks:** provenance+integrity, dedup, real-vs-synthetic (a SIM signal can NEVER validate), class assessment via `demand-evidence`.

### Voie C — First client dossier  → unblocks R5 / CLIENT_VALIDATED (all 15 métiers)
- **Input:** one real client engagement with real deliverables (contract/delivery/payment references).
- **Format:** `{ kind:"CLIENT_DOSSIER", declaredReal:true, stamped: stampProvenance({ clientRef, deliverables:[...], provenanceDescriptor:{author,independentOfEvaluee:true,sourceRef} }) }`.
- **Expected proof:** CLIENT_VALIDATED via the commercial-pipeline (SENT/SIGNED/CASHED only with provider proof — fail-closed).
- **ODG auto-checks:** provenance+integrity, dedup, real-vs-synthetic, pipeline stage proofs.

**Constraints honored:** no purchase, no payment, no client/third-party contact, no commercial/legal engagement, no new
secret, no public exposure. ODG only prepared the pathway + the exact entry points.

## §7 — Closure
`external-input-ingestion.ts` + test added to the gate (**402/402**). The ingestion pathway is proven end-to-end on
representative envelopes (admit-real / admit-synthetic / reject tampered / reject duplicate / reject self-authored-as-real).
**Still blocked (owner input):** the 3 voies above — ONE real input unblocks the P-track. No ACCEPTED/VALIDATED state was
altered artificially; no simulation was turned into real proof.
