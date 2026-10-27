# ODG — Prospection letters & scripts (DRAFT V1, 2026-10-27)

> **BROUILLON — NON ENVOYÉ. L'autorisation de préparer ne vaut PAS autorisation d'envoyer.** No message may be sent, no
> third party contacted, without explicit CTO authorisation + legal review. `[À COMPLÉTER]` = caller-supplied verified
> data (never invented). `[LEGAL REVIEW REQUIRED]` — some underlying legal sources were metadata-only (see register).

## A. B2B email compliance checklist (CNIL / GDPR — apply to every draft below)
MUST: identify sender (name + company + SIREN + contact); state the prospection purpose; show the offer **relates to the
recipient's profession**; disclose the **data source** (RGPD Art. 14, e.g. "votre page produit publique / votre profil
professionnel"); provide a **simple, free opt-out honoured immediately** (Art. 21(2)); target a **professional** address.
MUST NOT: contact a personal/non-professional address without consent; mask sender identity; omit opt-out; imply VAT if
under franchise; bulk-scrape in violation of platform terms. Keep a suppression list ≥3 yrs (hashed). Basis = legitimate
interest Art. 6(1)(f). *(Source: CNIL "prospection commerciale par courrier électronique", full-text 2026-10-27.)*

## B. Email template — QUALIFIÉ Art.50(2) synthetic-content cohort (e.g. niche martech/generative-media)
> Objet : Marquage AI-Act de vos contenus générés — préparation avant le 2 décembre 2026

Bonjour [RÔLE — ex. Responsable Produit],

Je suis [NOM], [ODG/BMAX — raison sociale `[À COMPLÉTER]`, SIREN `[À COMPLÉTER]`]. Je vous écris à cette adresse
professionnelle car votre page produit publique ([URL SOURCE]) indique que [PRODUIT] génère [avatars/voix/vidéo/texte]
de synthèse — contenus visés par l'**article 50(2) du règlement IA**, dont l'obligation de marquage s'applique au
**2 décembre 2026**.

Nous réalisons un **diagnostic de préparation reproductible** (transparence Art. 50, sécurité des agents selon OWASP
ASI, principes ISO 27001/42001) qui produit les **preuves** qu'un acheteur entreprise ou un contrôle réclament — en
semaines, pas en trimestre. Nous **ne délivrons pas de certification** et ne garantissons aucune conformité : nous
préparons et documentons honnêtement les écarts.

Si c'est pertinent pour [ENTREPRISE], je vous propose un échange de 20 minutes et une démonstration sur un profil
synthétique. Sinon, répondez simplement « stop » et je ne vous recontacterai pas. Données issues de [SOURCE PUBLIQUE] ;
vous disposez d'un droit d'opposition.

Cordialement, [NOM] · [COORDONNÉES] · [SIREN]

## C. Email template — QUALIFIÉ chatbot/agent cohort (Art.50(1) + agent security)
Même structure, accroche : « votre assistant [NOM] ([URL]) interagit avec vos utilisateurs — l'Art. 50(1) impose
d'informer qu'il s'agit d'une IA, et vos clients grands comptes auditent désormais la sécurité des agents (OWASP ASI). »

## D. 30-sec call script
« Bonjour [RÔLE], [NOM] de [ODG]. Vous avez ajouté [fonction IA] à [produit] — avec l'AI-Act (transparence au 2 août,
marquage du contenu synthétique au 2 décembre) et les revues de sécurité clients, beaucoup d'équipes doivent produire
des **preuves** de gouvernance. On fait un diagnostic court et reproductible, honnête sur les écarts, sans prétendre à
une certification. Est-ce un sujet chez vous en ce moment ? » → si oui : qualifier budget/décideur/échéance + proposer
démo. → si non : remercier, proposer de laisser une ressource, respecter le refus.

## E. Objections & réponses honnêtes
| Objection | Réponse |
|---|---|
| « On a déjà un DPO / c'est géré. » | « Parfait — le diagnostic complète le juridique côté **preuves techniques** (transparence, sécurité agent, traçabilité) que les audits clients réclament. » |
| « Vous certifiez ? » | « Non. La certification est l'acte d'un organisme accrédité. Nous **préparons** et documentons la préparation — c'est explicite. » |
| « Garantissez-vous la conformité ? » | « Non, aucune garantie de résultat. Nous réduisons le risque et produisons des preuves ; la conformité reste une décision externe. » |
| « C'est cher ? » | « Offre d'entrée bornée [€ HYP], périmètre et livrables fixés à l'avance, limites écrites. » |
| « Pourquoi vous ? » | « La même discipline de gouvernance est appliquée à notre propre système et **testable** (gates fail-closed, anti-sur-promesse, logs inviolables) — reproductible et honnête sur les écarts. » |

## F. Qualification / disqualification
QUALIFIE : UE, livre une fonction LLM/générative, pression Art.50 / revue sécurité, décideur joignable (fonction),
budget plausible. DISQUALIFIE (pour l'instant) : banque/entité financière lourde (DORA), besoin d'hébergement SaaS
production immédiat, >750 sal. hors régime PME, aucun budget, hors UE sans rattachement.

## G. Parcours commercial complet (lié au code)
LEAD → QUALIFIED → **PROPOSAL** (via `proposal-generator` → `proposal-pipeline.registerProposal`, fail-closed) →
**PILOT_SIGNED** (signature humaine, jamais simulée) → **INVOICED** → **CASHED** → suivi/relance. Facturation : mentions
obligatoires (SIREN, "EI", "TVA non applicable art. 293 B du CGI" si franchise, pénalités B2B + 40 €). Suivi dans
`pipeline-ledger` / `revenue-dashboard` (signé ≠ facturé ≠ encaissé, sans double comptage). Relances : J+4, J+11, J+25
puis stop (respecter toute opposition immédiatement).

## H. Statut
Tous les éléments ci-dessus sont des **brouillons personnalisables**, **non envoyés**, **[LEGAL REVIEW REQUIRED]** avant
tout usage réel. Prochaine action humaine : autoriser (ou non) l'envoi vers les prospects réels sourcés (V2).
