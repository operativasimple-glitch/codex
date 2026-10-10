# Pueblo de bots

Una web donde tus bots viven en un pueblo pixel art. Cada uno tiene su casa y su trabajo, y se ven
caminar y hablar entre ellos: cuando uno le avisa a otro, va hasta su casa y se lo dice en un
bocadillo; lo que es para ti lo deja en tu buzón. Debajo del mapa está el diario con todo lo que se
han dicho y la ficha de cada vecino.

El bot de Kalshi y su panel no se tocan. El pueblo es un servicio aparte que **solo lee** el panel.

## Quién vive aquí

| Vecino | Casa | Qué hace | De dónde saca los datos |
| --- | --- | --- | --- |
| **Kali** | Mercado | Es tu bot de Kalshi visto desde el pueblo: cuenta lo que compra y cobra, y cómo va el día. | El panel del bot (solo lectura). |
| **Nube** | Observatorio | Mira la máxima prevista y la medida hoy en las 7 ciudades del clima. Avisa a Kali si una previsión cambia y a Vigía si una apuesta de temperatura peligra. | Servicio Meteorológico de EE. UU. (api.weather.gov), la misma fuente con la que Kalshi decide. |
| **Vigía** | Torre | Te avisa si una apuesta se hunde, si hay demasiado dinero en una sola o si Kali se acerca al freno de pérdidas. Te pasa los avisos de Nube. | Lo que cuenta Kali. |
| **Radar** | Faro | Cada 20 minutos cuenta los favoritos claros (88–97¢, poco spread) que Kali no mira y se lo dice. | Datos públicos de mercados de Kalshi (sin clave). |
| **Cronista** | Biblioteca | Escribe el diario a las 8:00 y a las 21:30, y una noticia cuando Kali gana o pierde 2 $ o más de golpe. | Lo que cuentan los demás. |

En el mapa también están **tu casa** (con el buzón: la banderita sube cuando hay algo para ti) y dos
solares **próximamente**: el Laboratorio y la Arena (ver *Qué viene después*).

Toca un bot o su casa para ver su ficha. Con **Hablar** te contesta con lo que sabe en ese momento.

## Qué puede y qué no puede hacer

- **No puede comprar, vender ni cambiar nada.** Solo pide al panel su estado, posiciones,
  resultados, registro y nombres de mercados; cualquier otra petición se rechaza en el propio
  código (`pueblo/sources/panel.py`).
- No usa tu clave de Kalshi. Radar solo mira datos públicos.
- La web tiene su propia contraseña (`PUEBLO_PASSWORD`), distinta de la del panel. Tras 5 intentos
  fallidos se bloquea un minuto.

## Verlo ya

En la pantalla de entrada hay un botón **Ver una demostración**: el mismo pueblo con datos
inventados, sin contraseña ni servidor. También se abre añadiendo `#demo` a la dirección.

La luz sigue tu hora (de noche se encienden las ventanas, las farolas y el faro). Para verlo a
otra hora: `#noche`, `#tarde` o `#dia` al final de la dirección.

## Ponerlo en Railway

Es un servicio nuevo en el mismo proyecto del bot. **Crearlo no reinicia el bot.**

1. En tu proyecto de Railway, pulsa **+ New** → **GitHub Repo** y elige
   `operativasimple-glitch/codex`.
2. En el servicio nuevo, **Settings → Source**: rama `claude/kalshi-bot-kjmcj6` y
   **Root Directory** `/pueblo`.
3. En **Variables** pon:

   | Variable | Qué poner |
   | --- | --- |
   | `PUEBLO_PASSWORD` | Una contraseña nueva para entrar al pueblo (8 caracteres o más). |
   | `PANEL_URL` | La dirección de tu panel, la misma que abres en el móvil (empieza por `https://`). |
   | `PANEL_PASSWORD` | La contraseña del panel. Si algún día la cambias allí, cámbiala aquí también. |
   | `PUEBLO_TZ` | `America/Chicago` (tu hora, para el diario de la mañana y de la noche). |
   | `PUEBLO_CONTACT` | Opcional: un correo de contacto; el servicio del tiempo pide que las apps se identifiquen. |

4. Añade un **Volume** a este servicio con **Mount path** `/data`. Ahí guarda el pueblo su memoria
   (los mensajes y lo que recuerda cada bot), para que un reinicio no la borre.
5. En **Settings → Networking**, pulsa **Generate Domain**.
6. Abre esa dirección en el iPhone, entra con `PUEBLO_PASSWORD` y, desde Safari, **Compartir →
   Añadir a pantalla de inicio**.

Si la ficha de Kali dice "Kali todavía no ve su panel", revisa `PANEL_URL` y `PANEL_PASSWORD`.
Si dice "Tengo problemas", el motivo sale en su estado; los bots lo reintentan solos, cada vez
con más calma para no saturar a nadie.

## Qué viene después

1. **Ahora: ayudantes.** Miran, se avisan entre ellos y te avisan a ti. No mueven dinero.
2. **Laboratorio y Arena.** En el Laboratorio, una Investigadora probará estrategias nuevas con
   mercados ya cerrados (como la simulación de 100 $), sin gastar nada. Las que parezcan ganar
   pasarán a la Arena, donde los Probadores operarán con dinero de mentira en mercados de verdad
   durante semanas.
3. **Dinero real, solo con permiso.** Un bot de la Arena solo usará dinero real si ha demostrado
   que gana, si tú lo apruebas y con un presupuesto pequeño que elijas tú. Si Kalshi lo permite,
   en una subcuenta aparte para que no se mezcle con Kali.

## Para programar

```bash
cd pueblo
pip install -r requirements-dev.txt
pytest
PUEBLO_PASSWORD=una-contraseña python -m pueblo   # http://localhost:8090
```

Un vecino nuevo es una clase de `pueblo/agents/` que hereda de `Agent`: le das `id`, `name`,
`role`, `home`, `color` e `interval`, y en `tick()` hace su trabajo, cuenta cómo está con
`self.status(...)` y habla con `self.say(texto, to="kali" | "tu" | "todos")`. Lo que tenga que
recordar va en `self.memory`. Después se añade a `build_agents()` en `pueblo/agents/__init__.py`;
la web lo enseña sola (si su casa aún no existe en el mapa, vive junto a la plaza).

Las letras del pueblo son Pixelify Sans y Atkinson Hyperlegible, con licencia SIL Open Font
License (los textos de la licencia están en `pueblo/web/static/fonts/`).
