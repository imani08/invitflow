# Thème de connexion InvitaFlow pour Keycloak

Le thème `invitaflow` cible Keycloak 26.7.4 et hérite de `keycloak.v2`. Il ne remplace aucun template de formulaire : les étapes OIDC, les champs, les erreurs, MFA, WebAuthn et les actions requises restent fournis par Keycloak.

## Activation locale

Compose monte automatiquement ce dossier dans `/opt/keycloak/themes`. Le realm neuf `invitaflow-dev` sélectionne le thème via `loginTheme` dans `realm-export.json`. Redémarrer Keycloak après un changement de thème pour forcer le rechargement des ressources.

Les realms déjà enregistrés dans le volume `keycloak_data` ne sont pas remplacés par `--import-realm`. Pour un tel realm, sélectionner `invitaflow` dans **Realm settings → Themes → Login theme** de la console d’administration. Cette préférence est conservée dans la base du realm.

## Personnalisation

- Remplacer `login/resources/img/invitaflow-logo.png` ou `invitaflow-icon.png` par les assets officiels, en gardant leurs noms et proportions.
- Modifier couleurs, espacements et adaptation mobile dans `login/resources/css/invitaflow.css`.
- Modifier les libellés dans `login/messages/messages_fr.properties` et `messages_en.properties`.
- `theme.properties` déclare le parent Keycloak et les ressources surchargées. Éviter les templates personnalisés sauf besoin fonctionnel réel.

## Vérification

Avec Docker disponible et les variables de `.env` configurées, lancer `docker compose up -d keycloak`, puis ouvrir `http://localhost:8080/realms/invitaflow-dev/account` ou démarrer le flux de connexion Web. Pour un realm déjà persistant, choisir d’abord le thème dans la console. Contrôler aussi le parcours mot de passe oublié et les actions MFA activées. Le runtime et le rendu doivent être vérifiés dans un navigateur après le démarrage.
