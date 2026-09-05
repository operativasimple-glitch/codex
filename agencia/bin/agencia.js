#!/usr/bin/env node
/**
 * El programa de la agencia. Un solo comando para todo el negocio:
 *
 *   agencia hoy                          qué toca hacer ahora, en orden
 *   agencia auditar <web>                rastrea la web entera y guarda el escaneo
 *   agencia manual <escaneo>             la revisión a mano, que es lo que se cobra
 *   agencia informe <escaneo>            informe en HTML y PDF
 *   agencia correo <lead>                el correo, con los hallazgos reales dentro
 *   agencia leads | lead | cliente       el estado comercial
 *   agencia vigilar <cliente>            reescaneo mensual y alerta de regresiones
 *   agencia panel                        el panel del negocio
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { col, titulo, euros, hoyISO, asegurarDir, DATOS, slug, diasDesde, mismoDominio } from '../src/util.js';
import { cargar, guardar, sembrarLeads, buscarLead, anotarEvento, listarEscaneos, cargarEscaneo, ESTADOS_LEAD } from '../src/almacen.js';
import { auditar } from '../src/auditoria/motor.js';
import { pasarGuion } from '../src/auditoria/manual.js';
import { generarInforme } from '../src/informe/generar.js';
import { redactar, PLANTILLAS, AVISO_ENVIO } from '../src/crm/correos.js';
import { vigilar, informeVigilancia } from '../src/vigilancia/monitor.js';
import { generarPanel } from '../src/panel/panel.js';
import { imprimirHoy } from '../src/agente/hoy.js';
import { resumirParaDireccion, personalizarCorreo, hayIA } from '../src/agente/ia.js';
import { nuevoPresupuesto, bandeja, marcarEnviado, leerBitacora } from '../src/agente/herramientas.js';
import { correrPiloto } from '../src/agente/piloto.js';
import { correrAutonomo } from '../src/agente/autonomo.js';
import { arrancar } from '../src/web/servidor.js';

// ── Argumentos: posicionales y --opciones, sin dependencias.
function parsear(argv) {
  const pos = [];
  const op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [clave, valorPegado] = a.slice(2).split('=');
      const siguiente = argv[i + 1];
      if (valorPegado !== undefined) op[clave] = valorPegado;
      else if (siguiente && !siguiente.startsWith('--')) { op[clave] = siguiente; i++; }
      else op[clave] = true;
    } else pos.push(a);
  }
  return { pos, op };
}

const AYUDA = `
${col.neg(`${config.marca} · el programa que corre la agencia`)}

  ${col.azul('agencia abrir')}                      LA APLICACIÓN: la ventana con botones, en el navegador
      --puerto N         si el 4321 está ocupado

  ${col.azul('agencia arranque')}                   DE CERO A TODO: carga los leads, audita todas sus webs,
                                     saca los diagnósticos y deja los correos escritos. Se deja corriendo.
  ${col.azul('agencia auto')}                       LA SESIÓN AUTOMÁTICA: hace el trabajo del día solo
      --simulacro        enseña lo que haría sin tocar nada
      --sin-ia           piloto determinista (no necesita clave de API)
      --auditorias N --informes N --correos N --pasos N    presupuesto de la sesión
      --mision "..."     un encargo concreto en vez de la sesión de siempre
  ${col.azul('agencia bandeja')} [<id>]             Correos preparados por el agente, esperando a que los mandes tú
      <id> --enviado     márcalo cuando lo hayas mandado (mueve el lead a "contactado")
  ${col.azul('agencia bitacora')} [--n 40]          Todo lo que ha hecho el agente, por orden

  ${col.azul('agencia hoy')}                        Qué toca hacer ahora, en orden y con el comando de cada cosa
  ${col.azul('agencia panel')} [--abrir]            Genera el panel del negocio en HTML

  ${col.azul('agencia auditar <web>')}              Rastrea la web entera, guarda el escaneo y las capturas
      --paginas N        cuántas páginas como máximo (por defecto ${config.rastreo.maxPaginas})
      --cliente "X"      nombre que sale en el informe
      --informe          genera además el informe completo
      --diagnostico      genera el informe corto gratuito
      --pdf              imprime también el PDF
      --visible          abre el navegador para verlo trabajar

  ${col.azul('agencia manual <escaneo>')}           Guion de revisión manual (el 43 % que no ve ninguna herramienta)
  ${col.azul('agencia informe <escaneo>')}          Informe a partir de un escaneo ya hecho
      --tipo completo|diagnostico   --pdf   --ia (redacta el resumen con Claude)

  ${col.azul('agencia correo <lead|escaneo>')}      Redacta el correo con los hallazgos reales
      --plantilla ${PLANTILLAS.join('|')}
      --nombre "Marta"   --cliente-suyo "Tienda X"   (para agencias web)
      --ia               adapta el texto al lead con Claude (necesita ANTHROPIC_API_KEY)

  ${col.azul('agencia leads')} [--sembrar]          Lista de leads; --sembrar carga los 20 del paquete de contexto
  ${col.azul('agencia lead <id>')}                  Cambia el estado de un lead
      --estado ${ESTADOS_LEAD.join('|')}
      --nota "..."
  ${col.azul('agencia cliente <nombre>')}           Da de alta un cliente
      --plan vigilancia|auditoria   --cuota 300

  ${col.azul('agencia vigilar <cliente>')}          Reescaneo mensual y comparación con el anterior
  ${col.azul('agencia escaneos')}                   Escaneos guardados

${col.gris(`Datos en ${DATOS}. Todo son ficheros: se pueden abrir, copiar y editar a mano.`)}
`;

const abrir = (ruta) => {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const hijo = spawn(cmd, [ruta], { detached: true, stdio: 'ignore' });
  // En un servidor sin escritorio no existe el comando: no es motivo para romper nada.
  hijo.on('error', () => console.log(col.gris(`(Ábrelo tú: ${ruta})`)));
  hijo.unref();
};

// ── Comandos

async function cmdAuditar(pos, op) {
  const web = pos[0];
  if (!web) throw new Error('Falta la web. Ejemplo: agencia auditar amarillolimon.net');
  titulo(`Auditando ${web}`);
  const escaneo = await auditar(web, {
    paginas: op.paginas ? +op.paginas : undefined,
    cliente: op.cliente,
    visible: !!op.visible,
  });

  console.log(`\n${col.neg('Resultado')} · ${escaneo.totales.paginas} páginas · `
    + `${escaneo.totales.incidencias} incidencias · ${escaneo.totales.tiposDeFallo} tipos`);
  for (const h of escaneo.hallazgos.slice(0, 8)) {
    const marca = h.gravedad === 'critica' ? col.rojo('■') : h.gravedad === 'alta' ? col.ambar('■') : col.gris('■');
    const ref = h.criterio === '—' ? '' : `WCAG ${h.criterio} · `;
    console.log(`  ${marca} ${h.titulo} ${col.gris(`· ${h.incidencias} · ${ref}${h.minutos} min`)}`);
  }
  console.log(`\n  ${col.gris('Corrección estimada:')} ${Math.round(escaneo.totales.minutosCorreccion / 60 * 10) / 10} h · ${euros(escaneo.totales.costeCorreccion)}`);
  console.log(`  ${col.gris('Escaneo guardado como')} ${escaneo.id}`);

  // Si la web corresponde a un lead, se enlaza y pasa a "auditado".
  const estado = cargar();
  const lead = estado.leads.find((l) => mismoDominio(l.web, escaneo.dominio));
  if (lead) {
    lead.escaneos = [...new Set([...(lead.escaneos || []), escaneo.id])];
    if (lead.estado === 'sin-auditar') lead.estado = 'auditado';
    anotarEvento(estado, 'auditoria', `Auditada ${lead.empresa}: ${escaneo.totales.incidencias} incidencias`, escaneo.id);
    guardar(estado);
    console.log(`  ${col.gris('Lead')} ${lead.empresa} ${col.gris('→ estado "auditado"')}`);
  }

  if (op.informe || op.diagnostico || op.pdf) {
    const tipo = op.diagnostico ? 'diagnostico' : 'completo';
    const r = await generarInforme(escaneo, { tipo, pdf: !!op.pdf });
    console.log(`  ${col.verde('Informe:')} ${r.html}${r.pdf ? `\n  ${col.verde('PDF:')}     ${r.pdf}` : ''}`);
  } else {
    console.log(`\n  ${col.gris('Siguiente:')} agencia informe ${escaneo.id} --pdf`);
  }
}

async function cmdInforme(pos, op) {
  const escaneo = cargarEscaneo(pos[0] || '');
  const tipo = op.tipo || (op.diagnostico ? 'diagnostico' : 'completo');
  if (op.ia) {
    if (!await hayIA()) console.log(col.ambar('Sin ANTHROPIC_API_KEY o sin @anthropic-ai/sdk: se usa el texto de plantilla.'));
    else {
      process.stdout.write(col.gris('Redactando el resumen para dirección con Claude... '));
      escaneo.resumenIA = await resumirParaDireccion(escaneo);
      console.log(escaneo.resumenIA ? col.verde('hecho') : col.ambar('no ha salido; sigue la plantilla'));
    }
  }
  const r = await generarInforme(escaneo, { tipo, pdf: !!op.pdf });
  console.log(`${col.verde('Informe')} ${tipo} de ${escaneo.cliente}:\n  ${r.html}${r.pdf ? `\n  ${r.pdf}` : ''}`);
  if (op.abrir) abrir(r.html);
  if (tipo === 'completo' && !escaneo.manual) {
    console.log(col.ambar('\n  Ojo: este informe todavía no lleva revisión manual.'));
    console.log(col.gris(`  Antes de cobrarlo:  agencia manual ${escaneo.id}`));
  }
}

async function cmdManual(pos) {
  const escaneo = cargarEscaneo(pos[0] || '');
  await pasarGuion(escaneo);
  const fallos = escaneo.manual.respuestas.filter((r) => r.resultado === 'falla');
  console.log(`${col.verde('Revisión manual guardada.')} ${fallos.length} fallo(s) añadidos al escaneo ${escaneo.id}.`);
  console.log(col.gris(`Regenera el informe:  agencia informe ${escaneo.id} --pdf`));
}

async function cmdCorreo(pos, op) {
  const estado = cargar();
  const clave = pos[0];
  if (!clave) throw new Error('Falta el lead o el escaneo. Ejemplo: agencia correo amarillo-limon');
  const lead = buscarLead(estado, clave);
  const escaneo = lead?.escaneos?.length ? cargarEscaneo(lead.escaneos.at(-1)) : cargarEscaneo(clave);

  const plantilla = op.plantilla
    || ({ 'Agencia web': 'agencia', 'Gestoría': 'gestoria', 'Red directa': 'red' }[lead?.segmento])
    || 'directa';
  let correo = redactar(plantilla, {
    lead, escaneo,
    nombre: op.nombre || '[nombre]',
    clienteSuyo: op['cliente-suyo'] || null,
  });

  if (op.ia && await hayIA()) {
    process.stdout.write(col.gris('Adaptando el correo al lead con Claude... '));
    const adaptado = await personalizarCorreo(correo, lead, escaneo);
    console.log(adaptado ? col.verde('hecho') : col.ambar('no ha salido; sigue la plantilla'));
    if (adaptado) correo = adaptado;
  }

  titulo(`Correo · plantilla "${plantilla}"`);
  console.log(`${col.neg('Asunto:')} ${correo.asunto}\n`);
  console.log(correo.cuerpo);
  console.log(`\n${col.gris('Antes de mandarlo:')}`);
  AVISO_ENVIO.forEach((a) => console.log(col.gris(`  · ${a}`)));

  const ruta = join(asegurarDir(join(DATOS, 'correos')), `${slug(lead?.empresa || escaneo.cliente)}-${plantilla}-${hoyISO()}.txt`);
  writeFileSync(ruta, `Asunto: ${correo.asunto}\n\n${correo.cuerpo}\n`);
  console.log(`\n${col.gris('Guardado en')} ${ruta}`);

  if (lead && !op['sin-marcar']) {
    const nuevoEstado = plantilla === 'recordatorio' ? 'recordado' : 'contactado';
    lead.estado = nuevoEstado;
    if (nuevoEstado === 'contactado') lead.fechaContacto = new Date().toISOString();
    else lead.fechaRecordatorio = new Date().toISOString();
    anotarEvento(estado, 'correo', `${nuevoEstado} ${lead.empresa} (plantilla ${plantilla})`, lead.id);
    guardar(estado);
    console.log(col.gris(`Lead ${lead.empresa} → "${nuevoEstado}". Si aún no lo has mandado: agencia lead ${lead.id} --estado auditado`));
  }
}

function cmdLeads(op) {
  const estado = cargar();
  if (op.sembrar) {
    const n = sembrarLeads(estado);
    guardar(estado);
    console.log(`${col.verde(`${n} leads cargados.`)} Total: ${estado.leads.length}.`);
    if (!n) console.log(col.gris('Ya estaban todos.'));
    return;
  }
  const lista = estado.leads
    .filter((l) => !op.estado || l.estado === op.estado)
    .sort((a, b) => a.prioridad - b.prioridad || a.empresa.localeCompare(b.empresa));
  if (!lista.length) {
    console.log(col.ambar('No hay leads.') + col.gris('  Cárgalos con: agencia leads --sembrar'));
    return;
  }
  titulo(`Leads (${lista.length})`);
  for (const l of lista) {
    const marca = { 'sin-auditar': col.gris('○'), auditado: col.azul('◐'), contactado: col.ambar('◑'),
      recordado: col.ambar('◕'), respondido: col.verde('●'), llamada: col.verde('◉'),
      cliente: col.verde('★'), descartado: col.gris('×') }[l.estado] || '·';
    console.log(`${marca} ${col.neg(l.empresa.padEnd(34).slice(0, 34))} ${col.gris((l.web || '').padEnd(26).slice(0, 26))} `
      + `${l.estado.padEnd(12)} ${col.gris(l.segmento || '')}`);
  }
  console.log(col.gris(`\nP1: ${lista.filter((l) => l.prioridad === 1).length} · sin auditar: ${lista.filter((l) => l.estado === 'sin-auditar').length}`));
}

function cmdLead(pos, op) {
  const estado = cargar();
  const lead = buscarLead(estado, pos[0] || '');
  if (!lead) throw new Error(`No encuentro el lead "${pos[0]}". Míralos con: agencia leads`);
  if (op.estado) {
    if (!ESTADOS_LEAD.includes(op.estado)) throw new Error(`Estado no válido. Usa uno de: ${ESTADOS_LEAD.join(', ')}`);
    lead.estado = op.estado;
    if (op.estado === 'contactado') lead.fechaContacto ||= new Date().toISOString();
    if (op.estado === 'respondido') lead.fechaRespuesta = new Date().toISOString();
    anotarEvento(estado, 'lead', `${lead.empresa} → ${op.estado}`, lead.id);
  }
  if (op.nota) lead.notas = [lead.notas, op.nota].filter(Boolean).join(' · ');
  if (op.web) lead.web = op.web;
  guardar(estado);
  titulo(lead.empresa);
  console.log(`${col.gris('Estado')}     ${lead.estado}`);
  console.log(`${col.gris('Web')}        ${lead.web || '—'}`);
  console.log(`${col.gris('Segmento')}   ${lead.segmento || '—'} (prioridad ${lead.prioridad})`);
  console.log(`${col.gris('Contacto')}   ${lead.fechaContacto ? `hace ${diasDesde(lead.fechaContacto)} días` : '—'}`);
  console.log(`${col.gris('Escaneos')}   ${lead.escaneos?.join(', ') || '—'}`);
  if (lead.notas) console.log(`${col.gris('Notas')}      ${lead.notas}`);
}

function cmdCliente(pos, op) {
  const estado = cargar();
  const nombre = pos[0];
  if (!nombre) throw new Error('Falta el nombre. Ejemplo: agencia cliente "Alcalink" --plan vigilancia --cuota 300');
  const existente = estado.clientes.find((c) => slug(c.nombre) === slug(nombre));
  const ultimo = listarEscaneos(nombre)[0];
  const cliente = existente || { nombre, desde: hoyISO() };
  cliente.plan = op.plan || cliente.plan || 'vigilancia';
  cliente.cuota = op.cuota ? +op.cuota : cliente.cuota || config.precios.vigilanciaMin;
  cliente.web = op.web || cliente.web || ultimo?.url || '';
  cliente.ultimoEscaneo = ultimo?.fecha || cliente.ultimoEscaneo || null;
  if (!existente) estado.clientes.push(cliente);

  const lead = buscarLead(estado, nombre);
  if (lead) lead.estado = 'cliente';
  anotarEvento(estado, 'cliente', `${nombre} · ${cliente.plan} · ${euros(cliente.cuota)}`, slug(nombre));
  guardar(estado);
  const mrr = estado.clientes.reduce((s, c) => s + (c.plan === 'vigilancia' ? c.cuota : 0), 0);
  console.log(`${col.verde('Cliente guardado.')} ${nombre} · ${cliente.plan} · ${euros(cliente.cuota)}/mes`);
  console.log(col.gris(`Recurrente total: ${euros(mrr)}/mes con ${estado.clientes.length} cliente(s).`));
}

async function cmdVigilar(pos, op) {
  const clave = pos[0];
  if (!clave) throw new Error('Falta el cliente. Ejemplo: agencia vigilar alcalink');
  titulo(`Vigilancia · ${clave}`);
  const { actual, anterior, comparacion } = await vigilar(clave, { paginas: op.paginas ? +op.paginas : undefined });
  if (!comparacion) {
    console.log(col.ambar('Es el primer escaneo de este cliente: no hay con qué comparar.'));
    console.log(col.gris(`Guardado como ${actual.id}. El mes que viene ya habrá comparación.`));
    return;
  }
  const c = comparacion;
  console.log(`\n${c.regresiones.length ? col.rojo(`${c.regresiones.length} regresión(es)`) : col.verde('Sin regresiones')}`
    + col.gris(` · saldo ${c.saldoIncidencias >= 0 ? '+' : ''}${c.saldoIncidencias} incidencias`));
  for (const h of c.nuevos) console.log(`  ${col.rojo('+')} nuevo: ${h.titulo} (${h.incidencias})`);
  for (const h of c.empeorados) console.log(`  ${col.ambar('↑')} ${h.titulo}: ${h.antes} → ${h.incidencias}`);
  for (const h of c.resueltos) console.log(`  ${col.verde('✓')} resuelto: ${h.titulo}`);
  for (const h of c.mejorados) console.log(`  ${col.verde('↓')} ${h.titulo}: ${h.antes} → ${h.incidencias}`);

  const ruta = informeVigilancia(actual, anterior, c);
  console.log(`\n${col.verde('Informe de vigilancia:')} ${ruta}`);

  const estado = cargar();
  const cliente = estado.clientes.find((x) => slug(x.nombre) === slug(actual.cliente) || slug(x.nombre) === slug(clave));
  if (cliente) { cliente.ultimoEscaneo = actual.fecha; guardar(estado); }
}

function cmdEscaneos() {
  const escaneos = listarEscaneos();
  if (!escaneos.length) { console.log(col.ambar('Todavía no hay escaneos.')); return; }
  titulo(`Escaneos (${escaneos.length})`);
  for (const e of escaneos) {
    const marca = { rojo: col.rojo('■'), ambar: col.ambar('■'), verde: col.verde('■') }[e.semaforo];
    console.log(`${marca} ${col.neg(e.id.padEnd(34))} ${(e.cliente || '').padEnd(24).slice(0, 24)} `
      + col.gris(`${e.totales.incidencias} incid · ${e.totales.paginas} pág · ${e.manual ? 'manual ✓' : 'sin manual'}`));
  }
}

/** Abre la aplicación: el programa con botones, en el navegador. */
async function cmdAbrir(pos, op) {
  const puerto = op.puerto ? +op.puerto : 4321;
  const { direccion, yaAbierta } = await arrancar({ puerto });

  if (yaAbierta) {
    // Ya había una copia corriendo (doble clic dos veces). Se usa esa.
    console.log(`\n  ${col.neg(config.marca)} ${col.gris('· ya estaba abierta en')}`);
    console.log(`  ${col.azul(direccion)}\n`);
    console.log(col.gris('  Te la abro en el navegador. Esta ventana puedes cerrarla:'));
    console.log(col.gris('  el programa sigue corriendo en la otra.\n'));
    if (!op['sin-abrir']) abrir(direccion);
    return;
  }

  console.log(`\n  ${col.neg(config.marca)} ${col.gris('· la aplicación está abierta en')}`);
  console.log(`  ${col.azul(direccion)}\n`);
  console.log(col.gris('  Deja esta ventana abierta mientras la uses. Para cerrar el programa: Control + C.\n'));
  if (!op['sin-abrir']) abrir(direccion);
}

