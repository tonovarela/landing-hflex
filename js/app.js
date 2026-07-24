/* =========================================================
   APP  (punto de entrada / orquestación del flujo)
   Decide qué cargar según la URL (mock o servicio real), maneja los
   estados de error y arranca todo al cargar el DOM.

   Único módulo cargado desde index.html (<script type="module">); el resto
   entra por sus imports, así que no hay variables en el ámbito global:
     app -> render -> theme -> effects
         -> api    -> config, utils
         -> mock   -> config
   ========================================================= */
import { show, hide, showError } from './utils.js';
import { getColaboradorParams, fetchData, mapApiResponse } from './api.js';
import { buildMockPerfiles } from './mock.js';
import { renderDashboard } from './render.js';
import { initTheme } from './theme.js';

async function loadData() {
    hide('error-banner');
    hide('not-found');

    // ---- Modo MOCK: ?mock=<porcentaje> (p.ej. ?mock=40) para probar la UI sin el servicio ----
    const params  = new URLSearchParams(window.location.search);
    const mockPct = params.get('mock');
    if (mockPct !== null) {
        const dept = params.get('dept');   // p.ej. ?mock=105&dept=sistemas para probar el tema matrix
        show('dashboard');
        renderDashboard(mapApiResponse(buildMockPerfiles(Number(mockPct), dept), 'mock'));
        return;
    }

    const colaborador = getColaboradorParams();

    // Sin id ni personal en la URL -> mostramos la sección de "no encontrado".
    if (!colaborador) {
        showNotFound(
            'Falta el identificador',
            'No se proporcionó el id del colaborador en la URL.'
        );
        return;
    }

    const { id, url } = colaborador;

    show('dashboard');
    try {
        renderDashboard(await fetchData({ id, url }));
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

/* Inicio: arranca la UI de temas, conecta el botón de reintento
   (ya no hay un onclick inline que dependa del ámbito global) y carga los datos. */
function init() {
    initTheme();
    document.getElementById('retry-button').addEventListener('click', loadData);
    loadData();
}

/* Los módulos se ejecutan diferidos: si el DOM ya está listo, arranca de inmediato. */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
