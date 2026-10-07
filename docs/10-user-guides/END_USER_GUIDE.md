# Guide visuel de l’utilisateur InvitaFlow

Version: 1.0
Status: Living document — parcours décrits depuis le code; captures **NOT GENERATED**
Last updated: 2026-10-07
Owner: FOCUS HD ENTREPRISES
Product: InvitaFlow

Ce guide accompagne un organisateur en français. Les écrans réels n’ont pas été parcourus dans un navigateur authentifié pendant cette passe : les étapes expliquent les fonctions attestées dans le dépôt et indiquent les dépendances non confirmées. Les captures demandées ne sont pas remplacées par des maquettes. Checklist: [`screenshots/end-user/SCREENSHOT_CHECKLIST.md`](screenshots/end-user/SCREENSHOT_CHECKLIST.md).

## 1. Accéder à InvitaFlow

Ouvrez l’adresse officielle fournie par l’opérateur et vérifiez le nom de domaine avant de saisir vos renseignements.

**Résultat attendu :** l’accueil public du site.
**Attention :** le dépôt ne fournit pas une URL de production; ne choisissez pas une adresse trouvée dans un message non vérifié.
**Capture réelle : NOT GENERATED.**

## 2. Créer un compte

Choisissez l’inscription disponible dans l’écran de connexion. Utilisez une adresse email à laquelle vous avez accès et un mot de passe unique.

**Résultat attendu :** Keycloak crée un compte qui attend la vérification d’adresse.
**Capture réelle : NOT GENERATED.**

## 3. Accepter les CGU et la confidentialité

Lisez les liens légaux affichés et cochez les cases requises. La version des textes présentés et l’heure d’acceptation sont enregistrées côté serveur selon l’implémentation présente.

**Attention :** une case ne remplace pas la lecture des conditions applicables.
**Capture réelle : NOT GENERATED.**

## 4. Vérifier l’adresse email

Ouvrez le message de vérification envoyé à l’adresse utilisée et suivez son lien. Si aucun message n’arrive, vérifiez les indésirables et demandez de l’aide à FOCUS HD.

**Résultat attendu :** l’identité marque l’adresse comme vérifiée; la connexion Web exige le claim vérifié. La délivrabilité réelle reste à valider pour l’environnement utilisé.
**Capture réelle : NOT GENERATED.**

## 5. Se connecter

Retournez à l’application et authentifiez-vous dans la page Keycloak. Revenez à l’adresse de l’application après le callback.

**Attention :** si la session n’aboutit pas, ne partagez pas de code, token ou lien de connexion avec le support.
**Capture réelle : NOT GENERATED.**

## 6. Consulter l’accueil connecté

Après connexion, consultez les événements et fonctions proposés dans votre compte. Les cartes et raccourcis exacts dépendent de la version déployée.

**Résultat attendu :** une session active et des données limitées à votre compte.
[CAPTURE RÉELLE À AJOUTER — dashboard]
**Capture réelle : NOT GENERATED.**

## 7. Créer un événement

Ouvrez la section événements, lancez la création et saisissez les renseignements proposés. Vérifiez nom, date, heure et fuseau avant d’enregistrer.

**Résultat attendu :** votre événement apparaît dans votre espace si la validation réussit.
[CAPTURE RÉELLE À AJOUTER — création événement]
**Capture réelle : NOT GENERATED.**

## 8. Choisir le type d’événement

Si le formulaire propose une catégorie, choisissez celle qui correspond à votre événement. Ne sélectionnez pas une valeur qui ne décrit pas votre besoin.

**Limite :** la liste et son effet métier doivent être confirmés dans la version réellement déployée.
**Capture réelle : NOT GENERATED.**

## 9. Configurer les cérémonies

Dans l’événement, ajoutez les cérémonies disponibles et vérifiez pour chacune la date, l’heure, le fuseau et le lieu.

**Résultat attendu :** les invités et réponses peuvent être associés à la cérémonie concernée.
**Capture réelle : NOT GENERATED.**

## 10. Ajouter des invités manuellement

Ouvrez les invités de votre événement et utilisez l’action d’ajout si elle est disponible. Ne renseignez que les informations utiles à l’invitation.

**Astuce :** vérifiez l’orthographe avant la génération d’un document.
**Capture réelle : NOT GENERATED.**

## 11. Importer une liste Excel

Dans les invités, choisissez l’import de fichier et suivez les étapes de sélection, aperçu/mapping et validation proposées. Utilisez un fichier conforme au modèle accepté par la page.

**Attention :** les colonnes et limites exactes dépendent du parseur de la version installée.
[CAPTURE RÉELLE À AJOUTER — aperçu import Excel]
**Capture réelle : NOT GENERATED.**

## 12. Télécharger le modèle Excel

Si un bouton de modèle est présent sur la page d’import, téléchargez ce modèle plutôt que de supposer un format de colonnes.

**Résultat attendu :** un fichier à compléter selon les en-têtes fournis. La disponibilité de ce bouton doit être confirmée dans le navigateur.
**Capture réelle : NOT GENERATED.**

## 13. Corriger les erreurs d’import

Lisez l’aperçu et les erreurs de ligne, corrigez le fichier local, puis relancez l’import. Vérifiez le compte de lignes acceptées avant de confirmer.

**Attention :** ne téléversez pas à nouveau des données personnelles dans un outil public pour les corriger.
**Capture réelle : NOT GENERATED.**

## 14. Organiser les tables et les places

Ouvrez le placement de la cérémonie. Utilisez les tables, capacités et affectations disponibles et vérifiez les invités sans place.

