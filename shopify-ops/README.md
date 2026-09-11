# shopify-ops

Pipeline para montar productos digitales en Shopify, lanzarlos con publicidad en
Meta y TikTok, y decidir automaticamente que matar y que escalar.

Una oferta = un fichero JSON. De ahi salen la landing, el producto en Shopify,
las paginas legales, las campanas y las reglas de optimizacion.

```bash
npm run ops -- new-offer mi-producto       # 1. plantilla de oferta
npm run ops -- page-build --offer mi-producto   # 2. landing en dist/, con auditoria
npm run ops -- preflight                   # 3. comprueba accesos
npm run ops -- store-setup --offer mi-producto --apply   # 4. Shopify
npm run ops -- ads-launch  --offer mi-producto --apply   # 5. campanas (en pausa)
npm run ops -- optimize    --offer mi-producto           # 6. cada dia
```

Sin `--apply` todo es simulacion: enseña lo que haria y no toca nada.

---

## Que esta automatizado y que no

| | |
|---|---|
| **Automatico** | Landing de venta completa a partir de la oferta · producto digital en Shopify · 4 paginas legales · campana, ad set y anuncios en Meta/TikTok con UTM · informe de gasto contra ventas reales · decisiones de matar, escalar y rotar, ejecutables por cron |
| **Lo haces tu, una vez** | Crear las cuentas de Shopify, Meta y TikTok · verificacion fiscal y bancaria · tokens de API · verificar el dominio en Meta |
| **Lo haces tu, siempre** | Fabricar el producto digital · producir imagenes y videos de los anuncios · decidir que producto vender · responder a soporte |

No se puede automatizar del todo, y quien lo venda asi miente: las plataformas
exigen identidad verificada y datos de pago reales, y el material creativo
todavia lo tiene que producir alguien. Lo que si desaparece es el trabajo
repetitivo: montar la tienda, cablear la medicion y vigilar las metricas todos
los dias.

---

## Instalacion

Node 20 o superior. Sin dependencias externas: solo la libreria estandar.

```bash
cd shopify-ops
cp .env.example .env     # y rellenalo, ver playbooks/01
npm run ops -- preflight
```

---

## Estructura

```
offers/<slug>.json     La oferta: precio, copy, entregables, publico, umbrales
dist/                  Landing generada, para revisar antes de subir
state/                 Ids de campanas y registro de decisiones (fuera de git)
playbooks/             Lo que tienes que hacer tu, paso a paso
src/lib/metrics.js     El motor de decision. Funciones puras, con tests
test/                  node test/metrics.test.js
```

---

## Como decide que matar

`optimize` cruza el gasto de la plataforma con los **pedidos reales de Shopify**
(via UTM: `utm_content` = id del anuncio, `utm_term` = id del ad set). El ROAS
que reporta Meta suele estar inflado por su ventana de atribucion; el que paga
las facturas es el que sale de los pedidos.

Sobre ese dato aplica siete reglas, en orden:

1. Gasto por encima del umbral y **cero ventas** → matar el anuncio.
2. Dentro de la fase de aprendizaje → no tocar nada.
3. Gasto insuficiente → no tocar nada.
4. ROAS por debajo del corte → matar.
5. Frecuencia por encima del limite → rotar creatividad.
6. ROAS por encima del objetivo → subir presupuesto un 20%.
7. En medio → dejar correr.

Los umbrales viven en `economics` dentro de cada oferta. El ROAS de equilibrio
se calcula solo a partir de comisiones y devoluciones.

Si **todos** los ad sets salen para matar, el aviso no es "sube el presupuesto":
es que la oferta no funciona. El playbook 03 explica como diagnosticar si el
problema es el anuncio, la landing o el precio, y en que orden cambiarlos.

---

## Dos cosas que evitan la mayoria de los desastres

**Haz un pedido de prueba real** antes de gastar en anuncios. Con tu tarjeta,
de principio a fin, comprobando que llega el email de entrega y que el pixel
registra la compra. Detecta casi todos los fallos que si no descubres despues
de haberte gastado 200 € en trafico.

**No prometas ingresos en los anuncios.** Ni cifras, ni capturas de Stripe, ni
"resultados garantizados". Es la causa numero uno de cuentas publicitarias
cerradas, y con la cuenta se va el negocio. `page-build` audita el texto y avisa.

---

## Playbooks

1. [Cuentas y accesos](playbooks/01-cuentas-y-accesos.md) — tokens, permisos, verificaciones
2. [Lanzar una oferta](playbooks/02-lanzamiento.md) — de la idea a la campana corriendo
3. [Optimizar](playbooks/03-optimizacion.md) — reglas, diagnostico y escalado
4. [Creatividades](playbooks/04-creatividades.md) — angulos, formatos y politicas

---

## Ejemplo incluido

`offers/pack-notion-freelance.json` es una oferta completa y realista, con copy
de verdad, tres angulos de anuncio y sus umbrales economicos. Sirve de
referencia para escribir la tuya:

```bash
npm run ops -- page-build --offer pack-notion-freelance
open dist/pack-notion-freelance.html
```
