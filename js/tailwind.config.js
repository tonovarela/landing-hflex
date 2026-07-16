/* Configuración de Tailwind (CDN). Debe cargarse justo después del script del CDN. */
tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                brand: { green: '#22c55e', greenLight: '#4ade80' }
            }
        }
    }
};
