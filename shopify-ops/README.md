# shopify-ops

Una maquina para probar productos digitales en serie: montar la tienda, pagar
anuncios, darle una semana con tope de gasto, y si no funciona, pararlo y pasar
al siguiente.

```
idea → montar (1 tarde) → test con tope (1 semana) → veredicto
                                                        ├── KILL    → siguiente producto
                                                        ├── ITERATE → un cambio, otra vuelta
                                                        └── WINNER  → escalar
```

Una oferta = un fichero JSON. De ahi salen la landing, el producto en Shopify,
las paginas legales, las campanas, los umbrales y las reglas de decision.

```bash
npm run ops -- new-offer   mi-producto                    # 1. plantilla de oferta
npm run ops -- page-build  --offer mi-producto            # 2. landing en dist/
npm run ops -- store-setup --offer mi-producto --apply    # 3. Shopify
npm run ops -- ads-launch  --offer mi-producto --apply    # 4. campanas (en pausa)
npm run ops -- test-start  --offer mi-producto --budget 150   # 5. abre el test
npm run ops -- cycle       --offer mi-producto --apply    # 6. cada dia, por cron
npm run ops -- board                                      # la cartera entera
```

Sin `--apply` todo es simulacion: enseña lo que haria y no toca nada.

---

## La idea que lo sostiene

**Matar es barato. Coronar es caro.** Con un producto de 34 €, demostrar que NO
funciona cuesta 92 €; demostrar que SI funciona cuesta 124 €. Por eso puedes
descartar productos en serie con poco dinero, y por eso `test-start` te dice,
**antes de gastar**, si tu tope da para concluir algo:

```
Para descartar hacen falta 91,89 € sin ventas — el tope llega
Para confirmar un ganador hacen falta 123,64 € — el tope no llega
```

**El tope de gasto es sagrado.** `cycle` para las campanas en cuanto se alcanza,
pase lo que pase. Es la unica promesa dura que hace el sistema.

**Nunca mata algo rentable.** Si el ROAS esta sobre el equilibrio pero bajo el
objetivo, el veredicto es iterar, no matar.

**El veredicto de muerte se adelanta.** Cero ventas con gasto suficiente mata el
dia 3, sin agotar ni la semana ni el tope. Ese ahorro es la mitad del sistema.

---

## Que esta automatizado y que no

| | |
|---|---|
| **Automatico** | Landing de venta completa a partir de la oferta · producto digital en Shopify · 4 paginas legales · campana, ad set y anuncios en Meta/TikTok con UTM · informe de gasto contra ventas reales · **tope de gasto que se respeta solo** · veredicto diario de matar/iterar/escalar · registro de la cartera y de lo aprendido |
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
state/pipeline.json    La cartera: que se prueba, que murio y que se aprendio
state/<slug>.launch.*  Ids de campanas, para poder pararlas
playbooks/             Lo que tienes que hacer tu, paso a paso
src/lib/verdict.js     Veredicto del test: matar, iterar o escalar
src/lib/metrics.js     Decisiones dentro de la campana
test/                  42 pruebas, sin red:  npm test
```

Los dos motores de decision son funciones puras y estan cubiertos por tests.
Se pueden auditar sin gastar un euro.

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
5. [**El ciclo de productos**](playbooks/05-ciclo-de-productos.md) — **probar en serie, cuanto cuesta y cuando parar**

---

## Ejemplo incluido

`offers/pack-notion-freelance.json` es una oferta completa y realista, con copy
de verdad, tres angulos de anuncio y sus umbrales economicos. Sirve de
referencia para escribir la tuya:

```bash
npm run ops -- page-build --offer pack-notion-freelance
open dist/pack-notion-freelance.html
```
