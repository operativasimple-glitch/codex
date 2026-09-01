# Mis Metas de Ahorro 💙

Web app sencilla y bonita para crear metas de ahorro, ir añadiendo dinero a cada una y ver el progreso. Pensada para usarse desde el móvil.

## Uso

Abre `index.html` en el navegador (o publica el repo con GitHub Pages) y podrás:

- Crear metas nuevas con nombre, cantidad objetivo, fecha límite opcional e icono.
- Añadir dinero a cada meta con botones rápidos (+$5, +$10, +$20...) o una cantidad personalizada.
- Ver el progreso de cada meta con una barra y el porcentaje cumplido.
- Ver el total ahorrado, metas activas y metas completadas en el resumen superior.
- Editar o eliminar una meta desde el botón `⋯`.
- Instalar la app en la pantalla de inicio del móvil (es una PWA instalable, funciona sin conexión).

Los datos se guardan en el propio dispositivo (`localStorage`), no requiere servidor ni cuenta.

## Publicar en GitHub Pages

1. Ve a **Settings → Pages** del repositorio.
2. En "Build and deployment", selecciona la rama y carpeta raíz (`/`).
3. Guarda y espera a que se publique la URL — desde el móvil, abre esa URL y usa "Añadir a pantalla de inicio".
