#!/bin/bash
# Doble clic en este fichero abre la agencia en el Mac.
#
# La primera vez instala lo que hace falta (Playwright y su navegador); las
# siguientes arranca en dos segundos. Al final abre el panel en el navegador y
# deja la terminal lista para seguir escribiendo comandos.

cd "$(dirname "$0")" || exit 1

echo ""
echo "  ────────────────────────────────────────────"
echo "   Agencia de cumplimiento digital"
echo "  ────────────────────────────────────────────"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Falta Node.js. Instálalo desde https://nodejs.org (versión 20 o superior)"
  echo "  y vuelve a hacer doble clic en este fichero."
  echo ""
  read -r -p "  Pulsa Enter para cerrar."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  Primera vez: instalando lo necesario. Tarda un par de minutos."
  echo ""
  npm install || { echo "  No se ha podido instalar."; read -r -p "  Enter para cerrar."; exit 1; }
  npx playwright install chromium || echo "  (El navegador no se ha descargado. Reinténtalo luego con: npx playwright install chromium)"
  echo ""
fi

# Primera vez del todo: se ofrece el arranque completo, que es lo que convierte
# la lista de leads en veinte diagnósticos y veinte correos escritos.
if [ ! -f datos/estado.json ]; then
  node bin/agencia.js leads --sembrar
  echo ""
  echo "  Es la primera vez. El arranque audita las webs de todos los leads, saca"
  echo "  cada diagnóstico en PDF y deja cada correo escrito en la bandeja."
  echo "  Tarda entre veinte minutos y una hora, y puedes irte mientras."
  echo ""
  read -r -p "  ¿Lo lanzo ahora? [s/N] " RESP
  if [ "$RESP" = "s" ] || [ "$RESP" = "S" ]; then
    node bin/agencia.js arranque
  fi
  echo ""
fi

node bin/agencia.js hoy
echo ""
node bin/agencia.js panel --abrir
echo ""
echo "  ────────────────────────────────────────────"
echo "   Comandos que más vas a usar:"
echo ""
echo "     node bin/agencia.js arranque           auditar de golpe las webs de todos los leads"
echo "     node bin/agencia.js auto --simulacro    ver qué haría la sesión automática"
echo "     node bin/agencia.js auto               hacerla"
echo "     node bin/agencia.js bandeja            correos listos para que los mandes"
echo "     node bin/agencia.js auditar una-web.es"
echo "     node bin/agencia.js ayuda              todo lo demás"
echo "  ────────────────────────────────────────────"
echo ""

exec "$SHELL"
