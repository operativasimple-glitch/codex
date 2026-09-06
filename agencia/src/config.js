/**
 * Configuración de la agencia. Todo lo que cambia de un negocio a otro vive aquí:
 * marca, precios, límites del rastreo y los datos que van en el pie de los informes.
 *
 * Se puede sobrescribir con un `agencia.config.json` en la raíz del proyecto.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './util.js';

const POR_DEFECTO = {
  marca: 'Norma',
  lema: 'Cumplimiento digital para pymes',
  responsable: 'Oscar',
  correo: 'oscar@ejemplo.es',
  web: 'https://ejemplo.es',
  // Zona horaria de trabajo y ventana real para videollamadas con España.
  zonaTrabajo: 'America/Chicago',
  zonaCliente: 'Europe/Madrid',
  ventanaLlamadasEspana: { desde: 15, hasta: 18 },

  precios: {
    diagnostico: 0,
    auditoria: 1200,
    remediacionMin: 1500,
    remediacionMax: 4000,
    vigilanciaMin: 250,
    vigilanciaMax: 500,
    paqueteIA_Min: 1500,
    paqueteIA_Max: 3000,
  },

  // Coste estimado por hora de desarrollo ajeno, para poner cifra al esfuerzo de corrección.
  euroHoraDesarrollo: 45,

  rastreo: {
    maxPaginas: 12,
    esperaMs: 400,
    tiempoLimiteMs: 30000,
    // Rutas que casi siempre importan en el alcance de la ley (compra y contacto).
    prioritarias: ['contacto', 'tienda', 'shop', 'producto', 'carrito', 'checkout', 'pago',
      'registro', 'login', 'acceso', 'reserva', 'cita', 'servicios', 'precios'],
    agenteUsuario:
      'Mozilla/5.0 (compatible; AuditoriaAccesibilidad/1.0; +auditoria WCAG 2.1 AA)',
  },

  // Lo que la agencia NO hace nunca. Se imprime literal en todos los informes.
  limites: [
    'Este informe no certifica el cumplimiento legal: no existe certificación oficial y nadie puede emitirla.',
    'No constituye asesoramiento jurídico. Para la interpretación de la norma, un abogado especializado.',
    'La capa automática cubre en torno al 57 % de las incidencias reales (Deque). El resto exige revisión humana, que se detalla aparte.',
  ],
};

export function cargarConfig() {
  const ruta = join(RAIZ, 'agencia.config.json');
  if (!existsSync(ruta)) return POR_DEFECTO;
  const propia = JSON.parse(readFileSync(ruta, 'utf8'));
  return fundir(POR_DEFECTO, propia);
}

function fundir(base, encima) {
  const salida = { ...base };
  for (const [k, v] of Object.entries(encima)) {
    salida[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof base[k] === 'object'
      ? fundir(base[k], v)
      : v;
  }
  return salida;
}

export const config = cargarConfig();
