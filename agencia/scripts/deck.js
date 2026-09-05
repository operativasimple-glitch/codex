const pptxgen = require("pptxgenjs");
const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";              // 13.333 x 7.5
const W = 13.333, H = 7.5, M = 0.7;

pres.author = "Vía Norte";
pres.title = "Plan fundacional — agencia de estudiantes internacionales";

/* ---------------- paleta ---------------- */
const INK   = "0F2A25";   // fondo oscuro
const DEEP  = "1B4D42";   // viridian dominante
const SEA   = "6FA593";   // secundario
const MIST  = "EAF0ED";   // tarjeta sobre blanco
const GOLD  = "D99B2B";   // acento
const RED   = "A8452F";   // línea roja
const WHITE = "FFFFFF";
const GREY  = "586B63";
const LINE  = "C9D6D0";
const ONDARK= "E9F0EC";

const HEAD = "Cambria";
const BODY = "Calibri";

/* ---------------- helpers ---------------- */
function darkSlide() {
  const s = pres.addSlide();
  s.background = { color: INK };
  return s;
}
function lightSlide(title, kicker) {
  const s = pres.addSlide();
  s.background = { color: WHITE };
  if (kicker) {
    s.addText(kicker.toUpperCase(), {
      x: M, y: 0.42, w: W - 2 * M, h: 0.25, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, color: SEA, charSpacing: 2
    });
  }
  s.addText(title, {
    x: M, y: kicker ? 0.68 : 0.5, w: W - 2 * M, h: 0.72, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 30, bold: true, color: DEEP, valign: "top"
  });
  return s;
}
// insignia circular: el motivo que se repite en todo el deck
function badge(s, x, y, txt, fill, txtColor, d) {
  const dia = d || 0.46;
  s.addShape(pres.ShapeType.ellipse, {
    x: x, y: y, w: dia, h: dia, fill: { color: fill || DEEP }
  });
  s.addText(txt, {
    x: x, y: y, w: dia, h: dia, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: dia > 0.55 ? 14 : 11, bold: true,
    color: txtColor || WHITE, align: "center", valign: "middle"
  });
}
function card(s, x, y, w, h, fill) {
  s.addShape(pres.ShapeType.roundRect, {
    x: x, y: y, w: w, h: h, rectRadius: 0.06,
    fill: { color: fill || MIST }, line: { color: fill ? fill : MIST, width: 0 }
  });
}
function footNote(s, txt) {
  s.addText(txt, {
    x: M, y: H - 0.62, w: W - 2 * M, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 10, italic: true, color: GREY
  });
}

/* ============ 1 · portada ============ */
{
  const s = darkSlide();
  s.addText("Traer estudiantes\na Estados Unidos", {
    x: M, y: 1.55, w: 8.4, h: 2.4, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 48, bold: true, color: WHITE, lineSpacing: 52
  });
  s.addText("Plan fundacional de la agencia · Borrador 1", {
    x: M, y: 4.1, w: 8.4, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 17, color: GOLD
  });
  s.addText(
    "España · México · Chile  →  Estados Unidos\nTres socios, un mercado cada uno, una entidad en EE. UU.",
    { x: M, y: 4.62, w: 8.4, h: 0.9, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 14, color: ONDARK, lineSpacing: 22 });

  // sello: tres círculos que representan los tres mercados
  const cx = 10.5;
  [["ES", 1.9], ["MX", 3.15], ["CL", 4.4]].forEach(([t, y], i) => {
    badge(s, cx, y, t, i === 1 ? GOLD : DEEP, i === 1 ? INK : WHITE, 0.78);
  });
  s.addShape(pres.ShapeType.line, {
    x: cx + 0.39, y: 2.68, w: 0, h: 0.47, line: { color: SEA, width: 1.5 }
  });
  s.addShape(pres.ShapeType.line, {
    x: cx + 0.39, y: 3.93, w: 0, h: 0.47, line: { color: SEA, width: 1.5 }
  });
  s.addText("Septiembre 2026", {
    x: M, y: H - 0.95, w: 5, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, color: SEA, charSpacing: 1.5
  });
  s.addNotes("Encuadre: esto no es una idea nueva, es la versión ordenada de algo que ya existe. El objetivo de hoy no es aprobarlo todo, es cerrar las decisiones de la última diapositiva.");
}

/* ============ 2 · la tesis ============ */
{
  const s = darkSlide();
  s.addText("EL PUNTO DE PARTIDA", {
    x: M, y: 0.75, w: 8, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: SEA, charSpacing: 2
  });
  s.addText("El activo escaso no es\nel estudiante.", {
    x: M, y: 1.15, w: 7.6, h: 1.6, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 38, bold: true, color: WHITE, lineSpacing: 44
  });
  s.addText(
    "Estudiantes hay de sobra. Lo escaso es el contrato de representación con la institución estadounidense — porque es lo que convierte a un estudiante en dinero recurrente, y lo que nos separa de ser tres asesores cobrando por hora.",
    { x: M, y: 2.95, w: 6.9, h: 1.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 15, color: ONDARK, lineSpacing: 24 });
  s.addText(
    "Ese contrato solo lo firma una entidad de EE. UU., con cuenta bancaria de EE. UU. y una persona con estatus para ser dueña de ella.",
    { x: M, y: 4.5, w: 6.9, h: 0.9, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 15, bold: true, color: GOLD, lineSpacing: 24 });

  const stats = [
    ["≈ 15.000", "estudiantes mexicanos al año"],
    ["≈ 6.000", "estudiantes españoles al año"],
    ["≈ 2.500", "estudiantes chilenos al año"]
  ];
  stats.forEach(([n, l], i) => {
    const y = 1.5 + i * 1.55;
    s.addText(n, {
      x: 8.6, y: y, w: 4, h: 0.65, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 34, bold: true, color: GOLD
    });
    s.addText(l, {
      x: 8.6, y: y + 0.62, w: 4, h: 0.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: ONDARK
    });
  });
  s.addText("Órdenes de magnitud. Verificar en Open Doors (IIE) antes de usarlos fuera.", {
    x: 8.6, y: 6.2, w: 4.1, h: 0.5, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 9.5, italic: true, color: SEA
  });
  s.addNotes("La frase que quiero que se les quede: nos vamos a matar consiguiendo contratos con instituciones, no consiguiendo estudiantes.");
}

