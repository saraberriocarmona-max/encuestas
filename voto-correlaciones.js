/*
 * <voto-correlaciones src="data/agregados.json" theme="auto|light|dark">
 *
 * Atributos (todos opcionales salvo src o la propiedad .datos):
 *   src            URL del JSON de agregados (generado por harmonizacion/agregar.py)
 *   theme          auto | light | dark
 *   vista          explorar | comparar | catalogo            (vista inicial)
 *   vistas         lista separada por comas de las pestañas visibles (p. ej. "explorar,comparar")
 *   encuesta, pregunta, variable, opcion                     (selección inicial)
 *   sin-encabezado si está presente, oculta el título y la descripción
 *
 * API de JavaScript:
 *   el.datos = objeto          entrega los agregados sin URL (la anfitriona los obtiene como quiera)
 *   el.seleccionar({vista, encuesta, pregunta, variable, opcion})
 *   el.seleccion               selección actual (solo lectura)
 *   el.tablaActual()           cruce actual calculado: [{grupo, codigo, n, n_efectivo, opciones: {op: {p, lo, hi}}}]
 *   el.encuestas               metadatos de las encuestas cargadas
 *
 * Eventos: "vc-ready" (datos cargados), "vc-error" ({mensaje}), "vc-change" (ver abajo).
 * Tema: se puede sobrescribir cualquier variable CSS --vc-* desde la anfitriona (p. ej. voto-correlaciones { --vc-accent: #c00 }).
 *
 * Web Component sin dependencias para explorar la relación entre variables demográficas, territoriales
 * y de comportamiento político y la intención de voto (presidencia 1.ª y 2.ª vuelta, Senado 2026, aprobación),
 * a partir de TABLAS AGREGADAS PONDERADAS de encuestas del CNE (nunca microdatos).
 *
 * Estadística (para investigadores):
 *   - Proporción ponderada por grupo; n efectivo de Kish por grupo: (Σw)² / Σw².
 *   - IC 95 % de Wilson con n efectivo.
 *   - χ² de independencia reescalado al n efectivo total (corrección por deff de Kish,
 *     aproximación de primer orden a Rao-Scott) y V de Cramér.
 *   - Los grupos con n < n_min se suprimen en origen (no vienen en el JSON).
 *
 * Eventos (para la aplicación anfitriona):
 *   "vc-change"  detail = {encuesta, variable, pregunta, opcion, territorio?}
 *       territorio (si la variable es departamento o municipio) =
 *       {nivel: 'departamento'|'municipio', datos: [{codigo, nombre, p, lo, hi, n, n_efectivo}]}
 *       con códigos DIVIPOLA, para pintar un mapa en la anfitriona.
 */
