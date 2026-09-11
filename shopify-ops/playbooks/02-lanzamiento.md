# 2 · Lanzar una oferta

De cero a campana corriendo. Una vez tienes los accesos, son unas 4 horas por producto.

---

## 2.1 Elegir que vender

Un producto digital vendible con trafico frio cumple tres cosas:

1. **Resuelve un problema que el comprador ya sabe que tiene.** No tienes que
   educarle: eso cuesta mucho dinero en anuncios.
2. **Se entrega entero en el momento del pago.** Nada de cohortes ni de "empieza el lunes".
3. **Cuesta entre 19 € y 49 €.** Por debajo de 15 € el CAC se come el margen.
   Por encima de 60 € necesitas mas prueba social de la que tienes al empezar.

Formatos que funcionan: plantillas (Notion, Excel, Figma), packs de recursos,
guias muy especificas, presets, checklists de un oficio concreto.

**Regla de decision**: si no puedes escribir la promesa en una frase con un
resultado y un plazo, todavia no tienes producto.

---

## 2.2 Crear la oferta

```bash
npm run ops -- new-offer mi-producto
```

Rellena `offers/mi-producto.json`. Lo que mas mueve la conversion, en orden:

| Campo | Por que importa |
|---|---|
| `headline` | Es el 80% de la decision. Resultado concreto, menos de 70 caracteres. |
| `deliverables` | Descomponer sube el valor percibido. 5 piezas valen mas que "un ebook". |
| `guarantee` | En trafico frio sin marca, la garantia es lo que desbloquea la compra. |
| `faq` | Cada objecion sin responder es una venta perdida. Minimo 5. |
| `pains` | Si el lector no se reconoce en los tres primeros, se va. |

Revisa como queda:

```bash
npm run ops -- page-build --offer mi-producto
open dist/mi-producto.html
```

El comando audita la oferta y avisa de lo que falta. Hazle caso: el aviso de
promesas de ingresos evita que te cierren la cuenta publicitaria.

---

## 2.3 Producir el producto

La landing promete `deliverables`. Ahora hay que fabricarlos. Si son plantillas,
montalas. Si es un PDF, escribelo. **Hazlo antes de anunciar**: vender algo que
no existe todavia es la forma mas rapida de acabar devolviendo el dinero.

Sube el fichero (o el enlace de duplicado de Notion) a la app Digital Downloads
y adjuntalo al producto.

---

## 2.4 Montar la tienda

```bash
npm run ops -- store-setup --offer mi-producto           # simulacion
npm run ops -- store-setup --offer mi-producto --apply   # de verdad
```

Crea el producto digital, la landing en `/pages/mi-producto` y las cuatro
paginas legales. Es idempotente: puedes repetirlo sin duplicar nada.

**Antes de gastar un euro en anuncios:**

- [ ] Rellena razon social, NIF y domicilio en las paginas legales
- [ ] Adjunta el fichero descargable con Digital Downloads
- [ ] Haz un **pedido de prueba real** con tu tarjeta y comprueba que llega el email
- [ ] Comprueba que el pixel registra `Purchase` en ese pedido de prueba
- [ ] Abre la landing en tu movil, no solo en el ordenador

Ese pedido de prueba detecta el 90% de los fallos que de otro modo descubres
habiendo gastado 200 € en trafico.

---

## 2.5 Lanzar la campana

```bash
npm run ops -- ads-launch --offer mi-producto --platform meta           # simulacion
npm run ops -- ads-launch --offer mi-producto --platform meta --apply
```

Crea campana, un ad set y un anuncio por variante. **Todo queda en pausa**:
lo revisas en el administrador y lo activas tu.

Estructura de arranque, deliberadamente simple:

- **1 campana**, objetivo ventas
- **1 ad set**, publico amplio (pais + rango de edad, nada mas)
- **3 anuncios** con tres angulos distintos del mismo producto

Con 20 €/dia no hay presupuesto para mas ad sets: repartir el gasto entre
cinco publicos solo consigue que ninguno salga de la fase de aprendizaje.

Presupuesto minimo para que la prueba signifique algo: **precio × 3 al dia,
durante 5 dias.** Para un producto de 34 €, unos 100 €/dia... que casi nadie
empieza gastando. La alternativa realista: 20 €/dia durante 10 dias y aceptar
que las conclusiones llegan mas despacio.

---

## 2.6 Los primeros tres dias

No toques nada. En serio.

Meta necesita ~50 eventos de compra por ad set para salir del aprendizaje.
Cada cambio de presupuesto, publico o creatividad reinicia ese contador.
El impulso de "pausar el que va mal" el segundo dia es lo que impide que
ninguna campana llegue a funcionar.

Mira los datos, no los toques:

```bash
npm run ops -- report --offer mi-producto --days 3
```
