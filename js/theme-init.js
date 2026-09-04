/* Anti-parpadeo: aplica el tema guardado ANTES de pintar.
   Los temas exclusivos de Sistemas (matrix, synthwave, galaxy, blueprint,
   pandora) se construyen sobre el modo oscuro: añaden 'dark' + su clase. Si el
   colaborador no resultara autorizado, app.js revierte a 'dark' al cargar. */
(function () {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const el = document.documentElement;
    const especiales = ['matrix', 'synthwave', 'galaxy', 'blueprint', 'pandora'];   // se apoyan en modo oscuro
    if (especiales.includes(stored)) {
        el.classList.add('dark', stored);
    } else if (stored === 'dark' || (!stored && prefersDark)) {
        el.classList.add('dark');
    }
})();
