/* =========================================================
   RENDERIZADO
   Pinta el tablero (perfil, selector de semanas, resumen y registros)
   a partir del resultado ya mapeado de la API.
   ========================================================= */
import { toNum, decimalAHoras } from './utils.js';
import { applyDepartmentTheme, launchFireworks, stopFireworks, launchRain, stopRain } from './theme.js';
import { setupSalonFama } from './salon.js';

/* Pinta todo el tablero a partir del resultado de mapApiResponse:
   perfil (fijo) + selector de semanas + la semana más reciente ya seleccionada. */
export function renderDashboard(data) {
    applyDepartmentTheme(data.perfil);
    renderProfile(data.perfil);
    setupSalonFama(data.perfil);   // acceso extra: solo para los empleados autorizados
    setupWeekSelector(data.semanas);
    renderSemana(data.semanas[0]);
}

/* Configura el selector de semanas. Solo se muestra cuando hay más de una semana;
   al cambiar, vuelve a pintar el resumen y los registros de la semana elegida. */
function setupWeekSelector(semanas = []) {
    const sel   = document.getElementById('week-selector');
    const title = document.getElementById('week-title');

    if (semanas.length <= 1) {
        sel.classList.add('hidden');
        sel.innerHTML = '';
        sel.onchange = null;
        title.classList.remove('hidden');
        return;
    }

    // Con varias semanas, el selector hace las veces de título.
    title.classList.add('hidden');
    sel.classList.remove('hidden');
    sel.innerHTML = semanas
        .map((s, i) => `<option value="${i}">${s.semana.titulo}</option>`)
        .join('');
    sel.value = '0';   // 'semanas' viene ordenado: la más reciente es la primera
    sel.onchange = () => {
        const i = Number(sel.value);
        const s = semanas[i];
        if (s) renderSemana(s, i === 0);
    };
}

/* Pinta el resumen y los registros de una semana concreta.
   'esActual' indica si es la semana vigente (siempre la primera del arreglo);
   solo en semanas pasadas tiene sentido avisar que no se cubrió el mínimo. */
function renderSemana(s, esActual = true) {
    if (!s) return;
    renderWeek(s.semana, esActual);
    renderRecords(s.registros);
}

function renderProfile(p) {
    const avatar = document.getElementById('profile-avatar');
    avatar.onerror = () => { avatar.onerror = null; avatar.src = p.avatarFallback || ''; };
    avatar.src = p.avatar || '';
    document.getElementById('profile-name').textContent = p.nombre ?? '—';
    document.getElementById('profile-role').textContent = p.puesto ?? '—';

    const status = document.getElementById('profile-status');
    status.classList.toggle('bg-brand-green', !!p.enLinea);
    status.classList.toggle('bg-slate-300', !p.enLinea);
}