/* ============ 3 · quiénes somos ============ */
{
  const s = lightSlide("Un socio por mercado, y uno dentro del sistema", "Quiénes somos");
  const roles = [
    { seat: "SOCIO ESPAÑOL", tag: "ES", who: "España · UE",
      pts: ["Máster y año de intercambio:\nel ticket más alto de los tres",
            "Captación y asesoría\nen horario europeo",
            "Universidades y escuelas\nde negocio españolas",
            "Cumplimiento RGPD\nde toda la agencia"] },
    { seat: "SOCIO MEXICANO · GREEN CARD", tag: "MX", who: "Estructura EE. UU. · México", key: true,
      pts: ["Titular de la LLC, EIN\ny cuenta bancaria",
            "Firma los contratos\ncon las instituciones",
            "Cobra y concilia comisiones",
            "Red y captación en México"] },
    { seat: "SOCIO CHILENO", tag: "CL", who: "Chile · Cono Sur",
      pts: ["Colegios y universidades\nchilenas",
            "Laboratorio de precios\ny guiones de venta",
            "Operación del proceso\nde visa",
            "Proveedores: seguro,\nalojamiento, vuelos"] }
  ];
  const cw = 3.85, gap = 0.42;
  roles.forEach((r, i) => {
    const x = M + i * (cw + gap);
    card(s, x, 1.72, cw, 4.35, r.key ? DEEP : MIST);
    badge(s, x + 0.3, 2.0, r.tag, r.key ? GOLD : DEEP, r.key ? INK : WHITE, 0.62);
    s.addText(r.seat, {
      x: x + 0.3, y: 2.75, w: cw - 0.6, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 9.5, bold: true, charSpacing: 1.2,
      color: r.key ? GOLD : SEA
    });
    s.addText(r.who, {
      x: x + 0.3, y: 3.03, w: cw - 0.6, h: 0.6, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: r.key ? WHITE : DEEP, lineSpacing: 20
    });
    s.addText(r.pts.map((p, j) => ({
      text: p, options: { bullet: true, breakLine: j !== r.pts.length - 1 }
    })), {
      x: x + 0.3, y: 3.7, w: cw - 0.62, h: 2.2, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: r.key ? ONDARK : GREY,
      paraSpaceAfter: 8, lineSpacing: 15
    });
  });
  footNote(s, "Es la mayor ventaja frente a una agencia con oficina única: nadie tiene que abrir mercado desde cero, y el que firma con las universidades ya está dentro del país.");
  s.addNotes("Aquí es donde la green card deja de ser un dato personal y pasa a ser el eje de la estructura.");
}

/* ============ 4 · la pregunta incómoda ============ */
{
  const s = lightSlide("Una pregunta que hay que resolver hoy", "Antes de seguir");
  card(s, M, 1.9, W - 2 * M, 1.95, MIST);
  badge(s, M + 0.42, 2.32, "?", RED, WHITE, 0.62);
  s.addText("¿Dónde vive el socio con green card?", {
    x: M + 1.3, y: 2.22, w: 10.2, h: 0.45, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 21, bold: true, color: DEEP
  });
  s.addText(
    "La ley federal permite pagar comisión por reclutar estudiantes extranjeros, pero el reclutamiento tiene que ocurrir fuera de Estados Unidos. Si vive allí de forma permanente, no puede ser él quien capte a las familias mexicanas.",
    { x: M + 1.3, y: 2.72, w: 10.2, h: 0.95, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13.5, color: GREY, lineSpacing: 20 });

  const opts = [
    { t: "Si vive en México o viaja", d: "Se queda con los dos asientos: la estructura en EE. UU. y la captación en México. El plan funciona tal como está.", c: DEEP },
    { t: "Si reside en EE. UU.", d: "Se queda solo con la estructura y las alianzas. México necesita a alguien en tierra: un cuarto socio o un subagente a comisión.", c: RED }
  ];
  opts.forEach((o, i) => {
    const x = M + i * 6.15;
    card(s, x, 4.15, 5.78, 1.95, MIST);
    s.addText(o.t, {
      x: x + 0.35, y: 4.42, w: 5.1, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: o.c
    });
    s.addText(o.d, {
      x: x + 0.35, y: 4.85, w: 5.1, h: 1.1, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: GREY, lineSpacing: 18
    });
  });
  footNote(s, "No es un detalle formal: México es el mercado de mayor volumen del plan.");
  s.addNotes("Preguntarlo directamente y anotar la respuesta. Todo lo demás del reparto depende de esto.");
}

