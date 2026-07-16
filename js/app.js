/* =========================================================
   TEMA (oscuro / claro) con persistencia en localStorage
   ========================================================= */
const baseUrl = "https://servicios.litoprocess.com/perfil/api/perfil.php";
const baseUrlFoto = "https://servicios.litoprocess.com/colaboradores/api/foto/";

/* Jornada completa de la Semana Flexible: 47.5 horas equivalen al 100%.
   El porcentaje, la barra de avance y la etiqueta "X de 47.5 horas" se calculan
   contra esta base fija. La tarjeta "Horas Esperadas", en cambio, muestra el valor
   que envía el servicio (tieTrabajar). */
const HORAS_SEMANA_COMPLETA = 47.5;

const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');

function syncThemeLabel() {
    const isDark = document.documentElement.classList.contains('dark');
    themeLabel.textContent = isDark ? 'Claro' : 'Oscuro';
}
syncThemeLabel();

themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    syncThemeLabel();
});

/* =========================================================
   CONFIGURACIÓN DE API   (la API aún no existe: por ahora se usan mocks)
   El id del colaborador se toma del query param  ?id=...  de la URL
   y se envía al servicio.
   ========================================================= */
const API_CONFIG = {
    baseUrl: baseUrl,
    queryParam: 'id',                 // nombre del parámetro en la URL de esta página
    // Sin cabeceras personalizadas: un GET con 'Content-Type' dispara un preflight
    // OPTIONS que la API responde con 400 y el navegador aborta la petición.
    headers: {}
};

function avatarUrl(nombre) {
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(nombre || '') +
           '&background=1e293b&color=fff&size=128';
}

/* Foto oficial del colaborador (servicio de Litoprocess). */
function fotoUrl(idPersonal) {
    return baseUrlFoto + encodeURIComponent(idPersonal);
}

/* =========================================================
   OBTENCIÓN DE DATOS  (API real de Litoprocess)
   Devuelve { error, perfil } con los campos "planos" del servicio.
   Lanza un error con .notFound = true cuando el colaborador no exista.
   ========================================================= */
