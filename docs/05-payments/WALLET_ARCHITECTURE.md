# Architecture du Wallet de crédits

Version: 1.0
Status: Living document
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow
Implementation status: **IMPLEMENTED**

Wallet détient `available` et `reserved` unités de crédits et un ledger append-only. Le solde est une projection mise à jour avec l’entrée ledger dans une transaction; contrainte DB empêche solde négatif; trigger interdit update/delete ledger. Correction via reversal. Les réservations génération invitation sont consommées/libérées/settled idempotemment.

Crédits = unités d’usage. Ce n’est ni devise ni argent; ne pas afficher le wallet comme compte de paiement. L’acquisition peut dépendre d’un ordre `CREDIT_PURCHASE`, mais valeur monétaire vit dans Payment/Billing et le fournisseur.
