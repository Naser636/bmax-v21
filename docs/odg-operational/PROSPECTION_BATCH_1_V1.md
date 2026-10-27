# ODG — First prospection batch (≤5) — PREPARED, NOT SENT (V1, 2026-10-27)

CTO authorised a first capped batch of **≤5 B2B prospects**. **Status: PREPARED / NOT SENT — send channel BLOCKED**
(`GMAIL_CHANNEL_DIAGNOSTIC_V1`). Recorded in the shared `prospection-registry` (5 × PREPARED_PENDING_AUTH, **0 SENT**).
Each draft passed `prospection-compliance.validateOutreach` (email, B2B legitimate-interest). **No message sent; no
individual named; no email address invented; no need/budget/intent invented.**

## The 5 prospects (real, from FIELD_CANDIDATES_REAL_V3; real public signals)
| # | prospect | offer | real public signal (source) | role to approach (function only) | status |
|---|---|---|---|---|---|
| 1 | **PlayPlay** | C (Art.50(2) synthetic-content assurance) | synthetic avatar/voice/video product pages (playplay.com) | Head of Product / DPO | PREPARED_PENDING_AUTH |
| 2 | **iAdvize** | C (Art.50(1) transparency + agent security) | GenAI Copilot on legacy platform (productboard) | CISO / Head of Product | PREPARED_PENDING_AUTH |
| 3 | **lemlist** | C (Art.50 generated content + agent security) | multi-LLM GenAI agent (lemlist.com/product/ai) | CTO / DPO | PREPARED_PENDING_AUTH |
| 4 | **Sellsy** | A (technical audit) + C | native GenAI in CRM via Mistral (sellsy blog 2025-03) | CTO / DPO | PREPARED_PENDING_AUTH |
| 5 | **Yousign** | C (SBOM/assurance + agent security) | e-sign driveable via ChatGPT/Claude/Mistral MCP (archimag 2026-06) | CISO / CTO | PREPARED_PENDING_AUTH |
All EU, ship an LLM/generative feature, plausible Art.50/security-review pressure. **Observable need ≠ buying intent.**

## Compliance (every draft, validated)
`validateOutreach({channel:"email", ...})` = **ok** for all 5 (sender identified; purpose stated; relates to recipient's
profession; **data source disclosed** Art.14; **opt-out** Art.21(2); professional address; no masked sender; no VAT-under-
franchise implication; no bulk-scrape). Basis = GDPR Art.6(1)(f) legitimate interest (B2B).

## Draft message (template; personalised per prospect; NOT sent)
> Objet : [signal réel] — préparation de preuves techniques (périmètre limité)
> Bonjour [FONCTION], je suis [NOM], [ODG/BMAX, SIREN `[À COMPLÉTER]`]. Votre [produit/fonction IA — SIGNAL RÉEL + URL]
> relève de [Art.50 transparence / revue sécurité client]. Nous préparons un **dossier de preuves techniques à périmètre
> limité** (SBOM + provenance + revue agent, OU audit technique ciblé) — livrable honnête, **sans certification ni
> garantie**, prix indicatif non contractuel [bande marché-milieu]. Si pertinent, 20 min d'échange ? Sinon répondez
> « stop » et je ne vous recontacterai pas. Données issues de [SOURCE PUBLIQUE]; droit d'opposition. — [NOM, COORDONNÉES, SIREN]
`[À COMPLÉTER]` = caller-supplied verified data. **[LEGAL REVIEW before any send.]** One offer, limited scope, no
excessive guarantee, honest (not certified, no invented references).

## Why NOT sent (exact blockers)
1. **No authorised send channel** — Gmail SMTP NOT_CONFIGURED (`GMAIL_CHANNEL_DIAGNOSTIC_V1`); `sendResponse` fail-closed.
2. **No verified recipient professional addresses** for named functions (would need sourcing/verification — not done).
3. **Legal review** of the final letters not performed by a human.
Per mandate: drafts held, exact blockers exposed, **nothing recorded as sent** (registry proof-gated).

## Follow-up rules (no automatic relance)
No automatic follow-up sequence. On a positive reply → prepare need-qualification + pilot scope + acceptance criteria +
price + costs. On a negative reply/opt-out → record + `optOut()` (blocks future contact). Immediate opt-out honoured.

## V13 finalisation — address verification + pre-send gate
- **Recipient addresses: UNVERIFIED for all 5.** ODG did **not** verify individual professional email addresses from
  public sources (fabrication/guessing is forbidden). ⇒ all 5 prospects stay **EN ATTENTE (ADDRESS_UNVERIFIED)**.
  Sourcing a verified professional address (company contact page / legally-public info) is a human/authorised step.
- **Pre-send gate (`prospection-send-gate.preflight`, live, no send): BLOCKED** for all 5 — blockers: address unverified,
  channel not ready (`dryRun`: NOT_CONFIGURED/sendEnabled=false), no CTO authorisation. **config ≠ authorisation.**
- Clean separation (mandate §5): finalised-draft ✓ · compliance ✓ · **address ✗ · channel ✗ · authorisation ✗** ⇒ NOT sent.

## Next exact action
CTO: (a) configure the Gmail channel (`GMAIL_SECURE_SETUP_V1`) + `EMAIL_SEND_ENABLED=1`, (b) grant per-send authorisation
+ legal review, (c) provide/authorise verified recipient addresses ⇒ then `preflight` → ADMIT ⇒ ODG sends and records
each send **only** with a provider message-id proof. Until all three: drafts held, **0 sent**. €0.