function renderWeek(s, esActual = true) {
    document.getElementById('week-title').textContent = s.titulo ?? 'Semana Flexible';

    const pct = Number(s.porcentaje ?? 0);

    // El total registrado vive en esta línea (no se repite como tarjeta abajo).
    document.getElementById('progress-label').textContent =
        `${decimalAHoras(s.horasRegistradas)} de ${decimalAHoras(s.horasEsperadas)}`;

    const bar = document.getElementById('progress-bar');

    // Semana pasada (no la actual) que no llegó al mínimo de horas: mismo umbral
    // que los fuegos artificiales. Se calcula antes de fijar el color porque en
    // ese caso la barra siempre se pinta en rojo, sin importar el porcentaje.
    const noCubrioMinimo = !esActual && isFinite(pct) && pct < 99.95;

    // Color según el porcentaje alcanzado (barra y porcentaje comparten color):
    //   < 50%  -> rojo   | 51%–75% -> amarillo | >= 76% -> verde
    const barBg   = noCubrioMinimo ? 'bg-red-500'   : pct < 50 ? 'bg-red-500'   : pct <= 75 ? 'bg-yellow-400' : 'bg-green-500';
    const barText = noCubrioMinimo ? 'text-red-500' : pct < 50 ? 'text-red-500' : pct <= 75 ? 'text-yellow-500' : 'text-green-500';

    const pctEl = document.getElementById('progress-pct');
    pctEl.textContent = pct.toFixed(1) + '%';
    // Mismas clases que en index.html (el color es lo único que cambia aquí).
    pctEl.className = `shrink-0 text-2xl sm:text-3xl font-semibold tabular-nums leading-none ${barText}`;

    bar.classList.remove('bg-brand-green', 'bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bar-complete');
    bar.classList.add(barBg);

    bar.style.width = '0%';
    requestAnimationFrame(() => { bar.style.width = Math.min(pct, 100) + '%'; });

    // Fuegos artificiales a partir del 100% (horas registradas >= esperadas).
    // Se usa 99.95 porque el porcentaje se muestra redondeado a un decimal: así,
    // todo lo que la tarjeta anuncia como "100.0%" lanza el efecto.
    // La animación dura 5 segundos y luego se detiene sola.
    if (isFinite(pct) && pct >= 99.95) {
        bar.classList.add('bar-complete');
        launchFireworks(5000);
        stopRain();
    } else if (noCubrioMinimo) {
        stopFireworks();
        launchRain(3500);   // llovizna breve sobre la tarjeta: contraparte de los fuegos
    } else {
        stopFireworks();
        stopRain();
    }

    // Aviso de mínimo no cubierto, arriba a la derecha de la tarjeta.
    const warningBadge = document.getElementById('week-warning-badge');
    if (warningBadge) {
        warningBadge.classList.toggle('hidden', !noCubrioMinimo);
        if (noCubrioMinimo) {
            // Reinicia la animación cada vez que se muestra (p.ej. al cambiar de semana).
            warningBadge.classList.remove('badge-min-hours');
            void warningBadge.offsetWidth;
            warningBadge.classList.add('badge-min-hours');
        }
    }

    const st   = s.stats || {};
    const dif  = diferenciaHoras(s.diferencia);
    const neutro = 'text-slate-800 dark:text-slate-100';
    // Primera fila: todo lo relacionado con horas. Segunda fila: incidencias.
    const cards = [
        { label: 'Horas Esperadas',     value: st.horasEsperadas,     accent: neutro, title: 'Jornada completa de la Semana Flexible (100%)' },
        { label: 'Horas Reportadas',    value: st.horasReportadas,    accent: neutro, title: 'Horas trabajadas que reporta el servicio (tieTrabajado)' },
        { label: 'Horas Vacaciones',    value: st.horasVacaciones,    accent: neutro },
        // Móvil: al final, a todo el ancho y separada por una línea (order-last evita
        // que quede un hueco a media rejilla). sm+: última columna completa, centrada.
        { label: dif.label,             value: dif.value,             accent: dif.accent, title: dif.title,
          cls: 'flex flex-col items-center justify-center text-center border-slate-100 dark:border-slate-700 ' +
               'order-last col-span-2 border-t pt-4 ' +
               'sm:order-none sm:col-span-1 sm:row-span-2 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4',
          valueCls: 'text-2xl sm:text-3xl' },
        { label: 'Faltas',              value: st.faltas,             accent: neutro },
        { label: 'Retardos',            value: st.retardos,           accent: neutro },
        { label: 'Salidas Anticipadas', value: st.salidasAnticipadas, accent: neutro }
    ];
    document.getElementById('stats-grid').innerHTML = cards.map(c => `
        <div class="${c.cls ?? ''}"${c.title ? ` title="${c.title}"` : ''}>
            <p class="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">${c.label}</p>
            <p class="mt-0.5 ${c.valueCls ?? 'text-lg'} font-semibold ${c.accent} tabular-nums">${c.value ?? '—'}</p>
        </div>
    `).join('');
}

/* Diferencia entre las horas trabajadas y las que se debían trabajar esa semana.
   Verde cuando sobran horas, ámbar cuando faltan y neutro cuando coinciden
   (tolerancia de 1 minuto para no acusar redondeos).
   Cuando quedan horas pendientes se muestran las que faltan para alcanzar las
   esperadas (en positivo), no la resta en negativo. */
