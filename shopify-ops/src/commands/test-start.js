import { log, money } from '../lib/log.js';
import * as pipeline from '../lib/pipeline.js';
import { testPower } from '../lib/verdict.js';

/**
 * Abre un test con fecha de caducidad y tope de gasto.
 * El tope es lo que convierte "probar productos" en un proceso y no en una
 * forma lenta de perder dinero: pase lo que pase, este producto no puede
 * costarte mas de budgetCap.
 */
export function testStart(offer, { days = 7, budget, maxIterations = 2, note = null } = {}) {
  // Se valida antes de imprimir nada: si el producto ya agoto sus intentos,
  // el analisis de potencia del test sobra.
  const prev = pipeline.get(offer.slug);
  const nextIteration = (prev?.test?.iteration || 0) + 1;
  if (nextIteration > maxIterations) {
    throw new Error(
      `"${offer.slug}" ya ha agotado sus ${maxIterations} intentos. ` +
      `Matalo (ops kill --offer ${offer.slug} --apply) o sube --max-iterations a conciencia.`
    );
  }

  const dailyBudget = offer.ads?.meta?.dailyBudget || offer.ads?.tiktok?.dailyBudget || 20;
  const budgetCap = Number(budget) || dailyBudget * days;
  const power = testPower({ budgetCap }, offer.economics, offer.price);

  log.step(`Test de "${offer.name}"`);
  log.info(`${days} dias, tope de gasto ${money(budgetCap)} (${money(budgetCap / days)}/dia)`);

  log.step('Que puede concluir este test');
  log.info(`Para descartar hacen falta ${money(power.killThreshold)} sin ventas — ${power.canKill ? 'el tope llega' : 'EL TOPE NO LLEGA'}`);
  log.info(`Para confirmar un ganador hacen falta ${money(power.winThreshold)} — ${power.canConfirmWin ? 'el tope llega' : 'el tope no llega'}`);
  log.dim(`  Si la oferta rindiera al ROAS objetivo (${offer.economics.targetRoas}), verias ~${Math.round(power.expectedOrdersIfWinner)} pedidos.`);

  if (!power.canKill) {
    log.err(`Con ${money(budgetCap)} ni siquiera puedes descartar el producto con seguridad.`);
    log.dim(`  Sube el tope a ${money(power.killThreshold)} como minimo, o baja el precio del producto.`);
    log.dim('  Un test que no puede concluir nada es dinero tirado, no informacion.');
  } else if (!power.canConfirmWin) {
    log.warn('Este test puede MATAR productos pero no puede coronar un ganador.');
    log.dim(`  Es lo normal al empezar y esta bien: sirve para descartar rapido y barato.`);
    log.dim(`  Si algo sobrevive, amplialo a ${money(power.winThreshold)} antes de escalar.`);
  } else {
    log.ok('El tope da para descartar y para confirmar un ganador.');
  }

  const entry = pipeline.startTest(offer.slug, { days, budgetCap, maxIterations, note });

  log.step('Test abierto');
  log.ok(`Intento ${entry.test.iteration} de ${maxIterations}`);
  log.dim(`  Cada dia: npm run ops -- cycle --offer ${offer.slug} --apply`);
  log.dim('  Ese comando vigila el tope, optimiza y dicta el veredicto al cerrar.');
  return entry;
}