/**
 * Arranque: de cero a la cartera entera auditada, sin volver a tocar nada.
 * Carga los leads, audita todas las webs pendientes, saca cada diagnóstico y deja
 * todos los correos escritos en la bandeja. Es una sola orden y se deja corriendo.
 */
async function cmdArranque(pos, op) {
  const estado = cargar();
  const nuevos = sembrarLeads(estado);
  if (nuevos) { guardar(estado); console.log(`${col.verde(`${nuevos} leads cargados.`)}`); }

  const pendientes = estado.leads.filter((l) => l.estado === 'sin-auditar' && l.web && !l.empresa.startsWith('['));
  if (!pendientes.length) {
    console.log(col.ambar('No hay ningún lead con web pendiente de auditar.'));
    console.log(col.gris('Sigue con:  agencia auto'));
    return;
  }

  titulo(`Arranque · ${pendientes.length} webs por auditar`);
  console.log(col.gris('Cada web son entre uno y tres minutos. Puedes dejarlo corriendo e irte:'));
  console.log(col.gris('al final tendrás cada diagnóstico en PDF y cada correo escrito en la bandeja.\n'));

  const presupuesto = nuevoPresupuesto({
    auditorias: pendientes.length,
    informes: pendientes.length + 2,
    correos: pendientes.length + 2,
    pasos: pendientes.length * 4 + 10,
  });
  presupuesto.simulacro = !!op.simulacro;

  const salida = await correrPiloto(presupuesto, { limite: pendientes.length + 6 });

  titulo('Resumen del arranque');
  console.log(salida.resumen);
  const enBandeja = bandeja();
  console.log(`\n${col.neg(`${enBandeja.length} correo(s)`)} esperando en la bandeja. Los mandas tú:`);
  console.log(col.azul('  agencia bandeja'));
  console.log(col.gris('\nY a partir de mañana, la sesión diaria:  agencia auto'));
}

