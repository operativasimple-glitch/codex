#!/bin/bash
# Doble clic: abre una terminal ya colocada en la carpeta de la agencia,
# para escribir comandos a mano sin tener que hacer "cd" a ningún sitio.
cd "$(dirname "$0")" || exit 1
echo ""
echo "  Estás en la carpeta de la agencia. Algunos comandos:"
echo ""
echo "    node bin/agencia.js abrir          la aplicación, solo en este Mac"
echo "    node bin/agencia.js abrir --red    también desde el iPhone y el PC"
echo "    node bin/agencia.js arranque       auditar todas las webs de la lista"
echo "    node bin/agencia.js ayuda          todo lo demás"
echo ""
exec "$SHELL"
