#!/usr/bin/env bash
set -Eeuo pipefail
SESSION="mcbedrock"
TIMEOUT=60
# This script is executed by systemd with User=mcserver.
if ! /usr/bin/screen -ls | /usr/bin/grep -Eq "[0-9]+\.${SESSION}[[:space:]]"; then
  echo "Keine SCREEN-Sitzung gefunden."
  exit 0
fi
echo "Sende STOP an Minecraft Bedrock ..."
/usr/bin/screen -S "$SESSION" -p 0 -X stuff $'stop\r'
echo "Warte auf das vollständige Herunterfahren ..."
for ((i=0; i<TIMEOUT; i++)); do
  if ! /usr/bin/screen -ls | /usr/bin/grep -Eq "[0-9]+\.${SESSION}[[:space:]]"; then
    echo "Minecraft Bedrock wurde beendet."
    exit 0
  fi
  /usr/bin/sleep 1
done
echo "FEHLER: Minecraft wurde innerhalb von ${TIMEOUT}s nicht beendet." >&2
echo 'Diagnose vor der systemd-Terminierung:' >&2
/usr/bin/ps -u mcserver -L -o pid,tid,stat,wchan:30,comm >&2 || true
/usr/bin/cat /proc/pressure/io /proc/pressure/memory >&2 || true
exit 1
