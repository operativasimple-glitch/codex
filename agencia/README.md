# El programa que corre la agencia

Sistema operativo de una agencia de cumplimiento digital para pymes españolas: audita webs
contra WCAG 2.1 AA (Ley 11/2023), redacta los informes, escribe los correos con los hallazgos
reales dentro, vigila a los clientes mes a mes y dice qué toca hacer cada día.

Está construido sobre el paquete de contexto del negocio: es la versión ejecutable del
fichero `06-audit-script.js` (que solo miraba la portada desde la consola del navegador) y del
plan comercial del fichero `04`.

## Puesta en marcha

**En un Mac:** doble clic en `Abrir-agencia.command`. La primera vez instala lo que hace falta
(unos minutos); después abre **la aplicación en el navegador**, que es donde está todo: botones
para auditar, los informes, la bandeja de correos y el panel. La ventana negra de la terminal hay
que dejarla abierta mientras se usa: es el programa por dentro.

La primera vez macOS puede decir que no puede abrirlo por venir de internet: clic derecho sobre
el fichero → Abrir → Abrir. Solo pasa una vez.

**A mano:**

```bash
cd agencia
npm install                      # Playwright
npx playwright install chromium  # solo si no está ya el navegador
node bin/agencia.js ayuda
```

Para escribir `agencia` a secas en cualquier sitio: `npm link` dentro de esta carpeta.

Opcional, para que Claude redacte el resumen de dirección y adapte los correos:

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=...
```

Sin eso, todo funciona igual con las plantillas.

## La aplicación

```bash
node bin/agencia.js abrir        # o doble clic en Abrir-agencia.command
```

Abre `http://localhost:4321` con la aplicación:

- **Panel** — marcador, embudo y las acciones pendientes, cada una con su botón.
- **Leads** — los 20, con su estado. Botón para auditar, para escribir el correo, para
  cambiar el estado o anotar la web que falte.
- **Auditorías** — cada escaneo con sus hallazgos y el enlace a su informe en HTML y PDF.
- **Bandeja** — los correos preparados: leerlos, copiarlos y marcarlos como enviados.
- **Bitácora** — todo lo que ha hecho el programa.

Arriba del todo, un bloque dice **qué es lo siguiente** y trae el botón que lo hace: auditar la
cartera, mandar los correos que esperan, conseguir más leads o la sesión del día. Cambia solo según
cómo esté el negocio.

Arriba, los tres botones grandes: **auditar la cartera entera**, **hacer la sesión de hoy** y
**ver qué haría** (simulacro). Mientras algo está en marcha se ve el avance línea a línea; una
auditoría tarda minutos y la página no se queda colgada.

Solo escucha en `127.0.0.1`: no es un servidor de internet, es la ventana del programa.

Si el puerto 4321 está ocupado se busca el siguiente libre solo. Y si lo que lo ocupa es otra copia
de la propia aplicación (pasa al abrirla dos veces), no se levanta una segunda: se abre la que ya
estaba corriendo.

## Los leads no se acaban

Cuando quedan menos de **cinco leads por contactar**, el programa lo avisa y repone solo. Los
candidatos salen de dos sitios: de `datos/cantera.json` (lo que hayas ido apuntando tú, o pegado en
la aplicación) y, si hay clave de API, de Claude, que propone empresas del perfil que falte.

La regla que hace esto fiable: **ningún candidato entra en la lista sin que su web responda de
verdad**. Se comprueba cargándola antes de darla por buena, y lo que no responde se descarta con su
motivo — "ese dominio no existe", "tarda demasiado en responder". Así, que un modelo se invente una
empresa es inofensivo: no llega nunca a la lista.

El repuesto salta solo al principio de cada sesión automática, y también se puede pedir a mano
desde la aplicación o con `agencia auto`.

## De cero a la cartera entera, desde la terminal

```bash
node bin/agencia.js arranque
```

Carga los 20 leads, audita la web de cada uno, saca su diagnóstico en PDF y deja su correo
escrito en la bandeja. Entre veinte minutos y una hora según cuántas webs sean: se lanza y se
deja corriendo. Al volver: `agencia bandeja` para ver qué hay que mandar y `agencia panel --abrir`
para ver cómo ha quedado.

