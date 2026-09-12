import { log, money } from '../lib/log.js';
import { progress, STEPS, markStep, activeOffer } from '../lib/progress.js';
import * as pipeline from '../lib/pipeline.js';
import { listOffers } from '../config.js';

const TITLES = {
  entorno: 'Conectar tus cuentas',
  oferta: 'Escribir la oferta',
  landing: 'Generar y revisar la landing',
  producto: 'Fabricar el producto digital',
  tienda: 'Montar la tienda en Shopify',
  anuncios: 'Crear las campanas',
  test: 'Abrir el test',
  ciclo: 'Dejar correr el ciclo',
};

/** Cada paso: que tienes que hacer y con que comando. */
function instructions(step, slug, p) {
  switch (step) {
    case 'entorno':
      return {
        why: 'Sin credenciales no puedo crear nada en tu nombre.',
        do: [
          'Copia el fichero de ejemplo:  cp .env.example .env',
          'Rellenalo siguiendo playbooks/01-cuentas-y-accesos.md',
          p.env.why ? `Ahora mismo: ${p.env.why}` : null,
        ].filter(Boolean),
        cmd: 'npm run ops -- preflight',
        cmdNote: 'comprueba que todo conecta antes de seguir',
      };

    case 'oferta':
      return {
        why: 'Todo lo demas (landing, producto, anuncios) sale de este fichero.',
        do: [
          `Abre offers/${slug}.json y sustituye el texto de la plantilla.`,
          'Lo que mas manda: headline (el resultado, no el producto), deliverables y faq.',
          p.offer.left?.length ? `Te quedan por tocar: ${p.offer.left.slice(0, 3).join(', ')}${p.offer.left.length > 3 ? '…' : ''}` : null,
          'Referencia: offers/pack-notion-freelance.json tiene una oferta entera escrita.',
        ].filter(Boolean),
        cmd: `npm run ops -- page-build --offer ${slug}`,
        cmdNote: 'cuando la tengas escrita, esto la audita',
      };

    case 'landing':
      return {
        why: 'Ver la pagina antes de pagar por llevar gente a ella.',
        do: [
          'Genera la landing y abrela en el navegador.',
          'Mirala en el movil: ahi cae el 80% del trafico de anuncios.',
          'Haz caso a los avisos de la auditoria.',
        ],
        cmd: `npm run ops -- page-build --offer ${slug}`,
        cmdNote: `luego abre dist/${slug}.html`,
      };

    case 'producto':
      return {
        why: 'La landing ya promete unos entregables. Ahora hay que fabricarlos.',
        do: [
          'Monta de verdad lo que prometes en "deliverables".',
          'Vender algo que aun no existe acaba en devoluciones y reseñas malas.',
          'Sube el fichero (o el enlace de Notion) a la app Digital Downloads de Shopify.',
        ],
        cmd: `npm run ops -- done --offer ${slug} --step producto`,
        cmdNote: 'marca este paso cuando lo tengas hecho',
      };

    case 'tienda':
      return {
        why: 'Crea el producto, la landing y las 4 paginas legales en Shopify.',
        do: [
          'Primero en simulacion, para ver que va a hacer.',
          'Luego con --apply.',
          'Despues: rellena tu razon social y NIF en las paginas legales.',
          'Y haz un pedido de prueba REAL con tu tarjeta, de principio a fin.',
        ],
        cmd: `npm run ops -- store-setup --offer ${slug} --apply`,
        cmdNote: 'quita --apply para verlo primero en simulacion',
      };

    case 'anuncios':
      return {
        why: 'Crea campana, publico y anuncios. Todo queda EN PAUSA.',
        do: [
          'Necesitas las imagenes o videos: ponlos en ads.meta.variants[].image.',
          'Se crea todo en pausa: lo revisas en el administrador y lo activas tu.',
          'Angulos y politicas: playbooks/04-creatividades.md',
        ],
        cmd: `npm run ops -- ads-launch --offer ${slug} --apply`,
        cmdNote: 'anade --platform tiktok para TikTok',
      };

    case 'test': {
      const offerFile = listOffers().includes(slug);
      return {
        why: 'Fija cuanto estas dispuesto a gastar en probar este producto.',
        do: [
          'El tope es sagrado: al alcanzarlo, el ciclo para las campanas.',
          'Te dira, antes de gastar, si ese tope da para concluir algo.',
          offerFile ? null : 'Ojo: no encuentro el fichero de esta oferta.',
        ].filter(Boolean),
        cmd: `npm run ops -- test-start --offer ${slug} --days 7 --budget 150`,
        cmdNote: 'ajusta --budget a lo que puedas perder entero',
      };
    }

    case 'ciclo':
      return {
        why: 'Un comando al dia. Vigila el tope, optimiza y dicta veredicto.',
        do: [
          'Corre una semana SIN --apply y comprueba que decide lo que decidirias tu.',
          'Cuando te fies, metelo en cron y olvidate.',
          'cron:  0 9 * * * cd ' + process.cwd() + ' && npm run ops -- cycle --offer ' + slug + ' --apply >> state/cron.log 2>&1',
        ],
        cmd: `npm run ops -- cycle --offer ${slug} --apply`,
        cmdNote: 'esto es lo que se repite cada dia',
      };
  }
}

