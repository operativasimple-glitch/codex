# 1 · Cuentas y accesos

Esto es lo unico que **no** puedo hacer yo: requiere tu identidad, tu tarjeta y
tu verificacion. Son unas 2-3 horas la primera vez. Despues no lo repites.

---

## 1.1 Shopify

1. Crea la tienda en [shopify.com](https://www.shopify.com). Plan Basic es suficiente.
2. **Ajustes → Pagos**: activa Shopify Payments (o Stripe/PayPal). Sin esto no cobras.
   Te pedira NIF y cuenta bancaria.
3. **Ajustes → Aplicaciones → Desarrollar aplicaciones → Crear una aplicacion**.
   - Nombre: `ops`
   - **Configuracion de la API de Admin**, marca estos permisos:

   | Permiso | Para que |
   |---|---|
   | `write_products`, `read_products` | crear el producto digital |
   | `write_content`, `read_content` | crear la landing y las paginas legales |
   | `read_orders` | calcular el ROAS real contra ventas de verdad |
   | `write_themes`, `read_themes` | subir la plantilla al tema |

   - **Instalar aplicacion** → copia el *Admin API access token* (`shpat_...`).
     Solo se muestra una vez.
4. Instala la app gratuita **Digital Downloads** de Shopify.
   La API no permite adjuntar el fichero descargable a un producto; lo hace esa app.

Al `.env`:
```
SHOPIFY_STORE=tutienda.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_...
```
> Usa siempre el dominio `.myshopify.com`, no el dominio propio. La API solo responde al tecnico.

---

## 1.2 Meta (Facebook e Instagram)

1. [business.facebook.com](https://business.facebook.com) → crea un **Business Manager**.
2. Dentro: una **pagina de Facebook**, una **cuenta publicitaria** y un **pixel**
   (Administrador de eventos → Conectar origen de datos → Web).
3. **Verifica tu dominio** en Configuracion del negocio → Seguridad de la marca → Dominios.
   Sin esto no puedes configurar los eventos y el rendimiento cae.
4. En Shopify instala el canal **Facebook & Instagram** y conecta el pixel.
   Activa la **API de conversiones**: recupera entre un 10% y un 30% de las
   conversiones que el navegador pierde por bloqueadores e iOS.
5. Token: [developers.facebook.com](https://developers.facebook.com) → crea una app
   tipo *Business* → anade *Marketing API* → genera un token con
   `ads_management`, `ads_read`, `business_management`.
   El token corto dura 1 hora: cambialo por uno de larga duracion en el
   [Explorador de tokens](https://developers.facebook.com/tools/debug/accesstoken/).

Al `.env`:
```
META_AD_ACCOUNT_ID=act_1234567890
META_ACCESS_TOKEN=EAA...
META_PIXEL_ID=1234567890
META_PAGE_ID=1234567890
META_INSTAGRAM_ACTOR_ID=1234567890
```

> **Cuenta nueva = limite de gasto bajo.** Meta empieza limitando a ~50 €/dia y
> lo sube segun pagas facturas sin incidencias. No intentes arrancar con 200 €/dia:
> se te bloquea la cuenta.

---

## 1.3 TikTok Ads

1. [ads.tiktok.com](https://ads.tiktok.com) → cuenta de empresa (te pedira datos fiscales).
2. Crea el **pixel** y conectalo a Shopify con la app oficial de TikTok.
3. [business-api.tiktok.com](https://business-api.tiktok.com) → app de desarrollador →
   autoriza tu cuenta de anunciante → copia el *access token*.
4. El `identity_id` sale de la cuenta de TikTok que firma los anuncios
   (Herramientas → Identidades).

Al `.env`:
```
TIKTOK_ADVERTISER_ID=
TIKTOK_ACCESS_TOKEN=
TIKTOK_PIXEL_ID=
TIKTOK_IDENTITY_ID=
```

---

## 1.4 Comprobacion

```bash
cp .env.example .env    # y rellena
npm run ops -- preflight
```

Debe salir todo en verde antes de crear nada. Si el pixel sale como
"nunca ha disparado un evento", visita tu propia tienda con el pixel activo y
repite: sin eventos, el algoritmo no puede optimizar a compra.

---

## 1.5 Lo que hace que te cierren la cuenta

Esto no es burocracia: es la causa numero uno de que un negocio de producto
digital muera en la semana dos.

- **Promesas de ingresos.** "Gana 3.000 € al mes", capturas de Stripe, coches.
  Prohibido en Meta y en TikTok. Habla de proceso y de tiempo ahorrado, no de dinero.
- **Landing sin paginas legales.** Terminos, privacidad, reembolsos y contacto
  con razon social y NIF visibles. `store-setup` te las crea, pero tienes que
  rellenar tus datos fiscales a mano.
- **Antes y despues** en salud, finanzas o apariencia fisica.
- **Cuenta nueva escalando de golpe.** Sube el presupuesto un 20% al dia como maximo.
- **Varias cuentas publicitarias desde la misma IP y tarjeta** cuando una ya fue baneada.
