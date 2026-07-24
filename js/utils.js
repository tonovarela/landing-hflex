/* =========================================================
   UTILIDADES
   Helpers puros (sin estado): formato de números/horas, parseo de fechas del
   servicio, normalización de días y atajos de DOM.
   ========================================================= */
export function fmtNum(n) { return (n === null || n === undefined) ? '—' : Number(n).toFixed(2); }
export function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* Convierte un valor a número seguro (la API a veces manda ".0" o strings). */
export function toNum(v) { const n = Number(v); return isFinite(n) ? n : 0; }

/* Horas decimales -> "H h M m"  (p.ej. 19.116 -> "19 h 7 m"). */
export function decimalAHoras(dec) {
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

/* Normaliza un nombre de día para comparar sin importar mayúsculas ni acentos
   ("Miércoles" -> "miercoles"). */
export function normDia(str) {
    return String(str ?? '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Normaliza 'fechaHomeOffice' en un Set de nombres de día. El servicio ahora manda
   el/los NOMBRE(S) de día de la semana (p.ej. "Viernes"), no una fecha. Tolera una
   sola cadena, un arreglo o varios días separados por coma (puede haber más de un
   día de Home Office por semana). */
export function homeOfficeDias(p) {
    const set = new Set();
    let val = p.fechaHomeOffice;
    if (val == null) return set;
    if (!Array.isArray(val)) val = String(val).split(',');
    for (const v of val) {
        const k = normDia(v);
        if (k) set.add(k);
    }
    return set;
}

/* Diferencia entre entrada y salida -> "H h M m". Devuelve "0 h 0 m" si falta alguna. */
export function diffHoras(entrada, salida) {
    const a = parseFechaHora(entrada);
    const b = parseFechaHora(salida);
    if (a == null || b == null) return '0 h 0 m';
    let secs = b - a;
    if (!isFinite(secs) || secs < 0) return '0 h 0 m';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    return `${h} h ${m} m`;
}

/* ¿El departamento corresponde a Sistemas / TI / Desarrollo? */
export function esDepartamentoSistemas(dep) {
    return /sistem|tecnolog|desarrollo|software|\bti\b|\bit\b/i.test(dep || '');
}

/* Atajos de visibilidad (clase 'hidden' de Tailwind). */
export function show(id) { document.getElementById(id).classList.remove('hidden'); }
export function hide(id) { document.getElementById(id).classList.add('hidden'); }
export function showError() { hide('dashboard'); show('error-banner'); }