/* ============ 5 · dos motores ============ */
{
  const s = lightSlide("Cobramos por los dos lados, pero no al mismo tiempo", "El modelo de ingresos");
  const cols = [
    { tag: "A", t: "Fee del estudiante", when: "COBRA HOY",
      d: "La familia paga por la asesoría: elegir instituciones, armar el expediente, aplicaciones, carpeta financiera y entrenamiento de la entrevista consular.",
      good: "Rápido, predecible, no depende de nadie más.",
      bad: "Techo bajo: hay un límite de familias que se atienden bien a la vez.", c: DEEP },
    { tag: "B", t: "Comisión de la institución", when: "COBRA EN 9–15 MESES",
      d: "La universidad o la escuela paga por cada estudiante matriculado, de su propio presupuesto de admisiones. No encarece la matrícula de la familia.",
      good: "Escala, se renueva y no se la cobramos al cliente.",
      bad: "Se paga después del census date y se puede devolver si el alumno se retira.", c: GOLD }
  ];
  cols.forEach((c, i) => {
    const x = M + i * 6.15;
    card(s, x, 1.75, 5.78, 3.1, MIST);
    badge(s, x + 0.35, 2.05, c.tag, c.c, c.c === GOLD ? INK : WHITE, 0.55);
    s.addText(c.when, {
      x: x + 1.05, y: 2.1, w: 4.4, h: 0.25, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 9.5, bold: true, color: c.c, charSpacing: 1.4
    });
    s.addText(c.t, {
      x: x + 1.05, y: 2.34, w: 4.4, h: 0.38, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 19, bold: true, color: DEEP
    });
    s.addText(c.d, {
      x: x + 0.35, y: 2.92, w: 5.1, h: 1.0, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: GREY, lineSpacing: 18
    });
    s.addText([
      { text: c.good, options: { bullet: true, breakLine: true } },
      { text: c.bad, options: { bullet: true } }
    ], {
      x: x + 0.35, y: 3.95, w: 5.1, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: GREY, paraSpaceAfter: 4, lineSpacing: 14
    });
  });

  card(s, M, 5.05, W - 2 * M, 1.35, DEEP);
  s.addText("Por eso empezamos cobrando al estudiante.", {
    x: M + 0.45, y: 5.25, w: 11.4, h: 0.38, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 19, bold: true, color: GOLD
  });
  s.addText(
    "Entre la primera llamada con una familia y el primer dólar de comisión pasan de 9 a 15 meses. El fee cierra exactamente ese hueco: paga los costes fijos mientras madura la primera cosecha de comisiones.",
    { x: M + 0.45, y: 5.68, w: 11.4, h: 0.6, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: ONDARK, lineSpacing: 19 });
  s.addNotes("Si arrancáramos solo con comisiones, habría que financiar más de un año de operación con dinero propio.");
}

/* ============ 6 · cuánto vale cada estudiante (gráfico) ============ */
{
  const s = lightSlide("Un alumno de universidad vale seis veces uno de inglés", "Cuánto deja cada estudiante");
  s.addChart(pres.ChartType.bar, [
    { name: "Fee del estudiante",
      labels: ["Escuela de inglés", "Community college", "Máster privado", "Univ. privada (pathway)", "Colegio internado"],
      values: [400, 900, 1500, 1500, 1200] },
    { name: "Comisión institucional",
      labels: ["Escuela de inglés", "Community college", "Máster privado", "Univ. privada (pathway)", "Colegio internado"],
      values: [900, 1400, 4000, 6000, 6500] }
  ], {
    x: M, y: 1.75, w: 8.5, h: 4.35,
    barDir: "bar", barGrouping: "stacked",
    chartColors: [DEEP, SEA],
    showValue: true, dataLabelPosition: "ctr",
    dataLabelColor: WHITE, dataLabelFontFace: BODY, dataLabelFontSize: 9,
    dataLabelFormatCode: '#,##0',
    showLegend: true, legendPos: "t", legendFontFace: BODY, legendFontSize: 10, legendColor: GREY,
    catAxisLabelColor: GREY, catAxisLabelFontFace: BODY, catAxisLabelFontSize: 11,
    valAxisLabelColor: GREY, valAxisLabelFontFace: BODY, valAxisLabelFontSize: 9,
    valAxisMaxVal: 8000, valGridLine: { color: LINE, size: 1 },
    catGridLine: { style: "none" }, valAxisLineShow: false, catAxisLineShow: false
  });

  card(s, 9.55, 1.75, 3.08, 4.35, MIST);
  s.addText("Qué implica", {
    x: 9.9, y: 2.05, w: 2.5, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 9.5, bold: true, color: SEA, charSpacing: 1.4
  });
  s.addText([
    { text: "El mismo esfuerzo de captación produce resultados muy distintos.", options: { breakLine: true } },
    { text: "Año 1: base de inglés y community college, que cierran rápido y validan la operación.", options: { breakLine: true } },
    { text: "Encima, dos o tres apuestas de pathway universitario: son las que pagan el año.", options: { breakLine: true } },
    { text: "Pedir siempre comisión de continuación en los años 2 a 4. Convierte un cobro puntual en una renta.", options: {} }
  ], {
    x: 9.9, y: 2.42, w: 2.45, h: 3.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, color: GREY, paraSpaceAfter: 9, lineSpacing: 15
  });
  footNote(s, "Supuestos de trabajo en USD por estudiante matriculado, no cotizaciones. Se sustituyen por los números de nuestros contratos en cuanto los tengamos firmados.");
}

