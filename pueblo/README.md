# Pueblo de bots

Una web donde tus bots viven en una **base 3D** flotando en el espacio: nueve salas, y cada bot
camina a la sala de lo que está haciendo **de verdad**. Kali va al Mercado cuando su panel dice que
ha puesto una orden o comprado, a la Bóveda cuando cobra o mira el saldo, al Laboratorio cuando
repasa mercados; Radar trabaja en el Laboratorio, Nube en el Observatorio... Encima de cada uno sale
una etiqueta con lo que hace ("compra 5 SÍ a 93¢ · Miami 88°–89°"), y cuando uno le avisa a otro va
hasta él y se lo dice en un bocadillo. Lo que es para ti llega a la terminal del Puente.

Debajo están el diario con todo lo que se han dicho, lo que es para ti, el **Consejo** y la ficha de
cada vecino. El pueblo pixel de antes sigue ahí: enlace **Ver el pueblo pixel** al pie de la página
(o `#pixel` al final de la dirección). Si el móvil no puede con el 3D, sale el pixel solo.

El bot de Kalshi y su panel no se tocan. El pueblo es un servicio aparte que **solo lee** el panel.

## Quién vive aquí

| Vecino | Sala | Qué hace | De dónde saca los datos |
| --- | --- | --- | --- |
| **Kali** | Mercado | Es tu bot de Kalshi visto desde la base: cuenta lo que compra y cobra, y cómo va el día. Va a la sala de cada cosa que hace en su panel. | El panel del bot (solo lectura). |
| **Nube** | Observatorio | Mira la máxima prevista y la medida hoy en las 7 ciudades del clima. Avisa a Kali si una previsión cambia y a Vigía si una apuesta de temperatura peligra. | Servicio Meteorológico de EE. UU. (api.weather.gov), la misma fuente con la que Kalshi decide. |
| **Vigía** | Puente | Te avisa si una apuesta se hunde, si hay demasiado dinero en una sola o si Kali se acerca al freno de pérdidas. | Lo que cuenta Kali. |
| **Radar** | Laboratorio | Cada 20 minutos cuenta los favoritos claros (88–97¢, poco spread) que Kali no mira. | Datos públicos de mercados de Kalshi (sin clave). |
| **Cronista** | Archivo | Escribe el diario a las 8:00 y a las 21:30 (con quién va ganando en el Consejo) y una noticia cuando Kali gana o pierde 2 $ o más de golpe. | Lo que cuentan los demás. |
| **Investigadora** | Consejo | Trae al Consejo los mercados de clima que se deciden pronto y las apuestas abiertas de Kali, apunta las apuestas de mentira y lleva el marcador. Avisa a Kali si el Consejo cree que una de sus apuestas vale bastante menos de lo que pagó. | Datos públicos de Kalshi y lo que cuentan Nube y Kali. |
| **El Consejo** | Consejo | Cinco personajes que piensan distinto (ver abajo) y, si quieres, Claude. | Lo mismo que la Investigadora. |

Las salas **Pruebas** y **Forja** están marcadas como *pronto* (ver *Qué viene después*).

Toca una sala para acercarte (dentro se ve qué hace cada uno); tócala otra vez para ver quién está.
Toca un bot para ver su ficha; con **Hablar** te contesta con lo que sabe en ese momento.

## El Consejo: ¿quién acertó?

Cada personaje da su **precio justo** (de 0 a 100¢) para cada mercado:

| Personaje | Cómo piensa |
| --- | --- |
| **Cazatormentas** | Calcula la probabilidad de cada tramo de temperatura con la máxima prevista y lo ya medido hoy. Solo opina del clima. |
| **Piloto** | Los favoritos claros ganan un poco más de lo que dice su precio. Es la idea de Kali. |
| **Dinero Listo** | Si el precio ha subido en el día, seguirá subiendo (y al revés). |
| **Miedo** | Todo le parece incierto: acerca cualquier precio al 50 %. |
| **Codicia** | El que va ganando ganará seguro: aleja cualquier precio del 50 %. |
| **Claude** (opcional) | Lee cada mercado con los datos del tiempo y da su probabilidad con una frase. |

