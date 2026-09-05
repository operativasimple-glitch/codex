/**
 * El servidor de la aplicación: sirve la página y expone las mismas acciones que
 * la línea de comandos, para que se puedan pulsar con el ratón.
 *
 * Escucha solo en 127.0.0.1: no es un servidor público, es la ventana del programa.
 * No usa ninguna librería web a propósito — un servidor HTTP de Node basta y así el
 * programa se instala en veinte segundos y no hereda vulnerabilidades de nadie.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { config } from '../config.js';
import { DATOS, euros, diasDesde, slug } from '../util.js';
import { cargar, guardar, sembrarLeads, buscarLead, listarEscaneos, cargarEscaneo, anotarEvento, ESTADOS_LEAD } from '../almacen.js';
import { calcularAgenda, marcador, ventanaLlamadas } from '../agente/hoy.js';
import { nuevoPresupuesto, ejecutar, bandeja, marcarEnviado, leerBitacora } from '../agente/herramientas.js';
import { correrPiloto, plantillaPara } from '../agente/piloto.js';
import { porContactar, necesitaLeads, anadirManual, UMBRAL } from '../crm/cantera.js';
import { correrAutonomo } from '../agente/autonomo.js';
import { hayIA } from '../agente/ia.js';
import { generarPanel } from '../panel/panel.js';
import { generarInforme } from '../informe/generar.js';
import { lanzar, estadoTrabajo } from './trabajos.js';
import { PAGINA } from './pagina.js';

// Se consulta una vez al arrancar: la página necesita saber si puede ofrecer
// la búsqueda automática de leads o solo el pegado a mano.
let IA_DISPONIBLE = false;

const TIPOS = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.png': 'image/png' };

function estadoCompleto() {
  const { estado, escaneos, acciones } = calcularAgenda();
  const m = marcador(estado, escaneos);
  const v = ventanaLlamadas();
  return {
    marca: config.marca,
    marcador: m,
    leadsPorContactar: porContactar(estado).length,
    umbralLeads: UMBRAL,
    faltanLeads: necesitaLeads(estado),
    ventana: v,
    precios: config.precios,
    acciones: acciones.map((a) => ({
      titulo: a.titulo, porque: a.porque, comando: a.comando,
      herramienta: a.herramienta?.nombre || null,
      argumentos: a.herramienta?.argumentos || null,
    })),
    leads: estado.leads.map((l) => ({
      id: l.id, empresa: l.empresa, web: l.web, segmento: l.segmento, prioridad: l.prioridad,
      sede: l.sede, porQue: l.porQue, via: l.via, estado: l.estado, notas: l.notas,
      diasContacto: l.fechaContacto ? diasDesde(l.fechaContacto) : null,
      escaneos: l.escaneos || [],
      plantilla: plantillaPara(l.segmento),
      auditable: !!l.web && !l.empresa.startsWith('['),
    })),
    clientes: estado.clientes.map((c) => ({ ...c, dias: diasDesde(c.ultimoEscaneo) })),
    escaneos: escaneos.slice(0, 20).map((e) => ({
      id: e.id, cliente: e.cliente, dominio: e.dominio, fecha: e.fecha, semaforo: e.semaforo,
      manual: !!e.manual, totales: e.totales,
      // Los informes de este cliente, para poder abrirlos desde su ficha.
      informes: listarInformes().filter((f) => f.archivo.includes(slug(e.cliente))).slice(0, 4),
      hallazgos: e.hallazgos.slice(0, 6).map((h) => ({ titulo: h.titulo, gravedad: h.gravedad, incidencias: h.incidencias, criterio: h.criterio })),
    })),
    informes: listarInformes(),
    bandeja: bandeja(),
    bitacora: leerBitacora(15),
    trabajo: estadoTrabajo(),
    ia: IA_DISPONIBLE,
    estadosLead: ESTADOS_LEAD,
  };
}

/** Los ficheros ya generados, para poder abrirlos desde la página. */
function listarInformes() {
  const dir = join(DATOS, 'informes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.html') || f.endsWith('.pdf'))
    .map((f) => ({ archivo: f, modificado: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.modificado - a.modificado)
    .slice(0, 60);
}

// ── Acciones. Las largas van a la cola de trabajos; las cortas responden al momento.

const ACCIONES = {
  sembrar() {
    const estado = cargar();
    const n = sembrarLeads(estado);
    guardar(estado);
    return { mensaje: n ? `${n} leads cargados.` : 'Ya estaban todos cargados.' };
  },

  auditar({ lead, paginas }) {
    const id = lanzar(`Auditando ${lead}`, async () => {
      const p = nuevoPresupuesto({ auditorias: 1, informes: 2, correos: 1, pasos: 8 });
      const salida = await ejecutar('auditar_web', { lead, paginas }, p);
      console.log(salida);
      if (/^Escaneo /.test(salida)) {
        console.log(await ejecutar('generar_informe', { escaneo: lead, tipo: 'diagnostico', pdf: true }, p));
      }
      generarPanel();
    });
    return { trabajo: id };
  },

  arranque() {
    const estadoPrevio = cargar();
    const cuantas = estadoPrevio.leads.filter((l) => l.estado === 'sin-auditar' && l.web && !l.empresa.startsWith('[')).length;
    const id = lanzar('Auditando la cartera entera', async () => {
      const estado = cargar();
      sembrarLeads(estado);
      guardar(estado);
      const pendientes = estado.leads.filter((l) => l.estado === 'sin-auditar' && l.web && !l.empresa.startsWith('['));
      if (!pendientes.length) { console.log('No hay ninguna web pendiente de auditar.'); return; }
      console.log(`${pendientes.length} webs por auditar. Puedes cerrar esta pestaña: sigue trabajando.`);
      const p = nuevoPresupuesto({
        auditorias: pendientes.length, informes: pendientes.length + 2,
        correos: pendientes.length + 2, pasos: pendientes.length * 4 + 10,
      });
      const salida = await correrPiloto(p, { limite: pendientes.length + 6 });
      console.log(`\n${salida.resumen}`);
    }, { total: cuantas, patron: /^Escaneo /});
    return { trabajo: id };
  },

  buscarLeads({ cuantos }) {
    const id = lanzar('Buscando leads nuevos', async () => {
      const p = nuevoPresupuesto({ pasos: 4 });
      console.log(await ejecutar('buscar_leads', { cuantos }, p));
    });
    return { trabajo: id };
  },

  anadirLeads({ texto }) {
    if (!String(texto || '').trim()) throw new Error('No has escrito ningún lead.');
    const id = lanzar('Comprobando los leads que has añadido', async () => {
      const estado = cargar();
      const parte = await anadirManual(estado, texto, { registrar: (t) => console.log(t) });
      guardar(estado);
      console.log(`\n${parte.anadidos.length} añadidos, ${parte.descartados.length} descartados `
        + '(no responde su web o ya estaban).');
    });
    return { trabajo: id };
  },

  sesion({ simulacro, conIA }) {
    const id = lanzar(simulacro ? 'Sesión automática (simulacro)' : 'Sesión automática', async () => {
      const p = nuevoPresupuesto();
      p.simulacro = !!simulacro;
      const salida = conIA && await hayIA() ? await correrAutonomo(p) : await correrPiloto(p);
      console.log(`\n${salida.resumen}`);
    });
    return { trabajo: id };
  },

  vigilar({ cliente }) {
    const id = lanzar(`Vigilancia de ${cliente}`, async () => {
      const p = nuevoPresupuesto({ auditorias: 1, informes: 1, correos: 0, pasos: 6 });
      console.log(await ejecutar('vigilar_cliente', { cliente }, p));
      generarPanel();
    });
    return { trabajo: id };
  },

  informe({ escaneo, tipo = 'completo' }) {
    const id = lanzar(`Informe ${tipo}`, async () => {
      const e = cargarEscaneo(escaneo);
      const r = await generarInforme(e, { tipo, pdf: true });
      console.log(`Informe generado: ${basename(r.html)}`);
      return { html: basename(r.html), pdf: r.pdf ? basename(r.pdf) : null };
    });
    return { trabajo: id };
  },

  correo({ lead, plantilla, nombre, clienteSuyo }) {
    const p = nuevoPresupuesto({ correos: 1, pasos: 2 });
    return ejecutar('redactar_correo', { lead, plantilla, nombre, cliente_suyo: clienteSuyo }, p)
      .then((mensaje) => ({ mensaje }));
  },

  enviado({ id }) {
    const { correo, lead } = marcarEnviado(id);
    return { mensaje: `Marcado como enviado. ${correo.empresa} pasa a "${lead?.estado || 'sin lead'}".` };
  },

  lead({ id, estado: nuevo, nota, web }) {
    const estado = cargar();
    const lead = buscarLead(estado, id);
    if (!lead) throw new Error(`No encuentro el lead "${id}".`);
    if (nuevo) {
      if (!ESTADOS_LEAD.includes(nuevo)) throw new Error(`Estado no válido: ${nuevo}`);
      lead.estado = nuevo;
      if (nuevo === 'contactado') lead.fechaContacto ||= new Date().toISOString();
      if (nuevo === 'respondido') lead.fechaRespuesta = new Date().toISOString();
      anotarEvento(estado, 'lead', `${lead.empresa} → ${nuevo}`, lead.id);
    }
    if (nota) lead.notas = [lead.notas, nota].filter(Boolean).join(' · ');
    if (web !== undefined) lead.web = web;
    guardar(estado);
    return { mensaje: `${lead.empresa}: ${lead.estado}.` };
  },

  cliente({ nombre, plan = 'vigilancia', cuota }) {
    const estado = cargar();
    const ultimo = listarEscaneos(nombre)[0];
    const existente = estado.clientes.find((c) => slug(c.nombre) === slug(nombre));
    const cliente = existente || { nombre, desde: new Date().toISOString().slice(0, 10) };
    cliente.plan = plan;
    cliente.cuota = cuota ? +cuota : cliente.cuota || config.precios.vigilanciaMin;
    cliente.web = cliente.web || ultimo?.url || '';
    cliente.ultimoEscaneo = ultimo?.fecha || cliente.ultimoEscaneo || null;
    if (!existente) estado.clientes.push(cliente);
    const lead = buscarLead(estado, nombre);
    if (lead) lead.estado = 'cliente';
    anotarEvento(estado, 'cliente', `${nombre} · ${plan} · ${euros(cliente.cuota)}`, slug(nombre));
    guardar(estado);
    return { mensaje: `${nombre} guardado como cliente de ${plan}, ${euros(cliente.cuota)}/mes.` };
  },
};

function cuerpo(req) {
  return new Promise((resolver, rechazar) => {
    let datos = '';
    req.on('data', (t) => {
      datos += t;
      if (datos.length > 1e6) { rechazar(new Error('Petición demasiado grande.')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolver(datos ? JSON.parse(datos) : {}); } catch { rechazar(new Error('JSON no válido.')); }
    });
  });
}

const json = (res, codigo, datos) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(datos));
};

