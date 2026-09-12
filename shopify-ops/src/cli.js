#!/usr/bin/env node
import { loadEnv, loadOffer, listOffers } from './config.js';
import { log } from './lib/log.js';

loadEnv();

const HELP = `
shopify-ops · pipeline de productos digitales

  npm run ops -- <comando> [opciones]

Si no sabes que toca ahora
  next                           Te dice el siguiente paso y el comando exacto
  done  --offer <s> --step <p>   Marca como hecho un paso manual

Montar un producto
  preflight                      Comprueba accesos a Shopify, Meta y TikTok
  new-offer <slug>               Crea una oferta nueva a partir de la plantilla
  page-build   --offer <slug>    Genera la landing en dist/ y audita la oferta
  store-setup  --offer <slug>    Crea producto, landing y paginas legales en Shopify
  ads-launch   --offer <slug>    Crea la campana (en pausa) en Meta o TikTok

Probar productos en serie
  test-start   --offer <slug>    Abre un test con tope de gasto y fecha de caducidad
  cycle        --offer <slug>    El comando de cada dia: vigila el tope, optimiza y dicta veredicto
  kill         --offer <slug>    Para todo el gasto y descarta el producto
  board                          La cartera entera: que se prueba, que murio y a que coste

Consultar
  offers                         Lista las ofertas definidas
  report       --offer <slug>    Gasto vs ingresos reales, por ad set y anuncio
  optimize     --offer <slug>    Decide que matar, escalar o rotar dentro de una campana

Opciones
  --offer <slug>       Oferta sobre la que actuar
  --platform <p>       meta | tiktok | all        (por defecto: meta en launch, all en report)
  --days <n>           Ventana de dias            (por defecto: 7)
  --budget <n>         Tope de gasto del test     (por defecto: presupuesto diario x dias)
  --learning "..."     Que aprendiste, al matar un producto
  --auto-extend        En cycle: amplia el tope solo si el producto pinta a ganador
  --apply              Ejecuta de verdad. Sin esto, todo es simulacion.

El ciclo, de principio a fin
  1. npm run ops -- new-offer mi-producto        y rellenas offers/mi-producto.json
  2. npm run ops -- page-build  --offer mi-producto
  3. npm run ops -- store-setup --offer mi-producto --apply
  4. npm run ops -- ads-launch  --offer mi-producto --apply
  5. npm run ops -- test-start  --offer mi-producto --days 7 --budget 150
  6. cada dia:  npm run ops -- cycle --offer mi-producto --apply
  7. cuando dicte KILL, vuelve al paso 1 con el siguiente producto
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else args._.push(a);
  }
  return args;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  if (cmd === 'help' || args.help) { console.log(HELP); return; }

  // Sin comando, la pregunta siempre es la misma: ¿y ahora que?
  if (!cmd) {
    const { next } = await import('./commands/next.js');
    return void next(args.offer);
  }

  const days = Number(args.days || 7);
  const apply = args.apply === true || args.apply === 'true';
  const withOffer = () => loadOffer(args.offer || args._[0]);

  switch (cmd) {
    case 'preflight': {
      const { preflight } = await import('./commands/preflight.js');
      return void await preflight();
    }
    case 'offers': {
      const all = listOffers();
      if (!all.length) { log.warn('No hay ofertas. Crea una: npm run ops -- new-offer <slug>'); return; }
      all.forEach((s) => log.info(s));
      return;
    }
    case 'new-offer': {
      const { newOffer } = await import('./commands/new-offer.js');
      return void newOffer(args._[0] || args.slug);
    }
    case 'page-build': {
      const { pageBuild } = await import('./commands/page-build.js');
      return void pageBuild(withOffer());
    }
    case 'store-setup': {
      const { storeSetup } = await import('./commands/store-setup.js');
      return void await storeSetup(withOffer(), { apply });
    }
    case 'ads-launch': {
      const { adsLaunch } = await import('./commands/ads-launch.js');
      return void await adsLaunch(withOffer(), { platform: args.platform || 'meta', apply });
    }
    case 'report': {
      const { report } = await import('./commands/report.js');
      return void await report(withOffer(), { days, platform: args.platform || 'all' });
    }
    case 'optimize': {
      const { optimize } = await import('./commands/optimize.js');
      return void await optimize(withOffer(), { days, platform: args.platform || 'all', apply });
    }
    case 'test-start': {
      const { testStart } = await import('./commands/test-start.js');
      return void testStart(withOffer(), {
        days, budget: args.budget,
        maxIterations: Number(args['max-iterations'] || 2),
        note: typeof args.note === 'string' ? args.note : null,
      });
    }
    case 'cycle': {
      const { cycle } = await import('./commands/cycle.js');
      return void await cycle(withOffer(), {
        apply, platform: args.platform || 'all',
        autoExtend: args['auto-extend'] === true,
      });
    }
    case 'kill': {
      const { killOffer } = await import('./commands/kill.js');
      const slug = args.offer || args._[0];
      if (!slug) throw new Error('Indica que producto matar: --offer <slug>');
      return void await killOffer(slug, {
        learning: typeof args.learning === 'string' ? args.learning : null,
        apply,
      });
    }
    case 'next': {
      const { next } = await import('./commands/next.js');
      return void next(args.offer || args._[0]);
    }
    case 'done': {
      const { done: markDone } = await import('./commands/next.js');
      const slug = args.offer || args._[0];
      const step = args.step || args._[1];
      if (!slug || !step) throw new Error('Uso: ops done --offer <slug> --step <paso>');
      return void markDone(slug, step);
    }
    case 'board': {
      const { board } = await import('./commands/board.js');
      return void board();
    }
    default:
      log.err(`Comando desconocido: ${cmd}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((e) => {
  log.err(e.message);
  if (process.env.DEBUG) console.error(e);
  process.exitCode = 1;
});
