/* =========================================================
   FUEGOS ARTIFICIALES  (se lanzan al superar el 100%)
   Cohetes que despegan desde la tarjeta de Semana Flexible y
   explotan por encima de ella sobre un <canvas>.

   Módulo sin dependencias: no sabe nada del tema activo. La regla de
   "no lanzar fuegos en matrix" vive en theme.js (launchFireworks).
   ========================================================= */
export const Fireworks = (() => {
    let canvas, ctx, particles = [], rockets = [], rafId = null, running = false;
    let nextLaunchAt = 0, listenerAdded = false, stopTimer = null;
    const COLORS = ['#f43f5e', '#facc15', '#22c55e', '#38bdf8', '#a855f7', '#fb923c', '#ec4899'];

    // Borde inferior de la tarjeta dentro del lienzo (desde ahí despegan los cohetes).
    const CARD_BOTTOM_OFFSET = 40;   // el lienzo sobresale 40px bajo la tarjeta
    const SIDE_INSET = 80;           // margen lateral del lienzo respecto a la tarjeta

    // Margen de seguridad respecto a los bordes del viewport: la explosión nunca
    // se centra más allá de este margen, para que las chispas no se recorten.
    const SAFE_TOP = 160;            // no explotar por encima de este alto (deja aire arriba)
    const SIDE_MARGIN = 140;         // no explotar tan al borde lateral

    // Topes de seguridad para que nunca se acumulen demasiadas animaciones.
    const MAX_ROCKETS = 10;
    const MAX_PARTICLES = 800;

    function resize() {
        // El lienzo cubre todo el viewport; sus coordenadas coinciden con
        // las de getBoundingClientRect(), lo que permite anclar los cohetes a la tarjeta.
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    /* Lanza un cohete desde el borde inferior de la tarjeta hacia arriba. */
    function launchRocket() {
        // Posición real de la tarjeta contenedora dentro del viewport.
        const rect = canvas.parentElement.getBoundingClientRect();
        const startY = rect.bottom - CARD_BOTTOM_OFFSET;                        // borde inferior de la tarjeta
        const rawStartX = rect.left + SIDE_INSET + Math.random() * (rect.width - SIDE_INSET * 2);
        // Mantiene el despegue (y por tanto la explosión) dentro de un margen lateral seguro.
        const startX = Math.min(Math.max(rawStartX, SIDE_MARGIN), canvas.width - SIDE_MARGIN);
        // Altura de explosión: arriba de la tarjeta, pero sin superar SAFE_TOP
        // para que la mitad superior de la explosión no se salga de la pantalla.
        const targetY = Math.max(SAFE_TOP, rect.top - 40 - Math.random() * 120);
        rockets.push({
            x: startX,
            y: startY,
            vx: (Math.random() - 0.5) * 1.2,
            vy: -(8 + Math.random() * 3.5),
            targetY,
            color: COLORS[(Math.random() * COLORS.length) | 0]
        });
    }

    /* Avanza los cohetes: suben dejando estela y explotan al llegar a su altura. */
    function updateRockets() {
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i];
            r.x += r.vx;
            r.y += r.vy;
            r.vy += 0.12;   // desaceleración por gravedad

            // Estela: chispa tenue que queda atrás.
            particles.push({
                x: r.x, y: r.y,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                life: 0.6, decay: 0.05,
                color: r.color, size: 1.2
            });

            // Explota al alcanzar su altura objetivo o al perder impulso.
            if (r.y <= r.targetY || r.vy >= 0) {
                burst(r.x, r.y, r.color);
                rockets.splice(i, 1);
            }
        }
    }

    function burst(x, y, forcedColor) {
        const color = forcedColor || COLORS[(Math.random() * COLORS.length) | 0];
        const n = 50 + ((Math.random() * 30) | 0);
        for (let i = 0; i < n; i++) {
            const angle = (Math.PI * 2 * i) / n;
            const speed = 2 + Math.random() * 3.5;     // expansión contenida (no se sale de pantalla)
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.012 + Math.random() * 0.012,  // se apagan un poco antes -> llegan menos lejos
                color,
                size: 1.4 + Math.random() * 2.2
            });
        }
    }

    /* Lanza cohetes según el reloj de animación (no con setTimeout), de modo que
       la cadencia se pausa junto con requestAnimationFrame cuando la pestaña
       pierde el foco y no se acumula un backlog que estalle todo de golpe. */
    function maybeLaunch(ts) {
        if (!running || ts < nextLaunchAt) return;
        if (rockets.length < MAX_ROCKETS) {
            launchRocket();
            if (Math.random() < 0.4 && rockets.length < MAX_ROCKETS) launchRocket();
        }
        // Siempre relativo a "ahora": tras una pausa larga no dispara un backlog.
        nextLaunchAt = ts + 600 + Math.random() * 700;
    }

    function frame(ts) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        maybeLaunch(ts);
        updateRockets();

        // Tope de partículas: descarta las más antiguas si se excede.
        if (particles.length > MAX_PARTICLES) {
            particles.splice(0, particles.length - MAX_PARTICLES);
        }

        // Dibuja los cohetes en ascenso.
        for (const r of rockets) {
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(r.x, r.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = r.color;
            ctx.fill();
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.04;          // gravedad
            p.vx *= 0.99;
            p.vy *= 0.99;
            p.life -= p.decay;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            ctx.globalAlpha = Math.max(p.life, 0);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (running || particles.length || rockets.length) {
            rafId = requestAnimationFrame(frame);
        } else {
            rafId = null;
            canvas.classList.add('hidden');
        }
    }

    function start(durationMs) {
        if (running) return;
        canvas = document.getElementById('fireworks-canvas');
        ctx = canvas.getContext('2d');
        canvas.classList.remove('hidden');   // visible antes de medir su tamaño
        resize();
        if (!listenerAdded) { window.addEventListener('resize', resize); listenerAdded = true; }
        running = true;
        nextLaunchAt = 0;   // el primer frame dispara de inmediato
        if (!rafId) rafId = requestAnimationFrame(frame);

        // Detiene el lanzamiento tras la duración indicada; las partículas
        // restantes se desvanecen solas después.
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        if (durationMs > 0) stopTimer = setTimeout(stop, durationMs);
    }

    function stop() {
        running = false;
        if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
        // Deja que los cohetes y partículas restantes se desvanezcan solos.
    }

    return { start, stop };
})();