A partir de ahí, el trabajo del día es `agencia auto`.

## La sesión automática

```bash
agencia auto --simulacro     # enseña lo que haría, sin tocar nada
agencia auto                 # lo hace
```

Una sesión mira el estado real del negocio y ejecuta la cadena entera de cada lead:
**audita su web → saca el diagnóstico en PDF → deja el correo escrito en la bandeja**, con
los hallazgos reales dentro. Después reescanea a los clientes de vigilancia que toquen,
cierra los leads que ya no van a contestar, regenera el panel y escribe un resumen.

Hay dos motores, con las mismas herramientas y los mismos límites:

- **Con `ANTHROPIC_API_KEY`**: dirige Claude. Decide a quién auditar y por qué, con qué
  plantilla escribir a cada uno y qué dejar anotado. Es un bucle de uso de herramientas real:
  no propone, ejecuta.
- **Sin clave (`--sin-ia`, o automático si no hay clave)**: piloto determinista que ejecuta
  las reglas del plan comercial en orden. No cuesta nada y hace el mismo trabajo mecánico.

Presupuesto por sesión, para que no se desmande:

```bash
agencia auto --auditorias 4 --informes 6 --correos 6 --pasos 24
agencia auto --mision "hoy solo los clientes de vigilancia y las agencias de Madrid"
```

### Lo que el agente NO puede hacer

Esto no está en el prompt, está en el código (`src/agente/herramientas.js`), así que no lo
puede cambiar ni una instrucción ni el texto de una web auditada:

| No puede | Por qué |
|---|---|
| Enviar correos | Los deja en la bandeja y los manda una persona, por el formulario del cliente o LinkedIn. En España el correo comercial no solicitado está regulado, y un agente disparando correos quema la lista y la marca |
| Marcar a alguien como "respondido", "llamada" o "cliente" | Eso lo sabe quien ha leído la respuesta o cobrado la factura |
| Entregar el informe completo de pago | Requiere la revisión manual con teclado y lector de pantalla, que hace una persona |
| Auditar webs fuera de la lista | Solo leads y clientes dados de alta |
| Saltarse el presupuesto de la sesión | Auditorías, informes, correos y pasos están contados |

Todo lo que hace queda en `datos/bitacora.jsonl`: `agencia bitacora`.

### La bandeja

```bash
agencia bandeja                          # correos preparados, esperándote
agencia bandeja amarillo-limon-agencia-2026-09-04          # ver uno entero
agencia bandeja amarillo-limon-agencia-2026-09-04 --enviado  # cuando lo hayas mandado
```

Marcarlo como enviado es lo que mueve el lead a "contactado" y arranca el reloj de los
siete días del recordatorio.

### Dejarlo corriendo solo

Una sesión al día, de lunes a viernes a las 8 de la mañana (hora de Misuri, que son las 15:00
en España: justo cuando abre la ventana de llamadas). En un fichero `~/agencia-diaria.sh`:

```bash
#!/bin/bash
export ANTHROPIC_API_KEY=...            # opcional: sin esto corre el piloto sin IA
cd /ruta/a/codex/agencia
/usr/local/bin/node bin/agencia.js auto >> datos/auto.log 2>&1
```

```bash
chmod +x ~/agencia-diaria.sh
crontab -e
# 0 8 * * 1-5 /Users/oscar/agencia-diaria.sh
```

Por la mañana: `agencia bandeja` para ver qué hay que mandar, y `agencia panel --abrir`
para ver cómo va el negocio.

## El día a día

```bash
agencia hoy                                  # qué toca ahora, en orden, con el comando de cada cosa
agencia leads --sembrar                      # carga los 20 leads del paquete de contexto
agencia auditar amarillolimon.net            # rastrea la web entera, guarda escaneo y capturas
agencia manual <escaneo>                     # la revisión a mano: el 43 % que no ve ninguna herramienta
agencia informe <escaneo> --pdf              # informe completo, HTML autocontenido y PDF
agencia informe <escaneo> --tipo diagnostico # el gancho gratuito de dos páginas
agencia correo amarillo-limon --nombre Ana   # el correo, con los tres hallazgos reales dentro
agencia cliente "Alcalink" --plan vigilancia --cuota 300
agencia vigilar alcalink                     # reescaneo mensual y alerta de regresiones
agencia panel --abrir                        # el panel del negocio
```

