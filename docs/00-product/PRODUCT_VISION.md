# Vision produit InvitaFlow

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

InvitaFlow est une plateforme web de préparation et de gestion d’invitations événementielles. Le dépôt implémente aujourd’hui des espaces événement, cérémonies, invités, placement, conception graphique, génération d’invitations, RSVP, QR/check-in, paiements, crédits et fonctions d’agence/partenaires à des degrés différents.

## Mission et proposition de valeur

Réunir dans un parcours web les tâches dispersées entre organisateurs : structurer un événement, gérer les participants, préparer un visuel cohérent, distribuer des invitations et suivre les réponses. Le produit vise des usages africains et internationaux, avec Kinshasa comme fuseau par défaut de certains parcours. La conception dite « African-first » est une orientation produit et de marque ; elle ne signifie pas que tous les contenus ou marchés sont déjà localisés.

## Utilisateurs

- **Organisateur individuel** : crée ses événements, invités, designs et lots d’invitations à partir de ses crédits.
- **Agence** : un espace agence, clients, membres, quotas et abonnement existent dans les modèles/contrôleurs Events ; les droits et le parcours complet restent à valider.
- **Partenaire** : attribution, commissions et modèles de payout existent dans Payments ; l’encaissement réel des commissions est incomplet.
- **Administrateur** : vues support/modération, finance et pricing sont intégrées à l’application Web et protégées par rôles. L’application `apps/admin` est un shell de navigation, pas un second backend admin.
- **Invité** : répond publiquement par lien signé à l’invitation ; certains parcours peuvent utiliser un QR.

## Modèle économique visible dans le code

Billing publie des barèmes et packs de crédits ; Payments crée des ordres et tente un checkout via un fournisseur ; Wallet conserve un solde de crédits et un ledger. Les crédits sont des unités d’usage, **pas de l’argent**. Le wallet ne détient pas de valeur monétaire.

## État du produit

Plusieurs tranches fonctionnelles sont présentes. Le README et `docs/REMAINING_WORK.md` distinguent explicitement le code disponible de sa préparation production. Runtime intégré, EasyPay/FlexPay réel, certains droits d’agence/partenaire, procédures de reprise et conformité doivent encore être vérifiés ou complétés.

## Sources du dépôt

`README.md`, `docs/REMAINING_WORK.md`, `apps/web/src/app/`, `services/*/src/`, `services/*/prisma/schema.prisma`.
