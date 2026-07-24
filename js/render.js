/* =========================================================
   RENDERIZADO
   Pinta el tablero (perfil, selector de semanas, resumen y registros)
   a partir del resultado ya mapeado de la API.
   ========================================================= */

/* Pinta todo el tablero a partir del resultado de mapApiResponse:
   perfil (fijo) + selector de semanas + la semana más reciente ya seleccionada. */
function renderDashboard(data) {
    applyDepartmentTheme(data.perfil);
    renderProfile(data.perfil);
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
        const s = semanas[Number(sel.value)];
        if (s) renderSemana(s);
    };
}

/* Pinta el resumen y los registros de una semana concreta. */
function renderSemana(s) {
    if (!s) return;
    renderWeek(s.semana);
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

function renderWeek(s) {
    document.getElementById('week-title').textContent = s.titulo ?? 'Semana Flexible';

    const pct = Number(s.porcentaje ?? 0);

    // El total registrado vive en esta línea (no se repite como tarjeta abajo).
    document.getElementById('progress-label').textContent =
        `${decimalAHoras(s.horasRegistradas)} de ${decimalAHoras(s.horasEsperadas)}`;

    const bar = document.getElementById('progress-bar');

    // Color según el porcentaje alcanzado (barra y porcentaje comparten color):
    //   < 50%  -> rojo   | 51%–75% -> amarillo | >= 76% -> verde
    const barBg   = pct < 50 ? 'bg-red-500'   : pct <= 75 ? 'bg-yellow-400' : 'bg-green-500';
    const barText = pct < 50 ? 'text-red-500' : pct <= 75 ? 'text-yellow-500' : 'text-green-500';

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
    } else {
        stopFireworks();
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
   (tolerancia de 1 minuto para no acusar redondeos). */
function diferenciaHoras(d) {
    const neutro = 'text-slate-800 dark:text-slate-100';
    if (!d) return { label: 'Diferencia', value: '—', accent: neutro };

    const delta      = toNum(d.registradas) - toNum(d.esperadas);
    const tolerancia = 1 / 60;   // 1 minuto en horas
    const title      = 'Horas reportadas menos horas esperadas';

    if (delta >  tolerancia) return { label: 'Diferencia (a favor)',   value: '+' + decimalAHoras(delta), accent: 'text-green-500', title };
    if (delta < -tolerancia) return { label: 'Diferencia (pendiente)', value: decimalAHoras(delta),       accent: 'text-amber-500', title };
    return { label: 'Diferencia', value: decimalAHoras(0), accent: neutro, title };
}

/* Ícono de Home Office. Se muestra solo en los días cuyo nombre coincide con
   'fechaHomeOffice' del webservice (ver mapSemana en api.js). */
function homeOfficeIcon(activo) {
    if (!activo) return '';
    return `<img src="img/Homeoffice.png" alt="Home office" title="Home office"
                 class="inline-block w-8 h-8 align-middle object-contain">`;
}

function renderRecords(records = []) {
    document.getElementById('records-body').innerHTML = records.map(r => `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td class="py-4 px-3 font-medium text-slate-700 dark:text-slate-200">${r.dia}</td>
            <td class="py-4 px-3 text-center text-slate-500 dark:text-slate-400 tabular-nums">${r.entrada ?? '—'}</td>
            <td class="py-4 px-3 text-center text-slate-500 dark:text-slate-400 tabular-nums">${r.salida ?? '—'}</td>
            <td class="py-4 px-3 text-right whitespace-nowrap">
                <span class="inline-block bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md tabular-nums align-middle">${r.total ?? '0 h 0 m'}</span>
            </td>
            <td class="py-4 px-3 text-center w-12">${homeOfficeIcon(r.homeOffice)}</td>
        </tr>
    `).join('');

    document.getElementById('records-cards').innerHTML = records.map(r => `
        <div class="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800 dark:text-slate-100">${r.dia}</span>
                <span class="flex items-center gap-1.5">
                    ${homeOfficeIcon(r.homeOffice)}
                    <span class="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1 rounded-md tabular-nums">${r.total ?? '0 h 0 m'}</span>
                </span>
            </div>
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                    <p class="text-slate-400 dark:text-slate-500 uppercase tracking-wide">Entrada</p>
                    <p class="mt-0.5 text-slate-600 dark:text-slate-300 tabular-nums">${r.entrada ?? '—'}</p>
                </div>
                <div>
                    <p class="text-slate-400 dark:text-slate-500 uppercase tracking-wide">Salida</p>
                    <p class="mt-0.5 text-slate-600 dark:text-slate-300 tabular-nums">${r.salida ?? '—'}</p>
                </div>
            </div>
        </div>
    `).join('');
}
