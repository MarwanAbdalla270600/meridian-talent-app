# Datenschutz (DSGVO)

> Diese Unterlage beschreibt die technische Umsetzung. Sie ersetzt keine rechtliche Prüfung. Verzeichnis der Verarbeitungstätigkeiten, Rechtsgrundlagen, Einwilligungstexte und AV-Verträge müssen vor dem Livegang durch die Datenschutzverantwortlichen geprüft werden.

## Verarbeitungsübersicht

|                                         |                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verantwortlicher**                    | Meridian Talent, Wien                                                                                                                                                                                                                                                                                                           |
| **Zweck**                               | Erfassung, Qualitätssicherung und Vermittlung von IT-Fachkräften an Kunden in AT/DE                                                                                                                                                                                                                                             |
| **Betroffene**                          | Kandidatinnen und Kandidaten (Entwickler), Ansprechpersonen bei Kunden, interne Nutzer                                                                                                                                                                                                                                          |
| **Datenkategorien**                     | Stammdaten (Name, E-Mail, Telefon, Standort), beruflicher Werdegang, Skills, Ausbildung, Zertifikate, Sprachen, Verfügbarkeit, Stundensatz, Lebenslauf-Dateien, Einwilligung (Datum, Version, Nachweis), interne Notizen; Kunden: Firma, Ansprechperson, E-Mail; Nutzer: Name, E-Mail, Rolle, Login-Zeitpunkte, IP im Audit-Log |
| **Keine besonderen Kategorien**         | Das System sieht keine Felder für Art. 9-Daten vor (kein Foto, keine Religion/Gesundheit). Im Kurzprofil und in Notizen sollen solche Angaben nicht erfasst werden (Schulung).                                                                                                                                                  |
| **Rechtsgrundlage (Vorschlag, prüfen)** | Einwilligung der Kandidaten (Art. 6 Abs. 1 lit. a) bzw. vorvertragliche Maßnahmen (lit. b); Kunden-Ansprechpersonen: berechtigtes Interesse (lit. f)                                                                                                                                                                            |
| **Empfänger**                           | Interne Rollen (Ägypten/Österreich/Admin), Kunden (nur freigegebene, standardmäßig anonymisierte Kundenprofile), Auftragsverarbeiter (siehe unten)                                                                                                                                                                              |
| **Speicherort**                         | EU-Rechenzentrum (z. B. Hetzner, Deutschland/Finnland), S3-Speicher in EU-Region                                                                                                                                                                                                                                                |

## Auftragsverarbeiter und Drittlandübermittlung

| Dienst                                | Zweck                          | Daten                                    | Hinweis                             |
| ------------------------------------- | ------------------------------ | ---------------------------------------- | ----------------------------------- |
| Hosting (EU)                          | Server, Volumes, Backups       | alle                                     | AV-Vertrag nach Art. 28 abschließen |
| S3-Speicher (EU)                      | Lebensläufe, Nachweise         | Dokumente                                | AV-Vertrag; SSE aktivieren          |
| SMTP-Dienst                           | Einladungen/Passwort-Links     | Nutzer-E-Mail, Name                      | AV-Vertrag                          |
| **Anthropic (Claude API)** – optional | KI-Extraktion von Lebensläufen | **Inhalt des hochgeladenen Lebenslaufs** | siehe nächster Abschnitt            |

### KI-gestützter Lebenslauf-Import

- **Abschaltbar** über `FEATURE_CV_AI_IMPORT=false` (Standard). Ohne Flag wird nichts an Anthropic übermittelt, der Lebenslauf wird nur gespeichert und manuell erfasst.
- **Datenminimierung:** Übermittelt wird ausschließlich der Inhalt der hochgeladenen Datei (PDF als Dokument, DOCX als Text). Keine internen Notizen, Kunden- oder Nutzerdaten. Die Anweisung an das Modell untersagt das Übernehmen von Daten Dritter (z. B. Referenzen).
- **Mensch im Prozess:** Das Ergebnis ist immer nur ein Vorschlag. Ein Entwurf in Pool 1 entsteht erst, wenn eine Person **jeden Abschnitt** geprüft und bestätigt hat (serverseitig erzwungen). Pro Feld werden Sicherheit (Konfidenz) und Fundstelle angezeigt. Die Roh-Extraktion wird nach der Übernahme gelöscht.
- **Drittland:** Anthropic ist ein US-Anbieter. Vor Aktivierung zu klären: AV-Vertrag/DPA mit Anthropic, Übermittlungsgrundlage (EU-US Data Privacy Framework bzw. Standardvertragsklauseln), Transfer-Impact-Assessment, Information der Kandidaten im Einwilligungstext.
- **Optionen zur Risikominderung:** Zero-Data-Retention-Vereinbarung mit Anthropic (falls verfügbar für das Konto/Modell), regionale Verarbeitung über `ANTHROPIC_INFERENCE_GEO` (nur von der API unterstützte Werte), Nutzung über einen EU-Cloud-Anbieter mit Claude-Modellen und eigenem Endpoint (`ANTHROPIC_BASE_URL`).

## Betroffenenrechte (Funktionen für Admins)

