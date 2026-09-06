#!/usr/bin/env bash
# Instala la agencia en un servidor Debian/Ubuntu limpio, sin Docker.
# Uso:  sudo bash instalar-en-servidor.sh
set -euo pipefail

echo "→ Paquetes base"
apt-get update -qq
apt-get install -y -qq curl ca-certificates git

if ! command -v node >/dev/null 2>&1; then
  echo "→ Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

id agencia >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/agencia agencia
mkdir -p /opt/agencia
cp -r "$(dirname "$0")/.." /opt/agencia 2>/dev/null || true
cd /opt/agencia

echo "→ Dependencias del programa"
npm install --omit=dev
echo "→ Chromium y sus librerías de sistema"
npx playwright install --with-deps chromium

chown -R agencia:agencia /opt/agencia

echo "→ Servicio"
cp despliegue/agencia.service /etc/systemd/system/agencia.service
systemctl daemon-reload
systemctl enable --now agencia

echo
echo "Listo. La llave de acceso está en /opt/agencia/datos/acceso.json"
echo "Estado:   systemctl status agencia"
echo "Registro: journalctl -u agencia -f"
