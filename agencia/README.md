# El programa que corre la agencia

Sistema operativo de una agencia de cumplimiento digital para pymes españolas: audita webs
contra WCAG 2.1 AA (Ley 11/2023), redacta los informes, escribe los correos con los hallazgos
reales dentro, vigila a los clientes mes a mes y dice qué toca hacer cada día.

Está construido sobre el paquete de contexto del negocio: es la versión ejecutable del
fichero `06-audit-script.js` (que solo miraba la portada desde la consola del navegador) y del
plan comercial del fichero `04`.

## Puesta en marcha

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
| Vigilancia | `src/vigilancia/monitor.js` | Compara con el escaneo anterior y saca las regresiones. Es la cuota recurrente |
| Agente | `src/agente/hoy.js` | Decide las siguientes acciones según las reglas del plan comercial |
| Panel | `src/panel/panel.js` | Embudo, recurrente, auditorías y cuenta atrás de los 90 días |
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
datos/correos/          cada correo generado, con su fecha
datos/leads-semilla.json  los 20 leads del paquete de contexto
```

Nada sale de la máquina salvo las peticiones a las webs auditadas y, si se activa, las llamadas a Claude.

## Configuración

Copia `agencia.config.json.ejemplo` a `agencia.config.json` y cambia marca, correo y precios.
El resto de valores por defecto están en `src/config.js`.
