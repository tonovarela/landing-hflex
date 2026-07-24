/* =========================================================
   MOCK del servicio (solo para pruebas de UI)
   Genera una respuesta "plana" como la de la API para un
   porcentaje dado. Uso: index.html?mock=40  (rojo),
   ?mock=60 (amarillo), ?mock=85 (verde), ?mock=105 (fuegos).
   ========================================================= */
function buildMockSemana(pct, { numSemana, lunes, hrsVac, homeOffice, tieTrabajar, dept }) {
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
        Departamento: dept || `PRUEBA UI · ${porcentaje}%`,
        id_personal: 'mock',
        NumSemana: numSemana,
        tieTrabajar: tieTrabajar,   // horas a trabajar de la semana: alimenta la tarjeta "Diferencia"
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
        // Home office: el servicio manda el/los nombre(s) de día en 'fechaHomeOffice'.
        fechaHomeOffice: homeOffice
    };
}

/* Genera varias semanas de prueba (arreglo, como la API real). La semana más
   reciente usa el porcentaje indicado en ?mock=; las anteriores traen datos fijos
   para poder probar el selector. */
function buildMockPerfiles(pct, dept) {
    return [
        buildMockSemana(pct, { numSemana: 28, lunes: new Date(2026, 6, 6),
            hrsVac: 8, tieTrabajar: 47.5, homeOffice: ['Martes', 'Jueves'], dept }),
        buildMockSemana(72,  { numSemana: 27, lunes: new Date(2026, 5, 29),
            hrsVac: 0, tieTrabajar: 47.5, homeOffice: ['Martes'], dept }),
        buildMockSemana(45,  { numSemana: 26, lunes: new Date(2026, 5, 22),
            hrsVac: 16, tieTrabajar: 31.5, homeOffice: [], dept })   // semana con feriado: esperadas < 47.5
    ];
}
