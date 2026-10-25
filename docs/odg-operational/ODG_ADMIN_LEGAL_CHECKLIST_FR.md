# Checklist administrative & juridique (France, B2B) — ODG

**Date :** 2026-10-25 · **Statut :** PRÉPARATION / INFORMATION — aucune démarche engagée.

> **Avertissement.** Ce document est une liste de préparation à usage interne. Il ne constitue **pas** un conseil
> juridique, fiscal ou assurantiel. Rien n'a été créé, signé, déclaré ni acheté. Chaque point marqué
> « conseil requis » doit être confirmé par un professionnel (avocat, expert-comptable, assureur). Les règles et
> seuils évoluent : **vérifier les sources officielles à jour** (service-public.fr, URSSAF, impots.gouv.fr,
> CNIL, INPI) avant toute action.

Légende : **[INFO]** information générale · **[À CONFIRMER]** point à vérifier sur source officielle à jour ·
**[CONSEIL]** nécessite un avis professionnel · **[CTO]** décision/engagement réservé au CTO.

---

## 1. Statut juridique & capacité à facturer

- **[CTO]** Choisir/confirmer la structure permettant de facturer en B2B (micro-entreprise, EURL/SASU, société
  existante…). *Aucune entité n'est créée par ODG.*
- **[À CONFIRMER]** Immatriculation (guichet unique INPI depuis 2023) → obtention SIREN/SIRET.
- **[INFO]** Sans structure immatriculée, pas de facturation légale possible : prérequis à tout encaissement.
- **[CONSEIL]** Choix de structure = arbitrage fiscalité/charges/responsabilité → expert-comptable.

## 2. TVA & facturation

- **[À CONFIRMER]** Régime de TVA applicable (franchise en base vs réel) selon la structure et les seuils de
  chiffre d'affaires **en vigueur** — à vérifier sur impots.gouv.fr (seuils susceptibles d'évoluer).
- **[INFO]** Mentions légales obligatoires d'une facture : identité & SIREN, date, numéro séquentiel, description,
  quantité/prix unitaire HT, taux et montant de TVA (ou mention « TVA non applicable, art. 293 B du CGI » en
  franchise), total HT/TTC, conditions et pénalités de retard, délai de paiement.
- **[À CONFIRMER]** **Facturation électronique B2B** : calendrier d'obligation progressif en France — vérifier les
  dates d'entrée en vigueur applicables à la taille de l'entreprise sur impots.gouv.fr (ne pas présumer la date).
- **[INFO]** Numérotation continue et archivage des factures (durée légale de conservation à confirmer).

## 3. Assurance professionnelle

- **[CONSEIL]** Responsabilité civile professionnelle (RC Pro) : fortement recommandée pour une prestation de
  services numériques ; conditions et montant selon l'activité → courtier/assureur.
- **[CTO]** Souscription = engagement financier → décision CTO. *Aucune police souscrite.*

## 4. Contrat pilote & conditions

- **[CONSEIL]** Contrat de prestation (ou devis + CGV acceptées) : objet, périmètre, livrables, critères
  d'acceptation, prix & modalités, durée, propriété intellectuelle, responsabilité/limitation, confidentialité,
  réversibilité, loi applicable & juridiction.
- **[INFO]** Pour un **pilote** : bien border périmètre (données structurées uniquement), exclusions (extraction
  non structurée non implémentée), et critères d'acceptation mesurables (cf. `ODG_COMMERCIAL_OFFER.md` §3).
- **[À CONFIRMER]** Délais de paiement B2B : plafond légal (règle générale ~60 jours à confirmer) et mentions des
  pénalités de retard + indemnité forfaitaire de recouvrement.

## 5. Confidentialité & RGPD

- **[CONSEIL]** Accord de confidentialité (NDA) avant réception d'échantillons clients.
- **[INFO/CONSEIL]** Si des **données à caractère personnel** sont traitées : rôle (sous-traitant au sens RGPD le
  plus probable) → **contrat de sous-traitance (DPA, art. 28 RGPD)** obligatoire avant tout traitement réel.
- **[INFO]** Principes à respecter : base légale, minimisation, limitation de finalité et de conservation,
  sécurité, information des personnes, registre des traitements. Voir CNIL pour les modèles à jour.
- **[INFO]** Notre posture produit facilite la conformité : traitement **local/déterministe, hors-ligne, sans
  exfiltration** dans le périmètre implémenté, modèle de données minimal (`ref, date, amount`). Recommander au
  client de **pseudonymiser** l'échantillon pilote.
- **[CONSEIL]** Transferts hors UE, DPIA éventuelle : à évaluer avec un conseil si des données sensibles/volumes
  importants sont en jeu.

## 6. Sécurité & accès aux données

- **[INFO]** Prérequis avant toute mission sur données réelles : base légale + DPA signés, échantillon minimisé et
  pseudonymisé, environnement d'exécution convenu, règles de rétention/suppression, journalisation des accès.
- **[INFO]** Aucune donnée client n'est traitée tant que ces conditions ne sont pas réunies (fail-closed produit).
- **[CONSEIL]** Mesures techniques et organisationnelles (chiffrement au repos/en transit si transfert, contrôle
  d'accès) proportionnées au contrat → à formaliser.

## 7. Ce qui peut être préparé maintenant vs ce qui exige une décision

| Élément | Préparable sans engagement | Exige décision/engagement |
|---------|----------------------------|---------------------------|
| Modèles de devis/contrat/CGV | Oui (gabarits, cf. offer §7) | Signature → [CTO] |
| Modèle de facture conforme | Oui (gabarit) | Émission réelle → structure immatriculée |
| Clause RGPD / DPA | Oui (gabarit) | Signature avant données réelles → [CTO/CONSEIL] |
| NDA | Oui (gabarit) | Signature → [CTO] |
| Choix de structure | Analyse d'options | Création → [CTO/CONSEIL] |
| TVA/facturation élec. | Recensement des règles | Application → [À CONFIRMER source officielle] |
| Assurance RC Pro | Comparatif d'options | Souscription → [CTO] |

## 8. Prérequis bloquants avant tout revenu réel

1. Structure immatriculée (capacité à facturer).
2. Régime TVA & modèle de facture conformes.
3. NDA + DPA signés avant réception de données réelles.
4. (Recommandé) RC Pro.
5. Contrat pilote avec critères d'acceptation mesurables.

**Aucune de ces étapes n'est engagée par ODG.** Elles relèvent d'une décision humaine/CTO et, pour plusieurs,
d'un conseil professionnel.
