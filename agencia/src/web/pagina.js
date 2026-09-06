/**
 * La página de la aplicación. Vive en un .html aparte para poder escribirla con
 * comodidad (con sus backticks y sus plantillas) y se lee una sola vez al arrancar.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const PAGINA = readFileSync(join(AQUI, 'pagina.html'), 'utf8');
