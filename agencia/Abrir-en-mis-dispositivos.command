#!/bin/bash
# Doble clic aquí para tener la agencia accesible desde el iPhone y el PC.
#
# Hace tres cosas: busca tu dirección de Tailscale, te escribe el enlace completo
# con la llave dentro, y arranca el programa impidiendo que el Mac se duerma.
# Deja esta ventana abierta mientras quieras usarlo desde fuera.

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "  Falta Node.js: https://nodejs.org"
  read -r -p "  Enter para cerrar."; exit 1
fi

[ -d node_modules ] || npm install

PUERTO="${1:-4321}"
CLAVE=$(node -e "import('./src/web/servidor.js').then(m=>console.log(m.claveDeAcceso()))" 2>/dev/null)

# La dirección de Tailscale si está instalado; si no, la de la wifi de casa.
IP=""
for CANDIDATO in /usr/local/bin/tailscale /opt/homebrew/bin/tailscale \
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale" tailscale; do
  if command -v "$CANDIDATO" >/dev/null 2>&1 || [ -x "$CANDIDATO" ]; then
    IP=$("$CANDIDATO" ip -4 2>/dev/null | head -1)
    [ -n "$IP" ] && break
  fi
done
DONDE="desde cualquier sitio (Tailscale)"
if [ -z "$IP" ]; then
  IP=$(node -e "import('./src/web/servidor.js').then(m=>console.log(m.ipLocal()||''))" 2>/dev/null)
  DONDE="desde tu misma wifi (Tailscale no encontrado)"
fi

echo ""
echo "  ────────────────────────────────────────────────────────────"
echo "   Ábrelo en el iPhone o en el PC, $DONDE:"
echo ""
echo "     http://$IP:$PUERTO/?clave=$CLAVE"
echo ""
echo "   En el iPhone: Compartir → Añadir a pantalla de inicio,"
echo "   y ya no vuelves a pegar la llave nunca más."
echo "  ────────────────────────────────────────────────────────────"
echo ""
echo "  Deja esta ventana abierta. Para parar el programa: Control + C."
echo ""

# caffeinate -s: el Mac no se duerme mientras esto corra y esté enchufado.
# (Solo existe en macOS; en cualquier otro sitio se arranca sin él.)
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -s node bin/agencia.js abrir --red --puerto "$PUERTO" --sin-abrir
else
  exec node bin/agencia.js abrir --red --puerto "$PUERTO" --sin-abrir
fi