function diferenciaHoras(d) {
    const neutro = 'text-slate-800 dark:text-slate-100';
    if (!d) return { label: 'Diferencia', value: '—', accent: neutro };

    const esperadas  = toNum(d.esperadas);
    const delta      = toNum(d.registradas) - esperadas;
    const tolerancia = 1 / 60;   // 1 minuto en horas
    const title      = 'Horas reportadas menos horas esperadas';

    if (delta > tolerancia) return { label: 'Diferencia (a favor)', value: '+' + decimalAHoras(delta), accent: 'text-green-500', title };
    if (delta < -tolerancia) {
        const faltan = -delta;
        return {
            label: 'Diferencia (pendiente)',
            value: decimalAHoras(faltan),
            accent: 'text-amber-500',
            title: `Faltan ${decimalAHoras(faltan)} para alcanzar las ${decimalAHoras(esperadas)} esperadas`
        };
    }
    return { label: 'Diferencia', value: decimalAHoras(0), accent: neutro, title };
}

/* Ícono de Home Office. Se muestra solo en los días cuyo nombre coincide con
   'fechaHomeOffice' del webservice (ver mapSemana en api.js). */
function homeOfficeIcon(activo) {
    if (!activo) return '';
    return `<img src="img/Homeoffice.png" alt="Home office" title="Home office"
                 class="inline-block w-8 h-8 align-middle object-contain">`;
}

/* Ícono de Vacaciones. Se muestra en los días cuya fecha coincide con alguna
   del arreglo 'vacaciones' del webservice (ver vacacionesDias en utils.js). */
function vacacionIcon(activo) {
    if (!activo) return '';
    return `<span class="inline-flex items-center justify-center w-8 h-8 text-xl align-middle"
                  role="img" aria-label="Vacaciones" title="Vacaciones">🏝️</span>`;
}

/* Un día es Home Office o Vacaciones, nunca ambos; de haber los dos (dato
   inconsistente del servicio) se prioriza Vacaciones por ser la ausencia. */
function estadoIcon(r) {
    return r.vacacion ? vacacionIcon(true) : homeOfficeIcon(r.homeOffice);
}

// Jornada fija que se muestra como "Total" en un día de vacaciones (no viene
// checada real: el día no se trabaja, así que no hay forma de calcularlo).
const TOTAL_DIA_VACACION = '9 h 30 m';

function renderRecords(records = []) {
    document.getElementById('records-body').innerHTML = records.map(r => `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td class="py-4 px-3 font-medium text-slate-700 dark:text-slate-200">${r.dia}</td>
            <td class="py-4 px-3 text-center text-slate-500 dark:text-slate-400 tabular-nums">${r.vacacion ? 'VACACIONES' : (r.entrada ?? '—')}</td>
            <td class="py-4 px-3 text-center text-slate-500 dark:text-slate-400 tabular-nums">${r.vacacion ? 'VACACIONES' : (r.salida ?? '—')}</td>
            <td class="py-4 px-3 text-right whitespace-nowrap">
                <span class="inline-block bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md tabular-nums align-middle">${r.vacacion ? TOTAL_DIA_VACACION : (r.total ?? '0 h 0 m')}</span>
            </td>
            <td class="py-4 px-3 text-center w-12">${estadoIcon(r)}</td>
        </tr>
    `).join('');

    document.getElementById('records-cards').innerHTML = records.map(r => `
        <div class="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800 dark:text-slate-100">${r.dia}</span>
                <span class="flex items-center gap-1.5">
                    ${estadoIcon(r)}
                    <span class="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1 rounded-md tabular-nums">${r.vacacion ? TOTAL_DIA_VACACION : (r.total ?? '0 h 0 m')}</span>
                </span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                    <p class="text-slate-400 dark:text-slate-500 uppercase tracking-wide">Entrada</p>
                    <p class="mt-0.5 text-slate-600 dark:text-slate-300 tabular-nums">${r.vacacion ? 'Vacaciones' : (r.entrada ?? '—')}</p>
                </div>
                <div>
                    <p class="text-slate-400 dark:text-slate-500 uppercase tracking-wide">Salida</p>
                    <p class="mt-0.5 text-slate-600 dark:text-slate-300 tabular-nums">${r.vacacion ? 'Vacaciones' : (r.salida ?? '—')}</p>
                </div>
            </div>
        </div>
    `).join('');
}
