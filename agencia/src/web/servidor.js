/**
 * El servidor de la aplicación: sirve la página y expone las mismas acciones que
 * la línea de comandos, para que se puedan pulsar con el ratón.
 *
 * Escucha solo en 127.0.0.1: no es un servidor público, es la ventana del programa.
 * No usa ninguna librería web a propósito — un servidor HTTP de Node basta y así el
 * programa se instala en veinte segundos y no hereda vulnerabilidades de nadie.
 */
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { config } from '../config.js';
import { DATOS, euros, diasDesde, slug, asegurarDir } from '../util.js';
import { cargar, guardar, sembrarLeads, buscarLead, listarEscaneos, cargarEscaneo, anotarEvento, ESTADOS_LEAD } from '../almacen.js';
import { calcularAgenda, marcador, ventanaLlamadas } from '../agente/hoy.js';
import { nuevoPresupuesto, ejecutar, bandeja, marcarEnviado, leerBitacora } from '../agente/herramientas.js';
import { correrPiloto, plantillaPara } from '../agente/piloto.js';
import { porContactar, necesitaLeads, anadirManual, UMBRAL } from '../crm/cantera.js';
import { PASOS, GUION, calcularEncargo, enMarcha, correoConfirmacion, correoEntrega } from '../crm/encargo.js';
import { correrAutonomo, conversar } from '../agente/autonomo.js';
import { hayIA } from '../agente/ia.js';
import { generarPanel } from '../panel/panel.js';
import { generarInforme } from '../informe/generar.js';
import { lanzar, estadoTrabajo, hayTrabajo } from './trabajos.js';
import { leerProgramacion, guardarProgramacion, proximaEjecucion, arrancarProgramador } from './programador.js';
import { PAGINA } from './pagina.js';

// Se consulta una vez al arrancar: la página necesita saber si puede ofrecer
// la búsqueda automática de leads o solo el pegado a mano.
let IA_DISPONIBLE = false;