**Résultat attendu :** un plan conforme aux limites présentées dans l’écran. L’expérience complète reste à valider en navigateur.
**Capture réelle : NOT GENERATED.**

## 15. Choisir ou créer un design

Choisissez un design disponible pour l’événement ou créez-en un à partir des options exposées. Relisez les textes, visuels et informations avant de continuer.

**Capture réelle : NOT GENERATED.**

## 16. Utiliser l’assistance IA

Si l’assistance éditoriale ou le compositeur de design est activé sur votre compte, soumettez une demande sans données sensibles et relisez chaque proposition avant application.

**Limite :** l’IA peut être une proposition mock déterministe ou dépendre d’un fournisseur configuré; un résultat généré n’est pas une validation factuelle.
**Capture réelle : NOT GENERATED.**

## 17. Prévisualiser l’invitation

Utilisez l’aperçu disponible et vérifiez les noms, cérémonies, horaires, lieu, réponses et éléments de design.

**Résultat attendu :** vous identifiez les corrections avant de lancer une génération consommant des crédits.
**Capture réelle : NOT GENERATED.**

## 18. Générer les invitations

Choisissez le lot et confirmez uniquement après avoir vérifié le nombre d’invitations et le coût en crédits affiché. Suivez le statut jusqu’à la fin ou consultez l’erreur donnée.

**Capture réelle : NOT GENERATED.**

## 19. Comprendre les crédits

Le Wallet mesure des **unités d’usage**. Les crédits ne sont pas de l’argent et le Wallet n’est pas un compte de dépôt.

**Résultat attendu :** le solde et les mouvements de crédits reflètent les opérations applicatives confirmées.
[CAPTURE RÉELLE À AJOUTER — Wallet]
**Capture réelle : NOT GENERATED.**

## 20. Acheter des crédits

Consultez le pack, la devise et le total avant d’ouvrir le checkout disponible. Le fournisseur réel et les moyens de paiement doivent être explicitement activés et confirmés par l’opérateur.

**Attention :** une référence EasyPay/FlexPay dans le code ne garantit pas qu’un paiement marchand fonctionne en production.
**Capture réelle : NOT GENERATED.**

## 21. Accepter les conditions de vente

Lorsque le checkout présente les CGV ou la politique de remboursement/annulation applicables, lisez les liens avant de confirmer et conservez les références de transaction.

**Limite :** ne procédez qu’avec les conditions réellement présentées par l’application et approuvées par l’opérateur.
**Capture réelle : NOT GENERATED.**

## 22. Payer

Suivez le parcours du fournisseur disponible et attendez le retour confirmé par le serveur. Ne considérez pas une page de retour du navigateur comme preuve de paiement.

**Résultat attendu :** statut de paiement confirmé côté serveur, puis crédit Wallet traité une seule fois.
[CAPTURE RÉELLE À AJOUTER — checkout sandbox]
**Capture réelle : NOT GENERATED.**

## 23. Télécharger les invitations

Lorsque le lot indique qu’un export est terminé, téléchargez les PDF individuels ou le ZIP proposés. Les exports sont privés et liés à vos droits.

**Capture réelle : NOT GENERATED.**

## 24. Répondre à une invitation (RSVP)

L’invité ouvre le lien reçu et choisit sa réponse pour la cérémonie affichée. Le lien signé donne accès au périmètre public prévu par l’invitation.

**Attention :** ne transférez pas un lien personnel si l’organisateur souhaite une réponse individuelle.
**Capture réelle : NOT GENERATED.**

## 25. Utiliser le QR

Le QR peut porter une référence signée liée à l’invitation et à la cérémonie. Gardez l’image lisible sur l’écran ou l’impression.

**Capture réelle : NOT GENERATED.**

## 26. Faire le check-in

Un membre autorisé utilise le scanner associé à l’événement et à la cérémonie. Suivez le résultat affiché; les doubles entrées sont protégées par une contrainte applicative.

**Limite :** vérifiez la cérémonie avant le scan. La compatibilité matérielle réelle reste à tester.
**Capture réelle : NOT GENERATED.**

## 27. Consulter les statistiques

Ouvrez les rapports disponibles pour l’événement et interprétez uniquement les indicateurs effectivement affichés.

**Limite :** la couverture et le contenu des statistiques varient selon la version.
**Capture réelle : NOT GENERATED.**

## 28. Gérer le profil

Depuis le compte, utilisez les champs de profil exposés et enregistrez vos changements. Ne partagez pas votre mot de passe avec l’équipe d’assistance.

**Capture réelle : NOT GENERATED.**

## 29. Contacter FOCUS HD ENTREPRISES

Pour l’assistance produit, indiquez l’adresse email de votre compte et une description de l’opération, sans joindre de token, mot de passe, QR public ou données d’invités non nécessaires.

**Email :** `fucushd098@gmail.com`
**Téléphone :** `+243973431495`

## 30. Consulter les pages légales

Les routes juridiques du site comprennent les CGU et la politique de confidentialité ainsi que les textes complémentaires disponibles. Vérifiez la version liée à votre opération.

**Attention :** le contenu publié doit être validé par conseil juridique compétent pour l’activité et le territoire concernés.
**Capture réelle : NOT GENERATED.**

## Galerie de captures attendues

La liste des 18 scènes documentaires est maintenue dans [`SCREENSHOT_CHECKLIST.md`](screenshots/end-user/SCREENSHOT_CHECKLIST.md). Aucun écran n’est simulé ou présenté comme capture réelle.
