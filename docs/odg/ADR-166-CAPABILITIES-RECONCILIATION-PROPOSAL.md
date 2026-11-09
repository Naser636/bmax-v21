# ODG-ADR (PROPOSAL) — Reconcile V12.4 §80/§115 "recover 166 capabilities" vs DEC-V60-166-RETIREMENT

**Status: PROPOSED — requires CTO ratification.** This document *prepares* the decision per the owner's maximum-unblock
delegation (§2 "préparer une proposition de décision sans falsifier l'ancien historique"; §3 "appliquer la procédure
officielle… conserver l'ancien historique"). It **does not** modify the frozen `DEC-V60-166-RETIREMENT`, and ODG does
**not** self-authorize an override. The conflict stays `BLOCKED` on a recorded CTO decision until this ADR is ratified.

## The contradiction (both sides stated faithfully)

- **V12.4 §80 / §115-P1** asks to **RECOVER the "166 capabilities."**
- **`DEC-V60-166-RETIREMENT` — ACCEPTED 2026-10-16 (CTO, V60)** retires the "166 capabilities" reference and the Roadmap
  Phase-04 canonical-coverage gate that depends on it: *it must NOT be treated as a real objective, migration counter,
  or certification; no number is substituted for 166.*

The frozen decision is preserved verbatim in `docs/odg-operational/ODG_DECISION_CHANGELOG.md` and is **not edited by
this proposal.**

## Proven facts (V54–V59 forensics, preserved)

1. The canonical set is **NON-ENUMERABLE by construction**: only the range endpoints `A01` and `A54` occur in the FROZEN
   Master (no `A02..A53`); "166" is a conceptual APPENDIX-Z heading. No machine-enumerable manifest and no
   capability→canonical mapping exist in the repo (tracked or generated).
2. A coverage/execution certification against "166" is therefore **unprovable in principle**, not merely "not yet done."
3. The runtime's historical "177 capabilities" figure is a **distinct-proven-mission-id projection** (a reporting
   tautology), never the canonical 166.

## Why ODG cannot resolve this unilaterally

V12.4 §80/§115 (roadmap intent) and `DEC-V60-166` (an ACCEPTED CTO decision) are **both authoritative sources**. Per the
V12.4 §2 truth hierarchy, a CONTRADICTION between a roadmap ask and a frozen CTO decision is resolved only by a **new,
recorded CTO decision** — not by ODG's initiative. ODG prepares; the CTO decides.

## Recommended resolution (for CTO ratification)

**Affirm `DEC-V60-166-RETIREMENT` as governing, and re-interpret §115's intent as enumerable capability COVERAGE —
not the non-enumerable canonical "166."**

- The literal "recover 166" is **unsatisfiable without a source** (no enumerable set exists; ODG will not fabricate one —
  this matches the standing "166 verbatim NOT_RECOVERABLE, never fabricate" rule).
- §115's *underlying value* — demonstrable capability coverage — is **already pursued through enumerable, real
  substitutes**: the per-category coverage definition (DEC-008 a–d, still valid), the 15 professions (P1–P15 modules),
  and the live `capability-map` (register-derived, honest maturity). These are machine-enumerable and provable, unlike
  the canonical 166.
- **Net:** keep the 166 *gate* retired; satisfy §115's intent via the existing enumerable capability inventory. No
  number is substituted for 166; no history is rewritten.

## Alternatives (for completeness)

- **(B) Override DEC-V60-166** and reinstate the 166 gate — **not recommended**: forensically unprovable (no source),
  would require fabricating an enumeration (forbidden).
- **(C) Supply an external canonical-166 source** (owner/THIRD-PARTY) — if the CTO can produce the original enumerable
  manifest, the gate becomes provable and this ADR is moot. This is the only path that makes literal "recover 166" real.

## If ratified (official procedure, history preserved)

1. The CTO records the decision in `docs/odg-operational/ODG_DECISION_CHANGELOG.md` as a new dated entry (e.g.
   `DEC-166-RECONCILED`), **citing and preserving** `DEC-V60-166-RETIREMENT` (superseded-by, never deleted).
2. V12.4 §80/§115 is annotated: "166 = retired gate; capability-coverage intent delivered via DEC-008 a–d + P1–P15 +
   capability-map (see DEC-166-RECONCILED)."
3. The register item `adr-166-capabilities-reconciliation` flips to ACCEPTED with the ratified-decision id as evidence.

Until the CTO ratifies, this remains a PROPOSAL and the item remains `BLOCKED` on that decision.