/* ============ 7 · precios ============ */
{
  const s = lightSlide("Precio cerrado, publicado y por etapas", "Qué le cobramos a la familia");
  const plans = [
    { n: "Esencial", p: "$890", d: "Para quien ya sabe qué quiere estudiar.",
      l: ["Hasta 4 aplicaciones", "Revisión del expediente", "Guía de apostilla y traducciones", "Seguimiento hasta la admisión"],
      pay: "50 % al firmar · 50 % en la primera aplicación" },
    { n: "Completo", p: "$1.950", d: "Todo el camino, incluida la visa.", key: true,
      l: ["Hasta 10 aplicaciones", "Ensayos y cartas", "Búsqueda de becas", "Carpeta financiera", "Visa F‑1 y dos simulacros"],
      pay: "40 % al firmar · 30 % aplicaciones · 30 % al I‑20" },
    { n: "Solo visa F‑1", p: "$490", d: "Ya tiene admisión y falta lo difícil.",
      l: ["Revisión del I‑20", "DS‑160 y tasas", "Carpeta financiera", "Dos simulacros de entrevista"],
      pay: "100 % al firmar" }
  ];
  const cw = 3.85, gap = 0.42;
  plans.forEach((p, i) => {
    const x = M + i * (cw + gap);
    card(s, x, 1.72, cw, 4.0, p.key ? DEEP : MIST);
    s.addText(p.n.toUpperCase(), {
      x: x + 0.32, y: 1.98, w: cw - 0.64, h: 0.28, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 9.5, bold: true, charSpacing: 1.4, color: p.key ? GOLD : SEA
    });
    s.addText(p.p, {
      x: x + 0.32, y: 2.26, w: cw - 0.64, h: 0.62, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 34, bold: true, color: p.key ? WHITE : DEEP
    });
    s.addText(p.d, {
      x: x + 0.32, y: 2.9, w: cw - 0.64, h: 0.35, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, italic: true, color: p.key ? ONDARK : GREY
    });
    s.addText(p.l.map((t, j) => ({
      text: t, options: { bullet: true, breakLine: j !== p.l.length - 1 }
    })), {
      x: x + 0.32, y: 3.35, w: cw - 0.6, h: 1.55, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: p.key ? ONDARK : GREY,
      paraSpaceAfter: 6, lineSpacing: 15
    });
    s.addText(p.pay, {
      x: x + 0.32, y: 5.05, w: cw - 0.64, h: 0.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10, color: p.key ? GOLD : SEA, lineSpacing: 14
    });
  });
  s.addText(
    "La orientación inicial va gratis: es la herramienta de venta y el filtro. De cada diez llamadas, seis no califican — y es mejor descubrirlo en media hora que en el mes tres.",
    { x: M, y: 5.95, w: W - 2 * M, h: 0.5, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: GREY, lineSpacing: 18 });
  footNote(s, "Las tasas oficiales — examen de inglés, aplicaciones, SEVIS y consulado — las paga la familia directamente a cada organismo, nunca a través nuestro.");
}

/* ============ 8 · economía unitaria ============ */
{
  const s = lightSlide("Los números que deciden si esto se sostiene", "Economía unitaria");
  const stats = [
    { n: "$1.670", l: "contribución neta por alumno\nde inglés o community college" },
    { n: "$6.250", l: "contribución neta por alumno\nde universidad o máster" },
    { n: "$80–250", l: "coste de conseguir\nun cliente de pago" },
    { n: "2", l: "clientes al mes para cubrir\ntodos los costes fijos" }
  ];
  const cw = 2.72, gap = 0.35;
  stats.forEach((st, i) => {
    const x = M + i * (cw + gap);
    card(s, x, 1.8, cw, 1.95, i === 3 ? DEEP : MIST);
    s.addText(st.n, {
      x: x + 0.28, y: 2.05, w: cw - 0.56, h: 0.72, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 34, bold: true, color: i === 3 ? GOLD : DEEP
    });
    s.addText(st.l, {
      x: x + 0.28, y: 2.78, w: cw - 0.5, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: i === 3 ? ONDARK : GREY, lineSpacing: 15
    });
  });

  card(s, M, 4.0, 6.05, 2.1, MIST);
  s.addText("Cómo operamos el año 1", {
    x: M + 0.35, y: 4.25, w: 5.3, h: 0.35, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 16, bold: true, color: DEEP
  });
  s.addText([
    { text: "Sin oficina, sin sueldos, sin personal.", options: { bullet: true, breakLine: true } },
    { text: "Costes fijos de $1.800 a $2.600 al mes, más publicidad variable.", options: { bullet: true, breakLine: true } },
    { text: "Capital inicial: entre $12.000 y $18.000 a repartir entre los tres.", options: { bullet: true } }
  ], {
    x: M + 0.35, y: 4.68, w: 5.35, h: 1.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, color: GREY, paraSpaceAfter: 6, lineSpacing: 16
  });

  card(s, 7.28, 4.0, 5.35, 2.1, MIST);
  s.addText("La meta real del primer semestre", {
    x: 7.63, y: 4.25, w: 4.7, h: 0.35, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 16, bold: true, color: DEEP
  });
  s.addText(
    "No es hacernos ricos. Es que la empresa se pague sola con los fees mientras madura la primera cosecha de comisiones — y que el número que miremos cada semana sea contratos firmados con instituciones, no facturación.",
    { x: 7.63, y: 4.68, w: 4.7, h: 1.25, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: GREY, lineSpacing: 17 });
}