/** El comando que responde "¿y ahora que?". */
export function next(slugArg) {
  const slug = slugArg || activeOffer();

  if (!slug) {
    log.step('Empieza por aqui');
    log.info('Todavia no hay ningun producto.');
    console.log('');
    log.ok('SIGUIENTE PASO');
    log.dim('  Crea tu primer producto:');
    console.log('\n      npm run ops -- new-offer mi-primer-producto\n');
    return null;
  }

  const p = progress(slug);

  log.step(`Producto: ${slug}`);

  // ── Checklist ─────────────────────────────────────────────────────────────
  let reached = false;
  for (const step of STEPS) {
    const done = p.done[step];
    const isNext = !done && !reached;
    if (isNext) reached = true;
    const mark = done ? '✓' : isNext ? '▸' : '○';
    const line = `  ${mark}  ${TITLES[step]}`;
    if (done) log.dim(line);
    else if (isNext) console.log(line + '   ← estas aqui');
    else log.dim(line);
  }

  // ── Estados terminales ────────────────────────────────────────────────────
  // Se comprueban ANTES que los pasos pendientes: un producto descartado no
  // debe volver a pedir que abras un test.
  const TERMINAL = [pipeline.STATUS.DEAD, pipeline.STATUS.WINNER, pipeline.STATUS.PAUSED];
  if (!p.next || TERMINAL.includes(p.entry.status)) {
    const entry = p.entry;
    console.log('');
    if (entry.status === pipeline.STATUS.DEAD) {
      log.err(`"${slug}" esta descartado.`);
      if (entry.learning) log.dim(`  Aprendiste: ${entry.learning}`);
      console.log('');
      log.ok('SIGUIENTE PASO');
      log.dim('  Monta el siguiente producto, eligiendolo contra lo que aprendiste:');
      console.log('\n      npm run ops -- new-offer mi-siguiente-producto\n');
      log.dim('  Como elegirlo: playbooks/05-ciclo-de-productos.md, apartado 5.8');
    } else if (entry.status === pipeline.STATUS.WINNER) {
      log.ok(`"${slug}" paso el test. Esta en escalado.`);
      console.log('');
      log.ok('SIGUIENTE PASO');
      log.dim('  Sigue el ciclo cada dia y prepara 2 creatividades nuevas ya:');
      console.log(`\n      npm run ops -- cycle --offer ${slug} --apply\n`);
      log.dim('  El ganador se quema en 2-3 semanas si no renuevas material.');
    } else if (entry.status === pipeline.STATUS.PAUSED) {
      log.warn(`"${slug}" esta parado esperando un cambio tuyo.`);
      const last = (entry.history || [])[entry.history.length - 1];
      if (last?.learning) log.dim(`  ${last.learning}`);
      console.log('');
      log.ok('SIGUIENTE PASO');
      log.dim('  Cambia UNA cosa y reabre el test:');
      console.log(`\n      npm run ops -- test-start --offer ${slug} --days 7 --budget 150\n`);
    } else {
      log.ok('Todo hecho. El ciclo esta en marcha.');
      console.log('');
      log.ok('SIGUIENTE PASO');
      console.log(`\n      npm run ops -- cycle --offer ${slug} --apply\n`);
    }
    return p;
  }

  // ── Siguiente paso pendiente ──────────────────────────────────────────────
  const step = p.next;
  const info = instructions(step, slug, p);

  console.log('');
  log.ok(`SIGUIENTE PASO — ${TITLES[step]}`);
  log.dim(`  ${info.why}`);
  console.log('');
  info.do.forEach((d) => console.log(`  · ${d}`));
  console.log('');
  console.log(`      ${info.cmd}`);
  if (info.cmdNote) log.dim(`      ${info.cmdNote}`);
  console.log('');

  return p;
}

/** Marca a mano un paso que no puedo detectar solo. */
export function done(slug, step) {
  if (!STEPS.includes(step)) {
    throw new Error(`Paso desconocido: "${step}". Validos: ${STEPS.join(', ')}`);
  }
  markStep(slug, step, true);
  log.ok(`Paso "${step}" marcado como hecho para "${slug}".`);
  console.log('');
  return next(slug);
}