/* =========================================================
   LLUVIA DIGITAL «MATRIX»  (fondo del tema exclusivo de Sistemas)
   Canvas a pantalla completa detrás del contenido; solo corre
   mientras el tema matrix está activo (ver applyTheme/MatrixRain.toggle).
   ========================================================= */
export const MatrixRain = (() => {
    const CHARS = 'アカサタナハマヤラワ0123456789ABCDEFﾊﾐﾋｷｼｽｾｿ<>*+=#'.split('');
    const FONT = 16;
    const STEP_MS = 110;   // ms entre avances de la lluvia (mayor = más lento)
    let canvas, ctx, cols = 0, drops = [], rafId = null, running = false, listenerAdded = false;
    let lastStep = 0;

    function ensure() {
        canvas = document.getElementById('matrix-rain');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'matrix-rain';
            canvas.setAttribute('aria-hidden', 'true');
            document.body.insertBefore(canvas, document.body.firstChild);
        }
        ctx = canvas.getContext('2d');
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        cols = Math.ceil(canvas.width / FONT);
        // Cada columna arranca en una altura aleatoria (fuera de pantalla) para un flujo desfasado.
        drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -50));
    }

    function frame(ts) {
        // Avanza solo cada STEP_MS para lograr una caída lenta, independiente del
        // refresco de la pantalla (requestAnimationFrame sigue pausando al perder foco).
        if (ts - lastStep >= STEP_MS) {
            lastStep = ts;

            // Rastro: negro translúcido que desvanece los caracteres previos y deja estela.
            ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = FONT + 'px monospace';

            for (let i = 0; i < cols; i++) {
                const ch = CHARS[(Math.random() * CHARS.length) | 0];
                const x = i * FONT;
                const y = drops[i] * FONT;
                // La cabeza de cada columna brilla más que la estela.
                ctx.fillStyle = Math.random() > 0.975 ? '#bbf7d0' : '#22c55e';
                ctx.fillText(ch, x, y);
                if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i]++;
            }
        }
        if (running) rafId = requestAnimationFrame(frame);
    }

    function start() {
        if (running) return;
        ensure();
        resize();
        if (!listenerAdded) { window.addEventListener('resize', resize); listenerAdded = true; }
        canvas.style.display = 'block';
        running = true;
        lastStep = 0;   // el primer frame dibuja de inmediato
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (canvas) canvas.style.display = 'none';
    }

    function toggle(on) { on ? start() : stop(); }

    return { toggle };
})();