async function fetchData({ id } = {}) {
    const url = API_CONFIG.baseUrl + '?' + new URLSearchParams({ id }).toString();
    const res = await fetch(url, { headers: API_CONFIG.headers });
    if (res.status === 404) { const e = new Error('Colaborador no encontrado'); e.notFound = true; throw e; }
    if (res.status === 400) {
        const msg = await extraerMensajeError(res);
        const e = new Error(msg); e.badRequest = true; e.mensaje = msg; throw e;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const json = await res.json();
    const sinPerfil = !json.perfil || (Array.isArray(json.perfil) && json.perfil.length === 0);
    if (json.error || sinPerfil) {
        const e = new Error('Colaborador no encontrado'); e.notFound = true; throw e;
    }
    return mapApiResponse(json.perfil, id);
}

/* Extrae el mensaje de error de una respuesta (JSON { error/mensaje } o texto plano). */
async function extraerMensajeError(res) {
    try {
        const json = await res.clone().json();
        const err = typeof json.error === 'string' ? json.error : null;
        return json.mensaje || json.message || err || 'La solicitud no es válida.';
    } catch {
        const txt = (await res.text().catch(() => '')).trim();
        return txt || 'La solicitud no es válida.';
    }
}

/* ---------- Adaptador: respuesta de la API -> formato de la plantilla ----------
   El servicio ahora devuelve 'perfil' como un ARREGLO con una entrada por semana
   (cada una con su NumSemana, checadas de entrada/salida, tieTrabajar, etc.).
   Normalizamos a un arreglo, mapeamos cada semana y las ordenamos de la más reciente a la más
   antigua (NumSemana descendente). Devolvemos los datos de la persona (iguales en
   todas las semanas) una sola vez, junto con el arreglo de semanas. */
function mapApiResponse(perfilRaw, id) {
    const arr = (Array.isArray(perfilRaw) ? perfilRaw : [perfilRaw]).filter(Boolean);
    const semanas = arr.map(p => mapSemana(p, id));
    // Más reciente primero. Si NumSemana no es numérico, preserva el orden original.
    semanas.sort((a, b) => b.numSemana - a.numSemana);
    return {
        perfil: semanas[0] ? semanas[0].perfil : null,
        semanas
    };
}

/* Mapea UNA semana (objeto plano del servicio) al formato { perfil, semana, registros }. */
function mapSemana(p, id) {
    const esperadas          = HORAS_SEMANA_COMPLETA;      // 47.5 h = 100% (base fija del porcentaje/barra)
    const esperadasServicio  = toNum(p.tieTrabajar);       // "Horas Esperadas" tal cual del webservice
    const registradas        = toNum(p.tieTrabajado);
    const vacaciones         = toNum(p.hrsVac);
    const porcentaje         = esperadas > 0 ? (registradas / esperadas) * 100 : 0;

    const dias = [
        { dia: 'Lunes',     suf: 'LUN' },
        { dia: 'Martes',    suf: 'MAR' },
        { dia: 'Miércoles', suf: 'MIE' },
        { dia: 'Jueves',    suf: 'JUE' },
        { dia: 'Viernes',   suf: 'VIE' },
        { dia: 'Sábado',    suf: 'SAB' },
        { dia: 'Domingo',   suf: 'DOM' }
    ];

    // Home office: el servicio envía la(s) fecha(s) en 'fechaHomeOffice'. Reconstruimos
    // el calendario de la semana para ubicar el día correcto aunque ese día no tenga
    // checada (entrada/salida en null).
    const hoDias      = homeOfficeDias(p);
    const semanaKeys  = fechasSemana(p, dias);

    const registros = dias.map(({ dia, suf }, i) => {
        const entrada = p['E-' + suf] || null;
        const salida  = p['S-' + suf] || null;
        const diaKey  = semanaKeys[i] || fechaKey(entrada) || fechaKey(salida);
        const homeOffice = diaKey != null && hoDias.has(diaKey);
        return { dia, entrada, salida, total: diffHoras(entrada, salida), homeOffice };
    });

    return {
        numSemana: toNum(p.NumSemana),
        perfil: {
            nombre: p.NombreEmpleado,
            puesto: p.Departamento,
            avatar: fotoUrl(p.id_personal ?? id),
            avatarFallback: avatarUrl(p.NombreEmpleado),
            enLinea: true,
            vacaciones: vacaciones,
            faltas: 0
        },
        semana: {
            titulo: `Semana Flexible ${p.NumSemana ?? ''}`.trim(),
            porcentaje,
            horasRegistradas: registradas.toFixed(2),
            horasEsperadas: esperadas.toFixed(2),
            stats: {
                horasEsperadas:     decimalAHoras(esperadasServicio),
                horasVacaciones:    decimalAHoras(vacaciones),
                faltas:             0,
                retardos:           p.numRetardos ?? 0,
                salidasAnticipadas: p.numSalAnt ?? 0,
                totalRegistradas:   decimalAHoras(registradas)
            }
        },
        registros
    };
}

/* =========================================================
   ESTADO Y FLUJO
   ========================================================= */
function getColaboradorId() {
    return new URLSearchParams(window.location.search).get(API_CONFIG.queryParam);
}

/* =========================================================
   MOCK del servicio (solo para pruebas de UI)
   Genera una respuesta "plana" como la de la API para un
   porcentaje dado. Uso: index.html?mock=40  (rojo),
   ?mock=60 (amarillo), ?mock=85 (verde), ?mock=105 (fuegos).
   ========================================================= */
function buildMockSemana(pct, { numSemana, lunes, hrsVac, homeOffice, tieTrabajar }) {
    // Porcentaje = tieTrabajado / 47.5 * 100. Para reproducir el pct pedido en
    // ?mock=, fijamos registradas = 47.5 * pct / 100.
    const porcentaje = isFinite(pct) ? pct : 85;
    const registradas = +(HORAS_SEMANA_COMPLETA * porcentaje / 100).toFixed(2);

    // Fecha DD/MM/YYYY del día i (0=lunes) a partir del lunes de la semana.
    const fecha = (i) => {
        const d = new Date(lunes);
        d.setDate(d.getDate() + i);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        return `${dd}/${mm}/${d.getFullYear()}`;
    };

    return {
        NombreEmpleado: 'COLABORADOR DEMO',
        Departamento: `PRUEBA UI · ${porcentaje}%`,
        id_personal: 'mock',
        NumSemana: numSemana,
        tieTrabajar: tieTrabajar,   // alimenta la tarjeta "Horas Esperadas" (independiente del 47.5)
        tieTrabajado: registradas,
        hrsVac: hrsVac,
        numRetardos: 1,
        numSalAnt: 0,
        // Registros en el formato de fecha del servicio (DD/MM/YYYY HH:MM:SS).
        'E-LUN': `${fecha(0)} 08:54:00`, 'S-LUN': `${fecha(0)} 18:38:00`,
        'E-MAR': `${fecha(1)} 08:52:00`, 'S-MAR': `${fecha(1)} 19:03:00`,
        'E-MIE': `${fecha(2)} 09:00:00`, 'S-MIE': `${fecha(2)} 18:45:00`,
        'E-JUE': `${fecha(3)} 09:02:00`, 'S-JUE': `${fecha(3)} 18:10:00`,
        'E-VIE': `${fecha(4)} 08:46:00`, 'S-VIE': `${fecha(4)} 17:37:00`,
        'E-SAB': null, 'S-SAB': null,
        'E-DOM': null, 'S-DOM': null,
        // Home office: el servicio manda la(s) fecha(s) en 'fechaHomeOffice'.
        fechaHomeOffice: homeOffice
    };
}

/* Genera varias semanas de prueba (arreglo, como la API real). La semana más
   reciente usa el porcentaje indicado en ?mock=; las anteriores traen datos fijos
   para poder probar el selector. */
function buildMockPerfiles(pct) {
    return [
        buildMockSemana(pct, { numSemana: 28, lunes: new Date(2026, 6, 6),
            hrsVac: 8, tieTrabajar: 47.5, homeOffice: ['07/07/2026', '09/07/2026'] }),
        buildMockSemana(72,  { numSemana: 27, lunes: new Date(2026, 5, 29),
            hrsVac: 0, tieTrabajar: 47.5, homeOffice: ['30/06/2026'] }),
        buildMockSemana(45,  { numSemana: 26, lunes: new Date(2026, 5, 22),
            hrsVac: 16, tieTrabajar: 31.5, homeOffice: [] })   // semana con feriado: esperadas < 47.5
    ];
}

async function loadData() {
    hide('error-banner');
    hide('not-found');

    // ---- Modo MOCK: ?mock=<porcentaje> (p.ej. ?mock=40) para probar la UI sin el servicio ----
    const mockPct = new URLSearchParams(window.location.search).get('mock');
    if (mockPct !== null) {
        show('dashboard');
        renderDashboard(mapApiResponse(buildMockPerfiles(Number(mockPct)), 'mock'));
        return;
    }

    const id = getColaboradorId();

    // Sin id en la URL -> mostramos la sección de "no encontrado".
    if (!id) {
        showNotFound(
            'Falta el identificador',
            'No se proporcionó el id del colaborador en la URL.'
        );
        return;
    }

    show('dashboard');
    try {
        renderDashboard(await fetchData({ id }));
    } catch (err) {
        console.error('Error al cargar datos:', err);
        if (err.notFound) {
            showNotFound(
                'Colaborador no encontrado',
                `No existe un colaborador con el identificador "${id}".`
            );
        } else if (err.badRequest) {
            showNotFound(
                'Solicitud no válida',
                err.mensaje || 'La solicitud enviada al servidor no es válida.'
            );
        } else {
            showError();
        }
    }
}

function showNotFound(titulo, mensaje) {
    hide('dashboard');
    hide('error-banner');
    document.getElementById('not-found-title').textContent = titulo;
    document.getElementById('not-found-msg').textContent = mensaje;
    show('not-found');
}

/* =========================================================
   RENDERIZADO
   ========================================================= */

/* Pinta todo el tablero a partir del resultado de mapApiResponse:
   perfil (fijo) + selector de semanas + la semana más reciente ya seleccionada. */
function renderDashboard(data) {
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
    document.getElementById('progress-pct').textContent = pct.toFixed(1) + '%';
    document.getElementById('progress-label').textContent =
        `${s.horasRegistradas ?? '—'} de ${s.horasEsperadas ?? '—'} horas`;

    const bar = document.getElementById('progress-bar');

    // Color según el porcentaje alcanzado (barra y "Total Registradas" comparten color):
    //   < 50%  -> rojo   | 51%–75% -> amarillo | >= 76% -> verde
    const barBg   = pct < 50 ? 'bg-red-500'   : pct <= 75 ? 'bg-yellow-400' : 'bg-green-500';
    const barText = pct < 50 ? 'text-red-500' : pct <= 75 ? 'text-yellow-500' : 'text-green-500';

    bar.classList.remove('bg-brand-green', 'bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bar-complete');
    bar.classList.add(barBg);

    bar.style.width = '0%';
    requestAnimationFrame(() => { bar.style.width = Math.min(pct, 100) + '%'; });

    // Fuegos artificiales cuando las horas registradas superan las esperadas.
    // La animación dura 5 segundos y luego se detiene sola.
    const registradas = Number(s.horasRegistradas);
    const esperadas   = Number(s.horasEsperadas);
    if (isFinite(registradas) && isFinite(esperadas) && registradas > esperadas) {
        bar.classList.add('bar-complete');
        launchFireworks(5000);
    } else {
        stopFireworks();
    }

    const st = s.stats || {};
    const cards = [
        { label: 'Horas Esperadas',     value: st.horasEsperadas,     accent: 'text-slate-800 dark:text-slate-100' },
        { label: 'Horas Vacaciones',    value: st.horasVacaciones,    accent: 'text-slate-800 dark:text-slate-100' },
        { label: 'Faltas',              value: st.faltas,             accent: 'text-slate-800 dark:text-slate-100' },
        { label: 'Retardos',            value: st.retardos,           accent: 'text-slate-800 dark:text-slate-100' },
        { label: 'Salidas Anticipadas', value: st.salidasAnticipadas, accent: 'text-slate-800 dark:text-slate-100' },
        { label: 'Total Registradas',   value: st.totalRegistradas,   accent: barText }
    ];
    document.getElementById('stats-grid').innerHTML = cards.map(c => `
        <div>
            <p class="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">${c.label}</p>
            <p class="mt-1 text-lg font-semibold ${c.accent} tabular-nums">${c.value ?? '—'}</p>
        </div>
    `).join('');
}

/* Ícono de Home Office. Se muestra solo en los días cuya fecha coincide con
   'fechaHomeOffice' del webservice (ver mapApiResponse). */
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

/* =========================================================
   UTILIDADES
   ========================================================= */
function fmtNum(n) { return (n === null || n === undefined) ? '—' : Number(n).toFixed(2); }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* Convierte un valor a número seguro (la API a veces manda ".0" o strings). */
function toNum(v) { const n = Number(v); return isFinite(n) ? n : 0; }

/* Horas decimales -> "H h M m"  (p.ej. 19.116 -> "19 h 7 m"). */
function decimalAHoras(dec) {
    const n = toNum(dec);
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    let h = Math.floor(abs);
    let m = Math.round((abs - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return `${sign}${h} h ${m} m`;
}

/* Convierte una marca de tiempo del servicio a segundos.
   Acepta varios formatos: "HH:MM", "HH:MM:SS", "DD/MM/YYYY HH:MM(:SS)"
   y "YYYY-MM-DD HH:MM(:SS)". Devuelve null si no reconoce la hora. */
function parseFechaHora(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (!str) return null;

    // Parte de hora: HH:MM con segundos opcionales.
    const t = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!t) return null;
    const hh = +t[1], mm = +t[2], ss = t[3] ? +t[3] : 0;

    // Parte de fecha (opcional): DD/MM/YYYY  o  YYYY-MM-DD.
    let y, mo, d;
    const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const ymd = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dmy)       { d = +dmy[1]; mo = +dmy[2]; y = +dmy[3]; }
    else if (ymd)  { y = +ymd[1]; mo = +ymd[2]; d = +ymd[3]; }

    // Con fecha -> segundos epoch (soporta cruces de día). Sin fecha -> segundos del día.
    if (y != null) return Math.floor(new Date(y, mo - 1, d, hh, mm, ss).getTime() / 1000);
    return hh * 3600 + mm * 60 + ss;
}

/* Extrae solo la fecha de una marca del servicio como clave canónica "AÑO-MES-DIA"
   (sin ceros a la izquierda). Acepta "DD/MM/YYYY ...", "YYYY-MM-DD ..." y
   devuelve null si no hay una fecha reconocible. */
function fechaKey(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (!str) return null;
    const dmy = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    const ymd = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    let y, mo, d;
    if (dmy)      { d = +dmy[1]; mo = +dmy[2]; y = +dmy[3]; }
    else if (ymd) { y = +ymd[1]; mo = +ymd[2]; d = +ymd[3]; }
    else return null;
    return `${y}-${mo}-${d}`;
}

/* Convierte una marca del servicio en un Date a medianoche (sin hora). */
function parseFechaDate(str) {
    const k = fechaKey(str);
    if (!k) return null;
    const [y, mo, d] = k.split('-').map(Number);
    return new Date(y, mo - 1, d);
}

/* Normaliza 'fechaHomeOffice' en un Set de claves de fecha. Tolera que el servicio
   mande una sola fecha, un arreglo o varias separadas por coma (el LEFT JOIN puede
   producir más de un día de Home Office por semana). */
function homeOfficeDias(p) {
    const set = new Set();
    let val = p.fechaHomeOffice;
    if (val == null) return set;
    if (!Array.isArray(val)) val = String(val).split(',');
    for (const v of val) {
        const k = fechaKey(v);
        if (k) set.add(k);
    }
    return set;
}

/* Reconstruye la fecha (clave) de cada día de la semana. Toma como referencia el
   primer día con checada (que trae fecha completa) y calcula el resto a partir del
   lunes de esa semana, para poder ubicar el Home Office aunque ese día no tenga
   entrada/salida. Devuelve un arreglo alineado con 'dias' (lunes..domingo). */
function fechasSemana(p, dias) {
    const keys = new Array(dias.length).fill(null);
    let ref = null;
    for (const { suf } of dias) {
        ref = parseFechaDate(p['E-' + suf]) || parseFechaDate(p['S-' + suf]);
        if (ref) break;
    }
    if (!ref) return keys;

    // Lunes de la semana de la fecha de referencia (getDay: 0=domingo).
    const monday = new Date(ref);
    monday.setDate(monday.getDate() - ((ref.getDay() + 6) % 7));
    for (let i = 0; i < dias.length; i++) {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + i);
        keys[i] = `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
    }
    return keys;
}

/* Diferencia entre entrada y salida -> "H h M m". Devuelve "0 h 0 m" si falta alguna. */
function diffHoras(entrada, salida) {
    const a = parseFechaHora(entrada);
    const b = parseFechaHora(salida);
    if (a == null || b == null) return '0 h 0 m';
    let secs = b - a;
    if (!isFinite(secs) || secs < 0) return '0 h 0 m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h} h ${m} m`;
}
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function showError() { hide('dashboard'); show('error-banner'); }

/* =========================================================
   FUEGOS ARTIFICIALES  (se lanzan al superar el 100%)
   Cohetes que despegan desde la tarjeta de Semana Flexible y
   explotan por encima de ella sobre un <canvas>.
   ========================================================= */
const Fireworks = (() => {
    let canvas, ctx, particles = [], rockets = [], rafId = null, running = false;
    let nextLaunchAt = 0, listenerAdded = false, stopTimer = null;
    const COLORS = ['#f43f5e', '#facc15', '#22c55e', '#38bdf8', '#a855f7', '#fb923c', '#ec4899'];

    // Borde inferior de la tarjeta dentro del lienzo (desde ahí despegan los cohetes).
    const CARD_BOTTOM_OFFSET = 40;   // el lienzo sobresale 40px bajo la tarjeta
    const SIDE_INSET = 80;           // margen lateral del lienzo respecto a la tarjeta

    // Topes de seguridad para que nunca se acumulen demasiadas animaciones.
    const MAX_ROCKETS = 10;
    const MAX_PARTICLES = 800;

    function resize() {
        // Se ajusta al tamaño real de la tarjeta que lo contiene.
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }

    /* Lanza un cohete desde el borde inferior de la tarjeta hacia arriba. */
    function launchRocket() {
        const startY = canvas.height - CARD_BOTTOM_OFFSET;        // borde inferior de la tarjeta
        const startX = SIDE_INSET + Math.random() * (canvas.width - SIDE_INSET * 2);
        const targetY = 30 + Math.random() * 170;                 // altura de explosión (arriba de la tarjeta)
        rockets.push({
            x: startX,
            y: startY,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -(8 + Math.random() * 3.5),
            targetY,
            color: COLORS[(Math.random() * COLORS.length) | 0]
        });
    }

    /* Avanza los cohetes: suben dejando estela y explotan al llegar a su altura. */
    function updateRockets() {
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            r.x += r.vx;
            r.y += r.vy;
            r.vy += 0.12;   // desaceleración por gravedad

            // Estela: chispa tenue que queda atrás.
            particles.push({
                x: r.x, y: r.y,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                life: 0.6, decay: 0.05,
                color: r.color, size: 1.2
            });

            // Explota al alcanzar su altura objetivo o al perder impulso.
            if (r.y <= r.targetY || r.vy >= 0) {
                burst(r.x, r.y, r.color);
                rockets.splice(i, 1);
            }
        }
    }

    function burst(x, y, forcedColor) {
        const color = forcedColor || COLORS[(Math.random() * COLORS.length) | 0];
        const n = 50 + ((Math.random() * 30) | 0);
        for (let i = 0; i < n; i++) {
            const angle = (Math.PI * 2 * i) / n;
            const speed = 2.5 + Math.random() * 5.5;   // mayor expansión
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.008 + Math.random() * 0.01,   // viven más -> llegan más lejos
                color,
                size: 1.4 + Math.random() * 2.2
            });
        }
    }

    /* Lanza cohetes según el reloj de animación (no con setTimeout), de modo que
       la cadencia se pausa junto con requestAnimationFrame cuando la pestaña
       pierde el foco y no se acumula un backlog que estalle todo de golpe. */
    function maybeLaunch(ts) {
        if (!running || ts < nextLaunchAt) return;
        if (rockets.length < MAX_ROCKETS) {
            launchRocket();
            if (Math.random() < 0.4 && rockets.length < MAX_ROCKETS) launchRocket();
        }
        // Siempre relativo a "ahora": tras una pausa larga no dispara un backlog.
        nextLaunchAt = ts + 600 + Math.random() * 700;
    }

    function frame(ts) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        maybeLaunch(ts);
        updateRockets();

        // Tope de partículas: descarta las más antiguas si se excede.
        if (particles.length > MAX_PARTICLES) {
            particles.splice(0, particles.length - MAX_PARTICLES);
        }

        // Dibuja los cohetes en ascenso.
        for (const r of rockets) {
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = r.color;
            ctx.fill();
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.04;          // gravedad
            p.vx *= 0.99;
            p.vy *= 0.99;
            p.life -= p.decay;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            ctx.globalAlpha = Math.max(p.life, 0);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (running || particles.length || rockets.length) {
            rafId = requestAnimationFrame(frame);
        } else {
            rafId = null;
            canvas.classList.add('hidden');
        }
    }

    function start(durationMs) {
        if (running) return;
        canvas = document.getElementById('fireworks-canvas');
        ctx = canvas.getContext('2d');
        canvas.classList.remove('hidden');   // visible antes de medir su tamaño
        resize();
        if (!listenerAdded) { window.addEventListener('resize', resize); listenerAdded = true; }
        running = true;
        nextLaunchAt = 0;   // el primer frame dispara de inmediato
        if (!rafId) rafId = requestAnimationFrame(frame);

        // Detiene el lanzamiento tras la duración indicada; las partículas
        // restantes se desvanecen solas después.
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        if (durationMs > 0) stopTimer = setTimeout(stop, durationMs);
    }

    function stop() {
        running = false;
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        // Deja que los cohetes y partículas restantes se desvanezcan solos.
    }

    return { start, stop };
})();

function launchFireworks(durationMs) { Fireworks.start(durationMs); }
function stopFireworks()             { Fireworks.stop(); }

/* Inicio */
document.addEventListener('DOMContentLoaded', loadData);