async function cmdAuto(pos, op) {
  const presupuesto = nuevoPresupuesto({
    auditorias: op.auditorias ? +op.auditorias : undefined,
    informes: op.informes ? +op.informes : undefined,
    correos: op.correos ? +op.correos : undefined,
    pasos: op.pasos ? +op.pasos : undefined,
  });
  presupuesto.simulacro = !!op.simulacro;

  const conIA = !op['sin-ia'] && await hayIA();
  titulo(`${config.marca} · sesión automática${presupuesto.simulacro ? ' (simulacro)' : ''}`);
  console.log(col.gris(conIA
    ? 'Dirige Claude, con las herramientas del programa y el presupuesto de la sesión.'
    : 'Piloto sin IA: ejecuta las reglas del plan comercial en orden.'));
  console.log(col.gris(`Presupuesto: ${presupuesto.auditorias} auditorías · ${presupuesto.informes} informes · ${presupuesto.correos} correos\n`));

  const salida = conIA
    ? await correrAutonomo(presupuesto, { mision: op.mision })
    : await correrPiloto(presupuesto);

  titulo('Resumen de la sesión');
  console.log(salida.resumen || '(sin resumen)');

  const pendientes = bandeja();
  if (pendientes.length) {
    console.log(`\n${col.ambar(`${pendientes.length} correo(s) esperando en la bandeja.`)} ${col.gris('Revísalos y mándalos tú:')}`);
    console.log(col.azul('  agencia bandeja'));
  }
}

