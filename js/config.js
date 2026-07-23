/* =========================================================
   CONFIGURACIÓN GENERAL
   Endpoints del servicio y constantes compartidas por los demás módulos.
   ========================================================= */
const baseUrl = "https://servicios.litoprocess.com/perfil/api/perfil.php";
const baseUrlPersonal = "https://servicios.litoprocess.com/perfil/api/personal.php";
const baseUrlFoto = "https://servicios.litoprocess.com/colaboradores/api/foto/";

/* Jornada completa de la Semana Flexible: 47.5 horas equivalen al 100%.
   El porcentaje, la barra de avance y la etiqueta "X de 47.5 horas" se calculan
   contra esta base fija. La tarjeta "Horas Esperadas", en cambio, muestra el valor
   que envía el servicio (tieTrabajar). */
const HORAS_SEMANA_COMPLETA = 47.5;

/* =========================================================
   CONFIGURACIÓN DE API
   El id del colaborador se toma del query param de la URL de esta página
   y se envía al servicio.
   ========================================================= */
const API_CONFIG = {
    baseUrl: baseUrl,                 // perfil.php   -> ?id=<hash>        (urlId)
    baseUrlPersonal: baseUrlPersonal, // personal.php -> ?id=<numEmpleado>
    queryParam: 'id',                 // parámetro por defecto en la URL de esta página
    queryParamPersonal: 'personal',   // parámetro opcional: número de empleado directo
    // Sin cabeceras personalizadas: un GET con 'Content-Type' dispara un preflight
    // OPTIONS que la API responde con 400 y el navegador aborta la petición.
    headers: {}
};
