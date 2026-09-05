/**
 * Cola de trabajos de la aplicación.
 *
 * Auditar una web tarda minutos: si el botón se quedara esperando la respuesta,
 * el navegador daría por muerta la petición. Así que cada acción larga se lanza
 * como un trabajo, la página pregunta cada segundo cómo va, y mientras tanto se
 * ve lo que está pasando línea a línea.
 *
 * Solo corre un trabajo a la vez, a propósito: son auditorías con un navegador
 * detrás y la máquina de Oscar no es un servidor.
 */
let actual = vacio();

function vacio() {
  return { id: null, titulo: null, activo: false, lineas: [], error: null, iniciado: null, terminado: null };
}

export function estadoTrabajo() {
  return { ...actual, lineas: actual.lineas.slice(-200) };
}

export function hayTrabajo() {
  return actual.activo;
}

/** Lanza una función larga capturando todo lo que imprima por consola. */
export function lanzar(titulo, fn) {
  if (actual.activo) throw new Error(`Ya hay algo en marcha: ${actual.titulo}. Espera a que termine.`);

  actual = { ...vacio(), id: Date.now().toString(36), titulo, activo: true, iniciado: new Date().toISOString() };
  const trabajo = actual;
  // Una primera línea desde el segundo cero: un recuadro vacío parece que está roto.
  trabajo.lineas.push('Arrancando…');

  const apuntar = (texto) => {
    for (const linea of String(texto).split('\n')) {
      // Se quitan los colores de terminal: en la página estorban.
      trabajo.lineas.push(linea.replace(/\x1b\[[0-9;]*m/g, ''));
    }
  };

  const logOriginal = console.log;
  const errOriginal = console.error;
  console.log = (...args) => apuntar(args.join(' '));
  console.error = (...args) => apuntar(args.join(' '));

  Promise.resolve()
    .then(() => fn(apuntar))
    .then((resultado) => { trabajo.resultado = resultado ?? null; })
    .catch((e) => { trabajo.error = e.message; apuntar(`Error: ${e.message}`); })
    .finally(() => {
      console.log = logOriginal;
      console.error = errOriginal;
      trabajo.activo = false;
      trabajo.terminado = new Date().toISOString();
    });

  return trabajo.id;
}
