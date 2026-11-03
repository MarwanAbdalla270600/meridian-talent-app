# Betriebshandbuch (Runbook)

Zielumgebung: eine Linux-VM in einem **EU-Rechenzentrum** (z. B. Hetzner Cloud, Falkenstein/Helsinki), Docker Engine ≥ 29 mit Compose v5. Alle Befehle werden im Repository-Verzeichnis auf dem Server ausgeführt.

## 1. Erst-Deployment

1. **Server vorbereiten:** Updates einspielen, Docker installieren, Firewall nur 22 (Schlüssel), 80, 443 (TCP+UDP). Disk-/Volume-Verschlüsselung aktivieren (siehe `security.md`).
2. **DNS:** `A`/`AAAA`-Record für `DOMAIN` (und ggf. `S3_DOMAIN`) auf den Server.
3. **Code holen:** `git clone … && cd meridian-talent-system && git checkout v1.0.0`
4. **Konfiguration:** `cp .env.example deploy/.env` und ausfüllen:
   - `NODE_ENV=production`, `DOMAIN`, `ACME_EMAIL`, `IMAGE_REGISTRY=ghcr.io/<org>`, `IMAGE_TAG=v1.0.0`
   - `POSTGRES_PASSWORD=$(openssl rand -hex 24)` (URL-sicher, wird in `DATABASE_URL` eingesetzt)
   - `SESSION_SECRET=$(openssl rand -base64 48)`, `DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)`
   - `COOKIE_SECURE=true`, `API_DOCS_ENABLED=false`, `S3_*` (EU-Region), `SMTP_*`, `MAIL_FROM`
   - Backup: `age-keygen -o backup-identity.txt` **auf einem sicheren Rechner**, nur den öffentlichen Schlüssel als `BACKUP_AGE_RECIPIENT` eintragen; die Identity-Datei offline verwahren
   - `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (starkes Passwort) für den ersten Admin
   - `chmod 600 deploy/.env`
5. **Images laden und starten:**
   ```bash
   echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin
   docker compose -f deploy/docker-compose.prod.yml pull
   docker compose -f deploy/docker-compose.prod.yml up -d
   docker compose -f deploy/docker-compose.prod.yml run --rm seed   # erstellt Skill-Katalog + ersten Admin
   ```
   Danach `SEED_*_PASSWORD` aus `deploy/.env` entfernen. Weitere Nutzer legt der Admin in der Oberfläche an (Einladungslink per E-Mail).
6. **Prüfen:** `curl -fsS https://$DOMAIN/api/health` → `{"status":"ok","db":true,…}`; Anmeldung als Admin; 2FA einrichten; Einstellung „2FA verpflichtend“ aktivieren.

Mit gebündeltem MinIO statt externem S3: `S3_ENDPOINT=http://minio:9000`, `S3_PUBLIC_ENDPOINT=https://$S3_DOMAIN`, `S3_AUTO_CREATE_BUCKET=true`, `cp deploy/caddy/sites/minio.caddy.example deploy/caddy/sites/minio.caddy` und mit `--profile minio` starten.

## 2. Update

```bash
git fetch --tags && git checkout vX.Y.Z           # Compose/Caddy-Änderungen übernehmen
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=vX.Y.Z/' deploy/.env
docker compose -f deploy/docker-compose.prod.yml exec backup backup.sh once   # Sicherung vor dem Update
docker compose -f deploy/docker-compose.prod.yml pull
docker compose -f deploy/docker-compose.prod.yml up -d    # migrate läuft automatisch vor der API
docker compose -f deploy/docker-compose.prod.yml ps
```

Migrationen sind vorwärtsgerichtet (`drizzle-kit generate`). Der `migrate`-Container läuft vor jeder API-Version. Schlägt er fehl, startet die API nicht.

## 3. Rollback

- **Ohne Schemaänderung:** `IMAGE_TAG` auf die vorige Version setzen, `pull`, `up -d`.
- **Mit Schemaänderung:** Die neue Migration ist nicht automatisch umkehrbar. Daher: Wartungsmodus (API stoppen), Backup vor dem Update wiederherstellen (Abschnitt 5), alte Version starten.

## 4. Backup

