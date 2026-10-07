# Thème de connexion InvitaFlow pour Keycloak

Le thème `invitaflow` cible Keycloak 26.7.4 et hérite de `keycloak.v2`. La V1 expose uniquement le français (realm et thèmes login/email), tout en gardant l’internationalisation Keycloak activée pour permettre l’ajout de locales ultérieures. Il surcharge `register.ftl` pour ajouter le consentement juridique explicite ; les étapes OIDC, les champs du profil, les erreurs, MFA, WebAuthn, connexion et réinitialisation du mot de passe restent fournis par Keycloak et sa locale française.

## Activation locale

Compose monte automatiquement ce dossier dans `/opt/keycloak/themes`. Le realm neuf `invitaflow-dev` sélectionne le thème via `loginTheme` dans `realm-export.json`. Redémarrer Keycloak après un changement de thème pour forcer le rechargement des ressources.

Les realms déjà enregistrés dans le volume `keycloak_data` ne sont pas remplacés par `--import-realm`. Pour un tel realm, sélectionner `invitaflow` dans **Realm settings → Themes → Login theme** de la console d’administration. Cette préférence est conservée dans la base du realm.

## Acceptation légale à l’inscription

L’image Keycloak du Compose embarque le FormAction `infrastructure/keycloak/providers/invitaflow-legal-acceptance`. Au démarrage du stack, `keycloak-legal-flow-init` clone le flux d’inscription natif si nécessaire, ajoute l’exécution obligatoire après `Registration User Creation`, puis lie le realm à ce flux. La validation serveur bloque les soumissions sans la case et enregistre les versions CGU/Confidentialité `1.0` avec une date UTC générée par le serveur. Les liens légaux utilisent `PUBLIC_WEB_URL` (valeur de développement par défaut : `http://localhost:3000`).

Les realms persistants sont également mis à jour par ce bootstrap idempotent ; aucune étape manuelle dans la console n’est requise. Pour ne démarrer que le conteneur Keycloak sans le reste du stack, il faut aussi exécuter `keycloak-legal-flow-init`.

## Personnalisation

- Remplacer `login/resources/img/invitaflow-logo.png` ou `invitaflow-icon.png` par les assets officiels, en gardant leurs noms et proportions.
- Modifier couleurs, espacements et adaptation mobile dans `login/resources/css/invitaflow.css`.
- Modifier les libellés français dans `login/messages/messages_fr.properties` et `email/messages/messages_fr.properties`. Les ressources anglaises restent archivées pour une future version, mais ne sont pas proposées dans la V1.
- `theme.properties` déclare le parent Keycloak et les ressources surchargées. Éviter les templates personnalisés sauf besoin fonctionnel réel.

## Courriels de vérification et SMTP

Le thème `email` conserve les gabarits Keycloak sauf pour le courriel de vérification personnalisé ; les sujets et textes français sont dans `email/messages/messages_fr.properties`. Le délai affiché est fourni par le formateur d’expiration de Keycloak. `keycloak-email-init` active `verifyEmail`, l’email de connexion, la réinitialisation de mot de passe, interdit les doublons, rend l’attribut email requis avec validation et applique la configuration d’envoi à chaque démarrage. L’API de profil utilisateur n’est pas reconstruite : le bootstrap complète la configuration en place.

Configuration du fournisseur : local : `MAIL_PROVIDER=mailpit` ; test avec un vrai courriel : `MAIL_PROVIDER=smtp` ; production : `MAIL_PROVIDER=smtp`. Mailpit ne lit ni ne requiert les identifiants Gmail. En mode SMTP, définir `KEYCLOAK_SMTP_USER` et `KEYCLOAK_SMTP_PASSWORD` depuis l’environnement de déploiement ou un gestionnaire de secrets. Gmail est préconfiguré pour `smtp.gmail.com:587` avec STARTTLS ; utiliser un mot de passe d’application fourni par l’opérateur. Aucune valeur de mot de passe SMTP ne doit être enregistrée dans Git. Le mot de passe n’est jamais inclus dans les logs du provisionneur.

## Vérification

Avec Docker disponible et les variables de `.env` configurées, lancer `docker compose up -d keycloak`, puis ouvrir `http://localhost:8080/realms/invitaflow-dev/account` ou démarrer le flux de connexion Web. Pour un realm déjà persistant, choisir d’abord le thème dans la console. Contrôler aussi le parcours mot de passe oublié et les actions MFA activées. Le runtime et le rendu doivent être vérifiés dans un navigateur après le démarrage.
