/* =========================================================
   SALÓN DE LA FAMA
   Acceso extra (solo para los números de empleado autorizados en config.js)
   al listado global de colaboradores con sus horas trabajadas, desplegado
   por número de semana: podio de los tres primeros + ranking completo.

   Los datos vienen de horas-trabajadas.php (ver fetchHorasTrabajadas en api.js)
   y se descargan una sola vez, la primera vez que se abre el panel.
   ========================================================= */
import { tieneSalonFama, HORAS_SEMANA_COMPLETA } from './config.js';
import { fetchHorasTrabajadas } from './api.js';
import { decimalAHoras, escapeHtml, normDia } from './utils.js';

/* Estado del panel: semanas ya descargadas, semana visible y a quién resaltar. */
const estado = {
    semanas: null,      // null = aún no se ha descargado nada
    indice: 0,          // semana visible (0 = la más reciente)
    filtro: '',         // texto del buscador
    numEmpleado: '',    // colaborador actual (se resalta en el ranking)
    cargando: false,
    iniciado: false     // los listeners se conectan una sola vez
};

const el = (id) => document.getElementById(id);

/* Muestra u oculta el acceso según el colaborador y deja el panel listo.
   Se invoca desde renderDashboard con el perfil ya mapeado. */
export function setupSalonFama(perfil) {
    const boton = el('salon-access');
    if (!boton) return;

    if (!tieneSalonFama(perfil && perfil.numEmpleado)) {
        boton.classList.add('hidden');
        cerrar();
        return;
    }

    estado.numEmpleado = String(perfil.numEmpleado);
    boton.classList.remove('hidden');
    conectarEventos();
}

/* Conecta los eventos del acceso y del panel (una sola vez). */
function conectarEventos() {
    if (estado.iniciado) return;
    estado.iniciado = true;

    el('salon-access').addEventListener('click', abrir);
    el('salon-close').addEventListener('click', cerrar);
    el('salon-backdrop').addEventListener('click', cerrar);
    el('salon-retry').addEventListener('click', cargar);

    // Cambio de semana desde las pestañas.
    el('salon-weeks').addEventListener('click', (e) => {
        const tab = e.target.closest('[data-semana]');
        if (!tab) return;
        estado.indice = Number(tab.dataset.semana);
        renderSemanaActual();
    });

    el('salon-search').addEventListener('input', (e) => {
        estado.filtro = e.target.value.trim();
        renderSemanaActual();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !el('salon-modal').classList.contains('hidden')) cerrar();
    });
}

function abrir() {
    el('salon-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');   // evita el scroll del fondo
    if (estado.semanas === null) cargar();
}

