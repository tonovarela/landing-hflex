/* =========================================================
   ENTRADAS Y SALIDAS  (checadas.html)
   Tablero con la entrada y salida de TODOS los colaboradores, en tarjetas
   pequeñas, por semana y por día.

   No hay un servicio que entregue las checadas de todos a la vez:
     1. horas-trabajadas.php da la lista de colaboradores y semanas.
     2. personal.php (?id=<numEmpleado>) da las checadas de cada uno; se
        piden en paralelo con un límite de concurrencia y las tarjetas se
        van completando conforme llegan.
   ========================================================= */
import { API_CONFIG, baseUrlFoto, HORAS_SEMANA_COMPLETA, leerPaseChecadas } from './config.js';
import { fetchData } from './api.js';
import { escapeHtml, normDia } from './utils.js';

const CONCURRENCIA = 8;   // peticiones simultáneas a personal.php
const JORNADA_DIARIA_MIN = 9 * 60 + 30;   // 9 h 30 m: a partir de aquí el total va en verde

const DIAS = [
    { nombre: 'Lunes',     corto: 'Lun' },
    { nombre: 'Martes',    corto: 'Mar' },
    { nombre: 'Miércoles', corto: 'Mié' },
    { nombre: 'Jueves',    corto: 'Jue' },
    { nombre: 'Viernes',   corto: 'Vie' },
    { nombre: 'Sábado',    corto: 'Sáb' },
    { nombre: 'Domingo',   corto: 'Dom' }
];

/* Estados de una tarjeta para el día visible. 'pendiente' = aún no llegan
   sus checadas (o fallaron). */
const ESTADOS = {
    completo:   { etiqueta: 'Entrada y salida', punto: 'bg-brand-green' },
    enCurso:    { etiqueta: 'Sin salida',       punto: 'bg-sky-500' },
    sinRegistro:{ etiqueta: 'Sin registro',     punto: 'bg-slate-300 dark:bg-slate-600' },
    pendiente:  { etiqueta: 'Cargando',         punto: 'bg-slate-200 dark:bg-slate-700' }
};

const estado = {
    colaboradores: [],      // [{ numEmpleado, nombre, departamento, foto, avatarFallback }]
    semanas: [],            // números de semana, la más reciente primero
    checadas: new Map(),
    horasSemana: new Map(), // numEmpleado -> Map(numSemana -> horas trabajadas según el servicio)    // numEmpleado -> Map(numSemana -> registros[]) | 'error'
    semana: null,
    dia: 0,                 // índice en DIAS
    diaElegido: false,      // el usuario ya eligió día: no se recalcula solo
    filtro: '',
    depto: '',
    filtroEstado: '',       // clave de ESTADOS o '' para todos
    cargados: 0,
    fotosListas: new Set()  // numEmpleado cuya foto ya terminó de cargar (no repetir el loading al re-renderizar)
};

const el = (id) => document.getElementById(id);

/* ---------- Datos ---------- */

async function cargar() {
    el('chk-error').classList.add('hidden');
    el('chk-progress').textContent = 'Cargando colaboradores…';
    try {
        const res = await fetch(API_CONFIG.baseUrlHoras, { headers: API_CONFIG.headers });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        if (json.error) throw new Error(String(json.error));
        prepararListado(Array.isArray(json.horas) ? json.horas : []);
    } catch (err) {
        console.error('Error al cargar el listado:', err);
        el('chk-progress').textContent = '';
        el('chk-error').classList.remove('hidden');
        return;
    }

    renderFiltrosFijos();
    programarRender();
    await descargarChecadas();
}

