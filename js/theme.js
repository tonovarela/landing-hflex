/* =========================================================
   TEMA (oscuro / claro / exclusivos de Sistemas) con persistencia
   en localStorage y menú desplegable.
   ========================================================= */
const themeToggle   = document.getElementById('theme-toggle');
const themeLabel    = document.getElementById('theme-label');
const themeChevron  = document.getElementById('theme-chevron');
const themeDropdown = document.getElementById('theme-dropdown');

/* Los temas "matrix" y "synthwave" solo se habilitan para el departamento de
   Sistemas. Arranca en false y se define al cargar los datos del colaborador. */
let sistemasThemesAllowed = false;

const THEME_META = {
    light:     { label: 'Claro',     icon: 'icon-sun'       },
    dark:      { label: 'Oscuro',    icon: 'icon-moon'      },
    matrix:    { label: 'Matrix',    icon: 'icon-matrix'    },
    synthwave: { label: 'SynthWave', icon: 'icon-synthwave' },
    galaxy:    { label: 'Galaxia',   icon: 'icon-galaxy'    }
};

/* Temas "exclusivos" de Sistemas (los que no son light/dark). Todos se
   construyen sobre el modo oscuro. */
const SISTEMAS_THEMES = ['matrix', 'synthwave', 'galaxy'];

/* Marcado SVG de cada icono (para las opciones del dropdown). Coincide con los
   iconos del botón definidos en index.html. */
const THEME_ICON_SVG = {
    light:     '<circle cx="12" cy="12" r="4" stroke-width="1.8"/><path stroke-linecap="round" stroke-width="1.8" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/>',
    dark:      '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>',
    matrix:    '<rect x="3" y="4" width="18" height="16" rx="2" stroke-width="1.8"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 9l3 3-3 3M13.5 15H17"/>',
    synthwave: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M6 13a6 6 0 0112 0"/><path stroke-linecap="round" stroke-width="1.8" d="M8.5 10.5h7M7.5 13h9"/><path stroke-linecap="round" stroke-width="1.8" d="M3 17h4m3 0h4m3 0h4"/>',
    galaxy:    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M12 4c.6 3.4 1.6 4.4 5 5-3.4.6-4.4 1.6-5 5-.6-3.4-1.6-4.4-5-5 3.4-.6 4.4-1.6 5-5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="M18.5 14.5c.25 1.4.65 1.8 2 2-1.35.2-1.75.6-2 2-.25-1.4-.65-1.8-2-2 1.35-.2 1.75-.6 2-2z"/>'
};

/* Temas disponibles según el departamento (los exclusivos solo Sistemas). */
function availableThemes() {
    return sistemasThemesAllowed
        ? ['light', 'dark', ...SISTEMAS_THEMES]
        : ['light', 'dark'];
}

function currentTheme() {
    const el = document.documentElement;
    for (const t of SISTEMAS_THEMES) {
        if (el.classList.contains(t)) return t;
    }
    return el.classList.contains('dark') ? 'dark' : 'light';
}

/* Sincroniza la etiqueta y el icono visible del botón con el tema activo,
   y marca la opción activa dentro del dropdown. */
function syncThemeUI() {
    const t = currentTheme();
    themeLabel.textContent = THEME_META[t].label;
    for (const meta of Object.values(THEME_META)) {
        document.getElementById(meta.icon)
            .classList.toggle('hidden', meta.icon !== THEME_META[t].icon);
    }
    themeDropdown.querySelectorAll('[data-theme]').forEach(opt => {
        const activo = opt.dataset.theme === t;
        opt.setAttribute('aria-current', activo ? 'true' : 'false');
        opt.querySelector('[data-check]').classList.toggle('hidden', !activo);
    });
}

/* (Re)genera las opciones del dropdown según los temas disponibles. */
function renderThemeMenu() {
    themeDropdown.innerHTML = availableThemes().map(t => `
        <button type="button" role="menuitem" data-theme="${t}"
                class="theme-option w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${THEME_ICON_SVG[t]}</svg>
            <span class="flex-1">${THEME_META[t].label}</span>
            <svg data-check class="w-4 h-4 text-brand-green hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
        </button>`).join('');
}

/* Aplica un tema: gestiona las clases del <html>, la persistencia,
   la lluvia digital del tema matrix y la UI del botón. */
function applyTheme(name) {
    const el = document.documentElement;
    el.classList.remove(...SISTEMAS_THEMES);
    if (SISTEMAS_THEMES.includes(name)) el.classList.add(name);
    el.classList.toggle('dark', name === 'dark' || SISTEMAS_THEMES.includes(name));
    localStorage.setItem('theme', name);
    MatrixRain.toggle(name === 'matrix');
    if (name === 'matrix') stopFireworks();   // el efecto de fuegos no aplica en matrix
    syncThemeUI();
}

/* Abre / cierra el dropdown de temas. */
function toggleThemeMenu(open) {
    const isOpen = open ?? themeDropdown.classList.contains('hidden');
    themeDropdown.classList.toggle('hidden', !isOpen);
    themeToggle.setAttribute('aria-expanded', String(isOpen));
    themeChevron.classList.toggle('rotate-180', isOpen);
}

/* Habilita o no los temas de Sistemas (matrix / synthwave) según el
   departamento. Si no está autorizado pero venía en uno de ellos
   (localStorage), revierte a oscuro. Regenera el dropdown en cualquier caso. */
function applyDepartmentTheme(perfil) {
    sistemasThemesAllowed = !!(perfil && perfil.esSistemas);
    const t = currentTheme();
    const esExclusivo = SISTEMAS_THEMES.includes(t);
    if (esExclusivo && !sistemasThemesAllowed) {
        applyTheme('dark');                              // no autorizado: revierte
    } else if (t === 'matrix' && sistemasThemesAllowed) {
        MatrixRain.toggle(true);                         // asegura la lluvia al recargar en matrix
    }
    renderThemeMenu();
    syncThemeUI();
}

/* ---------- Arranque de la UI de temas y sus eventos ---------- */
renderThemeMenu();
syncThemeUI();

themeToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleThemeMenu();
});

/* Selección de un tema desde el dropdown. */
themeDropdown.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-theme]');
    if (!opt) return;
    applyTheme(opt.dataset.theme);
    toggleThemeMenu(false);
});

/* Cierra el dropdown al hacer clic fuera o con Escape. */
document.addEventListener('click', (e) => {
    if (!e.target.closest('#theme-menu')) toggleThemeMenu(false);
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleThemeMenu(false);
});
