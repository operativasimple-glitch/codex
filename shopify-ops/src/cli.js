#!/usr/bin/env node
import { loadEnv, loadOffer, listOffers } from './config.js';
import { log } from './lib/log.js';

loadEnv();

const HELP = `
shopify-ops · pipeline de productos digitales

  npm run ops -- <comando> [opciones]

Comandos
  preflight                      Comprueba accesos a Shopify, Meta y TikTok
  offers                         Lista las ofertas definidas
  new-offer <slug>               Crea una oferta nueva a partir de la plantilla
  page-build   --offer <slug>    Genera la landing en dist/ y audita la oferta
  store-setup  --offer <slug>    Crea producto, landing y paginas legales en Shopify
  ads-launch   --offer <slug>    Crea la campana (en pausa) en Meta o TikTok
  report       --offer <slug>    Gasto vs ingresos reales, por ad set y anuncio
  optimize     --offer <slug>    Decide que matar, escalar o rotar

Opciones
  --offer <slug>       Oferta sobre la que actuar
  --platform <p>       meta | tiktok | all        (por defecto: meta en launch, all en report)
  --days <n>           Ventana de dias            (por defecto: 7)
  --apply              Ejecuta de verdad. Sin esto, todo es simulacion.

Flujo tipico
  1. npm run ops -- new-offer mi-producto
  2. (rellenas offers/mi-producto.json)
  3. npm run ops -- page-build --offer mi-producto
  4. npm run ops -- preflight
  5. npm run ops -- store-setup --offer mi-producto --apply
  6. npm run ops -- ads-launch --offer mi-producto --apply
  7. cada dia: npm run ops -- optimize --offer mi-producto
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

  if (!cmd || cmd === 'help' || args.help) { console.log(HELP); return; }

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