/* Lista única de colaboradores y semanas a partir de horas-trabajadas.php. */
function prepararListado(horas) {
    const porNum = new Map();
    const semanas = new Set();
    for (const h of horas) {
        const num = String(h.NumEmpleado ?? '').trim();
        if (!num) continue;
        semanas.add(Number(h.NumSemana));
        if (!porNum.has(num)) {
            porNum.set(num, {
                numEmpleado: num,
                nombre: h.NombreEmpleado ?? '—',
                departamento: h.Departamento ?? '—',
                foto: baseUrlFoto + encodeURIComponent(num),
                avatarFallback: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(h.NombreEmpleado || '') +
                                '&background=1e293b&color=fff&size=96'
            });
        }
    }
    estado.colaboradores = [...porNum.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    estado.semanas = [...semanas].filter(Number.isFinite).sort((a, b) => b - a);
    estado.semana = estado.semanas[0] ?? null;
}

/* Descarga personal.php de cada colaborador con un pool de CONCURRENCIA workers. */
async function descargarChecadas() {
    const cola = [...estado.colaboradores];
    const total = cola.length;
    estado.cargados = 0;
    actualizarProgreso(total);

    const worker = async () => {
        while (cola.length) {
            const c = cola.shift();
            try {
                const datos = await fetchData({ id: c.numEmpleado, url: API_CONFIG.baseUrlPersonal });
                const porSemana = new Map(datos.semanas.map(s => [s.numSemana, s.registros]));
                estado.checadas.set(c.numEmpleado, porSemana);
                estado.horasSemana.set(c.numEmpleado,
                    new Map(datos.semanas.map(s => [s.numSemana, s.semana.diferencia.registradas])));
            } catch (err) {
                console.warn(`Sin checadas para ${c.numEmpleado}:`, err.message);
                estado.checadas.set(c.numEmpleado, 'error');
            }
            estado.cargados++;
            actualizarProgreso(total);
            if (!estado.diaElegido) elegirDiaPorDefecto();
            programarRender();
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, total) }, worker));
}