/* ============ 9 · escenarios ============ */
{
  const s = lightSlide("Por qué el año 1 se ve pobre y no es mala señal", "Tres escenarios");
  s.addChart(pres.ChartType.bar, [
    { name: "Conservador", labels: ["Año 1", "Año 2", "Año 3"], values: [29000, 104000, 248000] },
    { name: "Base",        labels: ["Año 1", "Año 2", "Año 3"], values: [52000, 212000, 530000] },
    { name: "Agresivo",    labels: ["Año 1", "Año 2", "Año 3"], values: [81000, 367000, 980000] }
  ], {
    x: M, y: 1.75, w: 7.9, h: 4.3,
    barDir: "col",
    chartColors: [SEA, DEEP, GOLD],
    showValue: true, dataLabelPosition: "outEnd",
    dataLabelColor: GREY, dataLabelFontFace: BODY, dataLabelFontSize: 8.5,
    dataLabelFormatCode: '$#,##0,"k"',
    showLegend: true, legendPos: "t", legendFontFace: BODY, legendFontSize: 10, legendColor: GREY,
    catAxisLabelColor: GREY, catAxisLabelFontFace: BODY, catAxisLabelFontSize: 12,
    valAxisLabelColor: GREY, valAxisLabelFontFace: BODY, valAxisLabelFontSize: 9,
    valAxisLabelFormatCode: '$#,##0,"k"',
    valGridLine: { color: LINE, size: 1 }, catGridLine: { style: "none" },
    valAxisLineShow: false, catAxisLineShow: false
  });

  card(s, 8.95, 1.75, 3.68, 4.3, DEEP);
  s.addText("El salto del año 2", {
    x: 9.3, y: 2.05, w: 3.0, h: 0.4, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 18, bold: true, color: GOLD
  });
  s.addText(
    "No viene de trabajar el doble. Viene de que en el año 2 cobramos las comisiones del año 1 y las del año 2 a la vez, y de que ya existen los contratos que en el año 1 hubo que salir a firmar.",
    { x: 9.3, y: 2.55, w: 3.0, h: 1.7, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: ONDARK, lineSpacing: 18 });
  s.addText("Esa es la forma de la curva en este negocio. Conviene saberlo antes de desanimarse en el mes ocho.", {
    x: 9.3, y: 4.5, w: 3.0, h: 1.2, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 12, italic: true, color: SEA, lineSpacing: 18
  });
  footNote(s, "Ingreso anual en USD. El escenario base supone 30 estudiantes el año 1, 85 el año 2 y 180 el año 3.");
}

/* ============ 10 · reparto ============ */
{
  const s = lightSlide("Tres reglas para que la amistad sobreviva al año dos", "Cómo nos repartimos");
  const rules = [
    { n: "1", t: "Tercios, con vesting de 4 años y cliff de 1",
      d: "Nadie se lleva un tercio por haber estado en la conversación inicial: se lo lleva por seguir aquí un año después. Quien se va antes del año conserva cero y recupera el capital que puso." },
    { n: "2", t: "Prima de originación del 25 %",
      d: "Sobre la contribución neta de cada estudiante, quien lo trajo cobra primero un 25 %. El 75 % restante se reparte por participación. Traer alumnos siempre conviene, sin renegociar la sociedad." },
    { n: "3", t: "Cero sueldos hasta tener seis meses de fijos en el banco",
      d: "Todo lo que sobre se reinvierte. Escrito y con fecha de revisión, para que sea una regla y no una discusión cada trimestre." }
  ];
  rules.forEach((r, i) => {
    const y = 1.78 + i * 1.28;
    badge(s, M, y + 0.08, r.n, DEEP, WHITE, 0.5);
    s.addText(r.t, {
      x: M + 0.72, y: y, w: 7.4, h: 0.35, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 17, bold: true, color: DEEP
    });
    s.addText(r.d, {
      x: M + 0.72, y: y + 0.38, w: 7.4, h: 0.8, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12, color: GREY, lineSpacing: 17
    });
  });

  card(s, 8.62, 1.78, 4.0, 4.3, DEEP);
  s.addText("EJEMPLO", {
    x: 8.97, y: 2.05, w: 3.3, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 9.5, bold: true, color: SEA, charSpacing: 1.6
  });
  s.addText("Un alumno de universidad traído por el socio mexicano", {
    x: 8.97, y: 2.32, w: 3.3, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 15, bold: true, color: WHITE, lineSpacing: 19
  });
  const rows = [
    ["Contribución neta", "$6.250"],
    ["Prima 25 % a quien lo trajo", "$1.563"],
    ["Queda a repartir", "$4.687"],
    ["A cada socio (un tercio)", "$1.562"]
  ];
  rows.forEach((r, i) => {
    const y = 3.18 + i * 0.42;
    s.addText(r[0], {
      x: 8.97, y: y, w: 2.15, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: ONDARK
    });
    s.addText(r[1], {
      x: 11.17, y: y, w: 1.13, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, bold: true, color: WHITE, align: "right"
    });
  });
  s.addShape(pres.ShapeType.line, {
    x: 8.97, y: 4.95, w: 3.33, h: 0, line: { color: SEA, width: 1 }
  });
  s.addText("Socio mexicano", {
    x: 8.97, y: 5.08, w: 1.95, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, bold: true, color: GOLD
  });
  s.addText("$3.125", {
    x: 11.2, y: 5.08, w: 1.1, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, bold: true, color: GOLD, align: "right"
  });
  s.addText("Los otros dos", {
    x: 8.97, y: 5.42, w: 1.95, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, bold: true, color: ONDARK
  });
  s.addText("$1.562 c/u", {
    x: 11.05, y: 5.42, w: 1.25, h: 0.3, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, bold: true, color: ONDARK, align: "right"
  });
  s.addNotes("Esta es la diapositiva que evita la ruptura del mes dieciocho, cuando uno haya traído el 70 % de los alumnos.");
}

