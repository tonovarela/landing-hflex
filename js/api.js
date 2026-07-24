/* =========================================================
   OBTENCIÓN DE DATOS  (API real de Litoprocess)
   Lectura de parámetros de la URL, llamada al servicio y adaptación de la
   respuesta "plana" al formato que consume el renderizado.
   ========================================================= */

function avatarUrl(nombre) {
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(nombre || '') +
           '&background=1e293b&color=fff&size=128';
}

/* Foto oficial del colaborador (servicio de Litoprocess). */
function fotoUrl(idPersonal) {
    return baseUrlFoto + encodeURIComponent(idPersonal);
}

/* Lee el identificador del colaborador de la URL y elige el endpoint. Soporta:
   - ?id=<hash>       -> perfil.php   (urlId; comportamiento por defecto)
   - ?personal=<num>  -> personal.php (número de empleado directo; opcional)
   Ambos endpoints reciben el valor como ?id=. Si vienen los dos, 'personal' tiene
   prioridad. Devuelve { id, url } o null. */
function getColaboradorParams() {
    const search   = new URLSearchParams(window.location.search);
    const personal = search.get(API_CONFIG.queryParamPersonal);
    if (personal) return { id: personal, url: API_CONFIG.baseUrlPersonal };
    const id = search.get(API_CONFIG.queryParam);
    if (id) return { id, url: API_CONFIG.baseUrl };
    return null;
}

/* Llama al servicio. Devuelve el resultado ya mapeado ({ perfil, semanas }).
   Lanza un error con .notFound = true cuando el colaborador no exista, o con
   .badRequest = true cuando el servicio responda 400. */
async function fetchData({ id, url = API_CONFIG.baseUrl } = {}) {
    const requestUrl = url + '?' + new URLSearchParams({ id }).toString();
    const res = await fetch(requestUrl, { headers: API_CONFIG.headers });
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
    const esperadas   = HORAS_SEMANA_COMPLETA;   // 47.5 h = 100% (base fija del porcentaje/barra)
    const aTrabajar   = toNum(p.tieTrabajar);    // horas que el servicio pide trabajar esa semana
    const registradas = toNum(p.tieTrabajado);   // horas trabajadas según el servicio (= suma de checadas)
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

    // Home office: el servicio envía en 'fechaHomeOffice' el/los NOMBRE(S) de día de
    // la semana (p.ej. "Viernes"), no una fecha. Basta comparar contra el nombre de
    // cada día, aunque ese día no tenga checada (entrada/salida en null).
    const hoDias = homeOfficeDias(p);

    const registros = dias.map(({ dia, suf }) => {
        const entrada = p['E-' + suf] || null;
        const salida  = p['S-' + suf] || null;
        const homeOffice = hoDias.has(normDia(dia));
        return { dia, entrada, salida, total: diffHoras(entrada, salida), homeOffice };
    });

    return {
        numSemana: toNum(p.NumSemana),
        perfil: {
            nombre: p.NombreEmpleado,
            puesto: p.Departamento,
            esSistemas: esDepartamentoSistemas(p.Departamento),
            avatar: fotoUrl(p.NumEmpleado ?? p.id_personal ?? id),
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
                horasEsperadas:     decimalAHoras(esperadas),      // base fija (47.5 h = 100%)
                horasReportadas:    decimalAHoras(registradas),    // tieTrabajado: lo efectivamente trabajado
                horasVacaciones:    decimalAHoras(vacaciones),
                faltas:             0,
                retardos:           p.numRetardos ?? 0,
                salidasAnticipadas: p.numSalAnt ?? 0
            },
            // Comparativo: lo trabajado (tieTrabajado) contra lo que se debía trabajar
            // (tieTrabajar; si el servicio no lo manda, la base de 47.5 h).
            diferencia: {
                registradas,
                esperadas: aTrabajar > 0 ? aTrabajar : esperadas
            }
        },
        registros
    };
}
