# Auto-rétablissement Docker sur Windows

Compose applique `restart: unless-stopped` aux services long-running. Les jobs ponctuels (`*-db-init`, `*-init`, `*-bootstrap` et provisionnements Keycloak) conservent `restart: 'no'` et ne sont jamais ciblés par le watchdog.

Le watchdog Windows vérifie une liste explicite d’applications, bases, files, stockage, identité, proxy et observabilité. Après trois contrôles consécutifs en échec, il tente `docker compose restart <service>` ou `docker compose up -d --no-deps <service>` si le conteneur est arrêté. Il attend un état sain, limite chaque conteneur à trois tentatives et applique un délai de 60 minutes. Il ne construit pas d’image, ne migre pas, ne modifie pas le code et ne touche pas aux volumes/secrets. Après épuisement, le journal porte `INTERVENTION_REQUISE`.

Installation (tâche de l’utilisateur Windows, toutes les cinq minutes) :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-docker-self-heal-task.ps1
```

Journaux et compteurs : `%LOCALAPPDATA%\InvitaFlow\DockerSelfHeal\docker-self-heal.log` et `state.json`. Pour désactiver proprement :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-docker-self-heal-task.ps1
```

La tâche ne démarre que lorsque la session Windows de l’utilisateur est ouverte ; Docker Desktop indisponible est simplement ignoré. Corriger la cause sous-jacente si un service atteint `INTERVENTION_REQUISE`.