- Der Container `backup` erstellt täglich um `BACKUP_HOUR_UTC` (Standard 01:00 UTC) einen `pg_dump` (Custom-Format), verschlüsselt mit `age` (öffentlicher Schlüssel), plus SHA-256-Prüfsumme. Rotation nach `BACKUP_RETENTION_DAYS` (14).
- Speicherort: Docker-Volume `meridian_backups` (oder `BACKUP_DIR`=absoluter Host-Pfad, Eigentümer UID 999).
- **Offsite:** täglich auf einen zweiten EU-Speicher kopieren, z. B.:
  ```bash
  docker run --rm -v meridian_backups:/b:ro -v /root/.config/rclone:/config/rclone rclone/rclone sync /b remote:meridian-backups
  ```
- Dokumente im S3: Versionierung/Replikation beim Anbieter aktivieren.
- Manuell: `docker compose -f deploy/docker-compose.prod.yml exec backup backup.sh once`

## 5. Restore

```bash
C="docker compose -f deploy/docker-compose.prod.yml"
$C exec backup ls -la /backups                       # gewünschte Datei wählen
# a) Test-Restore in eine separate Datenbank (empfohlen, quartalsweise)
$C exec postgres psql -U meridian -d meridian -c "CREATE DATABASE meridian_restore"
$C run --rm -v /sicher/backup-identity.txt:/tmp/identity:ro --entrypoint restore.sh backup \
   /backups/meridian-<ts>.dump.age /tmp/identity meridian_restore
# b) Produktiv-Restore: API stoppen, restore in "meridian", API starten
$C stop api
$C run --rm -v /sicher/backup-identity.txt:/tmp/identity:ro --entrypoint restore.sh backup \
   /backups/meridian-<ts>.dump.age /tmp/identity meridian
$C start api
```

`restore.sh` prüft die Prüfsumme, entschlüsselt und spielt mit `pg_restore --clean --if-exists` ein.

### Durchgeführter Restore-Test

| Datum      | Umgebung                                                                                            | Ablauf                                                                                                  | Ergebnis                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-03 | Produktions-Images lokal (`docker-compose.prod.yml` + `docker-compose.e2e.yml`, `DOMAIN=localhost`) | `backup.sh once` → verschlüsselte Datei (57 KB) + `.sha256`; `restore.sh` in neue DB `meridian_restore` | Prüfsumme OK; identische Zeilenanzahl in `developers`, `users`, `audit_log`, `skills`, `drizzle.__drizzle_migrations`; Append-only-Trigger wiederhergestellt |

## 6. Logs

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f api        # JSON, mit requestId
docker compose -f deploy/docker-compose.prod.yml logs --since 1h api | grep '"level":"error"'
```

Logs enthalten keine personenbezogenen Daten und keine Query-Strings. Bei Fehlermeldungen in der Oberfläche wird eine **Fehler-ID** angezeigt (`requestId`), mit der sich die Logzeile finden lässt. Rotation: `json-file`, 5 × 10 MB pro Container.

## 7. Zertifikate

Caddy beschafft und erneuert Let's-Encrypt-Zertifikate automatisch (Volume `caddy_data`). Voraussetzungen: DNS zeigt auf den Server, Port 80/443 offen, `ACME_EMAIL` gesetzt. Prüfen: `docker compose … logs caddy | grep -i certificate`.

## 8. Monitoring (Empfehlung)

- **Uptime-Check** (z. B. Uptime Kuma, Better Stack, EU-Anbieter) auf `https://$DOMAIN/api/health` alle 60 s; Alarm bei Statuscode ≠ 200 oder `"db":false`.
- **Zertifikatsablauf** über denselben Dienst überwachen.
- **Backups:** täglich prüfen, ob eine neue Datei existiert (Alarm, wenn älter als 26 h).
- **Ressourcen:** Disk-Füllstand (Postgres-Volume, Backups), RAM (Chromium), z. B. mit node_exporter/Netdata.
- **Fehlerquote:** Log-Auswertung auf `"level":"error"` und HTTP 5xx.

## 9. Häufige Aufgaben

| Aufgabe                                            | Befehl / Ort                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nutzer anlegen, Rolle ändern, Passwort-Link senden | Oberfläche → Verwaltung → Nutzer                                                                              |
| Konto entsperren / 2FA zurücksetzen                | Oberfläche → Nutzer                                                                                           |
| Aufbewahrungsprüfung sofort                        | Oberfläche → Einstellungen, oder `docker compose … exec api bun run jobs:retention`                           |
| KI-Import aktivieren                               | `FEATURE_CV_AI_IMPORT=true`, `ANTHROPIC_API_KEY=…` in `deploy/.env`, `up -d api` (vorher DSGVO-Punkte klären) |
| Logo/Marke ändern                                  | `packages/shared/brand/` anpassen, neue Images bauen                                                          |

