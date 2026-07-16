/* =========================================================
   TEMA (oscuro / claro) con persistencia en localStorage
   ========================================================= */
const baseUrl = "http://servicios.litoprocess.com/perfil/api/perfil.php";
const baseUrlFoto = "https://servicios.litoprocess.com/colaboradores/api/foto/";

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
    if (json.error || !json.perfil) {
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

/* ---------- Adaptador: respuesta plana de la API -> formato de la plantilla ---------- */
function mapApiResponse(p, id) {
    const esperadas   = toNum(p.tieTrabajar);
    const registradas = toNum(p.tieTrabajado);
    const vacaciones  = toNum(p.hrsVac);
    const porcentaje  = esperadas > 0 ? (registradas / esperadas) * 100 : 0;

    const dias = [
        { dia: 'Lunes',     suf: 'LUN' },
        { dia: 'Martes',    suf: 'MAR' },
        { dia: 'Miércoles', suf: 'MIE' },
        { dia: 'Jueves',    suf: 'JUE' },
        { dia: 'Viernes',   suf: 'VIE' },
        { dia: 'Sábado',    suf: 'SAB' },
        { dia: 'Domingo',   suf: 'DOM' }
    ];

    const registros = dias.map(({ dia, suf }) => {
        const entrada = p['E-' + suf] || null;
        const salida  = p['S-' + suf] || null;
        return { dia, entrada, salida, total: diffHoras(entrada, salida) };
    });

    return {
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
                horasEsperadas:     decimalAHoras(esperadas),
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

async function loadData() {
    hide('error-banner');
    hide('not-found');
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
        const data = await fetchData({ id });
        renderProfile(data.perfil);
        renderWeek(data.semana);
        renderRecords(data.registros);
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

    // Color de la barra según el porcentaje alcanzado:
    //   < 50%  -> rojo   | 51%–75% -> amarillo | >= 76% -> verde
    bar.classList.remove('bg-brand-green', 'bg-red-500', 'bg-yellow-400', 'bg-green-500', 'bar-complete');
    if (pct < 50)       bar.classList.add('bg-red-500');
    else if (pct <= 75) bar.classList.add('bg-yellow-400');
    else                bar.classList.add('bg-green-500');

    bar.style.width = '0%';
    requestAnimationFrame(() => { bar.style.width = Math.min(pct, 100) + '%'; });

    // Al superar el 100% -> destello en la barra + fuegos artificiales
    if (pct > 100) {
        bar.classList.add('bar-complete');
        launchFireworks();
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
        { label: 'Total Registradas',   value: st.totalRegistradas,   accent: 'text-brand-green' }
    ];
    document.getElementById('stats-grid').innerHTML = cards.map(c => `
        <div>
            <p class="text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">${c.label}</p>
            <p class="mt-1 text-lg font-semibold ${c.accent} tabular-nums">${c.value ?? '—'}</p>
        </div>
    `).join('');
}

function renderRecords(records = []) {
    document.getElementById('records-body').innerHTML = records.map(r => `
        <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td class="py-4 px-3 font-medium text-slate-700 dark:text-slate-200">${r.dia}</td>
            <td class="py-4 px-3 text-center text-slate-500 dark:text-slate-400 tabular-nums">${r.entrada ?? '—'}</td>
            <td class="py-4 px-3 text-center text-slate-500 dark:text-slate-400 tabular-nums">${r.salida ?? '—'}</td>
            <td class="py-4 px-3 text-right">
                <span class="inline-block bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-md tabular-nums">${r.total ?? '0 h 0 m'}</span>
            </td>
        </tr>
    `).join('');

    document.getElementById('records-cards').innerHTML = records.map(r => `
        <div class="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
            <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-800 dark:text-slate-100">${r.dia}</span>
                <span class="bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-1 rounded-md tabular-nums">${r.total ?? '0 h 0 m'}</span>
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
    let nextLaunchAt = 0, listenerAdded = false;
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

    function start() {
        if (running) return;
        canvas = document.getElementById('fireworks-canvas');
        ctx = canvas.getContext('2d');
        canvas.classList.remove('hidden');   // visible antes de medir su tamaño
        resize();
        if (!listenerAdded) { window.addEventListener('resize', resize); listenerAdded = true; }
        running = true;
        nextLaunchAt = 0;   // el primer frame dispara de inmediato
        if (!rafId) rafId = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        // Deja que los cohetes y partículas restantes se desvanezcan solos.
    }

    return { start, stop };
})();

function launchFireworks() { Fireworks.start(); }
function stopFireworks()   { Fireworks.stop(); }

/* Inicio */
document.addEventListener('DOMContentLoaded', loadData);
