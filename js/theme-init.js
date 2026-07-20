/* Anti-parpadeo: aplica el tema guardado ANTES de pintar.
   El tema "matrix" (solo Sistemas) se construye sobre el modo oscuro: añade
   'dark' + 'matrix'. Si el colaborador no resultara autorizado, app.js revierte
   a 'dark' al cargar los datos. */
(function () {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const el = document.documentElement;
    if (stored === 'matrix') {
        el.classList.add('dark', 'matrix');
    } else if (stored === 'dark' || (!stored && prefersDark)) {
        el.classList.add('dark');
    }
})();
