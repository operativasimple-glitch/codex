# La agencia, en un servidor. Se parte de la imagen oficial de Playwright porque
# ya trae Chromium y todas sus dependencias de sistema: instalarlas a mano en un
# Debian pelado son veinte paquetes y media hora de disgustos.
FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Los datos van en un volumen: si no, cada actualización se lleva por delante los
# leads, los escaneos y los correos.
VOLUME ["/app/datos"]
EXPOSE 4321

# --red para que se pueda entrar desde fuera del contenedor; la llave de acceso
# sigue haciendo falta. --sin-abrir porque aquí no hay navegador que abrir.
CMD ["node", "bin/agencia.js", "abrir", "--red", "--sin-abrir"]
