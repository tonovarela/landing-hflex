/* Anti-parpadeo: aplica el tema guardado ANTES de pintar.
   Los temas "matrix" (solo Sistemas) y "synthwave" se construyen sobre el modo
   oscuro: añaden 'dark' + su clase. Si el colaborador no resultara autorizado
   para matrix, app.js revierte a 'dark' al cargar los datos. */
(function () {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const el = document.documentElement;
    const especiales = ['matrix', 'synthwave', 'galaxy'];   // se apoyan en modo oscuro
    if (especiales.includes(stored)) {
        el.classList.add('dark', stored);
    } else if (stored === 'dark' || (!stored && prefersDark)) {
        el.classList.add('dark');
    }
})();
