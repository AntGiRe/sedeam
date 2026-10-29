#!/bin/bash
# Activa las actualizaciones automáticas de Sedeam en este Mac.
#
# Crea una tarea del sistema (LaunchAgent) que cada 3 horas, y al iniciar sesión, hace
# `git pull` en la carpeta de la extensión. Cuando llega una versión nueva, la extensión
# lo detecta y se recarga sola. Tus horas y logros no se tocan.
#
# Uso:      ./scripts/auto-actualizar.sh
# Quitarlo: ./scripts/auto-actualizar.sh --quitar
set -euo pipefail

LABEL="com.sedeam.actualizar"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/sedeam-actualizar.log"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
GIT="$(command -v git || true)"

if [[ "${1:-}" == "--quitar" ]]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Actualizaciones automáticas desactivadas."
  exit 0
fi

if [[ -z "$GIT" ]]; then
  echo "No encuentro git. Instálalo con: xcode-select --install" >&2
  exit 1
fi
if ! "$GIT" -C "$DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1 || [[ -z "$("$GIT" -C "$DIR" remote)" ]]; then
  echo "Esta carpeta no es un clon de GitHub. Clónala con 'git clone' y ejecuta el script desde ahí." >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$GIT</string><string>-C</string><string>$DIR</string>
    <string>pull</string><string>--ff-only</string><string>--quiet</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>10800</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Listo. Sedeam buscará versiones nuevas cada 3 horas en:"
echo "  $DIR"
echo "Registro: $LOG"