/* ============ 11 · estructura legal ============ */
{
  const s = lightSlide("Una LLC en Florida, y quién figura como dueño", "Estructura legal");
  const a = M, b = M + 6.15, cw = 5.78;
  card(s, a, 1.75, cw, 3.5, DEEP);
  s.addText("RECOMENDADA PARA EL AÑO 1", {
    x: a + 0.35, y: 2.0, w: cw - 0.7, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 9.5, bold: true, color: GOLD, charSpacing: 1.4
  });
  s.addText("Opción A · LLC del socio con green card", {
    x: a + 0.35, y: 2.28, w: cw - 0.7, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 19, bold: true, color: WHITE, lineSpacing: 24
  });
  s.addText([
    { text: "Los otros dos facturan desde su entidad local (SpA en Chile, autónomo o sociedad en España) por servicios prestados en su país.", options: { bullet: true, breakLine: true } },
    { text: "Servicios prestados fuera de EE. UU. son ingreso de fuente extranjera: en general, sin retención.", options: { bullet: true, breakLine: true } },
    { text: "Se monta en dos o tres semanas y cuesta poco.", options: { bullet: true, breakLine: true } },
    { text: "Exige acuerdo de fundadores firmado por los tres. Sin él, dos de nosotros somos proveedores, no dueños.", options: { bullet: true } }
  ], {
    x: a + 0.35, y: 3.05, w: cw - 0.65, h: 2.05, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: ONDARK, paraSpaceAfter: 7, lineSpacing: 15
  });

  card(s, b, 1.75, cw, 3.5, MIST);
  s.addText("PARA MÁS ADELANTE", {
    x: b + 0.35, y: 2.0, w: cw - 0.7, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 9.5, bold: true, color: SEA, charSpacing: 1.4
  });
  s.addText("Opción B · LLC con los tres como socios", {
    x: b + 0.35, y: 2.28, w: cw - 0.7, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 19, bold: true, color: DEEP, lineSpacing: 24
  });
  s.addText([
    { text: "Propiedad formal repartida desde el principio.", options: { bullet: true, breakLine: true } },
    { text: "Los socios extranjeros quedan sujetos a retención sobre ingreso conectado, con formularios 8804 y 8805.", options: { bullet: true, breakLine: true } },
    { text: "Hacen falta ITIN y declaración 1040‑NR de cada uno.", options: { bullet: true, breakLine: true } },
    { text: "Contador especializado obligatorio y meses de trámite antes de facturar nada.", options: { bullet: true } }
  ], {
    x: b + 0.35, y: 3.05, w: cw - 0.65, h: 2.05, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11.5, color: GREY, paraSpaceAfter: 7, lineSpacing: 15
  });

  card(s, M, 5.45, W - 2 * M, 0.95, MIST);
  badge(s, M + 0.35, 5.68, "→", GOLD, INK, 0.5);
  s.addText(
    "La propuesta: arrancar con la A, y escribir en el acuerdo de fundadores un gatillo automático — al facturar $150.000 en doce meses corridos, se convierte en la B con los tercios ya pactados y el contador lo paga la empresa.",
    { x: M + 1.05, y: 5.62, w: 10.6, h: 0.65, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, color: DEEP, lineSpacing: 18 });
  footNote(s, "Antes de constituir nada conviene una consulta con un contador estadounidense con experiencia en socios extranjeros.");
}

/* ============ 12 · líneas rojas ============ */
{
  const s = darkSlide();
  s.addText("CUMPLIMIENTO", {
    x: M, y: 0.6, w: 8, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: SEA, charSpacing: 2
  });
  s.addText("Cinco cosas que no hacemos nunca", {
    x: M, y: 0.9, w: 10, h: 0.6, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 30, bold: true, color: WHITE
  });
  const nos = [
    ["Garantizar una visa", "La decisión es del oficial consular. Prometerlo es lo que convierte un negocio en un fraude."],
    ["Tocar los documentos financieros", "Los estados de cuenta salen del banco de la familia tal como son. Alterarlos puede costarle al alumno la entrada de por vida."],
    ["Escribir los ensayos por el estudiante", "Las instituciones lo detectan y lo castigan cancelando el contrato de la agencia."],
    ["Aparecer como patrocinador financiero", "Somos la agencia. El dinero es de la familia, en el I‑20 y en la entrevista."],
    ["Dar asesoría legal migratoria", "Ordenar un trámite es una cosa; representar a alguien ante inmigración está reservado a abogados. Los casos complicados se derivan."]
  ];
  nos.forEach(([t, d], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * 6.15, y = 1.75 + row * 1.62;
    badge(s, x, y + 0.03, "✕", RED, WHITE, 0.44);
    s.addText(t, {
      x: x + 0.62, y: y, w: 5.28, h: 0.32, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 16, bold: true, color: WHITE
    });
    s.addText(d, {
      x: x + 0.62, y: y + 0.36, w: 5.3, h: 0.95, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: ONDARK, lineSpacing: 16
    });
  });
  s.addText(
    "Y una regla que define dónde puede trabajar cada uno: la comisión por reclutar es legal porque existe una excepción para estudiantes extranjeros residentes en el extranjero. El reclutamiento ocurre fuera de Estados Unidos.",
    { x: M + 6.15, y: 5.0, w: 5.9, h: 1.15, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 12.5, bold: true, color: GOLD, lineSpacing: 18 });
  s.addNotes("Esto no es prudencia excesiva: es lo que nos permite pasar una auditoría de AIRC en el año 2 sin reconstruir nada.");
}

