/**
 * La revisión manual: el 42,6 % de incidencias que ninguna herramienta detecta y que,
 * según el informe de cobertura de Deque, es exactamente lo que se está cobrando.
 *
 * Esto no automatiza la revisión — no se puede — sino que la convierte en un guion
 * cerrado de doce comprobaciones para no olvidarse de ninguna, y guarda el resultado
 * dentro del escaneo para que salga en el informe.
 */
import { createInterface } from 'node:readline/promises';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATOS, col, titulo } from '../util.js';

export const GUION = [
  { id: 'teclado-compra', criterio: 'WCAG 2.1.1', titulo: 'Se llega al botón de comprar o enviar solo con el tabulador',
    como: 'Recarga la portada, pulsa Tab desde arriba y llega hasta el botón principal sin tocar el ratón.' },
  { id: 'teclado-trampa', criterio: 'WCAG 2.1.2', titulo: 'No hay trampas de foco',
    como: 'Abre el menú, un desplegable y una ventana modal. Comprueba que puedes salir con Tab o Esc.' },
  { id: 'foco-visible', criterio: 'WCAG 2.4.7', titulo: 'Se ve dónde está el foco en todo momento',
    como: 'Mientras tabulas, mira si hay un recuadro visible. Fíjate sobre fondos de color.' },
  { id: 'orden-foco', criterio: 'WCAG 2.4.3', titulo: 'El orden de tabulación sigue el orden visual',
    como: 'Tabula veinte veces y comprueba que no salta del pie a la cabecera ni al revés.' },
  { id: 'lector-portada', criterio: 'WCAG 1.1.1', titulo: 'La portada se entiende con lector de pantalla',
    como: 'VoiceOver (Cmd+F5 en Mac). Escucha el primer minuto: ¿se entiende de qué va la empresa?' },
  { id: 'lector-formulario', criterio: 'WCAG 3.3.2', titulo: 'El formulario de contacto se puede rellenar a ciegas',
    como: 'Con la pantalla apagada o los ojos cerrados, rellena y envía el formulario con VoiceOver.' },
  { id: 'alt-calidad', criterio: 'WCAG 1.1.1', titulo: 'Los textos alternativos describen de verdad la imagen',
    como: 'Mira diez alt: ¿dicen "imagen1.jpg" o describen lo que se ve? ¿Los alt vacíos son decorativos?' },
  { id: 'errores-formulario', criterio: 'WCAG 3.3.1', titulo: 'Los errores del formulario se anuncian y se explican',
    como: 'Envía el formulario vacío. ¿Dice qué campo falla y cómo corregirlo, o solo pinta de rojo?' },
  { id: 'zoom-200', criterio: 'WCAG 1.4.4', titulo: 'Con el zoom al 200 % no se pierde contenido',
    como: 'Cmd/Ctrl + para ampliar al 200 %. ¿Se solapan textos, desaparecen botones o hay barra horizontal?' },
  { id: 'video-subtitulos', criterio: 'WCAG 1.2.2', titulo: 'Los vídeos llevan subtítulos reales',
    como: 'Si hay vídeo incrustado (YouTube o Vimeo), comprueba si los subtítulos son propios o automáticos.' },
  { id: 'movil', criterio: 'WCAG 1.3.4', titulo: 'En móvil funciona en vertical y en horizontal',
    como: 'Abre la web en el móvil, gírala, y prueba a comprar o contactar.' },
  { id: 'declaracion', criterio: 'Ley 11/2023', titulo: 'Existe declaración de accesibilidad y canal de reclamación',
    como: 'Busca en el pie un enlace de accesibilidad. Casi nunca está: es un incumplimiento formal fácil de citar.' },
];

export async function pasarGuion(escaneo) {
  titulo(`Revisión manual · ${escaneo.cliente}`);
  console.log(col.gris('Para cada punto: [s] pasa · [n] falla · [x] no aplica · [Enter] saltar\n'));
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // Si la entrada se acaba a media revisión (Ctrl+D, o la salida de una tubería),
  // la pregunta pendiente se queda colgada para siempre. Se resuelve como "fin de
  // entrada" para poder cortar el bucle y guardar lo ya contestado.
  let cerrado = false;
  const pendientes = new Set();
  rl.once('close', () => {
    cerrado = true;
    for (const resolver of pendientes) resolver(null);
    pendientes.clear();
  });
  const preguntar = (texto) => new Promise((resolver) => {
    if (cerrado) return resolver(null);
    pendientes.add(resolver);
    const terminar = (v) => { pendientes.delete(resolver); resolver(v); };
    rl.question(texto).then(terminar, () => terminar(null));
  });

  const respuestas = [];
  try {
    for (const [i, punto] of GUION.entries()) {
      console.log(`${col.neg(`${i + 1}/${GUION.length} · ${punto.titulo}`)}  ${col.gris(punto.criterio)}`);
      console.log(col.gris(`   ${punto.como}`));
      const bruto = await preguntar('   > ');
      if (bruto === null) { console.log(col.ambar(`\n(Entrada terminada: se guardan las ${respuestas.length} respuestas dadas.)`)); break; }
      const r = bruto.trim().toLowerCase();
      if (!r) { console.log(col.gris('   (saltado)\n')); continue; }
      const resultado = r.startsWith('s') ? 'pasa' : r.startsWith('n') ? 'falla' : 'no-aplica';
      let nota = '';
      if (resultado === 'falla') nota = ((await preguntar(col.gris('   ¿qué has visto? '))) || '').trim();
      respuestas.push({ ...punto, resultado, nota });
      console.log('');
    }
  } finally {
    rl.close();
  }

  escaneo.manual = { fecha: new Date().toISOString(), respuestas };
  // Un fallo manual grave sube el semáforo: la parte humana manda sobre la automática.
  if (respuestas.some((r) => r.resultado === 'falla' && ['teclado-compra', 'lector-formulario', 'foco-invisible'].includes(r.id))) {
    escaneo.semaforo = 'rojo';
  }
  writeFileSync(join(DATOS, 'escaneos', `${escaneo.id}.json`), JSON.stringify(escaneo, null, 2));
  return escaneo;
}