function cmdBandeja(pos, op) {
  const id = pos[0];
  if (id && op.enviado) {
    const { correo, lead } = marcarEnviado(id);
    console.log(`${col.verde('Marcado como enviado.')} ${correo.empresa} → estado "${lead?.estado || 'sin lead'}".`);
    return;
  }
  if (id) {
    const correo = bandeja({ soloPendientes: false }).find((c) => c.id === id || c.id.startsWith(id));
    if (!correo) throw new Error(`No hay ningún correo "${id}" en la bandeja.`);
    titulo(`${correo.empresa} · plantilla "${correo.plantilla}"`);
    console.log(col.gris(`Vía: ${correo.via || 'formulario de su web'} · escaneo ${correo.escaneo}`));
    if (correo.motivo) console.log(col.gris(`Motivo: ${correo.motivo}`));
    console.log(`\n${col.neg('Asunto:')} ${correo.asunto}\n`);
    console.log(correo.cuerpo);
    console.log(col.gris(`\nCuando lo hayas mandado:  agencia bandeja ${correo.id} --enviado`));
    return;
  }
  const pendientes = bandeja();
  if (!pendientes.length) { console.log(col.gris('La bandeja está vacía.')); return; }
  titulo(`Bandeja de salida (${pendientes.length})`);
  for (const c of pendientes) {
    console.log(`${col.neg(c.empresa.padEnd(28).slice(0, 28))} ${col.gris(c.plantilla.padEnd(12))} ${c.asunto}`);
    console.log(col.gris(`  ${c.id}  ·  vía: ${c.via || 'formulario de su web'}`));
  }
  console.log(col.gris('\nVer uno:  agencia bandeja <id>      Marcarlo enviado:  agencia bandeja <id> --enviado'));
}

