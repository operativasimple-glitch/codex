# 3 · Optimizar: que matar, que escalar, que cambiar

Esta es la parte que el comando `optimize` automatiza. Conviene entender las
reglas antes de dejar que las aplique solo.

```bash
npm run ops -- optimize --offer mi-producto            # solo enseña las decisiones
npm run ops -- optimize --offer mi-producto --apply    # las ejecuta
```

---

## 3.1 El unico numero que importa

**ROAS de equilibrio** = 1 ÷ (1 − coste variable − tasa de devolucion)

Con 4% de comisiones y 6% de devoluciones: `1 / 0.90 = 1.11`.
Por debajo de 1.11 cada euro que gastas pierde dinero. Lo calcula la herramienta
sola a partir de `economics` en la oferta.

Cuidado con el ROAS que reporta la plataforma: cuenta conversiones dentro de su
ventana de atribucion y casi siempre lo infla. Por eso `report` y `optimize`
cruzan el gasto con los **pedidos reales de Shopify** via UTM. Cuando hay
atribucion, manda el dato real; cuando no la hay, cae al de la plataforma.

---

## 3.2 Las reglas

| Situacion | Accion | Por que |
|---|---|---|
| Gastado ≥ `minSpendAdNoSale` y **cero ventas** | **matar el anuncio** | No hay nada que aprender. Sangra. |
| Dia < `learningDays` | **no tocar** | Tocar reinicia el aprendizaje. |
| Gasto < umbral | **no tocar** | Muestra insuficiente: seria ruido, no señal. |
| ROAS < `killRoas` | **matar** | Pierde dinero de forma sostenida. |
| Frecuencia ≥ `frequencyRotate` | **rotar creatividad** | La audiencia ya la ha visto. Renueva material. |
| ROAS ≥ `targetRoas` | **subir presupuesto 20%** | Ganador. Despacio: mas del 20-30% reinicia el aprendizaje. |
| Entre corte y objetivo | **dejar correr** | Ni gana ni pierde. Dale tiempo. |

Cada decision se guarda en `state/decisions.jsonl` con su motivo. Si no puedes
explicar por que mataste algo, no deberias haberlo matado.

---

## 3.3 Cuando la oferta entera no funciona

Si `optimize` marca **todos** los ad sets para matar, el problema no es la
campana: es la oferta. Diagnostica con el CTR y la tasa de conversion:

| CTR | Conversion de la landing | Donde esta el problema |
|---|---|---|
| < 1% | — | **El anuncio.** El angulo no engancha. Cambia el gancho. |
| > 1% | < 1% | **La landing.** Llegan pero no compran: titular, precio u oferta. |
| > 1% | > 2% pero ROAS bajo | **El precio.** Vendes, pero no cubres el CAC. Sube precio o anade un upsell. |
| > 2% | > 3% y ROAS alto | Nada. Escala. |

Cambia **una sola cosa** cada vez, en este orden de coste:

1. **El angulo del anuncio.** Lo mas barato y lo que mas mueve. Mismo producto,
   dolor distinto. Tres angulos nuevos cuestan una tarde.
2. **El titular de la landing.** Segundo en impacto, tambien barato.
3. **El precio o la estructura de la oferta.** Anadir bonus, cambiar la garantia.
4. **El producto entero.** Solo cuando 1, 2 y 3 no han movido la aguja en dos
   semanas de datos.

Si cambias dos cosas a la vez no sabras cual funciono.

---

## 3.4 Escalar sin romper lo que funciona

Cuando un ad set supera el ROAS objetivo de forma estable durante 3 dias:

- **Vertical**: +20% de presupuesto al dia. Nunca de golpe.
- **Horizontal**: duplica el ad set ganador cambiando **una** variable
  (otro pais, otro rango de edad). El original sigue corriendo.
- **Creatividad**: el escalado se muere por fatiga. Ten 3 creatividades nuevas
  listas antes de necesitarlas, no despues.

El ROAS baja al escalar. Es normal: sales del publico mas facil. Lo que importa
es que siga por encima del equilibrio con mas volumen absoluto de beneficio.

---

## 3.5 Automatizarlo del todo

Con un cron diario, a una hora en la que ya haya datos del dia anterior:

```cron
0 9 * * * cd /ruta/shopify-ops && npm run ops -- optimize --offer mi-producto --apply >> state/cron.log 2>&1
```

**Empieza sin `--apply` durante una semana.** Lee el log cada dia y comprueba
que las decisiones que habria tomado coinciden con las que habrias tomado tu.
Cuando coincidan, activalo.

Lo que nunca se automatiza:
- **Producir creatividades nuevas.** `optimize` avisa de que hace falta; el material lo haces tu.
- **Cambiar la oferta.** Es una decision de negocio, no una regla.
- **Responder a soporte.** Un cliente enfadado sin respuesta es una devolucion y una reseña mala.