| Recht                          | Umsetzung                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auskunft (Art. 15)             | „Datenauskunft“ im Profil: Export als **JSON** oder **PDF** (Profil, Dokument-Metadaten, Statusverlauf, Vorschläge an Anfragen, Verarbeitungsvorgänge). Wird protokolliert.                                                                                                    |
| Berichtigung (Art. 16)         | Bearbeitung im Profil (mit Audit-Diff)                                                                                                                                                                                                                                         |
| Löschung (Art. 17)             | „Endgültig löschen“ (Bestätigung durch Eingabe der Kennung): löscht Profil, Skills, Erfahrungen, Dokumente **inkl. Dateien im S3**, Vorschläge, Statusverlauf; Audit-Einträge zum Profil werden **geschwärzt** (`{"redacted": true}`). Nur ein PII-freier Löscheintrag bleibt. |
| Einschränkung (Art. 18)        | „Verarbeitung einschränken“ mit Grund: Profil gesperrt für Bearbeitung, Matching, Vorschläge und PDF; offene Vorschläge werden entfernt                                                                                                                                        |
| Widerspruch/Widerruf           | Widerruf der Einwilligung: Feld „Einwilligung“ entfernen. Ohne Einwilligung keine Freigabe (Checkliste); der Aufbewahrungsjob markiert das Profil zur Löschung                                                                                                                 |
| Datenübertragbarkeit (Art. 20) | JSON-Export (maschinenlesbar)                                                                                                                                                                                                                                                  |

## Löschkonzept

| Daten                           | Frist                                         | Mechanismus                                                                                                                                   |
| ------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Entwicklerprofile ohne Änderung | **24 Monate** (Einstellung `retentionMonths`) | Täglicher Job markiert zur Löschung; Admin prüft und löscht oder entfernt die Markierung. Im Einsatz befindliche Entwickler sind ausgenommen. |
| Profile ohne Einwilligung       | **30 Tage** nach Anlage (`consentGraceDays`)  | Job markiert, Admin entscheidet                                                                                                               |
| Gelöschte Profile (Soft-Delete) | bis zur endgültigen Löschung                  | über DSGVO-Löschung entfernbar                                                                                                                |
| Sessions                        | 12 h absolut / 120 min Leerlauf               | automatisch; abgelaufene Sessions werden beim Login entfernt                                                                                  |
| Passwort-Links                  | 1 h (Reset) / 72 h (Einladung), einmalig      | —                                                                                                                                             |
| Roh-Extraktion KI               | bis zur Übernahme                             | wird beim Anlegen des Entwurfs gelöscht                                                                                                       |
| Audit-Log                       | Empfehlung: 3 Jahre (festzulegen)             | append-only; personenbezogene Inhalte werden bei Löschung des Profils geschwärzt                                                              |
| Backups                         | 14 Tage (`BACKUP_RETENTION_DAYS`)             | automatische Rotation; gelöschte Daten verschwinden spätestens nach Ablauf aus den Backups (im Verzeichnis dokumentieren)                     |
| Browser-Entwürfe                | bis zum Speichern/Abmelden                    | Formular-Autosave in `localStorage` wird nach dem Speichern und beim Abmelden gelöscht; nur auf Firmengeräten nutzen                          |

## Technische und organisatorische Maßnahmen (TOMs)

**Vertraulichkeit**

- Zutritt/Zugang: EU-Rechenzentrum des Hosters (zertifiziert), SSH nur mit Schlüssel, Firewall nur 80/443
- Zugriff: Rollenmodell (Ägypten/Österreich/Admin), zentrale Policy, Least Privilege (Ägypten ohne Kunden-, Anfrage- und Satzdaten), 2FA für privilegierte Rollen
- Trennung: Kundenprofile standardmäßig anonymisiert, interne Notizen nie im Kundenprofil
- Pseudonymisierung: öffentliche Kennung (`#007`) statt Name in Kundenprofilen

**Integrität**

- Weitergabe: TLS 1.2+/1.3 (Caddy), Pre-signed URLs mit 60 s Gültigkeit, verschlüsselte Backups
- Eingabekontrolle: Audit-Log (wer, wann, was, Feld-Diff, IP), append-only, Statushistorie

**Verfügbarkeit und Belastbarkeit**

- Tägliche verschlüsselte Backups mit Rotation, dokumentierter und getesteter Restore (Runbook)
- Healthchecks, Neustart-Policies, Ressourcenlimits, Rate-Limits

**Verfahren zur regelmäßigen Überprüfung**

- CI mit Tests, Abhängigkeits-Audit und Image-Scan bei jedem Push
- Quartalsweiser Restore-Test (Runbook), jährliche Überprüfung der Rollen und Nutzer

## Vor dem Livegang zu erledigen

- [ ] AV-Verträge (Hoster, S3, SMTP, ggf. Anthropic)
- [ ] Verzeichnis der Verarbeitungstätigkeiten ergänzen
- [ ] Datenschutz-Folgenabschätzung prüfen (systematische Bewertung von Bewerbern, KI-Einsatz)
- [ ] Einwilligungstext (Version, Inhalt, Hinweis auf KI und Drittland) rechtlich prüfen; Version in den Einstellungen pflegen
- [ ] Informationspflichten (Art. 13/14) für Kandidaten und Kunden-Ansprechpersonen
- [ ] Aufbewahrungsfrist für das Audit-Log festlegen