(() => {
  const Z = 1.959964;
  const MAX_SERIES = 7;
  const ESPECIALES = new Set(['NS/NR', 'Voto en blanco', 'Ninguno / no votaría', 'Voto nulo', 'Blanco / nulo / NS / ninguno',
    'Otro', 'Otros', 'Regular']);

  const css = `
  :host {
    --vc-surface: #fcfcfb; --vc-plane: #f9f9f7; --vc-ink: #0b0b0b; --vc-ink-2: #52514e;
    --vc-muted: #898781; --vc-grid: #e1e0d9; --vc-axis: #c3c2b7; --vc-border: rgba(11,11,11,.10);
    --vc-accent: #2a78d6; --vc-other: #b9b7ae; --vc-other-2: #d9d7cf;
    --vc-s1:#2a78d6; --vc-s2:#eb6834; --vc-s3:#1baf7a; --vc-s4:#eda100; --vc-s5:#e87ba4; --vc-s6:#008300; --vc-s7:#4a3aa7; --vc-s8:#e34948;
    display:block; color-scheme: light;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--vc-ink);
    background: var(--vc-plane);
  }
  @media (prefers-color-scheme: dark) {
    :host(:not([theme="light"])) {
      --vc-surface:#1a1a19; --vc-plane:#0d0d0d; --vc-ink:#fff; --vc-ink-2:#c3c2b7; --vc-muted:#898781;
      --vc-grid:#2c2c2a; --vc-axis:#383835; --vc-border: rgba(255,255,255,.10); --vc-accent:#3987e5;
      --vc-other:#6b6a64; --vc-other-2:#454541;
      --vc-s1:#3987e5; --vc-s2:#d95926; --vc-s3:#199e70; --vc-s4:#c98500; --vc-s5:#d55181; --vc-s6:#008300; --vc-s7:#9085e9; --vc-s8:#e66767;
      color-scheme: dark;
    }
  }
  :host([theme="dark"]) {
    --vc-surface:#1a1a19; --vc-plane:#0d0d0d; --vc-ink:#fff; --vc-ink-2:#c3c2b7; --vc-muted:#898781;
    --vc-grid:#2c2c2a; --vc-axis:#383835; --vc-border: rgba(255,255,255,.10); --vc-accent:#3987e5;
    --vc-other:#6b6a64; --vc-other-2:#454541;
    --vc-s1:#3987e5; --vc-s2:#d95926; --vc-s3:#199e70; --vc-s4:#c98500; --vc-s5:#d55181; --vc-s6:#008300; --vc-s7:#9085e9; --vc-s8:#e66767;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  .wrap { padding: 20px 16px 32px; max-width: 1180px; margin: 0 auto; }
  header h2 { font-size: 20px; font-weight: 650; margin: 0 0 4px; letter-spacing: -.01em; }
  header p { margin: 0; color: var(--vc-ink-2); font-size: 13px; }
  .tabs { display:flex; gap: 4px; margin: 16px 0 12px; border-bottom: 1px solid var(--vc-border); overflow-x: auto; }
  .tabs button { font: inherit; font-size: 14px; background: none; border: 0; padding: 8px 12px; cursor: pointer; white-space: nowrap;
    color: var(--vc-ink-2); border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tabs button[aria-selected="true"] { color: var(--vc-ink); border-bottom-color: var(--vc-accent); font-weight: 600; }
  .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-bottom: 14px; }
  label.f { display:flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--vc-ink-2); min-width: 0; }
  select { font: inherit; font-size: 14px; padding: 7px 8px; border-radius: 8px; border: 1px solid var(--vc-border);
    background: var(--vc-surface); color: var(--vc-ink); min-width: 0; width: 100%; }
  .tiles { display:grid; grid-template-columns: repeat(auto-fit, minmax(160px,1fr)); gap: 10px; margin-bottom: 14px; }
  .tile { background: var(--vc-surface); border: 1px solid var(--vc-border); border-radius: 12px; padding: 12px 14px; }
  .tile .k { font-size: 12px; color: var(--vc-ink-2); }
  .tile .v { font-size: 24px; font-weight: 650; margin-top: 2px; }
  .tile .s { font-size: 12px; color: var(--vc-muted); margin-top: 2px; }
  .card { background: var(--vc-surface); border: 1px solid var(--vc-border); border-radius: 12px; padding: 14px 16px 12px; margin-bottom: 14px; position: relative; }
  .card h3 { font-size: 15px; font-weight: 600; margin: 0 0 2px; }
  .card .sub { font-size: 12px; color: var(--vc-ink-2); margin: 0 0 10px; }
  .card .row { display:flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .toggle { font: inherit; font-size: 12px; background: none; border: 1px solid var(--vc-border); color: var(--vc-ink-2);
    border-radius: 999px; padding: 4px 10px; cursor: pointer; }
  svg { display:block; width: 100%; overflow: visible; }
  svg text { font-family: inherit; }
  .legend { display:flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--vc-ink-2); margin: 2px 0 8px; }
  .legend span { display:inline-flex; align-items:center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; display:inline-block; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--vc-grid); font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--vc-ink-2); font-weight: 600; font-size: 12px; }
  .tablewrap { overflow-x: auto; }
  .tip { position: absolute; pointer-events: none; background: var(--vc-surface); color: var(--vc-ink); border: 1px solid var(--vc-border);
    box-shadow: 0 4px 16px rgba(0,0,0,.12); border-radius: 8px; padding: 8px 10px; font-size: 12px; line-height: 1.45;
    white-space: nowrap; z-index: 5; display: none; }
  .tip .m { color: var(--vc-ink-2); }
  .ficha { font-size: 12px; color: var(--vc-ink-2); line-height: 1.6; }
  .ficha a { color: var(--vc-accent); }
  .note { font-size: 12px; color: var(--vc-muted); margin-top: 6px; }
  .pill { display:inline-block; white-space: nowrap; font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--vc-border); }
  .pill.no { color: var(--vc-muted); }
  .warn { display:inline-block; font-size: 11px; padding: 1px 8px; border-radius: 999px; background: var(--vc-other-2); color: var(--vc-ink); }
  `;

  // ---------- estadística ----------
  const wilson = (p, n) => {
    if (!(n > 0)) return [NaN, NaN];
    const d = 1 + Z * Z / n, c = p + Z * Z / (2 * n), h = Z * Math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n));
    return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)];
  };
  const lnGamma = z => { const g = [676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    z -= 1; let x = 0.99999999999980993; for (let i = 0; i < 8; i++) x += g[i] / (z + i + 1);
    const t = z + 7.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x); };
  const gammaQ = (a, x) => {
    if (x <= 0) return 1;
    if (x < a + 1) { let s = 1 / a, t = s; for (let n = 1; n < 500; n++) { t *= x / (a + n); s += t; if (Math.abs(t) < Math.abs(s) * 1e-12) break; }
      return 1 - s * Math.exp(-x + a * Math.log(x) - lnGamma(a)); }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  };

  // ---------- orden de categorías ----------
  const eduRank = s => { s = s.toLowerCase();
    if (/posgrado|maestr|doctor/.test(s)) return 5; if (/universit|^superior/.test(s)) return 4;
    if (/t[ée]cnic|tecnol/.test(s)) return 3; if (/primaria o secundaria/.test(s)) return 1.5;
    if (/secundaria|media|bachiller/.test(s)) return 2; if (/primaria/.test(s)) return 1; return 9; };
  const firstNum = s => { const m = s.replace(/\./g, '').match(/\d+/); return m ? +m[0] : 1e12; };
  const ideo = s => { s = s.toLowerCase();
    return /centro-izq/.test(s) ? 1 : /centro-der/.test(s) ? 3 : /^izq/.test(s) ? 0 : /^der/.test(s) ? 4 : /^centro/.test(s) ? 2 : 9; };
  const ordenar = (v, cats, peso) => {
    const esp = c => ESPECIALES.has(c) || /^ns|sin estrato/i.test(c) ? 1 : 0;
    const base = (a, b) => esp(a) - esp(b);
    if (v === 'edad_grupo' || v === 'edad4') return cats.sort((a, b) => base(a, b) || firstNum(a) - firstNum(b));
    if (v === 'estrato') return cats.sort((a, b) => base(a, b) || firstNum(a) - firstNum(b));
    if (v === 'ingreso') return cats.sort((a, b) => base(a, b) || (/más/i.test(a) ? 1e11 : firstNum(a)) - (/más/i.test(b) ? 1e11 : firstNum(b)));
    if (v === 'educacion' || v === 'educacion3') return cats.sort((a, b) => base(a, b) || eduRank(a) - eduRank(b));
    if (v === 'ideologia') return cats.sort((a, b) => ideo(a) - ideo(b) || peso[b] - peso[a]);
    if (v === 'probabilidad_voto') {
      const orden = ['Definitivamente sí', 'Probablemente sí', 'Indeciso', 'Probablemente no', 'Definitivamente no'];
      const r = c => { const i = orden.indexOf(c); return i < 0 ? 9 : i; };
      return cats.sort((a, b) => r(a) - r(b));
    }
    return cats.sort((a, b) => base(a, b) || peso[b] - peso[a]);
  };

  // fechas en texto libre ("del 9 al 11 de junio de 2026") -> fecha final aproximada (para ordenar)
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const fechaFin = s => {
    const t = (s || '').toLowerCase();
    const num = [...t.matchAll(/(\d{1,2})\/(\d{1,2})\/(20\d\d)/g)];      // "27/01/2026-04/02/2026"
    if (num.length) { const m = num[num.length - 1]; return new Date(+m[3], +m[2] - 1, +m[1]); }
    let mes = -1, pos = -1;
    MESES.forEach((m, i) => { const k = t.lastIndexOf(m); if (k > pos) { pos = k; mes = i; } });
    if (mes < 0) return null;
    const nums = (t.slice(0, pos).match(/\d{1,2}/g) || []); const dia = nums.length ? +nums[nums.length - 1] : 15;
    const an = (t.slice(pos).match(/20\d\d/) || t.match(/20\d\d/) || ['2026'])[0];
    return new Date(+an, mes, dia);
  };

  const fmtPct = x => isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + ' %' : '—';
  const fmtN = x => Math.round(x).toLocaleString('es-CO');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const corta = (s, px) => { const m = Math.max(6, Math.floor(px / 6.6)); return s.length > m ? s.slice(0, m - 1) + '…' : s; };
  const fechaCorta = d => d ? d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }).replace('.', '') : '';

  class VotoCorrelaciones extends HTMLElement {
    static get observedAttributes() { return ['src']; }
    constructor() {
      super();
      this.root = this.attachShadow({ mode: 'open' });
      this.state = { tab: 'explorar', encuesta: null, variable: null, pregunta: null, opcion: null, tabla: false,
        cmpPregunta: 'voto_2v', cmpOpcion: null, cmpVar: '', cmpGrupo: '' };
    }
    connectedCallback() {
      let w = 0;
      this.ro = new ResizeObserver(() => { const nw = this.clientWidth; if (this.data && Math.abs(nw - w) > 4) { w = nw; this.render(); } });
      this.ro.observe(this);
      if (this._pendientes) { const d = this._pendientes; this._pendientes = null; this.iniciar(d); } else this.load();
    }
    disconnectedCallback() { this.ro && this.ro.disconnect(); }
    attributeChangedCallback() { if (this.isConnected) this.load(); }

    async load() {
      const src = this.getAttribute('src');
      if (!src || this._datosDirectos) return;
      this.root.innerHTML = `<style>${css}</style><div class="wrap"><p>Cargando…</p></div>`;
      let d;
      try {
        const r = await fetch(src);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        d = await r.json();
      } catch (e) { return this.fallo(`No se pudieron cargar los datos (${e.message}).`); }
      this.iniciar(d);
    }

    fallo(msg) {
      this.root.innerHTML = `<style>${css}</style><div class="wrap"><p>${esc(msg)}</p></div>`;
      this.dispatchEvent(new CustomEvent('vc-error', { detail: { mensaje: msg }, bubbles: true, composed: true }));
    }

    set datos(d) { this._datosDirectos = true; if (this.isConnected) this.iniciar(d); else this._pendientes = d; }
    get datos() { return this.data; }
    get encuestas() { return (this.data?.encuestas || []).map(({ tablas, suprimidos, codigos, _fecha, ...m }) => m); }
    get seleccion() { const { tab, encuesta, pregunta, variable, opcion } = this.state; return { vista: tab, encuesta, pregunta, variable, opcion }; }

    seleccionar({ vista, encuesta, pregunta, variable, opcion } = {}) {
      const s = this.state;
      if (vista && this.vistas.includes(vista)) s.tab = vista;
      if (encuesta && this.data.encuestas.some(e => e.id === encuesta)) s.encuesta = encuesta;
      const e = this.enc;
      if (pregunta && e.preguntas[pregunta]) s.pregunta = pregunta;
      else if (!e.preguntas[s.pregunta]) s.pregunta = Object.keys(e.preguntas)[0];
      if (variable && e.variables[variable]) s.variable = variable;
      else if (!e.variables[s.variable]) s.variable = Object.keys(e.variables)[0];
      s.opcion = opcion || null;
      this.render();
      this.emitir();
    }

    tablaActual() {
      const r = this.calcular(), e = this.enc, cods = (e.codigos || {})[this.state.variable] || {};
      return r.grupos.map(a => { const G = r.g[a], ne = G.sw ** 2 / G.sw2, ops = {};
        r.opciones.forEach(o => { const p = (G.o[o] || 0) / G.sw, [lo, hi] = wilson(p, ne); ops[o] = { p, lo, hi }; });
        return { grupo: a, codigo: cods[a] || null, n: G.n, n_efectivo: Math.round(ne), opciones: ops }; });
    }

    get vistas() {
      const v = (this.getAttribute('vistas') || 'explorar,comparar,catalogo').split(',').map(x => x.trim()).filter(Boolean);
      return v.length ? v : ['explorar'];
    }

    iniciar(d) {
      if (!d || !Array.isArray(d.encuestas) || !d.encuestas.length) return this.fallo('El archivo de datos no tiene encuestas.');
      this.data = d;
      d.encuestas.forEach(e => { e._fecha = fechaFin(e.realizado); });
      d.encuestas.sort((a, b) => (a._fecha || 0) - (b._fecha || 0) || a.id.localeCompare(b.id));
      this.coloresGlobales();
      const at = k => this.getAttribute(k);
      const nac = d.encuestas.filter(x => x.ambito === 'Nacional' && x.preguntas.voto_2v);
      const e = d.encuestas.find(x => x.id === at('encuesta')) || nac[nac.length - 1] || d.encuestas[d.encuestas.length - 1];
      const s = this.state;
      s.tab = this.vistas.includes(at('vista')) ? at('vista') : this.vistas[0];
      s.encuesta = e.id;
      s.pregunta = e.preguntas[at('pregunta')] ? at('pregunta') : e.preguntas.voto_2v ? 'voto_2v' : Object.keys(e.preguntas)[0];
      s.variable = e.variables[at('variable')] ? at('variable') : e.variables.edad4 ? 'edad4' : Object.keys(e.variables)[0];
      s.opcion = at('opcion');
      this.render();
      this.dispatchEvent(new CustomEvent('vc-ready', { detail: { encuestas: d.encuestas.length }, bubbles: true, composed: true }));
    }

    // Color fijo por entidad (candidato/partido) en todas las encuestas: sigue a la entidad, no al rango.
    // Respuestas no sustantivas (NS/NR, blanco, ninguno, otro) van en gris.
    coloresGlobales() {
      const pesos = {};
      for (const e of this.data.encuestas) {
        for (const q of Object.keys(e.preguntas)) {
          const k = Object.keys(e.tablas).find(t => t.endsWith('|' + q)); if (!k) continue;
          pesos[q] = pesos[q] || {};
          for (const [, o, sw] of e.tablas[k]) pesos[q][o] = (pesos[q][o] || 0) + sw / e.n;
        }
      }
      this.color = {}; this.top = {};
      for (const [q, p] of Object.entries(pesos)) {
        const orden = Object.keys(p).filter(o => !ESPECIALES.has(o)).sort((a, b) => p[b] - p[a]).slice(0, MAX_SERIES);
        this.top[q] = new Set(orden);
        this.color[q] = {};
        orden.forEach((o, i) => this.color[q][o] = `var(--vc-s${i + 1})`);
      }
    }
    col(q, o) { return (this.color[q] || {})[o] || (o === 'Otros' || o === 'Otro' ? 'var(--vc-other)' : 'var(--vc-other-2)'); }
    agrupa(q, o) { return o === 'Otro' ? 'Otros' : ESPECIALES.has(o) || (this.top[q] && this.top[q].has(o)) ? o : 'Otros'; }

    get enc() { return this.data.encuestas.find(e => e.id === this.state.encuesta); }

    // Total de la pregunta sobre toda la muestra con respuesta (no depende de la variable de cruce)
    totalPregunta(e, q) {
      const filas = (e.totales || {})[q];
      if (!filas) return null;
      const tot = {}; let SW = 0, SW2 = 0, N = 0;
      for (const [o, sw, sw2, n] of filas) { const oo = this.agrupa(q, o); tot[oo] = (tot[oo] || 0) + sw; SW += sw; SW2 += sw2; N += n; }
      return { tot, SW, SW2, N, nEff: SW * SW / SW2 };
    }
    etiqueta(e, v) { return (e.variables[v] || {}).etiqueta || v; }

    calcular(e = this.enc, v = this.state.variable, q = this.state.pregunta) {
      const filas = e.tablas[`${v}|${q}`] || [];
      const g = {}, tot = {}, pesoG = {};
      let SW = 0, SW2 = 0, N = 0;
      for (const [a, o, sw, sw2, n] of filas) {
        const oo = this.agrupa(q, o);
        g[a] = g[a] || { sw: 0, sw2: 0, n: 0, o: {} };
        g[a].sw += sw; g[a].sw2 += sw2; g[a].n += n; g[a].o[oo] = (g[a].o[oo] || 0) + sw;
        tot[oo] = (tot[oo] || 0) + sw; SW += sw; SW2 += sw2; N += n;
      }
      for (const a in g) pesoG[a] = g[a].sw;
      const grupos = ordenar(v, Object.keys(g), pesoG);
      const rank = o => ESPECIALES.has(o) ? 2 : o === 'Otros' ? 1 : 0;
      const opciones = Object.keys(tot).sort((a, b) => rank(a) - rank(b) || tot[b] - tot[a]);
      const nEffTot = SW * SW / SW2;
      const colp = {}; opciones.forEach(o => colp[o] = tot[o] / SW);
      let chi = 0;
      for (const a of grupos) { const ra = g[a].sw / SW;
        for (const o of opciones) { const ex = ra * colp[o]; if (ex > 0) chi += ((g[a].o[o] || 0) / SW - ex) ** 2 / ex; } }
      chi *= nEffTot;
      const df = (grupos.length - 1) * (opciones.filter(o => colp[o] > 0).length - 1);
      const V = Math.sqrt(chi / (nEffTot * Math.max(1, Math.min(grupos.length - 1, opciones.length - 1))));
      const p = df > 0 ? gammaQ(df / 2, chi / 2) : NaN;
      return { g, grupos, opciones, tot, SW, SW2, N, nEffTot, chi, df, V, p, supr: (e.suprimidos || {})[`${v}|${q}`] || 0 };
    }

    set(k, val) {
      const s = this.state;
      s[k] = val;
      if (k === 'encuesta') {
        const e = this.enc;
        if (!e.preguntas[s.pregunta]) s.pregunta = Object.keys(e.preguntas)[0];
        if (!e.variables[s.variable]) s.variable = Object.keys(e.variables)[0];
      }
      if (['encuesta', 'variable', 'pregunta'].includes(k)) s.opcion = null;
      if (k === 'cmpPregunta') s.cmpOpcion = null;
      if (k === 'cmpVar') s.cmpGrupo = '';
      this.render();
      if (s.tab === 'explorar') this.emitir();
    }

    emitir() {
      const s = this.state, e = this.enc, detail = { encuesta: s.encuesta, variable: s.variable, pregunta: s.pregunta, opcion: s.opcion };
      if ((s.variable === 'departamento' || s.variable === 'municipio') && e.codigos && e.codigos[s.variable]) {
        const r = this.calcular(), cods = e.codigos[s.variable];
        detail.territorio = { nivel: s.variable, datos: r.grupos.map(a => { const G = r.g[a], p = (G.o[s.opcion] || 0) / G.sw, ne = G.sw ** 2 / G.sw2;
          const [lo, hi] = wilson(p, ne); return { codigo: cods[a] || null, nombre: a, p, lo, hi, n: G.n, n_efectivo: Math.round(ne) }; }) };
      }
      this.dispatchEvent(new CustomEvent('vc-change', { detail, bubbles: true, composed: true }));
    }

    render() {
      const d = this.data, s = this.state, firmas = new Set(d.encuestas.map(e => e.firma)).size;
      const nombres = { explorar: 'Explorar una encuesta', comparar: 'Comparar encuestas', catalogo: 'Catálogo CNE 2026' };
      const vistas = this.vistas.filter(v => nombres[v]);
      if (!vistas.includes(s.tab)) s.tab = vistas[0];
      const head = (this.hasAttribute('sin-encabezado') ? '' : `<header><h2>Voto y demografía · ciclo electoral 2026</h2>
        <p>Microdatos anonimizados del Registro Nacional de Encuestas del CNE (Ley 2494 de 2025, art. 12), armonizados: ${d.encuestas.length} encuestas de ${firmas} firmas.</p></header>`)
        + (vistas.length > 1 ? `<div class="tabs" role="tablist">${vistas.map(v =>
          `<button role="tab" data-tab="${v}" aria-selected="${s.tab === v}">${nombres[v]}</button>`).join('')}</div>` : '');
      const body = s.tab === 'explorar' ? this.vistaExplorar() : s.tab === 'comparar' ? this.vistaComparar() : this.vistaCatalogo();
      this.root.innerHTML = `<style>${css}</style><div class="wrap">${head}${body}</div>`;
      this.root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => this.set('tab', b.dataset.tab));
      this.root.querySelectorAll('select[data-k]').forEach(el => el.onchange = () => this.set(el.dataset.k, el.value));
      const t = this.root.querySelector('.toggle'); if (t) t.onclick = () => this.set('tabla', !s.tabla);
      this.enlazarTooltips();
    }

    get W() { return Math.max(220, Math.min(1180, this.clientWidth || 900) - 66); }
    opt(o, sel, lab) { return `<option value="${esc(o)}" ${o === sel ? 'selected' : ''}>${esc(lab ?? o)}</option>`; }
    selVariables(e, sel, k, vacio) {
      return (vacio ? this.opt('', sel, vacio) : '') + ['Demografía', 'Territorio', 'Comportamiento político'].map(gn => {
        const it = Object.entries(e.variables).filter(([, m]) => m.grupo === gn);
        return it.length ? `<optgroup label="${gn}">${it.map(([v, m]) => this.opt(v, sel, m.etiqueta)).join('')}</optgroup>` : '';
      }).join('');
    }
    etiquetaEnc(x) { return `${x.firma} · ${x.realizado} · ${x.ambito} (n=${fmtN(x.n)})`; }

    vistaExplorar() {
      const e = this.enc, s = this.state, r = this.calcular();
      if (!s.opcion || !r.opciones.includes(s.opcion)) s.opcion = r.opciones[0];
      const encs = this.data.encuestas.map(x => this.opt(x.id, s.encuesta, this.etiquetaEnc(x))).join('');
      const pregs = Object.entries(e.preguntas).map(([k, l]) => this.opt(k, s.pregunta, l)).join('');
      const opcs = r.opciones.map(o => this.opt(o, s.opcion)).join('');
      const sig = !isFinite(r.p) ? '—' : r.p < 0.001 ? 'p < 0,001' : 'p = ' + r.p.toFixed(3).replace('.', ',');
      const vlab = this.etiqueta(e, s.variable);
      const T = this.totalPregunta(e, s.pregunta) || { tot: r.tot, SW: r.SW, N: r.N, nEff: r.nEffTot };
      const ptot = (T.tot[s.opcion] || 0) / T.SW;
      return `
      <div class="filters">
        <label class="f">Encuesta<select data-k="encuesta">${encs}</select></label>
        <label class="f">Pregunta<select data-k="pregunta">${pregs}</select></label>
        <label class="f">Variable de cruce<select data-k="variable">${this.selVariables(e, s.variable)}</select></label>
        <label class="f">Opción a comparar<select data-k="opcion">${opcs}</select></label>
      </div>
      <div class="tiles">
        <div class="tile"><div class="k">Casos en el cruce</div><div class="v">${fmtN(r.N)}</div><div class="s">de ${fmtN(e.n)} encuestados${e.ponderada ? '' : ' · <span class="warn">sin ponderar</span>'}</div></div>
        <div class="tile"><div class="k">n efectivo (Kish)</div><div class="v">${fmtN(r.nEffTot)}</div><div class="s">efecto de diseño ≈ ${(r.N / r.nEffTot).toFixed(2).replace('.', ',')}</div></div>
        <div class="tile"><div class="k">V de Cramér</div><div class="v">${isFinite(r.V) ? r.V.toFixed(3).replace('.', ',') : '—'}</div><div class="s">χ²(${r.df}) = ${r.chi.toFixed(1).replace('.', ',')} · ${sig}</div></div>
        <div class="tile"><div class="k">${esc(s.opcion)} · total de la encuesta</div><div class="v">${fmtPct(ptot)}</div><div class="s">IC 95 % ${this.ic(ptot, T.nEff)} · n = ${fmtN(T.N)}</div></div>
      </div>
      <div class="card">
        <h3>${esc(s.opcion)}: % por ${esc(vlab.toLowerCase())}</h3>
        <p class="sub">${esc(e.preguntas[s.pregunta])}. Punto = proporción ponderada; barra = IC 95 % (Wilson, n efectivo); línea punteada = total.${r.supr ? ` ${r.supr} grupo(s) con n &lt; ${this.data.n_min} suprimidos.` : ''}</p>
        ${this.graficoPuntos(r.grupos.map(a => { const G = r.g[a], p = (G.o[s.opcion] || 0) / G.sw, ne = G.sw ** 2 / G.sw2;
          const [lo, hi] = wilson(p, ne); return { lab: a, p, lo, hi, n: G.n, ne }; }), ptot, this.col(s.pregunta, s.opcion), s.opcion)}
      </div>
      <div class="card">
        <div class="row"><div><h3>Distribución completa por ${esc(vlab.toLowerCase())}</h3>
          <p class="sub">Porcentaje ponderado de cada opción dentro de cada grupo.</p></div>
          <button class="toggle" aria-pressed="${s.tabla}">${s.tabla ? 'Ver gráfico' : 'Ver tabla'}</button></div>
        ${s.tabla ? this.tabla(r) : this.leyenda(r) + this.graficoApilado(r)}
      </div>
      ${this.ficha(e)}`;
    }

    ficha(e) {
      const q = this.state.pregunta, txt = (e.preguntas_texto || {})[q];
      return `<div class="card ficha">
        <h3 style="color:var(--vc-ink)">Ficha de la encuesta</h3>
        <b>${esc(e.firma)}</b> · Trabajo de campo: ${esc(e.realizado)} · Publicada: ${esc(e.publicado)} · Ámbito: ${esc(e.ambito)} · n = ${fmtN(e.n)}${e.ponderada ? '' : ' · <span class="warn">la firma no publicó factor de expansión: resultados sin ponderar</span>'}<br>
        Financiación: ${esc(e.financiacion)}<br>
        ${txt ? `Pregunta usada: <i>${esc(txt)}</i><br>` : ''}
        ${e.notas ? `Notas de armonización: ${esc(e.notas)}<br>` : ''}
        <a href="${esc(e.ficha_cne)}" target="_blank" rel="noopener">Registro en el CNE</a> · Archivo fuente: <code>${esc(e.archivo)}</code>
        <p class="note">Asociación ≠ causalidad. Grupos con n &lt; ${this.data.n_min} suprimidos en origen. El χ² se reescala al n efectivo de Kish (aproximación a Rao-Scott); los IC ignoran estratos y conglomerados no publicados. Candidatos, partidos y territorios armonizados (DIVIPOLA); las demás categorías conservan la redacción de la firma salvo las variables marcadas como armonizadas.</p>
      </div>`;
    }

    ic(p, n) { const [a, b] = wilson(p, n); return `${fmtPct(a)} – ${fmtPct(b)}`; }

    // filas: [{lab, p, lo, hi, n, ne, sub?}]
    graficoPuntos(filas, ref, color, nombre) {
      const W = this.W, rowH = 30, labW = Math.min(250, W * 0.38), padR = 56, top = 22;
      const H = top + filas.length * rowH + 8;
      if (!filas.length) return `<p class="note">Sin datos para esta combinación.</p>`;
      const maxX = Math.min(1, Math.max(0.1, ...filas.map(x => x.hi).filter(isFinite), isFinite(ref) ? ref : 0) * 1.08);
      const x = v => labW + (W - labW - padR) * v / maxX;
      const step = [0.05, 0.1, 0.2, 0.25, 0.5].find(st => x(st) - x(0) >= 48) || 0.5;
      let g = '';
      for (let t = 0; t <= maxX + 1e-9; t += step) g += `<line x1="${x(t)}" x2="${x(t)}" y1="${top - 6}" y2="${H - 8}" stroke="var(--vc-grid)"/>
        <text x="${x(t)}" y="${top - 10}" font-size="11" fill="var(--vc-muted)" text-anchor="middle">${Math.round(t * 100)} %</text>`;
      if (isFinite(ref)) g += `<line x1="${x(ref)}" x2="${x(ref)}" y1="${top - 6}" y2="${H - 8}" stroke="var(--vc-ink-2)" stroke-dasharray="3 3"/>`;
      filas.forEach((d, i) => {
        const y = top + i * rowH + rowH / 2;
        g += `<text x="${labW - 10}" y="${y + 4}" font-size="12" fill="var(--vc-ink)" text-anchor="end">${esc(corta(d.lab, labW - 14))}<title>${esc(d.lab)}</title></text>`;
        const tip = `<b>${esc(d.lab)}</b><br>${esc(nombre)}: <b>${fmtPct(d.p)}</b><br><span class=m>IC 95 %: ${fmtPct(d.lo)} – ${fmtPct(d.hi)}<br>n = ${fmtN(d.n)} · n efectivo = ${fmtN(d.ne)}${d.sub ? '<br>' + esc(d.sub) : ''}</span>`;
        g += `<line x1="${x(d.lo)}" x2="${x(d.hi)}" y1="${y}" y2="${y}" stroke="var(--vc-ink-2)" stroke-width="2" stroke-linecap="round"/>
          <circle cx="${x(d.p)}" cy="${y}" r="5.5" fill="${color}" stroke="var(--vc-surface)" stroke-width="2"/>
          <text x="${x(d.hi) + 8}" y="${y + 4}" font-size="11" fill="var(--vc-ink-2)">${fmtPct(d.p)}</text>
          <rect data-tip="${esc(tip)}" x="${labW}" y="${y - rowH / 2}" width="${W - labW}" height="${rowH}" fill="transparent"/>`;
      });
      return `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Proporción de ${esc(nombre)} con intervalos de confianza">${g}</svg><div class="tip"></div>`;
    }

    leyenda(r) {
      return `<div class="legend">${r.opciones.map(o => `<span><i style="background:${this.col(this.state.pregunta, o)}"></i>${esc(o)}</span>`).join('')}</div>`;
    }

    graficoApilado(r) {
      const W = this.W, rowH = 26, barH = 16, labW = Math.min(250, W * 0.38), top = 4;
      const H = top + r.grupos.length * rowH + 4, w = W - labW - 8;
      let g = '';
      r.grupos.forEach((a, i) => {
        const G = r.g[a], y = top + i * rowH + (rowH - barH) / 2;
        g += `<text x="${labW - 10}" y="${y + barH / 2 + 4}" font-size="12" fill="var(--vc-ink)" text-anchor="end">${esc(corta(a, labW - 14))}<title>${esc(a)}</title></text>`;
        let acc = 0;
        r.opciones.forEach(o => {
          const p = (G.o[o] || 0) / G.sw; if (p <= 0) return;
          const x0 = labW + acc * w, ww = Math.max(0, p * w - 2), c = this.col(this.state.pregunta, o);
          const tip = `<b>${esc(a)}</b><br>${esc(o)}: <b>${fmtPct(p)}</b><br><span class=m>n grupo = ${fmtN(G.n)}</span>`;
          g += `<rect data-tip="${esc(tip)}" x="${x0}" y="${y}" width="${ww}" height="${barH}" rx="3" fill="${c}"/>`;
          if (ww > 38) g += `<text x="${x0 + ww / 2}" y="${y + barH / 2 + 4}" font-size="10.5" fill="${c.includes('other') ? 'var(--vc-ink)' : '#fff'}" text-anchor="middle" pointer-events="none">${Math.round(p * 100)}</text>`;
          acc += p;
        });
      });
      return `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Distribución de opciones por grupo">${g}</svg><div class="tip"></div>`;
    }

    tabla(r) {
      const head = `<tr><th>Grupo</th><th>n</th><th>n efectivo</th>${r.opciones.map(o => `<th>${esc(o)}</th>`).join('')}</tr>`;
      const rows = r.grupos.map(a => { const G = r.g[a], ne = G.sw * G.sw / G.sw2;
        return `<tr><td>${esc(a)}</td><td>${fmtN(G.n)}</td><td>${fmtN(ne)}</td>${r.opciones.map(o => { const p = (G.o[o] || 0) / G.sw; const [lo, hi] = wilson(p, ne);
          return `<td title="IC 95 %: ${fmtPct(lo)} – ${fmtPct(hi)}">${fmtPct(p)}<br><span style="color:var(--vc-muted);font-size:11px">${(lo * 100).toFixed(1)}–${(hi * 100).toFixed(1)}</span></td>`; }).join('')}</tr>`; }).join('');
      const tot = `<tr><td><b>Total</b></td><td>${fmtN(r.N)}</td><td>${fmtN(r.nEffTot)}</td>${r.opciones.map(o => `<td><b>${fmtPct((r.tot[o] || 0) / r.SW)}</b></td>`).join('')}</tr>`;
      return `<div class="tablewrap"><table>${head}${rows}${tot}</table></div>`;
    }

    // ---------- comparar encuestas ----------
    vistaComparar() {
      const d = this.data, s = this.state;
      const conQ = q => d.encuestas.filter(e => e.preguntas[q]);
      const preguntas = [['voto_1v', 'Voto presidencial 1.ª vuelta'], ['voto_2v', 'Segunda vuelta: Cepeda vs. De la Espriella'],
        ['voto_senado', 'Voto Senado 2026 (partido)'], ['aprobacion', 'Aprobación del presidente / Gobierno'],
        ['evaluacion', 'Evaluación de la gestión (escala)']].filter(([q]) => conQ(q).length);
      if (!preguntas.find(([q]) => q === s.cmpPregunta)) s.cmpPregunta = preguntas[0][0];
      const q = s.cmpPregunta, encs = conQ(q);
      // variables armonizadas presentes en al menos 2 encuestas
      const ARM = ['sexo', 'edad4', 'educacion3', 'estrato', 'zona', 'departamento', 'ideologia', 'voto_2022_1v', 'voto_2022_2v', 'voto_senado'];
      const vars = ARM.filter(v => v !== q && encs.filter(e => e.tablas[`${v}|${q}`]).length >= 2);
      if (s.cmpVar && !vars.includes(s.cmpVar)) s.cmpVar = '';
      const grupos = new Set();
      if (s.cmpVar) encs.forEach(e => (e.tablas[`${s.cmpVar}|${q}`] || []).forEach(f => grupos.add(f[0])));
      const listaG = ordenar(s.cmpVar, [...grupos], {});
      if (s.cmpVar && !listaG.includes(s.cmpGrupo)) s.cmpGrupo = listaG[0] || '';
      // opciones: agregado de todas las encuestas
      const tot = {};
      encs.forEach(e => { const k = Object.keys(e.tablas).find(t => t.endsWith('|' + q)); (e.tablas[k] || []).forEach(([, o, sw]) => { const oo = this.agrupa(q, o); tot[oo] = (tot[oo] || 0) + sw / e.n; }); });
      const rank = o => ESPECIALES.has(o) ? 2 : o === 'Otros' ? 1 : 0;
      const opciones = Object.keys(tot).sort((a, b) => rank(a) - rank(b) || tot[b] - tot[a]);
      if (!opciones.includes(s.cmpOpcion)) s.cmpOpcion = opciones[0];
      const filas = [];
      for (const e of encs) {
        let sw = 0, sw2 = 0, n = 0, so = 0;
        if (!s.cmpVar && e.totales && e.totales[q]) {
          for (const [o, w, w2, nn] of e.totales[q]) { sw += w; sw2 += w2; n += nn; if (this.agrupa(q, o) === s.cmpOpcion) so += w; }
        } else {
          const k = s.cmpVar ? `${s.cmpVar}|${q}` : Object.keys(e.tablas).find(t => t.endsWith('|' + q));
          const t = e.tablas[k]; if (!t) continue;
          for (const [a, o, w, w2, nn] of t) { if (s.cmpVar && a !== s.cmpGrupo) continue; sw += w; sw2 += w2; n += nn; if (this.agrupa(q, o) === s.cmpOpcion) so += w; }
        }
        if (!n) continue;
        const p = so / sw, ne = sw * sw / sw2, [lo, hi] = wilson(p, ne);
        filas.push({ lab: `${e.firma_corta || e.firma} · ${fechaCorta(e._fecha) || e.realizado}`, p, lo, hi, n, ne, nacional: e.ambito === 'Nacional',
          sub: `${e.firma} · campo: ${e.realizado} · ${e.ambito}${e.ponderada ? '' : ' · sin ponderar'}` });
      }
      const nac = filas.filter(f => f.nacional);
      const media = nac.length ? nac.reduce((a, f) => a + f.p * f.ne, 0) / nac.reduce((a, f) => a + f.ne, 0) : NaN;
      return `
      <div class="filters">
        <label class="f">Pregunta<select data-k="cmpPregunta">${preguntas.map(([k, l]) => this.opt(k, q, l)).join('')}</select></label>
        <label class="f">Opción<select data-k="cmpOpcion">${opciones.map(o => this.opt(o, s.cmpOpcion)).join('')}</select></label>
        <label class="f">Filtrar por grupo (variable armonizada)<select data-k="cmpVar">${this.opt('', s.cmpVar, 'Total (sin filtro)')}${vars.map(v => this.opt(v, s.cmpVar, (encs.find(e => e.variables[v]).variables[v] || {}).etiqueta || v)).join('')}</select></label>
        ${s.cmpVar ? `<label class="f">Grupo<select data-k="cmpGrupo">${listaG.map(gg => this.opt(gg, s.cmpGrupo)).join('')}</select></label>` : ''}
      </div>
      <div class="card">
        <h3>${esc(s.cmpOpcion)} en ${filas.length} encuestas${s.cmpVar ? ` · ${esc(s.cmpGrupo)}` : ''}</h3>
        <p class="sub">Ordenadas por fecha de campo. Punto = proporción ponderada; barra = IC 95 %; línea punteada = promedio de las encuestas nacionales ponderado por n efectivo (${fmtPct(media)}). Las firmas difieren en método, universo y redacción: compare con cautela.</p>
        ${this.graficoPuntos(filas, media, this.col(q, s.cmpOpcion), s.cmpOpcion)}
      </div>`;
    }

    vistaCatalogo() {
      const c = this.data.catalogo, con = c.filter(x => x.microdatos).length, arm = c.filter(x => x.armonizada).length;
      const rows = c.map(x => `<tr><td>${esc(x.id.replace(/^2026-/, ''))}</td><td style="text-align:left">${esc(x.firma)}</td><td style="text-align:left">${esc(x.realizado)}</td>
        <td>${x.duplicado_de ? '<span class="pill no">duplicado</span>' : x.microdatos ? '<span class="pill">✓ microdatos</span>' : '<span class="pill no">✕ sin base</span>'}</td>
        <td>${x.armonizada ? '✓' : ''}</td><td>${x.scripts ? '✓' : ''}</td>
        <td style="text-align:left;font-size:12px;color:var(--vc-ink-2);min-width:220px">${esc(x.motivo || (x.duplicado_de ? 'Misma carpeta que ' + x.duplicado_de.replace(/^2026-/, '') : ''))}</td></tr>`).join('');
      return `<div class="tiles">
          <div class="tile"><div class="k">Encuestas registradas 2026</div><div class="v">${c.length}</div></div>
          <div class="tile"><div class="k">Con microdatos identificados</div><div class="v">${con}</div><div class="s">${Math.round(con / c.length * 100)} % del registro</div></div>
          <div class="tile"><div class="k">Armonizadas en el módulo</div><div class="v">${arm}</div></div>
        </div>
        <div class="card"><h3>Registro Nacional de Encuestas CNE 2026</h3><p class="sub">Detección de la base de respuestas en los anexos publicados y estado de armonización.</p>
        <div class="tablewrap"><table><tr><th>N.º</th><th style="text-align:left">Firma</th><th style="text-align:left">Trabajo de campo</th><th>Microdatos</th><th>Armonizada</th><th>Scripts</th><th style="text-align:left">Observación</th></tr>${rows}</table></div></div>`;
    }

    enlazarTooltips() {
      this.root.querySelectorAll('.card').forEach(card => {
        const tip = card.querySelector('.tip'); if (!tip) return;
        card.querySelectorAll('[data-tip]').forEach(el => {
          el.addEventListener('mousemove', ev => {
            tip.innerHTML = el.dataset.tip; tip.style.display = 'block';
            const cr = card.getBoundingClientRect(); let lx = ev.clientX - cr.left + 14; const ly = ev.clientY - cr.top + 14;
            if (lx + tip.offsetWidth > cr.width - 8) lx = Math.max(4, ev.clientX - cr.left - tip.offsetWidth - 14);
            tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
          });
          el.addEventListener('mouseleave', () => tip.style.display = 'none');
        });
      });
    }
  }

  if (!customElements.get('voto-correlaciones')) customElements.define('voto-correlaciones', VotoCorrelaciones);
})();
