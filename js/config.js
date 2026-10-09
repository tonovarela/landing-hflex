/* =========================================================
   CONFIGURACIÓN GENERAL
   Endpoints del servicio y constantes compartidas por los demás módulos.
   ========================================================= */
const baseUrl = "https://servicios.litoprocess.com/perfil/api/perfil.php";
const baseUrlPersonal = "https://servicios.litoprocess.com/perfil/api/personal.php";
const baseUrlHoras = "https://servicios.litoprocess.com/perfil/api/horas-trabajadas.php";
export const baseUrlFoto = "https://servicios.litoprocess.com/colaboradores/api/foto/";

/* Jornada completa de la Semana Flexible: 47.5 horas equivalen al 100%.
   El porcentaje, la barra de avance y la etiqueta "X de 47.5 horas" se calculan
   contra esta base fija, igual que la tarjeta "Horas Esperadas". La tarjeta
   "Horas Reportadas", en cambio, muestra el valor que envía el servicio
   (tieTrabajar), que puede ser menor en semanas con feriados. */
export const HORAS_SEMANA_COMPLETA = 47.5;

/* =========================================================
   CONFIGURACIÓN DE API
   El id del colaborador se toma del query param de la URL de esta página
   y se envía al servicio.
   ========================================================= */
export const API_CONFIG = {
    baseUrl: baseUrl,                 // perfil.php   -> ?id=<hash>        (urlId)
    baseUrlPersonal: baseUrlPersonal, // personal.php -> ?id=<numEmpleado>
    queryParam: 'id',                 // parámetro por defecto en la URL de esta página
    queryParamPersonal: 'personal',   // parámetro opcional: número de empleado directo
    baseUrlHoras: baseUrlHoras,       // horas-trabajadas.php -> listado global por semana
    // Sin cabeceras personalizadas: un GET con 'Content-Type' dispara un preflight
    // OPTIONS que la API responde con 400 y el navegador aborta la petición.
    headers: {}
};

/* =========================================================
   SALÓN DE LA FAMA
   Números de empleado autorizados a ver el listado global de horas
   trabajadas (ranking por semana). Es un acceso extra que solo aparece
   en la tarjeta de perfil de estos colaboradores.
   ========================================================= */
export const SALON_FAMA_EMPLEADOS = ['2801'];

/* ¿Este número de empleado tiene acceso al Salón de la Fama? */
export function tieneSalonFama(numEmpleado) {
    if (numEmpleado === null || numEmpleado === undefined) return false;
    return SALON_FAMA_EMPLEADOS.includes(String(numEmpleado).trim());
}

/* =========================================================
   ENTRADAS Y SALIDAS  (checadas.html)
   Números de empleado que ven en el encabezado el acceso al tablero con
   las checadas de todos los colaboradores.
   ========================================================= */
export const CHECADAS_EMPLEADOS = ['2801'];

/* ¿Este número de empleado tiene acceso al tablero de entradas y salidas? */
export function tieneChecadas(numEmpleado) {
    if (numEmpleado === null || numEmpleado === undefined) return false;
    return CHECADAS_EMPLEADOS.includes(String(numEmpleado).trim());
}

/* Pase de acceso a checadas.html: index.html lo guarda en localStorage al
   pulsar el botón de acceso y checadas.html lo valida al abrir. Caduca a las
   CHECADAS_PASE_HORAS horas; después hay que volver a entrar desde index.html.
   OJO: es un control solo del navegador (se puede falsificar desde la consola);
   no sustituye una validación en el servidor. */
const CHECADAS_PASE_KEY   = 'checadasAcceso';
const CHECADAS_PASE_HORAS = 4;

/* 'origen' es la URL de index.html desde la que se entró (con su ?id= o
   ?personal=), para que checadas.html pueda regresar a ella. */
export function guardarPaseChecadas(numEmpleado, origen = '') {
    try {
        localStorage.setItem(CHECADAS_PASE_KEY, JSON.stringify({
            numEmpleado: String(numEmpleado),
            origen: String(origen),
            expira: Date.now() + CHECADAS_PASE_HORAS * 3600 * 1000
        }));
    } catch { /* sin localStorage: checadas.html negará el acceso */ }
}

/* Devuelve el pase ({ numEmpleado, origen, expira }) si es válido (autorizado y vigente); si no, null. */
export function leerPaseChecadas() {
    try {
        const pase = JSON.parse(localStorage.getItem(CHECADAS_PASE_KEY) || 'null');
        if (!pase || !(pase.expira > Date.now()) || !tieneChecadas(pase.numEmpleado)) {
            localStorage.removeItem(CHECADAS_PASE_KEY);
            return null;
        }
        return pase;
    } catch {
        return null;
    }
}