function cerrar() {
    const modal = el('salon-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/* Descarga el listado (una vez) y pinta la semana más reciente. */
async function cargar() {
    if (estado.cargando) return;
    estado.cargando = true;
    mostrarEstado('loading');
    try {
        estado.semanas = await fetchHorasTrabajadas();
        estado.indice  = 0;
        if (!estado.semanas.length) { mostrarEstado('empty'); return; }
        renderPestanasSemanas();
        renderSemanaActual();
        mostrarEstado('content');
    } catch (err) {
        console.error('Error al cargar el Salón de la Fama:', err);
        estado.semanas = null;
        mostrarEstado('error');
    } finally {
        estado.cargando = false;
    }
}

/* Alterna entre los estados del panel: cargando / error / sin datos / contenido. */
function mostrarEstado(cual) {
    const vistas = { loading: 'salon-loading', error: 'salon-error', empty: 'salon-empty', content: 'salon-content' };
    for (const [nombre, id] of Object.entries(vistas)) {
        el(id).classList.toggle('hidden', nombre !== cual);
    }
    el('salon-toolbar').classList.toggle('hidden', cual !== 'content');
}

/* Pestañas de semana (la más reciente primero). */
function renderPestanasSemanas() {
    el('salon-weeks').innerHTML = estado.semanas.map((s, i) => `
        <button type="button" data-semana="${i}" aria-current="${i === estado.indice}"
                class="salon-week-tab shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors
                       ${i === estado.indice
                            ? 'bg-brand-green text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}">
            ${escapeHtml(s.titulo)}
        </button>`).join('');
}

/* Pinta la semana seleccionada: resumen, podio y ranking. */
function renderSemanaActual() {
    const semana = estado.semanas && estado.semanas[estado.indice];
    if (!semana) return;

    renderPestanasSemanas();

    const filtro    = normDia(estado.filtro);   // minúsculas y sin acentos
    const listados  = filtro
        ? semana.empleados.filter(e => normDia(e.nombre + ' ' + e.departamento + ' ' + e.numEmpleado).includes(filtro))
        : semana.empleados;

    // El podio solo tiene sentido sobre el ranking completo: al buscar se oculta.
    const podio = el('salon-podium');
    podio.classList.toggle('hidden', !!filtro);
    if (!filtro) podio.innerHTML = renderPodio(semana.empleados.slice(0, 3));

    renderResumen(semana);

    el('salon-list').innerHTML = listados.length
        ? listados.map(e => renderFila(e, semana.maxHoras)).join('')
        : `<li class="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
               Ningún colaborador coincide con "${escapeHtml(estado.filtro)}".
           </li>`;

    el('salon-list-title').textContent = filtro
        ? `Resultados (${listados.length})`
        : `Ranking completo · ${semana.titulo}`;
}

/* =========================================================
   MEDALLAS DE LOS TRES PRIMEROS LUGARES
   Una sola tabla con los colores de cada metal: la usan tanto el podio
   como las filas del ranking, para que el badge sea siempre el mismo.
   ========================================================= */
const MEDALLAS = {
    1: {
        etiqueta: 'Oro',
        aro: '#fde68a', disco: '#f59e0b', cinta: '#ef4444', cintaSombra: '#b91c1c',
        anillo: 'ring-amber-400',
        chip:   'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
    },
    2: {
        etiqueta: 'Plata',
        aro: '#e2e8f0', disco: '#94a3b8', cinta: '#60a5fa', cintaSombra: '#2563eb',
        anillo: 'ring-slate-300',
        chip:   'bg-slate-100 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300'
    },
    3: {
        etiqueta: 'Bronce',
        aro: '#e8b18a', disco: '#cd7f32', cinta: '#34d399', cintaSombra: '#059669',
        anillo: 'ring-orange-400',
        chip:   'bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300'
    }
};

/* Badge de medalla: cintas + disco con el número de posición. Todo va con
   colores literales (sin degradados con id) para poder repetirlo sin colisiones
   y para que se vea igual en cualquiera de los temas. */
function medallaBadge(posicion, clases = 'w-8 h-8') {
    const m = MEDALLAS[posicion];
    if (!m) return '';
    return `
    <svg viewBox="0 0 24 24" class="${clases} drop-shadow-sm" role="img"
         aria-label="Medalla de ${m.etiqueta.toLowerCase()} · lugar ${posicion}">
        <path d="M7.4 1.5h3.4l2.6 6-3.4 1.6z" fill="${m.cinta}"/>
        <path d="M16.6 1.5h-3.4l-2.6 6 3.4 1.6z" fill="${m.cintaSombra}"/>
        <circle cx="12" cy="15" r="6.9" fill="${m.disco}" stroke="${m.aro}" stroke-width="1.4"/>
        <text x="12" y="15" text-anchor="middle" dominant-baseline="central"
              font-size="8" font-weight="700" fill="#fff">${posicion}</text>
    </svg>`;
}

/* Chip con el nombre del metal ("Oro", "Plata", "Bronce"). */
function medallaChip(posicion) {
    const m = MEDALLAS[posicion];
    if (!m) return '';
    return `<span class="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${m.chip}">${m.etiqueta}</span>`;
}

/* Tarjetas de resumen de la semana: colaboradores, promedio, líder y el
   balance acumulado contra la jornada completa (47.5 h). */
function renderResumen(semana) {
    const lider = semana.empleados[0];
    const cards = [
        { label: 'Colaboradores', value: semana.empleados.length },
        { label: 'Promedio',      value: decimalAHoras(semana.promedio) },
        { label: 'Máximo',        value: lider ? lider.horasTexto : '—' },
        { label: `Balance (${HORAS_SEMANA_COMPLETA} h)`,
          value: semana.totalExtra > 0 ? '+' + decimalAHoras(semana.totalExtra) : '—',
          nota:  `${semana.conExtra} con extra · ${semana.conFalta} por debajo`,
          extra: semana.totalExtra > 0 }
    ];
    el('salon-summary').innerHTML = cards.map(c => `
        <div class="rounded-xl bg-slate-50 dark:bg-slate-700/40 border border-slate-100 dark:border-slate-700 px-3 py-2.5 text-center">
            <p class="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">${c.label}</p>
            <p class="mt-0.5 text-base font-semibold tabular-nums ${c.extra ? 'text-brand-green' : 'text-slate-800 dark:text-slate-100'}">${c.value}</p>
            ${c.nota ? `<p class="text-[10px] text-slate-400 dark:text-slate-500">${escapeHtml(c.nota)}</p>` : ''}
        </div>`).join('');
}

/* Chip con el balance del colaborador contra la jornada completa (47.5 h):
   en verde y con flecha arriba el tiempo que excedió, en ámbar y con flecha
   abajo el que le faltó para completarla. Vacío cuando la jornada quedó exacta. */
function balanceChip(e, clases = 'text-[11px] px-2 py-0.5') {
    const excede = e.extra > 0;
    const texto  = excede ? e.extraTexto : e.faltaTexto;
    if (!texto) return '';

    const estilo = excede
        ? 'bg-brand-green/10 text-brand-green ring-brand-green/30'
        : 'bg-amber-100 text-amber-700 ring-amber-300 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/30';
    const flecha = excede ? 'M12 19V5m0 0l-6 6m6-6l6 6' : 'M12 5v14m0 0l-6-6m6 6l6-6';
    const titulo = excede
        ? `Tiempo por encima de las ${HORAS_SEMANA_COMPLETA} h de la jornada completa`
        : `Tiempo que faltó para completar las ${HORAS_SEMANA_COMPLETA} h de la jornada`;

    return `<span class="inline-flex items-center gap-1 rounded-full font-bold tabular-nums ring-1 ${clases} ${estilo}"
                  title="${titulo}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" d="${flecha}"/>
                </svg>${texto}
            </span>`;
}

/* Podio de los tres primeros. En móvil van en columna (1, 2, 3); en sm+ se
   reordena a 2 · 1 · 3 con el primer lugar más alto. */
function renderPodio(top) {
    const orden = ['sm:order-2', 'sm:order-1', 'sm:order-3'];
    const alto  = ['sm:pb-8', 'sm:pb-3', 'sm:pb-3'];

    return top.map((e, i) => {
        const m = MEDALLAS[i + 1];
        const esYo = e.numEmpleado === estado.numEmpleado;
        return `
        <div class="salon-podium-item ${orden[i]} ${alto[i]} flex flex-col items-center text-center rounded-2xl
                    border ${esYo ? 'border-brand-green' : 'border-slate-100 dark:border-slate-700'}
                    bg-slate-50 dark:bg-slate-700/40 px-3 pt-5 pb-4">
            <div class="relative">
                <img src="${e.foto}" alt="" loading="lazy"
                     onerror="this.onerror=null;this.src='${e.avatarFallback}'"
                     class="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover bg-slate-200 dark:bg-slate-600 ring-2 ${m.anillo}">
                <span class="absolute -bottom-2 -right-1">${medallaBadge(i + 1, 'w-9 h-9')}</span>
            </div>
            <p class="mt-3">${medallaChip(i + 1)}</p>
            <p class="mt-1.5 text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">${escapeHtml(e.nombre)}</p>
            <p class="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">${escapeHtml(e.departamento)}</p>
            <p class="mt-2 text-lg font-semibold text-slate-800 dark:text-slate-100 tabular-nums">${e.horasTexto}</p>
            <p class="mt-1 min-h-[1.25rem]">${balanceChip(e)}</p>
        </div>`;
    }).join('');
}

/* Una fila del ranking completo. La barra es proporcional al líder de la semana. */
function renderFila(e, maxHoras) {
    const esYo = e.numEmpleado === estado.numEmpleado;
    const ancho = maxHoras > 0 ? Math.max((e.horas / maxHoras) * 100, 2) : 0;

    // Los tres primeros llevan su badge de medalla; el resto, el número a secas.
    const posicion = MEDALLAS[e.posicion]
        ? medallaBadge(e.posicion, 'w-8 h-8')
        : `<span class="w-7 h-7 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400
                        text-xs font-bold flex items-center justify-center tabular-nums">${e.posicion}</span>`;

    return `
    <li class="flex items-center gap-3 py-2.5 px-2 rounded-xl transition-colors
               ${esYo ? 'bg-brand-green/10 ring-1 ring-brand-green/40' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}">
        <span class="shrink-0 w-8 flex justify-center">${posicion}</span>
        <img src="${e.foto}" alt="" loading="lazy"
             onerror="this.onerror=null;this.src='${e.avatarFallback}'"
             class="shrink-0 w-9 h-9 rounded-full object-cover bg-slate-200 dark:bg-slate-600">
        <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                ${escapeHtml(e.nombre)}${esYo ? '<span class="ml-1.5 text-[10px] font-bold text-brand-green uppercase">Tú</span>' : ''}
            </p>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide truncate">${escapeHtml(e.departamento)}</p>
            <div class="mt-1 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div class="h-full rounded-full bg-brand-green" style="width: ${ancho.toFixed(1)}%"></div>
            </div>
        </div>
        <span class="shrink-0 flex flex-col items-end gap-0.5">
            <span class="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">${e.horasTexto}</span>
            ${balanceChip(e, 'text-[10px] px-1.5 py-0')}
        </span>
    </li>`;
}