function actualizarProgreso(total) {
    el('chk-progress').textContent = estado.cargados < total
        ? `Cargando checadas ${estado.cargados}/${total}…`
        : `${total} colaboradores · actualizado ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
}

/* ---------- Helpers de fecha/hora ---------- */

/* "28/09/2026 08:00:00" -> "08:00". */
function soloHora(str) {
    const m = String(str ?? '').match(/(\d{1,2}):(\d{2})/);
    return m ? m[1].padStart(2, '0') + ':' + m[2] : null;
}

/* "28/09/2026 08:00:00" -> "28/09/2026". */
function soloFecha(str) {
    const m = String(str ?? '').match(/\d{1,2}\/\d{1,2}\/\d{4}/);
    return m ? m[0] : null;
}

/* "9 h 45 m" (formato de diffHoras) -> minutos. */
function minutosDe(texto) {
    const m = String(texto ?? '').match(/(\d+)\s*h\s*(\d+)\s*m/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function hoyDMY() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/* Registros de la semana visible de un colaborador (o null si no hay). */
function registrosDe(numEmpleado) {
    const c = estado.checadas.get(numEmpleado);
    if (!c || c === 'error') return null;
    return c.get(estado.semana) || null;
}

/* Días de vacaciones del colaborador en la semana visible. */
function diasVacaciones(numEmpleado) {
    return (registrosDe(numEmpleado) || []).filter(r => r.vacacion).length;
}

/* Fecha de cada día de la semana visible, tomada de cualquier checada. */
function fechasSemana() {
    const fechas = Array(7).fill(null);
    for (const c of estado.checadas.values()) {
        if (c === 'error') continue;
        const regs = c.get(estado.semana);
        if (!regs) continue;
        regs.forEach((r, i) => { fechas[i] ||= soloFecha(r.entrada) || soloFecha(r.salida); });
        if (fechas.every(Boolean)) break;
    }
    return fechas;
}

/* Día por defecto: hoy si cae en la semana; si no, el último día con alguna entrada. */
function elegirDiaPorDefecto() {
    const fechas = fechasSemana();
    const hoy = fechas.indexOf(hoyDMY());
    if (hoy >= 0) { estado.dia = hoy; return; }
    for (let i = 6; i >= 0; i--) {
        if (fechas[i]) { estado.dia = i; return; }
    }
    estado.dia = 0;
}

/* ---------- Estado de una tarjeta ---------- */

function estadoDe(c) {
    const cargado = estado.checadas.get(c.numEmpleado);
    if (!cargado || cargado === 'error') return { clave: 'pendiente', error: cargado === 'error' };
    const r = (registrosDe(c.numEmpleado) || [])[estado.dia];
    if (!r) return { clave: 'sinRegistro' };

    const entrada = soloHora(r.entrada);
    const salida  = soloHora(r.salida);
    // Vacaciones, festivo y home office sin checada cuentan como "sin registro"
    // (la mini tabla de la tarjeta ya los marca día por día).
    let clave;
    if (entrada && salida)        clave = 'completo';
    else if (entrada || salida)   clave = 'enCurso';
    else                          clave = 'sinRegistro';
    return { clave, r, entrada, salida };
}

/* ---------- Render ---------- */

let renderPendiente = false;
function programarRender() {
    if (renderPendiente) return;
    renderPendiente = true;
    requestAnimationFrame(() => { renderPendiente = false; render(); });
}

function render() {
    renderSemanas();
    renderDias();

    const filtro = normDia(estado.filtro);
    const base = estado.colaboradores
        .filter(c => !estado.depto || c.departamento === estado.depto)
        .filter(c => !filtro || normDia(c.nombre + ' ' + c.numEmpleado + ' ' + c.departamento).includes(filtro))
        .map(c => ({ c, e: estadoDe(c) }))
        // Por hora de entrada (la más temprana primero); quienes no tienen entrada
        // ese día van al final, en orden alfabético (sort es estable).
        .sort((a, b) => {
            const ea = a.e.entrada, eb = b.e.entrada;
            if (ea && eb) return ea.localeCompare(eb);
            return ea ? -1 : eb ? 1 : 0;
        });

    renderResumen(base);

    const visibles = !estado.filtroEstado ? base
        : estado.filtroEstado === 'vacaciones' ? base.filter(x => diasVacaciones(x.c.numEmpleado) > 0)
        : base.filter(x => x.e.clave === estado.filtroEstado);
    el('chk-grid').innerHTML = visibles.map(({ c, e }) => renderTarjeta(c, e)).join('');

    const vacio = el('chk-empty');
    vacio.classList.toggle('hidden', visibles.length > 0 || !estado.colaboradores.length);
    vacio.textContent = 'Ningún colaborador coincide con los filtros.';
}

function renderSemanas() {
    el('chk-weeks').innerHTML = estado.semanas.map(n => `
        <button type="button" data-semana="${n}"
                class="shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors
                       ${n === estado.semana
                            ? 'bg-brand-green text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}">
            Semana ${n}
        </button>`).join('');
}

function renderDias() {
    const fechas = fechasSemana();
    const hoy = hoyDMY();
    el('chk-days').innerHTML = DIAS.map((d, i) => {
        const activo = i === estado.dia;
        const fecha = fechas[i] ? fechas[i].slice(0, 5) : '';
        return `
        <button type="button" data-dia="${i}" aria-pressed="${activo}"
                class="flex flex-col items-center py-1.5 rounded-lg text-xs font-semibold transition-colors
                       ${activo
                            ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900'
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 dark:bg-slate-700/40 dark:text-slate-400 dark:hover:bg-slate-700'}">
            <span>${d.corto}${fechas[i] === hoy ? ' ·' : ''}</span>
            <span class="text-[10px] font-normal opacity-70 tabular-nums">${fecha || '&nbsp;'}</span>
        </button>`;
    }).join('');
}

function renderResumen(base) {
    const cuenta = (k) => base.filter(x => x.e.clave === k).length;
    const tarjetas = [
        { clave: '',            etiqueta: 'Todos',       valor: base.length },
        { clave: 'completo',    etiqueta: 'Completos',   valor: cuenta('completo') },
        { clave: 'enCurso',     etiqueta: 'Sin salida',  valor: cuenta('enCurso') },
        { clave: 'sinRegistro', etiqueta: 'Sin registro', valor: cuenta('sinRegistro') },
        // A diferencia de los anteriores (que miran el día elegido), este abarca
        // toda la semana: quien tenga al menos un día de vacaciones en ella.
        { clave: 'vacaciones',  etiqueta: 'Vacaciones (semana)', punto: 'bg-amber-400',
          valor: base.filter(x => diasVacaciones(x.c.numEmpleado) > 0).length }
    ];
    el('chk-summary').innerHTML = tarjetas.map(t => {
        const activo = t.clave === estado.filtroEstado;
        const punto = t.punto || (t.clave ? ESTADOS[t.clave].punto : 'bg-slate-400');
        return `
        <button type="button" data-estado="${t.clave}" aria-pressed="${activo}"
                class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors
                       ${activo
                            ? 'border-brand-green bg-brand-green/10'
                            : 'border-slate-100 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-700/40 dark:hover:bg-slate-700'}">
            <span class="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <span class="w-2 h-2 rounded-full ${punto}"></span>${t.etiqueta}
            </span>
            <span class="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">${t.valor}</span>
        </button>`;
    }).join('');
}

/* Tarjeta compacta: foto, nombre, departamento y una mini tabla con la entrada,
   salida y total de cada día de la semana. El día seleccionado en los filtros
   va resaltado (es el que define el punto de estado y el orden). */
function renderTarjeta(c, e) {
    const meta = ESTADOS[e.clave];
    const regs = registrosDe(c.numEmpleado);
    const fotoCargada = estado.fotosListas.has(c.numEmpleado);
    let cuerpo;

    if (e.clave === 'pendiente') {
        cuerpo = e.error
            ? `<p class="text-[11px] text-red-500 dark:text-red-400">No se pudieron cargar sus checadas.</p>`
            : `<div class="space-y-1">${'<span class="skeleton block h-4 rounded"></span>'.repeat(DIAS.length)}</div>`;
    } else {
        cuerpo = `<div class="space-y-px">${DIAS.map((d, i) => filaDia(d, (regs || [])[i], i === estado.dia)).join('')}</div>
                  ${totalSemana(c.numEmpleado)}
                  ${graficaSemana(regs)}`;
    }

    return `
    <li class="rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm p-3">
        <div class="flex items-center gap-2.5">
            <span class="relative shrink-0">
                ${fotoCargada
                    ? ''
                    : `<span class="chk-foto-loader absolute inset-0 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                           <span class="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-500 border-t-brand-green dark:border-t-brand-green animate-spin"></span>
                       </span>`}
                <img src="${c.foto}" alt="" loading="lazy" data-num="${escapeHtml(c.numEmpleado)}" data-fallback="${c.avatarFallback}"
                     class="chk-foto block w-10 h-10 rounded-full object-cover bg-slate-200 dark:bg-slate-600 transition-opacity duration-300 ${fotoCargada ? '' : 'opacity-0'}">
                <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${meta.punto}"
                      title="${meta.etiqueta}"></span>
            </span>
            <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate" title="${escapeHtml(c.nombre)}">${escapeHtml(c.nombre)}</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide truncate">${escapeHtml(c.departamento)} · ${escapeHtml(c.numEmpleado)}</p>
            </div>
        </div>
        <div class="mt-2">${cuerpo}</div>
    </li>`;
}

/* Una fila de la mini tabla: día · entrada · salida · total. El total va en
   verde si cubre la jornada diaria (9 h 30 m) y en rojo si no. */
function filaDia(d, r, seleccionado) {
    const entrada = r && soloHora(r.entrada);
    const salida  = r && soloHora(r.salida);
    const hora = (h) => `<span class="${h ? 'text-slate-600 dark:text-slate-300' : 'text-slate-300 dark:text-slate-600'}">${h || '—'}</span>`;

    let datos;
    if (r && (r.vacacion || r.festivo) && !entrada) {
        datos = `<span class="col-span-3 text-center rounded bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 font-semibold">
                     ${r.vacacion ? 'Vacaciones' : 'Festivo'}
                 </span>`;
    } else {
        const minutos = entrada && salida ? minutosDe(r.total) : 0;
        const cumple  = minutos >= JORNADA_DIARIA_MIN;
        const total = minutos > 0
            ? `<span class="text-right font-semibold rounded px-1 ${cumple
                    ? 'bg-brand-green/10 text-green-700 dark:text-green-400'
                    : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}"
                     title="${cumple ? 'Cubre' : 'No cubre'} la jornada de 9 h 30 m">${horasCortas(minutos)}</span>`
            : `<span class="text-right text-slate-300 dark:text-slate-600">—</span>`;
        datos = `${hora(entrada)}${hora(salida)}${total}`;
    }

    const ho = r && r.homeOffice
        ? `<span class="ml-0.5 text-[8px] font-bold text-violet-600 dark:text-violet-300" title="Home office">HO</span>` : '';

    return `
    <div class="grid grid-cols-[2.4rem_1fr_1fr_3.6rem] items-center gap-1 px-1 py-0.5 rounded text-[11px] tabular-nums
                ${seleccionado ? 'bg-slate-100 dark:bg-slate-700/60 ring-1 ring-slate-200 dark:ring-slate-600' : ''}">
        <span class="font-semibold text-slate-500 dark:text-slate-400">${d.corto}${ho}</span>
        ${datos}
    </div>`;
}

/* Pie de la tarjeta con las horas trabajadas en la semana (tieTrabajado del
   servicio, igual que en index.html y el Salón de la Fama): verde si cubre la
   jornada completa (47.5 h), rojo si no. */
function totalSemana(numEmpleado) {
    const horas = estado.horasSemana.get(numEmpleado)?.get(estado.semana);
    if (horas == null) return '';
    const minutos = Math.round(horas * 60);
    const cumple  = horas >= HORAS_SEMANA_COMPLETA;
    return `
    <div class="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between px-1 text-[11px] tabular-nums"
         title="${cumple ? 'Cubre' : 'No cubre'} la jornada semanal de ${HORAS_SEMANA_COMPLETA} h">
        <span class="font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Semana</span>
        <span class="font-bold rounded px-1.5 ${cumple
                ? 'bg-brand-green/10 text-green-700 dark:text-green-400'
                : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}">${horasCortas(minutos)}</span>
    </div>`;
}

/* Mini gráfica de barras de la semana: eje X = día (Lun–Dom), eje Y = horas
   trabajadas ese día. Una barra por día con entrada y salida (verde si cubre
   la jornada de 9 h 30 m, rojo si no) y una línea punteada de referencia en
   9.5 h. Los días sin checada completa quedan sin barra. Cada columna lleva un
   <title> como tooltip al pasar el cursor (la zona sensible es toda la columna). */
function graficaSemana(regs) {
    if (!regs) return '';
    const W = 200, H = 70, izq = 4, der = 26, arriba = 6, abajo = 14;
    const anchoUtil = W - izq - der, altoUtil = H - arriba - abajo;
    const base = arriba + altoUtil;
    const meta = JORNADA_DIARIA_MIN / 60;

    const horas = DIAS.map((d, i) => {
        const r = regs[i];
        const min = r && soloHora(r.entrada) && soloHora(r.salida) ? minutosDe(r.total) : 0;
        return min > 0 ? min / 60 : null;
    });
    if (!horas.some(h => h != null)) return '';

    const maxY = Math.max(12, Math.ceil(Math.max(...horas.filter(h => h != null))));
    const columna = anchoUtil / DIAS.length;
    const anchoBarra = columna * 0.6;
    const cx = (i) => izq + columna * i + columna / 2;
    const y  = (h) => base - (h / maxY) * altoUtil;

    /* Barra con las esquinas superiores redondeadas y apoyada en la base. */
    const barra = (x0, y0, w) => {
        const r = Math.min(2, w / 2, base - y0);
        return `M${x0},${base} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + w - r} Q${x0 + w},${y0} ${x0 + w},${y0 + r} V${base} Z`;
    };

    const barras = horas.map((h, i) => {
        if (h == null) return '';
        const cumple = h >= meta;
        const texto  = `${DIAS[i].nombre}: ${horasCortas(Math.round(h * 60))} · ${cumple ? 'cubre' : 'no cubre'} 9h 30m`;
        const x0 = cx(i) - anchoBarra / 2;
        return `<g><title>${texto}</title>
                    <rect x="${izq + columna * i}" y="${arriba}" width="${columna}" height="${altoUtil}" fill="transparent"/>
                    <path d="${barra(x0, y(h), anchoBarra)}" fill="${cumple ? '#16a34a' : '#dc2626'}"/>
                </g>`;
    }).join('');

    const etiquetas = DIAS.map((d, i) =>
        `<text x="${cx(i)}" y="${H - 3}" text-anchor="middle" font-size="8" class="fill-slate-400 dark:fill-slate-500">${d.corto[0]}</text>`).join('');

    return `
    <svg viewBox="0 0 ${W} ${H}" class="mt-2 w-full h-auto" role="img"
         aria-label="Gráfica de barras: horas trabajadas por día en la semana; referencia en 9.5 horas">
        <line x1="${izq}" x2="${W - der}" y1="${base}" y2="${base}"
              class="stroke-slate-200 dark:stroke-slate-700" stroke-width="1"/>
        ${barras}
        <line x1="${izq}" x2="${W - der}" y1="${y(meta)}" y2="${y(meta)}"
              class="stroke-slate-500 dark:stroke-slate-400" stroke-width="1" stroke-dasharray="3 3" pointer-events="none"/>
        <text x="${W - der + 3}" y="${y(meta) + 3}" font-size="8" class="fill-slate-500 dark:fill-slate-400">9.5h</text>
        ${etiquetas}
    </svg>`;
}

/* Minutos -> "9h 48m" (versión corta para la mini tabla). */
function horasCortas(min) {
    return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}

/* Departamentos en el selector (se llena una vez con el listado). */
function renderFiltrosFijos() {
    const deptos = [...new Set(estado.colaboradores.map(c => c.departamento))].sort((a, b) => a.localeCompare(b, 'es'));
    el('chk-dept').insertAdjacentHTML('beforeend',
        deptos.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join(''));
}

/* ---------- Eventos ---------- */

function conectarEventos() {
    el('chk-weeks').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-semana]');
        if (!b) return;
        estado.semana = Number(b.dataset.semana);
        estado.diaElegido = false;
        elegirDiaPorDefecto();
        render();
    });
    el('chk-days').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-dia]');
        if (!b) return;
        estado.dia = Number(b.dataset.dia);
        estado.diaElegido = true;
        render();
    });
    el('chk-summary').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-estado]');
        if (!b) return;
        estado.filtroEstado = b.dataset.estado === estado.filtroEstado ? '' : b.dataset.estado;
        render();
    });
    el('chk-search').addEventListener('input', (ev) => { estado.filtro = ev.target.value.trim(); render(); });
    el('chk-dept').addEventListener('change', (ev) => { estado.depto = ev.target.value; render(); });
    el('chk-retry').addEventListener('click', cargar);

    // Fotos: 'load' y 'error' no burbujean, así que se escuchan en fase de captura.
    el('chk-grid').addEventListener('load', (ev) => {
        if (ev.target.classList?.contains('chk-foto')) fotoLista(ev.target);
    }, true);
    el('chk-grid').addEventListener('error', (ev) => {
        const img = ev.target;
        if (!img.classList?.contains('chk-foto')) return;
        // Sin foto oficial: se intenta el avatar con iniciales; si también falla, se quita el loading.
        if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback;
        else fotoLista(img);
    }, true);

    // Claro <-> oscuro. Los temas exclusivos de Sistemas se manejan en index.html.
    el('theme-switch').addEventListener('click', () => {
        const root = document.documentElement;
        const oscuro = !root.classList.contains('dark');
        root.className = '';
        if (oscuro) root.classList.add('dark');
        localStorage.setItem('theme', oscuro ? 'dark' : 'light');
    });
}

/* Foto al 100%: se muestra con fundido, se quita su loading y se recuerda para
   que los re-renderizados (llegan checadas, filtros) no vuelvan a mostrarlo. */
function fotoLista(img) {
    estado.fotosListas.add(img.dataset.num);
    img.classList.remove('opacity-0');
    const loader = img.previousElementSibling;
    if (loader && loader.classList.contains('chk-foto-loader')) loader.remove();
}

function urlRegreso(pase) {
    try {
        const url = new URL(pase.origen, location.href);
        if (url.origin === location.origin) return url.href;
    } catch { /* origen vacío o inválido */ }
    return 'index.html?' + new URLSearchParams({ [API_CONFIG.queryParamPersonal]: pase.numEmpleado });
}

function init() {
    // Sin un pase válido (guardado desde el botón de index.html) no se muestra
    // ni se descarga nada.
    const pase = leerPaseChecadas();
    if (!pase) {
        el('chk-denegado').classList.remove('hidden');
        return;
    }
    el('chk-main').classList.remove('hidden');

    // Regresar al registro desde el que se entró. Solo se aceptan URLs del mismo
    // sitio; si el pase no trae origen, se arma con el número de empleado.
    const regresar = el('chk-regresar');
    regresar.href = urlRegreso(pase);
    regresar.classList.remove('hidden');
    conectarEventos();
    cargar();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