export function crearServidor() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(PAGINA);
      }

      if (req.method === 'GET' && url.pathname === '/api/estado') return json(res, 200, estadoCompleto());
      if (req.method === 'GET' && url.pathname === '/api/trabajo') return json(res, 200, estadoTrabajo());

      if (req.method === 'POST' && url.pathname === '/api/accion') {
        const datos = await cuerpo(req);
        const fn = ACCIONES[datos.tipo];
        if (!fn) return json(res, 400, { error: `Acción desconocida: ${datos.tipo}` });
        const salida = await fn(datos);
        return json(res, 200, salida || {});
      }

      // Los informes generados, para abrirlos en otra pestaña.
      if (req.method === 'GET' && url.pathname.startsWith('/informes/')) {
        const nombre = basename(decodeURIComponent(url.pathname.slice('/informes/'.length)));
        const ruta = join(DATOS, 'informes', nombre);
        if (!existsSync(ruta)) return json(res, 404, { error: 'No existe ese informe.' });
        res.writeHead(200, { 'Content-Type': TIPOS[extname(nombre)] || 'application/octet-stream' });
        return res.end(readFileSync(ruta));
      }

      return json(res, 404, { error: 'No existe esa dirección.' });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  });
}

export function arrancar({ puerto = 4321 } = {}) {
  hayIA().then((v) => { IA_DISPONIBLE = v; });
  return new Promise((resolver, rechazar) => {
    const servidor = crearServidor();
    servidor.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        rechazar(new Error(`El puerto ${puerto} está ocupado. Prueba: agencia abrir --puerto ${puerto + 1}`));
      } else rechazar(e);
    });
    // Solo en local: esto es la ventana del programa, no un servidor de internet.
    servidor.listen(puerto, '127.0.0.1', () => resolver({ servidor, direccion: `http://localhost:${puerto}` }));
  });
}
