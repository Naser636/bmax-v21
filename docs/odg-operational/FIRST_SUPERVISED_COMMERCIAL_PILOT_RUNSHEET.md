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

---

# SELF-SALES ACTIVATION KIT

_Prepares the commercial acquisition process so a human can act immediately. HYPOTHESES are labelled; no
customer, market figure, testimonial, conversion rate, revenue or price is invented. The human owns every
external act (prospect approval, sending outreach, price approval, acceptance, handoff, invoicing, payment)._

## 1. Initial ideal-customer profile (HYPOTHESIS — validate in discovery)
Solo founders, small dev teams, or small agencies who need a **small, well-specified software or data
deliverable** and who **value proof** (passing tests + cited provenance + a reproducible build). Comfortable
with a **human-supervised** engagement. Not: open-ended staff augmentation, production on-call, or anything
requiring ODG to transact/contact third parties.

## 2. Concrete problem ODG can credibly help with TODAY (evidence-grounded)
A **bounded build/compile task** delivered with a verifiable evidence package: e.g. a data-processing or
format-conversion script, a narrow API-integration utility, a test suite for an existing module, or a
**sourced research compilation** (citations bound to real fetched provenance). Credible because ODG has
demonstrated: governed engineering missions, verification (`odg verify`), proven-only ledger, and the
read-only delivery packager.

## 3. Value proposition (no unproven claims)
"A tightly-scoped software/data deliverable, produced under a governed pipeline and handed over with a
**verifiable evidence package** — passing tests, provenance, reproducible — reviewed by you before any
handoff." Explicitly **does NOT** claim autonomous sales, billing, delivery, or hands-off production.

## 4. Recommended supervised pilot offer
- **Offer:** one fixed-scope deliverable completed in a single governed mission.
- **Bounded scope:** one authorized write-set; no external side effects by ODG; ≤ a few files.
- **Deliverable:** the artifact(s) + the packager's evidence package (`accepted:true`).
- **Acceptance:** `mission-report` SUCCESS/validated, proven ledger entry, `odg verify` RC=0,
  `packageDelivery` `accepted:true` with provenance, AND written client sign-off.
- **Evidence package:** output of `node runtime/core/pilot-delivery-packager.js <MISSION>`.

## 5. Qualification checklist (genuine buyer vs weak lead)
☐ A real decision-maker/budget owner · ☐ a concrete, written problem · ☐ scope bounded to one mission ·
☐ acceptance criteria definable up front · ☐ data/IP/legal constraints stated · ☐ no requirement for ODG
to perform external contact/transactions · ☐ willing to work human-supervised. **< 5 ticks ⇒ weak lead.**

## 6. French outreach drafts (DRAFTS ONLY — do NOT send; human approves + sends)
**(a) Premier contact**
> Objet : Un livrable logiciel cadré, livré avec preuves vérifiables
> Bonjour [Prénom], je propose la réalisation d'un livrable logiciel/données **à périmètre fixe**, remis
> avec un dossier de preuves (tests au vert, provenance des sources, build reproductible) que vous validez
> avant toute remise. Si vous avez une tâche précise en tête, seriez-vous ouvert·e à un court échange de
> 15 min pour en cadrer le périmètre ? — [Nom]

**(b) Relance**
> Objet : Suite à mon message — toujours pertinent ?
> Bonjour [Prénom], je me permets une relance brève. Si un petit livrable cadré (script, intégration,
> compilation sourcée) pourrait vous être utile, je peux vous proposer un périmètre et des critères
> d'acceptation clairs en 15 min. Sinon, dites-le moi et je n'insiste pas. — [Nom]

**(c) Réponse demandant une réunion de découverte**
> Bonjour [Prénom], merci de votre retour. Pour cadrer précisément, pourrions-nous prévoir 15–20 min ?
> J'aurais besoin de : le problème concret, le résultat attendu (« terminé = … »), et vos contraintes
> données/légales. Je reviens ensuite avec un périmètre et des critères d'acceptation écrits. — [Nom]

## 7. Discovery-meeting script + decision rule
Script (≤15 min): (1) problème concret en une phrase ; (2) définition de « terminé » ; (3) contraintes
données/IP/légales ; (4) qui valide et paie ; (5) délai souhaité. **Decision rule — ACCEPT** si : périmètre
bornable à une mission ∧ acceptation définissable ∧ aucune action externe exigée d'ODG ∧ owner humain
identifié. **REJECT/deférer** si : périmètre ouvert, besoin d'effets externes/transaction par ODG, pas de
critère d'acceptation, ou cadre réglementé non couvert.

## 8. Commercial tracking template
| Prospect | Source | Problème | Qualification (n/7) | Prochaine action | Owner humain | Statut |
|----------|--------|----------|---------------------|------------------|--------------|--------|
| …        | …      | …        | …                   | …                | …            | NEW / QUALIFYING / PILOT_SCOPED / ACCEPTED / DELIVERED / CLOSED / DROPPED |

## 9. Launch checklist (ODG-executable vs human-authorized)
**ODG-executable (prep, no external effect):** draft a bounded mission-contract template for a typical
deliverable · run dry-run discovery support · dry-run the packager on a sample proven mission · assemble the
evidence-package format.
**HUMAN-authorized (required):** approve ICP/segment · approve & **send** outreach · approve the **price** ·
run the discovery meeting · accept scope · accept the deliverable · handoff · invoice · payment · closure.

## 10. Next three commercial actions (prioritized)
1. **(HUMAN)** Approve the ICP/segment and ONE outreach draft (unblocks everything; no dependency).
2. **(HUMAN)** Send approved outreach to a real, human-owned prospect list → log in §8 tracker.
3. **(HUMAN+ODG)** Run discovery on the first responder; if ACCEPT per §7, ODG drafts the bounded mission
   scope + acceptance criteria for human price approval.

## Pricing inputs (final quote = HUMAN decision; no price invented)
Effort/complexity estimate · scope size (files/objectives) · verification & evidence overhead · number of
revision rounds · a market-rate reference the **human** supplies. ODG may produce an effort estimate; the
**price and quote are a human decision**.

## Optional technical hardening (recorded, NOT implemented here)
`content_hash` hex-format check · ledger `state` assertion · duplicate-ledger-entry policy · `accepted`
field renaming (e.g. `eligibleForHumanReview`) · open-fd read for the theoretical TOCTOU.
