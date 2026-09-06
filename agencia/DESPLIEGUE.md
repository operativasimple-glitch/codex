# Abrirlo desde cualquier sitio

La aplicación corre en una máquina y guarda ahí sus datos. "Desde cualquier sitio" significa
elegir qué máquina y cómo llegas a ella. Hay tres caminos y esta es la diferencia real:

| | Dónde corre | Funciona con el Mac cerrado | Coste | Montarlo |
|---|---|---|---|---|
| **A · Tailscale** | Tu Mac | No | Gratis | 15 minutos |
| **B · Túnel de Cloudflare** | Tu Mac | No | Gratis | 5 minutos |
| **C · Servidor propio** | Un servidor 24/7 | Sí | 4-6 €/mes | Una tarde |

Si lo que quieres es **mirar la bandeja y mandar un correo desde el metro**, con A sobra.
Si quieres que **la sesión diaria se haga sola aunque el portátil esté en la mochila**, es C.

---

## A · Tailscale (lo que recomiendo para empezar)

Una red privada entre tus aparatos. Nada queda expuesto a internet: tu móvil y tu PC ven al Mac
como si estuvieran en la misma habitación, estés donde estés.

1. Instala Tailscale en el Mac: https://tailscale.com/download — entra con tu cuenta.
2. Instala la app de Tailscale en el móvil y en el PC, con la misma cuenta.
3. En el Mac, mira su dirección: `tailscale ip -4` (algo como `100.101.102.103`).
4. Arranca la aplicación así:

   ```bash
   node bin/agencia.js abrir --red
   ```

5. Desde el móvil o el PC, con Tailscale conectado, abre:

   ```
   http://100.101.102.103:4321/?clave=LA-QUE-TE-IMPRIMA
   ```

   Guárdalo en favoritos: la llave no cambia entre arranques.

**Para que el Mac no se duerma** mientras estás fuera, déjalo enchufado y arranca así:

```bash
caffeinate -s node bin/agencia.js abrir --red
```

---

## B · Túnel de Cloudflare (para salir del paso hoy)

Te da una dirección `https://…trycloudflare.com` que llega a tu Mac. No hay que instalar nada en
el móvil.

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:4321
```

Abres la URL que imprime, **añadiéndole `?clave=…`**.

Aviso importante: esa dirección es **pública**. Cualquiera que la adivine llega a la puerta; lo
único que le para es la llave. Sirve para un rato, no para dejarlo puesto. Y cambia con cada
arranque, así que no se puede guardar en favoritos.

---

## C · Un servidor 24/7 (la solución de verdad)

El programa deja de depender de tu portátil: la sesión diaria se ejecuta aunque estés en clase,
y los clientes de vigilancia se reescanean solos.

Sirve cualquier VPS pequeño (Hetzner, DigitalOcean, Contabo…): **2 GB de RAM** son suficientes,
porque Chromium necesita su espacio. Unos 4-6 € al mes.

### Con Docker (lo más limpio)

```bash
git clone https://github.com/operativasimple-glitch/codex.git
cd codex/agencia/despliegue
ANTHROPIC_API_KEY=... docker compose up -d
```

### Sin Docker

```bash
git clone https://github.com/operativasimple-glitch/codex.git
cd codex/agencia
sudo bash despliegue/instalar-en-servidor.sh
```

Deja el servicio arrancado y arrancando solo al reiniciar. La llave de acceso queda en
`datos/acceso.json`.

### Cómo llegas al servidor

**No abras el puerto 4321 al internet abierto.** Dos formas buenas:

- **Tailscale también en el servidor** (lo más simple y lo más seguro): lo instalas allí, y el
  servidor pasa a ser un aparato más de tu red privada. Entras por su IP de Tailscale desde
  cualquier sitio y nada queda expuesto.
- **Un dominio con HTTPS**, poniendo Caddy o Nginx delante para el certificado. Más trabajo, y
  entonces la llave del programa es lo único que separa tus datos de internet: si vas por aquí,
  ponle además autenticación en el proxy.

### Lo que cambia al vivir en un servidor

- Los datos (leads, escaneos, informes, correos) pasan a estar allí, no en tu Mac. Haz copia:
  `datos/` entero, que son ficheros.
- La revisión manual (teclado y lector de pantalla) la sigues haciendo tú en tu Mac: eso no
  se puede mover a un servidor, y es justo lo que estás cobrando.
- Si pones la `ANTHROPIC_API_KEY` allí, el agente trabaja solo de verdad, todos los días.

---

## En los tres casos

- La llave (`?clave=…`) vive en `datos/acceso.json` y no cambia sola. Para cambiarla:
  `node bin/agencia.js abrir --red --nueva-clave` (los enlaces guardados dejan de valer).
- Ahí dentro están los datos de tus clientes y los correos sin mandar. Trátalo como tratarías
  tu correo: no pegues el enlace con la llave en un grupo de WhatsApp.
- Sin `--red`, todo sigue como antes: solo tu propio ordenador.