## 10. Last-Smoke (Referenzwerte)

Durchgeführt am 2026-11-03 gegen die Produktions-Images hinter Caddy (lokal, 8 vCPU, kleiner Demodatenbestand), unterhalb der Rate-Limits:

| Szenario                                           | Anfragen / Parallelität | Durchsatz     | p50    | p95    | Fehler |
| -------------------------------------------------- | ----------------------- | ------------- | ------ | ------ | ------ |
| Entwicklerliste (Suche/Filter/Sortierung gemischt) | 400 / 20                | ≈ 1 100 req/s | 16 ms  | 25 ms  | 0      |
| Entwicklerdetail                                   | 100 / 10                | ≈ 770 req/s   | 12 ms  | 16 ms  | 0      |
| Langprofil-PDF (Queue, 2 parallel)                 | 20 / 8                  | ≈ 11 PDF/s    | 690 ms | 835 ms | 0      |

Speicher der API danach: ≈ 180 MB (Limit 1,5 GB). Das globale Rate-Limit (600 Anfragen/min pro IP) und das PDF-Limit (30/min pro Nutzer) begrenzen Lastspitzen bewusst.

## 11. Automatisches Deployment (GitHub Actions → Hetzner)

Ablauf: `git push` eines Tags `vX.Y.Z` → CI (Tests, Images, E2E) → Push nach GHCR → Job `deploy` verbindet sich per SSH und ruft `deploy/deploy.sh vX.Y.Z` auf. Das Skript checkt den Tag aus, erstellt ein Backup, zieht die Images, startet und prüft `/api/health`. Bei einem Fehler rollt es auf den vorherigen Tag zurück (Datenbank-Migrationen werden dabei nicht zurückgedreht).

### Einmalige Einrichtung auf dem Server (als root)

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy                          # Hinweis: docker-Gruppe ≈ root-Rechte
install -d -o deploy -g deploy /opt/meridian
sudo -iu deploy
# Lesezugriff auf das Repository (GitHub → Settings → Deploy keys, read-only):
ssh-keygen -t ed25519 -f ~/.ssh/github_repo -N "" && cat ~/.ssh/github_repo.pub
printf 'Host github.com\n  IdentityFile ~/.ssh/github_repo\n' >> ~/.ssh/config
git clone git@github.com:<owner>/<repo>.git /opt/meridian
cd /opt/meridian && cp .env.example deploy/.env && chmod 600 deploy/.env   # ausfüllen (Abschnitt 1)
# Images aus GHCR: Personal Access Token (classic) nur mit Scope read:packages
echo "<PAT>" | docker login ghcr.io -u <github-user> --password-stdin
```

In `deploy/.env`: `IMAGE_REGISTRY=ghcr.io/<owner in Kleinbuchstaben>`. Erst-Start wie in Abschnitt 1 (`up -d`, `run --rm seed`).

### SSH-Schlüssel für GitHub Actions (nur Deploy erlaubt)

Lokal: `ssh-keygen -t ed25519 -f gha_deploy -N "" -C github-actions-deploy`. Auf dem Server in `/home/deploy/.ssh/authorized_keys` **eine** Zeile:

```
restrict,command="/opt/meridian/deploy/deploy.sh" ssh-ed25519 AAAA… github-actions-deploy
```

Der Schlüssel kann damit nur das Deploy-Skript ausführen (keine Shell, kein Forwarding). Server-Fingerprint holen: `ssh-keyscan -t ed25519 <server-ip>`.

### GitHub-Konfiguration

Repository → Settings → Environments → `production` (optional „Required reviewers“ für eine manuelle Freigabe):

| Art      | Name                 | Wert                                   |
| -------- | -------------------- | -------------------------------------- |
| Secret   | `DEPLOY_HOST`        | IP oder Hostname des Servers           |
| Secret   | `DEPLOY_USER`        | `deploy`                               |
| Secret   | `DEPLOY_SSH_KEY`     | Inhalt der privaten Datei `gha_deploy` |
| Secret   | `DEPLOY_KNOWN_HOSTS` | Ausgabe von `ssh-keyscan`              |
| Variable | `DEPLOY_DOMAIN`      | z. B. `talent.example.at`              |

### Release ausrollen

```bash
git tag -a v1.0.1 -m "…" && git push origin v1.0.1
```

Manuell auf dem Server geht es genauso: `cd /opt/meridian && ./deploy/deploy.sh v1.0.1`.
