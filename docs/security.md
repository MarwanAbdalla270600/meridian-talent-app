# Sicherheit

## Schutzbedarf

Das System verarbeitet **Bewerberdaten** (Lebensläufe, Kontaktdaten, Einwilligungen) sowie **Geschäftsdaten** (Kunden, Anfragen, Stundensätze). Nutzer sitzen in Ägypten und Österreich. Schutzziele: Vertraulichkeit (hoch), Integrität des Freigabeprozesses (hoch), Verfügbarkeit (mittel).

## Bedrohungsmodell (STRIDE, kurz)

| Kategorie                  | Bedrohung                                                           | Maßnahmen                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **S**poofing               | Kontoübernahme durch Passwort-Raten oder Phishing                   | Argon2id, Mindestlänge 12 + Liste häufiger Passwörter, Sperre nach 5 Fehlversuchen, Rate-Limit pro IP, optionale/verpflichtende TOTP-2FA, Session-Rotation beim Login, einmalige Reset-Links (1 h) ohne Kontoaufzählung        |
|                            | Session-Diebstahl                                                   | Zufällige 256-bit-Tokens, in der DB nur SHA-256-Hash, Cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`, Leerlauf- (120 min) und absolute Ablaufzeit (12 h), „Überall abmelden“, Passwortwechsel beendet andere Sitzungen |
| **T**ampering              | Umgehung des Zwei-Phasen-Prozesses (z. B. Ägypten gibt selbst frei) | Zustandsautomat und Policy **serverseitig**, Transaktion mit Zeilensperre, Tests für jede Regel; UI-Ausblendung nur zusätzlich                                                                                                 |
|                            | Mass-Assignment (z. B. `status` im Body)                            | Zod-Schemas mit `.strict()`, Rollen-Feldfilter (Stundensatz)                                                                                                                                                                   |
|                            | SQL-Injection                                                       | Drizzle (parametrisiert), Suchbegriffe mit escapetem `LIKE`                                                                                                                                                                    |
|                            | CSRF                                                                | Origin-Prüfung + `Sec-Fetch-Site` + HMAC-signierter Double-Submit-Token für jeden zustandsändernden Request                                                                                                                    |
| **R**epudiation            | Bestreiten von Freigaben/Exporten                                   | `audit_log` (append-only per Trigger) und `status_history`: wer, wann, von/nach, Notiz, Feld-Diff, IP; jeder PDF-Export protokolliert                                                                                          |
| **I**nformation Disclosure | Ägypten sieht Kunden/Sätze                                          | Policy-Matrix, Feldfilter, E2E-Test „auch per direktem API-Aufruf“                                                                                                                                                             |
|                            | Daten im Kundenprofil                                               | Anonymisiert als Standard; Kontaktdaten und interne Notiz werden nie gedruckt; Test mit PDF-Textextraktion                                                                                                                     |
|                            | Öffentliche Dateien                                                 | Kein öffentlicher Bucket; Pre-signed URLs mit 60 s Gültigkeit; zufällige Storage-Keys                                                                                                                                          |
|                            | Logs                                                                | JSON-Logs ohne Query-Strings und personenbezogene Daten; Redaktion sensibler Feldnamen; kein Access-Log in Caddy                                                                                                               |
|                            | XSS                                                                 | Angular-Escaping, kein `innerHTML` mit Nutzerdaten, strikte CSP (`script-src 'self'`, kein Inline-Code), PDF-Templates escapen alle Werte                                                                                      |
| **D**enial of Service      | Upload- oder PDF-Flut                                               | Body-Limit, Upload- und PDF-Rate-Limits pro Nutzer, PDF-Queue mit Parallelitätslimit, Warteschlangenlimit (503) und Timeout, Ressourcenlimits pro Container                                                                    |
| **E**levation of Privilege | Rolle ändern, Container-Ausbruch                                    | Nur Admin verwaltet Rollen, kein Selbst-Downgrade/-Deaktivieren; Container als Nicht-Root, `read_only`, `cap_drop: ALL`, `no-new-privileges`; Postgres nur im internen Netz                                                    |

## Umgesetzte Kontrollen

- **Konfiguration:** Zod-validierte Umgebung, der Start bricht bei Fehlern ab. In Produktion zusätzlich: `COOKIE_SECURE=true`, `https`-`BASE_URL`, kein Platzhalter-Secret.
- **Header:** API: CSP `default-src 'none'`, HSTS, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, Permissions-Policy, CORP/COOP, `Cache-Control: no-store`. SPA (nginx): strikte CSP, `frame-ancestors 'none'`. Caddy: HSTS (2 Jahre).
- **CORS:** nur die eigene Origin, mit Credentials.
- **Uploads:** Typprüfung per Magic Bytes (PDF/DOCX/PNG/JPEG je nach Art), Größenlimit, Virenscan-Hook (ClamAV `INSTREAM` über `CLAMAV_HOST`; ohne Konfiguration Status `skipped` mit Warnung im Log), infizierte Dateien werden nicht gespeichert.
- **PDF-Rendering:** Chromium ohne JavaScript, alle Netzwerkzugriffe blockiert, isolierter Kontext pro Job.
- **Secrets:** nur über Env (`deploy/.env`, nicht im Repo). TOTP-Secrets mit AES-256-GCM verschlüsselt (`DATA_ENCRYPTION_KEY`).
- **Abhängigkeiten:** gepinnte Versionen + Lockfile, `bun audit` in CI, Dependabot (npm, Docker, Actions), Trivy-Scan der Images (CRITICAL bricht ab).
- **Verschlüsselung in Transit:** TLS über Caddy (Let's Encrypt), HTTP/3. Intern laufen nur Container-Netze.
- **Verschlüsselung im Ruhezustand:** siehe unten (Hosting-Ebene) sowie verschlüsselte Backups mit `age` (nur der öffentliche Schlüssel liegt auf dem Server).

## Verschlüsselung im Ruhezustand (Betrieb)

| Daten           | Maßnahme                                                                                                                                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postgres-Volume | Volume-/Disk-Verschlüsselung beim Hoster aktivieren (z. B. verschlüsseltes Block-Volume) oder LUKS auf dem Host. **Vor Livegang umsetzen.**                                                                          |
| Dokumente (S3)  | Externer EU-S3: serverseitige Verschlüsselung (SSE) aktivieren. Die API setzt `ServerSideEncryption: AES256`, wenn kein eigener Endpoint konfiguriert ist. MinIO: KMS/SSE konfigurieren oder verschlüsseltes Volume. |
| Backups         | `age`-verschlüsselt (Public-Key), Prüfsumme; privater Schlüssel offline/beim Datenschutzbeauftragten                                                                                                                 |

## Empfehlungen vor Livegang

1. Eigene DB-Rolle für die Migrationen (Owner) und eine Rolle für die App **ohne** Owner-Rechte. Die App kann dann den Audit-Trigger nicht entfernen.
2. `REQUIRE_TOTP_FOR_PRIVILEGED` / Einstellung „2FA verpflichtend“ für Österreich und Admin aktivieren.
3. ClamAV-Container (`clamav/clamav`) ergänzen und `CLAMAV_HOST` setzen.
4. Penetrationstest bzw. externes Review; Uptime- und Log-Monitoring (siehe Runbook).
5. Firewall: nur 80/443 (und SSH mit Schlüssel) offen.

## Checkliste

- [x] Passwörter Argon2id, Mindestlänge, häufige Passwörter gesperrt
- [x] TOTP optional, für privilegierte Rollen verpflichtend konfigurierbar
- [x] Sessions: Hash, HttpOnly/Secure/SameSite, Rotation, Ablauf, Abmelden überall
- [x] CSRF für alle zustandsändernden Requests
- [x] Rate-Limits: Login, Passwort-Reset, Upload, PDF, global
- [x] Zod an jeder Grenze, `.strict()`, parametrisierte Queries
- [x] Security-Header (API, SPA, Caddy), CORS nur eigene Origin
- [x] Uploads: Magic Bytes, Größe, Virenscan-Hook, zufällige Keys, Pre-signed URLs (60 s)
- [x] Secrets nur aus Env, Fail-fast bei ungültiger Konfiguration
- [x] Strukturierte Logs mit Request-ID ohne PII
- [x] `bun audit`, Dependabot, Trivy in CI
- [x] Container Nicht-Root, `read_only`, `cap_drop`, Healthchecks, interne Netze
- [x] Audit-Log append-only (DB-Trigger)
- [ ] Disk-/Volume-Verschlüsselung beim Hoster aktivieren (Betrieb)
- [ ] Getrennte DB-Rollen (Owner vs. App) einrichten (Betrieb)
- [ ] ClamAV produktiv anbinden (Betrieb)
