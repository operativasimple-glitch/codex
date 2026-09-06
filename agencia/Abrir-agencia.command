#!/bin/bash
# Doble clic aquí para abrir la agencia.
#
# La primera vez instala lo que hace falta (tarda unos minutos). Después abre la
# aplicación en el navegador: ahí está todo, con botones. Esta ventana negra hay
# que dejarla abierta mientras la uses — es el programa funcionando por dentro.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  ────────────────────────────────────────────"
echo "   Agencia de cumplimiento digital"
echo "  ────────────────────────────────────────────"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Falta Node.js. Descárgalo de https://nodejs.org (el botón grande, versión LTS),"
  echo "  instálalo y vuelve a hacer doble clic aquí."
  echo ""
  read -r -p "  Pulsa Enter para cerrar."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  Primera vez: instalando. Tarda unos minutos, solo pasa hoy."
  echo ""
  npm install || { echo "  No se ha podido instalar."; read -r -p "  Enter para cerrar."; exit 1; }
  npx playwright install chromium || echo "  (Si falla la descarga del navegador: npx playwright install chromium)"
  echo ""
fi

# Los 20 leads del paquete de contexto, la primera vez.
[ -f datos/estado.json ] || node bin/agencia.js leads --sembrar

echo ""
echo "  Abriendo la aplicación en el navegador…"
echo "  Deja esta ventana abierta. Para cerrar el programa: Control + C."
echo ""

node bin/agencia.js abrir