Cuando el precio justo de uno se separa del mercado más que la comisión de Kalshi (2¢ de ventaja
ya restada la comisión), **apuesta 1 contrato de mentira**. Cuando el mercado se decide, se apunta
solo lo que habría ganado o perdido. La pestaña **Consejo** enseña el marcador y, para cada
mercado, una tira con el precio del mercado (la raya), el de cada personaje (los puntos) y la
mediana del Consejo (el rombo). Kali ve en su ficha lo que el Consejo cree que vale cada apuesta.

**Nada de esto mueve dinero.** Sirve para ver, durante semanas, qué manera de pensar gana de
verdad antes de plantearse nada más.

### Claude en el Consejo (opcional, cuesta dinero)

Si pones `ANTHROPIC_API_KEY`, Claude se sienta en el Consejo. Cada pregunta cuesta dinero de tu
cuenta de Anthropic: alrededor de 1–2 céntimos. Con el límite de 12 preguntas al día son unos
0,20 $ al día. Sin la clave, el Consejo funciona igual con los otros cinco.

| Variable | Qué poner |
| --- | --- |
| `ANTHROPIC_API_KEY` | Tu clave de la API de Anthropic (console.anthropic.com). |
| `PUEBLO_AI_MAX_CALLS` | Preguntas a Claude al día (12 si no pones nada; 0 lo apaga). |
| `PUEBLO_AI_MODEL` | Opcional: el modelo (`claude-opus-5-5` si no pones nada). |

## Qué puede y qué no puede hacer

- **No puede comprar, vender ni cambiar nada.** Solo pide al panel su estado, posiciones,
  resultados, registro y nombres de mercados; cualquier otra petición se rechaza en el propio
  código (`pueblo/sources/panel.py`).
- No usa tu clave de Kalshi. Radar, la Investigadora y el Consejo solo miran datos públicos.
- Las apuestas del Consejo son de mentira: no hay ninguna forma de que compren de verdad.
- La web tiene su propia contraseña (`PUEBLO_PASSWORD`), distinta de la del panel. Tras 5 intentos
  fallidos se bloquea un minuto.

## Verlo ya

En la pantalla de entrada hay un botón **Ver una demostración**: la misma base con datos
inventados, sin contraseña ni servidor. También se abre añadiendo `#demo` a la dirección
(`#demo-pixel` para la demostración del pueblo pixel).

En el pueblo pixel la luz sigue tu hora. Para verlo a otra hora: `#noche`, `#tarde` o `#dia`.

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

1. **Ahora: ayudantes y el Consejo.** Miran, se avisan entre ellos y te avisan a ti, y el
   Consejo apuesta de mentira para ver qué manera de pensar gana. No mueven dinero.
2. **Pruebas y Forja.** En Pruebas se probará cada idea con meses de mercados ya cerrados (como
   la simulación de 100 $). Con lo que funcione en Pruebas y en el marcador del Consejo, en la
   Forja se harán bots nuevos que seguirán con dinero de mentira durante semanas.
3. **Dinero real, solo con permiso.** Un bot solo usará dinero real si ha demostrado que gana, si
   tú lo apruebas y con un presupuesto pequeño que elijas tú. Si Kalshi lo permite, en una
   subcuenta aparte para que no se mezcle con Kali.

## Para programar

```bash
cd pueblo
pip install -r requirements-dev.txt
pytest
PUEBLO_PASSWORD=una-contraseña python -m pueblo   # http://localhost:8090
```

Un vecino nuevo es una clase de `pueblo/agents/` que hereda de `Agent`: le das `id`, `name`,
`role`, `home` (su sala), `color` e `interval`, y en `tick()` hace su trabajo, dice a qué sala va
con `self.doing("mercado", "compra 5 SÍ…")`, cuenta cómo está con `self.status(...)` y habla con
`self.say(texto, to="kali" | "tu" | "todos")`. Lo que tenga que recordar va en `self.memory`.
Después se añade a `build_agents()` en `pueblo/agents/__init__.py`; la web lo enseña sola.

Las salas son `mercado`, `laboratorio`, `observatorio`, `consejo`, `boveda`, `puente`, `archivo`,
`pruebas` y `forja`. La base 3D está en `pueblo/web/static/base3d.js` y usa Three.js 0.160
(licencia MIT, en `pueblo/web/static/vendor/`).

Las letras del pueblo son Pixelify Sans y Atkinson Hyperlegible, con licencia SIL Open Font
License (los textos de la licencia están en `pueblo/web/static/fonts/`).