function cmdBitacora(pos, op) {
  const entradas = leerBitacora(op.n ? +op.n : 20);
  if (!entradas.length) { console.log(col.gris('La bitácora está vacía.')); return; }
  titulo('Bitácora');
  for (const e of entradas) {
    const cuando = new Date(e.fecha).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const texto = e.texto || e.resumen || `${e.nombre} ${JSON.stringify(e.argumentos || {})}`;
    console.log(`${col.gris(cuando)} ${col.neg((e.tipo || '').padEnd(11))} ${String(texto).split('\n')[0].slice(0, 96)}`);
  }
}

// ── Enrutador

const COMANDOS = {
  hoy: () => imprimirHoy(),
  abrir: cmdAbrir,
  app: cmdAbrir,
  auto: cmdAuto,
  arranque: cmdArranque,
  bandeja: (pos, op) => cmdBandeja(pos, op),
  bitacora: (pos, op) => cmdBitacora(pos, op),
  auditar: cmdAuditar,
  informe: cmdInforme,
  manual: cmdManual,
  correo: cmdCorreo,
  leads: (pos, op) => cmdLeads(op),
  lead: cmdLead,
  cliente: cmdCliente,
  vigilar: cmdVigilar,
  escaneos: cmdEscaneos,
  panel: (pos, op) => {
    const ruta = generarPanel();
    console.log(`${col.verde('Panel generado:')} ${ruta}`);
    if (op.abrir) abrir(ruta);
  },
  ayuda: () => console.log(AYUDA),
};

const { pos, op } = parsear(process.argv.slice(2));
const comando = pos.shift() || 'hoy';
const fn = COMANDOS[comando] || (op.ayuda || op.help ? COMANDOS.ayuda : null);

if (!fn) {
  console.error(col.rojo(`Comando desconocido: ${comando}`));
  console.log(AYUDA);
  process.exit(1);
}

try {
  await fn(pos, op);
} catch (e) {
  console.error(`\n${col.rojo('Error:')} ${e.message}`);
  process.exit(1);
}
