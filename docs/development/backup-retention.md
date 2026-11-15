# Backup-Aufbewahrung 7/4/12

Ein täglicher Auftrag sichert den vollständigen Minecraft-Server und legt für jede
gültige Bedrock-Welt ein separates ZIP an. Der optionale systemd-Timer startet
um 04:00 Uhr in der Zeitzone Europe/Berlin. Bei verbundenen Spielern oder einer
fehlgeschlagenen Spielerabfrage wird der Termin übersprungen. Nach Aktivierung
läuft der Timer auch nach einem Neustart weiter. Verpasste Termine werden nicht
außerhalb des Zeitfensters nachgeholt.

Für Vollbackups und für jede Welt gelten getrennt:

- die neueste Sicherung an jedem der letzten sieben belegten Kalendertage
- die neueste Sicherung in jeder der letzten vier belegten ISO-Kalenderwochen
- die neueste Sicherung in jedem der letzten zwölf belegten Kalendermonate

Ein Archiv kann mehrere Fristen zugleich erfüllen. Die Bereinigung erfolgt erst
nach erfolgreicher Prüfung der neuen Archive und betrifft ausschließlich die
verwalteten Verzeichnisse unter `/home/mcserver/backups`. Bereits vorhandene
Sicherungen außerhalb dieser Verzeichnisse bleiben erhalten.

Vollbackups liegen in `server-7-4-12/` als TAR.GZ mit Prüfsummenmanifest.
Weltarchive liegen in `worlds-7-4-12/` in einem eigenen Unterverzeichnis pro
Weltordner. Ein ZIP heißt beispielsweise
`Meine Welt-2026-11-15T040000+0100-a1b2c3d4.zip`. Im ZIP liegen `level.dat`
und die übrigen Weltdateien relativ zur Archivwurzel.

Ein manueller Auftrag über den Backup-Knopf nutzt dieselbe Aufbewahrung. Über
die Weltverwaltung lässt sich bei gestopptem Minecraft eine einzelne Welt nach
derselben Regel sichern. Bei einem fehlgeschlagenen Stopp bricht der
Vollbackup-Worker ab und versucht, Minecraft wieder zu starten.

Timer auf einer dafür vorgesehenen Installation aktivieren:

```bash
systemctl enable --now dracorock-backup.timer
```