/* ============ 13 · proceso ============ */
{
  const s = lightSlide("De la primera llamada a la comisión cobrada", "El proceso del estudiante");
  const steps = [
    ["01", "Lead y calificación", "Presupuesto, inglés, notas y quién paga. Se descarta el 60 %.", "45 min"],
    ["02", "Contrato y primer pago", "Firma electrónica. Sin contrato no se empieza a trabajar.", "2–5 días"],
    ["03", "Expediente e inglés", "Apostillas, traducciones, evaluación de credenciales y examen.", "4–8 sem"],
    ["04", "Lista corta y aplicaciones", "Entre 4 y 8 instituciones, todas certificadas SEVP.", "4–8 sem"],
    ["05", "Admisión y prueba financiera", "Fondos para el primer año completo. Aquí se cae más gente.", "6–12 sem"],
    ["06", "I‑20, SEVIS y visa F‑1", "DS‑160, tasas y dos simulacros antes de la cita consular.", "6–10 sem"],
    ["07", "Llegada y comisión", "Check‑in con el DSO y, pasado el census, se factura a la institución.", "census + 30 d"]
  ];
  const cw = 5.78, ch = 1.05, gapx = 0.42, gapy = 0.18;
  steps.forEach((st, i) => {
    const col = Math.floor(i / 4), row = i % 4;
    const x = M + col * (cw + gapx), y = 1.75 + row * (ch + gapy);
    const last = i === 6;
    card(s, x, y, cw, ch, last ? DEEP : MIST);
    badge(s, x + 0.26, y + 0.3, st[0], last ? GOLD : DEEP, last ? INK : WHITE, 0.44);
    s.addText(st[1], {
      x: x + 0.8, y: y + 0.22, w: 3.4, h: 0.3, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 14, bold: true, color: last ? WHITE : DEEP
    });
    s.addText(st[3], {
      x: x + cw - 1.5, y: y + 0.25, w: 1.25, h: 0.26, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 9.5, bold: true, color: last ? GOLD : SEA, align: "right"
    });
    s.addText(st[2], {
      x: x + 0.8, y: y + 0.58, w: cw - 1.1, h: 0.38, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10.5, color: last ? ONDARK : GREY, lineSpacing: 14
    });
  });

  card(s, M + cw + gapx, 1.75 + 3 * (ch + gapy), cw, ch, MIST);
  s.addText(
    "Catorce etapas en el plan completo, resumidas aquí en siete. Cada alumno está siempre en exactamente una: eso es a la vez el manual de operación y las columnas del CRM.",
    { x: M + cw + gapx + 0.35, y: 1.75 + 3 * (ch + gapy) + 0.18, w: cw - 0.7, h: 0.72, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, italic: true, color: GREY, lineSpacing: 16 });

  footNote(s, "De la primera llamada al primer día de clases pasan de 11 a 14 meses. Las etapas 05 y 06 son las que más casos pierden.");
}

/* ============ 14 · calendario ============ */
{
  const s = darkSlide();
  s.addText("EL CALENDARIO MANDA", {
    x: M, y: 0.6, w: 8, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: SEA, charSpacing: 2
  });
  s.addText("La ventana de Fall 2027 está abierta ahora mismo", {
    x: M, y: 0.9, w: 11.5, h: 0.7, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 30, bold: true, color: WHITE
  });

  const marks = [
    ["Sep–Dic 26", "Captar y firmar\ncontratos", GOLD],
    ["Ene–Mar 27", "Expediente,\ninglés, aplicaciones", SEA],
    ["Abr–Jun 27", "Admisión, I‑20\ny visa", SEA],
    ["Julio 27", "Entrada a EE. UU.\n(máx. 30 días antes)", SEA],
    ["Oct–Nov 27", "Primeras comisiones\ncobradas", GOLD]
  ];
  const x0 = M + 0.95, span = 10.03;
  s.addShape(pres.ShapeType.line, {
    x: x0, y: 3.0, w: span, h: 0, line: { color: SEA, width: 2 }
  });
  marks.forEach((mk, i) => {
    const x = x0 + (span / (marks.length - 1)) * i;
    s.addShape(pres.ShapeType.ellipse, {
      x: x - 0.11, y: 2.89, w: 0.22, h: 0.22, fill: { color: mk[2] }
    });
    s.addText(mk[0], {
      x: x - 0.95, y: 2.35, w: 1.9, h: 0.3, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, bold: true, color: mk[2], align: "center"
    });
    s.addText(mk[1], {
      x: x - 0.95, y: 3.28, w: 1.9, h: 0.85, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11, color: ONDARK, align: "center", lineSpacing: 15
    });
  });

  s.addText(
    "Quien nos llegue en marzo pidiendo entrar en agosto es, casi siempre, un caso del ingreso siguiente. Decírselo con honestidad es lo que gana al cliente.",
    { x: M, y: 4.75, w: 6.0, h: 1.0, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: ONDARK, lineSpacing: 19 });
  s.addText(
    "Las escuelas de inglés y algunos community colleges tienen ingresos cada pocas semanas: sirven para facturar mucho antes, mientras madura el ciclo universitario. Ese es el argumento para empezar por ahí.",
    { x: 7.1, y: 4.75, w: 5.5, h: 1.0, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: GOLD, lineSpacing: 19 });
}

