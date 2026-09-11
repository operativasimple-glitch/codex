# 4 · Creatividades

El anuncio decide si el negocio funciona. Una landing mediocre con un buen
anuncio vende; un anuncio malo no lo salva ninguna landing.

---

## 4.1 Los tres angulos de arranque

Nunca lances una sola creatividad: no sabrias si el problema es el producto o
la forma de contarlo. Lanza tres angulos del mismo producto.

**1. Dolor.** Describe la situacion actual con tanto detalle que el lector se
reconozca. La primera linea es todo: tiene que sonar a algo que el ha vivido.

> Los clientes en el movil, los presupuestos en Drive y las facturas en un
> Excel que solo entiendes tu.

**2. Objecion.** Ataca la razon por la que no compraria.

> ¿Has empezado a montarte un Notion y lo has dejado a medias? Normal: estabas
> construyendo el sistema y trabajando al mismo tiempo.

**3. Resultado.** Enseña el despues, en concreto y sin exagerar.

> Abrir una sola pagina por la manana y ver que toca hoy, que esta cobrado y
> que sigue pendiente.

---

## 4.2 Meta: formato

- **Imagen 1:1 o 4:5.** El vertical ocupa mas pantalla en el movil.
- **Primera linea antes del "ver mas"**: unos 125 caracteres. Ahi se decide todo.
- **Mockup del producto**, no foto de banco de imagenes. Que se vea lo que compra.
- **Texto sobre la imagen**: poco. Meta ya no penaliza formalmente, pero
  satura y baja el CTR.
- **Video**: si lo tienes, gana casi siempre. Grabacion de pantalla usando el
  producto, 15-30 segundos, con subtitulos.

## 4.3 TikTok: formato

- **9:16 vertical, siempre.**
- **Los primeros 2 segundos** deciden. Empieza por el problema o por el
  resultado, nunca por una intro.
- **Que no parezca un anuncio.** Grabacion de pantalla o camara frontal
  hablando. La produccion cara rinde peor que el movil.
- **Subtitulos quemados en el video.** Se ve sin sonido.
- **21-34 segundos** es la duracion que suele funcionar mejor.

---

## 4.4 Lo que no puedes decir

Meta y TikTok cierran cuentas por esto, y con la cuenta se va el negocio.

| No | Si |
|---|---|
| "Gana 3.000 € al mes" | "Deja de perder 6 horas al mes en administracion" |
| Captura de ingresos de Stripe | Captura del producto funcionando |
| "Resultados garantizados" | "14 dias de garantia de devolucion" |
| "¿Estas arruinado?" (senalar al lector) | "Si llevas las facturas en un Excel..." |
| Antes/despues de cuerpo o dinero | Antes/despues de un escritorio desordenado |
| Cuenta atras falsa | Fecha limite real, o ninguna |

La regla corta: **habla del proceso y del tiempo, no del dinero.** Y no le
digas al lector lo que le pasa: describe una situacion y deja que se reconozca.

---

## 4.5 Ritmo de produccion

La fatiga creativa es lo que mata las campanas que funcionaban. Cuando la
frecuencia pasa de 2.5, esa creatividad esta quemada.

- **Semana 1**: 3 angulos.
- **Cada semana despues**: 2 creatividades nuevas, aunque todo vaya bien.
- **El ganador no se toca**: se le anaden variantes alrededor (mismo angulo,
  otro gancho, otro formato).

Ten siempre dos listas sin lanzar. Producir creatividades con la campana ya
cayendo es llegar tarde.

---

## 4.6 Como se enlaza con la herramienta

En `offers/<slug>.json`, dentro de `ads.meta.variants`:

```json
{
  "name": "dolor-caos",
  "primaryText": "Texto del anuncio. La primera linea es lo que decide.",
  "headline": "Titular corto",
  "description": "Linea de apoyo",
  "cta": "SHOP_NOW",
  "image": "./creativos/dolor-caos.jpg"
}
```

`ads-launch` sube la imagen, crea el creative y el anuncio, y le pega las UTM
(`utm_content` = id del anuncio, `utm_term` = id del ad set). Esas UTM son las
que luego permiten cruzar cada euro gastado con las ventas reales de Shopify.
Si las quitas, `optimize` se queda ciego y tiene que fiarse del dato de la
plataforma.