## Qué hace cada pieza

| Pieza | Fichero | Qué resuelve |
|---|---|---|
| Comprobaciones | `src/auditoria/comprobaciones.js` | 16 comprobaciones WCAG dentro de la página, solo sobre elementos visibles, marcando cada elemento infractor para capturarlo |
| Motor | `src/auditoria/motor.js` | Rastrea el sitio entero priorizando compra y contacto, captura cada fallo con su contexto y consolida el escaneo |
| Catálogo | `src/auditoria/catalogo.js` | La traducción de fallo técnico a lenguaje de gerente, con el arreglo, el criterio y los minutos de corrección |
| Revisión manual | `src/auditoria/manual.js` | Guion de 12 comprobaciones de teclado y lector de pantalla. Es lo que justifica los 1.200 € |
| Informes | `src/informe/` | HTML autocontenido (capturas incrustadas) y PDF, con el marco legal y los límites siempre presentes |
| Correos | `src/crm/correos.js` | Las cinco plantillas del plan, rellenadas con los hallazgos del escaneo. No deja escribir sin auditar antes |
| Cantera | `src/crm/cantera.js` | De dónde salen los leads nuevos, y la verificación que impide que entre una empresa inventada |
| Aplicación | `src/web/` | El servidor local, la cola de trabajos y la página con botones |
| Vigilancia | `src/vigilancia/monitor.js` | Compara con el escaneo anterior y saca las regresiones. Es la cuota recurrente |
| Agente | `src/agente/hoy.js` | Decide las siguientes acciones según las reglas del plan comercial |
| Panel | `src/panel/panel.js` | Embudo, recurrente, auditorías y cuenta atrás de los 90 días |
| Herramientas | `src/agente/herramientas.js` | Lo único que el agente se permite hacer solo, con sus límites y su presupuesto |
| Agente autónomo | `src/agente/autonomo.js` | Bucle de uso de herramientas con Claude: mira el estado, decide y ejecuta |
| Piloto | `src/agente/piloto.js` | El mismo trabajo sin IA, ejecutando las reglas en orden |
| IA | `src/agente/ia.js` | Capa opcional con Claude para redactar. Con reglas duras: no certifica, no asesora, no inventa cifras |

## Reglas del negocio que el programa hace cumplir

- **Nunca se escribe a nadie sin haber auditado antes su web.** `agencia correo` exige un escaneo.
- **Ningún informe dice que el cliente cumple la ley.** Los límites van impresos en todos.
- **Un solo recordatorio a los 7 días**; después el lead se cierra.
- **Las cifras automáticas no se mandan sin verificar**: los hallazgos que exigen ojo humano van marcados
  como tales, y el informe completo avisa mientras falte la revisión manual.
- **Ventana de llamadas 15:00-18:00 en España** (8:00-11:00 en Misuri): `agencia hoy` dice si está abierta.
- **A los 90 días**: con dos clientes pagando, sigue; con cero, el propio programa lo recuerda.

## Dónde están los datos

Todo en `datos/`, en ficheros que se pueden abrir y editar a mano:

```
datos/estado.json       leads, clientes y eventos (con copia .bak en cada escritura)
datos/escaneos/         un JSON por auditoría, con hallazgos, totales y esfuerzo
datos/capturas/         las capturas de pantalla de cada fallo
datos/informes/         los HTML y PDF que se mandan al cliente, y el panel
datos/correos/          cada correo generado a mano, con su fecha
datos/bandeja/          los correos que ha preparado el agente y esperan tu visto bueno
datos/bitacora.jsonl    todo lo que ha hecho el agente, paso a paso
datos/leads-semilla.json  los 20 leads del paquete de contexto
```

Nada sale de la máquina salvo las peticiones a las webs auditadas y, si se activa, las llamadas a Claude.

## Configuración

Copia `agencia.config.json.ejemplo` a `agencia.config.json` y cambia marca, correo y precios.
El resto de valores por defecto están en `src/config.js`.
