# 5 · El ciclo: probar productos en serie

Esto no va de acertar con un producto. Va de montar una maquina que descarta
productos rapido y barato hasta que uno funciona.

```
idea → montar (1 tarde) → test con tope (1 semana) → veredicto
                                                        ├── KILL    → siguiente producto
                                                        ├── ITERATE → un cambio, otra vuelta
                                                        └── WINNER  → escalar
```

---

## 5.1 La asimetria que lo hace posible

**Matar es barato. Coronar es caro.**

Con el producto de ejemplo a 34 €:

| | Gasto necesario |
|---|---|
| Demostrar que **no** funciona | **92 €** |
| Demostrar que **si** funciona | **124 €** |

Si gastas 92 € y no vendes nada, un producto minimamente rentable habria dado
unos 3 pedidos. No verlos no es mala suerte: es una probabilidad del 5%. Ya
tienes tu respuesta.

Para lo contrario hace falta mas: dos ventas con suerte no demuestran nada.

Por eso `test-start` te dice, **antes de gastar**, que puede concluir tu tope:

```
Para descartar hacen falta 91,89 € sin ventas — el tope llega
Para confirmar un ganador hacen falta 123,64 € — el tope no llega
```

Un test que no llega ni al primer umbral no es un test barato: es dinero tirado
sin informacion a cambio.

---

## 5.2 Lo que cuesta el ciclo

Numeros para calibrar expectativas, no una promesa:

- **Un test completo**: 100-150 € y una semana.
- **Tasa de acierto realista empezando**: entre 1 de cada 5 y 1 de cada 10.
- **Coste de encontrar el primero que funciona**: entre 500 € y 1.500 €.

La mitad de los tests mueren antes de agotar el tope, porque el veredicto de
cero ventas llega el dia 3. Eso abarata la media bastante.

Si no tienes 500 € que puedas perder enteros sin que te cambie la vida, este
modelo no es para ti todavia. No es una cuestion de actitud: es que el proceso
necesita varias tiradas para funcionar, y con una sola tirada es una apuesta.

---

## 5.3 Abrir un test

```bash
npm run ops -- test-start --offer mi-producto --days 7 --budget 150
```

Queda registrado con fecha de caducidad, tope de gasto y numero de intento.
A partir de ahi, **el tope es sagrado**: `cycle` para el gasto en cuanto se
alcanza, pase lo que pase. Es la unica promesa dura que hace el sistema.

---

## 5.4 El comando de cada dia

```bash
npm run ops -- cycle --offer mi-producto --apply
```

Hace cinco cosas, en este orden:

1. Mira gasto real contra ingresos reales de Shopify.
2. Si se ha tocado el tope, **para el gasto antes de nada mas**.
3. Dicta veredicto sobre el producto entero.
4. Si el test sigue vivo, optimiza dentro de el (mata anuncios malos, escala buenos).
5. Si el veredicto es matar, para todo y lo archiva con su aprendizaje.

En cron, una vez al dia:

```cron
0 9 * * * cd /ruta/shopify-ops && npm run ops -- cycle --offer mi-producto --apply >> state/cron.log 2>&1
```

> Corre una semana **sin** `--apply` antes de automatizarlo. Lee el log cada
> dia y comprueba que las decisiones coinciden con las que habrias tomado tu.

---

## 5.5 Los cinco veredictos

| Veredicto | Que significa | Que hace |
|---|---|---|
| **RUNNING** | El test sigue vivo | Optimiza dentro de la campana |
| **KILL** | No funciona, y hay datos para afirmarlo | Para todo, archiva el aprendizaje |
| **ITERATE** | Hay senal, pero algo falla | Para el gasto y te dice **que** cambiar |
| **EXTEND** | Pinta bien con muy pocos pedidos | Para en el tope y pide permiso para ampliar |
| **WINNER** | Funciona y hay datos | Sale de prueba y entra en escalado |

Dos reglas que importan mas de lo que parecen:

- **Nunca mata algo rentable.** Si el ROAS esta por encima del equilibrio pero
  por debajo del objetivo, el veredicto es ITERATE. Gana poco dinero, pero gana.
- **El veredicto de muerte se adelanta.** Cero ventas con gasto suficiente mata
  el dia 3, sin agotar la semana ni el tope. Ese ahorro es la mitad del sistema.

---

## 5.6 Que cambiar cuando el veredicto es ITERATE

`cycle` te dice donde esta el cuello de botella, y solo hay tres sitios:

| Sintoma | Culpable | Que cambias |
|---|---|---|
| CTR < 1% | **El anuncio** | 3 angulos nuevos. Ni toques la landing. |
| CTR > 1% y conversion < 1% | **La landing** | Titular, precio, garantia, las 3 primeras FAQ. |
| Conversion > 1% y ROAS < equilibrio | **El precio** | Sube precio, anade upsell, o busca trafico mas barato. |

**Una cosa por vuelta.** Si cambias el anuncio y la landing a la vez y mejora,
no sabras cual de las dos lo arreglo, y no podras repetirlo en el siguiente
producto.

**Maximo dos intentos por producto.** Al tercero, el sistema se niega. No es
capricho: el coste de oportunidad de insistir en un producto mediocre es no
haber probado otros dos.

---

## 5.7 Lo aprendido es el activo

Cuando matas un producto, anota por que:

```bash
npm run ops -- kill --offer mi-producto --apply \
  --learning "CTR 0.6%: 'freelance' es demasiado generico, no es un dolor concreto"
```

`ops board` te devuelve la cartera entera con esos aprendizajes juntos:

```
Producto                     Estado      Intento  Gasto     Ingresos  ROAS
pack-presets-inmobiliaria    GANADOR     1        150,00 €  442,00 €  2.95
pack-notion-freelance        descartado  2        300,00 €  238,00 €  0.79
plantillas-presupuesto-obra  descartado  1         94,00 €    0,00 €  0.00

Productos probados    3
Tasa de acierto       33.3%
Coste medio por test  181,33 €
```

Probar veinte productos sin anotar por que murio cada uno es pagar veinte veces
por la misma leccion. El patron que buscas casi siempre es el mismo: **los
nichos estrechos con un dolor concreto ganan a los publicos amplios**.

---

## 5.8 Elegir el siguiente producto

No lo elijas al azar: elige contra lo que ya aprendiste.

1. **Si murio por CTR bajo**, el problema fue el publico. Busca un nicho mas
   estrecho: no "freelances", sino "fotografos de bodas".
2. **Si murio por conversion baja**, el problema fue la promesa. Busca un dolor
   mas agudo y mas urgente.
3. **Si murio por precio**, el producto puede estar bien: subelo de precio y
   anade material, o venderlo al mismo publico con otro formato.

Ten siempre **3 ideas en la lista** antes de empezar el test. Elegir el siguiente
producto con el gasto ya parado es tiempo muerto, y el tiempo muerto es lo que
hace que la gente abandone despues del segundo fracaso.

---

## 5.9 Cuando parar

Para de verdad si:

- Llevas **8-10 productos** sin ninguno que pase de equilibrio. A esas alturas
  el problema no son los productos: es el canal, el publico o el precio medio.
  Cambia de enfoque, no de producto.
- Has gastado lo que estabas dispuesto a perder. Ese numero lo decides **antes**
  de empezar, no cuando ya llevas tres fracasos y quieres recuperarlos.

El unico fallo que no tiene arreglo es seguir metiendo dinero en un producto
porque ya le metiste dinero antes.
