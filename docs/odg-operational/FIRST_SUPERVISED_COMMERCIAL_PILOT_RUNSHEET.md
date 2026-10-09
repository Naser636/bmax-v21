# ODG — First Supervised Commercial Pilot — Run Sheet

_Operational execution document. Creates NO authority and weakens no gate (authority order unchanged:
Master FROZEN → Runtime Constitution → CTO Directives → ROADMAP.json). Evidence vs inference is marked
throughout. Baseline at authoring: HEAD `d52ced8`, branch `main`, clean._

> **Honesty banner.** This is a RUN SHEET, not a completed pilot. ODG today can **discover** (research),
> **produce** governed code, **verify**, and **package** a proven deliverable. ODG **cannot** transact:
> customer qualification, offer, acceptance, external contact, handoff, invoicing, payment and closure are
> **human-only** and are **not** proven as autonomous capabilities. No customer, opportunity, source or
> commercial value is invented here.

## 1. Pilot objective & scope
Deliver ONE small, fixed-scope software deliverable to ONE **human-pre-qualified** client, where ODG
performs discovery-support + governed production + verification + delivery-packaging, and a human performs
every commercial/transaction step. Scope ceiling: a single bounded engineering mission (one authorized
write-set), zero external side effects by ODG.

## 2. Target customer / opportunity evidence
- **Directly verified on disk:** none. `runtime/generated/online-opportunities-report.json` (producedBy
  "ODG Runtime — Internet capability", dated **2026-07-29**) is **market-category intelligence** (e.g.
  "AI/Prompt Engineering freelancing", ranked by composite score) with real source URLs — **not** a
  qualified client, concrete scope, or booked opportunity. Treat as **historical market intel**, not a
  pilot opportunity.
- **Missing (the indispensable human input):** ONE real client identity + a concrete, written deliverable
  scope + budget/terms. ODG must not fabricate these.

## 3. Input requirements & preparation
Human provides: (a) client + concrete deliverable spec; (b) acceptance definition ("done" criteria);
(c) an explicit human authorization grant for any consequential capability the mission needs
(`grant.human === true`, mission-bound). ODG prepares: a governed mission contract for the deliverable
(authorized_paths scoped to the deliverable), dry-run research support if useful.

## 4. End-to-end workflow (qualification → delivery evidence)
1. **(HUMAN)** Qualify client + freeze scope → written brief.
2. **(HUMAN)** Issue authorization grant for the mission's consequential capabilities.
3. **(ODG)** Discovery support — governed research in **DRY_RUN** by default (zero network). LIVE research
   only if the operator kit is on (see §9); not required for production.
4. **(ODG)** Run the governed engineering mission that produces the deliverable (local route, action-gated
   apply, Validation Engine, proven-only ledger).
5. **(ODG)** Verify (`odg verify`) → build/tsc/gitClean + proven ledger entry.
6. **(ODG)** Assemble the delivery package with the promoted packager (§6) → human-reviewable, fail-closed.
7. **(HUMAN)** Review package → offer → acceptance → handoff → invoice → payment → closure.

## 5. Exact ODG components & commands to reuse (repository-grounded)
- Governed mission: `./runtime/bin/odg mission <MISSION_NAME>` (mission-cli → local route / RuntimeExecutor).
- Semantic intent (optional): `./runtime/bin/odg objective "<natural-language>"` (DRY-RUN compile);
  `--execute [--authorize '<grant>']` to run a governed mission with human authorization.
- Verify gate: `./runtime/bin/odg verify` (writes `runtime/generated/runtime-verify.json`; RC≠0 on red/dirty).
- Delivery packager (promoted `d52ced8`): `node runtime/core/pilot-delivery-packager.js <MISSION_NAME>`
  → prints the package JSON; exit 0 iff `accepted:true`.
- Authorization contract: `runtime/core/capability-authorization.js` (deny-by-default, human-grant-bound).

## 6. Deliverable definition & packager use
Deliverable = the artifacts of the proven mission's EXECUTED objectives, within `authorized_paths`, each
with verifiable provenance. `packageDelivery(mission,{cwd})` returns a frozen package: `{accepted, verdict,
ledger, deliverable[{path,sha256,provenance}], provenanceComplete, rejections[], humanAuthorizationRequired:
true, readOnly:true}`. It is **read-only**, confines evidence paths via realpath (D1 fixed), and rejects
DRY_RUN/`acquired:false` as proof of a real acquisition.

## 7. Acceptance criteria & required evidence
- Mission: `runtime/generated/mission-report.json` `{mission, status:"SUCCESS", validated:true}`.
- Ledger: proven entry for the mission (`proven:true && validated:true`).
- `odg verify` RC=0.
- Packager: `accepted:true`, `provenanceComplete:true`, ≥1 deliverable with sha256 + provenance, zero
  rejections.
- **(HUMAN)** Client written acceptance of the package.

## 8. Failure handling, rejection & rollback boundaries
- Any packager rejection code (`NOT_VALIDATED`, `NOT_PROVEN_IN_LEDGER`, `MISSING_EVIDENCE`,
  `UNVERIFIED_PROVENANCE`, `DRY_RUN_NOT_ACQUISITION`, `PATH_OUTSIDE_SCOPE`, `MISSION_IDENTITY_MISMATCH`,
  `MALFORMED_JSON`) ⇒ **STOP, do not hand off**; fix the mission, never the package.
- Red `odg verify` or unproven ledger ⇒ no delivery.
- Rollback: ODG work is local commits only; revert the mission branch/commit. No external effect to undo
  (ODG performs none).

## 9. Human-only gates (mandatory)
Customer qualification · offer · acceptance · ANY external contact · handoff/transmission · invoicing ·
payment · commercial closure — **all human**. LIVE external research also requires an **operator kit**:
provider policy `externalProvidersEnabled=true` (currently **absent/off** in
`runtime/policies/runtime-policies.json` ⇒ LIVE fails closed), a non-empty source allowlist, an injected
fetcher, and a human grant. Not needed for the production path (dry-run suffices).

## 10. Execution checklist & single next action
- [ ] (HUMAN) Provide client + concrete deliverable scope + acceptance definition.
- [ ] (HUMAN) Issue the mission authorization grant.
- [ ] (ODG) Draft + run the governed mission; `odg verify` green.
- [ ] (ODG) `node runtime/core/pilot-delivery-packager.js <MISSION>` → `accepted:true`.
- [ ] (HUMAN) Review → offer → accept → handoff → invoice → payment → closure.

**SINGLE NEXT ACTION (human):** supply ONE real qualified client and a written, bounded deliverable scope.
Everything ODG-side is operationally ready and governed; without this human input the pilot cannot and must
not start.
