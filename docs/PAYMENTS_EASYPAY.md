# Phase 8 — e-COM EasyPay

## État

L’adaptateur sandbox et son intégration aux parcours Payments/Gateway/Web sont implémentés. Le fournisseur reste `mock` par défaut. Aucune transaction EasyPay n’a été exécutée : les identifiants marchands sandbox et une URL IPN publique ne sont pas configurés dans l’environnement de travail. Les pages publiques d’e-COM EasyPay présentent les moyens de paiement et un formulaire d’essai, mais ne décrivent pas le contrat API utilisé ici ([site officiel](https://www.e-com-easypay.com/), [page d’essai sandbox](https://www.e-com-easypay.com/sandbox/payment/test)). Faire confirmer les points marqués « à confirmer » par EasyPay, puis les valider en sandbox avant tout changement de fournisseur.

## Configuration

Les variables Payments sont définies dans `.env.example` et `compose.yaml` :

| Variable | Valeur / règle |
| --- | --- |
| `PAYMENT_PROVIDER` | `mock` par défaut; mettre `easypay` seulement après configuration sandbox |
| `EASYPAY_ENV` | `sandbox` uniquement; l’adaptateur refuse une autre valeur |
| `EASYPAY_BASE_URL` | `https://www.e-com-easypay.com`; hôte HTTPS fixé par l’adaptateur |
| `EASYPAY_CID`, `EASYPAY_TOKEN` | Identifiants marchands; secrets côté service Payments uniquement, jamais dans le navigateur |
| `EASYPAY_IPN_URL` | URL HTTPS publique terminant exactement par `/api/payments/providers/easypay/ipn` |
| `PUBLIC_WEB_URL` | Origine Web utilisée pour composer les URLs de retour, HTTPS en environnement public |

Ne pas inscrire de valeur CID/token dans Git, les logs ou les pièces jointes. Une IPN locale `localhost` n’est pas joignable par EasyPay; configurer le tunnel ou domaine TLS côté opérateur avant un essai réel, sans exposer le service Payments interne.

## Parcours et endpoints

1. Le client authentifié choisit un pack et un canal dans Wallet. Il transmet le pack, le canal et une clé d’idempotence; le prix reste calculé depuis le devis Billing côté serveur.
2. Payments crée la commande, réserve une référence marchande aléatoire de 16 caractères hexadécimaux dans `provider_order_ref` avec contrainte d’unicité, puis appelle `POST /sandbox/payment/initialization?cid=…&token=…`. Le corps envoyé contient `order_ref`, `amount`, `currency`, `description`, les trois URLs de retour, `language`, `channels`, les informations minimales du payeur et `ipn_url`.
3. À réception d’une réponse valide contenant `reference`, le client est redirigé vers `https://www.e-com-easypay.com/sandbox/payment/initialization?reference=…`. La référence retournée est conservée en `provider_reference`; le statut brut est conservé en `provider_status`.
4. Retour navigateur : `/payments/result/success`, `/payments/result/cancel` ou `/payments/result/error`. Le libellé du retour ne prouve jamais le paiement; l’écran authentifié interroge le statut serveur.
5. Endpoint IPN public Gateway : `POST /api/payments/providers/easypay/ipn` (JSON, limite d’entrée transmise de 64 KiB), relayé vers `POST /v1/payments/providers/easypay/ipn` dans Payments. Endpoint de contrôle authentifié et owner-scoped : `GET /v1/payments/:paymentId/status`, exposé via BFF Web. Le worker Payments existant continue aussi la réconciliation périodique.

## Montant, devises et canaux

Billing est l’autorité du montant et de la devise. Le navigateur ne choisit pas le prix. Les unités mineures sont converties sans flottant en chaîne décimale à deux chiffres (par ex. 1250 → `12.50`). Seules USD et CDF sont autorisées dans cet adaptateur. **À confirmer avec EasyPay** : format montant exact attendu par l’API, règle de décimales pour CDF, et si le champ doit être chaîne ou nombre.

Le choix Wallet `CARD_ONLY`, `MOBILE_MONEY_ONLY` ou `CARD_AND_MOBILE_MONEY` se mappe aux libellés `CREDIT CARD` et/ou `MOBILE MONEY`. Langue `FR` par défaut, `EN` si explicitement définie. **À confirmer** : libellés et forme JSON exacts des canaux et langues auprès du contrat marchand.

Les clés d’idempotence de création et la contrainte unique de `provider_order_ref` empêchent de créer une nouvelle commande lors d’une répétition connue. Un timeout d’initialisation reste en `PROCESSING` avec `provider_initialization_uncertain`; il n’est pas automatiquement rejoué pour éviter une double charge. Si la réponse perdue ne contenait pas la référence EasyPay, la réconciliation automatique ne peut pas la retrouver : examiner le rapprochement marchand avant toute reprise manuelle.

## IPN, vérification et crédit Wallet

L’IPN ne fait pas confiance à son statut, montant ou devise. Elle n’extrait qu’une référence (`reference` ou `order_ref`, y compris sous `payment`/`transaction`) pour retrouver la commande. Payments appelle ensuite l’endpoint `checking-status`, compare la référence externe, `order_ref` si retourné, le montant et la devise avec la commande Billing, puis seulement passe par le traitement transactionnel partagé. Toute divergence est enregistrée en anomalie et ne crédite pas le Wallet. Les statuts inconnus restent `PROCESSING`.

Le traitement existant applique le verrouillage/transaction Payment, reçu webhook idempotent et outbox v1/v2; le crédit passe par le consumer Wallet et sa clé d’idempotence de ledger. Cela conserve les protections de double notification/crédit en place. Aucun mécanisme de signature IPN n’est codé, faute de contrat de signature documenté; la vérification serveur par checking-status et les comparaisons sont obligatoires. Ajouter une vérification de signature/anti-rejeu si EasyPay fournit son mécanisme officiel. La limitation de fréquence opérationnelle de l’endpoint public reste à valider dans le déploiement.

Les remboursements EasyPay sont volontairement indisponibles tant que leur API marchande n’est pas confirmée. Aucun code FlexPay n’a été remplacé.

## Contrat à confirmer et validation sandbox

Le chemin d’initialisation vient du brief de Phase 8. Le chemin de contrôle implémenté est `GET /sandbox/payment/{reference}/checking-status`; **la méthode GET est une hypothèse isolée dans `checkingStatus()`**, à confirmer. Confirmer également l’enveloppe JSON de chaque réponse, le champ exact de checkout URL/référence, les noms/casse des statuts, champs montant/devise, contenu et authentification IPN, et éventuelle signature/anti-rejeu. Les parseurs acceptent actuellement les objets racine, `payment` et `transaction`, sans considérer les données IPN comme preuve de paiement.

Avant la mise en service, configurer les identifiants sandbox et une URL HTTPS publique IPN, vérifier ces formes avec le marchand, tester carte et Mobile Money dans sandbox, y compris annulation/échec/expiration, notification répétée, retour navigateur falsifié, montant/devise/référence divergents, timeout d’initialisation et réconciliation. Vérifier que seul un statut serveur cohérent produit un crédit Wallet. Garder `PAYMENT_PROVIDER=mock` tant que ces essais et la configuration de production ne sont pas approuvés.

À cette reprise, tests unitaires mockés et contrôles statiques ciblés sont exécutés; aucune transaction sandbox, aucun IPN public, aucun parcours navigateur complet et aucun crédit Wallet runtime ne sont déclarés validés.
