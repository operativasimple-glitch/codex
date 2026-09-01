# Colchón

Una web app (PWA) para controlar el drawdown y el riesgo restante de varias cuentas de prop firm a la vez, desde el móvil. Construida para usarse en directo, durante la sesión — no es un diario de trading para analizar después.

## Qué hace la v1

- Muestra, para cada cuenta, el **colchón restante**: la distancia en dólares entre tu saldo y el suelo de drawdown.
- Calcula el suelo automáticamente a partir del **saldo de cierre del día (EOD)** que introduces a mano — no necesita ninguna API.
- Vigila **días mínimos de trading**, **regla de consistencia** (% máximo de un solo día sobre el beneficio total) y el **objetivo de beneficio** de las evaluaciones.
- Guarda la **fecha de próximo payout** que te indica tu firma y avisa cuándo está disponible.
- Admite cuentas con drawdown **trailing (EOD)**, **trailing (intradía, con aviso)**, **estático** o **sin drawdown**.
- Todo en una sola pantalla, en español, instalable como app en el móvil.

Fuera de la v1 (a propósito): copiador de operaciones, IA, app nativa de iOS.

## Cómo se usa

1. Añade cada cuenta con su firma, tamaño y reglas (drawdown, días mínimos, consistencia, objetivo, payout).
2. Cada día, registra el saldo de cierre de cada cuenta con "Registrar cierre".
3. Revisa el colchón restante y las reglas en la pantalla principal.

Las reglas de cada firma cambian con frecuencia — verifica siempre los números exactos con tu firma; esta app no sustituye tu panel oficial.

Datos guardados en el dispositivo (`localStorage`) — sin cuenta ni servidor.

## Publicar con GitHub Pages

1. Ve a **Settings → Pages** en este repositorio.
2. En "Build and deployment", pon como rama de origen esta rama y carpeta `/ (root)`.
3. Guarda y abre la URL publicada en el móvil — "Añadir a pantalla de inicio" para instalarla como app.