// La conversación con el director: lo que ve el usuario y lo que ve el modelo.
let CLAVE = null;       // si se sirve a la red local, la llave de entrada
let charla = [];        // [{quien:'tu'|'agente', texto, hora}]
let mensajesIA = [];    // el historial en el formato de la API

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
    guion: GUION,
    pasosEncargo: PASOS,
    encargos: estado.leads.filter(enMarcha).map((l) => ({
      id: l.id,
      empresa: l.empresa,
      web: l.web,
      estado: l.estado,
      escaneo: (l.escaneos || []).at(-1) || null,
      ...calcularEncargo(l, { escaneos, informes: listarInformes(), clientes: estado.clientes }),
    })),
    bandeja: bandeja(),
    bitacora: leerBitacora(15),
    trabajo: estadoTrabajo(),
    ia: IA_DISPONIBLE,
    charla,
    programacion: { ...leerProgramacion(), proxima: proximaEjecucion(leerProgramacion()) },
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

  paso({ lead: clave, paso, hecho }) {
    const estado = cargar();
    const lead = buscarLead(estado, clave);
    if (!lead) throw new Error(`No encuentro a "${clave}".`);
    if (!PASOS.some((p) => p.id === paso)) throw new Error(`Paso desconocido: ${paso}`);
    lead.encargo = lead.encargo || {};
    if (hecho) lead.encargo[paso] = new Date().toISOString();
    else delete lead.encargo[paso];
    // Quien tiene encargo abierto ya no es un lead frío.
    if (hecho && ['sin-auditar', 'auditado', 'contactado', 'recordado', 'respondido'].includes(lead.estado)) {
      lead.estado = 'llamada';
    }
    guardar(estado);
    return { mensaje: `${lead.empresa}: ${hecho ? 'hecho' : 'desmarcado'} "${PASOS.find((p) => p.id === paso).titulo.toLowerCase()}".` };
  },

  correoEncargo({ lead: clave, tipo }) {
    const lead = buscarLead(cargar(), clave);
    if (!lead) throw new Error(`No encuentro a "${clave}".`);
    const escaneo = (lead.escaneos || []).length ? cargarEscaneo(lead.escaneos.at(-1)) : null;
    const correo = tipo === 'entrega' ? correoEntrega(lead, escaneo) : correoConfirmacion(lead);
    return { correo };
  },

  chat({ mensaje }) {
    const texto = String(mensaje || '').trim();
    if (!texto) throw new Error('No has escrito nada.');
    if (!IA_DISPONIBLE) throw new Error('Hablar con el agente necesita clave de API (ANTHROPIC_API_KEY). '
      + 'Sin ella tienes los botones, que hacen el mismo trabajo.');

    charla.push({ quien: 'tu', texto, hora: new Date().toISOString() });
    mensajesIA.push({ role: 'user', content: texto });

    const id = lanzar('El agente está trabajando', async () => {
      const p = nuevoPresupuesto();
      const { respuesta, mensajes } = await conversar(mensajesIA, p);
      mensajesIA = mensajes;
      // Se recorta el historial para no arrastrar sesiones enteras en cada mensaje.
      if (mensajesIA.length > 40) mensajesIA = mensajesIA.slice(-40);
      charla.push({ quien: 'agente', texto: respuesta || '(sin respuesta)', hora: new Date().toISOString() });
    });
    return { trabajo: id };
  },

  olvidarCharla() {
    charla = [];
    mensajesIA = [];
    return { mensaje: 'Conversación borrada.' };
  },

  programacion({ activo, hora }) {
    const cambios = {};
    if (activo !== undefined) cambios.activo = !!activo;
    if (hora) {
      if (!/^\d{1,2}:\d{2}$/.test(hora)) throw new Error('La hora se escribe como 08:00.');
      cambios.hora = hora;
    }
    const prog = guardarProgramacion(cambios);
    return { mensaje: prog.activo ? `Sesión diaria activada a las ${prog.hora}.` : 'Sesión diaria desactivada.' };
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

const RUTA_ACCESO = join(DATOS, 'acceso.json');

/**
 * La llave de entrada, guardada en disco.
 *
 * Tiene que ser la misma siempre: si cambiara en cada arranque, el enlace que has
 * guardado en favoritos en el móvil dejaría de valer cada vez que abres el programa.
 */
export function claveDeAcceso({ nueva = false } = {}) {
  asegurarDir(DATOS);
  if (!nueva && existsSync(RUTA_ACCESO)) {
    try {
      const { clave } = JSON.parse(readFileSync(RUTA_ACCESO, 'utf8'));
      if (clave) return clave;
    } catch { /* si el fichero está roto, se hace otra */ }
  }
  const clave = randomBytes(8).toString('hex');
  writeFileSync(RUTA_ACCESO, JSON.stringify({ clave, creada: new Date().toISOString() }, null, 2));
  return clave;
}

/** La IP de esta máquina en la red de casa, para abrirlo desde el móvil. */
export function ipLocal() {
  for (const tarjetas of Object.values(networkInterfaces())) {
    for (const t of tarjetas || []) {
      if (t.family === 'IPv4' && !t.internal) return t.address;
    }
  }
  return null;
}

const esLocal = (req) => {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

/**
 * ¿Puede entrar esta petición?
 *
 * Desde el propio ordenador, siempre. Desde el móvil o el portátil de al lado, solo
 * con la llave: la aplicación tiene los datos de los clientes y los correos sin
 * mandar, y una red de casa la comparten más cosas de las que uno cree.
 */
export function permitido(req, url, clave) {
  if (!clave) return true;                       // no se está sirviendo a la red
  if (esLocal(req)) return true;
  if (url.searchParams.get('clave') === clave) return true;
  return (req.headers.cookie || '').includes(`agencia_clave=${clave}`);
};

export function crearServidor() {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (!permitido(req, url, CLAVE)) {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<p style="font:16px system-ui;padding:40px">Falta la llave. Abre el enlace '
          + 'completo que sale en la ventana del programa, con <code>?clave=…</code> al final.</p>');
      }
      // La llave llega una vez por la URL y se queda en una cookie del dispositivo.
      if (CLAVE && url.searchParams.get('clave') === CLAVE) {
        res.setHeader('Set-Cookie', `agencia_clave=${CLAVE}; Path=/; Max-Age=2592000; SameSite=Lax`);
      }
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

export function arrancar({ puerto = 4321, intentos = 10, red = false, nuevaClave = false } = {}) {
  hayIA().then((v) => { IA_DISPONIBLE = v; });
  if (red) CLAVE = claveDeAcceso({ nueva: nuevaClave });
  // La sesión diaria, mientras la aplicación esté abierta.
  arrancarProgramador(() => {
    if (hayTrabajo()) return;
    ACCIONES.sesion({ conIA: IA_DISPONIBLE });
  });
  return buscarPuerto(puerto, intentos, red);
}

/**
 * Levanta el servidor en el primer puerto libre a partir del pedido.
 *
 * Si el puerto está ocupado por otra copia de este mismo programa (pasa al abrirlo
 * dos veces), no se monta una segunda: se devuelve la que ya estaba corriendo. Y si
 * lo ocupa cualquier otra cosa, se prueba el siguiente. Que el usuario tenga que
 * escribir un comando para esquivar un puerto no es una opción.
 */
async function buscarPuerto(inicial, intentos, red = false) {
  for (let i = 0; i < intentos; i++) {
    const puerto = inicial + i;
    try {
      return await escuchar(puerto, red);
    } catch (e) {
      if (e.code !== 'EADDRINUSE') throw e;
      if (await esNuestra(puerto)) {
        return { servidor: null, direccion: `http://localhost:${puerto}`, yaAbierta: true };
      }
    }
  }
  throw new Error(`No hay ningún puerto libre entre el ${inicial} y el ${inicial + intentos - 1}.`);
}

function escuchar(puerto, red = false) {
  return new Promise((resolver, rechazar) => {
    const servidor = crearServidor();
    servidor.once('error', rechazar);
    // Por defecto solo en local: esto es la ventana del programa, no un servidor de
    // internet. Con `red`, también desde el móvil de casa, y entonces con llave.
    servidor.listen(puerto, red ? '0.0.0.0' : '127.0.0.1', () => {
      servidor.removeListener('error', rechazar);
      const ip = red ? ipLocal() : null;
      resolver({
        servidor,
        puerto,
        direccion: `http://localhost:${puerto}`,
        enRed: ip ? `http://${ip}:${puerto}/?clave=${CLAVE}` : null,
        clave: CLAVE,
      });
    });
  });
}

/** ¿Lo que hay escuchando en ese puerto es otra copia de esta misma aplicación? */
async function esNuestra(puerto) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), 1500);
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}/api/estado`, { signal: control.signal });
    const datos = await r.json();
    return typeof datos?.marca === 'string' && typeof datos?.umbralLeads === 'number';
  } catch {
    return false;
  } finally {
    clearTimeout(reloj);
  }
}