/* ============ 15 · 90 días ============ */
{
  const s = lightSlide("Qué pasa en los próximos noventa días", "Plan de arranque");
  const phases = [
    { r: "SEMANAS 1–4", t: "Existir",
      l: ["Acuerdo de fundadores firmado por los tres",
          "Nombre, dominio y cuentas de redes",
          "LLC, EIN y cuenta bancaria",
          "Landing en línea y correo corporativo"],
      who: "Socio MX lidera · los tres deciden" },
    { r: "SEMANAS 4–10", t: "Firmar",
      l: ["8 a 12 acuerdos con escuelas de inglés y community colleges",
          "Alta de perfil en ICEF",
          "Carta de presentación en inglés",
          "Primer contacto con un pathway provider"],
      who: "Socio MX" },
    { r: "SEMANAS 5–12", t: "Vender",
      l: ["Contrato al estudiante, aviso de privacidad y checklists",
          "CRM con las catorce etapas configuradas",
          "3 clientes de pago, uno por mercado",
          "5 colegios en MX, 3 en CL y 3 en ES con charla agendada"],
      who: "Los tres, cada uno en su mercado" }
  ];
  const cw = 3.85, gap = 0.42;
  phases.forEach((p, i) => {
    const x = M + i * (cw + gap);
    card(s, x, 1.72, cw, 4.15, MIST);
    s.addText(p.r, {
      x: x + 0.32, y: 1.98, w: cw - 0.64, h: 0.25, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 9.5, bold: true, color: SEA, charSpacing: 1.4
    });
    s.addText(p.t, {
      x: x + 0.32, y: 2.26, w: cw - 0.64, h: 0.45, isTextBox: true, margin: 0,
      fontFace: HEAD, fontSize: 24, bold: true, color: DEEP
    });
    s.addText(p.l.map((t, j) => ({
      text: t, options: { bullet: true, breakLine: j !== p.l.length - 1 }
    })), {
      x: x + 0.32, y: 2.8, w: cw - 0.6, h: 2.35, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 11.5, color: GREY, paraSpaceAfter: 8, lineSpacing: 15
    });
    s.addText(p.who, {
      x: x + 0.32, y: 5.35, w: cw - 0.64, h: 0.35, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 10, bold: true, color: DEEP
    });
  });
  footNote(s, "Reunión semanal de 45 minutos, los tres, misma hora. Tres números en pantalla: leads nuevos, contratos firmados, alumnos por etapa.");
}

/* ============ 16 · cierre / decisiones ============ */
{
  const s = darkSlide();
  s.addText("LO QUE DECIDIMOS HOY", {
    x: M, y: 0.75, w: 8, h: 0.25, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, color: GOLD, charSpacing: 2
  });
  s.addText("Ocho decisiones y arrancamos", {
    x: M, y: 1.08, w: 10, h: 0.65, isTextBox: true, margin: 0,
    fontFace: HEAD, fontSize: 34, bold: true, color: WHITE
  });
  const decisions = [
    "Dónde vive el socio con green card, y quién capta en México",
    "Nombre y marca, que funcione en los tres mercados y en inglés",
    "Estado de constitución de la LLC — Florida por defecto",
    "Opción A u Opción B, y con qué cifra se dispara la conversión",
    "Cuánto pone cada uno, y si entra como capital o como préstamo",
    "Horas semanales reales de cada uno, dichas en voz alta",
    "Si el 25 % de prima de originación nos cuadra a los tres",
    "Presupuesto de publicidad del primer semestre y quién lo opera"
  ];
  decisions.forEach((d, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * 6.15, y = 2.1 + row * 0.92;
    badge(s, x, y, String(i + 1), i === 0 ? GOLD : DEEP, i === 0 ? INK : WHITE, 0.42);
    s.addText(d, {
      x: x + 0.6, y: y - 0.02, w: 5.3, h: 0.6, isTextBox: true, margin: 0,
      fontFace: BODY, fontSize: 13, color: i === 0 ? GOLD : ONDARK, lineSpacing: 18
    });
  });
  s.addShape(pres.ShapeType.line, {
    x: M, y: 6.28, w: W - 2 * M, h: 0, line: { color: DEEP, width: 1.5 }
  });
  s.addText("Todo lo demás ya está escrito en el plan. Esto es lo único que no puedo decidir yo solo.", {
    x: M, y: 6.45, w: 11.9, h: 0.4, isTextBox: true, margin: 0,
    fontFace: BODY, fontSize: 13, italic: true, color: SEA
  });
  s.addNotes("Cerrar pidiendo fecha para la siguiente: la firma del acuerdo de fundadores.");
}

pres.writeFile({ fileName: "../presentacion.pptx" })
  .then(f => console.log("OK:", f));
